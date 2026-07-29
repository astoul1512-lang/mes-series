"use strict";
/* ---------- Vue : Recherche ---------- */
/* Recherche progressive : 2 caractères minimum, 300 ms d'attente après la dernière
   frappe, requête précédente abandonnée, 8 résultats au maximum. Le champ n'est jamais
   redessiné pendant la frappe — seule la zone de résultats est rafraîchie. */
const SEARCH_MIN = 2, SEARCH_WAIT = 300, SEARCH_MAX = 8;
let searchTimer = null, searchAbort = null, searchSeq = 0;

/* Une recherche est « active » dès qu'il y a assez de lettres dans le champ.
   Tant qu'elle ne l'est pas, l'écran montre les suggestions. */
function enRecherche(){ return (ui.searchQ||'').trim().length >= SEARCH_MIN; }

/* Zone de résultats seule : chargement, erreur, aucun résultat, ou la grille */
function searchBody(){
  if(ui.searching)
    return '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Recherche…</p></div>';
  if(ui.searchErr)
    return '<div class="empty">'+I.search+'<h3>'+esc(ui.searchErr)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="searchNow()">Réessayer</button></div>';
  if(!ui.searchRes || !ui.searchRes.length)
    return '<div class="empty"><h3>Rien trouvé dans '+esc(libelleCherche())+'</h3>'+
      '<p>Essaie une autre orthographe, ou change de type juste au-dessus.</p></div>';
  return '<div class="grid">'+ui.searchRes.map(r=>
    carteTitre(r, r.media_type || discMedia())).join('')+'</div>';
}

function onSearchInput(v){
  const avant = enRecherche();
  ui.searchQ = v;
  clearTimeout(searchTimer);
  abortSearch();
  const q = v.trim();
  /* Bascule entre suggestions et résultats : on repart du haut de la liste. */
  if(enRecherche() !== avant){ oublierDefil('discover'); window.scrollTo(0,0); }
  if(q.length < SEARCH_MIN){
    ui.searchRes = null; ui.searching = false; ui.searchErr = '';
    peindreDisc(); return;                    // on retombe sur les suggestions
  }
  ui.searching = true; ui.searchErr = '';
  peindreDisc();
  searchTimer = setTimeout(()=> runSearch(q), SEARCH_WAIT);
}

function searchNow(){
  clearTimeout(searchTimer);
  const q = (ui.searchQ||'').trim();
  if(q.length < SEARCH_MIN) return;
  ui.searching = true; ui.searchErr = ''; peindreDisc();
  runSearch(q);
}

function viderRecherche(){
  clearTimeout(searchTimer); abortSearch();
  ui.searchQ = ''; ui.searchRes = null; ui.searching = false; ui.searchErr = '';
  render();
}

function abortSearch(){
  if(searchAbort){ try{ searchAbort.abort(); }catch(e){} searchAbort = null; }
}

/* La recherche TMDB n'accepte ni genre ni langue : quand la puce Animés est
   choisie, on écarte nous-mêmes ce qui n'est pas de l'animation japonaise.
   Si les résultats ne portent pas ces informations, on ne filtre pas à l'aveugle. */
function garderAnimes(res){
  if(ui.disc.type !== 'anime') return res;
  const anim = genreParNom('tv','Animation');
  if(anim == null) return res;
  const exploitables = res.every(r => r && typeof r.original_language === 'string' && Array.isArray(r.genre_ids));
  if(!exploitables) return res;
  return res.filter(r => r.original_language === 'ja' && r.genre_ids.indexOf(anim) >= 0);
}

/* Écarte des suggestions ce qui n'est pas occidental. Même prudence que pour
   les animés : si les résultats ne portent pas la langue, on ne filtre pas à
   l'aveugle plutôt que de vider l'écran. */
function garderOccident(res){
  if(ui.disc.type === 'anime') return res;
  const exploitables = res.every(r => r && typeof r.original_language === 'string');
  if(!exploitables) return res;
  return res.filter(r => LANGUES_OCCIDENT.indexOf(r.original_language) >= 0);
}

async function runSearch(q){
  const seq = ++searchSeq;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  searchAbort = ctrl;
  try{
    if(ui.disc.type === 'anime') await chargerGenres('tv');   // besoin de l'id du genre Animation
    if(seq !== searchSeq) return;
    /* Les animés restent des séries : TMDB ne cherche que dans tv ou movie. */
    /* Sur « Tout », films et séries se cherchent ensemble : taper « Dune »
       depuis la vitrine ne doit pas rester muet parce que c'est un film. */
    const chemin = ui.disc.type === 'tout' ? '/search/multi' : '/search/'+discMedia();
    const d = await tmdb(chemin, { query:q, include_adult:'false' },
                         ctrl ? {signal:ctrl.signal} : null);
    if(seq !== searchSeq) return;                      // une frappe plus récente a pris la main
    let res = d.results || [];
    if(ui.disc.type === 'tout')
      res = res.filter(r => r.media_type === 'tv' || r.media_type === 'movie');
    ui.searchRes = garderAnimes(res).slice(0, SEARCH_MAX);
    ui.searching = false; ui.searchErr = '';
    peindreDisc();
  }catch(e){
    if((e && e.name === 'AbortError') || seq !== searchSeq) return;
    ui.searching = false;
    ui.searchErr = (e.message === 'BADKEY') ? 'Service indisponible' : 'Pas de connexion';
    ui.searchRes = [];
    peindreDisc();
  }
}

/* Vignette commune aux suggestions et aux résultats de recherche. */
function carteTitre(r, media, from){
  const isTv = media === 'tv';
  const name = isTv ? r.name : r.title;
  const date = isTv ? r.first_air_date : r.release_date;
  const item = isTv ? db.shows[r.id] : db.movies[r.id];
  const st   = item ? statut(item) : null;
  const note = r.vote_average ? Math.round(r.vote_average*10)/10 : null;
  const votes = r.vote_count || 0;

  let coin = '';
  if(st === 'vu')         coin = '<div class="tick vu">'+I.check+'</div>';
  else if(st === 'avoir') coin = '<div class="tick avoir">'+I.bookmark+'</div>';
  else if(st === 'asuivre'){
    const p = progress(item);
    coin = '<div class="tick suivi">'+p.watched+'/'+p.total+'</div>';
  }

  const prov = from || 'discover';
  return '<button class="gcard" onclick="openPreview('+r.id+',\''+media+'\',\''+prov+'\')">'+
    posterEl(r.poster_path,'w342','',name)+ coin +
    (note ? '<div class="gnote">'+I.star+note.toFixed(1)+'</div>' : '')+
    '<div class="gname">'+esc(name)+'</div>'+
    '<div class="gyear">'+esc(year(date))+(votes?' · '+votes+' vote'+(votes>1?'s':''):'')+'</div>'+
    (st ? '<div class="gstat '+st+'">'+LIB_STATUT[st]+'</div>' : '')+
  '</button>';
}

/* Amène l'écran sur la liste des saisons, là où se fait l'ajustement */
function versLesSaisons(){
  setTimeout(()=>{
    const el = document.querySelector('.sectitle.rowt');
    if(el) el.scrollIntoView({block:'start', behavior:'smooth'});
  }, 60);
}

async function addOrOpenShow(id){
  if(db.shows[id]) return go('show',{id:id, from: params.from || 'discover'});
  if(ui.busy) return;
  ui.busy = true;
  const btn = document.getElementById('addbtn');
  const setBtn = t=>{ if(btn) btn.innerHTML = '<span class="spin"></span> '+t; };
  if(btn) btn.setAttribute('disabled','');
  setBtn('Chargement des épisodes…');
  try{
    const s = await fetchShowFull(id, (a,b)=> setBtn('Saisons '+a+'/'+b+'…'));
    s.watched = {}; s.addedAt = Date.now();
    db.shows[id] = s; saveDB();
    toast('« '+s.name+' » ajoutée');
    ui.busy = false; go('show',{id:id, from: params.from || 'discover'});
    versLesSaisons();
  }catch(e){
    ui.busy = false; render();
    toast("Impossible d'ajouter cette série");
  }
}

async function addMovie(id, seen){
  try{
    const m = db.movies[id] ? null : await tmdb('/movie/'+id);
    if(m){
      db.movies[id] = { id:m.id, title:m.title, poster:m.poster_path, backdrop:m.backdrop_path,
        date:m.release_date, runtime:m.runtime, overview:m.overview,
        genres:(m.genres||[]).map(g=>g.name), note:m.vote_average||null,
        seen:!!seen, watchedAt: seen?Date.now():null, addedAt:Date.now() };
    } else {
      db.movies[id].seen = !!seen;
      db.movies[id].watchedAt = seen?Date.now():null;
    }
    saveDB();
    toast(seen ? 'Marqué comme vu ✓' : 'Ajouté à « À voir »');
    render();
  }catch(e){ toast("Erreur lors de l'ajout"); }
}

