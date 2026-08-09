"use strict";
/* ===========================================================================
   LOT C — le parcours d'inscription

   Pourquoi ce fichier existe. L'inscription ne sert pas à créer un compte :
   elle sert à ce que le PREMIER écran Découvrir ne soit pas vide (spec §5.1).
   Quelqu'un qui arrive n'a rien dit de ses goûts, donc l'app ne peut rien lui
   proposer. Cinq étapes remplissent le profil en trois minutes.

   Le parcours complet : Compte → Avatar → 50 jaquettes → Style → Plateformes
   → Fin. Les deux premières existaient déjà (`viewAccount` en app-07,
   `viewAvatar` en app-03) ; ce fichier porte les quatre suivantes, et
   `finirAvatar` les enchaîne.

   ---------------------------------------------------------------------------
   CE QU'IL FAUT AVOIR EN TÊTE AVANT DE TOUCHER À CE FICHIER

   1. RIEN N'ENTRE DANS LA BIBLIOTHÈQUE (§5.5). Taper une jaquette ne coche
      aucun épisode et n'ajoute rien à `db.shows` ni `db.movies`. L'inscription
      remplit le PROFIL DE GOÛT, pas la bibliothèque. Sinon les séries tapées
      arriveraient à 0 épisode sur 62 et pollueraient « À rattraper » dès le
      premier jour, avec des titres vus il y a dix ans. C'est le point le plus
      important du lot ; un test le garde (`test.html`).

   2. LA QUESTION EST « AIMÉS », PAS « VUS » (§5.5). Même geste, plus
      d'information : un titre tapé est vu ET aimé. Un titre non tapé n'est
      rien — ni vu, ni rejeté. C'est ce qui donne tout de suite les 👍 dont les
      rangées de cœur ont besoin.

   3. LE COMPTEUR NE DONNE JAMAIS DE CHIFFRE-OBJECTIF (§5.5). Annoncer « 5,
      c'est bien pour démarrer » fixe une cible et l'utilisateur s'arrête à 5.
      Le message commente et pousse toujours vers le haut. Aucun minimum
      bloquant, et « je verrai plus tard » reste accessible partout.

   4. LES SOUS-GENRES D'ANIMÉ SONT MESURÉS, PAS DEVINÉS. Les neuf entrées
      viennent de `recettes.md`, mesurées le 31/07/2026 contre le relais TMDB.
      Une dixième (« post-apo ») a été écartée : 4 titres, ce n'est pas une
      catégorie. « romance scolaire » aussi : non mesurable simplement. Ne pas
      les rajouter sans une mesure.

   5. LE CONTRAT DE DONNÉES EST FIGÉ. Trois lots travaillent en parallèle sur
      des branches séparées et écrivent tous dans le même `db`. La forme
      ci-dessous ne s'invente pas, ne se renomme pas, ne s'améliore pas.

        db.avis = { tv:    { "<tmdbId>": { v: 1 | -1, quand: <ms> } },
                    movie: { "<tmdbId>": { v: 1 | -1, quand: <ms> } } }

        v: 1 = aimé · v: -1 = pas aimé · absent = NON QUALIFIÉ
        `quand` arbitre la fusion entre appareils : le plus récent gagne.

      Un titre peut avoir un avis SANS être dans la bibliothèque. C'est normal
      et voulu : le profil de goût et la bibliothèque sont deux choses
      différentes.

      `db.avis` EST SYNCHRONISÉ — voir `payload()` et `fusionnerAvis`, app-01.
      (C3, 09/08 : ces lignes disaient le contraire depuis que la clé a été
      ajoutée à `payload()`. Un commentaire faux est pire qu'un commentaire
      absent — celui-ci invitait à écrire dans `db.avis` sans pierre tombale,
      ce qui est exactement le défaut que C3 répare plus bas.)

   ---------------------------------------------------------------------------
   UNE LIMITE CONNUE, SIGNALÉE PLUTÔT QUE CONTOURNÉE

   · AUCUNE MESURE TMDB EN DIRECT N'A ÉTÉ POSSIBLE pendant l'écriture de ce
     lot (ni le conteneur ni un navigateur connecté n'atteignaient le relais).
     Toutes les requêtes ci-dessous n'emploient donc QUE des paramètres déjà
     mesurés et déjà en production ailleurs dans l'app : `sort_by=vote_count.desc`
     (voir `chargerPresAffiches`, app-03), `with_original_language=ja` +
     `with_genres=16` (la puce Animés, app-04), `page`. Aucun paramètre neuf.
=========================================================================== */

/* ---------------------------------------------------------------------------
   Le contrat de données — création et accès
--------------------------------------------------------------------------- */

/* Appelée par `boot()` avant le premier rendu. Même rôle que `migrerGouts` :
   garantir la forme, jamais transformer. Idempotente. */
function inscMigrerAvis(){
  if(!db.avis || typeof db.avis !== 'object' || Array.isArray(db.avis)) db.avis = {};
  if(!db.avis.tv    || typeof db.avis.tv    !== 'object') db.avis.tv    = {};
  if(!db.avis.movie || typeof db.avis.movie !== 'object') db.avis.movie = {};
}

/* Le seau d'un média. `movie` d'un côté, tout le reste dans `tv` : ce sont les
   deux seuls types que TMDB connaît, et les deux seuls que le contrat nomme. */
function inscSeau(media){
  inscMigrerAvis();
  return db.avis[media === 'movie' ? 'movie' : 'tv'];
}

/* 1 = aimé, -1 = pas aimé, 0 = non qualifié. Un `0` n'est PAS un rejet :
   c'est l'absence de réponse, et c'est une réponse valide (§1.3). */
function inscAvis(media, id){
  const a = inscSeau(media)[String(id)];
  return (a && (a.v === 1 || a.v === -1)) ? a.v : 0;
}

/* Le passage unique pour écrire un avis pendant l'inscription. `v` vaut 1, -1,
   ou 0 pour retirer.

   C3 (09/08) — IL ÉCRIVAIT DANS `db.avis` EN DIRECT, ET C'ÉTAIT LE DÉFAUT.
   Retirer un avis se faisait par un `delete` nu, sans poser de pierre tombale
   dans `db.avisRetires`. Or `fusionnerAvis` (app-01) n'arbitre QUE sur ces
   pierres : un titre absent d'un côté et présent de l'autre est repris, faute
   de savoir qu'il a été retiré. Retirer un 👍 pendant l'inscription, avec une
   synchro entre les deux gestes, le faisait donc REVENIR — la grille se
   rallumait toute seule sur un titre qu'on venait d'éteindre, et le profil
   déduit repartait avec.

   On délègue aux deux fonctions d'app-11 qui savent le faire : mêmes clés,
   mêmes dates, mêmes pierres tombales, et un seul comportement à maintenir
   pour toute l'app au lieu de deux qui divergent.

   `poserAvis` BASCULE quand on repose le pouce déjà en place. Ce n'est pas
   gênant ici : `inscBascTitre` calcule l'état visé avant d'appeler, et ne
   redemande jamais celui qui est déjà posé. Et le `saveDB` a disparu parce
   qu'`apresAvis`, au bout des deux, le fait déjà. */
