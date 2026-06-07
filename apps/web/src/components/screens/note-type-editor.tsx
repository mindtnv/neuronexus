'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NNBtn, NNBadge, NNCard, NNIcon } from '@/components/ui';
import { useNN } from '@/lib/store';
import type { NoteType } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { renderCardHtml } from '@/lib/render-card';
import { RichCard } from '@/components/rich-card';
import type { CardTemplate, FieldValues, NoteField } from '@neuronexus/shared';

// ─────────────────────────────────────────────
// Note-type editor (Milestone 1, Phase 5b)
//
// The headline "create your own card types" feature. Lets the user:
//   - list existing note-types (own + global builtins; builtins are read-only
//     and offer a "Clone to edit" affordance),
//   - create a new note-type (name + dynamic fields + card templates + styling),
//   - edit an own note-type, or CLONE-ON-EDIT a builtin (server returns a new
//     user-owned copy via PATCH /note-types/:id),
//   - delete an own note-type (cascade warning).
//
// Live preview: per template, render front + back HTML from the draft def +
// sample field values (via `renderCardHtml` → DOMPurified by <SafeHtml>). Honors
// the empty-front skip rule: a template whose front renders empty shows
// "no card generated".
//
// Custom types are `kind='custom'` (builtins keep their kind; M1 doesn't let
// users author basic/cloze/typein render modes).
// ─────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const monoTextarea: React.CSSProperties = {
  ...inputStyle,
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: 13,
  lineHeight: 1.5,
  resize: 'vertical',
  minHeight: 72,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  marginBottom: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text)',
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-dim)',
  lineHeight: 1.4,
};

// ── Draft model ───────────────────────────────────────────────────────────────

interface Draft {
  name: string;
  fields: NoteField[];
  templates: CardTemplate[];
  styling: string;
}

function emptyDraft(): Draft {
  return {
    name: '',
    fields: [
      { name: 'Front', ord: 0 },
      { name: 'Back', ord: 1 },
    ],
    templates: [
      { name: 'Card 1', ord: 0, frontTemplate: '{{Front}}', backTemplate: '{{Front}}<hr>{{Back}}' },
    ],
    styling: '',
  };
}

function draftFromNoteType(nt: NoteType): Draft {
  return {
    name: nt.name,
    fields: [...nt.fields].sort((a, b) => a.ord - b.ord).map((f) => ({ ...f })),
    templates: [...nt.templates].sort((a, b) => a.ord - b.ord).map((t) => ({ ...t })),
    styling: nt.styling,
  };
}

// Re-pack ordinals to be dense 0..n-1 (the server validates dense/unique ords).
function reindex<T extends { ord: number }>(items: T[]): T[] {
  return items.map((it, i) => ({ ...it, ord: i }));
}

// ── List view ─────────────────────────────────────────────────────────────────

