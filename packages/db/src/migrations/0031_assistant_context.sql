CREATE TABLE "conversation_contexts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"object_id" uuid NOT NULL,
	"ref_key" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "conversation_contexts_position_check" CHECK ("conversation_contexts"."position" >= 0 AND "conversation_contexts"."position" < 16)
);
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_notebook_id_notebooks_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "context_policy" text DEFAULT 'focus' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "context_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "context_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "conversation_contexts" ADD CONSTRAINT "conversation_contexts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_contexts" ADD CONSTRAINT "conversation_contexts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_contexts_ref_uq" ON "conversation_contexts" USING btree ("conversation_id","ref_key");--> statement-breakpoint
CREATE INDEX "conversation_contexts_user_object_idx" ON "conversation_contexts" USING btree ("user_id","kind","object_id","conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_contexts_order_idx" ON "conversation_contexts" USING btree ("conversation_id","position");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_user_pinned_updated_id_idx" ON "conversations" USING btree ("user_id","pinned" DESC NULLS LAST,"updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_context_policy_check" CHECK ("conversations"."context_policy" IN ('focus', 'strict'));--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_context_revision_check" CHECK ("conversations"."context_revision" >= 0 AND "conversations"."context_version" IN (0, 1));
--> statement-breakpoint
-- Legacy notebook conversations keep their checked-source semantics. Do not
-- fabricate historical message snapshots or rewrite pending approvals.
UPDATE "conversations" SET "context_policy" = 'strict' WHERE "notebook_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "conversation_contexts" ("user_id", "conversation_id", "kind", "object_id", "ref_key", "snapshot", "position")
SELECT c.user_id, c.id, 'notebook', n.id,
  encode(sha256(convert_to(format('{"id":"%s","kind":"notebook"}', n.id), 'UTF8')), 'hex'),
  jsonb_build_object(
    'ref', jsonb_build_object('kind', 'notebook', 'id', n.id),
    'label', left(trim(regexp_replace(n.title, '\s+', ' ', 'g')), 200),
    'available', true,
    'href', '/notebooks/' || n.id::text
  ), 0
FROM "conversations" c JOIN "notebooks" n ON n.id = c.notebook_id AND n.user_id = c.user_id
ON CONFLICT ("conversation_id", "ref_key") DO NOTHING;
