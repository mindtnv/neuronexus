'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { NNBtn } from './ui';
import { SegmentedControl } from './design-system/primitives';
import { ResizeHandle } from './design-system/resize-handle';
import { CARD_PANEL, boundedPanelWidth, readCardPanelWidth } from '@/lib/panel-width';
import { NNCardForm, type CardFormDraft } from './card-form';
import { RichCard } from './rich-card';
import { SimilarCardsPanel } from './similar-cards';
import { SourceLinksPanel } from './source-links';
import { useT } from '@/lib/i18n';
import type { Card } from '@/lib/types';

export function CardDetailPanel({ card, deckName, index, total, onMove, onClose, onOpen, onDeleted, onDirtyChange }: {
  card: Card; deckName: string; index: number; total: number;
  onMove: (delta: 1 | -1) => void; onClose: () => void; onOpen: (id: string) => void;
  onDeleted: (id: string) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [clozeRevealed, setClozeRevealed] = useState(false);
  const [draft, setDraft] = useState<CardFormDraft | null>(null);
  const currentDraft = draft?.cardId === card.id ? draft : null;
  const previewNoteType = currentDraft?.noteType ?? card.noteType;
  const previewFields = currentDraft?.fieldValues ?? card.note?.fieldValues;
  const previewTags = currentDraft?.tags ?? card.tags;
  const isCloze = previewNoteType?.kind === 'cloze' || card.renderKind === 'cloze';
  const panel = useRef<HTMLElement>(null);
  const [preferredWidth, setPreferredWidth] = useState<number>(CARD_PANEL.default);
  const [availableWidth, setAvailableWidth] = useState(1200);
  useLayoutEffect(() => {
    setPreferredWidth(readCardPanelWidth());
    const workspace = panel.current?.closest('.reomi-cards-workspace');
    if (!workspace) return;
    const measure = () => setAvailableWidth(workspace.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setMode('edit'); setClozeRevealed(false); }, [card.id]);
  const maxWidth = Math.min(CARD_PANEL.max, Math.max(CARD_PANEL.min, availableWidth - 160));
  const width = boundedPanelWidth(preferredWidth, CARD_PANEL.min, maxWidth, CARD_PANEL.default);
  const resize = (value: number) => {
    const next = boundedPanelWidth(value, CARD_PANEL.min, maxWidth, CARD_PANEL.default);
    setPreferredWidth(next);
    try { localStorage.setItem(CARD_PANEL.key, String(next)); } catch { /* Keep the in-memory width. */ }
  };
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <section ref={panel} className="reomi-card-detail" aria-labelledby="card-detail-title" style={{ '--card-detail-width': `${width}px` } as CSSProperties}>
    {availableWidth > 900 && <ResizeHandle edge="left" width={width} min={CARD_PANEL.min} max={maxWidth} defaultWidth={CARD_PANEL.default}
      label={t('cards.panel.resizeWidth')} onChange={resize} />}
    <header className="reomi-card-detail-header">
      <div><h2 id="card-detail-title" ref={heading} tabIndex={-1}>{t('cards.panel.title')}</h2><span>{deckName}</span></div>
      <span className="reomi-card-detail-position">{index >= 0 ? `${index + 1} / ${total}` : ''}</span>
      <NNBtn size="sm" icon="chevl" ariaLabel={t('cards.panel.prev')} disabled={index <= 0} onClick={() => onMove(-1)} />
      <NNBtn size="sm" icon="chevr" ariaLabel={t('cards.panel.next')} disabled={index < 0 || index >= total - 1} onClick={() => onMove(1)} />
      <NNBtn size="sm" icon="x" ariaLabel={t('cards.panel.close')} onClick={onClose} />
    </header>
    <div className="reomi-card-detail-tabs"><SegmentedControl label={t('cards.panel.mode')} value={mode} onChange={setMode} options={[
      {value: 'view', label: t('cards.panel.view')}, {value: 'edit', label: t('cards.panel.edit')},
    ]} /></div>
    <div className="reomi-card-detail-preview nn-scroll" hidden={mode !== 'view'}>
      {isCloze ? <section>
        <div className="reomi-cloze-preview-header">
          <h3>{t('cards.panel.clozeCard')}</h3>
          <NNBtn size="sm" variant="soft" icon="eye" onClick={() => setClozeRevealed(value => !value)}>
            {t(clozeRevealed ? 'cards.panel.hideCloze' : 'cards.panel.revealCloze')}
          </NNBtn>
        </div>
        {previewNoteType && previewFields ? <RichCard noteType={previewNoteType} fieldValues={previewFields}
          templateOrd={card.templateOrd} clozeNumber={card.clozeNumber} side={clozeRevealed ? 'back' : 'front'} />
          : <p>{clozeRevealed ? card.renderBackText : card.renderFrontText}</p>}
      </section> : (['front', 'back'] as const).map(side => <section key={`${card.id}-${side}`}>
        <h3>{t(side === 'front' ? 'review.questionLabel' : 'review.answerLabel')}</h3>
        {previewNoteType && previewFields ? <RichCard noteType={previewNoteType} fieldValues={previewFields} templateOrd={card.templateOrd} clozeNumber={card.clozeNumber} side={side} /> : <p>{side === 'front' ? card.renderFrontText : card.renderBackText}</p>}
      </section>)}
      {previewTags.length > 0 && <div className="reomi-card-detail-tags">{previewTags.map(tag => <span key={tag}>#{tag}</span>)}</div>}
      <details className="reomi-card-detail-related" key={card.id}><summary>{t('cards.panel.similar.title')}</summary><SimilarCardsPanel cardId={card.id} onOpen={onOpen} /></details>
      <SourceLinksPanel cardId={card.id} />
    </div>
    <div className="reomi-card-detail-form" hidden={mode !== 'edit'}>
      <NNCardForm key={card.id} card={card} layout="panel" inlinePreview={false} actionsPlacement="footer" compactHeader showFsrsHeader={false} onDeleted={onDeleted} onDirtyChange={onDirtyChange} onDraftChange={setDraft} onSaved={() => onDirtyChange(false)} />
    </div>
  </section>;
}
