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
