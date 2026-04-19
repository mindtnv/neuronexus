ALTER TABLE "reviews" ADD COLUMN "attempt_key" text;--> statement-breakpoint
UPDATE "reviews" SET "attempt_key" = "id" WHERE "attempt_key" IS NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "attempt_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_user_attempt_key_idx" ON "reviews" USING btree ("user_id","attempt_key");
