"use strict";
/* =========================== L'ONGLET RECHERCHE ===========================

   POURQUOI CET ÉCRAN EXISTE.

   Découvrir portait deux métiers contradictoires. « Montre-moi quelque
   chose » — aucune intention en tête, c'est la vitrine personnalisée qui
   répond. Et « je veux trouver mon film de ce soir » — une intention, et là
   il faut un constructeur de requête. Le second vivait dans une feuille posée
   PAR-DESSUS le premier, et toute la difficulté du lot E vient de là : un
   filtre détruisait la vitrine (§E1), il a fallu un brouillon parce qu'on ne
   voit pas les résultats pendant qu'on compose (§E5), et §E3 voulait ramener
   les envies dans la vitrine à la main.

   Le découpage n'est pas « parcourir contre filtrer », qui est une distinction
   d'interface, mais « ai-je déjà une intention », qui est une distinction
   d'état d'esprit. Celle-là ne bouge pas avec les modes.

   ------------------------------------------------------------------------
   LE CADRE N'EST PAS UN FILTRE.

   Film, série ou animé, ce n'est pas restreindre une liste : c'est décider si
   on s'engage pour 1 h 50 ou pour vingt heures. Et ça change les questions qui
   suivent. Pour un film ce qui compte est la durée ; pour une série, « elle est
   finie ? » et « combien de saisons » — personne ne commence neuf saisons un
   mardi soir ; pour un animé le vocabulaire n'est même pas le même.
   D'où `CADRES`, `HUMEURS`, `TEMPS` et `REGLAGES` indexés par cadre : on ne
   pose que les questions qui ont un sens pour ce qu'on vient de choisir.

   DEUX PROFONDEURS, ET DEUX SORTIES DIFFÉRENTES.

   · Grossier — le cadre, une humeur, le temps qu'on a. Trois gestes. La sortie
     est une SÉLECTION : quatre petites rangées de trois jaquettes, chacune
     avec un intitulé qui dit POURQUOI elle est là. Douze titres, quatre petites
     décisions, au lieu d'une grille de cent où rien ne distingue rien.
   · Précis — « Régler plus finement ». La sortie est la GRILLE, la même que
     celle de Découvrir (`carteTitre`), parce que là on parcourt.

   LES HUMEURS SONT DES PAQUETS, PAS DES GENRES.

   Mesuré sur TMDB : « comédie » seul rend 173 456 titres, « comédie » +
   « enquête policière » 379. L'axe genre ne retranche rien tout seul — il ne
   doit donc pas être exposé brut. Une humeur est un paquet : des genres en OU,
   parfois des mots-clés, et un plancher de votes. Le genre redevient un
   ingrédient au lieu d'être une question posée à quelqu'un qui veut juste
   passer une soirée.

   CE QUI N'EST PAS FILTRÉ ICI, ET POURQUOI.

   `origineAdmise` n'est jamais appelée sur cet écran. La règle d'origine existe
   pour empêcher le classement par popularité de TMDB de noyer la VITRINE sous
   la production asiatique — un écran où personne n'a rien demandé. Ici
   quelqu'un a demandé quelque chose : écarter les titres japonais de
   « samouraï » contredirait en silence l'intention qu'on vient de recueillir.
   L'interrupteur « Toutes les origines » de Mes goûts (§E7) ne concerne donc
   que Découvrir.

   LE COÛT RÉSEAU, ASSUMÉ ET BORNÉ.

   La durée d'un film n'est PAS filtrable de façon fiable chez TMDB — mesuré le
   29/07, la borne « moins de 95 min » ramenait Les Infiltrés (151 min) ; c'est
   pour ça que `DISC_DUREE_FIABLE` vaut `false`. La vraie durée n'existe que sur
   la fiche. On va donc la chercher, mais SEULEMENT pour les seize titres qui
   peuvent entrer dans la sélection, par paquets de six. La grille « Tout voir »,
   elle, ne demande aucune fiche : elle coûte exactement ce que coûte Découvrir
   aujourd'hui.
   C'est le renversement intéressant : le mode simple est le plus honnête,
   parce qu'il est le plus petit.
--------------------------------------------------------------------------- */

const RECH_MIN = 2;                  // caractères avant de partir chercher
const RECH_ATTENTE = 320;            // frappe au repos avant la requête
const RECH_MAX = 40;                 // résultats de titre affichés
const RECH_CIBLE = 40;               // taille d'une fournée de critères
const RECH_PAGES_MAX = 3;            // jamais plus de 3 requêtes pour remplir
const RECH_VOTES_MINI = 80;          // plancher de votes des paquets d'humeur
const RECH_SEL = 12;                 // titres de la sélection : 4 rangées de 3
const RECH_FICHES = 16;              // fiches demandées : les 12 montrés + la marge
const RECH_FICHES_MAX = 22;          // plafond dur, deuxième passe comprise
const RECH_LOT_FICHES = 6;           // fiches demandées en parallèle

let rechTimer = null, rechSeq = 0, rechAbort = null, critSeq = 0, ficheSeq = 0;

/* ------------------------------- Le cadre ------------------------------- */
const CADRES = [
  { id:'film',  label:'Film',  media:'movie' },
  { id:'serie', label:'Série', media:'tv' },
  { id:'anime', label:'Animé', media:'tv', anime:true }
];
function cadreCourant(){ return CADRES.find(c => c.id === etatRech().cadre) || CADRES[0]; }
function rechMedia(){ return cadreCourant().media; }

/* ------------------------------ Les humeurs -----------------------------
   Chaque humeur est un paquet de genres (en OU) et parfois de mots-clés. Les
   noms de genres diffèrent entre films et séries chez TMDB — « Action » d'un
   côté, « Action & Adventure » de l'autre — d'où deux listes plutôt qu'une
   traduction à la volée. `genreParNom` rend `null` sur un nom inconnu et on
   filtre : une liste de genres pas encore chargée ne casse rien. */
