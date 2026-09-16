export interface RawExcelRow {
  [key: string]: any;
}

export interface ProcessedReportItem {
  'Số phiếu sửa chữa': string;
  'Mã vật tư linh kiện': string;
  'Tên vật tư': string;
  'Đơn giá': number | null;
  'Doanh thu tiền mặt': number | null;
  'Doanh thu tiền mặt trước thuế'?: number | null;
  'Công nợ': number | null;
  'CN sau chiết khấu'?: number | null;
  'CN trước thuế'?: number | null;
  'Khách hàng': 'TGDĐ' | 'KL';
  'Phương thức thanh toán': 'CN' | 'TM';
  'Jobcard'?: string;
  'Số vận đơn nhanh (nhận)'?: string;
  'Xuất Bảo Hành': number | string;
  'Xuất phụ kiện'?: number | string;
  'Xuất Sửa Chữa': number | string;
  'Thời gian lấy máy': string;
  'Ngày báo cáo': string;
  'Mã TTBH': string;
  'Tên TTBH': string;
  'Loại hình đem đến sửa': string;
  'Loại hình sửa chữa': string;
  'Loại linh kiện'?: string;
  'Phương án giải quyết': string;
  'Upload ID'?: string;
  'Thời gian import'?: string;
  'Source Row Number'?: number;
}

export interface SolutionStat {
  solution: string;
  ticketCount: number;
  rowCount: number;
  validRowCount: number;
}

export interface TransformResult {
  success: boolean;
  error?: string;
  center?: {
    code: string;
    name: string;
  };
  inputRows: number;
  filteredBySolution: number;
  validRows: number;
  warningRows: number;
  tgddRows: number;
  klRows: number;
  totalCash: number;
  totalDebt: number;
  totalRevenue: number;
  totalWarrantyExport: number;
  totalRepairExport: number;
  availableReportDates: string[];
  latestReportDate: string;
  items: ProcessedReportItem[];
  warnings: string[];
  solutionStats?: SolutionStat[];
}

export function normalizeText(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .trim()
    .replace(/^\uFEFF/, '') // Remove BOM
    .normalize('NFC');
}

const RAW_ALLOWED_SOLUTIONS = [
  'Thay thế linh kiện và phụ kiện',
  'Thay thế phụ kiện',
  'Clean (disassemble the machine)'
];

export const ALLOWED_SOLUTIONS = new Set(
  RAW_ALLOWED_SOLUTIONS.map(s => normalizeText(s))
);

export const REQUIRED_COLUMNS = [
  'Mã tổ chức',
  'Phiếu công tác sửa chữa',
  'Loại hình đem đến sửa',
  'Số điện thoại người đem đến sửa',
  'Loại hình sửa chữa',
  'Phương án giải quyết',
  'Loại linh kiện',
  'Mã linh kiện',
  'Tên linh kiện',
  'Số tiền phải thu',
  'Số tiền thực thu',
  'Thời gian lấy máy'
];

export function findHeaderKey(allKeys: Iterable<string>, target: string): string | null {
  const normalizedTarget = normalizeText(target).toLowerCase();
  for (const key of allKeys) {
    if (normalizeText(key).toLowerCase() === normalizedTarget) {
      return key;
    }
  }
  return null;
}

export function getAllRowKeys(rows: RawExcelRow[]): Set<string> {
  const keys = new Set<string>();
  const scanLimit = Math.min(rows.length, 50);
  for (let i = 0; i < scanLimit; i++) {
    for (const k of Object.keys(rows[i])) {
      keys.add(k);
    }
  }
  return keys;
}

export function validateHeaders(rows: RawExcelRow[]): { valid: boolean; missingColumn?: string; columnMap: Record<string, string> } {
  const allKeys = getAllRowKeys(rows);
  const columnMap: Record<string, string> = {};
  for (const col of REQUIRED_COLUMNS) {
    const actualKey = findHeaderKey(allKeys, col);
    if (!actualKey) {
      return { valid: false, missingColumn: col, columnMap: {} };
    }
    columnMap[col] = actualKey;
  }
  return { valid: true, columnMap };
}

export function parseMoneyPreserveNull(val: any): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === '') return null;
  const num = typeof val === 'number' ? val : parseFloat(s.replace(/[^0-9.-]+/g, ''));
  if (isNaN(num)) return null;
  return num;
}

