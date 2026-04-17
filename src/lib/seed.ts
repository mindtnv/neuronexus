import { db } from './db';
import { newFsrsCard } from './fsrs';
import type { Card, Deck, Profile } from './types';

const uid = () => crypto.randomUUID();

export async function seedIfEmpty() {
  if ((await db.decks.count()) > 0) return;

  const now = Date.now();

  const profile: Profile = {
    id: 'me',
    name: 'Alex',
    level: 1,
    xp: 0,
    streakDays: 0,
    dailyGoalMinutes: 30,
    plantSpecies: 'fern',
    plantStage: 0,
    createdAt: now,
  };

  // Root: Languages (organizational parent, no own cards)
  const languages: Deck = { id: uid(), name: 'Languages', color: 'amber', species: 'fern', createdAt: now };
  const german: Deck = { id: uid(), name: 'German vocab', color: 'amber', species: 'fern', parentId: languages.id, createdAt: now };
  const french: Deck = { id: uid(), name: 'French basics', color: 'rose', species: 'fern', parentId: languages.id, createdAt: now };

  // Root: CS fundamentals (organizational) → System Design + Rust std lib
  const cs: Deck = { id: uid(), name: 'CS fundamentals', color: 'violet', species: 'fern', createdAt: now };
  const sysdesign: Deck = { id: uid(), name: 'System Design', color: 'violet', species: 'fern', parentId: cs.id, createdAt: now };
  const rust: Deck = { id: uid(), name: 'Rust std lib', color: 'sky', species: 'fern', parentId: cs.id, createdAt: now };

  // Root: Cognitive biases (flat, no children — shows mixed hierarchy)
  const biases: Deck = { id: uid(), name: 'Cognitive biases', color: 'lime', species: 'fern', createdAt: now };

  const decks: Deck[] = [languages, german, french, cs, sysdesign, rust, biases];

  const germanPairs: [string, string][] = [
    ['der Nachbar', 'neighbor'],
    ['die Vergeßlichkeit', 'forgetfulness'],
    ['das Gedächtnis', 'memory'],
    ['die Erinnerung', 'recollection'],
    ['erinnern', 'to remember'],
    ['vergessen', 'to forget'],
    ['die Gewohnheit', 'habit'],
    ['die Wiederholung', 'repetition'],
  ];

  const frenchPairs: [string, string][] = [
    ['le voisin', 'neighbor (m)'],
    ['la voisine', 'neighbor (f)'],
    ["l'oubli", 'forgetting / oversight'],
    ['se souvenir', 'to remember'],
    ['oublier', 'to forget'],
  ];

  const sysPairs: [string, string][] = [
    ['Mutex vs semaphore?', 'Mutex: mutual-exclusion lock (single holder). Semaphore: counter-based signaling (N concurrent holders).'],
    ['CAP theorem?', 'Consistency · Availability · Partition-tolerance — a distributed system can guarantee only 2 of 3.'],
    ['What is a load balancer?', 'Distributes requests across servers to improve availability and spread load.'],
    ['Sharding?', 'Horizontal partitioning of data across machines by key (e.g. user_id).'],
    ['Idempotency key?', 'Client-generated unique token so the server can safely de-dupe retried writes.'],
  ];

  const rustPairs: [string, string][] = [
    ['Vec::with_capacity', 'Allocate a Vec with pre-reserved capacity to avoid reallocations.'],
    ['Rc vs Arc', 'Rc: single-threaded reference counting. Arc: atomic, thread-safe.'],
    ['Box<T>', 'Heap allocation owning a single T; cheap move, deref coercion.'],
    ['Option::unwrap_or_else', 'Return inner value or compute a fallback via closure.'],
  ];

  const biasesPairs: [string, string][] = [
    ['Confirmation bias', 'Seeking / recalling info that confirms existing beliefs; discounting contradicting evidence.'],
    ['Anchoring', 'Over-reliance on the first piece of information encountered when making decisions.'],
    ['Survivorship bias', 'Focusing on successful examples and overlooking failures that did not survive.'],
  ];

  const makeCards = (deckId: string, tags: string[], pairs: [string, string][]): Card[] =>
    pairs.map(([front, back]) => ({
      id: uid(),
      deckId,
      variant: 'basic',
      front,
      back,
      tags,
      createdAt: now,
      updatedAt: now,
      fsrs: newFsrsCard(new Date(now)),
    }));

  const cards: Card[] = [
    ...makeCards(german.id, ['german', 'b1'], germanPairs),
    ...makeCards(french.id, ['french', 'a2'], frenchPairs),
    ...makeCards(sysdesign.id, ['systemdesign'], sysPairs),
    ...makeCards(rust.id, ['rust'], rustPairs),
    ...makeCards(biases.id, ['bias', 'psychology'], biasesPairs),
  ];

  // Atomic check-and-seed: if two bootstraps race, the second one will see
  // the decks already written inside this transaction and bail out.
  await db.transaction('rw', db.decks, db.cards, db.profile, async () => {
    if ((await db.decks.count()) > 0) return;
    await db.decks.bulkAdd(decks);
    await db.cards.bulkAdd(cards);
    await db.profile.put(profile);
  });
}
