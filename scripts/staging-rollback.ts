import { getBoolArg, loadEnvFile, compose, parseArgs, printJson, readState, resolveReleaseContext, restoreDbBackup, waitForUrl, writeState } from './staging-lib.ts';

const rawArgs = parseArgs(Bun.argv.slice(2));
const args = resolveReleaseContext(rawArgs);

async function main() {
  const env = loadEnvFile(args.envFile);
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is missing from ${args.envFile}`);
  }

  const state = readState(args.stateFile);
  if (!state.previous) {
    throw new Error('No previous staging release is recorded, rollback is unavailable');
  }

  const rollbackTarget = state.previous;
  const shouldRestoreDb = getBoolArg(rawArgs, 'restore-db');
  const restorePath = state.pendingRollback?.backupPath ?? null;

  compose(args, ['stop', 'api', 'web']);
  compose({ ...args, worktreeDir: rollbackTarget.worktreeDir }, ['up', '-d', 'postgres']);

  if (shouldRestoreDb) {
    if (!restorePath) {
      throw new Error('No rollback backup is recorded for this release');
    }
    restoreDbBackup({ ...args, worktreeDir: rollbackTarget.worktreeDir }, databaseUrl, restorePath);
  }

  compose({ ...args, worktreeDir: rollbackTarget.worktreeDir }, ['up', '-d', 'api', 'web']);

  await waitForUrl(args.apiHealthUrl, 'rolled back api');
  await waitForUrl(args.webReadyUrl, 'rolled back web');

  writeState(args.stateFile, {
    current: rollbackTarget,
    previous: null,
    pendingRollback: null,
  });

  printJson({
    ok: true,
    rolledBackToSha: rollbackTarget.sha,
    restoredDatabase: shouldRestoreDb,
    backupPath: restorePath,
  });
}

await main();
