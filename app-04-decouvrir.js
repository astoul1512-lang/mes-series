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
  return '<div class="grid">'+ui.searchRes.map(r=>carteTitre(r, discMedia())).join('')+'</div>';
}

function onSearchInput(v){
  ui.searchQ = v;
  clearTimeout(searchTimer);
  abortSearch();
  const q = v.trim();
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

async function runSearch(q){
  if(!db.apiKey){
    ui.searching = false; peindreDisc();
    toast('Ajoute ta clé TMDB dans Réglages');
    return go('settings', {from:'discover'});
  }
  const seq = ++searchSeq;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  searchAbort = ctrl;
  try{
    if(ui.disc.type === 'anime') await chargerGenres('tv');   // besoin de l'id du genre Animation
    if(seq !== searchSeq) return;
    /* Mini-séries et animés restent des séries : TMDB ne cherche que dans tv ou movie. */
    const d = await tmdb('/search/'+discMedia(), { query:q, include_adult:'false' },
                         ctrl ? {signal:ctrl.signal} : null);
    if(seq !== searchSeq) return;                      // une frappe plus récente a pris la main
    ui.searchRes = garderAnimes(d.results||[]).slice(0, SEARCH_MAX);
    ui.searching = false; ui.searchErr = '';
    peindreDisc();
  }catch(e){
    if((e && e.name === 'AbortError') || seq !== searchSeq) return;
    ui.searching = false;
    ui.searchErr = (e.message === 'BADKEY') ? 'Clé TMDB refusée' : 'Pas de connexion';
    ui.searchRes = [];
    peindreDisc();
  }
}

/* Vignette commune aux suggestions et aux résultats de recherche. */
function carteTitre(r, media){
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

  return '<button class="gcard" onclick="openPreview('+r.id+',\''+media+'\',\'discover\')">'+
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
    toast(e.message==='BADKEY'?'Clé TMDB invalide':"Impossible d'ajouter cette série");
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

const DISC_TYPES = [
  { id:'tv',    label:'Séries' },
  { id:'movie', label:'Films' },
  { id:'mini',  label:'Mini-séries' },
  { id:'anime', label:'Animés' }
];
/* Deux réglages distincts, longtemps mélangés dans une seule rangée :
   ce qu'on regarde (tout le catalogue ou les sorties récentes),
   et dans quel ordre on le classe. */
const DISC_PERIMETRES = [
  { id:'tout',   label:'Toutes',           court:'Toutes' },
  { id:'recent', label:'Sorties récentes', court:'Sorties récentes' }
];
const DISC_TRIS = [
  { id:'populaire', label:'Les plus populaires', court:'populaire' },
  { id:'note',      label:'Les mieux notées',    court:'mieux notées' }
];
const DISC_NOTES = [
  { v:0, label:'Toutes' }, { v:6, label:'6 et +' }, { v:7, label:'7 et +' }, { v:8, label:'8 et +' }
];
const DISC_FENETRE = 90;     // « sorti récemment » = les 90 derniers jours

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
const platesAbo = { tv:{}, movie:{} };      // id → true (fait de l'abonnement en France)
const platesAboFait = { tv:false, movie:false };
const sondagesFaits = {};                   // « tv:anime » → true
let sondageEnCours = false;
let discSeq = 0;

/* Le média TMDB derrière chaque puce : mini-séries et animés restent des séries. */
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
  if(d.type === 'mini') p.with_type = '2';                       // 2 = mini-série chez TMDB
  if(d.type === 'anime'){
    p.with_original_language = 'ja';
    if(noms.indexOf('Animation') < 0) noms.unshift('Animation');
  }
  const ids = noms.map(n => genreParNom(media, n)).filter(x => x != null);
  if(ids.length) p.with_genres = ids.join(',');

  /* Plateformes : « ou » entre elles (barre verticale), et uniquement ce qui est
     inclus dans un abonnement. TMDB exige la région avec ce filtre. */
  if(d.plates.length){
    p.with_watch_providers = d.plates.map(x => x.id).join('|');
    p.watch_region = REGION_PLATO;
    p.with_watch_monetization_types = 'flatrate';
  }

  if(d.tri === 'note'){ p.sort_by = 'vote_average.desc'; p['vote_count.gte'] = '300'; }
  else p.sort_by = 'popularity.desc';

  /* « Toutes » ne pose aucune borne de date : c'est tout le catalogue. */
  if(d.perimetre === 'recent'){
    const champ = media === 'movie' ? 'primary_release_date' : 'first_air_date';
    p[champ+'.gte'] = isoIlYA(DISC_FENETRE);
    p[champ+'.lte'] = todayISO();
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
  if(!db.apiKey){ toast('Ajoute ta clé TMDB dans Réglages'); return go('settings', {from:'discover'}); }
  const seq = ++discSeq;
  d.page = suite ? d.page + 1 : 1;
  if(!suite){ d.res = []; d.pages = 1; }
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
    const data = await tmdb('/discover/'+media, discParams());
    if(seq !== discSeq) return;
    const trouves = (data.results||[]).filter(r => r.poster_path);
    d.res = suite ? d.res.concat(trouves) : trouves;
    d.pages = data.total_pages || 1;
    d.loading = false; d.err = ''; d.charge = true;
    peindreDisc();
  }catch(e){
    if(seq !== discSeq) return;
    if(suite) d.page = Math.max(1, d.page - 1);
    d.loading = false; d.charge = true;
    d.err = (e.message === 'BADKEY') ? 'Clé TMDB refusée' : 'Pas de connexion';
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
  el.innerHTML = cherche ? searchBody() : discBody();
  const r = document.querySelector('.resume');
  if(r) r.innerHTML = '<b>'+esc(cherche ? resumeRecherche() : resumeFiltres())+'</b>';
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
  chargerDecouverte();
  if(enRecherche()) searchNow();
}
function setDiscTri(t){ ui.disc.tri = t; ouvrirFiltres(); chargerDecouverte(); }
function setDiscPerimetre(p){ ui.disc.perimetre = p; ouvrirFiltres(); chargerDecouverte(); }
function setDiscNote(n){ ui.disc.noteMin = n; ouvrirFiltres(); chargerDecouverte(); }
function bascGenre(i){
  const g = genresAffiches()[i];
  if(!g) return;
  const sel = ui.disc.genres, k = sel.indexOf(g.nom);
  if(k < 0) sel.push(g.nom); else sel.splice(k,1);
  ouvrirFiltres(); chargerDecouverte();
}
/* Les plateformes sont retenues avec leur nom et leur logo : la ligne de résumé
   et les puces restent lisibles même si la liste TMDB n'est pas encore revenue. */
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
  d.genres = []; d.plates = []; d.perimetre = 'recent'; d.tri = 'populaire'; d.noteMin = 0;
  ouvrirFiltres(); chargerDecouverte();
}

function resumeFiltres(){
  const d = ui.disc;
  const bouts = [ (DISC_PERIMETRES.find(p=>p.id===d.perimetre)||{}).court,
                  (DISC_TRIS.find(t=>t.id===d.tri)||{}).court ];
  if(d.noteMin) bouts.push('note '+d.noteMin+' et +');
  d.genres.forEach(n=> bouts.push(n.toLowerCase()));
  /* Au-delà de deux plateformes on compte au lieu d'énumérer : la ligne tient. */
  if(d.plates.length) bouts.push('sur '+(d.plates.length > 2
    ? d.plates.length+' plateformes'
    : d.plates.map(p=>p.nom).join(' ou ')));
  return bouts.filter(Boolean).join(' · ');
}
function filtresActifs(){
  const d = ui.disc;
  return d.genres.length > 0 || d.plates.length > 0 || d.noteMin > 0 ||
         d.perimetre !== 'recent' || d.tri !== 'populaire';
}

/* La feuille de filtres est-elle à l'écran ? Sert à la redessiner quand la liste
   des plateformes arrive après coup, sans inventer un état de plus. */
function feuilleFiltresOuverte(){
  const s = document.getElementById('sheet');
  return !!(s && s.classList.contains('show') && document.getElementById('fplates'));
}

/* Section « Plateformes » de la feuille de filtres. */
function blocFiltrePlates(){
  const d = ui.disc;
  const liste = platesAffichees(), reste = platesCachees();
  let h = '<div class="fgrp" id="fplates">Plateformes'+(d.plates.length?' ('+d.plates.length+')':'')+
          ' · abonnement en France</div>';
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
         (d.toutesPlates ? 'Ne montrer que les principales' : 'Voir les '+reste+' autres plateformes')+
         '</button>';
  if(d.plates.length)
    h += '<div class="small muted" style="margin-top:8px">'+
         'Il suffit qu\'un titre soit sur <b>une</b> de ces plateformes. '+
         '<button class="lienplus" style="margin:0" onclick="viderPlates()">Tout décocher</button></div>';
  return h;
}

function ouvrirFiltres(){
  const d = ui.disc;
  const genres = genresAffiches();
  const quoi = (DISC_TYPES.find(t=>t.id===d.type)||{}).label || '';
  let h = '<h3>Filtres</h3><div class="small muted" style="margin-top:-4px">'+
    'Ces réglages s\'appliquent à <b>'+esc(quoi.toLowerCase())+'</b>.</div>';
  h += '<div class="fgrp">Quoi</div><div class="fchips">'+
    DISC_PERIMETRES.map(p=>'<button class="chip '+(d.perimetre===p.id?'on':'')+
      '" onclick="setDiscPerimetre(\''+p.id+'\')">'+p.label+'</button>').join('')+'</div>'+
    '<div class="small muted" style="margin-top:8px">'+
      (d.perimetre==='tout'
        ? 'Tout le catalogue, sans limite de date.'
        : 'Uniquement ce qui est sorti depuis '+DISC_FENETRE+' jours.')+'</div>';
  h += '<div class="fgrp">Dans quel ordre</div><div class="fchips">'+
    DISC_TRIS.map(t=>'<button class="chip '+(d.tri===t.id?'on':'')+'" onclick="setDiscTri(\''+t.id+'\')">'+
      t.label+'</button>').join('')+'</div>';
  h += '<div class="fgrp">Note minimale</div><div class="fchips">'+
    DISC_NOTES.map(n=>'<button class="chip '+(d.noteMin===n.v?'on':'')+'" onclick="setDiscNote('+n.v+')">'+
      n.label+'</button>').join('')+'</div>';
  h += blocFiltrePlates();
  h += '<div class="fgrp">Genres'+(d.genres.length?' ('+d.genres.length+')':'')+
       (d.type==='anime'?' · animation déjà incluse':'')+'</div>';
  h += genres.length
    ? '<div class="fchips">'+genres.map((g,i)=>'<button class="chip '+(d.genres.indexOf(g.nom)>=0?'on':'')+
        '" onclick="bascGenre('+i+')">'+esc(g.nom)+'</button>').join('')+'</div>'
    : '<div class="small muted">Les genres arrivent avec les premiers résultats.</div>';
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
             : t==='mini'  ? "Chercher une série…"
             : discMedia()==='tv' ? "Chercher une série…" : "Chercher un film…";
  return '<div class="qbar">'+I.search+
    '<input type="search" id="q" enterkeyhint="search" autocomplete="off" autocorrect="off" '+
    'placeholder="'+quoi+'" value="'+esc(ui.searchQ)+'" oninput="onSearchInput(this.value)" '+
    'onkeydown="if(event.key===\'Enter\'){this.blur();searchNow()}">'+
    '<button class="qclear '+(ui.searchQ?'':'masque')+'" onclick="viderRecherche()">'+I.close+'</button>'+
  '</div>';
}

function viewDiscover(){
  const d = ui.disc, cherche = enRecherche();
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
    '<div class="resume"><b>'+esc(cherche ? resumeRecherche() : resumeFiltres())+'</b></div>';
  /* Les filtres ne s'appliquent pas à une recherche par titre : le bouton s'efface. */
  const bouton = '<button class="iconbtn '+(filtresActifs()?'actif ':'')+(cherche?'masque':'')+
    '" id="fbtn" onclick="ouvrirFiltres()">'+I.filtre+'</button>';
  return header('Découvrir', {right:bouton, sub:sub}) + needKeyBanner() +
    '<div id="dres">'+(cherche ? searchBody() : discBody())+'</div>' + '<div style="height:20px"></div>';
}

function libelleCherche(){
  const t = ui.disc.type;
  if(t === 'anime') return 'les animés';
  return discMedia()==='tv' ? 'les séries' : 'les films';
}
function resumeRecherche(){
  return 'Recherche dans '+libelleCherche()+' · « '+(ui.searchQ||'').trim()+' »';
}

function discBody(){
  const d = ui.disc;
  if(!db.apiKey)
    return '<div class="empty">'+I.boussole+'<h3>Clé TMDB manquante</h3>'+
      '<p>Les suggestions viennent de TMDB : ajoute ta clé dans les réglages.</p>'+
      '<button class="btn ghost" onclick="go(\'settings\',{from:\'discover\'})">Ouvrir les réglages</button></div>';
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
  go('preview', {id:id, type:type, from:from||'discover'});
  loadPreview();
}
async function loadPreview(){
  const id = params.id, type = params.type;
  try{
    const d = await tmdb('/'+type+'/'+id, { append_to_response:'credits' });
    if(ui.preview.id===id) ui.preview = { id:id, type:type, loading:false, data:d };
  }catch(e){
    if(ui.preview.id===id) ui.preview = { id:id, type:type, loading:false, error:
      (e.message==='BADKEY' ? 'Clé TMDB invalide' : 'Impossible de charger la fiche') };
  }
  if(view==='preview') render();
}