/* ---------- Vue : Découvrir (suggestions, filtres, nouveautés) ----------
   Tout passe par /discover/tv et /discover/movie. Les genres ne sont jamais
   codés en dur : ils sont demandés à TMDB (/genre/tv/list, /genre/movie/list)
   pour que les identifiants et les libellés français viennent de la source. */

/* Chaque puce ouvre sa propre vitrine de suggestions ; poser un filtre bascule
   sur la grille. « Tout » mêle les trois, les autres cadrent.
   « Mini-séries » a été retiré à la demande d'Adrien : c'était un sous-cas des
   séries, qui prenait une place de premier rang sans rien apporter à personne. */
const DISC_TYPES = [
  { id:'tout',  label:'Tout' },
  { id:'tv',    label:'Séries' },
  { id:'movie', label:'Films' },
  { id:'anime', label:'Animés' }
];
/* Deux réglages distincts, longtemps mélangés dans une seule rangée :
   ce qu'on regarde (tout le catalogue ou les sorties récentes),
   et dans quel ordre on le classe. */
/* Une seule question pour le temps qui passe : « Toutes » ouvre le catalogue,
   « Sorties récentes » le referme sur les derniers mois, et les décennies
   ouvrent une fenêtre précise. Deux réglages de date distincts se seraient
   contredits — celui-ci en remplace un seul. */
const DISC_PERIMETRES = [
  /* Pas de résumé quand rien n'est choisi : « Toutes » sur la ligne repliée
     laissait croire à un réglage actif. */
  { id:'tout',   label:'Peu importe',       court:'' },
  { id:'recent', label:'Sorties récentes',  court:'Sorties récentes' },
  { id:'2020s',  label:'Depuis 2020',       court:'depuis 2020', de:'2020-01-01', a:'2099-12-31' },
  { id:'2010s',  label:'Années 2010',       court:'années 2010', de:'2010-01-01', a:'2019-12-31' },
  { id:'2000s',  label:'Années 2000',       court:'années 2000', de:'2000-01-01', a:'2009-12-31' },
  { id:'1990s',  label:'Années 90',         court:'années 90',   de:'1990-01-01', a:'1999-12-31' },
  { id:'1980s',  label:'Années 80',         court:'années 80',   de:'1980-01-01', a:'1989-12-31' }
];
/* LA DURÉE EST DÉSACTIVÉE, et il faut dire pourquoi.

   `with_runtime` a été mesuré en direct le 29/07 sur des films établis d'avant
   2020, là où les fiches TMDB sont les plus sûres : la borne « 1 à 95 min »
   ramenait Les Infiltrés (151 min), Toy Story 3 (103) et WALL·E (98) — quatre
   titres hors bornes sur dix. La borne « 150 min et plus » ramenait Spider-Man
   (121) et Inception (148) — trois sur huit. La durée que TMDB garde dans son
   index de recherche n'est pas celle de la fiche.

   Un filtre qui se trompe trois fois sur dix est pire que pas de filtre : on
   croit avoir répondu à « j'ai une heure et demie » et on se retrouve devant
   2h30. Tant que ça n'est pas fiable, la rubrique reste hors de la feuille.
   Le tableau ci-dessous est conservé : il ne coûte rien et servira le jour où
   l'on aura de quoi vérifier la durée autrement. */
const DISC_DUREE_FIABLE = false;
const DISC_DUREES = [
  { id:'tout', label:'Peu importe',   court:'' },
  { id:'court',label:'Moins d\'1h30', court:'moins d\'1h30', max:89 },
  { id:'moyen',label:'Moins de 2h',   court:'moins de 2h',   max:119 },
  { id:'long', label:'2h et plus',    court:'2h et plus',    min:120 }
];
const DISC_TRIS = [
  { id:'populaire', label:'Les plus populaires', court:'populaire' },
  { id:'note',      label:'Les mieux notées',    court:'mieux notées' }
];
const DISC_NOTES = [
  { v:0, label:'Toutes' }, { v:6, label:'6 et +' }, { v:7, label:'7 et +' }, { v:8, label:'8 et +' }
];
const DISC_FENETRE = 90;     // « sorti récemment » = les 90 derniers jours

/* ---------------------------------------------------------------------------
   Les envies

   Un genre décrit un rayon de vidéoclub — « thriller », c'est des milliers de
   titres. Une envie décrit une soirée : un braquage, une enquête, une boucle
   temporelle. TMDB appelle ça des mots-clés, et c'est le seul moyen d'être
   précis sans écrire une phrase.

   Chaque identifiant a été relevé EN DIRECT sur TMDB, pas deviné : le nom du
   mot-clé devait correspondre exactement. Un identifiant inventé ne renvoie
   pas d'erreur, il renvoie une liste vide — d'où la vérification.

   `puces` dit où l'envie a un sens : « isekai » n'existe pas côté films,
   « hôpital » ne veut rien dire dans une liste d'animés. Sur la puce « Tout »,
   on montre le fonds commun. */
const ENVIES = [
  { id:6149,   label:'Enquête policière', puces:['tout','tv','movie'] },
  { id:9826,   label:'Meurtre',           puces:['tout','tv','movie'] },
  { id:10291,  label:'Crime organisé',    puces:['tout','tv','movie'] },
  { id:378,    label:'Prison',            puces:['tout','tv','movie'] },
  { id:9748,   label:'Vengeance',         puces:['tout','tv','movie'] },
  { id:6078,   label:'Politique',         puces:['tout','tv','movie'] },
  { id:11612,  label:'Hôpital',           puces:['tout','tv'] },
  { id:6282,   label:'Au boulot',         puces:['tout','tv','movie'] },
  { id:12279,  label:'Drame familial',    puces:['tout','tv','movie'] },
  { id:6054,   label:'Amitié',            puces:['tout','tv','movie','anime'] },
  { id:6270,   label:'Lycée',             puces:['tout','tv','movie'] },
  { id:10854,  label:'Boucle temporelle', puces:['tout','tv','movie','anime'] },
  { id:12332,  label:'Apocalypse',        puces:['tout','tv','movie','anime'] },
  { id:4458,   label:'Monde d\'après',    puces:['tout','tv','movie','anime'] },
  { id:9715,   label:'Super-héros',       puces:['tout','tv','movie'] },
  { id:6152,   label:'Surnaturel',        puces:['tout','tv','movie','anime'] },
  { id:2343,   label:'Magie',             puces:['tout','tv','movie','anime'] },
  { id:177895, label:'Dark fantasy',      puces:['tout','tv','movie','anime'] },
  { id:161176, label:'Space opera',       puces:['tout','tv','movie','anime'] },
  { id:6075,   label:'Sport',             puces:['tout','tv','movie','anime'] },
  { id:1918,   label:'Cuisine',           puces:['tout','tv','movie','anime'] },
  { id:1462,   label:'Samouraï',          puces:['tout','tv','movie','anime'] },
  /* Le vocabulaire propre aux animés : ces mots-clés n'ont aucun équivalent
     utile ailleurs, et ce sont ceux qu'on emploie vraiment pour en parler. */
  { id:207826, label:'Shōnen',            puces:['anime'] },
  { id:237451, label:'Isekai',            puces:['anime'] },
  { id:10046,  label:'Mecha',             puces:['anime'] },
  { id:9914,   label:'Tranche de vie',    puces:['anime'] },
  { id:12380,  label:'Tournoi',           puces:['anime'] },
  { id:15001,  label:'Démons',            puces:['anime'] },
  { id:10873,  label:'École',             puces:['anime'] }
];
function enviesAffichees(){
  const t = ui.disc.type;
  return ENVIES.filter(e => e.puces.indexOf(t) >= 0);
}
function envieParId(id){ return ENVIES.find(e => e.id === id) || null; }

/* Origine des titres proposés dans Découvrir.
   Classé par popularité, TMDB fait remonter énormément de production indienne,
   coréenne, japonaise et chinoise, qui noyait le reste. Les suggestions se
   limitent donc à l'anglophone et à l'Europe de l'Ouest.
   Deux exceptions volontaires :
   — la puce Animés, japonaise par construction, n'est pas concernée ;
   — la recherche par titre n'est jamais filtrée : chercher « Parasite » doit
     le trouver. C'est déjà le cas, les filtres ne s'appliquent pas à /search.
   Le tri se fait sur `original_language` renvoyé par TMDB, pas sur un paramètre
   de requête : c'est le seul champ dont on soit certain du comportement. */
