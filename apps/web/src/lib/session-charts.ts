import type { Rating } from './types';
export interface SessionAnswerSample { durationMs: number; rating: Rating }
export interface AnswerDurationGroup { first: number; last: number; count: number; meanMs: number; totalMs: number }

/** Consecutive groups retain every saved answer; large sessions stay readable. */
export function answerDurationGroups(answers: SessionAnswerSample[], limit = 40): AnswerDurationGroup[] {
  const cap = Number.isFinite(limit) ? Math.max(1, Math.min(80, Math.floor(limit))) : 40;
  const size = Math.max(1, Math.ceil(answers.length / cap));
  const groups: AnswerDurationGroup[] = [];
  for (let i = 0; i < answers.length; i += size) {
    const slice = answers.slice(i, i + size);
    const totalMs = slice.reduce((sum, sample) => sum + (Number.isFinite(sample.durationMs) ? Math.max(0, sample.durationMs) : 0), 0);
    groups.push({ first: i + 1, last: i + slice.length, count: slice.length, totalMs, meanMs: totalMs / slice.length });
  }
  return groups;
}
