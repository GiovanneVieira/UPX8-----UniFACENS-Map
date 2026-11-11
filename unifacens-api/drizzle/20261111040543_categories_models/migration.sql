-- Categorias gerenciáveis + modelos 3D + FKs de places/anchors (idempotente).
-- Ordem: models → categories → seed das 11 ex-hardcoded → places (coluna nova,
-- backfill por slug, NOT NULL, drop da legada) → anchors (category_id).
CREATE TABLE IF NOT EXISTS "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"format" text NOT NULL,
	"original_key" text NOT NULL,
	"derived_key" text,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "models_format_values" CHECK ("format" IN ('glb', 'gltf', 'obj', 'fbx', 'vrx')),
	CONSTRAINT "models_size_positive" CHECK ("size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"model_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_format" CHECK ("slug" ~ '^[a-z0-9]+([-_][a-z0-9]+)*$'),
	CONSTRAINT "categories_label_not_blank" CHECK (length(trim("label")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_key" ON "categories" ("slug");
--> statement-breakpoint
-- Seed das 11 categorias ex-hardcoded (placeCategorySchema). Idempotente por slug.
INSERT INTO "categories" ("slug", "label", "sort") VALUES
	('building', 'Prédio', 0),
	('classroom', 'Sala', 1),
	('laboratory', 'Laboratório', 2),
	('entrance', 'Entrada', 3),
	('ramp', 'Rampa', 4),
	('elevator', 'Elevador', 5),
	('restroom', 'Banheiro', 6),
	('drinking_fountain', 'Bebedouro', 7),
	('cafeteria', 'Cantina', 8),
	('service', 'Serviço', 9),
	('other', 'Outro', 10)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_category_values') THEN
		-- Nada a fazer: constraint legada já foi removida.
		NULL;
	ELSE
		ALTER TABLE "places" DROP CONSTRAINT "places_category_values";
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'places' AND column_name = 'category_id') THEN
		ALTER TABLE "places" ADD COLUMN "category_id" uuid;
	END IF;
END $$;
--> statement-breakpoint
-- Backfill: resolve o slug legado para o id da categoria seedada.
UPDATE "places" p
SET "category_id" = c."id"
FROM "categories" c
WHERE p."category_id" IS NULL AND p."category" = c."slug";
--> statement-breakpoint
DO $$
BEGIN
	-- Places sem categoria (slug órfão — impossível pelo CHECK legado, mas
	-- defensivamente casa com 'other') não pode ficar NULL na virada.
	UPDATE "places" p
	SET "category_id" = c."id"
	FROM "categories" c
	WHERE p."category_id" IS NULL AND c."slug" = 'other';

	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'places' AND column_name = 'category_id' AND is_nullable = 'YES'
	) THEN
		ALTER TABLE "places" ALTER COLUMN "category_id" SET NOT NULL;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_category_id_categories_id_fkey') THEN
		ALTER TABLE "places" ADD CONSTRAINT "places_category_id_categories_id_fkey"
			FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'places' AND column_name = 'category') THEN
		ALTER TABLE "places" DROP COLUMN "category";
	END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "places_category_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "places_category_idx" ON "places" ("category_id");
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anchors' AND column_name = 'category_id') THEN
		ALTER TABLE "anchors" ADD COLUMN "category_id" uuid;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "anchors_category_idx" ON "anchors" ("category_id");
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anchors_category_id_categories_id_fkey') THEN
		ALTER TABLE "anchors" ADD CONSTRAINT "anchors_category_id_categories_id_fkey"
			FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_model_id_models_id_fkey') THEN
		ALTER TABLE "categories" ADD CONSTRAINT "categories_model_id_models_id_fkey"
			FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE RESTRICT;
	END IF;
END $$;
