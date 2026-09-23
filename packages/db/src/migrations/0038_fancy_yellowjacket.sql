CREATE TABLE "deck_hierarchy_revisions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_action_receipts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"kind" text NOT NULL,
	"target" jsonb NOT NULL,
	"label" text NOT NULL,
	"inverse" jsonb,
	"undo_target" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"undo_until" timestamp with time zone,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "metadata_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notebook_notes" ADD COLUMN "metadata_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "metadata_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "metadata_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deck_hierarchy_revisions" ADD CONSTRAINT "deck_hierarchy_revisions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_action_receipts" ADD CONSTRAINT "ui_action_receipts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ui_action_owner_request_idx" ON "ui_action_receipts" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "ui_action_owner_session_expiry_idx" ON "ui_action_receipts" USING btree ("user_id","session_id","undo_until","id");--> statement-breakpoint
CREATE INDEX "ui_action_expiry_idx" ON "ui_action_receipts" USING btree ("expires_at");
--> statement-breakpoint
CREATE FUNCTION sources_metadata_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.metadata_revision := OLD.metadata_revision + CASE WHEN ROW(NEW.title, NEW.author, NEW.description, NEW.tags) IS DISTINCT FROM ROW(OLD.title, OLD.author, OLD.description, OLD.tags) THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sources_metadata_revision BEFORE UPDATE ON sources
FOR EACH ROW EXECUTE FUNCTION sources_metadata_revision();

--> statement-breakpoint
CREATE FUNCTION notebook_notes_metadata_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.metadata_revision := OLD.metadata_revision + CASE WHEN ROW(NEW.title, NEW.content, NEW.pinned) IS DISTINCT FROM ROW(OLD.title, OLD.content, OLD.pinned) THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notebook_notes_metadata_revision BEFORE UPDATE ON notebook_notes
FOR EACH ROW EXECUTE FUNCTION notebook_notes_metadata_revision();

--> statement-breakpoint
CREATE FUNCTION notebooks_metadata_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.metadata_revision := OLD.metadata_revision + CASE WHEN ROW(NEW.title) IS DISTINCT FROM ROW(OLD.title) THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notebooks_metadata_revision BEFORE UPDATE ON notebooks
FOR EACH ROW EXECUTE FUNCTION notebooks_metadata_revision();

--> statement-breakpoint
CREATE FUNCTION decks_metadata_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.metadata_revision := OLD.metadata_revision + CASE WHEN ROW(NEW.name, NEW.color, NEW.icon) IS DISTINCT FROM ROW(OLD.name, OLD.color, OLD.icon) THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER decks_metadata_revision BEFORE UPDATE ON decks
FOR EACH ROW EXECUTE FUNCTION decks_metadata_revision();

--> statement-breakpoint
INSERT INTO deck_hierarchy_revisions(user_id, revision) SELECT DISTINCT user_id, 0 FROM decks ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION advance_deck_hierarchy_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text;
BEGIN
  owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  IF TG_OP = 'UPDATE' AND ROW(NEW.parent_id, NEW.position) IS NOT DISTINCT FROM ROW(OLD.parent_id, OLD.position) THEN
    RETURN NEW;
  END IF;
  -- User deletion cascades may already have removed its revision row.
  IF EXISTS (SELECT 1 FROM "user" WHERE id = owner_id) THEN
    INSERT INTO deck_hierarchy_revisions(user_id, revision) VALUES (owner_id, 1)
    ON CONFLICT (user_id) DO UPDATE SET revision = deck_hierarchy_revisions.revision + 1;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER decks_hierarchy_revision AFTER INSERT OR UPDATE OR DELETE ON decks
FOR EACH ROW EXECUTE FUNCTION advance_deck_hierarchy_revision();
