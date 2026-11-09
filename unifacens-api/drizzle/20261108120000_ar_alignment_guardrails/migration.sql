-- Guardrails de range para coordenadas WGS84 dos pins (idempotente).
-- Defense-in-depth além do Zod (createAnchorSchema): um bug no client
-- não grava coordenadas físicas impossíveis no banco.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anchors_latitude_range_chk') THEN
		ALTER TABLE "anchors" ADD CONSTRAINT "anchors_latitude_range_chk"
			CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anchors_longitude_range_chk') THEN
		ALTER TABLE "anchors" ADD CONSTRAINT "anchors_longitude_range_chk"
			CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anchors_altitude_range_chk') THEN
		ALTER TABLE "anchors" ADD CONSTRAINT "anchors_altitude_range_chk"
			CHECK ("altitude" IS NULL OR ("altitude" >= -100 AND "altitude" <= 10000));
	END IF;
END $$;