const HUMEURS = {
  film: [
    { id:'marrant',  t:'Marrant',       s:'pour décompresser', genres:['Comédie'] },
    { id:'peur',     t:'Qui fait peur', s:'frissons, tension', genres:['Horreur','Thriller'] },
    { id:'bouge',    t:'Ça bouge',      s:'action, poursuite', genres:['Action','Aventure'] },
    { id:'remue',    t:'Ça remue',      s:'émotion, tripes',   genres:['Drame'] },
    { id:'enquete',  t:'Une enquête',   s:'polar, mystère',    genres:['Crime','Mystère'] },
    { id:'ailleurs', t:'Ailleurs',      s:'SF, autre monde',   genres:['Science-Fiction','Fantastique'] }
  ],
  serie: [
    { id:'marrant',  t:'Marrant',       s:'à picorer le soir', genres:['Comédie'] },
    { id:'enquete',  t:'Une enquête',   s:'une affaire à suivre', genres:['Crime','Mystère'] },
    { id:'remue',    t:'Ça remue',      s:'drame, famille',    genres:['Drame'] },
    { id:'bouge',    t:'Ça bouge',      s:'action, survie',    genres:['Action & Adventure'] },
    { id:'ailleurs', t:'Ailleurs',      s:'SF, fantastique',   genres:['Sci-Fi & Fantasy'] },
    { id:'vrai',     t:'Du vrai',       s:'documentaire',      genres:['Documentaire'] }
  ],
  /* Les animés se disent en mots-clés, pas en genres : « shōnen » et « isekai »
     n'ont aucun équivalent dans la taxonomie de TMDB. Ces identifiants sont
     ceux d'`ENVIES`, déjà éprouvés en production. */
  anime: [
    { id:'shonen',  t:'Shōnen',         s:'combats, progression', mots:[207826] },
    { id:'tranche', t:'Tranche de vie', s:'doux, quotidien',      mots:[9914] },
    { id:'isekai',  t:'Isekai',         s:'autre monde',          mots:[237451] },
    { id:'sombre',  t:'Sombre',         s:'dark fantasy',         mots:[177895] },
    { id:'sport',   t:'Sport',          s:'équipe, tournoi',      mots:[6075, 12380] },
    { id:'magie',   t:'Magie',          s:'pouvoirs, démons',     mots:[2343, 15001] }
  ]
};
function humeursCadre(){ return HUMEURS[etatRech().cadre] || HUMEURS.film; }
function humeurCourante(){
  const h = etatRech().humeur;
  return h ? humeursCadre().find(x => x.id === h) || null : null;
}

/* ------------------------------- Le temps -------------------------------
   La même question ne veut pas dire la même chose selon le cadre : pour un
   film c'est « combien de temps j'ai », pour une série « combien je m'engage ».
   AUCUN de ces réglages ne part dans la requête — ni la durée d'un film ni le
   nombre de saisons ne sont filtrables chez TMDB. Ils sont vérifiés titre par
   titre sur la sélection, à partir des fiches. C'est pour ça que la sélection
   est petite. */
const TEMPS = {
  film:  [ { id:'court',     t:"Moins d'1h30", max:95 },
           { id:'soiree',    t:'Une soirée',   min:95, max:160 },
           { id:'peu',       t:'Peu importe' } ],
  serie: [ { id:'une',       t:'Une saison',   maxS:1 },
           { id:'plusieurs', t:'Plusieurs',    minS:2 },
           { id:'peu',       t:'Peu importe' } ],
  anime: [ { id:'une',       t:'Une saison',   maxS:1 },
           { id:'longue',    t:'Une longue',   minS:2 },
           { id:'peu',       t:'Peu importe' } ]
};
function tempsCadre(){ return TEMPS[etatRech().cadre] || TEMPS.film; }
function tempsCourant(){
  const t = etatRech().temps;
  return t ? tempsCadre().find(x => x.id === t) || null : null;
}

/* ----------------------------- Le réglage fin ---------------------------
   N'ENTRENT ICI QUE DES CRITÈRES DONT LE COMPORTEMENT EST MESURÉ. Époque,
   plateformes, note et genre tournent en production depuis des semaines.
   Ce qui manque volontairement, et qu'il faudra mesurer avant de l'ajouter :
   la durée d'un film (`with_runtime` faux trois fois sur dix), le nombre de
   saisons et la longueur d'un épisode (pas filtrables du tout), et le statut
   d'une série (`with_status`, jamais essayé sur ce projet). Les promettre à
   l'écran sans les tenir serait pire que de ne pas les proposer. */
function reglagesCadre(){
  const c = etatRech().cadre;
  const communs = [
    { cle:'epoque', lab:'Époque' },
    { cle:'plates', lab:'Où tu regardes' },
    { cle:'note',   lab:'Note minimale' }
  ];
  return c === 'anime' ? communs : communs.concat([{ cle:'genres', lab:'Genre' }]);
}
const RECH_EPOQUES = [
  { id:'tout',  court:'',            label:'Peu importe' },
  { id:'2020s', court:'depuis 2020', label:'Depuis 2020', de:'2020-01-01', a:'2099-12-31' },
  { id:'2010s', court:'années 2010', label:'Années 2010', de:'2010-01-01', a:'2019-12-31' },
  { id:'2000s', court:'années 2000', label:'Années 2000', de:'2000-01-01', a:'2009-12-31' },
  { id:'1990s', court:'années 90',   label:'Années 90',   de:'1990-01-01', a:'1999-12-31' },
  { id:'avant', court:'avant 1990',  label:'Avant 1990',  de:'1900-01-01', a:'1989-12-31' }
];
const RECH_NOTES = [ { v:0, label:'Peu importe' }, { v:6, label:'6 et +' },
                     { v:7, label:'7 et +' }, { v:8, label:'8 et +' } ];

/* ================================ L'état ================================
   Volontairement SÉPARÉ de `ui.disc` : la vitrine et la recherche sont deux
   moteurs, et mélanger leurs états est exactement la faute que §E1 a réparée.
   Passer d'un onglet à l'autre ne doit rien emporter. */
function etatRech(){
  if(!ui.rech) ui.rech = {
    cadre:'film',
    q:'',                 // le titre tapé
    humeur:null, temps:null,
    epoque:'tout', plates:[], noteMin:0, genres:[],
    vue:'selection',      // selection | grille
    regle:false, ouvert:null,
    res:[], page:1, pages:1, charge:false, loading:false, err:'', decal:0,
    fiches:{}             // 'media:id' -> { duree, saisons, resume, plates }
  };
  return ui.rech;
}
function rechTexte(){ return (etatRech().q || '').trim(); }
function enRechercheTitre(){ return rechTexte().length >= RECH_MIN; }
function criteresPosés(){
  const r = etatRech();
  return !!r.humeur || r.plates.length > 0 || r.epoque !== 'tout' || r.noteMin > 0 || r.genres.length > 0;
}
function modeRech(){
  if(enRechercheTitre()) return 'titre';
  return criteresPosés() ? 'criteres' : 'repos';
}

