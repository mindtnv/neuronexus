ALTER TABLE "messages" ADD COLUMN "tool_calls" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tool_call_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_tool_result_uq" ON "messages" USING btree ("conversation_id","tool_call_id") WHERE role = 'tool';