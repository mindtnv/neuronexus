CREATE TABLE "source_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"kind" text NOT NULL,
	"quote" text NOT NULL,
	"rects" jsonb NOT NULL,
	"color" text DEFAULT 'lime' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_marks" ADD CONSTRAINT "source_marks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_marks" ADD CONSTRAINT "source_marks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_marks_source_page_idx" ON "source_marks" USING btree ("source_id","page");--> statement-breakpoint
CREATE INDEX "source_marks_user_idx" ON "source_marks" USING btree ("user_id");