/* ============================== Les gestes ============================== */

function setCadre(id){
  const r = etatRech();
  if(r.cadre === id) return;
  r.cadre = id;
  /* Une humeur, un temps et des genres n'ont pas d'équivalent d'un cadre à
     l'autre. On les remet à zéro plutôt que de traîner des réglages invisibles
     qui filtreraient la grille sans que rien ne le dise. */
  r.humeur = null; r.temps = null; r.genres = []; r.ouvert = null;
  r.res = []; r.charge = false;
  render();
  if(enRechercheTitre()) lancerTitre();
  else if(criteresPosés()) chargerCriteres();
}
function setHumeur(id){
  const r = etatRech();
  r.humeur = (r.humeur === id) ? null : id;
  relancerRech();
}
function setTemps(id){
  const r = etatRech();
  r.temps = (r.temps === id) ? null : id;
  /* Le temps ne part PAS dans la requête — ni la durée d'un film ni le nombre
     de saisons ne sont filtrables chez TMDB. Il vérifie la sélection à partir
     des fiches. Inutile de redemander la liste ; il faut en revanche compléter
     les fiches, puisque le vivier à vérifier vient de doubler. */
  if(r.res.length){ peindreRech(); chargerFiches(); } else relancerRech();
}
function setEpoqueRech(id){ etatRech().epoque = id; relancerRech(); }
function setNoteRech(v){ etatRech().noteMin = v; relancerRech(); }
function bascGenreRech(nom){
  const sel = etatRech().genres, k = sel.indexOf(nom);
  if(k < 0) sel.push(nom); else sel.splice(k,1);
  relancerRech();
}
function bascPlateRech(i){
  const p = platesRech()[i];
  if(!p) return;
  const sel = etatRech().plates, k = sel.findIndex(x => x.id === p.id);
  if(k < 0) sel.push({ id:p.id, nom:p.nom, logo:p.logo }); else sel.splice(k,1);
  relancerRech();
}
function viderPlatesRech(){ etatRech().plates = []; relancerRech(); }
function ouvrirReglage(v){ const r = etatRech(); r.regle = v; if(v && r.ouvert === null) r.ouvert = 'epoque'; render(); }
function deplier(cle){ const r = etatRech(); r.ouvert = (r.ouvert === cle) ? null : cle; render(); }
function setVueRech(v){ etatRech().vue = v; render(); }

function viderRech(){
  const r = etatRech();
  clearTimeout(rechTimer); avorterRech();
  r.q = ''; r.humeur = null; r.temps = null;
  r.epoque = 'tout'; r.plates = []; r.noteMin = 0; r.genres = [];
  r.res = []; r.page = 1; r.pages = 1; r.charge = false; r.loading = false; r.err = '';
  r.regle = false; r.vue = 'selection';
  render();
}
function relancerRech(){
  render();
  if(enRechercheTitre()) lancerTitre();
  else if(criteresPosés()) chargerCriteres();
}

/* --------------------------- Les plateformes ---------------------------- */
function platesRech(){
  const dites = mesPlates();
  if(dites.length) return dites;
  const l = platesTMDB[rechMedia()] || [];
  return l.slice(0, 8);
}

/* --------------------------- Les genres du cadre ------------------------ */
function genresRech(){
  const l = genresTMDB[rechMedia()] || [];
  /* Sur la puce Animés, « Animation » est la définition du cadre et non une
     préférence : le proposer une seconde fois n'apprendrait rien. */
  return l.filter(g => !(cadreCourant().anime && /animation/i.test(g.nom)));
}

/* ============================ Le moteur TITRE ============================ */

function saisieRech(v){
  const r = etatRech();
  const avant = modeRech();
  r.q = v;
  clearTimeout(rechTimer); avorterRech();
  if(modeRech() !== avant){ oublierDefil('search'); window.scrollTo(0,0); }
  if(!enRechercheTitre()){
    r.res = []; r.loading = false; r.err = ''; r.charge = !criteresPosés();
    peindreRech();
    if(criteresPosés()) chargerCriteres();
    return;
  }
  r.loading = true; r.err = '';
  peindreRech();
  rechTimer = setTimeout(lancerTitre, RECH_ATTENTE);
}
function lancerTitre(){
  clearTimeout(rechTimer);
  if(!enRechercheTitre()) return;
  const r = etatRech();
  r.loading = true; r.err = ''; peindreRech();
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
  try{
    if(cadreCourant().anime) await chargerGenres('tv');   // il faut l'id du genre Animation
    if(seq !== rechSeq) return;
    const d = await tmdb('/search/'+rechMedia(), { query:q, include_adult:'false' },
                         ctrl ? {signal:ctrl.signal} : null);
    if(seq !== rechSeq) return;
    let res = (d.results || []).filter(x => x && x.poster_path && (x.title || x.name));
    r.res = garderAnimesRech(res).slice(0, RECH_MAX);
    r.loading = false; r.err = ''; r.charge = true;
    peindreRech();
  }catch(e){
    if((e && e.name === 'AbortError') || seq !== rechSeq) return;
    r.loading = false; r.res = []; r.charge = true;
    r.err = (e.message === 'BADKEY') ? 'Service indisponible' : 'Pas de connexion';
    peindreRech();
  }
}

/* Le cadre Animé est japonais ET animé par définition : ce tamis reste, même
   sur un titre tapé. TMDB ne sait pas filtrer /search, on le fait chez nous —
   et si les résultats ne portent pas l'information, on ne filtre pas à
   l'aveugle plutôt que de vider l'écran. */
function garderAnimesRech(res){
  if(!cadreCourant().anime) return res;
  const anim = genreParNom('tv','Animation');
  if(anim == null) return res;
  const utilisables = res.every(x => x && typeof x.original_language === 'string' && Array.isArray(x.genre_ids));
  if(!utilisables) return res;
  return res.filter(x => x.original_language === 'ja' && x.genre_ids.indexOf(anim) >= 0);
}

