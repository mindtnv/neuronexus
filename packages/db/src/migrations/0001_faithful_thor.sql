ALTER TABLE "achievements" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "achievements" CASCADE;--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "unlocked_species" SET DEFAULT ARRAY['fern','cactus','succulent','bonsai','sakura','mushroom']::text[];