import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { parsePortalJobcardFile } from '@/lib/excel-parser';
import { savePortalJobcards, getPortalJobcardsStats } from '@/lib/db-storage';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
    }

    const stats = getPortalJobcardsStats();
    return NextResponse.json({
      success: true,
      stats
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
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

    const result = savePortalJobcards(parseRes.records);

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
    console.error('Portal upload error:', err);
    return NextResponse.json({
      success: false,
      error: `Lỗi hệ thống khi xử lý file Portal: ${err.message}`
    }, { status: 500 });
  }
}