/* Ce qu'on a déjà, séparé du reste. C'est la vraie question qu'on se pose en
   tapant un nom — « est-ce que je l'ai déjà ? » — et jusqu'ici il fallait
   ouvrir la fiche pour le savoir. Absorbe §E9. */
function chezSoiRech(x){
  const item = rechMedia() === 'tv' ? db.shows[x.id] : db.movies[x.id];
  return !!item;
}

/* =========================== Le moteur CRITÈRES =========================== */

function paramsRech(){
  const r = etatRech(), media = rechMedia(), cadre = cadreCourant();
  const p = { include_adult:'false', page:String(r.page), sort_by:'popularity.desc' };
  p['vote_count.gte'] = String(RECH_VOTES_MINI);

  const h = humeurCourante();
  const noms = ((h && h.genres) || []).concat(r.genres);
  const ids = noms.map(n => genreParNom(media, n)).filter(x => x != null);
  const mots = (h && h.mots) || [];

  if(cadre.anime){
    p.with_original_language = 'ja';
    const anim = genreParNom(media, 'Animation');
    /* Le genre Animation est la DÉFINITION du cadre : il doit rester un ET, et
       mélanger un ET et un OU dans `with_genres` ne marche pas — mesuré le
       29/07, tout ce qui suit la barre verticale est ignoré en silence. On
       s'appuie donc sur la langue dans la requête et on vérifie l'animation
       chez nous. */
    if(ids.length) p.with_genres = ids.join('|');
    else if(anim != null) p.with_genres = String(anim);
  }else if(ids.length){
    /* Les genres partent en OU : cocher « Horreur » et « Thriller » dans une
       même humeur veut dire l'un OU l'autre, pas les deux à la fois. */
    p.with_genres = ids.join('|');
  }
  if(mots.length) p.with_keywords = mots.join('|');

  if(r.plates.length){
    p.with_watch_providers = r.plates.map(x => x.id).join('|');
    p.watch_region = REGION_PLATO;
    p.with_watch_monetization_types = 'flatrate';
  }
  const ep = RECH_EPOQUES.find(x => x.id === r.epoque);
  if(ep && ep.de){
    const champ = media === 'movie' ? 'primary_release_date' : 'first_air_date';
    p[champ+'.gte'] = ep.de; p[champ+'.lte'] = ep.a;
  }
  if(r.noteMin){
    p['vote_average.gte'] = String(r.noteMin);
    p['vote_count.gte'] = String(Math.max(RECH_VOTES_MINI, DISC_VOTES_MINI));
  }
  return p;
}

async function chargerCriteres(suite){
  const r = etatRech();
  const seq = ++critSeq;
  r.page = suite ? r.page + 1 : 1;
  if(!suite){
    r.res = []; r.pages = 1; r.decal = 0;
    oublierDefil('search');
    if(view === 'search') window.scrollTo(0,0);
  }
  r.loading = true; r.err = '';
  peindreRech();
  try{
    const media = rechMedia();
    await chargerGenres(media);
    chargerPlates(media).then(()=>{ if(view === 'search') peindreRech(); });
    let trouves = [], pagesTotal = 1, pageLue = r.page;
    for(let tour = 0; tour < RECH_PAGES_MAX; tour++){
      const p = paramsRech();
      p.page = String(pageLue);
      const d = await tmdb('/discover/'+media, p);
      if(seq !== critSeq) return;
      pagesTotal = d.total_pages || 1;
      trouves = trouves.concat(garderAnimesRech((d.results||[]).filter(x => x && x.poster_path)));
      if(trouves.length >= RECH_CIBLE || pageLue >= pagesTotal) break;
      pageLue++;
    }
    r.page = pageLue;
    /* Le classement TMDB bouge entre deux requêtes : un même titre peut figurer
       sur deux pages voisines. Sans ce tamis il apparaîtrait deux fois. */
    const vus = {};
    (suite ? r.res : []).forEach(x => { vus[x.id] = 1; });
    trouves = trouves.filter(x => vus[x.id] ? false : (vus[x.id] = 1));
    /* « Rien que tu n'aies déjà vu » : sur une recherche par critères, ce qu'on
       a déjà est du bruit. Sur un titre tapé c'est l'inverse — voir plus haut. */
    trouves = trouves.filter(x => !chezSoiRech(x));
    r.res = suite ? r.res.concat(trouves) : trouves;
    r.pages = pagesTotal; r.loading = false; r.err = ''; r.charge = true;
    peindreRech();
    if(r.vue === 'selection') chargerFiches();
  }catch(e){
    if(seq !== critSeq) return;
    if(suite) r.page = Math.max(1, r.page - 1);
    r.loading = false; r.charge = true;
    r.err = (e.message === 'BADKEY') ? 'Service indisponible' : 'Pas de connexion';
    peindreRech();
  }
}

/* ===================== Les fiches de la sélection =====================
   La durée d'un film et le nombre de saisons d'une série n'existent QUE sur la
   fiche. On va les chercher — mais seulement pour les douze titres montrés, et
   par paquets de six. Douze requêtes par recherche, jamais plus, et zéro sur la
   grille « Tout voir ». C'est ce plafond qui rend la promesse « j'ai 1 h 30 »
   tenable ; sur cent titres elle ne le serait pas. */
function cleFiche(x){ return rechMedia()+':'+x.id; }
/* QUELLES FICHES ALLER CHERCHER. Piège corrigé : demander celles des douze
   PREMIERS de la liste ne marche pas, parce que les rangées sont bâties sur
   des tris différents — les trois « plus vus » ne sont presque jamais les trois
   premiers du vivier, et leur badge de durée restait vide. On demande donc les
   fiches des titres que les tris DÉTERMINISTES vont retenir : les plus vus, les
   mieux notés, et les mieux notés parmi les moins connus. La rangée des durées,
   elle, puise dans ce même vivier une fois les fiches arrivées. */