const LANGUES_OCCIDENT = ['en','fr','es','it','de','pt','nl','sv','da','no','nb','fi','is'];
/* Une fournée vise une cinquantaine de titres : une seule page TMDB (20 films
   au mieux) faisait un écran trop court, et « Voir plus » n'apportait presque
   rien — le reproche exact d'Adrien. Trois requêtes par fournée, pas plus :
   au-delà, c'est le quota qu'on brûle pour du défilement. */
const DISC_CIBLE = 40;       // en dessous, on va chercher la page suivante
const DISC_PAGES_MAX = 3;    // jamais plus de 3 requêtes pour remplir un écran

const genresTMDB = { tv:null, movie:null };
const platesTMDB = { tv:null, movie:null };
/* Nombre de plateformes montrées d'emblée dans les filtres ; le reste
   se déplie à la demande. TMDB en recense plus de cent pour la France. */
const PLATES_VEDETTE = 12;
/* TMDB mélange dans une même liste les abonnements (Netflix) et les boutiques de
   location à l'acte (Canal VOD, Orange VOD), sans jamais dire lesquelles sont
   lesquelles. Et son paramètre « type d'offre » est ignoré dès qu'on le combine
   avec un fournisseur : demander Canal VOD en abonnement renvoie quand même ses
   films à louer. On ne peut donc pas se fier à la requête ; on apprend la réponse
   ailleurs. Sur un échantillon de titres populaires, on relève les plateformes
   qui apparaissent réellement en « flatrate » : celles-là font de l'abonnement,
   les autres sont des boutiques et n'ont rien à faire dans ce filtre.
   L'échantillon suit ce que l'écran montre : sur la puce Animés il est fait
   d'animés, ce qui fait apparaître Crunchyroll et ADN, invisibles dans un
   échantillon de séries généralistes. Ce qui a été appris ne se perd jamais :
   les plateformes s'accumulent d'un type à l'autre. */
const PLATES_ECHANTILLON = 18, PLATES_PAQUET = 6, PLATES_MINI = 4;
/* Doublons du même service, écartés de la liste : les formules avec publicité,
   et les revendeurs (« Paramount+ Amazon Channel » n'est qu'une façon de payer
   Paramount+, le catalogue est le même). */
const PLATES_PUB = /\bwith ads\b|\bavec (de la )?pub|\b(amazon|apple tv) channel\b/i;
const platesAbo = { tv:{}, movie:{} };      // id → true (fait de l'abonnement en France)
const platesAboFait = { tv:false, movie:false };
const sondagesFaits = {};                   // « tv:anime » → true
let sondageEnCours = false;
let discSeq = 0;

/* Le média TMDB derrière chaque puce : les animés restent des séries. */
function discMedia(){ return ui.disc.type === 'movie' ? 'movie' : 'tv'; }
function isoIlYA(jours){ return new Date(Date.now() - jours*86400000).toISOString().slice(0,10); }

function genreParNom(media, nom){
  const l = genresTMDB[media] || [];
  const g = l.find(x => (x.nom||'').toLowerCase() === nom.toLowerCase());
  return g ? g.id : null;
}

/* Les genres proposés dépendent du type choisi. Pour les animés, « Animation »
   est déjà imposé : inutile de le proposer une deuxième fois. */
function genresAffiches(){
  const l = genresTMDB[discMedia()] || [];
  return ui.disc.type === 'anime' ? l.filter(g => (g.nom||'').toLowerCase() !== 'animation') : l;
}

/* Les plateformes proposées viennent de TMDB pour la France, classées par
   l'ordre d'affichage que JustWatch donne au pays : Netflix et Disney+ avant
   les catalogues confidentiels. La liste diffère entre séries et films.
   Tant que rien n'a été appris sur l'abonnement, on montre tout — mieux vaut
   une plateforme de trop qu'une liste qui s'évapore sous les doigts. */
function platesRetenues(){
  const media = discMedia(), l = platesTMDB[media] || [];
  if(!platesAboFait[media]) return l;                 // rien d'appris : on montre tout
  return l.filter(p => platesAbo[media][p.id]);
}
function platesAffichees(){
  const l = platesRetenues();
  return ui.disc.toutesPlates ? l : l.slice(0, PLATES_VEDETTE);
}
function platesCachees(){
  return Math.max(0, platesRetenues().length - PLATES_VEDETTE);
}

/* Apprend quelles plateformes font de l'abonnement, en regardant les offres
   réelles d'un échantillon de titres populaires. Un échantillon trop pauvre est
   ignoré : mieux vaut proposer trop de plateformes que vider la liste. */
async function sonderPlates(media){
  const cle = media+':'+ui.disc.type;
  if(sondageEnCours || sondagesFaits[cle]) return false;
  sondageEnCours = true;
  try{
    /* Même requête que l'écran, sans le filtre plateformes : l'échantillon
       ressemble à ce que l'utilisateur regarde. */
    const p = discParams();
    delete p.with_watch_providers; delete p.watch_region; delete p.with_watch_monetization_types;
    p.page = '1'; p.sort_by = 'popularity.desc';
    delete p['vote_count.gte']; delete p['vote_average.gte'];
    const d = await tmdb('/discover/'+media, p);
    const ids = (d.results||[]).slice(0, PLATES_ECHANTILLON).map(r=>r.id);
    const vues = Object.assign({}, platesAbo[media]);   // on accumule, jamais on n'oublie
    for(let i=0; i<ids.length; i+=PLATES_PAQUET){
      await Promise.all(ids.slice(i, i+PLATES_PAQUET).map(async id=>{
        try{
          const w = await tmdb('/'+media+'/'+id+'/watch/providers');
          const fr = (w && w.results && w.results[REGION_PLATO]) || {};
          (fr.flatrate||[]).forEach(f=>{ if(f && f.provider_id) vues[f.provider_id] = true; });
        }catch(e){}
      }));
    }
    if(Object.keys(vues).length < PLATES_MINI) return false;
    /* Ce qu'on a coché reste proposé, même si l'échantillon ne l'a pas croisé. */
    ui.disc.plates.forEach(x=> vues[x.id] = true);
    platesAbo[media] = vues;
    platesAboFait[media] = true;
    sondagesFaits[cle] = true;
  } finally { sondageEnCours = false; }
  return true;
}

/* Traduit l'état des filtres en paramètres TMDB.
   Les genres sont retenus par leur nom : « Comédie » suit quand on passe
   des séries aux films, même si TMDB ne lui donne pas le même identifiant. */
function discParams(){
  const d = ui.disc, media = discMedia();
  const p = { include_adult:'false', page:String(d.page) };

  const noms = d.genres.slice();
  if(d.type === 'anime'){
    p.with_original_language = 'ja';
    if(noms.indexOf('Animation') < 0) noms.unshift('Animation');
  }
  const ids = noms.map(n => genreParNom(media, n)).filter(x => x != null);
  if(ids.length) p.with_genres = ids.join(',');

  /* Les envies partent en OU, comme les genres : cocher « braquage » ET
     « enquête » ne doit pas exiger les deux à la fois — presque aucun titre ne
     porterait les deux mots-clés, et on tomberait sur un écran vide. */
  if(d.envies.length) p.with_keywords = d.envies.join('|');

  /* Plateformes : « ou » entre elles (barre verticale), et uniquement ce qui est
     inclus dans un abonnement. TMDB exige la région avec ce filtre. */
  if(d.plates.length){
    p.with_watch_providers = d.plates.map(x => x.id).join('|');
    p.watch_region = REGION_PLATO;
    p.with_watch_monetization_types = 'flatrate';
  }

  if(d.tri === 'note'){ p.sort_by = 'vote_average.desc'; p['vote_count.gte'] = '300'; }
  else p.sort_by = 'popularity.desc';

  /* « Peu importe » ne pose aucune borne de date : c'est tout le catalogue.
     Les décennies portent les leurs, « Sorties récentes » reste une fenêtre
     glissante calculée à partir d'aujourd'hui. */
  const champ = media === 'movie' ? 'primary_release_date' : 'first_air_date';
  if(d.perimetre === 'recent'){
    p[champ+'.gte'] = isoIlYA(DISC_FENETRE);
    p[champ+'.lte'] = todayISO();
  }else{
    const per = DISC_PERIMETRES.find(x=>x.id === d.perimetre);
    if(per && per.de){ p[champ+'.gte'] = per.de; p[champ+'.lte'] = per.a; }
  }

  /* La durée ne part QUE si elle a été mesurée fiable — voir DISC_DUREE_FIABLE.
     La borne basse à 1 est indispensable le jour où on la rallumera : sans
     elle, tout ce dont TMDB ignore la durée passe pour un film court. */
  if(DISC_DUREE_FIABLE && media === 'movie'){
    const du = DISC_DUREES.find(x=>x.id === d.duree);
    if(du && du.max != null){ p['with_runtime.lte'] = String(du.max); p['with_runtime.gte'] = '1'; }
    if(du && du.min != null) p['with_runtime.gte'] = String(du.min);
  }
  if(d.noteMin){
    p['vote_average.gte'] = String(d.noteMin);
    if(!p['vote_count.gte']) p['vote_count.gte'] = '100';        // évite les 10/10 à trois votes
  }
  return p;
}

