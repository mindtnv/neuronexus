ALTER TABLE "notes" ADD COLUMN "accepted_answers" text[] DEFAULT ARRAY[]::text[] NOT NULL;
--> statement-breakpoint
-- Pin the legacy answer role before users add or reorder fields.
UPDATE note_types AS nt
SET fields = (
  SELECT jsonb_agg(CASE WHEN (field->>'ord')::integer = (
    SELECT max((candidate->>'ord')::integer) FROM jsonb_array_elements(nt.fields) candidate
  ) THEN field || '{"typeinAnswer":true}'::jsonb ELSE field END ORDER BY position)
  FROM jsonb_array_elements(nt.fields) WITH ORDINALITY AS item(field, position)
), updated_at = GREATEST(now(), updated_at + interval '1 millisecond')
WHERE kind = 'typein' AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(nt.fields) field WHERE field->>'typeinAnswer' = 'true'
);
