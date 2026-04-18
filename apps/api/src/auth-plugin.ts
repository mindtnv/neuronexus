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

export const authPlugin = new Elysia({ name: 'better-auth' })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({ headers });
        if (!session) return status(401, { error: 'Unauthorized' });
        return { user: session.user, session: session.session };
      },
    },
  });

export { auth };
