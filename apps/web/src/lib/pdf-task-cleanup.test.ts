import { describe, expect, test } from 'bun:test';
import { destroyPdfResources } from './pdf-task-cleanup';

describe('destroyPdfResources', () => {
  test('does not throw when the loading task has no destroy method', async () => {
    let documentDestroyed = 0;

    await expect(
      destroyPdfResources(
        { destroy: undefined },
        { destroy: () => { documentDestroyed += 1; } },
      ),
    ).resolves.toBeUndefined();
    expect(documentDestroyed).toBe(1);
  });

  test('uses the resolved document when loading-task cleanup rejects', async () => {
    let documentDestroyed = 0;

    await destroyPdfResources(
      { destroy: () => Promise.reject(new TypeError('task cleanup unavailable')) },
      { destroy: async () => { documentDestroyed += 1; } },
    );

    expect(documentDestroyed).toBe(1);
  });

  test('prefers the loading task and calls it with the correct receiver', async () => {
    let taskDestroyed = 0;
    let documentDestroyed = 0;
    const task = {
      destroy() {
        expect(this).toBe(task);
        taskDestroyed += 1;
      },
    };

    await destroyPdfResources(task, { destroy: () => { documentDestroyed += 1; } });

    expect(taskDestroyed).toBe(1);
    expect(documentDestroyed).toBe(0);
  });
});
