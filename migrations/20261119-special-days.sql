-- Congéo V2 · migration publication · compteur « autre récupération · férié / dimanche »
-- (règle validée par Thibaut, 19 nov 2026 21h58 ; Aline pourra ajuster).
-- À jouer sur la base Neon AU DÉPLOIEMENT, après le push du code.
--
-- 1) Table des mouvements du compteur. Les CRÉDITS (1 jour par férié ouvert ou
--    dimanche ouvert travaillé) sont calculés depuis le planning à la lecture,
--    jamais stockés ; la table ne reçoit que le solde initial, les corrections
--    et les débits/recrédits des demandes.
-- 2) Alignement des 2 demandes de Chloé Lhomme sur la V1 (type
--    « autre récupération · férié/dimanche »), SANS notification et SANS
--    décompte : aucune ligne special_day_ledger n'est créée ici (comme pour les
--    heures, le solde renseigné ensuite par Aline tiendra compte de ces jours).
-- Idempotent : une seconde exécution ne change rien (les UPDATE ne matchent
-- plus une fois le type changé).
BEGIN;
CREATE TABLE IF NOT EXISTS special_day_ledger (
  id          text PRIMARY KEY,
  employee_id text NOT NULL REFERENCES employees(id),
  delta_days  integer NOT NULL,
  reason      text,
  day         date,
  request_ref text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS special_day_ledger_employee_id_idx ON special_day_ledger (employee_id);

-- Chloé Lhomme 18/11/2026 : V1 = récupération validée d'un férié travaillé
-- (note V1 reprise). V2 l'avait comme « congé validé ». details REMPLACÉ : la
-- ligne live est vide ({}) — vérifié sur le dump du 19/11.
UPDATE requests
SET type='recovery_other', dates=ARRAY[DATE '2026-11-18'], date_start=NULL, date_end=NULL,
    details='{"note":"Rendez-vous (après-midi)","source":"v1-align-20261119"}'::jsonb
WHERE employee_id='186f19b4-6f37-4c2f-b50d-09de22db7f74' AND type='leave'
  AND date_start=DATE '2026-11-18' AND date_end=DATE '2026-11-18' AND status='approved';

-- Chloé Lhomme 05/11/2026 : V1 = récupération ANNULÉE (le statut annulé a déjà
-- été aligné en direct le 19/11 ; reste le type). details REMPLACÉ : la ligne
-- live ne contient que le drapeau d'annulation consommé (cancel_requested:0).
UPDATE requests
SET type='recovery_other', dates=ARRAY[DATE '2026-11-05'], date_start=NULL, date_end=NULL,
    details='{"note":"Rendez-vous","source":"v1-align-20261119","cancel_requested":0}'::jsonb
WHERE employee_id='186f19b4-6f37-4c2f-b50d-09de22db7f74' AND type='leave'
  AND date_start=DATE '2026-11-05' AND date_end=DATE '2026-11-05' AND status='cancelled';
COMMIT;
