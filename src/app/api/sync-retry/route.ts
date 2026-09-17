import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { getUploads, getReportItemsByUploadId, updateUploadStatus, getUserSheetUrl } from '@/lib/db-storage';
import { exportBaoCaoToN8n } from '@/lib/n8n-client';
import { handleApiError } from '@/lib/api-errors';
function extractSpreadsheetId(input: unknown): string {
  const value = String(input || '').trim();
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : value;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUploadId = body.uploadId ? String(body.uploadId).trim() : '';
    const configuredSheetUrl = getUserSheetUrl(session.centerCode);
    const sheetUrl = String(body.sheet_url || body.sheetUrl || configuredSheetUrl || '').trim();
    const spreadsheetId = extractSpreadsheetId(String(body.spreadsheet_id || body.spreadsheetId || sheetUrl || ''));

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
      // Chỉ lấy đúng các linh kiện thuộc về bản ghi upload này
      const uploadItems = getReportItemsByUploadId(session.centerCode, upload.uploadId);
      if (uploadItems.length === 0) {
        updateUploadStatus(upload.uploadId, 'NO_DATA');
        continue;
      }

      // Nhóm dữ liệu theo từng ngày báo cáo có trong file
      const dateMap = new Map<string, typeof uploadItems>();
      for (const item of uploadItems) {
        const d = item['Ngày báo cáo'] || new Date().toISOString().slice(0, 10);
        if (!dateMap.has(d)) dateMap.set(d, []);
        dateMap.get(d)!.push(item);
      }

      let uploadOk = true;
      let lastErr = '';

      for (const [reportDate, dateItems] of dateMap.entries()) {
        const dateParts = reportDate.split('-');
        const monthYear = dateParts.length >= 2 ? `${dateParts[1]}-${dateParts[0]}` : '';

        try {
          const n8nRes = await exportBaoCaoToN8n(
            session.centerCode,
            reportDate,
            sheetUrl || undefined,
            spreadsheetId || undefined,
            dateItems,
            monthYear
          );

          if (n8nRes && n8nRes.success === false) {
            console.error('[Sync-retry n8n response error]:', n8nRes);
            uploadOk = false;
            lastErr = 'n8n không xác nhận đồng bộ thành công.';
            break;
          }
        } catch (err: any) {
          console.error('[Sync-retry n8n connection error]:', err);
          uploadOk = false;
          lastErr = 'Không thể kết nối tới dịch vụ n8n.';
          break;
        }
      }

      if (uploadOk) {
        updateUploadStatus(upload.uploadId, 'SUCCESS');
        successCount++;
      } else {
        updateUploadStatus(upload.uploadId, 'LOCAL_ONLY', lastErr);
        errors.push(`Upload ${upload.uploadId}: ${lastErr}`);
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
    return handleApiError(err, 'Lỗi trong quá trình đồng bộ lại dữ liệu n8n.');
  }
}