function pourFiches(l){
  /* Seize, pas douze. Trois rangées se calculent sans fiche (les plus vus, les
     mieux notés, les moins connus) : neuf titres, plus le jeu du dédoublonnage.
     La quatrième — « les plus courts » — puise dans le MÊME vivier une fois les
     durées connues, et il lui faut donc de quoi choisir. Seize fiches, jamais
     plus, et zéro sur la grille « Tout voir ». */
  const combien = (tempsCourant() && tempsCourant().id !== 'peu') ? RECH_FICHES * 2 : RECH_FICHES;
  const saut = ((etatRech().decal || 0) * 3);
  const tourner = a => (saut && a.length > saut) ? a.slice(saut).concat(a.slice(0, saut)) : a;
  const parVotes = tourner([...l].sort((a,b)=>(b.vote_count||0)-(a.vote_count||0)));
  const parNote  = tourner([...l].sort((a,b)=>(b.vote_average||0)-(a.vote_average||0)));
  const discrets = tourner(parNote.filter(x=>(x.vote_count||0) < 3000));
  /* À TOUR DE RÔLE, une par liste. Piège corrigé : servir la première liste
     jusqu'au quota la remplissait à elle seule, et les rangées « mieux notés »
     et « à découvrir » n'avaient aucune fiche — donc aucune durée. */
  const sources = [parVotes, parNote, discrets, l];
  const vus = {}, out = [];
  for(let i = 0; out.length < combien && i < 40; i++){
    let avance = false;
    for(const src of sources){
      const x = src[i];
      if(!x || vus[x.id]) continue;
      vus[x.id] = 1; out.push(x); avance = true;
      if(out.length >= combien) break;
    }
    if(!avance && i >= l.length) break;
  }
  return out;
}
async function chargerFiches(){
  const r = etatRech(), media = rechMedia();
  const seq = ++ficheSeq;
  const manquants = pourFiches(r.res).filter(x => r.fiches[cleFiche(x)] === undefined);
  for(let i = 0; i < manquants.length; i += RECH_LOT_FICHES){
    const lot = manquants.slice(i, i + RECH_LOT_FICHES);
    await Promise.all(lot.map(x => remplirFiche(media, x.id)));
    if(seq !== ficheSeq || view !== 'search') return;
    peindreRech();
  }
  /* Deuxième passe : ce que le rendu a réellement affiché et dont la fiche
     manque encore. Bornée par `RECH_FICHES_MAX`, et une seule fois — les
     titres traités portent désormais une entrée, fût-elle `null`. */
  const restants = (r.montres || [])
    .filter(id => r.fiches[media+':'+id] === undefined)
    .slice(0, RECH_FICHES_MAX - Object.keys(r.fiches).length);
  if(!restants.length || seq !== ficheSeq) return;
  await Promise.all(restants.map(id => remplirFiche(media, id)));
  if(seq !== ficheSeq || view !== 'search') return;
  peindreRech();
}
/* Une fiche, une entrée — même en cas d'échec, pour ne jamais la redemander
   en boucle depuis la deuxième passe. */
async function remplirFiche(media, id){
  const r = etatRech();
  try{
    const d = await tmdb('/'+media+'/'+id);
    r.fiches[media+':'+id] = {
      duree: media === 'movie' ? (d.runtime || null) : ((d.episode_run_time||[])[0] || null),
      saisons: d.number_of_seasons || null, resume: d.overview || '', statut: d.status || ''
    };
  }catch(e){ r.fiches[media+':'+id] = null; }
}
function ficheDe(x){ const f = etatRech().fiches[cleFiche(x)]; return f || null; }

/* Le temps demandé est vérifié TITRE PAR TITRE, sur la fiche. Un titre dont on
   n'a pas encore la fiche passe : mieux vaut le montrer et corriger que faire
   clignoter la grille. */
function tientDansLeTemps(x){
  const t = tempsCourant();
  if(!t || t.id === 'peu') return true;
  const f = ficheDe(x);
  if(!f) return true;
  if(rechMedia() === 'movie'){
    if(!f.duree) return true;
    if(t.max != null && f.duree > t.max) return false;
    if(t.min != null && f.duree < t.min) return false;
    return true;
  }
  if(!f.saisons) return true;
  if(t.maxS != null && f.saisons > t.maxS) return false;
  if(t.minS != null && f.saisons < t.minS) return false;
  return true;
}

/* ================================ L'écran ================================ */

function viewRecherche(){
  const r = etatRech();
  const sub = champRech() + barreCriteres();
  return header('Recherche', {sub:sub}) +
    '<div id="rres">'+corpsRech()+'</div>' +
    '<div style="height:20px"></div>';
}
function champRech(){
  const r = etatRech();
  return '<div class="qbar">'+I.search+
    '<input type="search" id="q" enterkeyhint="search" autocomplete="off" autocorrect="off" '+
      'placeholder="Chercher un titre précis…" value="'+esc(r.q)+'" oninput="saisieRech(this.value)" '+
      'onkeydown="if(event.key===\'Enter\'){this.blur();lancerTitre()}">'+
    '<button class="qclear'+(r.q?'':' masque')+'" onclick="saisieRech(\'\')" '+
      'aria-label="Effacer">'+I.close+'</button></div>';
}
/* Une fois les critères posés, ils se replient sur UNE ligne qui défile. Étalés
   sur toute la hauteur comme au repos, ils repoussaient la première jaquette
   sous le pli — et toute la promesse de cet écran est que les critères et leurs
   résultats tiennent ensemble. */
function barreCriteres(){
  const r = etatRech();
  if(modeRech() !== 'criteres') return '';
  const h = humeurCourante(), t = tempsCourant();
  let l = '<button class="chip on" onclick="viderRech()">'+esc(cadreCourant().label)+'</button>';
  if(h) l += '<button class="chip on" onclick="setHumeur(\''+h.id+'\')">'+esc(h.t)+'</button>';
  if(t && t.id !== 'peu') l += '<button class="chip on" onclick="setTemps(\''+t.id+'\')">'+esc(t.t)+'</button>';
  const ep = RECH_EPOQUES.find(x=>x.id===r.epoque);
  if(ep && ep.court) l += '<button class="chip on" onclick="setEpoqueRech(\'tout\')">'+esc(ep.court)+'</button>';
  if(r.noteMin) l += '<button class="chip on" onclick="setNoteRech(0)">'+r.noteMin+' et +</button>';
  r.genres.forEach(n=> l += '<button class="chip on" onclick="bascGenreRech(\''+escJs(n)+'\')">'+esc(n)+'</button>');
  if(r.plates.length) l += '<button class="chip on" onclick="viderPlatesRech()">'+
    esc(r.plates.length > 2 ? r.plates.length+' plateformes' : r.plates.map(p=>p.nom).join(' ou '))+'</button>';
  l += '<button class="chip'+(r.regle?' on':'')+'" onclick="ouvrirReglage('+(!r.regle)+')">Régler</button>';
  return '<div class="chips" data-rail="crit-rech">'+l+'</div>';
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
  const r = etatRech(), mode = modeRech();
  if(r.regle) return panneauReglage();
  if(mode === 'repos') return corpsReposRech();
  if(r.loading && !r.res.length)
    return '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">On cherche…</p></div>';
  if(r.err)
    return '<div class="empty">'+I.search+'<h3>'+esc(r.err)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="'+(mode==='titre'?'lancerTitre()':'chargerCriteres()')+'">'+
      'Réessayer</button></div>';
  return mode === 'titre' ? corpsTitreRech() : corpsCriteresRech();
}

