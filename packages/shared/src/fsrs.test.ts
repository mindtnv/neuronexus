import { describe, expect, test } from 'bun:test';
import {
  ANKI_DEFAULTS,
  gradeFsrs,
  isLeech,
  levelFromXp,
  nextStreak,
  newFsrsCard,
  plantStageFromStreak,
  previewGrades,
  stateLabel,
  State,
  xpForRating,
} from './fsrs.ts';

// All scheduling tests disable fuzz via the deterministic seed hook so `due`
// deltas are reproducible.
const DETERMINISTIC = { enableFuzz: false } as const;

describe('newFsrsCard', () => {
  test('returns a fresh card in State.New with 0 reps/lapses', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const c = newFsrsCard(now);
    expect(c.state).toBe(State.New);
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(0);
    expect(c.stability).toBe(0);
    expect(c.difficulty).toBe(0);
    expect(c.learning_steps).toBe(0);
    expect(c.last_review).toBeUndefined();
  });
});

describe('gradeFsrs', () => {
  test('New + Good → Learning, reps=1, due in the future', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const card = newFsrsCard(now);
    const { card: next } = gradeFsrs(card, 3, now, DETERMINISTIC);
    expect(next.state).toBe(State.Learning);
    expect(next.reps).toBe(1);
    expect(next.lapses).toBe(0);
    expect(next.due.getTime()).toBeGreaterThan(now.getTime());
  });

  test('Again on a new card keeps state=Learning and increments reps', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const card = newFsrsCard(now);
    const { card: next } = gradeFsrs(card, 1, now, DETERMINISTIC);
    expect(next.reps).toBe(1);
    // On a brand-new card Again does NOT increment lapses (a "lapse" is a
    // fail on a Review card, not on a card that was never mature).
    expect(next.lapses).toBe(0);
    // Still in Learning, not promoted.
    expect(next.state).toBe(State.Learning);
  });

  test('Easy on a new card graduates directly to Review', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const card = newFsrsCard(now);
    const { card: next } = gradeFsrs(card, 4, now, DETERMINISTIC);
    expect(next.state).toBe(State.Review);
    expect(next.reps).toBe(1);
    expect(next.scheduled_days).toBeGreaterThan(0);
  });

  test('Review card rated Again → Relearning, lapses+1', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    let card = newFsrsCard(now);
    // Graduate card quickly: Easy → Review.
    card = gradeFsrs(card, 4, now, DETERMINISTIC).card;
    expect(card.state).toBe(State.Review);
    const reviewAt = new Date(card.due.getTime() + 1_000);
    const { card: lapsed } = gradeFsrs(card, 1, reviewAt, DETERMINISTIC);
    expect(lapsed.state).toBe(State.Relearning);
    expect(lapsed.lapses).toBe(1);
  });

  test('higher desired retention schedules sooner than lower retention', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const card = newFsrsCard(now);
    // Use Good rating, compare intervals across different retention targets.
    const tight = gradeFsrs(card, 3, now, { enableFuzz: false, requestRetention: 0.95 }).card;
    const loose = gradeFsrs(card, 3, now, { enableFuzz: false, requestRetention: 0.8 }).card;
    // Higher retention ⇒ review more often ⇒ earlier due date.
    expect(tight.due.getTime()).toBeLessThanOrEqual(loose.due.getTime());
  });
});

describe('previewGrades', () => {
  test('returns four distinct cards, one per rating', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const card = newFsrsCard(now);
    const previews = previewGrades(card, now, DETERMINISTIC);
    expect(Object.keys(previews).sort()).toEqual(['1', '2', '3', '4']);
    // Monotonic-ish: Easy schedules furthest out, Again soonest.
    expect(previews[1].due.getTime()).toBeLessThanOrEqual(previews[2].due.getTime());
    expect(previews[2].due.getTime()).toBeLessThanOrEqual(previews[3].due.getTime());
    expect(previews[3].due.getTime()).toBeLessThanOrEqual(previews[4].due.getTime());
  });
});

describe('stateLabel', () => {
  test('maps all 4 FSRS states to string labels', () => {
    expect(stateLabel(State.New)).toBe('new');
    expect(stateLabel(State.Learning)).toBe('learning');
    expect(stateLabel(State.Review)).toBe('review');
    expect(stateLabel(State.Relearning)).toBe('relearning');
  });
});

describe('xp / level / plant-stage helpers', () => {
  test('xpForRating gives 0 for Again, ramps to 15 for Easy', () => {
    expect(xpForRating(1)).toBe(0);
    expect(xpForRating(2)).toBe(5);
    expect(xpForRating(3)).toBe(10);
    expect(xpForRating(4)).toBe(15);
  });

  test('levelFromXp is floor(xp/500)+1, minimum 1', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(499)).toBe(1);
    expect(levelFromXp(500)).toBe(2);
    expect(levelFromXp(2500)).toBe(6);
  });

  test('plantStage is floor(streak/7) clamped to 0..5', () => {
    expect(plantStageFromStreak(0)).toBe(0);
    expect(plantStageFromStreak(6)).toBe(0);
    expect(plantStageFromStreak(7)).toBe(1);
    expect(plantStageFromStreak(30)).toBe(4);
    expect(plantStageFromStreak(60)).toBe(5); // clamped
  });
});

describe('nextStreak', () => {
  test('same day → unchanged', () => {
    expect(nextStreak(5, '2026-04-18', '2026-04-18')).toBe(5);
  });
  test('yesterday → +1', () => {
    expect(nextStreak(5, '2026-04-17', '2026-04-18')).toBe(6);
  });
  test('gap → reset to 1', () => {
    expect(nextStreak(20, '2026-04-10', '2026-04-18')).toBe(1);
  });
  test('null last-date → reset to 1', () => {
    expect(nextStreak(0, null, '2026-04-18')).toBe(1);
  });
  test('month boundary is respected', () => {
    // 2026-03-31 → 2026-04-01 is yesterday
    expect(nextStreak(3, '2026-03-31', '2026-04-01')).toBe(4);
  });
});

describe('isLeech', () => {
  test('flags cards at or above the Anki default threshold (8)', () => {
    expect(isLeech(0)).toBe(false);
    expect(isLeech(7)).toBe(false);
    expect(isLeech(8)).toBe(true);
    expect(isLeech(20)).toBe(true);
  });
  test('threshold is overridable', () => {
    expect(isLeech(3, 3)).toBe(true);
    expect(isLeech(3, 4)).toBe(false);
  });
});

describe('ANKI_DEFAULTS sanity', () => {
  test('canonical defaults match Anki out-of-the-box', () => {
    expect(ANKI_DEFAULTS.requestRetention).toBe(0.9);
    expect(ANKI_DEFAULTS.leechThreshold).toBe(8);
    expect(ANKI_DEFAULTS.learningSteps).toEqual(['1m', '10m']);
    expect(ANKI_DEFAULTS.relearningSteps).toEqual(['10m']);
  });
});
