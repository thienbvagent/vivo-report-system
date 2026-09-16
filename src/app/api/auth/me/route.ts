import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { findUserByCode } from '@/lib/db-storage';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const user = findUserByCode(session.centerCode);
  return NextResponse.json({
    authenticated: true,
    user: {
      ...session,
      googleSheetUrl: user?.googleSheetUrl || ''
    }
  });
}
