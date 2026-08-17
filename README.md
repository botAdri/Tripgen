# Guide de Voyage — génération par IA (texte libre)

Page web où l'utilisateur décrit son voyage en une phrase, et où un itinéraire
complet (carte, étapes, activités, budget) est généré automatiquement et affiché.

## Architecture

- `index.html` + `app.js` → la page (statique), à héberger sur **GitHub Pages**.
- `worker.js` → un **Cloudflare Worker** qui reçoit la description, appelle l'API
  Claude avec votre clé (gardée secrète côté serveur) et renvoie un itinéraire
  structuré en JSON. GitHub Pages ne peut pas cacher de clé API : ce petit serveur
  intermédiaire est indispensable.

```
Navigateur (GitHub Pages) --POST description--> Cloudflare Worker --> API Claude
Navigateur <--JSON itinéraire-- Cloudflare Worker <--JSON structuré-- API Claude
```

## 1. Déployer le Worker (backend)

1. Créez un compte sur https://dash.cloudflare.com (gratuit).
2. Workers & Pages → **Create** → **Create Worker**.
3. Collez le contenu de `worker.js` dans l'éditeur, déployez.
4. Dans les **Settings** du Worker → **Variables and Secrets** → ajoutez :
   - `ANTHROPIC_API_KEY` = votre clé API Anthropic (console.anthropic.com)
5. Notez l'URL du Worker, du type :
   `https://guide-voyage.votre-pseudo.workers.dev`

## 2. Configurer le frontend

Dans `app.js`, ligne 2 :
```js
const WORKER_URL = "https://guide-voyage.votre-pseudo.workers.dev";
```
Remplacez par l'URL obtenue à l'étape précédente.

## 3. Déployer sur GitHub Pages

1. Créez un repo GitHub, mettez `index.html` et `app.js` à la racine (pas besoin
   de `worker.py` ni des fichiers du générateur Python — ceux-ci ne servent plus
   dans cette version).
2. Settings → Pages → Source : branche `main`, dossier `/ (root)`.
3. Votre page est en ligne à `https://votre-pseudo.github.io/votre-repo/`.

## Coûts

- GitHub Pages : gratuit.
- Cloudflare Worker : gratuit jusqu'à 100 000 requêtes/jour.
- API Claude : payante à l'usage (quelques centimes par itinéraire généré,
  selon le modèle choisi dans `worker.js`).

## Personnalisation

- Le modèle utilisé (`model: "claude-sonnet-5"` dans `worker.js`) peut être changé
  pour un modèle moins cher (ex. Haiku) si le coût est un sujet.
- Le schéma exact de l'itinéraire généré (nombre d'étapes, champs de budget...)
  se modifie dans `ITINERARY_TOOL` (worker.js) et doit rester cohérent avec ce
  que `renderTrip()` attend dans `app.js`.
- Pour ajouter une protection anti-abus (éviter que n'importe qui épuise votre
  quota d'API), on peut ajouter un rate-limit simple dans le Worker (par IP,
  via `env` + Cloudflare KV) — dites-moi si vous voulez que je l'ajoute.
