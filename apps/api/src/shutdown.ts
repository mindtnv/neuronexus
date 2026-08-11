import type { Logger } from 'pino';
import { safeError } from './logger.ts';
import { markRuntimeShuttingDown } from './runtime-state.ts';

export type ShutdownOutcome = 'drained' | 'failed' | 'timed_out';

export interface ShutdownResult {
  cause: string;
  exitCode: number;
  outcomes: Record<string, ShutdownOutcome>;
}

export interface ShutdownCoordinator {
  shutdown(cause: string, exitCode?: number): Promise<ShutdownResult>;
}

interface ShutdownDependencies {
  logger: Logger;
  timeoutMs: number;
  stopServer: () => Promise<unknown>;
  workers: Record<string, (timeoutMs: number) => Promise<unknown>>;
  closeDb: () => Promise<unknown>;
  exit: (code: number) => void;
  now?: () => number;
}

async function runWithinDeadline(
  operation: () => Promise<unknown>,
  deadlineAt: number,
  now: () => number,
): Promise<{ outcome: ShutdownOutcome; error?: unknown }> {
  const remaining = Math.max(0, deadlineAt - now());
  if (remaining <= 0) return { outcome: 'timed_out' };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const operationResult = Promise.resolve()
    .then(operation)
    .then(() => ({ outcome: 'drained' as const }))
    .catch((error) => ({ outcome: 'failed' as const, error }));
  const timeoutResult = new Promise<{ outcome: 'timed_out' }>((resolve) => {
    timer = setTimeout(() => resolve({ outcome: 'timed_out' }), remaining);
  });
  const result = await Promise.race([operationResult, timeoutResult]);
  if (timer) clearTimeout(timer);
  return result;
}

export function createShutdownCoordinator(deps: ShutdownDependencies): ShutdownCoordinator {
  const now = deps.now ?? Date.now;
  let requestedExitCode = 0;
  let shutdownPromise: Promise<ShutdownResult> | null = null;

  function shutdown(cause: string, exitCode = 0): Promise<ShutdownResult> {
    requestedExitCode = Math.max(requestedExitCode, exitCode);
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      const deadlineAt = now() + Math.max(1, deps.timeoutMs);
      const outcomes: Record<string, ShutdownOutcome> = {};
      markRuntimeShuttingDown(cause);
      deps.logger.info(
        { event: 'api.shutdown.start', cause, timeoutMs: deps.timeoutMs },
        'api.shutdown.start',
      );

      const server = await runWithinDeadline(deps.stopServer, deadlineAt, now);
      outcomes.server = server.outcome;
      if (server.error) {
        deps.logger.error({ component: 'server', err: safeError(server.error) }, 'api.shutdown.step_failed');
      }

      const workerEntries = Object.entries(deps.workers);
      const workerResults = await Promise.all(
        workerEntries.map(async ([name, drain]) => {
          const remaining = Math.max(0, deadlineAt - now());
          const result = await runWithinDeadline(() => drain(remaining), deadlineAt, now);
          return [name, result] as const;
        }),
      );
      for (const [name, result] of workerResults) {
        outcomes[name] = result.outcome;
        if (result.error) {
          deps.logger.error(
            { component: name, err: safeError(result.error) },
            'api.shutdown.step_failed',
          );
        }
      }

      const database = await runWithinDeadline(deps.closeDb, deadlineAt, now);
      outcomes.database = database.outcome;
      if (database.error) {
        deps.logger.error(
          { component: 'database', err: safeError(database.error) },
          'api.shutdown.step_failed',
        );
      }

      const result: ShutdownResult = { cause, exitCode: requestedExitCode, outcomes };
      deps.logger.info(
        { event: 'api.shutdown.completed', ...result },
        'api.shutdown.completed',
      );
      deps.exit(requestedExitCode);
      return result;
    })();

    return shutdownPromise;
  }

  return { shutdown };
}

export function createProcessFailureHandlers(deps: {
  logger: Logger;
  shutdown: (cause: string, exitCode: number) => Promise<unknown>;
}) {
  const fatal = (cause: 'uncaughtException' | 'unhandledRejection', reason: unknown) => {
    deps.logger.fatal(
      { event: 'process.fatal', cause, err: safeError(reason) },
      'process.fatal',
    );
    void deps.shutdown(cause, 1);
  };

  return {
    sigterm: () => void deps.shutdown('SIGTERM', 0),
    sigint: () => void deps.shutdown('SIGINT', 0),
    uncaughtException: (error: unknown) => fatal('uncaughtException', error),
    unhandledRejection: (reason: unknown) => fatal('unhandledRejection', reason),
  };
}