/* ---------------- Au repos : une question, pas un formulaire ------------- */
function corpsReposRech(){
  const r = etatRech();
  return '<div class="qgros">Ce soir, tu regardes quoi&nbsp;?</div>'+
    '<div class="seg">'+CADRES.map(c=>
      '<button class="'+(r.cadre===c.id?'on':'')+'" onclick="setCadre(\''+c.id+'\')">'+
        esc(c.label)+'</button>').join('')+'</div>'+
    '<div class="sectitle">De quoi t\'as envie&nbsp;?</div>'+
    '<div class="tuiles">'+humeursCadre().map(h=>
      '<button class="'+(r.humeur===h.id?'on':'')+'" onclick="setHumeur(\''+h.id+'\')">'+
        '<b>'+esc(h.t)+'</b><span>'+esc(h.s)+'</span></button>').join('')+'</div>'+
    '<div class="sectitle">'+(r.cadre==='film' ? 'Combien de temps t\'as&nbsp;?'
                                               : 'Tu veux t\'engager combien&nbsp;?')+'</div>'+
    '<div class="chips ochips" style="margin:0 16px 4px">'+tempsCadre().map(t=>
      '<button class="chip '+(r.temps===t.id?'on':'')+'" onclick="setTemps(\''+t.id+'\')">'+
        esc(t.t)+'</button>').join('')+'</div>'+
    '<div class="wrap tiny muted" style="padding-top:16px">Rien que tu aies déjà vu. '+
      '<button class="lienplus" style="margin:0" onclick="ouvrirReglage(true)">Régler plus finement</button></div>';
}

/* --------------- Un titre tapé : ta bibliothèque d'abord ---------------- */
function corpsTitreRech(){
  const r = etatRech();
  if(!r.res.length)
    return '<div class="empty"><h3>Rien trouvé pour « '+esc(rechTexte())+' »</h3>'+
      '<p>Essaie une autre orthographe, ou change de type juste au-dessus.</p></div>';
  const chezSoi = r.res.filter(chezSoiRech), ailleurs = r.res.filter(x=>!chezSoiRech(x));
  let h = '';
  if(chezSoi.length)
    h += '<div class="sectitle">Déjà chez toi</div>'+
      '<div class="grid">'+chezSoi.map(x=>carteTitre(x, rechMedia(), 'search')).join('')+'</div>';
  if(ailleurs.length)
    h += '<div class="sectitle">'+(chezSoi.length ? 'Dans le catalogue' : 'Résultats')+'</div>'+
      '<div class="grid">'+ailleurs.map(x=>carteTitre(x, rechMedia(), 'search')).join('')+'</div>';
  return h;
}

/* ================= LA SÉLECTION — quatre rangées de trois =================
   Quarante affiches d'affilée, c'est la paralysie qu'on essaie justement de
   défaire : rien ne distingue rien, et on referme l'app. Douze titres répartis
   en quatre rangées dont l'intitulé dit POURQUOI elles sont là, ce sont quatre
   petites décisions au lieu d'une grosse — et on sait d'avance si une rangée
   nous concerne. La grille complète reste à un bouton, pour les soirs où l'on
   veut vraiment parcourir. */
function corpsCriteresRech(){
  const r = etatRech();
  if(r.vue === 'grille') return grilleRech();
  const dispo = r.res.filter(tientDansLeTemps);
  if(!dispo.length && r.charge)
    return '<div class="empty">'+I.boussole+'<h3>Rien avec ces critères</h3>'+
      '<p>Retire une plateforme, ou choisis une autre envie.</p>'+
      '<button class="btn ghost" onclick="viderRech()">Tout effacer</button></div>';

  const parNote  = [...dispo].sort((a,b)=>(b.vote_average||0)-(a.vote_average||0));
  const parVotes = [...dispo].sort((a,b)=>(b.vote_count||0)-(a.vote_count||0));
  const courts   = [...dispo].filter(x=>{ const f=ficheDe(x); return f && f.duree; })
                             .sort((a,b)=>ficheDe(a).duree - ficheDe(b).duree);
  const pris = {};
  const saut = ((etatRech().decal || 0) * 3);
  const prendre = (l, n)=>{
    const out = [];
    /* Le décalage tourne DANS le tri : « montre-m'en d'autres » descend de
       trois rangs dans chaque classement plutôt que de rejouer les mêmes. */
    const src = saut && l.length > saut ? l.slice(saut).concat(l.slice(0, saut)) : l;
    for(const x of src){ if(pris[x.id]) continue; pris[x.id] = 1; out.push(x); if(out.length === n) break; }
    return out;
  };
  const rangees = [
    ['Les valeurs sûres', 'les plus vus', prendre(parVotes, 3)],
    [ rechMedia()==='movie' ? 'Les plus courts' : 'Les épisodes les plus courts',
      'durée vérifiée', prendre(courts, 3)],
    ['Les mieux notés', '', prendre(parNote, 3)],
    ['À découvrir', 'moins connus, bien notés',
      prendre(parNote.filter(x=>(x.vote_count||0) < 3000), 3)]
  ].filter(g => g[2].length);

  /* Le rendu note ce qu'il montre VRAIMENT. Le dédoublonnage entre rangées peut
     descendre plus loin dans un tri que ce que le pré-calcul avait prévu : sans
     ce relevé, une ou deux jaquettes restaient sans durée. `chargerFiches` s'en
     sert pour compléter, une seule fois, et sans dépasser son plafond. */
  etatRech().montres = rangees.reduce((a,g)=>a.concat(g[2].map(x=>x.id)), []);
  let h = '<div class="wrap" style="padding-top:12px">'+
      '<b style="font-size:18px">Pour ce soir</b>'+
      '<div class="tiny muted" style="margin-top:2px">'+esc(introSelection(dispo.length))+'</div></div>';
  h += rangees.map(g=>
    '<div class="sectitle">'+esc(g[0])+(g[1]?'<span class="pq">'+esc(g[1])+'</span>':'')+'</div>'+
    '<div class="rang3">'+g[2].map(x=>jaquetteRech(x)).join('')+'</div>').join('');
  h += '<div class="wrap" style="padding-top:18px;display:flex;gap:9px">'+
      '<button class="btn ghost" style="flex:1" onclick="rebattreRech()">Montre-m\'en d\'autres</button>'+
      '<button class="btn ghost" style="flex:1" onclick="setVueRech(\'grille\')">Tout voir</button></div>';
  return h;
}
function introSelection(n){
  const c = etatRech().cadre;
  const quoi = c === 'film' ? 'films' : c === 'serie' ? 'séries' : 'animés';
  const ou = etatRech().plates.length ? ' sur tes plateformes' : '';
  return 'Des '+quoi+' que tu n\'as pas vus'+ou+'. '+n+' correspondent.';
}
/* Rebattre : on avance d'un cran DANS CHAQUE TRI, pas dans le vivier brut.
   Faire tourner la liste d'origine ne changeait rien à l'écran — les rangées
   sont bâties sur des tris, et décaler la source d'un rang laissait les mêmes
   trois têtes. Gratuit : la fournée ramène une quarantaine de titres pour
   douze montrés, il y a de quoi tourner. */
