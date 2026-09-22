'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWorkspaceState, useNavigationWorkspace } from './navigation';
import { useNavigationScroll } from '@/lib/use-navigation-scroll';
import { NNBtn } from './ui';
import { SegmentedControl } from './design-system/primitives';
import { NNCardForm, type CardFormDraft, type NNCardFormProps } from './card-form';
import { RichCard } from './rich-card';
import { SimilarCardsPanel } from './similar-cards';
import { SourceLinksPanel } from './source-links';
import { useT } from '@/lib/i18n';
import { AssistantAskButton } from './chat/assistant-ask-button';

/** One editor body for the standalone workspace and resizable cards panel. */
export function CardEditor({ card, onOpen, ...formProps }: NNCardFormProps & { onOpen?: (id: string) => void }) {
  const t = useT();
  const navigation=useNavigationWorkspace();
  const navigationScope=`card:${card?.id??'new'}`;
  const [mode,setMode]=useWorkspaceState<'view'|'edit'>(navigationScope,'mode','edit');
  const root=useRef<HTMLDivElement>(null);
  const previewPosition=useNavigationScroll(navigationScope,'preview',{ready:mode==='view'});
  const formPosition=useNavigationScroll(navigationScope,'form',{ready:mode==='edit'});
  useLayoutEffect(()=>{formPosition.ref(root.current?.querySelector<HTMLElement>('.reomi-card-form-scroll')??null);},[card?.id,formPosition.ref]);
  const [clozeRevealed, setClozeRevealed] = useState(false);
  const [draft, setDraft] = useState<CardFormDraft | null>(null);
  const currentDraft = draft?.cardId === card?.id ? draft : null;
  const previewNoteType = currentDraft?.noteType ?? card?.noteType;
  const previewFields = currentDraft?.fieldValues ?? card?.note?.fieldValues;
  const previewTags = currentDraft?.tags ?? card?.tags ?? [];
  const isCloze = previewNoteType?.kind === 'cloze';
  const templateOrd = currentDraft?.preview?.templateOrd ?? card?.templateOrd ?? 0;
  const clozeNumber = currentDraft?.preview?.clozeNumber ?? card?.clozeNumber ?? 0;
  useEffect(() => setClozeRevealed(false), [card?.id, templateOrd, clozeNumber, previewNoteType?.id]);
  return <div ref={root} className="reomi-card-editor">
    <div className="reomi-card-detail-tabs"><SegmentedControl label={t('cards.panel.mode')} value={mode} onChange={setMode} options={[
      {value: 'view', label: t('cards.panel.view')}, {value: 'edit', label: t('cards.panel.edit')},
    ]} />{card && <AssistantAskButton object={{ kind: 'card', id: card.id }} />}</div>
    <div ref={previewPosition.ref} className="reomi-card-detail-preview nn-scroll" hidden={mode !== 'view'}>
      {isCloze ? <section>
        <div className="reomi-cloze-preview-header">
          <h3>{t('cards.panel.clozeCard')}</h3>
          <NNBtn size="sm" variant="soft" icon="eye" onClick={() => setClozeRevealed(value => !value)}>
            {t(clozeRevealed ? 'cards.panel.hideCloze' : 'cards.panel.revealCloze')}
          </NNBtn>
        </div>
        {previewNoteType && previewFields ? <RichCard noteType={previewNoteType} fieldValues={previewFields}
          templateOrd={templateOrd} clozeNumber={clozeNumber} side={clozeRevealed ? 'back' : 'front'} />
          : <p>{clozeRevealed ? card?.renderBackText : card?.renderFrontText}</p>}
      </section> : (['front', 'back'] as const).map(side => <section key={`${card?.id}-${side}`}>
        <h3>{t(side === 'front' ? 'review.questionLabel' : 'review.answerLabel')}</h3>
        {previewNoteType && previewFields ? <RichCard noteType={previewNoteType} fieldValues={previewFields} templateOrd={templateOrd} clozeNumber={clozeNumber} side={side} /> : <p>{side === 'front' ? card?.renderFrontText : card?.renderBackText}</p>}
      </section>)}
      {previewTags.length > 0 && <div className="reomi-card-detail-tags">{previewTags.map(tag => <span key={tag}>#{tag}</span>)}</div>}
      {card && onOpen && <details className="reomi-card-detail-related" key={card.id}><summary>{t('cards.panel.similar.title')}</summary><SimilarCardsPanel cardId={card.id} onOpen={onOpen} /></details>}
      {card && <SourceLinksPanel cardId={card.id} />}
    </div>
    <div className="reomi-card-detail-form" hidden={mode !== 'edit'}>
      <NNCardForm {...formProps} autoFocusFront={formProps.autoFocusFront??!navigation?.restored} key={card?.id ?? 'new'} card={card} layout="panel" inlinePreview={false} actionsPlacement="footer" compactHeader showFsrsHeader={false} onDraftChange={setDraft} />
    </div>
  </div>;
}
