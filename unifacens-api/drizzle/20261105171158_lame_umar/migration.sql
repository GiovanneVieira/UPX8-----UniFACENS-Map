CREATE TABLE IF NOT EXISTS "campus_obstacles" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"category" text DEFAULT 'building' NOT NULL,
	"polygon" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campus_entrances" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"altitude" double precision,
	"accessible" boolean DEFAULT true,
	"obstacle_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "long_description" text;--> statement-breakpoint
ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "images" jsonb DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "place_id" uuid;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'campus_entrances_obstacle_id_campus_obstacles_id_fkey'
	) THEN
		ALTER TABLE "campus_entrances" ADD CONSTRAINT "campus_entrances_obstacle_id_campus_obstacles_id_fkey"
		FOREIGN KEY ("obstacle_id") REFERENCES "campus_obstacles"("id") ON DELETE SET NULL;
	END IF;
END $$;
