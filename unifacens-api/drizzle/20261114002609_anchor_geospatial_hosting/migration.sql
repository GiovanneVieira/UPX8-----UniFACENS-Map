-- Dupla ancoragem por pin: além da âncora VISUAL (cloudAnchorId, precisão
-- centimétrica quando o resolve SIFT fecha), o pin pode carregar uma âncora
-- GEOESPACIAL hospedada na plataforma ReactVision (hostGeospatialAnchor) —
-- camada intermediária server-backed (GPS/VPS) que substitui a projeção
-- client-side enquanto o resolve visual não fecha (fim dos "ghost anchors"
-- puramente locais). Acurácia da pose no hosting vira o selo honesto "±Xm".
ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "geospatial_anchor_id" text;
ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "geospatial_accuracy_m" double precision;
