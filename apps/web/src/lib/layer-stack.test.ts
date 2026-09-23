import { expect, test } from 'bun:test';
import { LayerStack } from './layer-stack';

test('only the top layer closes, including a child registered before its parent', async () => {
  const stack = new LayerStack(), closed: string[] = [];
  stack.register({ id: 'menu', owner: 'a', parent: 'dialog', root: () => null, close: () => closed.push('menu') });
  stack.register({ id: 'dialog', owner: 'a', root: () => null, close: () => closed.push('dialog') });
  expect(await stack.dismiss('dialog', 'escape')).toBe(false);
  expect(await stack.dismissTop('escape')).toBe(true); expect(closed).toEqual(['menu']);
  expect(stack.top()?.id).toBe('dialog');
});
test('concurrent dismissal shares one dirty decision and an account change invalidates it', async () => {
  const stack = new LayerStack(), decision = Promise.withResolvers<boolean>();
  let asked = 0, closed = 0;
  stack.register({ id: 'editor', owner: 'a', root: () => null, close: () => closed++ });
  stack.addGuard('editor', async () => { asked++; return decision.promise; });
  const a = stack.dismissTop('escape'), b = stack.dismissTop('outside');
  expect(asked).toBe(1);
  stack.setOwner('b'); decision.resolve(true);
  expect(await a).toBe(false); expect(await b).toBe(false); expect(closed).toBe(0);
});
test('a refused or busy close leaves both layer and work intact', async () => {
  const stack = new LayerStack(); let closed = false;
  stack.register({ id: 'editor', owner: 'a', root: () => null, close: () => { closed = true; } });
  stack.addGuard('editor', async () => false);
  expect(await stack.confirmNavigation()).toBe(false);
  expect(await stack.dismissTop('back')).toBe(false);
  expect(closed).toBe(false); expect(stack.hasLayers()).toBe(true);
});
