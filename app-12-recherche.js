"use strict";
/* =========================== L'ONGLET RECHERCHE ===========================

   POURQUOI CET ÉCRAN A ÉTÉ REFAIT (lot B, chapitre 4 de la spec).

   La première version de cet onglet posait trois questions dans l'abstrait —
   un cadre, une humeur, « combien de temps t'as ? » — et ne montrait des
   jaquettes qu'après. C'est un formulaire déguisé : personne ne sait répondre
   à « quelle durée ? » avant d'avoir vu ce que ça change.

   Trois idées la remplacent, et elles tiennent toutes sur le même écran :

     · UNE GRILLE DE JAQUETTES qui est la matière de l'écran, pas sa
       conséquence. On peut y descendre et fouiller sans jamais rien remplir.
     · UNE PHRASE qu'on complète en tapant sur des mots. « Je veux un film
       comique français des années 90. » Elle n'est jamais vide : à l'ouverture
       elle porte déjà une proposition, parce que corriger est infiniment plus
       facile que créer — et ça enseigne la grammaire de l'écran en une seconde,
       sans un mot d'explication.
     · UN COMPTEUR VIVANT sous la phrase. 132 000 → 38 → 11. Voir son intention
       se resserrer sous ses yeux est le seul élément de jeu dont cette porte a
       besoin ; il n'y a pas de bouton « voir les résultats », ils sont déjà là.

   Plus une quatrième porte pour les soirs sans idée : LE JEU, une affiche à la
   fois, trois gestes.

   ------------------------------------------------------------------------
   LA RÈGLE CAPITALE DE CET ÉCRAN (§4.1).

   Découvrir sert à découvrir, Recherche sert à trouver. Ici c'est
   l'utilisateur qui commande, et LE PROFIL DE GOÛT TRIE LES RÉSULTATS, IL NE
   LES RETIRE JAMAIS. Qui demande des comédies françaises des années 90 les a
   toutes, y compris celles qui ne lui ressemblent pas. Le profil décide
   seulement laquelle remonte en premier. C'est vrai partout dans ce fichier —
   `trierParGout` réordonne, il ne filtre pas, et il rend la liste inchangée
   quand le profil est vide.

   Le jeu, lui, a le droit de filtrer : on lui demande UNE carte, pas une
   liste. Ses trois filtres implicites sont écrits au §4.7 et repris tels quels
   plus bas.

   ------------------------------------------------------------------------
   CE QU'ON EXPÉDIE À TMDB, ET POURQUOI SEULEMENT ÇA.

   Règle permanente du projet : on n'expédie jamais un paramètre dont le
   comportement n'a pas été mesuré en direct. Ce fichier n'utilise donc que
   `with_genres`, `without_genres`, `with_keywords`, `with_original_language`,
   `vote_average.gte`, `vote_count.gte`, les bornes de date, les plateformes —
   tous mesurés en production — et `with_runtime`, qui vient des recettes
   mesurées le 31/07 (voir le pavé de `RECH_AMBIANCES`).

   DEUX MOTS DE LA PHRASE MANQUENT VOLONTAIREMENT, et c'est signalé à Adrien
   plutôt que bricolé :

     · « pays » — `with_origin_country` n'a jamais été mesuré sur ce projet. On
       propose à la place la LANGUE D'ORIGINE (`with_original_language`), qui
       est mesurée et qui tourne en production depuis des semaines sur la puce
       Animés. Le mot dit donc « en français », pas « français » : c'est une
       langue, on ne fait pas semblant que c'est un pays.
     · « avec [acteur] » — `with_cast` n'a jamais été mesuré non plus. Le
       chemin acteur existe déjà et il est mesuré : on tape le nom dans le
       champ, la section « Personnes » ouvre sa filmographie (§4.3). Le mot
       reviendra dans la phrase le jour où `with_cast` aura été mesuré.
--------------------------------------------------------------------------- */

const RECH_MIN = 2;              // caractères avant de partir chercher
const RECH_ATTENTE = 320;        // frappe au repos avant la requête
const RECH_TITRES = 18;          // titres montrés sur un nom tapé
const RECH_GENS = 8;             // personnes montrées sur un nom tapé
const RECH_CIBLE = 42;           // taille d'une fournée de grille
const RECH_PAGES_MAX = 3;        // jamais plus de 3 requêtes pour remplir
/* Quand un retrait se fait chez nous (l'animation asiatique hors de « Séries »,
   la bibliothèque sur « que je n'ai pas vu »), une page de 20 peut n'en rendre
   que 12. On s'autorise alors quelques tours de plus — mais pas l'infini : au
   delà, c'est le quota qu'on brûle pour du défilement. */
const RECH_PAGES_TAMIS = 6;
const RECH_VOTES_MINI = 80;      // plancher de votes de la grille
const RECH_JEU_STOCK = 6;        // en dessous, une source va chercher la suite

let rechTimer = null, rechSeq = 0, rechAbort = null, grilleSeq = 0, jeuSeq = 0;

/* ============================== Les familles =============================
   Les quatre puces restent en haut, collantes (§4.4). Ce ne sont pas des
   filtres parmi d'autres : c'est le premier mot de la phrase, et c'est lui qui
   décide à quel point de terminaison de TMDB on parle. */
/* ===== POINT 14 — A1 : « Films » VEUT DIRE PRISES DE VUES RÉELLES =====

   Une cinquième puce, « Animation » : les films d'animation, TOUTES origines
   (contrairement à « Animés », qui est asiatique par définition). Les deux ne
   se recouvrent jamais — l'une ne rend que des films, l'autre que des séries.

   Et « Films » cesse de contenir l'animation, exactement comme « Séries »
   exclut déjà ce que « Animés » contient. Symétrie exacte, et c'est la
   décision d'Adrien du 02/08 : « si on a vu ça en A1 ça veut dire que non ça
   ne sort pas ».

   NAMING : « Animés » et « Animation » côte à côte sont proches à l'œil. On
   les garde parce qu'ils ne désignent pas la même chose et ne se recouvrent
   pas ; si la confusion se voit à l'usage, c'est un libellé à changer, pas une
   mécanique. */
const RECH_FAMILLES = [
  { id:'tout',  label:'Tout',   art:'quelque chose', nom:'titres' },
  { id:'film',  label:'Films',  art:'un film',  media:'movie', reel:true, nom:'films' },
  { id:'serie', label:'Séries', art:'une série', media:'tv',   nom:'séries' },
  { id:'anime', label:'Animés', art:'un animé', media:'tv', anime:true, nom:'animés' },
  { id:'animation', label:'Animation', art:"un film d'animation", media:'movie',
    animFilm:true, nom:"films d'animation" }
];
/* LOT R2 — points 16 et 20. LES QUATRE PUCES SE PARTAGENT LE CATALOGUE.
   « Animés » ne veut plus dire « japonais » mais « animation asiatique » :
   genre Animation ET langue d'origine japonaise, chinoise ou coréenne. Le OU
   sur la langue a été mesuré le 01/08 et il FONCTIONNE — sur `/discover/tv`
   avec le genre 16 et le plancher de 80 votes de la grille, `ja|zh|ko` rend
   737 titres contre 726 pour `ja` seul, soit les 9 chinois et 2 coréens qui
   franchissent ce plancher. Une seule requête, aucun tri à faire chez nous.

   (Les 86 chinois et 14 coréens annoncés dans la spec ont été relevés SANS
   plancher de votes : sans lui la Chine rend 2 420 séries d'animation et la
   Corée 453. C'est le plancher de la grille qui en écarte l'essentiel, pas la
   requête. Le fait est signalé à Adrien plutôt que corrigé au jugé.)

   Et « Séries » retire exactement ce que « Animés » contient — langue de cette
   liste ET genre Animation, les deux ensemble, jamais l'une seule. TMDB n'a pas
   de `without_original_language` : le retrait se fait chez nous, après
   réception, avec le même garde-fou que `garderAnimesRech`. */
const RECH_ANIME_LANGUES = ['ja','zh','ko'];
function familleRech(){ return RECH_FAMILLES.find(f => f.id === etatRech().fam) || RECH_FAMILLES[0]; }
/* « Tout » interroge les deux points de terminaison et entrelace. Partout
   ailleurs, un seul. */
function mediasRech(){ const f = familleRech(); return f.media ? [f.media] : ['movie','tv']; }
function mediaRech(){ return mediasRech()[0]; }

/* ======================= LES RECETTES, MESURÉES =======================

   Ces recettes ne sont PAS écrites ici : elles viennent de `recettes.md`, où
   chacune a été écrite puis mesurée contre le vrai catalogue le 31/07/2026,
   une par une. Le nombre en commentaire est le `total_results` relevé ce
   jour-là. Elles respectent les trois règles du §4.6 : au moins trois
   ingrédients, entre 50 et 500 titres, et si on ne sait pas l'écrire elle
   n'existe pas — c'est pour ça que « Pour regarder à deux » ne figure pas
   dans cette liste.

   NE PAS LES MODIFIER SANS LES REMESURER. Une recette ajustée « au jugé » ne
   se voit pas : elle rend simplement un écran moins bon, sans erreur.

   LA FORME, ET POURQUOI ELLE EST DÉCOUPÉE EN INGRÉDIENTS.

   §4.6 : « l'ambiance se déplie en phrase ». L'utilisateur doit VOIR la
   recette, en français, et pouvoir corriger. Chaque ingrédient porte donc son
   mot, et retirer le mot retire l'ingrédient de la requête. Ce qui n'a pas de
   mot — un plancher de votes, par exemple — vit dans `fond` : il reste
   invisible, il ne se déplie pas, et il ne doit jamais être le critère qui
   décide du résultat.

   `with_runtime` — LE POINT DOUTEUX, ET IL EST ASSUMÉ ICI PLUTÔT QUE CACHÉ.
   Ce paramètre a été mesuré FAUX le 29/07 sur les titres rendus (« moins de
   95 min » ramenait Les Infiltrés, 151 min), c'est ce qui a mis
   `DISC_DUREE_FIABLE` à `false` dans Découvrir. Les recettes du 31/07 s'en
   servent malgré tout, et leurs volumes ont été mesurés. Les deux mesures ne
   portent pas sur la même chose : l'une sur le nombre rendu, l'autre sur la
   justesse des titres. On expédie la recette telle qu'elle a été écrite —
   c'est la consigne — et le point est signalé dans le compte rendu. */
/* ===== POINTS 4, 14 ET 18 — CE QUI A CHANGÉ DANS CES RECETTES =====

   TROIS CHOSES, et toutes les trois ont été REMESURÉES le 02/08 contre le vrai
   catalogue avant d'être écrites. Le champ `mesure` porte le nouveau chiffre ;
   `mesureAvant` garde l'ancien, pour qu'on voie le déplacement.

   1. POINT 18 — À L'INTÉRIEUR D'UNE RECETTE, LES GENRES SE LISENT EN OU.
      `28,12` (Action ET Aventure) devient `28|12` (Action OU Aventure), et
      `27,53` devient `27|53`. C'est la demande d'Adrien, et ça élargit
      franchement les deux tuiles.

   2. POINT 4, LEVIER 1 — CHAQUE AMBIANCE DIT CE QU'ELLE REFUSE. Une ambiance
      promet une humeur, pas une étiquette : elle a donc le droit d'écarter ce
      qui trahit sa promesse. Le refus porte UN SEUL MOT dans la phrase dépliée
      même quand il cache plusieurs genres — « comique, sans drame, sans crime,
      sans thriller, sans horreur » est illisible. Retirer le mot lève tout le
      refus d'un coup. C'est la seule entorse à la correspondance
      un-mot-un-paramètre, et elle est assumée.

   3. POINT 14 — CE QUE CHAQUE AMBIANCE FAIT DE L'ANIMATION. Sous la puce
      « Films », le régime général est le REFUS (c'est la définition de A1).
      Trois traitements possibles, déclarés par `anim` :
        · absent      → refusée, le régime général ;
        · 'relegue'   → elle reste, en FIN DE CATALOGUE, par une seconde passe ;
        · 'garde'     → aucun traitement (la seule : « Un film en famille »,
                        exception demandée par Adrien pour Shrek et Kuzco).

   CE QUI EST SORTI DE LA FOURCHETTE 50–500, ET CE QUI A ÉTÉ FAIT — mesuré le
   02/08, signalé à Adrien avec le chiffre, jamais ajusté en silence :

     · `action` : 334 → **807** après le OU et les refus. Plancher de votes
       porté de 1 500 à 3 000 → **473**. La note n'est pas touchée : cette
       recette n'en a délibérément pas, son critère de qualité est la notoriété.
     · `peur`   : 365 → **1 937** après le OU (l'horreur OU le thriller, c'est
       un tout autre catalogue). Plancher de votes porté de 500 à 3 500 →
       **464**. La note reste à 6.

   Dans les deux cas le levier est le PLANCHER, jamais le retour au ET : la
   décision d'Adrien prime.

   EFFET DE BORD À SIGNALER, pas à corriger seul : « Ça fait peur » accueille
   désormais des thrillers sans horreur (Seven, Prisoners). Si ça ne convient
   pas, le correctif sera un refus de plus, pas un retour au ET. */
const RECH_AMBIANCES = [
  { id:'famille', t:'Un film en famille', mesure:491, mesureAvant:490, anim:'garde',
    /* LA SEULE ambiance où l'animation est la promesse même. Aucun refus,
       aucune relégation : Shrek et Kuzco y sont chez eux. Exception demandée
       explicitement par Adrien le 02/08. */
    ing:[ { cle:'genre', mot:'familial', p:{ with_genres:'10751', without_genres:'27,53,80,18' } },
          { cle:'duree', mot:'de moins de 2 h', p:{ 'with_runtime.lte':'115' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'6.3' } } ],
    fond:{ 'vote_count.gte':'500' }, genresProfil:['Familial','Aventure','Animation'] },

  { id:'rigoler', t:'Envie de rigoler', mesure:351, mesureAvant:456, anim:'relegue',
    /* La comédie dramatique est écartée : sans ça elle remonte en masse, et
       ce n'est pas ce qu'on demande quand on veut rigoler.
       LE CAS KILL BILL. Le genre principal NOMME, il ne retire rien : un titre
       étiqueté comédie chez TMDB continue de sortir d'un FILTRE « comédie ».
       Mais une AMBIANCE promet une humeur, et « rien de sombre » écarte le
       crime, le thriller et l'horreur. Shrek n'en porte aucun : il reste. */
    ing:[ { cle:'genre', mot:'comique', p:{ with_genres:'35', without_genres:'18' } },
          { cle:'refus', mot:'rien de sombre', p:{ __sans:'80,53,27' } },
          { cle:'duree', mot:'de moins de 2 h 05', p:{ 'with_runtime.lte':'125' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'6.5' } } ],
    fond:{ 'vote_count.gte':'1500' }, genresProfil:['Comédie'] },

  { id:'action', t:"De l'action sans prise de tête", mesure:473, mesureAvant:334,
    /* SEUL CAS SANS CONTRAINTE DE NOTE, et c'est délibéré : demander un film
       sans prise de tête en exigeant 7,5 de moyenne est contradictoire. Ici le
       critère de qualité, c'est la notoriété — et c'est donc lui, et lui seul,
       qu'on a resserré quand le OU a fait exploser le volume (1 500 → 3 000).
       Deadpool, Predator, Casino Royale et Jumanji ne portent aucun des genres
       refusés : ils restent, c'est vérifié titre par titre. */
    ing:[ { cle:'genre', mot:"plein d'action", p:{ with_genres:'28|12' } },
          { cle:'refus', mot:'rien de lourd', p:{ __sans:'18,10752,36' } },
          { cle:'duree', mot:'de moins de 2 h 05', p:{ 'with_runtime.lte':'125' } } ],
    fond:{ 'vote_count.gte':'3000' }, genresProfil:['Action','Aventure'] },

  { id:'peur', t:'Ça fait peur', mesure:464, mesureAvant:365,
    ing:[ { cle:'genre', mot:'qui fait peur', p:{ with_genres:'27|53' } },
          { cle:'refus', mot:'pas pour rire', p:{ __sans:'35' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'6' } } ],
    fond:{ 'vote_count.gte':'3500' }, genresProfil:['Horreur','Thriller'] },

  { id:'classique', t:"Un classique que j'ai raté", mesure:195, sansVus:true, anim:'relegue',
    /* En années glissantes, jamais en date fixe : sinon la recette vieillit
       toute seule. `dateMoins` est calculée à l'appel.
       LOT R2 — point 15a : `sansVus` EXCLUT LA BIBLIOTHÈQUE. La règle générale
       de l'écran — « on demande, on a tout, et ce qu'on a est marqué » — reste
       vraie partout ailleurs ; mais cette ambiance-là promet le contraire dans
       son nom, et un écran ne doit pas contredire son propre libellé. */
    ing:[ { cle:'epoque', mot:'sorti il y a plus de 15 ans', p:{ __ansAvant:15 } },
          { cle:'note',   mot:'très bien noté', p:{ 'vote_average.gte':'7.5' } } ],
    fond:{ 'vote_count.gte':'5000' }, genresProfil:[] },

  { id:'long', t:'Long et prenant', mesure:255, mesureAvant:256, anim:'relegue',
    ing:[ { cle:'duree', mot:'de plus de 2 h 15', p:{ 'with_runtime.gte':'135' } },
          { cle:'note',  mot:'très bien noté', p:{ 'vote_average.gte':'7.5' } } ],
    fond:{ 'vote_count.gte':'1000' }, genresProfil:[] },

  { id:'court', t:"Court, moins d'1 h 35", mesure:278, mesureAvant:433,
    /* Le documentaire squatte le créneau court. Et l'animation est refusée
       comme partout ailleurs sous Films : presque tous les dessins animés font
       moins de 95 minutes, c'est ce qui rendait cette tuile monochrome. */
    ing:[ { cle:'duree', mot:"de moins d'1 h 35", p:{ 'with_runtime.gte':'60', 'with_runtime.lte':'95' } },
          { cle:'refus', mot:'pas un docu', p:{ __sans:'99' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'6.8' } } ],
    fond:{ 'vote_count.gte':'1500' }, genresProfil:[] },

  { id:'reflechir', t:'Ça fait réfléchir', mesure:285, mesureAvant:327, anim:'relegue',
    /* Reléguée et non refusée : sans ça, cette ambiance perdrait Ghibli et
       Your Name, qui en sont la promesse même. Ils passent en fin de
       catalogue, ils ne disparaissent pas. */
    ing:[ { cle:'genre', mot:'qui fait réfléchir', p:{ with_genres:'18|878' } },
          { cle:'refus', mot:'pas une comédie', p:{ __sans:'35' } },
          { cle:'note',  mot:'très bien noté', p:{ 'vote_average.gte':'7.5' } } ],
    fond:{ 'vote_count.gte':'3000' }, genresProfil:['Drame','Science-Fiction'] },

  { id:'vraie', t:'Une histoire vraie', mesure:278, anim:'relegue',
    /* Reléguée, surtout pas refusée : Persépolis et Valse avec Bachir sont des
       histoires vraies animées. */
    ing:[ { cle:'genre', mot:'tiré du réel', p:{ with_keywords:'9672' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'6.8' } } ],
    fond:{ 'vote_count.gte':'800' }, genresProfil:['Histoire','Drame'] },

  { id:'docu', t:'Du vrai (documentaire)', mesure:302, genresProfil:['Documentaire'],
    ing:[ { cle:'genre', mot:'documentaire', p:{ with_genres:'99' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'7' } } ],
    fond:{ 'vote_count.gte':'150' } }
];

/* ============ LOT R2, POINT 17 — LES HUIT AMBIANCES DE SÉRIES ============

   `ambiancesRech()` rendait une liste vide pour Séries : aucune recette n'avait
   été mesurée, et la règle 3 du §4.6 est formelle — si on ne sait pas l'écrire,
   ça n'existe pas. De l'extérieur, ça ne se lisait pas comme une règle mais
   comme un écran cassé.

   LES HUIT ONT ÉTÉ REMESURÉES LE 01/08/2026, une par une, contre le vrai
   catalogue, sur `/discover/tv` et `language=fr-FR`. Le nombre en commentaire
   est le `total_results` relevé ce jour-là.

   Elles sont mesurées SANS `without_genres=16` : la spec l'avait relevé avec,
   et le point 16 le fait retirer — la famille « Séries » s'occupe désormais de
   l'exclusion, et elle le fait plus finement (langue ASIATIQUE **et**
   animation). Le garder ferait disparaître Rick et Morty des ambiances alors
   qu'il reste dans la grille, et les deux écrans se contrediraient.

   LES CHIFFRES ONT DONC MONTÉ, comme annoncé, et les huit tiennent dans la
   fourchette 50–500. « Envie de rigoler » est celle qui monte le plus (204 →
   487) et c'est la seule qui s'approche vraiment de la borne haute : signalée à
   Adrien, à resserrer si la rangée paraît molle.

   LES IDENTIFIANTS SONT PRÉFIXÉS `tv-`. Quatre libellés existent des deux
   côtés — rigoler, réfléchir, documentaire, classique — avec des recettes
   DIFFÉRENTES. Sans préfixe, une ambiance de film aurait survécu au passage sur
   Séries en changeant de recette en silence, ce qui est exactement le genre de
   glissement qu'on ne voit jamais. */
