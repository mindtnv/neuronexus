ALTER TABLE "conversations" ADD COLUMN "notebook_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "grounding" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_user_notebook_idx" ON "conversations" USING btree ("user_id","notebook_id");