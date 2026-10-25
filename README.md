# Congéo V2

Congés et planning du magasin de La Haye. L'interface reprend le design de la V1 : calendrier mensuel/annuel, espace salarié partagé et administration séparée.

## Fonctions

- Demandes de congés et de récupération, à la journée ou à la semaine.
- Validation, refus, proposition d'autres dates, annulation, modification et suppression.
- Une absence validée par date, dérogation explicite pour une deuxième, jamais une troisième.
- Semaines ISO paires/impaires, pauses, ajustements journaliers et alertes de présence réelle à l'ouverture/fermeture.
- Page **Heures supplémentaires** : saisie en heures/minutes, corrections, historique et solde de récupération. Aucun total d'heures travaillées.
- Décompte atomique des récupérations et recrédit lors d'une correction ou suppression.
- Équipe, archivage des salariés, périodes interdites modifiables, export Excel et impression mensuelle/annuelle.
- Affiche QR pour la V2. Préférences d'e-mail et file d'envoi (actif uniquement si RESEND_API_KEY et EMAIL_FROM sont configurés).

L'accès reste celui demandé pour la V1 : pas de comptes, salarié choisi dans la liste et administration à une adresse séparée. Il ne s'agit pas d'une authentification.

## Développement

Node.js 24. `npm ci`, `npm run dev`, `npm test`, `npm run build`, `npm run build:function`.

La base et l'API V2 restent distinctes de la V1. Les migrations sont additives et conservent les données existantes.

Pour un aperçu isolé, définir CONGEO_PREVIEW_API dans un fichier .env.local ignoré par Git. Le proxy de développement est absent du site compilé. Sans cette variable, public/config.js détermine l'API.

Les tests Postgres natifs requièrent un utilisateur non-root ou CONGEO_TEST_DATABASE_URL ; les tests de concurrence sont aussi vérifiables sur une branche Neon isolée.
