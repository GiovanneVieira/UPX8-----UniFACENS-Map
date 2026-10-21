ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "latitude" double precision;--> statement-breakpoint
ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "longitude" double precision;--> statement-breakpoint
ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "altitude" double precision;--> statement-breakpoint
ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "heading" double precision;