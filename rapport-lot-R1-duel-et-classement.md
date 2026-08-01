# Rapport de relecture — lot `lot-R1-duel-et-classement`

```
Perte de données possible : OUI (limitée au podium — la bibliothèque, les épisodes vus et les pouces ne risquent rien)
Tests : 178 cas + 3 contrôles de structure, 0 échec
Verdict : À CORRIGER D'ABORD
```

**En une phrase.** Le lot fait très bien presque tout ce qu'on lui demandait — les deux
collisions de styles sont réparées, le duel tient dans l'écran, les affiches ne sont plus
rognées, le classement permanent existe et se synchronise proprement. Mais **la première
partie jouée après la mise en prod efface ton podium actuel**, et il ne revient pas. C'est
le seul point qui bloque.

---

## 🔴 Bloquant

### 1. Ta première partie de duel efface ton podium — et il ne revient pas

**Ce que c'est.** Avant, le podium était écrit à la fin de chaque partie. Maintenant il
est *recalculé* à partir du nouveau classement, en ne gardant que les titres ayant joué au
moins 3 duels. Comme le nouveau classement démarre vide, aucun titre n'atteint 3 duels
avant plusieurs parties — donc le calcul rend une liste vide ou presque, **et elle écrase
l'ancienne**.

**Où.** `/home/claude/r1/app-11-gouts.js` ligne 1476 (`projeterPodium`), appelée
ligne 1748 par `terminerDuel`. La migration, elle, est correcte
(`/home/claude/r1/app-01-noyau.js` ligne 348) : elle ne détruit rien. C'est la première
partie jouée qui détruit.

**Ce qui se passe concrètement.** J'ai vérifié sur ta vraie base (lue en lecture seule
dans Supabase) : ton compte porte **402 films, 113 séries**, et un podium plein —
10 films, 10 séries, 10 animés. J'ai rejoué exactement cet état :

