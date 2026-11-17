-- Bounding box canônico dos modelos 3D: computado no upload via parser puro
-- (GLB/GLTF: accessors de POSITION carregam min/max; OBJ: scan de vértices).
-- Preview web e Viro3DObjectPin (AR) derivam scale/offset daqui — fim do
-- "modelo nasce longe da âncora/origem" (pivô deslocado) em TODOS os
-- consumers. Modelos legados/VRX ficam NULL (fallback honesto no AR).
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "bounding_box" jsonb;