async function chargerGenres(media){
  if(genresTMDB[media]) return genresTMDB[media];
  const d = await tmdb('/genre/'+media+'/list');
  genresTMDB[media] = (d.genres||[]).map(g=>({ id:g.id, nom:g.name }));
  return genresTMDB[media];
}

/* Liste des plateformes disponibles en France. Un échec n'est pas bloquant :
   la section reste simplement vide dans les filtres. */
async function chargerPlates(media){
  if(platesTMDB[media]) return platesTMDB[media];
  try{
    const d = await tmdb('/watch/providers/'+media, { watch_region: REGION_PLATO });
    platesTMDB[media] = (d.results||[])
      .filter(p => p && p.provider_id && p.provider_name)
      /* TMDB compte les formules avec publicité comme des plateformes à part
         (« Netflix Standard with Ads »). C'est le même service, la même
         bibliothèque : on ne garde que l'entrée principale. */
      .filter(p => !PLATES_PUB.test(p.provider_name))
      .map(p=>{
        /* TMDB donne un ordre d'affichage par pays, et un ordre général en secours. */
        let rang = 9999;
        if(p.display_priorities && p.display_priorities[REGION_PLATO] != null) rang = p.display_priorities[REGION_PLATO];
        else if(p.display_priority != null) rang = p.display_priority;
        return { id:p.provider_id, nom:String(p.provider_name), logo:p.logo_path||null, rang:rang };
      })
      .sort((a,b)=> (a.rang - b.rang) || a.nom.localeCompare(b.nom));
  }catch(e){ platesTMDB[media] = []; }
  return platesTMDB[media];
}

async function chargerDecouverte(suite){
  const d = ui.disc;
  const seq = ++discSeq;
  d.page = suite ? d.page + 1 : 1;
  /* Une nouvelle liste (type ou filtre changé) repart du haut ;
     « Voir plus » ne bouge évidemment pas la page. */
  if(!suite){
    d.res = []; d.pages = 1;
    oublierDefil('discover');
    if(view === 'discover' && !enRecherche()) window.scrollTo(0,0);
  }
  d.loading = true; d.err = '';
  peindreDisc();
  try{
    const media = discMedia();
    await chargerGenres(media);
    /* La liste des plateformes n'est pas bloquante : elle vient en arrière-plan
       et la feuille de filtres se remet à jour toute seule si elle est ouverte. */
    chargerPlates(media)
      .then(()=>{ if(feuilleFiltresOuverte()) ouvrirFiltres(); return sonderPlates(media); })
      .then(change=>{ if(change && feuilleFiltresOuverte()) ouvrirFiltres(); });
    /* Un genre qui n'existe pas pour ce type est retiré, mais on le dit. */
    const perdus = d.genres.filter(n => genreParNom(media, n) == null);
    if(perdus.length){
      d.genres = d.genres.filter(n => genreParNom(media, n) != null);
      toast(perdus.length > 1
        ? 'Genres sans équivalent ici : '+perdus.join(', ')
        : '« '+perdus[0]+' » n\'existe pas pour ce type');
    }
    /* On enchaîne les pages TMDB jusqu'à la cible — la même mécanique comble
       au passage les trous creusés par le filtre des titres non occidentaux.
       Un catalogue épuisé (pageLue >= pagesTotal) est une réponse complète. */
    let trouves = [], pagesTotal = 1, pageLue = d.page;
    for(let tour = 0; tour < DISC_PAGES_MAX; tour++){
      const p = discParams();
      p.page = String(pageLue);
      const data = await tmdb('/discover/'+media, p);
      if(seq !== discSeq) return;
      pagesTotal = data.total_pages || 1;
      const bruts = (data.results||[]).filter(r => r.poster_path);
      trouves = trouves.concat(garderOccident(bruts));
      if(trouves.length >= DISC_CIBLE || pageLue >= pagesTotal) break;
      pageLue++;
    }
    d.page = pageLue;
    /* Le classement TMDB bouge entre deux requêtes : un même film peut figurer
       sur deux pages voisines. Sans ce tri, il apparaîtrait deux fois. */
    const vus = {};
    (suite ? d.res : []).forEach(r => { vus[r.id] = 1; });
    trouves = trouves.filter(r => vus[r.id] ? false : (vus[r.id] = 1));
    d.res = suite ? d.res.concat(trouves) : trouves;
    d.pages = pagesTotal;
    d.loading = false; d.err = ''; d.charge = true;
    peindreDisc();
  }catch(e){
    if(seq !== discSeq) return;
    if(suite) d.page = Math.max(1, d.page - 1);
    d.loading = false; d.charge = true;
    d.err = (e.message === 'BADKEY') ? 'Service indisponible' : 'Pas de connexion';
    peindreDisc();
  }
}

/* Ne repeint que la zone des résultats : les puces gardent leur défilement.
   La ligne de résumé et le bouton Filtres sont remis à jour au passage,
   pour que l'état des filtres reste visible sous les puces de type. */
function peindreDisc(){
  if(view !== 'discover') return;
  const el = document.getElementById('dres');
  if(!el) return render();
  const cherche = enRecherche();
  const vitr = vitrineVisible();
  el.innerHTML = cherche ? searchBody() : (vitr ? vitrineBody() : discBody());
  const r = document.querySelector('.resume');
  if(r){
    r.classList.toggle('masque', vitr);
    const b = r.querySelector('b');
    if(b) b.textContent = cherche ? resumeRecherche() : resumeFiltres();
    const x = r.querySelector('.rx');
    if(x) x.classList.toggle('masque', cherche);
  }
  const b = document.getElementById('fbtn');
  if(b){ b.classList.toggle('actif', filtresActifs()); b.classList.toggle('masque', cherche); }
  const c = document.querySelector('.qclear');
  if(c) c.classList.toggle('masque', !ui.searchQ);
}

function setDiscType(t){
  if(ui.disc.type === t) return;
  ui.disc.type = t;
  if(enRecherche()){                      // la recherche suit la puce choisie
    clearTimeout(searchTimer); abortSearch();
    ui.searchRes = null; ui.searchErr = ''; ui.searching = true;
  }
  render();
  /* Chacun son chargement : la vitrine au repos, la grille quand on filtre. */
  if(vitrineVisible()) chargerSuggestions();
  else chargerDecouverte();
  if(enRecherche()) searchNow();
}
/* Les filtres portent sur un type précis — c'est ce qu'Adrien attend : « avec
   les filtres on a soit l'un soit l'autre ». Depuis « Tout », on bascule donc
   sur les séries, et on le dit plutôt que de filtrer un mélange en silence. */
function typePourFiltrer(){
  if(ui.disc.type !== 'tout') return;
  ui.disc.type = 'tv';
  toast('Les filtres s\'appliquent aux séries — la puce Films passe côté cinéma');
}
function setDiscTri(t){ typePourFiltrer(); ui.disc.tri = t; ouvrirFiltres(); chargerDecouverte(); }
function setDiscPerimetre(p){ typePourFiltrer(); ui.disc.perimetre = p; ouvrirFiltres(); chargerDecouverte(); }
function setDiscNote(n){ typePourFiltrer(); ui.disc.noteMin = n; ouvrirFiltres(); chargerDecouverte(); }
function setDiscDuree(id){ typePourFiltrer(); ui.disc.duree = id; ouvrirFiltres(); chargerDecouverte(); }
function bascGenre(i){
  const g = genresAffiches()[i];
  if(!g) return;
  typePourFiltrer();
  const sel = ui.disc.genres, k = sel.indexOf(g.nom);
  if(k < 0) sel.push(g.nom); else sel.splice(k,1);
  ouvrirFiltres(); chargerDecouverte();
}
/* Les plateformes sont retenues avec leur nom et leur logo : la ligne de résumé
   et les puces restent lisibles même si la liste TMDB n'est pas encore revenue. */
