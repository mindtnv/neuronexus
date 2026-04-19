import { closeDb } from '@neuronexus/db';
import { buildApp, type App } from './app.ts';
import { env } from './env.ts';
import { getRootLogger } from './logger.ts';

const rootLogger = getRootLogger();

const app = buildApp().listen(env.PORT, () => {
  rootLogger.info(
    { port: env.PORT, corsOrigin: env.WEB_ORIGIN, nodeEnv: env.NODE_ENV },
    'api.listening',
  );
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  rootLogger.info({ signal }, 'api.shutdown.start');
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
