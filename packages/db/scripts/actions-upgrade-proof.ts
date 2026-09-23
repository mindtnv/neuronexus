/** Applies the committed chain to pre-change rows in a newly created local DB.
 * NODE_ENV=test bun --env-file=.env packages/db/scripts/actions-upgrade-proof.ts
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
if (process.env.NODE_ENV !== 'test' || !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Local test database credentials required');
const name = `reomi_actions_upgrade_${Date.now()}`;
const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
const admin = postgres(adminUrl.toString(), { max: 1, onnotice() {} });
const staged = await mkdtemp(join(tmpdir(), 'reomi-actions-migrations-'));
const migrations = new URL('../src/migrations/', import.meta.url).pathname;
let created = false, client: ReturnType<typeof postgres> | undefined;
try {
  await admin.unsafe(`CREATE DATABASE "${name}"`); created = true;
  url.pathname = `/${name}`; client = postgres(url.toString(), { max: 1, onnotice() {} });
  const db = drizzle(client);
  const journal = JSON.parse(await readFile(join(migrations,'meta','_journal.json'),'utf8'));
  const baseline = journal.entries.filter((entry: { idx: number }) => entry.idx <= 36);
  await mkdir(join(staged,'meta'));
  await writeFile(join(staged,'meta','_journal.json'),JSON.stringify({ ...journal, entries: baseline }));
  await Promise.all(baseline.map((entry: { tag: string }) => copyFile(join(migrations,`${entry.tag}.sql`),join(staged,`${entry.tag}.sql`))));
  await migrate(db,{migrationsFolder:staged});
  // UUIDv4 is intentional here: old persisted identities must not be rewritten.
  const owner = randomUUID(), source = randomUUID(), note = randomUUID(), deck = randomUUID(), artifact = randomUUID();
  await client`INSERT INTO "user" (id,name,email) VALUES (${owner},'Upgrade fixture',${`upgrade-${owner}@example.test`})`;
  await client`INSERT INTO sources (id,user_id,kind,title,status,verified,created_at,updated_at) VALUES (${source},${owner},'text','Legacy book','ready',true,'2025-01-01','2025-01-02')`;
  await client`INSERT INTO notebook_notes (id,user_id,owner_kind,source_id,source_origin_id,source_origin_title,title,content) VALUES (${note},${owner},'source',${source},${source},'Legacy book','Legacy note','Keep this original content')`;
  await client`INSERT INTO decks (id,user_id,name,position) VALUES (${deck},${owner},'Legacy deck',7)`;
  await client`INSERT INTO notebook_artifacts (id,user_id,owner_kind,source_id,source_origin_id,source_origin_title,type,title,status,source_ids,content_md,created_at,updated_at) VALUES (${artifact},${owner},'source',${source},${source},'Legacy book','summary','Legacy result','ready',${JSON.stringify([source])}::jsonb,'Keep the old result','2025-01-01','2025-01-02')`;
  await migrate(db,{migrationsFolder:migrations});
  const [book] = await client`SELECT id,title,metadata_revision,operation_run_id,updated_at FROM sources WHERE id=${source}`;
  assert.equal(book!.id,source); assert.equal(book!.title,'Legacy book'); assert.equal(Number(book!.metadata_revision),0); assert.equal(book!.operation_run_id,null); assert.equal(new Date(book!.updated_at).toISOString(),'2025-01-02T00:00:00.000Z');
  const [result] = await client`SELECT content_md,operation_run_id,generation_options,updated_at FROM notebook_artifacts WHERE id=${artifact}`;
  assert.equal(result!.content_md,'Keep the old result'); assert.equal(result!.operation_run_id,null); assert.equal(result!.generation_options,null); assert.equal(new Date(result!.updated_at).toISOString(),'2025-01-02T00:00:00.000Z');
  await client`UPDATE sources SET chunk_count=5,status='indexing' WHERE id=${source}`;
  assert.equal(Number((await client`SELECT metadata_revision FROM sources WHERE id=${source}`)[0]!.metadata_revision),0);
  await client`UPDATE sources SET title='A' WHERE id=${source}`; await client`UPDATE sources SET title='Legacy book' WHERE id=${source}`;
  assert.equal(Number((await client`SELECT metadata_revision FROM sources WHERE id=${source}`)[0]!.metadata_revision),2);
  await client`UPDATE notebook_notes SET pinned=true WHERE id=${note}`;
  const [written] = await client`SELECT metadata_revision,content,pinned FROM notebook_notes WHERE id=${note}`;
  assert.equal(Number(written!.metadata_revision),1); assert.equal(written!.content,'Keep this original content'); assert.equal(written!.pinned,true);
  const before = Number((await client`SELECT revision FROM deck_hierarchy_revisions WHERE user_id=${owner}`)[0]!.revision);
  await client`UPDATE decks SET name='Renamed legacy deck' WHERE id=${deck}`;
  assert.equal(Number((await client`SELECT revision FROM deck_hierarchy_revisions WHERE user_id=${owner}`)[0]!.revision),before);
  await client`UPDATE decks SET position=3 WHERE id=${deck}`;
  assert.equal(Number((await client`SELECT revision FROM deck_hierarchy_revisions WHERE user_id=${owner}`)[0]!.revision),before+1);
  await migrate(db,{migrationsFolder:migrations});
  assert.equal(Number((await client`SELECT count(*) AS count FROM drizzle.__drizzle_migrations`)[0]!.count),journal.entries.length);
  console.log(JSON.stringify({passed:true,baselineMigrations:baseline.length,finalMigrations:journal.entries.length,checks:['legacy-identities-and-content-preserved','old-results-not-made-recent','processing-does-not-change-metadata-revision','legacy-ABA-detected','pin-revision','hierarchy-revision','idempotent-chain']},null,2));
} finally {
  await client?.end({ timeout: 5 });
  if (created) await admin.unsafe(`DROP DATABASE "${name}"`);
  await admin.end({ timeout: 5 }); await rm(staged,{recursive:true,force:true});
}
