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
  googleSheetUrl?: string;
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

export interface PortalJobcardRecord {
  billCode: string;
  jobcardCode: string;
  imei?: string;
  customerName?: string;
  phone?: string;
  supermarket?: string;
  createdAt?: string;
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
      import_time TEXT,
      inbound_waybill TEXT,
      jobcard TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reports_center_date ON reports (center_code, report_date);
    CREATE INDEX IF NOT EXISTS idx_reports_center_ticket ON reports (center_code, ticket_id);

    CREATE TABLE IF NOT EXISTS portal_jobcards (
      bill_code TEXT PRIMARY KEY,
      jobcard_code TEXT NOT NULL,
      imei TEXT,
      customer_name TEXT,
      phone TEXT,
      supermarket TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_portal_jobcards_bill ON portal_jobcards (bill_code);
  `);

    // Ensure reports columns exist in pre-existing databases
    try {
      const reportCols: any[] = db.prepare('PRAGMA table_info(reports);').all();
      const colNames = new Set(reportCols.map(c => c.name));
      if (!colNames.has('inbound_waybill')) {
        db.exec('ALTER TABLE reports ADD COLUMN inbound_waybill TEXT;');
      }
      if (!colNames.has('jobcard')) {
        db.exec('ALTER TABLE reports ADD COLUMN jobcard TEXT;');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_reports_waybill ON reports (inbound_waybill);');

      // Ensure users has google_sheet_url
      const userCols: any[] = db.prepare('PRAGMA table_info(users);').all();
      const userColNames = new Set(userCols.map(c => c.name));
      if (!userColNames.has('google_sheet_url')) {
        db.exec('ALTER TABLE users ADD COLUMN google_sheet_url TEXT;');
      }

      // Ensure portal_jobcards has center_code
      const portalCols: any[] = db.prepare('PRAGMA table_info(portal_jobcards);').all();
      const portalColNames = new Set(portalCols.map(c => c.name));
      if (!portalColNames.has('center_code')) {
        db.exec("ALTER TABLE portal_jobcards ADD COLUMN center_code TEXT DEFAULT 'R4001003';");
        db.exec('CREATE INDEX IF NOT EXISTS idx_portal_jobcards_center ON portal_jobcards (center_code);');
      }
    } catch {}

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
    'Xuất Bảo Hành': r.warranty_export === '1' || r.warranty_export === 1 ? 1 : '',
    'Xuất phụ kiện': '',
    'Xuất Sửa Chữa': r.repair_export === '1' || r.repair_export === 1 ? 1 : '',
    'Đơn giá': r.unit_price !== null ? r.unit_price : null,
    'Doanh thu tiền mặt': r.cash_revenue !== null ? r.cash_revenue : null,
    'Doanh thu tiền mặt trước thuế': r.cash_revenue_before_tax !== null ? r.cash_revenue_before_tax : null,
    'Công nợ': r.debt_revenue !== null ? r.debt_revenue : null,
    'CN sau chiết khấu': r.debt_after_discount !== null ? r.debt_after_discount : null,
    'CN trước thuế': r.debt_before_tax !== null ? r.debt_before_tax : null,
    'Khách hàng': r.customer_type as 'TGDĐ' | 'KL',
    'Phương thức thanh toán': r.payment_method as 'CN' | 'TM',
    'Jobcard': r.jobcard || '',
    'Số vận đơn nhanh (nhận)': r.inbound_waybill || '',
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
    googleSheetUrl: row.google_sheet_url || '',
    createdAt: row.created_at
  };
}

export function updateUserPassword(centerCode: string, newPasswordHash: string): boolean {
  const db = initDatabase();
  const res = db.prepare('UPDATE users SET password_hash = ? WHERE center_code = ?').run(newPasswordHash, centerCode);
  return ((res as any)?.changes || 0) > 0;
}

export function updateUserSheetUrl(centerCode: string, sheetUrl: string): boolean {
  const db = initDatabase();
  const res = db.prepare('UPDATE users SET google_sheet_url = ? WHERE center_code = ?').run(sheetUrl, centerCode);
  return ((res as any)?.changes || 0) > 0;
}

export function getUserSheetUrl(centerCode: string): string {
  const db = initDatabase();
  try {
    const row: any = db.prepare('SELECT google_sheet_url FROM users WHERE center_code = ?').get(centerCode);
    return row?.google_sheet_url || '';
  } catch {
    return '';
  }
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
    const jobcardMap = getJobcardMapInternal(db);

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
          source_row_number, upload_id, import_time, inbound_waybill, jobcard
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `);

