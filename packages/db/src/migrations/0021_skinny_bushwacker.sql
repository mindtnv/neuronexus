CREATE TABLE "notebook_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"notebook_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"content_md" text,
	"content_json" jsonb,
	"source_ids" jsonb NOT NULL,
	"error_code" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notebook_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"notebook_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"citations" jsonb,
	"message_id" uuid,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"artifact_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"correct" integer NOT NULL,
	"total" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "emoji" text;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "overview" text;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "suggested_questions" jsonb;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "overview_fingerprint" text;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD CONSTRAINT "notebook_artifacts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_artifacts" ADD CONSTRAINT "notebook_artifacts_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_notes" ADD CONSTRAINT "notebook_notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_notes" ADD CONSTRAINT "notebook_notes_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_notes" ADD CONSTRAINT "notebook_notes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_artifact_id_notebook_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."notebook_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notebook_artifacts_nb_created_idx" ON "notebook_artifacts" USING btree ("notebook_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notebook_artifacts_user_idx" ON "notebook_artifacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notebook_artifacts_active_idx" ON "notebook_artifacts" USING btree ("notebook_id") WHERE status IN ('pending','generating');--> statement-breakpoint
CREATE INDEX "notebook_notes_nb_pinned_updated_idx" ON "notebook_notes" USING btree ("notebook_id","pinned" DESC NULLS LAST,"updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notebook_notes_user_idx" ON "notebook_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_artifact_created_idx" ON "quiz_attempts" USING btree ("artifact_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_idx" ON "quiz_attempts" USING btree ("user_id");