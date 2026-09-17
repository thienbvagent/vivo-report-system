import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { getUploads, getReportItemsByUploadId, updateUploadStatus, getUserSheetUrl, updateUserSheetUrl, isSpreadsheetIdUsedByOtherCenter } from '@/lib/db-storage';
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
    const userConfiguredUrl = getUserSheetUrl(session.centerCode);
    let configuredSpreadsheetId = extractSpreadsheetId(userConfiguredUrl);

    const requestedId = extractSpreadsheetId(body.spreadsheet_id || body.spreadsheetId || body.sheet_url || body.sheetUrl);
    const spreadsheetId = requestedId || configuredSpreadsheetId;

    if (spreadsheetId) {
      if (!/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId)) {
        return NextResponse.json({
          success: false,
          error: 'Link hoặc Spreadsheet ID của Google Sheets không hợp lệ. Vui lòng kiểm tra lại.'
        }, { status: 400 });
      }

      // Kiểm tra xem Spreadsheet ID này có đang được sử dụng bởi một TTBH khác không
      if (isSpreadsheetIdUsedByOtherCenter(session.centerCode, spreadsheetId)) {
        return NextResponse.json({
          success: false,
          error: 'Spreadsheet ID này đã được liên kết với một TTBH khác. Mỗi TTBH phải sử dụng một Google Sheet riêng biệt.'
        }, { status: 403 });
      }

      // Tự động cập nhật URL bảng tính cho TTBH nếu có cấu hình mới
      if (requestedId && requestedId !== configuredSpreadsheetId) {
        const fullUrl = String(body.sheet_url || body.sheetUrl || `https://docs.google.com/spreadsheets/d/${requestedId}`).trim();
        updateUserSheetUrl(session.centerCode, fullUrl);
        configuredSpreadsheetId = requestedId;
      }

      // Kiểm tra whitelist nếu có
      const envAllowed = (process.env.ALLOWED_SPREADSHEET_IDS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (envAllowed.length > 0 && !envAllowed.includes(spreadsheetId)) {
        return NextResponse.json({
          success: false,
          error: 'Spreadsheet ID không nằm trong danh sách được cấp phép trên hệ thống.'
        }, { status: 403 });
      }
    }

    const fullSheetUrl = String(body.sheet_url || body.sheetUrl || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : userConfiguredUrl) || '').trim();

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

      // Nhóm dữ liệu theo từng tháng (monthYear: MM-YYYY) để tránh n8n clear wholeSheet làm mất dữ liệu các ngày khác trong cùng tháng
      const monthMap = new Map<string, typeof uploadItems>();
      for (const item of uploadItems) {
        const d = item['Ngày báo cáo'] || new Date().toISOString().slice(0, 10);
        const parts = d.split('-');
        const monthYear = parts.length >= 2
          ? `${parts[1]}-${parts[0]}`
          : `${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date().getFullYear()}`;
        if (!monthMap.has(monthYear)) monthMap.set(monthYear, []);
        monthMap.get(monthYear)!.push(item);
      }

      let uploadOk = true;
      let lastErr = '';

      for (const [monthYear, itemsForMonth] of monthMap.entries()) {
        const exportItems = itemsForMonth.map(item => {
          const isTgdd = item['Khách hàng'] === 'TGDĐ';
          return {
            'Ngày': item['Ngày báo cáo'],
            'Số phiếu sửa chữa': item['Số phiếu sửa chữa'],
            'Mã vật tư linh kiện': item['Mã vật tư linh kiện'],
            'Tên vật tư': item['Tên vật tư'],
            'Xuất Bảo Hành': item['Xuất Bảo Hành'] === 1 || item['Xuất Bảo Hành'] === '1' ? 1 : '',
            'Xuất phụ kiện': item['Xuất phụ kiện'] === 1 || item['Xuất phụ kiện'] === '1' ? 1 : '',
            'Xuất Sửa Chữa': item['Xuất Sửa Chữa'] === 1 || item['Xuất Sửa Chữa'] === '1' ? 1 : '',
            'Đơn giá': item['Đơn giá'] === null ? '' : Math.round(Number(item['Đơn giá'])),
            'Doanh thu tiền mặt': isTgdd || item['Doanh thu tiền mặt'] === null ? '' : Math.round(Number(item['Doanh thu tiền mặt'])),
            'Doanh thu tiền mặt trước thuế': isTgdd || item['Doanh thu tiền mặt trước thuế'] == null ? '' : Math.round(Number(item['Doanh thu tiền mặt trước thuế'])),
            'Công nợ': isTgdd ? Math.round(Number(item['Công nợ'] || 0)) : '',
            'CN sau chiết khấu': isTgdd ? Math.round(Number(item['CN sau chiết khấu'] || 0)) : '',
            'CN trước thuế': isTgdd ? Math.round(Number(item['CN trước thuế'] || 0)) : '',
            'Khách hàng': item['Khách hàng'],
            'Phương thức thanh toán': item['Phương thức thanh toán'],
            'Jobcard': item['Jobcard'] || '',
            'TTBH': session.centerCode
          };
        });

        try {
          const n8nRes = await exportBaoCaoToN8n(
            session.centerCode,
            'ALL',
            fullSheetUrl || undefined,
            spreadsheetId || undefined,
            exportItems,
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

