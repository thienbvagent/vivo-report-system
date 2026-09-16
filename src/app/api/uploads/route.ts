import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { calculateFileHash } from '@/lib/file-hash';
import { findUploadByHash, saveUploadRecord, saveReportItems } from '@/lib/db-storage';
import { forwardImportToN8n } from '@/lib/n8n-client';
import { transformExcelRows, RawExcelRow } from '@/lib/business-rules';
import { readExcelBuffer, fixZip64Buffer } from '@/lib/excel-parser';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function hasExcelSignature(buffer: Buffer): boolean {
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (
    (buffer[2] === 0x03 && buffer[3] === 0x04) ||
    (buffer[2] === 0x05 && buffer[3] === 0x06) ||
    (buffer[2] === 0x07 && buffer[3] === 0x08)
  );
  const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const isLegacyXls = buffer.length >= oleSignature.length && oleSignature.every((byte, index) => buffer[index] === byte);
  return isZip || isLegacyXls;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Kiểm tra session đăng nhập
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'Vui lòng chọn file Excel để tải lên.' }, { status: 400 });
    }

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      return NextResponse.json({ success: false, error: 'Chỉ hỗ trợ file Excel định dạng .xlsx hoặc .xls.' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'File Excel đang trống.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: 'File Excel vượt quá giới hạn 25 MB.' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    if (!hasExcelSignature(rawBuffer)) {
      return NextResponse.json({ success: false, error: 'Nội dung file không đúng định dạng Excel.' }, { status: 400 });
    }
    const buffer = fixZip64Buffer(rawBuffer);

    const mode = (formData.get('mode') as string) === 'replace' ? 'replace_center' : 'upsert';

    // 2. Chống upload trùng file qua SHA-256 (chỉ chặn khi lần trước đã SUCCESS và không phải chế độ replace)
    const fileHash = calculateFileHash(rawBuffer);
    const existingUpload = findUploadByHash(session.centerCode, fileHash);
    if (existingUpload && existingUpload.status === 'SUCCESS' && mode !== 'replace_center') {
      return NextResponse.json({
        success: false,
        error: `File này đã được tải lên và đồng bộ thành công trước đó vào lúc ${existingUpload.uploadTime} (Tên file: ${existingUpload.fileName}). Nếu muốn tải lại, vui lòng chọn chế độ "Ghi đè hoàn toàn TTBH".`,
        duplicate: true
      }, { status: 409 });
    }

    const uploadId = `UPL_${Date.now()}_${randomUUID().slice(0, 8).toUpperCase()}`;

    // 3. Phân tích nội bộ để kiểm tra tính hợp lệ & lưu trữ (hỗ trợ Zip64 chống lỗi Failed to allocate memory)
    let localRows: RawExcelRow[] = [];
    try {
      const workbook = readExcelBuffer(buffer);
      const sheetName = workbook.SheetNames[0];
      localRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    } catch (parseErr: any) {
      return NextResponse.json({ success: false, error: 'Không thể đọc cấu trúc file Excel: ' + parseErr.message }, { status: 400 });
    }

    const transformResult = transformExcelRows(localRows, session.centerCode, session.centerName);
    if (!transformResult.success) {
      return NextResponse.json({
        success: false,
        error: transformResult.error
      }, { status: 400 });
    }

    // 4. Lưu/cập nhật dữ liệu cục bộ trước, sau đó mới đồng bộ n8n.
    const importTime = new Date().toISOString();
    const reportItems = transformResult.items.map(item => ({
      ...item,
      'Upload ID': uploadId,
      'Thời gian import': importTime
    }));

    const { inserted, updated } = transformResult.validRows > 0
      ? saveReportItems(reportItems, mode)
      : { inserted: 0, updated: 0 };

    // 5. Đồng bộ n8n chỉ khi file có dữ liệu linh kiện hợp lệ.
    let n8nStatus: 'SYNCED_N8N' | 'FAILED_N8N' | 'NOT_ATTEMPTED_NO_DATA' = 'NOT_ATTEMPTED_NO_DATA';
    let n8nError: string | null = null;
    if (transformResult.validRows > 0) {
      try {
        const n8nRes = await forwardImportToN8n(
          buffer,
          file.name,
          session.centerCode,
          session.centerName,
          uploadId,
          mode === 'replace_center' ? 'replace' : 'upsert',
          transformResult.items
        );
        if (n8nRes.success) {
          n8nStatus = 'SYNCED_N8N';
        } else {
          n8nStatus = 'FAILED_N8N';
          n8nError = n8nRes.error || 'n8n không xác nhận đồng bộ thành công.';
        }
      } catch (n8nErr: any) {
        n8nStatus = 'FAILED_N8N';
        n8nError = n8nErr.message || 'Không thể kết nối tới n8n.';
      }
    }

    saveUploadRecord({
      uploadId,
      centerCode: session.centerCode,
      fileName: file.name,
      fileHash,
      uploadTime: importTime,
      inputRows: transformResult.inputRows,
      validRows: transformResult.validRows,
      warningRows: transformResult.warningRows,
      status: transformResult.validRows === 0
        ? 'NO_DATA'
        : n8nStatus === 'SYNCED_N8N' ? 'SUCCESS' : 'LOCAL_ONLY',
      errorMessage: n8nError || undefined
    });

    let zeroNotice = null;
    if (transformResult.validRows === 0) {
      zeroNotice = `File chứa ${transformResult.inputRows} dòng nhưng không có dòng linh kiện hợp lệ: ${transformResult.filteredBySolution} dòng không có Mã/Tên linh kiện và ${transformResult.warningRows} dòng thiếu hoặc sai Thời gian lấy máy. Báo cáo hiện tại được giữ nguyên.`;
    }

    return NextResponse.json({
      success: true,
      center: transformResult.center,
      inputRows: transformResult.inputRows,
      filteredBySolution: transformResult.filteredBySolution,
      validRows: transformResult.validRows,
      warningRows: transformResult.warningRows,
      insertedRows: inserted,
      updatedRows: updated,
      dataChanged: inserted + updated > 0,
      mode,
      zeroNotice,
      tgddRows: transformResult.tgddRows,
      klRows: transformResult.klRows,
      totalCash: transformResult.totalCash,
      totalDebt: transformResult.totalDebt,
      totalRevenue: transformResult.totalRevenue,
      totalWarrantyExport: transformResult.totalWarrantyExport,
      totalRepairExport: transformResult.totalRepairExport,
      availableReportDates: transformResult.availableReportDates,
      latestReportDate: transformResult.latestReportDate,
      uploadId,
      n8nStatus,
      n8nError
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
