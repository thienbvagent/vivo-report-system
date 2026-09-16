import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { getUploads, getReportItems, updateUploadStatus } from '@/lib/db-storage';
import { exportBaoCaoToN8n } from '@/lib/n8n-client';

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUploadId = body.uploadId ? String(body.uploadId).trim() : '';

    const uploads = getUploads(session.centerCode);
    const pendingUploads = targetUploadId
      ? uploads.filter(u => u.uploadId === targetUploadId)
      : uploads.filter(u => u.status === 'LOCAL_ONLY' || u.status === 'FAILED');

    if (pendingUploads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Không có bản ghi nào cần đồng bộ lại.',
        syncedCount: 0
      });
    }

    let successCount = 0;
    const errors: string[] = [];

    for (const upload of pendingUploads) {
      // Lấy toàn bộ linh kiện đã xử lý của TTBH này
      const items = getReportItems(session.centerCode, 'ALL');
      if (items.length === 0) {
        updateUploadStatus(upload.uploadId, 'NO_DATA');
        continue;
      }

      // Xác định ngày báo cáo từ các items hoặc uploadTime
      const reportDate = items[0]?.['Ngày báo cáo'] || new Date().toISOString().slice(0, 10);
      const dateParts = reportDate.split('-');
      const monthYear = dateParts.length >= 2 ? `${dateParts[1]}-${dateParts[0]}` : '';

      try {
        const n8nRes = await exportBaoCaoToN8n(
          session.centerCode,
          reportDate,
          undefined,
          undefined,
          items,
          monthYear
        );

        if (n8nRes && n8nRes.success === false) {
          const errMsg = n8nRes.error || 'n8n không xác nhận đồng bộ thành công.';
          updateUploadStatus(upload.uploadId, 'FAILED', errMsg);
          errors.push(`Upload ${upload.uploadId}: ${errMsg}`);
        } else {
          updateUploadStatus(upload.uploadId, 'SUCCESS');
          successCount++;
        }
      } catch (err: any) {
        const errMsg = err.message || 'Lỗi kết nối tới n8n.';
        updateUploadStatus(upload.uploadId, 'FAILED', errMsg);
        errors.push(`Upload ${upload.uploadId}: ${errMsg}`);
      }
    }

    if (successCount > 0) {
      return NextResponse.json({
        success: true,
        message: `Đã đồng bộ lại thành công ${successCount} bản ghi sang Google Sheets / n8n.`,
        syncedCount: successCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `Đồng bộ lại thất bại: ${errors.join('; ')}`,
        errors
      }, { status: 502 });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
