import ExcelJS from 'exceljs';
import { ProcessedReportItem } from './business-rules';

export interface TanTamExportResult {
  buffer: Buffer;
  filename: string;
  totalRecords: number;
}

export interface FullExportResult {
  buffer: Buffer;
  filename: string;
  totalRecords: number;
}

/**
 * Format YYYY-MM-DD or date string to D-M-YYYY (e.g. 15-9-2026)
 */
export function formatToDMY(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const y = parts[0];
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      return `${d}-${m}-${y}`;
    } else {
      // DD-MM-YYYY
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parts[2];
      return `${d}-${m}-${y}`;
    }
  }
  return dateStr;
}

/**
 * Format date for cell display: D/M/YYYY (e.g. 15/9/2026)
 */
function formatCellDate(dateVal: any): string {
  if (!dateVal) return '';
  const str = String(dateVal).trim();
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    return `${parseInt(dmyMatch[1], 10)}/${parseInt(dmyMatch[2], 10)}/${dmyMatch[3]}`;
  }
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    return `${parseInt(ymdMatch[3], 10)}/${parseInt(ymdMatch[2], 10)}/${ymdMatch[1]}`;
  }
  return str.split(' ')[0];
}

/**
 * Xuất file Excel "Báo Cáo Công Nợ Tận Tâm" chuẩn xác theo file mẫu:
 * TTBH CẦN THƠ - 15-9-2026 - Báo cáo Công Nợ Tận Tâm.xlsx
 */
