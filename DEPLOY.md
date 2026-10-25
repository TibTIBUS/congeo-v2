# Mise en ligne — options et limites

## Option A — Démo statique sur GitHub Pages (gratuit)

Ce que GitHub couvre gratuitement (vérifié sur docs.github.com, 25/10/2026) :

- Dépôt git, public ou privé : gratuit et illimité.
- GitHub Pages : **gratuit uniquement pour un dépôt public** (plan GitHub Free).
  Le code et la démo sont donc visibles par tout le monde.
- GitHub Actions : gratuit pour les dépôts publics.

Pages héberge uniquement du **statique** (HTML/CSS/JS) : c'est la **démo
navigateur** (données fictives, localStorage) qui est publiée, **pas** le
backend. Le workflow `.github/workflows/pages.yml` construit et publie la démo
à chaque push sur `main`.

Mise en route (une fois) :
1. Créer le dépôt sur github.com (public).
2. `git remote add origin git@github.com:TibTIBUS/congeo-v2.git && git push -u origin main`
3. Settings → Pages → Source : **GitHub Actions**.
La démo est ensuite sur `https://tibtibus.github.io/congeo-v2/`.

Limites Pages : pas de serveur Node, pas de base ; conditions GitHub : Pages
n'est pas destiné à faire tourner un service commercial (docs.github.com/pages
→ « GitHub Pages limits »). Pour une démo fictive c'est conforme.

## Option B — Version complète (API + auth + PostgreSQL)

**Ne peut pas tourner sur GitHub.** Il faut un hébergement Node (Render,
Railway, Fly.io…) plus une base Postgres managée (Neon, Supabase…) — des offres
gratuites existent, mais ce sont des **services externes hors GitHub** :
création de compte et accord séparé nécessaires avant toute publication.

L'application est prête pour ce cas : `npm start` sert le front buildé et
l'API ; `DATABASE_URL` bascule la persistance sur PostgreSQL ; `CONGEO_SEED_DEMO=1`
réinitialise les données fictives. Le stockage Postgres est vérifié
localement contre un vrai Postgres éphémère (test de concurrence inclus).
