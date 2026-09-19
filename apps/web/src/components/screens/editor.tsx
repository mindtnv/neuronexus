'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppNavigation } from '@/components/navigation';
import { EditorDraftLibrary } from '@/components/editor-draft-library';
import { NNCardForm } from '@/components/card-form';
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
  const cardId = params.get('card');
  const showDrafts = params.get('drafts') === '1';
  const deckQuery = params.get('deck');
  const noteTypeQuery = params.get('noteType') ?? undefined;
  const rawReturn = params.get('returnTo');
  const returnTo = rawReturn && /^\/review(?:\?|$)/.test(rawReturn) ? rawReturn : null;
  const bootstrapped = useNN((s) => s.bootstrapped);
  const decks = useNN((s) => s.decks);
  const fetcher = useCallback(async () => cardId ? cardFromApi(await ok(await api.cards({ id: cardId }).get())) : null, [cardId]);
  const resource = useSessionResource({ key: `editor:${cardId ?? 'new'}`, enabled: bootstrapped && Boolean(cardId), keepPreviousData: false, fetcher });
  const editing = resource.data?.id === cardId ? resource.data : null;
  const defaultDeckId = deckQuery && decks.some((deck) => deck.id === deckQuery) ? deckQuery : decks[0]?.id ?? '';

  if (bootstrapped && showDrafts) return <EditorDraftLibrary />;
  if (!bootstrapped || (cardId && !editing && !resource.error)) return <NNPageSkeleton />;
  if (cardId && resource.error) return <div style={{ padding: 24 }}>
    <NNLoadError title={t('editor.errors.loadFailed')} description={t(resource.error.status === 404 ? 'editor.errors.notFound' : 'review.loadFailedBody')}
      retryLabel={t('review.retry')} onRetry={resource.refresh} requestId={resource.error.requestId} />
    <NNBtn variant="soft" onClick={() => router.push('/editor?drafts=1')}>{t('editor.draft.libraryTitle')}</NNBtn>
    <NNBtn variant="ghost" onClick={() => router.push(returnTo ?? '/cards')}>{t('actions.cancel')}</NNBtn>
  </div>;

  return <NNCardForm
    key={cardId ?? `new:${defaultDeckId}:${noteTypeQuery ?? ''}`}
    card={editing}
    defaultDeckId={defaultDeckId}
    defaultNoteTypeId={noteTypeQuery}
    showFsrsHeader
    autoFocusFront
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
  />;
};
