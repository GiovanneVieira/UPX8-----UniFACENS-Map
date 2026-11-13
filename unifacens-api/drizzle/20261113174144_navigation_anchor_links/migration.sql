ALTER TABLE "navigation_nodes" ADD COLUMN IF NOT EXISTS "anchor_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "navigation_nodes_anchor_version_key" ON "navigation_nodes" ("network_id","version","anchor_id") WHERE "anchor_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "navigation_nodes_anchor_idx" ON "navigation_nodes" ("anchor_id");--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'navigation_nodes_anchor_id_anchors_id_fkey' AND conrelid = 'navigation_nodes'::regclass) THEN
    ALTER TABLE "navigation_nodes" ADD CONSTRAINT "navigation_nodes_anchor_id_anchors_id_fkey" FOREIGN KEY ("anchor_id") REFERENCES "anchors"("id") ON DELETE SET NULL;
  END IF;
END $$;