/* Cocher ou décocher une envie. Comme pour les genres, on passe par l'index
   dans la liste affichée : l'identifiant traverserait un `onclick` sans mal,
   mais l'index évite d'avoir à l'échapper et reste lisible dans le HTML. */
function bascEnvie(i){
  /* On résout l'envie AVANT `typePourFiltrer` : celui-ci fait basculer la puce
     « Tout » vers « Séries », et la liste des envies n'est pas la même d'une
     puce à l'autre — l'index désignerait alors une autre envie que celle
     touchée. Même ordre que `bascGenre`, pour la même raison. */
  const e = enviesAffichees()[i];
  if(!e) return;
  typePourFiltrer();
  const sel = ui.disc.envies, k = sel.indexOf(e.id);
  if(k >= 0) sel.splice(k,1); else sel.push(e.id);
  ouvrirFiltres(); chargerDecouverte();
}
function viderEnvies(){
  typePourFiltrer();
  ui.disc.envies = [];
  ouvrirFiltres(); chargerDecouverte();
}

function bascPlate(i){
  const p = platesAffichees()[i];
  if(!p) return;
  const sel = ui.disc.plates, k = sel.findIndex(x => x.id === p.id);
  if(k < 0) sel.push({ id:p.id, nom:p.nom, logo:p.logo }); else sel.splice(k,1);
  ouvrirFiltres(); chargerDecouverte();
}
function voirToutesPlates(){
  ui.disc.toutesPlates = !ui.disc.toutesPlates;
  ouvrirFiltres();
}
function viderPlates(){
  ui.disc.plates = [];
  ouvrirFiltres(); chargerDecouverte();
}
function resetFiltres(){
  const d = ui.disc;
  d.genres = []; d.plates = []; d.envies = [];
  d.perimetre = 'tout'; d.tri = 'populaire'; d.noteMin = 0; d.duree = 'tout';
  /* On ne redessine la feuille QUE si elle est ouverte. Cette fonction est
     aussi celle de la croix de la ligne de résumé, feuille fermée — et là,
     effacer ses filtres faisait surgir le panneau sans qu'on ait rien demandé. */
  if(feuilleFiltresOuverte()) ouvrirFiltres();
  chargerDecouverte();
}

function resumeFiltres(){
  const d = ui.disc;
  const bouts = [ (DISC_PERIMETRES.find(p=>p.id===d.perimetre)||{}).court,
                  (DISC_TRIS.find(t=>t.id===d.tri)||{}).court ];
  if(d.noteMin) bouts.push('note '+d.noteMin+' et +');
  if(DISC_DUREE_FIABLE && discMedia() === 'movie'){
    const du = DISC_DUREES.find(x=>x.id === d.duree);
    if(du && du.court) bouts.push(du.court);
  }
  /* Les envies avant les genres : c'est le réglage le plus parlant de la
     ligne, « braquage » dit bien plus que « thriller ». */
  d.envies.forEach(id=>{ const e = envieParId(id); if(e) bouts.push(e.label.toLowerCase()); });
  d.genres.forEach(n=> bouts.push(n.toLowerCase()));
  /* Au-delà de deux plateformes on compte au lieu d'énumérer : la ligne tient. */
  if(d.plates.length) bouts.push('sur '+(d.plates.length > 2
    ? d.plates.length+' plateformes'
    : d.plates.map(p=>p.nom).join(' ou ')));
  return bouts.filter(Boolean).join(' · ');
}
function filtresActifs(){
  const d = ui.disc;
  return d.genres.length > 0 || d.plates.length > 0 || d.envies.length > 0 ||
         d.noteMin > 0 || d.perimetre !== 'tout' || d.tri !== 'populaire' ||
         (DISC_DUREE_FIABLE && d.duree && d.duree !== 'tout' && discMedia() === 'movie');
}

/* La feuille de filtres est-elle à l'écran ? Sert à la redessiner quand la liste
   des plateformes arrive après coup, sans inventer un état de plus. */
/* La feuille de filtres est-elle à l'écran ? Sert à la redessiner quand la
   liste des plateformes arrive après coup. On teste un marqueur posé en tête de
   la feuille, PAS la section des plateformes : depuis qu'elle se replie, elle
   peut très bien être absente du DOM alors que la feuille est ouverte. */
function feuilleFiltresOuverte(){
  const s = document.getElementById('sheet');
  return !!(s && s.classList.contains('show') && document.getElementById('feuilfiltres'));
}

/* Section « De quoi t'as envie » de la feuille de filtres. Elle vient en tête :
   c'est la question qu'on se pose vraiment devant l'écran, avant la note ou la
   plateforme. */
function blocFiltreEnvies(){
  const d = ui.disc, liste = enviesAffichees();
  if(!liste.length) return '';
  let h = '<div class="fgrp">De quoi t\'as envie'+(d.envies.length?' ('+d.envies.length+')':'')+'</div>';
  h += '<div class="fchips">'+liste.map((e,i)=>
    '<button class="chip '+(d.envies.indexOf(e.id)>=0?'on':'')+'" onclick="bascEnvie('+i+')">'+
      esc(e.label)+'</button>').join('')+'</div>';
  if(d.envies.length)
    h += '<div class="small muted" style="margin-top:8px">'+
         'Il suffit qu\'un titre corresponde à <b>une</b> de ces envies. '+
         '<button class="lienplus" style="margin:0" onclick="viderEnvies()">Tout décocher</button></div>';
  return h;
}

/* Section « Plateformes » de la feuille de filtres. */
function blocFiltrePlates(){
  const d = ui.disc;
  const liste = platesAffichees(), reste = platesCachees();
  let h = '<div class="small muted" id="fplates" style="margin-bottom:8px">'+
          'Uniquement ce qui est inclus dans un abonnement, en France.</div>';
  if(!liste.length)
    return h + '<div class="small muted">La liste des plateformes arrive avec les premiers résultats.</div>';
  /* La feuille peut s'ouvrir avant la fin du sondage : on le termine et on redessine. */
  if(!sondageEnCours) sonderPlates(discMedia()).then(ch=>{ if(ch && feuilleFiltresOuverte()) ouvrirFiltres(); });
  h += '<div class="fchips">'+liste.map((p,i)=>{
    const on = d.plates.some(x => x.id === p.id);
    const logo = p.logo ? '<img loading="lazy" src="'+IMG(p.logo,'w45')+'" alt="">' : '';
    return '<button class="chip chiplogo '+(on?'on':'')+'" onclick="bascPlate('+i+')">'+
             logo+'<span>'+esc(p.nom)+'</span></button>';
  }).join('')+'</div>';
  if(reste || d.toutesPlates)
    h += '<button class="lienplus" onclick="voirToutesPlates()">'+
         (d.toutesPlates ? 'Ne montrer que les principales'
                         : (reste > 1 ? 'Voir les '+reste+' autres plateformes'
                                      : 'Voir la dernière plateforme'))+
         '</button>';
  if(d.plates.length)
    h += '<div class="small muted" style="margin-top:8px">'+
         'Il suffit qu\'un titre soit sur <b>une</b> de ces plateformes. '+
         '<button class="lienplus" style="margin:0" onclick="viderPlates()">Tout décocher</button></div>';
  return h;
}

/* Une rubrique de la feuille. Repliée, elle tient sur une ligne et annonce ce
   qu'elle contient — c'est ce qui permet d'ajouter des critères sans que
   l'écran devienne un formulaire à faire défiler. */
/* Les rubriques ouvertes d'emblée. Le défaut vit ICI et nulle part ailleurs :
   quand `blocPliable` et la bascule le déduisaient chacun de leur côté, un
   premier appui sur une rubrique repliée la laissait repliée. */
const FILTRES_OUVERTS = { genres:true, envies:true };
function sectionPliee(cle){
  const v = ui.disc.plies[cle];
  return v === undefined ? !FILTRES_OUVERTS[cle] : v;
}
function blocPliable(cle, titre, resume, contenu){
  const plie = sectionPliee(cle);
  return '<button class="fpli'+(plie?'':' ouvert')+'" onclick="bascSectionFiltre(\''+cle+'\')">'+
      '<span class="fplititre">'+esc(titre)+'</span>'+
      (resume ? '<span class="fpliresume">'+esc(resume)+'</span>' : '')+
      '<span class="fplicaret">'+I.caret+'</span>'+
    '</button>' +
    (plie ? '' : '<div class="fplicorps">'+contenu+'</div>');
}
function bascSectionFiltre(cle){
  ui.disc.plies[cle] = !sectionPliee(cle);
  ouvrirFiltres();
}