const NoteTypeList = ({
  noteTypes,
  onCreate,
  onEdit,
  onDelete,
}: {
  noteTypes: NoteType[];
  onCreate: () => void;
  onEdit: (nt: NoteType) => void;
  onDelete: (nt: NoteType) => void;
}) => {
  const t = useT();
  const sorted = useMemo(
    () => [...noteTypes].sort((a, b) => Number(b.isBuiltin) - Number(a.isBuiltin) || a.name.localeCompare(b.name)),
    [noteTypes],
  );

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div style={sectionTitleStyle}>{t('noteTypes.list.title')}</div>
        <div style={{ flex: 1 }} />
        <NNBtn size="sm" variant="primary" icon="plus" onClick={onCreate}>
          {t('noteTypes.list.newType')}
        </NNBtn>
      </div>

      {sorted.length === 0 ? (
        <NNCard>
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{t('noteTypes.list.empty')}</div>
        </NNCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((nt) => (
            <NNCard key={nt.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{nt.name}</div>
                <NNBadge size="xs" tone={nt.isBuiltin ? 'sky' : 'lime'}>
                  {nt.isBuiltin ? t('noteTypes.list.builtin') : t('noteTypes.list.custom')}
                </NNBadge>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {t('noteTypes.list.fieldsCount', { n: nt.fields.length })}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>·</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {t('noteTypes.list.templatesCount', { n: nt.templates.length })}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <NNBtn size="sm" variant="soft" icon="edit" onClick={() => onEdit(nt)}>
                  {nt.isBuiltin ? t('noteTypes.list.clone') : t('noteTypes.list.edit')}
                </NNBtn>
                {!nt.isBuiltin && (
                  <NNBtn size="sm" variant="danger" icon="x" onClick={() => onDelete(nt)}>
                    {t('noteTypes.list.delete')}
                  </NNBtn>
                )}
              </div>
            </NNCard>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Field editor row ────────────────────────────────────────────────────────────

const FieldRow = ({
  field,
  index,
  count,
  onRename,
  onMove,
  onRemove,
}: {
  field: NoteField;
  index: number;
  count: number;
  onRename: (name: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) => {
  const t = useT();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        value={field.name}
        onChange={(e) => onRename(e.target.value)}
        placeholder={t('noteTypes.fields.namePlaceholder')}
        style={{ ...inputStyle, flex: 1 }}
      />
      <NNBtn
        size="sm"
        variant="ghost"
        icon="chevd"
        ariaLabel={t('noteTypes.fields.moveDown')}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      />
      <NNBtn
        size="sm"
        variant="ghost"
        icon="chevd"
        ariaLabel={t('noteTypes.fields.moveUp')}
        disabled={index === 0}
        onClick={() => onMove(-1)}
        style={{ transform: 'rotate(180deg)' }}
      />
      <NNBtn
        size="sm"
        variant="ghost"
        icon="x"
        ariaLabel={t('noteTypes.fields.remove')}
        disabled={count <= 1}
        onClick={onRemove}
      />
    </div>
  );
};

// ── Template editor ─────────────────────────────────────────────────────────────

const TemplateEditor = ({
  template,
  count,
  fieldNames,
  onChange,
  onRemove,
}: {
  template: CardTemplate;
  count: number;
  fieldNames: string[];
  onChange: (patch: Partial<CardTemplate>) => void;
  onRemove: () => void;
}) => {
  const t = useT();
  const frontRef = useRef<HTMLTextAreaElement | null>(null);
  const backRef = useRef<HTMLTextAreaElement | null>(null);
  const [focused, setFocused] = useState<'front' | 'back'>('front');

  // Insert {{Field}} at the caret of the last-focused textarea.
  const insertField = (name: string) => {
    const token = `{{${name}}}`;
    const ref = focused === 'front' ? frontRef.current : backRef.current;
    const key = focused === 'front' ? 'frontTemplate' : 'backTemplate';
    const current = focused === 'front' ? template.frontTemplate : template.backTemplate;
    if (!ref) {
      onChange({ [key]: current + token } as Partial<CardTemplate>);
      return;
    }
    const start = ref.selectionStart ?? current.length;
    const end = ref.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    onChange({ [key]: next } as Partial<CardTemplate>);
    // Restore caret after the inserted token on the next tick.
    requestAnimationFrame(() => {
      ref.focus();
      const pos = start + token.length;
      ref.setSelectionRange(pos, pos);
    });
  };

  return (
    <NNCard style={{ background: 'var(--surface-2, var(--surface))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input
          value={template.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t('noteTypes.templates.namePlaceholder')}
          style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
        />
        <NNBtn
          size="sm"
          variant="ghost"
          icon="x"
          ariaLabel={t('noteTypes.templates.remove')}
          disabled={count <= 1}
          onClick={onRemove}
        />
      </div>

      {/* Field chips */}
      {fieldNames.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {t('noteTypes.templates.availableFields')}:
          </span>
          {fieldNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => insertField(name)}
              title={t('noteTypes.templates.insert')}
              style={{
                padding: '3px 8px',
                borderRadius: 'var(--r-pill, 999px)',
                background: 'var(--surface-3)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                fontSize: 11.5,
                cursor: 'pointer',
              }}
            >
              {`{{${name}}}`}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>
          <span>{t('noteTypes.templates.frontLabel')}</span>
        </div>
        <textarea
          ref={frontRef}
          value={template.frontTemplate}
          onFocus={() => setFocused('front')}
          onChange={(e) => onChange({ frontTemplate: e.target.value })}
          style={monoTextarea}
        />
      </div>
      <div>
        <div style={labelStyle}>
          <span>{t('noteTypes.templates.backLabel')}</span>
        </div>
        <textarea
          ref={backRef}
          value={template.backTemplate}
          onFocus={() => setFocused('back')}
          onChange={(e) => onChange({ backTemplate: e.target.value })}
          style={monoTextarea}
        />
      </div>
    </NNCard>
  );
};

// ── Template preview ─────────────────────────────────────────────────────────────

const TemplatePreview = ({
  template,
  draft,
  sample,
}: {
  template: CardTemplate;
  draft: Draft;
  sample: FieldValues;
}) => {
  const t = useT();
  // Build a throwaway NoteTypeDef-shaped object for the render helper. Custom
  // types render straight template output (kind='custom').
  const def = useMemo(
    () => ({ kind: 'custom' as const, templates: draft.templates }),
    [draft.templates],
  );
  const front = useMemo(
    () => renderCardHtml(def, sample, 'front', template.ord),
    [def, sample, template.ord],
  );
  const back = useMemo(
    () => renderCardHtml(def, sample, 'back', template.ord),
    [def, sample, template.ord],
  );
  const empty = !front.trim();

  return (
    <NNCard padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <NNIcon name="stack" size={13} color="var(--text-dim)" />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {template.name || t('noteTypes.preview.template')}
        </span>
      </div>
      {empty ? (
        <div style={{ padding: '18px 16px', color: 'var(--text-dim)', fontSize: 13 }}>
          {t('noteTypes.preview.noCard')}
        </div>
      ) : (
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={labelStyle}><span>{t('noteTypes.preview.front')}</span></div>
            <RichCard
              noteType={def}
              fieldValues={sample}
              side="front"
              templateOrd={template.ord}
              style={{ fontFamily: 'var(--font-serif)', fontSize: 22, lineHeight: 1.3, color: 'var(--text)', wordBreak: 'break-word' }}
            />
          </div>
          <div style={{ height: 1, background: 'linear-gradient(to right, transparent, var(--border-2), transparent)' }} />
          <div>
            <div style={labelStyle}><span>{t('noteTypes.preview.back')}</span></div>
            {back.trim() ? (
              <RichCard
                noteType={def}
                fieldValues={sample}
                side="back"
                templateOrd={template.ord}
                style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5, wordBreak: 'break-word' }}
              />
            ) : (
              <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>—</div>
            )}
          </div>
        </div>
      )}
    </NNCard>
  );
};

// ── Form view ────────────────────────────────────────────────────────────────

const NoteTypeForm = ({
  editing,
  onDone,
  onCancel,
}: {
  // The note-type being edited, or null for create. Builtins clone-on-edit.
  editing: NoteType | null;
  onDone: (saved: NoteType) => void;
  onCancel: () => void;
}) => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const addNoteType = useNN((s) => s.addNoteType);
  const updateNoteType = useNN((s) => s.updateNoteType);

  const isClone = editing?.isBuiltin ?? false;
  const [draft, setDraft] = useState<Draft>(() =>
    editing ? draftFromNoteType(editing) : emptyDraft(),
  );
  // Per-field sample values for the preview, keyed by field name. Default to the
  // field name itself so the author immediately sees where each field lands.
  const [sample, setSample] = useState<FieldValues>(() => {
    const init: FieldValues = {};
    (editing ? editing.fields : emptyDraft().fields).forEach((f) => {
      init[f.name] = f.name;
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldNames = useMemo(() => draft.fields.map((f) => f.name).filter(Boolean), [draft.fields]);

  // Keep sample values keyed by the CURRENT field names (drop renamed/removed,
  // seed new ones with the field name).
  const effectiveSample = useMemo(() => {
    const out: FieldValues = {};
    for (const name of fieldNames) {
      out[name] = sample[name] ?? name;
    }
    return out;
  }, [fieldNames, sample]);

  // ── Field mutations ──
  const setFieldName = useCallback((index: number, name: string) => {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f, i) => (i === index ? { ...f, name } : f)),
    }));
  }, []);

  const moveField = useCallback((index: number, dir: -1 | 1) => {
    setDraft((d) => {
      const next = [...d.fields];
      const j = index + dir;
      if (j < 0 || j >= next.length) return d;
      [next[index], next[j]] = [next[j], next[index]];
      return { ...d, fields: reindex(next) };
    });
  }, []);

  const removeField = useCallback((index: number) => {
    setDraft((d) => ({ ...d, fields: reindex(d.fields.filter((_, i) => i !== index)) }));
  }, []);

  const addField = useCallback(() => {
    setDraft((d) => ({
      ...d,
      fields: [...d.fields, { name: `Field ${d.fields.length + 1}`, ord: d.fields.length }],
    }));
  }, []);

  // ── Template mutations ──
  const setTemplate = useCallback((index: number, patch: Partial<CardTemplate>) => {
    setDraft((d) => ({
      ...d,
      templates: d.templates.map((tpl, i) => (i === index ? { ...tpl, ...patch } : tpl)),
    }));
  }, []);

  const removeTemplate = useCallback((index: number) => {
    setDraft((d) => ({ ...d, templates: reindex(d.templates.filter((_, i) => i !== index)) }));
  }, []);

  const addTemplate = useCallback(() => {
    setDraft((d) => {
      const first = d.fields[0]?.name ?? 'Front';
      const second = d.fields[1]?.name ?? d.fields[0]?.name ?? 'Back';
      return {
        ...d,
        templates: [
          ...d.templates,
          {
            name: `Card ${d.templates.length + 1}`,
            ord: d.templates.length,
            frontTemplate: `{{${first}}}`,
            backTemplate: `{{${first}}}<hr>{{${second}}}`,
          },
        ],
      };
    });
  }, []);

  const validate = (): string | null => {
    if (!draft.name.trim()) return t('noteTypes.errors.nameRequired');
    const names = draft.fields.map((f) => f.name.trim());
    if (names.length === 0 || names.some((n) => !n)) return t('noteTypes.errors.noFields');
    if (new Set(names).size !== names.length) return t('noteTypes.errors.duplicateFields');
    const tnames = draft.templates.map((tpl) => tpl.name.trim());
    if (tnames.length === 0 || tnames.some((n) => !n)) return t('noteTypes.errors.noTemplates');
    if (new Set(tnames).size !== tnames.length) return t('noteTypes.errors.duplicateTemplates');
    return null;
  };

  const handleSave = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSaving(true);
    // Re-pack ordinals dense+unique (server validates this) and trim names.
    const payload = {
      name: draft.name.trim(),
      fields: reindex(draft.fields.map((f) => ({ ...f, name: f.name.trim() }))),
      templates: reindex(draft.templates.map((tpl) => ({ ...tpl, name: tpl.name.trim() }))),
      styling: draft.styling,
    };
    try {
      let saved: NoteType;
      if (editing && !editing.isBuiltin) {
        // Own type → in-place PATCH (kind stays 'custom').
        saved = await updateNoteType(editing.id, payload);
      } else if (editing && editing.isBuiltin) {
        // CLONE-ON-EDIT: PATCH a builtin → server returns a NEW user-owned copy
        // (kind preserved server-side). Store appends the clone.
        saved = await updateNoteType(editing.id, payload);
      } else {
        // New custom type.
        saved = await addNoteType({ ...payload, kind: 'custom' });
      }
      onDone(saved);
    } catch (err) {
      console.error('note-type save failed', err);
      setError(err instanceof Error ? err.message : t('noteTypes.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const title = !editing
    ? t('noteTypes.editor.newTitle')
    : isClone
      ? t('noteTypes.editor.cloneTitle', { name: editing.name })
      : t('noteTypes.editor.editTitle', { name: editing.name });

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <NNBtn size="sm" variant="ghost" icon="chevl" onClick={onCancel}>
          {t('noteTypes.editor.back')}
        </NNBtn>
        <div style={sectionTitleStyle}>{title}</div>
        <div style={{ flex: 1 }} />
        <NNBtn size="sm" variant="primary" icon="check" onClick={handleSave} disabled={saving}>
          {saving
            ? t('noteTypes.actions.saving')
            : isClone
              ? t('noteTypes.actions.saveCopy')
              : t('noteTypes.actions.save')}
        </NNBtn>
      </div>

      {isClone && (
        <div style={{
          marginBottom: 16, padding: '10px 12px',
          background: 'rgba(85,196,214,0.08)', border: '1px solid rgba(85,196,214,0.28)',
          borderRadius: 10, color: 'var(--sky-400)', fontSize: 12.5,
        }}>
          {t('noteTypes.editor.cloneNotice')}
        </div>
      )}

      <div style={{ display: isMobile ? 'flex' : 'grid', flexDirection: 'column', gridTemplateColumns: isMobile ? undefined : '1fr 380px', gap: 20 }}>
        {/* Left: editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Name */}
          <div>
            <div style={labelStyle}><span>{t('noteTypes.editor.nameLabel')}</span></div>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={t('noteTypes.editor.namePlaceholder')}
              style={inputStyle}
            />
          </div>

          {/* Fields */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <div style={sectionTitleStyle}>{t('noteTypes.fields.title')}</div>
              <div style={{ flex: 1 }} />
              <NNBtn size="sm" variant="soft" icon="plus" onClick={addField}>
                {t('noteTypes.fields.addField')}
              </NNBtn>
            </div>
            <div style={{ ...hintStyle, marginBottom: 10 }}>{t('noteTypes.fields.hint')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.fields.map((field, i) => (
                <FieldRow
                  key={i}
                  field={field}
                  index={i}
                  count={draft.fields.length}
                  onRename={(name) => setFieldName(i, name)}
                  onMove={(dir) => moveField(i, dir)}
                  onRemove={() => removeField(i)}
                />
              ))}
            </div>
          </div>

          {/* Templates */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <div style={sectionTitleStyle}>{t('noteTypes.templates.title')}</div>
              <div style={{ flex: 1 }} />
              <NNBtn size="sm" variant="soft" icon="plus" onClick={addTemplate}>
                {t('noteTypes.templates.addTemplate')}
              </NNBtn>
            </div>
            <div style={{ ...hintStyle, marginBottom: 10 }}>
              {t('noteTypes.templates.syntaxHint', {
                field: '{{Field}}',
                cond: '{{#Field}}',
                inv: '{{^Field}}',
                condEnd: '{{/Field}}',
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {draft.templates.map((tpl, i) => (
                <TemplateEditor
                  key={i}
                  template={tpl}
                  count={draft.templates.length}
                  fieldNames={fieldNames}
                  onChange={(patch) => setTemplate(i, patch)}
                  onRemove={() => removeTemplate(i)}
                />
              ))}
            </div>
          </div>

          {/* Styling */}
          <div>
            <div style={sectionTitleStyle}>{t('noteTypes.styling.title')}</div>
            <div style={{ ...hintStyle, margin: '6px 0 10px' }}>{t('noteTypes.styling.hint')}</div>
            <textarea
              value={draft.styling}
              onChange={(e) => setDraft((d) => ({ ...d, styling: e.target.value }))}
              placeholder={t('noteTypes.styling.placeholder')}
              style={monoTextarea}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 12px',
              background: 'rgba(232,120,138,0.08)', border: '1px solid rgba(232,120,138,0.28)',
              borderRadius: 10, color: 'var(--rose-400)', fontSize: 12.5,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Right: sample values + live preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={sectionTitleStyle}>{t('noteTypes.preview.title')}</div>
            <div style={{ ...hintStyle, margin: '6px 0 10px' }}>{t('noteTypes.preview.hint')}</div>
            <NNCard>
              <div style={labelStyle}><span>{t('noteTypes.preview.sampleLabel')}</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fieldNames.map((name) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 80, fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
                      {name}
                    </span>
                    <input
                      value={sample[name] ?? name}
                      onChange={(e) => setSample((s) => ({ ...s, [name]: e.target.value }))}
                      style={{ ...inputStyle, flex: 1, padding: '7px 10px', fontSize: 13 }}
                    />
                  </div>
                ))}
              </div>
            </NNCard>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {draft.templates.map((tpl, i) => (
              <TemplatePreview key={i} template={tpl} draft={draft} sample={effectiveSample} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Screen orchestrator ──────────────────────────────────────────────────────

export const NNNoteTypeEditor = () => {
  const t = useT();
  const { confirm, alert } = useDialog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams?.get('edit') ?? null;
  const isNew = searchParams?.get('new') === '1';

  const noteTypes = useNN((s) => s.noteTypes);
  const deleteNoteType = useNN((s) => s.deleteNoteType);

  const editing = useMemo(
    () => (editId ? noteTypes.find((nt) => nt.id === editId) ?? null : null),
    [noteTypes, editId],
  );

  const goList = useCallback(() => router.replace('/note-types'), [router]);
  const goNew = useCallback(() => router.replace('/note-types?new=1'), [router]);
  const goEdit = useCallback(
    (nt: NoteType) => router.replace(`/note-types?edit=${encodeURIComponent(nt.id)}`),
    [router],
  );

  const handleDelete = useCallback(
    async (nt: NoteType) => {
      if (!(await confirm({ title: t('noteTypes.deleteConfirm', { name: nt.name }), danger: true }))) {
        return;
      }
      try {
        await deleteNoteType(nt.id);
      } catch (err) {
        console.error('deleteNoteType failed', err);
        await alert({ title: t('noteTypes.errors.deleteFailed') });
      }
    },
    [deleteNoteType, t, confirm, alert],
  );

  // Form mode: explicit ?new=1 OR ?edit=<id> resolving to a known type.
  if (isNew || editing) {
    return (
      <NoteTypeForm
        editing={editing}
        onDone={goList}
        onCancel={goList}
      />
    );
  }

  return (
    <NoteTypeList
      noteTypes={noteTypes}
      onCreate={goNew}
      onEdit={goEdit}
      onDelete={handleDelete}
    />
  );
};
