# Congéo V2 (prototype)

Planning et congés pour une petite équipe (5 salariés fictifs) : gabarits
semaines paires/impaires, exceptions, pause du midi, demandes de congés et
récupérations avec validation admin, alertes de couverture ouverture/fermeture.

**Données 100 % fictives.** Deux modes :

- **Démo** (`npm run dev`) : tout dans le navigateur (localStorage), aucun compte.
- **Serveur** (`npm run build && npm start`) : API Node + sessions + persistance
  JSON, ou PostgreSQL si `DATABASE_URL` est défini (sinon Postgres local possible).

## Commandes

```bash
npm install
npm run dev        # démo locale
npm run build && npm start   # version serveur sur http://127.0.0.1:4180
npm test           # tests unitaires + intégration (vitest, pg-mem, Postgres éphémère)
npm run test:ui    # vérifications visuelles (Playwright)
npm run test:e2e   # workflows bout en bout contre le serveur réel
```

Comptes de démo (mode serveur) : `admin@echoppe.test` / `hugo@echoppe.test`
etc., mot de passe `demo1234` — fictifs, à changer pour tout usage réel.

## Mise en ligne

Voir **DEPLOY.md** : la démo statique peut partir sur GitHub Pages (gratuit,
dépôt public requis) ; la version complète avec base nécessite un hébergement
Node + Postgres hors GitHub.
