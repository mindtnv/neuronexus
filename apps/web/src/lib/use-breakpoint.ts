'use client';

import { useEffect, useState } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const MOBILE_MAX = 720;
const TABLET_MAX = 1100;

function compute(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < MOBILE_MAX) return 'mobile';
  if (w < TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function useBreakpoint(): Breakpoint {
  // Start as desktop on SSR, adjust on mount. One-frame flash on narrow screens is acceptable.
  const [bp, setBp] = useState<Breakpoint>('desktop');

  useEffect(() => {
    setBp(compute());
    const handler = () => setBp(compute());
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, []);

  return bp;
}

export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile';
}

export function useIsNarrow(): boolean {
  const bp = useBreakpoint();
  return bp !== 'desktop';
}
