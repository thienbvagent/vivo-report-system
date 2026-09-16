import test from 'node:test';
import assert from 'node:assert';
import * as XLSX from 'xlsx';
import { generateTanTamDebtReportExcel, generateFullReportExcel, formatToDMY } from '../src/lib/export-excel';
import { ProcessedReportItem } from '../src/lib/business-rules';

test('formatToDMY: formats YYYY-MM-DD to D-M-YYYY', () => {
  assert.strictEqual(formatToDMY('2026-09-15'), '15-9-2026');
  assert.strictEqual(formatToDMY('2026-01-05'), '5-1-2026');
});

test('generateTanTamDebtReportExcel: generates styled workbook matching sample structure', async () => {
  const items: ProcessedReportItem[] = [
    {
      'Số phiếu sửa chữa': 'MWR4001003260915000002',
      'Mã TTBH': 'R4001003',
      'Tên TTBH': 'Trung tâm CSKH vivo Cần Thơ',
      'Mã vật tư linh kiện': '5430390',
      'Tên vật tư': 'Pin Lithium Vỏ Nhựa B-O8 2# HSF Phiên Bản Xuất Khẩu',
      'Xuất Bảo Hành': 0,
      'Xuất phụ kiện': 0,
      'Xuất Sửa Chữa': 1,
      'Đơn giá': 551000,
      'Doanh thu tiền mặt': null,
      'Doanh thu tiền mặt trước thuế': null,
      'Công nợ': 551000,
      'CN sau chiết khấu': 528960,
      'CN trước thuế': 489777.78,
      'Khách hàng': 'TGDĐ',
      'Phương thức thanh toán': 'CN',
      'Jobcard': 'JDT014072609500015',
      'Thời gian lấy máy': '2026-09-15 14:00:00',
      'Ngày báo cáo': '2026-09-15',
      'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
      'Phương án giải quyết': 'Thay thế linh kiện và phụ kiện',
      'Loại hình sửa chữa': 'Sửa chữa',
      'Loại linh kiện': 'Sửa chữa'
    },
    {
      'Số phiếu sửa chữa': 'MWR4001003260915000003',
      'Mã TTBH': 'R4001003',
      'Tên TTBH': 'Trung tâm CSKH vivo Cần Thơ',
      'Mã vật tư linh kiện': '5437646',
      'Tên vật tư': 'Lắp ráp hiển thị Y19s Pro',
      'Xuất Bảo Hành': 0,
      'Xuất phụ kiện': 0,
      'Xuất Sửa Chữa': 1,
      'Đơn giá': 788000,
      'Doanh thu tiền mặt': null,
      'Doanh thu tiền mặt trước thuế': null,
      'Công nợ': 788000,
      'CN sau chiết khấu': 756480,
      'CN trước thuế': 700444.44,
      'Khách hàng': 'TGDĐ',
      'Phương thức thanh toán': 'CN',
      'Jobcard': 'JDT009082609500108',
      'Thời gian lấy máy': '2026-09-15 15:00:00',
      'Ngày báo cáo': '2026-09-15',
      'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
      'Phương án giải quyết': 'Thay thế linh kiện và phụ kiện',
      'Loại hình sửa chữa': 'Sửa chữa',
      'Loại linh kiện': 'Sửa chữa'
    }
  ];

  const res = await generateTanTamDebtReportExcel(items, 'Trung tâm CSKH vivo Cần Thơ', '2026-09-15');
  assert.strictEqual(res.filename, 'TTBH CẦN THƠ - 15-9-2026 - Báo cáo Công Nợ Tận Tâm.xlsx');
  assert.strictEqual(res.totalRecords, 2);

  // Verify structure with XLSX parser
  const wb = XLSX.read(res.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Row 1 headers
  assert.strictEqual(ws['A1']?.v, 'Thời gian lấy máy');
  assert.strictEqual(ws['B1']?.v, 'Phiếu công tác sửa chữa');
  assert.strictEqual(ws['C1']?.v, 'Mã linh kiện');
  assert.strictEqual(ws['D1']?.v, 'Tên linh kiện');
  assert.strictEqual(ws['H1']?.v, 'Công nợ');
  assert.strictEqual(ws['I1']?.v, 'CN sau chiết khấu');
  assert.strictEqual(ws['J1']?.v, 'CN trước thuế');
  assert.strictEqual(ws['K1']?.v, 'Jobcard');
  assert.strictEqual(ws['L1']?.v, 'Ghi chú');

  // Row 2 subtotal / sum formulas - only up to last data row B4!
  assert.strictEqual(ws['B2']?.f, 'SUBTOTAL(3,B3:B4)');
  assert.strictEqual(ws['D2']?.f, 'SUBTOTAL(3,D3:D4)');
  assert.strictEqual(ws['H2']?.f, 'SUM(H3:H4)');
  assert.strictEqual(ws['I2']?.f, 'SUM(I3:I4)');
  assert.strictEqual(ws['J2']?.f, 'SUM(J3:J4)');
  assert.strictEqual(ws['H2']?.v, 1339000);

  // Row 3 data & formulas
  assert.strictEqual(ws['B3']?.v, 'MWR4001003260915000002');
  assert.strictEqual(ws['I3']?.f, 'H3*0.96');
  assert.strictEqual(ws['J3']?.f, 'I3/1.08');
  assert.strictEqual(ws['K3']?.v, 'JDT014072609500015');
});

test('generateTanTamDebtReportExcel: excludes items with Công nợ = 0', async () => {
  const items: ProcessedReportItem[] = [
    {
      'Số phiếu sửa chữa': 'MWR_ZERO_DEBT_01',
      'Mã TTBH': 'R4001003',
      'Tên TTBH': 'Trung tâm CSKH vivo Cần Thơ',
      'Mã vật tư linh kiện': 'LK_ZERO',
      'Tên vật tư': 'Linh kiện bảo hành miễn phí',
      'Xuất Bảo Hành': 1,
      'Xuất phụ kiện': 0,
      'Xuất Sửa Chữa': 0,
      'Đơn giá': 0,
      'Doanh thu tiền mặt': null,
      'Doanh thu tiền mặt trước thuế': null,
      'Công nợ': 0,
      'CN sau chiết khấu': 0,
      'CN trước thuế': 0,
      'Khách hàng': 'TGDĐ',
      'Phương thức thanh toán': 'CN',
      'Jobcard': 'JC_ZERO',
      'Thời gian lấy máy': '2026-09-15 10:00:00',
      'Ngày báo cáo': '2026-09-15',
      'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
      'Phương án giải quyết': 'Thay thế linh kiện',
      'Loại hình sửa chữa': 'Bảo hành',
      'Loại linh kiện': 'Bảo hành'
    },
    {
      'Số phiếu sửa chữa': 'MWR_HAS_DEBT_01',
      'Mã TTBH': 'R4001003',
      'Tên TTBH': 'Trung tâm CSKH vivo Cần Thơ',
      'Mã vật tư linh kiện': 'LK_DEBT',
      'Tên vật tư': 'Màn hình có tính tiền',
      'Xuất Bảo Hành': 0,
      'Xuất phụ kiện': 0,
      'Xuất Sửa Chữa': 1,
      'Đơn giá': 500000,
      'Doanh thu tiền mặt': null,
      'Doanh thu tiền mặt trước thuế': null,
      'Công nợ': 500000,
      'CN sau chiết khấu': 480000,
      'CN trước thuế': 444444.44,
      'Khách hàng': 'TGDĐ',
      'Phương thức thanh toán': 'CN',
      'Jobcard': 'JC_DEBT',
      'Thời gian lấy máy': '2026-09-15 11:00:00',
      'Ngày báo cáo': '2026-09-15',
      'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
      'Phương án giải quyết': 'Thay thế linh kiện',
      'Loại hình sửa chữa': 'Sửa chữa',
      'Loại linh kiện': 'Sửa chữa'
    }
  ];

  const res = await generateTanTamDebtReportExcel(items, 'Trung tâm CSKH vivo Cần Thơ', '2026-09-15');
  assert.strictEqual(res.totalRecords, 1);
  const wb = XLSX.read(res.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  assert.strictEqual(ws['B2']?.f, 'SUBTOTAL(3,B3:B3)');
  assert.strictEqual(ws['B3']?.v, 'MWR_HAS_DEBT_01');
  assert.strictEqual(ws['B4'], undefined); // Only 1 data row!
});

test('generateFullReportExcel: exports all UI columns and summary total row', async () => {
  const items: ProcessedReportItem[] = [
    {
      'Số phiếu sửa chữa': 'MWR_FULL_001',
      'Mã TTBH': 'R4001003',
      'Tên TTBH': 'Trung tâm CSKH vivo Cần Thơ',
      'Mã vật tư linh kiện': 'LK001',
      'Tên vật tư': 'Màn hình LCD',
      'Xuất Bảo Hành': 1,
      'Xuất phụ kiện': 0,
      'Xuất Sửa Chữa': 0,
      'Đơn giá': 100000,
      'Doanh thu tiền mặt': 100000,
      'Doanh thu tiền mặt trước thuế': 92593,
      'Công nợ': 0,
      'CN sau chiết khấu': 0,
      'CN trước thuế': 0,
      'Khách hàng': 'KL',
      'Phương thức thanh toán': 'TM',
      'Jobcard': 'JC_TEST_01',
      'Thời gian lấy máy': '2026-09-15 10:00:00',
      'Ngày báo cáo': '2026-09-15',
      'Loại hình đem đến sửa': 'Khách hàng đem đến sửa',
      'Phương án giải quyết': 'Thay thế linh kiện',
      'Loại hình sửa chữa': 'Sửa chữa',
      'Loại linh kiện': 'Sửa chữa'
    }
  ];

  const res = await generateFullReportExcel(items, 'R4001003', 'Trung tâm CSKH vivo Cần Thơ', '2026-09-15');
  assert.strictEqual(res.filename, 'BaoCao_R4001003_2026-09-15.xlsx');
  assert.strictEqual(res.totalRecords, 1);

  const wb = XLSX.read(res.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  assert.strictEqual(ws['A1']?.v, 'STT');
  assert.strictEqual(ws['B1']?.v, 'Thời Gian Lấy Máy');
  assert.strictEqual(ws['C1']?.v, 'Số Phiếu Sửa Chữa');
  assert.strictEqual(ws['Q1']?.v, 'Jobcard');
  assert.strictEqual(ws['A2']?.v, 1);
  assert.strictEqual(ws['Q2']?.v, 'JC_TEST_01');

  // Summary Row at A3
  assert.strictEqual(ws['A3']?.v, 'TỔNG CỘNG');
  assert.strictEqual(ws['F3']?.f, 'SUM(F2:F2)');
  assert.strictEqual(ws['I3']?.f, 'SUM(I2:I2)');
  assert.strictEqual(ws['J3']?.f, 'SUM(J2:J2)');
  assert.strictEqual(ws['J3']?.v, 100000);
});
