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
const RECH_VOTES_MINI = 80;      // plancher de votes de la grille
const RECH_JEU_STOCK = 6;        // en dessous, une source va chercher la suite

let rechTimer = null, rechSeq = 0, rechAbort = null, grilleSeq = 0, jeuSeq = 0;

/* ============================== Les familles =============================
   Les quatre puces restent en haut, collantes (§4.4). Ce ne sont pas des
   filtres parmi d'autres : c'est le premier mot de la phrase, et c'est lui qui
   décide à quel point de terminaison de TMDB on parle. */
const RECH_FAMILLES = [
  { id:'tout',  label:'Tout',   art:'quelque chose', nom:'titres' },
  { id:'film',  label:'Films',  art:'un film',  media:'movie', nom:'films' },
  { id:'serie', label:'Séries', art:'une série', media:'tv',   nom:'séries' },
  { id:'anime', label:'Animés', art:'un animé', media:'tv', anime:true, nom:'animés' }
];
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
const RECH_AMBIANCES = [
  { id:'famille', t:'Un film en famille', mesure:490,
    ing:[ { cle:'genre', mot:'familial', p:{ with_genres:'10751', without_genres:'27,53,80,18' } },
          { cle:'duree', mot:'de moins de 2 h', p:{ 'with_runtime.lte':'115' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'6.3' } } ],
    fond:{ 'vote_count.gte':'500' }, genresProfil:['Familial','Aventure','Animation'] },

  { id:'rigoler', t:'Envie de rigoler', mesure:456,
    /* La comédie dramatique est écartée : sans ça elle remonte en masse, et
       ce n'est pas ce qu'on demande quand on veut rigoler. */
    ing:[ { cle:'genre', mot:'comique', p:{ with_genres:'35', without_genres:'18' } },
          { cle:'duree', mot:'de moins de 2 h 05', p:{ 'with_runtime.lte':'125' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'6.5' } } ],
    fond:{ 'vote_count.gte':'1500' }, genresProfil:['Comédie'] },

  { id:'action', t:"De l'action sans prise de tête", mesure:331,
    /* SEUL CAS SANS CONTRAINTE DE NOTE, et c'est délibéré : demander un film
       sans prise de tête en exigeant 7,5 de moyenne est contradictoire. Ici le
       critère de qualité, c'est la notoriété. */
    ing:[ { cle:'genre', mot:"plein d'action", p:{ with_genres:'28,12' } },
          { cle:'duree', mot:'de moins de 2 h 05', p:{ 'with_runtime.lte':'125' } } ],
    fond:{ 'vote_count.gte':'1500' }, genresProfil:['Action','Aventure'] },

  { id:'peur', t:'Ça fait peur', mesure:366,
    ing:[ { cle:'genre', mot:'qui fait peur', p:{ with_genres:'27,53' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'6' } } ],
    fond:{ 'vote_count.gte':'500' }, genresProfil:['Horreur','Thriller'] },

  { id:'classique', t:"Un classique que j'ai raté", mesure:195,
    /* En années glissantes, jamais en date fixe : sinon la recette vieillit
       toute seule. `dateMoins` est calculée à l'appel. */
    ing:[ { cle:'epoque', mot:'sorti il y a plus de 15 ans', p:{ __ansAvant:15 } },
          { cle:'note',   mot:'très bien noté', p:{ 'vote_average.gte':'7.5' } } ],
    fond:{ 'vote_count.gte':'5000' }, genresProfil:[] },

  { id:'long', t:'Long et prenant', mesure:256,
    ing:[ { cle:'duree', mot:'de plus de 2 h 15', p:{ 'with_runtime.gte':'135' } },
          { cle:'note',  mot:'très bien noté', p:{ 'vote_average.gte':'7.5' } } ],
    fond:{ 'vote_count.gte':'1000' }, genresProfil:[] },

  { id:'court', t:"Court, moins d'1 h 35", mesure:434,
    ing:[ { cle:'duree', mot:"de moins d'1 h 35", p:{ 'with_runtime.gte':'60', 'with_runtime.lte':'95' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'6.8' } } ],
    fond:{ 'vote_count.gte':'1500' }, genresProfil:[] },

  { id:'reflechir', t:'Ça fait réfléchir', mesure:325,
    ing:[ { cle:'genre', mot:'qui fait réfléchir', p:{ with_genres:'18|878' } },
          { cle:'note',  mot:'très bien noté', p:{ 'vote_average.gte':'7.5' } } ],
    fond:{ 'vote_count.gte':'3000' }, genresProfil:['Drame','Science-Fiction'] },

  { id:'vraie', t:'Une histoire vraie', mesure:278,
    ing:[ { cle:'genre', mot:'tiré du réel', p:{ with_keywords:'9672' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'6.8' } } ],
    fond:{ 'vote_count.gte':'800' }, genresProfil:['Histoire','Drame'] },

  { id:'docu', t:'Du vrai (documentaire)', mesure:302,
    ing:[ { cle:'genre', mot:'documentaire', p:{ with_genres:'99' } },
          { cle:'note',  mot:'bien noté', p:{ 'vote_average.gte':'7' } } ],
    fond:{ 'vote_count.gte':'150' }, genresProfil:['Documentaire'] }
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

/* La langue d'origine, pas le pays — voir le pavé d'en-tête. Les libellés
   disent « en français » et pas « français » pour ne pas faire croire à une
   nationalité. */
const RECH_LANGUES = [
  { id:'fr', mot:'en français' }, { id:'en', mot:'en anglais' },
  { id:'ko', mot:'en coréen' },   { id:'ja', mot:'en japonais' },
  { id:'es', mot:'en espagnol' }, { id:'it', mot:'en italien' },
  { id:'de', mot:'en allemand' }, { id:'da', mot:'en danois' }
];
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
  { cle:'genre',  titre:'Genre ou ambiance' },
  { cle:'langue', titre:"En quelle langue ?" },
  { cle:'epoque', titre:'De quand ?' },
  { cle:'duree',  titre:'Combien de temps ?' },
  { cle:'note',   titre:'Exigeant ?' },
  { cle:'plate',  titre:'Où tu regardes ?' }
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
    amb:null, sans:[], genre:null, langue:null, epoque:null, duree:null, note:null, plate:null,
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
  if(params && params.rechOuvert) return false;
  /* ON ÉTAIT DÉJÀ SUR RECHERCHE. `go()` ne reconnaît plus l'écran comme
     identique dès que le marqueur est posé — il compare `params` à `{}` — et
     réappuyer machinalement sur l'onglet où l'on se trouve jetait donc la
     phrase composée. Le DOM le dit sans qu'on ait à tenir un état de plus :
     quand cette fonction s'exécute, `render()` n'a pas encore remplacé
     l'écran, et l'ancien porte toujours son marqueur. */
  const dejaLa = !!(document.getElementById('rres') || document.getElementById('rjeu'));
  if(params) params.rechOuvert = 1;
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
    r.reprise = { texte:avant, fam:r.fam, amb:r.amb, sans:r.sans.slice(), genre:r.genre,
                  langue:r.langue, epoque:r.epoque, duree:r.duree, note:r.note, plate:r.plate };
  r.q = ''; r.qtitres = []; r.qgens = []; r.qerr = '';
  r.amb = null; r.sans = []; r.genre = null; r.langue = null;
  r.epoque = null; r.duree = null; r.note = null; r.plate = null;
  r.jeu = null;
  r.touche = false;
  phraseDuJour();
  r.res = []; r.total = null; r.page = 1; r.pages = 1; r.charge = false; r.err = '';
}
function reprendreRech(){
  const r = etatRech(), v = r.reprise;
  if(!v) return;
  r.fam = v.fam; r.amb = v.amb; r.sans = v.sans.slice(); r.genre = v.genre;
  r.langue = v.langue; r.epoque = v.epoque; r.duree = v.duree; r.note = v.note; r.plate = v.plate;
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
  const gouts = (typeof genresRetenus === 'function') ? genresRetenus() : [];
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
  r.genre = null; r.touche = true;
  if(id !== 'film') r.duree = null;     // la durée ne veut rien dire hors du film
  relancerRech();
}