function inscPoserAvis(media, id, v){
  inscMigrerAvis();
  /* Même repli que `inscSeau` : `movie` d'un côté, tout le reste dans `tv`.
     app-11 prend la clé telle quelle et ne replie rien. */
  const m = (media === 'movie') ? 'movie' : 'tv';
  if(v === 1 || v === -1) poserAvis(m, id, v);
  else retirerAvis(m, id);
}

/* Combien de titres ont reçu un 👍. Sert au compteur et au récapitulatif. */
function inscNbAimes(){
  inscMigrerAvis();
  let n = 0;
  ['tv','movie'].forEach(m=>{
    const seau = db.avis[m];
    Object.keys(seau).forEach(k=>{ if(seau[k] && seau[k].v === 1) n++; });
  });
  return n;
}

/* ---------------------------------------------------------------------------
   Les listes de l'étape « Style »

   Les libellés sont les noms de genres TMDB en français, tels que relevés en
   direct (voir l'état des lieux technique). Ce n'est pas de la coquetterie :
   `genreParNom` (app-04) compare le nom stocké dans `db.gouts.genres` au nom
   rendu par TMDB. Un libellé inventé — « policier » là où TMDB dit « Crime » —
   serait accepté à l'écran, enregistré, puis silencieusement ignoré par le
   moteur. L'écran mentirait.

   Deux écarts assumés par rapport à la liste de la spec §5.6, tous deux
   signalés dans le compte rendu :

   · « animé » n'est pas un genre TMDB et n'entre donc PAS dans
     `db.gouts.genres`. C'est un interrupteur à part (`db.gouts.animeOui`) dont
     le seul rôle est de faire apparaître le second niveau — ce qui est
     exactement ce que la spec lui demande de faire.
   · « biopic » est retiré : `recettes.md` le laisse « à mesurer », et la
     règle 3 du §4.6 dit qu'une recette qu'on ne sait pas écrire n'existe pas.
   · « sport » est gardé, parce que la spec le nomme explicitement comme l'un
     des trois oublis à réparer, et parce que `recettes.md` en donne une
     recette mesurée (mot-clé 6075, 150 titres côté films). Il n'a pas encore
     de consommateur dans le moteur : la réponse est enregistrée, elle ne
     pilote rien tant que la recette n'est pas branchée. Signalé.
--------------------------------------------------------------------------- */
const INSC_GENRES = [
  'Action', 'Aventure', 'Animation', 'Comédie', 'Crime', 'Documentaire',
  'Drame', 'Familial', 'Fantastique', 'Guerre', 'Histoire', 'Horreur',
  'Musique', 'Mystère', 'Romance', 'Science-Fiction', 'Sport', 'Thriller',
  'Western'
];

/* Les neuf sous-genres d'animé de `recettes.md`, dans l'ordre de la spec §5.6
   moins les trois entrées que la règle 3 a écartées. Les identifiants de
   mots-clés sont recopiés tels quels : ils ont été MESURÉS, ils ne se
   devinent pas. `shonen` a deux orthographes dans TMDB (`shounen` et
   `shonen`) — les demander en OU double le catalogue disponible ; c'est
   précisément le genre de détail qu'on ne retrouve pas si on le perd.

   Ils ne servent à rien dans ce fichier : l'inscription n'écrit que les clés
   dans `db.gouts.animeSous`. Ils sont ici pour que le jour où Recherche ou la
   vitrine les consommera, personne n'ait à les remesurer. */
const INSC_ANIME_SOUS = [
  { cle:'shonen',        motcle:'207826|378884', mesure:542 },
  { cle:'seinen',        motcle:'195668',        mesure:389 },
  { cle:'shoujo',        motcle:'206437',        mesure:194 },
  { cle:'isekai',        motcle:'237451',        mesure:188 },
  { cle:'tranche de vie',motcle:'9914',          mesure:841 },
  { cle:'mecha',         motcle:'10046',         mesure:376 },
  { cle:'dark fantasy',  motcle:'177895',        mesure:66  },
  { cle:'sport',         motcle:'6075',          mesure:174 },
  { cle:'psychologique', motcle:'272553|12565',  mesure:190 }
];

/* ---------------------------------------------------------------------------
   Les quatorze plateformes de la spec §5.7, dans l'ordre de l'usage réel en
   France. La liste inclut délibérément ce qu'on oublie toujours : les deux
   services d'animés, les chaînes gratuites, et le cinéma d'auteur.

   On ne code AUCUN identifiant en dur. Les identifiants et les logos viennent
   de `/watch/providers` (chargé par `chargerPlates`, app-04) et sont
   rapprochés par le nom : un identifiant inventé renvoie une liste vide, pas
   une erreur — c'est la faute la plus coûteuse qu'on puisse faire ici, et
   elle est invisible. Les motifs sont larges parce que TMDB nomme les
   services de plusieurs façons selon les pays et les époques.

   Une entrée que TMDB ne connaît pas n'est simplement pas affichée : mieux
   vaut treize tuiles justes qu'une quatorzième qui n'enregistre rien. */
const INSC_PLATES = [
  { nom:'Netflix',      motif:/^netflix$/i },
  { nom:'Prime Video',  motif:/^amazon prime video$|^prime video$/i },
  { nom:'Disney+',      motif:/^disney ?plus$|^disney\+$/i },
  { nom:'Canal+',       motif:/^canal\+$|^canal plus$/i },
  { nom:'Apple TV+',    motif:/^apple tv ?\+$|^apple tv ?plus$/i },
  { nom:'Crunchyroll',  motif:/^crunchyroll$/i },
  { nom:'ADN',          motif:/^adn$|animation digital network/i },
  { nom:'Paramount+',   motif:/^paramount ?\+$|^paramount ?plus$/i },
  { nom:'Max',          motif:/^max$|^hbo max$/i },
  { nom:'OCS',          motif:/^ocs$|^ocs go$/i },
  { nom:'Arte',         motif:/^arte$/i },
  { nom:'france.tv',    motif:/^france\.?tv$|^france tv$/i },
  { nom:'MUBI',         motif:/^mubi$/i },
  { nom:'Molotov',      motif:/^molotov$|^molotov channels/i }
];

