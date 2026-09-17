import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { exportBaoCaoToN8n } from '@/lib/n8n-client';
import { getReportItems, getUserSheetUrl, updateUserSheetUrl, isSpreadsheetIdUsedByOtherCenter } from '@/lib/db-storage';
import { getCenterName } from '@/lib/centers';
import { generateTanTamDebtReportExcel, generateFullReportExcel } from '@/lib/export-excel';
import { handleApiError } from '@/lib/api-errors';
import * as XLSX from 'xlsx';


function extractSpreadsheetId(input: unknown): string {
  const value = String(input || '').trim();
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : value;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const report_date = searchParams.get('date') || 'ALL';
    const exportType = searchParams.get('type') || 'full'; // 'full' | 'tantam'

    // 1. Xuất Báo Cáo Công Nợ Tận Tâm (theo chuẩn file mẫu TTBH CẦN THƠ - Báo cáo Công Nợ Tận Tâm.xlsx)
    if (exportType === 'tantam') {
      const items = getReportItems(session.centerCode, report_date);
      if (items.length === 0) {
        return NextResponse.json({ success: false, error: 'Không có dữ liệu để xuất báo cáo công nợ.' }, { status: 404 });
      }

      const result = await generateTanTamDebtReportExcel(
        items,
        session.centerName,
        report_date
      );

      const encodedFilename = encodeURIComponent(result.filename);
      return new NextResponse(new Uint8Array(result.buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        }
      });
    }

    // 2. Xuất Báo Cáo Đầy Đủ Chi Tiết (toàn bộ cột trên UI)
    const items = getReportItems(session.centerCode, report_date);
    if (items.length === 0) {
      return NextResponse.json({ success: false, error: 'Không có dữ liệu để xuất báo cáo chi tiết.' }, { status: 404 });
    }

    const result = await generateFullReportExcel(
      items,
      session.centerCode,
      session.centerName,
      report_date
    );

    const encodedFilename = encodeURIComponent(result.filename);
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
      }
    });
  } catch (err: any) {
    return handleApiError(err, 'Lỗi xuất file Excel báo cáo. Vui lòng thử lại sau.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { report_date, sheet_url, spreadsheet_id } = await req.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(report_date || ''))) {
      return NextResponse.json({ success: false, error: 'Vui lòng chọn ngày báo cáo để xuất.' }, { status: 400 });
    }

    const userConfiguredUrl = getUserSheetUrl(session.centerCode);
    let configuredSpreadsheetId = extractSpreadsheetId(userConfiguredUrl);

    const requestedId = extractSpreadsheetId(spreadsheet_id || sheet_url);
    const spreadsheetId = requestedId || configuredSpreadsheetId;

    if (!spreadsheetId || !/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId)) {
      return NextResponse.json({ success: false, error: 'Link hoặc Spreadsheet ID của Google Sheets không hợp lệ. Vui lòng kiểm tra lại.' }, { status: 400 });
    }

    // Kiểm tra xem Spreadsheet ID này có đang được sử dụng bởi một TTBH khác không
    if (isSpreadsheetIdUsedByOtherCenter(session.centerCode, spreadsheetId)) {
      return NextResponse.json({
        success: false,
        error: 'Spreadsheet ID này đã được liên kết với một TTBH khác. Mỗi TTBH phải sử dụng một Google Sheet riêng biệt.'
      }, { status: 403 });
    }

    // Tự động lưu cấu hình Google Sheet cho TTBH này nếu có thay đổi hoặc cấu hình mới
    if (requestedId && requestedId !== configuredSpreadsheetId) {
      const fullUrl = String(sheet_url || `https://docs.google.com/spreadsheets/d/${requestedId}`).trim();
      updateUserSheetUrl(session.centerCode, fullUrl);
      configuredSpreadsheetId = requestedId;
    }

    // Nếu quản trị viên có cấu hình ALLOWED_SPREADSHEET_IDS trong môi trường thì kiểm tra whitelist
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

    const reportItems = getReportItems(session.centerCode, report_date);
    if (reportItems.length === 0) {
      return NextResponse.json({ success: false, error: 'Không có dữ liệu báo cáo cho ngày đã chọn.' }, { status: 404 });
    }

    const formatMoneyComma = (val: any): string => {
      if (val === null || val === undefined || val === '') return '';
      const num = typeof val === 'number' ? Math.round(val) : Math.round(Number(String(val).replace(/,/g, '')));
      return isNaN(num) ? '' : new Intl.NumberFormat('en-US').format(num);
    };

    const exportItems = reportItems.map(item => {
      const isTgdd = item['Khách hàng'] === 'TGDĐ';
      return {
        'Ngày': item['Ngày báo cáo'],
        'Số phiếu sửa chữa': item['Số phiếu sửa chữa'],
        'Mã vật tư linh kiện': item['Mã vật tư linh kiện'],
        'Tên vật tư': item['Tên vật tư'],
        'Xuất Bảo Hành': item['Xuất Bảo Hành'] === 1 || item['Xuất Bảo Hành'] === '1' ? 1 : '',
        'Xuất phụ kiện': item['Xuất phụ kiện'] === 1 || item['Xuất phụ kiện'] === '1' ? 1 : '',
        'Xuất Sửa Chữa': item['Xuất Sửa Chữa'] === 1 || item['Xuất Sửa Chữa'] === '1' ? 1 : '',
        'Đơn giá': formatMoneyComma(item['Đơn giá']),
        'Doanh thu tiền mặt': isTgdd ? '0' : (item['Doanh thu tiền mặt'] === null || item['Doanh thu tiền mặt'] === undefined ? '' : formatMoneyComma(item['Doanh thu tiền mặt'])),
        'Doanh thu tiền mặt trước thuế': isTgdd ? '0' : (item['Doanh thu tiền mặt trước thuế'] == null ? '' : formatMoneyComma(item['Doanh thu tiền mặt trước thuế'])),
        'Công nợ': isTgdd ? formatMoneyComma(item['Công nợ'] ?? 0) : '0',
        'CN sau chiết khấu': isTgdd ? formatMoneyComma(item['CN sau chiết khấu'] ?? 0) : '-',
        'CN trước thuế': isTgdd ? formatMoneyComma(item['CN trước thuế'] ?? 0) : '-',
        'Khách hàng': item['Khách hàng'],
        'Phương thức thanh toán': item['Phương thức thanh toán'],
        'Jobcard': item['Jobcard'] || '',
        'TTBH': session.centerName || getCenterName(session.centerCode)
      };
    });

    // Chỉ gửi dữ liệu lấy từ server; không tin cậy payload hàng do trình duyệt cung cấp.
    try {
      const fullSheetUrl = sheet_url || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : '');
      const dateParts = report_date.split('-');
      const monthYear = dateParts.length >= 2 ? `${dateParts[1]}-${dateParts[0]}` : '';

      const n8nRes = await exportBaoCaoToN8n(
        session.centerCode,
        report_date,
        fullSheetUrl,
        spreadsheetId,
        exportItems,
        monthYear
      );
      if (n8nRes && n8nRes.success === false) {
        console.error('[Export n8n error]:', n8nRes);
        return NextResponse.json({
          success: false,
          error: 'Xuất Google Sheets thất bại qua dịch vụ n8n. Vui lòng thử lại sau.'
        }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        message: `Đã xuất ${exportItems.length} dòng sang tab ${monthYear || 'Google Sheets'} thành công.`
      });
    } catch (n8nErr: any) {
      console.error('[Export n8n error]:', n8nErr);
      return NextResponse.json({
        success: false,
        error: 'Xuất Google Sheets thất bại do sự cố kết nối n8n. Vui lòng thử lại sau.'
      }, { status: 502 });
    }

  } catch (err: any) {
    return handleApiError(err, 'Lỗi xuất dữ liệu báo cáo. Vui lòng thử lại sau.');
  }
}
