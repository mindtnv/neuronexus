ALTER TABLE "conversations" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summary_upto" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "usage" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "mentions" jsonb;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "agent_instructions" text;