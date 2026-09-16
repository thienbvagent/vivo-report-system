import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { exportBaoCaoToN8n } from '@/lib/n8n-client';
import { getReportItems } from '@/lib/db-storage';
import { generateTanTamDebtReportExcel, generateFullReportExcel } from '@/lib/export-excel';
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
      if (!report_date || report_date === 'ALL' || !/^\d{4}-\d{2}-\d{2}$/.test(report_date)) {
        return NextResponse.json({
          success: false,
          error: 'Vui lòng chọn một ngày báo cáo cụ thể (ví dụ: 2026-09-15) để xuất Báo cáo Công Nợ Tận Tâm.'
        }, { status: 400 });
      }

      const reportItems = getReportItems(session.centerCode, report_date);
      if (reportItems.length === 0) {
        return NextResponse.json({
          success: false,
          error: `Không tìm thấy dữ liệu báo cáo cho ngày ${report_date}.`
        }, { status: 404 });
      }

      const result = await generateTanTamDebtReportExcel(reportItems, session.centerName, report_date);

      const encodedFilename = encodeURIComponent(result.filename);
      return new NextResponse(new Uint8Array(result.buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        }
      });
    }

    // 2. Xuất Báo Cáo Đầy Đủ (bao gồm tất cả các thông tin được show ra trên giao diện)
    const reportItems = report_date === 'ALL'
      ? getReportItems(session.centerCode)
      : getReportItems(session.centerCode, report_date);

    if (reportItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: report_date === 'ALL'
          ? 'Không có dữ liệu báo cáo nào trong hệ thống.'
          : `Không có dữ liệu báo cáo cho ngày ${report_date}.`
      }, { status: 404 });
    }

    const result = await generateFullReportExcel(reportItems, session.centerCode, session.centerName, report_date);

    const encodedFilename = encodeURIComponent(result.filename);
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
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

    const spreadsheetId = extractSpreadsheetId(spreadsheet_id || sheet_url);
    if (!/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId)) {
      return NextResponse.json({ success: false, error: 'Link hoặc Spreadsheet ID của Google Sheets không hợp lệ.' }, { status: 400 });
    }

    const reportItems = getReportItems(session.centerCode, report_date);
    if (reportItems.length === 0) {
      return NextResponse.json({ success: false, error: 'Không có dữ liệu báo cáo cho ngày đã chọn.' }, { status: 404 });
    }

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
        return NextResponse.json({
          success: false,
          error: `Xuất Google Sheets thất bại từ n8n: ${n8nRes.error || 'Quy trình n8n báo lỗi.'}`,
          details: n8nRes
        }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        message: `Đã xuất ${exportItems.length} dòng sang tab ${monthYear || 'Google Sheets'} thành công.`,
        details: n8nRes
      });
    } catch (n8nErr: any) {
      return NextResponse.json({
        success: false,
        error: `Xuất Google Sheets thất bại: ${n8nErr.message}`
      }, { status: 502 });
    }

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
