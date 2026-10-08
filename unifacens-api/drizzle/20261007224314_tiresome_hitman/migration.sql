CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"category" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"building" text,
	"floor" integer,
	"description" text,
	"source" text DEFAULT 'team_report' NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
	CONSTRAINT "places_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180),
	CONSTRAINT "places_category_values" CHECK ("category" IN ('building', 'classroom', 'laboratory', 'entrance', 'ramp', 'elevator', 'restroom', 'drinking_fountain', 'cafeteria', 'service', 'other')),
	CONSTRAINT "places_source_values" CHECK ("source" IN ('team_report', 'field_survey', 'demo')),
	CONSTRAINT "places_verification_values" CHECK ("verification_status" IN ('unverified', 'verified')),
	CONSTRAINT "places_verification_evidence" CHECK (("verification_status" = 'unverified' AND "verified_at" IS NULL) OR ("verification_status" = 'verified' AND "verified_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "places_category_idx" ON "places" ("category");--> statement-breakpoint
CREATE INDEX "places_name_idx" ON "places" ("name");--> statement-breakpoint
CREATE INDEX "places_coordinates_idx" ON "places" ("latitude","longitude");