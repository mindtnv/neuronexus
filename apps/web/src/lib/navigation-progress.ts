export type NavigationProgressPhase = 'idle' | 'running' | 'completing';

export interface NavigationProgressSnapshot {
  phase: NavigationProgressPhase;
  navigationId: number;
}

interface NavigationProgressClock {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
}

const defaultClock: NavigationProgressClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
};

/**
 * Small state machine for the global route progress bar.
 *
 * It deliberately lives outside React so timing and rapid-navigation behaviour
 * stay deterministic and independently testable. Only the newest navigation is
 * allowed to complete the bar; stale route commits are ignored.
 */
export class NavigationProgressController {
  private sequence = 0;
  private activeId = 0;
  private visibleAt: number | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private failSafeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly publish: (snapshot: NavigationProgressSnapshot) => void,
    private readonly clock: NavigationProgressClock = defaultClock,
    private readonly showDelayMs = 150,
    private readonly minVisibleMs = 200,
    private readonly failSafeMs = 15_000,
  ) {}

  begin(): number {
    const id = ++this.sequence;
    this.activeId = id;
    this.clear(this.hideTimer);
    this.hideTimer = null;

    if (this.visibleAt !== null) {
      this.publish({ phase: 'running', navigationId: id });
    } else {
      this.clear(this.showTimer);
      this.showTimer = this.clock.setTimeout(() => {
        if (this.activeId !== id) return;
        this.visibleAt = this.clock.now();
        this.publish({ phase: 'running', navigationId: id });
      }, this.showDelayMs);
    }

    this.clear(this.failSafeTimer);
    this.failSafeTimer = this.clock.setTimeout(() => this.complete(id), this.failSafeMs);
    return id;
  }

  complete(id: number): void {
    if (id !== this.activeId) return;

    this.clear(this.showTimer);
    this.showTimer = null;
    this.clear(this.failSafeTimer);
    this.failSafeTimer = null;

    if (this.visibleAt === null) {
      this.activeId = 0;
      this.publish({ phase: 'idle', navigationId: id });
      return;
    }

    this.publish({ phase: 'completing', navigationId: id });
    const remaining = Math.max(0, this.minVisibleMs - (this.clock.now() - this.visibleAt));
    this.hideTimer = this.clock.setTimeout(() => {
      if (this.activeId !== id) return;
      this.activeId = 0;
      this.visibleAt = null;
      this.hideTimer = null;
      this.publish({ phase: 'idle', navigationId: id });
    }, remaining);
  }

  dispose(): void {
    this.clear(this.showTimer);
    this.clear(this.hideTimer);
    this.clear(this.failSafeTimer);
    this.showTimer = null;
    this.hideTimer = null;
    this.failSafeTimer = null;
    this.activeId = 0;
    this.visibleAt = null;
  }

  private clear(timer: ReturnType<typeof setTimeout> | null): void {
    if (timer !== null) this.clock.clearTimeout(timer);
  }
}
