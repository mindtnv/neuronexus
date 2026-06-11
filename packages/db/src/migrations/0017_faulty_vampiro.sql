CREATE TABLE "source_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"strokes" jsonb NOT NULL,
	"marked_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_annotations" ADD CONSTRAINT "source_annotations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_annotations" ADD CONSTRAINT "source_annotations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_annotations_source_page_uq" ON "source_annotations" USING btree ("source_id","page");--> statement-breakpoint
CREATE INDEX "source_annotations_user_idx" ON "source_annotations" USING btree ("user_id");