"use strict";
/* ---------------------------------------------------------------------------
   Notifications — côté téléphone.

   Ici : demander l'autorisation à iOS, retenir les titres à surveiller, et
   dire au serveur où envoyer. L'envoi lui-même est le travail de la fonction
   `notifier`, côté Supabase, qui tourne plusieurs fois par jour.

   Rappel de contrainte, pour que personne ne se demande plus tard pourquoi il
   n'y a pas d'affiche : iOS n'affiche ni image ni icône personnalisée pour une
   app web, il reprend l'icône du manifeste. Le seul levier est le texte.
--------------------------------------------------------------------------- */

/* La clé d'un titre dans les préférences : 'tv:1399', 'movie:693134'. */
function cleTitre(type, id){ return type + ':' + id; }

/* ---------- Ce que l'appareil sait faire ---------- */

/* Sur iPhone, le push n'existe que si l'app a été ajoutée à l'écran d'accueil.
   Dans un onglet Safari, `PushManager` est absent : on le détecte au lieu de
   promettre quelque chose qui ne partira jamais. */
function notifPossibles(){
  return typeof Notification !== 'undefined' &&
         'serviceWorker' in navigator &&
         'PushManager' in window;
}
function surEcranAccueil(){
  return (window.navigator && window.navigator.standalone === true) ||
         (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
function estIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function permissionNotif(){
  return (typeof Notification !== 'undefined' && Notification.permission) || 'default';
}
function notifAutorisees(){ return permissionNotif() === 'granted'; }

/* ---------- Les préférences ---------- */

/* Appelée au démarrage : une base d'avant les notifications n'a pas le bloc,
   et une base à moitié remplie par une version intermédiaire ne doit pas
   faire planter l'écran. */
function migrerNotif(){
  if(!db.notif || typeof db.notif !== 'object') db.notif = {};
  const n = db.notif;
  if(typeof n.actif !== 'boolean') n.actif = false;
  if(n.quand !== 'sortie' && n.quand !== 'soir' && n.quand !== 'samedi') n.quand = 'sortie';
  /* Le résumé du soir était le défaut d'une version précédente. Personne ne
     l'avait choisi, et il ne fait que répéter ce que « À rattraper » montre
     déjà : on repasse à l'événement, une notification par sortie. Un choix
     fait à la main, lui, est respecté pour toujours. */
  if(typeof n.quandChoisi !== 'boolean') n.quandChoisi = false;
  if(!n.quandChoisi && n.quand === 'soir') n.quand = 'sortie';
  if(!n.films || typeof n.films !== 'object') n.films = { cine:true, stream:true, vod:false };
  ['cine','stream','vod'].forEach(k=>{ if(typeof n.films[k] !== 'boolean') n.films[k] = (k !== 'vod'); });
  if(!n.titres || typeof n.titres !== 'object') n.titres = {};
  /* L'étiquette « Me prévenir » n'apparaît qu'une fois dans la vie de l'app. */
  if(typeof n.clocheVue !== 'boolean') n.clocheVue = false;
  /* L'abonnement push renvoyé par le navigateur — rempli à l'étape suivante. */
  if(n.abo === undefined) n.abo = null;
}

function clocheAllumee(type, id){ return !!db.notif.titres[cleTitre(type,id)]; }
function compterCloches(type){
  return Object.keys(db.notif.titres).filter(k => k.indexOf(type+':') === 0).length;
}

/* Un titre disparu de la bibliothèque ne doit pas continuer à compter dans
   « 3 séries suivies » ni déclencher quoi que ce soit. */
function nettoyerCloches(){
  let change = false;
  Object.keys(db.notif.titres).forEach(k=>{
    const type = k.slice(0, k.indexOf(':'));
    const id   = k.slice(k.indexOf(':')+1);
    const vit  = (type === 'tv') ? !!db.shows[id] : !!db.movies[id];
    if(!vit){ delete db.notif.titres[k]; change = true; }
  });
  return change;
}

/* ---------- Demander l'autorisation ---------- */

/* iOS ne pose la question qu'une fois : si l'on répond « Refuser », plus aucun
   appel ne la fera réapparaître, il faut passer par les Réglages du téléphone.
   D'où l'ordre retenu : on n'appelle ceci que sur un geste franc, jamais à
   l'ouverture de l'app. */
async function demanderPermissionNotif(){
  if(!notifPossibles()){
    toast(estIOS() && !surEcranAccueil()
      ? 'Ajoute d\'abord l\'app à ton écran d\'accueil'
      : 'Ton navigateur ne gère pas les notifications');
    return false;
  }
  if(permissionNotif() === 'denied'){
    toast('Notifications refusées — réactive-les dans les Réglages de l\'iPhone');
    return false;
  }
  if(notifAutorisees()) return true;
  let rep = 'default';
  try{ rep = await Notification.requestPermission(); }
  catch(e){ rep = 'denied'; }
  if(rep !== 'granted'){
    toast('Sans autorisation, aucune notification ne peut arriver');
    return false;
  }
  return true;
}

/* ---------------------------------------------------------------------------
   Dire au serveur où envoyer, et quoi surveiller

   Trois choses à téléverser, jamais mélangées à la bibliothèque : l'abonnement
   de cet appareil, la liste des cloches, et le réglage. Tout est refait à
   l'identique à chaque changement — c'est court, et ça évite de tenir un
   journal de différences qui finirait par se désynchroniser.

   La moitié publique de la clé VAPID vit ici, dans le code envoyé au
   navigateur : c'est fait pour. Sa moitié privée ne quitte jamais Supabase.
--------------------------------------------------------------------------- */
const VAPID_PUBLIQUE =
  'BBpSgSNcQugozdir_hxAIXaDlWvZfNofUFbJzQPeAPHt_24mVWFGcEv4wNWk9x-CIU8JcAfIYvCgaYc1OyRZySI';

/* Le navigateur veut la clé en octets, pas en texte. */
function cleEnOctets(b64){
  const p = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g,'+').replace(/_/g,'/');
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* L'abonnement de CET appareil. Le même compte sur deux téléphones donne deux
   abonnements distincts : c'est voulu, chacun doit sonner. */
async function abonnerAppareil(){
  if(!notifPossibles() || !notifAutorisees() || !signedIn()) return false;
  try{
    const reg = await navigator.serviceWorker.ready;
    let ab = await reg.pushManager.getSubscription();
    if(!ab){
      ab = await reg.pushManager.subscribe({
        /* Obligatoire : on s'engage à toujours afficher quelque chose. iOS
           coupe l'abonnement d'une app qui reçoit sans rien montrer. */
        userVisibleOnly: true,
        applicationServerKey: cleEnOctets(VAPID_PUBLIQUE)
      });
    }
    const j = ab.toJSON();
    if(!j || !j.endpoint || !j.keys) return false;
    await sbFetch('/rest/v1/push_appareils', {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: db.auth.uid, endpoint: j.endpoint,
                             p256dh: j.keys.p256dh, auth: j.keys.auth,
                             vu: new Date().toISOString(), echecs: 0 })
    });
    db.notif.abo = j.endpoint; saveDB();
    return true;
  }catch(e){ return false; }
}

