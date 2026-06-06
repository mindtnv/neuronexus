'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NNCardForm } from '@/components/card-form';
import { useNN } from '@/lib/store';

// ─────────────────────────────────────────────
// Editor screen — thin wrapper over the reusable NNCardForm.
// Reads card/deck from the URL, supplies navigation via callbacks (the form
// itself never touches the router — Architect tension e).
// ─────────────────────────────────────────────
export const NNEditor = () => {
  const router = useRouter();
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
    <NNCardForm
      key={editing?.id ?? 'new'}
      card={editing}
      defaultDeckId={defaultDeckId}
      showFsrsPanel
      autoFocusFront
      onSaved={(c) => router.replace(`/editor?card=${encodeURIComponent(c.id)}`)}
      onDeleted={() => router.push('/decks')}
    />
  );
};
