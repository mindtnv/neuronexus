import { beforeEach, describe, expect, test } from 'bun:test';
import {
  WorkerTracker,
  CorrelatedPendingQueue,
  lifecycleSnapshot,
  markRuntimeRunning,
  markRuntimeShuttingDown,
} from './runtime-state.ts';

describe('runtime worker state', () => {
  beforeEach(() => markRuntimeRunning());

  test('tracks only aggregate queued and active work', () => {
    const tracker = new WorkerTracker('test');
    tracker.enqueue(2);
    tracker.start();
    expect(tracker.snapshot()).toEqual({ queued: 1, active: 1, degraded: false });

    tracker.succeed();
    expect(tracker.snapshot()).toEqual({ queued: 1, active: 0, degraded: false });
  });

  test('bounds failure codes and can recover after later success', () => {
    const tracker = new WorkerTracker('test');
    tracker.enqueue();
    tracker.start();
    tracker.fail('provider password=secret user=0198f57b-8f04-7abc-9c1e-001122334455');

    const failed = tracker.snapshot();
    expect(failed.degraded).toBe(true);
    expect(failed.lastFailure?.code).toBe('worker_failed');
    expect(failed.lastFailure?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(failed)).not.toContain('secret');
    expect(JSON.stringify(failed)).not.toContain('0198f57b');

    tracker.enqueue();
    tracker.start();
    tracker.succeed();
    expect(tracker.snapshot()).toEqual({ queued: 0, active: 0, degraded: false });
  });

  test('clamps counters instead of exposing inconsistent negative state', () => {
    const tracker = new WorkerTracker('test');
    tracker.start();
    tracker.succeed();
    tracker.succeed();
    expect(tracker.snapshot()).toEqual({ queued: 0, active: 0, degraded: false });
  });

  test('exposes process lifecycle without mutable details', () => {
    expect(lifecycleSnapshot()).toEqual({ state: 'running' });
    markRuntimeShuttingDown('SIGTERM');
    expect(lifecycleSnapshot()).toEqual({ state: 'shutting_down' });
  });

  test('deduplicates queued ids, keeps newest correlation, and separates request batches', () => {
    const queue = new CorrelatedPendingQueue();
    expect(queue.enqueue('card-a', { requestId: 'request-a' })).toBe(true);
    expect(queue.enqueue('card-a', { requestId: 'request-b' })).toBe(false);
    queue.enqueue('card-b', { requestId: 'request-b' });
    queue.enqueue('startup-card');

    expect(queue.takeBatch(10)).toEqual({
      ids: ['card-a', 'card-b'],
      correlation: { requestId: 'request-b' },
    });
    expect(queue.takeBatch(10)).toEqual({ ids: ['startup-card'] });
    expect(queue.size).toBe(0);
  });
});
