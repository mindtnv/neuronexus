import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const web = resolve(root, 'apps/web');
const host = process.env.DESIGN_HOST ?? '127.0.0.1';
if (process.env.NODE_ENV === 'production') throw new Error('Local design server is development-only');
const database = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.pathname !== '/reomi_design') {
  throw new Error('Use the dedicated local reomi_design database in .env.design');
}
const env = { ...process.env, NODE_ENV: 'development', DESIGN_PREVIEW: '1', DESIGN_HOST: host, SERWIST_SUPPRESS_TURBOPACK_WARNING: '1' };
const children = [
  spawn(process.execPath, ['--watch', resolve(root, 'apps/api/src/index.ts')], { cwd: root, env, stdio: 'inherit' }),
  spawn('node', [resolve(web, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', host, '--port', '4311'], { cwd: web, env, stdio: 'inherit' }),
];
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of children) if (child.exitCode === null) child.kill('SIGTERM'); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
for (const child of children) {
  child.on('error', error => { console.error(error.message); process.exitCode = 1; stop(); });
  child.on('exit', code => { if (!stopping) { process.exitCode = code ?? 1; stop(); } });
}
console.log(`Local app: http://${host}:4311 — real API + PostgreSQL, changes persist.`);
