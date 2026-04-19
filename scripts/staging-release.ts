import { loadEnvFile, ensureWorktree, compose, createDbBackup, ensureDir, parseArgs, printJson, readState, resolveReleaseContext, waitForDatabase, waitForUrl, writeState } from './staging-lib.ts';
import { join } from 'node:path';

const args = resolveReleaseContext(parseArgs(Bun.argv.slice(2)));

async function main() {
  const env = loadEnvFile(args.envFile);
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is missing from ${args.envFile}`);
  }

  ensureWorktree(args.releaseSha, args.worktreeDir);
  ensureDir(join(process.cwd(), '.staging/backups'));

  const state = readState(args.stateFile);
  const backupPath = join(process.cwd(), '.staging/backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${args.releaseSha}.dump`);

  compose(args, ['up', '-d', 'postgres']);
  await waitForDatabase(args, databaseUrl);
  createDbBackup(args, databaseUrl, backupPath);
  compose(args, ['run', '--rm', 'migrate']);
  compose(args, ['up', '-d', 'api', 'web']);

  await waitForUrl(args.apiHealthUrl, 'staging api');
  await waitForUrl(args.webReadyUrl, 'staging web');

  writeState(args.stateFile, {
    current: {
      sha: args.releaseSha,
      worktreeDir: args.worktreeDir,
      deployedAt: new Date().toISOString(),
    },
    previous: state.current,
    pendingRollback: {
      backupPath,
      fromSha: state.current?.sha ?? null,
      toSha: args.releaseSha,
      createdAt: new Date().toISOString(),
    },
  });

  printJson({
    ok: true,
    releaseSha: args.releaseSha,
    projectName: args.projectName,
    envFile: args.envFile,
    worktreeDir: args.worktreeDir,
    backupPath,
    previousReleaseSha: state.current?.sha ?? null,
    apiHealthUrl: args.apiHealthUrl,
    webReadyUrl: args.webReadyUrl,
  });
}

await main();
