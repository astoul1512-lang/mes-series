# RAPPORT — PHASE 2 DE LA GRANDE REVUE

**07/08/2026 · « Mes Séries » · base : `main` v87 · livraison : 6 fichiers modifiés + 1 fichier de tests ajouté, dans l'archive jointe.**

Périmètre arbitré par Adrien après lecture de la revue : les neuf constats « À corriger » (C1 à C9), y compris le bouton retour du téléphone (C3), plus le démarrage « cache d'abord + bandeau ». Le pilote de rendu sur « En cours » est un lot séparé, non commencé — voir la fin de ce rapport.

## L'état des tests

- **Suite complète : tout est vert — 288 tests**, plus les sept contrôles du lanceur (1 041 déclarations, aucune collision ; 47 identifiants d'écran, chacun à un seul fichier ; la porte des abonnements reste fermée).
- **Navigation cycle 3 : tout est vert — 12 vérifications**, inchangées, non assouplies.
- **Nouveau : `tests/phase2.js` — 18 vérifications, toutes vertes.** La preuve se rejoue, comme au cycle 3 : le même fichier lancé contre `main` v87 **échoue sur 11 vérifications** (le guetteur jamais retiré, la fiche revenue en haut, le casting contaminé, l'onglet Découvrir à tort, les deux navigations fantômes, le jeu perdu, la synchro qui redessine, le décodage manquant) ; lancé contre cette livraison, il passe entièrement.
- Aucun test existant n'a été modifié.

## Les interdits, vérifiés un à un

Version toujours **v87** dans `index.html` et `sw.js` (c'est toi qui incrémentes à la mise en production — et note que la mise en prod change `sw.js`, ce qui déclenchera précisément le nouveau bandeau chez tes utilisateurs). Icônes et `manifest.json` : intacts, à l'octet près. Aucune opération sur le dépôt : le clone local de `main` est resté vierge, tout le travail s'est fait sur une copie. Dossier `supabase/` intact, aucune permission touchée. Aucune valeur de filtre déplacée (le seul changement dans le fichier Recherche concerne l'ouverture et la fermeture du jeu). Chaque ligne changée porte en commentaire le numéro du constat qui la justifie.

## Constat par constat

**C1 — L'écran qui saute au retour : corrigé, démontré.** Le secours de fin de mouvement retire désormais le guetteur au lieu de le laisser posé, exactement comme le faisait déjà le correctif B10 trois cents lignes plus loin ; et un mouvement d'une carte à l'intérieur de l'écran ne peut plus terminer le geste à sa place. Mesuré avant : 3 gestes abandonnés → 3 guetteurs posés, 0 retirés, et l'écran d'arrivée démonté sous le doigt au retour suivant. Après : 3 posés, 3 retirés, et la couche d'arrivée ne disparaît qu'une fois l'écran d'arrivée réellement rendu. C'est le candidat le plus sérieux pour tes deux doutes du cycle 3.

**C2 — Les fiches reviennent en haut : corrigé.** Les fiches (série, film, aperçu) retiennent leur position, chacune la sienne, et la rendent **au retour uniquement** — une fiche ouverte à neuf part toujours du haut, et sa mémoire d'avant est oubliée à cet instant. Vérifié : position posée 1 200, rendue 1 200 au retour (avant : 0) ; ouverture neuve : 0.

**C3 — Le bouton du téléphone sortait de l'app : corrigé.** La feuille de filtres, le jeu de Recherche et la recherche plein écran du profil posent désormais une « entrée-garde » dans l'historique à leur ouverture. Le bouton du téléphone la consomme et **ferme l'état ouvert au lieu de quitter l'app** ; une fermeture dans l'app retire l'entrée proprement, sans appui fantôme. La flèche et le balayage connaissent aussi ces trois états maintenant (le balayage les refuse, comme il refuse déjà le duel ; la flèche les ferme). Vérifié dans le cas critique — entré sur l'onglet, zéro entrée derrière : avant, la page était réellement quittée ; après, la feuille se ferme et on reste sur Recherche. Sur un onglet nu **sans** rien d'ouvert, le bouton continue de sortir de l'app : c'est le comportement normal d'Android, il n'a pas été changé.

**C4 — Les navigations fantômes après un retour différé : corrigé.** Une navigation volontaire désarme le retour encore en vol (le secours de 900 ms ne redessine plus par-dessus), et le `popstate` retardataire qui finit par arriver est neutralisé au lieu de fermer l'écran ouvert. Vérifié en simulant le report comme le fait `tests/nav-cycle3.js` : l'écran ouvert par l'utilisateur reste affiché de bout en bout (avant : l'app changeait d'écran deux fois toute seule). Le cas nominal du cycle 3 — on ne touche plus à rien — est inchangé et toujours verrouillé par sa suite. Limite assumée, écrite dans le code : pendant les 2,5 s qui suivent ce cas rare, un vrai appui sur le bouton retour peut être absorbé une fois — le second appui agit. C'est le prix pour ne plus jamais fermer un écran sans raison.

**C5 — Le redessin non sollicité des 15 secondes : corrigé.** Une synchro silencieuse ne redessine plus rien, ni en succès ni en échec — sauf si la fusion a réellement rapporté des données d'un autre appareil, ou si l'écran Compte (le seul qui affiche l'état de synchro) est sous les yeux. Mesuré : 0 redessin dans les 25 s suivant une coche (avant : 1, exactement à +15 s). Une synchro visible continue de rendre.

**C6 — L'onglet allumé se trompait : corrigé.** Réglages, Mes goûts et Mes plateformes sont entrés dans la table (ils vivent sous Mon profil), et la provenance se remonte désormais de proche en proche : un film ouvert depuis la filmographie d'un acteur lui-même ouvert depuis « En cours » allume En cours. Vérifié : l'aperçu ouvert depuis Mes goûts allume « Mon profil » (avant : « Découvrir »).

**C7 — Le casting d'une fiche déteignait sur une autre : corrigé, en deux temps.** Le relevé fait en double pendant une navigation (le second lisait l'écran quitté sous le nom de l'écran d'arrivée) est supprimé ; et la mémoire des rangées des fiches est désormais **par fiche** — la clé nue `show`, partagée par toutes les séries, était l'autre moitié du bug, découverte en vérifiant le correctif. Vérifié : la fiche A s'ouvre avec son casting au début (avant : à la position de la fiche B).

**C8 — Les écritures qui bloquent l'écran : réduit.** Le recalcul de la vitrine (les 9 436 épisodes parcourus à chaque geste qui écrit) a rejoint le regroupement de 0,8 s : le geste de coche mesuré passe de ~43 ms à ~18–26 ms. Le filet `blur` — qui forçait une écriture synchrone de 1,2 Mo quand une bande-annonce prenait le focus ou qu'une notification passait — est retiré (mesuré : 111 ms → 0 ms) ; `visibilitychange` et `pagehide`, qui couvrent le vrai risque iOS, restent. **Ce qui n'est pas fait** : l'écriture elle-même (130–140 ms d'un bloc, 0,8 s après le dernier geste) n'a pas été découpée ni sortie du fil principal — c'est un chantier de fond (écriture par morceaux ou en tâche de fond), qui méritera son propre lot s'il gêne encore après ce train de correctifs.

**C9 — Les affiches : corrigé.** Le décodage en arrière-plan est demandé partout (la règle n'était appliquée qu'à 1 fabrique sur 18), et les cartes « À rattraper » demandent du `w500` au lieu du `w780` (≈ 1,4 Mo de mémoire d'image économisés par carte). Les bandeaux pleine largeur des fiches gardent leur `w780`, justifié par leur taille. L'effet réel sur les à-coups ne se mesurera que sur ton téléphone, avec de vraies affiches — le banc sert des images d'un pixel.

**Décision S10 — Démarrage « cache d'abord + bandeau » : fait.** Le service worker sert le cache immédiatement ; la fraîcheur passe par sa propre mise à jour, qui installe la nouvelle version **d'un bloc** (jamais de versions mélangées), puis un bandeau discret « Une nouvelle version est prête — Recharger » apparaît. Vérifié en conditions réelles sur le banc : pas de bandeau à la première installation ni aux relances ordinaires ; bandeau dès que le `sw.js` servi change ; et les 14 fichiers servis depuis le cache (0 octet réseau) aux relances. Mesuré : la relance ne dépend plus du réseau — **2,9 s → 1,3 s en 3G** ; en 4G l'écart était déjà faible sur le banc local, mais sur le vrai réseau (latences de CDN, couverture variable) le gain sera plus net que sur le banc. Le ~0,5–0,7 s restant est local (lire et préparer tes 1,2 Mo de données) — c'est lui que le pilote de rendu et un futur lot « démarrage » pourront attaquer. La première visite, elle, passe toujours par le réseau : rien à mettre en cache avant elle.

## Les chiffres avant/après (banc de la revue, processeur bridé ×4)

| Mesure | Avant (v87) | Après (livraison) |
|---|---|---|
| Guetteurs laissés par 3 gestes abandonnés | 3 | **0** |
| Retrait de la couche d'arrivée | pendant l'écran quitté | **après le rendu d'arrivée** |
| Position d'une fiche au retour | 0 (en haut) | **restaurée** |
| Casting fiche A après défilement sur B | 320 (contaminé) | **0** |
| Onglet depuis Mes goûts | Découvrir | **Mon profil** |
| Retour différé + navigation | 2 navigations fantômes | **écran conservé** |
| Bouton système, feuille ouverte, onglet nu | sortie de l'app | **feuille fermée, on reste** |
| Redessins non sollicités (25 s après une coche) | 1 | **0** |
| Geste de coche (médiane) | ~43 ms | **~18–26 ms** |
| Écriture forcée sur perte de focus | ~111 ms | **0 (retirée)** |
| Relance de l'app en 3G | 2,9 s | **1,3 s** |
| Réécriture complète d'un écran | inchangée | inchangée — **c'est le pilote, non commencé** |

## Ce qui n'est pas fait, et pourquoi

- **Le pilote de rendu sur « En cours »** (68 ms par redessin → objectif < 17 ms) : lot séparé, décidé mais volontairement non commencé — il se juge sur pièce, après que ce train de correctifs a été éprouvé sur ton téléphone.
- **Le découpage de l'écriture locale** (C8, seconde moitié) : non fait, dit ci-dessus.
- **Les signalements S1 à S9 de la revue** (avatar non contrôlé, course à l'ajout pendant une synchro, fusion de surface à l'import, etc.) : hors du périmètre arbitré, toujours ouverts, toujours documentés dans `REVUE.md`.
- **La vérification sur un vrai iPhone.** Tout ce rapport sort du même banc que la revue : navigateur de bureau bridé, images factices, gestes synthétiques. Les 18 vérifications de `tests/phase2.js` se rejouent chez toi en deux commandes (en tête du fichier) — mais le juge de paix, ce sont tes doigts sur ton téléphone, en particulier : le balayage de retour esquissé puis abandonné, la feuille de filtres + bouton retour sur Android, et la sensation générale après une soirée de cochage.
- **Le bandeau de mise à jour ne se verra en vrai qu'à ta PROCHAINE mise en production** (celle d'après celle-ci) : il faut qu'une version cache-d'abord soit déjà installée pour qu'il ait quelque chose à annoncer. Juste après la mise en prod de ce lot, les appareils encore en v87 « réseau d'abord » récupéreront la nouvelle version comme d'habitude, sans bandeau.

## Le contenu de l'archive

`app-01-noyau.js` (C5, C8) · `app-02-outils.js` (C1, C2, C3, C4, C7, C9) · `app-03-vues.js` (C2/C3-profil, C6, C9) · `app-08-reglages.js` (bandeau S10) · `app-12-recherche.js` (C3-jeu) · `sw.js` (cache d'abord S10) · `tests/phase2.js` (nouveau) · ce `RAPPORT.md`. Fichiers entiers, nommés comme dans le dépôt, à poser tels quels.