/* ---------------------------------------------------------------------------
   L'état du parcours

   `db.inscription` n'existe QUE pendant le parcours, et n'est créé que par
   `demarrerInscription`. C'est volontaire : les comptes déjà en service n'ont
   pas cette clé, donc rien ne change pour eux — ni au démarrage, ni ailleurs.
   Reprendre une inscription abandonnée ne concerne que ceux qui l'ont
   réellement commencée.
--------------------------------------------------------------------------- */
const INSC_VUES = { inscTitres:3, inscStyle:4, inscPlates:5, inscFin:6 };
const INSC_ORDRE = ['inscTitres', 'inscStyle', 'inscPlates', 'inscFin'];

/* Le vivier de jaquettes, la fournée en cours, l'état du chargement. En
   mémoire seulement : une grille parcourue ne mérite pas d'être enregistrée. */
let inscGrille = { etat:'froid', err:'', fournee:0, titres:[], vus:{}, encours:false };

/* Le pré-remplissage de l'étape Style ne se fait qu'UNE fois, sinon corriger
   deviendrait impossible : chaque rendu remettrait les genres déduits par-dessus
   la correction. Même piège que dans la maquette, où le drapeau existe déjà. */
let inscStylePreRempli = false;

function inscriptionEnCours(){
  return !!(db.inscription && !db.inscription.finie && INSC_VUES[db.inscription.vue]);
}

/* Entrée dans le parcours, depuis `finirAvatar`. */
function demarrerInscription(){
  if(!db.gouts) return go(ecranDArrivee());          // migrerGouts n'a pas tourné : on n'invente rien
  inscMigrerAvis();
  /* `genres` retient le genre dominant de CHAQUE titre montré, par « media:id ».
     Il est enregistré, et pas seulement gardé en mémoire, pour deux raisons :
     la grille se recharge — la fournée suivante remplace la précédente, et
     sans cette mémoire les titres aimés au premier tour perdraient leur genre —
     et l'inscription peut être reprise après la fermeture de l'app.
     Sans lui, l'étape Style arrive VIDE, et tout son intérêt disparaît :
     corriger est plus rapide que composer (§5.6).

     La mémoire EXISTANTE est reprise, jamais recréée : le bouton retour
     d'Android ramène à l'écran de l'avatar, et réappuyer sur « Continuer »
     repasse ici. Repartir d'un objet vide effaçait les genres alors que les
     titres aimés, eux, survivaient — « Ton style » arrivait vide par ce
     chemin-là aussi. */
  db.inscription = { vue:'inscTitres', debut: Date.now(), finie:false,
                     genres: (db.inscription && db.inscription.genres) || {} };
  inscStylePreRempli = false;
  inscGrille = { etat:'froid', err:'', fournee:0, titres:[], vus:{}, encours:false };
  saveDB();
  go('inscTitres');
}

/* Reprise après un abandon en cours de route (l'app fermée entre deux étapes).
   Appelée par `boot()`, et seulement si une inscription est réellement en
   cours : un compte ancien n'a pas `db.inscription` et n'est jamais dérouté. */
function reprendreInscription(){
  if(!inscriptionEnCours()) return false;
  go(db.inscription.vue, {}, 'none', { remplacer:true });
  return true;
}

function inscAller(vue){
  if(db.inscription) { db.inscription.vue = vue; saveDB(); }
  go(vue);
}

/* La sortie de secours, disponible à chaque étape. « Je verrai plus tard » est
   une réponse valide : rien n'est obligatoire dans ce parcours, et l'écrire
   n'est pas une politesse — sans porte de sortie visible, on répond au hasard
   et on récolte du bruit en croyant récolter du signal (§1.5). */
function inscPasser(){
  const i = INSC_ORDRE.indexOf(view);
  /* Passer depuis la dernière étape utile mène au récapitulatif, pas dehors :
     l'utilisateur vient de donner trois minutes, il doit voir ce que ça a
     produit avant même d'entrer (§5.8). */
  if(i >= 0 && i < INSC_ORDRE.length - 1) return inscAller(INSC_ORDRE[i + 1]);
  inscTerminer();
}

/* La fin du parcours. Un seul endroit ferme l'inscription, pour qu'il n'y ait
   qu'un seul endroit à relire. */
function inscTerminer(){
  /* On ne garde que le fait que le parcours a eu lieu. La mémoire des genres
     pesait une centaine d'entrées et n'a plus aucun lecteur : la laisser
     traîner dans `db` pour toujours serait de la dette, pas de la prudence. */
  if(db.inscription) db.inscription = { finie:true, fin: Date.now() };
  const g = db.gouts;
  if(g){
    /* La question des plateformes a été posée : on ne la repose plus, même
       sans réponse. Même règle que `fermerMesPlates` (app-04). */
    g.platesDemande = true;
    /* La grille d'amorçage de Découvrir (`besoinAmorcage`, app-11) est une
       SECONDE grille de jaquettes. La laisser s'ouvrir juste après celle de
       l'inscription serait redemander la même chose deux fois de suite.
       MAIS SEULEMENT SI LE PARCOURS A RÉCOLTÉ QUELQUE CHOSE. Sinon on éteint
       le filet de sécurité de quelqu'un qui vient précisément de ne rien
       donner : trois « Je verrai plus tard » d'affilée, et il arrivait sur
       Découvrir sans profil ET sans grille de rattrapage, alors qu'avant ce
       lot il en avait une. Sa seule issue aurait été « Mes goûts », au fond
       des réglages, qu'il n'ira pas chercher. C'était une régression. */
    if(inscNbAimes()) g.amorcageFait = true;
    toucheGouts();
  }
  if(typeof oublierSuggestions === 'function') oublierSuggestions();
  saveDB();
  go(ecranDArrivee());
}

/* ---------------------------------------------------------------------------
   Les pièces communes : la jauge et le pied
--------------------------------------------------------------------------- */

/* Cinq segments — les cinq étapes d'effort du §5.2 (le compte, l'avatar, les
   jaquettes, le style, les plateformes). Le récapitulatif les allume toutes :
   il ne demande rien, il rend compte. */
function inscJauge(etape){
  let h = '<div class="ijauge">';
  for(let i = 1; i <= 5; i++) h += '<i class="'+(etape >= i ? 'on' : '')+'"></i>';
  return h + '</div>';
}

/* Le pied collant : l'action principale, et la sortie. La sortie est TOUJOURS
   visible. Sans porte de sortie explicite, on apprend à ignorer la barre — y
   compris quand elle sert à autre chose (§1.3). */
function inscPied(principal, action, sortie){
  return '<div style="height:30px"></div>'+
    '<div class="gbarre ipied">'+
      '<button class="btn block" onclick="'+action+'">'+principal+'</button>'+
      (sortie
        ? '<button class="tiny muted ilien" onclick="inscPasser()">'+sortie+'</button>'
        : '')+
    '</div>';
}

