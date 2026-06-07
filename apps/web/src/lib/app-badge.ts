// App badge helper — feature-detected, silent on unsupported engines.
//
// Browser support (June 2026):
//   setAppBadge:   installed-PWA only — Chrome/Edge desktop (Win/macOS),
//                  Safari iOS/iPadOS ≥16.4. NOT Chromium-Android, desktop
//                  Safari/Firefox. Requires notification permission on iOS.
//   clearAppBadge: same engines.
//
// All calls are wrapped in try/catch — badge is advisory; errors are silent
// (no user-visible noise). A missed badge update is always acceptable.

/** Set the app badge to the given count. Clears the badge when n === 0. */
export function setBadge(n: number): void {
  if (n > 0) {
    if ('setAppBadge' in navigator) {
      try {
        void (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> }).setAppBadge(n);
      } catch {
        // silent — badge is best-effort
        if (process.env.NODE_ENV === 'development') {
          console.debug('[badge] setAppBadge failed');
        }
      }
    }
  } else {
    clearBadge();
  }
}

/** Clear the app badge entirely. */
export function clearBadge(): void {
  if ('clearAppBadge' in navigator) {
    try {
      void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
    } catch {
      // silent — badge is best-effort
      if (process.env.NODE_ENV === 'development') {
        console.debug('[badge] clearAppBadge failed');
      }
    }
  }
}
