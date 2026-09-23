import { type LayerStack } from './layer-stack';

export const LAYER_HISTORY_KEY = 'nnLayer';
type State = Record<string, unknown>;
type Marker = { version: 1; generation: string; depth: number; route: string; owner: string };
type Route = { id: string; owner: string; position: number };
function marker(state: State | null): Marker | null {
  const value = state?.[LAYER_HISTORY_KEY] as Partial<Marker> | undefined;
  return value?.version === 1 && typeof value.generation === 'string' && typeof value.route === 'string' && typeof value.owner === 'string'
    && Number.isInteger(value.depth) && value.depth! > 0 && value.depth! <= 64 ? value as Marker : null;
}
function route(state: State | null): Route | null {
  const value = state?.nnNavigation as Partial<Route> | undefined;
  return typeof value?.id === 'string' && typeof value.owner === 'string' && Number.isInteger(value.position) ? value as Route : null;
}
let sequence = 0;

/** Same-route entries for mobile layers, driven by the existing pre-Next bridge.
 * All entries are drained before a route push; stale Forward/reload entries only
 * return to their base. No editor state or DOM identity enters browser history. */
export class LayerHistory {
  private generation = `layer-${Date.now().toString(36)}-${++sequence}`;
  private ids: string[] = [];
  private base: Route | null = null;
  private snapshot: State | null = null;
  private moving: { depth: number; then?: () => void } | null = null;
  private deciding = false;
  private scheduled = false;
  private disposed = false;
  private unsubscribe?: () => void;
  private waiters = new Set<() => void>();
  constructor(private stack: LayerStack, private browser: {
    state: () => State | null;
    enabled: () => boolean;
    push: (state: State) => void;
    go: (delta: number) => void;
    replace?: (state: State) => void;
  }) {}
  start(initialLayer?: unknown) {
    this.unsubscribe = this.stack.subscribe(this.schedule);
    this.snapshot = this.browser.state();
    const stale = marker(this.snapshot) ?? marker({ [LAYER_HISTORY_KEY]: initialLayer });
    if (stale) { this.base = route(this.browser.state()); this.move(0, -stale.depth); }
    else this.schedule();
  }
  dispose() { this.disposed = true; this.unsubscribe?.(); this.resolveWaiters(); }
  /** Call after closing layers and before a real router operation. */
  settled = (): Promise<void> => {
    if (this.disposed) return Promise.resolve();
    this.schedule();
    return new Promise(resolve => this.waiters.add(resolve));
  };
  refresh = () => { if (!this.moving) this.snapshot = this.browser.state(); this.schedule(); };
  private schedule = () => {
    if (this.scheduled || this.disposed) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; this.sync(); });
  };
  private resolveWaiters() { for (const resolve of this.waiters) resolve(); this.waiters.clear(); }
  private desired() {
    if (!this.browser.enabled()) return [];
    const current = route(this.browser.state());
    if (!current) return [];
    const layers = this.stack.all().filter(layer => layer.history && layer.owner === current.owner);
    // React runs child layout effects before parent effects.
    const depth = (id: string) => { let n = 0, layer = this.stack.get(id); const seen = new Set<string>();
      while (layer?.parent && !seen.has(layer.id)) { seen.add(layer.id); n++; layer = this.stack.get(layer.parent); } return n; };
    return layers.sort((a, b) => depth(a.id) - depth(b.id)).map(layer => layer.id).slice(0, 64);
  }
  private sync() {
    if (this.disposed || this.moving || this.deciding) return;
    this.snapshot = this.browser.state();
    const desired = this.desired();
    let common = 0; while (common < this.ids.length && this.ids[common] === desired[common]) common++;
    if (common < this.ids.length) { this.move(common, common - this.ids.length); return; }
    if (!this.ids.length) this.base = route(this.browser.state());
    if (this.base) for (const id of desired.slice(common)) {
      this.ids.push(id);
      const value: Marker = { version: 1, generation: this.generation, depth: this.ids.length, route: this.base.id, owner: this.base.owner };
      this.browser.push({ ...this.browser.state(), [LAYER_HISTORY_KEY]: value });
    }
    this.resolveWaiters();
  }
  private move(depth: number, delta: number, then?: () => void) {
    this.moving = { depth, then }; this.browser.go(delta);
  }
  /** Returns true only when the pre-hydration bridge must suppress Next. */
  onPop = (event: PopStateEvent): boolean => {
    if (this.disposed) return false;
    const state = event.state as State | null, target = route(state), layer = marker(state);
    const targetDepth = layer && layer.route === this.base?.id && layer.owner === this.base?.owner ? layer.depth : 0;
    if (this.moving) {
      const pending = this.moving;
      if (target?.id !== this.base?.id || targetDepth !== pending.depth) {
        // Repeated physical Back during restoration: restore the same decision
        // position, never start another guard and never expose it to Next.
        if (!target || !this.base || target.owner !== this.base.owner) return false;
        event.stopImmediatePropagation();
        this.browser.go(this.base.position - target.position + pending.depth - targetDepth);
        return true;
      }
      event.stopImmediatePropagation(); this.moving = null;
      this.ids = this.ids.slice(0, pending.depth);
      // Query-only cleanup can replace the current layer entry while preserving
      // its editor. Carry that Next state/URL back to the underlying entry too.
      if (this.snapshot && route(this.snapshot)?.id === target?.id) {
        const restored = { ...this.snapshot }; delete restored[LAYER_HISTORY_KEY];
        if (layer) restored[LAYER_HISTORY_KEY] = layer;
        this.browser.replace?.(restored);
      }
      pending.then?.(); this.schedule(); return true;
    }
    if (this.ids.length && this.base && target?.owner === this.base.owner) {
      event.stopImmediatePropagation();
      const depth = this.ids.length;
      const delta = this.base.position - target.position + depth - targetDepth;
      const id = this.stack.top()?.id;
      const decide = () => {
        if (this.deciding || !id) return;
        this.deciding = true;
        void this.stack.dismiss(id, 'back').finally(() => { this.deciding = false; this.schedule(); });
      };
      if (delta) this.move(depth, delta, decide); else decide();
      return true;
    }
    if (layer) {
      // Forward into a dismissed marker or a reload: return to its actual base.
      // Retain the tombstone in forward history so it can never reopen UI.
      event.stopImmediatePropagation(); this.base = target;
      this.move(0, -layer.depth); return true;
    }
    return false;
  };
}
