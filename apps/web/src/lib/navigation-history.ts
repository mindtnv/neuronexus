/** Installed before Next's router so a guarded traversal cannot unmount an editor
 * before the application sees popstate. Only an event bridge; no history patch. */
declare global {
  interface Window {
    __nnNavigationHistoryInstalled?: boolean;
    __nnNavigationPop?: (event: PopStateEvent) => void;
    __nnNavigationInitialMarker?: unknown;
  }
}
export function installNavigationHistoryBridge() {
  if (window.__nnNavigationHistoryInstalled) return;
  window.__nnNavigationHistoryInstalled = true;
  window.__nnNavigationInitialMarker = window.history.state?.nnNavigation;
  window.addEventListener('popstate', event => window.__nnNavigationPop?.(event), true);
}
export const NAVIGATION_HISTORY_INIT_SCRIPT = `(${installNavigationHistoryBridge.toString()})();`;
