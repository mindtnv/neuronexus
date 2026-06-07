CREATE UNIQUE INDEX "note_types_builtin_uq" ON "note_types" USING btree ("name") WHERE is_builtin AND user_id IS NULL;--> statement-breakpoint
-- Seed the 3 global builtin note-types (Basic / Cloze / Type-in). Stable UUIDs +
-- fields/templates mirror BUILTIN_NOTE_TYPES in @neuronexus/shared (single source
-- of truth). is_builtin=true, user_id=NULL → visible to every user. The targeted
-- ON CONFLICT matches the partial unique index above so this is idempotent.
INSERT INTO "note_types" ("id", "name", "kind", "fields", "templates", "styling", "is_builtin", "user_id", "created_at", "updated_at") VALUES
	('96bb6f6a-ad97-4e2d-9044-78a173d3df51', 'Basic', 'basic', '[{"name":"Front","ord":0},{"name":"Back","ord":1}]'::jsonb, '[{"name":"Card 1","ord":0,"frontTemplate":"{{Front}}","backTemplate":"{{Front}}<hr>{{Back}}"}]'::jsonb, '', true, NULL, now(), now()),
	('a42316eb-6a7c-46ec-a7c2-2b15492385f2', 'Cloze', 'cloze', '[{"name":"Text","ord":0},{"name":"Extra","ord":1}]'::jsonb, '[{"name":"Cloze","ord":0,"frontTemplate":"{{Text}}","backTemplate":"{{Text}}<hr>{{Extra}}"}]'::jsonb, '', true, NULL, now(), now()),
	('023045f3-da60-4fd3-89c9-582a148064d5', 'Type-in', 'typein', '[{"name":"Front","ord":0},{"name":"Back","ord":1}]'::jsonb, '[{"name":"Card 1","ord":0,"frontTemplate":"{{Front}}","backTemplate":"{{Front}}<hr>{{Back}}"}]'::jsonb, '', true, NULL, now(), now())
ON CONFLICT ("name") WHERE is_builtin AND user_id IS NULL DO NOTHING;
