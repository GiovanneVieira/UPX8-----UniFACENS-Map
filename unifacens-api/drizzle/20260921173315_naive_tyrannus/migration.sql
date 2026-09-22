CREATE TABLE "anchors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"cloud_anchor_id" text NOT NULL,
	"description" text,
	"position_x" double precision,
	"position_y" double precision,
	"position_z" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
