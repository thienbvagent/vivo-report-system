import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createSessionToken, AUTH_COOKIE_NAME } from '@/lib/auth';
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '@/lib/rate-limiter';

function getClientIp(req: NextRequest): string {
  // Ưu tiên header X-Real-IP do Nginx reverse proxy thiết lập trực tiếp từ $remote_addr
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  // Nếu qua chuỗi proxy, lấy IP đầu tiên
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[0];
  }

  return '127.0.0.1';
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Vui lòng nhập đầy đủ Mã TTBH và Mật khẩu.' }, { status: 400 });
    }

    const clientIp = getClientIp(req);
    const normalizedUser = (username || '').trim().toUpperCase();
    const rateLimitKey = `${clientIp}:${normalizedUser}`;
    const accountKey = `account:${normalizedUser}`;
    const ipKey = `ip:${clientIp}`;

    const rateCheckPair = checkRateLimit(rateLimitKey, 5);
    const rateCheckAccount = checkRateLimit(accountKey, 5);
    const rateCheckIp = checkRateLimit(ipKey, 20);

    const activeBlock = !rateCheckPair.allowed
      ? rateCheckPair
      : !rateCheckAccount.allowed
      ? rateCheckAccount
      : !rateCheckIp.allowed
      ? rateCheckIp
      : null;

    if (activeBlock) {
      return NextResponse.json(
        {
          success: false,
          error: `Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${activeBlock.retryAfterSeconds} giây.`
        },
        {
          status: 429,
          headers: { 'Retry-After': String(activeBlock.retryAfterSeconds) }
        }
      );
    }

    const authResult = await authenticateUser(username, password);
    if (!authResult.success || !authResult.session) {
      const failPair = recordFailedAttempt(rateLimitKey, 5);
      recordFailedAttempt(accountKey, 5);
      recordFailedAttempt(ipKey, 20);

      const remainingMsg = failPair.allowed ? ` (Còn ${failPair.remaining} lần thử)` : '';
      return NextResponse.json(
        { success: false, error: (authResult.error || 'Đăng nhập thất bại.') + remainingMsg },
        { status: 401 }
      );
    }

    // Reset rate limit on successful authentication
    resetRateLimit(rateLimitKey);
    resetRateLimit(accountKey);
    resetRateLimit(ipKey);


    const token = await createSessionToken(authResult.session.centerCode);
    const res = NextResponse.json({
      success: true,
      user: authResult.session
    });

    const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim();
    const isHttps = forwardedProto === 'https' || req.nextUrl.protocol === 'https:' || process.env.NODE_ENV === 'production';

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
