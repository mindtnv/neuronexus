CREATE TABLE "source_text_marks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"source_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"color" text DEFAULT 'yellow' NOT NULL,
	"selection" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_text_marks_kind_check" CHECK ("source_text_marks"."kind" IN ('highlight','note')),
	CONSTRAINT "source_text_marks_color_check" CHECK ("source_text_marks"."color" IN ('yellow','green','blue','pink','violet')),
	CONSTRAINT "source_text_marks_note_check" CHECK ("source_text_marks"."note" IS NULL OR length("source_text_marks"."note") <= 2000),
	CONSTRAINT "source_text_marks_selection_check" CHECK (jsonb_typeof("source_text_marks"."selection") = 'object' AND "source_text_marks"."selection"->>'version' = '1'
    AND length("source_text_marks"."selection"->>'quote') BETWEEN 1 AND 4000 AND octet_length("source_text_marks"."selection"::text) <= 24000)
);
--> statement-breakpoint
ALTER TABLE "source_text_marks" ADD CONSTRAINT "source_text_marks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_text_marks" ADD CONSTRAINT "source_text_marks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_text_marks_owner_source_idx" ON "source_text_marks" USING btree ("user_id","source_id","created_at","id");