ALTER TABLE "notebook_artifacts" ALTER COLUMN "notebook_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notebook_notes" ALTER COLUMN "notebook_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD COLUMN "owner_kind" text DEFAULT 'notebook' NOT NULL;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD COLUMN "source_origin_id" uuid;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD COLUMN "source_origin_title" text;--> statement-breakpoint
ALTER TABLE "notebook_notes" ADD COLUMN "owner_kind" text DEFAULT 'notebook' NOT NULL;--> statement-breakpoint
ALTER TABLE "notebook_notes" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "notebook_notes" ADD COLUMN "source_origin_id" uuid;--> statement-breakpoint
ALTER TABLE "notebook_notes" ADD COLUMN "source_origin_title" text;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD CONSTRAINT "notebook_artifacts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_notes" ADD CONSTRAINT "notebook_notes_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notebook_artifacts_source_origin_idx" ON "notebook_artifacts" USING btree ("user_id","source_origin_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notebook_artifacts_retained_idx" ON "notebook_artifacts" USING btree ("user_id","updated_at" DESC NULLS LAST,"id") WHERE "notebook_artifacts"."owner_kind" = 'source' AND "notebook_artifacts"."source_id" IS NULL;--> statement-breakpoint
CREATE INDEX "notebook_artifacts_active_source_idx" ON "notebook_artifacts" USING btree ("user_id","source_origin_id") WHERE "notebook_artifacts"."owner_kind" = 'source' AND "notebook_artifacts"."status" IN ('pending','generating');--> statement-breakpoint
CREATE INDEX "notebook_notes_source_origin_idx" ON "notebook_notes" USING btree ("user_id","source_origin_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notebook_notes_retained_idx" ON "notebook_notes" USING btree ("user_id","updated_at" DESC NULLS LAST,"id") WHERE "notebook_notes"."owner_kind" = 'source' AND "notebook_notes"."source_id" IS NULL;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD CONSTRAINT "notebook_artifacts_owner_check" CHECK ((
      ("notebook_artifacts"."owner_kind" = 'notebook' AND "notebook_artifacts"."notebook_id" IS NOT NULL AND "notebook_artifacts"."source_id" IS NULL AND "notebook_artifacts"."source_origin_id" IS NULL AND "notebook_artifacts"."source_origin_title" IS NULL)
      OR ("notebook_artifacts"."owner_kind" = 'source' AND "notebook_artifacts"."notebook_id" IS NULL AND "notebook_artifacts"."source_origin_id" IS NOT NULL
        AND "notebook_artifacts"."source_origin_title" IS NOT NULL AND length("notebook_artifacts"."source_origin_title") BETWEEN 1 AND 200
        AND ("notebook_artifacts"."source_id" IS NULL OR "notebook_artifacts"."source_id" = "notebook_artifacts"."source_origin_id"))
    ));--> statement-breakpoint
ALTER TABLE "notebook_notes" ADD CONSTRAINT "notebook_notes_owner_check" CHECK ((
      ("notebook_notes"."owner_kind" = 'notebook' AND "notebook_notes"."notebook_id" IS NOT NULL AND "notebook_notes"."source_id" IS NULL AND "notebook_notes"."source_origin_id" IS NULL AND "notebook_notes"."source_origin_title" IS NULL)
      OR ("notebook_notes"."owner_kind" = 'source' AND "notebook_notes"."notebook_id" IS NULL AND "notebook_notes"."source_origin_id" IS NOT NULL
        AND "notebook_notes"."source_origin_title" IS NOT NULL AND length("notebook_notes"."source_origin_title") BETWEEN 1 AND 200
        AND ("notebook_notes"."source_id" IS NULL OR "notebook_notes"."source_id" = "notebook_notes"."source_origin_id"))
    ));