import test from 'node:test';
import assert from 'node:assert';
import * as XLSX from 'xlsx';
import { parsePortalJobcardFile } from '../src/lib/excel-parser';
import { transformExcelRows, RawExcelRow } from '../src/lib/business-rules';
import {
  initDatabase,
  savePortalJobcards,
  getJobcardMap,
  saveReportItems,
  getReportItems,
  getPortalJobcardsStats,
  clearPortalJobcards,
  updateUserSheetUrl,
  getUserSheetUrl
} from '../src/lib/db-storage';

test('Portal Jobcard Parser: parses valid workbook and trims bill codes', () => {
  const data = [
    {
      'STT': 1,
      'BILL CHUYỂN ĐI TTBH': '00533NT2609012902\t ',
      'MÃ JOBCARD': 'JDT005332609500056',
      'IMEI': '861234567890123',
      'TÊN KHÁCH': 'Nguyễn Văn A',
      'SĐT': '0987654321',
      'SIÊU THỊ': 'TGDĐ Ninh Kiều'
    },
    {
      'STT': 2,
      'BILL CHUYỂN ĐI TTBH': '  00786NT2609016671  ',
      'MÃ JOBCARD': 'JDT007862609500073',
      'IMEI': '869876543210987',
      'TÊN KHÁCH': 'Trần Thị B',
      'SĐT': '0912345678',
      'SIÊU THỊ': 'TGDĐ Cái Răng'
    }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Portal');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = parsePortalJobcardFile(buffer);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.records.length, 2);
  assert.strictEqual(result.records[0].billCode, '00533NT2609012902');
  assert.strictEqual(result.records[0].jobcardCode, 'JDT005332609500056');
  assert.strictEqual(result.records[1].billCode, '00786NT2609016671');
  assert.strictEqual(result.records[1].jobcardCode, 'JDT007862609500073');
});

test('Portal Jobcard Parser: handles missing required columns', () => {
  const data = [{ 'STT': 1, 'MÃ ĐƠN HÀNG': '123' }];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Portal');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = parsePortalJobcardFile(buffer);
  assert.strictEqual(result.success, false);
  assert.match(result.error || '', /Không tìm thấy cột/);
});

test('transformExcelRows: maps Jobcard using jobcardMap', () => {
  const row: RawExcelRow = {
    'Mã tổ chức': 'R4001003',
    'Phiếu công tác sửa chữa': 'TEST_WAYBILL_01',
    'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
    'Số điện thoại người đem đến sửa': '+84 190****464',
    'Loại hình sửa chữa': 'Sửa chữa',
    'Phương án giải quyết': 'Thay thế linh kiện và phụ kiện',
    'Loại linh kiện': 'Sửa chữa',
    'Mã linh kiện': 'LK_TEST_01',
    'Tên linh kiện': 'Pin Test',
    'Số tiền phải thu': 300000,
    'Số tiền thực thu': 300000,
    'Thời gian lấy máy': '2026-09-16 10:00:00',
    'Số vận đơn nhanh (nhận)': ' 00533NT2609012902\t '
  };

  const jobcardMap = new Map<string, string>([
    ['00533NT2609012902', 'JDT005332609500056']
  ]);

  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ', jobcardMap);
  assert.strictEqual(res.items.length, 1);
  assert.strictEqual(res.items[0]['Số vận đơn nhanh (nhận)'], '00533NT2609012902');
  assert.strictEqual(res.items[0]['Jobcard'], 'JDT005332609500056');
});

test('savePortalJobcards: retroactively updates existing reports with matching waybill', () => {
  initDatabase();

  const uniqueBill = `BILL_TEST_${Date.now()}`;
  const uniqueJobcard = `JC_TEST_${Date.now()}`;

  const reportItem = {
    'Ngày báo cáo': '2026-09-16',
    'Số phiếu sửa chữa': `MWR_RETRO_${Date.now()}`,
    'Mã vật tư linh kiện': 'LK_RETRO_01',
    'Tên vật tư': 'Màn hình Retro Test',
    'Xuất Bảo Hành': 0,
    'Xuất phụ kiện': 0,
    'Xuất Sửa Chữa': 1,
    'Đơn giá': 400000,
    'Doanh thu tiền mặt': null,
    'Doanh thu tiền mặt trước thuế': null,
    'Công nợ': 400000,
    'CN sau chiết khấu': 360000,
    'CN trước thuế': 327273,
    'Khách hàng': 'TGDĐ' as const,
    'Phương thức thanh toán': 'CN' as const,
    'Jobcard': '',
    'Số vận đơn nhanh (nhận)': uniqueBill,
    'Thời gian lấy máy': '2026-09-16 12:00:00',
    'Mã TTBH': 'R4001003',
    'Tên TTBH': 'Trung tâm CSKH vivo Cần Thơ',
    'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
    'Phương án giải quyết': 'Thay thế linh kiện và phụ kiện',
    'Loại hình sửa chữa': 'Sửa chữa',
    'Loại linh kiện': 'Sửa chữa',
    'Upload ID': 'TEST_UPL_RETRO'
  };

  saveReportItems([reportItem], 'upsert');

  // Verify before portal upload: Jobcard is empty
  const beforeItems = getReportItems('R4001003', '2026-09-16');
  const targetBefore = beforeItems.find(i => i['Số phiếu sửa chữa'] === reportItem['Số phiếu sửa chữa']);
  assert.ok(targetBefore);
  assert.strictEqual(targetBefore?.['Jobcard'], '');

  // Now upload portal jobcards
  const portalRes = savePortalJobcards([
    {
      billCode: uniqueBill,
      jobcardCode: uniqueJobcard
    }
  ]);

  assert.ok(portalRes.totalSaved >= 1);
  assert.ok(portalRes.updatedReportsCount >= 1);
  assert.ok(portalRes.matchedTickets.includes(reportItem['Số phiếu sửa chữa']));

  // Verify after portal upload: Jobcard is now populated
  const afterItems = getReportItems('R4001003', '2026-09-16');
  const targetAfter = afterItems.find(i => i['Số phiếu sửa chữa'] === reportItem['Số phiếu sửa chữa']);
  assert.ok(targetAfter);
  assert.strictEqual(targetAfter?.['Jobcard'], uniqueJobcard);

  // Verify stats helper
  const stats = getPortalJobcardsStats();
  assert.ok(stats.totalCount >= 1);
  assert.ok(stats.matchedCount >= 1);
});

test('Case-insensitive bill matching: 01283NT2609036581 and 01283nt2609036581 match regardless of case', () => {
  const lowerBill = '01283nt2609036581';
  const upperBill = '01283NT2609036581';
  const expectedJobcard = 'JDT012832609500999';

  // Save portal jobcard with lowercase bill
  savePortalJobcards([
    {
      billCode: lowerBill,
      jobcardCode: expectedJobcard
    }
  ]);

  // Transform raw row with uppercase bill
  const row: RawExcelRow = {
    'Mã tổ chức': 'R4001003',
    'Phiếu công tác sửa chữa': 'TEST_CASE_INSENSITIVE_01',
    'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
    'Số điện thoại người đem đến sửa': '+84 190****464',
    'Loại hình sửa chữa': 'Sửa chữa',
    'Phương án giải quyết': 'Thay thế linh kiện và phụ kiện',
    'Loại linh kiện': 'Sửa chữa',
    'Mã linh kiện': 'LK_TEST_CASE',
    'Tên linh kiện': 'Pin Case Test',
    'Số tiền phải thu': 300000,
    'Số tiền thực thu': 300000,
    'Thời gian lấy máy': '2026-09-16 10:00:00',
    'Số vận đơn nhanh (nhận)': upperBill
  };

  const jobcardMap = getJobcardMap();
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ', jobcardMap);
  assert.strictEqual(res.items.length, 1);
  assert.strictEqual(res.items[0]['Jobcard'], expectedJobcard);
});

test('clearPortalJobcards: resets all portal jobcards and clears mapped jobcard in reports', () => {
  initDatabase();

  const resetBill = `RESET_BILL_${Date.now()}`;
  const resetJobcard = `RESET_JC_${Date.now()}`;

  // 1. Save a report item
  saveReportItems([
    {
      'Ngày báo cáo': '2026-09-16',
      'Số phiếu sửa chữa': `TICKET_RESET_${Date.now()}`,
      'Mã vật tư linh kiện': 'LK_RESET_01',
      'Tên vật tư': 'Camera Reset Test',
      'Xuất Bảo Hành': '',
      'Xuất phụ kiện': '',
      'Xuất Sửa Chữa': 1,
      'Đơn giá': 450000,
      'Doanh thu tiền mặt': null,
      'Doanh thu tiền mặt trước thuế': null,
      'Công nợ': 450000,
      'CN sau chiết khấu': 432000,
      'CN trước thuế': 400000,
      'Khách hàng': 'TGDĐ',
      'Phương thức thanh toán': 'CN',
      'Jobcard': '',
      'Số vận đơn nhanh (nhận)': resetBill,
      'Thời gian lấy máy': '2026-09-16 11:30:00',
      'Mã TTBH': 'R4001003',
      'Tên TTBH': 'Trung tâm CSKH vivo Cần Thơ',
      'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
      'Loại hình sửa chữa': 'Sửa chữa',
      'Phương án giải quyết': 'Thay thế linh kiện và phụ kiện'
    }
  ]);

  // 2. Save portal jobcard matching this bill
  savePortalJobcards([
    {
      billCode: resetBill,
      jobcardCode: resetJobcard
    }
  ]);

  // Verify it was matched
  let stats = getPortalJobcardsStats();
  assert.ok(stats.totalCount >= 1);
  assert.ok(stats.matchedCount >= 1);

  // 3. Perform clearPortalJobcards
  const clearResult = clearPortalJobcards();
  assert.ok(clearResult.deletedCount >= 1);
  assert.ok(clearResult.clearedReportsCount >= 1);

  // 4. Verify stats are now 0
  stats = getPortalJobcardsStats();
  assert.strictEqual(stats.totalCount, 0);
  assert.strictEqual(stats.matchedCount, 0);

  // 5. Verify map is empty
  const map = getJobcardMap();
  assert.strictEqual(map.has(resetBill), false);
});

test('Multi-center isolation: Portal jobcards and Google Sheet URLs are strictly isolated between centers', () => {
  initDatabase();

  const centerA = 'R4001003';
  const centerB = 'R4001008';

  // 1. Center A sets their Google Sheet URL
  const sheetUrlA = 'https://docs.google.com/spreadsheets/d/center-A-sheet/edit';
  updateUserSheetUrl(centerA, sheetUrlA);
  assert.strictEqual(getUserSheetUrl(centerA), sheetUrlA);

  // Center B should NOT see Center A's sheet URL
  assert.notStrictEqual(getUserSheetUrl(centerB), sheetUrlA);

  // 2. Center A saves portal jobcards
  const billA = `BILL_A_${Date.now()}`;
  savePortalJobcards([{ billCode: billA, jobcardCode: 'JC_A_001' }], centerA);

  // Center A should see 1 jobcard, Center B should see 0
  const statsA = getPortalJobcardsStats(centerA);
  const statsB = getPortalJobcardsStats(centerB);
  assert.strictEqual(statsA.totalCount, 1);
  assert.strictEqual(statsB.totalCount, 0);

  // 3. Center B sets their own Google Sheet URL and portal jobcard
  const sheetUrlB = 'https://docs.google.com/spreadsheets/d/center-B-sheet/edit';
  updateUserSheetUrl(centerB, sheetUrlB);
  assert.strictEqual(getUserSheetUrl(centerB), sheetUrlB);
  assert.strictEqual(getUserSheetUrl(centerA), sheetUrlA);

  const billB = `BILL_B_${Date.now()}`;
  savePortalJobcards([{ billCode: billB, jobcardCode: 'JC_B_001' }], centerB);

  // Both have 1, isolated
  assert.strictEqual(getPortalJobcardsStats(centerA).totalCount, 1);
  assert.strictEqual(getPortalJobcardsStats(centerB).totalCount, 1);

  // Map is isolated
  assert.strictEqual(getJobcardMap(centerA).has(billA), true);
  assert.strictEqual(getJobcardMap(centerA).has(billB), false);
  assert.strictEqual(getJobcardMap(centerB).has(billB), true);
  assert.strictEqual(getJobcardMap(centerB).has(billA), false);

  // 4. Center A clears their portal data
  clearPortalJobcards(centerA);
  assert.strictEqual(getPortalJobcardsStats(centerA).totalCount, 0);
  assert.strictEqual(getPortalJobcardsStats(centerB).totalCount, 1); // Center B untouched!
});

