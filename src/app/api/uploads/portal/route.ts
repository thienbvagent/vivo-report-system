import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { parsePortalJobcardFile } from '@/lib/excel-parser';
import { savePortalJobcards, getPortalJobcardsStats, clearPortalJobcards } from '@/lib/db-storage';
import { handleApiError } from '@/lib/api-errors';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
    }

    const stats = getPortalJobcardsStats(session.centerCode);
    return NextResponse.json({
      success: true,
      stats
    });
  } catch (err: any) {
    return handleApiError(err, 'Không thể tải thống kê Portal Jobcard.');
  }
}


export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'Vui lòng chọn file Excel Portal Jobcard để tải lên.' }, { status: 400 });
    }

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      return NextResponse.json({ success: false, error: 'Chỉ hỗ trợ file Excel định dạng .xlsx hoặc .xls.' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'File Excel đang trống.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: 'File Excel vượt quá giới hạn 25 MB.' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    const parseRes = parsePortalJobcardFile(rawBuffer);

    if (!parseRes.success || !parseRes.records) {
      return NextResponse.json({
        success: false,
        error: parseRes.error || 'Không thể đọc file Portal Jobcard.'
      }, { status: 400 });
    }

    if (parseRes.records.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'File Excel không có dòng dữ liệu hợp lệ chứa mã Jobcard và Bill chuyển đi TTBH.'
      }, { status: 400 });
    }

    const result = savePortalJobcards(parseRes.records, session.centerCode);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      totalParsed: parseRes.records.length,
      totalSaved: result.totalSaved,
      updatedReportsCount: result.updatedReportsCount,
      matchedTickets: result.matchedTickets,
      message: `Đã nạp thành công ${result.totalSaved} mã Jobcard từ Portal TGDĐ. Tự động đồng bộ và gán mã Jobcard cho ${result.updatedReportsCount} dòng linh kiện/phiếu sửa chữa trong cơ sở dữ liệu.`
    });
  } catch (err: any) {
    return handleApiError(err, 'Lỗi hệ thống khi xử lý file Portal Jobcard.');
  }
}

export async function DELETE() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
    }

    const result = clearPortalJobcards(session.centerCode);
    const stats = getPortalJobcardsStats(session.centerCode);

    return NextResponse.json({
      success: true,
      message: `Đã làm sạch toàn bộ dữ liệu Portal Jobcard (${result.deletedCount} mã Jobcard đã xóa, ${result.clearedReportsCount} dòng báo cáo đã làm mới). Bạn có thể nạp file mới.`,
      deletedCount: result.deletedCount,
      clearedReportsCount: result.clearedReportsCount,
      stats
    });
  } catch (err: any) {
    return handleApiError(err, 'Lỗi hệ thống khi reset dữ liệu Portal Jobcard.');
  }
}

