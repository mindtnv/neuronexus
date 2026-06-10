// Unit tests for the pure chat-thread-rail helpers (A1/A2/C4).

import { describe, expect, test } from 'bun:test';
import {
  conversationTitle,
  filterThreads,
  groupThreads,
  type ConversationVM,
} from './chat-threads';

function conv(id: string, title: string | null, updatedAt: string, pinned = false): ConversationVM {
  return { id, title, updatedAt, pinned };
}

// A fixed local "now": June 10, 2026 14:00 local time.
const NOW = new Date(2026, 5, 10, 14, 0, 0);
const iso = (y: number, mo: number, d: number, h = 12) => new Date(y, mo, d, h).toISOString();

describe('filterThreads (A1)', () => {
  const items = [
    conv('a', 'German verbs', iso(2026, 5, 10)),
    conv('b', 'FSRS tuning', iso(2026, 5, 9)),
    conv('c', null, iso(2026, 5, 8)),
  ];

  test('case-insensitive substring over the effective title', () => {
    expect(filterThreads(items, 'german', 'New conversation').map((c) => c.id)).toEqual(['a']);
    expect(filterThreads(items, 'FSRS', 'New conversation').map((c) => c.id)).toEqual(['b']);
  });

  test('untitled threads match via the localized fallback', () => {
    expect(filterThreads(items, 'new conv', 'New conversation').map((c) => c.id)).toEqual(['c']);
  });

  test('empty/whitespace query returns everything', () => {
    expect(filterThreads(items, '   ', 'x')).toHaveLength(3);
  });
});

describe('groupThreads (A2/C4)', () => {
  test('buckets by LOCAL midnights: today / yesterday / week / older; empty groups omitted', () => {
    const items = [
      conv('today', 'T', new Date(2026, 5, 10, 0, 30).toISOString()), // just past local midnight
      conv('yesterday', 'Y', new Date(2026, 5, 9, 23, 0).toISOString()),
      conv('week', 'W', new Date(2026, 5, 5, 12, 0).toISOString()),
      conv('older', 'O', new Date(2026, 4, 1, 12, 0).toISOString()),
    ];
    const groups = groupThreads(items, NOW);
    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'week', 'older']);
    expect(groups.map((g) => g.items[0]!.id)).toEqual(['today', 'yesterday', 'week', 'older']);
  });

  test('pinned threads sort above everything regardless of recency', () => {
    const items = [
      conv('fresh', 'F', new Date(2026, 5, 10, 13, 0).toISOString()),
      conv('pinnedOld', 'P', new Date(2026, 3, 1).toISOString(), true),
    ];
    const groups = groupThreads(items, NOW);
    expect(groups[0]!.key).toBe('pinned');
    expect(groups[0]!.items[0]!.id).toBe('pinnedOld');
    // The pinned one does NOT also appear in a date bucket.
    expect(groups.flatMap((g) => g.items).filter((c) => c.id === 'pinnedOld')).toHaveLength(1);
  });

  test('each bucket is sorted by recency desc; future timestamps land in today', () => {
    const items = [
      conv('older1', 'A', new Date(2026, 5, 10, 9, 0).toISOString()),
      conv('newer1', 'B', new Date(2026, 5, 10, 13, 0).toISOString()),
      conv('future', 'C', new Date(2026, 5, 11, 9, 0).toISOString()),
    ];
    const groups = groupThreads(items, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('today');
    expect(groups[0]!.items.map((c) => c.id)).toEqual(['future', 'newer1', 'older1']);
  });

  test('exactly-7-days boundary: 7 days ago at midnight is still "week", older is not', () => {
    const sevenDaysAgoNoon = new Date(2026, 5, 3, 12, 0).toISOString();
    const eightDaysAgo = new Date(2026, 5, 2, 12, 0).toISOString();
    const groups = groupThreads(
      [conv('w', 'W', sevenDaysAgoNoon), conv('o', 'O', eightDaysAgo)],
      NOW,
    );
    expect(groups.find((g) => g.key === 'week')!.items[0]!.id).toBe('w');
    expect(groups.find((g) => g.key === 'older')!.items[0]!.id).toBe('o');
  });

  test('unparseable updatedAt lands in older', () => {
    const groups = groupThreads([conv('x', 'X', 'garbage')], NOW);
    expect(groups[0]!.key).toBe('older');
  });
});

describe('conversationTitle', () => {
  test('trims and falls back', () => {
    expect(conversationTitle(conv('a', '  T  ', ''), 'fb')).toBe('T');
    expect(conversationTitle(conv('a', '   ', ''), 'fb')).toBe('fb');
    expect(conversationTitle(conv('a', null, ''), 'fb')).toBe('fb');
  });
});
