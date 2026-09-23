import { expect, test } from 'bun:test';
import { LayerStack } from './layer-stack';
import { LayerHistory, LAYER_HISTORY_KEY } from './layer-history';

const tick = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function fixture(initial?: Record<string, unknown>[]) {
  const stack = new LayerStack();
  const states = initial ?? [{ nnNavigation: { id: 'earlier', owner: 'a', position: 0 } }, { __NA: true, tree: 'next tree', nnNavigation: { id: 'route', owner: 'a', position: 1 } }];
  let index = states.length - 1, stopped = 0;
  const moves: number[] = [];
  let history!: LayerHistory;
  const pop = (delta: number) => { index += delta; if (index < 0 || index >= states.length) throw Error('out of bounds'); const event = { state: states[index], stopImmediatePropagation() { stopped++; } }; return history.onPop(event as any); };
  history = new LayerHistory(stack, { state: () => states[index], enabled: () => true,
    push: state => { states.splice(index + 1); states.push(state); index++; },
    replace: state => { states[index] = state; },
    go: delta => { moves.push(delta); queueMicrotask(() => pop(delta)); },
  });
  history.start();
  const add = (id: string, parent?: string) => stack.register({ id, parent, owner: 'a', history: true, root: () => null, close() {} });
  return { history, stack, states, add, pop, moves, get index() { return index; }, get stopped() { return stopped; } };
}
test('mobile Back closes one nested layer and preserves route/Next state', async () => {
  const f = fixture(); f.add('dialog'); f.add('menu', 'dialog'); await tick();
  expect(f.index).toBe(3); expect(f.states[3]?.tree).toBe('next tree');
  expect(f.pop(-1)).toBe(true); await tick();
  expect(f.stack.top()?.id).toBe('dialog'); expect(f.index).toBe(2);
  expect(f.pop(-1)).toBe(true); await tick(); expect(f.index).toBe(1); expect(f.stack.hasLayers()).toBe(false);
  expect(f.pop(-1)).toBe(false); expect(f.index).toBe(0); f.history.dispose();
});
test('manual close consumes markers, Forward cannot reopen a dismissed layer', async () => {
  const f = fixture(); f.add('dialog'); await tick(); await f.stack.dismissTop('button'); await tick();
  expect(f.index).toBe(1); expect(f.pop(1)).toBe(true); await tick(); expect(f.index).toBe(1); expect(f.stack.hasLayers()).toBe(false); f.history.dispose();
});
test('repeated Back while dirty decision is pending neither leaves nor asks twice', async () => {
  const f = fixture(), decision = Promise.withResolvers<boolean>(); let asks = 0;
  f.add('editor'); f.stack.addGuard('editor', async () => { asks++; f.add('decision', 'editor'); return decision.promise; }); await tick();
  f.pop(-1); await tick(); f.pop(-2); await tick();
  expect(asks).toBe(1); expect(f.index).toBe(2); expect(f.stack.get('editor')).toBeDefined();
  f.stack.remove('decision'); decision.resolve(false); await tick();
  expect(f.index).toBe(2); expect(f.stack.get('editor')).toBeDefined(); f.history.dispose();
});
test('approved Back and navigation drain before the next route is pushed', async () => {
  const f = fixture(); f.add('dialog'); f.add('menu', 'dialog'); await tick();
  await f.stack.closeForNavigation(); await f.history.settled();
  expect(f.index).toBe(1); expect(f.states[f.index]?.[LAYER_HISTORY_KEY]).toBeUndefined(); f.history.dispose();
});
test('reload normalizes opaque stale markers to the underlying route', async () => {
  const first = fixture(); first.add('dialog'); first.add('menu', 'dialog'); await tick(); first.history.dispose();
  const f = fixture(first.states); await tick(); expect(f.index).toBe(1); expect(f.stack.hasLayers()).toBe(false); f.history.dispose();
});
test('child-first mount order and same-depth replacement use the current stack', async () => {
  const f = fixture(); f.add('child', 'parent'); f.add('parent'); await tick();
  f.pop(-1); await tick(); expect(f.stack.top()?.id).toBe('parent');
  f.stack.remove('parent'); f.add('replacement'); await tick(); f.pop(-1); await tick();
  expect(f.stack.hasLayers()).toBe(false); expect(f.index).toBe(1); f.history.dispose();
});

test('query-only replacement preserves current Next state when the layer entry is consumed', async () => {
  const f = fixture(); f.add('filter'); await tick();
  f.states[f.index] = { ...f.states[f.index], tree: 'updated query' };
  f.history.refresh(); await tick(); await f.stack.dismissTop('button'); await f.history.settled();
  expect(f.states[f.index]?.tree).toBe('updated query'); expect(f.states[f.index]?.[LAYER_HISTORY_KEY]).toBeUndefined(); f.history.dispose();
});
test('an account change invalidates an outstanding mobile close and consumes old markers', async () => {
  const f = fixture(), decision = Promise.withResolvers<boolean>();
  f.add('editor'); f.stack.addGuard('editor', () => decision.promise); await tick(); f.pop(-1); await tick();
  f.stack.setOwner('b'); decision.resolve(true); await tick();
  expect(f.stack.hasLayers()).toBe(false); expect(f.index).toBe(1); f.history.dispose();
});

test('a delayed Next query replacement cannot erase the already-pushed inspector marker', async () => {
  const f = fixture(); f.add('inspector'); await tick(); const index = f.index;
  const replacement: Record<string, unknown> = { ...f.states[index], tree: 'query consumed after inspector mounted' }; delete replacement[LAYER_HISTORY_KEY];
  f.states[index] = replacement; f.history.refresh(); await tick();
  expect((f.states[index]?.[LAYER_HISTORY_KEY] as { depth?: number })?.depth).toBe(1); expect(f.index).toBe(index);
  f.pop(-1); await tick(); expect(f.stack.hasLayers()).toBe(false); expect(f.index).toBe(1); f.history.dispose();
});
