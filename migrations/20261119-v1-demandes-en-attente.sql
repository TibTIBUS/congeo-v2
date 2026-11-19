-- Congéo V2 · migration publication · reprise des 4 demandes EN ATTENTE de la V1
-- (accord Thibaut, 19 nov 2026 21h33). Demandes ajoutées telles quelles, statut « en attente » :
-- AUCUNE notification (pas de ligne outbox), AUCUN décompte (pas de ligne recovery_ledger,
-- deducted_min reste NULL). Les écarts de Chloé Lhomme ne sont PAS touchés (avis d'Aline requis).
-- Idempotent : relire le fichier ne crée pas de doublon.
BEGIN;
INSERT INTO requests (employee_id, type, date_start, date_end, status, created_at, details)
SELECT 'a91f96b1-97e4-4e82-9014-8ab9201c7d46', 'leave', DATE '2027-01-02', DATE '2027-01-02', 'pending', TIMESTAMPTZ '2026-11-17T11:37:59.485Z', '{"source":"v1-import-pending"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM requests WHERE employee_id='a91f96b1-97e4-4e82-9014-8ab9201c7d46' AND type='leave' AND date_start=DATE '2027-01-02' AND date_end=DATE '2027-01-02' AND status='pending');
INSERT INTO requests (employee_id, type, date_start, date_end, status, created_at, details)
SELECT '1ca3cf3c-83fa-433d-9684-c8e816ca153d', 'leave', DATE '2027-10-23', DATE '2027-10-30', 'pending', TIMESTAMPTZ '2026-11-13T21:38:03.433Z', '{"source":"v1-import-pending"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM requests WHERE employee_id='1ca3cf3c-83fa-433d-9684-c8e816ca153d' AND type='leave' AND date_start=DATE '2027-10-23' AND date_end=DATE '2027-10-30' AND status='pending');
INSERT INTO requests (employee_id, type, date_start, date_end, status, created_at, details)
SELECT '99a82e41-0c23-442a-902a-ae49b65b7c16', 'leave', DATE '2026-12-28', DATE '2027-01-02', 'pending', TIMESTAMPTZ '2026-11-13T08:58:22.802Z', '{"source":"v1-import-pending"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM requests WHERE employee_id='99a82e41-0c23-442a-902a-ae49b65b7c16' AND type='leave' AND date_start=DATE '2026-12-28' AND date_end=DATE '2027-01-02' AND status='pending');
INSERT INTO requests (employee_id, type, dates, status, created_at, details)
SELECT '21f11fd4-3055-4957-b97b-b663fea48c91', 'recovery', ARRAY[DATE '2027-01-28'], 'pending', TIMESTAMPTZ '2026-11-09T07:39:04.424Z', '{"source":"v1-import-pending"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM requests WHERE employee_id='21f11fd4-3055-4957-b97b-b663fea48c91' AND type='recovery' AND dates=ARRAY[DATE '2027-01-28'] AND status='pending');
COMMIT;