/* La feuille de filtres.

   Deux décisions d'Adrien la façonnent. Les GENRES ont disparu : « les envies
   remplacent les genres » — deux vocabulaires pour la même chose, c'est le
   reproche qu'il avait déjà fait à l'ancien menu. Et « surtout pas » n'est pas
   ici mais dans Mes goûts : écarter l'horreur est une préférence durable, pas
   une humeur du soir ; une seule porte, pas deux. */
function ouvrirFiltres(){
  const d = ui.disc;
  const quoi = (DISC_TYPES.find(t=>t.id===d.type)||{}).label || '';
  const puces = (liste, actif, action) => '<div class="fchips">'+liste.map(x=>
    '<button class="chip '+(actif(x)?'on':'')+'" onclick="'+action(x)+'">'+
      esc(x.label)+'</button>').join('')+'</div>';

  let h = '<h3 id="feuilfiltres">Filtres</h3><div class="small muted" style="margin-top:-4px">'+
    'Ces réglages s\'appliquent à <b>'+esc(quoi.toLowerCase())+'</b>.</div>';

  /* 1. Le large. Adrien : « soit une recherche micro soit une recherche
        macro ». Le genre est l'axe large — c'est lui qui répond à « montre-moi
        de la comédie » quand on n'a rien de plus précis en tête. */
  const genres = genresAffiches();
  h += blocPliable('genres', 'En gros',
    d.genres.length ? d.genres.join(', ').toLowerCase() : '',
    '<div class="small muted" style="margin:-2px 0 9px">Le rayon : comédie, '+
      'thriller, science-fiction…</div>'+
    (genres.length
      ? '<div class="fchips">'+genres.map((g,i)=>
          '<button class="chip '+(d.genres.indexOf(g.nom)>=0?'on':'')+'" onclick="bascGenre('+i+')">'+
            esc(g.nom)+'</button>').join('')+'</div>'
      : '<div class="small muted">Les genres arrivent avec les premiers résultats.</div>'));

  /* 2. Le précis. Il vient APRÈS le large, dans l'ordre où l'on pense :
        « une comédie » d'abord, « de braquage » ensuite. */
  const envies = enviesAffichees();
  if(envies.length)
    h += blocPliable('envies', 'Plus précisément',
      d.envies.length ? d.envies.length+' envie'+(d.envies.length>1?'s':'') : '',
      '<div class="small muted" style="margin:-2px 0 9px">Le sujet : un braquage, '+
        'une enquête, une boucle temporelle…</div>'+
      '<div class="fchips">'+envies.map((e,i)=>
        '<button class="chip '+(d.envies.indexOf(e.id)>=0?'on':'')+'" onclick="bascEnvie('+i+')">'+
          esc(e.label)+'</button>').join('')+'</div>'+
      (d.envies.length
        ? '<div class="small muted" style="margin-top:8px">Il suffit qu\'un titre corresponde à '+
          '<b>une</b> de ces envies. <button class="lienplus" style="margin:0" '+
          'onclick="viderEnvies()">Tout décocher</button></div>'
        : ''));

  /* Le trait d'union entre les deux niveaux : croiser un genre et une envie
     donne l'intersection — vérifié en direct, « comédie » seul rend 173 456
     titres, « comédie » + « enquête policière » en rend 379. C'est ce que la
     phrase doit dire, sinon on croirait à une addition. */
  if(d.genres.length && d.envies.length)
    h += '<div class="small muted" style="margin:2px 0 4px">'+
      'Tu cherches <b>'+esc(d.genres.join(' ou ').toLowerCase())+'</b> qui parle de <b>'+
      esc(d.envies.map(id=>(envieParId(id)||{}).label).filter(Boolean).join(' ou ').toLowerCase())+
      '</b>.</div>';

  /* 3. Le reste, replié : utile, mais pas à chaque fois. */
  const per = DISC_PERIMETRES.find(x=>x.id===d.perimetre) || DISC_PERIMETRES[0];
  h += blocPliable('quand', 'De quelle époque', per.court,
    puces(DISC_PERIMETRES, x=>d.perimetre===x.id, x=>'setDiscPerimetre(\''+x.id+'\')')+
    '<div class="small muted" style="margin-top:8px">'+
      (d.perimetre==='tout' ? 'Tout le catalogue, sans limite de date.'
       : d.perimetre==='recent' ? 'Uniquement ce qui est sorti depuis '+DISC_FENETRE+' jours.'
       : 'Uniquement les titres de cette période.')+'</div>');

  h += blocPliable('plates', 'Sur mes plateformes',
    d.plates.length ? (d.plates.length>2 ? d.plates.length+' plateformes'
                                         : d.plates.map(p=>p.nom).join(' ou ')) : '',
    blocFiltrePlates());

  h += blocPliable('ordre', 'Dans quel ordre',
    (DISC_TRIS.find(t=>t.id===d.tri)||{}).court || '',
    puces(DISC_TRIS, x=>d.tri===x.id, x=>'setDiscTri(\''+x.id+'\')'));

  h += blocPliable('note', 'Note minimale', d.noteMin ? d.noteMin+' et +' : '',
    '<div class="fchips">'+DISC_NOTES.map(n=>
      '<button class="chip '+(d.noteMin===n.v?'on':'')+'" onclick="setDiscNote('+n.v+')">'+
        esc(n.label)+'</button>').join('')+'</div>');

  /* Les genres écartés vivent dans Mes goûts, et l'écran doit le dire :
     sans ça, on chercherait « surtout pas » ici jusqu'à la fin des temps. */
  const exclus = (db.gouts && db.gouts.exclus) || [];
  h += '<div class="small muted" style="margin-top:16px">'+
    (exclus.length
      ? 'Tu ne vois jamais : <b>'+esc(exclus.join(', '))+'</b>. '
      : 'Pour écarter un genre une fois pour toutes, ')+
    '<button class="lienplus" style="margin:0" onclick="closeSheet();go(\'gouts\',{from:\'discover\'})">'+
      (exclus.length ? 'Changer dans Mes goûts' : 'passe par Mes goûts')+'</button></div>';

  h += '<button class="btn" style="margin-top:18px" onclick="closeSheet()">Voir les résultats</button>';
  if(filtresActifs()) h += '<button class="opt" onclick="resetFiltres()">Tout effacer</button>';
  openSheet(h);
}

function ouvrirChamp(){
  if(ui.champOuvert) return fermerChamp();
  ui.champOuvert = true; ui.focusSearch = true; render();
}
function fermerChamp(){
  ui.champOuvert = false;
  viderRecherche();                 // referme et rend la main aux suggestions
}

function champRecherche(){
  const t = ui.disc.type;
  const quoi = t==='anime' ? "Chercher un animé…"
             : discMedia()==='tv' ? "Chercher une série…" : "Chercher un film…";
  return '<div class="qbar">'+I.search+
    '<input type="search" id="q" enterkeyhint="search" autocomplete="off" autocorrect="off" '+
    'placeholder="'+quoi+'" value="'+esc(ui.searchQ)+'" oninput="onSearchInput(this.value)" '+
    'onkeydown="if(event.key===\'Enter\'){this.blur();searchNow()}">'+
    '<button class="qclear '+(ui.searchQ?'':'masque')+'" onclick="viderRecherche()">'+I.close+'</button>'+
  '</div>';
}

/* ---------------------------------------------------------------------------
   Découvrir a deux états, et un seul tap les sépare.

   AU REPOS — la vitrine : un titre mis en avant en grand, puis des rangées
   thématiques que l'on fait défiler du pouce. La loupe et le bouton Filtres
   restent en haut, toujours visibles : c'est le reproche d'Adrien sur la
   première maquette, on ne perd jamais la notion de filtre.

   FILTRÉ OU EN RECHERCHE — la grille : dès qu'un filtre mord, la vitrine
   s'efface au profit des résultats, avec le résumé de ce qui est appliqué et
   une croix pour tout effacer. Toute la puissance d'avant, intacte.
--------------------------------------------------------------------------- */
/* Chaque puce a désormais sa vitrine : Tout mêle séries, films et animés, les
   trois autres cadrent. La grille filtrée n'apparaît que si un filtre mord. */
function vitrineVisible(){
  return !enRecherche() && !filtresActifs();
}

/* Une diapositive du carrousel : grande image, la raison de sa présence,
   le titre, et les deux actions. Cinq d'affilée, que l'on balaie du pouce. */
