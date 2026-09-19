ALTER TABLE "cards" ADD COLUMN "cloze_number" integer;--> statement-breakpoint
-- Preserve existing aggregate cloze questions and all their FSRS/history.
UPDATE "cards" SET "cloze_number" = 0 WHERE "render_kind" = 'cloze';
--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_note_template_cloze_uq" UNIQUE NULLS NOT DISTINCT("note_id","template_ord","cloze_number");