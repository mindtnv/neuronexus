'use client';

import { Fragment, useEffect, useLayoutEffect, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { useUI, readSidebarWidth, readSidebarCollapsed } from '@/lib/ui-store';
import { useSession } from '@/lib/auth';
import { NNPageSkeleton, NNSkeleton, NNLoadError } from './ui';
import { useAppNavigation } from './navigation';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

function AuthGateSkeleton({error}:{error?:React.ReactNode}={}) {
  const width = useUI(state => state.sidebarWidth);
  const hidden = useUI(state => state.sidebarCollapsed);
  useLayoutEffect(() => {
    useUI.getState().setSidebarWidth(readSidebarWidth());
    const collapsed = readSidebarCollapsed();
    if (collapsed !== null) useUI.getState().setSidebarCollapsed(collapsed);
  }, []);
  return (
    <div className="nn-auth-gate-skeleton" data-compact={width < 160 || undefined} style={{ '--nn-sidebar-width': `${width}px` } as CSSProperties} aria-busy={!error} aria-label={error?undefined:'Loading session'}>
      {!hidden && <aside className="nn-auth-gate-sidebar" aria-hidden>
        <div className="nn-auth-gate-logo"><NNSkeleton width={96} height={18} /></div>
        <div style={{ padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <NNSkeleton height={40} />
          <NNSkeleton width="72%" height={11} />
          <NNSkeleton height={32} />
          <NNSkeleton height={32} />
          <NNSkeleton height={32} />
        </div>
      </aside>}
      <main className="nn-auth-gate-main">
        <div className="nn-auth-gate-topbar" aria-hidden>
          <NNSkeleton width={120} height={14} />
          <NNSkeleton width={36} height={36} radius={9} />
        </div>
        {error??<NNPageSkeleton />}
      </main>
    </div>
  );
}

/** Session identity can change before bootstrap finishes. Do not mount a new
 * account's routes against the previous account's mirror or resource cache. */
export function AuthenticatedWorkspace({owner,children}:{owner:string;children:React.ReactNode}) {
  const profileOwner=useNN(state=>state.profile?.userId);
  const ready=useNN(state=>state.bootstrapped);
  const status=useNN(state=>state.bootstrapStatus);
  const error=useNN(state=>state.bootstrapError);
  const bootstrap=useNN(state=>state.bootstrap);
  const t=useT();
  if(!ready||profileOwner!==owner)return <AuthGateSkeleton error={!profileOwner&&status==='error'
    ?<NNLoadError title={t('navigation.loadFailed')} description={error?.safeMessage} requestId={error?.requestId}
      retryLabel={t('review.retry')} onRetry={()=>void bootstrap().catch(()=>{})}/>:undefined}/>;
  return <Fragment key={owner}>{children}</Fragment>;
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

  return <AuthenticatedWorkspace owner={data.session.userId}>{children}</AuthenticatedWorkspace>;
}
