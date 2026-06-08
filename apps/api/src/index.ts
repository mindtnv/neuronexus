import { closeDb } from '@neuronexus/db';
import { buildApp, type App } from './app.ts';
import { env } from './env.ts';
import { rootLogger } from './logger.ts';
import { drainIndexQueue, reconcileOnStartup } from './ai/index-queue.ts';

const app = buildApp().listen(env.PORT, () => {
  rootLogger.info(
    { port: env.PORT, corsOrigin: env.WEB_ORIGIN, nodeEnv: env.NODE_ENV },
    'api.listening',
  );
  // RAG index reconciliation (Slice 3): index any card with no chunk or a stale
  // sourceHash. Guarded by the embedding switch + never throws into here.
  void reconcileOnStartup();
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  rootLogger.info({ signal }, 'api.shutdown.start');
  // Drain pending embeds (Slice 3) BEFORE the server + pool close, so in-flight
  // index work finishes (or times out — a timeout is logged, not fatal: the next
  // startup reconcile picks up the remainder). 4s budget fits stop_grace_period ≥5s.
  try {
    await drainIndexQueue({ timeoutMs: 4000 });
  } catch (err) {
    rootLogger.error({ err }, 'api.shutdown.drain_error');
  }
  try {
    await app.stop();
  } catch (err) {
    rootLogger.error({ err }, 'api.shutdown.server_stop_error');
  }
  try {
    await closeDb();
  } catch (err) {
    rootLogger.error({ err }, 'api.shutdown.db_close_error');
  }
  rootLogger.info('api.shutdown.done');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Exported *type only* — the Eden Treaty client in apps/web imports this to
// derive end-to-end route types. No runtime shape ever crosses the boundary.
export type { App };
void app;
