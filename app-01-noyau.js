"use strict";

/* ============================ Icônes ============================ */
const I = {
  cloche:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  clochePleine:'<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0" fill="none"/></svg>',
  tv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="m17 2-5 5-5-5"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>',
  clap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="11" rx="2"/><path d="M3 9l1.8-4.6a1 1 0 0 1 1.2-.6l14.6 2.7a1 1 0 0 1 .8 1.1L21 9M7.6 4.6 9.8 8m-1.4-3.7L10.9 8m2.2-3.1L15.4 8"/></svg>',
  cog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  caret:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  dots:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>',
  plein:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/></svg>',
  bookmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  frame:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.4"/><path d="m21 16-5-5-4.5 4.5L9 13l-6 6"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
  boussole:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
  filtre:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M7 12h10M10 17h4"/></svg>',
  /* Emblèmes de profil : de quoi se reconnaître d'un coup d'œil sans photo. */
  coeur:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.6 3.9 12.9a5.1 5.1 0 0 1 7.2-7.2l.9.9.9-.9a5.1 5.1 0 0 1 7.2 7.2z"/></svg>',
  eclair:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 2 4 13.4h6.1L9.6 22 20 10.2h-6.4z"/></svg>',
  fusee:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5c3.4 2 5.4 5.6 5.4 9.6L19 15v3l-3.3-1.6h-7.4L5 18v-3l1.6-2.9c0-4 2-7.6 5.4-9.6Z"/><circle cx="12" cy="10" r="2"/><path d="M9.7 19.4c.7 1 1.5 1.8 2.3 2.4.8-.6 1.6-1.4 2.3-2.4"/></svg>',
  lune:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>',
  feu:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.6 2c.3 3-1.4 4.2-2.6 5.6-1.6 1.8-2.6 3.3-2.6 5.6a6.6 6.6 0 0 0 13.2 0c0-3.4-2-5.4-3.4-7.3-.3 1-.9 1.7-1.7 2.2C15.7 5.7 14.7 3.5 12.6 2z" opacity=".55"/><path d="M12 11c.3 2-1.9 2.6-1.9 4.7a3.4 3.4 0 0 0 6.8 0c0-2.4-2.4-3.1-4.9-4.7z"/></svg>'
};

/* ============================ Stockage ============================ */
/* IndexedDB en base principale (quota large, non purgé comme localStorage),
   miroir localStorage en secours, et écriture forcée dès que l'app passe en arrière-plan. */
const KEY = 'mesSeries.v1';
const IDB_NAME = 'mesSeries', IDB_STORE = 'kv', IDB_KEY = 'db';
let memoryOnly = false, storageMode = 'idb', storageKO = false;
/* Serveur de sauvegarde pré-configuré (clé publiable : conçue pour être dans le client,
   les données sont protégées par les règles RLS côté base). Modifiable dans l'écran Compte. */
const DEFAULT_SYNC = { url:'https://mqwryzopmtykjidabqfv.supabase.co',
                       key:'sb_publishable_ZnfMBfcEQOhdpg3g9u0eZg_Iaw_Fo7y' };
let db = { lang:'fr-FR', shows:{}, movies:{}, lastExport:null, onboarde:false,
           sync:Object.assign({}, DEFAULT_SYNC), auth:null, pseudo:'',
           /* Deux caractères et une couleur : de quoi se reconnaître sans photo,
              et sans alourdir les sauvegardes ni la synchro. */
           profil:{ embleme:'lettre', couleur:'corail' },
           /* Le compte à qui appartient cette bibliothèque : sert à ne pas mélanger
              deux personnes qui se connecteraient sur le même appareil. */
           proprio:null,
           /* Notifications : ce qu'on veut recevoir, et pour quels titres.
              Le détail des champs et leur remise à niveau sont dans app-09. */
           notif:null,
           deleted:{shows:{},movies:{}}, syncedAt:null, v:1 };

