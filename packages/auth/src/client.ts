// BetterAuth browser client for the Next.js app. Reads the API origin from
// NEXT_PUBLIC_API_URL (build-time) so it can post sign-in/sign-out requests to
// apps/api.

import { createAuthClient } from 'better-auth/react';

const baseURL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:3000';

export const authClient = createAuthClient({
  baseURL,
  fetchOptions: {
    credentials: 'include',
  },
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
