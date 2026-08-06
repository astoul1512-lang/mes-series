# RAPPORT DE CORRECTIONS — Cycle 3, après relecture

**Date : 06/08/2026 · Application « Mes Séries » · branche `lot-f-cycle-3`**

Écrit pour être lu sans ouvrir le code. Il couvre les quatre corrections
demandées après la relecture, et la mise en service de la partie serveur.

---

## 1. Les quatre corrections

### C1 — Les renvois vers un rapport qui n'existait pas ✅

Deux fichiers disaient « voir RAPPORT.md », un fichier absent de la branche.
Les renvois sont remplacés par ce qui est vrai et vérifiable : pour la
navigation, le fichier de test explique désormais que la preuve **se rejoue**
— le même fichier lancé contre l'ancienne version échoue sur trois points et
passe entièrement sur celle-ci ; pour le suivi en retour, le commentaire
renvoie aux requêtes de contrôle écrites dans la migration et au présent
rapport, en précisant qu'un garde-fou automatique surveille la table des
abonnements.

Aucun rapport n'a été écrit au nom de l'agent précédent : on ne fabrique pas
la trace de quelqu'un d'autre.

**Ce qui le verrouille :** rien d'automatique — c'est de la documentation. Mais
plus aucun fichier de la branche ne renvoie à un document absent.

### C2 — Une série jamais diffusée n'annonce que sa première ✅

Une série de ta liste « à voir » qui n'a pas encore commencé à être diffusée
posait **toutes** ses dates déjà annoncées dans le calendrier. Elle n'en pose
plus qu'**une seule** : sa date de première, avec l'étiquette « Premier
épisode ». Les épisodes suivants réapparaîtront quand tu l'auras commencée.

Rien d'autre n'a bougé : les séries commencées gardent tous leurs prochains
épisodes sans étiquette, les séries en pause restent absentes, les films ne
changent pas, et une série « à voir » déjà diffusée reste exclue.

**Ce qui le verrouille :** le test qui existait a été **durci** — il se
contentait de vérifier que l'étiquette n'apparaissait qu'une fois, ce qui
laissait passer les épisodes suivants sans étiquette ; il exige maintenant une
seule ligne pour toute la série. Un second test, ajouté, vérifie le pendant
obligatoire : une fois la série commencée, elle retrouve bien tous ses
épisodes. Le durcissement est déclaré ici pour qu'une relecture future n'y voie
pas une réécriture de complaisance.

### C3 — Le bloc « X t'a ajouté » ne salue que les nouveaux ✅

Sans cette correction, la mise en service aurait fait surgir une annonce pour
**chaque** personne déjà abonnée depuis des mois. Le bloc ne s'affiche
désormais que pour les abonnements créés à partir du **6 août 2026**, date
écrite en clair dans le code avec l'explication de ce qu'elle est.

Pour y arriver, la date de création du lien — que la base fournissait déjà mais
que l'app jetait au passage — voyage maintenant jusqu'à l'écran.

**Ce qui ne change pas :** le bouton « Suivre » de la rangée reste pour **tous**
les abonnés non réciproques, anciens compris. Seul le bloc est limité, et
« Ignorer » continue de fermer le bloc sans toucher la rangée.

**Ce qui le verrouille :** trois tests — un ancien abonné n'ouvre aucun bloc
mais garde son bouton, un abonné du jour ouvre bien le sien, et quand les deux
coexistent seul le nouveau est annoncé. Un quatrième couvre le cas prudent :
une fiche sans date connue ne déclenche pas d'annonce.

### C4 — « Ignorer » suit le compte, plus l'appareil ✅

Ignorer une annonce sur le téléphone la faisait réapparaître sur la tablette.
Le choix monte maintenant au serveur avec le reste de tes données, et se
**fusionne** à la réception au lieu de s'écraser : pour chaque personne, la
décision la plus récente gagne, et une personne connue d'un seul appareil n'est
jamais perdue. C'est exactement la mécanique déjà employée pour tes avis.

**Le piège, signalé et non sur-corrigé :** un appareil resté sur l'ancienne
version envoie ses données **sans** cette liste. Selon l'ordre des
synchronisations, il peut l'effacer côté serveur. C'est transitoire — dès que
tous tes appareils sont à jour, le problème disparaît — et le pire cas est
bénin : un bloc réapparaît, « Ignorer » le referme. Le code a été écrit pour
que l'absence de la liste ne soit **jamais** interprétée comme « liste vidée ».

**Ce qui le verrouille :** trois tests — le choix part bien au serveur avec sa
date, la réception fusionne sans rien perdre et sans se déclarer modifiée quand
elle refait le même travail, et un envoi qui ne porte pas la liste ne vide pas
la nôtre.

---

## 2. La mise en service Supabase, étape par étape

Tout ce qui suit a été exécuté et constaté, pas supposé. Aucun secret n'a été
lu, affiché ni recopié : le secret du planificateur n'a été manipulé que par la
base elle-même.

**Les prérequis, vérifiés avant d'écrire quoi que ce soit :** les tables des
abonnements, des profils, des appareils et des secrets existent (migrations
001, 003 et 005 bien en place) ; la ligne du planificateur existe dans la table
des secrets ; les deux extensions nécessaires sont actives (`pg_cron` 1.6.4,
`pg_net` 0.20.4) ; la tâche planifiée « notifier » tourne toutes les deux
heures et est active. **État de départ de la table des abonnements : lecture et
suppression, aucune écriture** — la porte était bien fermée avant que je
commence.

**La migration 011 a été appliquée**, avec les vraies valeurs substituées au
moment de l'exécution seulement. **Le fichier du dépôt garde ses emplacements
vides**, comme le fait déjà la migration 005 : c'est la convention du projet.

