CREATE TABLE "review_operations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"arguments_hash" text NOT NULL,
	"review_id" uuid,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_operations" ADD CONSTRAINT "review_operations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_operations" ADD CONSTRAINT "review_operations_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_operations_owner_operation_idx" ON "review_operations" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE INDEX "review_operations_review_idx" ON "review_operations" USING btree ("review_id");