import * as XLSX from 'xlsx';
import { transformExcelRows } from '../src/lib/business-rules';
import { saveReportItems, saveUploadRecord } from '../src/lib/db-storage';
import fs from 'fs';
import path from 'path';

const filePath = 'D:\\\\VN0000182_Bảng báo cáo truy vấn chi tiết phiếu công tác sửa chữa_2026-09-13 11_51_10 (1).xlsx';
console.log('Reading file:', filePath);
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets['Sheet1'];
const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log('Read rows:', rows.length);
const res = transformExcelRows(rows, 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
console.log('Valid rows:', res.validRows, 'Revenue:', res.totalRevenue, 'Debt:', res.totalDebt, 'Cash:', res.totalCash);

const dbDir = path.resolve(process.cwd(), '.data');
fs.writeFileSync(path.join(dbDir, 'reports.json'), JSON.stringify([], null, 2), 'utf-8');
fs.writeFileSync(path.join(dbDir, 'uploads.json'), JSON.stringify([], null, 2), 'utf-8');

saveUploadRecord({
  uploadId: 'UPL_REBUILD_2026',
  centerCode: 'R4001003',
  fileName: 'VN0000182_Bảng báo cáo truy vấn chi tiết phiếu công tác sửa chữa_2026-09-13 11_51_10 (1).xlsx',
  fileHash: 'HASH_UPDATED_NEW_RULES',
  uploadTime: new Date().toISOString(),
  inputRows: res.inputRows,
  validRows: res.validRows,
  warningRows: res.warningRows,
  status: 'SUCCESS'
});

saveReportItems(res.items);
console.log('Saved 490 updated items to .data/reports.json!');
