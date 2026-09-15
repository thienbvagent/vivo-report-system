import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { getAllCenters } from './centers';
import { ProcessedReportItem } from './business-rules';

const DATA_DIR = path.join(process.cwd(), '.data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const UPLOADS_FILE = path.join(DATA_DIR, 'uploads.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

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
  status: 'SUCCESS' | 'FAILED';
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function initDatabase() {
  ensureDir();

  // Seed 15 accounts with Vivo@2026 if not existing
  if (!fs.existsSync(USERS_FILE)) {
    const defaultHash = bcrypt.hashSync('Vivo@2026', 10);
    const users: StoredUser[] = getAllCenters().map(c => ({
      centerCode: c.code,
      centerName: c.name,
      passwordHash: defaultHash,
      createdAt: new Date().toISOString()
    }));
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  }

  if (!fs.existsSync(UPLOADS_FILE)) {
    fs.writeFileSync(UPLOADS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }

  if (!fs.existsSync(REPORTS_FILE)) {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

export function findUserByCode(code: string): StoredUser | null {
  initDatabase();
  const users: StoredUser[] = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  return users.find(u => u.centerCode === code) || null;
}

export function getUploads(centerCode?: string): UploadRecord[] {
  initDatabase();
  const records: UploadRecord[] = JSON.parse(fs.readFileSync(UPLOADS_FILE, 'utf-8'));
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
  fs.writeFileSync(UPLOADS_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

export function saveReportItems(
  items: ProcessedReportItem[],
  mode: 'upsert' | 'replace_center' = 'upsert'
): { inserted: number; updated: number } {
  initDatabase();
  let existing: ProcessedReportItem[] = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf-8'));
  let inserted = 0;
  let updated = 0;

  if (mode === 'replace_center' && items.length > 0) {
    const centerCode = items[0]['Mã TTBH'];
    // Xóa toàn bộ dữ liệu của TTBH này để thay thế bằng dữ liệu từ file mới
    existing = existing.filter(i => i['Mã TTBH'] !== centerCode);
    existing.push(...items);
    inserted = items.length;
  } else {
    // Upsert: Dò tìm theo số phiếu + mã LK + thời gian lấy máy
    const indexMap = new Map<string, number>();
    existing.forEach((item, idx) => {
      const key = `${item['Số phiếu sửa chữa']}_${item['Mã vật tư linh kiện']}_${item['Thời gian lấy máy']}`;
      indexMap.set(key, idx);
    });

    for (const item of items) {
      const key = `${item['Số phiếu sửa chữa']}_${item['Mã vật tư linh kiện']}_${item['Thời gian lấy máy']}`;
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

  fs.writeFileSync(REPORTS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  return { inserted, updated };
}

export function clearCenterData(centerCode: string) {
  initDatabase();
  const existingReports: ProcessedReportItem[] = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf-8'));
  const filteredReports = existingReports.filter(i => i['Mã TTBH'] !== centerCode);
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(filteredReports, null, 2), 'utf-8');

  const existingUploads: UploadRecord[] = JSON.parse(fs.readFileSync(UPLOADS_FILE, 'utf-8'));
  const filteredUploads = existingUploads.filter(u => u.centerCode !== centerCode);
  fs.writeFileSync(UPLOADS_FILE, JSON.stringify(filteredUploads, null, 2), 'utf-8');
}

export function getReportItems(centerCode: string, reportDate?: string): ProcessedReportItem[] {
  initDatabase();
  const items: ProcessedReportItem[] = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf-8'));
  return items.filter(i => {
    if (i['Mã TTBH'] !== centerCode) return false;
    if (reportDate && reportDate.toUpperCase() !== 'ALL' && i['Ngày báo cáo'] !== reportDate) return false;
    return true;
  });
}

export function getAvailableDates(centerCode: string): string[] {
  initDatabase();
  const items: ProcessedReportItem[] = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf-8'));
  const dates = new Set<string>();
  for (const i of items) {
    if (i['Mã TTBH'] === centerCode && i['Ngày báo cáo']) {
      dates.add(i['Ngày báo cáo']);
    }
  }
  return Array.from(dates).sort().reverse();
}
