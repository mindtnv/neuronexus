ALTER TABLE "source_annotations" ADD COLUMN "harvested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_marks" ADD COLUMN "harvested_at" timestamp with time zone;