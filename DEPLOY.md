# Déploiement Congéo V2

L'interface est publiée sur GitHub Pages à chaque push validé sur main, après les tests et la compilation.

- Interface : https://tibtibus.github.io/congeo-v2/
- Administration : https://tibtibus.github.io/congeo-v2/#/admin
- API : URL publique dans public/config.js, Neon Function congeov2 sur le projet proud-river-20239760, branche br-solitary-union-ba4ax9oj, Francfort.
- La V1 reste sur son dépôt et son projet Neon distincts.

Node 24 : npm ci, npm test, npm run build, npm run build:function. Le dossier dist-function est genere et ignore par Git : aucun bundle precompile ne doit etre repris depuis le depot ou une ancienne archive. Toujours reconstruire depuis le commit courant, puis deployer dist-function/index.mjs comme index.mjs dans l'archive de la Neon Function. Cette reconstruction inclut le calcul A/B continu a partir du 4 janvier 2027 et preserve la regle historique avant cette date. Les variables d'environnement omises sont conservees.

Le schéma schema.sql est appliqué avant les premières requêtes de chaque instance. Les migrations préservent les identifiants et les enregistrements existants ; tester les évolutions sur une branche isolée avant la branche principale.

Les notifications e-mail nécessitent RESEND_API_KEY et EMAIL_FROM côté serveur. Sans ces variables, les préférences sont enregistrées et l'interface indique que l'envoi n'est pas activé.

L'accès sans compte reste un choix explicite : le nom est déclaré et l'administration est séparée, sans authentification.
