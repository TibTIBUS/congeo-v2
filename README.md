# Congéo V2 (prototype)

Planning et congés pour une petite équipe (5 salariés fictifs) : gabarits
semaines paires/impaires, exceptions, pause du midi, demandes de congés et
récupérations avec validation admin, alertes de couverture ouverture/fermeture.

**Données 100 % fictives.** Accès identique à la V1 : **pas de connexion** —
le salarié choisit son nom (mémorisé dans son navigateur) et l'administration
est à une adresse séparée (`#/admin`), sans lien depuis l'espace salarié.

Deux modes :

- **Démo** (`npm run dev`, ou la version statique publiée) : tout dans le
  navigateur (localStorage), aucune sauvegarde partagée entre appareils.
- **Serveur** (`npm run build && npm start`) : API Node + persistance JSON,
  ou PostgreSQL si `DATABASE_URL` est défini. Même accès sans connexion.

## Commandes

```bash
npm install
npm run dev        # démo locale
npm run build && npm start   # version serveur sur http://127.0.0.1:4180
npm test           # tests unitaires + intégration (vitest, pg-mem, Postgres éphémère)
npm run test:ui    # vérifications visuelles (Playwright)
npm run test:e2e   # workflows bout en bout contre le serveur réel
```

## Mise en ligne

Voir **DEPLOY.md** : la démo statique est publiée sur GitHub Pages (gratuit,
dépôt public) ; la version avec sauvegarde partagée nécessite un projet Neon
séparé (API en Neon Function + base Postgres), comme la V1.
