'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/auth';
import { NNPageSkeleton, NNSkeleton } from './ui';
import { useAppNavigation } from './navigation';

function AuthGateSkeleton() {
  return (
    <div className="nn-auth-gate-skeleton" aria-busy="true" aria-label="Loading session">
      <aside className="nn-auth-gate-sidebar" aria-hidden>
        <div className="nn-auth-gate-logo"><NNSkeleton width={96} height={18} /></div>
        <div style={{ padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <NNSkeleton height={40} />
          <NNSkeleton width="72%" height={11} />
          <NNSkeleton height={32} />
          <NNSkeleton height={32} />
          <NNSkeleton height={32} />
        </div>
      </aside>
      <main className="nn-auth-gate-main">
        <div className="nn-auth-gate-topbar" aria-hidden>
          <NNSkeleton width={120} height={14} />
          <NNSkeleton width={36} height={36} radius={9} />
        </div>
        <NNPageSkeleton />
      </main>
    </div>
  );
}

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
  const router = useAppNavigation();
  const pathname = usePathname();

  useEffect(() => {
    if (isPending) return;
    if (!data?.session) {
      const next = encodeURIComponent(pathname || '/');
      router.replace(`/auth/sign-in?next=${next}`);
    }
  }, [data, isPending, pathname, router]);

  if (isPending || !data?.session) {
    return <AuthGateSkeleton />;
  }

  return <>{children}</>;
}
