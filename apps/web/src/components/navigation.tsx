'use client';

import Link, { type LinkProps } from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import {
  NavigationProgressController,
  type NavigationProgressSnapshot,
} from '@/lib/navigation-progress';

type NavigationOptions = {
  scroll?: boolean;
  /** Query-only URL synchronization should opt out of global route progress. */
  track?: boolean;
};

type NavigationContextValue = {
  begin: (href: LinkProps['href'], track?: boolean) => void;
  push: (href: string, options?: NavigationOptions) => void;
  replace: (href: string, options?: NavigationOptions) => void;
  back: () => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

const IDLE_PROGRESS: NavigationProgressSnapshot = { phase: 'idle', navigationId: 0 };

function hrefText(href: LinkProps['href']): string {
  if (typeof href === 'string') return href;
  const pathname = href.pathname ?? '';
  const search = href.search
    ? String(href.search)
    : href.query
      ? new URLSearchParams(
          Object.entries(href.query).flatMap(([key, value]) => {
            if (value == null) return [];
            return Array.isArray(value)
              ? value.map((item) => [key, String(item)] as [string, string])
              : [[key, String(value)] as [string, string]];
          }),
        ).toString()
      : '';
  const hash = href.hash ? String(href.hash) : '';
  return `${pathname}${search ? `${search.startsWith('?') ? '' : '?'}${search}` : ''}${hash ? `${hash.startsWith('#') ? '' : '#'}${hash}` : ''}`;
}

function targetUrl(href: LinkProps['href']): URL | null {
  if (typeof window === 'undefined') return null;
  try {
    const target = new URL(hrefText(href), window.location.href);
    return target.origin === window.location.origin ? target : null;
  } catch {
    return null;
  }
}

function NavigationProgress({ snapshot }: { snapshot: NavigationProgressSnapshot }) {
  if (snapshot.phase === 'idle') return null;
  return (
    <div
      className="nn-navigation-progress"
      data-phase={snapshot.phase}
      role="progressbar"
      aria-label="Loading page"
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span />
    </div>
  );
}

export function AppNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const pathnameRef = useRef(pathname);
  const activeRef = useRef<{ id: number; pathname: string } | null>(null);
  const [progress, setProgress] = useState(IDLE_PROGRESS);
  const controllerRef = useRef<NavigationProgressController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new NavigationProgressController(setProgress);
  }

  const beginResolved = useCallback((target: URL, track = true) => {
    if (!track) return;

    // Hash/query-only changes stay local and must not flash a global indicator.
    if (target.pathname === pathnameRef.current) return;

    const id = controllerRef.current!.begin();
    activeRef.current = { id, pathname: target.pathname };
  }, []);

  const begin = useCallback((href: LinkProps['href'], track = true) => {
    const target = targetUrl(href);
    if (!target) return;
    beginResolved(target, track);
  }, [beginResolved]);

  const push = useCallback((href: string, options?: NavigationOptions) => {
    begin(href, options?.track);
    startTransition(() => router.push(href, { scroll: options?.scroll }));
  }, [begin, router]);

  const replace = useCallback((href: string, options?: NavigationOptions) => {
    begin(href, options?.track);
    startTransition(() => router.replace(href, { scroll: options?.scroll }));
  }, [begin, router]);

  const back = useCallback(() => {
    startTransition(() => router.back());
  }, [router]);

  useEffect(() => {
    pathnameRef.current = pathname;
    const active = activeRef.current;
    if (!active || active.pathname !== pathname) return;
    controllerRef.current?.complete(active.id);
    activeRef.current = null;
  }, [pathname]);

  // Browser back/forward does not pass through AppLink. Start tracking from the
  // old rendered pathname and let the pathname effect above complete it.
  useEffect(() => {
    const onPopState = () => {
      try {
        const target = new URL(window.location.href);
        beginResolved(target);
      } catch {
        // A malformed embed URL must never break the browser history controls.
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [beginResolved]);

  useEffect(() => () => controllerRef.current?.dispose(), []);

  const value = useMemo(() => ({ begin, push, replace, back }), [begin, push, replace, back]);
  return (
    <NavigationContext.Provider value={value}>
      <NavigationProgress snapshot={progress} />
      {children}
    </NavigationContext.Provider>
  );
}

export function useAppNavigation(): Pick<NavigationContextValue, 'push' | 'replace' | 'back'> {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useAppNavigation must be used inside AppNavigationProvider');
  return context;
}

export type AppLinkProps = LinkProps &
  Omit<ComponentPropsWithoutRef<'a'>, keyof LinkProps | 'href'> & {
    track?: boolean;
  };

export function AppLink({ track = true, onNavigate, ...props }: AppLinkProps) {
  const context = useContext(NavigationContext);
  return (
    <Link
      {...props}
      onNavigate={(event) => {
        let prevented = false;
        onNavigate?.({
          preventDefault: () => {
            prevented = true;
            event.preventDefault();
          },
        });
        if (!prevented) context?.begin(props.href, track);
      }}
    />
  );
}
