// Unit tests for the three builtin note-types (Milestone 1, Phase 3).
// Each builtin is fed example FieldValues and checked against `generateCards` +
// `renderTemplate` output to confirm it reproduces the review.tsx behaviors.

import { describe, it, expect } from 'bun:test';
import {
  BASIC_NOTE_TYPE,
  CLOZE_NOTE_TYPE,
  TYPEIN_NOTE_TYPE,
  BUILTIN_NOTE_TYPES,
  BUILTIN_BY_KIND,
} from './builtin-note-types.ts';
import { generateCards, renderTemplate } from './template.ts';

// ── Catalog shape ─────────────────────────────────────────────────────────────

describe('BUILTIN_NOTE_TYPES catalog', () => {
  it('contains exactly 3 builtins', () => {
    expect(BUILTIN_NOTE_TYPES).toHaveLength(3);
  });

  it('all builtins have isBuiltin=true and a stable UUID id', () => {
    // Stable id literals (B8) are the single source of truth for migration 0007
    // and ensureBuiltins — they must be present and valid v4 UUIDs.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const ids = new Set<string>();
    for (const nt of BUILTIN_NOTE_TYPES) {
      expect(nt.isBuiltin).toBe(true);
      expect(nt.id).toMatch(uuidRe);
      ids.add(nt.id!);
    }
    // ids are distinct across the 3 builtins.
    expect(ids.size).toBe(BUILTIN_NOTE_TYPES.length);
  });

  it('builtin id literals match the migration 0007 INSERT (cross-edge pin)', async () => {
    // Scrape the committed migration SQL and confirm each builtin id appears in
    // it — the migration and BUILTIN_NOTE_TYPES must never drift.
    const url = new URL('../../db/src/migrations/0007_builtin_note_types.sql', import.meta.url);
    const sqlText = await Bun.file(url).text();
    for (const nt of BUILTIN_NOTE_TYPES) {
      expect(sqlText).toContain(nt.id!);
    }
  });

  it('BUILTIN_BY_KIND maps basic/cloze/typein correctly', () => {
    expect(BUILTIN_BY_KIND.basic).toBe(BASIC_NOTE_TYPE);
    expect(BUILTIN_BY_KIND.cloze).toBe(CLOZE_NOTE_TYPE);
    expect(BUILTIN_BY_KIND.typein).toBe(TYPEIN_NOTE_TYPE);
    expect(BUILTIN_BY_KIND.custom).toBeUndefined();
  });

  it('back-template contract: Basic/Type-in answer-only, Cloze unchanged', () => {
    // Basic + Type-in render the answer ONLY (no `{{Front}}<hr>` echo) — the
    // reviewer pins the question above, so echoing the front would duplicate it.
    expect(BASIC_NOTE_TYPE.templates[0].backTemplate).toBe('{{Back}}');
    expect(TYPEIN_NOTE_TYPE.templates[0].backTemplate).toBe('{{Back}}');
    // Cloze MUST stay `{{Text}}<hr>{{Extra}}` — its front is the blanks, its back is
    // the filled-in text, so there is no duplication to remove.
    expect(CLOZE_NOTE_TYPE.templates[0].backTemplate).toBe('{{Text}}<hr>{{Extra}}');
  });
});

// ── Basic ─────────────────────────────────────────────────────────────────────

describe('BASIC_NOTE_TYPE', () => {
  const fields = { Front: 'What is the capital of France?', Back: 'Paris' };

  it('has kind=basic, 2 fields, 1 template', () => {
    expect(BASIC_NOTE_TYPE.kind).toBe('basic');
    expect(BASIC_NOTE_TYPE.fields).toHaveLength(2);
    expect(BASIC_NOTE_TYPE.templates).toHaveLength(1);
  });

  it('fields are Front(ord=0) and Back(ord=1)', () => {
    const [front, back] = BASIC_NOTE_TYPE.fields;
    expect(front).toEqual({ name: 'Front', ord: 0 });
    expect(back).toEqual({ name: 'Back', ord: 1 });
  });

  it('generateCards produces 1 card with renderKind=basic', () => {
    const cards = generateCards(BASIC_NOTE_TYPE, fields);
    expect(cards).toHaveLength(1);
    expect(cards[0].renderKind).toBe('basic');
    expect(cards[0].templateOrd).toBe(0);
  });

  it('renderFrontText contains the front field value (plaintext)', () => {
    const cards = generateCards(BASIC_NOTE_TYPE, fields);
    expect(cards[0].renderFrontText).toBe('What is the capital of France?');
  });

  it('renderBackText contains only the back field value (no front echo)', () => {
    const cards = generateCards(BASIC_NOTE_TYPE, fields);
    // back template = {{Back}} → answer only; the reviewer pins the question above
    // so echoing the front would duplicate it.
    expect(cards[0].renderBackText).toContain('Paris');
    expect(cards[0].renderBackText).not.toContain('What is the capital of France?');
  });

  it('back template is {{Back}} (answer only, no front echo / hr)', () => {
    expect(BASIC_NOTE_TYPE.templates[0].backTemplate).toBe('{{Back}}');
  });

  it('renderText is non-empty', () => {
    const cards = generateCards(BASIC_NOTE_TYPE, fields);
    expect(cards[0].renderText.length).toBeGreaterThan(0);
  });

  it('skips card generation when Front is empty (empty-front rule)', () => {
    const cards = generateCards(BASIC_NOTE_TYPE, { Front: '', Back: 'Paris' });
    expect(cards).toHaveLength(0);
  });

  it('front template renders Front field verbatim', () => {
    const tpl = BASIC_NOTE_TYPE.templates[0];
    const result = renderTemplate(tpl.frontTemplate, fields);
    expect(result).toBe('What is the capital of France?');
  });

  it('back template renders Back only (no front echo)', () => {
    const tpl = BASIC_NOTE_TYPE.templates[0];
    const result = renderTemplate(tpl.backTemplate, fields);
    expect(result).toBe('Paris');
  });
});