/* Les cloches et le réglage. On efface puis on réécrit : la liste fait
   quelques lignes, et un titre éteint doit vraiment disparaître. */
async function pousserCloches(){
  if(!signedIn() || !syncReady()) return;
  const cles = Object.keys(db.notif.titres);
  try{
    await sbFetch('/rest/v1/push_reglages', {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: db.auth.uid, quand: db.notif.quand,
                             films: db.notif.films, maj: new Date().toISOString() })
    });
    await sbFetch('/rest/v1/push_cloches?user_id=eq.'+encodeURIComponent(db.auth.uid),
                  { method:'DELETE', headers:{ Prefer:'return=minimal' } });
    if(cles.length){
      await sbFetch('/rest/v1/push_cloches', {
        method:'POST', headers:{ Prefer:'return=minimal' },
        body: JSON.stringify(cles.map(k=>({
          user_id: db.auth.uid,
          type: k.slice(0, k.indexOf(':')),
          tmdb_id: Number(k.slice(k.indexOf(':')+1))
        })))
      });
    }
  }catch(e){ /* on retentera au prochain changement */ }
}

/* Un seul point d'entrée : à appeler après tout changement de cloche ou de
   réglage. Sans abonnement d'appareil, envoyer des cloches ne servirait à rien. */
let pousseTimer;
function poussserPlusTard(){
  clearTimeout(pousseTimer);
  pousseTimer = setTimeout(async ()=>{
    if(!signedIn()) return;
    if(Object.keys(db.notif.titres).length) await abonnerAppareil();
    await pousserCloches();
  }, 1200);
}

/* ---------- La cloche d'une fiche ---------- */

/* Le bouton de la barre du haut, sur une série comme sur un film. */
function boutonCloche(type, id){
  const on = clocheAllumee(type, id);
  return '<button class="iconbtn cloche'+(on?' on':'')+'" id="cloche-'+type+'-'+id+'" '+
    'aria-label="'+(on?'Ne plus me prévenir':'Me prévenir')+'" '+
    'onclick="basculerCloche(\''+type+'\','+JSON.stringify(id)+')">'+
    (on ? I.clochePleine : I.cloche)+'</button>';
}

/* Une seule fois dans la vie de l'app : une étiquette montre à quoi sert
   l'icône, puis l'app se tait pour toujours. */
