import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { transformExcelRows, RawExcelRow } from '../src/lib/business-rules';

function createMockRow(overrides: Partial<RawExcelRow> = {}): RawExcelRow {
  return {
    'Mã tổ chức': 'R4001003',
    'Phiếu công tác sửa chữa': 'TEST_PHIEU_001',
    'Loại hình đem đến sửa': 'Khách hàng đem đến sửa',
    'Số điện thoại người đem đến sửa': '+84 987654321',
    'Loại hình sửa chữa': 'Sửa chữa',
    'Phương án giải quyết': 'Thay thế linh kiện và phụ kiện',
    'Loại linh kiện': 'Sửa chữa',
    'Mã linh kiện': 'LK_001',
    'Tên linh kiện': 'Màn hình LCD Test',
    'Số tiền phải thu': 500000,
    'Số tiền thực thu': 500000,
    'Thời gian lấy máy': '2026-09-14 14:19:03',
    ...overrides
  };
}

test('Test 1: Máy demo được gửi đi sửa chữa -> TGDĐ / CN', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Máy demo được gửi đi sửa chữa',
    'Số điện thoại người đem đến sửa': '+84 901111222'
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Khách hàng'], 'TGDĐ');
  assert.strictEqual(res.items[0]['Phương thức thanh toán'], 'CN');
});

test('Test 2: Kênh chuỗi gửi sửa + +84 190****464 -> TGDĐ / CN', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
    'Số điện thoại người đem đến sửa': '+84 190****464'
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Khách hàng'], 'TGDĐ');
  assert.strictEqual(res.items[0]['Phương thức thanh toán'], 'CN');
});

test('Test 3: Kênh chuỗi gửi sửa + +84 190****460 -> TGDĐ / CN', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
    'Số điện thoại người đem đến sửa': '+84 190****460'
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Khách hàng'], 'TGDĐ');
  assert.strictEqual(res.items[0]['Phương thức thanh toán'], 'CN');
});

test('Test 3b: Kênh chuỗi gửi sửa + +84 109*****464 -> TGDĐ / CN', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
    'Số điện thoại người đem đến sửa': '+84 109*****464'
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Khách hàng'], 'TGDĐ');
  assert.strictEqual(res.items[0]['Phương thức thanh toán'], 'CN');
});

test('Test 4: Kênh chuỗi gửi sửa + phone không bắt đầu +84 190 -> KL / TM', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
    'Số điện thoại người đem đến sửa': '+84 912345678'
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Khách hàng'], 'KL');
  assert.strictEqual(res.items[0]['Phương thức thanh toán'], 'TM');
});

test('Test 5: Loại hình khác + phone bắt đầu +84 190 -> KL / TM', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Khách hàng đem đến sửa',
    'Số điện thoại người đem đến sửa': '+84 190****464'
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Khách hàng'], 'KL');
  assert.strictEqual(res.items[0]['Phương thức thanh toán'], 'TM');
});