export async function generateTanTamDebtReportExcel(
  items: ProcessedReportItem[],
  centerName: string,
  reportDate: string
): Promise<TanTamExportResult> {
  // 1. Lọc các dòng phát sinh Công nợ của TGDĐ (Tận Tâm)
  const debtItems = items.filter(item => {
    const isTgdd = item['Khách hàng'] === 'TGDĐ';
    const debt = Number(item['Công nợ'] || 0);
    return isTgdd && debt > 0;
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1', {
    views: [{ showGridLines: true }]
  });

  // Cấu hình độ rộng cột chính xác như file mẫu
  sheet.columns = [
    { key: 'pickupDate', width: 14 },
    { key: 'ticketId', width: 29 },
    { key: 'partCode', width: 12 },
    { key: 'partName', width: 65 },
    { key: 'exportPk', width: 10 },
    { key: 'exportSc', width: 10 },
    { key: 'unitPrice', width: 15 },
    { key: 'debt', width: 15 },
    { key: 'afterDiscount', width: 18 },
    { key: 'beforeTax', width: 17 },
    { key: 'jobcard', width: 23 },
    { key: 'notes', width: 15 }
  ];

  const greenFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF92D050' }
  };

  const blueFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB6C7EA' }
  };

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
  };

  const headerBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFA0A0A0' } },
    left: { style: 'thin', color: { argb: 'FFA0A0A0' } },
    bottom: { style: 'thin', color: { argb: 'FFA0A0A0' } },
    right: { style: 'thin', color: { argb: 'FFA0A0A0' } }
  };

  // Dòng 1: Header
  const headerRow = sheet.getRow(1);
  headerRow.height = 51;
  headerRow.values = [
    'Thời gian lấy máy',
    'Phiếu công tác sửa chữa',
    'Mã linh kiện',
    'Tên linh kiện',
    'Xuất phụ kiện',
    'Xuất Sửa Chữa',
    'Đơn giá',
    'Công nợ',
    'CN sau chiết khấu',
    'CN trước thuế',
    'Jobcard',
    'Ghi chú'
  ];

  for (let c = 1; c <= 12; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true, name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = (c >= 8 && c <= 10) ? blueFill : greenFill;
    cell.border = headerBorder;
  }

  // Dòng 2: Subtotals & Sums chỉ đến những dòng có dữ liệu thực tế
  const endRow = debtItems.length > 0 ? 2 + debtItems.length : 3;
  const subtotalRow = sheet.getRow(2);
  subtotalRow.height = 20;

  const countRecords = debtItems.length;
  const countPk = debtItems.filter(i => i['Xuất phụ kiện'] === 1 || i['Xuất phụ kiện'] === '1').length;
  const countSc = debtItems.filter(i => i['Xuất Sửa Chữa'] === 1 || i['Xuất Sửa Chữa'] === '1').length;
  const sumDebt = debtItems.reduce((acc, i) => acc + Number(i['Công nợ'] || 0), 0);
  const sumAfterDiscount = debtItems.reduce((acc, i) => acc + Number(i['CN sau chiết khấu'] || Math.round(Number(i['Công nợ'] || 0) * 0.96)), 0);
  const sumBeforeTax = debtItems.reduce((acc, i) => acc + Number(i['CN trước thuế'] || (Number(i['Công nợ'] || 0) * 0.96) / 1.08), 0);
  const countJobcard = debtItems.filter(i => i['Jobcard'] && String(i['Jobcard']).trim()).length;

  subtotalRow.getCell(1).value = '';
  subtotalRow.getCell(2).value = { formula: `SUBTOTAL(3,B3:B${endRow})`, result: countRecords };
  subtotalRow.getCell(3).value = { formula: `SUBTOTAL(3,C3:C${endRow})`, result: countRecords };
  subtotalRow.getCell(4).value = { formula: `SUBTOTAL(3,D3:D${endRow})`, result: countRecords };
  subtotalRow.getCell(5).value = { formula: `SUBTOTAL(2,E3:E${endRow})`, result: countPk };
  subtotalRow.getCell(6).value = { formula: `SUBTOTAL(2,F3:F${endRow})`, result: countSc };
  subtotalRow.getCell(7).value = '';
  subtotalRow.getCell(8).value = { formula: `SUM(H3:H${endRow})`, result: sumDebt };
  subtotalRow.getCell(9).value = { formula: `SUM(I3:I${endRow})`, result: sumAfterDiscount };
  subtotalRow.getCell(10).value = { formula: `SUM(J3:J${endRow})`, result: sumBeforeTax };
  subtotalRow.getCell(11).value = { formula: `SUBTOTAL(3,K3:K${endRow})`, result: countJobcard };
  subtotalRow.getCell(12).value = '';

  for (let c = 1; c <= 12; c++) {
    const cell = subtotalRow.getCell(c);
    cell.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
    cell.border = thinBorder;
    if (c >= 8 && c <= 10) {
      cell.numFmt = '#,##0';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  }

  // Dòng 3 đến endRow: Dữ liệu thực tế
  for (let idx = 0; idx < debtItems.length; idx++) {
    const item = debtItems[idx];
    const r = 3 + idx;
    const row = sheet.getRow(r);
    row.height = 18;

    const dateStr = formatCellDate(item['Thời gian lấy máy'] || item['Ngày báo cáo'] || reportDate);
    const unitPrice = item['Đơn giá'] !== null && item['Đơn giá'] !== undefined ? Number(item['Đơn giá']) : '';
    const debtVal = Number(item['Công nợ'] || 0);

    row.getCell(1).value = dateStr;
    row.getCell(2).value = item['Số phiếu sửa chữa'] || '';
    row.getCell(3).value = item['Mã vật tư linh kiện'] || '';
    row.getCell(4).value = item['Tên vật tư'] || '';
    row.getCell(5).value = item['Xuất phụ kiện'] === 1 || item['Xuất phụ kiện'] === '1' ? 1 : '';
    row.getCell(6).value = item['Xuất Sửa Chữa'] === 1 || item['Xuất Sửa Chữa'] === '1' ? 1 : '';
    row.getCell(7).value = unitPrice;
    row.getCell(8).value = debtVal;
    row.getCell(9).value = { formula: `H${r}*0.96`, result: Math.round(debtVal * 0.96) };
    row.getCell(10).value = { formula: `I${r}/1.08`, result: (debtVal * 0.96) / 1.08 };
    row.getCell(11).value = item['Jobcard'] || '';
    row.getCell(12).value = '';

    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: 'Calibri', size: 10 };
      if (c === 1 || c === 2 || c === 3 || c === 5 || c === 6 || c === 11) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (c === 4 || c === 12) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else {
        cell.numFmt = '#,##0';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    }
  }

  // Tên file theo công thức: "Tên trung tâm bảo hành + ngày lọc báo cáo + "Báo cáo Công Nợ Tận Tâm"
  // Chuẩn hóa tên trung tâm ví dụ: "Trung tâm CSKH vivo Cần Thơ" -> "TTBH CẦN THƠ"
  let centerClean = centerName.toUpperCase().replace(/^TRUNG TÂM CSKH VIVO\s*/i, 'TTBH ').trim();
  if (!centerClean.startsWith('TTBH')) {
    centerClean = `TTBH ${centerClean}`;
  }
  const dateDMY = formatToDMY(reportDate);
  const filename = `${centerClean} - ${dateDMY} - Báo cáo Công Nợ Tận Tâm.xlsx`;

  const buf = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buf),
    filename,
    totalRecords: debtItems.length
  };
}

