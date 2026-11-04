ALTER TABLE "jwks" ADD COLUMN IF NOT EXISTS "crv" text;--> statement-breakpoint
ALTER TABLE "jwks" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "impersonated_by" text;
