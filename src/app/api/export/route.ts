import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { exportBaoCaoToN8n } from '@/lib/n8n-client';
import { getReportItems } from '@/lib/db-storage';
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
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const report_date = searchParams.get('date');
    if (!report_date || !/^\d{4}-\d{2}-\d{2}$/.test(report_date)) {
      return NextResponse.json({ success: false, error: 'Vui lòng chọn ngày báo cáo cụ thể (YYYY-MM-DD).' }, { status: 400 });
    }

    const reportItems = getReportItems(session.centerCode, report_date);
    if (reportItems.length === 0) {
      return NextResponse.json({ success: false, error: 'Không có dữ liệu báo cáo cho ngày đã chọn.' }, { status: 404 });
    }

    const exportRows = reportItems.map(item => {
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

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'BaoCao');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="BaoCao_${session.centerCode}_${report_date}.xlsx"`
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
