import {
  getRateLimitRecord,
  saveRateLimitRecord,
  deleteRateLimitRecord,
  clearAllRateLimitsFromDb
} from './db-storage';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute
const BLOCK_DURATION_MS = 60 * 1000; // 1 minute block

export function checkRateLimit(key: string, maxAttempts = DEFAULT_MAX_ATTEMPTS): RateLimitResult {
  const now = Date.now();
  const record = getRateLimitRecord(key);

  if (!record) {
    return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 };
  }

  // Check if currently blocked
  if (record.blocked_until && record.blocked_until > now) {
    const retryAfterSeconds = Math.ceil((record.blocked_until - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  // Check if window has expired
  if (now - record.first_attempt_time > WINDOW_MS) {
    deleteRateLimitRecord(key);
    return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 };
  }

  const remaining = Math.max(0, maxAttempts - record.count);
  return {
    allowed: record.count < maxAttempts,
    remaining,
    retryAfterSeconds: 0
  };
}

export function recordFailedAttempt(
  key: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowMs = WINDOW_MS,
  blockDurationMs = BLOCK_DURATION_MS
): RateLimitResult {
  const now = Date.now();
  const record = getRateLimitRecord(key);

  if (!record || now - record.first_attempt_time > windowMs) {
    saveRateLimitRecord(key, 1, now, null);
    return { allowed: true, remaining: maxAttempts - 1, retryAfterSeconds: 0 };
  }

  const newCount = record.count + 1;
  if (newCount >= maxAttempts) {
    const blockedUntil = now + blockDurationMs;
    saveRateLimitRecord(key, newCount, record.first_attempt_time, blockedUntil);
    const retryAfterSeconds = Math.ceil(blockDurationMs / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  saveRateLimitRecord(key, newCount, record.first_attempt_time, null);
  return {
    allowed: true,
    remaining: maxAttempts - newCount,
    retryAfterSeconds: 0
  };
}

export function resetRateLimit(key: string): void {
  deleteRateLimitRecord(key);
}

export function clearAllRateLimits(): void {
  clearAllRateLimitsFromDb();
}