function montrerAstuceCloche(){
  if(db.notif.clocheVue) return;
  const btn = document.querySelector('.iconbtn.cloche');
  if(!btn) return;
  db.notif.clocheVue = true; saveDB();
  const r = btn.getBoundingClientRect();
  const bulle = document.createElement('div');
  bulle.className = 'astuce';
  bulle.style.top = (r.bottom + 9) + 'px';
  bulle.style.right = Math.max(6, window.innerWidth - r.right - 4) + 'px';
  bulle.innerHTML = '<i></i>Me prévenir';
  bulle.style.setProperty('--fx', (window.innerWidth - r.left - r.width/2 - 6) + 'px');
  document.body.appendChild(bulle);
  setTimeout(()=>{ bulle.classList.add('part'); }, 3200);
  setTimeout(()=>{ if(bulle.parentNode) bulle.remove(); }, 3700);
}

function titreDe(type, id){
  if(type === 'tv'){ const s = db.shows[id]; return s ? s.name : ''; }
  const m = db.movies[id]; return m ? m.title : '';
}

async function basculerCloche(type, id){
  const k = cleTitre(type, id);
  const on = !!db.notif.titres[k];

  if(on){
    delete db.notif.titres[k];
    if(!Object.keys(db.notif.titres).length) db.notif.actif = false;
    saveDB(); render(); poussserPlusTard();
    toast('Tu ne seras plus prévenu pour ' + titreDe(type,id));
    return;
  }

  /* Première cloche : c'est ici, et seulement ici, qu'iOS pose sa question. */
  if(!notifAutorisees()){
    const ok = await demanderPermissionNotif();
    if(!ok){ render(); return; }
  }
  db.notif.titres[k] = 1;
  db.notif.actif = true;
  saveDB(); render(); poussserPlusTard();
  toast(type === 'tv'
    ? 'Tu seras prévenu des nouveaux épisodes de ' + titreDe(type,id)
    : 'Tu seras prévenu à la sortie de ' + titreDe(type,id));
}

/* ---------- L'écran Notifications ---------- */

function etatNotif(){
  if(!notifPossibles()){
    return estIOS() && !surEcranAccueil()
      ? { ton:'attente', titre:'À installer sur l\'écran d\'accueil',
          sous:'Sur iPhone, les notifications n\'existent que pour une app installée.' }
      : { ton:'attente', titre:'Non disponible ici',
          sous:'Ce navigateur ne gère pas les notifications.' };
  }
  if(permissionNotif() === 'denied')
    return { ton:'refus', titre:'Notifications refusées',
             sous:'Réactive-les dans Réglages › Notifications › Mes séries.' };
  if(!notifAutorisees())
    return { ton:'attente', titre:'Pas encore autorisées',
             sous:'Allume la cloche sur une série : iOS te demandera confirmation.' };
  const nb = compterCloches('tv') + compterCloches('movie');
  return nb
    ? { ton:'ok', titre:'Notifications autorisées', sous:'Sur cet appareil' }
    : { ton:'attente', titre:'Autorisées, mais aucun titre suivi',
        sous:'Allume la cloche sur une série ou un film.' };
}

/* Le sous-titre de la ligne des réglages : l'état tient en quelques mots. */
function resumeNotif(){
  if(!notifPossibles()) return 'Indisponible sur cet appareil';
  if(permissionNotif() === 'denied') return 'Refusées';
  if(!notifAutorisees()) return 'Désactivées';
  const t = compterCloches('tv'), f = compterCloches('movie');
  if(!t && !f) return 'Autorisées · aucun titre suivi';
  return 'Activées · ' + t + ' série' + (t>1?'s':'') + ', ' + f + ' film' + (f>1?'s':'');
}

const QUANDS = [
  { v:'sortie', t:'Dès la sortie',
    d:'Une notification à chaque épisode qui sort et à chaque film qui sort. '+
      'C\'est le réglage par défaut.' },
  { v:'soir',   t:'Un résumé le soir · 19 h',
    d:'Tout regroupé en une seule notification par jour, à 19 h. À choisir si '+
      'les alertes à l\'unité deviennent trop nombreuses.' },
  { v:'samedi', t:'Un résumé le samedi',
    d:'Une seule notification par semaine, le samedi matin.' }
];
const EVENEMENTS_FILM = [
  { v:'cine',   t:'Sortie au cinéma' },
  { v:'stream', t:'Dispo en streaming' },
  { v:'vod',    t:'Sortie en VOD' }
];