**Elle a été appliquée une seconde fois**, et la promesse « rejouable » est
tenue : les deux fonctions ont exactement la même empreinte avant et après la
seconde exécution, il n'y a toujours qu'un seul déclencheur, et aucune
permission n'a changé. Personne n'avait encore vérifié ce point.

**La fonction `notifier` a été redéployée** (elle est passée en version 9), en
conservant son réglage d'authentification d'origine.

**Les vérifications, avec ce qu'elles ont répondu :**

- les deux fonctions serveur existent, le déclencheur existe et il est actif ;
- **aucune permission d'écriture sur la table des abonnements** : lecture et
  suppression, rien d'autre. C'est l'interdit central de tout ce lot, et il
  tient ;
- la fonction de suivi en retour est appelable par une personne connectée, et
  **pas** par un visiteur anonyme ;
- le déclencheur n'est appelable par personne, ni connecté ni anonyme : il
  n'existe que pour la base ;
- **le balayage des deux heures fonctionne toujours, et c'est vérifié sur un
  vrai tour.** Le tour automatique de 18 h 00, joué sur l'ancienne version,
  avait rendu « 1 personne, 0 annonce, 0 envoi, aucune erreur ». J'ai déclenché
  un tour complet après le redéploiement : réponse identique, code 200, aucune
  erreur. Le comportement est le même avant et après ;
- les conseillers de sécurité et de performance ne remontent **rien de nouveau**
  qui soit lié à cette migration. Le seul point qui apparaît est la mention,
  attendue, que la nouvelle fonction de suivi en retour est appelable par une
  personne connectée — c'est précisément à quoi elle sert, et c'est elle-même
  qui vérifie la réciprocité avant d'agir. Tous les autres avertissements
  existaient déjà avant ce lot.

**Une observation qui ne vient pas de moi, mais qui mérite d'être dite :** le
tour automatique de 16 h 00, deux heures avant mon intervention, s'est terminé
en dépassement de délai (5 secondes) sans réponse enregistrée. Les tours de
18 h 00 et celui que j'ai déclenché à 18 h 30 sont normaux. Ce n'est donc pas
un incident causé par ce lot, et le mécanisme est fait pour s'en remettre — un
tour manqué se rattrape au suivant. À surveiller si ça se répète.

**Effet immédiat, voulu et rappelé ici :** depuis l'application de la migration,
les notifications « X t'a ajouté » partent **pour de vrai** dès qu'un code est
saisi, avant même la sortie du front. C'est la décision prise, ce n'est pas un
défaut.

---

## 3. Le résultat des tests, que j'ai lancés moi-même

- **Suite complète : tout est vert — 288 tests**, contre 281 au départ. Sept
  tests ajoutés (deux pour C2, quatre pour C3, trois pour C4, moins un test
  existant durci plutôt que dupliqué), aucun test relâché.
- Les contrôles qui accompagnent la suite sont tous verts eux aussi :
  démarrage réel de l'application, collisions de noms entre les treize fichiers
  (1 034 déclarations), collisions de styles (479 noms), unicité des
  identifiants d'écran, données partagées, écran Découvrir, et le garde-fou qui
  refuse toute permission d'écriture sur la table des abonnements.
- **Navigation : tout est vert — 12 vérifications** jouées dans l'application
  réelle au navigateur, gestes tactiles compris.
- Le numéro de version vaut toujours **v86** dans les deux fichiers concernés.

---

## 4. Ce qu'il te reste à faire

1. **La mise en production du front.** C'est elle qui incrémentera le numéro de
   version. Rien de ce lot ne l'a fait à ta place.
2. **Les tests de bout en bout, à deux comptes et deux vrais téléphones** — ils
   ne peuvent pas être joués autrement. Ce sont les tests 1 à 5 du point 6 de
   la spécification : quelqu'un saisit ton code et voit « Tu suis maintenant
   Adrien » sans attente ; tu reçois « … t'a ajouté » ; sa ligne porte le bouton
   « Suivre » chez toi ; tu appuies et la réciproque se crée, les deux lignes
   affichant « Vous vous suivez » ; il reçoit « … t'a suivi en retour ».

---

## 5. Ce que je n'ai pas pu vérifier, et pourquoi

- **Le parcours complet de notification sur un vrai téléphone.** Il faut deux
  comptes réels et deux appareils avec les notifications acceptées. Je peux
  affirmer que la fonction d'envoi répond correctement et que le balayage
  complet fonctionne (tour réel observé), mais pas qu'une notification s'affiche
  sur ton écran verrouillé. C'est le point 4.2 ci-dessus.
- **Le déclencheur en conditions réelles.** Le faire partir demanderait de créer
  un vrai lien d'abonnement entre deux vrais comptes, donc d'envoyer une vraie
  notification à quelqu'un : je ne l'ai pas fait. Ce qui est vérifié : il
  existe, il est actif, il est correctement fermé aux appels extérieurs, et il
  est écrit pour ne jamais faire échouer un abonnement même si l'envoi échoue.
- **Le document de relecture lui-même.** L'ordre de mission le mentionne comme
  joint ; il ne m'est pas parvenu. J'ai travaillé à partir de la liste des
  corrections détaillée dans l'ordre de mission, qui décrit chaque constat, la
  décision prise et le résultat attendu. Si la relecture contenait une nuance
  absente de cette liste, elle n'a pas pu être prise en compte — je le signale
  plutôt que de le taire.
- **Le point 5 de la spécification** (la rangée d'IA dans Découvrir) reste hors
  périmètre, comme depuis le début. Rien de ce qui a été fait ici ne le gêne.
