import { NextResponse } from 'next/server';

export class SafeClientError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'SafeClientError';
    this.statusCode = statusCode;
  }
}

/**
 * Kiểm tra xem một thông báo lỗi có an toàn để hiển thị cho người dùng không.
 * Chặn hoàn toàn:
 * - Đường dẫn file Windows (C:\..., D:\...) hoặc Linux (/usr/..., /var/..., /home/...)
 * - URL và địa chỉ IP kèm port (http://, https://, 127.0.0.1...)
 * - Cú pháp SQL, tên bảng SQLite, lỗi ràng buộc cơ sở dữ liệu
 * - Từ khóa nhạy cảm: secret, token, password, webhook, credential, bearer
 * - Tên lỗi kỹ thuật: TypeError, ReferenceError, RangeError, SyntaxError, ERR_...
 * - Stack trace hoặc mã lỗi mạng: ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET
 */
export function isSafeErrorMessage(msg: unknown): boolean {
  if (!msg || typeof msg !== 'string') return false;

  const unsafePatterns: RegExp[] = [
    /[a-zA-Z]:\\[^ \n]+/,
    /\/(usr|etc|opt|var|home|root|app|node_modules|scratch)\/[^ \n]+/,
    /https?:\/\/[^\s]+/i,
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b/,
    /\b(SELECT|INSERT|UPDATE|DELETE|PRAGMA|sqlite|sqlite3|sqlite_master|foreign key|constraint|table|column)\b/i,
    /\b(secret|token|password|webhook|credential|bearer|session_secret)\b/i,
    /\b(TypeError|ReferenceError|RangeError|SyntaxError|UnhandledPromiseRejection|UnhandledError)\b/i,
    /\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EADDRINUSE|ERR_[A-Z_]+)\b/i,
    /\s+at\s+/,
    /failed to allocate memory/i,
  ];

  for (const pattern of unsafePatterns) {
    if (pattern.test(msg)) return false;
  }

  return true;
}

/**
 * Làm sạch chuỗi thông báo lỗi, trả về fallback nếu chuỗi chứa thông tin nhạy cảm hoặc kỹ thuật nội bộ.
 */
export function sanitizeErrorMessage(msg: unknown, fallback: string): string {
  if (typeof msg === 'string' && msg.trim() && isSafeErrorMessage(msg)) {
    return msg.trim();
  }
  return fallback;
}

/**
 * Xử lý an toàn các lỗi trong catch block của API route:
 * - Ghi log chi tiết trên máy chủ phục vụ debug.
 * - Chỉ trả về thông điệp lỗi cho client nếu đó là SafeClientError hoặc thông điệp đã được xác minh an toàn.
 * - Không bao giờ để lộ SQL query, file path, stack trace hoặc upstream secret ra client.
 */
export function handleApiError(
  err: unknown,
  fallbackMessage = 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng thử lại sau.',
  defaultStatusCode = 500
): NextResponse {
  console.error('[API Error]:', err);

  if (err instanceof SafeClientError) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: err.statusCode }
    );
  }

  if (err instanceof Error) {
    const msg = err.message || '';
    if (isSafeErrorMessage(msg) && defaultStatusCode < 500) {
      return NextResponse.json(
        { success: false, error: msg },
        { status: defaultStatusCode }
      );
    }
  }

  return NextResponse.json(
    { success: false, error: fallbackMessage },
    { status: defaultStatusCode }
  );
}
