'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth';

/**
 * Client-side session guard. Wrap any subtree that must only render when a
 * user is authenticated. Redirects to /auth/sign-in with a `next` query param
 * so the user bounces back after logging in.
 *
 * We do this client-side rather than in middleware because the whole app is
 * statically prerendered — no Node runtime to check cookies at request time.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isPending) return;
    if (!data?.session) {
      const next = encodeURIComponent(pathname || '/');
      router.replace(`/auth/sign-in?next=${next}`);
    }
  }, [data, isPending, pathname, router]);

  if (isPending || !data?.session) {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: '100dvh',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
        }}
      >
        Загружаю сессию…
      </div>
    );
  }

  return <>{children}</>;
}