/* La liste des ambiances disponibles pour la famille en cours. Séries et
   « Tout » n'en ont aucune : aucune recette n'a été mesurée pour elles, et la
   règle 3 du §4.6 est formelle — si on ne sait pas l'écrire, ça n'existe pas.
   Ces deux familles se règlent au genre TMDB, qui est mesuré. */
function ambiancesRech(){
  const f = familleRech();
  if(f.anime) return RECH_ANIMES;
  if(f.id === 'film') return RECH_AMBIANCES;
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
  r.sans = []; r.genre = null; r.touche = true;
  if(r.amb) r.duree = r.note = null;    // l'ambiance les porte déjà
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
  r[cle] = val; r.touche = true;
  /* Un mot explicite l'emporte sur l'ingrédient de même nature : on ne peut
     pas demander « bien noté » et « très bien noté » à la fois. */
  if(val != null && r.amb && r.sans.indexOf(cle) < 0){
    const a = ambianceRech(r.amb);
    if(a && (a.ing||[]).some(i => i.cle === cle)) r.sans.push(cle);
  }
  if(cle === 'genre' && val != null){ r.amb = null; r.sans = []; }
  closeSheet();
  relancerRech();
}
function viderRech(){
  const r = etatRech();
  clearTimeout(rechTimer); avorterRech();
  r.q = ''; r.qtitres = []; r.qgens = [];
  r.amb = null; r.sans = []; r.genre = null; r.langue = null;
  r.epoque = null; r.duree = null; r.note = null; r.plate = null;
  r.touche = true;
  relancerRech();
}
function relancerRech(){
  const r = etatRech();
  r.res = []; r.total = null; r.page = 1; r.pages = 1; r.charge = false; r.err = '';
  oublierDefil('search');
  /* LES CRITÈRES RESTENT SOUS LA MAIN PENDANT LA PARTIE (§4.7) — encore
     faut-il qu'ils fassent quelque chose. Les cinq tas ont été constitués avec
     l'ancienne demande : les vider est la seule façon que la carte suivante
     obéisse à ce qu'on vient de demander. Sans ça, la puce s'allumait, la
     phrase changeait, et les cinq cartes suivantes étaient encore des films.
     `ecartes` est conservé : ce qu'on a déjà écarté ce soir le reste. */
  if(r.jeu){
    r.jeu.pool = {}; r.jeu.page = {}; r.jeu.carte = null;
    r.jeu.source = null; r.jeu.precedente = null;
    r.jeu.fiche = null; r.jeu.plates = null; r.jeu.err = ''; r.jeu.loading = true;
    render();
    tirerCarteRech();
    return;
  }
  render();
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
    if(familleRech().anime) await chargerGenres('tv');
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
    r.qtitres = garderAnimesRech(titres).slice(0, RECH_TITRES);
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
/* La famille Animés est japonaise ET animée par définition : TMDB ne sait pas
   filtrer `/search`, on le fait chez nous. Et si les résultats ne portent pas
   l'information, on ne filtre pas à l'aveugle plutôt que de vider l'écran. */
function garderAnimesRech(res){
  if(!familleRech().anime) return res;
  const anim = genreParNom('tv','Animation');
  if(anim == null) return res;
  const utilisables = res.every(x => x && typeof x.original_language === 'string' && Array.isArray(x.genre_ids));
  if(!utilisables) return res;
  return res.filter(x => x.original_language === 'ja' && x.genre_ids.indexOf(anim) >= 0);
}
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
function paramsRech(media){
  const r = etatRech(), f = familleRech();
  const p = { include_adult:'false', page:'1', sort_by:'popularity.desc' };
  p['vote_count.gte'] = String(RECH_VOTES_MINI);
  const champDate = media === 'movie' ? 'primary_release_date' : 'first_air_date';

  /* 1. La famille. Pour les animés, la langue et le genre Animation sont la
     DÉFINITION du cadre, pas une préférence. Le genre reste un ET (une seule
     valeur, sans barre) : mélanger virgule et barre dans `with_genres` fait
     ignorer en silence tout ce qui suit la barre — mesuré le 29/07. */
  if(f.anime){
    p.with_original_language = 'ja';
    const anim = genreParNom('tv','Animation');
    if(anim != null) p.with_genres = String(anim);
  }

  /* 2. L'ambiance mesurée. Ses paramètres sont recopiés tels quels. */
  const a = ambianceRech(r.amb);
  if(a){
    if(a.mots){                                   // sous-genre d'animé
      p.with_keywords = a.mots;
    }else{
      ingredientsRech().forEach(i => {
        Object.keys(i.p).forEach(k => {
          if(k === '__ansAvant') p[champDate+'.lte'] = dateMoinsRech(i.p[k]);
          else p[k] = i.p[k];
        });
      });
      Object.assign(p, a.fond || {});
    }
  }

  /* 3. Les mots explicites. Ils passent APRÈS l'ambiance : un mot posé à la
     main l'emporte toujours sur l'ingrédient qu'il recouvre. */
  if(r.genre){
    const id = genreParNom(media, r.genre);
    /* Les genres n'ont pas les mêmes noms côté films et côté séries. Quand le
       genre demandé n'existe pas pour ce média, on ne l'expédie pas — mieux
       vaut ne pas filtrer que filtrer sur rien. */
    if(id != null){
      /* SUR LA FAMILLE ANIMÉS, LE GENRE CHOISI S'AJOUTE À « Animation », il ne
         le remplace pas et il ne se fait pas jeter. La VIRGULE est un ET chez
         TMDB, et c'est mesuré ; c'est le mélange virgule + barre verticale qui
         est cassé, pas la virgule seule. Avant cette correction, le mot
         s'écrivait dans la phrase et ne changeait rien à la demande : un mot
         qui ne fait rien est pire que pas de mot du tout. */
      p.with_genres = (f.anime && p.with_genres)
        ? p.with_genres + ',' + id
        : String(id);
    }
  }
  if(r.langue) p.with_original_language = r.langue;
  const ep = RECH_EPOQUES.find(x => x.id === r.epoque);
  if(ep){ p[champDate+'.gte'] = ep.de; p[champDate+'.lte'] = ep.a; }
  const du = RECH_DUREES.find(x => x.id === r.duree);
  if(du && media === 'movie') Object.assign(p, du.p);
  const no = RECH_NOTES.find(x => x.id === r.note);
  if(no){
    p['vote_average.gte'] = String(no.v);
    /* Trier ou filtrer par la note EXIGE un plancher de votes, sinon un 10/10
       à trois voix passe devant tout. C'est la même constante que Découvrir. */
    p['vote_count.gte'] = String(Math.max(RECH_VOTES_MINI, DISC_VOTES_MINI));
  }
  if(r.plate){
    const ids = platesChoisiesRech();
    if(ids.length){
      p.with_watch_providers = ids.join('|');
      p.watch_region = REGION_PLATO;
      p.with_watch_monetization_types = 'flatrate';
    }
  }
  return p;
}
function platesChoisiesRech(){
  const r = etatRech(), mes = (typeof mesPlates === 'function') ? mesPlates() : [];
  if(r.plate === 'mes') return mes.map(x => x.id);
  const un = mes.find(x => String(x.id) === String(r.plate));
  return un ? [un.id] : [];
}

async function chargerGrilleRech(suite){
  const r = etatRech();
  const seq = ++grilleSeq;
  if(!suite){ r.res = []; r.page = 1; r.total = null; }
  else r.page = r.page + 1;
  r.loading = true; r.err = '';
  peindreRech();
  try{
    const médias = mediasRech();
    await Promise.all(médias.map(m => chargerGenres(m).catch(()=>null)));
    if(seq !== grilleSeq) return;
    let trouves = [], total = 0, pages = 1;
    for(const m of médias){
      let pris = [], pageLue = r.page, pagesTotal = 1;
      for(let tour = 0; tour < RECH_PAGES_MAX; tour++){
        const p = paramsRech(m);
        p.page = String(pageLue);
        const d = await tmdb('/discover/'+m, p);
        if(seq !== grilleSeq) return;
        pagesTotal = d.total_pages || 1;
        if(tour === 0) total += (d.total_results || 0);
        pris = pris.concat((d.results||[]).filter(x => x && x.poster_path)
                                          .map(x => Object.assign({ __media:m }, x)));
        if(pris.length >= RECH_CIBLE / médias.length || pageLue >= pagesTotal) break;
        pageLue++;
      }
      pages = Math.max(pages, pagesTotal);
      trouves = trouves.concat(garderAnimesRech(pris));
    }
    /* Le classement de TMDB bouge entre deux requêtes : un même titre peut
       figurer sur deux pages voisines. Sans ce tamis il apparaîtrait deux fois. */
    const vus = {};
    (suite ? r.res : []).forEach(x => { vus[x.__media+':'+x.id] = 1; });
    trouves = trouves.filter(x => vus[x.__media+':'+x.id] ? false : (vus[x.__media+':'+x.id] = 1));
    /* §4.1 — LE PROFIL TRIE, IL NE RETIRE JAMAIS. Rien n'est écarté ici : ni ce
       qu'on a déjà (marqué d'une coche, pas caché), ni ce qui ne ressemble pas
       aux goûts. On demande des comédies des années 90 : on les a toutes. */
    trouves = trierParGout(trouves);
    r.res = suite ? r.res.concat(trouves) : trouves;
    r.total = total; r.pages = pages;
    r.loading = false; r.charge = true; r.err = '';
    peindreRech();
  }catch(e){
    if(seq !== grilleSeq) return;
    if(suite) r.page = Math.max(1, r.page - 1);
    r.loading = false; r.charge = true;
    r.err = (e && e.message === 'BADKEY') ? 'Service indisponible' : 'Pas de connexion';
    peindreRech();
  }
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
  if(typeof genresRetenus === 'function') ajoute(genresRetenus(), 3);
  return poids;
}
/* TRIE, NE FILTRE JAMAIS. La liste rendue a exactement la même longueur que
   celle reçue : c'est vérifié par un cas de test, parce que c'est le genre de
   règle qu'un « petit filtre bien pratique » casse six mois plus tard. */
function trierParGout(liste){
  const poids = profilGenresRech();
  if(!Object.keys(poids).length) return liste;
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
  return liste
    .map((x, i) => ({ x:x, s:score(x), i:i }))
    .sort((a,b)=> (b.s - a.s) || (a.i - b.i))
    .map(o => o.x);
}

/* ================================ L'écran ================================ */

function viewRecherche(){
  if(ouvertureRech()) nouvelleOuvertureRech();
  const r = etatRech();
  if(r.jeu) return viewJeuRech();
  const sub = champRech() + puceFamillesRech();
  if(!r.charge && !r.loading && !r.res.length && !enRechercheTitre()) chargerGrilleRech();
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
function motsPhraseRech(){
  const r = etatRech(), out = [];
  const ing = ingredientsRech();
  const a = ambianceRech(r.amb);
  /* Un sous-genre d'animé n'a qu'un mot : lui-même. */
  if(a && a.mots) out.push({ cle:'genre', mot:a.mot, amb:true });
  else ing.forEach(i => out.push({ cle:i.cle, mot:i.mot, amb:true }));
  RECH_MOTS.forEach(m=>{
    if(out.some(o => o.cle === m.cle && o.amb)) return;   // déjà dit par l'ambiance
    if(m.cle === 'genre' && r.genre) out.push({ cle:'genre', mot:r.genre.toLowerCase() });
    if(m.cle === 'langue' && r.langue){
      const l = RECH_LANGUES.find(x=>x.id===r.langue); if(l) out.push({ cle:'langue', mot:l.mot });
    }
    if(m.cle === 'epoque' && r.epoque){
      const e = RECH_EPOQUES.find(x=>x.id===r.epoque); if(e) out.push({ cle:'epoque', mot:e.mot });
    }
    if(m.cle === 'duree' && r.duree && r.fam === 'film'){
      const d = RECH_DUREES.find(x=>x.id===r.duree); if(d) out.push({ cle:'duree', mot:d.mot });
    }
    if(m.cle === 'note' && r.note){
      const n = RECH_NOTES.find(x=>x.id===r.note); if(n) out.push({ cle:'note', mot:n.mot });
    }
    if(m.cle === 'plate' && r.plate) out.push({ cle:'plate', mot:libellePlateRech() });
  });
  /* L'ordre de LECTURE, pas l'ordre de pose : « un film comique français des
     années 90 de moins de 2 h » se lit tout seul. */
  /* `rang[cle] || 9` serait faux : le rang du genre vaut ZÉRO, et zéro est
     faux en JavaScript — le genre se retrouvait en fin de phrase, « un film
     bien noté documentaire ». Attrapé par la vérification d'écran. */
  const rang = { genre:0, langue:1, epoque:2, duree:3, note:4, plate:5 };
  const rg = c => (rang[c] == null ? 9 : rang[c]);
  return out.sort((a2,b)=> rg(a2.cle) - rg(b.cle));
}
function libellePlateRech(){
  const r = etatRech();
  if(r.plate === 'mes') return 'sur mes plateformes';
  const un = ((typeof mesPlates === 'function') ? mesPlates() : []).find(x => String(x.id) === String(r.plate));
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
     et une seule invitation à l'affiner. */
  const reste = RECH_MOTS.filter(m => !mots.some(x => x.cle === m.cle) &&
                                      !(m.cle === 'duree' && r.fam !== 'film'));
  if(reste.length)
    h += '<button class="rmot vide" onclick="ouvrirMotRech(\''+escJs(reste[0].cle)+'\')">+ préciser</button>';
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
            : '<b id="rnb">'+n.toLocaleString('fr-FR')+'</b> '+esc(familleRech().nom);
  return '<div class="rbarre"><div class="rnb">'+txt+'</div>'+
    '<button class="btn mini" onclick="ouvrirJeuRech()">🎲 Jouer</button></div>';
}

/* La feuille d'un mot. Une courte liste, et « peu importe » toujours en bas :
   un mot qu'on ne peut pas retirer n'est pas un mot, c'est un piège. */
function ouvrirMotRech(cle){
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
          bouton(g.nom, 'poserMotRech(\'genre\',\''+escJs(g.nom)+'\')', r.genre === g.nom)).join('')+'</div>';
  }
  else if(cle === 'langue')
    choix = '<div class="choix">'+RECH_LANGUES.map(l=>
      bouton(l.mot, 'poserMotRech(\'langue\',\''+escJs(l.id)+'\')', r.langue === l.id)).join('')+'</div>';
  else if(cle === 'epoque')
    choix = '<div class="choix">'+RECH_EPOQUES.map(e=>
      bouton(e.mot, 'poserMotRech(\'epoque\',\''+escJs(e.id)+'\')', r.epoque === e.id)).join('')+'</div>';
  else if(cle === 'duree')
    choix = '<div class="choix">'+RECH_DUREES.map(d=>
      bouton(d.mot, 'poserMotRech(\'duree\',\''+escJs(d.id)+'\')', r.duree === d.id)).join('')+'</div>'+
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
        bouton('sur mes plateformes', 'poserMotRech(\'plate\',\'mes\')', r.plate === 'mes')+
        mes.map(p => bouton('sur '+p.nom, 'poserMotRech(\'plate\',\''+escJs(String(p.id))+'\')',
                            String(r.plate) === String(p.id))).join('')+'</div>';
  }
  /* La sortie. Sur un ingrédient d'ambiance, retirer le mot retire
     l'ingrédient de la recette — c'est ce qui rend la recette corrigible. */
  const surAmbiance = motsPhraseRech().some(m => m.cle === cle && m.amb);
  choix += '<div class="choix" style="margin-top:14px">'+
    '<button class="ch raz" onclick="'+(surAmbiance
      ? 'closeSheet();retirerIngredientRech(\''+escJs(cle)+'\')'
      : 'poserMotRech(\''+escJs(cle)+'\',null)')+'">Peu importe</button></div>';
  openSheet('<h3>'+esc(def.titre)+'</h3>'+choix, 'mot-rech');
}
/* Les genres du média courant. Sur la famille Animés, « Animation » est la
   définition du cadre : le proposer une seconde fois n'apprendrait rien. */
