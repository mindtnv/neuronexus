import { expect, test } from 'bun:test';
import { TurnAdmission } from './turn-admission';

test('admission limits users independently and serializes each conversation', () => {
  const admission = new TurnAdmission();
  const a = admission.acquire('alice', 'a');
  expect(a.ok).toBe(true);
  expect(admission.acquire('alice', 'a')).toEqual({ ok: false, error: 'turn_in_progress' });
  expect(admission.acquire('alice', 'b').ok).toBe(true);
  expect(admission.acquire('alice', 'c').ok).toBe(true);
  expect(admission.acquire('alice', 'd')).toEqual({ ok: false, error: 'too_many_active_turns' });
  expect(admission.acquire('bob', 'e').ok).toBe(true);
  if (a.ok) admission.release('a', a.controller);
  expect(admission.acquire('alice', 'd').ok).toBe(true);
});

test('elapsed time and requested cancellation do not evict a live turn before settlement', () => {
  const admission = new TurnAdmission();
  const clock = Date.now;
  const initial = clock();
  const first = admission.acquire('alice', 'a');
  admission.acquire('alice', 'b'); admission.acquire('alice', 'c');
  try {
    Date.now = () => initial + 10 * 60_000;
    expect(admission.acquire('alice', 'd')).toEqual({ ok: false, error: 'too_many_active_turns' });
    expect(admission.acquire('alice', 'a')).toEqual({ ok: false, error: 'turn_in_progress' });
    if (!first.ok) throw new Error('Expected acquired turn');
    expect(first.controller.signal.aborted).toBe(false);
    first.controller.abort();
    expect(admission.acquire('alice', 'a').ok).toBe(false);
    admission.release('a', first.controller);
    const replacement = admission.acquire('alice', 'a');
    expect(replacement.ok).toBe(true);
    admission.release('a', first.controller);
    expect(admission.acquire('alice', 'a').ok).toBe(false);
    if (replacement.ok) admission.release('a', replacement.controller);
    expect(admission.acquire('alice', 'd').ok).toBe(true);
  } finally { Date.now = clock; }
});
