import { describe, expect, test } from 'bun:test';
import {
  NavigationProgressController,
  type NavigationProgressSnapshot,
} from './navigation-progress';

class ManualClock {
  nowMs = 0;
  nextId = 1;
  tasks = new Map<number, { at: number; callback: () => void }>();

  now = () => this.nowMs;
  setTimeout = (callback: () => void, delayMs: number) => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.nowMs + delayMs, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  };
  clearTimeout = (timer: ReturnType<typeof setTimeout>) => {
    this.tasks.delete(timer as unknown as number);
  };

  advance(ms: number) {
    const target = this.nowMs + ms;
    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.tasks.delete(due[0]);
      this.nowMs = due[1].at;
      due[1].callback();
    }
    this.nowMs = target;
  }
}

describe('NavigationProgressController', () => {
  test('never becomes visible for navigation completed before 150ms', () => {
    const clock = new ManualClock();
    const snapshots: NavigationProgressSnapshot[] = [];
    const controller = new NavigationProgressController((state) => snapshots.push(state), clock);

    const id = controller.begin();
    clock.advance(149);
    controller.complete(id);
    clock.advance(500);

    expect(snapshots.map((state) => state.phase)).toEqual(['idle']);
  });

  test('keeps a visible indicator mounted for at least 200ms', () => {
    const clock = new ManualClock();
    const snapshots: NavigationProgressSnapshot[] = [];
    const controller = new NavigationProgressController((state) => snapshots.push(state), clock);

    const id = controller.begin();
    clock.advance(150);
    controller.complete(id);
    clock.advance(199);
    expect(snapshots.map((state) => state.phase)).toEqual(['running', 'completing']);

    clock.advance(1);
    expect(snapshots.map((state) => state.phase)).toEqual(['running', 'completing', 'idle']);
  });

  test('ignores completion from an older rapid-click navigation', () => {
    const clock = new ManualClock();
    const snapshots: NavigationProgressSnapshot[] = [];
    const controller = new NavigationProgressController((state) => snapshots.push(state), clock);

    const first = controller.begin();
    clock.advance(100);
    const second = controller.begin();
    controller.complete(first);
    clock.advance(149);
    expect(snapshots).toEqual([]);

    clock.advance(1);
    controller.complete(second);
    expect(snapshots.map((state) => state.phase)).toEqual(['running', 'completing']);
  });

  test('fails safe instead of leaving a stalled navigation visible forever', () => {
    const clock = new ManualClock();
    const snapshots: NavigationProgressSnapshot[] = [];
    const controller = new NavigationProgressController((state) => snapshots.push(state), clock);

    controller.begin();
    clock.advance(15_000);
    clock.advance(1);

    expect(snapshots.at(-1)?.phase).toBe('idle');
  });
});
