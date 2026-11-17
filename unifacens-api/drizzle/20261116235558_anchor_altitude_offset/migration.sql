-- Ajuste fino de ALTITUDE por ponto (m, -50..+50): o GPS vertical e a pior
-- dimensao (+-5-15m facil indoor) e o hosting geospatial ancora o pin na
-- altitude do DEVICE no momento da criacao - quando o vies e negativo, o pin
-- nasce abaixo do objeto real (ex.: "Portao meio abaixo do que deveria").
-- O offset e somado ao Y SOMENTE nas camadas imprecisas (ancora geospatial
-- nativa + estimativa ENU); o cloud anchor visual (cm, onde o usuario tocou)
-- nao recebe - stepper 0.5m no modal de edicao com preview vivo.
ALTER TABLE "anchors" ADD COLUMN IF NOT EXISTS "altitude_offset_m" double precision;
