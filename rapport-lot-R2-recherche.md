# Rapport de relecture — lot `lot-R2-recherche`

```
Perte de données possible : NON
Tests : 188 cas, 0 échec
Verdict : À CORRIGER D'ABORD
```

**Dépôt** `astoul1512-lang/mes-series` · branche `lot-R2-recherche` (commit `753bbc4`)
**Fichiers touchés** : `app-12-recherche.js`, `app.css`, `test.html` — rien d'autre.
**Spécification de référence** : `retours-v85.md`.

---

## Ce que j'ai vérifié moi-même, et qui tient

Pour que tu saches ce qui a vraiment été contrôlé et pas seulement lu :

- **Aucun risque de perte de données.** Le lot n'écrit rien de nouveau dans la
  base : pas une ligne ajoutée dans `db`, ni dans le stockage local, ni dans la
  synchronisation. Les deux seuls endroits qui écrivaient déjà (« Plus tard » et
  « Je l'ai déjà vu ») n'ont pas bougé, et leurs garde-fous sont intacts.
- **Les tests passent.** 188 cas, aucun échec, l'application démarre proprement,
  et aucun nom global n'entre en collision (841 déclarations contrôlées). Le lot
  ajoute lui-même 24 cas de test, un par décision.
- **Les huit recettes de séries ont été VRAIMENT remesurées.** Je les ai
  remesurées une par une contre le vrai catalogue : 436, 310, 246, 487, 371,
  183, 335, 133. **Les huit correspondent au chiffre écrit dans le code, à
  l'unité près** — et cinq d'entre elles diffèrent du chiffre de la spec, ce qui
  prouve que le travail a été refait et non recopié. Les huit tiennent dans la
  fourchette 50–500.
- **Les origines (« d'où ? ») ne tombent pas dans le piège de Terminator 2.**
  « Français » et « japonais » passent bien par la langue d'origine, « américain »
  et « européen » par le pays. Remesuré : français 450 (Léon, Intouchables, Le
  Cinquième Élément), américain 4 117, européen 574, japonais 307 (Demon Slayer,
  Chihiro). Seul « du reste du monde » (442) n'a pas pu être remesuré, le relais
  ayant refusé une adresse aussi longue.
- **La famille Séries ne rend plus d'animation asiatique, et garde bien les
  séries animées occidentales.** Vérifié sur le catalogue réel : *Rick et Morty*
  et *South Park* sont en anglais, ils restent ; *Doraemon* et *Détective Conan*
  sont en japonais et animés, ils partent. Le garde-fou est en place : si les
  résultats n'indiquent ni langue ni genre, on ne filtre pas plutôt que de vider
  l'écran.
- **Le cul-de-sac de « Peu importe » est bien fermé** (point 19). J'ai rejoué le
  parcours dans un navigateur : « + préciser » ouvre la liste complète, répondre
  « Peu importe » y ramène, et le critère y reste disponible. Je n'ai trouvé
  aucun chemin qui enferme encore, sur aucune famille.
- **Le balayage se comporte comme demandé** (point 6) : la carte suit le doigt,
  revient en place sous le seuil, et ne s'arme pas depuis les 40 premiers pixels
  du bord gauche.
- **Le retour depuis la fiche ramène la recherche intacte** (point 3) : la
  phrase et les résultats vivent dans un état qui survit à la navigation, et la
  position de défilement est mémorisée sous la clé de l'écran Recherche.
- **`trierParGout` rend toujours une liste de la même longueur** (point 13) : la
  nouvelle règle « pas plus de deux du même genre à la suite » réordonne sans
  rien retirer.
- **Le numéro de version n'a pas été touché**, ni dans `index.html` ni dans
  `sw.js`. Aucun fichier ajouté. La section CSS du lot est bien en fin de
  fichier, sous son nom, et ses six classes n'existent nulle part ailleurs.
- **La production Supabase n'est pas concernée** : le lot ne touche ni la base,
  ni les fonctions serveur. Rien à déployer de ce côté.

---

## Les points à corriger

### 🔴 1 — La recherche par un titre tapé reste bridée à 18, et le nouveau filtre la rabote encore

**Ce que c'est.** Adrien a posé une règle qui prime sur tout : « on ne limite
jamais le nombre de films affichés dans la partie recherche » (point 21). La
spec désigne nommément le seul endroit non conforme — la recherche par titre,
coupée à 18. **Ce plafond n'a pas été retiré.** Et le lot ajoute par-dessus un
retrait de résultats qui n'est jamais compensé.

**Où.** `app-12-recherche.js` ligne 68 (`const RECH_TITRES = 18`) et ligne 708.

**Ce qui se passe concrètement.**
- Onglet Recherche, puce **Séries**, il tape « Doraemon » : **aucun résultat**.
  Le titre existe, mais c'est une animation japonaise, et le nouveau filtre de
  famille la retire après réception. L'écran dit qu'il n'y a rien.
- Il tape « dragon » : au mieux 18 titres, souvent moins une fois les animés
  retirés, **et aucun bouton « Voir plus »**. Il n'a aucun moyen d'en voir
  davantage.

**Quoi faire.** Deux choses : (a) supprimer `RECH_TITRES` et charger la
recherche par titre par fournées avec un « Voir plus », exactement comme la
grille ; (b) ne pas appliquer le filtre de famille à un titre explicitement
tapé — quelqu'un qui écrit « Doraemon » cherche Doraemon. Le lot a déjà tenu ce
raisonnement pour « que je n'ai pas vu » ; il vaut aussi ici.

---

### 🟠 2 — Une page de catalogue sur sept n'est jamais demandée

**Ce que c'est.** Quand la grille doit lire plusieurs pages pour remplir une
fournée, elle retient comme point de reprise la page **suivante** au lieu de la
dernière page réellement lue. Le « Voir plus » repart donc un cran trop loin et
saute une page entière à chaque fois.

**Où.** `app-12-recherche.js` lignes 932 et 935.

**Ce qui se passe concrètement.** Je l'ai reproduit en simulant le catalogue :
puce Séries, la première fournée lit les pages 1 à 6 et affiche 36 séries ; il
appuie sur « Voir plus » et la suite repart **à la page 8**. La page 7 n'est
jamais lue — une vingtaine de séries disparaissent définitivement, et ça
recommence à chaque appui. Sur la puce **Tout**, c'est plus grave : mesuré, les
pages 3 à 7 du catalogue des séries sautent d'un seul coup, parce que les films
et les séries partagent un unique compteur de page alors qu'ils n'avancent pas
au même rythme.

C'est exactement ce que la règle du point 21 interdit : « Voir plus » doit
reprendre *exactement* où l'on s'est arrêté.

**Quoi faire.** Retenir la dernière page **effectivement lue** (et non la
suivante), et la retenir **par média** plutôt qu'en un seul compteur partagé
entre films et séries.

---

### 🟠 3 — Le jeu peut encore servir une carte hors demande : « une mini-série qui se finit »

**Ce que c'est.** Le point 4 exige qu'une source du jeu qui ne sait pas
respecter la demande rende un tas vide plutôt qu'une carte fausse. Le lot a bien
mis ce garde-fou en place pour la durée, les mots-clés et les plateformes. Mais
il a oublié le nouvel ingrédient qu'il vient lui-même d'introduire : « qui se
finit en une saison ».

**Où.** `app-12-recherche.js` ligne 1600 (`demandeAveugleRech`) et ligne 1633
(`respecteParamsRech`) ; la recette concernée est ligne 239.

**Ce qui se passe concrètement.** Puce **Séries**, ambiance **« Une mini-série
qui se finit »**, il lance 🎲 Jouer. J'ai vérifié dans le navigateur que le
contrôle laisse passer *Grey's Anatomy* — 21 saisons — sur une carte étiquetée
« Parce que tu as aimé … ». C'est le même défaut que les films d'1 h 45 servis
quand la phrase demandait « plus de 2 h 15 », simplement déplacé sur un autre
ingrédient.

**Quoi faire.** Ajouter `with_type` à la liste des demandes invérifiables de
`demandeAveugleRech`, à côté de `with_runtime` et `with_keywords` : une liste de
résultats ne dit pas si une série est une mini-série, donc les sources « Parce
que tu as aimé … » et « Vu par un proche » doivent se taire dans ce cas.

---

## Pour mémoire (rien à faire)

### ⚪ 4 — Deux comportements importants partent sans test

Le lot ajoute 24 cas de test, un par décision — c'est du bon travail. Mais le
balayage à la Tinder (point 6) et la règle « la Recherche ne plafonne jamais »
(point 21) n'en ont aucun. Ce sont justement les deux endroits où j'ai trouvé
des défauts.

### ⚪ 5 — Les trois boutons du jeu sont posés par-dessus l'affiche

Pour agrandir la carte, le lot a déplacé « Pas ce soir », « Plus tard » et « Ce
soir, c'est lui » **sur** la jaquette. C'est un choix défendable et bien
argumenté dans le code, mais la spec ne le demandait pas — elle demandait
seulement une carte plus grande. À regarder à l'œil avant de valider.

### ⚪ 6 — Une suppression au milieu de `app.css`

La règle maison veut que chaque lot écrive en fin de fichier. C'est le cas ici,
sauf pour la suppression de l'ancienne pastille « ✓ Déjà vu » (ligne 1302), qui
est au milieu. C'est justifié — le point 7 demandait justement de la retirer —
mais je le signale pour que la règle reste claire.

---

## En résumé

Le travail est sérieux et honnête : les chiffres annoncés sont vrais, je les ai
remesurés ; le cul-de-sac le plus handicapant est bien fermé ; rien ne menace
tes données. Il reste **une règle explicitement demandée qui n'a pas été
appliquée** (le plafond de 18), **une page de catalogue sur sept qui se perd**,
et **un trou dans le filtre du jeu**. Les trois se corrigent sans remettre le
lot en cause.

---

> Voici le rapport. Joins-le dans la conversation qui a écrit le lot
> `lot-R2-recherche` et demande-lui de corriger le 🔴 et les deux 🟠. Tu n'as
> rien d'autre à faire.
