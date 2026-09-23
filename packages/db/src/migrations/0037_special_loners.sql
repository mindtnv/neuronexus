CREATE TABLE "operation_retry_receipts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"observed_run_id" uuid NOT NULL,
	"result_run_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD COLUMN "operation_run_id" uuid;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD COLUMN "operation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD COLUMN "operation_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD COLUMN "generation_options" jsonb;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "operation_run_id" uuid;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "operation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "operation_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operation_retry_receipts" ADD CONSTRAINT "operation_retry_receipts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operation_retry_owner_request_idx" ON "operation_retry_receipts" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "operation_retry_created_idx" ON "operation_retry_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "artifacts_operation_active_idx" ON "notebook_artifacts" USING btree ("user_id","operation_started_at","id") WHERE "notebook_artifacts"."status" IN ('pending','generating');--> statement-breakpoint
CREATE INDEX "artifacts_operation_recent_idx" ON "notebook_artifacts" USING btree ("user_id","operation_finished_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "sources_operation_active_idx" ON "sources" USING btree ("user_id","operation_started_at","id") WHERE "sources"."status" IN ('pending','parsing','indexing');--> statement-breakpoint
CREATE INDEX "sources_operation_recent_idx" ON "sources" USING btree ("user_id","operation_finished_at" DESC NULLS LAST,"id");