/* ---------------------------------------------------------------------------
   ÉTAPE 3 — la grille de jaquettes

   Le vivier : trois requêtes par fournée, mélangées à l'écran. Vingt films,
   vingt séries, dix animés — cinquante titres, films / séries / animés
   mélangés comme le demande le §5.5.

   `sort_by=vote_count.desc` et rien d'autre : c'est la définition la plus
   directe de « très connu », et c'est le paramètre déjà en service dans
   `chargerPresAffiches` (app-03). Pas de `vote_count.gte` par-dessus — trier
   par nombre de votes rend déjà les plus votés en premier, le plancher n'y
   ajouterait qu'un paramètre non mesuré dans ce contexte.

   La grille SE RECHARGE : la fournée suivante demande la page suivante des
   trois requêtes. Personne n'est limité par la taille de la page (§5.5).
--------------------------------------------------------------------------- */
const INSC_PAR_FOURNEE = { movie:20, tv:20, anime:10 };

/* Une requête de vivier. Rend une liste normalisée, jamais une exception :
   l'écran doit rester utilisable si l'une des trois sources tombe. */
async function inscLot(media, params, combien){
  try{
    const d = await tmdb('/discover/'+media, params);
    const out = [];
    ((d && d.results) || []).forEach(r=>{
      if(out.length >= combien) return;
      const t = inscNormaliser(r, media);
      /* Une affiche est exigée : un titre sans visuel n'est qu'une ligne de
         texte dans une grille de jaquettes, et on ne le reconnaît pas. La
         reconnaissance est TOUT ce que cet écran demande. */
      if(t && !inscGrille.vus[t.media+':'+t.id]) out.push(t);
    });
    return out;
  }catch(e){
    console.warn('vivier d\'inscription indisponible', media, e);
    return [];
  }
}

function inscNormaliser(r, media){
  if(!r || r.id == null || !r.poster_path) return null;
  const nom = media === 'movie' ? (r.title || r.original_title || '')
                                : (r.name  || r.original_name  || '');
  if(!nom) return null;
  const date = String((media === 'movie' ? r.release_date : r.first_air_date) || '');
  return { media: media, id: r.id, nom: nom, affiche: r.poster_path,
           annee: date.slice(0, 4),
           genre: inscGenrePrincipal(r, media) };
}

/* TMDB N'EMPLOIE PAS LES MÊMES NOMS DE GENRES POUR LES FILMS ET POUR LES
   SÉRIES. Côté séries il dit « Action & Adventure », « Sci-Fi & Fantasy »,
   « War & Politics », « Kids » — quatre noms qui n'existent pas côté films,
   et qui ne peuvent donc pas figurer dans `INSC_GENRES`.

   Sans cette table, la déduction de l'étape Style lisait un de ces noms, ne le
   retrouvait pas dans sa liste, et le jetait EN SILENCE. Mesuré sur du vrai :
   quelqu'un qui tapait Game of Thrones, The Walking Dead, The Mandalorian,
   One Piece, L'Attaque des Titans et Naruto arrivait sur « Ton style » avec
   ZÉRO puce cochée. Il venait de donner six réponses et l'écran suivant
   faisait comme s'il n'avait rien dit — exactement ce que ce lot existe pour
   éviter. Le cas des animés était le pire : leur second genre est toujours
   l'un de ces quatre-là, donc un animé ne rapportait jamais rien.

   `Sci-Fi & Fantasy` couvre chez TMDB ce que les films séparent en
   « Science-Fiction » et « Fantastique ». On retient Science-Fiction : les
   deux libellés se ramènent de toute façon au même identifiant côté séries,
   le choix ne change que le mot affiché.

   Cette table règle la DÉDUCTION (jaquette → libellé affichable). Le sens
   inverse — libellé coché → identifiant TMDB côté séries — est tenu par
   `GENRE_SERIE` dans app-04, à côté de `genreParNom` : c'est le moteur qui en
   a besoin, pas cet écran. Les deux tables sont courtes et chacune vit là où
   elle sert. */
const INSC_GENRE_TV = {
  'Action & Adventure': 'Action',
  'Sci-Fi & Fantasy':   'Science-Fiction',
  'War & Politics':     'Guerre',
  'Kids':               'Familial'
};

/* Les six libellés qui n'ont RÉELLEMENT aucun équivalent en série chez TMDB :
   la taxonomie des séries ne les connaît pas du tout. Aucune correspondance ne
   peut les sauver — les cocher n'aura jamais d'effet sur les séries ni sur les
   animés. Ce n'est pas une raison pour les retirer de l'écran : ils sont
   parfaitement utiles côté films, et amputer la liste ferait perdre une vraie
   information. C'est une raison pour LE DIRE, et seulement à qui est concerné.
   Une puce cochable sans effet et sans mention, c'est un écran qui ment. */
const INSC_GENRES_FILM_SEUL = ['Histoire', 'Horreur', 'Musique', 'Romance', 'Sport', 'Thriller'];

/* Le libellé de la liste de l'écran qui correspond à un nom de genre TMDB, ou
   rien du tout si ce nom n'a pas d'équivalent (« Soap », « Talk », « News »,
   « Reality », « Téléfilm »). Rendre un nom qui sera jeté plus loin, c'est
   perdre l'information sans que personne ne s'en aperçoive. */
function inscLabelGenre(nom){
  if(!nom) return '';
  if(INSC_GENRES.indexOf(nom) >= 0) return nom;
  return INSC_GENRE_TV[nom] || '';
}

/* Le genre dominant, en clair. Il ne sert qu'à ÉTALER la grille et à
   pré-remplir l'étape Style — jamais à filtrer quoi que ce soit.
   Il rend TOUJOURS un libellé de `INSC_GENRES`, ou rien. */
function inscGenrePrincipal(r, media){
  const ids = r.genre_ids || [];
  const liste = (typeof genresTMDB === 'object' && genresTMDB[media]) || [];
  let animation = '';
  for(let i = 0; i < ids.length; i++){
    const g = liste.find(x => x.id === ids[i]);
    const label = inscLabelGenre(g && g.nom);
    if(!label) continue;
    /* « Animation » sur un animé ne dit rien de plus que la colonne où il est
       déjà rangé : on préfère le genre suivant quand il y en a un. On le garde
       tout de même sous le coude — mieux vaut « Animation » que rien si aucun
       autre genre du titre n'a d'équivalent. */
    if(/^animation$/i.test(label)){ animation = label; continue; }
    return label;
  }
  return animation;
}

/* Étaler sur les genres, sans jamais deux fois le même d'affilée si on peut
   l'éviter. Empiler les résultats bruts donnerait vingt thrillers de suite :
   c'est le même défaut que le paquet du jeu de Recherche (§4.7), et le même
   remède — mélanger volontairement plutôt que trier. */
