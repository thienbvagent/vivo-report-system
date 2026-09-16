import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';
import { getAllCenters } from './centers';
import { ProcessedReportItem } from './business-rules';

function getDataDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.DB_DIR || path.join(process.cwd(), '.data'));
}

export interface StoredUser {
  centerCode: string;
  centerName: string;
  passwordHash: string;
  createdAt: string;
}

export interface UploadRecord {
  uploadId: string;
  centerCode: string;
  fileName: string;
  fileHash: string;
  uploadTime: string;
  inputRows: number;
  validRows: number;
  warningRows: number;
  status: 'SUCCESS' | 'LOCAL_ONLY' | 'NO_DATA' | 'FAILED';
  errorMessage?: string;
}

let _dbInstance: DatabaseSync | null = null;
let _currentDbPath: string | null = null;

export function closeDb(): void {
  if (_dbInstance) {
    try {
      _dbInstance.close();
    } catch {}
    _dbInstance = null;
    _currentDbPath = null;
  }
}

function reportKey(item: ProcessedReportItem): string {
  const centerCode = String(item['Mã TTBH'] || '').trim().toUpperCase();
  const ticket = String(item['Số phiếu sửa chữa'] || '').trim();
  const partCode = String(item['Mã vật tư linh kiện'] || '').trim();
  const partName = String(item['Tên vật tư'] || '').trim().toLowerCase();
  return [centerCode, ticket, partCode || `name:${partName}`].join('\u001f');
}

