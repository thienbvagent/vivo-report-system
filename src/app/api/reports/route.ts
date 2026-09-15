import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { getReportItems, getAvailableDates, clearCenterData } from '@/lib/db-storage';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date') || '';

    const availableDates = getAvailableDates(session.centerCode);
    const selectedDate = dateParam || (availableDates.length > 0 ? availableDates[0] : 'ALL');

    const items = getReportItems(session.centerCode, selectedDate);

    const totalRows = items.length;
    const totalUnitPrice = items.reduce((acc, r) => acc + (r['Đơn giá'] || 0), 0);
    const totalCash = items.reduce((acc, r) => acc + (r['Doanh thu tiền mặt'] || 0), 0);
    const totalDebt = items.reduce((acc, r) => acc + (r['Công nợ'] || 0), 0);
    const totalWarrantyExport = items.reduce((acc, r) => acc + (Number(r['Xuất Bảo Hành']) || 0), 0);
    const totalRepairExport = items.reduce((acc, r) => acc + (Number(r['Xuất Sửa Chữa']) || 0), 0);
    const countKl = items.filter(r => r['Khách hàng'] === 'KL').length;
    const countTgdd = items.filter(r => r['Khách hàng'] === 'TGDĐ').length;

    return NextResponse.json({
      success: true,
      center: {
        code: session.centerCode,
        name: session.centerName
      },
      availableDates,
      selectedDate,
      summary: {
        totalRows,
        totalUnitPrice,
        totalCash,
        totalDebt,
        totalWarrantyExport,
        totalRepairExport,
        countKl,
        countTgdd
      },
      rows: items
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    clearCenterData(session.centerCode);
    return NextResponse.json({ success: true, message: 'Đã làm mới và xóa toàn bộ dữ liệu báo cáo cũ của trung tâm.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
