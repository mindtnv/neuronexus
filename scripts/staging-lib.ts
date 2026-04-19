import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type ReleaseRecord = {
  sha: string;
  worktreeDir: string;
  deployedAt: string;
};

export type RollbackRecord = {
  backupPath: string;
  fromSha: string | null;
  toSha: string;
  createdAt: string;
};

export type StagingState = {
  current: ReleaseRecord | null;
  previous: ReleaseRecord | null;
  pendingRollback: RollbackRecord | null;
};

export type ReleaseContext = {
  envFile: string;
  projectName: string;
  repoRoot: string;
  releaseSha: string;
  stateFile: string;
  worktreeDir: string;
  apiHealthUrl: string;
  webReadyUrl: string;
};

export function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

export function getStringArg(args: Record<string, string | boolean>, key: string, fallback?: string) {
  const value = args[key];
  if (typeof value === 'string') return value;
  return fallback;
}

export function getBoolArg(args: Record<string, string | boolean>, key: string) {
  return args[key] === true || args[key] === 'true';
}

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function run(command: string[], opts?: { cwd?: string; env?: Record<string, string>; stdin?: string | Uint8Array | Blob }) {
  const proc = Bun.spawnSync(command, {
    cwd: opts?.cwd,
    env: opts?.env,
    stdin: opts?.stdin,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (proc.exitCode !== 0) {
    const stderr = new TextDecoder().decode(proc.stderr).trim();
    const stdout = new TextDecoder().decode(proc.stdout).trim();
    const detail = [stdout, stderr].filter(Boolean).join('\n');
    throw new Error(`Command failed (${command.join(' ')}): ${detail || `exit ${proc.exitCode}`}`);
  }
  return {
    stdout: new TextDecoder().decode(proc.stdout).trim(),
    stderr: new TextDecoder().decode(proc.stderr).trim(),
  };
}

function throwSpawnError(command: string[], proc: ReturnType<typeof Bun.spawnSync>) {
  const stderr = new TextDecoder().decode(proc.stderr).trim();
  const stdout = new TextDecoder().decode(proc.stdout).trim();
  const detail = [stdout, stderr].filter(Boolean).join('\n');
  throw new Error(`Command failed (${command.join(' ')}): ${detail || `exit ${proc.exitCode}`}`);
}

export function runShell(command: string, opts?: { cwd?: string; env?: Record<string, string> }) {
  return run(['sh', '-lc', command], opts);
}

export function resolveRepoPath(...parts: string[]) {
  return resolve(process.cwd(), ...parts);
}

export function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

export function ensureWorktree(ref: string, worktreeDir: string) {
  if (existsSync(worktreeDir)) return;
  ensureDir(dirname(worktreeDir));
  run(['git', 'worktree', 'prune']);
  run(['git', 'worktree', 'add', '--force', '--detach', worktreeDir, ref]);
}

export function loadEnvFile(path: string) {
  const file = readFileSync(path, 'utf8');
  const env: Record<string, string> = {};
  for (const rawLine of file.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function readState(stateFile: string): StagingState {
  if (!existsSync(stateFile)) {
    return { current: null, previous: null, pendingRollback: null };
  }
  return JSON.parse(readFileSync(stateFile, 'utf8')) as StagingState;
}

export function writeState(stateFile: string, state: StagingState) {
  ensureDir(dirname(stateFile));
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

export function buildComposeArgs(ctx: { envFile: string; projectName: string; worktreeDir: string }, extra: string[]) {
  return [
    'docker',
    'compose',
    '-p',
    ctx.projectName,
    '--env-file',
    ctx.envFile,
    '-f',
    join(ctx.worktreeDir, 'docker-compose.prod.yml'),
    ...extra,
  ];
}

function buildComposeEnv(envFile: string) {
  return {
    ...process.env,
    ...loadEnvFile(envFile),
  } as Record<string, string>;
}

export function compose(ctx: { envFile: string; projectName: string; worktreeDir: string }, extra: string[]) {
  return run(buildComposeArgs(ctx, extra), {
    env: buildComposeEnv(ctx.envFile),
  });
}

export function composeShell(ctx: { envFile: string; projectName: string; worktreeDir: string }, command: string) {
  const args = buildComposeArgs(ctx, ['run', '--rm', '-T', 'postgres', 'sh', '-lc', command]);
  return run(args);
}

export function parseDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    sslmode: url.searchParams.get('sslmode'),
  };
}

export function createDbBackup(ctx: { envFile: string; projectName: string; worktreeDir: string }, databaseUrl: string, backupPath: string) {
  const db = parseDatabaseUrl(databaseUrl);
  ensureDir(dirname(backupPath));
  const sslModeExport = db.sslmode ? `export PGSSLMODE=${shellQuote(db.sslmode)}; ` : '';
  const dumpCmd = [
    `${sslModeExport}export PGPASSWORD=${shellQuote(db.password)};`,
    `pg_dump -h ${shellQuote(db.host)} -p ${shellQuote(db.port)} -U ${shellQuote(db.user)} -d ${shellQuote(db.database)} -Fc`,
  ].join(' ');
  const command = buildComposeArgs(ctx, ['run', '--rm', '-T', 'postgres', 'sh', '-lc', dumpCmd]);
  const proc = Bun.spawnSync(command, {
    env: buildComposeEnv(ctx.envFile),
    stdout: Bun.file(backupPath),
    stderr: 'pipe',
  });
  if (proc.exitCode !== 0) {
    throwSpawnError(command, proc);
  }
}

export async function waitForDatabase(ctx: { envFile: string; projectName: string; worktreeDir: string }, databaseUrl: string, timeoutMs = 60_000) {
  const db = parseDatabaseUrl(databaseUrl);
  const sslModeExport = db.sslmode ? `export PGSSLMODE=${shellQuote(db.sslmode)}; ` : '';
  const command = buildComposeArgs(ctx, [
    'run',
    '--rm',
    '-T',
    'postgres',
    'sh',
    '-lc',
    `${sslModeExport}export PGPASSWORD=${shellQuote(db.password)}; pg_isready -h ${shellQuote(db.host)} -p ${shellQuote(db.port)} -U ${shellQuote(db.user)} -d ${shellQuote(db.database)}`,
  ]);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const proc = Bun.spawnSync(command, {
      env: buildComposeEnv(ctx.envFile),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (proc.exitCode === 0) return;
    await Bun.sleep(1_000);
  }
  throw new Error(`Timed out waiting for database readiness via ${databaseUrl}`);
}

export function restoreDbBackup(ctx: { envFile: string; projectName: string; worktreeDir: string }, databaseUrl: string, backupPath: string) {
  const db = parseDatabaseUrl(databaseUrl);
  const sslModeExport = db.sslmode ? `export PGSSLMODE=${shellQuote(db.sslmode)}; ` : '';
  const restoreCmd = [
    `${sslModeExport}export PGPASSWORD=${shellQuote(db.password)};`,
    `psql -v ON_ERROR_STOP=1 -h ${shellQuote(db.host)} -p ${shellQuote(db.port)} -U ${shellQuote(db.user)} -d ${shellQuote(db.database)} -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null;`,
    `pg_restore --clean --if-exists --no-owner --no-privileges -h ${shellQuote(db.host)} -p ${shellQuote(db.port)} -U ${shellQuote(db.user)} -d ${shellQuote(db.database)}`,
  ].join(' ');
  const command = buildComposeArgs(ctx, ['run', '--rm', '-T', 'postgres', 'sh', '-lc', restoreCmd]);
  const proc = Bun.spawnSync(command, {
    env: buildComposeEnv(ctx.envFile),
    stdin: Bun.file(backupPath),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (proc.exitCode !== 0) {
    throwSpawnError(command, proc);
  }
}

export async function waitForUrl(url: string, label: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      // Keep polling until the timeout expires.
    }
    await Bun.sleep(1_000);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

export function resolveReleaseContext(args: Record<string, string | boolean>) {
  const repoRoot = process.cwd();
  const ref = getStringArg(args, 'ref', 'HEAD')!;
  const envFile = resolveRepoPath(getStringArg(args, 'env-file', '.env.staging')!);
  const projectName = getStringArg(args, 'project-name', 'neuronexus-staging')!;
  const stateFile = resolveRepoPath(getStringArg(args, 'state-file', '.staging/state.json')!);
  const releaseSha = run(['git', 'rev-parse', ref]).stdout;
  const worktreeDir = resolveRepoPath('.staging/worktrees', releaseSha);
  const env = loadEnvFile(envFile);
  const apiBaseUrl = env.STAGING_API_URL ?? env.BETTER_AUTH_URL;
  const webBaseUrl = env.STAGING_WEB_URL ?? env.WEB_ORIGIN;
  if (!apiBaseUrl || !webBaseUrl) {
    throw new Error('Env file must define BETTER_AUTH_URL and WEB_ORIGIN, or explicit STAGING_API_URL/STAGING_WEB_URL');
  }
  return {
    envFile,
    projectName,
    repoRoot,
    releaseSha,
    stateFile,
    worktreeDir,
    apiHealthUrl: `${apiBaseUrl.replace(/\/$/, '')}/health`,
    webReadyUrl: `${webBaseUrl.replace(/\/$/, '')}/auth/sign-in`,
  } satisfies ReleaseContext;
}

export function printJson(payload: unknown) {
  console.log(JSON.stringify(payload, null, 2));
}
