import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { checkRateLimit, recordFailedAttempt, resetRateLimit, clearAllRateLimits } from '../src/lib/rate-limiter';
import { initDatabase, findUserByCode, updateUserPassword, closeDb } from '../src/lib/db-storage';
import { authenticateUser, hashPassword, verifyPassword } from '../src/lib/auth';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-auth-test-'));
process.env.DB_DIR = testDataDir;
process.env.INITIAL_CENTER_PASSWORD = 'TestPasswordOnly_2026!';
process.env.SESSION_SECRET = 'super_secret_session_key_test_at_least_32_characters_long';

test.beforeEach(() => {
  clearAllRateLimits();
});

test('Rate Limiter: cho phép 4 lần thử đầu và khóa ở lần thứ 5', () => {
  const key = '127.0.0.1:R4001003';

  // Lần 1: Được phép
  let res = checkRateLimit(key);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.remaining, 5);

  // Thử sai lần 1-4
  for (let i = 1; i <= 4; i++) {
    const record = recordFailedAttempt(key);
    assert.strictEqual(record.allowed, true);
    assert.strictEqual(record.remaining, 5 - i);
  }

  // Thử sai lần 5 -> Khóa
  const record5 = recordFailedAttempt(key);
  assert.strictEqual(record5.allowed, false);
  assert.strictEqual(record5.remaining, 0);
  assert.ok(record5.retryAfterSeconds > 0 && record5.retryAfterSeconds <= 60);

  // Kiểm tra lại trạng thái -> Bị chặn
  const checkBlocked = checkRateLimit(key);
  assert.strictEqual(checkBlocked.allowed, false);
  assert.strictEqual(checkBlocked.remaining, 0);

  // Reset sau khi đăng nhập thành công
  resetRateLimit(key);
  const checkReset = checkRateLimit(key);
  assert.strictEqual(checkReset.allowed, true);
  assert.strictEqual(checkReset.remaining, 5);
});

test('Đổi mật khẩu: Cập nhật mật khẩu trong SQLite và xác thực bằng mật khẩu mới', async () => {
  initDatabase();

  const centerCode = 'R4001003';
  const oldPassword = 'TestPasswordOnly_2026!';
  const newPassword = 'NewSecretPassword_2026!';

  // 1. Xác thực bằng mật khẩu ban đầu
  const authOld = await authenticateUser(centerCode, oldPassword);
  assert.strictEqual(authOld.success, true);

  // 2. Băm và cập nhật mật khẩu mới
  const newHash = await hashPassword(newPassword);
  const updated = updateUserPassword(centerCode, newHash);
  assert.strictEqual(updated, true);

  // 3. Mật khẩu cũ không còn đăng nhập được
  const authOldAgain = await authenticateUser(centerCode, oldPassword);
  assert.strictEqual(authOldAgain.success, false);
  assert.strictEqual(authOldAgain.error, 'Mật khẩu không chính xác.');

  // 4. Mật khẩu mới đăng nhập thành công
  const authNew = await authenticateUser(centerCode, newPassword);
  assert.strictEqual(authNew.success, true);
  assert.strictEqual(authNew.session?.centerCode, centerCode);

  // Đóng kết nối DB và dọn dẹp thư mục test
  closeDb();
  if (fs.existsSync(testDataDir)) {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  }
});