// ── Cloze ─────────────────────────────────────────────────────────────────────

describe('CLOZE_NOTE_TYPE', () => {
  const text = 'The capital of France is {{c1::Paris}}.';
  const extra = 'European capitals';
  const fields = { Text: text, Extra: extra };

  it('has kind=cloze, 2 fields, 1 template', () => {
    expect(CLOZE_NOTE_TYPE.kind).toBe('cloze');
    expect(CLOZE_NOTE_TYPE.fields).toHaveLength(2);
    expect(CLOZE_NOTE_TYPE.templates).toHaveLength(1);
  });

  it('fields are Text(ord=0) and Extra(ord=1)', () => {
    const [textField, extraField] = CLOZE_NOTE_TYPE.fields;
    expect(textField).toEqual({ name: 'Text', ord: 0 });
    expect(extraField).toEqual({ name: 'Extra', ord: 1 });
  });

  it('generateCards produces 1 card with renderKind=cloze', () => {
    const cards = generateCards(CLOZE_NOTE_TYPE, fields);
    expect(cards).toHaveLength(1);
    expect(cards[0].renderKind).toBe('cloze');
  });

  it('renderFrontText contains the prompt blank [...]', () => {
    // engine applies stripCloze(out, 'front') because kind==='cloze'
    const cards = generateCards(CLOZE_NOTE_TYPE, fields);
    expect(cards[0].renderFrontText).toContain('[…]');
    expect(cards[0].renderFrontText).not.toContain('Paris');
    expect(cards[0].renderFrontText).toContain('The capital of France is');
  });

  it('renderBackText contains the revealed answer', () => {
    const cards = generateCards(CLOZE_NOTE_TYPE, fields);
    // engine applies stripCloze(out, 'back') on the Text side → 'Paris' revealed
    expect(cards[0].renderBackText).toContain('Paris');
    expect(cards[0].renderBackText).toContain(extra);
  });

  it('prompt side: renderTemplate with cloze=true, side=front → blank', () => {
    const tpl = CLOZE_NOTE_TYPE.templates[0];
    const result = renderTemplate(tpl.frontTemplate, fields, { side: 'front', cloze: true });
    expect(result).toBe('The capital of France is […].');
  });

  it('answer side: renderTemplate with cloze=true, side=back → revealed', () => {
    const tpl = CLOZE_NOTE_TYPE.templates[0];
    const result = renderTemplate(tpl.frontTemplate, fields, { side: 'back', cloze: true });
    expect(result).toBe('The capital of France is Paris.');
  });

  it('card with no cloze markup still generates (non-empty text)', () => {
    // Text without cloze → front is plain text → non-empty → card generated
    const cards = generateCards(CLOZE_NOTE_TYPE, { Text: 'Plain text', Extra: '' });
    expect(cards).toHaveLength(1);
  });

  it('skips card generation when Text is empty', () => {
    const cards = generateCards(CLOZE_NOTE_TYPE, { Text: '', Extra: 'hint' });
    expect(cards).toHaveLength(0);
  });

  it('Extra field is optional — card still generated without it', () => {
    const cards = generateCards(CLOZE_NOTE_TYPE, { Text: text });
    expect(cards).toHaveLength(1);
    expect(cards[0].renderFrontText).toContain('[…]');
  });
});

// ── Type-in ───────────────────────────────────────────────────────────────────

describe('TYPEIN_NOTE_TYPE', () => {
  const fields = { Front: 'Translate: Hello', Back: 'Hola' };

  it('has kind=typein, 2 fields, 1 template', () => {
    expect(TYPEIN_NOTE_TYPE.kind).toBe('typein');
    expect(TYPEIN_NOTE_TYPE.fields).toHaveLength(2);
    expect(TYPEIN_NOTE_TYPE.templates).toHaveLength(1);
  });

  it('fields are Front(ord=0) and Back(ord=1)', () => {
    const [front, back] = TYPEIN_NOTE_TYPE.fields;
    expect(front).toEqual({ name: 'Front', ord: 0 });
    expect(back).toEqual({ name: 'Back', ord: 1 });
  });

  it('generateCards produces 1 card with renderKind=typein', () => {
    const cards = generateCards(TYPEIN_NOTE_TYPE, fields);
    expect(cards).toHaveLength(1);
    expect(cards[0].renderKind).toBe('typein');
  });

  it('renderFrontText contains the front field', () => {
    const cards = generateCards(TYPEIN_NOTE_TYPE, fields);
    expect(cards[0].renderFrontText).toBe('Translate: Hello');
  });

  it('renderBackText contains only the back field (no front echo, same as Basic)', () => {
    const cards = generateCards(TYPEIN_NOTE_TYPE, fields);
    expect(cards[0].renderBackText).toContain('Hola');
    expect(cards[0].renderBackText).not.toContain('Translate: Hello');
  });

  it('back template is {{Back}} (answer only, no front echo / hr)', () => {
    expect(TYPEIN_NOTE_TYPE.templates[0].backTemplate).toBe('{{Back}}');
  });

  it('renderText is non-empty', () => {
    const cards = generateCards(TYPEIN_NOTE_TYPE, fields);
    expect(cards[0].renderText.length).toBeGreaterThan(0);
  });

  it('skips card generation when Front is empty', () => {
    const cards = generateCards(TYPEIN_NOTE_TYPE, { Front: '', Back: 'Hola' });
    expect(cards).toHaveLength(0);
  });
});
