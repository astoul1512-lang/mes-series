# CLAUDE.md — Mes Séries

Tu travailles sur **Mes Séries**, la PWA personnelle d'Adrien : une vidéothèque
(films, séries, animés) pensée iPhone d'abord. Front servi par **GitHub Pages**
(branche `main`), back **Supabase** (base + fonctions Edge). Vanilla JS strict,
**aucune dépendance**, aucun build : ce qui est dans le dépôt est ce qui est servi.

## Les rôles — et les trois phrases rituelles

Les specs naissent en amont (Adrien + Claude, dans Cowork) ; TOI tu exécutes ;
**Adrien fusionne**. Concrètement, pour chaque mission :

1. **Montre ton plan avant de coder** et attends la validation.
2. **Ouvre une PR par lot, ne fusionne JAMAIS toi-même.**
3. Termine ton plan par : « voici les risques que je vois que tu n'as pas vus » —
   les meilleures corrections du projet sont venues de là.

Une question sans réponse dans la spec → pose-la sans t'arrêter de travailler sur
le reste. Ne code JAMAIS sur une supposition : lis la vraie structure (le code, la
base, la réponse d'API réelle) avant d'écrire.

## La structure

- **16 fichiers `app-*.js`**, chargés dans l'ordre d'`index.html` (attention :
  `app-08-reglages.js` se charge EN DERNIER, après app-16). **Une seule portée
  globale, pas de modules** : c'est la contrainte structurante — le lanceur de
  tests refuse un nom déclaré deux fois, et une collision de noms a déjà tué
  l'app au démarrage (30/07).
- `app.css` (~180 Ko) — ne jamais réutiliser un nom de classe NU d'une section à
  l'autre (contrôle automatique). Le bloc premium (fin de fichier) peint des
  `background-image` par-dessus les variantes translucides : toute nouvelle
  variante de bouton se teste en premium AUSSI.
- `sw.js` — service worker, **cache d'abord** (décision du 07/08).
- `supabase/migrations/` (numérotées, rejouables) et `supabase/functions/`
  (`tmdb`, `ia`, `notifier`, `supprimer-compte`).
- `tests/` — le harnais. `test.html` (exclu de Pages par `_config.yml`) porte les
  tests purs ; les suites `nav-*` et `retour-*`/`spec*` rejouent les écrans réels.

## LE piège n° 1 — la version

**Toute livraison incrémente LA VERSION EN TROIS ENDROITS, ENSEMBLE, dans le
dernier commit du lot** : `sw.js` (`const CACHE = 'mes-series-vNNN'`),
`index.html` et `README.md`. L'app est cache-first : sans ce bump, les téléphones
installés ne verront JAMAIS le correctif — il aura l'air livré et ne le sera pas.
Après fusion, vérifier que la version est réellement servie en ligne (requête
avec un paramètre anti-cache `?v=...`).

## Lancer les tests (obligatoire avant toute PR)

```
cd <depot> && python3 -m http.server 8099 &
node tests/lance-tests.js        # Node + Playwright
```

Tout doit être vert. Chaque bug corrigé = un cas de test qui le REJOUE, écrit
AVANT le correctif. Le lanceur fait aussi les contrôles statiques (doubles
déclarations, classes CSS, écritures d'état non ouvertes) — ne les contourne pas.

## Conventions maison

- **Tout en français** : code, commits, PR, et surtout les commentaires — qui
  expliquent le POURQUOI, avec la date et le constat qui a motivé la règle
  (regarde n'importe quel fichier : c'est le style du projet).
- `esc`/`escJs` sur TOUTE donnée qui ne vient pas de nous : contenu d'un autre
  utilisateur, réponse TMDB, **sortie de l'IA** (règle S3 du 09/08 — vaut pour
  chaque insertion HTML ET chaque `onclick`).
- « **Mesure fait foi** » : une affirmation de perf ou de volumétrie se prouve
  par des chiffres avant/après dans la PR (CPU bridé ×4/×6 pour la perf). Un
  correctif sans gain mesurable se retire.
- Jamais deux modes de séparateur mélangés dans `with_genres` : virgule = ET,
  barre = OU, et `18|878,16` perd le `878` EN SILENCE (mesuré le 02/08).
- Planchers de votes de la grille : plateforme posée → aucun ; famille Animés
  → 20 ; sinon → 80 ; tri par note → 100 (30 sur Animés). Ne pas les changer
  sans mesure ni spec.

## La navigation — une règle unique

Le retour — flèche ← ET swipe gauche→droite (popstate) — ramène sur **l'écran
précédemment affiché**, celui que l'utilisateur vient de voir. Les deux gestes
racontent la même histoire ; s'ils divergent, c'est un bug. La carte de la pile
vit en commentaire de tête d'`app-03-vues.js` : **tiens-la à jour** avec tout
changement de navigation, et fais passer les suites `nav-*`.

## TMDB — jamais en direct

Le front ne parle JAMAIS à `themoviedb.org` : tout passe par la fonction Edge
`tmdb` (relais avec liste blanche de chemins, clé côté serveur, cache HTTP).
La clé TMDB v4 est un jeton porteur (header Authorization), pas un `?api_key=` —
les deux fonctions serveur font ce test, elles doivent rester d'accord.

## L'IA — le cadre, non négociable

- Fonction Edge `ia` : **liste blanche de tâches**, réservation de quota
  (`ia_compteurs`), journal (`ia_journal`), budgets par utilisateur et globaux.
  Toute nouvelle tâche s'ajoute à la liste blanche, jamais en dehors du cadre.
- Échelle des fournisseurs : **gemini-flash → gemini-flash-lite → openrouter →
  dégradé local**. Ne pas la changer. L'API Claude est ABANDONNÉE (payante hors
  abonnement) — ne jamais la proposer.