function inscEtaler(liste){
  const paquets = {}, ordre = [];
  liste.forEach(t=>{
    const k = t.genre || '—';
    if(!paquets[k]){ paquets[k] = []; ordre.push(k); }
    paquets[k].push(t);
  });
  const out = [];
  let reste = liste.length;
  while(reste > 0){
    let poseUn = false;
    for(let i = 0; i < ordre.length; i++){
      const p = paquets[ordre[i]];
      if(!p.length) continue;
      out.push(p.shift()); reste--; poseUn = true;
    }
    if(!poseUn) break;                 // garde-fou : jamais de boucle infinie
  }
  return out;
}

async function chargerInscTitres(){
  if(inscGrille.encours) return;
  inscGrille.encours = true;
  inscGrille.err = '';
  if(!inscGrille.titres.length) inscGrille.etat = 'attente';
  if(view === 'inscTitres') render();

  const page = inscGrille.fournee + 1;
  try{
    /* Les genres servent à étaler la grille et à pré-remplir l'étape suivante.
       Leur absence n'est pas bloquante : sans eux la grille est simplement
       moins bien mélangée. */
    await Promise.all([
      chargerGenres('tv').catch(()=>null),
      chargerGenres('movie').catch(()=>null)
    ]);

    const [films, series, animes] = await Promise.all([
      inscLot('movie', { sort_by:'vote_count.desc', page:page }, INSC_PAR_FOURNEE.movie),
      inscLot('tv',    { sort_by:'vote_count.desc', page:page }, INSC_PAR_FOURNEE.tv),
      /* La puce Animés de Découvrir, à l'identique : langue d'origine
         japonaise ET genre Animation. Les deux paramètres sont mesurés. */
      inscLot('tv',    { sort_by:'vote_count.desc', page:page,
                         with_original_language:'ja', with_genres:'16' }, INSC_PAR_FOURNEE.anime)
    ]);

    /* Les animés reviennent par `/discover/tv` : ils partagent le seau `tv` du
       contrat, et un même titre ne doit pas apparaître deux fois. */
    const dejaLa = {};
    const brut = [];
    films.concat(series, animes).forEach(t=>{
      const k = t.media+':'+t.id;
      if(dejaLa[k] || inscGrille.vus[k]) return;
      dejaLa[k] = 1; brut.push(t);
    });

    if(!brut.length){
      /* Plus rien à proposer : on le dit plutôt que de laisser un bouton qui
         ne fait rien. */
      inscGrille.etat = inscGrille.titres.length ? 'fini' : 'vide';
    }else{
      /* `memo` est le nom de la fonction de mémoïsation du rendu (app-02) :
         dans ce bloc, écrire `memo('cle', calcul)` — le geste normal du
         projet — levait « memo is not a function ». Renommé. Constat A4-2. */
      const genresMemo = (db.inscription && db.inscription.genres) || null;
      brut.forEach(t=>{
        inscGrille.vus[t.media+':'+t.id] = 1;
        /* Le genre est retenu MAINTENANT, pendant qu'on l'a. La fournée
           suivante remplacera `inscGrille.titres` : sans cette mémoire, un
           titre aimé au premier tour n'aurait plus de genre à l'étape Style. */
        if(genresMemo && t.genre) genresMemo[t.media+':'+t.id] = t.genre;
      });
      inscGrille.titres = inscEtaler(brut);
      inscGrille.fournee = page;
      inscGrille.etat = 'ok';
    }
  }catch(e){
    inscGrille.err = (typeof motifSynchro === 'function') ? motifSynchro(e) : 'Chargement impossible';
    inscGrille.etat = inscGrille.titres.length ? 'ok' : 'err';
  }
  inscGrille.encours = false;
  if(view === 'inscTitres') render();
}

/* Le message du compteur. Il COMMENTE et pousse vers le haut ; il ne fixe
   jamais de cible. Les seuils ne sont pas des paliers annoncés : ils ne
   servent qu'à faire évoluer la phrase, et aucun n'est écrit à l'écran. */
function inscMessageCompteur(n){
  if(n === 0)  return 'prends tout ce qui t\'a marqué';
  if(n < 5)    return 'continue, plus tu en prends mieux je te connais';
  if(n < 12)   return 'ça commence à te ressembler';
  if(n < 22)   return 'n\'hésite pas à en prendre encore';
  return 'impressionnant, je vais pouvoir viser juste';
}

function viewInscTitres(){
  if(inscGrille.etat === 'froid') setTimeout(()=> chargerInscTitres(), 0);

  const n = inscNbAimes();
  let html = inscJauge(3)+
    '<div class="wrap iwrap">'+
      '<h2 class="ititre">Lesquels tu as aimés ?</h2>'+
      '<p class="itxt">Films, séries et animés mélangés. Prends ceux qui t\'ont marqué, '+
        'passe le reste. C\'est ce qui décide de tout ce que l\'app te proposera ensuite.</p>'+
    '</div>';

  /* Le compteur est collant : il commente pendant qu'on défile, sinon son
     message ne serait lu qu'une fois, tout en haut. */
  html += '<div class="icompte"><b class="'+(n ? 'on' : '')+'">'+n+'</b>'+
    '<span>'+esc(inscMessageCompteur(n))+'</span></div>';

  if(inscGrille.etat === 'attente' && !inscGrille.titres.length){
    return html + '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">On va chercher des titres à te montrer…</p></div>'+
      inscPied('Continuer', 'inscPasser()', 'Je verrai plus tard');
  }
  if(!inscGrille.titres.length){
    /* Sans réseau il n'y a pas de grille — et ce n'est pas une raison pour
       bloquer l'inscription. On explique, et on laisse passer. */
    return html + '<div class="wrap"><div class="card" style="padding:18px;text-align:center">'+
      '<div style="font-weight:650">Les titres n\'arrivent pas</div>'+
      '<div class="small muted" style="margin-top:4px">'+
        esc(inscGrille.err || 'Reviens quand tu auras du réseau : cette étape se refait depuis Mes goûts.')+
      '</div>'+
      '<button class="btn ghost" style="margin-top:12px" onclick="chargerInscTitres()">Réessayer</button>'+
    '</div></div>'+
    inscPied('Continuer', 'inscPasser()', 'Je verrai plus tard');
  }

  html += '<div class="igrille">'+inscGrille.titres.map(t=>{
    const aime = inscAvis(t.media, t.id) === 1;
    const src = srcImage(t.affiche, 'w342');
    return '<button class="ijq'+(aime ? ' on' : '')+'" aria-pressed="'+(aime ? 'true' : 'false')+'" '+
      'onclick="inscBascTitre(\''+escJs(t.media)+'\','+Number(t.id)+')">'+
      '<div class="ijaff">'+
        (src ? '<img loading="lazy" src="'+src+'" alt="">' : '<div class="ph"></div>')+
        '<span class="ijnom">'+esc(t.nom)+'</span>'+
      '</div>'+
    '</button>';
  }).join('')+'</div>';

  /* La grille se recharge. Le bouton dit ce qu'il fait — « en voir d'autres »,
     pas « page suivante » : personne ne pense en pages ici. */
  if(inscGrille.etat !== 'fini')
    html += '<div class="wrap" style="padding-top:4px">'+
      '<button class="btn ghost block"'+(inscGrille.encours ? ' disabled' : '')+' '+
        'onclick="chargerInscTitres()">'+
        (inscGrille.encours ? 'Un instant…' : 'Montre-m\'en d\'autres')+'</button></div>';
  else
    html += '<div class="wrap tiny muted center">Tu as fait le tour de ce que je peux te montrer.</div>';

  return html + inscPied(
    n ? ('Continuer avec '+n+' titre'+(n > 1 ? 's' : '')) : 'Continuer',
    'inscAllerStyle()', 'Je verrai plus tard');
}