function diapoVedette(x){
  const bouts = [year(x.date), x.note ? '\u2605 '+(Math.round(x.note*10)/10) : ''].filter(Boolean);
  const img = IMG(x.bandeau,'w780') || IMG(x.affiche,'w342');
  const item = x.media === 'tv' ? db.shows[x.id] : db.movies[x.id];
  return '<div class="diapo">'+
    (img ? '<img class="dhimg" loading="lazy" src="'+img+'" alt="">' : '<div class="dhimg"></div>')+
    '<div class="dhsur">'+
      '<div class="dhetiq">'+esc(x.pourquoi || 'À découvrir')+'</div>'+
      '<h2>'+esc(x.nom)+'</h2>'+
      '<div class="dhmeta">'+esc((x.media==='tv'?'Série':'Film')+(bouts.length?' · '+bouts.join(' · '):''))+'</div>'+
      '<div class="dhact">'+
        '<button class="btn" onclick="openPreview('+x.id+',\''+x.media+'\',\'discover\')">Voir la fiche</button>'+
        (item ? '<span class="dhdeja">'+I.check+' Dans ma liste</span>'
              : '<button class="btn ghost" onclick="ajouterDepuisVitrine('+x.id+',\''+x.media+'\')">'+
                  I.plus+' Ma liste</button>')+
      '</div>'+
    '</div></div>';
}

/* Le carrousel : un rail que l'on fait glisser, avec ses points repères.
   Aucun défilement automatique — rien ne bouge sous le doigt sans qu'on l'ait
   demandé. */
function carrouselVedettes(l){
  if(!l.length) return '';
  return '<div class="carr" id="carr" onscroll="majPointsCarr()">'+
    l.map(diapoVedette).join('')+'</div>'+
    (l.length > 1 ? '<div class="carrpts" id="carrpts">'+
      l.map((x,i)=>'<i class="'+(i===0?'on':'')+'"></i>').join('')+'</div>' : '');
}

/* Les points suivent le doigt : on lit la position du rail plutôt que de tenir
   un compteur qui se désynchroniserait au moindre geste interrompu. */
function majPointsCarr(){
  const r = document.getElementById('carr'), p = document.getElementById('carrpts');
  if(!r || !p) return;
  const i = Math.round(r.scrollLeft / Math.max(1, r.clientWidth));
  [...p.children].forEach((pt, k)=> pt.classList.toggle('on', k === i));
}

function ajouterDepuisVitrine(id, media){
  if(media === 'tv') return addOrOpenShow(id);
  return addMovie(id, false);
}

/* Une vignette de rangée, à partir d'un titre normalisé par le moteur de
   goûts — films et séries mêlés, donc le média voyage avec chaque titre. */
/* `depuis` dit à quel écran la fiche devra revenir. Sans lui, ouvrir un titre
   depuis une rangée dépliée puis revenir en arrière retombait sur Découvrir :
   on perdait la grille qu'on était en train de parcourir. Ce paramètre se passe
   toujours explicitement — `l.map(vignetteSugg)` lui glisserait l'index. */
function vignetteSugg(x, depuis){
  const item = x.media === 'tv' ? db.shows[x.id] : db.movies[x.id];
  return '<button class="vgn" onclick="openPreview('+x.id+',\''+x.media+'\',\''+(depuis||'discover')+'\')">'+
    '<div class="vgimg">'+posterEl(x.affiche,'w342','',x.nom)+
      (item ? '<span class="vgdeja">'+I.check+'</span>' : '')+'</div>'+
    '<div class="vgnom">'+esc(x.nom)+'</div>'+
    '<div class="vgnote">'+(x.note ? I.star+' '+(Math.round(x.note*10)/10)+' ' : '')+
      '<span class="vgmed">'+(x.media==='tv'?'Série':'Film')+'</span></div>'+
  '</button>';
}

function vitrineBody(){
  const e = suggCourantes().etat;
  if(e === 'froid' || e === 'attente')
    return '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">On prépare tes suggestions…</p></div>';
  if(e === 'erreur')
    return '<div class="empty">'+I.boussole+'<h3>Pas de connexion</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerSuggestions(true)">Réessayer</button></div>';

  const rangees = rangeesSuggerees();
  if(!suggestions.vedettes.length && !rangees.length)
    return '<div class="empty">'+I.boussole+'<h3>Rien à proposer '+esc(dansCettePuce())+'</h3>'+
      '<p>Ajoute une série ou un film : les suggestions se règlent sur ce que tu regardes.</p>'+
      '<button class="btn ghost" onclick="ouvrirChamp()">Chercher un titre</button></div>';

  let html = carrouselVedettes(suggestions.vedettes);
  rangees.forEach(r=>{
    html += '<div class="sectitle">'+esc(r.titre)+'</div>'+
      '<div class="rangee">'+
        r.l.slice(0, RANGEE_APERCU).map(x=>vignetteSugg(x,'discover')).join('')+
        finRangee(r)+'</div>';
  });
  return html + '<div style="height:6px"></div>';
}

/* Le rail est un APERÇU, pas la liste. Dix titres : de quoi balayer du pouce
   sans que ça devienne un couloir sans fin, et de quoi laisser à « Tout voir »
   quelque chose à montrer. */
const RANGEE_APERCU = 10;
/* Ce que la grille dépliée vise avant de rendre la main, et ce qu'ajoute
   chaque « Voir plus ». Une page TMDB rend vingt titres : trois pages environ,
   moins ce que le tamis retire. */
const RANGEE_LOT = 50;
/* Au-delà, on arrête d'insister : une page entièrement filtrée n'est pas une
   panne, mais dix d'affilée veulent dire que la source est épuisée. */
const RANGEE_PAGES_MAX = 8;

/* La dernière tuile de la rangée : « Tout voir ». Elle est au BOUT du rail,
   pas en haut à droite — choix d'Adrien. C'est le geste naturel : on pousse les
   affiches jusqu'à ce qu'il n'y en ait plus, et on tombe dessus sans lever le
   pouce ni remonter chercher un bouton. */
function finRangee(r){
  if(!r.cle || !r.l.length) return '';
  /* Pas de classe `vgn` : ce n'est pas une vignette de titre, et tout ce qui
     parcourt `.rangee .vgn` (les tests de mise en page, notamment) y chercherait
     un nom et une note qu'elle n'a pas. */
  return '<button class="vgtout" onclick="ouvrirRangee(\''+escJs(r.cle)+'\')">'+
    '<div class="vgimg vgtoutbox">'+
      '<span class="vgtrond">'+I.caret+'</span>'+
      '<b>Tout voir</b>'+
      '<i>et bien plus</i>'+
    '</div></button>';
}

/* ---------------------------------------------------------------------------
   Une rangée dépliée en grille

   La rangée montre dix titres ; ici on va chercher la suite auprès de TMDB,
   page après page, avec exactement la requête qui a bâti la rangée. Le premier
   lot part tout seul à l'ouverture, les suivants sur « Voir plus ».

   Les titres déjà connus servent d'amorce : la grille s'affiche pleine dès la
   première image, et le chargement se voit en bas plutôt qu'à la place de tout.
--------------------------------------------------------------------------- */
let rangeeVue = { cle:null, titre:'', l:[], vus:{}, page:0, pages:1,
                  loading:false, err:'', fini:false, seq:0 };

function ouvrirRangee(cle){
  amorcerRangee(cle);
  /* Ouvrir la rangée est un nouveau départ : la liste vient d'être remise à
     zéro, la position mémorisée lors d'une visite précédente désignerait le
     milieu d'une grille qui n'existe plus. Revenir d'une fiche, en revanche,
     garde sa position — c'est `go` qui la restaure, pas nous. */
  delete memDefil[cleDefil('rangee', { cle:cle })];
  go('rangee', { cle:cle, from:'discover' }, 'enter');
  chargerRangee();
}

/* Repart de la rangée telle qu'elle est dans la vitrine. Appelée aussi au
   retour d'une fiche si l'état a été perdu entre-temps. */
function amorcerRangee(cle){
  const r = rangeeParCle(cle);
  rangeeVue = { cle:cle, titre: r ? r.titre : 'Suggestions',
                l: r ? r.l.slice() : [], vus:{}, page:0, pages:99,
                loading:false, err:'', fini:!r, seq: rangeeVue.seq + 1 };
  rangeeVue.l.forEach(x=>{ rangeeVue.vus[x.media+':'+x.id] = 1; });
}

