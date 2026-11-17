-- Modelo 3D OVERRIDE por pin (F3): anchors.model_id → models.id (RESTRICT).
-- O carousel de criação/edição escolhe o modelo do PONTO; null = herda o
-- modelo da categoria (categories.model_id, mandante 1:1) — fallback ViroBox.
ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "model_id" uuid;
DO $$ BEGIN
  ALTER TABLE "anchors"
    ADD CONSTRAINT "anchors_model_id_models_id_fkey"
    FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
