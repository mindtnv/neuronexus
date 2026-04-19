import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

type SmokeStage = 'auth' | 'bootstrap' | 'card_crud' | 'review' | 'profile_rollup';

class StageError extends Error {
  constructor(
    readonly stage: SmokeStage,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

type ManagedServer = {
  name: 'api' | 'web';
  baseUrl: string;
  reused: boolean;
  process: ChildProcess | null;
  logPath: string | null;
};

const repoRoot = process.cwd();
const apiPort = Number(process.env.SMOKE_API_PORT ?? 3000);
const webPort = Number(process.env.SMOKE_WEB_PORT ?? 3001);
const smokeHost = process.env.SMOKE_HOST ?? 'localhost';
const managedApiBaseUrl = process.env.SMOKE_API_BASE_URL?.replace(/\/$/, '');
const managedWebBaseUrl = process.env.SMOKE_WEB_BASE_URL?.replace(/\/$/, '');
const ignoreHttpsErrors = process.env.SMOKE_IGNORE_HTTPS_ERRORS === 'true';
const apiBaseUrl = managedApiBaseUrl ?? `http://${smokeHost}:${apiPort}`;
const webBaseUrl = managedWebBaseUrl ?? `http://${smokeHost}:${webPort}`;
const requireTraceEvents =
  process.env.SMOKE_REQUIRE_TRACE === 'true' ||
  (!managedApiBaseUrl && !managedWebBaseUrl);
const smokeDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const scenarioId = process.env.SMOKE_SCENARIO_ID ?? `learner-smoke-${Date.now()}`;
const smokeClientIp = process.env.SMOKE_CLIENT_IP ?? `203.0.113.${(Date.now() % 200) + 1}`;
const runDir = mkdtempSync(join(tmpdir(), 'neuronexus-smoke-'));
const screenshotPath = join(runDir, 'failure.png');
const summaryPath = join(runDir, 'summary.json');
const apiHealthUrl = `${apiBaseUrl}/health`;
const webReadyUrl = `${webBaseUrl}/auth/sign-in`;

let browserContext: BrowserContext | null = null;
let apiServer: ManagedServer | null = null;
let webServer: ManagedServer | null = null;

const browserTraceEvents = new Set<string>();
const useRemoteAuthBootstrap = !!managedApiBaseUrl && !!managedWebBaseUrl;

function appendLine(path: string, line: string) {
  appendFileSync(path, `${new Date().toISOString()} ${line}\n`);
}

async function delay(ms: number) {
  return await new Promise((resolve) => setTimeout(resolve, ms));
}

function smokeFetch(input: string | URL | Request, init?: RequestInit) {
  return fetch(input, {
    ...init,
    ...(ignoreHttpsErrors ? { tls: { rejectUnauthorized: false } } : {}),
  } as RequestInit);
}

async function isReady(url: string) {
  try {
    const res = await smokeFetch(url, { redirect: 'manual' });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForUrl(url: string, timeoutMs: number, label: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isReady(url)) return;
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function spawnLoggedProcess(opts: {
  name: 'api' | 'web';
  cwd: string;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}): ManagedServer {
  const logPath = join(runDir, `${opts.name}.log`);
  const child = spawn(opts.command, opts.args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk: Buffer | string) => appendLine(logPath, String(chunk).trimEnd()));
  child.stderr?.on('data', (chunk: Buffer | string) => appendLine(logPath, String(chunk).trimEnd()));
  child.on('exit', (code, signal) => {
    appendLine(logPath, `[process.exit] code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });
  return {
    name: opts.name,
    baseUrl: opts.name === 'api' ? apiBaseUrl : webBaseUrl,
    reused: false,
    process: child,
    logPath,
  };
}

async function ensureServer(
  name: 'api' | 'web',
  readyUrl: string,
  opts: {
    cwd: string;
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
  },
) {
  if (await isReady(readyUrl)) {
    return {
      name,
      baseUrl: name === 'api' ? apiBaseUrl : webBaseUrl,
      reused: true,
      process: null,
      logPath: null,
    } satisfies ManagedServer;
  }

  const server = spawnLoggedProcess({ name, ...opts });
  await waitForUrl(readyUrl, 90_000, `${name} server`);
  return server;
}

async function stopServer(server: ManagedServer | null) {
  if (!server?.process) return;
  if (server.process.exitCode !== null) return;
  server.process.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.process?.once('exit', resolve)),
    delay(10_000),
  ]);
  if (server.process.exitCode === null) {
    server.process.kill('SIGKILL');
  }
}

async function withStage<T>(stage: SmokeStage, fn: () => Promise<T>) {
  try {
    console.log(`[smoke] ${stage}:start`);
    const result = await fn();
    console.log(`[smoke] ${stage}:ok`);
    return result;
  } catch (error) {
    throw new StageError(
      stage,
      error instanceof Error ? error.message : String(error),
      error,
    );
  }
}

async function seedUser(email: string, password: string) {
  const res = await smokeFetch(`${apiBaseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': smokeClientIp,
    },
    body: JSON.stringify({
      email,
      password,
      name: 'Smoke Runner',
    }),
  });

  if (!res.ok) {
    throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  }

  return res.headers.get('set-cookie');
}

function sessionCookieFromHeader(setCookie: string) {
  const [pair] = setCookie.split(';');
  const eqIndex = pair.indexOf('=');
  if (eqIndex === -1) {
    throw new Error(`Invalid set-cookie header: ${setCookie}`);
  }
  const name = pair.slice(0, eqIndex);
  const value = pair.slice(eqIndex + 1);
  const target = new URL(webBaseUrl);
  return {
    name,
    value,
    domain: target.hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: target.protocol === 'https:',
  };
}

async function expectTraceEvent(event: string) {
  if (!requireTraceEvents) return;
  if (browserTraceEvents.has(event)) return;
  await delay(500);
  if (!browserTraceEvents.has(event)) {
    throw new Error(`Missing browser trace event: ${event}`);
  }
}

async function waitForClientReady(page: Page) {
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.waitForTimeout(250);
}

function readLog(path: string | null) {
  if (!path || !existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

async function createBrowserPage() {
  const browser = await chromium.launch({ headless: true });
  browserContext = await browser.newContext({
    ignoreHTTPSErrors: ignoreHttpsErrors,
    extraHTTPHeaders: {
      'x-forwarded-for': smokeClientIp,
    },
  });
  const page = await browserContext.newPage();
  const browserLogPath = join(runDir, 'browser.log');
  page.on('console', async (msg) => {
    const text = msg.text();
    appendLine(browserLogPath, `[console:${msg.type()}] ${text}`);
    if (text.startsWith('[nn-trace] ')) {
      try {
        const payload = JSON.parse(text.slice('[nn-trace] '.length)) as { event?: string };
        if (payload.event) browserTraceEvents.add(payload.event);
      } catch {
        // Ignore malformed trace lines and keep the raw console log.
      }
    }
  });
  page.on('pageerror', (error) => appendLine(browserLogPath, `[pageerror] ${error.message}`));
  await page.addInitScript((value) => {
    window.localStorage.setItem(
      'nn:trace-context',
      JSON.stringify({
        flowId: value,
        scenarioId: value,
        source: 'smoke',
        startedAt: new Date().toISOString(),
      }),
    );
  }, scenarioId);
  return { browser, page, browserLogPath };
}

async function runSmoke(page: Page) {
  const email = `smoke-${Date.now()}@test.dev`;
  const password = 'smoketest123';
  const deckName = `Smoke ${Date.now()}`;
  const front = 'What is the canonical smoke path?';
  const initialBack = 'Sign in, bootstrap, create deck, create card, review.';
  const updatedBack = 'Sign in, bootstrap, create/update card, review, verify rollup.';

  const sessionCookie = await seedUser(email, password);

  await withStage('auth', async () => {
    if (useRemoteAuthBootstrap) {
      if (!sessionCookie || !browserContext) {
        throw new Error('Remote smoke expected a session cookie and browser context');
      }
      await browserContext.addCookies([sessionCookieFromHeader(sessionCookie)]);
      await page.goto(`${webBaseUrl}/decks`, { waitUntil: 'domcontentloaded' });
      await waitForClientReady(page);
      await page.waitForFunction(() => !window.location.pathname.startsWith('/auth/sign-in'));
      return;
    }

    await page.goto(`${webBaseUrl}/auth/sign-in`, { waitUntil: 'domcontentloaded' });
    await waitForClientReady(page);
    await page.locator('[data-testid="auth-email"], input[type="email"]').fill(email);
    await page.locator('[data-testid="auth-password"], input[type="password"]').fill(password);
    await page.locator('[data-testid="auth-submit"], button[type="submit"]').click();
    await expectTraceEvent('auth.submit.start');
    await page.waitForFunction(() => !window.location.pathname.startsWith('/auth/sign-in'));
    await expectTraceEvent('auth.submit.success');
  });

  await withStage('bootstrap', async () => {
    await page.goto(`${webBaseUrl}/decks`, { waitUntil: 'domcontentloaded' });
    await waitForClientReady(page);
    await page.locator('[data-testid="app-shell"]').waitFor();
    await page.locator('[data-testid="decks-create-trigger"]').waitFor();
    await expectTraceEvent('bootstrap.success');
    await expectTraceEvent('store.bootstrap.snapshot');
  });

  await withStage('card_crud', async () => {
    await page.locator('[data-testid="decks-create-trigger"]').click();
    await page.locator('[data-testid="decks-create-name"]').fill(deckName);
    await page.locator('[data-testid="decks-create-submit"]').click();
    await page.locator('[data-testid="decks-tree"]').getByText(deckName).waitFor();
    await expectTraceEvent('deck.create.success');

    await page.goto(`${webBaseUrl}/editor`, { waitUntil: 'domcontentloaded' });
    await waitForClientReady(page);
    await page.waitForFunction(() => {
      const select = document.querySelector('[data-testid="editor-deck"]');
      return select instanceof HTMLSelectElement && select.value.length > 0;
    });
    await page.locator('[data-testid="editor-front"]').fill(front);
    await page.locator('[data-testid="editor-back"]').fill(initialBack);
    await page.locator('[data-testid="editor-save"]').click();
    await expectTraceEvent('card.create.success');
    await page.waitForURL(/\/editor\?card=/);

    await page.locator('[data-testid="editor-back"]').fill(updatedBack);
    await page.locator('[data-testid="editor-save"]').click();
    await expectTraceEvent('card.update.success');
  });

  await withStage('review', async () => {
    await page.goto(`${webBaseUrl}/review`, { waitUntil: 'domcontentloaded' });
    await waitForClientReady(page);
    await page.locator('[data-testid="review-card"]').waitFor();
    await page.locator('[data-testid="review-card"]').click();
    await page.locator('[data-testid="review-grade-3"]').click();
    await page.locator('[data-testid="review-session-done"]').waitFor();
    await expectTraceEvent('review.grade.success');
  });

  await withStage('profile_rollup', async () => {
    await page.goto(`${webBaseUrl}/`, { waitUntil: 'domcontentloaded' });
    await waitForClientReady(page);
    const xpText = (await page.locator('[data-testid="home-stat-xp"]').textContent())?.trim() ?? '0';
    const dueText = (await page.locator('[data-testid="home-due-count"]').textContent())?.trim() ?? '0';
    const xpValue = Number.parseFloat(xpText.replace(/[^0-9.]/g, ''));
    const dueValue = Number.parseInt(dueText.replace(/[^0-9-]/g, ''), 10);
    if (!(xpValue > 0)) {
      throw new Error(`Expected XP to increase, got "${xpText}"`);
    }
    if (Number.isNaN(dueValue) || dueValue !== 0) {
      throw new Error(`Expected due count to be 0 after review, got "${dueText}"`);
    }
  });
}

async function main() {
  const manageApiLocally = !managedApiBaseUrl;
  const manageWebLocally = !managedWebBaseUrl;

  if ((manageApiLocally || manageWebLocally) && !smokeDbUrl) {
    throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set before running smoke');
  }

  mkdirSync(runDir, { recursive: true });

  const sharedEnv = {
    ...process.env,
    DATABASE_URL: smokeDbUrl,
    BETTER_AUTH_URL: apiBaseUrl,
    WEB_ORIGIN: webBaseUrl,
    NEXT_PUBLIC_API_URL: apiBaseUrl,
  } as NodeJS.ProcessEnv;

  if (manageApiLocally) {
    apiServer = await ensureServer('api', apiHealthUrl, {
      cwd: join(repoRoot, 'apps/api'),
      command: 'bun',
      args: ['--watch', 'src/index.ts'],
      env: {
        ...sharedEnv,
        API_PORT: String(apiPort),
        LOG_LEVEL: 'info',
        NODE_ENV: 'production',
      },
    });
  } else {
    await waitForUrl(apiHealthUrl, 90_000, 'managed api');
    apiServer = {
      name: 'api',
      baseUrl: apiBaseUrl,
      reused: true,
      process: null,
      logPath: null,
    };
  }

  if (manageWebLocally) {
    webServer = await ensureServer('web', webReadyUrl, {
      cwd: join(repoRoot, 'apps/web'),
      command: 'bun',
      args: ['x', 'next', 'dev', '--port', String(webPort)],
      env: {
        ...sharedEnv,
        NODE_ENV: 'development',
      },
    });
  } else {
    await waitForUrl(webReadyUrl, 90_000, 'managed web');
    webServer = {
      name: 'web',
      baseUrl: webBaseUrl,
      reused: true,
      process: null,
      logPath: null,
    };
  }

  const { browser, page, browserLogPath } = await createBrowserPage();
  try {
    await runSmoke(page);

    const apiLog = readLog(apiServer.logPath);
    if (apiLog && (!apiLog.includes('request.end') || !apiLog.includes(scenarioId))) {
      throw new Error('API trace log is missing request.end entries for the smoke scenario');
    }

    const summary = {
      ok: true,
      scenarioId,
      runDir,
      browserLogPath,
      apiLogPath: apiServer.logPath,
      webLogPath: webServer.logPath,
      reusedServers: {
        api: apiServer.reused,
        web: webServer.reused,
      },
    };
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    const stage = error instanceof StageError ? error.stage : 'unknown';
    const summary = {
      ok: false,
      scenarioId,
      failedStage: stage,
      error: error instanceof Error ? error.message : String(error),
      runDir,
      screenshotPath,
      browserLogPath,
      apiLogPath: apiServer.logPath,
      webLogPath: webServer.logPath,
      reusedServers: {
        api: apiServer.reused,
        web: webServer.reused,
      },
    };
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.error(JSON.stringify(summary, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}

process.on('SIGINT', async () => {
  await stopServer(webServer);
  await stopServer(apiServer);
  await browserContext?.browser()?.close().catch(() => {});
  process.exit(130);
});

try {
  await main();
} finally {
  await browserContext?.close().catch(() => {});
  await stopServer(webServer);
  await stopServer(apiServer);
}
