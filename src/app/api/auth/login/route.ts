import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createSessionToken, AUTH_COOKIE_NAME } from '@/lib/auth';
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '@/lib/rate-limiter';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Vui lòng nhập đầy đủ Mã TTBH và Mật khẩu.' }, { status: 400 });
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const rateLimitKey = `${clientIp}:${(username || '').trim().toUpperCase()}`;

    const rateCheck = checkRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${rateCheck.retryAfterSeconds} giây.`
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateCheck.retryAfterSeconds) }
        }
      );
    }

    const authResult = await authenticateUser(username, password);
    if (!authResult.success || !authResult.session) {
      const failRes = recordFailedAttempt(rateLimitKey);
      const remainingMsg = failRes.allowed ? ` (Còn ${failRes.remaining} lần thử)` : '';
      return NextResponse.json(
        { success: false, error: (authResult.error || 'Đăng nhập thất bại.') + remainingMsg },
        { status: 401 }
      );
    }

    // Reset rate limit on successful authentication
    resetRateLimit(rateLimitKey);

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
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống khi xử lý đăng nhập.' }, { status: 500 });
  }
}
