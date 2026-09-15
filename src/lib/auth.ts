import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { getCenterName, isValidCenterCode } from './centers';
import { findUserByCode, initDatabase } from './db-storage';

function getJwtSecret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET phải được cấu hình và có ít nhất 32 ký tự.');
  }
  return new TextEncoder().encode(value);
}

export const AUTH_COOKIE_NAME = 'vivo_session_token';

export interface UserSession {
  centerCode: string;
  centerName: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSessionToken(centerCode: string): Promise<string> {
  const centerName = getCenterName(centerCode);
  return new SignJWT({ centerCode, centerName })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const centerCode = payload.centerCode as string;
    const centerName = payload.centerName as string;
    if (!centerCode || !isValidCenterCode(centerCode)) {
      return null;
    }
    return { centerCode, centerName };
  } catch {
    return null;
  }
}

export async function getCurrentSession(): Promise<UserSession | null> {
  initDatabase();
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function authenticateUser(centerCode: string, password: string): Promise<{ success: boolean; error?: string; session?: UserSession }> {
  initDatabase();
  const trimmedCode = centerCode.trim().toUpperCase();
  if (!isValidCenterCode(trimmedCode)) {
    return { success: false, error: 'Mã TTBH không tồn tại trong hệ thống.' };
  }

  const user = findUserByCode(trimmedCode);
  if (!user) {
    return { success: false, error: 'Không tìm thấy tài khoản cho TTBH này.' };
  }

  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    return { success: false, error: 'Mật khẩu không chính xác.' };
  }

  return {
    success: true,
    session: {
      centerCode: trimmedCode,
      centerName: getCenterName(trimmedCode)
    }
  };
}
