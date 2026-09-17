import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, beforeEach } from 'node:test';
import type { ProcessedReportItem } from '../src/lib/business-rules';
import * as storage from '../src/lib/db-storage';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-report-storage-'));
process.env.DB_DIR = testDataDir;
process.env.INITIAL_CENTER_PASSWORD = 'TestPasswordOnly_2026!';

storage.initDatabase();

function item(
  ticket: string,
  partCode: string,
  pickupTime: string,
  unitPrice: number,
  centerCode = 'R4001003'
): ProcessedReportItem {
  return {
    'Số phiếu sửa chữa': ticket,
    'Mã vật tư linh kiện': partCode,
    'Tên vật tư': `Linh kiện ${partCode}`,
    'Đơn giá': unitPrice,
    'Doanh thu tiền mặt': unitPrice,
    'Công nợ': 0,
    'Khách hàng': 'KL',
    'Phương thức thanh toán': 'TM',
    'Xuất Bảo Hành': '',
    'Xuất Sửa Chữa': 1,
    'Thời gian lấy máy': pickupTime,
    'Ngày báo cáo': pickupTime.slice(0, 10),
    'Mã TTBH': centerCode,
    'Tên TTBH': centerCode,
    'Loại hình đem đến sửa': 'Khách hàng đem đến sửa',
    'Loại hình sửa chữa': 'Sửa chữa',
    'Loại linh kiện': 'Sửa chữa',
    'Phương án giải quyết': 'Thay thế linh kiện'
  };
}

beforeEach(() => {
  const db = storage.initDatabase();
  db.exec('DELETE FROM reports; DELETE FROM uploads;');
});