test('Test 6: Đơn giá lấy từ Số tiền phải thu khi không có Giá bán lẻ đề nghị', () => {
  const row = createMockRow({
    'Loại hình sửa chữa': 'Sửa chữa',
    'Số tiền phải thu': 1125000,
    'Số tiền thực thu': 0
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Đơn giá'], 1125000);
});

test('Test 6b: Đơn giá ưu tiên lấy từ Giá bán lẻ đề nghị (Phương án 2)', () => {
  const row = createMockRow({
    'Loại hình sửa chữa': 'Bảo hành',
    'Loại linh kiện': 'Bảo hành',
    'Giá bán lẻ đề nghị': 4443000,
    'Số tiền phải thu': 0,
    'Số tiền thực thu': 0
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Đơn giá'], 4443000);
  assert.strictEqual(res.items[0]['Công nợ'], 0);
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt'], 0);
  assert.strictEqual(res.items[0]['Xuất Bảo Hành'], 1);
  assert.strictEqual(res.items[0]['Xuất Sửa Chữa'], '');
});

test('Test 7: Đối chiếu Phải thu & Thực thu: KL -> điền Thực thu vào Tiền mặt, Công nợ = 0', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Khách hàng đem đến sửa',
    'Số tiền phải thu': 1850000,
    'Số tiền thực thu': 0
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Đơn giá'], 1850000);
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt'], 0);
  assert.strictEqual(res.items[0]['Công nợ'], 0);
});

test('Test 8: Đối chiếu Phải thu & Thực thu: TGDĐ -> điền Thực thu vào Công nợ, Tiền mặt = 0', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Máy demo được gửi đi sửa chữa',
    'Số tiền phải thu': 1125000,
    'Số tiền thực thu': 0
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Đơn giá'], 1125000);
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt'], 0);
  assert.strictEqual(res.items[0]['Công nợ'], 0);
});

test('Test 8b: Hậu kiểm TGDĐ có Loại hình sửa chữa và Loại linh kiện đều là Bảo hành -> Công nợ BẮT BUỘC ghi đè = 0', () => {
  // Giả lập tình huống bất thường: Số tiền thực thu trong file raw có ghi 500.000 đ
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Máy demo được gửi đi sửa chữa',
    'Loại hình sửa chữa': 'Bảo hành',
    'Loại linh kiện': 'Bảo hành',
    'Số tiền phải thu': 0,
    'Số tiền thực thu': 500000,
    'Giá bán lẻ đề nghị': 1400000
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Khách hàng'], 'TGDĐ');
  assert.strictEqual(res.items[0]['Loại hình sửa chữa'], 'Bảo hành');
  assert.strictEqual(res.items[0]['Loại linh kiện'], 'Bảo hành');
  // Nhờ bước hậu kiểm, Công nợ bị ghi đè bắt buộc = 0
  assert.strictEqual(res.items[0]['Công nợ'], 0);
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt'], 0);
  assert.strictEqual(res.items[0]['Xuất Bảo Hành'], 1);
  assert.strictEqual(res.items[0]['Xuất Sửa Chữa'], '');
});

test('Test 9: Loại linh kiện = Sửa chữa -> Xuất Sửa Chữa = 1, Xuất Bảo Hành = "" (trống)', () => {
  const row = createMockRow({
    'Loại linh kiện': 'Sửa chữa',
    'Loại hình đem đến sửa': 'Khách hàng đem đến sửa',
    'Số tiền phải thu': 600000,
    'Số tiền thực thu': 600000
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt'], 600000);
  assert.strictEqual(res.items[0]['Xuất Sửa Chữa'], 1);
  assert.strictEqual(res.items[0]['Xuất Bảo Hành'], '');
});

test('Test 10: Loại linh kiện = Bảo hành -> Xuất Bảo Hành = 1, Xuất Sửa Chữa = "" (trống)', () => {
  const row = createMockRow({
    'Loại linh kiện': 'Bảo hành',
    'Loại hình đem đến sửa': 'Khách hàng đem đến sửa',
    'Mã linh kiện': 'LK_TEST_BH',
    'Số tiền phải thu': 1850000,
    'Số tiền thực thu': 0
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt'], 0);
  assert.strictEqual(res.items[0]['Xuất Bảo Hành'], 1);
  assert.strictEqual(res.items[0]['Xuất Sửa Chữa'], '');
});

test('Test 11: TGDĐ + Loại linh kiện = Sửa chữa -> Xuất Sửa Chữa = 1, Xuất Bảo Hành = "" (trống)', () => {
  const row = createMockRow({
    'Loại linh kiện': 'Sửa chữa',
    'Loại hình đem đến sửa': 'Máy demo được gửi đi sửa chữa',
    'Số tiền phải thu': 750000,
    'Số tiền thực thu': 750000
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Công nợ'], 750000);
  assert.strictEqual(res.items[0]['Xuất Sửa Chữa'], 1);
  assert.strictEqual(res.items[0]['Xuất Bảo Hành'], '');
});

test('Test 12: TGDĐ + Loại linh kiện = Bảo hành -> Xuất Bảo Hành = 1, Xuất Sửa Chữa = "" (trống)', () => {
  const row = createMockRow({
    'Loại linh kiện': 'Bảo hành',
    'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
    'Số điện thoại người đem đến sửa': '+84 190****464',
    'Mã linh kiện': 'LK_TGDĐ_BH',
    'Số tiền phải thu': 0,
    'Số tiền thực thu': 0
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Công nợ'], 0);
  assert.strictEqual(res.items[0]['Xuất Bảo Hành'], 1);
  assert.strictEqual(res.items[0]['Xuất Sửa Chữa'], '');
});

test('Test 12b: Loại hình sửa chữa = Bảo hành + Sửa chữa VÀ Loại linh kiện = Sửa chữa -> Xuất Sửa Chữa = 1, Xuất Bảo Hành = ""', () => {
  const row = createMockRow({
    'Loại hình sửa chữa': 'Bảo hành + Sửa chữa',
    'Loại linh kiện': 'Sửa chữa',
    'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
    'Số điện thoại người đem đến sửa': '+84 190****464',
    'Số tiền phải thu': 1789000,
    'Số tiền thực thu': 1789000
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Đơn giá'], 1789000);
  assert.strictEqual(res.items[0]['Công nợ'], 1789000);
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt'], 0);
  assert.strictEqual(res.items[0]['Xuất Sửa Chữa'], 1);
  assert.strictEqual(res.items[0]['Xuất Bảo Hành'], '');
});

test('Test 12c: Loại hình sửa chữa = Bảo hành + Sửa chữa VÀ Loại linh kiện = Bảo hành -> Xuất Bảo Hành = 1, Xuất Sửa Chữa = ""', () => {
  const row = createMockRow({
    'Loại hình sửa chữa': 'Bảo hành + Sửa chữa',
    'Loại linh kiện': 'Bảo hành',
    'Loại hình đem đến sửa': 'Kênh chuỗi gửi sửa',
    'Số điện thoại người đem đến sửa': '+84 190****464',
    'Số tiền phải thu': 0,
    'Số tiền thực thu': 0
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Đơn giá'], 0);
  assert.strictEqual(res.items[0]['Công nợ'], 0);
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt'], 0);
  assert.strictEqual(res.items[0]['Xuất Bảo Hành'], 1);
  assert.strictEqual(res.items[0]['Xuất Sửa Chữa'], '');
});

test('Test 13a: Cả Mã linh kiện và Tên linh kiện đều trống -> SKIP (không lọc ra)', () => {
  const row = createMockRow({ 'Mã linh kiện': '', 'Tên linh kiện': '' });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.validRows, 0);
});

test('Test 13b: Có Mã linh kiện nhưng Tên linh kiện trống -> KEEP (vẫn lọc ra)', () => {
  const row = createMockRow({ 'Mã linh kiện': 'LK_TEST_01', 'Tên linh kiện': '' });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.validRows, 1);
  assert.strictEqual(res.items[0]['Mã vật tư linh kiện'], 'LK_TEST_01');
  assert.strictEqual(res.items[0]['Tên vật tư'], '');
});

test('Test 13c: Mã linh kiện trống nhưng có Tên linh kiện -> KEEP (vẫn lọc ra)', () => {
  const row = createMockRow({ 'Mã linh kiện': '', 'Tên linh kiện': 'Keo dán màn hình' });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.validRows, 1);
  assert.strictEqual(res.items[0]['Mã vật tư linh kiện'], '');
  assert.strictEqual(res.items[0]['Tên vật tư'], 'Keo dán màn hình');
});

test('Test 14: Thời gian lấy máy = 2026-09-14 14:19:03 -> report_date = 2026-09-14', () => {
  const row = createMockRow({ 'Thời gian lấy máy': '2026-09-14 14:19:03' });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Ngày báo cáo'], '2026-09-14');
});

test('Test 15: Không có linh kiện (cả mã và tên đều trống) -> SKIP (bỏ qua)', () => {
  const row = createMockRow({ 'Mã linh kiện': '', 'Tên linh kiện': '', 'Phương án giải quyết': 'Cài đặt phần mềm' });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.validRows, 0);
  assert.strictEqual(res.filteredBySolution, 1);
});

test('Test 15b: Có linh kiện nhưng Phương án giải quyết khác (clean without disassemble) -> VẪN ĐƯỢC LẤY (Phương án 1)', () => {
  const row = createMockRow({
    'Phương án giải quyết': 'clean (without disassembling the machine)',
    'Mã linh kiện': '4895889',
    'Tên linh kiện': 'Miếng dán hai mặt bảo vệ mặt sau MT317 BSTM-S30GD dùng cho dịch vụ hậu mãi.'
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.validRows, 1);
  assert.strictEqual(res.items[0]['Mã vật tư linh kiện'], '4895889');
  assert.strictEqual(res.items[0]['Phương án giải quyết'], 'clean (without disassembling the machine)');
});

test('Test 16: Thời gian lấy máy null -> SKIP (không lọc ra báo cáo và không xem là lỗi)', () => {
  const row = createMockRow({ 'Thời gian lấy máy': '' });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.validRows, 0);
  assert.strictEqual(res.warningRows, 0);
});

test('Test 17: Một số phiếu có nhiều linh kiện -> giữ tất cả các dòng', () => {
  const row1 = createMockRow({ 'Phiếu công tác sửa chữa': 'PHIEU_MULTI', 'Mã linh kiện': 'LK_01' });
  const row2 = createMockRow({ 'Phiếu công tác sửa chữa': 'PHIEU_MULTI', 'Mã linh kiện': 'LK_02' });
  const res = transformExcelRows([row1, row2], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.validRows, 2);
});

test('Test 18: Giá = 0 -> phải giữ giá trị 0', () => {
  const row = createMockRow({ 'Số tiền phải thu': 0, 'Số tiền thực thu': 0 });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Đơn giá'], 0);
});

test('Test 19: Giá blank/null -> unitPrice null, warning MISSING_UNIT_PRICE, không tự biến thành 0', () => {
  const row = createMockRow({ 'Số tiền phải thu': '', 'Số tiền thực thu': '' });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Đơn giá'], null);
  assert.strictEqual(res.items[0]['Công nợ'], null);
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt'], null);
});

test('Test 20: R4001003 upload file R4001008 -> REJECT', () => {
  const row = createMockRow({ 'Mã tổ chức': 'R4001008' });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.success, false);
});

test('Test 21: Doanh thu tiền mặt trước thuế = Tiền Mặt TM / 1.08 (làm tròn đến hàng đơn vị theo quy định thuế)', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Khách hàng đem đến sửa',
    'Số điện thoại người đem đến sửa': '+84 987654321',
    'Số tiền phải thu': '506000',
    'Số tiền thực thu': '506000',
    'Loại linh kiện': 'Sửa chữa'
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Khách hàng'], 'KL');
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt'], 506000);
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt trước thuế'], 468519);
  assert.strictEqual(res.items[0]['CN sau chiết khấu'], null);
  assert.strictEqual(res.items[0]['CN trước thuế'], null);
});

test('Test 22: CN sau chiết khấu = Công nợ * 0.96 & CN trước thuế = CN sau chiết khấu / 1.08 (làm tròn đến hàng đơn vị)', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Máy demo được gửi đi sửa chữa',
    'Số tiền phải thu': '286000',
    'Số tiền thực thu': '286000',
    'Loại linh kiện': 'Sửa chữa'
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Khách hàng'], 'TGDĐ');
  assert.strictEqual(res.items[0]['Công nợ'], 286000);
  assert.strictEqual(res.items[0]['CN sau chiết khấu'], 274560);
  assert.strictEqual(res.items[0]['CN trước thuế'], 254222);
  assert.strictEqual(res.items[0]['Doanh thu tiền mặt trước thuế'], null);
});

test('Test 23: TGDĐ bảo hành (Công nợ = 0) -> CN sau chiết khấu = 0, CN trước thuế = 0', () => {
  const row = createMockRow({
    'Loại hình đem đến sửa': 'Máy demo được gửi đi sửa chữa',
    'Loại hình sửa chữa': 'Bảo hành',
    'Loại linh kiện': 'Bảo hành',
    'Số tiền phải thu': '0',
    'Số tiền thực thu': '0'
  });
  const res = transformExcelRows([row], 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
  assert.strictEqual(res.items[0]['Khách hàng'], 'TGDĐ');
  assert.strictEqual(res.items[0]['Công nợ'], 0);
  assert.strictEqual(res.items[0]['CN sau chiết khấu'], 0);
  assert.strictEqual(res.items[0]['CN trước thuế'], 0);
});

test('TEST THỰC TẾ TRÊN FILE EXCEL MẪU D:\\VN0000182_...xlsx (Hoặc Fixture CI)', () => {
  const filePath = path.resolve('D:\\VN0000182_Bảng báo cáo truy vấn chi tiết phiếu công tác sửa chữa_2026-09-13 11_51_10 (1).xlsx');
  const fixturePath = path.resolve('tests/fixtures/sample_report.xlsx');

  if (!fs.existsSync(filePath)) {
    const workbook = XLSX.readFile(fixturePath);
    const sheet = workbook.Sheets['Sheet1'];
    const rows: RawExcelRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const res = transformExcelRows(rows, 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.inputRows, 4);
    assert.strictEqual(res.validRows, 3);
    console.log('-> CI Portable Fixture: Hoàn thành kiểm thử độc lập thành công!');
    return;
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets['Sheet1'];
  const rows: RawExcelRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`-> File thật: Đọc được ${rows.length} dòng raw từ Sheet1`);
  const res = transformExcelRows(rows, 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.inputRows, 994);
  assert.strictEqual(res.filteredBySolution, 485);
  assert.strictEqual(res.warningRows, 0);
  // Có linh kiện + lấy máy hợp lệ: 487 dòng
  assert.strictEqual(res.validRows, 487);
  assert.strictEqual(res.tgddRows, 326);
  assert.strictEqual(res.klRows, 161);

  // Đối chiếu tài chính:
  // Phương án 2: Đơn giá lấy từ Giá bán lẻ đề nghị -> Tổng đơn giá niêm yết = 427,466,000 VNĐ
  assert.strictEqual(res.totalRevenue, 427466000);
  // Công nợ TGDĐ (Số tiền thực thu) = 194,912,100 VNĐ
  assert.strictEqual(res.totalDebt, 194912100);
  // Tiền mặt KL (Số tiền thực thu) = 112,330,400 VNĐ
  assert.strictEqual(res.totalCash, 112330400);
  // Phân loại xuất kho theo Loại linh kiện:
  // Sửa chữa: 414 dòng, Bảo hành: 73 dòng
  assert.strictEqual(res.totalWarrantyExport, 73);
  assert.strictEqual(res.totalRepairExport, 414);

  // Phiếu MWR4001003260829000011 (+84 109*****464 -> TGDĐ / CN)
  const items011 = res.items.filter(i => i['Số phiếu sửa chữa'] === 'MWR4001003260829000011');
  assert.strictEqual(items011.length, 2, 'Phiếu MWR4001003260829000011 phải có đúng 2 dòng linh kiện');
  for (const it of items011) {
    assert.strictEqual(it['Khách hàng'], 'TGDĐ');
    assert.strictEqual(it['Phương thức thanh toán'], 'CN');
  }
  const it011SC = items011.find(i => i['Mã vật tư linh kiện'] === '5436808');
  assert.ok(it011SC);
  assert.strictEqual(it011SC['Đơn giá'], 173000);
  assert.strictEqual(it011SC['Công nợ'], 173000);
  assert.strictEqual(it011SC['Doanh thu tiền mặt'], 0);
  assert.strictEqual(it011SC['Xuất Sửa Chữa'], 1);
  assert.strictEqual(it011SC['Xuất Bảo Hành'], '');

  const it011BH = items011.find(i => i['Mã vật tư linh kiện'] === '5436830');
  assert.ok(it011BH);
  assert.strictEqual(it011BH['Đơn giá'], 645000, 'Màn hình Y04 lấy đơn giá từ Giá bán lẻ đề nghị 645.000 VNĐ');
  assert.strictEqual(it011BH['Công nợ'], 0);
  assert.strictEqual(it011BH['Doanh thu tiền mặt'], 0);
  assert.strictEqual(it011BH['Xuất Bảo Hành'], 1);
  assert.strictEqual(it011BH['Xuất Sửa Chữa'], '');

  // Phiếu MWR4001003260826000004 (Main V60 Lite Bảo hành -> Đơn giá = 4.443.000)
  const it004 = res.items.find(i => i['Số phiếu sửa chữa'] === 'MWR4001003260826000004');
  assert.ok(it004);
  assert.strictEqual(it004['Đơn giá'], 4443000);
  assert.strictEqual(it004['Công nợ'], 0);
  assert.strictEqual(it004['Doanh thu tiền mặt'], 0);
  assert.strictEqual(it004['Xuất Bảo Hành'], 1);
  assert.strictEqual(it004['Xuất Sửa Chữa'], '');

  // Phiếu MWR4001003260829000016 (Main Y04 Bảo hành -> Đơn giá = 1.401.000)
  const it016 = res.items.find(i => i['Số phiếu sửa chữa'] === 'MWR4001003260829000016');
  assert.ok(it016);
  assert.strictEqual(it016['Đơn giá'], 1401000);
  assert.strictEqual(it016['Công nợ'], 0);
  assert.strictEqual(it016['Doanh thu tiền mặt'], 0);
  assert.strictEqual(it016['Xuất Bảo Hành'], 1);
  assert.strictEqual(it016['Xuất Sửa Chữa'], '');

  // Phiếu MWR4001003260822000010 (Ngày 2026-08-22, Loại linh kiện = 'Bảo hành' -> Xuất BH = 1, Xuất SC = '')
  const itemTarget = res.items.find(i => i['Số phiếu sửa chữa'] === 'MWR4001003260822000010');
  assert.ok(itemTarget, 'Phiếu MWR4001003260822000010 phải có trong báo cáo');
  assert.strictEqual(itemTarget['Ngày báo cáo'], '2026-08-22');
  assert.strictEqual(itemTarget['Mã vật tư linh kiện'], '4895889');
  assert.strictEqual(itemTarget['Khách hàng'], 'TGDĐ');
  assert.strictEqual(itemTarget['Phương thức thanh toán'], 'CN');
  assert.strictEqual(itemTarget['Đơn giá'], 0);
  assert.strictEqual(itemTarget['Công nợ'], 0);
  assert.strictEqual(itemTarget['Xuất Bảo Hành'], 1);
  assert.strictEqual(itemTarget['Xuất Sửa Chữa'], '');

  // Phiếu MWR4001003260907000003 (Loại linh kiện = 'Sửa chữa' -> Xuất SC = 1, Xuất BH = '')
  const itemRow9 = res.items.find(i => i['Số phiếu sửa chữa'] === 'MWR4001003260907000003');
  assert.ok(itemRow9);
  assert.strictEqual(itemRow9['Đơn giá'], 1850000);
  assert.strictEqual(itemRow9['Doanh thu tiền mặt'], 0);
  assert.strictEqual(itemRow9['Công nợ'], 0);
  assert.strictEqual(itemRow9['Xuất Bảo Hành'], '');
  assert.strictEqual(itemRow9['Xuất Sửa Chữa'], 1);

  // Phiếu MWR4001003260907000007 (Loại linh kiện = 'Bảo hành' -> Xuất BH = 1, Xuất SC = '')
  const itemRow8 = res.items.find(i => i['Số phiếu sửa chữa'] === 'MWR4001003260907000007');
  assert.ok(itemRow8);
  assert.strictEqual(itemRow8['Đơn giá'], 4443000);
  assert.strictEqual(itemRow8['Công nợ'], 0);
  assert.strictEqual(itemRow8['Xuất Bảo Hành'], 1);
  assert.strictEqual(itemRow8['Xuất Sửa Chữa'], '');

  // Phiếu MWR4001003260907000004 (Loại linh kiện = 'Sửa chữa' -> Xuất SC = 1, Xuất BH = '')
  const itemRow7 = res.items.find(i => i['Số phiếu sửa chữa'] === 'MWR4001003260907000004');
  assert.ok(itemRow7);
  assert.strictEqual(itemRow7['Đơn giá'], 1125000);
  assert.strictEqual(itemRow7['Công nợ'], 0);
  assert.strictEqual(itemRow7['Xuất Bảo Hành'], '');
  assert.strictEqual(itemRow7['Xuất Sửa Chữa'], 1);

  console.log('-> Toàn bộ Test Case khớp chính xác 100%!');
});

test('Test 24: Đọc file Excel có định dạng ZIP64 không bị lỗi Failed to allocate memory và phòng chống Zip Bomb', () => {
  const { readExcelBuffer, fixZip64Buffer, MAX_UNCOMPRESSED_SIZE } = require('../src/lib/excel-parser');
  const filePath = path.resolve('VN0000182_Bảng báo cáo truy vấn chi tiết phiếu công tác sửa chữa_2026-09-15 16_50_52.xlsx');
  if (fs.existsSync(filePath)) {
    const rawBuf = fs.readFileSync(filePath);
    const wb = readExcelBuffer(rawBuf);
    assert.strictEqual(wb.SheetNames[0], 'Sheet1');
    const rows = XLSX.utils.sheet_to_json<RawExcelRow>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    assert.strictEqual(rows.length, 106);
    const res = transformExcelRows(rows, 'R4001003', 'Trung tâm CSKH vivo Cần Thơ');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.inputRows, 106);
    assert.strictEqual(res.validRows, 0);
    assert.strictEqual(res.filteredBySolution, 100);
    assert.strictEqual(res.warningRows, 0);
    console.log(`-> File ZIP64 2026-09-15: Đọc thành công ${res.inputRows} dòng, ${res.validRows} dòng hợp lệ!`);
  }

  // Kiểm tra cơ chế phòng chống Zip Bomb (tập tin giải nén vượt quá MAX_UNCOMPRESSED_SIZE)
  assert.strictEqual(MAX_UNCOMPRESSED_SIZE, 150 * 1024 * 1024);
  const fakeBomb = Buffer.alloc(120);
  fakeBomb.writeUInt32LE(0x06054b50, 120 - 22); // EOCD signature
  fakeBomb.writeUInt16LE(1, 120 - 12); // 1 entry
  fakeBomb.writeUInt32LE(0, 120 - 6);  // cdOffset = 0
  fakeBomb.writeUInt32LE(0x02014b50, 0); // CD signature
  fakeBomb.writeUInt32LE(0xFFFFFFFF, 20); // compressed = 0xFFFFFFFF
  fakeBomb.writeUInt32LE(0xFFFFFFFF, 24); // uncompressed = 0xFFFFFFFF
  fakeBomb.writeUInt16LE(0, 28); // fnLen = 0
  fakeBomb.writeUInt16LE(20, 30); // extraLen = 20
  fakeBomb.writeUInt16LE(0, 32); // commentLen = 0
  // Extra field tag 0x0001, size 16
  fakeBomb.writeUInt16LE(0x0001, 46);
  fakeBomb.writeUInt16LE(16, 48);
  fakeBomb.writeBigUInt64LE(BigInt(200 * 1024 * 1024), 50); // 200MB uncompressed > 150MB limit
  fakeBomb.writeBigUInt64LE(BigInt(1000), 58);

  assert.throws(() => {
    fixZip64Buffer(fakeBomb);
  }, /Kích thước tập tin giải nén vượt quá giới hạn an toàn/);
});
