CREATE TABLE "notebook_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"notebook_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_reading_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_id" uuid NOT NULL,
	"status" text DEFAULT 'unread' NOT NULL,
	"page" integer,
	"chunk_pos" integer,
	"percent" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_chunks" DROP CONSTRAINT "source_chunks_notebook_id_notebooks_id_fk";
--> statement-breakpoint
ALTER TABLE "sources" DROP CONSTRAINT "sources_notebook_id_notebooks_id_fk";
--> statement-breakpoint
DROP INDEX "sources_notebook_idx";--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "notebook_sources" ADD CONSTRAINT "notebook_sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_sources" ADD CONSTRAINT "notebook_sources_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_sources" ADD CONSTRAINT "notebook_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_reading_state" ADD CONSTRAINT "source_reading_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_reading_state" ADD CONSTRAINT "source_reading_state_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notebook_sources_nb_src_uq" ON "notebook_sources" USING btree ("notebook_id","source_id");--> statement-breakpoint
CREATE INDEX "notebook_sources_source_idx" ON "notebook_sources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "notebook_sources_user_idx" ON "notebook_sources" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_reading_state_src_user_uq" ON "source_reading_state" USING btree ("source_id","user_id");--> statement-breakpoint
CREATE INDEX "source_reading_state_user_updated_idx" ON "source_reading_state" USING btree ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sources_tags_gin_idx" ON "sources" USING gin ("tags");--> statement-breakpoint
-- HAND-EDITED (library milestone, spec §3.7): data backfill MUST run before the
-- notebook_id columns are dropped. Every existing source becomes a notebook_sources
-- edge (the pre-library model was strictly 1:1, so the unique index cannot fire).
INSERT INTO "notebook_sources" ("user_id", "notebook_id", "source_id", "added_at")
SELECT "user_id", "notebook_id", "id", "created_at" FROM "sources";--> statement-breakpoint
-- HAND-EDITED: kb_chunk.parent_id is NOT NULL — document rows move from the old
-- "parent = notebook" convention to the card convention "parent = sourceId"
-- (sources are user-level now; vectors belong to the source, not the notebook).
UPDATE "kb_chunk" SET "parent_id" = "source_id" WHERE "source_type" = 'document';--> statement-breakpoint
ALTER TABLE "source_chunks" DROP COLUMN "notebook_id";--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN "notebook_id";