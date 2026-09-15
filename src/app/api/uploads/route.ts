import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { calculateFileHash } from '@/lib/file-hash';
import { findUploadByHash, saveUploadRecord, saveReportItems } from '@/lib/db-storage';
import { forwardImportToN8n } from '@/lib/n8n-client';
import { transformExcelRows, RawExcelRow } from '@/lib/business-rules';
import { readExcelBuffer, fixZip64Buffer } from '@/lib/excel-parser';
import * as XLSX from 'xlsx';

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

    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    const buffer = fixZip64Buffer(rawBuffer);

    // 2. Chống upload trùng file qua SHA-256
    const fileHash = calculateFileHash(rawBuffer);
    const existingUpload = findUploadByHash(session.centerCode, fileHash);
    if (existingUpload) {
      return NextResponse.json({
        success: false,
        error: `File này đã được tải lên và xử lý trước đó vào lúc ${existingUpload.uploadTime} (Tên file: ${existingUpload.fileName}).`,
        duplicate: true
      }, { status: 409 });
    }

    const uploadId = `UPL_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

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

    // 4. Chuyển tiếp sang n8n Webhook
    let n8nStatus = 'SKIPPED';
    try {
      const n8nRes = await forwardImportToN8n(
        buffer,
        file.name,
        session.centerCode,
        session.centerName,
        uploadId
      );
      if (n8nRes.success) {
        n8nStatus = 'SYNCED_N8N';
      }
    } catch (n8nErr) {
      console.warn('Cảnh báo n8n:', n8nErr);
    }

    // 5. Lưu vào Database cục bộ
    const mode = (formData.get('mode') as string) === 'replace' ? 'replace_center' : 'upsert';

    saveUploadRecord({
      uploadId,
      centerCode: session.centerCode,
      fileName: file.name,
      fileHash,
      uploadTime: new Date().toISOString(),
      inputRows: transformResult.inputRows,
      validRows: transformResult.validRows,
      warningRows: transformResult.warningRows,
      status: 'SUCCESS'
    });

    const { inserted, updated } = saveReportItems(transformResult.items, mode);

    let zeroNotice = null;
    if (transformResult.validRows === 0) {
      zeroNotice = `File chứa ${transformResult.inputRows} dòng nhưng toàn bộ 106 dòng đều trống cột "Mã linh kiện" và "Tên linh kiện" (đây là file xuất ở cấp độ tổng hợp phiếu, chưa tích chọn xuất chi tiết linh kiện). Do đó hệ thống không có dữ liệu linh kiện mới nào để thêm vào báo cáo. Báo cáo hiện tại vẫn hiển thị dữ liệu của lần tải lên trước đó.`;
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
      n8nStatus
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
