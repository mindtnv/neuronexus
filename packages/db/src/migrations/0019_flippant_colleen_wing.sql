ALTER TABLE "source_marks" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "source_marks" ADD CONSTRAINT "source_marks_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_marks_card_idx" ON "source_marks" USING btree ("card_id");