export function transformExcelRows(
  rows: RawExcelRow[],
  expectedCenterCode: string,
  expectedCenterName: string,
  jobcardMap?: Map<string, string>
): TransformResult {
  const inputRows = rows.length;
  if (inputRows === 0) {
    return {
      success: false,
      error: 'File Excel không có dữ liệu.',
      inputRows: 0,
      filteredBySolution: 0,
      validRows: 0,
      warningRows: 0,
      tgddRows: 0,
      klRows: 0,
      totalCash: 0,
      totalDebt: 0,
      totalRevenue: 0,
      totalWarrantyExport: 0,
      totalRepairExport: 0,
      availableReportDates: [],
      latestReportDate: '',
      items: [],
      warnings: ['File Excel rỗng']
    };
  }

  // 1. Validate và map tên cột
  const headerValidation = validateHeaders(rows);
  if (!headerValidation.valid) {
    return {
      success: false,
      error: `Không tìm thấy cột: ${headerValidation.missingColumn}`,
      inputRows,
      filteredBySolution: 0,
      validRows: 0,
      warningRows: 0,
      tgddRows: 0,
      klRows: 0,
      totalCash: 0,
      totalDebt: 0,
      totalRevenue: 0,
      totalWarrantyExport: 0,
      totalRepairExport: 0,
      availableReportDates: [],
      latestReportDate: '',
      items: [],
      warnings: [`Thiếu cột bắt buộc: ${headerValidation.missingColumn}`]
    };
  }

  const { columnMap } = headerValidation;
  const colToChuc = columnMap['Mã tổ chức'];
  const colPhieu = columnMap['Phiếu công tác sửa chữa'];
  const colLoaiHinh = columnMap['Loại hình đem đến sửa'];
  const colPhone = columnMap['Số điện thoại người đem đến sửa'];
  const colLoaiSc = columnMap['Loại hình sửa chữa'];
  const colPhuongAn = columnMap['Phương án giải quyết'];
  const colLoaiLk = columnMap['Loại linh kiện'];
  const colMaLk = columnMap['Mã linh kiện'];
  const colTenLk = columnMap['Tên linh kiện'];
  const colPhaiThu = columnMap['Số tiền phải thu'];
  const colThucThu = columnMap['Số tiền thực thu'];
  const colTgLay = columnMap['Thời gian lấy máy'];

  // Cột Giá bán lẻ đề nghị (Phương án 2: Ưu tiên lấy Đơn giá linh kiện)
  const allRowKeys = getAllRowKeys(rows);
  const colGiaBanLe = findHeaderKey(allRowKeys, 'Giá bán lẻ đề nghị');
  const colVanDonNhan = findHeaderKey(allRowKeys, 'Số vận đơn nhanh (nhận)');

  // 2. Validate Mã tổ chức: phải đồng nhất và trùng với expectedCenterCode
  const detectedCenters = new Set<string>();
  for (const row of rows) {
    const rawCode = normalizeText(row[colToChuc]);
    if (rawCode) {
      detectedCenters.add(rawCode);
    }
  }

  if (detectedCenters.size === 0) {
    return {
      success: false,
      error: 'Không tìm thấy Mã tổ chức trong file.',
      inputRows,
      filteredBySolution: 0,
      validRows: 0,
      warningRows: 0,
      tgddRows: 0,
      klRows: 0,
      totalCash: 0,
      totalDebt: 0,
      totalRevenue: 0,
      totalWarrantyExport: 0,
      totalRepairExport: 0,
      availableReportDates: [],
      latestReportDate: '',
      items: [],
      warnings: ['File không chứa Mã tổ chức hợp lệ.']
    };
  }

  if (detectedCenters.size > 1) {
    return {
      success: false,
      error: `File Excel chứa nhiều Mã tổ chức khác nhau (${Array.from(detectedCenters).join(', ')}). Vui lòng tách riêng từng TTBH.`,
      inputRows,
      filteredBySolution: 0,
      validRows: 0,
      warningRows: 0,
      tgddRows: 0,
      klRows: 0,
      totalCash: 0,
      totalDebt: 0,
      totalRevenue: 0,
      totalWarrantyExport: 0,
      totalRepairExport: 0,
      availableReportDates: [],
      latestReportDate: '',
      items: [],
      warnings: ['MULTIPLE_SERVICE_CENTERS']
    };
  }

  const fileCenterCode = Array.from(detectedCenters)[0];
  if (fileCenterCode !== expectedCenterCode) {
    return {
      success: false,
      error: 'File không thuộc TTBH đang đăng nhập.',
      inputRows,
      filteredBySolution: 0,
      validRows: 0,
      warningRows: 0,
      tgddRows: 0,
      klRows: 0,
      totalCash: 0,
      totalDebt: 0,
      totalRevenue: 0,
      totalWarrantyExport: 0,
      totalRepairExport: 0,
      availableReportDates: [],
      latestReportDate: '',
      items: [],
      warnings: ['WRONG_SERVICE_CENTER']
    };
  }

  const items: ProcessedReportItem[] = [];
  const warnings: string[] = [];
  let filteredBySolution = 0;
  let warningRows = 0;

  // Thống kê tổng hợp số lượng phiếu theo Phương án giải quyết
  const ticketsBySolution = new Map<string, Set<string>>();
  const rowsBySolution = new Map<string, number>();
  const validRowsBySolution = new Map<string, number>();

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rawSolution = colPhuongAn ? normalizeText(row[colPhuongAn]) : '';
    const solKey = rawSolution || 'Chưa phân loại';
    const ticket = colPhieu ? normalizeText(row[colPhieu]) : `row_${idx}`;

    rowsBySolution.set(solKey, (rowsBySolution.get(solKey) || 0) + 1);
    if (!ticketsBySolution.has(solKey)) {
      ticketsBySolution.set(solKey, new Set<string>());
    }
    if (ticket) {
      ticketsBySolution.get(solKey)!.add(ticket);
    }
    const sourceRowNumber = idx + 2;

    // 1. Parse và validate Thời gian lấy máy
    const rawPickup = row[colTgLay];
    const pickupTime = normalizeText(rawPickup);
    if (!pickupTime) {
      // Dòng không có Thời gian lấy máy (null/trống): máy chưa giao khách -> không cần lọc ra báo cáo, bỏ qua bình thường
      continue;
    }

    const dateMatch = pickupTime.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) {
      warningRows++;
      warnings.push(`Dòng ${sourceRowNumber}: INVALID_PICKUP_TIME (${pickupTime})`);
      continue;
    }
    const reportDate = dateMatch[1];

    // 2. Kiểm tra Linh kiện (Phương án 1):
    // Cứ dòng nào có phát sinh Mã linh kiện HOẶC Tên linh kiện thì luôn luôn được lấy vào báo cáo
    // (Bất kể Phương án giải quyết là thay thế, vệ sinh hay chạy phần mềm).
    // Nếu cả 2 đều trống thì bỏ qua
    const partCode = normalizeText(row[colMaLk]);
    const partName = normalizeText(row[colTenLk]);
    if (!partCode && !partName) {
      filteredBySolution++;
      continue;
    }

    const solution = normalizeText(row[colPhuongAn]);

    // 3. Phân loại Khách hàng & Phương thức thanh toán
    const bringType = normalizeText(row[colLoaiHinh]);
    const phone = normalizeText(row[colPhone]);
    const repairCategory = normalizeText(row[colLoaiSc]);

    const isDemo = bringType === normalizeText('Máy demo được gửi đi sửa chữa');
    const isChainTgdd = bringType === normalizeText('Kênh chuỗi gửi sửa') && (
      phone.startsWith('+84 190') ||
      phone.startsWith('+84 109') ||
      phone.endsWith('464') ||
      phone.endsWith('460')
    );
    const isTgdd = isDemo || isChainTgdd;

    const customer: 'TGDĐ' | 'KL' = isTgdd ? 'TGDĐ' : 'KL';
    const paymentMethod: 'CN' | 'TM' = isTgdd ? 'CN' : 'TM';

    // 4. Xác định Đơn giá và phân bổ Tiền mặt / Công nợ
    // Phương án 2: Đơn giá ưu tiên lấy từ "Giá bán lẻ đề nghị" (nếu có), nếu không có thì lấy từ "Số tiền phải thu"
    const retailPrice = colGiaBanLe ? parseMoneyPreserveNull(row[colGiaBanLe]) : null;
    const phaiThuPrice = parseMoneyPreserveNull(row[colPhaiThu]);
    const unitPrice = retailPrice !== null ? retailPrice : phaiThuPrice;
    const actualPrice = parseMoneyPreserveNull(row[colThucThu]);

    let cashRevenue: number | null = null;
    let receivable: number | null = null;

    if (unitPrice !== null) {
      // Đối chiếu Số tiền phải thu và Số tiền thực thu:
      // - Nếu đó là KL thì điền Số tiền thực thu vào ô Tiền mặt, Công nợ = 0
      // - Nếu đó là TGDĐ thì điền Số tiền thực thu vào ô Công nợ, Tiền mặt = 0
      const effectiveActual = actualPrice !== null ? actualPrice : 0;

      if (customer === 'TGDĐ') {
        cashRevenue = 0;
        receivable = effectiveActual;
      } else {
        cashRevenue = effectiveActual;
        receivable = 0;
      }
    } else {
      warnings.push(`Dòng ${sourceRowNumber}: MISSING_UNIT_PRICE (Phiếu: ${normalizeText(row[colPhieu])})`);
    }

    // 5. Điều kiện cho Loại hình sửa chữa & Phân loại Xuất kho theo Loại linh kiện:
    // - Nếu Loại hình sửa chữa là 'Bảo hành + Sửa chữa':
    //   + Nếu Loại linh kiện là 'Sửa chữa': áp dụng đầy đủ ràng buộc của LK Sửa chữa (Xuất Sửa Chữa = 1, Xuất Bảo Hành = '')
    //   + Nếu Loại linh kiện là 'Bảo hành' (hoặc 'Bảo hành'): áp dụng đầy đủ ràng buộc của LK Bảo hành (Xuất Bảo Hành = 1, Xuất Sửa Chữa = '')
    // - Các Loại hình sửa chữa khác ('Sửa chữa', 'Bảo hành'...):
    //   + Phân loại xuất kho theo đúng Loại linh kiện tương ứng
    // - Các giá trị không phải 1: để trống luôn, không điền 0
    const partType = normalizeText(row[colLoaiLk]);
    let warrantyExport: number | string = '';
    let repairExport: number | string = '';

    const isBaoHanhPlusSuaChua = repairCategory.includes(normalizeText('Bảo hành + Sửa chữa')) ||
                                 repairCategory.includes(normalizeText('Bảo hành + Sửa chữa'));

    if (isBaoHanhPlusSuaChua) {
      if (partType === normalizeText('Sửa chữa')) {
        repairExport = 1;
        warrantyExport = '';
      } else if (partType === normalizeText('Bảo hành') || partType === normalizeText('Bảo hành')) {
        warrantyExport = 1;
        repairExport = '';
      }
    } else {
      if (partType === normalizeText('Sửa chữa')) {
        repairExport = 1;
        warrantyExport = '';
      } else if (partType === normalizeText('Bảo hành') || partType === normalizeText('Bảo hành')) {
        warrantyExport = 1;
        repairExport = '';
      }
    }



    const rawWaybill = colVanDonNhan ? normalizeText(row[colVanDonNhan]) : '';
    const cleanWaybill = rawWaybill.replace(/\s+/g, '').toUpperCase();
    let matchedJobcard = '';
    if (jobcardMap && cleanWaybill && jobcardMap.has(cleanWaybill)) {
      matchedJobcard = jobcardMap.get(cleanWaybill) || '';
    }

    items.push({
      'Số phiếu sửa chữa': normalizeText(row[colPhieu]),
      'Mã vật tư linh kiện': partCode,
      'Tên vật tư': partName,
      'Xuất Bảo Hành': warrantyExport,
      'Xuất phụ kiện': '',
      'Xuất Sửa Chữa': repairExport,
      'Đơn giá': unitPrice,
      'Doanh thu tiền mặt': cashRevenue,
      'Công nợ': receivable,
      'Khách hàng': customer,
      'Phương thức thanh toán': paymentMethod,
      'Jobcard': matchedJobcard,
      'Số vận đơn nhanh (nhận)': cleanWaybill,
      'Thời gian lấy máy': pickupTime,
      'Ngày báo cáo': reportDate,
      'Mã TTBH': fileCenterCode,
      'Tên TTBH': expectedCenterName,
      'Loại hình đem đến sửa': bringType,
      'Loại hình sửa chữa': repairCategory,
      'Loại linh kiện': partType,
      'Phương án giải quyết': solution,
      'Source Row Number': sourceRowNumber
    });
    validRowsBySolution.set(solKey, (validRowsBySolution.get(solKey) || 0) + 1);
  }

  // 6. Hậu kiểm và ghi đè kết quả hoàn chỉnh (Final Pass Safeguard):
  // Check lại thêm 1 lần nữa:
  // Nếu đó là TGDĐ VÀ (Loại hình sửa chữa là Bảo hành HOẶC Loại linh kiện là Bảo hành HOẶC thực thu = 0)
  // -> Cột Công nợ bắt buộc điền số 0 (chỉ riêng đối với khách hàng là TGDĐ, không tính KL).
  for (const item of items) {
    const isTgdd = item['Khách hàng'] === 'TGDĐ';
    const isRepairWarranty = normalizeText(item['Loại hình sửa chữa']).toLowerCase() === normalizeText('Bảo hành').toLowerCase();
    const isPartWarranty = normalizeText(item['Loại linh kiện']).toLowerCase() === normalizeText('Bảo hành').toLowerCase();

    if (isTgdd) {
      if (isRepairWarranty || isPartWarranty) {
        if (isPartWarranty || !normalizeText(item['Loại hình sửa chữa']).toLowerCase().includes('chữa')) {
          item['Công nợ'] = 0;
        }
      }
      if (item['Công nợ'] === null || item['Công nợ'] === undefined) {
        item['Công nợ'] = 0;
      }

      // CN sau chiết khấu (4%) và CN trước thuế (VAT 8%) cho TGDĐ:
      // Bước 1: CN sau chiết khấu = Math.round(Công nợ * 0.96)
      // Bước 2: CN trước thuế = Math.round(CN sau chiết khấu / 1.08) (làm tròn đến hàng đơn vị theo quy định bên thuế)
      const debtVal = item['Công nợ'];
      const afterDiscount = Math.round(debtVal * 0.96);
      const beforeTax = Math.round(afterDiscount / 1.08);
      item['CN sau chiết khấu'] = afterDiscount;
      item['CN trước thuế'] = beforeTax;
      item['Doanh thu tiền mặt trước thuế'] = null;
    } else {
      // Khách hàng là KL:
      // Doanh thu tiền mặt trước thuế = Tiền Mặt TM / 1.08 (làm tròn đến hàng đơn vị theo quy định bên thuế)
      if (item['Doanh thu tiền mặt'] !== null && item['Doanh thu tiền mặt'] !== undefined) {
        item['Doanh thu tiền mặt trước thuế'] = Math.round(item['Doanh thu tiền mặt'] / 1.08);
      } else {
        item['Doanh thu tiền mặt trước thuế'] = null;
      }
      item['CN sau chiết khấu'] = null;
      item['CN trước thuế'] = null;
    }
  }

  const tgddRows = items.filter(i => i['Khách hàng'] === 'TGDĐ').length;
  const klRows = items.filter(i => i['Khách hàng'] === 'KL').length;
  const totalCash = items.reduce((acc, i) => acc + (i['Doanh thu tiền mặt'] || 0), 0);
  const totalDebt = items.reduce((acc, i) => acc + (i['Công nợ'] || 0), 0);
  const totalRevenue = items.reduce((acc, i) => acc + (i['Đơn giá'] || 0), 0);
  const totalWarrantyExport = items.filter(i => i['Xuất Bảo Hành'] === 1 || i['Xuất Bảo Hành'] === '1').length;
  const totalRepairExport = items.filter(i => i['Xuất Sửa Chữa'] === 1 || i['Xuất Sửa Chữa'] === '1').length;

  const dateSet = new Set(items.map(i => i['Ngày báo cáo']));
  const availableReportDates = Array.from(dateSet).sort();
  const latestReportDate = availableReportDates.length > 0 ? availableReportDates[availableReportDates.length - 1] : '';

  const solutionStats: SolutionStat[] = Array.from(ticketsBySolution.entries())
    .map(([solution, ticketSet]) => ({
      solution,
      ticketCount: ticketSet.size,
      rowCount: rowsBySolution.get(solution) || 0,
      validRowCount: validRowsBySolution.get(solution) || 0
    }))
    .sort((a, b) => b.ticketCount - a.ticketCount);

  return {
    success: true,
    center: {
      code: fileCenterCode,
      name: expectedCenterName
    },
    inputRows,
    filteredBySolution,
    validRows: items.length,
    warningRows,
    tgddRows,
    klRows,
    totalCash,
    totalDebt,
    totalRevenue,
    totalWarrantyExport,
    totalRepairExport,
    availableReportDates,
    latestReportDate,
    items,
    warnings,
    solutionStats
  };
}