      for (const item of items) {
        const id = reportKey(item);
        const cleanWaybill = String(item['Số vận đơn nhanh (nhận)'] || '').trim().replace(/\s+/g, '');
        let jc = item['Jobcard'] || '';
        if (!jc && cleanWaybill && jobcardMap.has(cleanWaybill)) {
          jc = jobcardMap.get(cleanWaybill)!;
          item['Jobcard'] = jc;
        }

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
          item['Thời gian import'] || null,
          cleanWaybill || null,
          jc || null
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
          source_row_number, upload_id, import_time, inbound_waybill, jobcard
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `);
      const updateStmt = db.prepare(`
        UPDATE reports SET
          center_name = ?, ticket_id = ?, part_code = ?, part_name = ?,
          unit_price = ?, cash_revenue = ?, cash_revenue_before_tax = ?,
          debt_revenue = ?, debt_after_discount = ?, debt_before_tax = ?,
          customer_type = ?, payment_method = ?, warranty_export = ?, repair_export = ?,
          pickup_time = ?, report_date = ?, bring_type = ?, repair_type = ?, part_type = ?, solution = ?,
          source_row_number = ?, upload_id = ?, import_time = ?,
          inbound_waybill = ?,
          jobcard = COALESCE(NULLIF(?, ''), jobcard)
        WHERE id = ?
      `);

      for (const item of items) {
        const id = reportKey(item);
        const cleanWaybill = String(item['Số vận đơn nhanh (nhận)'] || '').trim().replace(/\s+/g, '').toUpperCase();
        let jc = item['Jobcard'] || '';
        if (!jc && cleanWaybill && jobcardMap.has(cleanWaybill)) {
          jc = jobcardMap.get(cleanWaybill)!;
          item['Jobcard'] = jc;
        }

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
            cleanWaybill || null,
            jc || null,
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
            item['Thời gian import'] || null,
            cleanWaybill || null,
            jc || null
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

function getJobcardMapInternal(db: DatabaseSync, centerCode?: string): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const rows: any[] = centerCode
      ? db.prepare('SELECT bill_code, jobcard_code FROM portal_jobcards WHERE center_code = ?').all(centerCode)
      : db.prepare('SELECT bill_code, jobcard_code FROM portal_jobcards').all();
    for (const r of rows) {
      if (r.bill_code && r.jobcard_code) {
        map.set(String(r.bill_code).trim().replace(/\s+/g, '').toUpperCase(), String(r.jobcard_code).trim());
      }
    }
  } catch {}
  return map;
}

export function getJobcardMap(centerCode?: string): Map<string, string> {
  const db = initDatabase();
  return getJobcardMapInternal(db, centerCode);
}

export function savePortalJobcards(records: PortalJobcardRecord[], centerCode: string = 'R4001003'): {
  totalSaved: number;
  updatedReportsCount: number;
  matchedTickets: string[];
} {
  const db = initDatabase();
  let totalSaved = 0;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const insertStmt = db.prepare(`
      INSERT INTO portal_jobcards (center_code, bill_code, jobcard_code, imei, customer_name, phone, supermarket, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bill_code) DO UPDATE SET
        center_code = excluded.center_code,
        jobcard_code = excluded.jobcard_code,
        imei = COALESCE(excluded.imei, portal_jobcards.imei),
        customer_name = COALESCE(excluded.customer_name, portal_jobcards.customer_name),
        phone = COALESCE(excluded.phone, portal_jobcards.phone),
        supermarket = COALESCE(excluded.supermarket, portal_jobcards.supermarket)
    `);

    const now = new Date().toISOString();
    for (const r of records) {
      const cleanBill = String(r.billCode || '').trim().replace(/\s+/g, '').toUpperCase();
      const cleanJobcard = String(r.jobcardCode || '').trim();
      if (!cleanBill || !cleanJobcard) continue;

      insertStmt.run(
        centerCode,
        cleanBill,
        cleanJobcard,
        r.imei || null,
        r.customerName || null,
        r.phone || null,
        r.supermarket || null,
        r.createdAt || now
      );
      totalSaved++;
    }

    // Retroactive update only on reports of THIS centerCode (case-insensitive matching)
    const updateReportsStmt = db.prepare(`
      UPDATE reports
      SET jobcard = (
        SELECT jobcard_code FROM portal_jobcards
        WHERE portal_jobcards.center_code = ?
          AND portal_jobcards.bill_code = UPPER(REPLACE(REPLACE(REPLACE(reports.inbound_waybill, ' ', ''), char(9), ''), char(13), ''))
      )
      WHERE reports.center_code = ?
        AND inbound_waybill IS NOT NULL 
        AND TRIM(inbound_waybill) != ''
        AND EXISTS (
          SELECT 1 FROM portal_jobcards
          WHERE portal_jobcards.center_code = ?
            AND portal_jobcards.bill_code = UPPER(REPLACE(REPLACE(REPLACE(reports.inbound_waybill, ' ', ''), char(9), ''), char(13), ''))
        )
    `);
    const updateRes = updateReportsStmt.run(centerCode, centerCode, centerCode);
    const updatedReportsCount = (updateRes as any)?.changes || 0;

    const matchedRows: any[] = db.prepare(`
      SELECT DISTINCT ticket_id FROM reports
      WHERE center_code = ? AND jobcard IS NOT NULL AND jobcard != ''
    `).all(centerCode);
    const matchedTickets = matchedRows.map(r => r.ticket_id);

    db.exec('COMMIT;');
    return {
      totalSaved,
      updatedReportsCount,
      matchedTickets
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function getPortalJobcardsStats(centerCode?: string): { totalCount: number; matchedCount: number } {
  const db = initDatabase();
  try {
    let totalRow: any;
    let matchedRow: any;

    if (centerCode) {
      totalRow = db.prepare('SELECT COUNT(*) as cnt FROM portal_jobcards WHERE center_code = ?').get(centerCode);
      matchedRow = db.prepare(`
        SELECT COUNT(DISTINCT ticket_id) as cnt FROM reports 
        WHERE center_code = ? AND jobcard IS NOT NULL AND jobcard != ''
      `).get(centerCode);
    } else {
      totalRow = db.prepare('SELECT COUNT(*) as cnt FROM portal_jobcards').get();
      matchedRow = db.prepare(`
        SELECT COUNT(DISTINCT ticket_id) as cnt FROM reports 
        WHERE jobcard IS NOT NULL AND jobcard != ''
      `).get();
    }

    return {
      totalCount: totalRow?.cnt || 0,
      matchedCount: matchedRow?.cnt || 0
    };
  } catch {
    return { totalCount: 0, matchedCount: 0 };
  }
}

export function clearPortalJobcards(centerCode?: string): { deletedCount: number; clearedReportsCount: number } {
  const db = initDatabase();
  db.exec('BEGIN IMMEDIATE;');
  try {
    let deletedCount = 0;
    let clearedReportsCount = 0;

    if (centerCode) {
      const countRow: any = db.prepare('SELECT COUNT(*) as cnt FROM portal_jobcards WHERE center_code = ?').get(centerCode);
      deletedCount = countRow?.cnt || 0;

      db.prepare('DELETE FROM portal_jobcards WHERE center_code = ?').run(centerCode);

      const clearRes = db.prepare(`
        UPDATE reports
        SET jobcard = NULL
        WHERE center_code = ? AND jobcard IS NOT NULL AND jobcard != ''
      `).run(centerCode);
      clearedReportsCount = (clearRes as any)?.changes || 0;
    } else {
      const countRow: any = db.prepare('SELECT COUNT(*) as cnt FROM portal_jobcards').get();
      deletedCount = countRow?.cnt || 0;

      db.prepare('DELETE FROM portal_jobcards').run();

      const clearRes = db.prepare(`
        UPDATE reports
        SET jobcard = NULL
        WHERE jobcard IS NOT NULL AND jobcard != ''
      `).run();
      clearedReportsCount = (clearRes as any)?.changes || 0;
    }

    db.exec('COMMIT;');
    return { deletedCount, clearedReportsCount };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
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
    db.prepare('DELETE FROM portal_jobcards WHERE center_code = ?').run(centerCode);
    db.prepare('UPDATE users SET google_sheet_url = NULL WHERE center_code = ?').run(centerCode);
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
