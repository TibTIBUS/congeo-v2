-- Congéo V2 — schéma de la base Postgres DÉDIÉE (préparation locale, non déployée).
-- Séparée de la V1 : aucune table partagée, aucune écriture V1.
-- La visibilité "salarié = son planning seul" sera appliquée côté serveur
-- (authentification + policies RLS) avant tout usage réel — non couverte par ce prototype.

CREATE TABLE IF NOT EXISTS employees (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  role        text,
  color       text NOT NULL DEFAULT '#2f6fdb'
);

-- Gabarits d'horaires habituels : une ligne par salarié × parité × jour (0=lundi..6=dimanche).
-- Le gabarit appliqué suit la parité du numéro de semaine ISO, même au changement d'année.
CREATE TABLE IF NOT EXISTS templates (
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  parity      text NOT NULL CHECK (parity IN ('paire','impaire')),
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  worked      boolean NOT NULL DEFAULT false,
  start_time  time,
  end_time    time,
  pause_start time,          -- pause du midi : horaire de début
  pause_end   time,          -- et horaire de fin (décision du 25 oct, vocal 11h49)
  is_open     boolean NOT NULL DEFAULT false,  -- coche "Ouverture"
  is_close    boolean NOT NULL DEFAULT false,  -- coche "Fermeture" (cumulable : O et F le même jour)
  PRIMARY KEY (employee_id, parity, weekday)
);

-- Ajustements jour par jour du planning généré depuis les gabarits.
CREATE TABLE IF NOT EXISTS plan_overrides (
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day         date NOT NULL,
  worked      boolean NOT NULL,
  start_time  time,
  end_time    time,
  pause_start time,          -- pause du midi : horaire de début
  pause_end   time,          -- et horaire de fin (décision du 25 oct, vocal 11h49)
  is_open     boolean NOT NULL DEFAULT false,
  is_close    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (employee_id, day)
);

-- Demandes : congés (plage) ou récupération (jours ponctuels).
-- Pas de décompte de jours de congés (retiré le 25 oct 2026).
CREATE TABLE IF NOT EXISTS requests (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id   text NOT NULL REFERENCES employees(id),
  type          text NOT NULL CHECK (type IN ('leave','recovery')),
  date_start    date,          -- leave : début de plage incluse
  date_end      date,          -- leave : fin de plage incluse
  dates         date[],        -- recovery : jours posés
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  deducted_min  integer,       -- recovery : heures décomptées à la validation
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  CHECK ((type = 'leave'    AND date_start IS NOT NULL AND date_end IS NOT NULL)
      OR (type = 'recovery' AND dates IS NOT NULL))
);

-- Heures à récupérer : saisies admin (positif) et décomptes à la validation (négatif).
-- Règle prudente retenue : validation bloquée si le solde ne couvre pas les heures
-- prévues au planning des jours posés (aucune heure perdue, pas de découvert).
CREATE TABLE IF NOT EXISTS recovery_ledger (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id text NOT NULL REFERENCES employees(id),
  delta_min   integer NOT NULL,
  reason      text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_ledger_employee_id_idx ON recovery_ledger (employee_id);
CREATE INDEX IF NOT EXISTS requests_employee_id_status_idx ON requests (employee_id, status);

-- Périodes où les congés sont interdits (reprise des règles V1) + réglages.
CREATE TABLE IF NOT EXISTS blocks (
  id text PRIMARY KEY,
  label text NOT NULL,
  start_date text NOT NULL,
  end_date text NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- Additive V1 feature restoration. Existing V2 records and IDs are retained.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notify boolean NOT NULL DEFAULT false;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_status_check CHECK(status IN ('pending','approved','rejected','proposed','cancelled'));
ALTER TABLE recovery_ledger ADD COLUMN IF NOT EXISTS request_ref text;
CREATE TABLE IF NOT EXISTS outbox(id text PRIMARY KEY,employee_id text NOT NULL,subject text NOT NULL,body text NOT NULL,status text NOT NULL DEFAULT 'queued',created timestamptz NOT NULL DEFAULT now());
