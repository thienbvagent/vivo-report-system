import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createSessionToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Vui lòng nhập đầy đủ Mã TTBH và Mật khẩu.' }, { status: 400 });
    }

    const authResult = await authenticateUser(username, password);
    if (!authResult.success || !authResult.session) {
      return NextResponse.json({ success: false, error: authResult.error || 'Đăng nhập thất bại.' }, { status: 401 });
    }

    const token = await createSessionToken(authResult.session.centerCode);
    const res = NextResponse.json({
      success: true,
      user: authResult.session
    });

    const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim();
    const isHttps = forwardedProto === 'https' || req.nextUrl.protocol === 'https:';

    res.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 7 ngày
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
