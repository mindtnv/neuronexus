'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppNavigation } from '@/components/navigation';
import { NNCardForm } from '@/components/card-form';
import { useT } from '@/lib/i18n';
import { useNN } from '@/lib/store';

// ─────────────────────────────────────────────
// Editor screen — thin wrapper over the reusable NNCardForm.
// Reads card/deck from the URL, supplies navigation via callbacks (the form
// itself never touches the router — Architect tension e).
// ─────────────────────────────────────────────
export const NNEditor = () => {
  const router = useAppNavigation();
  const t = useT();
  const searchParams = useSearchParams();
  const cardId = searchParams?.get('card') ?? null;
  const deckQuery = searchParams?.get('deck') ?? null;

  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);

  const editing = useMemo(
    () => (cardId ? cards.find((c) => c.id === cardId) ?? null : null),
    [cards, cardId],
  );

  const defaultDeckId = useMemo(() => {
    if (deckQuery && decks.some((d) => d.id === deckQuery)) return deckQuery;
    return decks[0]?.id ?? '';
  }, [deckQuery, decks]);

  return (
    <div className="reomi-page-surface reomi-editor-workspace">
    <NNCardForm
      compactHeader
      heading={editing ? t('editor.editCardTitle') : t('editor.newCard')}
      key={editing?.id ?? 'new'}
      card={editing}
      defaultDeckId={defaultDeckId}
      showFsrsHeader
      autoFocusFront
      onSaved={(c) => router.replace(`/editor?card=${encodeURIComponent(c.id)}`, { track: false })}
      onDeleted={() => router.push('/decks')}
    />
    </div>
  );
};
