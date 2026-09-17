import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';
import { revokeToken } from '@/lib/db-storage';
import { jwtVerify } from 'jose';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    try {
      const secretStr = process.env.SESSION_SECRET || '';
      if (secretStr.length >= 32) {
        const secret = new TextEncoder().encode(secretStr);
        const { payload } = await jwtVerify(token, secret);
        if (payload.jti && payload.centerCode) {
          const exp = payload.exp || Math.floor(Date.now() / 1000) + 7 * 86400;
          revokeToken(payload.jti as string, payload.centerCode as string, exp);
        }
      }
    } catch {}
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/'
  });
  return res;
}

