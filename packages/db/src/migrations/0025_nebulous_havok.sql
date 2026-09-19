ALTER TABLE "reviews" DROP CONSTRAINT "reviews_deck_id_decks_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "deck_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE set null ON UPDATE no action;