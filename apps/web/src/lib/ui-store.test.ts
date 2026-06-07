// UI store — sidebar collapse (persisted) + zen mode (ephemeral).
//
// The store is a Zustand singleton, so each test resets it via setState. We
// stub `window.localStorage` per-test (happy-dom provides one, but we want
// explicit control + an "absent / throwing" variant to prove the try/catch
// guards never throw). Pattern mirrors app-badge.test.ts (patch globalThis,
// restore after each).

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { useUI, readSidebarCollapsed } from './ui-store';

const SIDEBAR_KEY = 'nn:sidebar-collapsed';

type Store = Record<string, string>;

function makeMemoryStorage(): { storage: Storage; data: Store } {
  const data: Store = {};
  const storage = {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = String(v);
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    key: (i: number) => Object.keys(data)[i] ?? null,
    get length() {
      return Object.keys(data).length;
    },
  } as Storage;
  return { storage, data };
}

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setWindow(value: unknown): void {
  Object.defineProperty(globalThis, 'window', {
    value,
    configurable: true,
    writable: true,
  });
}

function restoreWindow(): void {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    delete (globalThis as Record<string, unknown>).window;
  }
}

beforeEach(() => {
  // Reset store to defaults before every test.
  useUI.setState({ sidebarCollapsed: false, zenMode: false });
});

afterEach(() => {
  restoreWindow();
});

describe('ui-store — sidebar collapse', () => {
  test('toggleSidebar flips state and persists to localStorage', () => {
    const { storage, data } = makeMemoryStorage();
    setWindow({ localStorage: storage });

    expect(useUI.getState().sidebarCollapsed).toBe(false);
    useUI.getState().toggleSidebar();
    expect(useUI.getState().sidebarCollapsed).toBe(true);
    expect(data[SIDEBAR_KEY]).toBe('1');

    useUI.getState().toggleSidebar();
    expect(useUI.getState().sidebarCollapsed).toBe(false);
    expect(data[SIDEBAR_KEY]).toBe('0');
  });

  test('setSidebarCollapsed sets state and persists', () => {
    const { storage, data } = makeMemoryStorage();
    setWindow({ localStorage: storage });

    useUI.getState().setSidebarCollapsed(true);
    expect(useUI.getState().sidebarCollapsed).toBe(true);
    expect(data[SIDEBAR_KEY]).toBe('1');

    useUI.getState().setSidebarCollapsed(false);
    expect(useUI.getState().sidebarCollapsed).toBe(false);
    expect(data[SIDEBAR_KEY]).toBe('0');
  });

  test('readSidebarCollapsed reflects persisted value', () => {
    const { storage, data } = makeMemoryStorage();
    setWindow({ localStorage: storage });

    expect(readSidebarCollapsed()).toBeNull(); // unset

    data[SIDEBAR_KEY] = '1';
    expect(readSidebarCollapsed()).toBe(true);

    data[SIDEBAR_KEY] = '0';
    expect(readSidebarCollapsed()).toBe(false);
  });
});

describe('ui-store — zen mode (ephemeral)', () => {
  test('toggleZen flips state', () => {
    expect(useUI.getState().zenMode).toBe(false);
    useUI.getState().toggleZen();
    expect(useUI.getState().zenMode).toBe(true);
    useUI.getState().toggleZen();
    expect(useUI.getState().zenMode).toBe(false);
  });

  test('setZen sets state', () => {
    useUI.getState().setZen(true);
    expect(useUI.getState().zenMode).toBe(true);
    useUI.getState().setZen(false);
    expect(useUI.getState().zenMode).toBe(false);
  });

  test('zen mode never persists to localStorage', () => {
    const { storage, data } = makeMemoryStorage();
    setWindow({ localStorage: storage });
    useUI.getState().setZen(true);
    useUI.getState().toggleZen();
    expect(Object.keys(data)).toHaveLength(0);
  });
});

describe('ui-store — SSR / storage-failure safety', () => {
  test('persisting is a no-op (no throw) when window is absent', () => {
    setWindow(undefined);
    expect(() => useUI.getState().toggleSidebar()).not.toThrow();
    // State still flips even though persistence was skipped.
    expect(useUI.getState().sidebarCollapsed).toBe(true);
  });

  test('readSidebarCollapsed returns null (no throw) when window is absent', () => {
    setWindow(undefined);
    expect(() => readSidebarCollapsed()).not.toThrow();
    expect(readSidebarCollapsed()).toBeNull();
  });

  test('persisting is a no-op (no throw) when localStorage throws', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    setWindow({ localStorage: throwingStorage });

    expect(() => useUI.getState().setSidebarCollapsed(true)).not.toThrow();
    expect(useUI.getState().sidebarCollapsed).toBe(true);
    expect(() => readSidebarCollapsed()).not.toThrow();
    expect(readSidebarCollapsed()).toBeNull();
  });
});
