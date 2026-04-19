// BetterAuth browser client for the Next.js app. Reads the API origin from
// NEXT_PUBLIC_API_URL (build-time) so it can post sign-in/sign-out requests to
// apps/api.

import { createAuthClient } from 'better-auth/react';

const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const baseURL =
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? new URL('/api/auth', apiOrigin).toString();

export const authClient = createAuthClient({
  baseURL,
  fetchOptions: {
    credentials: 'include',
  },
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