after(() => {
  storage.closeDb();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('upload file B cập nhật dòng cũ và thêm dòng mới từ file A', () => {
  const first = storage.saveReportItems([
    item('TICKET-1', 'PART-1', '2026-09-13 08:00:00', 100),
    item('TICKET-2', 'PART-2', '2026-09-13 09:00:00', 200)
  ]);
  assert.deepEqual(first, { inserted: 2, updated: 0 });

  const second = storage.saveReportItems([
    item('TICKET-1', 'PART-1', '2026-09-15 10:30:00', 150),
    item('TICKET-3', 'PART-3', '2026-09-15 11:00:00', 300)
  ]);
  assert.deepEqual(second, { inserted: 1, updated: 1 });

  const rows = storage.getReportItems('R4001003', 'ALL');
  assert.equal(rows.length, 3);
  const updated = rows.find(row => row['Số phiếu sửa chữa'] === 'TICKET-1');
  assert.equal(updated?.['Đơn giá'], 150);
  assert.equal(updated?.['Thời gian lấy máy'], '2026-09-15 10:30:00');
  assert.equal(updated?.['Ngày báo cáo'], '2026-09-15');
});

test('khóa upsert tách biệt dữ liệu giữa các TTBH', () => {
  storage.saveReportItems([item('TICKET-1', 'PART-1', '2026-09-13 08:00:00', 100, 'R4001003')]);
  const result = storage.saveReportItems([item('TICKET-1', 'PART-1', '2026-09-13 08:00:00', 900, 'R4001001')]);

  assert.deepEqual(result, { inserted: 1, updated: 0 });
  assert.equal(storage.getReportItems('R4001003', 'ALL')[0]['Đơn giá'], 100);
  assert.equal(storage.getReportItems('R4001001', 'ALL')[0]['Đơn giá'], 900);
});

test('ghi đè chỉ thay dữ liệu của đúng TTBH và file rỗng không xóa dữ liệu', () => {
  storage.saveReportItems([
    item('TICKET-1', 'PART-1', '2026-09-13 08:00:00', 100),
    item('TICKET-2', 'PART-2', '2026-09-13 09:00:00', 200),
    item('OTHER-CENTER', 'PART-9', '2026-09-13 09:00:00', 900, 'R4001001')
  ]);

  const replaced = storage.saveReportItems([
    item('TICKET-3', 'PART-3', '2026-09-15 11:00:00', 300)
  ], 'replace_center');
  assert.deepEqual(replaced, { inserted: 1, updated: 0 });
  assert.deepEqual(storage.getReportItems('R4001003', 'ALL').map(row => row['Số phiếu sửa chữa']), ['TICKET-3']);
  assert.equal(storage.getReportItems('R4001001', 'ALL').length, 1);

  const emptyReplace = storage.saveReportItems([], 'replace_center');
  assert.deepEqual(emptyReplace, { inserted: 0, updated: 0 });
  assert.equal(storage.getReportItems('R4001003', 'ALL').length, 1);
});

test('quản lý upload record và cập nhật trạng thái retry', () => {
  storage.saveUploadRecord({
    uploadId: 'UPL-001',
    centerCode: 'R4001003',
    fileName: 'test.xlsx',
    fileHash: 'hash-123',
    uploadTime: '2026-09-16T10:00:00Z',
    inputRows: 10,
    validRows: 8,
    warningRows: 2,
    status: 'LOCAL_ONLY',
    errorMessage: 'n8n webhook timeout'
  });

  const upload = storage.findUploadByHash('R4001003', 'hash-123');
  assert.ok(upload);
  assert.equal(upload.status, 'LOCAL_ONLY');
  assert.equal(upload.errorMessage, 'n8n webhook timeout');

  storage.updateUploadStatus('UPL-001', 'SUCCESS');
  const updated = storage.findUploadByHash('R4001003', 'hash-123');
  assert.equal(updated?.status, 'SUCCESS');
  assert.equal(updated?.errorMessage, undefined);
});

test('giao dịch ACID bảo vệ tính toàn vẹn khi có lỗi', () => {
  storage.saveReportItems([item('TICKET-VALID', 'PART-1', '2026-09-13 08:00:00', 100)]);
  assert.equal(storage.getReportItems('R4001003', 'ALL').length, 1);

  // Thử ghi đè nhưng gây lỗi do nhiều TTBH
  assert.throws(() => {
    storage.saveReportItems([
      item('TICKET-FAIL-1', 'PART-1', '2026-09-13 08:00:00', 100, 'R4001003'),
      item('TICKET-FAIL-2', 'PART-2', '2026-09-13 08:00:00', 200, 'R4001001')
    ], 'replace_center');
  });

  // Dữ liệu cũ vẫn nguyên vẹn 100% nhờ rollback transaction
  assert.equal(storage.getReportItems('R4001003', 'ALL').length, 1);
  assert.equal(storage.getReportItems('R4001003', 'ALL')[0]['Số phiếu sửa chữa'], 'TICKET-VALID');
});

test('bảo toàn các dòng trùng mã linh kiện trong cùng phiếu sửa chữa (Issue 8)', () => {
  // Phiếu có 2 dòng cùng mã PART-DUP (ví dụ thay 2 linh kiện cùng loại hoặc 2 dòng chi tiết)
  const item1 = item('TICKET-DUP', 'PART-DUP', '2026-09-15 10:00:00', 250);
  item1['Upload ID'] = 'UPL-DUP-1';
  const item2 = item('TICKET-DUP', 'PART-DUP', '2026-09-15 10:00:00', 350);
  item2['Upload ID'] = 'UPL-DUP-1';

  // 1. Kiểm tra lưu ở chế độ replace_center không bị lỗi UNIQUE constraint
  const replaceRes = storage.saveReportItems([item1, item2], 'replace_center');
  assert.equal(replaceRes.inserted, 2);

  let rows = storage.getReportItems('R4001003', '2026-09-15');
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['Đơn giá'], 250);
  assert.equal(rows[1]['Đơn giá'], 350);

  // 2. Kiểm tra lưu ở chế độ upsert không bị nuốt mất dòng
  const upsertRes = storage.saveReportItems([item1, item2], 'upsert');
  assert.equal(upsertRes.inserted, 0);
  assert.equal(upsertRes.updated, 2);

  rows = storage.getReportItems('R4001003', '2026-09-15');
  assert.equal(rows.length, 2);

  // 3. Kiểm tra getReportItemsByUploadId
  const byUpload = storage.getReportItemsByUploadId('R4001003', 'UPL-DUP-1');
  assert.equal(byUpload.length, 2);

  const byUploadEmpty = storage.getReportItemsByUploadId('R4001003', 'UPL-NONEXISTENT');
  assert.equal(byUploadEmpty.length, 0);
});

test('portal_jobcards: composite PK ngăn chặn 2 TTBH có cùng mã Bill ghi đè nhau (Issue 1)', () => {
  const sharedBill = 'SHARED_BILL_001';

  // TTBH 1 lưu Jobcard cho sharedBill
  storage.savePortalJobcards([
    { billCode: sharedBill, jobcardCode: 'JC_TTBH_CANTHO' }
  ], 'R4001003');

  // TTBH 2 cũng có sharedBill với mã Jobcard khác
  storage.savePortalJobcards([
    { billCode: sharedBill, jobcardCode: 'JC_TTBH_SAIGON' }
  ], 'R4001008');

  // Kiểm tra TTBH 1 nhận đúng Jobcard của mình, không bị TTBH 2 đè
  const map1 = storage.getJobcardMap('R4001003');
  assert.equal(map1.get(sharedBill), 'JC_TTBH_CANTHO');

  // Kiểm tra TTBH 2 nhận đúng Jobcard của mình
  const map2 = storage.getJobcardMap('R4001008');
  assert.equal(map2.get(sharedBill), 'JC_TTBH_SAIGON');
});