function viewNotifications(){
  const e = etatNotif();
  let html = header('Notifications', {back:"goBack()"});

  html += '<div class="wrap" style="padding-bottom:2px">'+
    '<div class="card etatnotif '+e.ton+'">'+
      '<span class="pastille"></span>'+
      '<div><div class="etitre">'+esc(e.titre)+'</div>'+
      '<div class="small muted">'+esc(e.sous)+'</div></div>'+
    '</div></div>';

  const quand = QUANDS.find(q=>q.v === db.notif.quand) || QUANDS[1];
  html += '<div class="sectitle">Quand</div><div class="wrap" style="padding-top:0">'+
    '<div class="fchips">'+
      QUANDS.map(q=>'<button class="chip'+(db.notif.quand===q.v?' on':'')+'" '+
        'onclick="choisirQuand(\''+q.v+'\')">'+q.t+'</button>').join('')+
    '</div>'+
    '<div class="small muted" style="margin-top:10px">'+esc(quand.d)+'</div>'+
  '</div>';

  html += '<div class="sectitle">Mes films</div><div class="wrap" style="padding-top:0">'+
    '<div class="fchips">'+
      EVENEMENTS_FILM.map(f=>'<button class="chip'+(db.notif.films[f.v]?' on':'')+'" '+
        'onclick="basculerEvenementFilm(\''+f.v+'\')">'+f.t+'</button>').join('')+
    '</div>'+
    '<div class="small muted" style="margin-top:10px">Ces réglages ne concernent que les films '+
    'où tu as allumé la cloche.</div>'+
  '</div>';

  const t = compterCloches('tv'), f = compterCloches('movie');
  html += '<div class="sectitle">Titres suivis</div><div class="wrap" style="padding-top:0">'+
    '<button class="reg" onclick="go(\'clochettes\',{from:\'notifs\'})">'+
      '<i>'+I.cloche+'</i>'+
      '<span class="rtxt"><b>Voir la liste</b><em>'+
        t+' série'+(t>1?'s':'')+', '+f+' film'+(f>1?'s':'')+'</em></span>'+
      '<span class="ecaret">'+I.caret+'</span></button>'+
    '<div class="tiny muted" style="margin-top:12px">La cloche s\'allume aussi directement '+
    'depuis la fiche d\'une série ou d\'un film.</div>'+
  '</div>';

  html += '<div class="wrap tiny muted" style="padding-top:18px;padding-bottom:30px">'+
    'Sur iPhone, la vignette d\'une notification est toujours l\'icône de l\'app : '+
    'Apple n\'autorise pas les affiches pour une app web.</div>';
  return html;
}

function choisirQuand(v){
  if(db.notif.quand === v) return;
  db.notif.quand = v; db.notif.quandChoisi = true; saveDB(); render(); poussserPlusTard();
}
function basculerEvenementFilm(v){
  db.notif.films[v] = !db.notif.films[v];
  /* Tout éteindre reviendrait à laisser des cloches allumées sans qu'aucun
     événement ne les déclenche : on garde au moins la sortie en salle. */
  if(!EVENEMENTS_FILM.some(f=>db.notif.films[f.v])) db.notif.films.cine = true;
  saveDB(); render(); poussserPlusTard();
}

/* ---------- La liste des titres où la cloche est allumée ---------- */

function viewClochettes(){
  nettoyerCloches();
  let html = header('Titres suivis', {back:"goBack()"});

  const series = Object.values(db.shows)
    .sort((a,b)=>(a.name||'').localeCompare(b.name||'', 'fr'));
  const films = Object.values(db.movies)
    .sort((a,b)=>(a.title||'').localeCompare(b.title||'', 'fr'));

  if(!series.length && !films.length){
    return html + '<div class="empty"><b>Rien à régler</b>'+
      '<p>Ajoute une série ou un film, puis allume sa cloche.</p></div>';
  }

  const rang = (type, id, nom, sous, poster)=>
    '<button class="srow clic" onclick="basculerCloche(\''+type+'\','+JSON.stringify(id)+')">'+
      posterEl(poster,'w185','',nom)+
      '<div class="sinfo"><div class="sname">'+esc(nom)+'</div>'+
        '<div class="snext">'+esc(sous)+'</div></div>'+
      '<span class="inter'+(clocheAllumee(type,id)?' on':'')+'"><i></i></span>'+
    '</button>';

  if(series.length){
    html += '<div class="sectitle">Séries</div><div class="list">'+
      series.map(s=>rang('tv', s.id, s.name,
        s.pause ? 'En pause · rien ne sera envoyé'
                : (s.next ? 'Prochain épisode : '+codeEp(s.next.s,s.next.e)
                          : 'Aucun épisode annoncé'),
        s.poster)).join('')+'</div>';
  }
  if(films.length){
    html += '<div class="sectitle">Films</div><div class="list">'+
      films.map(m=>rang('movie', m.id, m.title,
        m.seen ? 'Déjà vu' : (m.date ? 'Sortie : '+fmtDate(m.date) : 'Date inconnue'),
        m.poster)).join('')+'</div>';
  }
  html += '<div style="height:26px"></div>';
  return html;
}