function idbOpen(){
  return new Promise((res,rej)=>{
    if(!self.indexedDB) return rej(new Error('no idb'));
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = ()=>{ if(!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE); };
    r.onsuccess = ()=> res(r.result);
    r.onerror = ()=> rej(r.error || new Error('idb error'));
    r.onblocked = ()=> rej(new Error('idb blocked'));
  });
}
function idbReq(mode, fn){
  return idbOpen().then(conn => new Promise((res,rej)=>{
    const tx = conn.transaction(IDB_STORE, mode);
    const rq = fn(tx.objectStore(IDB_STORE));
    rq.onsuccess = ()=> res(rq.result);
    rq.onerror = ()=> rej(rq.error);
    tx.oncomplete = ()=> conn.close();
  }));
}
const idbGet = ()=> idbReq('readonly', st => st.get(IDB_KEY));
const idbSet = v => idbReq('readwrite', st => st.put(v, IDB_KEY));

/* Demande au navigateur de marquer le stockage comme "persistant" :
   il ne sera pas purgé automatiquement pour faire de la place. */
async function askPersist(){
  try{
    if(navigator.storage && navigator.storage.persist){
      if(!(await navigator.storage.persisted())) await navigator.storage.persist();
    }
  }catch(e){}
}

async function loadDB(){
  let loaded = null;
  try{ loaded = await idbGet(); }
  catch(e){ storageMode = 'ls'; }

  if(!loaded){
    /* Première ouverture après la mise à jour : on récupère l'ancienne base localStorage */
    try{
      const raw = localStorage.getItem(KEY);
      if(raw){ loaded = JSON.parse(raw); }
    }catch(e){}
  }
  if(loaded && typeof loaded === 'object') db = Object.assign(db, loaded);
  /* Une clé enregistrée par une version précédente est effacée d'office :
     personne ne doit pouvoir la lire, ni dans l'app, ni dans un export. */
  if('apiKey' in db) delete db.apiKey;
  if(!db.profil || typeof db.profil !== 'object') db.profil = { embleme:'lettre', couleur:'corail' };
  if(!db.sync || !db.sync.url || !db.sync.key) db.sync = Object.assign({}, DEFAULT_SYNC);
  if(!db.deleted) db.deleted = {shows:{},movies:{}};
  /* Bases d'avant le compte obligatoire : la bibliothèque existante appartient
     à la session en cours s'il y en a une, sinon au premier compte qui se
     connectera ici. Dans les deux cas, rien n'est perdu. */
  if(db.proprio === undefined) db.proprio = null;
  if(!db.proprio && db.auth && db.auth.uid) db.proprio = db.auth.uid;

  /* Vérifie qu'au moins un canal d'écriture fonctionne */
  try{ await writeNow(); }
  catch(e){
    try{ localStorage.setItem(KEY, JSON.stringify(db)); storageMode = 'ls'; }
    catch(e2){ memoryOnly = true; }
  }
}

let saveTimer = null, dirty = false;
function saveDB(){
  dirty = true;
  if(typeof scheduleSync === 'function') scheduleSync();
  if(memoryOnly) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{ writeNow().catch(()=>{}); }, 150);
}
async function writeNow(){
  if(memoryOnly) return;
  const snapshot = JSON.parse(JSON.stringify(db));
  /* Le miroir localStorage passe EN PREMIER : c'est la seule écriture synchrone,
     donc la seule qui aboutisse si iOS gèle l'app juste après un geste de fermeture.
     IndexedDB, plus lent mais sans limite de taille, suit. Le mode n'est annoncé
     qu'une fois les deux tentatives faites, pour ne jamais afficher un état
     intermédiaire pendant l'écriture. */
  let okLS = false, okIDB = false;
  try{ localStorage.setItem(KEY, JSON.stringify(snapshot)); okLS = true; }catch(e){}
  try{ await idbSet(snapshot); okIDB = true; }catch(e){}
  const ok = okLS || okIDB;
  storageMode = okIDB ? 'idb' : okLS ? 'ls' : storageMode;
  if(!ok){
    if(!storageKO){ storageKO = true; try{ toast('Sauvegarde impossible : pense à exporter tes données'); }catch(e2){} }
    throw new Error('aucun stockage disponible');
  }
  storageKO = false;
  dirty = false;
}
/* iOS peut tuer l'app sans prévenir : on écrit dès qu'elle passe en arrière-plan */
function flushDB(){ if(dirty){ clearTimeout(saveTimer); writeNow().catch(()=>{}); } }
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) flushDB(); });
window.addEventListener('pagehide', flushDB);
window.addEventListener('blur', flushDB);

/* ============================ TMDB ============================ */
const IMG = (p,size)=> p ? 'https://image.tmdb.org/t/p/'+size+p : '';