function genresRech(){
  const l = genresTMDB[mediaRech()] || [];
  return l.filter(g => !(familleRech().anime && /animation/i.test(g.nom)));
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
      ? r.total.toLocaleString('fr-FR')+' résultat'+(r.total>1?'s':'')
      : 'Résultats')+'</div>'+
    '<div class="rang3">'+r.res.map(x=>jaquetteRech(x)).join('')+'</div>';
  if(r.page < r.pages)
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
     marqué, ce qui répond à la vraie question qu'on se pose en cherchant. */
  const chez = chezSoiRech(x, media)
    ? '<span class="jqchez" aria-label="dans ta bibliothèque">'+I.check+'</span>' : '';
  return '<button class="jq" onclick="ouvrirDetailRech('+x.id+',\''+media+'\')">'+
    '<div class="jqaff">'+posterEl(x.poster_path,'w342','',nom)+chez+'</div>'+
    '<div class="jqnom">'+esc(nom)+'</div>'+
    '<div class="jqmeta">'+esc(year(date))+
      (n?' · <span class="jqnote">'+I.star+n.toFixed(1)+'</span>':'')+'</div>'+
  '</button>';
}
function dureeCourteRech(m){
  if(!m) return '';
  return m >= 60 ? Math.floor(m/60)+' h '+String(m%60).padStart(2,'0') : m+' min';
}