const RECH_AMBIANCES_TV = [
  { id:'tv-mini', t:'Une mini-série qui se finit', mesure:436,
    /* La plus utile des huit, et la seule qui n'existe qu'en séries :
       `with_type=2` est le seul ingrédient de tout le catalogue qui réponde à
       « je ne veux pas m'engager sur huit saisons ». */
    ing:[ { cle:'genre', mot:'qui se finit en une saison', p:{ with_type:'2' } },
          { cle:'note',  mot:'bien notée', p:{ 'vote_average.gte':'7' } } ],
    fond:{ 'vote_count.gte':'100' }, genresProfil:[] },

  { id:'tv-reflechir', t:'Ça fait réfléchir', mesure:307, mesureAvant:311,
    /* Point 4 — « pas pour les enfants » écarte Kids (10762), et garde Arcane
       et Bojack, qui sont la promesse même. L'animation, elle, RESTE : sur
       Séries elle est chez elle. */
    ing:[ { cle:'genre', mot:'qui fait réfléchir', p:{ with_genres:'18' } },
          { cle:'refus', mot:'pas pour les enfants', p:{ __sans:'10762' } },
          { cle:'note',  mot:'excellente', p:{ 'vote_average.gte':'8' } } ],
    fond:{ 'vote_count.gte':'500' }, genresProfil:['Drame'] },

  { id:'tv-docu', t:'Du vrai (documentaire)', mesure:246,
    ing:[ { cle:'genre', mot:'documentaire', p:{ with_genres:'99' } },
          { cle:'note',  mot:'bien notée', p:{ 'vote_average.gte':'7' } } ],
    fond:{ 'vote_count.gte':'50' }, genresProfil:['Documentaire'] },

  { id:'tv-rigoler', t:'Envie de rigoler', mesure:469, mesureAvant:487,
    /* Comme côté films, la comédie dramatique est écartée : sans ça elle
       remonte en masse, et ce n'est pas ce qu'on demande quand on veut rire.
       L'ANIMATION RESTE, et c'est écrit noir sur blanc dans le point 4 : Rick
       et Morty, South Park et Family Guy vivent ici, et Adrien ne les a pas
       condamnés. Ne pas ajouter `16` par symétrie apparente avec les films —
       les deux puces ne contiennent pas la même chose. */
    ing:[ { cle:'genre', mot:'comique', p:{ with_genres:'35', without_genres:'18' } },
          { cle:'refus', mot:'rien de sombre', p:{ __sans:'80' } },
          { cle:'note',  mot:'bien notée', p:{ 'vote_average.gte':'7' } } ],
    fond:{ 'vote_count.gte':'200' }, genresProfil:['Comédie'] },

  { id:'tv-imaginaire', t:"De l'imaginaire", mesure:371,
    /* 10765 = Sci-Fi & Fantasy ; 10762 = Kids, écarté parce que la moitié du
       genre est du dessin animé pour enfants et que ce n'est pas la demande. */
    ing:[ { cle:'genre', mot:"d'imaginaire", p:{ with_genres:'10765', without_genres:'10762' } },
          { cle:'note',  mot:'très bien notée', p:{ 'vote_average.gte':'7.5' } } ],
    fond:{ 'vote_count.gte':'400' }, genresProfil:['Science-Fiction','Fantastique'] },

  { id:'tv-enquete', t:'Une enquête', mesure:432, mesureAvant:183,
    /* POINT 18 — la virgule (ET) devient la barre (OU), à la demande d'Adrien :
       crime OU mystère. C'était le ET qui distinguait l'enquête du polar
       d'action ; ce garde-fou-là disparaît, et ce sont les refus et les
       planchers qui le remplacent.
       MESURÉ LE 02/08 : 183 → **575**, hors fourchette par le haut. Plancher de
       votes porté de 150 à 250 → **432**. Signalé à Adrien avec le chiffre.
       EFFET DE BORD SIGNALÉ, non corrigé seul : la tuile accueille désormais
       des séries policières d'action. */
    ing:[ { cle:'genre', mot:"d'enquête", p:{ with_genres:'80|9648' } },
          { cle:'refus', mot:'pas pour rire', p:{ __sans:'16,35' } },
          { cle:'note',  mot:'bien notée', p:{ 'vote_average.gte':'7' } } ],
    fond:{ 'vote_count.gte':'250' }, genresProfil:['Crime','Mystère'] },

  { id:'tv-action', t:"De l'action", mesure:136, mesureAvant:335,
    /* LE SEUL REFUS D'ANIMATION CÔTÉ SÉRIES, et il est demandé par Adrien.
       Il est conservé ici alors qu'il a été retiré des recettes de films :
       « Séries » garde l'animation occidentale, « Films » ne la contient plus.
       Ne pas remettre l'un ou retirer l'autre par symétrie apparente. */
    ing:[ { cle:'genre', mot:"d'action", p:{ with_genres:'10759' } },
          { cle:'refus', mot:"rien d'animé", p:{ __sans:'16,10762' } },
          { cle:'note',  mot:'très bien notée', p:{ 'vote_average.gte':'7.5' } } ],
    fond:{ 'vote_count.gte':'400' }, genresProfil:['Action','Aventure'] },

  { id:'tv-classique', t:"Un classique que j'ai raté", mesure:133, sansVus:true,
    /* En années glissantes comme son homologue films, jamais en date fixe. Et
       elle applique la règle 3a du point 15 : elle exclut la bibliothèque. */
    ing:[ { cle:'epoque', mot:'commencée il y a plus de 15 ans', p:{ __ansAvant:15 } },
          { cle:'note',   mot:'excellente', p:{ 'vote_average.gte':'8' } } ],
    fond:{ 'vote_count.gte':'800' }, genresProfil:[] }
];

/* Les sous-genres d'animé, mesurés le 31/07 eux aussi. `recettes.md` les avait
   écrits pour l'étape « style » de l'inscription (§5.6) ; ils servent ici de
   mot « genre ou ambiance » quand la famille Animés est choisie, parce que
   c'est exactement le même besoin : le genre TMDB ne dit littéralement rien
   d'un animé, tout y est étiqueté « Animation + Action & Aventure ».

   « shonen » a DEUX orthographes dans TMDB (`shounen` et `shonen`) : les deux
   sont demandées en OU, sinon on perd la moitié du catalogue. Ça ne se devine
   pas, c'est mesuré.

   Les volumes ci-dessous ont été relevés sur `with_original_language=ja` seul.
   La famille Animés ajoute par-dessus le genre Animation (c'est sa
   définition) : les nombres réels sont donc un peu plus bas. */
const RECH_ANIMES = [
  { id:'shonen',   mot:'shōnen',         mots:'207826|378884', mesure:542 },
  { id:'seinen',   mot:'seinen',         mots:'195668',        mesure:389 },
  { id:'shoujo',   mot:'shōjo',          mots:'206437',        mesure:194 },
  { id:'isekai',   mot:'isekai',         mots:'237451',        mesure:188 },
  { id:'mecha',    mot:'mecha',          mots:'10046',         mesure:376 },
  { id:'tranche',  mot:'tranche de vie', mots:'9914',          mesure:841 },
  { id:'psy',      mot:'psychologique',  mots:'272553|12565',  mesure:190 },
  { id:'dark',     mot:'dark fantasy',   mots:'177895',        mesure:66  },
  { id:'sport',    mot:'sport',          mots:'6075',          mesure:174 }
];

/* ========================= LES MOTS DE LA PHRASE =========================
   Chaque mot est une puce. On tape, une courte liste s'ouvre, on choisit — ou
   « peu importe » pour le retirer. L'ordre est libre, rien n'est obligatoire,
   et on ne voit jamais sept champs vides : seulement la phrase qui marche
   déjà, et un « + préciser » pour l'affiner. */

/* ============ LOT R2, POINTS 14 ET 18 — « EN QUELLE LANGUE » DEVIENT « D'OÙ »

   *Américain* n'est pas une langue, et personne ne cherche « un film en
   danois » : on cherche D'OÙ VIENT LE FILM. La question posée n'était pas celle
   qu'on se pose. Cinq réponses au lieu de neuf, et une liste à part sur les
   animés (point 18 révisé par le point 20 : l'origine y est un vrai choix
   depuis que la famille s'est ouverte à l'animation asiatique).

   LE PIÈGE, ET IL A ÉTÉ REVÉRIFIÉ LE 01/08. `with_origin_country=FR` rend 517
   films… dont Terminator 2 : TMDB compte tous les pays de production, et une
   participation financière suffit. Pour « français » et « japonais », c'est donc
   LA LANGUE D'ORIGINE qui est le bon critère, et son haut de liste est honnête —
   mesuré : Léon, Intouchables, Le Cinquième Élément, Anatomie d'une chute pour
   le français ; Demon Slayer, Chihiro, Chainsaw Man, Your Name, Le Château
   ambulant pour le japonais.
   Dans l'autre sens la langue seule ne suffit pas : `en` ramènerait le
   Royaume-Uni et l'Australie, `es` le Mexique et l'Argentine. Pour « américain »
   et « européen », le PAYS est nécessaire.

   « DU RESTE DU MONDE » — la liste restait à établir, la voici, et voici
   pourquoi elle CROISE le pays ET la langue, comme « américain ».
   · Sur le pays seul, la même mécanique de coproduction remonte des films
     américains : mesuré, la liste de pays seule rend 734 films et sort *War
     Machine* dans les premiers. C'est le piège de Terminator 2, à l'envers.
   · Sur la langue seule, on perd toute l'Amérique latine (l'espagnol et le
     portugais ramèneraient l'Espagne et le Portugal, qui sont « européen ») :
     369 films, sans Parasite… mais surtout sans Amores Perros ni Cité de Dieu.
   · Croisés, les deux se corrigent : 442 films mesurés, et le haut de liste est
     honnête — Parasite, Shaolin Soccer, Ne Zha 2, Dernier train pour Busan.

   LA RÈGLE DES 50–500 NE S'APPLIQUE PAS ICI. Elle a été écrite pour les
   ambiances, qui sont des recettes complètes. Une origine est un INGRÉDIENT,
   toujours combiné au reste de la phrase : « américain » à 4 117 n'est pas un
   défaut, c'est un grand pays. Ne pas confondre les deux règles. */
const RECH_PAYS_EUROPE = 'GB|DE|IT|ES|BE|NL|SE|DK|NO|FI|PL|PT|IE|AT|CH|CZ|GR|RO|HU|IS';
const RECH_PAYS_MONDE  = 'KR|IN|CN|HK|TW|TH|BR|MX|AR|CL|CO|PE|RU|UA|TR|EG|MA|DZ|ZA|NG|IL|IR|LB|PH|ID|VN|MY|SG|PK|BD';
const RECH_LANGUES_MONDE = 'es|pt|ko|zh|cn|hi|ta|te|ml|kn|bn|mr|ur|th|vi|id|ms|tl|fa|ar|he|tr|ru|uk';

const RECH_ORIGINES = [
  { id:'fr',    mot:'français',          mesure:450,
    p:{ with_original_language:'fr' } },
  { id:'us',    mot:'américain',         mesure:4117,
    p:{ with_origin_country:'US', with_original_language:'en' } },
  { id:'eu',    mot:'européen',          mesure:574,
    p:{ with_origin_country:RECH_PAYS_EUROPE } },
  { id:'ja',    mot:'japonais',          mesure:307,
    p:{ with_original_language:'ja' } },
  { id:'monde', mot:'du reste du monde', mesure:442,
    p:{ with_origin_country:RECH_PAYS_MONDE, with_original_language:RECH_LANGUES_MONDE } }
];
/* Sur les animés, l'origine prend les trois valeurs de la famille et pas une de
   plus : proposer « en danois » sur une famille qui n'accepte que trois
   origines donnait sept réponses fausses sur neuf. */
const RECH_ORIGINES_ANIME = [
  { id:'ja', mot:'japonais', p:{ with_original_language:'ja' } },
  { id:'zh', mot:'chinois',  p:{ with_original_language:'zh' } },
  { id:'ko', mot:'coréen',   p:{ with_original_language:'ko' } }
];
function originesRech(){ return familleRech().anime ? RECH_ORIGINES_ANIME : RECH_ORIGINES; }
function origineRech(id){ return originesRech().find(o => o.id === id) || null; }
const RECH_EPOQUES = [
  { id:'2020s', mot:'depuis 2020',      de:'2020-01-01', a:'2099-12-31' },
  { id:'2010s', mot:'des années 2010',  de:'2010-01-01', a:'2019-12-31' },
  { id:'2000s', mot:'des années 2000',  de:'2000-01-01', a:'2009-12-31' },
  { id:'1990s', mot:'des années 90',    de:'1990-01-01', a:'1999-12-31' },
  { id:'1980s', mot:'des années 80',    de:'1980-01-01', a:'1989-12-31' },
  { id:'avant', mot:"d'avant 1980",     de:'1900-01-01', a:'1979-12-31' }
];
/* La durée n'a de sens que pour un film : celle d'une série, c'est celle d'un
   épisode, et personne ne cherche « une série de moins d'1 h 30 ». */
const RECH_DUREES = [
  { id:'court',  mot:"de moins d'1 h 30", p:{ 'with_runtime.gte':'1', 'with_runtime.lte':'90' } },
  { id:'moyen',  mot:'de moins de 2 h',   p:{ 'with_runtime.gte':'1', 'with_runtime.lte':'120' } },
  { id:'long',   mot:'de plus de 2 h',    p:{ 'with_runtime.gte':'120' } }
];
const RECH_NOTES = [
  { id:'6', mot:'correct',         v:6   },
  { id:'7', mot:'bien noté',       v:7   },
  { id:'8', mot:'très bien noté',  v:7.5 }
];

/* L'ordre dans lequel les mots s'écrivent dans la phrase. Il n'est pas l'ordre
   dans lequel on les pose — ça, c'est libre — mais l'ordre dans lequel ils se
   LISENT : « un film comique français des années 90 de moins de 2 h ». */
const RECH_MOTS = [
  { cle:'genre',   titre:'Genre ou ambiance' },
  { cle:'origine', titre:"D'où ?" },
  { cle:'epoque',  titre:'De quand ?' },
  { cle:'duree',   titre:'Combien de temps ?' },
  { cle:'note',    titre:'Exigeant ?' },
  /* LOT R2 — point 15b. Un mot de plus, demandé par Adrien, applicable à
     n'importe quelle recherche : « Je veux un film comique QUE JE N'AI PAS VU ».
     Il ne part pas à TMDB — TMDB ne connaît pas ta bibliothèque — le retrait se
     fait chez nous, après réception. */
  { cle:'pasvu',   titre:'Déjà vu ou pas ?' },
  { cle:'plate',   titre:'Où tu regardes ?' }
];

/* ================================ L'état ================================
   Séparé de `ui.disc` : la vitrine et la recherche sont deux moteurs, et
   mélanger leurs états est la faute que §E1 avait déjà réparée une fois. */
function etatRech(){
  if(!ui.rech) ui.rech = {
    fam:'film',
    q:'', qtitres:[], qgens:[], qloading:false, qerr:'',
    /* La phrase. `amb` est une ambiance mesurée ; `sans` liste les ingrédients
       qu'on lui a retirés à la main. Les autres clés sont les mots explicites. */
    /* POINT 6 — cinq critères sont désormais des TABLEAUX. `note` et `pasvu`
       restent uniques : un plancher ne se cumule pas, un binaire non plus. */
    amb:null, sans:[], genre:[], origine:[], epoque:[], duree:[], note:null,
    pasvu:null, plate:[],
    total:null, res:[], page:1, pages:1, loading:false, err:'', charge:false,
    /* `touche` : la personne a-t-elle composé quelque chose elle-même ? La
       proposition du jour ne compte pas — voir `nouvelleOuvertureRech`. */
    touche:false, reprise:null,
    jeu:null
  };
  return ui.rech;
}
function rechTexte(){ return (etatRech().q || '').trim(); }
function enRechercheTitre(){ return rechTexte().length >= RECH_MIN; }

/* ---------------- La phrase entre deux sessions (§4.8) ----------------
   REMISE À ZÉRO À CHAQUE OUVERTURE. Un filtre qu'on a oublié avoir posé est
   l'une des pires sources de confusion : on rouvre Recherche trois jours plus
   tard, la grille est presque vide, et on ne comprend pas pourquoi — parce que
   « des années 90 » traîne encore.

   Comment on reconnaît une ouverture SANS toucher à `go()`, qui n'est pas dans
   le périmètre de ce lot : on POSE UN MARQUEUR sur `params`.

   La première version comparait l'IDENTITÉ de l'objet `params`, et c'était
   faux : le bouton retour matériel d'Android et celui du navigateur passent
   par `popstate`, qui reconstruit `params` depuis l'historique — un objet neuf
   à chaque fois. La phrase composée était donc jetée sur ces deux chemins-là,
   alors qu'elle survivait à la flèche de l'app et au balayage. Défaut trouvé
   en relecture.

   Le marqueur, lui, est recopié dans l'état d'historique au moment où
   `inscrireHistorique` l'écrit — donc il revient avec `params` quel que soit
   le chemin de retour. Et il est absent quand on entre depuis la barre du bas,
   qui appelle `go('search')` sans paramètres : c'est exactement là, et
   seulement là, qu'on veut repartir d'une phrase fraîche.

   L'ordre le permet : `go()` fait `render()` — donc ce marqueur — AVANT
   d'appeler `inscrireHistorique`. */
function ouvertureRech(){
  /* Pendant le geste de retour, l'écran d'arrivée est dessiné UNE FOIS dans la
     couche du dessous, avec `view` et `params` empruntés le temps du rendu
     (`htmlDeLaVue`, app-03). Ce n'est pas une ouverture, c'est un aperçu : le
     traiter comme une ouverture jetterait la phrase sous le doigt. */
  if(typeof glisseRetour === 'object' && glisseRetour && typeof glisseRetour.enCours === 'function'
     && glisseRetour.enCours()) return false;

  /* ===== POINT 8 — REVENIR D'UNE FICHE EST UN RETOUR, PAS UNE OUVERTURE =====

     « C'est pas pratique d'être ramené tout en haut de la page. » — Adrien.
     Et ce n'était pas qu'une position perdue : LA PHRASE ÉTAIT JETÉE. La preuve
     était à l'écran — la puce « ↩ Reprendre : un animé sport » apparaissait, et
     la phrase affichée disait autre chose. Or cette puce ne s'écrit que dans
     `nouvelleOuvertureRech`, au moment de sauvegarder une phrase qu'on
     remplace : le retour était donc traité comme une OUVERTURE. Et
     `nouvelleOuvertureRech` remet aussi la grille à zéro, d'où la position
     perdue : il n'y avait plus rien à défiler.

     LE MARQUEUR `params.rechOuvert` NE SUFFISAIT PAS. Il se perdait sur
     certains chemins — la vidéo du 01/08 le montre : le premier retour, depuis
     une fiche de la bibliothèque (`show`), gardait la position ; le second,
     depuis l'aperçu d'un titre inconnu (`preview`), la perdait. Deux écrans qui
     ne se referment pas par le même chemin, un marqueur qui voyage dans
     `params` et qui se perd sur l'un des deux.

     ON NE MARQUE DONC PLUS RIEN : on DEMANDE à la navigation d'où l'on vient.
     `arriveeNeuve('search')` (app-02) rend faux dès que le dernier `go()` était
     un retour — flèche de l'app, geste de glissement, bouton matériel
     d'Android, `popstate`. Les QUATRE chemins passent par là, et il n'y a plus
     rien à perdre en route. La puce « ↩ Reprendre » sert de témoin au test :
     si elle apparaît au retour d'une fiche, le défaut est revenu.

     Les fournées supplémentaires reviennent elles aussi : `r.res` ET l'état des
     flux (`r.flux`) vivent dans `ui.rech`, qui survit à la navigation. Restaurer
     une position dans une grille qui aurait rétréci ne ramènerait nulle part. */
  if(typeof arriveeNeuve === 'function' && !arriveeNeuve('search')) return false;

  /* ON ÉTAIT DÉJÀ SUR RECHERCHE. Réappuyer machinalement sur l'onglet où l'on se
     trouve ne doit pas jeter la phrase composée. Le DOM le dit sans qu'on ait à
     tenir un état de plus : quand cette fonction s'exécute, `render()` n'a pas
     encore remplacé l'écran, et l'ancien est toujours là. */
  const dejaLa = !!(document.getElementById('rres') || document.getElementById('rjeu'));
  return !dejaLa;
}
function nouvelleOuvertureRech(){
  const r = etatRech();
  /* Rien n'est perdu : le travail précédent reste sous la main, une puce
     discrète propose de le reprendre.
     ELLE NE S'AFFICHE QUE SI ON A VRAIMENT COMPOSÉ QUELQUE CHOSE. Compter la
     proposition du jour comme un choix faisait apparaître « ↩ Reprendre » avec
     la phrase déjà à l'écran, mot pour mot : une porte de sortie qui ne mène
     nulle part apprend à ignorer les portes de sortie. */
  const avant = phraseTexte();
  if(avant && r.touche)
    /* Les cinq critères multiples sont des TABLEAUX : on en garde une COPIE,
       sinon la reprise pointerait sur la liste qu'on est en train de vider. */
    r.reprise = { texte:avant, fam:r.fam, amb:r.amb, sans:r.sans.slice(),
                  genre:listeRech('genre'), origine:listeRech('origine'),
                  epoque:listeRech('epoque'), duree:listeRech('duree'),
                  plate:listeRech('plate'), note:r.note, pasvu:r.pasvu };
  r.q = ''; r.qtitres = []; r.qgens = []; r.qerr = '';
  r.amb = null; r.sans = []; r.genre = []; r.origine = [];
  r.epoque = []; r.duree = []; r.note = null; r.pasvu = null; r.plate = [];
  r.jeu = null;
  r.touche = false;
  phraseDuJour();
  r.res = []; r.total = null; r.page = 1; r.pages = 1; r.charge = false; r.err = '';
}
function reprendreRech(){
  const r = etatRech(), v = r.reprise;
  if(!v) return;
  r.fam = v.fam; r.amb = v.amb; r.sans = v.sans.slice();
  r.genre = (v.genre||[]).slice(); r.origine = (v.origine||[]).slice();
  r.epoque = (v.epoque||[]).slice(); r.duree = (v.duree||[]).slice();
  r.plate = (v.plate||[]).slice(); r.note = v.note; r.pasvu = v.pasvu;
  r.reprise = null;
  r.touche = true;
  relancerRech();
}

