import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

afterAll(async () => {
  // Elysia's handle is in-process; nothing to tear down on the app side.
});

describe('auth', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('sign-up issues a session cookie', async () => {
    const res = await callApp(app, 'POST', '/api/auth/sign-up/email', {
      body: { email: uniqueEmail(), password: 'testtest123', name: 'A' },
    });
    expect(res.status).toBe(200);
    expect(res.setCookies.length).toBeGreaterThan(0);
  });

  test('protected route is 401 without cookie', async () => {
    const res = await callApp(app, 'GET', '/profile');
    expect(res.status).toBe(401);
  });

  test('protected route is 200 with cookie', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'GET', '/profile', { cookie });
    expect(res.status).toBe(200);
    const body = await res.json<{ name: string; level: number; xp: number }>();
    expect(body.name).toBeTruthy();
    expect(body.level).toBe(1);
    expect(body.xp).toBe(0);
  });

  test('/profile lazy-creates on first read', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'GET', '/profile', { cookie });
    expect(res.status).toBe(200);
    const body = await res.json<{ userId: string }>();
    expect(body.userId).toBe(userId);
  });

  test('PATCH /profile upserts and updates writable fields without a prior read', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'PATCH', '/profile', {
      cookie,
      body: { name: 'Renamed', dailyGoalMinutes: 45, desiredRetention: 0.92 },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ name: string; dailyGoalMinutes: number; desiredRetention: number }>();
    expect(body.name).toBe('Renamed');
    expect(body.dailyGoalMinutes).toBe(45);
    expect(body.desiredRetention).toBeCloseTo(0.92, 5);
  });

  test('PATCH /profile ignores derived fields such as plantStage', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail('derived'));
    const res = await callApp(app, 'PATCH', '/profile', {
      cookie,
      body: { plantStage: 5 },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ plantStage: number }>();
    expect(body.plantStage).toBe(0);
  });
});