/* Taper une jaquette pose un 👍, la retaper le retire. RIEN D'AUTRE : aucun
   épisode coché, aucune entrée dans `db.shows` ni `db.movies`. */
function inscBascTitre(media, id){
  const nouveau = inscAvis(media, id) === 1 ? 0 : 1;
  inscPoserAvis(media, id, nouveau);
  /* Les goûts viennent de changer : l'étape Style se re-déduira. */
  inscStylePreRempli = false;
  render();
}

/* Quitter la grille recalcule le pré-remplissage de l'étape suivante. */
function inscAllerStyle(){
  inscStylePreRempli = false;
  inscAller('inscStyle');
}

/* ---------------------------------------------------------------------------
   ÉTAPE 4 — le style

   Pré-rempli d'après la grille (§5.6) : corriger est plus rapide que composer,
   et ça montre que les jaquettes ont servi à quelque chose. Même principe que
   la phrase de Recherche (§4.5), qui n'est jamais vide non plus.
--------------------------------------------------------------------------- */

/* Les genres dominants des titres qu'on vient d'aimer.

   On part de `db.avis` — la source, pas l'écran — et on lit le genre dans la
   mémoire posée par la grille. Lire `inscGrille.titres` serait plus court et
   FAUX : la grille se recharge, et la fournée affichée ne contient plus les
   titres aimés au tour d'avant. Mesuré : après un « Montre-m'en d'autres »,
   l'étape Style arrivait entièrement vide alors que six titres avaient été
   pris. C'est exactement ce que le §5.6 veut éviter.

   Un titre dont on n'a pas le genre est simplement ignoré : mieux vaut trois
   genres justes que quatre dont un inventé. */
function inscGenresDeduits(){
  const genresMemo = (db.inscription && db.inscription.genres) || {};
  const poids = {};
  inscMigrerAvis();
  ['tv','movie'].forEach(media=>{
    const seau = db.avis[media];
    Object.keys(seau).forEach(id=>{
      if(!seau[id] || seau[id].v !== 1) return;
      const g = genresMemo[media+':'+id];
      if(!g || INSC_GENRES.indexOf(g) < 0) return;
      poids[g] = (poids[g] || 0) + 1;
    });
  });
  /* À égalité, l'ordre de `INSC_GENRES` tranche : sans ce second critère,
     `Object.keys` fait permuter deux genres d'un rendu à l'autre et le texte
     « d'après tes 7 titres » changerait sous les yeux. */
  return Object.keys(poids).sort((a,b)=>
    (poids[b] - poids[a]) || (INSC_GENRES.indexOf(a) - INSC_GENRES.indexOf(b)));
}

function viewInscStyle(){
  const g = db.gouts;
  const deduits = inscGenresDeduits();
  /* Une seule fois : sinon chaque appui sur une puce remettrait les genres
     déduits par-dessus la correction, et corriger serait impossible. */
  if(!inscStylePreRempli){
    deduits.slice(0, 3).forEach(nom=>{
      if(g.genres.indexOf(nom) < 0 && (g.exclus||[]).indexOf(nom) < 0) g.genres.push(nom);
    });
    inscStylePreRempli = true;
    if(deduits.length) toucheGouts();
  }
  const nAimes = inscNbAimes();

  let html = inscJauge(4)+
    '<div class="wrap iwrap">'+
      '<h2 class="ititre">Ton style</h2>'+
      '<p class="itxt">'+(deduits.length
        ? 'Voilà ce que je lis dans tes choix. Corrige si je me trompe.'
        : 'Dis-moi directement ce que tu aimes — rien n\'est obligatoire ici.')+'</p>'+
    '</div>';

  if(deduits.length)
    html += '<div class="wrap" style="padding-top:0"><div class="inote">'+
      'D\'après tes '+nAimes+' titre'+(nAimes > 1 ? 's' : '')+' : <b>'+
      esc(deduits.slice(0, 3).join(', ').toLowerCase())+'</b>.</div></div>';

  html += '<div class="sectitle">Ce que tu aimes</div>'+
    '<div class="chips wrapchips">'+INSC_GENRES.map(nom=>
      '<button class="chip '+(g.genres.indexOf(nom) >= 0 ? 'on' : '')+'" '+
        'aria-pressed="'+(g.genres.indexOf(nom) >= 0)+'" '+
        'onclick="inscBascGenre(\''+escJs(nom)+'\')">'+esc(nom)+'</button>').join('')+
      /* « Animé » n'est pas un genre : c'est une famille, et c'est le seul
         endroit où le premier niveau est aveugle. Il vit donc à côté de la
         liste, avec son propre interrupteur. */
      '<button class="chip '+(g.animeOui ? 'on' : '')+'" aria-pressed="'+(!!g.animeOui)+'" '+
        'onclick="inscBascAnime()">Animé</button>'+
    '</div>';

  /* La mention n'apparaît QUE si elle concerne quelqu'un, et elle nomme les
     genres en cause plutôt que d'énoncer une règle générale. Personne n'a
     besoin de savoir que la taxonomie des séries de TMDB est incomplète ; la
     personne qui vient de cocher « Horreur » a besoin de savoir que ça ne lui
     rendra pas de séries d'horreur. */
  const filmSeul = INSC_GENRES_FILM_SEUL.filter(n => g.genres.indexOf(n) >= 0);
  if(filmSeul.length)
    html += '<div class="wrap" style="padding-top:0"><div class="inote">'+
      '<b>'+esc(filmSeul.join(', '))+'</b> '+(filmSeul.length > 1 ? 'n\'existent' : 'n\'existe')+
      ' que côté films : je m\'en servirai pour te proposer des films, jamais des '+
      'séries ni des animés.</div></div>';

  /* LE SECOND NIVEAU, ET SEULEMENT LÀ OÙ LE PREMIER EST AVEUGLE (§5.6).
     Côté films, les genres TMDB séparent à peu près correctement. Côté animé,
     tout est étiqueté Animation + Action & Aventure : le genre ne dit
     littéralement rien. Dire « j'aime les animés », c'est comme dire « j'aime
     les films ». Contextuel, jamais permanent : décocher le fait disparaître. */
  if(g.animeOui){
    html += '<div class="sectitle">Quel genre d\'animés ?</div>'+
      '<div class="wrap" style="padding-top:0;padding-bottom:8px"><div class="inote">'+
        '« Animé » ne dit presque rien : tout y est étiqueté <b>Animation</b>. '+
        'C\'est ici que ça se joue.</div></div>'+
      '<div class="chips wrapchips">'+INSC_ANIME_SOUS.map(s=>
        '<button class="chip '+((g.animeSous||[]).indexOf(s.cle) >= 0 ? 'on' : '')+'" '+
          'aria-pressed="'+((g.animeSous||[]).indexOf(s.cle) >= 0)+'" '+
          'onclick="inscBascAnimeSous(\''+escJs(s.cle)+'\')">'+esc(s.cle)+'</button>').join('')+
      '</div>';
  }

  /* LES EXCLUSIONS. C'est la seule information vraiment impossible à déduire :
     ne pas avoir vu d'horreur ne veut pas dire ne pas en vouloir. C'est aussi
     le garde-fou de la rangée « incontournables » (§3.7), la seule qui sort
     volontairement du profil. */
  html += '<div class="sectitle">Et ce que tu ne veux <b>jamais</b> voir '+
      '<span class="facult">facultatif</span></div>'+
    '<div class="chips wrapchips">'+INSC_GENRES.map(nom=>
      '<button class="chip '+((g.exclus||[]).indexOf(nom) >= 0 ? 'hors' : '')+'" '+
        'aria-pressed="'+((g.exclus||[]).indexOf(nom) >= 0)+'" '+
        'onclick="inscBascExclu(\''+escJs(nom)+'\')">'+esc(nom)+'</button>').join('')+
    '</div>';

  html += '<div class="wrap"><div class="inote">Rien n\'est obligatoire ici. '+
    'Sans exclusion, je te proposerai de tout — y compris des choses qui ne te '+
    'ressemblent pas.</div></div>';

  return html + inscPied('Continuer', 'inscAller(\'inscPlates\')', 'Je verrai plus tard');
}

