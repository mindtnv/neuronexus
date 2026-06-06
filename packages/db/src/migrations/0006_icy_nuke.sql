CREATE TABLE "deck_options_preset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"new_per_day" integer DEFAULT 20 NOT NULL,
	"reviews_per_day" integer DEFAULT 200 NOT NULL,
	"learning_steps" text[] DEFAULT ARRAY['1m','10m']::text[] NOT NULL,
	"relearning_steps" text[] DEFAULT ARRAY['10m']::text[] NOT NULL,
	"desired_retention" double precision,
	"leech_threshold" integer DEFAULT 8 NOT NULL,
	"maximum_interval" integer DEFAULT 36500 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filtered_deck" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"sort_order" text DEFAULT 'due' NOT NULL,
	"card_limit" integer DEFAULT 50 NOT NULL,
	"include_suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "preset_id" uuid;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "new_introduced_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "reviews_done_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "daily_counts_date" text;--> statement-breakpoint
ALTER TABLE "deck_options_preset" ADD CONSTRAINT "deck_options_preset_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filtered_deck" ADD CONSTRAINT "filtered_deck_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_options_preset_user_idx" ON "deck_options_preset" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "filtered_deck_user_idx" ON "filtered_deck" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_preset_id_deck_options_preset_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."deck_options_preset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decks_preset_idx" ON "decks" USING btree ("preset_id");