export function initDatabase(): DatabaseSync {
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'vivo.db');

  if (_dbInstance && _currentDbPath === dbPath) {
    return _dbInstance;
  }

  if (_dbInstance) {
    closeDb();
  }

  const db = new DatabaseSync(dbPath);
  _dbInstance = db;
  _currentDbPath = dbPath;

  // WAL mode for fast concurrency; busy timeout prevents database locked errors
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      center_code TEXT PRIMARY KEY,
      center_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploads (
      upload_id TEXT PRIMARY KEY,
      center_code TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      upload_time TEXT NOT NULL,
      input_rows INTEGER NOT NULL,
      valid_rows INTEGER NOT NULL,
      warning_rows INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_uploads_center ON uploads (center_code);
    CREATE INDEX IF NOT EXISTS idx_uploads_hash ON uploads (center_code, file_hash);

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      center_code TEXT NOT NULL,
      center_name TEXT,
      ticket_id TEXT NOT NULL,
      part_code TEXT,
      part_name TEXT,
      unit_price REAL,
      cash_revenue REAL,
      cash_revenue_before_tax REAL,
      debt_revenue REAL,
      debt_after_discount REAL,
      debt_before_tax REAL,
      customer_type TEXT,
      payment_method TEXT,
      warranty_export TEXT,
      repair_export TEXT,
      pickup_time TEXT,
      report_date TEXT NOT NULL,
      bring_type TEXT,
      repair_type TEXT,
      part_type TEXT,
      solution TEXT,
      source_row_number INTEGER,
      upload_id TEXT,
      import_time TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reports_center_date ON reports (center_code, report_date);
    CREATE INDEX IF NOT EXISTS idx_reports_center_ticket ON reports (center_code, ticket_id);
  `);

  // Auto-migration from legacy JSON files if tables are empty
  migrateLegacyJsonIfEmpty(db, dataDir);

  // Seed default users if users table is empty
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as any)?.cnt || 0;
  if (userCount === 0) {
    const initialPassword = process.env.INITIAL_CENTER_PASSWORD;
    if (!initialPassword) {
      throw new Error('Thiếu biến môi trường INITIAL_CENTER_PASSWORD để khởi tạo tài khoản TTBH.');
    }
    const defaultHash = bcrypt.hashSync(initialPassword, 10);
    const insertUser = db.prepare(`
      INSERT INTO users (center_code, center_name, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `);

    db.exec('BEGIN IMMEDIATE;');
    try {
      const now = new Date().toISOString();
      for (const c of getAllCenters()) {
        insertUser.run(c.code, c.name, defaultHash, now);
      }
      db.exec('COMMIT;');
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  }

  return db;
}

function migrateLegacyJsonIfEmpty(db: DatabaseSync, dataDir: string) {
  const usersJson = path.join(dataDir, 'users.json');
  const uploadsJson = path.join(dataDir, 'uploads.json');
  const reportsJson = path.join(dataDir, 'reports.json');

  // Migrate users
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as any)?.cnt || 0;
  if (userCount === 0 && fs.existsSync(usersJson)) {
    try {
      const rawUsers: StoredUser[] = JSON.parse(fs.readFileSync(usersJson, 'utf-8'));
      if (Array.isArray(rawUsers) && rawUsers.length > 0) {
        const stmt = db.prepare('INSERT OR IGNORE INTO users (center_code, center_name, password_hash, created_at) VALUES (?, ?, ?, ?)');
        db.exec('BEGIN IMMEDIATE;');
        for (const u of rawUsers) {
          stmt.run(u.centerCode, u.centerName, u.passwordHash, u.createdAt);
        }
        db.exec('COMMIT;');
      }
    } catch {}
  }

  // Migrate uploads
  const uploadCount = (db.prepare('SELECT COUNT(*) as cnt FROM uploads').get() as any)?.cnt || 0;
  if (uploadCount === 0 && fs.existsSync(uploadsJson)) {
    try {
      const rawUploads: UploadRecord[] = JSON.parse(fs.readFileSync(uploadsJson, 'utf-8'));
      if (Array.isArray(rawUploads) && rawUploads.length > 0) {
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO uploads 
          (upload_id, center_code, file_name, file_hash, upload_time, input_rows, valid_rows, warning_rows, status, error_message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        db.exec('BEGIN IMMEDIATE;');
        for (const u of rawUploads) {
          stmt.run(u.uploadId, u.centerCode, u.fileName, u.fileHash, u.uploadTime, u.inputRows, u.validRows, u.warningRows, u.status, u.errorMessage || null);
        }
        db.exec('COMMIT;');
      }
    } catch {}
  }

  // Migrate reports
  const reportCount = (db.prepare('SELECT COUNT(*) as cnt FROM reports').get() as any)?.cnt || 0;
  if (reportCount === 0 && fs.existsSync(reportsJson)) {
    try {
      const rawReports: ProcessedReportItem[] = JSON.parse(fs.readFileSync(reportsJson, 'utf-8'));
      if (Array.isArray(rawReports) && rawReports.length > 0) {
        saveReportItemsInternal(db, rawReports, 'upsert');
      }
    } catch {}
  }
}

function rowToReportItem(r: any): ProcessedReportItem {
  return {
    'Số phiếu sửa chữa': r.ticket_id,
    'Mã vật tư linh kiện': r.part_code || '',
    'Tên vật tư': r.part_name || '',
    'Đơn giá': r.unit_price !== null ? r.unit_price : null,
    'Doanh thu tiền mặt': r.cash_revenue !== null ? r.cash_revenue : null,
    'Doanh thu tiền mặt trước thuế': r.cash_revenue_before_tax !== null ? r.cash_revenue_before_tax : null,
    'Công nợ': r.debt_revenue !== null ? r.debt_revenue : null,
    'CN sau chiết khấu': r.debt_after_discount !== null ? r.debt_after_discount : null,
    'CN trước thuế': r.debt_before_tax !== null ? r.debt_before_tax : null,
    'Khách hàng': r.customer_type as 'TGDĐ' | 'KL',
    'Phương thức thanh toán': r.payment_method as 'CN' | 'TM',
    'Xuất Bảo Hành': r.warranty_export === '1' || r.warranty_export === 1 ? 1 : '',
    'Xuất Sửa Chữa': r.repair_export === '1' || r.repair_export === 1 ? 1 : '',
    'Thời gian lấy máy': r.pickup_time || '',
    'Ngày báo cáo': r.report_date,
    'Mã TTBH': r.center_code,
    'Tên TTBH': r.center_name || '',
    'Loại hình đem đến sửa': r.bring_type || '',
    'Loại hình sửa chữa': r.repair_type || '',
    'Loại linh kiện': r.part_type || '',
    'Phương án giải quyết': r.solution || '',
    'Upload ID': r.upload_id || undefined,
    'Thời gian import': r.import_time || undefined,
    'Source Row Number': r.source_row_number ?? undefined
  };
}

export function findUserByCode(code: string): StoredUser | null {
  const db = initDatabase();
  const row: any = db.prepare('SELECT * FROM users WHERE center_code = ?').get(code);
  if (!row) return null;
  return {
    centerCode: row.center_code,
    centerName: row.center_name,
    passwordHash: row.password_hash,
    createdAt: row.created_at
  };
}

export function getUploads(centerCode?: string): UploadRecord[] {
  const db = initDatabase();
  let rows: any[];
  if (centerCode) {
    rows = db.prepare('SELECT * FROM uploads WHERE center_code = ? ORDER BY upload_time DESC').all(centerCode);
  } else {
    rows = db.prepare('SELECT * FROM uploads ORDER BY upload_time DESC').all();
  }
  return rows.map(r => ({
    uploadId: r.upload_id,
    centerCode: r.center_code,
    fileName: r.file_name,
    fileHash: r.file_hash,
    uploadTime: r.upload_time,
    inputRows: r.input_rows,
    validRows: r.valid_rows,
    warningRows: r.warning_rows,
    status: r.status as 'SUCCESS' | 'LOCAL_ONLY' | 'NO_DATA' | 'FAILED',
    errorMessage: r.error_message || undefined
  }));
}

export function findUploadByHash(centerCode: string, fileHash: string): UploadRecord | null {
  const db = initDatabase();
  const row: any = db.prepare('SELECT * FROM uploads WHERE center_code = ? AND file_hash = ? ORDER BY upload_time DESC LIMIT 1').get(centerCode, fileHash);
  if (!row) return null;
  return {
    uploadId: row.upload_id,
    centerCode: row.center_code,
    fileName: row.file_name,
    fileHash: row.file_hash,
    uploadTime: row.upload_time,
    inputRows: row.input_rows,
    validRows: row.valid_rows,
    warningRows: row.warning_rows,
    status: row.status as 'SUCCESS' | 'LOCAL_ONLY' | 'NO_DATA' | 'FAILED',
    errorMessage: row.error_message || undefined
  };
}

export function saveUploadRecord(record: UploadRecord): void {
  const db = initDatabase();
  db.prepare(`
    INSERT INTO uploads 
    (upload_id, center_code, file_name, file_hash, upload_time, input_rows, valid_rows, warning_rows, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(upload_id) DO UPDATE SET
      status = excluded.status,
      error_message = excluded.error_message
  `).run(
    record.uploadId,
    record.centerCode,
    record.fileName,
    record.fileHash,
    record.uploadTime,
    record.inputRows,
    record.validRows,
    record.warningRows,
    record.status,
    record.errorMessage || null
  );
}

export function updateUploadStatus(uploadId: string, status: 'SUCCESS' | 'LOCAL_ONLY' | 'NO_DATA' | 'FAILED', errorMessage?: string): void {
  const db = initDatabase();
  db.prepare(`
    UPDATE uploads SET status = ?, error_message = ? WHERE upload_id = ?
  `).run(status, errorMessage || null, uploadId);
}

function saveReportItemsInternal(
  db: DatabaseSync,
  items: ProcessedReportItem[],
  mode: 'upsert' | 'replace_center' = 'upsert'
): { inserted: number; updated: number } {
  if (items.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  let inserted = 0;
  let updated = 0;

  db.exec('BEGIN IMMEDIATE;');
  try {
    if (mode === 'replace_center') {
      const centerCode = items[0]['Mã TTBH'];
      if (items.some(item => item['Mã TTBH'] !== centerCode)) {
        throw new Error('Không thể ghi đè dữ liệu của nhiều TTBH trong cùng một lần tải lên.');
      }
      db.prepare('DELETE FROM reports WHERE center_code = ?').run(centerCode);
      const insertStmt = db.prepare(`
        INSERT INTO reports (
          id, center_code, center_name, ticket_id, part_code, part_name,
          unit_price, cash_revenue, cash_revenue_before_tax,
          debt_revenue, debt_after_discount, debt_before_tax,
          customer_type, payment_method, warranty_export, repair_export,
          pickup_time, report_date, bring_type, repair_type, part_type, solution,
          source_row_number, upload_id, import_time
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?
        )
      `);

      for (const item of items) {
        const id = reportKey(item);
        insertStmt.run(
          id,
          item['Mã TTBH'],
          item['Tên TTBH'] || '',
          item['Số phiếu sửa chữa'],
          item['Mã vật tư linh kiện'] || '',
          item['Tên vật tư'] || '',
          item['Đơn giá'] ?? null,
          item['Doanh thu tiền mặt'] ?? null,
          item['Doanh thu tiền mặt trước thuế'] ?? null,
          item['Công nợ'] ?? null,
          item['CN sau chiết khấu'] ?? null,
          item['CN trước thuế'] ?? null,
          item['Khách hàng'],
          item['Phương thức thanh toán'],
          String(item['Xuất Bảo Hành'] || ''),
          String(item['Xuất Sửa Chữa'] || ''),
          item['Thời gian lấy máy'] || '',
          item['Ngày báo cáo'],
          item['Loại hình đem đến sửa'] || '',
          item['Loại hình sửa chữa'] || '',
          item['Loại linh kiện'] || '',
          item['Phương án giải quyết'] || '',
          item['Source Row Number'] ?? null,
          item['Upload ID'] || null,
          item['Thời gian import'] || null
        );
      }
      inserted = items.length;
    } else {
      const checkStmt = db.prepare('SELECT id FROM reports WHERE id = ?');
      const insertStmt = db.prepare(`
        INSERT INTO reports (
          id, center_code, center_name, ticket_id, part_code, part_name,
          unit_price, cash_revenue, cash_revenue_before_tax,
          debt_revenue, debt_after_discount, debt_before_tax,
          customer_type, payment_method, warranty_export, repair_export,
          pickup_time, report_date, bring_type, repair_type, part_type, solution,
          source_row_number, upload_id, import_time
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?
        )
      `);
      const updateStmt = db.prepare(`
        UPDATE reports SET
          center_name = ?, ticket_id = ?, part_code = ?, part_name = ?,
          unit_price = ?, cash_revenue = ?, cash_revenue_before_tax = ?,
          debt_revenue = ?, debt_after_discount = ?, debt_before_tax = ?,
          customer_type = ?, payment_method = ?, warranty_export = ?, repair_export = ?,
          pickup_time = ?, report_date = ?, bring_type = ?, repair_type = ?, part_type = ?, solution = ?,
          source_row_number = ?, upload_id = ?, import_time = ?
        WHERE id = ?
      `);

      for (const item of items) {
        const id = reportKey(item);
        const existing = checkStmt.get(id);
        if (existing) {
          updateStmt.run(
            item['Tên TTBH'] || '',
            item['Số phiếu sửa chữa'],
            item['Mã vật tư linh kiện'] || '',
            item['Tên vật tư'] || '',
            item['Đơn giá'] ?? null,
            item['Doanh thu tiền mặt'] ?? null,
            item['Doanh thu tiền mặt trước thuế'] ?? null,
            item['Công nợ'] ?? null,
            item['CN sau chiết khấu'] ?? null,
            item['CN trước thuế'] ?? null,
            item['Khách hàng'],
            item['Phương thức thanh toán'],
            String(item['Xuất Bảo Hành'] || ''),
            String(item['Xuất Sửa Chữa'] || ''),
            item['Thời gian lấy máy'] || '',
            item['Ngày báo cáo'],
            item['Loại hình đem đến sửa'] || '',
            item['Loại hình sửa chữa'] || '',
            item['Loại linh kiện'] || '',
            item['Phương án giải quyết'] || '',
            item['Source Row Number'] ?? null,
            item['Upload ID'] || null,
            item['Thời gian import'] || null,
            id
          );
          updated++;
        } else {
          insertStmt.run(
            id,
            item['Mã TTBH'],
            item['Tên TTBH'] || '',
            item['Số phiếu sửa chữa'],
            item['Mã vật tư linh kiện'] || '',
            item['Tên vật tư'] || '',
            item['Đơn giá'] ?? null,
            item['Doanh thu tiền mặt'] ?? null,
            item['Doanh thu tiền mặt trước thuế'] ?? null,
            item['Công nợ'] ?? null,
            item['CN sau chiết khấu'] ?? null,
            item['CN trước thuế'] ?? null,
            item['Khách hàng'],
            item['Phương thức thanh toán'],
            String(item['Xuất Bảo Hành'] || ''),
            String(item['Xuất Sửa Chữa'] || ''),
            item['Thời gian lấy máy'] || '',
            item['Ngày báo cáo'],
            item['Loại hình đem đến sửa'] || '',
            item['Loại hình sửa chữa'] || '',
            item['Loại linh kiện'] || '',
            item['Phương án giải quyết'] || '',
            item['Source Row Number'] ?? null,
            item['Upload ID'] || null,
            item['Thời gian import'] || null
          );
          inserted++;
        }
      }
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return { inserted, updated };
}

export function saveReportItems(
  items: ProcessedReportItem[],
  mode: 'upsert' | 'replace_center' = 'upsert'
): { inserted: number; updated: number } {
  const db = initDatabase();
  return saveReportItemsInternal(db, items, mode);
}

export function clearCenterData(centerCode: string): void {
  const db = initDatabase();
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare('DELETE FROM reports WHERE center_code = ?').run(centerCode);
    db.prepare('DELETE FROM uploads WHERE center_code = ?').run(centerCode);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function getReportItems(centerCode: string, reportDate?: string): ProcessedReportItem[] {
  const db = initDatabase();
  let rows: any[];
  if (reportDate && reportDate.toUpperCase() !== 'ALL') {
    rows = db.prepare('SELECT * FROM reports WHERE center_code = ? AND report_date = ? ORDER BY pickup_time ASC, rowid ASC').all(centerCode, reportDate);
  } else {
    rows = db.prepare('SELECT * FROM reports WHERE center_code = ? ORDER BY report_date DESC, pickup_time ASC, rowid ASC').all(centerCode);
  }
  return rows.map(rowToReportItem);
}

export function getAvailableDates(centerCode: string): string[] {
  const db = initDatabase();
  const rows: any[] = db.prepare("SELECT DISTINCT report_date FROM reports WHERE center_code = ? AND report_date IS NOT NULL AND report_date != '' ORDER BY report_date DESC").all(centerCode);
  return rows.map(r => r.report_date);
}

export function getDateCounts(centerCode: string): Record<string, number> {
  const db = initDatabase();
  const rows: any[] = db.prepare("SELECT report_date, COUNT(*) as cnt FROM reports WHERE center_code = ? AND report_date IS NOT NULL AND report_date != '' GROUP BY report_date").all(centerCode);
  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.report_date] = Number(r.cnt);
  }
  return counts;
}
