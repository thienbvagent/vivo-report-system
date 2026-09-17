import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { checkRateLimit, recordFailedAttempt, resetRateLimit, clearAllRateLimits } from '../src/lib/rate-limiter';
import { initDatabase, findUserByCode, updateUserPassword, closeDb } from '../src/lib/db-storage';
import { authenticateUser, hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '../src/lib/auth';

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
  assert.strictEqual(authNew.session?.mustChangePassword, false);
});

test('Session Token: kiểm tra tạo token, thu hồi qua JTI và hủy hiệu lực khi đổi mật khẩu', async () => {
  initDatabase();
  const centerCode = 'R4001008';

  // 1. Tạo session token cho centerCode
  const token = await createSessionToken(centerCode);
  assert.ok(typeof token === 'string' && token.length > 20);

  // 2. Verify thành công khi token còn hiệu lực
  const sessionValid = await verifySessionToken(token);
  assert.ok(sessionValid);
  assert.strictEqual(sessionValid?.centerCode, centerCode);

  // 3. Đổi mật khẩu -> token_version tăng -> token cũ lập tức bị vô hiệu hóa
  const newHash = await hashPassword('AnotherPassword_2026!');
  updateUserPassword(centerCode, newHash);

  const sessionAfterPasswordChange = await verifySessionToken(token);
  assert.strictEqual(sessionAfterPasswordChange, null, 'Token cũ phải bị vô hiệu hóa sau khi đổi mật khẩu');

  // 4. Tạo token mới và thu hồi qua JTI (logout)
  const tokenNew = await createSessionToken(centerCode);
  const sessionNew = await verifySessionToken(tokenNew);
  assert.ok(sessionNew, 'Token mới phải hợp lệ');

  // Giải mã payload để lấy JTI
  const parts = tokenNew.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  assert.ok(payload.jti, 'Token phải có jti');

  // Thu hồi token qua revokeToken
  const { revokeToken } = await import('../src/lib/db-storage');
  revokeToken(payload.jti, centerCode, payload.exp);

  // Xác thực lại -> phải bị từ chối
  const sessionRevoked = await verifySessionToken(tokenNew);
  assert.strictEqual(sessionRevoked, null, 'Token đã thu hồi qua JTI phải bị từ chối');
});

test('Rate Limiter: dữ liệu được lưu bền vững vào SQLite và truy vấn chính xác', () => {
  const { getRateLimitRecord } = require('../src/lib/db-storage');
  const key = 'test_sqlite_persistence_key';

  recordFailedAttempt(key);
  recordFailedAttempt(key);

  const dbRow = getRateLimitRecord(key);
  assert.ok(dbRow, 'Bản ghi phải tồn tại trong SQLite');
  assert.strictEqual(dbRow.count, 2);

  const check = checkRateLimit(key);
  assert.strictEqual(check.allowed, true);
  assert.strictEqual(check.remaining, 3);

  resetRateLimit(key);
  const dbRowAfter = getRateLimitRecord(key);
  assert.strictEqual(dbRowAfter, null, 'Sau khi reset, bản ghi phải bị xóa khỏi SQLite');
});

test('API Error Sanitization: ngăn chặn rò rỉ đường dẫn, SQL, IP, URL và upstream secrets', () => {
  const { isSafeErrorMessage, sanitizeErrorMessage, handleApiError, SafeClientError } = require('../src/lib/api-errors');

  // 1. Kiểm tra các chuỗi lỗi chứa thông tin nhạy cảm
  assert.strictEqual(isSafeErrorMessage('Lỗi đọc file tại C:\\Users\\Administrator\\data.sqlite'), false);
  assert.strictEqual(isSafeErrorMessage('Error in /var/www/vivo-report-system/server.js:45'), false);
  assert.strictEqual(isSafeErrorMessage('SQLITE_ERROR: no such table: reports (SELECT * FROM reports)'), false);
  assert.strictEqual(isSafeErrorMessage('Failed to post to https://n8n.internal.server:5678/webhook/secret-token'), false);
  assert.strictEqual(isSafeErrorMessage('connect ECONNREFUSED 127.0.0.1:5678'), false);
  assert.strictEqual(isSafeErrorMessage('TypeError: Cannot read properties of undefined (reading "rows")'), false);
  assert.strictEqual(isSafeErrorMessage('Error with SESSION_SECRET token validation'), false);

  // 2. Kiểm tra chuỗi lỗi thân thiện an toàn cho người dùng
  assert.strictEqual(isSafeErrorMessage('Vui lòng chọn ngày báo cáo để xuất.'), true);
  assert.strictEqual(isSafeErrorMessage('Không có dữ liệu hợp lệ trong file Excel.'), true);
  assert.strictEqual(isSafeErrorMessage('Đã làm mới dữ liệu thành công.'), true);

  // 3. Kiểm tra hàm sanitizeErrorMessage
  const fallback = 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng thử lại sau.';
  assert.strictEqual(
    sanitizeErrorMessage('Error in C:\\app\\secret.ts', fallback),
    fallback
  );
  assert.strictEqual(
    sanitizeErrorMessage('Dữ liệu không hợp lệ.', fallback),
    'Dữ liệu không hợp lệ.'
  );

  // 4. Kiểm tra handleApiError
  const unsafeErr = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: reports.id at C:\\app\\db.ts');
  const safeRes = handleApiError(unsafeErr, fallback, 500);
  assert.strictEqual(safeRes.status, 500);

  const safeClientErr = new SafeClientError('Mã TTBH không tồn tại.', 404);
  const clientRes = handleApiError(safeClientErr);
  assert.strictEqual(clientRes.status, 404);
});

test.after(() => {

  closeDb();
  if (fs.existsSync(testDataDir)) {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  }
});
