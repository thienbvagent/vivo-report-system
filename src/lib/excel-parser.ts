import * as XLSX from 'xlsx';

/**
 * Khac phuc loi ZIP64 ('Failed to allocate memory') cua thu vien SheetJS.
 * Khi cac he thong nhu CRM Vivo xuat file Excel voi dinh dang ZIP64,
 * cac truong compressedSize va uncompressedSize trong header cuc bo va Central Directory
 * duoc dien gia tri 0xFFFFFFFF (4,294,967,295 = ~4.29 GB).
 * Thu vien SheetJS doc gia tri 0xFFFFFFFF nay va goi Buffer.allocUnsafe(4294967295)
 * dan den RangeError: Failed to allocate memory.
 * 
 * Ham nay quet cac entry trong Central Directory, tim extra field ZIP64 (tag 0x0001),
 * lay kich thuoc thuc te (thuong chi vai KB / MB) va ghi de vao cac truong 32-bit,
 * cho phep SheetJS doc file muot ma trong vai mili-giay.
 */
export const MAX_UNCOMPRESSED_SIZE = 150 * 1024 * 1024; // 150 MB

export function fixZip64Buffer(inputBuf: Buffer): Buffer {
  const buf = Buffer.from(inputBuf);
  // Tim End of Central Directory Record (EOCD - signature: 0x06054b50)
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return buf;

  const numEntries = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  let offset = cdOffset;

  for (let i = 0; i < numEntries; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) break;
    const comp32 = buf.readUInt32LE(offset + 20);
    const uncomp32 = buf.readUInt32LE(offset + 24);
    const fnLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);

    if (comp32 === 0xFFFFFFFF || uncomp32 === 0xFFFFFFFF) {
      const cdExtra = buf.subarray(offset + 46 + fnLen, offset + 46 + fnLen + extraLen);
      let p = 0;
      let actualUncomp: number | null = null, actualComp: number | null = null;
      while (p + 4 <= cdExtra.length) {
        const tag = cdExtra.readUInt16LE(p);
        const sz = cdExtra.readUInt16LE(p + 2);
        if (tag === 0x0001 && sz >= 16 && p + 4 + sz <= cdExtra.length) {
          actualUncomp = Number(cdExtra.readBigUInt64LE(p + 4));
          actualComp = Number(cdExtra.readBigUInt64LE(p + 12));
          break;
        }
        p += 4 + sz;
      }

      if (actualUncomp !== null && actualComp !== null) {
        if (actualUncomp > MAX_UNCOMPRESSED_SIZE) {
          throw new Error(
            `Kích thước tập tin giải nén vượt quá giới hạn an toàn (${Math.round(actualUncomp / (1024 * 1024))}MB > 150MB). Từ chối xử lý để ngăn ngừa nguy cơ cạn kiệt bộ nhớ (Zip Bomb).`
          );
        }

        // Cap nhat Central Directory
        buf.writeUInt32LE(actualComp, offset + 20);
        buf.writeUInt32LE(actualUncomp, offset + 24);

        // Cap nhat Local File Header
        if (localHeaderOffset + 26 <= buf.length && buf.readUInt32LE(localHeaderOffset) === 0x04034b50) {
          buf.writeUInt32LE(actualComp, localHeaderOffset + 18);
          buf.writeUInt32LE(actualUncomp, localHeaderOffset + 22);
        }
      }
    }

    offset += 46 + fnLen + extraLen + commentLen;
  }

  return buf;
}

export function readExcelBuffer(buffer: Buffer): XLSX.WorkBook {
  const safeBuffer = fixZip64Buffer(buffer);
  return XLSX.read(safeBuffer, { type: 'buffer' });
}

export interface PortalJobcardParsedResult {
  success: boolean;
  error?: string;
  records: {
    billCode: string;
    jobcardCode: string;
    imei?: string;
    customerName?: string;
    phone?: string;
    supermarket?: string;
  }[];
}

export function parsePortalJobcardFile(buffer: Buffer): PortalJobcardParsedResult {
  try {
    const wb = readExcelBuffer(buffer);
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return { success: false, error: 'File Excel không có sheet dữ liệu nào.', records: [] };
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rawRows || rawRows.length === 0) {
      return { success: false, error: 'File Excel không chứa dữ liệu dòng nào.', records: [] };
    }

    const firstRow = rawRows[0];
    const allKeys = Object.keys(firstRow);

    const findKey = (target: string) => {
      const norm = target.normalize('NFKC').toLowerCase().trim();
      return allKeys.find(k => k.normalize('NFKC').toLowerCase().trim() === norm) || null;
    };

    const colBill = findKey('BILL CHUYỂN ĐI TTBH') || findKey('BILL CHUYỂN ĐI') || allKeys.find(k => k.toLowerCase().includes('bill chuyển đi'));
    const colJobcard = findKey('MÃ JOBCARD') || findKey('JOBCARD') || allKeys.find(k => k.toLowerCase().includes('jobcard'));

    if (!colBill) {
      return { success: false, error: 'Không tìm thấy cột "BILL CHUYỂN ĐI TTBH" trong file Portal.', records: [] };
    }
    if (!colJobcard) {
      return { success: false, error: 'Không tìm thấy cột "MÃ JOBCARD" trong file Portal.', records: [] };
    }

    const colImei = findKey('IMEI') || allKeys.find(k => k.toLowerCase().includes('imei'));
    const colTenKhach = findKey('TÊN KHÁCH') || allKeys.find(k => k.toLowerCase().includes('tên khách'));
    const colSdt = findKey('SĐT') || findKey('SDT') || allKeys.find(k => k.toLowerCase().includes('sđt'));
    const colSieuThi = findKey('SIÊU THỊ') || allKeys.find(k => k.toLowerCase().includes('siêu thị'));

    const records: PortalJobcardParsedResult['records'] = [];
    const seenBills = new Set<string>();

    for (const row of rawRows) {
      const billRaw = String(row[colBill] || '').trim().replace(/\s+/g, '').toUpperCase();
      const jobcardRaw = String(row[colJobcard] || '').trim();

      if (!billRaw || !jobcardRaw) continue;
      if (seenBills.has(billRaw)) continue;
      seenBills.add(billRaw);

      records.push({
        billCode: billRaw,
        jobcardCode: jobcardRaw,
        imei: colImei ? String(row[colImei] || '').trim() : undefined,
        customerName: colTenKhach ? String(row[colTenKhach] || '').trim() : undefined,
        phone: colSdt ? String(row[colSdt] || '').trim() : undefined,
        supermarket: colSieuThi ? String(row[colSieuThi] || '').trim() : undefined
      });
    }

    return {
      success: true,
      records
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Lỗi khi đọc file Portal: ${err.message}`,
      records: []
    };
  }
}

