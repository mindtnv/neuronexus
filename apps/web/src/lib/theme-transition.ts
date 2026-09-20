/** Cover the full layout/visual viewport with overscan, not a tangent at its far corner. */
export function themeRevealRadius(origin: { x: number; y: number }, width: number, height: number): number {
  return Math.ceil(Math.hypot(Math.max(Math.abs(origin.x), Math.abs(width - origin.x)), Math.max(Math.abs(origin.y), Math.abs(height - origin.y))) * 1.08) + 4;
}

/** Reveal the new palette from the quick toggle, without delaying the preference update. */
export async function revealThemeChange(update: () => void, origin: { x: number; y: number }) {
  if (typeof document.startViewTransition !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof document.documentElement.animate !== 'function') { update(); return; }
  let applied = false;
  const apply = () => { if (!applied) { applied = true; update(); } };
  const root = document.documentElement;
  let animation: Animation | undefined;
  root.setAttribute('data-theme-transition', 'true');
  try {
    const transition = document.startViewTransition(apply);
    // A skipped transition still runs its update callback. Observe both promises.
    void transition.finished.catch(() => {});
    await transition.ready;
    const bounds = root.getBoundingClientRect();
    const viewport = window.visualViewport;
    const width = Math.max(window.innerWidth, root.clientWidth, bounds.right, viewport ? viewport.offsetLeft + viewport.width : 0);
    const height = Math.max(window.innerHeight, root.clientHeight, bounds.bottom, viewport ? viewport.offsetTop + viewport.height : 0);
    const radius = themeRevealRadius(origin, width, height);
    animation = root.animate({ clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
      { duration: 440, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'none', pseudoElement: '::view-transition-new(root)' });
    await animation.finished;
    await transition.finished;
  } catch { apply(); }
  finally {
    animation?.cancel();
    root.removeAttribute('data-theme-transition');
  }
}
