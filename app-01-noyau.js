"use strict";

/* ============================ Icônes ============================ */
const I = {
  /* D4 — l'écran d'attente de confirmation par e-mail. */
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>',
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
  /* Les deux ruptures d'abonnement : ne plus suivre quelqu'un, et retirer à
     quelqu'un l'accès à sa propre bibliothèque. Deux gestes opposés, deux
     dessins distincts — la même croix pour les deux était précisément le
     reproche d'Adrien. */
  usermoins:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4"/><path d="M2 21c0-4 3.6-6 8-6 1.2 0 2.3.15 3.2.42"/><path d="M16 17h6"/></svg>',
  oeilbarre:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7c1.7 0 3.2.5 4.5 1.2M21.2 15.3c.5-.7.8-1.3.8-1.3s-1-2-2.9-3.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M6.5 6.6C3.7 8.3 2 12 2 12s3.6 7 10 7c1.9 0 3.5-.6 4.9-1.4"/><path d="M3 3l18 18"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>',
  /* Mettre une série de côté. Le geste existait déjà, mais seulement au fond
     d'un menu ⋮ ou d'un appui long : Adrien voulait un bouton discret, posé
     là où il est, sur la fiche. */
  pause:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2"/></svg>',
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
/* `MODE_TEST` FORCE LE MODE MÉMOIRE. Sans ça, `test.html` — qui charge les
   VRAIS scripts — écrit dans la VRAIE base : ses cas appellent `migrer()`, qui
   se termine par `saveDB()`, et la base vierge des tests écrase celle de la
   personne. Constaté le 30/07 en production : ouvrir la page de tests sur le
   domaine de l'app a vidé la bibliothèque locale et fermé la session. Rien
   n'était perdu — le serveur avait tout — mais il fallait se reconnecter, et
   une modification pas encore synchronisée aurait disparu.
   La page de tests et l'app partagent l'origine, donc le même IndexedDB : le
   seul verrou sûr est de ne jamais écrire du tout. */
let memoryOnly = (typeof window !== 'undefined' && window.MODE_TEST === true);
let storageMode = 'idb', storageKO = false;
/* Serveur de sauvegarde pré-configuré (clé publiable : conçue pour être dans le client,
   les données sont protégées par les règles RLS côté base). Modifiable dans l'écran Compte. */
const DEFAULT_SYNC = { url:'https://mqwryzopmtykjidabqfv.supabase.co',
                       key:'sb_publishable_ZnfMBfcEQOhdpg3g9u0eZg_Iaw_Fo7y' };
/* L'avatar par défaut : deux caractères et une couleur, de quoi se reconnaître
   sans photo. Une FONCTION et non une constante : trois endroits en ont besoin
   (la base neuve ci-dessous, `loadDB`, et `adopterCompte` au changement de
   compte), et chacun le MUTE ensuite — un objet partagé les ferait se marcher
   dessus. Relecture du 09/08 : les trois valeurs étaient recopiées à la main,
   c'est-à-dire la divergence même que le reste du code évite pour `gouts`,
   `podium` et `classement`. */
function profilVierge(){ return { embleme:'lettre', couleur:'corail' }; }
let db = { lang:'fr-FR', shows:{}, movies:{}, lastExport:null, onboarde:false,
           sync:Object.assign({}, DEFAULT_SYNC), auth:null, pseudo:'',
           profil: profilVierge(),
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
  if(!db.profil || typeof db.profil !== 'object') db.profil = profilVierge();
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

let saveTimer = null, veilleTimer = null, dirty = false;
function saveDB(){
  dirty = true;
  if(typeof scheduleSync === 'function') scheduleSync();
  /* La bibliothèque vient peut-être de bouger : la vitrine doit suivre. Ici
     plutôt qu'aux dix endroits qui cochent, ajoutent ou synchronisent.
     C8 — REVUE DU 07/08 : ce recalcul parcourait les 9 436 épisodes À CHAQUE
     geste qui écrit, hors de tout regroupement (10–13 ms par coche, mesuré).
     Il rejoint le même délai de 800 ms que l'écriture : cocher une saison
     entière ne le paye plus qu'une fois. Minuteur SÉPARÉ de `saveTimer`,
     parce que l'écriture n'existe pas en mode mémoire (tests) alors que la
     vitrine doit continuer d'y être surveillée. */
  clearTimeout(veilleTimer);
  veilleTimer = setTimeout(()=>{ if(typeof veilleBiblio === 'function') veilleBiblio(); }, 800);
  if(memoryOnly) return;
  clearTimeout(saveTimer);
  /* 150 ms était plus court que l'écriture elle-même (1,3 Mo sérialisés puis
     posés dans localStorage, qui est synchrone) : le délai ne regroupait donc
     presque jamais deux gestes, et chaque coche d'épisode payait une écriture
     complète. À 800 ms, cocher une saison entière n'écrit qu'une fois. Les
     trois filets restent les mêmes : visibilitychange, pagehide et blur
     appellent `flushDB`, qui écrit sur-le-champ.
     Revue de stabilité du 02/08, constat A2-5. */
  saveTimer = setTimeout(()=>{ writeNow().catch(()=>{}); }, 800);
}
async function writeNow(){
  if(memoryOnly) return;
  /* Une seule traversée du graphe. Avant, il y en avait trois pour une même
     écriture : un `stringify` + un `parse` pour détacher la copie, puis un
     second `stringify` pour localStorage. Le texte sert aux deux, et c'est lui
     qu'on relit pour obtenir la copie détachée que réclame IndexedDB.
     Revue de stabilité du 02/08, constat A2-1. */
  const texte = JSON.stringify(db);
  /* Le miroir localStorage passe EN PREMIER : c'est la seule écriture synchrone,
     donc la seule qui aboutisse si iOS gèle l'app juste après un geste de fermeture.
     IndexedDB, plus lent mais sans limite de taille, suit. Le mode n'est annoncé
     qu'une fois les deux tentatives faites, pour ne jamais afficher un état
     intermédiaire pendant l'écriture. */
  let okLS = false, okIDB = false;
  try{ localStorage.setItem(KEY, texte); okLS = true; }catch(e){}
  try{ await idbSet(JSON.parse(texte)); okIDB = true; }catch(e){}
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
/* C8 — REVUE DU 07/08 : le filet `blur` est retiré. Il se déclenchait quand la
   bande-annonce prenait le focus, à chaque bannière de notification, à chaque
   bascule — et forçait une écriture synchrone de 1,3 Mo (111 ms mesurés) en
   plein milieu d'une interaction. `visibilitychange` et `pagehide` couvrent le
   vrai risque (iOS qui tue l'app en arrière-plan) : quand l'app disparaît de
   l'écran, l'un des deux se déclenche toujours ; `blur` seul — sans bascule —
   n'annonce aucune mise à mort. */

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
  /* C8 · point 5 (09/08) — LE DÉLAI MAXIMAL S'ARME TOUJOURS.
     Il ne s'armait QUE si l'appelant ne fournissait pas son propre signal :
     `if(!opt.signal)`. Or `chercherTitre` (app-12) en fournit toujours un — il
     lui sert à abandonner la recherche précédente quand on continue de taper.
     Autrement dit, l'écran de recherche, le seul où l'on attend vraiment une
     réponse, était le seul SANS délai maximal : sur un réseau qui s'effondre,
     le spinner tournait indéfiniment.
     On combine donc les deux plutôt que de choisir : abandon si l'appelant le
     demande, OU si les quinze secondes sont écoulées. Les deux causes sont
     réelles et n'ont aucune raison de s'exclure. */
  let minuteur = null, ctrl = null;
  if(typeof AbortController !== 'undefined'){
    ctrl = new AbortController();
    opt.signal = ctrl.signal;
    const sortie = extra && extra.signal;
    if(sortie){
      if(sortie.aborted) ctrl.abort();
      else sortie.addEventListener('abort', ()=>{ try{ ctrl.abort(); }catch(e){} }, { once:true });
    }
    minuteur = setTimeout(()=>{ try{ ctrl.abort(); }catch(e){} }, 15000);
  }else if(extra && extra.signal){
    opt.signal = extra.signal;      // navigateur sans AbortController : on ne perd pas l'existant
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
/* `base0` : la fiche de base quand l'appelant l'a déjà — l'aperçu vient de la
   charger, et on la redemandait au réseau juste après.
   Revue de stabilité du 02/08, constat A5-2. */
async function fetchShowFull(id, onStep, base0){
  const base = base0 || await tmdb('/tv/'+id);
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

/* ---------------------------------------------------------------------------
   Le registre de migrations — B7

   `db.v` existait depuis le début et n'était JAMAIS relu : les migrations
   étaient des contrôles de présence dispersés (ici, dans `migrerNotif`, dans
   `migrerGouts`, dans `boot`). Ça suffit pour AJOUTER un champ. Ça ne permet
   aucune transformation ponctuelle — et c'est ce qui bloquait l'allègement du
   format d'épisode (F5) autant que la réparation de la clé héritée.

   Deux règles à ne jamais enfreindre :
     — une migration livrée ne se modifie plus, on en ajoute une nouvelle ;
     — une base plus récente que le code n'est pas dégradée, elle est signalée.

   Les migrations dispersées restent où elles sont pour l'instant. Les déplacer
   ici doit se faire UNE PAR UNE, chacune avec son test : les rapatrier toutes
   dans la même livraison, c'est empiler les risques sur le démarrage.
--------------------------------------------------------------------------- */
const SCHEMA = 4;

const MIGRATIONS = {
  2: function(){
    /* La clé publiable a remplacé l'ancienne clé anon au format JWT. Une base
       qui a mémorisé l'ancienne (`eyJ…`) tombera en 401 sur TOUT — synchro,
       abonnements, notifications — le jour où Supabase coupe les anciennes
       clés, ce qu'ils poussent activement à faire. Et la seule issue serait le
       réglage caché derrière sept appuis sur le logo. */
    if(db.sync && /^eyJ/.test(db.sync.key || '')) db.sync = Object.assign({}, DEFAULT_SYNC);
  },
  3: function(){
    /* I8 + I9 — les réglages de notification.

       I9 : « Un résumé le soir » et « Le samedi » étaient proposés à l'écran et
       jamais implémentés côté serveur, qui saute purement et simplement toute
       personne dont `quand` ne vaut pas `sortie`. Les choisir n'espaçait pas
       les notifications, ça les éteignait — en silence, sous un écran qui
       affichait « Activées · 3 séries, 1 film ». On les ramène donc à `sortie`,
       et on le DIT une fois : quelqu'un qui a délibérément choisi un résumé
       doit comprendre pourquoi il reçoit à nouveau des alertes à l'unité.

       I8 : `{cine, stream, vod}` → `{cine, maison}`. Le pliage lui-même vit
       dans `normaliserFilmsNotif` (app-09) parce qu'il sert aussi à ce qui
       arrive par la synchro ; ici on ne fait que l'appeler.

       `db.notif` peut être absent : `migrer()` tourne AVANT `migrerNotif()`.
       Une migration ne doit jamais compter sur ce qui vient après elle. */
    const n = db.notif;
    if(!n || typeof n !== 'object') return;
    if(n.quand && n.quand !== 'sortie'){
      n.quand = 'sortie';
      /* Lu et effacé au démarrage suivant, une seule fois. */
      n.reprisI9 = true;
    }
    if(typeof normaliserFilmsNotif === 'function') normaliserFilmsNotif(n.films);
  },
  4: function(){
    /* C4 (09/08) — LES DATES PAR SOUS-BLOC DE `db.gouts`.

       Une base existante ne porte qu'une date globale, `maj`. On la recopie
       telle quelle sur chacun des sept sous-blocs : c'est la seule lecture
       honnête de ce qu'on sait — « à cet instant, tout le bloc était à jour ».

       Sans elle, `majBlocs` serait vide et TOUS les blocs vaudraient zéro : le
       premier distant rencontré, même bien plus ancien, gagnerait sur chacun
       d'eux et écraserait des réglages parfaitement frais. C'est exactement la
       perte que ce correctif est censé empêcher, retournée dans l'autre sens.

       Une transformation ponctuelle : sa place est ici, dans le registre, et
       pas dans `migrerGouts` qui ne fait que garantir des présences (§B7).
       `db.gouts` peut être absent — `migrer()` tourne AVANT `migrerGouts()`. */
    const g = db.gouts;
    if(!g || typeof g !== 'object') return;
    if(g.majBlocs && typeof g.majBlocs === 'object' && !Array.isArray(g.majBlocs)) return;
    const t = Number(g.maj) || 0;
    g.majBlocs = {};
    Object.keys(GOUT_BLOCS).forEach(nom=>{ g.majBlocs[nom] = t; });
  }
};

/* Remise en forme de la base LOCALE. Distincte des migrations numérotées : une
   migration corrige un passage de version, ceci répare des anomalies qui
   peuvent apparaître à n'importe quelle version — un export bricolé à la main,
   une écriture interrompue, une vieille sauvegarde réimportée bien plus tard.
   Elle tourne donc à CHAQUE lancement, et elle doit rester idempotente et
   sans allocation inutile : elle passe sur toute la base d'Adrien (103 séries,
   8 600 épisodes) avant le premier rendu.
   `normaliserSerie` fait le même travail pour ce qui ARRIVE du distant ; ici
   c'est pour ce qui SORT du stockage local, que rien ne normalisait avant. */
/* LOT A — la forme des trois clés du signal d'appréciation.
   Elle est posée ICI et non dans une migration numérotée : ce sont des clés
   AJOUTÉES, pas une transformation de format, et le registre lui-même dit qu'un
   simple contrôle de présence suffit pour ça. Surtout, `reparerBase` tourne à
   chaque lancement — donc aussi sur une base arrivée d'un autre appareil, ou
   d'un export réimporté, où la clé peut manquer sans que `db.v` l'avoue.

   Un avis dont le `v` ne vaut ni 1 ni -1 est retiré plutôt que corrigé : on ne
   devine pas si quelqu'un a aimé. */
function reparerAvis(){
  let n = 0;
  if(!db.avis || typeof db.avis !== 'object'){ db.avis = {}; n++; }
  ['tv','movie'].forEach(m=>{
    if(!db.avis[m] || typeof db.avis[m] !== 'object'){ db.avis[m] = {}; n++; return; }
    Object.keys(db.avis[m]).forEach(id=>{
      const a = db.avis[m][id];
      /* POINT 2 — LE CONTRAT DE DONNÉES EST ROUVERT, EXPLICITEMENT.
         Il disait `v: 1 | -1` ; il dit désormais `v: 1 | 0 | -1`. Le 0 est le
         🤷 : « je l'ai vu, il ne m'a rien fait, ne me le redemande pas ». Ce
         n'est PAS l'absence d'avis — l'absence, c'est l'absence de la clé.
         Sans cette ligne, un 🤷 posé le soir était EFFACÉ au lancement suivant
         et la question revenait : `reparerAvis` tourne à chaque démarrage.
         Une base ANCIENNE n'en est pas déplacée : elle ne contient que des 1 et
         des -1, qui restent valides à l'identique. Et une base NEUVE lue par
         une version ANCIENNE perdrait ses 🤷 — c'est le prix d'un retour en
         arrière, il est borné à ce seul champ et il est assumé. */
      if(!a || (a.v !== 1 && a.v !== 0 && a.v !== -1)){ delete db.avis[m][id]; n++; return; }
      if(typeof a.quand !== 'number'){ a.quand = 0; n++; }
    });
  });
  if(!db.podium || typeof db.podium !== 'object'){ db.podium = {}; n++; }
  ['film','serie','anime'].forEach(f=>{
    if(!Array.isArray(db.podium[f])){ db.podium[f] = []; n++; }
    else if(db.podium[f].length > PODIUM_MAX){ db.podium[f] = db.podium[f].slice(0, PODIUM_MAX); n++; }
  });
  if(typeof db.podium.maj !== 'number'){ db.podium.maj = 0; n++; }
  /* R1 · point 11 — LA MIGRATION DU CLASSEMENT GLOBAL.
     `db.classement` est la nouvelle source de vérité du duel : le score de
     chaque titre (`s`) et le nombre de duels qu'il a réellement joués (`n`).
     `db.podium` en devient une projection, mais il N'EST JAMAIS DÉTRUIT ici :
     quelqu'un qui a déjà un podium le garde tel quel, son classement démarre
     vide et se remplit à sa prochaine partie.
     Posée dans `reparerAvis` et non dans une migration numérotée, pour la même
     raison que les trois clés du lot A : ce sont des clés AJOUTÉES, et ceci
     tourne à chaque lancement — donc aussi sur une base arrivée d'un autre
     appareil, où la clé peut manquer sans que `db.v` l'avoue. */
  if(!db.classement || typeof db.classement !== 'object'){ db.classement = {}; n++; }
  ['film','serie','anime'].forEach(f=>{
    if(!db.classement[f] || typeof db.classement[f] !== 'object'){ db.classement[f] = {}; n++; return; }
    Object.keys(db.classement[f]).forEach(id=>{
      const e = db.classement[f][id];
      /* Une entrée sans score n'est pas réparable : on ne devine pas un
         classement. Un compteur de duels absent ou aberrant, si — il vaut zéro,
         et le titre reste simplement hors du podium jusqu'à ce qu'il joue. */
      if(!e || typeof e !== 'object' || typeof e.s !== 'number' || !isFinite(e.s)){
        delete db.classement[f][id]; n++; return;
      }
      if(typeof e.n !== 'number' || !isFinite(e.n) || e.n < 0){ e.n = 0; n++; }
      else if(e.n !== Math.floor(e.n)){ e.n = Math.floor(e.n); n++; }
    });
  });
  if(typeof db.classement.maj !== 'number'){ db.classement.maj = 0; n++; }
  /* Les avis effacés. Même mécanique que `unwatched` pour les épisodes : sans
     trace, un 👎 repris ici reviendrait à la première synchro avec un appareil
     resté en arrière, qui le croit toujours posé. Elles s'effacent seules au
     bout de trois mois, comme les décochages. */
  if(!db.avisRetires || typeof db.avisRetires !== 'object'){ db.avisRetires = {}; n++; }
  ['tv','movie'].forEach(m=>{
    if(!db.avisRetires[m] || typeof db.avisRetires[m] !== 'object'){ db.avisRetires[m] = {}; n++; return; }
    const t = Date.now();
    Object.keys(db.avisRetires[m]).forEach(id=>{
      if(t - (db.avisRetires[m][id] || 0) > RETENTION_DECOCHE){ delete db.avisRetires[m][id]; n++; }
    });
  });
  return n;
}
/* Dix au plus, comme le dit le contrat de données du lot. Au-delà, ce n'est
   plus un podium : c'est un classement, et le duel a explicitement renoncé à
   en produire un. */
const PODIUM_MAX = 10;

function reparerBase(){
  let n = reparerAvis();
  if(!db.shows || typeof db.shows !== 'object'){ db.shows = {}; n++; }
  if(!db.movies || typeof db.movies !== 'object'){ db.movies = {}; n++; }
  Object.values(db.shows).forEach(s=>{
    if(!s || typeof s !== 'object') return;
    if(!s.watched || typeof s.watched !== 'object'){ s.watched = {}; n++; }
    if(!s.seasons || typeof s.seasons !== 'object'){ s.seasons = {}; n++; }
    /* Les toutes premières versions nommaient l'image d'épisode « s » au lieu de « st ». */
    Object.values(s.seasons).forEach(eps=>{
      if(!Array.isArray(eps)) return;
      eps.forEach(ep=>{
        if(ep && ep.st === undefined && typeof ep.s === 'string' && ep.s.charAt(0) === '/'){
          ep.st = ep.s; delete ep.s; n++;
        }
      });
    });
  });
  /* C3 (09/08) — la trace de décochage d'un film s'efface d'elle-même au bout
     de trois mois, exactement comme celle d'un épisode (`unwatched`, purgée
     dans `noterDecoches` et dans la fusion). Ici plutôt que dans
     `dernierGesteFilm`, qui doit rester pure : sans ce ménage, la trace
     resterait dans l'envoi au serveur pour toujours. */
  const t = Date.now();
  Object.values(db.movies).forEach(m=>{
    if(!m || typeof m !== 'object') return;
    if(m.unseenAt !== undefined &&
       (typeof m.unseenAt !== 'number' || t - m.unseenAt > RETENTION_DECOCHE)){
      delete m.unseenAt; n++;
    }
  });
  return n;
}

function migrer(){
  let v = Number(db.v) || 1;
  if(v > SCHEMA){
    /* Base écrite par une version plus récente de l'app — deux appareils, un
       seul mis à jour. On ne touche à rien et on le dit, plutôt que de
       dégrader en silence des données qu'on ne sait pas lire. */
    db.schemaTropRecent = true;
    return;
  }
  db.schemaTropRecent = false;
  /* Avant les migrations, pas après : une migration doit pouvoir compter sur
     une base de forme correcte. */
  const repare = reparerBase();
  if(v === SCHEMA){
    if(db.v !== SCHEMA){ db.v = SCHEMA; saveDB(); }   // version implicite, on l'écrit
    else if(repare) saveDB();                        // rien à migrer, mais on a réparé
    return;
  }
  /* On inscrit la version de départ AVANT de tenter quoi que ce soit : si la
     première migration échoue, `db.v` doit valoir la dernière version réussie
     et non rester absent — sinon on retenterait depuis le début à chaque
     lancement, indéfiniment. */
  db.v = v;
  while(v < SCHEMA){
    v++;
    try{ if(MIGRATIONS[v]) MIGRATIONS[v](); }
    catch(e){
      /* Une migration qui échoue ne doit pas empêcher l'app de s'ouvrir. On
         s'arrête à la dernière version réussie ; la suivante retentera. */
      console.error('migration ' + v + ' en échec', e);
      break;
    }
    db.v = v;
  }
  saveDB();
}

/* ---------------------------------------------------------------------------
   Normalisation de ce qui entre par la synchro

   `mergeRemote` recopiait les objets distants tels quels : confiance totale
   dans ce qu'un autre appareil a écrit. Tant que tout le monde a le même
   format, ça marche. Le jour où le format change (F5), un appareil resté en
   arrière resynchroniserait l'ancien format par-dessus, indéfiniment.

   Pour l'instant ces deux fonctions ne font que garantir la présence des clés
   attendues. Elles existent pour être LE point d'accroche du jour où le format
   bougera : tout ce qui entre passe par ici, et par ici seulement.
--------------------------------------------------------------------------- */
function normaliserSerie(rs, local){
  if(!rs || typeof rs !== 'object') return null;
  const s = Object.assign({}, rs);
  if(!s.watched || typeof s.watched !== 'object') s.watched = {};
  if(!s.seasons || typeof s.seasons !== 'object') s.seasons = {};
  /* Les vignettes d'épisode sont retéléchargeables : le jour où elles sortiront
     du payload (F5), l'absence côté distant ne doit pas effacer ce qu'on a. */
  if(local && local.seasons){
    Object.keys(s.seasons).forEach(n=>{
      const ici = local.seasons[n];
      if(!Array.isArray(ici) || !Array.isArray(s.seasons[n])) return;
      s.seasons[n] = s.seasons[n].map(ep=>{
        if(ep && ep.st) return ep;
        const jumeau = ici.find(x=> x && x.e === ep.e);
        return (jumeau && jumeau.st) ? Object.assign({}, ep, { st: jumeau.st }) : ep;
      });
    });
  }
  return s;
}
function normaliserFilm(rm){
  if(!rm || typeof rm !== 'object') return null;
  return Object.assign({}, rm);
}

/* ============================ Synchronisation ============================ */
/* Sauvegarde en ligne via Supabase : chaque utilisateur possède une ligne unique
   contenant l'ensemble de ses données. Les appareils fusionnent au lieu d'écraser. */

const TABLE = 'mes_series';
let syncing = false, syncTimer = null, syncState = 'off', syncError = '';

const syncReady = ()=> !!(db.sync && db.sync.url && db.sync.key);
const signedIn  = ()=> !!(db.auth && db.auth.token && db.auth.uid);
const sbBase    = ()=> String(db.sync.url).replace(/\/+$/,'');

/* B3 — sans délai maximal, un réseau qui répond « peut-être » (portail captif,
   wifi d'hôtel, 4G qui s'effondre) laisse la requête pendante POUR TOUJOURS.
   `syncing` reste vrai, `scheduleSync` sort immédiatement, et il n'y a plus
   une seule synchronisation pour le reste de la session — pendant que l'écran
   Compte affiche un rond qui tourne. Le même garde-fou existait déjà côté
   TMDB depuis le début ; il manquait ici.

   45 s et non 20 : une synchro transporte aujourd'hui environ 1,4 Mo dans
   chaque sens, et 20 s ferait échouer des transferts parfaitement sains sur un
   réseau lent. À redescendre à 20 s une fois le payload allégé (F5). */
const SB_TIMEOUT = 45000;

async function sbFetch(path, opt, retry){
  opt = opt || {};
  const h = Object.assign({ apikey: db.sync.key, 'Content-Type':'application/json' }, opt.headers||{});
  if(signedIn() && !opt.noAuth) h.Authorization = 'Bearer ' + db.auth.token;
  const ctrl = new AbortController();
  const minuteur = setTimeout(()=>ctrl.abort(), SB_TIMEOUT);
  let r;
  try{
    r = await fetch(sbBase()+path, Object.assign({}, opt, {headers:h, signal:ctrl.signal}));
  }catch(e){
    /* `AbortError` ne dit rien à personne : on nomme la cause ici, une fois,
       pour que l'écran n'ait pas à la deviner. */
    if(e && e.name === 'AbortError'){
      const err = new Error('DELAI'); err.delai = true; throw err;
    }
    throw e;
  }finally{
    clearTimeout(minuteur);
  }
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

/* ---------------------------------------------------------------------------
   C8 · point 3 — UN SEUL RAFRAÎCHISSEMENT À LA FOIS

   Au démarrage, quatre appels partent EN PARALLÈLE (`boot`, app-08) :
   `syncNow`, `majProfil`, `chargerPartage`, `inscrireSiBesoin`. Jeton expiré,
   et les quatre reçoivent un 401 à quelques millisecondes d'intervalle : quatre
   `sbRefresh()` partaient avec LE MÊME jeton de rafraîchissement. Or Supabase
   fait tourner ces jetons — le premier appel invalide celui que les trois
   autres tiennent encore en main. Résultat : trois `invalid_grant`, et selon
   l'ordre d'arrivée, une session perdue au démarrage sans que rien ne l'ait
   demandé.

   Une seule promesse partagée : le premier 401 lance le rafraîchissement, les
   suivants attendent CELUI-LÀ. Remise à `null` dans un `finally`, sinon un
   échec figerait la promesse ratée pour le reste de la session.

   C8 · point 4 — LA SESSION ZOMBIE. Quand le rafraîchissement échoue
   DÉFINITIVEMENT — jeton révoqué, mot de passe changé ailleurs, compte
   supprimé sur un autre appareil — `db.auth` restait posé. L'app se croyait
   connectée : chaque synchro affichait « erreur 401 », l'écran Compte montrait
   une adresse e-mail, et rien, nulle part, ne proposait de se reconnecter. On
   distingue donc les deux causes d'échec :
     · réseau ou serveur indisponible → on garde la session, ça repartira ;
     · le serveur REFUSE le jeton (400/401/403) → la session est morte, on la
       retire et on le dit.
   Confondre les deux déconnecterait quelqu'un qui passe sous un tunnel.
--------------------------------------------------------------------------- */
let refreshEnCours = null;

function sbRefresh(){
  if(refreshEnCours) return refreshEnCours;
  refreshEnCours = (async ()=>{
    try{
      const d = await sbFetch('/auth/v1/token?grant_type=refresh_token', {method:'POST', noAuth:true,
        body: JSON.stringify({refresh_token: db.auth && db.auth.refresh})});
      await applySession(d);
      return true;
    }catch(e){
      const st = e && e.status;
      const brut = String((e && e.message) || '');
      const refus = st === 400 || st === 401 || st === 403 ||
                    /invalid_grant|invalid refresh|not found|expired/i.test(brut);
      if(refus) sessionExpiree();
      return false;
    }finally{
      refreshEnCours = null;
    }
  })();
  return refreshEnCours;
}

/* La session est morte pour de bon. On la retire — sans quoi l'app continuerait
   de se croire connectée — et on le DIT une seule fois : un bandeau qui reste,
   plutôt qu'un toast qui passe pendant qu'on regarde ailleurs. */
function sessionExpiree(){
  if(!db.auth) return;
  db.auth = null;
  syncState = 'off';
  db.sessionExpiree = true;
  saveDB();
  if(typeof toast === 'function') toast('Session expirée — reconnecte-toi');
  if(typeof render === 'function') render();
}

/* ---------------------------------------------------------------------------
   C2 (09/08) — ON NE RETIRE PLUS UNE BIBLIOTHÈQUE SANS LE DEMANDER

   `adopterCompte` effaçait sans un mot, et sans rien tenter pour sauver ce qui
   n'était pas encore parti au serveur. Deux gestes, dans cet ordre :

   (a) CE QUI N'EST PAS SYNCHRONISÉ PART D'ABORD, sous l'ANCIENNE session —
       celle du propriétaire de la bibliothèque, pas celle de la personne qui
       arrive. C'est le seul instant où c'est encore possible : trois lignes
       plus bas, le jeton est remplacé et cette dernière soirée de cochage
       n'existe plus nulle part. Session absente ou expirée : on passe. On n'a
       alors rien à pousser, et bloquer la connexion pour autant ne rendrait
       service à personne.

   (b) PUIS ON DEMANDE. Et on demande AVANT d'endosser la nouvelle session, pas
       après : répondre « Annuler » doit laisser l'appareil exactement comme il
       était — même compte connecté (aucun), même bibliothèque, même propriétaire.
       C'est pour ça que la question est posée ici et non dans `adopterCompte` :
       à l'intérieur, `db.auth` est déjà celui du nouveau et il faudrait défaire.

   La feuille de confirmation vit dans app-02, chargé APRÈS ce fichier : d'où la
   garde `typeof`. Si elle manque, on REFUSE le changement plutôt que d'effacer
   sans avoir pu demander. Le pire cas devient « la connexion n'aboutit pas »,
   jamais « la bibliothèque a disparu ».
--------------------------------------------------------------------------- */
async function preparerChangementDeProprio(ancienne){
  if(ancienne && ancienne.token && ancienne.uid && syncReady()){
    /* `syncNow` avale déjà ses propres erreurs ; le `try` est là pour ce qui
       pourrait sortir d'ailleurs (sérialisation, stockage). Un échec n'empêche
       pas de poser la question : on ne bloque pas quelqu'un sur un réseau mort. */
    try{ await syncNow(true); }catch(e){}
  }
  if(typeof confirmerDansFeuille !== 'function') return false;
  return confirmerDansFeuille(
    'Cette bibliothèque appartient à un autre compte',
    'Elle va être retirée de cet appareil. Elle reste sur le compte d\'origine, '
    + 'et lui reviendra telle quelle à sa prochaine connexion.',
    'Continuer', 'Annuler');
}

async function applySession(d){
  if(!d || !d.access_token) throw new Error('réponse inattendue du serveur');
  const uid = (d.user&&d.user.id) || (db.auth&&db.auth.uid);
  /* C2 — la session de l'ancien propriétaire, lue AVANT d'être remplacée.
     Passée telle quelle plutôt que relue là-bas : à l'instant où la question
     se pose, elle n'existe plus que dans cette variable. */
  const ancienne = db.auth;
  if(db.proprio && uid && db.proprio !== uid){
    if(!(await preparerChangementDeProprio(ancienne))){
      /* Refus. Rien n'a été touché — ni `db.auth`, ni la base. On le dit par
         une erreur reconnaissable plutôt que par un retour vide : les deux
         écrans de connexion doivent pouvoir distinguer « refusé » de
         « mot de passe incorrect », et ne surtout pas continuer leur parcours
         comme si la connexion avait abouti. */
      const err = new Error('ANNULE'); err.annule = true; throw err;
    }
  }
  db.auth = { token:d.access_token, refresh:d.refresh_token,
              uid: uid, email:(d.user&&d.user.email)||(db.auth&&db.auth.email) };
  /* C8 — une session valide efface la marque « session expirée » : le bandeau
     n'a plus de raison d'être, et le laisser serait pire que ne rien afficher. */
  if(typeof oublierSessionExpiree === 'function') oublierSessionExpiree();
  else delete db.sessionExpiree;
  adopterCompte(db.auth.uid);
  saveDB();
  return db.auth;
}

/* À qui appartient la bibliothèque posée sur cet appareil.
   Se déconnecter ne l'efface pas — elle redevient simplement invisible, et
   revient telle quelle à la reconnexion. Mais si quelqu'un d'autre se connecte
   ici, elle n'a rien à faire dans son compte : on repart de zéro.
   Les suppressions ne sont surtout PAS tracées dans ce cas — elles se
   propageraient au nouveau compte et lui effaceraient ses propres titres.

   C2 (09/08) — CETTE FONCTION N'EFFACE PLUS DE SA PROPRE AUTORITÉ. Quand elle
   est appelée avec un effacement à la clé, la question a déjà été posée et la
   réponse est oui : le portier est `applySession`, juste au-dessus. Elle reste
   silencieuse dans le seul cas où il n'y a rien à demander — `db.proprio` vide,
   c'est-à-dire le premier compte posé sur cet appareil.

   C1 (09/08) — « ZÉRO » VOULAIT DIRE « LES TITRES », ET RIEN D'AUTRE.
   Seuls `shows`, `movies`, `deleted` et `syncedAt` étaient effacés. Tout le
   reste du patrimoine de la personne précédente survivait au changement de
   compte, et repartait au serveur du NOUVEAU compte à la première synchro :
   ses pouces (`avis`), ses effacements de pouces (`avisRetires`), ses goûts,
   son podium, son classement, son pseudo, son avatar, ses cloches.

   Ce n'était pas seulement une trace inerte. Trois conséquences constatées :
     · l'inscription du nouveau lisait `db.avis` sans filtre (`inscNbAimes`,
       app-13) et lui pré-remplissait un profil avec les goûts de l'ancien ;
     · `if(inscNbAimes()) g.amorcageFait = true;` (app-13) lui retirait la
       grille d'amorçage à cause d'avis qui n'étaient pas les siens ;
     · `inscrireSiBesoin()` → `pousserCloches()` téléversait les cloches de
       l'ancien sous l'identifiant du nouveau — qui recevait donc des alertes
       pour des séries qu'il n'a jamais suivies.

   La liste ci-dessous est calée sur `payload()` : TOUT ce qui monte au serveur
   et qui appartient à la personne doit y figurer. Ce qui appartient à
   l'APPAREIL (`lang`, `sync`, `notif.abo`, `astuce*`, `vuPresentation`) reste
   en place — changer de compte ne change pas de téléphone.

   Rien n'est perdu pour autant : ces données sont sur le serveur de leur
   propriétaire, et lui reviennent telles quelles à sa reconnexion.

   ATTENTION À L'ORDRE. `nettoyerCloches()` DOIT venir après l'effacement :
   appelée avant, elle verrait une bibliothèque vide et une liste de cloches
   pleine, et poserait une pierre tombale datée sur chacune — pierres qui
   partiraient ensuite éteindre les cloches de l'ancien sur SES appareils. */
function adopterCompte(uid){
  if(!uid) return;
  if(db.proprio && db.proprio !== uid){
    db.shows = {}; db.movies = {};
    db.deleted = { shows:{}, movies:{} };
    db.syncedAt = null;
    /* Le signal d'appréciation et ses pierres tombales. */
    db.avis = { tv:{}, movie:{} };
    db.avisRetires = { tv:{}, movie:{} };
    /* Les goûts, le podium et le classement : vidés, puis reformés juste en
       dessous par `reparerBase()` et `migrerGouts()`. On ne recopie pas leur
       forme vierge à la main ici — elle a déjà changé trois fois, et deux
       copies auraient divergé au premier champ ajouté.
       `{}` et non `null` (relecture du 09/08) : `migrerGouts` vit dans app-11
       et l'appel est donc gardé par un `typeof`. Si le fichier manquait, le
       garde avalerait en silence et `db.gouts` resterait NUL — le premier
       rendu de Découvrir planterait, ce qui n'arrivait pas avant ce correctif.
       Un objet vide rend ce pire cas inoffensif, et les trois fonctions de
       remise en forme le traitent exactement comme un `null`. */
    db.gouts = {};
    db.podium = {};
    db.classement = {};
    /* L'identité affichée aux proches. `db.profil` est le seul de la liste qui
       ne se reforme PAS tout seul : sa forme vierge est posée par `loadDB`,
       qui ne retournera pas avant le prochain démarrage. D'où la fabrique
       `profilVierge()`, partagée avec `loadDB` et la base neuve — plutôt
       qu'une troisième copie du littéral. */
    db.pseudo = '';
    db.profil = profilVierge();
    /* Les annonces « X t'a ajouté » écartées : un choix qui appartient à la
       personne, et qui monte au serveur (`payload`). */
    db.abosIgnores = {};
    /* LES NOTIFICATIONS — RELECTURE DU 09/08, ET C'EST LE POINT QUI MANQUAIT.
       La première version n'effaçait que `titres` et `titresOff`, en tenant le
       reste du bloc pour de l'état d'appareil. C'était faux : `quand`,
       `quandChoisi`, `films` et `maj` montent au serveur par DEUX voies —
       `notifPourSynchro()` dans `payload()`, et le POST de `pousserCloches()`
       vers `push_reglages`, qui est PRÉCISÉMENT le chemin que le commentaire
       de C1 désignait comme fautif. Les réglages d'A partaient donc sous
       l'identifiant de B ; pire, `maj` gardait la date d'A, et
       `fusionnerNotif` arbitre dessus : si A avait réglé plus récemment, les
       réglages de B ne redescendaient même pas, et ceux d'A se propageaient
       ensuite à TOUS les appareils de B.

       On inverse donc la règle : on ne retire plus une liste de champs, on ne
       GARDE que ceux de l'appareil, et `migrerNotif()` reforme le reste juste
       en dessous. Un champ ajouté demain part par défaut, ce qui est le bon
       défaut.

       Ce qui reste, et pourquoi :
         `abo`       — l'abonnement push obtenu du navigateur. Il décrit CE
                       navigateur ; à quel compte il sonne se règle côté
                       serveur (C7).
         `actif`     — dit la même chose qu'`abo` et doit rester d'accord avec
                       lui : à `false` avec un `abo` valide, l'écran annoncerait
                       « désactivées » alors que `inscrireSiBesoin` ne
                       réinscrit rien (l'abonnement n'a pas changé).
         `erreur`    — pourquoi la dernière inscription DE CET APPAREIL a raté.
         `clocheVue` — l'étiquette « Me prévenir » ne se montre qu'une fois par
                       installation. Ne monte pas au serveur.
       Partent avec le reste : `desyncAt` / `desyncMotif`, qui décrivent un
       envoi raté sous le compte d'A — les laisser afficherait à B un avis de
       panne qui ne le concerne pas. */
    if(db.notif && typeof db.notif === 'object'){
      const n = db.notif;
      db.notif = { abo: n.abo, actif: n.actif, erreur: n.erreur, clocheVue: n.clocheVue };
    }
    /* Un parcours d'inscription abandonné par l'ancien : sans ça, le nouveau
       compte est dérouté au démarrage suivant vers un questionnaire qui n'est
       pas le sien (`reprendreInscription`, app-08). */
    delete db.inscription;
    /* Remise en forme canonique de ce qu'on vient de vider. Trois fonctions,
       chacune propriétaire de son bloc — on ne réécrit pas leurs valeurs par
       défaut ici. Les gardes `typeof` parce qu'elles vivent dans app-11 et
       app-09, chargés APRÈS app-01. `migrerNotif()` remet notamment `maj` à 0,
       ce qui laisse gagner l'arbitrage à ce que B a déjà sur le serveur. */
    reparerBase();
    if(typeof migrerGouts === 'function') migrerGouts();
    if(typeof migrerNotif === 'function') migrerNotif();
  }
  /* C1 · point 3 — le ménage des cloches tournait UNIQUEMENT au démarrage
     (`boot`, app-08). Or on vient peut-être de vider la bibliothèque, et une
     connexion n'est pas un démarrage : sans cet appel, `pousserCloches()`
     — déclenché juste après par `inscrireSiBesoin()` — enverrait au serveur
     des cloches sans titre en face. Hors effacement, l'appel est un simple
     ménage de plus, idempotent et sans écriture propre (`applySession`
     enregistre juste après). */
  if(typeof nettoyerCloches === 'function' && db.notif && db.notif.titres) nettoyerCloches();
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

/* ---------------------------------------------------------------------------
   C3 (09/08) — LES FILMS N'AVAIENT PAS DE DÉCOCHAGE DATÉ

   Les épisodes en ont un depuis toujours (`unwatched`, juste au-dessus). Les
   films, non : démarquer posait `seen = false, watchedAt = null`, et la fusion
   tranchait sur `watchedAt` seul —

       if((rm.watchedAt||0) > (lm.watchedAt||0)) db.movies[rm.id] = rm;

   — c'est-à-dire 0 contre la date de l'autre appareil, qui croit toujours le
   film vu. Le distant gagnait DONC TOUJOURS : le film redevenait « vu » à la
   synchro suivante, sur tous les appareils, et le geste était annulé en
   silence. Il n'y avait aucune manière de le démarquer durablement.

   La correction tient en une idée : ce qui arbitre n'est pas « quand l'ai-je
   vu », c'est « quand ai-je touché ce film pour la dernière fois ». Cocher et
   décocher sont deux événements de même rang, et le plus récent gagne.

   MÊME RÉTENTION QUE LES ÉPISODES, et pour la même raison : une trace de
   décochage ne peut pas vivre éternellement dans un envoi de 1,4 Mo. Passé
   trois mois elle ne compte plus. La conséquence est assumée et connue — un
   appareil resté hors ligne plus de trois mois peut encore ressusciter un
   film démarqué. C'est le contrat déjà en vigueur pour `unwatched`.
--------------------------------------------------------------------------- */
function marquerFilm(m, vu){
  if(!m || typeof m !== 'object') return m;
  const t = Date.now();
  m.seen = !!vu;
  if(vu){
    m.watchedAt = t;
    /* La trace de décochage n'a plus lieu d'être : le geste inverse vient
       d'être posé, et la laisser ferait gagner un vieux décochage sur ce
       cochage-ci à la fusion suivante. */
    delete m.unseenAt;
  }else{
    m.watchedAt = null;
    m.unseenAt = t;
  }
  return m;
}
/* L'instant du dernier geste posé sur un film, cochage ou décochage confondus.
   PURE, et sans effet de bord sur l'objet : la rétention est appliquée à la
   lecture, l'effacement du champ périmé revient à `reparerBase`. */
function dernierGesteFilm(m){
  if(!m || typeof m !== 'object') return 0;
  const vu = Number(m.watchedAt) || 0;
  const dec = Number(m.unseenAt) || 0;
  return Math.max(vu, (dec && Date.now() - dec > RETENTION_DECOCHE) ? 0 : dec);
}

/* --- Fusion : on ne perd jamais un épisode coché, et les suppressions se propagent --- */
/* Ce qui monte au serveur — LISTE BLANCHE, et rien d'autre.
   Chaque exclusion a une raison, écrite ici : c'est ce qui doit empêcher le
   prochain champ ajouté à `db` d'y atterrir au hasard.

   Exclus volontairement :
     `auth`   — jetons de session. Ils n'ont rien à faire ailleurs que sur
                l'appareil qui les a obtenus, et ils sont déjà bannis de
                l'export pour la même raison (A2).
     `sync`   — adresse et clé du projet. Publiables, mais propres à
                l'installation ; les envoyer n'a aucun sens.
     `v`, `schemaTropRecent` — état du schéma LOCAL. Chaque appareil migre le
                sien ; recevoir la version d'un autre le ferait mentir.
     `syncDernierEchec`, `lastExport`, `astuceGlis`, `astuceCloche`
              — mémoire d'écran, propre à l'appareil.
     `proprio` — à quel compte appartient CETTE base. Local par définition. */
function payload(){
  return { lang: db.lang, pseudo: db.pseudo, shows: db.shows, movies: db.movies,
           deleted: db.deleted || {shows:{},movies:{}},
           /* Les cloches suivent la bibliothèque : changer de téléphone ne
              doit pas obliger à les rallumer une par une. */
           notif: (typeof notifPourSynchro === 'function') ? notifPourSynchro() : null,
           /* B8 — les goûts et l'avatar suivaient l'appareil et non le compte :
              changer de téléphone perdait genres, acteurs et couleur, pendant
              que les proches continuaient de voir l'ancien avatar (il vit dans
              la table `profils`, lui). Arbitrés par `maj` à la réception. */
           gouts:  db.gouts  || null,
           profil: db.profil || null,
           /* LOT A — le signal d'appréciation. Il monte au serveur pour la même
              raison que les épisodes vus : c'est du patrimoine, pas un réglage.
              Quelqu'un qui change de téléphone ne doit pas avoir à redire ce
              qu'il a aimé. Et à la différence des goûts, ces trois-là ne se
              remplacent pas en bloc — voir `mergeRemote`. */
           avis:        db.avis        || { tv:{}, movie:{} },
           avisRetires: db.avisRetires || { tv:{}, movie:{} },
           podium:      db.podium      || null,
           /* R1 · point 11 — le classement global. C'est du patrimoine au sens
              le plus strict : il accumule le travail de plusieurs mois de
              duels, alors que le podium n'en est que le sommet recalculé. Il
              monte donc au serveur, et il se fusionne titre par titre — voir
              `fusionnerClassement`. */
           classement:  db.classement  || null,
           /* CORRECTION C4 — les annonces « X t'a ajouté » qu'on a ignorées.
              C'est un choix qui appartient à la PERSONNE, pas au téléphone :
              écarter l'annonce sur le mobile puis retrouver la même sur la
              tablette est exactement le genre de détail qui apprend à ignorer
              les rappels. Fusionné à la réception — voir
              `fusionnerAbosIgnores`, jamais remplacé en bloc. */
           abosIgnores: db.abosIgnores || {} };
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
  Object.values(rem.shows||{}).forEach(brut=>{
    if(!brut || brut.id == null) return;
    if(del.shows[brut.id] && del.shows[brut.id] > (brut.addedAt||0)) return;   // supprimée ici après coup
    const ls = db.shows[brut.id];
    /* TOUT ce qui entre passe par le normaliseur, jamais directement dans `db` :
       c'est le seul point où l'on peut réparer un format qui aura changé. */
    const rs = normaliserSerie(brut, ls);
    if(!rs) return;
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
  Object.values(rem.movies||{}).forEach(brut=>{
    if(!brut || brut.id == null) return;
    if(del.movies[brut.id] && del.movies[brut.id] > (brut.addedAt||0)) return;
    const rm = normaliserFilm(brut);
    if(!rm) return;
    const lm = db.movies[rm.id];
    if(!lm){ db.movies[rm.id] = rm; changed = true; return; }
    /* C3 — le geste le plus récent gagne, qu'il soit un cochage ou un
       décochage. `>` et non `>=` : à égalité parfaite on garde le local, comme
       partout ailleurs dans cette fusion. */
    if(dernierGesteFilm(rm) > dernierGesteFilm(lm)){ db.movies[rm.id] = rm; changed = true; }
  });
  /* suppressions distantes à appliquer localement */
  ['shows','movies'].forEach(k=>{
    Object.keys(del[k]).forEach(id=>{
      const it = db[k][id];
      if(it && del[k][id] > (it.addedAt||0)){ delete db[k][id]; changed = true; }
    });
  });
  if(!db.pseudo && rem.pseudo){ db.pseudo = rem.pseudo; changed = true; }
  /* B8 — les préférences suivent le compte, pas l'appareil.
     C4 (09/08) — et elles se fusionnent maintenant SOUS-BLOC PAR SOUS-BLOC. */
  if(fusionnerGouts(rem)) changed = true;
  if(rem.profil && (rem.profil.maj||0) > ((db.profil||{}).maj||0)){
    db.profil = rem.profil; changed = true;
  }
  if(fusionnerAvis(rem)) changed = true;
  if(fusionnerClassement(rem)) changed = true;
  if(fusionnerAbosIgnores(rem)) changed = true;
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
/* ---------------------------------------------------------------------------
   LOT A — la fusion du signal d'appréciation

   Trois pièces, trois règles différentes, et c'est voulu :

   · `avis` se fusionne TITRE PAR TITRE. Chaque avis porte sa propre date, et
     c'est elle qui tranche. Remplacer le bloc en entier — comme on le fait pour
     `gouts`, qui est un réglage — perdrait tous les pouces posés sur le
     téléphone resté en arrière. Un avis est du patrimoine : deux appareils qui
     ont chacun noté dix titres différents doivent finir avec vingt avis.

   · `avisRetires` porte les avis EFFACÉS, avec leur date. Sans cette trace, un
     👎 repris dans « Écartés » reviendrait à la première synchro : l'autre
     appareil le croit toujours posé et le renvoie. Exactement le problème que
     `unwatched` résout pour les épisodes décochés, et la même solution.

   · `podium` se remplace EN BLOC sur `maj`. C'est un classement, il n'a de sens
     qu'entier : fusionner deux podiums titre par titre produirait un ordre que
     personne n'a joué.
--------------------------------------------------------------------------- */
function fusionnerAvis(rem){
  if(!rem || typeof rem !== 'object') return false;
  let bouge = false;
  db.avis        = db.avis        || { tv:{}, movie:{} };
  db.avisRetires = db.avisRetires || { tv:{}, movie:{} };

  ['tv','movie'].forEach(m=>{
    db.avis[m]        = db.avis[m]        || {};
    db.avisRetires[m] = db.avisRetires[m] || {};
    /* Les effacements d'abord : ils doivent pouvoir arbitrer un avis qui arrive
       dans le même paquet. */
    const rr = (rem.avisRetires && rem.avisRetires[m]) || {};
    Object.keys(rr).forEach(id=>{
      const t = Number(rr[id]) || 0;
      if(!t) return;
      if(t > (db.avisRetires[m][id] || 0)){ db.avisRetires[m][id] = t; bouge = true; }
    });
    const ra = (rem.avis && rem.avis[m]) || {};
    Object.keys(ra).forEach(id=>{
      const a = ra[id];
      /* Le 🤷 traverse la synchro comme les deux autres. Sans cette valeur, il
         n'arrivait jamais sur le second téléphone — silencieusement. */
      if(!a || (a.v !== 1 && a.v !== 0 && a.v !== -1)) return;
      const quand = Number(a.quand) || 0;
      const ici = db.avis[m][id];
      if(ici && (ici.quand || 0) >= quand) return;
      /* Effacé ici APRÈS avoir été posé là-bas : l'effacement gagne.
         Le `efface &&` n'est pas décoratif : `reparerAvis` conserve un avis sans
         date en lui posant `quand = 0` — cas réel d'un export bricolé ou d'une
         base venue d'ailleurs — et sans ce garde, `0 >= 0` refusait cet avis à
         la réception alors qu'AUCUN effacement n'existait. L'avis restait sur
         son appareil et ne franchissait jamais la synchro. */
      const efface = db.avisRetires[m][id] || 0;
      if(efface && efface >= quand) return;
      db.avis[m][id] = { v:a.v, quand:quand };
      bouge = true;
    });
    /* Effacements distants à appliquer chez nous. */
    Object.keys(db.avisRetires[m]).forEach(id=>{
      const ici = db.avis[m][id];
      if(ici && db.avisRetires[m][id] >= (ici.quand || 0)){ delete db.avis[m][id]; bouge = true; }
    });
  });

  /* Le podium porte les TROIS familles dans un seul objet, avec une seule date.
     Le remplacer en bloc sur cette date perdait le travail de l'autre appareil :
     jouer les films sur le téléphone puis les séries sur la tablette effaçait
     le podium des films, définitivement et sans un mot.

     La date arbitre donc famille par famille, et une famille VIDE ne réclame
     jamais rien : un podium n'est écrit que par une session de duel, il n'est
     jamais vidé volontairement, donc « vide » veut toujours dire « cet appareil
     n'a rien joué dans cette famille ». On garde alors ce qu'on a — et
     réciproquement, on récupère une famille que le distant est seul à porter,
     même si sa date est plus ancienne que la nôtre. */
  if(rem.podium && typeof rem.podium === 'object'){
    db.podium = db.podium || { film:[], serie:[], anime:[], maj:0 };
    const distantGagne = (rem.podium.maj || 0) > (db.podium.maj || 0);
    ['film','serie','anime'].forEach(f=>{
      const la = Array.isArray(rem.podium[f]) ? rem.podium[f] : [];
      const ici = Array.isArray(db.podium[f]) ? db.podium[f] : [];
      const gagnant = !la.length ? ici : !ici.length ? la : (distantGagne ? la : ici);
      if(gagnant !== ici){ db.podium[f] = gagnant; bouge = true; }
    });
    if(distantGagne){ db.podium.maj = rem.podium.maj; bouge = true; }
    if(typeof reparerAvis === 'function') reparerAvis();   // forme garantie, même venue d'ailleurs
  }
  return bouge;
}

/* ---------------------------------------------------------------------------
   R1 · point 11 — LA FUSION DU CLASSEMENT

   LA FUSION NE DOIT JAMAIS FAIRE PERDRE DE DUELS. C'est la seule chose que
   cette fonction a à garantir, et tout le reste en découle.

   Titre par titre : on garde l'entrée dont le `n` est le plus grand — ce
   côté-là a strictement plus d'information, il a vu plus de confrontations. À
   `n` égal, on garde l'entrée locale. Les clés présentes d'un seul côté sont
   conservées telles quelles. `maj` prend le plus grand des deux.

   N'IMITE PAS LA FUSION DE `db.podium`, juste au-dessus, qui remplace en bloc
   sur la date. C'était acceptable pour une liste de dix identifiants qu'une
   partie réécrit d'un coup ; ça ne l'est plus pour un classement qui accumule
   le travail de plusieurs mois. Jouer les films sur le téléphone puis rouvrir
   la tablette effacerait des dizaines de duels, définitivement et sans un mot.

   La règle est IDEMPOTENTE — refusionner le même paquet ne change plus rien —
   et le `n` de chaque titre finit au maximum des deux côtés quel que soit
   l'ordre des appareils. Une réserve honnête sur le mot « commutative » : à `n`
   égal, c'est le score LOCAL qui est retenu, donc deux appareils qui ont joué
   autant de duels sur un même titre gardent chacun le leur. Aucun duel n'est
   perdu, mais le score peut différer d'un cheveu le temps qu'un duel de plus
   les départage. C'est le prix de la règle « à `n` égal, le local gagne », qui
   est celle qui a été décidée.
--------------------------------------------------------------------------- */
function fusionnerClassement(rem){
  if(!rem || typeof rem !== 'object') return false;
  const rc = rem.classement;
  if(!rc || typeof rc !== 'object') return false;
  let bouge = false;
  if(!db.classement || typeof db.classement !== 'object')
    db.classement = { film:{}, serie:{}, anime:{}, maj:0 };

  ['film','serie','anime'].forEach(f=>{
    if(!db.classement[f] || typeof db.classement[f] !== 'object') db.classement[f] = {};
    const la = (rc[f] && typeof rc[f] === 'object') ? rc[f] : {};
    Object.keys(la).forEach(id=>{
      const e = la[id];
      if(!e || typeof e !== 'object' || typeof e.s !== 'number' || !isFinite(e.s)) return;
      const nLa = (typeof e.n === 'number' && isFinite(e.n) && e.n > 0) ? Math.floor(e.n) : 0;
      const ici = db.classement[f][id];
      const nIci = (ici && typeof ici.n === 'number' && isFinite(ici.n) && ici.n > 0)
                 ? Math.floor(ici.n) : 0;
      /* `ici` absent : la clé n'existe que là-bas, on la prend telle quelle.
         Sinon, seul un `n` STRICTEMENT plus grand fait gagner le distant. */
      if(ici && nLa <= nIci) return;
      db.classement[f][id] = { s:e.s, n:nLa };
      bouge = true;
    });
  });
  const maj = Number(rc.maj) || 0;
  if(maj > (db.classement.maj || 0)){ db.classement.maj = maj; bouge = true; }
  /* Forme garantie, même venue d'ailleurs — exactement ce que la fusion du
     podium fait juste au-dessus. */
  if(bouge && typeof reparerAvis === 'function') reparerAvis();
  return bouge;
}

/* ---------------------------------------------------------------------------
   CORRECTION C4 — LES ANNONCES IGNORÉES SUIVENT LE COMPTE

   Même règle que `avis`, et pour la même raison : c'est une union, jamais un
   remplacement. Chaque entrée porte sa date, la plus récente gagne, et une
   personne connue d'un seul côté est CONSERVÉE — deux appareils qui ont ignoré
   deux annonces différentes doivent finir avec les deux.

   Remplacer en bloc, comme on le fait pour `gouts`, serait faux ici : le
   téléphone resté en arrière renverrait une liste plus courte et ferait
   réapparaître des blocs déjà écartés.

   IDEMPOTENTE : refusionner le même paquet ne change plus rien.

   LE CAS TRANSITOIRE, ET IL EST ASSUMÉ. Un appareil resté sur la version
   précédente construit son envoi SANS cette clé. `rem.abosIgnores` est alors
   absent, et la fonction ne touche à rien — c'est le sens du `return false`
   ci-dessous : une clé absente ne veut PAS dire « liste vidée ». Ce qui peut
   arriver, en revanche, c'est que cet appareil-là écrase la liste côté serveur
   avec son propre envoi, qui n'en porte pas. Le pire cas est bénin — un bloc
   réapparaît, « Ignorer » le referme — et il disparaît dès que tous les
   appareils sont à jour. Signalé plutôt que sur-corrigé.
--------------------------------------------------------------------------- */
function fusionnerAbosIgnores(rem){
  if(!rem || typeof rem !== 'object') return false;
  const ra = rem.abosIgnores;
  if(!ra || typeof ra !== 'object') return false;
  if(!db.abosIgnores || typeof db.abosIgnores !== 'object') db.abosIgnores = {};
  let bouge = false;
  Object.keys(ra).forEach(id=>{
    const t = Number(ra[id]) || 0;
    if(!t) return;                                  // entrée sans date : rien à arbitrer
    if(t > (Number(db.abosIgnores[id]) || 0)){ db.abosIgnores[id] = t; bouge = true; }
  });
  return bouge;
}

/* ---------------------------------------------------------------------------
   C4 (09/08) — LES GOÛTS NE S'ÉCRASENT PLUS EN BLOC

   `db.gouts` se fusionnait en tout-ou-rien sur une seule date, `maj`. C'était
   défendable quand le bloc ne portait que des réglages ; ça ne l'est plus
   depuis qu'il porte aussi des GESTES. `refuserSugg` (app-04) — un simple
   « Pas pour moi » sur une suggestion — appelle `toucheGouts()`, ce qui datait
   TOUT le bloc : à la synchro suivante, il écrasait les genres, les acteurs,
   les plateformes et les graines réglés le même jour sur l'autre appareil. Et
   réciproquement. Deux appareils utilisés dans la même journée se volaient
   silencieusement leurs réglages, celui qui avait touché en dernier gagnant
   tout — y compris ce qu'il n'avait jamais touché.

   LA DÉCOUPE. Chaque bloc regroupe des clés qui se règlent d'un même geste et
   qui n'ont aucun sens l'une sans l'autre :

     genres     — le choix de genres et son complément. `exclus` est l'envers
                  exact de `genres` (cocher un genre le retire des exclus, et
                  l'inverse) : les séparer ferait apparaître un genre à la fois
                  aimé et écarté. `genresFam` est DÉRIVÉ de `genres` et de
                  `animeSous`, et `genresFamDe` est la signature qui dit de
                  quoi il a été dérivé — les trois voyagent ensemble ou la
                  signature ment.
     acteurs    — indépendant de tout le reste.
     graines    — les titres d'amorçage et le drapeau qui ferme la grille.
     plates     — les abonnements déclarés, la question posée, et le filtre
                  « seulement mes plateformes » qui n'existe que grâce à eux.
     pasVus     — « je ne l'ai pas vu », dit en plein duel.
     pasPourMoi — les suggestions refusées. C'EST LE BLOC QUI A MOTIVÉ TOUT
                  CECI : le plus écrit, et le moins important.
     divers     — les réglages restants (`propose`, `toutesOrigines`, `jour`,
                  `neutres`). Un fourre-tout assumé : ce sont des interrupteurs
                  isolés, et leur donner un bloc chacun n'achèterait rien.

   ÉCART ASSUMÉ AVEC LA SPEC. Elle demandait `animeSous` en bloc séparé. Il est
   ici DANS `genres`, parce que `genresFam` est recalculé à partir de la paire
   `genres` + `animeSous` (voir `migrerGenresFam`, app-11) : les fusionner
   séparément produirait un `genresFam` en désaccord avec sa propre signature,
   c'est-à-dire un écran de goûts qui affiche autre chose que ce qui est
   stocké. La spec demandait aussi `genres`+`exclus` groupés — même famille,
   même raison, on est cohérent.

   COMPATIBILITÉ DESCENDANTE, DANS LES DEUX SENS.
     · Un distant SANS `majBlocs` (appareil resté en v88) : tous ses blocs sont
       réputés datés de son `maj`. C'est exactement l'ancien comportement, donc
       aucune régression pour lui.
     · `maj` continue d'être écrit et envoyé : un appareil resté en v88 lit
       toujours ce qu'il attend et arbitre comme avant.
   Une base locale existante reçoit ses `majBlocs` par la migration 4.
--------------------------------------------------------------------------- */
const GOUT_BLOCS = {
  genres:     ['genres','genresFam','genresFamDe','exclus','animeOui','animeSous'],
  acteurs:    ['acteurs'],
  graines:    ['graines','amorcageFait'],
  plates:     ['plates','platesDemande','suggMesPlates'],
  pasVus:     ['pasVus'],
  pasPourMoi: ['pasPourMoi'],
  /* SPEC-04 lot C (10/08) — les deux interrupteurs de l'IA. Ils sont dans les
     goûts, et pas dans un `db.ia` à part, pour une raison de plomberie et une
     de sens. La plomberie : `payload()` est une liste blanche, et `gouts` y est
     déjà — un bloc de plus voyage sans qu'on touche à la synchro. Le sens :
     décider que l'app a le droit de faire écrire des textes est une préférence
     de la PERSONNE, pas de l'appareil. L'allumer sur le téléphone et la
     retrouver éteinte sur la tablette n'aurait aucun sens.
     Le CACHE des textes, lui, reste local (localStorage) — §4.3. */
  ia:         ['ia'],
  /* SPEC-05 §2 — les ambiances de la Recherche. Un bloc à elles : en créer une
     ne doit pas dater les genres ni les graines. */
  ambiances:  ['ambiances'],
  divers:     ['propose','toutesOrigines','jour','neutres']
};

function fusionnerGouts(rem){
  const rg = rem && rem.gouts;
  if(!rg || typeof rg !== 'object') return false;
  if(!db.gouts || typeof db.gouts !== 'object') db.gouts = {};
  const g = db.gouts;
  if(!g.majBlocs || typeof g.majBlocs !== 'object' || Array.isArray(g.majBlocs)) g.majBlocs = {};

  const rmaj = Number(rg.maj) || 0;
  const rBlocs = (rg.majBlocs && typeof rg.majBlocs === 'object' && !Array.isArray(rg.majBlocs))
               ? rg.majBlocs : null;
  let bouge = false;

  const lmaj = Number(g.maj) || 0;

  Object.keys(GOUT_BLOCS).forEach(nom=>{
    /* LE REPLI SUR LA DATE GLOBALE, DES DEUX CÔTÉS ET CLÉ PAR CLÉ.
       Un bloc sans date vaut la date globale de son porteur — pas zéro. Ça
       couvre trois cas d'un coup, et le troisième est celui qui compte :
         · un distant d'avant C4, qui n'a pas de `majBlocs` du tout ;
         · une base locale dont la migration 4 n'a pas encore tourné ;
         · un bloc AJOUTÉ dans une version future, absent des deux registres.
       Sans ce repli, un bloc à `undefined` compterait pour zéro et le premier
       distant venu, même bien plus ancien, gagnerait tout. C'est-à-dire
       exactement la perte que ce correctif est censé empêcher, retournée. */
    const la  = Number(rBlocs && rBlocs[nom] !== undefined ? rBlocs[nom] : rmaj) || 0;
    const ici = Number(g.majBlocs[nom] !== undefined ? g.majBlocs[nom] : lmaj) || 0;
    /* `<=` : à égalité on garde le local. Même règle que partout ailleurs dans
       cette fusion, et elle évite qu'un aller-retour fasse osciller un
       réglage entre deux appareils qui ont écrit la même milliseconde. */
    if(la <= ici) return;
    GOUT_BLOCS[nom].forEach(cle=>{
      /* Le distant gagne, y compris quand il n'a PAS la clé : une base plus
         ancienne qui ignore `animeOui` doit pouvoir la retirer, sinon un
         réglage abandonné reviendrait indéfiniment. `migrerGouts` reposera la
         valeur par défaut juste après. */
      if(rg[cle] === undefined) delete g[cle]; else g[cle] = rg[cle];
    });
    g.majBlocs[nom] = la;
    bouge = true;
  });

  /* `maj` suit le plus récent des deux, pour rester lisible par un appareil
     d'avant C4. Il n'arbitre plus rien ici. */
  if(rmaj > (Number(g.maj) || 0)) g.maj = rmaj;
  if(bouge && typeof migrerGouts === 'function') migrerGouts();
  return bouge;
}

function markDeleted(kind, id){
  db.deleted = db.deleted || {shows:{},movies:{}};
  db.deleted[kind][id] = Date.now();
}

/* Pourquoi la synchro a échoué, en une phrase lisible. La cause exacte importe
   moins que la seule chose qu'on veut vraiment savoir en la lisant : est-ce que
   je viens de perdre ma soirée de cochage ? Non — et c'est ça qui est écrit.
   Une cause qu'on ne sait pas nommer est rendue telle quelle plutôt que noyée
   dans un « une erreur est survenue » qui n'apprend rien. */
function motifSynchro(e){
  const brut = (e && (e.message || e)) || '';
  if(e && e.delai) return 'Délai dépassé — rien n\'est perdu, ça repartira.';
  /* C8 — trois fois devancé par un autre appareil. Ce n'est pas une panne, et
     surtout rien n'est perdu : c'est même le contraire, on a refusé d'écraser. */
  if(e && e.course) return 'Un autre appareil synchronisait en même temps — ça repartira.';
  if(!navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(brut))
    return 'Pas de connexion — rien n\'est perdu, ça repartira.';
  return String(brut).slice(0, 120);
}

/* C8 · point 1 — un aller-retour complet, retenté tant qu'un autre appareil
   nous passe devant. Rend `true` si la fusion a rapporté quelque chose.

   Deux cas au POST, et il faut les distinguer :
     · la ligne n'existe pas encore (premier appareil du compte) → il n'y a
       aucune version à conserver, on insère sans condition ;
     · la ligne existe → on n'écrit que si elle porte encore l'`updated_at`
       qu'on a lu. Sinon on relit et on recommence.

   Le filtre `user_id=eq.…` est conservé DANS la condition : sans lui, la RLS
   protégerait toujours, mais la requête décrirait autre chose que ce qu'elle
   veut dire, et c'est le genre d'écart qui se paye à la relecture suivante. */
async function echangerAvecServeur(essaisRestants){
  const cible = '/rest/v1/'+TABLE+'?user_id=eq.'+encodeURIComponent(db.auth.uid);
  const got = await sbFetch(cible.replace('?', '?select=data,updated_at&'), {});
  const ligne = (Array.isArray(got) && got.length) ? got[0] : null;
  const fusionAChange = ligne ? mergeRemote(ligne.data) : false;

  const corps = JSON.stringify({ user_id: db.auth.uid, data: payload(),
                                 updated_at: new Date().toISOString() });

  if(!ligne){
    /* Première écriture du compte. `merge-duplicates` reste nécessaire : deux
       appareils neufs peuvent insérer en même temps, et le second doit fusionner
       sur la clé plutôt que tomber en conflit. */
    await sbFetch('/rest/v1/'+TABLE, {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: corps
    });
    return fusionAChange;
  }

  const rep = await sbFetch(cible + '&updated_at=eq.' + encodeURIComponent(ligne.updated_at), {
    method:'PATCH',
    headers:{ Prefer:'return=representation' },
    body: corps
  });
  /* Zéro ligne touchée = quelqu'un a écrit entre notre lecture et notre
     écriture. Rien n'est perdu : on relit SA version, on la refusionne avec la
     nôtre, et on repart. C'est exactement ce que la fusion sait faire. */
  if(Array.isArray(rep) && rep.length) return fusionAChange;
  if(essaisRestants > 1){
    const encore = await echangerAvecServeur(essaisRestants - 1);
    return fusionAChange || encore;
  }
  /* Trois passages et toujours devancé : ce n'est plus une course. On le dit
     par une erreur, ce qui replanifie via le chemin d'échec habituel. */
  const err = new Error('COURSE');
  err.course = true;
  throw err;
}

async function syncNow(silent){
  if(!syncReady() || !signedIn()) return;
  if(syncing){
    /* B9 — une synchro est en vol. On ne la double pas, mais on ne laisse
       SURTOUT pas tomber : sans cette replanification, une modification faite
       pendant un aller-retour de 1,4 Mo attendait le changement suivant ou le
       redémarrage de l'app pour partir. */
    clearTimeout(syncTimer);
    syncTimer = setTimeout(()=> syncNow(true), 2000);
    return;
  }
  syncing = true; syncState = 'busy'; syncError = ''; if(!silent) render();
  try{
    /* C8 · point 1 — LE POST EST CONDITIONNÉ PAR LA VERSION QU'ON A LUE.
       L'ancien enchaînement était GET → fusion → POST inconditionnel. Entre le
       GET et le POST, il se passe plusieurs SECONDES : le paquet fait environ
       1,4 Mo dans chaque sens. Si l'autre appareil poste dans cette fenêtre,
       son écriture est écrasée en bloc par la nôtre — elle n'a jamais été lue,
       donc jamais fusionnée. Aucune trace, aucun message : une soirée de
       cochage disparaît parce que deux téléphones ont synchronisé en même
       temps.
       On relit donc `updated_at` avec les données, et le POST ne s'applique
       QUE si la ligne porte encore cette valeur (`?updated_at=eq.…`).
       `return=representation` est ce qui permet de savoir combien de lignes ont
       été touchées : zéro veut dire « quelqu'un est passé avant », et on
       recommence tout — relire, refusionner, reposter.
       TROIS TENTATIVES, pas plus : au-delà, ce n'est plus une course, c'est un
       problème. On replanifie et on laisse la main. */
    const fusionAChange = await echangerAvecServeur(3);
    db.syncedAt = Date.now(); syncState = 'ok'; syncError = '';
    delete db.syncDernierEchec;
    await writeNow().catch(()=>{});
    if(!silent) toast('Synchronisé');
    /* C5 — REVUE DU 07/08 : ce `render()` inconditionnel redessinait l'écran
       ENTIER 15 secondes après chaque modification, sans qu'on ait rien
       demandé (mesuré à la seconde près) — à-coups en pleine lecture, et
       position perdue si l'écran redessiné est plus court. On ne redessine que
       s'il y a une raison : la synchro était visible (`!silent`), la fusion a
       apporté des données d'un autre appareil, ou l'écran Compte — le seul qui
       AFFICHE l'état de synchro — est sous les yeux. */
    if(!silent || fusionAChange || view === 'account') render();
  }catch(e){
    syncState = 'err'; syncError = motifSynchro(e);
    /* Retenu en base pour survivre à un rechargement : l'échec doit rester
       visible tant qu'une synchro n'a pas réussi. Exclu de `payload` — c'est
       un état local. */
    db.syncDernierEchec = { quand: Date.now(), motif: syncError };
    if(!silent) toast('Synchro impossible : '+syncError);
    /* C5 — même règle qu'au succès : un échec silencieux n'a rien à redessiner,
       sauf si l'écran Compte, qui montre l'état, est affiché. L'échec reste
       retenu en base et sera visible dès qu'on ouvrira cet écran. */
    if(!silent || view === 'account') render();
  }finally{
    /* Dans un `finally` : une exception jetée HORS du try — dans `payload()`
       par exemple — laissait `syncing` latché à vrai, et plus rien ne
       synchronisait jusqu'au redémarrage. */
    syncing = false;
  }
}
function scheduleSync(){
  if(!syncReady() || !signedIn()) return;
  clearTimeout(syncTimer);
  /* Une synchro sérialise la bibliothèque entière (~1,3 Mo chez Adrien) et la
     téléverse. À 4 secondes, toute série de gestes espacés de plus de quatre
     secondes payait ce prix — d'où des à-coups sans rapport apparent avec ce
     qu'on vient de faire. À 15 secondes, rien n'est perdu : l'écriture LOCALE
     est déjà faite (`saveDB`), et `syncNow` est rejoué à l'ouverture.
     Revue de stabilité du 02/08, constat A2-4. */
  syncTimer = setTimeout(()=> syncNow(true), 15000);
}

/* ---------------------------------------------------------------------------
   C8 · point 2 (09/08) — LA SYNCHRO REPART TOUTE SEULE

   Rien ne la relançait. Ni le retour du réseau, ni la réouverture de l'app :
   il n'y avait aucun `addEventListener('online')` ni `visibilitychange` dans
   tout le dépôt. Un échec dans le métro restait un échec jusqu'à la
   modification suivante — et si on ne modifiait rien, jusqu'au redémarrage.
   Rouvrir l'app après deux jours en arrière-plan ne déclenchait rien non plus :
   `boot()` ne rejoue pas sur une PWA qui n'a jamais été fermée.

   DEUX DÉCLENCHEURS, UNE SEULE CONDITION. On ne repart que si la dernière
   tentative a échoué, ou si la dernière réussite date de plus de cinq minutes.
   Sans cette condition, chaque bascule d'onglet lancerait un aller-retour de
   1,4 Mo — ce qui coûterait plus cher que le défaut qu'on répare.

   LE REPLI EXPONENTIEL sert à autre chose qu'à ménager le serveur : sur un
   réseau qui répond « peut-être » (portail captif, 4G qui s'effondre), chaque
   `online` déclenche un échec, et sans attente croissante on obtiendrait une
   rafale de synchros ratées de 1,4 Mo chacune. 1 min, 2, 4, 8, plafond 15.
   Remis à zéro par la première réussite.
--------------------------------------------------------------------------- */
const REPRISE_SI_PLUS_DE = 5 * 60000;   // dernière réussite plus vieille que ça
const REPRISE_PLAFOND    = 15 * 60000;
let repriseEchecs = 0, repriseTimer = null, reprisesArmees = false;

function synchroAReprendre(){
  if(!syncReady() || !signedIn()) return false;
  if(db.syncDernierEchec) return true;
  return (Date.now() - (db.syncedAt || 0)) > REPRISE_SI_PLUS_DE;
}

/* Le délai à respecter avant de retenter, d'après le nombre d'échecs
   consécutifs. Pur, donc éprouvable — c'est la seule partie de ce bloc qui a
   une valeur à vérifier plutôt qu'un effet à observer. */
function delaiReprise(echecs){
  if(echecs <= 0) return 0;
  return Math.min(REPRISE_PLAFOND, 60000 * Math.pow(2, echecs - 1));
}

function reprendreSynchro(){
  if(!synchroAReprendre()) return;
  const attente = delaiReprise(repriseEchecs);
  clearTimeout(repriseTimer);
  repriseTimer = setTimeout(async ()=>{
    if(!synchroAReprendre()) return;
    const avant = db.syncedAt || 0;
    await syncNow(true);
    /* Le compteur se lit sur le RÉSULTAT, pas sur l'absence d'exception :
       `syncNow` avale déjà les siennes et n'a rien à nous dire autrement. */
    if((db.syncedAt || 0) > avant && !db.syncDernierEchec) repriseEchecs = 0;
    else repriseEchecs++;
  }, attente);
}

function armerReprisesSynchro(){
  /* Une seule fois : `boot()` ne tourne qu'au chargement, mais les tests et un
     futur appel manuel ne doivent pas empiler des écouteurs sur `window`. */
  if(reprisesArmees) return;
  reprisesArmees = true;
  window.addEventListener('online', ()=>{ repriseEchecs = 0; reprendreSynchro(); });
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible') reprendreSynchro();
  });
}

/* ============================ Partage par abonnement ============================ */
/* On ne consulte jamais la bibliothèque de quelqu'un sans y être abonné, et on ne
   s'abonne que par un code que la personne a elle-même généré. Tout est en lecture
   seule : rien de ce qui suit n'écrit dans les données d'autrui. */

/* I2 — `code` porte le code ACTIF, `expire` l'instant où il cesse de valoir.
   Les deux sont relus DEPUIS LE SERVEUR à chaque `chargerPartage`, et non
   gardés dans `db` comme le proposait la spec : la vérité est la ligne de
   `codes_partage`, et une copie locale finirait par mentir — code annulé depuis
   un autre téléphone, réinstallation, vieille sauvegarde réimportée. La policy
   « je vois mes codes » autorise déjà cette lecture, qui tient dans la requête
   que l'écran fait de toute façon. */
let partage = { suivis:[], abonnes:[], charge:false, occupe:false, code:null, expire:null };
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
           La table n'est lisible que par le cercle : la policy
           « profils lisibles par mon cercle » s'appuie sur `dans_mon_cercle()`
           — moi, les gens que je suis, les gens qui me suivent, personne
           d'autre. Elle vit dans `/supabase/migrations/004_dans_mon_cercle.sql`,
           et ce fichier commence par expliquer pourquoi il ne faut SURTOUT pas
           y ajouter une règle plus large : les policies permissives se
           combinent en OU, une seule ligne trop généreuse ouvrirait la table,
           photos de visage comprises. */
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
    /* CORRECTION C3 — LA DATE DU LIEN VOYAGE JUSQU'À L'ÉCRAN. Elle était déjà
       téléchargée (`depuis`, ci-dessus) et jetée aussitôt : le bloc « X t'a
       ajouté » ne pouvait donc pas distinguer un abonné d'hier d'un abonné de
       l'an dernier, et se serait affiché pour tout le monde à la mise en
       service. Chaque liste garde SA date, celle de son propre sens : dans
       « Mes abonnés », `depuis` dit quand la personne s'est abonnée à moi. */
    const lSuivis  = liens.filter(l=>l.suiveur===moi).map(l=>({ id:l.suivi,   depuis:l.depuis }));
    const lAbonnes = liens.filter(l=>l.suivi===moi).map(l=>({ id:l.suiveur, depuis:l.depuis }));
    const tous = [...new Set(lSuivis.concat(lAbonnes).map(x=>x.id))];
    let profs = {};
    if(tous.length){
      const ps = await sbFetch('/rest/v1/profils?select=user_id,pseudo,couleur,embleme,photo'+
        '&user_id=in.('+tous.join(',')+')', {});
      ps.forEach(p=> profs[p.user_id] = p);
    }
    /* On reprend l'avatar tel que la personne l'a choisi. Rien n'est inventé :
       sans profil enregistré, on retombe sur l'initiale. */
    const fiche = (lien)=>{
      const p = profs[lien.id] || {};
      return { id: lien.id, pseudo: p.pseudo || 'Sans nom',
               couleur: p.couleur || null, embleme: p.embleme || null, photo: p.photo || null,
               depuis: lien.depuis || null };
    };
    partage.suivis  = lSuivis.map(fiche);
    partage.abonnes = lAbonnes.map(fiche);
    partage.charge = true;
    /* Une lecture d'agrément : si elle échoue, l'écran des abonnements — qui
       est l'essentiel — ne doit pas échouer avec elle. */
    try{ await chargerCodeActif(); }
    catch(e){ console.warn('code de partage illisible', e); }
    /* I6 — même règle : ce qui s'ajoute à cet écran ne doit pas pouvoir le
       faire échouer. Les recommandations viennent après les personnes. */
    try{ await chargerConseils(); }
    catch(e){ console.warn('recommandations illisibles', e); }
  }catch(e){ partage.erreur = e.message; }
  partage.occupe = false;
  if(view==='abos') render();
}

/* Le code encore valide et non consommé, s'il y en a un. Il ne peut y en avoir
   qu'un depuis I2 ; on prend malgré tout le plus récent, pour qu'une base
   antérieure à la correction — où plusieurs codes coexistent — affiche celui
   que la personne a vu en dernier plutôt qu'un oublié. */
async function chargerCodeActif(){
  if(!signedIn()) return;
  const r = await sbFetch('/rest/v1/codes_partage?select=code,expire_le'+
    '&proprio=eq.'+encodeURIComponent(db.auth.uid)+
    '&utilise_le=is.null&expire_le=gt.'+encodeURIComponent(new Date().toISOString())+
    '&order=cree_le.desc&limit=1', {});
  const c = Array.isArray(r) && r[0];
  partage.code   = c ? c.code : null;
  partage.expire = c ? Date.parse(c.expire_le) : null;
}

/* I2 — générer, c'est REMPLACER. Le tirage et la suppression des codes
   précédents se font côté serveur, dans une seule transaction : un DELETE puis
   un INSERT depuis le téléphone laisserait, en cas de coupure entre les deux,
   une personne sans aucun code devant un écran qui en affiche un.
   Voir `/supabase/migrations/007_nouveau_code.sql`. */
async function genererCode(){
  if(!signedIn()) return;
  try{
    await majProfil();
    const r = await sbFetch('/rest/v1/rpc/nouveau_code', { method:'POST', body:'{}' });
    const c = Array.isArray(r) ? r[0] : r;
    if(!c || !c.code) throw new Error('reponse vide');
    partage.code   = c.code;
    partage.expire = Date.parse(c.expire_le);
    render();
  }catch(e){
    console.warn('creation du code impossible', e);
    toast('Impossible de créer le code');
  }
}

/* Annuler ne demande aucune fonction serveur : la policy « je supprime mes
   codes » couvre déjà ses propres lignes, et rien ne se recrée derrière — donc
   aucune fenêtre où l'on se retrouverait sans code en croyant en avoir un. */
async function annulerCode(){
  if(!signedIn() || !partage.code) return;
  try{
    await sbFetch('/rest/v1/codes_partage?proprio=eq.'+encodeURIComponent(db.auth.uid),
      { method:'DELETE', headers:{ Prefer:'return=minimal' } });
    partage.code = null; partage.expire = null;
    render();
    toast('Code annulé');
  }catch(e){
    console.warn('annulation du code impossible', e);
    toast('Impossible d\'annuler le code');
  }
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

/* ---------------------------------------------------------------------------
   CYCLE 3, POINT 6 — suivre en retour quelqu'un qui nous suit déjà.

   L'INSERTION NE SE FAIT JAMAIS DEPUIS L'APP. La table `abonnements` n'a
   AUCUNE policy d'écriture, et c'est délibéré (001_partage.sql) : sans cette
   fermeture, n'importe qui pourrait suivre n'importe qui en devinant un
   identifiant. La réciprocité se vérifie CÔTÉ SERVEUR, dans
   `suivre_en_retour()` (migration 011) : la fonction refuse si la cible ne
   nous suit pas déjà, et insère elle-même sinon. Ne JAMAIS « corriger » un
   échec d'insertion ici en ajoutant une policy insert sur la table.

   La notification (« X t'a suivi en retour ») part toute seule : le
   déclencheur de la migration 011 écoute les insertions, celle-ci comme celle
   d'`utiliser_code()`. */
async function suivreEnRetour(id){
  if(!signedIn()) return;
  if(!prendre('suivre:'+id)) return;      // deux appuis rapides, un seul appel
  try{
    await majProfil();
    await sbFetch('/rest/v1/rpc/suivre_en_retour', { method:'POST',
      body: JSON.stringify({ cible: id }) });
    /* Le pseudo est déjà en mémoire (les deux listes sont chargées) : pas de
       requête de plus pour un toast. Même mot que `utiliser_code()`. */
    toast('Tu suis maintenant '+nomDuCercle(id));
    await chargerPartage();
    render();
  }catch(e){
    /* Comme pour `utiliserCode` : un message clair, jamais un message
       technique. */
    const m = String(e && e.message || '');
    if(/PAS_RECIPROQUE/.test(m))      toast('Cette personne ne te suit plus');
    else if(/NON_CONNECTE/.test(m))   toast('Connecte-toi d\'abord');
    else if(/SOI_MEME/.test(m))       toast('C\'est toi');
    else toast('Impossible pour le moment — réessaie');
  }finally{
    rendre('suivre:'+id);
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

/* ---------------------------------------------------------------------------
   I6 — recommander un titre

   Le partage était à sens unique : on regardait la bibliothèque d'un proche
   sans jamais pouvoir lui dire « regarde ça ». Ces quatre fonctions sont tout
   ce que l'app fait ; les règles, elles, sont côté base
   (`/supabase/migrations/009_recommandations.sql`) : on ne peut recommander
   qu'à quelqu'un du cercle, et le serveur le refuse même si l'interface le
   proposait par erreur.

   `conseils.recues` alimente l'écran ; `conseils.envoyees` sert à savoir ce qu'on a
   déjà conseillé, pour ne pas le reproposer.
--------------------------------------------------------------------------- */
let conseils = { recues:[], envoyees:[], charge:false };

async function chargerConseils(){
  if(!signedIn()) return;
  try{
    const r = await sbFetch('/rest/v1/recommandations'+
      '?select=id,de,vers,type,tmdb_id,titre,cree,vu,ecarte&order=cree.desc&limit=100', {});
    const moi = db.auth.uid;
    /* S3 (09/08) — LE POINT D'ENTRÉE, et la même doctrine que
       `cercleDepuisBiblios` : ce qui vient d'une ligne écrite par un pair est
       filtré ICI, une fois, à l'arrivée — pas dans chacun des écrans qui
       l'affichent. Une ligne dont `type` sort du contrat ou dont `tmdb_id`
       n'est pas un identifiant TMDB est jetée, sans bruit et sans erreur.

       La contrainte SQL `check (type in ('tv','movie'))` de 009 dit déjà la
       même chose ; elle est dans une AUTRE COUCHE, et le client ne peut pas
       savoir qu'elle a bien été posée sur l'installation qu'il interroge —
       `INSTALL.md` a déjà laissé une migration hors du tableau. Deux défenses
       indépendantes, comme pour `escJs` : le filtre ne remplace pas le
       `check`, il ne dépend pas de lui. */
    const conforme = x => !!x && (x.type === 'tv' || x.type === 'movie')
                                 && estIdTmdb(x.tmdb_id);
    const tout = (Array.isArray(r) ? r : []).filter(conforme);
    /* La policy ne renvoie déjà que mes lignes : le tri ci-dessous range,
       il ne protège rien. */
    conseils.recues   = tout.filter(x=> x.vers === moi && !x.ecarte);
    conseils.envoyees = tout.filter(x=> x.de === moi);
    conseils.charge = true;
  }catch(e){
    /* P2 — pas de `catch` nu : l'écran doit pouvoir dire qu'il n'a pas pu lire. */
    conseils.erreur = (typeof motifSynchro === 'function') ? motifSynchro(e) : String(e && e.message || e);
    console.warn('recommandations illisibles', e);
  }
  if(view === 'abos' || view === 'follow') render();
}

/* Le titre est recopié à l'envoi : sans lui, afficher la liste reçue
   demanderait un appel TMDB par ligne avant même de savoir si ça intéresse. */
async function recommander(type, id, titre, vers){
  if(!signedIn()) return;
  try{
    await sbFetch('/rest/v1/recommandations', { method:'POST',
      headers:{ Prefer:'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ de: db.auth.uid, vers: vers, type: type,
                             tmdb_id: Number(id), titre: String(titre||'').slice(0,200) }) });
    await chargerConseils();
    toast('Recommandation envoyée');
  }catch(e){
    console.warn('recommandation impossible', e);
    /* 403 : la personne n'est plus dans le cercle. C'est le serveur qui tranche,
       et le message doit dire la vraie raison plutôt qu'« échec ». */
    toast(e && e.status === 403 ? 'Cette personne n\'est plus dans ton cercle'
                                : 'Envoi impossible');
  }
}

/* Écarter : le destinataire seul en a le droit, et la ligne reste en base pour
   que la même recommandation ne revienne pas au prochain chargement. */
async function ecarterConseil(idReco){
  try{
    await sbFetch('/rest/v1/recommandations?id=eq.'+encodeURIComponent(idReco),
      { method:'PATCH', headers:{ Prefer:'return=minimal' },
        body: JSON.stringify({ ecarte: new Date().toISOString() }) });
    conseils.recues = conseils.recues.filter(x=> x.id !== idReco);
    render();
  }catch(e){
    console.warn('impossible d\'écarter la recommandation', e);
    toast('Échec');
  }
}

/* Récupère la bibliothèque d'une personne suivie — lecture seule, gardée en mémoire */
async function chargerBiblio(id){
  try{
    const r = await sbFetch('/rest/v1/'+TABLE+'?select=data&user_id=eq.'+encodeURIComponent(id), {});
    biblios[id] = (Array.isArray(r) && r.length) ? (r[0].data || {}) : {};
  }catch(e){ biblios[id] = { erreur: e.message }; }
  if(view==='biblio') render();
}
