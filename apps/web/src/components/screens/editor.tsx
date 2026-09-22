'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppNavigation } from '@/components/navigation';
import { EditorDraftLibrary } from '@/components/editor-draft-library';
import { CardEditor } from '@/components/card-editor';
import { RichCard } from '@/components/rich-card';
import { NNBtn, NNLoadError, NNPageSkeleton } from '@/components/ui';
import { raiseToast } from '@/components/toasts';

import { useNN } from '@/lib/store';
import { api, ok } from '@/lib/api';
import { cardFromApi } from '@/lib/mappers';
import { useSessionResource } from '@/lib/session-resource';
import { useT } from '@/lib/i18n';
import { clearStudyHandoff } from '@/lib/review-session';

export const NNEditor = () => {
  const t = useT();
  const router = useAppNavigation();
  const params = useSearchParams();
  const requestedCardId = params.get('card');
  const noteId = requestedCardId ? null : params.get('noteId');
  const showDrafts = params.get('drafts') === '1';
  const deckQuery = params.get('deck');
  const noteTypeQuery = params.get('noteType') ?? undefined;
  const rawReturn = params.get('returnTo');
  const returnTo = rawReturn && /^\/review(?:\?|$)/.test(rawReturn) ? rawReturn : null;
  const bootstrapped = useNN((s) => s.bootstrapped);
  const noteFetcher = useCallback(async () => noteId ? ok(await api.notes({ id: noteId }).get()) : null, [noteId]);
  const noteResource = useSessionResource({ key: `editor-note:${noteId ?? 'none'}`, enabled: bootstrapped && Boolean(noteId), keepPreviousData: false, fetcher: noteFetcher });
  const noteData = noteResource.data?.note.id === noteId ? noteResource.data : null;
  const cardId = requestedCardId ?? noteData?.cards[0]?.id ?? null;

  const decks = useNN((s) => s.decks);
  const fetcher = useCallback(async () => cardId ? cardFromApi(await ok(await api.cards({ id: cardId }).get())) : null, [cardId]);
  const resource = useSessionResource({ key: `editor:${cardId ?? 'new'}`, enabled: bootstrapped && Boolean(cardId), keepPreviousData: false, fetcher });
  const editing = resource.data?.id === cardId ? resource.data : null;
  const defaultDeckId = deckQuery && decks.some((deck) => deck.id === deckQuery) ? deckQuery : decks[0]?.id ?? '';

  if (bootstrapped && showDrafts) return <EditorDraftLibrary />;
  if (!bootstrapped || (noteId && !noteData && !noteResource.error) || (cardId && !editing && !resource.error)) return <NNPageSkeleton />;
  const loadError = noteResource.error ?? resource.error;
  if ((cardId || noteId) && loadError) return <div style={{ padding: 24 }}>
    <NNLoadError title={t('editor.errors.loadFailed')} description={t(loadError.status === 404 ? 'editor.errors.notFound' : 'review.loadFailedBody')}
      retryLabel={t('review.retry')} onRetry={noteResource.error ? noteResource.refresh : resource.refresh} requestId={loadError.requestId} />
    <NNBtn variant="soft" onClick={() => router.push('/editor?drafts=1')}>{t('editor.draft.libraryTitle')}</NNBtn>
    <NNBtn variant="ghost" onClick={() => router.push(returnTo ?? '/cards')}>{t('actions.cancel')}</NNBtn>
  </div>;

  if (noteData && !cardId) return <div className="reomi-page-surface" style={{ padding: 24, overflow: 'auto' }}>
    <h2>{noteData.noteType.name}</h2><p>{t('editor.orphanNote')}</p>
    {Object.entries(noteData.note.fieldValues).map(([name, value]) => <section key={name} style={{ marginTop: 20 }}>
      <h3>{name}</h3><RichCard noteType={{ kind: 'basic', templates: [{ name: 'Content', ord: 0, frontTemplate: '{{Body}}', backTemplate: '{{Body}}' }] }} fieldValues={{ Body: value }} side="front" />
    </section>)}
    <NNBtn variant="soft" onClick={() => router.push('/cards')}>{t('actions.back')}</NNBtn>
  </div>;

  return <div className="reomi-page-surface reomi-editor-workspace"><CardEditor
    key={cardId ?? `new:${defaultDeckId}:${noteTypeQuery ?? ''}`}
    card={editing}
    defaultDeckId={defaultDeckId}
    defaultNoteTypeId={noteTypeQuery}
    autoFocusFront
    onOpen={id => router.push(`/editor?card=${id}`)}
    saveLabel={returnTo ? t('editor.saveAndReturn') : undefined}
    footerExtra={returnTo
      ? <NNBtn size="sm" variant="ghost" onClick={() => router.push(returnTo)}>{t('actions.cancel')}</NNBtn>
      : editing ? <NNBtn size="sm" variant="soft" onClick={() => router.push(`/editor?${new URLSearchParams({ deck: editing.deckId, ...(editing.noteType ? { noteType: editing.noteType.id } : {}) })}`)}>{t('editor.addAnother')}</NNBtn> : undefined}
    onSaved={(card) => {
      raiseToast({ kind: 'success', title: t('editor.saved') });
      if (returnTo) router.replace(returnTo);
      else if (cardId === card.id) resource.mutate(card);
      else router.replace(`/editor?card=${encodeURIComponent(card.id)}`, { track: false });
    }}
    onDeleted={() => { clearStudyHandoff(); router.push(returnTo ?? '/decks'); }}
  /></div>;

};
