CREATE INDEX "cards_tags_gin_idx" ON "cards" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "cards_user_state_idx" ON "cards" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "cards_user_created_idx" ON "cards" USING btree ("user_id","created_at");