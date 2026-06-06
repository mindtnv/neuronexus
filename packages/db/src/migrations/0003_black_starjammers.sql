-- DESTRUCTIVE REWRITE (note-types M1): adds cards.note_id NOT NULL with no default
-- and drops the legacy cards.variant/front/back/cloze_text/tags columns. Intended
-- for a FRESH (empty) pre-launch DB — it will fail / discard data on a populated one.
CREATE TABLE "note_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"fields" jsonb NOT NULL,
	"templates" jsonb NOT NULL,
	"styling" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"note_type_id" uuid NOT NULL,
	"field_values" jsonb NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "cards_tags_gin_idx";--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "note_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "template_ord" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "render_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "render_front_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "render_back_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "render_kind" text DEFAULT 'basic' NOT NULL;--> statement-breakpoint
ALTER TABLE "note_types" ADD CONSTRAINT "note_types_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_note_type_id_note_types_id_fk" FOREIGN KEY ("note_type_id") REFERENCES "public"."note_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_types_user_idx" ON "note_types" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_user_idx" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_tags_gin_idx" ON "notes" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "notes_user_created_idx" ON "notes" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_note_idx" ON "cards" USING btree ("note_id");--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "variant";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "front";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "back";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "cloze_text";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "tags";--> statement-breakpoint
DROP TYPE "public"."card_variant";