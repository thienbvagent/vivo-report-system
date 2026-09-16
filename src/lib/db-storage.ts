import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getAllCenters } from './centers';
import { ProcessedReportItem } from './business-rules';

function getDataDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.DB_DIR || path.join(process.cwd(), '.data'));
}

function getDataFile(name: 'users.json' | 'uploads.json' | 'reports.json'): string {
  return path.join(getDataDir(), name);
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
}

function writeJsonAtomic(filePath: string, value: unknown) {
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function reportKey(item: ProcessedReportItem): string {
  const centerCode = String(item['Mã TTBH'] || '').trim().toUpperCase();
  const ticket = String(item['Số phiếu sửa chữa'] || '').trim();
  const partCode = String(item['Mã vật tư linh kiện'] || '').trim();
  const partName = String(item['Tên vật tư'] || '').trim().toLowerCase();

  // Thời gian lấy máy là dữ liệu có thể được chỉnh sửa ở file sau nên không dùng làm khóa upsert.
  // Ưu tiên mã linh kiện; chỉ dùng tên khi file không có mã.
  return [centerCode, ticket, partCode || `name:${partName}`].join('\u001f');
}

function ensureDir() {
  const dataDir = getDataDir();
  if (!fs.existsSync(/* turbopackIgnore: true */ dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function initDatabase() {
  ensureDir();
  const usersFile = getDataFile('users.json');
  const uploadsFile = getDataFile('uploads.json');
  const reportsFile = getDataFile('reports.json');

  // Seed 15 accounts bằng mật khẩu khởi tạo từ môi trường nếu chưa có database.
  if (!fs.existsSync(usersFile)) {
    const initialPassword = process.env.INITIAL_CENTER_PASSWORD;
    if (!initialPassword) {
      throw new Error('Thiếu biến môi trường INITIAL_CENTER_PASSWORD để khởi tạo tài khoản TTBH.');
    }
    const defaultHash = bcrypt.hashSync(initialPassword, 10);
    const users: StoredUser[] = getAllCenters().map(c => ({
      centerCode: c.code,
      centerName: c.name,
      passwordHash: defaultHash,
      createdAt: new Date().toISOString()
    }));
    writeJsonAtomic(usersFile, users);
  }

  if (!fs.existsSync(uploadsFile)) {
    writeJsonAtomic(uploadsFile, []);
  }

  if (!fs.existsSync(reportsFile)) {
    writeJsonAtomic(reportsFile, []);
  }
}

export function findUserByCode(code: string): StoredUser | null {
  initDatabase();
  const users: StoredUser[] = JSON.parse(fs.readFileSync(getDataFile('users.json'), 'utf-8'));
  return users.find(u => u.centerCode === code) || null;
}

export function getUploads(centerCode?: string): UploadRecord[] {
  initDatabase();
  const records: UploadRecord[] = JSON.parse(fs.readFileSync(getDataFile('uploads.json'), 'utf-8'));
  if (centerCode) {
    return records.filter(r => r.centerCode === centerCode);
  }
  return records;
}

export function findUploadByHash(centerCode: string, fileHash: string): UploadRecord | null {
  const records = getUploads(centerCode);
  return records.find(r => r.fileHash === fileHash) || null;
}

export function saveUploadRecord(record: UploadRecord) {
  initDatabase();
  const records = getUploads();
  records.unshift(record);
  writeJsonAtomic(getDataFile('uploads.json'), records);
}

export function saveReportItems(
  items: ProcessedReportItem[],
  mode: 'upsert' | 'replace_center' = 'upsert'
): { inserted: number; updated: number } {
  initDatabase();
  const reportsFile = getDataFile('reports.json');
  let existing: ProcessedReportItem[] = JSON.parse(fs.readFileSync(reportsFile, 'utf-8'));
  let inserted = 0;
  let updated = 0;

  if (mode === 'replace_center' && items.length > 0) {
    const centerCode = items[0]['Mã TTBH'];
    if (items.some(item => item['Mã TTBH'] !== centerCode)) {
      throw new Error('Không thể ghi đè dữ liệu của nhiều TTBH trong cùng một lần tải lên.');
    }
    // Xóa toàn bộ dữ liệu của TTBH này để thay thế bằng dữ liệu từ file mới
    existing = existing.filter(i => i['Mã TTBH'] !== centerCode);
    existing.push(...items);
    inserted = items.length;
  } else {
    // Upsert: Dò theo TTBH + số phiếu + mã linh kiện (hoặc tên nếu thiếu mã).
    const indexMap = new Map<string, number>();
    existing.forEach((item, idx) => {
      indexMap.set(reportKey(item), idx);
    });

    for (const item of items) {
      const key = reportKey(item);
      if (indexMap.has(key)) {
        const existingIdx = indexMap.get(key)!;
        existing[existingIdx] = { ...existing[existingIdx], ...item };
        updated++;
      } else {
        existing.push(item);
        indexMap.set(key, existing.length - 1);
        inserted++;
      }
    }
  }

  writeJsonAtomic(reportsFile, existing);
  return { inserted, updated };
}

export function clearCenterData(centerCode: string) {
  initDatabase();
  const reportsFile = getDataFile('reports.json');
  const uploadsFile = getDataFile('uploads.json');
  const existingReports: ProcessedReportItem[] = JSON.parse(fs.readFileSync(reportsFile, 'utf-8'));
  const filteredReports = existingReports.filter(i => i['Mã TTBH'] !== centerCode);
  writeJsonAtomic(reportsFile, filteredReports);

  const existingUploads: UploadRecord[] = JSON.parse(fs.readFileSync(uploadsFile, 'utf-8'));
  const filteredUploads = existingUploads.filter(u => u.centerCode !== centerCode);
  writeJsonAtomic(uploadsFile, filteredUploads);
}

export function getReportItems(centerCode: string, reportDate?: string): ProcessedReportItem[] {
  initDatabase();
  const items: ProcessedReportItem[] = JSON.parse(fs.readFileSync(getDataFile('reports.json'), 'utf-8'));
  return items.filter(i => {
    if (i['Mã TTBH'] !== centerCode) return false;
    if (reportDate && reportDate.toUpperCase() !== 'ALL' && i['Ngày báo cáo'] !== reportDate) return false;
    return true;
  });
}

export function getAvailableDates(centerCode: string): string[] {
  initDatabase();
  const items: ProcessedReportItem[] = JSON.parse(fs.readFileSync(getDataFile('reports.json'), 'utf-8'));
  const dates = new Set<string>();
  for (const i of items) {
    if (i['Mã TTBH'] === centerCode && i['Ngày báo cáo']) {
      dates.add(i['Ngày báo cáo']);
    }
  }
  return Array.from(dates).sort().reverse();
}

export function getDateCounts(centerCode: string): Record<string, number> {
  initDatabase();
  const items: ProcessedReportItem[] = JSON.parse(fs.readFileSync(getDataFile('reports.json'), 'utf-8'));
  const counts: Record<string, number> = {};
  for (const i of items) {
    if (i['Mã TTBH'] === centerCode && i['Ngày báo cáo']) {
      counts[i['Ngày báo cáo']] = (counts[i['Ngày báo cáo']] || 0) + 1;
    }
  }
  return counts;
}
