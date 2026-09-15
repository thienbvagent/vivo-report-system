import crypto from 'crypto';

export function calculateFileHash(buffer: Buffer | ArrayBuffer): string {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(buffer)) {
    hash.update(buffer);
  } else {
    hash.update(Buffer.from(buffer));
  }
  return hash.digest('hex');
}