/* ========================== La feuille de détail ==========================
   Le synopsis est à un appui plutôt que toujours là. Les plateformes ne sont
   demandées QU'ICI, à l'ouverture : une requête sur un titre qu'on regarde,
   plutôt que soixante sur des titres qu'on survole. */
let detailRech = { id:null, media:null, fiche:null, plates:null };
function ouvrirDetailRech(id, media){
  const r = etatRech();
  const x = (r.res.concat(r.qtitres)).find(y => y.id === id && (y.__media||media) === media);
  if(!x) return;
  detailRech = { id:id, media:media, fiche:null, plates:null };
  peindreDetailRech(x);
  chargerUneFicheRech(media, id).then(f=>{
    if(detailRech.id !== id) return;
    detailRech.fiche = f; peindreDetailRech(x);
  });
  chargerPlatesTitreRech(id, media).then(l=>{
    if(detailRech.id !== id) return;
    detailRech.plates = l; peindreDetailRech(x);
  });
}
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
function peindreDetailRech(x){
  const media = detailRech.media;
  const nom = media === 'tv' ? x.name : x.title;
  const date = media === 'tv' ? x.first_air_date : x.release_date;
  const f = detailRech.fiche;
  const n = x.vote_average ? Math.round(x.vote_average*10)/10 : null;
  const bouts = [year(date)];
  if(f && f.duree) bouts.push(media === 'movie' ? dureeCourteRech(f.duree) : f.duree+' min par épisode');
  if(f && f.saisons) bouts.push(f.saisons+' saison'+(f.saisons>1?'s':''));
  if(f && f.genres && f.genres.length) bouts.push(f.genres.slice(0,2).join(', '));
  const ou = detailRech.plates === null ? ''
    : detailRech.plates.length
      ? '<div class="dou">Inclus dans '+esc(detailRech.plates.slice(0,3).join(', '))+'</div>'
      : '<div class="dou muted">Pas dans un abonnement en France</div>';
  const h = '<div class="ddet">'+
      '<div class="daff">'+posterEl(x.poster_path,'w342','',nom)+'</div>'+
      '<div class="dinfo"><h3>'+esc(nom)+'</h3>'+
        '<div class="tiny muted">'+esc(bouts.filter(Boolean).join(' · '))+
          (n?' · <span style="color:var(--warn);font-weight:700">'+I.star+n.toFixed(1)+'</span>':'')+'</div>'+
        ou+'</div></div>'+
    (f ? '<div class="dsyn">'+esc(f.resume || 'Pas de résumé.')+'</div>'
       : '<div class="dsyn muted"><span class="spin"></span></div>')+
    '<div class="dact">'+
      '<button class="btn" onclick="closeSheet();ouvrirTitre('+x.id+',\''+media+'\',\'search\')">'+
      'Voir la fiche</button></div>';
  openSheet(h, 'detail-rech');
}
FERMETURES['detail-rech'] = function(){ detailRech = { id:null, media:null, fiche:null, plates:null }; };
FERMETURES['mot-rech'] = function(){};

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
const RECH_JEU_SOURCES = [
  { cle:'coeur',   part:40 },
  { cle:'genres',  part:25 },
  { cle:'proches', part:15 },
  { cle:'incont',  part:10 },
  { cle:'joker',   part:10 }
];
function ouvrirJeuRech(){
  const r = etatRech();
  r.jeu = { carte:null, media:null, source:null, precedente:null,
            pool:{}, page:{}, ecartes:{}, fiche:null, plates:null,
            /* `occupe` : un ajout de série est en cours (état d'attente sur la
               carte). `bascule` : films / séries à tour de rôle sur « Tout ». */
            occupe:false, bascule:false,
            loading:true, err:'', anim:'' };
  render();
  tirerCarteRech();
}
function fermerJeuRech(){ etatRech().jeu = null; jeuSeq++; render(); }

