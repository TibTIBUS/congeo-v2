# Mise en ligne — options et limites

## Option A — Démo statique sur GitHub Pages (gratuit, choisi pour le test)

Ce que GitHub couvre gratuitement (vérifié sur docs.github.com, 25/10/2026) :

- Dépôt git, public ou privé : gratuit et illimité.
- GitHub Pages : **gratuit uniquement pour un dépôt public** (plan GitHub Free).
  Le code et la démo sont donc visibles par tout le monde.
- GitHub Actions : gratuit pour les dépôts publics.

Pages héberge uniquement du **statique** (HTML/CSS/JS) : c'est la **démo
navigateur** (données fictives, localStorage) qui est publiée, **pas** le
serveur. **Limite : chaque appareil garde ses propres données fictives, rien
n'est partagé entre utilisateurs.** Le workflow `.github/workflows/pages.yml`
construit et publie la démo à chaque push sur `main`.

Mise en route (une fois) : créer le dépôt public, pousser, puis
Settings → Pages → Source : **GitHub Actions**.
La démo est ensuite sur `https://tibtibus.github.io/congeo-v2/`.

Limites Pages : pas de serveur Node, pas de base ; conditions GitHub : Pages
n'est pas destiné à faire tourner un service commercial. Pour une démo fictive
c'est conforme.

## Option B — Sauvegarde partagée (comme la V1 : Pages + Neon)

La V1 utilise déjà ce montage : Pages (interface) + projet Neon (base PostgreSQL
partagée + API déployée en Neon Function, région Francfort). La V2 peut le
reprendre sur un **projet Neon séparé** (la V1 et sa base restent intouchées) :

- Console Neon du compte (25/10/2026) : **Free Plan, 0 $/mois** — par projet :
  1 Go stockage, 100 h de calcul, 10 branches. Jusqu'à 100 projets.
- Neon Functions (Node.js 24, disponible à Francfort) : **gratuit pendant la
  bêta** (tarif annoncé ensuite : 0,10 $/CU-h en plan Launch).
- Le serveur V2 (`server/`) est prêt pour PostgreSQL (`DATABASE_URL`) ; la
  persistance est vérifiée localement contre un vrai Postgres éphémère
  (test de concurrence inclus). L'adaptation en Neon Function suit le contrat
  `export default { fetch }` (comme la V1).

Créer ce projet Neon = nouveau service externe : accord séparé requis avant
toute création.
