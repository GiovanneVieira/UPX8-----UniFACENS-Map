CREATE TABLE IF NOT EXISTS "navigation_edges" (
	"network_id" text,
	"version" text,
	"id" text,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"kind" text NOT NULL,
	"length_meters" double precision NOT NULL,
	"width_meters" double precision,
	"longitudinal_slope_percent" double precision,
	"cross_slope_percent" double precision,
	"step_count" integer,
	"has_handrail" boolean,
	"has_tactile_paving" boolean,
	"surface" text,
	"verification" jsonb DEFAULT '{"status":"unverified"}' NOT NULL,
	"availability" jsonb DEFAULT '{"status":"unknown"}' NOT NULL,
	CONSTRAINT "navigation_edges_pkey" PRIMARY KEY("network_id","version","id"),
	CONSTRAINT "navigation_edges_kind_check" CHECK ("kind" IN ('walkway', 'footbridge', 'ramp', 'stairs', 'elevator', 'platform')),
	CONSTRAINT "navigation_edges_length_check" CHECK ("length_meters" > 0 AND "length_meters" < 'Infinity'::float8),
	CONSTRAINT "navigation_edges_width_check" CHECK ("width_meters" IS NULL OR ("width_meters" > 0 AND "width_meters" < 'Infinity'::float8)),
	CONSTRAINT "navigation_edges_longitudinal_check" CHECK ("longitudinal_slope_percent" IS NULL OR abs("longitudinal_slope_percent") < 'Infinity'::float8),
	CONSTRAINT "navigation_edges_cross_check" CHECK ("cross_slope_percent" IS NULL OR ("cross_slope_percent" >= 0 AND "cross_slope_percent" < 'Infinity'::float8)),
	CONSTRAINT "navigation_edges_steps_check" CHECK (("step_count" IS NULL OR "step_count" >= 0) AND ("kind" <> 'stairs' OR "step_count" IS NULL OR "step_count" > 0)),
	CONSTRAINT "navigation_edges_surface_check" CHECK ("surface" IS NULL OR "surface" IN ('firm_regular', 'uneven', 'loose')),
	CONSTRAINT "navigation_edges_verification_check" CHECK (COALESCE(jsonb_typeof("verification") = 'object' AND "verification"->>'status' IN ('unverified', 'verified'), false)),
	CONSTRAINT "navigation_edges_availability_check" CHECK (COALESCE(jsonb_typeof("availability") = 'object' AND "availability"->>'status' IN ('unknown', 'open', 'closed'), false))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "navigation_networks" (
	"id" text PRIMARY KEY,
	"data_source" text NOT NULL,
	CONSTRAINT "navigation_networks_source_check" CHECK ("data_source" IN ('demo', 'field_survey'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "navigation_nodes" (
	"network_id" text,
	"version" text,
	"id" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"position" jsonb,
	CONSTRAINT "navigation_nodes_pkey" PRIMARY KEY("network_id","version","id"),
	CONSTRAINT "navigation_nodes_kind_check" CHECK ("kind" IN ('gate', 'junction', 'building_access', 'reference')),
	CONSTRAINT "navigation_nodes_name_check" CHECK (length(trim("name")) > 0),
	CONSTRAINT "navigation_nodes_position_check" CHECK ("position" IS NULL OR jsonb_typeof("position") = 'object')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "navigation_versions" (
	"network_id" text,
	"version" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"node_count" integer NOT NULL,
	"edge_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"published_by_user_id" text,
	CONSTRAINT "navigation_versions_pkey" PRIMARY KEY("network_id","version"),
	CONSTRAINT "navigation_versions_status_check" CHECK (("status" = 'draft' AND "published_at" IS NULL AND "retired_at" IS NULL) OR ("status" = 'published' AND "published_at" IS NOT NULL AND "retired_at" IS NULL) OR ("status" = 'retired' AND "published_at" IS NOT NULL AND "retired_at" IS NOT NULL)),
	CONSTRAINT "navigation_versions_counts_check" CHECK ("node_count" > 0 AND "node_count" <= 1000 AND "edge_count" >= 0 AND "edge_count" <= 1000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "navigation_edges_from_idx" ON "navigation_edges" ("network_id","version","from_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "navigation_edges_to_idx" ON "navigation_edges" ("network_id","version","to_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "navigation_versions_status_idx" ON "navigation_versions" ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "navigation_versions_active_idx" ON "navigation_versions" ("network_id") WHERE "status" = 'published';--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'navigation_edges_TGcuKwWdk6JG_fkey' AND conrelid = 'navigation_edges'::regclass) THEN
    ALTER TABLE "navigation_edges" ADD CONSTRAINT "navigation_edges_TGcuKwWdk6JG_fkey" FOREIGN KEY ("network_id","version") REFERENCES "navigation_versions"("network_id","version") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'navigation_edges_99GrdYHRGLA0_fkey' AND conrelid = 'navigation_edges'::regclass) THEN
    ALTER TABLE "navigation_edges" ADD CONSTRAINT "navigation_edges_99GrdYHRGLA0_fkey" FOREIGN KEY ("network_id","version","from_node_id") REFERENCES "navigation_nodes"("network_id","version","id") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'navigation_edges_pPbsyMNVcRAT_fkey' AND conrelid = 'navigation_edges'::regclass) THEN
    ALTER TABLE "navigation_edges" ADD CONSTRAINT "navigation_edges_pPbsyMNVcRAT_fkey" FOREIGN KEY ("network_id","version","to_node_id") REFERENCES "navigation_nodes"("network_id","version","id") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'navigation_nodes_o4cqhag9Y51n_fkey' AND conrelid = 'navigation_nodes'::regclass) THEN
    ALTER TABLE "navigation_nodes" ADD CONSTRAINT "navigation_nodes_o4cqhag9Y51n_fkey" FOREIGN KEY ("network_id","version") REFERENCES "navigation_versions"("network_id","version") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'navigation_versions_network_id_navigation_networks_id_fkey' AND conrelid = 'navigation_versions'::regclass) THEN
    ALTER TABLE "navigation_versions" ADD CONSTRAINT "navigation_versions_network_id_navigation_networks_id_fkey" FOREIGN KEY ("network_id") REFERENCES "navigation_networks"("id") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'navigation_versions_created_by_user_id_user_id_fkey' AND conrelid = 'navigation_versions'::regclass) THEN
    ALTER TABLE "navigation_versions" ADD CONSTRAINT "navigation_versions_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'navigation_versions_published_by_user_id_user_id_fkey' AND conrelid = 'navigation_versions'::regclass) THEN
    ALTER TABLE "navigation_versions" ADD CONSTRAINT "navigation_versions_published_by_user_id_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
  END IF;
END $$;