/* Un lot : on enchaîne les pages jusqu'à RANGEE_LOT titres neufs, ou jusqu'à
   épuisement de la source. Une page peut ne rien rapporter du tout — tout son
   contenu est déjà chez toi — sans que ce soit la fin pour autant. */
async function chargerRangee(){
  const st = rangeeVue;
  if(st.loading || st.fini || !st.cle) return;
  const seq = st.seq;
  st.loading = true; st.err = '';
  if(view === 'rangee') render();
  const vise = st.l.length + RANGEE_LOT;
  try{
    for(let tour = 0; tour < RANGEE_PAGES_MAX; tour++){
      const d = await chargerPageRangee(st.cle, st.page + 1, st.vus);
      if(seq !== rangeeVue.seq) return;              // on a changé de rangée entre-temps
      st.page++;
      st.pages = d.pages || 1;
      st.l = st.l.concat(d.titres);
      if(st.page >= st.pages){ st.fini = true; break; }
      if(st.l.length >= vise) break;
    }
  }catch(e){
    if(seq !== rangeeVue.seq) return;
    st.err = 'Pas de connexion';
  }
  st.loading = false;
  if(view === 'rangee') render();
}

function viewRangee(){
  /* Le retour d'une fiche repasse par ici : si l'état ne correspond plus à
     l'écran demandé, on le reconstruit avant de dessiner. */
  if(rangeeVue.cle !== params.cle) amorcerRangee(params.cle);
  const st = rangeeVue;

  if(!st.l.length && !st.loading)
    return header('Suggestions', { back:'goBack()' }) +
      '<div class="empty">'+I.boussole+'<h3>Cette liste a été recalculée</h3>'+
      '<p>Les suggestions se rafraîchissent toutes les 24 heures. Reviens à Découvrir '+
      'pour voir la nouvelle sélection.</p>'+
      '<button class="btn ghost" onclick="go(\'discover\')">Retour à Découvrir</button></div>';

  let bas = '';
  if(st.err)
    bas = '<div class="plus"><div class="small muted" style="margin-bottom:8px">'+esc(st.err)+'</div>'+
          '<button class="btn ghost" onclick="chargerRangee()">Réessayer</button></div>';
  else if(st.loading)
    bas = '<div class="plus"><button class="btn ghost" disabled>'+
          '<span class="spin"></span> Chargement…</button></div>';
  else if(!st.fini)
    bas = '<div class="plus"><button class="btn ghost" onclick="chargerRangee()">Voir plus</button></div>';

  return header(st.titre, { back:'goBack()' }) +
    '<div class="vgrid">'+st.l.map(x=>vignetteSugg(x,'rangee')).join('')+'</div>'+
    bas + '<div style="height:20px"></div>';
}

/* Le nom de ce qu'on regarde, pour les messages : « dans les animés ». */
function dansCettePuce(){
  const t = ui.disc.type;
  if(t === 'tv')    return 'dans les séries';
  if(t === 'movie') return 'dans les films';
  if(t === 'anime') return 'dans les animés';
  return 'pour l\'instant';
}

function viewDiscover(){
  const d = ui.disc, cherche = enRecherche(), vitr = vitrineVisible();
  /* La loupe vit dans la rangée des puces. On appuie : le champ se déplie
     sur toute la largeur et les puces descendent d'un cran. */
  const sub = (ui.champOuvert ? champRecherche() : '') +
    '<div class="chips types">'+
      '<button class="chip chipico '+(ui.champOuvert?'ouvert':'')+'" onclick="ouvrirChamp()" '+
        'aria-label="'+(ui.champOuvert?'Fermer la recherche':'Chercher un titre')+'">'+
        (ui.champOuvert ? I.close : I.search)+'</button>'+
      DISC_TYPES.map(t=>
        '<button class="chip '+(d.type===t.id?'on':'')+'" onclick="setDiscType(\''+t.id+'\')">'+
          t.label+'</button>').join('')+'</div>'+
    /* Le résumé n'a de sens que lorsqu'on filtre ou qu'on cherche : au repos,
       il répétait « Toutes » sans rien dire. On le MASQUE au lieu de le retirer
       — le sortir du DOM en pleine frappe emporterait le focus du champ. */
    '<div class="resume'+(vitr?' masque':'')+'">'+
      '<b>'+esc(cherche ? resumeRecherche() : resumeFiltres())+'</b>'+
      '<button class="rx'+(cherche?' masque':'')+'" onclick="resetFiltres()" '+
        'aria-label="Tout effacer">'+I.close+'</button></div>';
  /* Les filtres ne s'appliquent pas à une recherche par titre : le bouton s'efface. */
  const bouton = '<button class="iconbtn '+(filtresActifs()?'actif ':'')+(cherche?'masque':'')+
    '" id="fbtn" onclick="ouvrirFiltres()">'+I.filtre+'</button>';
  return header('Découvrir', {right:bouton, sub:sub}) + needKeyBanner() +
    '<div id="dres">'+(cherche ? searchBody() : (vitr ? vitrineBody() : discBody()))+'</div>' +
    '<div style="height:20px"></div>';
}

/* Depuis l'ajout de « Tout », les six puces ne tiennent plus dans la largeur
   d'un iPhone : la rangée défile. On ramène donc la puce active dans le champ
   de vision après chaque rendu — sinon, en choisissant « Animés » on ne voyait
   plus quel type était sélectionné. */
function centrerTypeActif(){
  const r = document.querySelector('.chips.types');
  if(!r || r.scrollWidth <= r.clientWidth) return;
  const on = r.querySelector('.chip.on');
  if(!on) return;
  const cible = on.offsetLeft - (r.clientWidth - on.offsetWidth) / 2;
  r.scrollTo({ left: Math.max(0, cible), behavior:'auto' });
}

function libelleCherche(){
  const t = ui.disc.type;
  if(t === 'tout')  return 'les séries et les films';
  if(t === 'anime') return 'les animés';
  return discMedia()==='tv' ? 'les séries' : 'les films';
}
function resumeRecherche(){
  return 'Recherche dans '+libelleCherche()+' · « '+(ui.searchQ||'').trim()+' »';
}

function discBody(){
  const d = ui.disc;
  if(d.loading && !d.res.length)
    return '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Recherche de titres…</p></div>';
  if(d.err)
    return '<div class="empty">'+I.boussole+'<h3>'+esc(d.err)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerDecouverte()">Réessayer</button></div>';
  if(!d.res.length)
    return '<div class="empty">'+I.boussole+'<h3>Rien avec ces filtres</h3>'+
      '<p>'+(d.plates.length
        ? 'Rien de tel sur '+(d.plates.length>2 ? 'ces plateformes' : esc(d.plates.map(p=>p.nom).join(' ou ')))+
          '. Ajoute une plateforme, ou élargis la note et les genres.'
        : 'Élargis la note minimale ou retire un genre.')+'</p>'+
      '<button class="btn ghost" onclick="ouvrirFiltres()">Ouvrir les filtres</button></div>';
  return '<div class="grid">'+d.res.map(r=>carteTitre(r, discMedia())).join('')+'</div>'+
    (d.page < d.pages
      ? '<div class="plus"><button class="btn ghost" onclick="chargerDecouverte(true)"'+
        (d.loading?' disabled':'')+'>'+(d.loading?'<span class="spin"></span> Chargement…':'Voir plus')+'</button></div>'
      : '');
}

/* ---------- Vue : aperçu avant ajout (série ou film) ---------- */
function openPreview(id, type, from){
  ui.preview = { id:id, type:type, loading:true, data:null };
  /* Toujours un mouvement vers l'avant : depuis une fiche d'acteur aussi, où la
     profondeur nominale de l'écran d'arrivée est pourtant plus faible. */
  go('preview', {id:id, type:type, from:from||'discover'}, 'enter');
  loadPreview();
}
async function loadPreview(){
  const id = params.id, type = params.type;
  try{
    const d = await tmdb('/'+type+'/'+id, { append_to_response:'credits,videos' });
    if(ui.preview.id===id) ui.preview = { id:id, type:type, loading:false, data:d };
    /* La fiche porte déjà casting et vidéos : on remplit les caches communs
       pour que la zone bande-annonce n'aille pas redemander la même chose. */
    castings[type+':'+id] = ((d.credits||{}).cast||[]).slice(0, 16);
    if(d.original_language) langueDe[type+':'+id] = d.original_language;
    semerBande(type, id, d);
  }catch(e){
    if(ui.preview.id===id) ui.preview = { id:id, type:type, loading:false, error:
      (e.message==='BADKEY' ? 'Clé TMDB invalide' : 'Impossible de charger la fiche') };
  }
  if(view==='preview') render();
}
