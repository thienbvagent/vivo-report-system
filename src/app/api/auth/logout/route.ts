import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/'
  });
  return res;
}
