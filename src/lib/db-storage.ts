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

export function saveReportItems(items: ProcessedReportItem[]) {
  initDatabase();
  const existing: ProcessedReportItem[] = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf-8'));
  
  // Tránh duplicate items cùng số phiếu + mã linh kiện + thời gian lấy máy
  const keySet = new Set(existing.map(i => `${i['Số phiếu sửa chữa']}_${i['Mã vật tư linh kiện']}_${i['Thời gian lấy máy']}`));
  
  for (const item of items) {
    const key = `${item['Số phiếu sửa chữa']}_${item['Mã vật tư linh kiện']}_${item['Thời gian lấy máy']}`;
    if (!keySet.has(key)) {
      existing.push(item);
      keySet.add(key);
    }
  }

  fs.writeFileSync(REPORTS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
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
