'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { assistantApi, ok } from '@/lib/api';
import { captureSourceTextSelection, restoreSourceTextRange } from '@/lib/source-text-selection';
import type { SourceTextSelection } from '@neuronexus/shared';
import type { SourceChunkRow } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { useNN } from '@/lib/store';
import { NNBtn } from './ui';
import { askAssistant } from './chat/assistant-provider';
import { QuickCardDialog } from './pdf-reader/quick-card';
import { useDialog } from './dialog';
import { raiseToast } from './toasts';
type Mark = { id: string; kind: string; color: string; note: string | null; selection: SourceTextSelection; anchorStatus: string };
export function SourceTextStudy({ sourceId, sourceName, host, chunks, onJump, chatEnabled = false }: { sourceId: string; sourceName?: string; chatEnabled?: boolean; host: React.RefObject<HTMLDivElement | null>; chunks: SourceChunkRow[]; onJump(id: string): void }) {
  const t = useT(), { confirm } = useDialog();
  const [selection, setSelection] = useState<SourceTextSelection | null>(null), [note, setNote] = useState(''), [noteMode, setNoteMode] = useState(false);
  const [card, setCard] = useState<SourceTextSelection | null>(null), [marks, setMarks] = useState<Mark[]>([]), [showMarks, setShowMarks] = useState(false);
  const [editId, setEditId] = useState<string | null>(null), [editNote, setEditNote] = useState('');
  const [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const sequence = useRef(0), saving = useRef(false);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const items: Mark[] = []; let offset: number | null = 0;
      do {
        const page: { items: Mark[]; nextOffset: number | null } = await ok(await assistantApi.sources({ id: sourceId })['text-marks'].get({ query: { offset } }));
        items.push(...page.items); offset = page.nextOffset;
      } while (offset !== null && items.length < 2000);
      if (sequence.current === current) { setMarks(items); setError(false); }
    } catch { if (sequence.current === current) setError(true); }
  }, [sourceId]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  useEffect(() => {
    let generation = 0;
    const selected = () => {
      if (noteMode || card || saving.current || document.activeElement?.closest('[data-source-selection-ui]')) return;
      const current = ++generation, range = window.getSelection();
      if (!range?.rangeCount || range.isCollapsed || !host.current) { setSelection(null); return; }
      void captureSourceTextSelection(host.current,range.getRangeAt(0).cloneRange(),new Map(chunks.map(chunk => [chunk.id,chunk.text])))
        .then(value => { if (current === generation) setSelection(value); })
        .catch(() => { if (current === generation) { setSelection(null); raiseToast({ kind: 'info', titleKey: 'assistant.contextLimit' }); } });
    };
    document.addEventListener('selectionchange', selected);
    return () => { generation++; document.removeEventListener('selectionchange', selected); };
  }, [host, chunks, noteMode, card]);
  useEffect(() => {
    const css = (globalThis as any).CSS, HighlightClass = (globalThis as any).Highlight;
    if (!css?.highlights || !HighlightClass || !host.current) return;
    let cancelled = false; const name = `source-${sourceId.replace(/[^a-zA-Z0-9-]/g, '')}`;
    void (async () => {
      const ranges: Range[] = [];
      for (const mark of marks) if (mark.anchorStatus === 'anchored') for (const segment of mark.selection.chunks) {
        if (cancelled || !host.current) return;
        const body = Array.from(host.current.querySelectorAll<HTMLElement>('[data-source-text-body]')).find(node => node.closest<HTMLElement>('[data-chunk-id]')?.dataset.chunkId === segment.chunkId);
        if (body) {
          const range = await restoreSourceTextRange(body,segment);
          if (cancelled) return;
          if (range) ranges.push(range);
        }
      }
      if (!cancelled) css.highlights.set(name,new HighlightClass(...ranges));
    })().catch(() => { /* Saved quotes remain readable if visual restoration is unavailable. */ });
    const style = document.createElement('style'); style.textContent = `::highlight(${name}) { background: color-mix(in srgb, var(--amber-400) 35%, transparent); color: inherit; }`; document.head.appendChild(style);
    return () => { cancelled = true; css.highlights.delete(name); style.remove(); };
  }, [host, chunks, marks, sourceId]);
  const save = async (kind: 'highlight' | 'note') => {
    if (!selection || saving.current) return;
    saving.current = true; setBusy(true);
    try {
      await ok(await assistantApi.sources({ id: sourceId })['text-marks'].post({ kind, selection, ...(kind === 'note' ? { note } : {}) }));
      setSelection(null); setNoteMode(false); setNote(''); window.getSelection()?.removeAllRanges(); await load();
    } catch { raiseToast({ kind: 'error', titleKey: 'assistant.selectionSaveFailed' }); }
    finally { saving.current = false; setBusy(false); }
  };
  const ask = (value: SourceTextSelection) => {
    askAssistant({ ref: { kind: 'source_passage', id: sourceId, locator: { quote: value.quote,
      ...(value.chunks.length ? { chunks: value.chunks.map(chunk => ({ chunkId: chunk.chunkId })) } : {}) } } });
    setSelection(null); window.getSelection()?.removeAllRanges();
  };
  return <div data-source-selection-ui style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' }}>
    <NNBtn size="sm" variant="ghost" icon="note" onClick={() => setShowMarks(value => !value)}>{t('assistant.textMarks')} · {marks.length}</NNBtn>
    {error && <NNBtn size="sm" onClick={() => void load()}>{t('review.retry')}</NNBtn>}
    {showMarks && <div className="nn-scroll" style={{ maxHeight: 240, overflowY: 'auto' }}>{marks.map(mark => <div key={mark.id} style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
      <p>{mark.selection.quote}</p>{mark.note && <p>{mark.note}</p>}
      {editId === mark.id ? <div><textarea aria-label={t('notebooks.notes.heading')} value={editNote} maxLength={2000} onChange={event => setEditNote(event.target.value)} />
        <NNBtn disabled={busy} size="sm" onClick={async () => {
          if (saving.current) return; saving.current = true; setBusy(true);
          try { await ok(await assistantApi.sources({ id: sourceId })['text-marks']({ markId: mark.id }).patch({ note: editNote })); setEditId(null); await load(); }
          catch { raiseToast({ kind: 'error', titleKey: 'assistant.selectionSaveFailed' }); }
          finally { saving.current = false; setBusy(false); }
        }}>{t('actions.save')}</NNBtn><NNBtn disabled={busy} size="sm" onClick={() => setEditId(null)}>{t('actions.cancel')}</NNBtn></div>
        : <NNBtn size="sm" onClick={() => { setEditId(mark.id); setEditNote(mark.note ?? ''); }}>{t('notebooks.notes.edit')}</NNBtn>}
      {mark.anchorStatus !== 'anchored' ? <small>{t('assistant.anchorUnavailable')}</small> : <NNBtn size="sm" onClick={() => onJump(mark.selection.chunks[0]!.chunkId)}>{t('assistant.readSource')}</NNBtn>}
      <NNBtn size="sm" onClick={() => ask(mark.anchorStatus === 'anchored' ? mark.selection : { ...mark.selection, chunks: [] })}>{t('assistant.askObject')}</NNBtn>
      <NNBtn size="sm" onClick={() => setCard(mark.anchorStatus === 'anchored' ? mark.selection : { ...mark.selection, chunks: [] })}>{t('notebooks.quickcard.title')}</NNBtn>
      <NNBtn size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: t('assistant.deleteTextMark'), message: mark.selection.quote, confirmLabel: t('actions.delete'), danger: true })) {
        try { await ok(await assistantApi.sources({ id: sourceId })['text-marks']({ markId: mark.id }).delete()); await load(); } catch { raiseToast({ kind: 'error', titleKey: 'assistant.selectionSaveFailed' }); }
      } }}>{t('actions.delete')}</NNBtn>
    </div>)}</div>}
    {selection && createPortal(<div data-source-selection-ui className="reomi-text-selection-actions" role="dialog" aria-label={t('assistant.textSelection')}>
      {!selection.chunks.length && <small>{t('assistant.anchorUnavailable')}</small>}
      {noteMode ? <><textarea aria-label={t('notebooks.notes.heading')} value={note} maxLength={2000} onChange={event => setNote(event.target.value)} /><NNBtn disabled={busy} onClick={() => void save('note')}>{t('actions.save')}</NNBtn></>
        : <><NNBtn onPointerDown={event => event.preventDefault()} onClick={() => ask(selection)}>{t('assistant.askObject')}</NNBtn>
          <NNBtn onPointerDown={event => event.preventDefault()} onClick={() => { setCard(selection); setSelection(null); }}>{t('notebooks.quickcard.title')}</NNBtn>
          <NNBtn disabled={busy} onPointerDown={event => event.preventDefault()} onClick={() => void save('highlight')}>{t('assistant.highlightText')}</NNBtn>
          <NNBtn onPointerDown={event => event.preventDefault()} onClick={() => setNoteMode(true)}>{t('notebooks.notes.add')}</NNBtn></>}
      <NNBtn disabled={busy} variant="ghost" onClick={() => { setSelection(null); setNoteMode(false); }}>{t('actions.cancel')}</NNBtn>
    </div>,document.body)}
    <QuickCardDialog open={Boolean(card)} sourceId={sourceId} sourceName={sourceName ?? ''} quote={card?.quote} textSelection={card ?? undefined} chatEnabled={chatEnabled} t={t}
      onClose={() => setCard(null)} onCreated={(_result,id) => { if (id) void useNN.getState().refetchCard(id); window.dispatchEvent(new Event('nn:knowledge-changed')); }} />
  </div>;
}
