ALTER TABLE "media" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "width";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "height";