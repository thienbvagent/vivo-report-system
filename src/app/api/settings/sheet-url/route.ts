import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { updateUserSheetUrl } from '@/lib/db-storage';

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const { sheetUrl } = await req.json();
    const cleanUrl = typeof sheetUrl === 'string' ? sheetUrl.trim() : '';
    updateUserSheetUrl(session.centerCode, cleanUrl);

    return NextResponse.json({
      success: true,
      sheetUrl: cleanUrl
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
