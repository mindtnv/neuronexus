DROP INDEX "cards_user_created_idx";--> statement-breakpoint
CREATE INDEX "cards_user_created_idx" ON "cards" USING btree ("user_id","created_at","id");