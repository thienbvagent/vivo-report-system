import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const standaloneRoot = join(projectRoot, '.next', 'standalone');

if (!existsSync(standaloneRoot)) {
  throw new Error('Không tìm thấy .next/standalone. Hãy chạy next build trước.');
}

const publicDir = join(projectRoot, 'public');
if (existsSync(publicDir)) {
  cpSync(publicDir, join(standaloneRoot, 'public'), { recursive: true, force: true });
}

const staticDir = join(projectRoot, '.next', 'static');
const standaloneStaticDir = join(standaloneRoot, '.next', 'static');
mkdirSync(join(standaloneRoot, '.next'), { recursive: true });
cpSync(staticDir, standaloneStaticDir, { recursive: true, force: true });
