-- Congéo V2 · migration 19 nov 2026 · « autre récupération / jour férié » (recovery_other)
-- À jouer sur la base Neon AU DÉPLOIEMENT, après le push du code, avant toute saisie
-- d'une absence de type recovery_other. Aucune donnée n'est modifiée (contraintes seules).
BEGIN;
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_type_check;
ALTER TABLE requests ADD CONSTRAINT requests_type_check CHECK (type IN ('leave','recovery','recovery_other'));
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_check;
ALTER TABLE requests ADD CONSTRAINT requests_check CHECK ((type='leave' AND date_start IS NOT NULL AND date_end IS NOT NULL) OR (type IN ('recovery','recovery_other') AND dates IS NOT NULL));
COMMIT;