/* Les trois filtres implicites du §4.7, appliqués quand on lance le jeu SANS
   aucun critère. Ils ne s'appliquent qu'au jeu : c'est lui qui doit rendre UNE
   carte jouable ce soir, pas une liste exhaustive.
     1. pas vu ;
     2. disponible sur les plateformes déclarées — le filtre le plus important
        et le plus oublié : proposer à 21 h un film qu'on ne peut pas lancer
        est la pire frustration possible. Recherche, c'est maintenant ;
     3. pas de genre exclu. */
function paramsJeuRech(media){
  const r = etatRech();
  const p = paramsRech(media);
  const critères = !!(r.amb || r.genre || r.langue || r.epoque || r.duree || r.note || r.plate);
  if(!critères){
    const mes = (typeof mesPlates === 'function') ? mesPlates() : [];
    if(mes.length){
      p.with_watch_providers = mes.map(x=>x.id).join('|');
      p.watch_region = REGION_PLATO;
      p.with_watch_monetization_types = 'flatrate';
    }
  }
  const exclus = (db.gouts && db.gouts.exclus) || [];
  const ids = exclus.map(n => genreParNom(media, n)).filter(x => x != null);
  /* `without_genres` peut déjà être posé par une recette : on complète au lieu
     d'écraser, sinon on annule silencieusement un ingrédient mesuré. */
  if(ids.length) p.without_genres = (p.without_genres ? p.without_genres+',' : '') + ids.join(',');
  return p;
}
/* Chaque source remplit son propre tas. Un tas vide est sauté ; le joker, lui,
   est toujours tenté — c'est la seule source obligatoire. */
/* SUR LA PUCE « TOUT », films et séries à tour de rôle. `mediaRech()` rend le
   premier des deux, c'est-à-dire toujours `movie` : le jeu ne proposait jamais
   une seule série sur « Tout ». La grille, elle, interroge les deux points de
   terminaison et entrelace — mais le jeu ne tire qu'une carte, il faut donc
   choisir, et alterner est la seule façon de tenir la promesse de la puce. */
