-- Data-only migration: drop the front-echo from the Basic / Type-in back template.
--
-- The reviewer keeps the question pinned above the answer the whole time, so the
-- Anki-style `{{Front}}<hr>{{Back}}` back template duplicated the question inside
-- the answer block. New back template = `{{Back}}` (answer only). Same templates
-- JSON shape as migration 0007, only `backTemplate` changed.
--
-- Targets the 3 global builtins (is_builtin, user_id IS NULL). Cloze is NOT touched
-- (its `{{Text}}<hr>{{Extra}}` has no duplication: front = blanks, back = filled).
-- Fresh / test DBs get the new template directly from BUILTIN_NOTE_TYPES via
-- migration 0007 having run + this UPDATE (already-migrated DBs are corrected here).
UPDATE "note_types"
SET templates = '[{"name":"Card 1","ord":0,"frontTemplate":"{{Front}}","backTemplate":"{{Back}}"}]'::jsonb,
    updated_at = now()
WHERE is_builtin AND user_id IS NULL AND name = 'Basic';
--> statement-breakpoint
UPDATE "note_types"
SET templates = '[{"name":"Card 1","ord":0,"frontTemplate":"{{Front}}","backTemplate":"{{Back}}"}]'::jsonb,
    updated_at = now()
WHERE is_builtin AND user_id IS NULL AND name = 'Type-in';