/* La clé TMDB n'existe nulle part côté navigateur — ni dans le code, ni dans les
   réglages, ni dans les données enregistrées. Elle vit dans un secret côté
   serveur, et toutes les requêtes passent par ce relais, qui l'ajoute au dernier
   moment. Aucun utilisateur, quel qu'il soit, ne peut la lire depuis l'app. */
const RELAIS_TMDB = () => (db.sync && db.sync.url ? db.sync.url : DEFAULT_SYNC.url) + '/functions/v1/tmdb';

async function tmdb(path, params, extra){
  const u = new URL(RELAIS_TMDB());
  u.searchParams.set('path', path);
  u.searchParams.set('language', db.lang || 'fr-FR');
  for(const k in (params||{})) u.searchParams.set(k, params[k]);
  const opt = {};
  if(extra && extra.signal) opt.signal = extra.signal;      // permet d'abandonner la requête
  /* Sans délai maximal, un réseau qui ne répond plus laisse l'interface en
     « chargement » pour toujours. */
  let minuteur = null;
  if(!opt.signal && typeof AbortController !== 'undefined'){
    const ctrl = new AbortController();
    opt.signal = ctrl.signal;
    minuteur = setTimeout(()=>{ try{ ctrl.abort(); }catch(e){} }, 15000);
  }
  let r;
  try{ r = await fetch(u.toString(), opt); }
  finally{ if(minuteur) clearTimeout(minuteur); }
  if(r.status === 401) throw new Error('BADKEY');
  /* Trop de requêtes : on patiente, mais trois fois au maximum. */
  if(r.status === 429){
    const essai = (extra && extra.essai) || 0;
    if(essai >= 3) throw new Error('TROP_DE_REQUETES');
    await sleep(1200 * (essai + 1));
    return tmdb(path, params, Object.assign({}, extra, {essai: essai + 1}));
  }
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

/* Récupère la série + toutes ses saisons (par paquets de 20 via append_to_response) */
async function fetchShowFull(id, onStep){
  const base = await tmdb('/tv/'+id);
  const nums = (base.seasons||[]).map(s=>s.season_number).sort((a,b)=>a-b);
  const seasons = {};
  for(let i=0;i<nums.length;i+=20){
    const chunk = nums.slice(i,i+20);
    if(onStep) onStep(Math.min(i+20,nums.length), nums.length);
    const d = await tmdb('/tv/'+id, { append_to_response: chunk.map(n=>'season/'+n).join(',') });
    chunk.forEach(n=>{
      const sd = d['season/'+n];
      if(sd && sd.episodes && sd.episodes.length){
        seasons[n] = sd.episodes.map(ep=>({
          e: ep.episode_number, n: ep.name || ('Épisode '+ep.episode_number),
          d: ep.air_date || null, r: ep.runtime || null, st: ep.still_path || null
        }));
      }
    });
  }
  return {
    id: base.id, name: base.name, poster: base.poster_path, backdrop: base.backdrop_path,
    overview: base.overview, first: base.first_air_date, status: base.status,
    runtime: (base.episode_run_time && base.episode_run_time[0]) || null,
    genres: (base.genres||[]).map(g=>g.name),
    note: base.vote_average || null,
    network: (base.networks && base.networks[0] && base.networks[0].name) || null,
    next: base.next_episode_to_air ? {
      s: base.next_episode_to_air.season_number, e: base.next_episode_to_air.episode_number,
      n: base.next_episode_to_air.name, d: base.next_episode_to_air.air_date
    } : null,
    seasons, updated: Date.now()
  };
}

/* ============================ Synchronisation ============================ */
/* Sauvegarde en ligne via Supabase : chaque utilisateur possède une ligne unique
   contenant l'ensemble de ses données. Les appareils fusionnent au lieu d'écraser. */

const TABLE = 'mes_series';
let syncing = false, syncTimer = null, syncState = 'off', syncError = '';

const syncReady = ()=> !!(db.sync && db.sync.url && db.sync.key);
const signedIn  = ()=> !!(db.auth && db.auth.token && db.auth.uid);
const sbBase    = ()=> String(db.sync.url).replace(/\/+$/,'');

async function sbFetch(path, opt, retry){
  opt = opt || {};
  const h = Object.assign({ apikey: db.sync.key, 'Content-Type':'application/json' }, opt.headers||{});
  if(signedIn() && !opt.noAuth) h.Authorization = 'Bearer ' + db.auth.token;
  const r = await fetch(sbBase()+path, Object.assign({}, opt, {headers:h}));
  if(r.status === 401 && signedIn() && !retry){
    if(await sbRefresh()) return sbFetch(path, opt, true);
  }
  const txt = await r.text();
  let body = null; try{ body = txt ? JSON.parse(txt) : null; }catch(e){ body = txt; }
  if(!r.ok){
    const msg = (body && (body.msg || body.message || body.error_description || body.error)) || ('erreur '+r.status);
    const err = new Error(msg); err.status = r.status; throw err;
  }
  return body;
}

async function sbSignUp(email, password){
  const d = await sbFetch('/auth/v1/signup', {method:'POST', noAuth:true,
    body: JSON.stringify({email, password})});
  if(d && d.access_token) return applySession(d);
  /* confirmation par e-mail activée côté Supabase */
  throw new Error('CONFIRM');
}
async function sbSignIn(email, password){
  const d = await sbFetch('/auth/v1/token?grant_type=password', {method:'POST', noAuth:true,
    body: JSON.stringify({email, password})});
  return applySession(d);
}
/* --- Mot de passe oublié ---
   Le serveur envoie un lien qui ramène sur l'app avec un jeton de courte durée.
   `redirect_to` doit figurer dans la liste blanche du projet, sinon le serveur
   retombe silencieusement sur l'adresse par défaut — c'est ce qui renvoyait
   vers localhost tant que le réglage n'avait pas été corrigé. */
function adresseRetour(){ return location.origin + location.pathname; }

async function sbDemanderReinit(email){
  return sbFetch('/auth/v1/recover?redirect_to=' + encodeURIComponent(adresseRetour()),
    { method:'POST', noAuth:true, body: JSON.stringify({ email }) });
}
/* Le jeton de récupération vaut session le temps de poser le nouveau mot de
   passe : on s'en sert une fois, puis on l'oublie. */
async function sbPoserMotDePasse(jeton, mdp){
  const r = await fetch(sbBase()+'/auth/v1/user', {
    method:'PUT',
    headers:{ apikey: db.sync.key, 'Content-Type':'application/json',
              Authorization:'Bearer '+jeton },
    body: JSON.stringify({ password: mdp })
  });
  const txt = await r.text();
  let b = null; try{ b = txt ? JSON.parse(txt) : null; }catch(e){}
  if(!r.ok) throw new Error((b && (b.msg || b.message || b.error_description)) || ('erreur '+r.status));
  return b;
}

async function sbRefresh(){
  try{
    const d = await sbFetch('/auth/v1/token?grant_type=refresh_token', {method:'POST', noAuth:true,
      body: JSON.stringify({refresh_token: db.auth.refresh})});
    applySession(d); return true;
  }catch(e){ return false; }
}
function applySession(d){
  if(!d || !d.access_token) throw new Error('réponse inattendue du serveur');
  db.auth = { token:d.access_token, refresh:d.refresh_token,
              uid:(d.user&&d.user.id)||(db.auth&&db.auth.uid), email:(d.user&&d.user.email)||(db.auth&&db.auth.email) };
  adopterCompte(db.auth.uid);
  saveDB();
  return db.auth;
}

/* À qui appartient la bibliothèque posée sur cet appareil.
   Se déconnecter ne l'efface pas — elle redevient simplement invisible, et
   revient telle quelle à la reconnexion. Mais si quelqu'un d'autre se connecte
   ici, elle n'a rien à faire dans son compte : on repart de zéro.
   Les suppressions ne sont surtout PAS tracées dans ce cas — elles se
   propageraient au nouveau compte et lui effaceraient ses propres titres. */
function adopterCompte(uid){
  if(!uid) return;
  if(db.proprio && db.proprio !== uid){
    db.shows = {}; db.movies = {};
    db.deleted = { shows:{}, movies:{} };
    db.syncedAt = null;
  }
  db.proprio = uid;
}

/* Se déconnecter ne touche pas aux données : elles restent sur l'appareil,
   hors d'atteinte tant que personne n'est connecté. */
function sbSignOut(){
  /* Avant d'effacer la session : cet appareil ne doit plus recevoir les
     notifications du compte que l'on quitte. */
  if(typeof oublierAppareil === 'function') oublierAppareil();
  db.auth = null; syncState='off'; saveDB();
  /* `go` plutôt que `render` : il remet les paramètres d'écran à zéro. Sans ça,
     une provenance laissée par l'écran précédent survivait à la déconnexion et
     la reconnexion retombait sur la fiche du compte au lieu d'ouvrir l'app. */
  go('account');
}

/* Suppression définitive du compte, côté serveur. L'app ne peut pas le faire
   seule : effacer un compte demande des droits d'administration qui n'ont rien
   à faire dans un navigateur. Une fonction serveur s'en charge, et ne supprime
   que le porteur du jeton présenté — impossible de viser quelqu'un d'autre. */
async function sbSupprimerCompte(){
  const base = (db.sync && db.sync.url ? db.sync.url : DEFAULT_SYNC.url);
  const r = await fetch(base + '/functions/v1/supprimer-compte', {
    method: 'POST',
    headers: { apikey: db.sync.key, Authorization: 'Bearer ' + db.auth.token }
  });
  let d = null; try{ d = await r.json(); }catch(e){}
  if(!r.ok || !d || !d.ok) throw new Error((d && d.erreur) || ('erreur '+r.status));
  return true;
}

/* --- Décochage : on garde une trace horodatée, sinon la synchro suivante remettrait
   l'épisode coché (l'autre appareil, lui, le croit toujours vu). Ces traces s'effacent
   d'elles-mêmes au bout de trois mois. --- */
const RETENTION_DECOCHE = 90 * 86400000;
function noterDecoches(sh, avant){
  if(!sh) return;
  const apres = sh.watched || {};
  const uw = Object.assign({}, sh.unwatched || {});
  const t = Date.now();
  Object.keys(avant || {}).forEach(k=>{ if(!apres[k]) uw[k] = t; });
  Object.keys(apres).forEach(k=>{ if(uw[k]) delete uw[k]; });
  Object.keys(uw).forEach(k=>{ if(t - uw[k] > RETENTION_DECOCHE) delete uw[k]; });
  if(Object.keys(uw).length) sh.unwatched = uw; else delete sh.unwatched;
  sh.updated = t;
}

/* --- Fusion : on ne perd jamais un épisode coché, et les suppressions se propagent --- */
function payload(){
  /* La clé n'est plus synchronisée : elle vit côté serveur, et l'envoyer
     exposait celle des gens qui en ont une à leurs abonnés. */
  return { lang: db.lang, pseudo: db.pseudo, shows: db.shows, movies: db.movies,
           deleted: db.deleted || {shows:{},movies:{}},
           /* Les cloches suivent la bibliothèque : changer de téléphone ne
              doit pas obliger à les rallumer une par une. */
           notif: (typeof notifPourSynchro === 'function') ? notifPourSynchro() : null };
}
function mergeRemote(rem){
  if(!rem || typeof rem !== 'object') return false;
  const del = db.deleted = db.deleted || {shows:{},movies:{}};
  const rdel = rem.deleted || {shows:{},movies:{}};
  ['shows','movies'].forEach(k=>{
    Object.keys(rdel[k]||{}).forEach(id=>{
      if(!del[k][id] || rdel[k][id] > del[k][id]) del[k][id] = rdel[k][id];
    });
  });

  let changed = false;
  /* séries */
  Object.values(rem.shows||{}).forEach(rs=>{
    if(del.shows[rs.id] && del.shows[rs.id] > (rs.addedAt||0)) return;   // supprimée ici après coup
    const ls = db.shows[rs.id];
    if(!ls){ db.shows[rs.id] = rs; changed = true; return; }
    /* fiche la plus récente, union des épisodes vus — sauf ceux décochés depuis */
    const base = (rs.updated||0) > (ls.updated||0) ? Object.assign({}, rs) : Object.assign({}, ls);
    const t = Date.now();
    const uw = Object.assign({}, ls.unwatched||{});
    Object.keys(rs.unwatched||{}).forEach(k=>{ if(!uw[k] || rs.unwatched[k] > uw[k]) uw[k] = rs.unwatched[k]; });
    Object.keys(uw).forEach(k=>{ if(t - uw[k] > RETENTION_DECOCHE) delete uw[k]; });

    const tous = Object.assign({}, rs.watched||{});
    Object.keys(ls.watched||{}).forEach(k=>{ if(!tous[k] || ls.watched[k] > tous[k]) tous[k] = ls.watched[k]; });
    const w = {};
    Object.keys(tous).forEach(k=>{ if(!(uw[k] && uw[k] >= tous[k])) w[k] = tous[k]; });

    const avant = ls.watched||{};
    if(Object.keys(w).length !== Object.keys(avant).length ||
       Object.keys(w).some(k=>!avant[k])) changed = true;
    base.watched = w;
    if(Object.keys(uw).length) base.unwatched = uw; else delete base.unwatched;
    base.addedAt = Math.min(ls.addedAt||Date.now(), rs.addedAt||Date.now());
    db.shows[rs.id] = base;
  });
  /* films */
  Object.values(rem.movies||{}).forEach(rm=>{
    if(del.movies[rm.id] && del.movies[rm.id] > (rm.addedAt||0)) return;
    const lm = db.movies[rm.id];
    if(!lm){ db.movies[rm.id] = rm; changed = true; return; }
    if((rm.watchedAt||0) > (lm.watchedAt||0)){ db.movies[rm.id] = rm; changed = true; }
  });
  /* suppressions distantes à appliquer localement */
  ['shows','movies'].forEach(k=>{
    Object.keys(del[k]).forEach(id=>{
      const it = db[k][id];
      if(it && del[k][id] > (it.addedAt||0)){ delete db[k][id]; changed = true; }
    });
  });
  if(!db.pseudo && rem.pseudo){ db.pseudo = rem.pseudo; changed = true; }
  /* Les cloches arrivées d'un autre appareil : la liste côté serveur a été
     écrite par lui, elle ignore donc les nôtres. On la refait au complet. */
  if(typeof fusionnerNotif === 'function' && fusionnerNotif(rem.notif)){
    changed = true;
    /* La bibliothèque vient d'être fusionnée : une cloche arrivée pour un
       titre retiré entre-temps n'a plus lieu d'être. */
    if(typeof nettoyerCloches === 'function') nettoyerCloches();
    if(typeof poussserPlusTard === 'function') poussserPlusTard();
  }
  return changed;
}
function markDeleted(kind, id){
  db.deleted = db.deleted || {shows:{},movies:{}};
  db.deleted[kind][id] = Date.now();
}

async function syncNow(silent){
  if(!syncReady() || !signedIn() || syncing) return;
  syncing = true; syncState = 'busy'; syncError = ''; if(!silent) render();
  try{
    const got = await sbFetch('/rest/v1/'+TABLE+'?select=data&user_id=eq.'+encodeURIComponent(db.auth.uid), {});
    if(Array.isArray(got) && got.length) mergeRemote(got[0].data);
    await sbFetch('/rest/v1/'+TABLE, {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: db.auth.uid, data: payload(), updated_at: new Date().toISOString() })
    });
    db.syncedAt = Date.now(); syncState = 'ok';
    await writeNow().catch(()=>{});
    if(!silent) toast('Synchronisé');
    render();
  }catch(e){
    syncState = 'err'; syncError = e.message || 'échec';
    if(!silent) toast('Synchro impossible : '+syncError);
    render();
  }
  syncing = false;
}
function scheduleSync(){
  if(!syncReady() || !signedIn()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(()=> syncNow(true), 4000);
}

/* ============================ Partage par abonnement ============================ */
/* On ne consulte jamais la bibliothèque de quelqu'un sans y être abonné, et on ne
   s'abonne que par un code que la personne a elle-même généré. Tout est en lecture
   seule : rien de ce qui suit n'écrit dans les données d'autrui. */

let partage = { suivis:[], abonnes:[], charge:false, occupe:false, code:null };
const biblios = {};                       // caches mémoire, jamais enregistrés localement

async function majProfil(){
  if(!signedIn()) return;
  const pseudo = (db.pseudo || '').trim() || (db.auth.email||'').split('@')[0];
  db.pseudo = pseudo;
  const p = db.profil || {};
  try{
    await sbFetch('/rest/v1/profils', { method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: db.auth.uid, pseudo: pseudo,
        /* L'avatar voyage avec le pseudo : sans ça les proches ne voyaient
           qu'une initiale grise, alors que l'app leur promettait le contraire.
           La table n'est lisible que par le cercle — voir la règle
           « profils lisibles par mon cercle » côté base. */
        couleur: p.couleur || null,
        embleme: p.embleme || null,
        photo:   p.photo   || null,
        maj: new Date().toISOString() }) });
  }catch(e){}
}

