import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { exportBaoCaoToN8n } from '@/lib/n8n-client';

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { report_date, sheet_url, spreadsheet_id, target_sheet, targetSheet, items } = await req.json();
    if (!report_date) {
      return NextResponse.json({ success: false, error: 'Vui lòng chọn ngày báo cáo để xuất.' }, { status: 400 });
    }

    // Kích hoạt n8n webhook export
    try {
      const n8nRes = await exportBaoCaoToN8n(
        session.centerCode, 
        report_date,
        sheet_url,
        spreadsheet_id,
        items,
        target_sheet || targetSheet
      );
      return NextResponse.json({
        success: true,
        message: 'Đã gửi dữ liệu thành công sang n8n để điền vào Google Sheets!',
        details: n8nRes
      });
    } catch (n8nErr: any) {
      return NextResponse.json({
        success: true,
        message: `Đã chuẩn bị dữ liệu xuất cho ngày ${report_date} của ${session.centerName}. (Lưu ý: n8n webhook phản hồi: ${n8nErr.message})`,
        exportedOffline: true
      });
    }

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
