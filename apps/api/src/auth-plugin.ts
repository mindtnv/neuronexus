// Elysia plugin that:
//   1. mounts BetterAuth's HTTP handler under /api/auth/*
//   2. exposes an `auth: true` macro that resolves { user, session } or 401
//
// Usage:
//   new Elysia()
//     .use(authPlugin)
//     .get('/me', ({ user }) => user, { auth: true })

import { Elysia } from 'elysia';
import { auth } from '@neuronexus/auth/server';
import { apiErrorBody, getRequestLogger } from './logger.ts';

export const authPlugin = new Elysia({ name: 'better-auth' })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers }, store }) {
        const log = getRequestLogger(store);
        const session = await auth.api.getSession({ headers });
        if (!session) {
          log.warn({ errorCode: 'AUTH_UNAUTHORIZED' }, 'auth.unauthorized');
          return status(401, apiErrorBody(store, 'AUTH_UNAUTHORIZED', 'Authentication required.'));
        }
        (store as { log?: typeof log }).log = log.child({ userId: session.user.id });
        return { user: session.user, session: session.session };
      },
    },
  });

export { auth };
