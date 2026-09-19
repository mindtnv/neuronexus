// Add representative notebooks to the dedicated local design database.
// Existing data is preserved. Cards/reviews use the normal seed on first run only.
import { eq, count } from 'drizzle-orm';
import { db, closeDb } from './client';
import { user, cards, notebooks, notebookArtifacts } from './schema';
import { SEED_DECKS, type DeckSeed, type NoteSeed } from './seed-data';

const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/reomi_design') {
  throw new Error('Design seed requires the dedicated local reomi_design database');
}
const base = process.env.BETTER_AUTH_URL!;
if (new URL(base).origin !== new URL(process.env.NEXT_PUBLIC_API_URL!).origin) throw new Error('API origin mismatch');
const email = 'demo@neuronexus.local';
const password = 'demodemo123';
function collect(deck: DeckSeed): NoteSeed[] {
  return [...(deck.notes ?? []), ...(deck.children ?? []).flatMap(collect)];
}
try {
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  const [{ n }] = existing ? await db.select({ n: count() }).from(cards).where(eq(cards.userId, existing.id)) : [{ n: 0 }];
  if (!existing || n === 0) {
    const seed = Bun.spawn([process.execPath, new URL('./seed.ts', import.meta.url).pathname], { env: { ...process.env, SEED_USER_EMAIL: email }, stdout: 'inherit', stderr: 'inherit' });
    if (await seed.exited !== 0) throw new Error('Card seed failed');
  }
  const [owner] = await db.select().from(user).where(eq(user.email, email));
  if (!owner) throw new Error('Demo user missing');
  const login = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: process.env.WEB_ORIGIN! }, body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`Local sign-in failed (${login.status})`);
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Local session cookie missing');
  async function request(path: string, method: string, body: unknown) {
    const response = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', cookie, origin: process.env.WEB_ORIGIN! }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
    return response.json();
  }
  const existingBooks = await db.select().from(notebooks).where(eq(notebooks.userId, owner.id));
  const emojis = ['🛠️', '🧩', '🧠', '🌍'];
  for (const [i, deck] of SEED_DECKS.entries()) {
    const title = `${deck.name} · учебный блокнот`;
    if (existingBooks.some(book => book.title === title)) continue;
    const book = await request('/notebooks', 'POST', { title });
    await request(`/notebooks/${book.id}`, 'PATCH', { color: deck.color, emoji: emojis[i], description: `Материалы, примеры и заметки по ${deck.name}. Тестовые данные для работы над интерфейсом.`, pinned: i === 1 });
    const examples = collect(deck).slice(0, 8);
    const sourceIds: string[] = [];
    for (let part = 0; part < 2; part++) {
      const content = examples.slice(part * 4, part * 4 + 4).map(note => Object.entries(note.fields).map(([field, value]) => `## ${field}\n\n${value}`).join('\n\n')).join('\n\n---\n\n');
      const source = await request(`/notebooks/${book.id}/sources`, 'POST', { kind: 'text', title: `${deck.name}: ${part ? 'Практика и примеры' : 'Основные понятия'}`, text: `# ${deck.name}\n\nУчебный материал из локального сида.\n\n${content}` });
      sourceIds.push(source.id);
    }
    await request(`/notebooks/${book.id}/notes`, 'POST', { title: 'План изучения', content: `# ${deck.name}\n\n- [ ] Прочитать основные понятия\n- [ ] Объяснить идеи своими словами\n- [ ] Разобрать практические примеры\n- [ ] Повторить карточки\n\n> Короткая практика каждый день помогает замечать пробелы в понимании.` });
    await request(`/notebooks/${book.id}/notes`, 'POST', { title: 'Разбор примера', content: Object.values(examples[0]!.fields).join('\n\n') });
    // An explicitly authored study-guide example, not a simulated AI response.
    await db.insert(notebookArtifacts).values({ userId: owner.id, notebookId: book.id, type: 'study_guide', status: 'ready', title: `${deck.name}: план повторения`, sourceIds, contentMd: `# План повторения\n\nЭто учебный пример из локального сида.\n\n## Понять\nСформулируйте главные идеи материала своими словами.\n\n## Применить\nРазберите один пример и придумайте свой.\n\n## Проверить себя\nОткройте соответствующую колоду и ответьте на карточки без подсказок.` });
    console.log(`[design seed] ${title}`);
  }
  console.log('[design seed] Done. Existing data preserved; sources use the real ingest pipeline.');
} finally { await closeDb(); }