- **L'app doit TOUJOURS marcher IA coupée** : chaque usage IA a son repli local
  exact, sans message d'erreur. Le socle ne meurt jamais.
- Sorties IA : JSON strict, parse défensif, rejet propre d'une réponse
  malformée ; le texte rendu est NON SÛR (échappement partout).
- Jamais d'appel IA pendant la frappe — seulement à la validation (règle RB-1).
- Le déploiement des fonctions Edge et l'exécution des migrations sur le projet
  Supabase ne sont PAS ton travail : les fichiers vont dans le dépôt, et tu
  listes ces étapes en « **Hors GitHub** » dans ta PR — Adrien les fait avec
  Claude (l'assistant).

## Supabase — les pièges payés

- **RLS partout.** Les policies de la migration 009 (`recommandations`) sont
  intactes et le restent. Une migration n'AJOUTE que ce que sa spec décrit,
  `if not exists`, rejouable, numéro suivant.
- Refus RLS = **200 avec liste vide**, pas une erreur : compter les lignes
  renvoyées. Plafond PostgREST de 1000 lignes : au-delà, paginer PAR CLÉ (pas
  par offset — une insertion décale la fenêtre).
- `service_role` : scripts serveur uniquement, jamais dans le front, jamais dans
  le dépôt. **Aucune clé nulle part dans le code ou l'historique git** — une clé
  commitée se révoque, elle ne se supprime pas.

## Les interdits absolus

- « Bonsoir Adrien » ou tout message d'accueil nominatif : banni, partout.
- Fusionner toi-même, pousser sur `main` directement, ou toucher un fichier hors
  du périmètre de ton lot.
- Supprimer l'exclusion de `test.html` dans `_config.yml`.
- Ajouter une dépendance, un framework, un build.
- Réordonner ou faire bouger l'écran « sous le doigt » de l'utilisateur (règle
  transverse : une recomposition s'affiche à la prochaine entrée d'écran).

## La PR — ce qu'elle contient

Une branche `lot-<NOM>` par lot (empilées si les lots dépendent l'un de
l'autre). Dans la description : ce qui a été fait et POURQUOI, les mesures
avant/après demandées, les captures, la liste « Hors GitHub », et les parcours
de test qu'Adrien peut rejouer sur son téléphone. Les ancres `fichier:ligne`
des specs datent d'une version donnée — les noms de fonctions font foi.

---

*Ce fichier est la mémoire du projet : chaque erreur découverte et corrigée y
ajoute sa leçon. Si tu en apprends une, propose l'ajout dans ta PR.*
