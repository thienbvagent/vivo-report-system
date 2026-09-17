import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { getReportItems, getAvailableDates, getDateCounts, getUploads, clearCenterData } from '@/lib/db-storage';
import { handleApiError } from '@/lib/api-errors';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date') || '';

    const availableDates = getAvailableDates(session.centerCode);
    const dateCounts = getDateCounts(session.centerCode);
    const totalAllRows = Object.values(dateCounts).reduce((a, b) => a + b, 0);
    const selectedDate = dateParam || (availableDates.length > 0 ? availableDates[0] : 'ALL');

    const uploads = getUploads(session.centerCode);
    const pendingSyncCount = uploads.filter(u => u.status === 'LOCAL_ONLY' || u.status === 'FAILED').length;

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
      dateCounts,
      totalAllRows,
      selectedDate,
      pendingSyncCount,
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
    return handleApiError(err, 'Không thể tải dữ liệu báo cáo. Vui lòng thử lại sau.');
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
    return handleApiError(err, 'Không thể xóa dữ liệu báo cáo. Vui lòng thử lại sau.');
  }
}

