interface AttemptRecord {
  count: number;
  firstAttemptTime: number;
  blockedUntil: number | null;
}

const attempts = new Map<string, AttemptRecord>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute
const BLOCK_DURATION_MS = 60 * 1000; // 1 minute block

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record) {
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  // Check if currently blocked
  if (record.blockedUntil && record.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  // Check if window has expired
  if (now - record.firstAttemptTime > WINDOW_MS) {
    attempts.delete(key);
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - record.count);
  return {
    allowed: record.count < MAX_ATTEMPTS,
    remaining,
    retryAfterSeconds: 0
  };
}

export function recordFailedAttempt(key: string): RateLimitResult {
  const now = Date.now();
  let record = attempts.get(key);

  if (!record || now - record.firstAttemptTime > WINDOW_MS) {
    record = {
      count: 1,
      firstAttemptTime: now,
      blockedUntil: null
    };
    attempts.set(key, record);
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterSeconds: 0 };
  }

  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    const retryAfterSeconds = Math.ceil(BLOCK_DURATION_MS / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - record.count,
    retryAfterSeconds: 0
  };
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

export function clearAllRateLimits(): void {
  attempts.clear();
}
