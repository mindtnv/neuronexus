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
import enNotebooks from './messages/en/notebooks';
import ruNotebooks from './messages/ru/notebooks';
import enCommon from './messages/en/common';
import ruCommon from './messages/ru/common';
import { INGEST_ERROR_CODES } from '@neuronexus/shared';

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

  // Explicit guard: the agent-instructions section (C5) — mirrors the
  // notifications guard (a key absent from BOTH locales slips the symmetric diff).
  const REQUIRED_AGENT_SETTINGS_KEYS = [
    'agent.title',
    'agent.subtitle',
    'agent.placeholder',
    'agent.hint',
  ];

  for (const key of REQUIRED_AGENT_SETTINGS_KEYS) {
    test(`agent-settings key "${key}" exists in en/settings`, () => {
      expect(enKeys.has(key)).toBe(true);
    });

    test(`agent-settings key "${key}" exists in ru/settings`, () => {
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

  // Explicit guard: the new agentic-chat keys (reasoning trace + tool-call cards)
  // must exist in BOTH locales. The symmetric diff above only catches a key
  // present in one locale and missing in the other — a key absent from BOTH
  // would slip through it, so this enumerated guard is required (mirrors
  // REQUIRED_NOTIFICATION_KEYS for the settings dict).
  const REQUIRED_CHAT_AGENT_KEYS = [
    'reasoning.label',
    'reasoning.show',
    'reasoning.hide',
    'tool.search_cards',
    'tool.web_search',
    'tool.running',
    'tool.done',
    'tool.failed',
    'tool.awaiting',
    'tool.resultToggle',
    // Turn-lock notice (per-conversation serialization, 409 turn_in_progress).
    'errors.turnInProgress',
    // Composer attachments (images via the media pipeline + inline text files).
    'composer.attach',
    'composer.removeAttachment',
    'composer.attachLimit',
    'composer.attachTooBig',
    'composer.attachUnsupported',
    'composer.attachFailed',
    // Phase B — confirm-before-write controls + blast-radius summary.
    'confirm.pendingTitle',
    'confirm.apply',
    'confirm.reject',
    'confirm.applied',
    'confirm.rejected',
    'confirm.willCreate',
    'confirm.willDelete',
    'confirm.affectsSiblings',
    // Progress-tools + reasoning/model-selector + UX milestone
    // (model picker, stop, deck-scope, rename + relative timestamps,
    // copy/regenerate/open-card/stopped-retry, progress tool labels).
    'composer.model',
    'composer.stop',
    'composer.deckScope',
    'composer.allDecks',
    'threads.rename',
    'threads.updatedAgo',
    'threads.relativeNow',
    'threads.relativeMinutes',
    'threads.relativeHours',
    'threads.relativeDays',
    'message.copy',
    'message.copied',
    'message.regenerate',
    'message.openCard',
    'message.stoppedRetry',
    'tool.card_progress',
    'tool.study_stats',
    // Deterministic browse tools (list_decks / browse_cards / get_card).
    'tool.list_decks',
    'tool.browse_cards',
    'tool.get_card',
    // Codex-like redesign — repeated-call pluralized labels (AC2.2 collapse).
    'tool.get_card_n',
    'tool.card_progress_n',
    'tool.browse_cards_n',
    // Codex-like redesign — condensed activity group header + post-apply line.
    'activity.worked',
    'activity.working',
    'activity.workedSub',
    'activity.workedSeconds',
    'activity.workedMinutes',
    'activity.workedHours',
    'activity.steps',
    'activity.step',
    'activity.appliedCreated',
    'activity.appliedCreatedNodeck',
    'activity.appliedCreatedOne',
    'activity.appliedCreatedOneNodeck',
    'activity.appliedEdited',
    // Codex-like redesign — edit-and-rerun the last user message (AC4.1).
    'message.edit',
    'message.editSave',
    'message.editCancel',
    // Due-forecast read tool (upcoming workload) + its plural form.
    'tool.due_forecast',
    'tool.due_forecast_n',
    // Deep research: fetch_page tool labels + the /research slash command +
    // the composer mode toggle.
    'tool.fetch_page',
    'tool.fetch_page_n',
    'slash.researchLabel',
    'slash.researchTemplate',
    'composer.research',
    'composer.researchHint',
    'composer.researchPlaceholder',
    // Suggested prompts on the empty chat state.
    'suggested.dueToday',
    'suggested.deckProgress',
    'suggested.failing',
    'suggested.quiz',
    // ── Agentic-environment pack ─────────────────────────────────────────────
    // Thread rail: search + date groups + pin (A1/A2/C4).
    'threads.searchPlaceholder',
    'threads.searchNoResults',
    'threads.groupPinned',
    'threads.groupToday',
    'threads.groupYesterday',
    'threads.groupWeek',
    'threads.groupOlder',
    'threads.pin',
    'threads.unpin',
    // Smart scroll + day separators (B1/B2).
    'stream.jumpToBottom',
    'stream.newMessages',
    'stream.today',
    'stream.yesterday',
    // Code copy + model/token badge + follow-up queue (B3/B6/D4).
    'message.codeCopy',
    'message.codeCopied',
    'message.tokens',
    'message.queued',
    'message.queuedCancel',
    // Write/SRS tool labels (B5) + batch create variants.
    'tool.create_card',
    'tool.create_card_nodeck',
    'tool.create_card_batch',
    'tool.create_card_batch_nodeck',
    'tool.edit_card',
    'tool.suspend',
    'tool.set_due',
    'tool.forget',
    // Confirm previews (B4/C8) + batch create_card per-card heading + the
    // per-card confirm editor (include/exclude/edit + feedback).
    'confirm.changes',
    'confirm.proposed',
    'confirm.cardN',
    'confirm.applyN',
    'confirm.excludeCard',
    'confirm.includeCard',
    'confirm.feedbackPlaceholder',
    'confirm.cardOf',
    'confirm.acceptCard',
    'confirm.back',
    'confirm.acceptedBadge',
    'confirm.excludedBadge',
    'confirm.reviewJump',
    // Composer @-mentions (D1) + slash commands (D2).
    'composer.mentionDecks',
    'composer.mentionCards',
    'composer.mentionNoResults',
    'composer.removeMention',
    'slash.quizLabel',
    'slash.quizTemplate',
    'slash.forecastLabel',
    'slash.forecastTemplate',
    'slash.statsLabel',
    'slash.statsTemplate',
    'slash.reviewLabel',
    'slash.reviewTemplate',
  ];

  for (const key of REQUIRED_CHAT_AGENT_KEYS) {
    test(`agentic-chat key "${key}" exists in en/chat`, () => {
      expect(enKeys.has(key)).toBe(true);
    });

    test(`agentic-chat key "${key}" exists in ru/chat`, () => {
      expect(ruKeys.has(key)).toBe(true);
    });
  }
});

describe('i18n parity — en/notebooks.ts vs ru/notebooks.ts (NotebookLM M1, T8)', () => {
  const enKeys = new Set(flattenKeys(enNotebooks as unknown as NestedDict));
  const ruKeys = new Set(flattenKeys(ruNotebooks as unknown as NestedDict));

  test('en and ru notebooks dicts have the same set of dot-path keys', () => {
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
      throw new Error(`i18n notebooks parity failure:\n${lines.join('\n')}`);
    }

    expect(missingInRu).toHaveLength(0);
    expect(missingInEn).toHaveLength(0);
  });

  // The nav entry for the /notebooks screen must exist in both locales' common dicts.
  test('nav.notebooks exists in en/common', () => {
    expect(flattenKeys(enCommon as unknown as NestedDict)).toContain('nav.notebooks');
  });
  test('nav.notebooks exists in ru/common', () => {
    expect(flattenKeys(ruCommon as unknown as NestedDict)).toContain('nav.notebooks');
  });

  // Explicit guard: every ingest error code (the machine `errorCode` on a source
  // row) must map to a `status.<code>` i18n key in BOTH locales — a code absent
  // from both would slip the symmetric diff (mirrors REQUIRED_NOTIFICATION_KEYS).
  // Sourced directly from the shared INGEST_ERROR_CODES so adding a code there
  // forces a matching i18n entry here.
  for (const code of INGEST_ERROR_CODES) {
    const key = `status.${code}`;
    test(`ingest error-code key "${key}" exists in en/notebooks`, () => {
      expect(enKeys.has(key)).toBe(true);
    });
    test(`ingest error-code key "${key}" exists in ru/notebooks`, () => {
      expect(ruKeys.has(key)).toBe(true);
    });
  }
});
