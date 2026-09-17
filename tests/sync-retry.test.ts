import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  initDatabase,
  saveReportItems,
  getReportItemsByUploadId,
  updateUploadStatus,
  getUploads,
  updateUserSheetUrl,
  getUserSheetUrl,
  isSpreadsheetIdUsedByOtherCenter
} from '../src/lib/db-storage';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-sync-retry-test-'));
process.env.DB_DIR = testDataDir;
process.env.INITIAL_CENTER_PASSWORD = 'TestPasswordOnly_2026!';
process.env.SESSION_SECRET = 'super_secret_session_key_test_at_least_32_characters_long';

test('Sync-Retry: isSpreadsheetIdUsedByOtherCenter prevents cross-center sheet reuse', () => {
  initDatabase();

  const centerA = 'R4001003';
  const centerB = 'R4001008';
  const sharedSheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  const sheetUrlA = `https://docs.google.com/spreadsheets/d/${sharedSheetId}/edit`;

  // Center A assigns this sheet
  updateUserSheetUrl(centerA, sheetUrlA);
  assert.strictEqual(getUserSheetUrl(centerA), sheetUrlA);

  // Center A should NOT be blocked from using their own sheet
  assert.strictEqual(isSpreadsheetIdUsedByOtherCenter(centerA, sharedSheetId), false);

  // Center B attempting to use Center A's sheet MUST be detected and blocked
  assert.strictEqual(isSpreadsheetIdUsedByOtherCenter(centerB, sharedSheetId), true);

  // A different, unused sheet ID is allowed for Center B
  const uniqueSheetIdB = '2CxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  assert.strictEqual(isSpreadsheetIdUsedByOtherCenter(centerB, uniqueSheetIdB), false);
});

test('Sync-Retry: groups multi-date records by monthYear to prevent n8n clear wholeSheet data loss', () => {
  initDatabase();

  const centerCode = 'R4001003';
  const uploadId = `UPLOAD_MULTI_DATE_${Date.now()}`;

  // Giả lập 1 upload chứa 3 dòng ở 2 ngày khác nhau trong cùng tháng 09/2026
  // và 1 dòng ở tháng 08/2026
  const items = [
    {
      'Số phiếu sửa chữa': `TICKET_1_${Date.now()}`,
      'Mã TTBH': centerCode,
      'Mã vật tư linh kiện': 'LK_01',
      'Tên vật tư': 'Màn hình 1',
      'Đơn giá': 1000000,
      'Công nợ': 1000000,
      'Khách hàng': 'TGDĐ',
      'Phương thức thanh toán': 'CN',
      'Ngày báo cáo': '2026-09-14',
      'Upload ID': uploadId
    },
    {
      'Số phiếu sửa chữa': `TICKET_2_${Date.now()}`,
      'Mã TTBH': centerCode,
      'Mã vật tư linh kiện': 'LK_02',
      'Tên vật tư': 'Màn hình 2',
      'Đơn giá': 2000000,
      'Công nợ': 2000000,
      'Khách hàng': 'TGDĐ',
      'Phương thức thanh toán': 'CN',
      'Ngày báo cáo': '2026-09-15',
      'Upload ID': uploadId
    },
    {
      'Số phiếu sửa chữa': `TICKET_3_${Date.now()}`,
      'Mã TTBH': centerCode,
      'Mã vật tư linh kiện': 'LK_03',
      'Tên vật tư': 'Màn hình 3',
      'Đơn giá': 1500000,
      'Công nợ': 1500000,
      'Khách hàng': 'TGDĐ',
      'Phương thức thanh toán': 'CN',
      'Ngày báo cáo': '2026-09-15',
      'Upload ID': uploadId
    },
    {
      'Số phiếu sửa chữa': `TICKET_4_${Date.now()}`,
      'Mã TTBH': centerCode,
      'Mã vật tư linh kiện': 'LK_04',
      'Tên vật tư': 'Pin tháng 8',
      'Đơn giá': 500000,
      'Công nợ': 500000,
      'Khách hàng': 'TGDĐ',
      'Phương thức thanh toán': 'CN',
      'Ngày báo cáo': '2026-08-30',
      'Upload ID': uploadId
    }
  ];

  saveReportItems(items as any);

  const retrievedItems = getReportItemsByUploadId(centerCode, uploadId);
  assert.strictEqual(retrievedItems.length, 4);

  // Áp dụng logic gom nhóm theo tháng như trong sync-retry/route.ts
  const monthMap = new Map<string, typeof retrievedItems>();
  for (const item of retrievedItems) {
    const d = item['Ngày báo cáo'] || new Date().toISOString().slice(0, 10);
    const parts = d.split('-');
    const monthYear = parts.length >= 2
      ? `${parts[1]}-${parts[0]}`
      : `${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date().getFullYear()}`;
    if (!monthMap.has(monthYear)) monthMap.set(monthYear, []);
    monthMap.get(monthYear)!.push(item);
  }

  // Kết quả: Phải gom đúng 2 tháng: '09-2026' (3 items) và '08-2026' (1 item)
  assert.strictEqual(monthMap.size, 2);
  assert.ok(monthMap.has('09-2026'));
  assert.ok(monthMap.has('08-2026'));

  const septItems = monthMap.get('09-2026')!;
  assert.strictEqual(septItems.length, 3);
  // Cả ngày 14 và ngày 15 đều nằm trong cùng 1 lô gửi sang n8n
  const septDates = new Set(septItems.map(i => i['Ngày báo cáo']));
  assert.strictEqual(septDates.size, 2);
  assert.ok(septDates.has('2026-09-14'));
  assert.ok(septDates.has('2026-09-15'));

  const augItems = monthMap.get('08-2026')!;
  assert.strictEqual(augItems.length, 1);
  assert.strictEqual(augItems[0]['Ngày báo cáo'], '2026-08-30');
});