async function chargerPartage(){
  if(!signedIn()) return;
  partage.occupe = true; partage.erreur = null;
  try{
    const liens = await sbFetch('/rest/v1/abonnements?select=suiveur,suivi,depuis', {});
    const moi = db.auth.uid;
    const idsSuivis  = liens.filter(l=>l.suiveur===moi).map(l=>l.suivi);
    const idsAbonnes = liens.filter(l=>l.suivi===moi).map(l=>l.suiveur);
    const tous = [...new Set(idsSuivis.concat(idsAbonnes))];
    let profs = {};
    if(tous.length){
      const ps = await sbFetch('/rest/v1/profils?select=user_id,pseudo,couleur,embleme,photo'+
        '&user_id=in.('+tous.join(',')+')', {});
      ps.forEach(p=> profs[p.user_id] = p);
    }
    /* On reprend l'avatar tel que la personne l'a choisi. Rien n'est inventé :
       sans profil enregistré, on retombe sur l'initiale. */
    const fiche = (id)=>{
      const p = profs[id] || {};
      return { id, pseudo: p.pseudo || 'Sans nom',
               couleur: p.couleur || null, embleme: p.embleme || null, photo: p.photo || null };
    };
    partage.suivis  = idsSuivis.map(fiche);
    partage.abonnes = idsAbonnes.map(fiche);
    partage.charge = true;
  }catch(e){ partage.erreur = e.message; }
  partage.occupe = false;
  if(view==='abos') render();
}

