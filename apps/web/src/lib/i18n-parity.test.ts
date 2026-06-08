// T6 — i18n key parity: en/settings.ts and ru/settings.ts must have identical
// dot-path key sets (fully recursive — settings dicts are nested objects).
//
// This is net-new test infrastructure; no i18n parity harness existed before.
// Uses recursive key extraction so nested keys like `notifications.enable`
// are captured — NOT shallow Object.keys which would miss them.

import { describe, expect, test } from 'bun:test';
import enSettings from './messages/en/settings';
import ruSettings from './messages/ru/settings';
import enChat from './messages/en/chat';
import ruChat from './messages/ru/chat';
import enCommon from './messages/en/common';
import ruCommon from './messages/ru/common';

// ── Recursive key extractor ──────────────────────────────────────────────────

type NestedDict = { [key: string]: string | NestedDict };

/**
 * Flatten a nested object into dot-path keys.
 * e.g. { a: { b: 'x' } } → ['a.b']
 */
function flattenKeys(obj: NestedDict, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      keys.push(...flattenKeys(v as NestedDict, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('i18n parity — en/settings.ts vs ru/settings.ts', () => {
  const enKeys = new Set(flattenKeys(enSettings as unknown as NestedDict));
  const ruKeys = new Set(flattenKeys(ruSettings as unknown as NestedDict));

  test('en and ru have the same set of dot-path keys (no missing or extra)', () => {
    const missingInRu = [...enKeys].filter((k) => !ruKeys.has(k));
    const missingInEn = [...ruKeys].filter((k) => !enKeys.has(k));

    if (missingInRu.length > 0 || missingInEn.length > 0) {
      const lines: string[] = [];
      if (missingInRu.length > 0) {
        lines.push(`Keys in en but missing in ru:\n  ${missingInRu.join('\n  ')}`);
      }
      if (missingInEn.length > 0) {
        lines.push(`Keys in ru but missing in en:\n  ${missingInEn.join('\n  ')}`);
      }
      throw new Error(`i18n parity failure:\n${lines.join('\n')}`);
    }

    expect(missingInRu).toHaveLength(0);
    expect(missingInEn).toHaveLength(0);
  });

  // Explicit guard: the new notification keys must exist in both locales.
  const REQUIRED_NOTIFICATION_KEYS = [
    'notifications.title',
    'notifications.subtitle',
    'notifications.enable',
    'notifications.enableDesc',
    'notifications.denied',
    'notifications.unavailable',
  ];

  for (const key of REQUIRED_NOTIFICATION_KEYS) {
    test(`notification key "${key}" exists in en/settings`, () => {
      expect(enKeys.has(key)).toBe(true);
    });

    test(`notification key "${key}" exists in ru/settings`, () => {
      expect(ruKeys.has(key)).toBe(true);
    });
  }
});

describe('i18n parity — en/chat.ts vs ru/chat.ts (Slice 5)', () => {
  const enKeys = new Set(flattenKeys(enChat as unknown as NestedDict));
  const ruKeys = new Set(flattenKeys(ruChat as unknown as NestedDict));

  test('en and ru chat dicts have the same set of dot-path keys', () => {
    const missingInRu = [...enKeys].filter((k) => !ruKeys.has(k));
    const missingInEn = [...ruKeys].filter((k) => !enKeys.has(k));

    if (missingInRu.length > 0 || missingInEn.length > 0) {
      const lines: string[] = [];
      if (missingInRu.length > 0) {
        lines.push(`Keys in en but missing in ru:\n  ${missingInRu.join('\n  ')}`);
      }
      if (missingInEn.length > 0) {
        lines.push(`Keys in ru but missing in en:\n  ${missingInEn.join('\n  ')}`);
      }
      throw new Error(`i18n chat parity failure:\n${lines.join('\n')}`);
    }

    expect(missingInRu).toHaveLength(0);
    expect(missingInEn).toHaveLength(0);
  });

  // The nav entry for the /chat screen must exist in both locales' common dicts.
  test('nav.chat exists in en/common', () => {
    expect(flattenKeys(enCommon as unknown as NestedDict)).toContain('nav.chat');
  });
  test('nav.chat exists in ru/common', () => {
    expect(flattenKeys(ruCommon as unknown as NestedDict)).toContain('nav.chat');
  });
});
