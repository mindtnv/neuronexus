// Re-export the shared BetterAuth browser client so app code can
// `import { authClient } from '@/lib/auth'` without touching the monorepo
// workspace path directly.
export { authClient, signIn, signUp, signOut, useSession, getSession } from '@neuronexus/auth/client';