async function genererCode(){
  if(!signedIn()) return;
  const lettres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sans I, O, 0, 1 pour éviter les confusions
  let code = '';
  const buf = new Uint32Array(6);
  (self.crypto || window.crypto).getRandomValues(buf);
  for(let i=0;i<6;i++) code += lettres[buf[i] % lettres.length];
  try{
    await majProfil();
    await sbFetch('/rest/v1/codes_partage', { method:'POST',
      headers:{ Prefer:'return=minimal' },
      body: JSON.stringify({ code: code, proprio: db.auth.uid }) });
    partage.code = code;
    render();
  }catch(e){ toast('Impossible de créer le code'); }
}

async function utiliserCode(saisi){
  const code = (saisi||'').trim().toUpperCase();
  if(code.length < 4) return toast('Code trop court');
  try{
    await majProfil();
    const r = await sbFetch('/rest/v1/rpc/utiliser_code', { method:'POST',
      body: JSON.stringify({ le_code: code }) });
    const nom = (Array.isArray(r) && r[0] && r[0].pseudo) || 'cette personne';
    toast('Tu suis maintenant '+nom);
    await chargerPartage();
    render();
  }catch(e){
    const m = String(e.message||'');
    if(/CODE_INVALIDE/.test(m))   toast('Code inconnu, déjà utilisé ou expiré');
    else if(/CODE_A_SOI/.test(m)) toast('Ce code est le tien');
    else toast('Échec : '+m);
  }
}

async function rompre(id, jeSuis){
  const q = jeSuis === 'suiveur'
    ? '?suiveur=eq.'+db.auth.uid+'&suivi=eq.'+id
    : '?suiveur=eq.'+id+'&suivi=eq.'+db.auth.uid;
  try{
    await sbFetch('/rest/v1/abonnements'+q, { method:'DELETE', headers:{ Prefer:'return=minimal' } });
    delete biblios[id];
    await chargerPartage();
    render();
    toast(jeSuis === 'suiveur' ? 'Désabonné' : 'Abonné retiré');
  }catch(e){ toast('Échec : '+e.message); }
}

/* Récupère la bibliothèque d'une personne suivie — lecture seule, gardée en mémoire */
async function chargerBiblio(id){
  try{
    const r = await sbFetch('/rest/v1/'+TABLE+'?select=data&user_id=eq.'+encodeURIComponent(id), {});
    biblios[id] = (Array.isArray(r) && r.length) ? (r[0].data || {}) : {};
  }catch(e){ biblios[id] = { erreur: e.message }; }
  if(view==='biblio') render();
}
