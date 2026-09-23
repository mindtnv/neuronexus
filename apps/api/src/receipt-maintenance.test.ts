import { expect, test } from 'bun:test';
import { createReceiptMaintenance } from './receipt-maintenance';

test('receipt maintenance never overlaps and shutdown waits for its active batch', async () => {
  const release = Promise.withResolvers<void>();
  let calls = 0;
  const loop = createReceiptMaintenance(async () => { calls++; await release.promise; }, () => {}, 1);
  loop.start(); loop.start();
  await Promise.resolve(); expect(calls).toBe(1);
  let drained = false;
  const stopping = loop.drain().then(() => { drained = true; });
  expect(drained).toBe(false);
  release.resolve(); await stopping;
  expect(drained).toBe(true);
  await Bun.sleep(5); expect(calls).toBe(1);
});