/**
 * Xuất file Excel Đầy Đủ bao gồm tất cả các thông tin được show ra trên bảng
 */
export async function generateFullReportExcel(
  items: ProcessedReportItem[],
  centerCode: string,
  centerName: string,
  reportDate: string
): Promise<FullExportResult> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('BaoCaoChiTiet', {
    views: [{ showGridLines: true }]
  });

  sheet.columns = [
    { key: 'stt', width: 6 },
    { key: 'pickupTime', width: 20 },
    { key: 'ticketId', width: 28 },
    { key: 'partCode', width: 14 },
    { key: 'partName', width: 50 },
    { key: 'exportBh', width: 10 },
    { key: 'exportPk', width: 10 },
    { key: 'exportSc', width: 10 },
    { key: 'unitPrice', width: 15 },
    { key: 'cash', width: 15 },
    { key: 'cashBeforeTax', width: 17 },
    { key: 'debt', width: 15 },
    { key: 'debtAfterDiscount', width: 17 },
    { key: 'debtBeforeTax', width: 17 },
    { key: 'customer', width: 10 },
    { key: 'paymentMethod', width: 10 },
    { key: 'jobcard', width: 22 },
    { key: 'bringType', width: 26 },
    { key: 'solution', width: 35 },
    { key: 'reportDate', width: 14 },
    { key: 'centerCode', width: 12 },
    { key: 'centerName', width: 28 }
  ];

  // Header
  const headerRow = sheet.getRow(1);
  headerRow.height = 36;
  headerRow.values = [
    'STT',
    'Thời Gian Lấy Máy',
    'Số Phiếu Sửa Chữa',
    'Mã Linh Kiện',
    'Tên Vật Tư Linh Kiện',
    'Xuất BH',
    'Xuất PK',
    'Xuất SC',
    'Đơn Giá',
    'Doanh Thu Tiền Mặt',
    'TM Trước Thuế',
    'Công Nợ',
    'CN Sau Chiết Khấu',
    'CN Trước Thuế',
    'Khách Hàng',
    'PTTT',
    'Jobcard',
    'Loại Hình Đem Đến Sửa',
    'Phương Án Giải Quyết',
    'Ngày Báo Cáo',
    'Mã TTBH',
    'Tên TTBH'
  ];

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' } // Deep Blue
  };

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  for (let c = 1; c <= 22; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  }

  // Data rows
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const r = i + 2;
    const row = sheet.getRow(r);
    row.height = 19;

    const isTgdd = it['Khách hàng'] === 'TGDĐ';

    row.values = [
      i + 1,
      it['Thời gian lấy máy'] || '',
      it['Số phiếu sửa chữa'] || '',
      it['Mã vật tư linh kiện'] || '',
      it['Tên vật tư'] || '',
      it['Xuất Bảo Hành'] === 1 || it['Xuất Bảo Hành'] === '1' ? 1 : '',
      it['Xuất phụ kiện'] === 1 || it['Xuất phụ kiện'] === '1' ? 1 : '',
      it['Xuất Sửa Chữa'] === 1 || it['Xuất Sửa Chữa'] === '1' ? 1 : '',
      it['Đơn giá'] !== null ? Math.round(Number(it['Đơn giá'])) : '',
      isTgdd ? 0 : (it['Doanh thu tiền mặt'] !== null ? Math.round(Number(it['Doanh thu tiền mặt'])) : ''),
      isTgdd ? 0 : (it['Doanh thu tiền mặt trước thuế'] !== null ? Math.round(Number(it['Doanh thu tiền mặt trước thuế'])) : ''),
      isTgdd ? Math.round(Number(it['Công nợ'] || 0)) : 0,
      isTgdd ? Math.round(Number(it['CN sau chiết khấu'] || 0)) : '-',
      isTgdd ? Math.round(Number(it['CN trước thuế'] || 0)) : '-',
      it['Khách hàng'],
      it['Phương thức thanh toán'],
      it['Jobcard'] || '',
      it['Loại hình đem đến sửa'] || '',
      it['Phương án giải quyết'] || '',
      it['Ngày báo cáo'],
      centerCode,
      centerName
    ];

    for (let c = 1; c <= 22; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: 'Calibri', size: 10 };

      if ([1, 2, 3, 4, 6, 7, 8, 15, 16, 17, 20, 21].includes(c)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if ([5, 18, 19, 22].includes(c)) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else {
        cell.numFmt = '#,##0';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    }
  }

  // Dòng TỔNG CỘNG ở cuối bảng
  const totalRowIdx = items.length + 2;
  const totalRow = sheet.getRow(totalRowIdx);
  totalRow.height = 24;

  const totalBh = items.filter(i => i['Xuất Bảo Hành'] === 1 || i['Xuất Bảo Hành'] === '1').length;
  const totalPk = items.filter(i => i['Xuất phụ kiện'] === 1 || i['Xuất phụ kiện'] === '1').length;
  const totalSc = items.filter(i => i['Xuất Sửa Chữa'] === 1 || i['Xuất Sửa Chữa'] === '1').length;
  const totalUnitPrice = items.reduce((acc, i) => acc + (Number(i['Đơn giá']) || 0), 0);
  const totalCash = items.reduce((acc, i) => acc + (i['Khách hàng'] !== 'TGDĐ' ? (Number(i['Doanh thu tiền mặt']) || 0) : 0), 0);
  const totalCashBeforeTax = items.reduce((acc, i) => acc + (i['Khách hàng'] !== 'TGDĐ' ? (Number(i['Doanh thu tiền mặt trước thuế']) || 0) : 0), 0);
  const totalDebt = items.reduce((acc, i) => acc + (i['Khách hàng'] === 'TGDĐ' ? (Number(i['Công nợ']) || 0) : 0), 0);
  const totalDebtAfterDiscount = items.reduce((acc, i) => acc + (i['Khách hàng'] === 'TGDĐ' ? (Number(i['CN sau chiết khấu']) || 0) : 0), 0);
  const totalDebtBeforeTax = items.reduce((acc, i) => acc + (i['Khách hàng'] === 'TGDĐ' ? (Number(i['CN trước thuế']) || 0) : 0), 0);

  const lastDataRow = items.length + 1;
  const hasData = items.length > 0;

  totalRow.getCell(1).value = 'TỔNG CỘNG';
  totalRow.getCell(6).value = hasData ? { formula: `SUM(F2:F${lastDataRow})`, result: totalBh } : 0;
  totalRow.getCell(7).value = hasData ? { formula: `SUM(G2:G${lastDataRow})`, result: totalPk } : 0;
  totalRow.getCell(8).value = hasData ? { formula: `SUM(H2:H${lastDataRow})`, result: totalSc } : 0;
  totalRow.getCell(9).value = hasData ? { formula: `SUM(I2:I${lastDataRow})`, result: totalUnitPrice } : 0;
  totalRow.getCell(10).value = hasData ? { formula: `SUM(J2:J${lastDataRow})`, result: totalCash } : 0;
  totalRow.getCell(11).value = hasData ? { formula: `SUM(K2:K${lastDataRow})`, result: totalCashBeforeTax } : 0;
  totalRow.getCell(12).value = hasData ? { formula: `SUM(L2:L${lastDataRow})`, result: totalDebt } : 0;
  totalRow.getCell(13).value = hasData ? { formula: `SUM(M2:M${lastDataRow})`, result: totalDebtAfterDiscount } : 0;
  totalRow.getCell(14).value = hasData ? { formula: `SUM(N2:N${lastDataRow})`, result: totalDebtBeforeTax } : 0;

  const totalFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' } // slate-100
  };

  for (let c = 1; c <= 22; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = totalFill;
    cell.font = { bold: true, name: 'Calibri', size: 10 };
    cell.border = thinBorder;
    if (c === 1) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else if (c >= 6 && c <= 8) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else if (c >= 9 && c <= 14) {
      cell.numFmt = '#,##0';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    }
  }

  const filename = reportDate === 'ALL'
    ? `BaoCao_${centerCode}_TatCaCacNgay.xlsx`
    : `BaoCao_${centerCode}_${reportDate}.xlsx`;

  const buf = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buf),
    filename,
    totalRecords: items.length
  };
}