/* Aimer et écarter le même genre n'a pas de sens : les deux listes s'excluent.
   Même règle que `bascGoutGenre` / `bascGoutExclu` (app-11), reproduite ici
   parce que ces écrans-là ne connaissent pas « Animé » ni le second niveau. */
function inscBascGenre(nom){
  const g = db.gouts, i = g.genres.indexOf(nom);
  if(i >= 0) g.genres.splice(i, 1);
  else {
    g.genres.push(nom);
    const j = (g.exclus || []).indexOf(nom);
    if(j >= 0) g.exclus.splice(j, 1);
  }
  toucheGouts(); render();
}
function inscBascExclu(nom){
  const g = db.gouts;
  if(!Array.isArray(g.exclus)) g.exclus = [];
  const i = g.exclus.indexOf(nom);
  if(i >= 0) g.exclus.splice(i, 1);
  else {
    g.exclus.push(nom);
    const j = g.genres.indexOf(nom);
    if(j >= 0) g.genres.splice(j, 1);
  }
  toucheGouts(); render();
}
/* Décocher « animé » vide le second niveau : garder des sous-genres pour une
   famille qu'on ne veut plus laisserait le récapitulatif — et le moteur —
   avec une réponse que personne n'a maintenue. */
function inscBascAnime(){
  const g = db.gouts;
  g.animeOui = !g.animeOui;
  if(!g.animeOui) g.animeSous = [];
  toucheGouts(); render();
}
function inscBascAnimeSous(cle){
  const g = db.gouts;
  if(!Array.isArray(g.animeSous)) g.animeSous = [];
  const i = g.animeSous.indexOf(cle);
  if(i >= 0) g.animeSous.splice(i, 1); else g.animeSous.push(cle);
  toucheGouts(); render();
}

/* ---------------------------------------------------------------------------
   ÉTAPE 5 — les plateformes

   Pourquoi cette étape existe alors qu'on en a supprimé d'autres : une
   plateforme NE SE DÉDUIT D'AUCUN TITRE VU. Voir quelqu'un regarder trois
   séries Netflix ne dit pas s'il paie Netflix. Et c'est le filtre le plus
   important du jeu de Recherche (§4.7) : proposer à 21 h un film qu'on ne peut
   pas lancer est la pire frustration possible.
--------------------------------------------------------------------------- */

/* Les quatorze de la spec, rapprochées du catalogue TMDB par leur nom. Celles
   que TMDB ne connaît pas sortent de la liste : on ne peut pas enregistrer un
   choix dont on n'a pas l'identifiant. */
function inscPlatesConnues(){
  const toutes = (typeof platesToutesMedias === 'function') ? platesToutesMedias() : [];
  const out = [];
  INSC_PLATES.forEach(v=>{
    const p = toutes.find(x => v.motif.test(String(x.nom || '').trim()));
    if(p) out.push({ id:p.id, nom:v.nom, logo:p.logo });
  });
  return out;
}

/* Le nom AFFICHÉ d'une plateforme déclarée. `bascMaPlate` (app-04) enregistre
   le nom que TMDB donne — « Disney Plus », « Amazon Prime Video » — et c'est
   très bien : c'est ce format que porte `db.gouts.plates`, et le changer
   dépasserait ce lot. Mais le récapitulatif suit d'une seconde des tuiles qui
   disaient « Disney+ » et « Prime Video » : lui faire dire autre chose donnerait
   l'impression d'avoir coché autre chose. On réaffiche donc le libellé de la
   spec §5.7 quand on le connaît, sans rien changer à ce qui est stocké. */
function inscNomPlate(p){
  const v = INSC_PLATES.find(x => x.motif.test(String(p.nom || '').trim()));
  return v ? v.nom : String(p.nom || '');
}