function rebattreRech(){
  const r = etatRech();
  const tours = Math.max(1, Math.floor(r.res.length / 3));
  r.decal = ((r.decal || 0) + 1) % tours;
  peindreRech();
  chargerFiches();
}

/* La jaquette porte la DURÉE, parce que c'est le seul fait qui décide vraiment
   à 21 h, et qu'on doit pouvoir le lire en balayant trois colonnes sans rien
   ouvrir. Elle vient de la fiche, jamais de la liste : `/discover` ne la donne
   pas, et l'index de recherche de TMDB s'en écarte trois fois sur dix. */
function jaquetteRech(x){
  const media = rechMedia();
  const nom = media === 'tv' ? x.name : x.title;
  const date = media === 'tv' ? x.first_air_date : x.release_date;
  const f = ficheDe(x);
  const n = x.vote_average ? Math.round(x.vote_average*10)/10 : null;
  let badge = '';
  if(f && f.duree) badge = media === 'movie' ? dureeCourte(f.duree) : f.duree+' min';
  else if(f && f.saisons) badge = f.saisons+' saison'+(f.saisons>1?'s':'');
  return '<button class="jq" onclick="ouvrirDetailRech('+x.id+')">'+
    '<div class="jqaff">'+posterEl(x.poster_path,'w342','',nom)+
      (badge ? '<span class="jqduree">'+esc(badge)+'</span>' : '')+
    '</div>'+
    '<div class="jqnom">'+esc(nom)+'</div>'+
    '<div class="jqmeta">'+esc(year(date))+(n?' · <span class="jqnote">'+I.star+n.toFixed(1)+'</span>':'')+'</div>'+
  '</button>';
}
function dureeCourte(m){
  if(!m) return '';
  return m >= 60 ? Math.floor(m/60)+'h'+String(m%60).padStart(2,'0') : m+' min';
}

/* -------- La grille : EXACTEMENT celle de Découvrir, `carteTitre` --------
   C'est la vue qu'Adrien a filmée et qu'il veut garder. On ne la réinvente pas,
   on appelle le même composant : trois jaquettes par rangée, la note, l'année,
   le nombre de votes, et « Voir plus ». */
function grilleRech(){
  const r = etatRech();
  let h = '<div class="wrap" style="padding-top:12px;display:flex;justify-content:space-between;align-items:baseline">'+
      '<b style="font-size:16px">'+r.res.length+' titre'+(r.res.length>1?'s':'')+'</b>'+
      '<button class="lienplus" style="margin:0" onclick="setVueRech(\'selection\')">Revenir à la sélection</button></div>'+
    '<div class="grid">'+r.res.map(x=>carteTitre(x, rechMedia(), 'search')).join('')+'</div>';
  if(r.page < r.pages)
    h += '<div class="wrap" style="padding-top:12px"><button class="btn ghost" style="width:100%" '+
         'onclick="chargerCriteres(true)">'+
         (r.loading ? '<span class="spin"></span> Chargement…' : 'Voir plus')+'</button></div>';
  return h;
}

/* ====================== La feuille de détail ======================
   Le synopsis n'a pas disparu en passant aux rangées de trois : il est à un
   appui au lieu d'être toujours là. Les plateformes ne sont demandées QU'ICI,
   à l'ouverture — une requête sur un titre qu'on regarde, plutôt que douze sur
   des titres qu'on survole. */
let detailRech = { id:null, plates:null };
function ouvrirDetailRech(id){
  const r = etatRech(), media = rechMedia();
  const x = r.res.find(y => y.id === id);
  if(!x) return;
  detailRech = { id:id, plates:null };
  peindreDetail(x);
  if(!ficheDe(x)) chargerUneFiche(x).then(()=>{ if(detailRech.id === id) peindreDetail(x); });
  chargerPlatesTitre(id, media).then(l=>{
    if(detailRech.id !== id) return;
    detailRech.plates = l; peindreDetail(x);
  });
}
async function chargerUneFiche(x){
  const media = rechMedia();
  try{
    const d = await tmdb('/'+media+'/'+x.id);
    etatRech().fiches[media+':'+x.id] = {
      duree: media === 'movie' ? (d.runtime||null) : ((d.episode_run_time||[])[0]||null),
      saisons: d.number_of_seasons || null, resume: d.overview || '', statut: d.status || ''
    };
  }catch(e){ etatRech().fiches[media+':'+x.id] = null; }
}
async function chargerPlatesTitre(id, media){
  try{
    const d = await tmdb('/'+media+'/'+id+'/watch/providers');
    const fr = ((d.results||{})[REGION_PLATO]) || {};
    return (fr.flatrate || []).map(p=>p.provider_name);
  }catch(e){ return []; }
}
function peindreDetail(x){
  const media = rechMedia();
  const nom = media === 'tv' ? x.name : x.title;
  const date = media === 'tv' ? x.first_air_date : x.release_date;
  const f = ficheDe(x);
  const n = x.vote_average ? Math.round(x.vote_average*10)/10 : null;
  const bouts = [year(date)];
  if(f && f.duree) bouts.push(media === 'movie' ? dureeCourte(f.duree) : f.duree+' min par épisode');
  if(f && f.saisons) bouts.push(f.saisons+' saison'+(f.saisons>1?'s':''));
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
    (f && f.resume ? '<div class="dsyn">'+esc(f.resume)+'</div>'
                   : '<div class="dsyn muted"><span class="spin"></span></div>')+
    '<div class="dact">'+
      '<button class="btn" onclick="closeSheet();ouvrirTitre('+x.id+',\''+media+'\',\'search\')">Voir la fiche</button>'+
    '</div>';
  openSheet(h, 'detail-rech');
}
FERMETURES['detail-rech'] = function(){ detailRech = { id:null, plates:null }; };