| | podium des films |
|---|---|
| aujourd'hui | 10 titres |
| après ta 1ʳᵉ partie de duel | **vide** (l'app se croit revenue au premier jour : la carte du duel repasse à « Départage tes films », « Ton film préféré » disparaît de Découvrir) |
| après la synchro suivante | les 10 reviennent, par un effet de bord de la fusion |
| **après ta 2ᵉ partie** | **1 seul titre. Les 9 autres sont perdus définitivement.** |
| retour à 10 titres | il faut **une quinzaine de parties**, soit ~150 duels |

Chaque famille est touchée le jour où tu la joues : jouer les films n'abîme pas les séries.

**Quoi faire.** Dans `projeterPodium`, **ne jamais écrire un podium plus court que celui
qu'on remplace** : après avoir calculé la projection, la compléter avec les identifiants
de l'ancien podium encore absents, dans leur ordre, jusqu'à dix. Le seuil des 3 duels
continue alors de commander *l'entrée* au podium, sans commander la *sortie* de ceux qui y
étaient déjà. (Vérifié : ce correctif ne casse aucun des cas de test déjà écrits.)

---

## 🟠 À corriger

### 2. L'écran de fin promet une rangée « Dans l'esprit de… » qui n'arrivera pas

**Ce que c'est.** L'écran de résultat annonce toujours que le n°1 de la partie devient le
point de départ des suggestions. Quand le podium est vide (cf. point 1), ce n'est pas vrai :
les suggestions repartent d'un titre quelconque de la bibliothèque.

**Où.** `/home/claude/r1/app-11-gouts.js` lignes 1967-1970.

**Ce qui se passe concrètement.** Mesuré, texte réel de l'écran : « **Film numéro 17**
devient ton point de départ. La rangée "Dans l'esprit de **Film numéro 17**" remplace la
rotation au hasard, dès maintenant. » — alors que la fonction qui alimente réellement cette
rangée (`departJeuRech`, `/home/claude/r1/app-12-recherche.js` l. 1275) rend **Film
numéro 1**. Deux lignes plus bas, le même écran écrit « Tes duels sont enregistrés… encore
quelques parties et il se figera » : l'écran se contredit lui-même.

**Quoi faire.** N'afficher le bloc « Ce que ça change tout de suite » que si le podium est
réellement rempli (le lot a déjà la variable qu'il faut : `duel.podiumPret`). Sinon, ne rien
promettre.

---

## ⚪ À noter (rien à faire, pour mémoire)

### 3. Le nouveau contrôle anti-collision CSS ne voit pas tout

Je l'ai testé comme demandé : j'ai réintroduit à la main les deux collisions d'origine
(`.dinfo` et `.itxt`), les tests **ont bien échoué** et ont nommé les deux coupables avec
leur numéro de ligne. J'ai retiré la fabrication aussitôt ; le dépôt est intact.

Un angle mort subsiste : la même collision écrite à l'intérieur d'un bloc `@media` ou
`@supports` passe inaperçue (vérifié). C'est délibéré — sans cette exception, le contrôle
crierait sur des règles parfaitement légitimes. À garder en tête si un lot futur écrit
dedans.

### 4. Une sauvegarde exportée ne restaure pas le classement

`exportData` emporte bien le nouveau classement, mais `appliquerImport`
(`/home/claude/r1/app-08-reglages.js` l. 186) ne reprend que la bibliothèque, les goûts,
le profil et les cloches. Réimporter une sauvegarde perdrait donc les mois de duels — comme
elle perd déjà les pouces et le podium aujourd'hui. **Ce n'est pas ce lot qui a créé le
trou**, mais il y met désormais beaucoup plus de valeur.

### 5. La fusion entre deux appareils : un détail assumé

À nombre de duels égal sur un même titre, c'est le score de l'appareil local qui est retenu :
les deux téléphones peuvent donc afficher un score très légèrement différent jusqu'au duel
suivant. **Aucun duel n'est perdu** dans aucun sens — je l'ai vérifié dans les deux ordres
et en fusionnant deux fois de suite. C'est écrit noir sur blanc dans le code, c'est honnête.

Petite conséquence du point 1 : le commentaire de la fusion du podium
(`/home/claude/r1/app-01-noyau.js` l. 850) affirme qu'un podium « n'est jamais vidé
volontairement ». Ce n'est plus vrai. À réécrire une fois le point 1 corrigé.

### 6. `app.css` a été modifié au milieu du fichier, pas en fin

La règle maison veut qu'un lot ajoute sa section en fin de fichier. Ici, c'est justifié :
le lot répare deux collisions, et une collision se répare là où elle est née — la déplacer
en fin de fichier l'aurait aggravée. Rien à faire.

---

## Ce que j'ai vérifié et qui est bon

- **Les tests.** 178 cas, **0 échec** (plus les 3 contrôles de structure). Le lot ajoute
  12 cas neufs, dont 6 sur la fusion du classement. Bonne couverture — il manque seulement
  un cas qui aurait attrapé le point 1 : « après une partie, le podium ne rétrécit pas ».
- **Point 1 (la pastille `.dinfo`).** Renommée `.dpastille` **dans le CSS et dans le
  JavaScript**, le renommage est complet, plus aucune trace de l'ancien nom. L'aperçu de
  Recherche récupère son bloc titre.
- **Point 2 (`.itxt`).** Rattachée à `.iwrap` et `.ifini`. J'ai vérifié les 5 endroits du
  code qui posent cette classe : les 4 du parcours d'inscription sont couverts, le 5ᵉ
  (Découvrir) était déjà couvert par son propre conteneur. Rien n'est cassé.
- **Point 9 (la sortie du duel).** Mesuré dans un vrai navigateur, avec les zones de
  sécurité de l'iPhone simulées, sur 5 tailles d'écran (320×568 à 430×932) : le bouton
  « Je ne sais pas / les deux » est **entièrement visible sans défiler, partout**.
- **Point 10 (les jaquettes).** Cartes côte à côte, **170 × 255 points**, rapport mesuré
  **0,667** — le format 2/3 exact, donc plus aucune affiche rognée. La pastille
  « 👍 déjà aimé » tient sur une ligne sans être coupée (82 px de texte pour 126 px de
  place). Un titre très long est proprement coupé à deux lignes et ne déborde jamais de la
  carte.
- **Point 11 (le contrat de données).** `db.podium` garde **exactement sa forme** (une
  liste d'identifiants texte par famille, dix au plus, plus une date) — c'est son *contenu*
  qui rétrécit, cf. point 1. La fusion garde bien l'entrée au plus grand nombre de duels,
  elle est idempotente, elle ne perd aucun duel dans un sens comme dans l'autre, et elle
  résiste à un paquet abîmé (score non numérique, compteur négatif ou infini, famille
  corrompue). La migration crée le classement **sans toucher au podium**. Le seuil de
  3 duels s'applique bien à l'entrée au *podium* et pas au *classement*. Une partie sert
  bien **au moins 4 duels « titre neuf contre titre du podium »** — j'en ai mesuré 5 sur 10
  en régime normal (mais 0 tant que le podium est vide, cf. point 1).
- **Point 12 (« Encore une chose »).** La liste ne contient plus que les titres réellement
  passés à l'écran, les derniers en haut, sans ceux déjà pouçés ni ceux récusés pendant la
  partie. Liste vide : le bouton dit « Terminer » et l'écran est sauté.
- **Le garde-fou du §1.7.** Intact : le perdant d'un duel ne devient jamais un 👎.
- **Les règles maison.** Aucune collision de noms globaux (824 déclarations contrôlées).
  `applyWatched`, `statutSerie` et `ligneEpisode` ne sont pas touchés. **Le numéro de
  version n'a pas été modifié** (`v85` dans `index.html` et `sw.js`). Aucun fichier ajouté
  ni supprimé, donc rien à déclarer dans `sw.js`.
- **La base de production.** Le lot ne touche ni au SQL ni aux Edge Functions, et il n'en a
  pas besoin : la colonne qui reçoit la synchro est déjà libre de forme. Vérifié en lecture
  seule. Aucun de tes 4 comptes ne porte encore de classement — normal, il n'existe pas
  encore en ligne.
- **La sécurité.** Rien de neuf n'entre dans un `onclick` ; l'identifiant du titre passe
  bien par `escJs`. Aucune clé secrète. Aucune écriture nouvelle hors du mode test — les
  nouveaux cas de test n'écrivent pas dans la vraie base (le verrou du 30/07 tient).

---

## Ce que tu en fais

> Voici le rapport. Joins-le dans la conversation qui a écrit le lot
> `lot-R1-duel-et-classement` et demande-lui de corriger le 🔴 et le 🟠.
> Tu n'as rien d'autre à faire.