function mediaJeuRech(){
  const f = familleRech();
  if(f.media) return f.media;
  const j = etatRech().jeu;
  if(!j) return 'movie';
  j.bascule = !j.bascule;
  return j.bascule ? 'movie' : 'tv';
}
async function remplirSourceRech(cle){
  const r = etatRech(), j = r.jeu;
  if(!j) return [];
  const media = mediaJeuRech();
  j.page[cle] = (j.page[cle] || 0) + 1;
  try{
    if(cle === 'coeur'){
      /* Les voisins des titres préférés. Le point de départ vient du podium
         quand il existe, d'un 👍 sinon, de la bibliothèque en dernier recours —
         c'est l'échelle de dégradation du §2.4, et elle ne bloque rien. */
      const dep = departJeuRech();
      if(!dep) return [];
      const d = await tmdb('/'+dep.media+'/'+dep.id+'/recommendations', { page:String(j.page[cle]) });
      j.raison = j.raison || {};
      return (d.results||[]).map(x => Object.assign({ __media:dep.media, __pourquoi:'Parce que tu as aimé '+dep.nom }, x));
    }
    if(cle === 'genres'){
      const p = paramsJeuRech(media);
      p.page = String(j.page[cle]);
      const gs = (typeof genresRetenus === 'function') ? genresRetenus() : [];
      const ids = gs.map(n => genreParNom(media, n)).filter(x => x != null);
      if(ids.length && !familleRech().anime) p.with_genres = ids.join('|');
      const d = await tmdb('/discover/'+media, p);
      const lib = gs.length ? gs.slice(0,2).join(' et ') : 'ce que tu regardes';
      return (d.results||[]).map(x => Object.assign({ __media:media, __pourquoi:'Dans tes genres : '+lib }, x));
    }
    if(cle === 'proches') return await vusParProchesRech(media);
    if(cle === 'incont'){
      /* Les incontournables ratés : très forte reconnaissance, et pas dans la
         bibliothèque. On respecte les genres explicitement exclus — c'est une
         consigne donnée par l'utilisateur, pas une borne de genre. */
      const p = paramsJeuRech(media);
      p.page = String(j.page[cle]);
      p['vote_count.gte'] = '5000'; p['vote_average.gte'] = '7.5';
      p.sort_by = 'vote_count.desc';
      const d = await tmdb('/discover/'+media, p);
      return (d.results||[]).map(x => Object.assign({ __media:media, __pourquoi:"Un incontournable que tu n'as pas vu" }, x));
    }
    /* LE JOKER. Hors profil, assumé : aucun genre du profil, aucune ambiance,
       aucun tri par le goût. Seuls les genres exclus et les plateformes
       restent — un joker qu'on ne peut pas lancer n'est pas un joker. */
    const p = { include_adult:'false', sort_by:'popularity.desc',
                'vote_count.gte':'300', page:String(1 + (j.page.joker || 1) * 3) };
    if(familleRech().anime){
      p.with_original_language = 'ja';
      const anim = genreParNom(media,'Animation');
      if(anim != null) p.with_genres = String(anim);
    }
    const mes = (typeof mesPlates === 'function') ? mesPlates() : [];
    if(mes.length){
      p.with_watch_providers = mes.map(x=>x.id).join('|');
      p.watch_region = REGION_PLATO;
      p.with_watch_monetization_types = 'flatrate';
    }
    const exclus = ((db.gouts && db.gouts.exclus) || [])
      .map(n => genreParNom(media, n)).filter(x => x != null);
    if(exclus.length) p.without_genres = exclus.join(',');
    const d = await tmdb('/discover/'+media, p);
    return (d.results||[]).map(x => Object.assign({ __media:media, __pourquoi:'Hors de tes habitudes' }, x));
  }catch(e){ return []; }
}
/* D'où part « dans l'esprit de ». Le podium en premier — c'est un choix
   explicite —, un 👍 ensuite, la bibliothèque en dernier. Aucune de ces
   sources n'est obligatoire : sans rien, la source rend un tas vide et le
   paquet se compose des quatre autres. */
function departJeuRech(){
  const pod = db.podium || {};
  const parFam = { film:'movie', serie:'tv', anime:'tv' };
  for(const k of ['film','serie','anime']){
    const id = (pod[k]||[])[0];
    if(id == null) continue;
    const m = parFam[k];
    const o = m === 'tv' ? db.shows[id] : db.movies[id];
    if(o) return { media:m, id:id, nom:(o.name||o.title||'') };
  }
  for(const m of ['movie','tv']){
    const a = (db.avis && db.avis[m]) || {};
    const id = Object.keys(a).find(k => a[k] && a[k].v === 1);
    if(id){
      const o = m === 'tv' ? db.shows[id] : db.movies[id];
      if(o) return { media:m, id:Number(id), nom:(o.name||o.title||'') };
    }
  }
  const aimés = (typeof titresAimes === 'function') ? titresAimes() : [];
  const t = aimés.find(x => x && x.nom);
  return t ? { media:t.media, id:t.id, nom:t.nom } : null;
}
/* Vu par les proches. Aucune donnée nouvelle à collecter : le partage existe
   déjà. Sans cercle, pas de source — et surtout aucune invitation ici. Les
   bibliothèques déjà en mémoire sont utilisées telles quelles ; une seule est
   demandée au serveur par partie, pour ne pas faire payer une cascade réseau
   à quelqu'un qui voulait juste une affiche. */