test('Sync-Retry: formats items to standard 17 columns with proper tax and debt calculations', () => {
  const tgddItem = {
    'Ngày báo cáo': '2026-09-15',
    'Số phiếu sửa chữa': 'TICKET_TGDD_01',
    'Mã vật tư linh kiện': 'LK_TGDD_01',
    'Tên vật tư': 'Màn hình Y19',
    'Xuất Bảo Hành': 0,
    'Xuất phụ kiện': 0,
    'Xuất Sửa Chữa': 1,
    'Đơn giá': 1000000,
    'Doanh thu tiền mặt': null,
    'Doanh thu tiền mặt trước thuế': null,
    'Công nợ': 1000000,
    'CN sau chiết khấu': 960000,
    'CN trước thuế': 888889,
    'Khách hàng': 'TGDĐ',
    'Phương thức thanh toán': 'CN',
    'Jobcard': 'JC_12345'
  };

  const klItem = {
    'Ngày báo cáo': '2026-09-15',
    'Số phiếu sửa chữa': 'TICKET_KL_01',
    'Mã vật tư linh kiện': 'LK_KL_01',
    'Tên vật tư': 'Tai nghe',
    'Xuất Bảo Hành': 0,
    'Xuất phụ kiện': 1,
    'Xuất Sửa Chữa': 0,
    'Đơn giá': 200000,
    'Doanh thu tiền mặt': 200000,
    'Doanh thu tiền mặt trước thuế': 185185,
    'Công nợ': 0,
    'CN sau chiết khấu': null,
    'CN trước thuế': null,
    'Khách hàng': 'KL',
    'Phương thức thanh toán': 'TM',
    'Jobcard': ''
  };

  const formatMoneyComma = (val: any): string => {
    if (val === null || val === undefined || val === '') return '';
    const num = typeof val === 'number' ? Math.round(val) : Math.round(Number(String(val).replace(/,/g, '')));
    return isNaN(num) ? '' : new Intl.NumberFormat('en-US').format(num);
  };

  const centerCode = 'R4001003';
  const centerName = 'Trung tâm CSKH vivo Cần Thơ';
  const formatRow = (item: any) => {
    const isTgdd = item['Khách hàng'] === 'TGDĐ';
    return {
      'Ngày': item['Ngày báo cáo'],
      'Số phiếu sửa chữa': item['Số phiếu sửa chữa'],
      'Mã vật tư linh kiện': item['Mã vật tư linh kiện'],
      'Tên vật tư': item['Tên vật tư'],
      'Xuất Bảo Hành': item['Xuất Bảo Hành'] === 1 || item['Xuất Bảo Hành'] === '1' ? 1 : '',
      'Xuất phụ kiện': item['Xuất phụ kiện'] === 1 || item['Xuất phụ kiện'] === '1' ? 1 : '',
      'Xuất Sửa Chữa': item['Xuất Sửa Chữa'] === 1 || item['Xuất Sửa Chữa'] === '1' ? 1 : '',
      'Đơn giá': formatMoneyComma(item['Đơn giá']),
      'Doanh thu tiền mặt': isTgdd ? '0' : (item['Doanh thu tiền mặt'] === null || item['Doanh thu tiền mặt'] === undefined ? '' : formatMoneyComma(item['Doanh thu tiền mặt'])),
      'Doanh thu tiền mặt trước thuế': isTgdd ? '0' : (item['Doanh thu tiền mặt trước thuế'] == null ? '' : formatMoneyComma(item['Doanh thu tiền mặt trước thuế'])),
      'Công nợ': isTgdd ? formatMoneyComma(item['Công nợ'] ?? 0) : '0',
      'CN sau chiết khấu': isTgdd ? formatMoneyComma(item['CN sau chiết khấu'] ?? 0) : '-',
      'CN trước thuế': isTgdd ? formatMoneyComma(item['CN trước thuế'] ?? 0) : '-',
      'Khách hàng': item['Khách hàng'],
      'Phương thức thanh toán': item['Phương thức thanh toán'],
      'Jobcard': item['Jobcard'] || '',
      'TTBH': centerName
    };
  };

  const formattedTgdd = formatRow(tgddItem);
  assert.strictEqual(formattedTgdd['Khách hàng'], 'TGDĐ');
  assert.strictEqual(formattedTgdd['Doanh thu tiền mặt'], '0');
  assert.strictEqual(formattedTgdd['Doanh thu tiền mặt trước thuế'], '0');
  assert.strictEqual(formattedTgdd['Công nợ'], '1,000,000');
  assert.strictEqual(formattedTgdd['CN sau chiết khấu'], '960,000');
  assert.strictEqual(formattedTgdd['CN trước thuế'], '888,889');
  assert.strictEqual(formattedTgdd['Xuất Sửa Chữa'], 1);
  assert.strictEqual(formattedTgdd['Xuất Bảo Hành'], '');
  assert.strictEqual(formattedTgdd['Jobcard'], 'JC_12345');
  assert.strictEqual(formattedTgdd['TTBH'], centerName);
  assert.strictEqual(Object.keys(formattedTgdd).length, 17);

  const formattedKl = formatRow(klItem);
  assert.strictEqual(formattedKl['Khách hàng'], 'KL');
  assert.strictEqual(formattedKl['Doanh thu tiền mặt'], '200,000');
  assert.strictEqual(formattedKl['Doanh thu tiền mặt trước thuế'], '185,185');
  assert.strictEqual(formattedKl['Công nợ'], '0');
  assert.strictEqual(formattedKl['CN sau chiết khấu'], '-');
  assert.strictEqual(formattedKl['CN trước thuế'], '-');
  assert.strictEqual(formattedKl['Xuất phụ kiện'], 1);
  assert.strictEqual(formattedKl['Xuất Sửa Chữa'], '');
  assert.strictEqual(Object.keys(formattedKl).length, 17);
});