/* ========================== Le réglage fin ==========================
   Une rubrique par ligne, la valeur en cours à droite, une seule dépliée à la
   fois. RIEN N'EST ALLUMÉ tant qu'on n'a pas choisi : six pastilles bleues
   disant toutes « peu importe » se liraient comme six filtres actifs. */
function panneauReglage(){
  const r = etatRech();
  let h = '<div class="wrap" style="padding-top:14px;display:flex;justify-content:space-between;align-items:baseline">'+
      '<b style="font-size:16px">Régler plus finement</b>'+
      '<button class="lienplus" style="margin:0" onclick="ouvrirReglage(false)">Fermer</button></div>'+
    '<div class="wrap">';
  reglagesCadre().forEach(sec=>{ h += ligneReglage(sec.cle, sec.lab); });
  h += '</div><div class="wrap" style="padding-top:16px">'+
      '<button class="btn block" onclick="ouvrirReglage(false)">'+esc(libelleVoir())+'</button>'+
      '<div class="tiny muted center" style="margin-top:7px">Rien que tu aies déjà vu.</div></div>';
  return h;
}
function libelleVoir(){
  const r = etatRech();
  const quoi = r.cadre === 'film' ? 'films' : r.cadre === 'serie' ? 'séries' : 'animés';
  return r.charge && r.res.length ? 'Voir les '+r.res.length+' '+quoi : 'Voir les résultats';
}
function ligneReglage(cle, lab){
  const r = etatRech();
  const ouvert = r.ouvert === cle;
  return '<button class="fpli'+(ouvert?' ouvert':'')+'" onclick="deplier(\''+cle+'\')">'+
      '<span class="fplititre">'+esc(lab)+'</span>'+
      '<span class="fpliresume">'+esc(valeurReglage(cle))+'</span>'+
      '<span class="fplicaret">'+I.caret+'</span></button>'+
    (ouvert ? '<div class="fplicorps">'+choixReglage(cle)+'</div>' : '');
}
function valeurReglage(cle){
  const r = etatRech();
  if(cle === 'epoque'){ const e = RECH_EPOQUES.find(x=>x.id===r.epoque); return (e && e.court) || ''; }
  if(cle === 'note')   return r.noteMin ? r.noteMin+' et +' : '';
  if(cle === 'genres') return r.genres.join(', ').toLowerCase();
  if(cle === 'plates') return r.plates.length
    ? (r.plates.length > 2 ? r.plates.length+' plateformes' : r.plates.map(p=>p.nom).join(' ou ')) : '';
  return '';
}
function choixReglage(cle){
  const r = etatRech();
  /* RIEN N'EST ALLUMÉ TANT QU'ON N'A PAS CHOISI. « Peu importe » en bleu dans
     chaque rubrique, ça se lit comme quatre filtres actifs — l'inverse exact de
     ce qu'on veut dire. L'absence de réglage doit ressembler à une absence. */
  if(cle === 'epoque')
    return '<div class="fchips">'+RECH_EPOQUES.map(e=>
      '<button class="chip '+(r.epoque!=='tout' && r.epoque===e.id?'on':'')+'" '+
        'onclick="setEpoqueRech(\''+e.id+'\')">'+esc(e.label)+'</button>').join('')+'</div>';
  if(cle === 'note')
    return '<div class="fchips">'+RECH_NOTES.map(n=>
      '<button class="chip '+(r.noteMin>0 && r.noteMin===n.v?'on':'')+'" '+
        'onclick="setNoteRech('+n.v+')">'+esc(n.label)+'</button>').join('')+'</div>';
  if(cle === 'genres'){
    const l = genresRech();
    if(!l.length) return '<div class="small muted">Les genres arrivent avec les premiers résultats.</div>';
    return '<div class="fchips">'+l.map(g=>
      '<button class="chip '+(r.genres.indexOf(g.nom)>=0?'on':'')+'" '+
        'onclick="bascGenreRech(\''+escJs(g.nom)+'\')">'+esc(g.nom)+'</button>').join('')+'</div>';
  }
  if(cle === 'plates'){
    const l = platesRech();
    if(!l.length){
      if(!platesTMDB[rechMedia()]) chargerPlates(rechMedia()).then(()=>{ if(view==='search') render(); });
      return '<div class="small muted">La liste des plateformes arrive.</div>';
    }
    return '<div class="fchips">'+l.map((p,i)=>{
        const on = r.plates.some(x => x.id === p.id);
        const logo = srcImage(p.logo,'w45') ? '<img loading="lazy" src="'+srcImage(p.logo,'w45')+'" alt="">' : '';
        return '<button class="chip chiplogo '+(on?'on':'')+'" onclick="bascPlateRech('+i+')">'+
          logo+'<span>'+esc(p.nom)+'</span></button>';
      }).join('')+'</div>'+
      (r.plates.length ? '<div class="small muted" style="margin-top:8px">'+
        'Il suffit qu\'un titre soit sur <b>une</b> de ces plateformes. '+
        '<button class="lienplus" style="margin:0" onclick="viderPlatesRech()">Tout décocher</button></div>' : '');
  }
  return '';
}