async function vusParProchesRech(media){
  const suivis = (typeof partage === 'object' && partage && partage.suivis) || [];
  if(!suivis.length) return [];
  const cle = media === 'tv' ? 'shows' : 'movies';
  let dispo = suivis.filter(p => biblios[p.id]);
  if(!dispo.length){
    try{ await chargerBiblio(suivis[0].id); }catch(e){}
    dispo = suivis.filter(p => biblios[p.id]);
  }
  const compte = {};
  dispo.forEach(p=>{
    const b = biblios[p.id] || {};
    Object.values(b[cle] || {}).forEach(o=>{
      if(!o || o.id == null) return;
      /* FRONTIÈRE DE CONFIANCE. Ces objets viennent de la colonne `data` d'une
         AUTRE personne, qu'elle peut écrire par appel direct à l'API. Son
         identifiant part ensuite dans un `onclick` et dans un chemin d'API :
         un identifiant qui n'est pas une suite de chiffres n'entre pas dans le
         paquet, point. C'est la règle déjà écrite dans app-07 (`estIdTmdb`), et
         PAS un échappement — `escJs` laisserait passer un identifiant absurde
         jusqu'à `/tv/<n'importe quoi>` côté relais. */
      if(!estIdTmdb(o.id)) return;
      const k = String(o.id);
      if(!compte[k]) compte[k] = { n:0, o:o };
      compte[k].n++;
    });
  });
  /* L'ordre fait toute la valeur de la rangée, puisqu'elle est unique :
     d'abord combien de proches l'ont — c'est le principe de corroboration. */
  return Object.values(compte)
    .sort((a,b)=> b.n - a.n)
    .map(e => ({ __media:media, __pourquoi: e.n > 1 ? e.n+' de tes proches l\'ont' : 'Vu par un proche',
                 id:e.o.id, title:e.o.title, name:e.o.name,
                 poster_path:e.o.poster, release_date:e.o.date, first_air_date:e.o.first,
                 vote_average:e.o.note, genre_ids:[] }))
    .slice(0, 30);
}
/* Le choix de la source suivante : à la part, mais JAMAIS DEUX CARTES DE LA
   MÊME SOURCE À LA SUITE. C'est ce qui empêche le paquet de redevenir une
   liste triée. */
function sourceSuivanteRech(){
  const j = etatRech().jeu;
  const libres = RECH_JEU_SOURCES.filter(s => s.cle !== j.precedente &&
                                              (j.pool[s.cle]||[]).length);
  const l = libres.length ? libres
          : RECH_JEU_SOURCES.filter(s => (j.pool[s.cle]||[]).length);
  if(!l.length) return null;
  const total = l.reduce((a,s)=>a+s.part, 0);
  let t = Math.random() * total;
  for(const s of l){ t -= s.part; if(t <= 0) return s.cle; }
  return l[l.length-1].cle;
}
async function tirerCarteRech(){
  const r = etatRech(), j = r.jeu;
  if(!j) return;
  const seq = ++jeuSeq;
  j.loading = true; j.err = ''; j.fiche = null; j.plates = null;
  peindreJeuRech();
  /* On garnit les tas qui s'épuisent — le paquet ne s'épuise pas, il n'y a pas
     de « 20 cartes », on rejoue tant qu'on veut. */
  const àRemplir = RECH_JEU_SOURCES.filter(s => (j.pool[s.cle]||[]).length < RECH_JEU_STOCK);
  if(àRemplir.length){
    const lots = await Promise.all(àRemplir.map(s => remplirSourceRech(s.cle)));
    if(seq !== jeuSeq || !r.jeu) return;
    àRemplir.forEach((s,i)=>{
      const propre = (lots[i]||[]).filter(x => x && x.poster_path && jouableRech(x));
      j.pool[s.cle] = (j.pool[s.cle]||[]).concat(propre);
    });
  }
  /* LES CINQ TAS SONT REMPLIS EN MÊME TEMPS : un même titre peut donc se
     trouver dans deux d'entre eux, et le contrôle fait au remplissage a pu
     être démenti depuis — un « Déjà vu » sur la carte précédente vient
     justement de faire entrer ce titre dans la bibliothèque. On revérifie donc
     AU MOMENT DE DISTRIBUER, et on reprend une carte si celle-ci ne va plus.
     Le tour de boucle est borné : un tas vide fait rendre `null` à
     `sourceSuivanteRech`, et on s'arrête. */
  let cle = null, x = null;
  for(let essai = 0; essai < 40; essai++){
    cle = sourceSuivanteRech();
    if(!cle) break;
    const cand = j.pool[cle].shift();
    if(cand && jouableRech(cand)){ x = cand; break; }
  }
  if(!x){
    j.loading = false;
    j.err = 'Plus rien à proposer avec cette phrase.';
    peindreJeuRech(); return;
  }
  j.carte = x; j.media = x.__media; j.source = cle; j.precedente = cle;
  j.ecartes[x.__media+':'+x.id] = 1;
  j.loading = false;
  peindreJeuRech();
  /* La carte doit donner de quoi décider : trancher sur une affiche seule ne
     marche que pour les visages. Fiche et plateformes arrivent après coup, la
     carte s'affiche sans les attendre. */
  const id = x.id, media = x.__media;
  chargerUneFicheRech(media, id).then(f=>{
    if(seq !== jeuSeq || !r.jeu || r.jeu.carte !== x) return;
    r.jeu.fiche = f; peindreJeuRech();
  });
  chargerPlatesTitreRech(id, media).then(l=>{
    if(seq !== jeuSeq || !r.jeu || r.jeu.carte !== x) return;
    r.jeu.plates = l; peindreJeuRech();
  });
  /* La bande-annonce passe par le chemin déjà en place (app-05) : il gère le
     repli anglais et le lecteur plein écran. */
  if(typeof chargerFiche === 'function') chargerFiche(media, id);
}
/* Un titre jouable : pas déjà sorti de la session, pas dans la bibliothèque,
   pas marqué 👎. Le 👎 est le seul avis qui retire quelque chose, et c'est le
   contrat qui le dit : poids 0, exclu. */
function jouableRech(x){
  const j = etatRech().jeu;
  const m = x.__media || mediaRech();
  /* Deuxième verrou, après celui de `vusParProchesRech` : AUCUNE carte dont
     l'identifiant n'est pas une suite de chiffres n'est distribuée. Le contrôle
     est ici plutôt qu'au seul rendu parce que l'identifiant sert aussi de
     chemin d'API, et pas seulement de texte dans un `onclick`. */
  if(!estIdTmdb(x.id)) return false;
  if(j && j.ecartes[m+':'+x.id]) return false;
  if(chezSoiRech(x, m)) return false;
  if(avisRech(m, x.id) === -1) return false;
  return true;
}

/* Les trois gestes (§4.7). Trois boutons VISIBLES, le balayage en raccourci :
   le geste vers le haut a été écarté, personne ne le découvre. Ceux qui
   débutent tapent, ceux qui prennent le pli balaient. */
