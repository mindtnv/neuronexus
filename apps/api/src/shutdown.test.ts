import { describe, expect, test } from 'bun:test';
import pino, { type Logger } from 'pino';
import { createLoggerOptions } from './logger.ts';
import { createProcessFailureHandlers, createShutdownCoordinator } from './shutdown.ts';
import { markRuntimeRunning } from './runtime-state.ts';

function captureLogger(): { log: Logger; rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  return {
    log: pino(createLoggerOptions({ nodeEnv: 'production', level: 'debug' }), {
      write: (chunk: string) => rows.push(JSON.parse(chunk) as Record<string, unknown>),
    }),
    rows,
  };
}

describe('shared-deadline shutdown', () => {
  test('drains workers concurrently and reports per-component outcomes', async () => {
    markRuntimeRunning();
    const { log } = captureLogger();
    const started: string[] = [];
    const exited: number[] = [];
    const coordinator = createShutdownCoordinator({
      logger: log,
      timeoutMs: 100,
      stopServer: async () => started.push('server'),
      workers: {
        index: async () => {
          started.push('index');
          await Bun.sleep(15);
        },
        sourceIngest: async () => {
          started.push('source');
          await Bun.sleep(15);
        },
        artifact: async () => started.push('artifact'),
      },
      closeDb: async () => started.push('db'),
      exit: (code) => exited.push(code),
    });

    const before = performance.now();
    const result = await coordinator.shutdown('SIGTERM');
    const elapsed = performance.now() - before;

    expect(elapsed).toBeLessThan(70);
    expect(started.slice(1, 4).sort()).toEqual(['artifact', 'index', 'source']);
    expect(result.outcomes).toEqual({
      server: 'drained',
      index: 'drained',
      sourceIngest: 'drained',
      artifact: 'drained',
      database: 'drained',
    });
    expect(exited).toEqual([0]);
  });

  test('uses one deadline and does not grant the database another timeout window', async () => {
    markRuntimeRunning();
    const { log } = captureLogger();
    let closeCalls = 0;
    const coordinator = createShutdownCoordinator({
      logger: log,
      timeoutMs: 20,
      stopServer: async () => {},
      workers: {
        index: async () => new Promise<void>(() => {}),
        sourceIngest: async () => {},
      },
      closeDb: async () => {
        closeCalls += 1;
      },
      exit: () => {},
    });

    const before = performance.now();
    const result = await coordinator.shutdown('SIGINT');
    const elapsed = performance.now() - before;

    expect(elapsed).toBeLessThan(60);
    expect(result.outcomes.index).toBe('timed_out');
    expect(result.outcomes.database).toBe('timed_out');
    expect(closeCalls).toBe(0);
  });

  test('memoizes a racing shutdown and escalates the final exit code', async () => {
    markRuntimeRunning();
    const { log } = captureLogger();
    let drainCalls = 0;
    const exited: number[] = [];
    const coordinator = createShutdownCoordinator({
      logger: log,
      timeoutMs: 100,
      stopServer: async () => {},
      workers: {
        index: async () => {
          drainCalls += 1;
          await Bun.sleep(5);
        },
      },
      closeDb: async () => {},
      exit: (code) => exited.push(code),
    });

    const first = coordinator.shutdown('SIGTERM');
    const second = coordinator.shutdown('uncaughtException', 1);
    expect(first).toBe(second);
    const result = await first;

    expect(drainCalls).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(exited).toEqual([1]);
  });
});

describe('fatal process handlers', () => {
  test('logs bounded fatal errors and routes every cause to the coordinator', async () => {
    const { log, rows } = captureLogger();
    const calls: Array<[string, number]> = [];
    const handlers = createProcessFailureHandlers({
      logger: log,
      shutdown: (cause, exitCode) => {
        calls.push([cause, exitCode]);
        return Promise.resolve(undefined);
      },
    });

    handlers.unhandledRejection({ password: 'secret', prompt: 'private card' });
    handlers.uncaughtException(new Error(`Bearer hidden ${'x'.repeat(1000)}`));
    handlers.sigterm();
    await Bun.sleep(0);

    expect(calls).toEqual([
      ['unhandledRejection', 1],
      ['uncaughtException', 1],
      ['SIGTERM', 0],
    ]);
    const fatal = rows.filter((row) => row.event === 'process.fatal');
    expect(fatal).toHaveLength(2);
    expect(JSON.stringify(fatal)).not.toContain('secret');
    expect(JSON.stringify(fatal)).not.toContain('private card');
    expect(JSON.stringify(fatal)).not.toContain('hidden');
  });
});