function viewInscPlates(){
  const toutes = (typeof platesToutesMedias === 'function') ? platesToutesMedias() : [];
  /* Même garde-fou que `viewPlates` (app-04) : une seule tentative, sinon une
     réponse vide relance le rendu en boucle. */
  if(!toutes.length && typeof platesEcranDemande !== 'undefined' && !platesEcranDemande){
    platesEcranDemande = true;
    setTimeout(()=>{
      Promise.all([chargerPlates('tv'), chargerPlates('movie')])
        .then(()=>{ if(view === 'inscPlates' && platesToutesMedias().length) render(); })
        .catch(()=>{});
    }, 0);
  }

  const choisies = mesPlates();
  let html = inscJauge(5)+
    '<div class="wrap iwrap">'+
      '<h2 class="ititre">Où tu regardes</h2>'+
      '<p class="itxt">Je ne te proposerai jamais un titre que tu ne peux pas lancer ce soir. '+
        'Tu pourras changer ça à tout moment.</p>'+
    '</div>';

  const liste = inscPlatesConnues();
  if(!liste.length){
    /* La barre du bas est rendue MÊME quand la liste TMDB n'arrive pas : sinon
       on reste coincé sur un rond qui tourne au milieu de la création du
       compte. C'est un piège déjà payé une fois sur `viewPlates`. */
    return html + '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">On récupère la liste des plateformes…</p></div>'+
      inscPied('Continuer', 'inscAller(\'inscFin\')', 'Je verrai plus tard');
  }

  /* La couleur avant le nom (§5.7) : on reconnaît un service à son logo avant
     de le lire, l'écran se parcourt d'un coup d'œil au lieu de se lire ligne
     à ligne. */
  html += '<div class="wrap" style="padding-top:0"><div class="iplats">'+
    liste.map(p=>{
      const on = choisies.some(x => x.id === p.id);
      const logo = srcImage(p.logo, 'w92');
      return '<button class="ipl'+(on ? ' on' : '')+'" aria-pressed="'+(on ? 'true' : 'false')+'" '+
        'onclick="inscBascPlate('+Number(p.id)+')">'+
        (logo ? '<img loading="lazy" src="'+logo+'" alt="">' : '')+
        '<span>'+esc(p.nom)+'</span></button>';
    }).join('')+
    /* « Aucune » est une réponse pleine et entière, pas un abandon — mais elle
       ne s'allume QUE si on l'a donnée. Elle arrivait cochée d'office, coche
       verte comprise, avant que la personne ait dit quoi que ce soit :
       l'écran affirmait une réponse à sa place, et un récapitulatif qui
       annonce « Plateformes : aucune » derrière un choix qu'on n'a pas fait
       est exactement le genre de détail qui fait douter de tout le reste. */
    '<button class="ipl aucune'+(!choisies.length && inscAucuneDite() ? ' on' : '')+'" '+
      'onclick="inscAucunePlate()">Aucune</button>'+
  '</div>';

  html += '<div class="inote" style="margin-top:14px">Coche tout ce à quoi tu as accès, '+
    '<b>même partagé avec quelqu\'un</b>. Beaucoup regardent sur le compte d\'un proche '+
    'et ne le déclarent pas.</div></div>';

  /* Le bouton dit ce qu'il fait. « Je n'en ai aucune » EST la réponse, donc il
     l'enregistre — sinon on lit une phrase à l'écran et l'app comprend autre
     chose. Pour ne rien répondre du tout, « Je verrai plus tard » est juste
     en dessous, et il est toujours là. */
  return html + inscPied(
    (choisies.length || inscAucuneDite()) ? 'Continuer' : 'Je n\'en ai aucune',
    'inscFinirPlates()', 'Je verrai plus tard');
}

function inscFinirPlates(){
  if(!mesPlates().length && !inscAucuneDite()) inscNoterAucune(true);
  inscAller('inscFin');
}

/* « Aucune » a-t-elle été DITE ? À distinguer d'une liste vide, qui veut dire
   « je n'ai pas encore répondu ». La réponse vit dans `db.inscription`, donc
   elle survit à une fermeture de l'app au milieu du parcours et disparaît
   avec lui — aucune clé de plus dans les goûts, où elle ferait doublon avec
   `platesDemande`. */
function inscAucuneDite(){
  return !!(db.inscription && db.inscription.aucune);
}
function inscNoterAucune(v){
  if(db.inscription){ db.inscription.aucune = !!v; saveDB(); }
}

/* On délègue à `bascMaPlate` (app-04) : c'est lui qui tient le format de
   `db.gouts.plates`, resème les filtres et date les goûts. Le dupliquer ici
   ferait diverger les deux écrans à la première correction. */
function inscBascPlate(id){
  /* Cocher un service dédit « Aucune » : les deux ne peuvent pas être vrais. */
  inscNoterAucune(false);
  bascMaPlate(id);
}
/* « Aucune » vide la sélection et retient qu'elle a été choisie. La liste vide
   ne suffit pas à porter l'information : elle ne distingue pas « je n'ai
   aucun abonnement » de « je n'ai pas encore répondu », et c'est justement
   cette confusion qui allumait la tuile avant toute réponse.
   `platesDemande`, lui, ne dit que « la question a été posée » — il est écrit
   à la fin du parcours et vaut pour les deux cas. */
function inscAucunePlate(){
  inscNoterAucune(!inscAucuneDite());
  if(typeof viderMesPlates === 'function') return viderMesPlates();
  db.gouts.plates = []; toucheGouts(); render();
}

/* ---------------------------------------------------------------------------
   ÉTAPE 6 — la fin

   Un récapitulatif de la récolte. L'utilisateur vient de donner trois minutes :
   il doit voir ce que ça a produit AVANT MÊME D'ENTRER. C'est ce qui légitime
   rétroactivement l'effort (§5.8).

   Ce qu'on ne demande pas (§5.9) : le pseudo de partage et l'invitation d'un
   proche. Inviter quelqu'un avec une bibliothèque vide n'a d'intérêt pour
   personne — ça vient plus tard, quand il y a quelque chose à montrer.
--------------------------------------------------------------------------- */
function viewInscFin(){
  const g = db.gouts || {};
  const n = inscNbAimes();
  const plates = mesPlates();

  const ligne = (quoi, valeur)=>
    '<div class="irl"><span>'+esc(quoi)+'</span><b>'+esc(valeur)+'</b></div>';

  let html = inscJauge(5)+
    '<div class="ifini">'+
      '<div class="icoche">'+I.check+'</div>'+
      '<h2 class="ititre" style="margin:0">C\'est prêt.</h2>'+
      '<p class="itxt" style="margin-top:8px">Ton écran Découvrir est déjà rempli '+
        'avec ce que tu viens de me dire.</p>'+
      '<div class="irecap">'+
        ligne('Titres aimés', String(n))+
        ligne('Genres retenus', (g.genres || []).length
          ? (g.genres || []).join(', ') : 'aucun — je devinerai')+
        ((g.animeSous || []).length ? ligne('Côté animés', g.animeSous.join(', ')) : '')+
        ligne('Jamais proposé', (g.exclus || []).length ? g.exclus.join(', ') : 'rien')+
        /* « aucune » est une réponse, « non renseigné » en est une autre. Les
           confondre, c'est mettre dans la bouche de quelqu'un un choix qu'il
           n'a pas fait, sur l'écran même qui lui rend compte de ce qu'il a
           dit. */
        ligne('Plateformes', plates.length ? plates.map(inscNomPlate).join(', ')
                           : inscAucuneDite() ? 'aucune' : 'non renseignées')+
      '</div>'+
    '</div>';

  /* Pas de « Je verrai plus tard » ici : il n'y a plus rien à remettre à plus
     tard, et une sortie de secours sur un écran qui ne demande rien ne ferait
     que semer le doute. */
  return html + inscPied('Entrer dans l\'app', 'inscTerminer()', '');
}
