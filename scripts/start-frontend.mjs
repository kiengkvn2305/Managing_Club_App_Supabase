import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, npmArgs } from './runtime.mjs';

const frontend = join(root, 'frontend');
if (!existsSync(join(frontend, 'node_modules'))) {
  console.log('Chưa có frontend dependencies; chạy npm ci...');
  const install = spawn(process.execPath, npmArgs(['ci']), { cwd: frontend, stdio: 'inherit', windowsHide: true });
  await new Promise((resolve, reject) => { install.once('error', reject); install.once('exit', (code) => code ? reject(new Error(`npm ci thất bại (${code})`)) : resolve()); });
}

console.log('FCMS PRO Supabase frontend: http://127.0.0.1:5173');
console.log('Nhấn Ctrl+C để dừng. Cấu hình frontend/.env.local để kết nối Supabase.');
const child = spawn(process.execPath, npmArgs(['run', 'dev']), { cwd: frontend, stdio: 'inherit', windowsHide: true });
const stop = () => { if (!child.killed) child.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.once('exit', (code) => { process.exitCode = code || 0; });
