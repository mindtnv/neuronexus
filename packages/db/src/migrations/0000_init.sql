CREATE TYPE "public"."card_state" AS ENUM('new', 'learning', 'review', 'relearning');--> statement-breakpoint
CREATE TYPE "public"."card_variant" AS ENUM('basic', 'cloze', 'type');--> statement-breakpoint
CREATE TYPE "public"."deck_color" AS ENUM('lime', 'amber', 'violet', 'sky', 'rose', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."plant_species" AS ENUM('fern', 'cactus', 'succulent', 'bonsai', 'sakura', 'mushroom');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"progress" integer,
	"unlocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"deck_id" uuid NOT NULL,
	"variant" "card_variant" DEFAULT 'basic' NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"cloze_text" text,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"due" timestamp with time zone DEFAULT now() NOT NULL,
	"stability" double precision DEFAULT 0 NOT NULL,
	"difficulty" double precision DEFAULT 0 NOT NULL,
	"elapsed_days" integer DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"learning_steps" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" "card_state" DEFAULT 'new' NOT NULL,
	"last_review" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"color" "deck_color" DEFAULT 'lime' NOT NULL,
	"icon" text,
	"species" "plant_species" DEFAULT 'fern' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"last_review_date" text,
	"streak_freezes" integer DEFAULT 0 NOT NULL,
	"today_minutes" integer DEFAULT 0 NOT NULL,
	"today_minutes_date" text,
	"daily_goal_met_count" integer DEFAULT 0 NOT NULL,
	"daily_goal_met_date" text,
	"daily_goal_minutes" integer DEFAULT 15 NOT NULL,
	"desired_retention" double precision,
	"plant_species" "plant_species" DEFAULT 'fern' NOT NULL,
	"plant_stage" integer DEFAULT 0 NOT NULL,
	"unlocked_species" text[] DEFAULT ARRAY['fern']::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"card_id" uuid NOT NULL,
	"deck_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_due" timestamp with time zone NOT NULL,
	"next_stability" double precision NOT NULL,
	"next_difficulty" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_parent_id_decks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_user_code_idx" ON "achievements" USING btree ("user_id","code");--> statement-breakpoint
CREATE INDEX "achievements_user_unlocked_idx" ON "achievements" USING btree ("user_id","unlocked_at");--> statement-breakpoint
CREATE INDEX "cards_user_idx" ON "cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cards_deck_idx" ON "cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "cards_due_idx" ON "cards" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "decks_user_idx" ON "decks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "decks_parent_idx" ON "decks" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "reviews_user_idx" ON "reviews" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "reviews_card_idx" ON "reviews" USING btree ("card_id");