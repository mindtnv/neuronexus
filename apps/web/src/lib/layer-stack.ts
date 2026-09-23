export type CloseReason = 'escape' | 'outside' | 'button' | 'back' | 'navigation';
export interface TransientLayer {
  id: string;
  owner: string;
  parent?: string | null;
  root: () => HTMLElement | null;
  portals?: () => Array<HTMLElement | null>;
  modal?: boolean;
  history?: boolean;
  dismissOnOutside?: boolean;
  retainOnNavigation?: boolean;
  /** Consume Escape for an active drag before considering window dismissal. */
  onEscape?: () => boolean;
  canClose?: () => boolean;
  close: (reason: CloseReason) => void;
}

/** One owner and one top interactive layer; no domain data is retained here. */
export class LayerStack {
  private entries: TransientLayer[] = [];
  private guards = new Map<string, Set<() => Promise<boolean>>>();
  private checking = new Map<string, Promise<boolean>>();
  private listeners = new Set<() => void>();
  private epoch = 0;
  private owner = '';
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private changed() { for (const listener of this.listeners) listener(); }
  refresh = () => this.changed();
  setOwner(owner: string) {
    if (this.owner === owner) return;
    this.owner = owner; this.epoch++; this.entries = []; this.guards.clear(); this.checking.clear(); this.changed();
  }
  register(layer: TransientLayer) {
    this.setOwner(layer.owner);
    const visited = new Set([layer.id]); let parent = layer.parent;
    while (parent) { if (visited.has(parent)) { layer = { ...layer, parent: null }; break; } visited.add(parent); parent = this.get(parent)?.parent; }
    this.entries = [...this.entries.filter(entry => entry.id !== layer.id), layer]; this.changed();
    return () => this.remove(layer.id);
  }
  remove(id: string) {
    if (!this.entries.some(layer => layer.id === id)) return;
    this.entries = this.entries.filter(layer => layer.id !== id); this.guards.delete(id); this.changed();
  }
  all = () => [...this.entries];
  hasLayers = () => this.entries.length > 0;
  get = (id: string) => this.entries.find(layer => layer.id === id);
  top(): TransientLayer | undefined {
    let top = this.entries.at(-1);
    const visited = new Set<string>();
    // Nested children may mount before their parent's layout effect.
    while (top && !visited.has(top.id)) {
      visited.add(top.id);
      const child = [...this.entries].reverse().find(layer => layer.id !== top!.id && !visited.has(layer.id)
        && (layer.parent === top!.id || Boolean(top!.root()?.contains(layer.root()))));
      if (!child) break; top = child;
    }
    return top;
  }
  modalAncestor(layer = this.top()): TransientLayer | undefined {
    const seen = new Set<string>();
    while (layer && !seen.has(layer.id)) { seen.add(layer.id); if (layer.modal) return layer; layer = layer.parent ? this.get(layer.parent) : undefined; }
    return undefined;
  }
  owns(layer: TransientLayer, node: Node | null): boolean {
    if (!node) return false;
    if (layer.root()?.contains(node) || layer.portals?.().some(root => root?.contains(node))) return true;
    return this.entries.some(child => child.parent === layer.id && this.owns(child, node));
  }
  closest(node: Node | null) { return [...this.entries].reverse().find(layer => this.owns(layer, node)); }
  addGuard(id: string, guard: () => Promise<boolean>) {
    const guards = this.guards.get(id) ?? new Set(); guards.add(guard); this.guards.set(id, guards);
    return () => { guards.delete(guard); if (!guards.size) this.guards.delete(id); };
  }
  hasGuard(id: string) { return Boolean(this.guards.get(id)?.size); }
  async canDismiss(layer: TransientLayer): Promise<boolean> {
    const existing = this.checking.get(layer.id);
    if (existing) return existing;
    const epoch = this.epoch;
    const pending = (async () => {
      if (layer.canClose && !layer.canClose()) return false;
      for (const guard of [...(this.guards.get(layer.id) ?? [])].reverse()) if (!await guard()) return false;
      // A guard may itself finish a save; its explicit answer is authoritative
      // even before React commits the corresponding busy=false render.
      return epoch === this.epoch;
    })();
    this.checking.set(layer.id, pending);
    try { return await pending; } finally { if (this.checking.get(layer.id) === pending) this.checking.delete(layer.id); }
  }
  async dismiss(id: string, reason: CloseReason, approved = false) {
    const layer = this.get(id);
    if (!layer || (!approved && this.top()?.id !== id)) return false;
    if (!approved && !await this.canDismiss(layer)) return false;
    if (!this.get(id) || layer.owner !== this.owner) return false;
    this.remove(id); layer.close(reason); return true;
  }
  dismissTop = (reason: CloseReason) => { const layer = this.top(); return layer ? this.dismiss(layer.id, reason) : Promise.resolve(true); };
  async confirmNavigation() {
    for (const layer of [...this.entries].reverse()) if (!layer.retainOnNavigation && this.get(layer.id) && !await this.canDismiss(layer)) return false;
    return true;
  }
  async closeForNavigation() {
    for (const layer of [...this.entries].reverse()) if (!layer.retainOnNavigation) await this.dismiss(layer.id, 'navigation', true);
  }
}
export const transientLayers = new LayerStack();