/* LA PHRASE N'EST JAMAIS VIDE (§4.5). À l'ouverture elle porte déjà une
   proposition plausible. On prend une AMBIANCE mesurée plutôt qu'un assemblage
   improvisé : elle est garantie de rendre entre 195 et 490 titres, et elle
   montre d'un coup d'œil que les mots bleus se tapent.

   Elle change chaque jour, comme le reste de l'app (§3.9) : la graine est la
   date, donc stable dans la journée et différente demain. Et elle penche vers
   les genres retenus du profil quand il y en a — sans jamais s'y enfermer. */
function grainePhraseRech(){
  const s = todayISO();
  let h = 0;
  for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function phraseDuJour(){
  const r = etatRech();
  /* POINT 11 — les goûts déclarés sont désormais RANGÉS PAR FAMILLE. Cette
     fonction pose `r.fam = 'film'` deux lignes plus bas, et toutes les recettes
     mesurées sont des films : la famille n'est pas à deviner. */
  const gouts = (typeof genresRetenus === 'function') ? genresRetenus('film') : [];
  const proches = RECH_AMBIANCES.filter(a => (a.genresProfil||[]).some(g => gouts.indexOf(g) >= 0));
  const source = proches.length ? proches : RECH_AMBIANCES;
  const a = source[grainePhraseRech() % source.length];
  r.fam = 'film';                       // toutes les recettes mesurées sont des films
  r.amb = a.id; r.sans = [];
}

/* ============================== Les gestes ============================== */

function setFamRech(id){
  const r = etatRech();
  if(r.fam === id) return;
  r.fam = id;
  /* Une ambiance de film n'a aucun sens sur les séries, un sous-genre d'animé
     aucun sur les films : plutôt que de traîner un réglage invisible qui
     filtrerait la grille sans que rien ne le dise, on le retire. Le reste de
     la phrase — langue, époque, note, plateforme — vaut pour toutes les
     familles et survit. */
  if(r.amb && !ambianceRech(r.amb)){ r.amb = null; r.sans = []; }
  r.genre = []; r.touche = true;
  /* La durée ne veut rien dire hors d'un film — et « Animation » en est un. */
  if(!familleRech().media || familleRech().media !== 'movie') r.duree = [];
  /* LOT R2 — l'origine n'a pas la même liste sur les animés (japonais, chinois,
     coréen) que partout ailleurs. Une origine qui n'existe plus dans la nouvelle
     famille est retirée, exactement comme l'ambiance : un réglage invisible qui
     filtrerait la grille sans que rien ne le dise est la faute qu'on évite. */
  r.origine = listeRech('origine').filter(id2 => !!origineRech(id2));
  relancerRech();
}

/* La liste des ambiances disponibles pour la famille en cours.
   LOT R2 — point 17 : Séries en a désormais huit, mesurées le 01/08. Seule
   « Tout » reste sans ambiance, et pour la même raison qu'avant : une recette
   qui vaudrait à la fois pour les films et pour les séries n'a jamais été
   écrite ni mesurée, et la règle 3 du §4.6 est formelle. */
function ambiancesRech(){
  const f = familleRech();
  if(f.anime) return RECH_ANIMES;
  if(f.id === 'film')  return RECH_AMBIANCES;
  if(f.id === 'serie') return RECH_AMBIANCES_TV;
  return [];
}
function ambianceRech(id){ return ambiancesRech().find(a => a.id === id) || null; }

/* Poser une ambiance remplit plusieurs mots d'un coup, puis reste modifiable :
   on n'est jamais enfermé dedans. Elle prend la place du genre explicite —
   deux façons de dire le genre en même temps ne veut rien dire. */
function poserAmbianceRech(id){
  const r = etatRech();
  const f = familleRech();
  /* Toutes les ambiances mesurées sont des films : taper « Envie de rigoler »
     depuis « Séries » bascule sur Films plutôt que de ne rien faire. */
  if(!f.anime && RECH_AMBIANCES.some(a => a.id === id)) r.fam = 'film';
  r.amb = (r.amb === id) ? null : id;
  r.sans = []; r.genre = []; r.touche = true;
  if(r.amb){ r.duree = []; r.note = null; }   // l'ambiance les porte déjà
  relancerRech();
}
/* Retirer un ingrédient d'une recette. C'est le point qui rend l'ambiance
   honnête : ce n'est pas une boîte noire, c'est un raccourci, et on sait quel
   mot enlever si le résultat déplaît. */
function retirerIngredientRech(cle){
  const r = etatRech();
  if(r.sans.indexOf(cle) < 0) r.sans.push(cle);
  r.touche = true;
  /* Une recette dont on a retiré tous les mots n'est plus une recette. */
  const a = ambianceRech(r.amb);
  if(a && (a.ing||[]).every(i => r.sans.indexOf(i.cle) >= 0)){ r.amb = null; r.sans = []; }
  relancerRech();
}
function poserMotRech(cle, val){
  const r = etatRech();
  /* Point 19, règles 3 et 4 : venu de la liste, on y retourne — que l'on ait
     choisi une valeur ou répondu « Peu importe ». Le drapeau est relevé AVANT
     `closeSheet`, qui le remet à zéro en jouant la fermeture. */
  const versListe = rechAjout;
  /* POINT 6 — sur un critère multiple, poser un mot le BASCULE : on coche et on
     décoche, comme les genres de Découvrir. « Peu importe » (val nulle) vide le
     critère entier, c'est ce que le mot veut dire. */
  if(estMultiRech(cle)){
    if(val == null) r[cle] = [];
    else{
      const l = listeRech(cle);
      const i = l.map(String).indexOf(String(val));
      if(i >= 0) l.splice(i, 1); else l.push(val);
      r[cle] = l;
    }
  }else r[cle] = val;
  r.touche = true;
  /* Un mot explicite l'emporte sur l'ingrédient de même nature : on ne peut
     pas demander « bien noté » et « très bien noté » à la fois. */
  if(val != null && r.amb && r.sans.indexOf(cle) < 0){
    const a = ambianceRech(r.amb);
    if(a && (a.ing||[]).some(i => i.cle === cle)) r.sans.push(cle);
  }
  if(cle === 'genre' && val != null && listeRech('genre').length){ r.amb = null; r.sans = []; }
  /* Répondre ne laisse plus la question « libre » : on l'a remplie. */
  const iL = rechLibres.indexOf(cle);
  if(iL >= 0 && aMotRech(cle)) rechLibres.splice(iL, 1);
  /* CONSÉQUENCE TECHNIQUE OBLIGATOIRE DU POINT 5, ET ELLE N'EST PAS FACULTATIVE.
     `poserMotRech` fermait la feuille puis la rouvrait. Sous B1 la feuille RESTE
     OUVERTE et se REDESSINE SUR PLACE : sinon chaque réponse joue une animation
     de fermeture, ce qui est exactement la famille de défauts du point 7.
     `openSheet` sait déjà redessiner une feuille ouverte en conservant sa
     position de lecture — la mécanique existe, il fallait cesser de passer par
     la fermeture. */
  relancerRech();
  if(versListe) ouvrirAjoutRech(versListe === 2);
  else if(estMultiRech(cle)) ouvrirMotRech(cle);      // on peut en cocher un second
  else ouvrirCritereSuivantRech(cle);                 // un plancher, un binaire : on avance
}
/* La première question encore libre, ou la première tout court si tout est
   posé — on n'ouvre jamais rien de vide, et on ne ferme pas non plus la porte. */
function ouvrirPreciserRech(){
  rechLibres = [];
  const libres = critLibresRech();
  const file = fileCriteresRech();
  ouvrirMotRech((libres.length ? libres[0] : file[0]).cle);
}
function viderRech(){
  const r = etatRech();
  clearTimeout(rechTimer); avorterRech();
  r.q = ''; r.qtitres = []; r.qgens = [];
  r.amb = null; r.sans = []; r.genre = []; r.origine = [];
  r.epoque = []; r.duree = []; r.note = null; r.pasvu = null; r.plate = [];
  r.touche = true;
  relancerRech();
}
function relancerRech(){
  const r = etatRech();
  /* SECONDE CONSÉQUENCE TECHNIQUE OBLIGATOIRE DU POINT 5, et elle vaut aussi
     pour le point 7 : `relancerRech` VIDAIT LA GRILLE (`r.res = []`) AVANT de
     la remplir. Tant que la grille était cachée sous un voile à 60 %, ça ne se
     voyait pas ; montrée — et Adrien a demandé « est-ce que l'on pourrait voir
     en transparence les films changer » — elle ferait un trou noir à chaque mot
     posé. LES AFFICHES PRÉCÉDENTES RESTENT DONC À L'ÉCRAN JUSQU'À L'ARRIVÉE DES
     NOUVELLES. C'est la même correction que le clignotement du point 7, faite
     d'un seul geste avec lui et pas deux fois.
     Ce n'est pas gratuit en apparence seulement : la requête est DÉJÀ envoyée à
     chaque mot posé, c'est elle qui alimente le compteur. Montrer les affiches
     qui changent derrière la feuille ne coûte aucune requête supplémentaire.
     `charge` reste vrai : c'est lui qui empêche `viewRecherche` de relancer un
     chargement en croyant l'écran neuf. */
  r.total = null; r.page = 1; r.pages = 1; r.err = '';
  r.flux = null;
  oublierDefil('search');
  /* LES CRITÈRES RESTENT SOUS LA MAIN PENDANT LA PARTIE (§4.7) — encore
     faut-il qu'ils fassent quelque chose. Le paquet a été constitué avec
     l'ancienne demande : le remettre à zéro est la seule façon que la carte
     suivante obéisse à ce qu'on vient de demander.
     `ecartes` est conservé : ce qu'on a déjà écarté ce soir le reste. */
  if(r.jeu){
    r.res = [];
    r.jeu.carte = null; r.jeu.i = 0; r.jeu.vues = 0; r.jeu.fini = false;
    r.jeu.fiche = null; r.jeu.plates = null; r.jeu.err = ''; r.jeu.loading = true;
    render();
    tirerCarteRech();
    return;
  }
  /* La feuille est peut-être ouverte : on repeint la ZONE des résultats plutôt
     que l'écran entier, sans quoi le rendu la refermerait sous les doigts. */
  if(document.getElementById('rres')) peindreRech();
  else render();
  chargerGrilleRech();
}

/* ====================== Le champ : titres ET personnes ======================
   Deux sections SÉPARÉES (§4.3), parce que taper sur un titre et taper sur une
   personne ne font pas la même chose : le titre ouvre une fiche, la personne
   ouvre sa filmographie. Mélangés, on ne sait jamais ce qui va se passer.
   Ordre fixe : les titres d'abord, c'est le cas le plus fréquent. */
function saisieRech(v){
  const r = etatRech();
  const avant = enRechercheTitre();
  r.q = v;
  clearTimeout(rechTimer); avorterRech();
  if(enRechercheTitre() !== avant){ oublierDefil('search'); window.scrollTo(0,0); }
  if(!enRechercheTitre()){
    r.qtitres = []; r.qgens = []; r.qloading = false; r.qerr = '';
    peindreRech(); return;
  }
  r.qloading = true; r.qerr = '';
  peindreRech();
  rechTimer = setTimeout(lancerTitre, RECH_ATTENTE);
}
function lancerTitre(){
  clearTimeout(rechTimer);
  if(!enRechercheTitre()) return;
  const r = etatRech();
  r.qloading = true; r.qerr = ''; peindreRech();
  chercherTitre(rechTexte());
}
function avorterRech(){
  if(rechAbort){ try{ rechAbort.abort(); }catch(e){} rechAbort = null; }
}
async function chercherTitre(q){
  const r = etatRech();
  const seq = ++rechSeq;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  rechAbort = ctrl;
  const sig = ctrl ? { signal:ctrl.signal } : null;
  try{
    /* La frontière Séries / Animés se trace sur le genre Animation : les deux
       familles ont donc besoin de la table des genres avant de tamiser. */
    if(familleRech().anime || familleRech().id === 'serie') await chargerGenres('tv');
    if(seq !== rechSeq) return;
    /* UNE SEULE REQUÊTE pour les deux sections. `/search/multi` rend les
       titres ET les personnes, et c'est le seul chemin de recherche de
       personnes que le relais accepte (`/search/person` n'est pas dans sa
       liste blanche, et cette liste vit dans une fonction déployée qui n'est
       pas dans ce dépôt). Une requête au lieu de trois, en prime. */
    const d = await tmdb('/search/multi', { query:q, include_adult:'false' }, sig);
    if(seq !== rechSeq) return;
    const brut = d.results || [];
    const médias = mediasRech();
    let titres = brut
      .filter(x => x && x.poster_path && (x.title || x.name) &&
                   médias.indexOf(x.media_type) >= 0)
      .map(x => Object.assign({ __media:x.media_type }, x))
      .sort((a,b)=>(b.popularity||0)-(a.popularity||0));
    /* POINT 14, VALIDÉ LE 02/08 — UN TITRE TAPÉ N'EST JAMAIS RETIRÉ.
       La puce filtre ce qu'on PARCOURT, pas ce qu'on NOMME. Le seul tri qui
       reste ici est celui du MÉDIA (une série ne sort pas sous « Films » : ce
       ne sont pas les mêmes objets), et il est fait juste au-dessus. Ni le
       genre Animation, ni la langue d'origine ne retirent quoi que ce soit :
       taper « Shrek » sous Films le rend, taper « Naruto » sous Séries le rend.
       « Que je n'ai pas vu » ne s'applique pas non plus — quelqu'un qui tape un
       titre le cherche, et le lui cacher parce qu'il l'a déjà vu serait une
       réponse à côté de la question. */
    r.qtitres = titres.slice(0, RECH_TITRES);
    r.qgens = brut
      .filter(x => x && x.media_type === 'person' && x.name && x.profile_path)
      .slice(0, RECH_GENS);
    r.qloading = false; r.qerr = '';
    peindreRech();
  }catch(e){
    if((e && e.name === 'AbortError') || seq !== rechSeq) return;
    r.qloading = false; r.qtitres = []; r.qgens = [];
    r.qerr = (e.message === 'BADKEY') ? 'Service indisponible' : 'Pas de connexion';
    peindreRech();
  }
}
/* ============ LE TAMIS DE LA FAMILLE, DES DEUX CÔTÉS DE LA FRONTIÈRE ============

   La famille Animés est ASIATIQUE et animée par définition ; la famille Séries
   est tout le reste de `/discover/tv`. TMDB ne sait ni filtrer `/search`, ni
   exprimer « pas (asiatique ET animation) » — il n'existe pas de
   `without_original_language`. Les deux retraits se font donc chez nous, après
   réception.

   LE GARDE-FOU EST LE MÊME DANS LES DEUX SENS, et il compte autant que le
   filtre : si les résultats ne portent pas la langue et les genres, ON NE
   FILTRE PAS plutôt que de vider l'écran. Un écran vide sans explication est
   pire qu'un écran un peu trop large. */
function estAnimeRech(x, anim){
  return !!(x && anim != null && Array.isArray(x.genre_ids) && x.genre_ids.indexOf(anim) >= 0 &&
            typeof x.original_language === 'string' &&
            RECH_ANIME_LANGUES.indexOf(x.original_language) >= 0);
}
function utilisablesRech(res){
  return res.every(x => x && typeof x.original_language === 'string' && Array.isArray(x.genre_ids));
}
function garderAnimesRech(res){
  if(!familleRech().anime) return res;
  const anim = genreParNom('tv','Animation');
  if(anim == null || !utilisablesRech(res)) return res;
  return res.filter(x => estAnimeRech(x, anim));
}
/* POINT 16 — « Séries » retire exactement ce que « Animés » contient. Rick et
   Morty, Teen Titans Go!, South Park et Arcane RESTENT : ce sont des séries
   animées occidentales, aucune autre puce ne peut les accueillir, et les rendre
   introuvables aurait été un défaut plus grave que celui qu'on corrige. */
function retirerAnimesRech(res){
  if(familleRech().id !== 'serie') return res;
  const anim = genreParNom('tv','Animation');
  if(anim == null || !utilisablesRech(res)) return res;
  return res.filter(x => !estAnimeRech(x, anim));
}
/* POINT 15b — « que je n'ai pas vu », et les ambiances qui promettent la même
   chose dans leur nom. TMDB ne sait pas filtrer sur une bibliothèque : le
   retrait est forcément ici. */
function sansVusDemandeRech(){
  const r = etatRech(), a = ambianceRech(r.amb);
  /* La promesse est portée par le NOM de l'ambiance, pas par l'un de ses
     ingrédients : tant que « Un classique que j'ai raté » est à l'écran, elle
     tient, même si l'on a retiré un mot de la recette. */
  return !!(r.pasvu === 'non' || (a && a.sansVus));
}
function garderPasVusRech(res){
  if(!sansVusDemandeRech()) return res;
  return res.filter(x => !chezSoiRech(x));
}
/* Le tamis complet d'une fournée : la famille, puis la bibliothèque. C'est le
   seul point de passage — grille, champ de recherche et jeu l'appellent tous,
   ce qui garantit que les trois disent la même chose. */
function tamiserRech(res){
  return garderPasVusRech(retirerAnimesRech(garderAnimesRech(res)));
}
/* Un retrait côté client fait qu'une page de 20 peut n'en rendre que 16 : le
   compteur de TMDB ne peut alors plus être annoncé comme un chiffre exact. On
   ne l'invente pas et on ne le cache pas — on dit « moins de ». */
function tamisActifRech(){
  return familleRech().id === 'serie' || sansVusDemandeRech();
}
/* ===== POINT 14 — LA PUCE FILTRE CE QU'ON PARCOURT, PAS CE QU'ON NOMME =====

   `tamiserRech` est le point de passage unique de la grille, DU CHAMP DE
   RECHERCHE et du jeu. En l'état, taper « Shrek » sur la puce Films ne rendrait
   plus rien — exactement comme « Naruto » sur Séries aujourd'hui. Réaction
   d'Adrien : « ça par contre c'est pas normal ».

   Le champ de recherche sort donc du tamis de famille ; la grille et le jeu y
   restent. Taper « Shrek » sous Films le rend, taper « Naruto » sous Séries le
   rend aussi — c'est une correction assumée du point 16 des retours v85, parce
   que sans elle les puces se contrediraient entre elles. */
/* (Il n'y a donc PAS de tamis de famille sur le champ : `chercherTitre` ne
   filtre plus que sur le média, et c'est tout.) */
function chezSoiRech(x, media){
  const m = media || x.__media || mediaRech();
  return !!(m === 'tv' ? db.shows[x.id] : db.movies[x.id]);
}
/* Une personne ouvre sa filmographie — le chemin existe déjà et il est mesuré
   (`/person/{id}/combined_credits`). */
function ouvrirPersonneRech(id){
  if(typeof ouvrirActeur === 'function') ouvrirActeur(id);
}

/* ========================= La requête de la grille =========================
   Un seul assemblage sert au compteur et à la grille : ils doivent dire la
   même chose, sinon le compteur ment. */
function dateMoinsRech(ans){
  const d = new Date();
  d.setFullYear(d.getFullYear() - ans);
  return d.toISOString().slice(0,10);
}
/* Les ingrédients d'ambiance encore actifs — c'est-à-dire non retirés à la
   main, et non recouverts par un mot explicite. */
function ingredientsRech(){
  const r = etatRech(), a = ambianceRech(r.amb);
  if(!a) return [];
  return (a.ing||[]).filter(i => r.sans.indexOf(i.cle) < 0);
}
/* ================== LES MOTS MULTIPLES — POINT 6 ==================

   Cinq critères acceptent désormais PLUSIEURS valeurs : le genre, l'origine,
   l'époque, la durée et la plateforme. Deux restent uniques, et ce n'est pas un
   oubli :

     · « Exigeant ? » est un PLANCHER (`vote_average.gte`). Cocher « correct »
       ET « très bien noté » revient à cocher « correct » : le multiple n'y veut
       rien dire. On garde le choix unique.
     · « Déjà vu ou pas ? » est binaire.

   L'état porte donc un TABLEAU pour les cinq premiers. `listeRech` est le seul
   point de lecture : elle accepte aussi bien l'ancienne forme (une valeur
   simple) qu'un tableau, pour qu'une phrase reprise depuis `r.reprise` ou une
   session ouverte pendant la mise à jour ne casse rien. */
const RECH_MULTI = ['genre','origine','epoque','duree','plate'];
function estMultiRech(cle){ return RECH_MULTI.indexOf(cle) >= 0; }
function listeRech(cle){
  const v = etatRech()[cle];
  if(v == null || v === '') return [];
  return (Array.isArray(v) ? v : [v]).filter(x => x != null && x !== '');
}
/* La première valeur, pour tout ce qui n'a besoin que d'une (le libellé court
   d'une puce, par exemple). */
function unRech(cle){ const l = listeRech(cle); return l.length ? l[0] : null; }
function aMotRech(cle){
  return estMultiRech(cle) ? listeRech(cle).length > 0 : etatRech()[cle] != null;
}

/* ============ LE MOTEUR MULTI-FLUX — POINTS 6, 13 ET 14 ============

   LA GRILLE CESSE D'ÊTRE « UNE REQUÊTE PAGINÉE » POUR DEVENIR UNE LISTE DE
   FLUX. C'est une seule mécanique, écrite une seule fois, avec deux régimes —
   et surtout PAS deux moteurs jumeaux, qui auraient chacun le même bug à
   corriger deux fois.

   · EN SÉQUENCE (points 13 et 14) — l'étage suivant ne démarre qu'une fois le
     précédent ÉPUISÉ, page après page. C'est ce qui met vraiment l'animation
     et le reste du monde « à la fin du catalogue » et non « à la fin de chaque
     fournée » : réordonner 42 titres déjà reçus ne peut pas produire un ordre
     global, il faut deux requêtes.
   · EN UNION (point 6) — les flux d'un même étage se consomment EN PARALLÈLE,
     entrelacés, pour que « français ou américain » ne rende pas deux cents
     français puis deux cents américains.

   L'ORDRE DES ÉTAGES QUAND LES DEUX RELÉGATIONS SE COMBINENT, et il est écrit
   noir sur blanc dans le point 14 — la forme prime sur l'origine, par cohérence
   avec le tableau de priorité du point 4 :

     1. prises de vues réelles, 13 langues
     2. prises de vues réelles, reste du monde
     3. animation, 13 langues
     4. animation, reste du monde

   CE QUE LE MOTEUR CHOISIT TOUT SEUL, ET QUI NE SE VOIT JAMAIS. Aucune
   combinaison n'est refusée à l'écran : on coche ce qu'on veut, partout, et
   jamais l'app ne dit non. Elle prend le chemin le moins cher :

     | Ce qui est coché                                   | Chemin        | Compteur   |
     | plusieurs genres, plusieurs plateformes            | une requête   | exact      |
     | tranches d'époque/durée jointives ou emboîtées     | une requête   | exact      |
     | tranches disjointes (90s + 2010s)                  | deux flux     | « moins de »|
     | origines de même nature (français + japonais)      | une requête   | exact      |
     | origines de nature différente (français+américain) | deux flux     | « moins de »|

   POURQUOI « FRANÇAIS OU AMÉRICAIN » NE TIENT PAS DANS UNE REQUÊTE. Une origine
   n'est pas un paramètre, c'en est deux : `français` = `with_original_language
   =fr`, mais `américain` = `with_origin_country=US` ET `with_original_language
   =en`. Or TMDB fait un ET entre paramètres différents et un OU seulement à
   l'intérieur d'un paramètre. `language=fr|en` ET `country=US` rendrait les
   américains seuls, les français perdus en silence. La route du pays pur a été
   mesurée et elle échoue : `with_origin_country=FR` rend 517 films dont
   *Terminator 2* — une participation financière suffit. On fusionne donc deux
   requêtes chez nous, et AUCUNE valeur de `RECH_ORIGINES` n'est touchée.

   LE COMPTEUR. Sur une union, le total exact n'existe pas : les deux jeux
   peuvent se recouper (une coproduction franco-américaine). L'app sait déjà
   dire « moins de » quand un tamis fausse le compte : c'est cette
   convention-là qu'on réutilise, et uniquement dans ce cas. Sur une séquence,
   le compteur reste EXACT — les étages partitionnent le même ensemble, ils ne
   le recoupent pas.

   LES DOUBLONS. L'entrelacement écarte un titre déjà rendu par un autre flux,
   sur `id` + `__media`, comme le fait déjà le paquet du jeu. */

/* Les treize langues d'Occident, empruntées à Découvrir — une seule liste pour
   toute l'app. */
function langues13Rech(){
  return (typeof LANGUES_OCCIDENT !== 'undefined') ? LANGUES_OCCIDENT : ['en','fr'];
}
function estOccidentRech(x){
  const l = x && x.original_language;
  return !l || langues13Rech().indexOf(l) >= 0;
}

/* Le socle : ce que TOUTE requête de la grille porte, quelle que soit sa
   décomposition. C'est l'ancien `paramsRech` moins tout ce qui se décompose. */
function paramsSocleRech(media){
  const r = etatRech(), f = familleRech();
  const p = { include_adult:'false', page:'1', sort_by:'popularity.desc' };
  p['vote_count.gte'] = String(RECH_VOTES_MINI);
  const champDate = media === 'movie' ? 'primary_release_date' : 'first_air_date';

  /* 1. La famille. Pour les animés, la langue et le genre Animation sont la
     DÉFINITION du cadre, pas une préférence. */
  if(f.anime){
    p.with_original_language = RECH_ANIME_LANGUES.join('|');
    const anim = genreParNom('tv','Animation');
    if(anim != null) p.with_genres = String(anim);
  }
  /* La puce « Animation » : films, genre 16, TOUTES origines. */
  if(f.animFilm){
    const anim = genreParNom('movie','Animation');
    if(anim != null) p.with_genres = String(anim);
  }

  /* 2. L'ambiance mesurée. Ses paramètres sont recopiés tels quels — sauf le
     REFUS, qui n'est pas un paramètre TMDB mais un mot portant plusieurs
     identifiants : il vient s'ajouter au `without_genres` déjà posé. */
  const a = ambianceRech(r.amb);
  if(a){
    if(a.mots){                                   // sous-genre d'animé
      p.with_keywords = a.mots;
    }else{
      ingredientsRech().forEach(i => {
        Object.keys(i.p).forEach(k => {
          if(k === '__ansAvant') p[champDate+'.lte'] = dateMoinsRech(i.p[k]);
          else if(k === '__sans') ajouterSansRech(p, i.p[k]);
          else p[k] = i.p[k];
        });
      });
      Object.assign(p, a.fond || {});
    }
  }

  /* 3. Les mots explicites qui ne se décomposent jamais. */
  const no = RECH_NOTES.find(x => x.id === r.note);
  if(no){
    p['vote_average.gte'] = String(no.v);
    /* Trier ou filtrer par la note EXIGE un plancher de votes, sinon un 10/10
       à trois voix passe devant tout. C'est la même constante que Découvrir. */
    p['vote_count.gte'] = String(Math.max(RECH_VOTES_MINI, DISC_VOTES_MINI));
  }
  const plates = platesChoisiesRech();
  if(plates.length){
    /* `with_watch_providers` accepte le OU nativement : plusieurs plateformes
       tiennent en une requête, gratuitement. */
    p.with_watch_providers = plates.join('|');
    p.watch_region = REGION_PLATO;
    p.with_watch_monetization_types = 'flatrate';
  }
  return p;
}

/* Un refus s'AJOUTE à ce qui est déjà écarté, il ne le remplace pas. Tout reste
   en virgules — `without_genres` est une liste d'exclusions, elles se cumulent
   toutes. */
function ajouterSansRech(p, ids){
  const l = String(p.without_genres || '').split(',').filter(x => x);
  String(ids || '').split(',').forEach(id => { if(id && l.indexOf(id) < 0) l.push(id); });
  if(l.length) p.without_genres = l.join(',');
}

/* ===== LES GENRES POSÉS À LA MAIN =====

   Plusieurs genres se disent en une requête, en OU : `with_genres='28|12'`.
   Découvrir le fait déjà et c'est mesuré.

   SAUF sur les deux familles qui posent DÉJÀ un genre — « Animés » (Animation)
   et « Animation » (Animation). Là il faudrait écrire « 16 ET (28 OU 12) », et
   TMDB ne sait pas l'exprimer : mélanger la virgule et la barre fait ignorer en
   silence tout ce qui suit la barre. C'est mesuré, et remesuré le 02/08 —
   `with_genres=18|878,16` rend NEUF titres, exactement comme `18,16` : le
   `878` disparaît sans un mot. On décompose donc en autant de flux que de
   genres, ce que le moteur d'union sait déjà faire. */
function genresPosesRech(media){
  return listeRech('genre').map(nom => genreParNom(media, nom)).filter(id => id != null);
}
function variantesGenreRech(media, socle){
  const ids = genresPosesRech(media);
  if(!ids.length) return [ {} ];
  if(socle.with_genres){
    /* La famille impose déjà un genre : un flux par genre demandé, en ET. */
    return ids.map(id => ({ with_genres: socle.with_genres + ',' + id }));
  }
  return [ { with_genres: ids.join('|') } ];
}

/* ===== LES ORIGINES =====

   On regroupe par SIGNATURE de paramètres : deux origines qui n'emploient que
   `with_original_language` fusionnent en une requête (`fr|ja`) ; dès que les
   paramètres diffèrent, il faut un flux par groupe. */
function variantesOrigineRech(){
  const ids = listeRech('origine');
  if(!ids.length) return [ {} ];
  const groupes = {};
  ids.forEach(id => {
    const o = origineRech(id);
    if(!o) return;
    const cles = Object.keys(o.p).sort().join('+');
    if(!groupes[cles]) groupes[cles] = [];
    groupes[cles].push(o.p);
  });
  const sortie = [];
  Object.keys(groupes).forEach(cles => {
    const l = groupes[cles];
    if(l.length === 1){ sortie.push(Object.assign({}, l[0])); return; }
    /* Même signature : les valeurs de chaque paramètre se fondent en OU. */
    const fusion = {};
    Object.keys(l[0]).forEach(k => {
      const vals = [];
      l.forEach(p => String(p[k] || '').split('|').forEach(v => {
        if(v && vals.indexOf(v) < 0) vals.push(v);
      }));
      fusion[k] = vals.join('|');
    });
    sortie.push(fusion);
  });
  return sortie.length ? sortie : [ {} ];
}

/* ===== LES INTERVALLES : ÉPOQUE ET DURÉE =====

   Ce sont des bornes (`…date.gte/lte`, `with_runtime.gte/lte`), et TMDB n'en
   accepte QU'UNE. Deux tranches qui se touchent ou s'emboîtent se fondent sans
   rien perdre : les années 2000 + les années 2010 = 2000 → 2019 ; « moins d'1 h
   30 » + « moins de 2 h » = moins de 2 h, l'un contient l'autre.

   DEUX TRANCHES SÉPARÉES, NON. « Des années 90 ou des années 2010 » ne peut
   pas se demander en une fois, et prendre l'enveloppe 1990–2019 ferait entrer
   les années 2000 en douce — un mensonge silencieux, donc exclu. On fait deux
   flux, et le compteur passe à « moins de ». */
function fusionnerIntervallesRech(bornes){
  const l = bornes.slice().sort((a,b)=> (a.de < b.de ? -1 : a.de > b.de ? 1 : 0));
  const out = [];
  l.forEach(b => {
    const d = out.length ? out[out.length-1] : null;
    /* Jointives ou emboîtées : le début du suivant ne dépasse pas la fin du
       précédent, à un jour près pour les dates et à zéro près pour les durées. */
    if(d && String(b.de) <= String(d.aPlusUn != null ? d.aPlusUn : d.a)){
      if(String(b.a) > String(d.a)){ d.a = b.a; d.aPlusUn = b.aPlusUn; }
    }else out.push(Object.assign({}, b));
  });
  return out;
}
function variantesEpoqueRech(champDate){
  const ids = listeRech('epoque');
  if(!ids.length) return [ {} ];
  const bornes = ids.map(id => RECH_EPOQUES.find(x => x.id === id)).filter(x => x)
    .map(e => ({ de:e.de, a:e.a, aPlusUn: joursApresRech(e.a, 1) }));
  if(!bornes.length) return [ {} ];
  return fusionnerIntervallesRech(bornes).map(b => {
    const o = {}; o[champDate+'.gte'] = b.de; o[champDate+'.lte'] = b.a; return o;
  });
}
/* « 2019-12-31 » + 1 jour = « 2020-01-01 » : c'est ce qui rend deux décennies
   successives JOINTIVES et non disjointes. Sans ce décalage d'un jour, les
   années 2010 et les années 2020 partiraient en deux requêtes pour rien. */
function joursApresRech(iso, n){
  const d = new Date(String(iso) + 'T00:00:00Z');
  if(isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0,10);
}
function variantesDureeRech(media){
  if(media !== 'movie') return [ {} ];
  const ids = listeRech('duree');
  if(!ids.length) return [ {} ];
  const bornes = ids.map(id => RECH_DUREES.find(x => x.id === id)).filter(x => x).map(d => {
    const g = Number(d.p['with_runtime.gte'] != null ? d.p['with_runtime.gte'] : 0);
    const t = Number(d.p['with_runtime.lte'] != null ? d.p['with_runtime.lte'] : 9999);
    return { de: pad5Rech(g), a: pad5Rech(t), gte:g, lte:t };
  });
  if(!bornes.length) return [ {} ];
  return fusionnerIntervallesRech(bornes).map(b => {
    const o = { 'with_runtime.gte': String(Number(b.de)) };
    if(Number(b.a) < 9999) o['with_runtime.lte'] = String(Number(b.a));
    return o;
  });
}
/* Les durées se comparent en chaînes comme les dates (même fonction de fusion) :
   on les aligne donc sur cinq chiffres. */
function pad5Rech(n){ return ('00000' + Math.max(0, Math.round(n))).slice(-5); }

/* Le produit des variantes : un flux par combinaison. C'est là qu'est le coût
   du point 6, et il est BORNÉ — au pire quatre groupes d'origines × trois
   groupes d'époques × deux groupes de durées. */
function jeuxParamsRech(media){
  const socle = paramsSocleRech(media);
  const champDate = media === 'movie' ? 'primary_release_date' : 'first_air_date';
  const dims = [ variantesGenreRech(media, socle), variantesOrigineRech(),
                 variantesEpoqueRech(champDate), variantesDureeRech(media) ];
  let jeux = [ Object.assign({}, socle) ];
  dims.forEach(variantes => {
    const suivant = [];
    jeux.forEach(base => variantes.forEach(v => suivant.push(Object.assign({}, base, v))));
    jeux = suivant;
  });
  return jeux;
}

/* ===== LES ÉTAGES =====

   Trois questions, dans cet ordre : la forme (point 14), puis l'origine
   (point 13). Chaque étage porte ses flux d'union.

   `compte` dit si le total de cet étage entre dans le compteur affiché. Sur le
   partage de forme, les deux étages comptent : ils partitionnent l'ensemble
   sans le recouper. Sur le partage d'origine, seul l'étage « reste du monde »
   compte — ses paramètres sont ceux de la recette SANS contrainte de langue,
   donc son `total_results` est le total de l'ensemble. C'est ce qui permet de
   garder un compteur EXACT malgré la décomposition, sans une requête de plus. */
function traitementAnimRech(){
  const f = familleRech();
  /* Le partage de forme n'existe que sous « Films ». Ailleurs il n'a pas de
     sens : « Séries » garde l'animation occidentale, « Animés » et
     « Animation » SONT de l'animation, et « Tout » n'exclut rien. */
  if(!f.reel) return 'garde';
  const a = ambianceRech(etatRech().amb);
  return (a && a.anim) ? a.anim : 'refus';
}
/* Les deux rangs ne s'appliquent PAS quand le mot « d'où » est posé : le
   classement par origine n'a de sens que lorsque aucune origine n'a été
   demandée. Sans cette règle, « un film japonais » rangerait 100 % de ses
   résultats au rang 2. Et ils ne s'appliquent pas non plus sur « Animés », où
   le rang 1 est vide par construction : Adrien a tranché « purement
   aléatoire ». */
function rangsOrigineRech(){
  return !familleRech().anime && !listeRech('origine').length;
}
function etagesRech(){
  const médias = mediasRech();
  const traitement = traitementAnimRech();
  const rangs = rangsOrigineRech();
  const etages = [];
  const formes = traitement === 'relegue' ? ['reel','anim']
               : traitement === 'refus'   ? ['reel']
               : [null];
  formes.forEach(forme => {
    const langues = rangs ? ['occ','monde'] : [null];
    langues.forEach(langue => {
      const flux = [];
      médias.forEach(m => {
        jeuxParamsRech(m).forEach(p0 => {
          formeParamsRech(p0, forme, m).forEach(p => {
            if(langue === 'occ') p.with_original_language = langues13Rech().join('|');
            flux.push({ media:m, p:p, page:0, pages:1, total:null, tampon:[], fini:false });
          });
        });
      });
      etages.push({
        forme: forme, langue: langue, flux: flux,
        /* Sur le partage d'origine, seul « reste du monde » compte : c'est lui
           qui porte les paramètres non décomposés. */
        compte: langue !== 'occ',
        /* Et c'est lui, aussi, qui doit écarter chez nous ce que l'étage
           précédent a déjà servi — TMDB n'a pas de `without_original_language`. */
        filtre: langue === 'monde' ? (x => !estOccidentRech(x)) : null
      });
    });
  });
  return etages;
}
/* RELÉGUER SE FAIT EN DEUX PASSES, PAS EN RÉORDONNANT.
   · passe 1 : la recette + `without_genres=16`. On l'épuise, page après page.
     TMDB annonce `total_pages` : on SAIT quand elle est finie, on ne le devine
     pas.
   · passe 2 : la MÊME recette avec `with_genres` complété de 16, en ET.
   Aucune requête supplémentaire — une page reste une requête dans un cas comme
   dans l'autre. Et la passe 1 est mot pour mot la requête du refus : les deux
   gestes partagent la même mécanique, seul le moment où l'on bascule les
   distingue.

   LE PIÈGE DES SÉPARATEURS. Quand la recette exprime déjà un OU de genres
   (`18|878` pour « Ça fait réfléchir »), on ne peut PAS écrire `18|878,16` :
   mesuré le 02/08, TMDB rend alors neuf titres, exactement comme `18,16` — le
   `878` est perdu en silence. La passe 2 se décompose donc en autant de flux
   que de genres, ce que le moteur d'union sait déjà faire. */
function formeParamsRech(p0, forme, media){
  const p = Object.assign({}, p0);
  const anim = genreParNom(media, 'Animation');
  if(!forme || anim == null) return [p];
  if(forme === 'reel'){ ajouterSansRech(p, String(anim)); return [p]; }
  /* forme === 'anim' — la passe 2 : la même recette, mais l'animation EXIGÉE. */
  const sans = String(p.without_genres || '').split(',').filter(x => x && x !== String(anim));
  if(sans.length) p.without_genres = sans.join(','); else delete p.without_genres;
  if(!p.with_genres){ p.with_genres = String(anim); return [p]; }
  if(p.with_genres.indexOf('|') < 0){ p.with_genres = p.with_genres + ',' + anim; return [p]; }
  /* Le OU de genres ne peut pas cohabiter avec la virgule : un flux par genre. */
  return p.with_genres.split('|').filter(x => x).map(g =>
    Object.assign({}, p, { with_genres: g + ',' + anim }));
}

/* ===== LE TIRAGE AU SORT — POINT 13 =====

   Découvrir est le reflet de ce que tu regardes, c'est son rôle. Recherche doit
   servir à en SORTIR. Le profil de goût n'y organise donc plus rien : la grille
   est tirée au sort à l'intérieur de chaque rang.

   L'ALÉA PASSE PAR UN POINT D'ENTRÉE SURCHARGEABLE, sans quoi aucun test
   d'ordre sur cette grille n'est stable — le dépôt n'a aucun stub de
   `Math.random` mais remplace déjà des fonctions globales à la main dans ses
   tests. `rechAlea` est cette fonction.

   LE TIRAGE SE FAIT UNE FOIS PAR FOURNÉE, JAMAIS AU RENDU (§3.9) : le résultat
   vit dans `r.res`, que le rendu relit sans jamais le retoucher. L'écran ne
   bouge pas sous les doigts.

   ON NE RETIRE NI NE DUPLIQUE JAMAIS UN TITRE : même longueur en sortie qu'en
   entrée. C'est un cas de test, parce que c'est le genre de règle qu'un « petit
   filtre bien pratique » casse six mois plus tard. */
let rechAlea = function(){ return Math.random(); };
function melangerRech(liste){
  const l = liste.slice();
  for(let i = l.length - 1; i > 0; i--){
    const j = Math.floor(rechAlea() * (i + 1));
    const t = l[i]; l[i] = l[j]; l[j] = t;
  }
  return l;
}

/* ===== LA CONSOMMATION DES FLUX =====

   Une fournée se remplit VRAIMENT : si un retrait côté client vide une page, on
   va chercher la suivante jusqu'à atteindre la cible ou jusqu'à ce que TMDB
   n'ait plus rien. On n'affiche pas une fournée courte en espérant que personne
   ne remarque. Le garde-fou de requêtes reste `RECH_PAGES_MAX` (ou
   `RECH_PAGES_TAMIS` quand un tamis client est actif). */
function fluxEpuiseRech(f){ return f.fini || (f.page > 0 && f.page >= f.pages); }
async function lirePageFluxRech(f, seq){
  if(fluxEpuiseRech(f)) return false;
  const p = Object.assign({}, f.p);
  p.page = String(f.page + 1);
  const d = await tmdb('/discover/'+f.media, p);
  if(seq !== grilleSeq) return false;
  f.page = f.page + 1;
  f.pages = d.total_pages || 1;
  if(f.total == null) f.total = d.total_results || 0;
  const bruts = (d.results || []).filter(x => x && x.poster_path)
                  .map(x => Object.assign({ __media: f.media }, x));
  f.tampon = f.tampon.concat(bruts);
  if(f.page >= f.pages) f.fini = true;
  return true;
}
/* Un étage est fini quand tous ses flux sont épuisés ET que leurs tampons sont
   vides. On ne bascule JAMAIS avant : c'est toute la différence entre « à la
   fin du catalogue » et « à la fin de la fournée ». */
function etageFiniRech(e){
  return e.flux.every(f => fluxEpuiseRech(f) && !f.tampon.length);
}

/* ===== LA FOURNÉE ===== */
async function chargerGrilleRech(suite){
  const r = etatRech();
  const seq = ++grilleSeq;
  /* POINT 5 / POINT 7 — ON NE VIDE PAS `r.res` ICI. Les affiches précédentes
     restent à l'écran jusqu'à l'arrivée des nouvelles ; elles sont remplacées
     d'un coup, plus bas, quand la fournée est prête. Vider d'abord faisait un
     trou noir à chaque mot posé — invisible sous un voile opaque, très visible
     dès qu'on regarde la grille changer derrière la feuille. */
  if(!suite){ r.page = 1; r.total = null; r.flux = null; }
  r.loading = true; r.err = '';
  peindreRech();
  try{
    const médias = mediasRech();
    await Promise.all(médias.map(m => chargerGenres(m).catch(()=>null)));
    if(seq !== grilleSeq) return;

    if(!r.flux) r.flux = { etages: etagesRech(), i:0, exact:true };
    const F = r.flux;

    /* PREMIÈRE FOURNÉE — on amorce TOUS les étages d'un coup. Ce n'est pas une
       dépense : ces pages seront consommées de toute façon, et c'est ce qui
       donne le total de chaque étage, donc un compteur exact malgré la
       décomposition. */
    if(!suite){
      await Promise.all(F.etages.map(e => Promise.all(e.flux.map(f => lirePageFluxRech(f, seq).catch(()=>false)))));
      if(seq !== grilleSeq) return;
      let total = 0, union = false;
      F.etages.forEach(e => {
        if(!e.compte) return;
        if(e.flux.length > 1) union = true;
        e.flux.forEach(f => { total += (f.total || 0); });
      });
      r.total = total;
      F.exact = !union;
    }

    const tamis = tamisActifRech();
    const toursMax = tamis ? RECH_PAGES_TAMIS : RECH_PAGES_MAX;
    const dejaVus = {};
    (suite ? r.res : []).forEach(x => { dejaVus[x.__media+':'+x.id] = 1; });

    let fournee = [], tours = 0;
    while(fournee.length < RECH_CIBLE && F.i < F.etages.length && tours < toursMax * Math.max(1, F.etages[F.i].flux.length)){
      const e = F.etages[F.i];
      /* Entrelacement : un titre pris à chaque flux, à tour de rôle. Sans ça,
         « français ou américain » rendrait deux cents français puis deux cents
         américains. */
      let pris = 0;
      for(const f of e.flux){
        if(!f.tampon.length && !fluxEpuiseRech(f)){ tours++; await lirePageFluxRech(f, seq).catch(()=>{ f.fini = true; }); if(seq !== grilleSeq) return; }
        if(!f.tampon.length) continue;
        const x = f.tampon.shift();
        pris++;
        const cle = x.__media+':'+x.id;
        if(dejaVus[cle]) continue;
        if(e.filtre && !e.filtre(x)) continue;
        if(!tamiserRech([x]).length) continue;
        dejaVus[cle] = 1;
        fournee.push(x);
        if(fournee.length >= RECH_CIBLE) break;
      }
      if(!pris && etageFiniRech(e)) F.i++;
      else if(!pris) break;
    }

    /* LE TIRAGE, une fois par fournée, à l'intérieur du rang courant. Puis la
       règle anti-monotonie : elle réordonne, elle ne retire rien. */
    fournee = espacerGenresRech(melangerRech(fournee));

    r.res = suite ? r.res.concat(fournee) : fournee;
    r.page = r.page + (suite ? 1 : 0);
    r.loading = false; r.charge = true; r.err = '';
    peindreRech();
  }catch(e){
    if(seq !== grilleSeq) return;
    r.loading = false; r.charge = true;
    r.err = (e && e.message === 'BADKEY') ? 'Service indisponible' : 'Pas de connexion';
    peindreRech();
  }
}
/* Reste-t-il quelque chose à servir ? C'est ce que « Voir plus » demande. */
function resteRech(){
  const F = etatRech().flux;
  if(!F) return false;
  for(let i = F.i; i < F.etages.length; i++) if(!etageFiniRech(F.etages[i])) return true;
  return false;
}

function platesChoisiesRech(){
  const r = etatRech(), mes = (typeof mesPlates === 'function') ? mesPlates() : [];
  const choix = listeRech('plate');
  if(!choix.length) return [];
  if(choix.map(String).indexOf('mes') >= 0) return mes.map(x => x.id);
  return choix.map(v => { const u = mes.find(x => String(x.id) === String(v)); return u ? u.id : null; })
              .filter(x => x != null);
}

/* ======================= LE PROFIL DE GOÛT — LECTURE =======================

   Ce lot ne CONSTRUIT pas le profil : c'est le travail du lot A, écrit en même
   temps, sur une autre branche, sans qu'on puisse se parler. On lit donc le
   contrat de données, et RIEN D'AUTRE :

     db.avis   = { tv:{ "<tmdbId>":{v:1|-1, quand} }, movie:{ … } }
     db.podium = { film:[ids], serie:[ids], anime:[ids], maj }

   Ces deux clés peuvent être ABSENTES OU VIDES : ce n'est pas une précaution,
   c'est la règle. Dans ce cas le tri est celui de TMDB, la popularité, et
   l'écran ne s'en porte pas plus mal.

   Le poids d'un titre est celui du contrat, commun aux trois lots :
       v:1 → 2   ·   aucun avis → 1   ·   v:-1 → 0 (exclu). */
function avisRech(media, id){
  const a = db.avis && db.avis[media];
  const e = a && a[id];
  return (e && (e.v === 1 || e.v === -1)) ? e.v : 0;
}
function poidsAvisRech(media, id){
  const v = avisRech(media, id);
  return v === 1 ? 2 : v === -1 ? 0 : 1;
}
function genresDuTitreRech(media, id){
  const o = media === 'tv' ? db.shows[id] : db.movies[id];
  return (o && Array.isArray(o.genres)) ? o.genres : [];
}
/* Le poids de chaque nom de genre, tel que le profil le dit. Trois sources,
   du plus déclaratif au plus tiède — le podium est un choix explicite, un 👍
   aussi, la bibliothèque n'est qu'une habitude. */
function profilGenresRech(){
  const poids = {};
  const ajoute = (l, n) => (l||[]).forEach(g => { poids[g] = (poids[g]||0) + n; });
  const pod = db.podium || {};
  ['film','serie','anime'].forEach(k => (pod[k]||[]).forEach(id =>
    ajoute(genresDuTitreRech(k === 'film' ? 'movie' : 'tv', id), 4)));
  ['tv','movie'].forEach(m => {
    const a = (db.avis && db.avis[m]) || {};
    Object.keys(a).forEach(id => { if(a[id] && a[id].v === 1) ajoute(genresDuTitreRech(m, id), 3); });
  });
  /* La bibliothèque, pondérée par l'avis : un titre marqué 👎 ne compte pas,
     un titre non qualifié compte à moitié — c'est le tableau du contrat. */
  Object.values(db.shows||{}).forEach(s => ajoute(s.genres, poidsAvisRech('tv', s.id)));
  Object.values(db.movies||{}).forEach(m => ajoute(m.genres, poidsAvisRech('movie', m.id)));
  /* Et ce qui a été coché à la main dans Mes goûts : c'est une déclaration,
     pas une déduction. */
  /* (Fonction INACTIVE depuis le point 13 — voir `trierParGout`. La famille est
     passée quand même : le jour où quelqu'un la rouvre, elle ne doit pas
     réinstaller le mélange que le point 11 vient de supprimer.) */
  if(typeof genresRetenus === 'function') ajoute(genresRetenus(familleRech().id), 3);
  return poids;
}
/* ============ INACTIVE DEPUIS LE POINT 13 — NE PAS LA REBRANCHER ============

   `trierParGout` N'A PLUS AUCUN APPELANT DANS LA GRILLE, et c'est voulu. Le
   §4.1 de `spec-decouvrir.md` a été RÉVISÉ explicitement par Adrien le 02/08 :
   « dans Recherche ça ne sera plus les goûts qui organiseront les résultats ».
   La ligne « le profil de goût : trie uniquement, ne filtre jamais » devient
   « le profil de goût : n'intervient pas ». La distinction Découvrir /
   Recherche ne passe plus par *filtre ou tri* mais par *reflet ou sortie* :
   Découvrir te ressemble, Recherche t'en sort.

   POURQUOI ELLE EST GARDÉE PLUTÔT QU'EFFACÉE : elle et `profilGenresRech`
   décrivent un contrat de données (`db.avis`, `db.podium`) qui reste vrai, et
   la faire disparaître ferait perdre la trace d'une décision. Elle est INACTIVE.
   Si quelqu'un la rebranche dans six mois en croyant réparer un oubli, il
   réinstalle la bulle de goûts que ce lot vient de crever.

   `espacerGenresRech`, en revanche, EST toujours appelée — depuis
   `chargerGrilleRech`, juste après le tirage au sort. C'était le piège : elle
   n'avait aucun appelant en dehors de `trierParGout`, et débrancher l'une sans
   déplacer l'autre aurait supprimé en silence la règle anti-monotonie, celle-là
   même que le point 4 doit réparer.

   TRIE, NE FILTRE JAMAIS. La liste rendue a exactement la même longueur que
   celle reçue : c'est vérifié par un cas de test. */
function trierParGout(liste){
  const poids = profilGenresRech();
  if(!Object.keys(poids).length) return espacerGenresRech(liste);
  const noms = {};
  ['tv','movie'].forEach(m => (genresTMDB[m]||[]).forEach(g => { noms[m+':'+g.id] = g.nom; }));
  const score = x => {
    const m = x.__media || 'movie';
    let s = 0;
    (x.genre_ids||[]).forEach(id => { s += poids[noms[m+':'+id]] || 0; });
    /* Un titre marqué 👎 descend, il ne disparaît pas : on l'a demandé. */
    if(avisRech(m, x.id) === -1) s -= 100;
    return s;
  };
  return espacerGenresRech(liste
    .map((x, i) => ({ x:x, s:score(x), i:i }))
    .sort((a,b)=> (b.s - a.s) || (a.i - b.i))
    .map(o => o.x));
}

/* ====== LOT R2, POINT 13 — PAS PLUS DE DEUX DU MÊME GENRE À LA SUITE ======

   « Envie de rigoler » rendait six films d'animation d'affilée. Ce n'était pas
   un bug : le tri fait exactement ce qu'on lui demande, et avec 382 films dont
   beaucoup d'animation japonaise, le genre Animation écrase tous les autres.
   Mais une recherche qui rend six fois la même chose ne donne pas envie de
   descendre.

   LA RÈGLE RÉORDONNE, ELLE NE RETIRE RIEN. Même longueur, mêmes titres — c'est
   la contrainte déjà vérifiée par un cas de test sur `trierParGout`, et elle
   doit l'être aussi ici. Dès qu'un TROISIÈME titre du même genre dominant se
   présente, il est décalé après le prochain titre d'un autre genre.

   « Genre dominant » = le premier genre du titre, celui qui sert déjà à
   l'affichage. Un titre sans genre ne se compare à personne : il ne bloque
   jamais et ne se fait jamais décaler.

   LE COÛT EST ASSUMÉ : le troisième titre le mieux assorti se fait doubler par
   un moins bien assorti. On perd un peu de précision, on gagne de voir dès la
   première rangée qu'il existe autre chose. */
/* LE GENRE DOMINANT N'EST PLUS « LE PREMIER DE LA LISTE » — POINT 4, LEVIER 2.

   C'est là qu'était la panne : la règle comparait les titres sur
   `genre_ids[0]`, et l'animation n'est presque jamais le premier genre chez
   TMDB. Kung Fu Panda commence par Action, Les Nouveaux Héros par Aventure,
   Vice-Versa par Animation : trois dessins animés, trois genres différents, la
   règle satisfaite, et l'écran uniformément animé.

   Elle lit maintenant l'ENSEMBLE des genres et prend le premier du tableau de
   priorité (`GENRE_PRIORITE`, app-04). Un dessin animé est d'abord une
   ANIMATION, quoi qu'en dise l'ordre de TMDB.

   La règle continue de réordonner sans rien retirer, et sans changer la
   longueur de la liste. */
function genreDominantRech(x){
  if(!x || !Array.isArray(x.genre_ids) || !x.genre_ids.length) return '';
  const media = x.__media || 'movie';
  const id = (typeof genrePrincipalId === 'function') ? genrePrincipalId(media, x.genre_ids) : null;
  return media + ':' + (id != null ? id : x.genre_ids[0]);
}
function espacerGenresRech(liste){
  if(!Array.isArray(liste) || liste.length < 3) return liste;
  const reste = liste.slice(), out = [];
  while(reste.length){
    let i = 0;
    if(out.length >= 2){
      const g = genreDominantRech(out[out.length-1]);
      if(g && g === genreDominantRech(out[out.length-2])){
        /* Le premier titre d'un autre genre passe devant. S'il n'y en a aucun
           dans tout ce qui reste, on ne bloque pas : on prend le suivant. */
        const j = reste.findIndex(x => genreDominantRech(x) !== g);
        if(j > 0) i = j;
      }
    }
    out.push(reste.splice(i, 1)[0]);
  }
  return out;
}

/* ================================ L'écran ================================ */

function viewRecherche(){
  if(ouvertureRech()) nouvelleOuvertureRech();
  const r = etatRech();
  if(r.jeu) return viewJeuRech();
  const sub = champRech() + puceFamillesRech();
  /* Différé d'un tour de boucle, comme le fait déjà `blocPlateformes`. Appelé
     ici tel quel, `chargerGrilleRech` peignait avant que `#rres` existe, et
     `peindreRech` se rabattait alors sur `render()` — en pleine construction de
     ce même rendu. Ouvrir l'onglet Recherche dessinait donc l'écran DEUX fois,
     systématiquement. Revue de stabilité du 02/08, constat A1-1. */
  if(!r.charge && !r.loading && !r.res.length && !enRechercheTitre())
    setTimeout(()=>{ if(view === 'search'){ const e2 = etatRech();
      if(!e2.charge && !e2.loading && !e2.res.length && !enRechercheTitre()) chargerGrilleRech(); } }, 0);
  return header('Recherche', {sub:sub}) +
    '<div id="rres">'+corpsRech()+'</div>' +
    '<div style="height:20px"></div>';
}
function champRech(){
  const r = etatRech();
  return '<div class="qbar">'+I.search+
    '<input type="search" id="q" enterkeyhint="search" autocomplete="off" autocorrect="off" '+
      'placeholder="Un titre, une personne…" value="'+esc(r.q)+'" oninput="saisieRech(this.value)" '+
      'onkeydown="if(event.key===\'Enter\'){this.blur();lancerTitre()}">'+
    '<button class="qclear'+(r.q?'':' masque')+'" onclick="saisieRech(\'\')" '+
      'aria-label="Effacer">'+I.close+'</button></div>';
}
function puceFamillesRech(){
  const r = etatRech();
  /* Pendant un ajout de série, elles sont grisées elles aussi : changer de
     famille vide les paquets et retire une carte, ce qui laisserait le
     téléchargement en cours se terminer sur un écran qui a changé de sujet. */
  const fige = !!(r.jeu && r.jeu.occupe);
  return '<div class="chips types" data-rail="fam-rech">'+RECH_FAMILLES.map(f=>
    '<button class="chip '+(r.fam===f.id?'on':'')+'"'+(fige?' disabled':'')+
      ' onclick="setFamRech(\''+f.id+'\')">'+esc(f.label)+'</button>').join('')+'</div>';
}
function peindreRech(){
  if(view !== 'search') return;
  /* Le jeu occupe le même écran : quand il est ouvert, `#rres` n'existe pas et
     le repli « pas de nœud → render() » referait tout l'écran à chaque page
     chargée par le jeu. La grille se repeindra à la fermeture. */
  if(etatRech().jeu) return;
  const el = document.getElementById('rres');
  if(!el) return render();
  el.innerHTML = corpsRech();
  const c = document.querySelector('.qclear');
  if(c) c.classList.toggle('masque', !etatRech().q);
}
function corpsRech(){
  if(enRechercheTitre()) return corpsTitreRech();
  return blocPhraseRech() + blocEnviesRech() + grilleRech();
}

/* ------------------ Un nom tapé : titres, puis personnes ------------------ */
function corpsTitreRech(){
  const r = etatRech();
  if(r.qloading && !r.qtitres.length)
    return '<div class="empty"><span class="spin"></span>'+
           '<p style="margin-top:12px">On cherche…</p></div>';
  if(r.qerr)
    return '<div class="empty">'+I.search+'<h3>'+esc(r.qerr)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="lancerTitre()">Réessayer</button></div>';
  if(!r.qtitres.length && !r.qgens.length)
    return '<div class="empty"><h3>Rien trouvé pour « '+esc(rechTexte())+' »</h3>'+
      '<p>Essaie une autre orthographe, ou change de famille juste au-dessus.</p></div>';
  let h = '';
  if(r.qtitres.length)
    h += '<div class="sectitle">Titres</div>'+
      '<div class="rang3">'+r.qtitres.map(x=>jaquetteRech(x)).join('')+'</div>';
  if(r.qgens.length)
    h += '<div class="sectitle">Personnes<span class="pq">leur filmographie</span></div>'+
      '<div class="rgens" data-rail="gens-rech">'+r.qgens.map(g=>
        '<button class="rgen" onclick="ouvrirPersonneRech('+g.id+')">'+
          '<div class="rgenph">'+posterEl(g.profile_path,'w185','',g.name)+'</div>'+
          '<div class="rgennom">'+esc(g.name)+'</div>'+
        '</button>').join('')+'</div>';
  return h;
}

/* ====================== LA PHRASE, ET SON COMPTEUR ======================
   La phrase n'est pas un formulaire à part : c'est elle qui commande la grille
   en dessous. Chaque mot souligné est une puce ; on tape, une courte liste
   s'ouvre, on choisit — ou « peu importe » pour le retirer. */
/* « a », « a ou b », « a, b ou c ». Le OU est le sens réel de la requête
   (point 6) ; l'écrire autrement ferait mentir la phrase. */
function ouRech(l){
  if(!l.length) return '';
  if(l.length === 1) return l[0];
  return l.slice(0, -1).join(', ') + ' ou ' + l[l.length - 1];
}
function motsPhraseRech(){
  const r = etatRech(), out = [];
  const ing = ingredientsRech();
  const a = ambianceRech(r.amb);
  /* Un sous-genre d'animé n'a qu'un mot : lui-même. */
  if(a && a.mots) out.push({ cle:'genre', mot:a.mot, amb:true });
  else ing.forEach(i => out.push({ cle:i.cle, mot:i.mot, amb:true }));
  RECH_MOTS.forEach(m=>{
    if(out.some(o => o.cle === m.cle && o.amb)) return;   // déjà dit par l'ambiance
    /* PLUSIEURS VALEURS SE LISENT AVEC « OU », pas avec une virgule : la
       phrase doit dire ce que la requête fait. « un film français ou
       américain » — c'est exactement le mot d'Adrien. */
    if(m.cle === 'genre' && listeRech('genre').length)
      out.push({ cle:'genre',
                 mot: ouRech(listeRech('genre').map(g => String(libelleGenre(g)).toLowerCase())) });
    if(m.cle === 'origine' && listeRech('origine').length){
      const l = listeRech('origine').map(id => { const o = origineRech(id); return o ? o.mot : null; }).filter(x=>x);
      if(l.length) out.push({ cle:'origine', mot: ouRech(l) });
    }
    if(m.cle === 'pasvu' && r.pasvu === 'non')
      out.push({ cle:'pasvu', mot:"que je n'ai pas vu" });
    if(m.cle === 'epoque' && listeRech('epoque').length){
      const l = listeRech('epoque').map(id => { const e = RECH_EPOQUES.find(x=>x.id===id); return e ? e.mot : null; }).filter(x=>x);
      if(l.length) out.push({ cle:'epoque', mot: ouRech(l) });
    }
    if(m.cle === 'duree' && listeRech('duree').length && mediaRech() === 'movie'){
      const l = listeRech('duree').map(id => { const d = RECH_DUREES.find(x=>x.id===id); return d ? d.mot : null; }).filter(x=>x);
      if(l.length) out.push({ cle:'duree', mot: ouRech(l) });
    }
    if(m.cle === 'note' && r.note){
      const n = RECH_NOTES.find(x=>x.id===r.note); if(n) out.push({ cle:'note', mot:n.mot });
    }
    if(m.cle === 'plate' && listeRech('plate').length) out.push({ cle:'plate', mot:libellePlateRech() });
  });
  /* L'ordre de LECTURE, pas l'ordre de pose : « un film comique français des
     années 90 de moins de 2 h » se lit tout seul. */
  /* `rang[cle] || 9` serait faux : le rang du genre vaut ZÉRO, et zéro est
     faux en JavaScript — le genre se retrouvait en fin de phrase, « un film
     bien noté documentaire ». Attrapé par la vérification d'écran. */
  const rang = { genre:0, origine:1, epoque:2, duree:3, note:4, pasvu:5, plate:6 };
  const rg = c => (rang[c] == null ? 9 : rang[c]);
  return out.sort((a2,b)=> rg(a2.cle) - rg(b.cle));
}
function libellePlateRech(){
  const r = etatRech();
  const choix = listeRech('plate');
  if(choix.map(String).indexOf('mes') >= 0) return 'sur mes plateformes';
  if(choix.length > 1) return 'sur '+choix.length+' plateformes';
  const un = ((typeof mesPlates === 'function') ? mesPlates() : []).find(x => String(x.id) === String(choix[0]));
  return un ? 'sur '+un.nom : 'sur mes plateformes';
}
/* La phrase en texte simple — pour la puce « Reprendre » et pour les tests. */
function phraseTexte(){
  return ('Je veux '+familleRech().art+' '+motsPhraseRech().map(m=>m.mot).join(' ')).trim();
}
function blocPhraseRech(){
  const r = etatRech();
  const mots = motsPhraseRech();
  let h = '<div class="rphrase"><div class="rp">'+
    'Je veux <span class="rmot fixe">'+esc(familleRech().art)+'</span> ';
  mots.forEach(m=>{
    h += '<button class="rmot" onclick="ouvrirMotRech(\''+escJs(m.cle)+'\')">'+esc(m.mot)+'</button> ';
  });
  /* On ne voit jamais sept champs vides : seulement la phrase qui marche déjà,
     et une seule invitation à l'affiner. LOT R2, point 19 : cette invitation
     ouvre désormais UN CHOIX au lieu d'imposer toujours le même mot. */
  /* POINT 5 — « + préciser » ouvre UNE QUESTION, plus jamais une liste. La
     première question libre de la file ; « Peu importe → » mène aux suivantes,
     la flèche gauche ramène aux précédentes. */
  if(critLibresRech().length)
    h += '<button class="rmot vide" onclick="ouvrirPreciserRech()">+ préciser</button>';
  h += '</div>'+ barreCompteurRech() +'</div>';
  if(r.reprise)
    h += '<div class="wrap" style="padding-top:8px">'+
      '<button class="chip" onclick="reprendreRech()">↩ Reprendre : '+
        esc(resumeRepriseRech())+'</button></div>';
  return h;
}
function resumeRepriseRech(){
  const t = etatRech().reprise;
  if(!t) return '';
  const s = String(t.texte||'').replace(/^Je veux /,'');
  return s.length > 46 ? s.slice(0,44)+'…' : s;
}
/* LE COMPTEUR VIVANT. C'est le seul élément de jeu nécessaire sur cette porte :
   voir son intention se resserrer sous ses yeux est ce qui rend l'exercice
   satisfaisant. Il n'y a pas de bouton « voir les résultats » — ils sont déjà
   à l'écran. Il ne reste que « Jouer », qui hérite de la sélection courante. */
function barreCompteurRech(){
  const r = etatRech();
  const n = r.total;
  const txt = r.loading && n === null ? '<span class="spin"></span>'
            : n === null ? '—'
            : prefixeCompteurRech()+'<b id="rnb">'+n.toLocaleString('fr-FR')+'</b> '+
              esc(familleRech().nom);
  return '<div class="rbarre"><div class="rnb">'+txt+'</div>'+
    '<button class="btn mini" onclick="ouvrirJeuRech()">🎲 Jouer</button></div>';
}
/* LE COMPTEUR DOIT DIRE CE QU'IL COMPTE. `total_results` est celui de TMDB, et
   TMDB ne sait rien de ce qu'on retire chez nous : ni l'animation asiatique
   qu'on sort de « Séries », ni la bibliothèque qu'on sort de « que je n'ai pas
   vu ». Annoncer « 4 986 séries » serait faux ; annoncer le nombre de titres
   déjà chargés casserait le compteur vivant, qui est tout l'intérêt de la
   phrase. On dit donc « moins de » : c'est vrai, c'est court, et ça continue de
   se resserrer sous les yeux. */
/* POINT 6 — l'union rend le total inexact : deux jeux peuvent se recouper (une
   coproduction franco-américaine sort dans « français » ET dans « américain »).
   On réutilise la convention qui existe déjà, et uniquement dans ce cas. La
   SÉQUENCE, elle, ne fausse rien : ses étages partitionnent le même ensemble. */
function prefixeCompteurRech(){
  const F = etatRech().flux;
  return (tamisActifRech() || (F && F.exact === false)) ? 'moins de ' : '';
}

/* La feuille d'un mot. Une courte liste, et « peu importe » toujours en bas :
   un mot qu'on ne peut pas retirer n'est pas un mot, c'est un piège. */
/* ========== POINT 5 — « + préciser » REDEVIENT UNE PHRASE QU'ON ÉCRIT ==========

   « Maintenant quand on va dans préciser on a vraiment tous les filtres, on n'a
   plus l'impression d'écrire et de créer notre recherche comme avant. Je
   n'aime pas. » — Adrien, 02/08.

   Il a raison, et le point 19 s'était promis le contraire : sa dernière ligne
   disait « on ne montre toujours pas sept champs vides ». L'écran livré en
   montrait exactement sept. C'est la lettre du point 19 respectée et son
   intention perdue — le §4.5 ne défend pas la phrase pour son charme, il la
   défend parce qu'« on lit son intention en entier d'un coup d'œil ». Une
   feuille qui liste tout rend la phrase décorative : on ne l'écrit plus, on la
   configure.

   MAIS ON NE REVIENT PAS EN ARRIÈRE NON PLUS. Le cul-de-sac du point 19 était
   réel : « + préciser » rouvrait indéfiniment le PREMIER critère non renseigné,
   et « peu importe » ne renseignant rien, on y retombait sans fin.

   LES TROIS RÈGLES, validées le 02/08 avec deux corrections d'Adrien :

   1. « + préciser » ouvre UNE question, comme avant.
   2. « Peu importe → » PASSE À LA SUIVANTE au lieu de rouvrir la même. C'est le
      cul-de-sac fermé par où il était ouvert. Correction d'Adrien : « on doit
      pouvoir revenir en arrière et modifier un "peu importe" précédent » — la
      navigation n'est donc PAS à sens unique.
   3. La sortie en bas NE DÉPLIE PAS la liste complète. Correction d'Adrien :
      « ça ouvre juste un autre critère, pas tous les critères possibles ».
      **LA FEUILLE NE MONTRE JAMAIS LES SEPT D'UN COUP, SOUS AUCUN GESTE.**

   VARIANTE B, CHOISIE LE 02/08 : une question, une flèche de chaque côté, une
   ligne « 3 / 7 ». Le plus sobre — 291 px contre 297 pour le fil de puces et
   355 pour la phrase répétée dans la feuille. Pour mémoire, la feuille
   d'aujourd'hui, celle des sept champs, mesure 475 px.

   PLUS UNE EXIGENCE : « je veux voir la phrase qui est en dehors de la popup ».
   C'est B1 — la phrase et son compteur RESTENT NETS au-dessus du voile pendant
   qu'on répond, et la phrase ne bouge pas à l'ouverture. C'est même ce qui donne
   son intérêt à la feuille courte : on voit le nombre tomber au moment où l'on
   pose le mot, sans rien refermer.

   LE VOILE RESTE À 60 %, l'opacité actuelle : Adrien préfère garder la feuille
   franchement détachée. `.sheet{background:rgba(0,0,0,.6)}` ne change donc pas.

   LA LISTE DES SEPT N'A PAS DISPARU DU CODE : elle sert encore au JEU
   (`ouvrirAjoutRech(1)`), où la phrase n'est pas à l'écran et où c'est le seul
   moyen de corriger un critère déjà posé sans quitter la partie. Elle a
   simplement cessé d'être la porte d'entrée. */

/* La FILE des questions : tous les critères qui ont un sens pour la famille
   courante, dans l'ordre où ils se lisent. On y circule, on n'en sort pas. */
function fileCriteresRech(){
  return RECH_MOTS.filter(m => !constanteFamilleRech(m.cle));
}
function rangCritereRech(cle){
  return fileCriteresRech().map(m => m.cle).indexOf(cle);
}
/* Ce qu'on a laissé libre EN CHEMIN — pas ce qui n'est pas renseigné : on ne
   nomme que les questions déjà VUES et laissées sans réponse. C'est ce qui
   évite d'avoir à se souvenir, et c'est ce que la ligne sous le titre dit. */
let rechLibres = [];
function ouvrirCritereSuivantRech(cle){
  const file = fileCriteresRech();
  const i = rangCritereRech(cle);
  if(i < 0 || i >= file.length - 1){
    /* Dernière question : on referme plutôt que de boucler. Rien n'oblige à
       faire les sept, et l'utilisateur peut tirer la feuille à tout moment. */
    return closeSheet();
  }
  ouvrirMotRech(file[i + 1].cle);
}
function ouvrirCritereAvantRech(cle){
  const file = fileCriteresRech();
  const i = rangCritereRech(cle);
  if(i <= 0) return;
  ouvrirMotRech(file[i - 1].cle);
}
/* « Peu importe → » : on note que la question a été vue et laissée libre, puis
   on AVANCE. C'est la correction du cul-de-sac. */
function peuImporteRech(cle){
  const r = etatRech();
  const surAmbiance = motsPhraseRech().some(m => m.cle === cle && m.amb);
  if(surAmbiance) retirerIngredientRech(cle);
  else if(aMotRech(cle)) poserMotRech(cle, null);
  if(rechLibres.indexOf(cle) < 0) rechLibres.push(cle);
  ouvrirCritereSuivantRech(cle);
}

function ouvrirMotRech(cle, depuisListe){
  const r = etatRech();
  const def = RECH_MOTS.find(m => m.cle === cle) || { titre:'' };
  let choix = '';
  const bouton = (lab, action, on)=>
    '<button class="ch'+(on?' on':'')+'" onclick="'+action+'">'+esc(lab)+'</button>';

  if(cle === 'genre'){
    const amb = ambiancesRech();
    if(amb.length)
      choix += '<div class="fgrp">'+(familleRech().anime ? "Les sous-genres" : 'Les ambiances')+'</div>'+
        '<div class="choix">'+amb.map(a=>
          bouton(a.mot || a.t, 'poserAmbianceRech(\''+escJs(a.id)+'\')', r.amb === a.id)).join('')+'</div>';
    const l = genresRech();
    if(l.length)
      choix += '<div class="fgrp" style="margin-top:12px">Les genres</div>'+
        '<div class="choix">'+l.map(g=>
          /* POINT 16 — on affiche le libellé français ; c'est toujours le NOM
             TMDB qui est posé dans la phrase et expédié, jamais la traduction. */
          bouton(libelleGenre(g.nom), 'poserMotRech(\'genre\',\''+escJs(g.nom)+'\')',
                 listeRech('genre').indexOf(g.nom) >= 0)).join('')+'</div>';
  }
  else if(cle === 'origine')
    choix = '<div class="choix">'+originesRech().map(o=>
      bouton(o.mot, 'poserMotRech(\'origine\',\''+escJs(o.id)+'\')',
             listeRech('origine').indexOf(o.id) >= 0)).join('')+'</div>'+
      (familleRech().anime
        ? '<div class="small muted" style="margin-top:10px">'+
          'La famille Animés couvre l\'animation japonaise, chinoise et coréenne.</div>'
        : '');
  else if(cle === 'pasvu')
    choix = '<div class="choix">'+
      bouton("que je n'ai pas vu", 'poserMotRech(\'pasvu\',\'non\')', r.pasvu === 'non')+'</div>'+
      '<div class="small muted" style="margin-top:10px">'+
      'Ce retrait se fait chez nous : TMDB ne connaît pas ta bibliothèque.</div>';
  else if(cle === 'epoque')
    choix = '<div class="choix">'+RECH_EPOQUES.map(e=>
      bouton(e.mot, 'poserMotRech(\'epoque\',\''+escJs(e.id)+'\')',
             listeRech('epoque').indexOf(e.id) >= 0)).join('')+'</div>';
  else if(cle === 'duree')
    choix = '<div class="choix">'+RECH_DUREES.map(d=>
      bouton(d.mot, 'poserMotRech(\'duree\',\''+escJs(d.id)+'\')',
             listeRech('duree').indexOf(d.id) >= 0)).join('')+'</div>'+
      '<div class="small muted" style="margin-top:10px">La durée ne vaut que pour les films.</div>';
  else if(cle === 'note')
    choix = '<div class="choix">'+RECH_NOTES.map(n=>
      bouton(n.mot, 'poserMotRech(\'note\',\''+escJs(n.id)+'\')', r.note === n.id)).join('')+'</div>';
  else if(cle === 'plate'){
    const mes = (typeof mesPlates === 'function') ? mesPlates() : [];
    if(!mes.length)
      choix = '<div class="small muted">Tu n\'as déclaré aucun abonnement. '+
        '<button class="lienplus" style="margin:0" onclick="closeSheet();go(\'plates\',{from:\'discover\'})">'+
        'Les déclarer</button></div>';
    else
      choix = '<div class="choix">'+
        bouton('sur mes plateformes', 'poserMotRech(\'plate\',\'mes\')',
               listeRech('plate').map(String).indexOf('mes') >= 0)+
        mes.map(p => bouton('sur '+p.nom, 'poserMotRech(\'plate\',\''+escJs(String(p.id))+'\')',
                            listeRech('plate').map(String).indexOf(String(p.id)) >= 0)).join('')+'</div>';
  }
  /* LA SORTIE. « Peu importe → » AVANCE : c'est ce qui ferme le cul-de-sac.
     Sur un ingrédient d'ambiance, il retire aussi le mot de la recette — c'est
     ce qui rend la recette corrigible. Le tout est traité par `peuImporteRech`,
     à un seul endroit. */
  choix += '<div class="choix" style="margin-top:14px">'+
    '<button class="ch raz" onclick="peuImporteRech(\''+escJs(cle)+'\')">Peu importe →</button>'+
    /* Venu de la LISTE (le jeu), on peut y retourner sans rien répondre. Ce
       chemin n'existe plus depuis la phrase : là-bas, il n'y a plus de liste. */
    (depuisListe ? '<button class="ch raz" onclick="ouvrirAjoutRech('+
       (depuisListe === 2 ? '1' : '')+')">↩ La liste</button>' : '')+
    '</div>';

  /* LA NAVIGATION, VARIANTE B — une flèche de chaque côté, et une ligne qui dit
     deux choses : où l'on en est, et ce qu'on a laissé libre en chemin. Sans
     elle il faudrait se souvenir. Elle ne s'affiche pas quand on vient de la
     liste du jeu : là-bas, c'est la liste qui sert de navigation. */
  let tete = '<h3>'+esc(def.titre)+'</h3>';
  if(!depuisListe){
    const file = fileCriteresRech();
    const i = rangCritereRech(cle);
    const libres = rechLibres
      .filter(c => c !== cle && rangCritereRech(c) >= 0 && !aMotRech(c))
      .map(c => (RECH_MOTS.find(m => m.cle === c) || {}).titre)
      .filter(t => t);
    const ligne = (i + 1) + ' / ' + file.length +
      (rechLibres.indexOf(cle) >= 0 && !aMotRech(cle) ? ' · laissé libre' : '') +
      (libres.length ? ' · ' + libres.join(', ') + ' laissé' + (libres.length > 1 ? 's' : '') + ' libre' + (libres.length > 1 ? 's' : '') : '');
    tete = '<div class="rnav">'+
        '<button class="rfle'+(i <= 0 ? ' mort' : '')+'"'+
          (i <= 0 ? ' disabled' : ' onclick="ouvrirCritereAvantRech(\''+escJs(cle)+'\')"')+'>‹</button>'+
        '<h3>'+esc(def.titre)+'</h3>'+
        '<button class="rfle'+(i >= file.length - 1 ? ' mort' : '')+'"'+
          (i >= file.length - 1 ? ' disabled' : ' onclick="ouvrirCritereSuivantRech(\''+escJs(cle)+'\')"')+'>›</button>'+
      '</div>'+
      '<p class="rcompte">'+esc(ligne)+'</p>';
  }
  openSheet(tete + choix, 'mot-rech');
  /* B1 — LA PHRASE ET SON COMPTEUR RESTENT NETS AU-DESSUS DU VOILE. C'est
     l'exigence d'Adrien : « je veux voir la phrase qui est en dehors de la
     popup ». La phrase ne bouge pas d'un pixel à l'ouverture (B1 et non B2, qui
     la faisait descendre se coller à la feuille : ce mouvement produirait le
     même effet de saut que le clignotement corrigé au point 7). */
  document.body.classList.add('rphnette');
  /* APRÈS `openSheet`, jamais avant : ouvrir une feuille joue la fermeture de la
     précédente, et celle de « Ajouter un critère » remet ce drapeau à zéro. */
  rechAjout = depuisListe ? Number(depuisListe) : 0;
}

/* ========== LOT R2, POINT 19 — « + préciser » OUVRE CE QUI RESTE ==========

   LE DÉFAUT ÉTAIT LE PLUS HANDICAPANT DES VINGT-DEUX. « + préciser » n'ouvrait
   jamais que `reste[0]`, le PREMIER critère non renseigné. Et « Peu importe » ne
   renseigne rien : il remet le mot à `null`. On retombait donc indéfiniment sur
   le même écran, et tous les critères suivants étaient inatteignables — sur
   toutes les familles, pour tout le monde.

   L'INTENTION D'ORIGINE EST CONSERVÉE : on ne montre toujours pas sept champs
   vides, la phrase reste courte et l'invitation reste unique. Ce qui change,
   c'est qu'elle ouvre UN CHOIX au lieu d'imposer toujours le même mot.

   Les six règles, telles qu'elles sont écrites au point 19 :
     1. la feuille liste TOUS les critères qui ne contraignent pas la recherche ;
     2. un critère répondu « Peu importe » y réapparaît — « peu importe » veut
        dire « aucune contrainte », donc le critère est libre, donc proposable.
        On ne distingue pas « jamais répondu » de « répondu peu importe » : les
        deux décrivent le même état de la recherche ;
     3. répondre ramène À LA LISTE, pas à la phrase — un bouton Terminé ferme ;
     4. « Peu importe » ramène aussi à la liste, et le critère y reste. Plus
        aucun cul-de-sac possible : quoi qu'on réponde, on revient à un endroit
        d'où tout est atteignable ;
     5. un critère déjà posé n'y figure pas — il se modifie en touchant son mot
        dans la phrase, comme avant ;
     6. les constantes de la famille n'y figurent jamais. */
/* 0 = on n'y est pas · 1 = la liste des critères libres (la phrase) · 2 = la
   liste complète (le jeu, où la phrase n'est pas cliquable). */
let rechAjout = 0;

/* Un critère qu'on ne peut pas changer ne se propose pas. La durée n'a de sens
   que pour un film — c'est la règle qui existait déjà, et la seule qui reste :
   depuis le point 20, l'origine n'est PLUS une constante des animés, elle y
   prend trois valeurs. */
function constanteFamilleRech(cle){
  /* La durée n'a de sens que pour un film — et « Animation » en est un, ce qui
     n'était pas le cas quand cette ligne comparait l'identifiant de famille au
     seul mot « film ». On lit le média, pas le nom de la puce. */
  return cle === 'duree' && mediaRech() !== 'movie';
}
function critLibresRech(){
  const mots = motsPhraseRech();
  return RECH_MOTS.filter(m => !mots.some(x => x.cle === m.cle) && !constanteFamilleRech(m.cle));
}
/* Un mot d'exemple par critère : « De quand ? » tout seul ne dit pas ce qu'on
   va pouvoir répondre, et une liste de titres nus se lit deux fois. */
function apercuCritereRech(cle){
  if(cle === 'genre'){
    const a = ambiancesRech();
    return a.length ? (a[0].t || a[0].mot)+', un genre…' : 'un genre…';
  }
  if(cle === 'origine') return originesRech().map(o=>o.mot).slice(0,3).join(' · ')+'…';
  if(cle === 'epoque')  return RECH_EPOQUES.slice(0,3).map(e=>e.mot).join(' · ')+'…';
  if(cle === 'duree')   return RECH_DUREES.map(d=>d.mot).join(' · ');
  if(cle === 'note')    return RECH_NOTES.map(n=>n.mot).join(' · ');
  if(cle === 'pasvu')   return "écarte ce qui est déjà dans ta bibliothèque";
  if(cle === 'plate')   return 'tes abonnements';
  return '';
}
/* Le mot déjà posé pour un critère, s'il y en a un — c'est ce qui permet à la
   version « tous » de la feuille de se lire comme la phrase. */
function motPoseRech(cle){
  const m = motsPhraseRech().find(x => x.cle === cle);
  return m ? m.mot : '';
}
/* `tous` : la version du JEU. Là-bas, la phrase n'est pas cliquable — ses mots
   ne sont pas à l'écran — et n'ouvrir que les critères LIBRES rouvrirait le
   cul-de-sac qu'on vient de fermer, à l'envers : on ne pourrait plus corriger
   un genre déjà posé sans quitter la partie. La feuille liste donc tout, en
   montrant ce qui est déjà répondu. */
function ouvrirAjoutRech(tous){
  const l = tous ? RECH_MOTS.filter(m => !constanteFamilleRech(m.cle)) : critLibresRech();
  let h = '<h3>'+(tous ? 'Les critères' : 'Ajouter un critère')+'</h3>';
  if(!l.length)
    h += '<div class="small muted">Tout est déjà posé. Touche un mot de la phrase '+
         'pour le changer.</div>';
  else
    h += '<div class="rajout">'+l.map(m=>{
      const pose = tous ? motPoseRech(m.cle) : '';
      return '<button class="rajl" onclick="ouvrirMotRech(\''+escJs(m.cle)+'\','+
             (tous?2:1)+')">'+
        '<b>'+esc(m.titre)+'</b><span'+(pose?' class="pose"':'')+'>'+
        esc(pose || apercuCritereRech(m.cle))+'</span></button>';
    }).join('')+'</div>';
  h += '<div class="choix" style="margin-top:14px">'+
       '<button class="ch raz" onclick="closeSheet()">Terminé</button></div>';
  openSheet(h, 'ajout-rech');
  rechAjout = tous ? 2 : 1;            // après `openSheet`, pour la même raison
}
/* Les genres du média courant. Sur la famille Animés, « Animation » est la
   définition du cadre : le proposer une seconde fois n'apprendrait rien. */
function genresRech(){
  const l = genresTMDB[mediaRech()] || [];
  const f = familleRech();
  return l.filter(g => !((f.anime || f.animFilm) && /animation/i.test(g.nom)))
          /* POINT 16 — les genres mesurés vides sur la puce Animés ne sont plus
             proposés : offrir une réponse qui rendra zéro est pire que ne rien
             offrir. Le retrait est mesuré, jamais supposé. */
          .filter(g => (typeof genreUtile !== 'function') || genreUtile(g.nom, f.id));
}

/* ============================== Les envies ==============================
   Des tuiles qui SONT des phrases toutes faites. Leur valeur propre : elles
   disent des choses que la phrase ne sait pas dire. « En famille » et « sans
   prise de tête » ne sont pas des genres, ce sont des contextes. Personne ne
   composera jamais « un film tous publics, de moins de 2 h, plutôt léger » —
   mais tout le monde sait dire « ce soir, en famille ». */
function blocEnviesRech(){
  const r = etatRech();
  const l = ambiancesRech();
  if(!l.length) return '';
  return '<div class="amb" data-rail="amb-rech">'+l.map(a=>
    '<button class="tuile'+(r.amb===a.id?' on':'')+'" onclick="poserAmbianceRech(\''+escJs(a.id)+'\')">'+
      esc(a.t || a.mot)+'</button>').join('')+'</div>';
}

/* ============================== La grille ==============================
   La matière de l'écran, pas sa conséquence : on peut y descendre et fouiller
   sans jamais toucher à la phrase. */
function grilleRech(){
  const r = etatRech();
  if(r.err)
    return '<div class="empty">'+I.boussole+'<h3>'+esc(r.err)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerGrilleRech()">Réessayer</button></div>';
  if(r.loading && !r.res.length)
    return '<div class="empty"><span class="spin"></span>'+
           '<p style="margin-top:12px">On cherche…</p></div>';
  if(!r.res.length && r.charge)
    return '<div class="empty">'+I.boussole+'<h3>Rien avec cette phrase</h3>'+
      '<p>Retire un mot — le compteur remontera tout de suite.</p>'+
      '<button class="btn ghost" onclick="viderRech()">Repartir de zéro</button></div>';
  let h = '<div class="gtitre">'+(r.total != null
      ? prefixeCompteurRech()+r.total.toLocaleString('fr-FR')+' résultat'+(r.total>1?'s':'')
      : 'Résultats')+'</div>'+
    '<div class="rang3">'+r.res.map(x=>jaquetteRech(x)).join('')+'</div>';
  /* « Voir plus » existe tant qu'un étage n'est pas épuisé — et non plus tant
     qu'il reste des pages à une requête unique : il n'y a plus « une » requête. */
  if(resteRech())
    h += '<div class="plus"><button class="btn ghost" onclick="chargerGrilleRech(true)"'+
         (r.loading?' disabled':'')+'>'+
         (r.loading?'<span class="spin"></span> Chargement…':'Voir plus')+'</button></div>';
  return h;
}
function jaquetteRech(x){
  const media = x.__media || mediaRech();
  const nom = media === 'tv' ? x.name : x.title;
  const date = media === 'tv' ? x.first_air_date : x.release_date;
  const n = x.vote_average ? Math.round(x.vote_average*10)/10 : null;
  /* Ce qu'on a déjà n'est pas caché — §4.1 : on demande, on a tout. Il est
     marqué, ce qui répond à la vraie question qu'on se pose en cherchant.

     POINT 21, PARTI PRIS A — DEUX PASTILLES, ET C'EST LE PLUS GRAVE DES TROIS
     DÉFAUTS QU'IL CORRIGE : L'ÉCRAN MENTAIT SUR UN FAIT. La pastille était un
     rond VERT AVEC UNE COCHE, posé dès que le titre était DANS LA BASE, vu ou
     non. Sur un film qu'Adrien venait d'ajouter à sa liste, l'app lui affirmait
     qu'il l'avait déjà vu. Adrien : « on a la coche qui dit qu'on l'a vu alors
     que ce n'est pas le cas, il faudrait changer de sigle. »

     Elle lit donc désormais le STATUT, pas la simple présence en base :
       · signet, bleu accent → le titre est dans ta liste à voir ;
       · coche, vert         → le titre est vu ;
       · rien                → il n'est pas dans ta bibliothèque.
     UN TITRE NE PEUT JAMAIS PORTER LES DEUX. C'est un cas de test.

     `statutFilm` / `statutSerie` (app-02) sont la source unique de vérité sur
     ce point : on les lit, on ne redéduit rien ici. */
  const chez = pastilleRech(x, media);
  /* LOT R2 — POINT 3. Un tap ouvre LA VRAIE FICHE, la même que depuis la
     bibliothèque : plus d'aperçu intermédiaire, et plus de bouton « Voir la
     fiche » qui n'avait d'autre objet que de rattraper l'aperçu.
     LE RETOUR RAMÈNE LA RECHERCHE INTACTE — point 8, validé le 02/08. La phrase,
     les résultats et l'état des flux vivent dans `ui.rech`, qui survit à la
     navigation ; `search` est dans `LISTES`, donc la position de défilement est
     restaurée ; et `ouvertureRech` reconnaît un retour au lieu de se fier à un
     marqueur qui se perdait selon le chemin. */
  return '<button class="jq" onclick="ouvrirTitre('+x.id+',\''+media+'\',\'search\')">'+
    '<div class="jqaff">'+posterEl(x.poster_path,'w342','',nom)+chez+'</div>'+
    '<div class="jqnom">'+esc(nom)+'</div>'+
    '<div class="jqmeta">'+esc(year(date))+
      (n?' · <span class="jqnote">'+I.star+n.toFixed(1)+'</span>':'')+'</div>'+
  '</button>';
}
/* La pastille d'une jaquette, d'après le STATUT du titre. Rend une chaîne vide
   pour un titre absent de la bibliothèque.
   `statutFilm` rend 'avoir' | 'vu' ; `statutSerie` rend 'avoir' | 'asuivre' |
   'pause' | 'fini' — pour une série, seul 'avoir' vaut le signet, tout le reste
   veut dire qu'on l'a commencée, donc vue au moins en partie. */
function pastilleRech(x, media){
  const m = media || x.__media || mediaRech();
  const o = m === 'tv' ? db.shows[x.id] : db.movies[x.id];
  if(!o) return '';
  const st = m === 'tv'
    ? (typeof statutSerie === 'function' ? statutSerie(o) : null)
    : (typeof statutFilm  === 'function' ? statutFilm(o)  : null);
  if(st === 'avoir')
    return '<span class="jqavoir" aria-label="dans ta liste à voir">'+
           (I.bookmark || '🔖')+'</span>';
  return '<span class="jqchez" aria-label="déjà vu">'+I.check+'</span>';
}
function dureeCourteRech(m){
  if(!m) return '';
  return m >= 60 ? Math.floor(m/60)+' h '+String(m%60).padStart(2,'0') : m+' min';
}

/* ===================== Ce qu'une carte doit savoir dire =====================

   LOT R2 — POINT 3 : `ouvrirDetailRech` et `peindreDetailRech` ont disparu avec
   l'aperçu de Recherche. Ces deux chargements-là RESTENT : ce n'est pas l'aperçu
   qui les demandait, c'est LE JEU, qui garde son propre aperçu pour l'instant —
   une carte doit donner de quoi décider, et une affiche seule ne suffit que
   pour les visages.
   Les plateformes ne sont demandées qu'ici, sur un titre qu'on regarde, plutôt
   que soixante fois sur des titres qu'on survole. */
async function chargerUneFicheRech(media, id){
  try{
    const d = await tmdb('/'+media+'/'+id);
    return { duree: media === 'movie' ? (d.runtime||null) : ((d.episode_run_time||[])[0]||null),
             saisons: d.number_of_seasons || null, resume: d.overview || '',
             genres: (d.genres||[]).map(g=>g.name) };
  }catch(e){ return null; }
}
async function chargerPlatesTitreRech(id, media){
  try{
    const d = await tmdb('/'+media+'/'+id+'/watch/providers');
    const fr = ((d.results||{})[REGION_PLATO]) || {};
    return (fr.flatrate || []).map(p=>p.provider_name);
  }catch(e){ return []; }
}
FERMETURES['mot-rech']   = function(){
  rechAjout = 0;
  document.body.classList.remove('rphnette');
};
FERMETURES['ajout-rech'] = function(){ rechAjout = 0; };

/* ================================= LE JEU =================================

   Une affiche à la fois, on décide. C'est la porte pour les soirs sans
   inspiration — et la sortie naturelle d'une recherche par critères : au lieu
   de lire une liste de onze, on la balaie.

   IL NE SE CONFOND JAMAIS AVEC LE DUEL (chapitre 1). Le duel vit dans Mes
   goûts, il compare deux affiches et il classe ce qu'on a DÉJÀ vu. Le jeu vit
   ici, il montre une affiche, et il choisit ce qu'on va voir CE SOIR.
   Comparer le passé, décider le présent.

   LE PAQUET NE S'ÉPUISE PAS, ET IL EST COMPOSÉ, JAMAIS TRIÉ. Empiler les
   meilleurs résultats du profil donne vingt thrillers d'affilée. D'où le
   mélange ci-dessous — et surtout d'où LE JOKER, qui est obligatoire : sans
   lui le jeu ne surprend jamais, c'est le reflet de l'utilisateur, en plus
   lent.

   Le jeu vit DANS l'écran Recherche et non dans une route à lui : une route
   nouvelle demanderait de toucher `ROUTES`, `DEPTH` et la table de la barre du
   bas, qui vit dans app-03 et n'est pas dans le périmètre de ce lot. Une barre
   du bas éteinte se lit comme une panne — c'est un défaut déjà corrigé une
   fois, on ne le rouvre pas pour une commodité. La sortie est donc un bouton
   explicite, en haut à gauche. */
/* ============ POINT 20 — LE PAQUET DU JEU **EST** LE RÉSULTAT DE LA RECHERCHE ============

   « Quand on clique sur jouer, les films qui nous sont proposés appliquent les
   mêmes filtres. Si j'ai 43 films je peux jouer avec 43 films, si j'en ai 150
   même chose. » — Adrien, 02/08.

   LES CINQ SOURCES DISPARAISSENT. `coeur`, `genres`, `incont`, `joker` et
   `proches` composaient un paquet à côté de la phrase : deux d'entre elles y
   échappaient PAR CONCEPTION — le joker est écrit « hors profil, assumé », et
   `incont` imposait ses propres planchers. L'écran annonçait 43 films et en
   proposait d'autres. Deux écrans, deux réponses à la même question.

   Le jeu tire maintenant dans EXACTEMENT ce que la grille affiche : mêmes
   paramètres, mêmes refus, mêmes relégations, même famille, même tamis. Il ne
   redemande rien de son côté — il consomme `r.res` et, quand il arrive au bout,
   il fait avancer la MÊME pagination que « Voir plus ». Il n'y a donc plus
   qu'un moteur, et la question « pourquoi ces deux écrans ne disent pas la même
   chose » ne peut plus se poser.

   CE QU'ON PERD, ET C'EST ASSUMÉ. « Parce que tu as aimé X », « Vu par un
   proche » et « Hors de tes habitudes » ne peuvent plus alimenter le jeu LANCÉ
   DEPUIS LA RECHERCHE : ils ne répondent pas à la phrase. Ils restent la
   matière de Découvrir, qui est l'écran fait pour ça. Le jeu de la Recherche
   répond à une phrase ; Découvrir propose.

   CONSÉQUENCE — LA PASTILLE `__pourquoi` N'A PLUS DE CONTENU DU TOUT. Elle
   venait des cinq sources ; sans elles, aucune carte n'a de raison à afficher.
   Elle est retirée de la carte, et LE POINT 17 DEVIENT SANS OBJET : il n'y a
   plus de libellé « Dans tes genres : … » à dédoublonner sur cet écran.

   ET IL FAUT UNE FIN DE PAQUET. Avec 43 films, on arrive au bout : l'écran le
   dit au lieu de reboucler en silence sur des titres déjà écartés. */
function ouvrirJeuRech(){
  const r = etatRech();
  r.jeu = { carte:null, media:null, i:0, ecartes:{}, gardes:0, vues:0,
            fiche:null, plates:null, fini:false,
            /* `occupe` : un ajout de série est en cours (état d'attente sur la
               carte). */
            occupe:false, loading:true, err:'', anim:'' };
  render();
  tirerCarteRech();
}
function fermerJeuRech(){ etatRech().jeu = null; jeuSeq++; render(); }

/* L'adresse de l'affiche de la prochaine carte jouable, ou rien. */
function prochaineAfficheRech(depuis){
  const r = etatRech();
  for(let k = depuis; k < r.res.length; k++){
    const x = r.res[k];
    if(jouableRech(x) && x.poster_path) return srcImage(x.poster_path, 'w780');
  }
  return '';
}

/* La famille, en version STRICTE : ici, pas de garde-fou « dans le doute on
   laisse passer ». La grille a le droit d'être un peu large plutôt que vide ;
   le jeu ne montre qu'UNE carte, et une carte hors famille est un mensonge. */
function familleStricteRech(x, media){
  const f = familleRech();
  const m = x.__media || media || mediaRech();
  if(f.media && m !== f.media) return false;
  if(f.anime || f.id === 'serie'){
    const anim = genreParNom('tv','Animation');
    if(anim == null) return false;                    // on ne sait pas : on ne sert pas
    if(!Array.isArray(x.genre_ids) || typeof x.original_language !== 'string') return false;
    const est = estAnimeRech(x, anim);
    if(f.anime && !est) return false;
    if(f.id === 'serie' && est) return false;
  }
  return true;
}

/* ===== LA CARTE SUIVANTE =====

   On avance dans `r.res`, la liste que la grille a déjà servie. Quand on en
   atteint le bout, on fait avancer la MÊME pagination — celle de « Voir plus ».
   Quand il n'y a plus rien à paginer et que tout a été montré, le paquet est
   fini, et l'écran le dit. */
async function tirerCarteRech(){
  const r = etatRech(), j = r.jeu;
  if(!j) return;
  const seq = ++jeuSeq;
  j.err = ''; j.fini = false;
  for(let garde = 0; garde < 40; garde++){
    while(j.i < r.res.length){
      const x = r.res[j.i];
      j.i++;
      if(!jouableRech(x)) continue;
      j.carte = x;
      j.media = x.__media || mediaRech();
      j.fiche = null; j.plates = null;
      j.loading = false; j.vues++;
      peindreJeuRech();
      /* POINT 7 — la fiche et les plateformes n'écrivent plus que leurs deux
         lignes de texte, et chacune revérifie que la carte n'a pas changé
         pendant son attente : sans ce contrôle, la réponse d'une carte
         balayée repeignait la suivante. */
      chargerUneFicheRech(j.media, x.id).then(f=>{
        const j2 = etatRech().jeu;
        if(!j2 || !j2.carte || j2.carte.id !== x.id || seq !== jeuSeq) return;
        j2.fiche = f; peindreMetaJeuRech();
      });
      chargerPlatesTitreRech(x.id, j.media).then(l=>{
        const j2 = etatRech().jeu;
        if(!j2 || !j2.carte || j2.carte.id !== x.id || seq !== jeuSeq) return;
        j2.plates = l; peindreMetaJeuRech();
      });
      /* POINT 7, correctif 2 — L'AFFICHE SUIVANTE EST PRÉCHARGÉE pendant qu'on
         regarde celle-ci. Le paquet est déjà tiré, l'adresse est connue : ça ne
         coûte aucune requête d'API, et c'est ce qui supprime l'écran noir entre
         deux cartes. */
      precharger(prochaineAfficheRech(j.i));
      return;
    }
    if(!resteRech()){
      /* LE BOUT DU PAQUET. On ne reboucle pas en silence. */
      j.carte = null; j.loading = false; j.fini = true;
      peindreJeuRech();
      return;
    }
    j.loading = true; peindreJeuRech();
    await chargerGrilleRech(true);
    if(seq !== jeuSeq) return;
    if(!r.res.length){ j.carte = null; j.loading = false; j.fini = true; peindreJeuRech(); return; }
  }
  j.carte = null; j.loading = false; j.fini = true;
  peindreJeuRech();
}

function jouableRech(x){
  const j = etatRech().jeu;
  const m = x.__media || mediaRech();
  /* AUCUNE carte dont l'identifiant n'est pas une suite de chiffres n'est
     distribuée. Le contrôle est ici plutôt qu'au seul rendu parce que
     l'identifiant sert aussi de chemin d'API, et pas seulement de texte dans
     un `onclick`. */
  if(!estIdTmdb(x.id)) return false;
  if(j && j.ecartes[m+':'+x.id]) return false;
  if(chezSoiRech(x, m)) return false;
  if(avisRech(m, x.id) === -1) return false;
  /* Le paquet vient désormais de la grille, qui a déjà appliqué la famille —
     ce contrôle est donc une ceinture par-dessus des bretelles. On le garde :
     c'est le seul endroit où TOUTES les cartes passent, et il coûte trois
     comparaisons. */
  if(!familleStricteRech(x, m)) return false;
  return true;
}

/* Les trois gestes (§4.7). Trois boutons VISIBLES, le balayage en raccourci :
   le geste vers le haut a été écarté, personne ne le découvre. Ceux qui
   débutent tapent, ceux qui prennent le pli balaient. */
function jeuNonRech(dejaParti){               // « Pas ce soir »
  /* LE POINT DÉLICAT. S'il valait « pas pour moi » définitivement, le catalogue
     serait brûlé en trois sessions. Ici il veut dire « pas d'humeur, là,
     maintenant », et rien de plus : le titre sort de la session, il n'est pas
     condamné, et rien n'est écrit dans le profil.
     `dejaParti` : le balayage a déjà emporté la carte sous le doigt. Rejouer
     l'animation la ferait revenir au centre avant de repartir. */
  const j = etatRech().jeu; if(!j || j.occupe) return;
  /* « Les titres déjà écartés dans la partie ne reviennent pas, mais ils
     comptent dans le total annoncé » — point 20. `ecartes` existait déjà, il
     est conservé tel quel ; le compteur, lui, lit `j.vues`. */
  if(j.carte) j.ecartes[(j.media||mediaRech())+':'+j.carte.id] = 1;
  if(dejaParti) return tirerCarteRech();
  j.anim = 'gauche'; peindreJeuRech();
  setTimeout(()=>{ if(etatRech().jeu){ etatRech().jeu.anim=''; tirerCarteRech(); } }, 160);
}
/* « Plus tard » — mise de côté : le titre part dans la liste à voir, et LE JEU
   CONTINUE. C'est une mise de côté, pas une décision : quitter la partie pour
   ça serait une punition.

   DEUX PIÈGES, TOUS DEUX CORRIGÉS APRÈS RELECTURE.

   1. `addMovie(id, false)` ÉCRASE `seen` et `watchedAt`. Sur un film déjà dans
      la bibliothèque — cas parfaitement atteignable, il suffit d'avoir appuyé
      sur « Déjà vu » quelques cartes plus tôt — ça repassait le film en « à
      voir » et effaçait la date à laquelle on l'avait vu, puis ça partait au
      serveur. On n'écrit donc RIEN sur un titre déjà connu.
   2. Une série ne s'ajoute pas d'un appel : il faut télécharger tous ses
      épisodes, ce qui prend plusieurs secondes. `addOrOpenShow` le fait bien,
      mais il quitte l'écran à la fin et cherche un bouton `#addbtn` qui
      n'existe pas ici — on restait donc plusieurs secondes sans le moindre
      signe, avant d'être éjecté du jeu. On fait le téléchargement sur place,
      avec un état d'attente visible, et on reste dans la partie. */
function jeuPlusTardRech(){
  const j = etatRech().jeu; if(!j || !j.carte || j.occupe) return;
  const x = j.carte, media = j.media;
  const suivante = ()=>{
    if(!etatRech().jeu) return;
    etatRech().jeu.gardes++;
    etatRech().jeu.anim = 'haut'; peindreJeuRech();
    setTimeout(()=>{ if(etatRech().jeu){ etatRech().jeu.anim=''; tirerCarteRech(); } }, 160);
  };
  if(chezSoiRech(x, media)) return suivante();      // déjà chez soi : ne rien écrire
  if(media === 'movie'){
    if(typeof addMovie === 'function') addMovie(x.id, false);
    return suivante();
  }
  j.occupe = 'Ajout de la série…';
  /* `render()` et pas `peindreJeuRech()` : les puces de famille vivent dans
     l'en-tête, qui n'est pas repeint par le rendu partiel. Elles doivent se
     griser elles aussi — voir `poserSerieJeuRech`. */
  render();
  fetchShowFull(x.id, (a,b)=>{
    if(!etatRech().jeu) return;
    etatRech().jeu.occupe = 'Saisons '+a+'/'+b+'…';
    peindreJeuRech();
  }).then(s=>{
    const pose = poserSerieJeuRech(x.id, s);
    if(!etatRech().jeu) return;
    etatRech().jeu.occupe = false;
    render();
    if(pose) toast('« '+s.name+' » ajoutée');
    suivante();
  }).catch(()=>{
    if(!etatRech().jeu) return;
    etatRech().jeu.occupe = false; render();
    toast("Impossible d'ajouter cette série");
  });
}
/* L'ÉCRITURE EN BASE, ISOLÉE ET GARDÉE.

   Un téléchargement de saisons dure plusieurs secondes, et l'utilisateur ne
   reste pas immobile pendant ce temps-là. Cette écriture partait sans rien
   revérifier : c'est exactement la faute qu'on venait de corriger sur « Plus
   tard », réintroduite trois lignes plus bas. Le scénario, reproduit en
   relecture — on appuie sur « Plus tard », puis sur « Déjà vu » pendant le
   téléchargement, on arrive sur la fiche, on coche la saison 1, et le
   téléchargement se termine en écrasant la série avec `watched = {}` : quatre
   épisodes cochés deviennent zéro, sans message et sans retour possible.

   Deux conditions, et il faut les deux :
     · le jeu n'est plus à l'écran → on a quitté la partie, l'ajout n'a plus
       de raison d'être et personne ne l'attend ;
     · la série est déjà en bibliothèque → elle y est arrivée autrement pendant
       le téléchargement, et ce qui s'y trouve est plus récent que ce qu'on
       tient. On n'écrase JAMAIS une bibliothèque existante avec une série
       fraîchement téléchargée, dont `watched` est vide par construction.

   Fonction à part plutôt qu'un `if` en ligne : c'est ce qui la rend testable
   sans réseau, et un garde-fou qu'aucun test ne peut prendre en défaut est un
   garde-fou qui disparaîtra. */
function poserSerieJeuRech(id, s){
  if(!etatRech().jeu) return false;
  if(db.shows[id]) return false;
  s.watched = {}; s.addedAt = Date.now();
  db.shows[id] = s; saveDB();
  return true;
}
function jeuOuiRech(){                       // « Ce soir, c'est lui »
  /* La décision se conclut par le lancement, pas par un ajout à une liste de
     plus : on ouvre la fiche, qui porte « où le regarder ». */
  const j = etatRech().jeu; if(!j || !j.carte) return;
  const x = j.carte, media = j.media;
  etatRech().jeu = null;
  if(typeof ouvrirTitre === 'function') ouvrirTitre(x.id, media, 'search');
  else render();
}
/* « Je l'ai déjà vu » A ÉTÉ RETIRÉ DE LA CARTE — point 20. Adrien : « il y a
   trop de bouton, bande-annonce et je l'ai déjà vu c'est en trop ». La carte
   passe de six boutons à quatre. « La fiche » reste, et c'est par elle qu'on
   atteint le reste, bande-annonce comprise. */

function viewJeuRech(){
  /* Pas de talon de 20 px ici, à la différence de la grille : l'arène occupe
     EXACTEMENT la hauteur visible (voir `.jarene`), et vingt pixels de plus
     suffiraient à rendre la page défilante — donc à faire glisser les trois
     boutons sous le bord de l'écran au moindre rebond. */
  return header('🎲 Le jeu', { back:'fermerJeuRech()', sub: puceFamillesRech() }) +
    '<div id="rjeu">'+corpsJeuRech()+'</div>';
}
function peindreJeuRech(){
  if(view !== 'search') return;
  const el = document.getElementById('rjeu');
  if(!el) return render();
  el.innerHTML = corpsJeuRech();
  armerBalayageJeuRech();
}
/* POINT 7, LE PLUS VISIBLE DES TROIS CORRECTIFS — et le seul qui se produise
   AFFICHE DÉJÀ CHARGÉE. La durée, le genre et le résumé arrivent après la
   carte ; ils ne changent que deux lignes de texte, et il n'y a aucune raison
   de reconstruire l'affiche pour ça. */
function peindreMetaJeuRech(){
  if(view !== 'search') return;
  const j = etatRech().jeu;
  if(!j || !j.carte) return;
  const el = document.getElementById('rjeu');
  if(!el) return;
  const zm = document.getElementById('jmeta'), zs = document.getElementById('jsyn');
  if(!zm || !zs) return peindreJeuRech();
  zm.textContent = metaJeuRech(j);
  zs.textContent = (j.fiche && j.fiche.resume) || '';
}
/* La ligne de méta, à un seul endroit : elle est écrite par le rendu complet ET
   par le rendu ciblé, et deux versions divergeraient au lot suivant. */
function metaJeuRech(j){
  const x = j.carte, media = j.media, f = j.fiche;
  const date = media === 'tv' ? x.first_air_date : x.release_date;
  const n = x.vote_average ? Math.round(x.vote_average*10)/10 : null;
  const meta = [year(date)];
  if(f && f.duree) meta.push(media === 'movie' ? dureeCourteRech(f.duree) : f.duree+' min');
  if(f && f.genres && f.genres.length) meta.push(f.genres[0]);
  if(n) meta.push(n.toFixed(1));
  if(j.plates && j.plates.length) meta.push(j.plates[0]);
  return meta.filter(Boolean).join(' · ');
}
function corpsJeuRech(){
  const j = etatRech().jeu;
  if(!j) return '';
  if(j.err)
    return '<div class="empty">'+I.boussole+'<h3>'+esc(j.err)+'</h3>'+
      '<p>Retire un mot de la phrase, ou change de famille.</p>'+
      '<button class="btn ghost" onclick="fermerJeuRech()">Revenir à la grille</button></div>';
  /* LA FIN DU PAQUET — point 20. Avec 43 films on arrive au bout : l'écran le
     dit, et il propose d'élargir la phrase ou de revenir à la grille, au lieu
     de reboucler en silence sur des titres déjà écartés. */
  if(!j.carte && j.fini){
    const n = etatRech().total;
    const gardes = j.gardes;
    return '<div class="empty jfini">'+
      '<div class="jfem">🎬</div>'+
      '<h3>'+(n != null ? 'Tu as fait le tour des '+n.toLocaleString('fr-FR') : 'Tu as fait le tour du paquet')+'</h3>'+
      '<p>'+(gardes ? 'Tu as gardé '+gardes+' titre'+(gardes>1?'s':'')+' pour plus tard. ' : '')+
        'Élargis ta phrase pour en voir d\'autres, ou reviens à la grille.</p>'+
      '<div class="jfbtn">'+
        '<button class="btn" onclick="fermerJeuRech();ouvrirAjoutRech(1)">Élargir ma recherche</button>'+
        '<button class="btn ghost" onclick="fermerJeuRech()">Revenir à la grille</button>'+
      '</div></div>';
  }
  if(!j.carte)
    return '<div class="empty"><span class="spin"></span>'+
           '<p style="margin-top:12px">On bat le paquet…</p></div>';
  const x = j.carte, media = j.media;
  const nom = media === 'tv' ? x.name : x.title;
  const date = media === 'tv' ? x.first_air_date : x.release_date;
  const f = j.fiche;

  /* La barre de critères reste sous la main pendant la partie : on oriente sa
     sélection sans jamais sortir du jeu (§4.7). */
  /* LOT R2 — point 5 : l'arène du jeu tient dans la hauteur visible, ZONES DE
     SÉCURITÉ COMPRISES, et la carte prend tout ce qui reste. C'est la seule
     façon d'agrandir nettement sans repousser un bouton hors de l'écran. */
  let h = '<div class="jarene">'+
    '<div class="jcrit">'+
      '<div class="tiny muted">'+esc(phraseTexte())+'</div>'+
      /* LE COMPTEUR « 12 / 43 » — il ne réparait rien, il RENDAIT VISIBLE le
         fait que le jeu et la grille parlent enfin des mêmes films, et il
         prépare l'écran de fin. Il faisait partie de la colonne validée par
         Adrien le 02/08, il est donc retenu. */
      (etatRech().total != null
        ? '<span class="jcpt">'+j.vues+' / '+etatRech().total.toLocaleString('fr-FR')+'</span>'
        : '')+
      '<button class="chip" onclick="ouvrirAjoutRech(1)">Critères ⚙</button></div>';

  h += '<div class="jcarte'+(j.anim?' part-'+j.anim:'')+'" id="jcarte">'+
      '<div class="jaff">'+posterEl(x.poster_path,'w780','',nom,true)+'</div>'+
      /* LA PASTILLE A DISPARU — point 20. Elle nommait la SOURCE de la carte,
         et il n'y a plus de sources : le paquet est le résultat de la
         recherche. Aucune carte n'a plus de raison à afficher, et une pastille
         vide serait pire que pas de pastille. Le point 17, qui demandait de
         dédoublonner « Dans tes genres : Action et Action & Adventure », est
         donc SANS OBJET sur cet écran. */
      /* LOT R2 — point 6. La décision en cours, révélée par le geste. Elle est
         posée sur la carte et invisible au repos : c'est elle qui rend le
         balayage lisible avant d'être terminé. */
      '<div class="jdec non" id="jdecnon">Pas ce soir</div>'+
      '<div class="jdec oui" id="jdecoui">Ce soir, c\'est lui</div>'+
      '<div class="jtxt">'+
        '<h3>'+esc(nom)+'</h3>'+
        /* POINT 7 — CES DEUX ZONES PORTENT UN IDENTIFIANT parce que ce sont
           les SEULES que l'arrivée de la fiche et des plateformes change. Avant,
           chacune de ces deux réponses repeignait `#rjeu` en entier : l'élément
           `<img>` de l'affiche était DÉTRUIT ET RECRÉÉ alors qu'il venait de
           finir de s'afficher. C'est ça, très exactement, « la jaquette
           s'affiche et se retire ». */
        '<div class="jmeta" id="jmeta">'+esc(metaJeuRech(j))+'</div>'+
        '<div class="jsyn" id="jsyn">'+esc(f ? (f.resume || '') : '')+'</div>'+
        /* Troisième verrou sur l'identifiant, au rendu cette fois : ni bouton
           ni requête sur un identifiant qui n'est pas une suite de chiffres.
           `jouableRech` l'écarte déjà en amont ; celui-ci est là pour que le
           jour où une nouvelle source de cartes apparaîtra, elle ne rouvre pas
           le trou sans que personne ne s'en aperçoive. */
        /* UN SEUL PETIT BOUTON, et son placement est validé mot pour mot par
           Adrien le 02/08 : « le i est parfaitement placé ». La bande-annonce
           et « Je l'ai déjà vu » sont parties — on atteint la première par la
           fiche, et la seconde n'avait rien à faire là. */
        (estIdTmdb(x.id)
          ? '<div class="jmini">'+
              /* GRISÉ PENDANT UN AJOUT EN COURS, comme les trois gestes du bas.
                 Le commentaire l'affirmait déjà ; le balisage, lui, ne posait
                 aucun `disabled` — et c'est le chemin de perte d'épisodes déjà
                 éprouvé ailleurs : on appuie ici, `ouvrirTitre` quitte le jeu,
                 on coche la saison 1 sur la fiche, et le téléchargement en
                 cours revient écrire par-dessus. Trouvé par le test de ce lot,
                 pas à la relecture. */
              '<button class="btn ghost mini" onclick="ouvrirTitre('+x.id+',\''+media+'\',\'search\')"'+
              (j.occupe?' disabled':'')+'>'+
              'ⓘ La fiche</button>'+
              /* LOT R2 — POINT 7. L'action quitte le coin haut-droit et rejoint
                 la ligne d'actions, sous le résumé. En pastille avec une coche,
                 elle se lisait comme une ÉTIQUETTE D'ÉTAT : elle affirmait sur
                 chaque carte quelque chose de faux. Le libellé est désormais à
                 la première personne — c'est un geste, pas un constat — et il
                 n'y a plus aucune coche : la coche est le signe d'un état.
                 GRISÉE PENDANT UN AJOUT EN COURS, comme les trois gestes du
                 bas : elle quitte le jeu, donc la laisser cliquable laissait un
                 téléchargement finir dans le vide et écraser la série qu'on
                 venait d'ouvrir. */
            '</div>'
          : '')+
      '</div>'+
    '</div>';

  /* Un ajout de série met plusieurs secondes : sans état d'attente, on croit
     que l'appui n'a pas pris et on appuie ailleurs. */
  h += '<div class="jgestes">'+
      '<button class="jg non" onclick="jeuNonRech()"'+(j.occupe?' disabled':'')+
        '><span class="ic">'+I.close+'</span>Pas ce soir</button>'+
      '<button class="jg tard" onclick="jeuPlusTardRech()"'+(j.occupe?' disabled':'')+'>'+
        (j.occupe ? '<span class="ic"><span class="spin"></span></span>'+esc(j.occupe)
                  : '<span class="ic">'+I.bookmark+'</span>Plus tard')+'</button>'+
      '<button class="jg oui" onclick="jeuOuiRech()"'+(j.occupe?' disabled':'')+
        '><span class="ic">'+I.play+'</span>Ce soir, c\'est lui</button>'+
    '</div>'+
    /* « le paquet ne s'épuise pas » EST PARTI. C'était vrai avec les cinq
       sources ; avec 43 films, c'est faux, et l'écran contredirait son propre
       écran de fin. Trouvé en faisant la maquette. */
    '<div class="jastuce">Balaie à gauche ou à droite</div>'+
  '</div>';
  return h;
}

/* ============ LOT R2, POINT 6 — LE BALAYAGE SE COMPORTE COMME TINDER ============

   Avant : `touchstart` et `touchend`, et RIEN ENTRE LES DEUX. On balayait dans
   le vide, puis la carte disparaissait d'un coup. Ce n'était pas un geste,
   c'était un raccourci caché.

   Désormais la carte SUIT LE DOIGT, s'incline légèrement, laisse apparaître la
   décision en cours, part si l'on dépasse le seuil — et REVIENT EN PLACE SINON.
   Ce retour compte autant que le départ : c'est lui qui rend le geste
   réversible, donc essayable. Sans lui, personne n'ose commencer.

   DEUX DIRECTIONS SEULEMENT, décision d'Adrien : gauche et droite. Pas de geste
   vertical — il ne se découvre pas, et vers le bas il se confond avec le
   défilement de la page. « Plus tard » et « Je l'ai déjà vu » restent donc des
   boutons visibles, et les trois gestes du bas restent la voie principale.

   LE GESTE NE S'ARME PAS DEPUIS LE BORD GAUCHE : c'est la zone du geste de
   retour d'app-02, et les deux se marcheraient dessus. Règle existante,
   conservée. */
const RECH_JEU_SEUIL = 92;      // pixels avant que la carte parte pour de bon
const RECH_JEU_BORD  = 40;      // zone du geste de retour d'app-02
function armerBalayageJeuRech(){
  const el = document.getElementById('jcarte');
  if(!el || el.dataset.arme) return;
  el.dataset.arme = '1';
  const non = document.getElementById('jdecnon'), oui = document.getElementById('jdecoui');
  let x0 = null, y0 = 0, sens = 0, parti = false;

  const poser = (dx)=>{
    const inclinaison = Math.max(-9, Math.min(9, dx / 14));
    el.style.transform = 'translate3d('+dx+'px,0,0) rotate('+inclinaison+'deg)';
    /* La décision se révèle progressivement : à mi-chemin du seuil elle est
       déjà lisible, ce qui laisse le temps de revenir en arrière. */
    const force = Math.min(1, Math.abs(dx) / RECH_JEU_SEUIL);
    if(non) non.style.opacity = dx < 0 ? force : 0;
    if(oui) oui.style.opacity = dx > 0 ? force : 0;
  };
  const remettre = ()=>{
    el.style.transition = 'transform .22s cubic-bezier(.2,.9,.3,1.15),opacity .18s ease';
    el.style.transform = '';
    if(non) non.style.opacity = 0;
    if(oui) oui.style.opacity = 0;
  };
  const emporter = (versDroite)=>{
    parti = true;
    el.style.transition = 'transform .18s ease-out,opacity .18s ease-out';
    el.style.transform = 'translate3d('+(versDroite?140:-140)+'%,0,0) rotate('+
                         (versDroite?12:-12)+'deg)';
    el.style.opacity = '0';
    /* L'action part APRÈS le mouvement : « Ce soir, c'est lui » quitte l'écran,
       « Pas ce soir » tire la carte suivante — et il sait que celle-ci est déjà
       partie, donc il ne rejoue pas l'animation. */
    setTimeout(()=>{ versDroite ? jeuOuiRech() : jeuNonRech(true); }, 175);
  };

  el.addEventListener('touchstart', e=>{
    const j = etatRech().jeu;
    if(parti || (j && j.occupe)) { x0 = null; return; }
    const t = e.touches[0];
    if(t.clientX <= RECH_JEU_BORD){ x0 = null; return; }
    x0 = t.clientX; y0 = t.clientY; sens = 0;
    el.style.transition = 'none';
  }, {passive:true});

  /* `passive:false` est nécessaire ET suffisant : sans lui, la page défile
     pendant qu'on balaie et la carte se traîne derrière le doigt. On ne coupe
     le défilement qu'une fois le geste RECONNU comme horizontal, sinon on
     confisquerait le défilement vertical de la page. */
  el.addEventListener('touchmove', e=>{
    if(x0 === null || parti) return;
    const t = e.touches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if(!sens){
      if(Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      sens = Math.abs(dx) > Math.abs(dy) ? 1 : -1;
      if(sens < 0){ x0 = null; remettre(); return; }   // geste vertical : on rend la main
    }
    e.preventDefault();
    poser(dx);
  }, {passive:false});

  const fin = e=>{
    if(x0 === null || parti) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0;
    x0 = null;
    if(sens > 0 && Math.abs(dx) >= RECH_JEU_SEUIL) emporter(dx > 0);
    else remettre();
  };
  el.addEventListener('touchend', fin, {passive:true});
  /* Un appel, une notification, un doigt qui sort de l'écran : sans ça la carte
     resterait plantée de travers, à moitié décidée. */
  el.addEventListener('touchcancel', ()=>{ if(!parti){ x0 = null; remettre(); } }, {passive:true});
}