function jeuNonRech(){                       // « Pas ce soir »
  /* LE POINT DÉLICAT. S'il valait « pas pour moi » définitivement, le catalogue
     serait brûlé en trois sessions. Ici il veut dire « pas d'humeur, là,
     maintenant », et rien de plus : le titre sort de la session, il n'est pas
     condamné, et rien n'est écrit dans le profil. */
  const j = etatRech().jeu; if(!j) return;
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
/* « Déjà vu » — l'occasion cachée. Tomber sur un titre déjà vu n'est pas une
   erreur du moteur, c'est une occasion : un tap et il entre dans la
   bibliothèque. Le jeu enrichit le profil pendant qu'on cherche.
   Pour un film, l'ajout est immédiat. Pour une série, il faut choisir où l'on
   en est : on ouvre sa fiche plutôt que de cocher soixante épisodes à sa
   place. */
function jeuDejaVuRech(){
  const j = etatRech().jeu; if(!j || !j.carte) return;
  const x = j.carte, media = j.media;
  if(media === 'movie'){
    if(typeof addMovie === 'function') addMovie(x.id, true);
    tirerCarteRech();
  }else{
    etatRech().jeu = null;
    if(typeof ouvrirTitre === 'function') ouvrirTitre(x.id, media, 'search');
  }
}

function viewJeuRech(){
  return header('🎲 Le jeu', { back:'fermerJeuRech()', sub: puceFamillesRech() }) +
    '<div id="rjeu">'+corpsJeuRech()+'</div>'+
    '<div style="height:20px"></div>';
}
function peindreJeuRech(){
  if(view !== 'search') return;
  const el = document.getElementById('rjeu');
  if(!el) return render();
  el.innerHTML = corpsJeuRech();
  armerBalayageJeuRech();
}
function corpsJeuRech(){
  const j = etatRech().jeu;
  if(!j) return '';
  if(j.err)
    return '<div class="empty">'+I.boussole+'<h3>'+esc(j.err)+'</h3>'+
      '<p>Retire un mot de la phrase, ou change de famille.</p>'+
      '<button class="btn ghost" onclick="fermerJeuRech()">Revenir à la grille</button></div>';
  if(!j.carte)
    return '<div class="empty"><span class="spin"></span>'+
           '<p style="margin-top:12px">On bat le paquet…</p></div>';
  const x = j.carte, media = j.media;
  const nom = media === 'tv' ? x.name : x.title;
  const date = media === 'tv' ? x.first_air_date : x.release_date;
  const f = j.fiche;
  const n = x.vote_average ? Math.round(x.vote_average*10)/10 : null;
  const meta = [year(date)];
  if(f && f.duree) meta.push(media === 'movie' ? dureeCourteRech(f.duree) : f.duree+' min');
  if(f && f.genres && f.genres.length) meta.push(f.genres[0]);
  if(n) meta.push(n.toFixed(1));
  if(j.plates && j.plates.length) meta.push(j.plates[0]);

  /* La barre de critères reste sous la main pendant la partie : on oriente sa
     sélection sans jamais sortir du jeu (§4.7). */
  let h = '<div class="wrap" style="padding-top:10px;display:flex;gap:8px;align-items:center">'+
      '<div class="tiny muted" style="flex:1">'+esc(phraseTexte())+'</div>'+
      '<button class="chip" onclick="ouvrirMotRech(\'genre\')">Critères ⚙</button></div>';

  h += '<div class="jcarte'+(j.anim?' part-'+j.anim:'')+'" id="jcarte">'+
      '<div class="jaff">'+posterEl(x.poster_path,'w780','',nom)+'</div>'+
      /* La raison, en haut à gauche. Même règle qu'au chapitre 3 : jamais de
         titre sans explication lisible. */
      '<div class="jsrc">'+esc(x.__pourquoi || '')+'</div>'+
      /* GRISÉ PENDANT UN AJOUT EN COURS, comme les trois gestes du bas. Il ne
     l'était pas, et c'était le chemin qui menait à la perte d'épisodes : il
     quitte le jeu, donc il laissait un téléchargement finir dans le vide et
     écraser la série qu'on venait d'ouvrir. */
  '<button class="jdeja" onclick="event.stopPropagation();jeuDejaVuRech()"'+
    (j.occupe?' disabled':'')+'>'+I.check+' Déjà vu</button>'+
      '<div class="jtxt">'+
        '<h3>'+esc(nom)+'</h3>'+
        '<div class="jmeta">'+esc(meta.filter(Boolean).join(' · '))+'</div>'+
        '<div class="jsyn">'+esc(f ? (f.resume || '') : '')+'</div>'+
        /* Troisième verrou sur l'identifiant, au rendu cette fois : ni bouton
           ni requête sur un identifiant qui n'est pas une suite de chiffres.
           `jouableRech` l'écarte déjà en amont ; celui-ci est là pour que le
           jour où une nouvelle source de cartes apparaîtra, elle ne rouvre pas
           le trou sans que personne ne s'en aperçoive. */
        (estIdTmdb(x.id)
          ? '<div class="jmini">'+
              (typeof zoneBande === 'function' ? zoneBande(media, x.id) : '')+
              '<button class="btn ghost mini" onclick="ouvrirTitre('+x.id+',\''+media+'\',\'search\')">'+
              'ⓘ La fiche</button>'+
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
    '<div class="jastuce">Balaie à gauche ou à droite pour aller plus vite · le paquet ne s\'épuise pas</div>';
  return h;
}

/* Le balayage, en RACCOURCI seulement — les trois boutons restent la voie
   principale. Le geste ne s'arme pas depuis le bord gauche : c'est la zone du
   geste de retour d'app-02, et les deux se marcheraient dessus. */
function armerBalayageJeuRech(){
  const el = document.getElementById('jcarte');
  if(!el || el.dataset.arme) return;
  el.dataset.arme = '1';
  let x0 = null, y0 = 0, t0 = 0;
  el.addEventListener('touchstart', e=>{
    const t = e.touches[0];
    if(t.clientX <= 40){ x0 = null; return; }
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, {passive:true});
  el.addEventListener('touchend', e=>{
    if(x0 === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
    x0 = null;
    if(dy > 60 || Date.now() - t0 > 900) return;
    if(dx < -70) jeuNonRech();
    else if(dx > 70) jeuOuiRech();
  }, {passive:true});
}
