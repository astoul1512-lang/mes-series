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
  /* I9 — il n'y a plus qu'une fréquence. « Un résumé le soir » et « le samedi »
     étaient affichés, choisissables… et jamais implémentés côté serveur, qui
     saute toute personne dont `quand` vaut autre chose que `sortie`. Les
     choisir n'espaçait donc pas les notifications : ça les ÉTEIGNAIT, sans le
     dire. Le champ reste — le serveur le lit — mais il ne vaut plus que
     `sortie`, et l'écran ne propose plus de choix.
     La bascule d'une base existante est faite par la migration 3 (app-01), pas
     ici : une transformation ponctuelle appartient au registre, un contrôle de
     présence appartient à cette fonction (§B7). Le repli ci-dessous ne sert
     qu'aux bases arrivées par la synchro depuis un appareil resté en arrière. */
  if(n.quand !== 'sortie') n.quand = 'sortie';
  if(typeof n.quandChoisi !== 'boolean') n.quandChoisi = false;
  if(!n.films || typeof n.films !== 'object') n.films = { cine:true, maison:true };
  normaliserFilmsNotif(n.films);
  ['cine','maison'].forEach(k=>{ if(typeof n.films[k] !== 'boolean') n.films[k] = true; });
  if(!n.titres || typeof n.titres !== 'object') n.titres = {};
  /* Une cloche était un simple marqueur, vrai ou faux. Pour qu'elle puisse
     voyager d'un téléphone à l'autre, chacune retient désormais l'instant où
     on l'a allumée : c'est ce qui permet de trancher entre deux appareils qui
     ne disent pas la même chose. Les anciennes valeurs sont datées d'ici. */
  Object.keys(n.titres).forEach(k=>{
    if(typeof n.titres[k] !== 'number' || n.titres[k] < 1000) n.titres[k] = Date.now();
  });
  /* Les cloches éteintes, avec leur date. Sans cette trace, une extinction
     serait effacée au premier échange avec un appareil resté en arrière. */
  if(!n.titresOff || typeof n.titresOff !== 'object') n.titresOff = {};
  /* La date du dernier changement de réglage — « quand » et « mes films ». */
  if(typeof n.maj !== 'number') n.maj = 0;
  /* L'étiquette « Me prévenir » n'apparaît qu'une fois dans la vie de l'app. */
  if(typeof n.clocheVue !== 'boolean') n.clocheVue = false;
  /* L'abonnement push renvoyé par le navigateur — rempli à l'étape suivante. */
  if(n.abo === undefined) n.abo = null;
  /* Pourquoi la dernière inscription a échoué. Sans cette trace, un appareil
     qui n'arrive pas à s'abonner reste muet et l'app prétend le contraire. */
  if(n.erreur === undefined) n.erreur = null;
}

/* I8 — « Dispo en streaming » et « Sortie en VOD » étaient deux étiquettes pour
   un seul événement : côté serveur, `stream` valait le type 4 de TMDB et `vod`
   les types 4 et 5, or le type 5 (disque) est écarté partout ailleurs dans
   l'app. Deux réglages qui se déclenchent sur la même donnée, c'est une
   promesse de finesse que rien ne tient. Un seul : « À la maison ».

   Le pliage vit dans une fonction à part parce qu'il s'applique à TROIS
   entrées — la base locale (migration 3), une base réparée au démarrage, et un
   objet venu d'un autre appareil par la synchro. Trois copies auraient divergé.
   Idempotent : rejouable sans effet. */
function normaliserFilmsNotif(f){
  if(!f || typeof f !== 'object') return false;
  const avaitAncien = typeof f.stream === 'boolean' || typeof f.vod === 'boolean';
  if(typeof f.maison !== 'boolean' && avaitAncien) f.maison = !!(f.stream || f.vod);
  delete f.stream; delete f.vod;
  return avaitAncien;
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
    if(vit) return;
    delete db.notif.titres[k];
    /* Une extinction datée, pas un simple oubli : le titre a quitté la
       bibliothèque, et cette sortie se synchronise elle aussi. Sans la date,
       l'autre appareil rallumerait la cloche au prochain échange. */
    if(db.notif.titresOff) db.notif.titresOff[k] = Date.now();
    change = true;
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
/* Chaque échec laisse une phrase lisible dans db.notif.erreur : l'écran
   Notifications l'affiche. Une inscription qui rate en silence est pire
   qu'une inscription qui rate, parce qu'on continue à attendre. */
function echecAbo(raison){
  db.notif.abo = null; db.notif.erreur = raison; saveDB();
  return false;
}

async function abonnerAppareil(){
  if(!notifPossibles())
    return echecAbo(estIOS() && !surEcranAccueil()
      ? 'App ouverte dans Safari, pas depuis l\'icône de l\'écran d\'accueil'
      : 'Ce navigateur ne gère pas le push');
  if(!notifAutorisees())  return echecAbo('Autorisation iOS absente (' + permissionNotif() + ')');
  if(!signedIn())         return echecAbo('Pas connecté');
  if(!syncReady())        return echecAbo('Serveur non configuré');

  let etape = 'service worker';
  try{
    const reg = await navigator.serviceWorker.ready;
    etape = 'abonnement du navigateur';
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
    if(!j || !j.endpoint || !j.keys) return echecAbo('Abonnement incomplet renvoyé par iOS');
    etape = 'envoi au serveur';
    await sbFetch('/rest/v1/push_appareils', {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: db.auth.uid, endpoint: j.endpoint,
                             p256dh: j.keys.p256dh, auth: j.keys.auth,
                             vu: new Date().toISOString(), echecs: 0 })
    });
    db.notif.abo = j.endpoint; db.notif.erreur = null; saveDB();
    return true;
  }catch(e){
    return echecAbo(etape + ' — ' + ((e && (e.message || e.name)) || 'erreur inconnue'));
  }
}

/* Appelée à chaque ouverture de l'app, et après une connexion.

   Un abonnement push ne dure pas éternellement : iOS peut le remplacer, une
   réinstallation le perd, un deuxième téléphone n'en a jamais eu. Or l'app ne
   tentait de s'inscrire qu'au moment où l'on allume une cloche — un moment qui
   ne revient jamais quand les cloches sont déjà allumées. D'où le silence.

   Ici, on rattrape sans rien demander : l'inscription n'a besoin d'aucun geste,
   seulement d'une autorisation déjà accordée. La question d'iOS, elle, reste
   posée à la première cloche et nulle part ailleurs — elle ne se pose qu'une
   fois dans la vie de l'app, autant que ce soit quand la raison est évidente. */
async function inscrireSiBesoin(){
  if(!notifPossibles() || !notifAutorisees() || !signedIn() || !syncReady()) return false;
  /* B11 (09/08) — LA PURGE D'ABORD, L'INSCRIPTION ENSUITE, ET DANS CET ORDRE.
     Les deux peuvent porter sur la MÊME adresse d'abonnement : se déconnecter
     ne résilie pas l'abonnement du navigateur, on revient donc avec la même.
     Inscrire d'abord et supprimer ensuite effacerait la ligne qu'on vient de
     créer. On attend donc que la file soit vidée — elle est vide dans la quasi
     -totalité des cas, cet `await` ne coûte rien. */
  await purgerAppareils();
  try{
    const reg = await navigator.serviceWorker.ready;
    const ab  = await reg.pushManager.getSubscription();
    /* Déjà inscrit, et c'est bien le même abonnement : rien à refaire. */
    if(ab && db.notif.abo === ab.endpoint) return true;
  }catch(e){ /* on tente l'inscription complète ci-dessous */ }
  const ok = await abonnerAppareil();
  /* Un appareil neuf n'a encore rien dit de ses cloches ni de son réglage. */
  if(ok) await pousserCloches();
  return ok;
}

/* À la déconnexion. Deux raisons, et la première est sérieuse : sans ça, le
   compte qu'on vient de quitter continuerait d'envoyer ses notifications sur ce
   téléphone. La seconde : tant que l'app croit l'appareil inscrit, le compte
   suivant ne s'inscrirait jamais, puisque l'abonnement du navigateur, lui, n'a
   pas changé. On efface donc pendant qu'on a encore le jeton en main. */
function oublierAppareil(){
  if(!db.notif) return;
  const ep = db.notif.abo;
  const uid = (db.auth && db.auth.uid) || null;
  db.notif.abo = null; db.notif.erreur = null; saveDB();
  if(!ep) return;
  /* B11 (09/08) — UN DELETE PERDU NE SE PERD PLUS. Le `.catch(()=>{})` était un
     renoncement pur, et le cas est celui que le commentaire ci-dessus qualifie
     lui-même de sérieux : se déconnecter HORS LIGNE effaçait l'abonnement côté
     téléphone et laissait la ligne au serveur — cet appareil continuait donc de
     recevoir les notifications de l'ancien compte, indéfiniment, sans plus
     aucun écran pour le dire ni bouton pour l'arrêter.
     L'adresse part maintenant dans une liste à purger, PERSISTÉE, rejouée au
     démarrage et au retour du réseau jusqu'à réussite. Elle retient aussi le
     compte : la suppression est protégée par RLS, elle n'a de sens qu'avec le
     jeton de CE compte-là.
     (S'articule avec C7 de la SPEC-01 : une fois l'inscription passée en
     `on_conflict=endpoint`, une réinscription depuis un autre compte reprend la
     ligne au lieu d'en créer une seconde. La purge reste le chemin propre, elle
     cesse d'être le seul.) */
  if(!signedIn() || !syncReady()){ marquerAPurger(ep, uid); return; }
  /* RLS oblige : cette requête ne peut toucher que les lignes de la personne
     connectée, le filtre sur l'adresse suffit. */
  sbFetch('/rest/v1/push_appareils?endpoint=eq.' + encodeURIComponent(ep),
          { method:'DELETE', headers:{ Prefer:'return=minimal' } })
    .catch(()=>{ marquerAPurger(ep, uid); });
}
/* La file des adresses à supprimer côté serveur. Locale à l'appareil :
   `notifPourSynchro` ne la fait pas voyager — une adresse d'abonnement ne veut
   rien dire sur un autre téléphone. */
function marquerAPurger(ep, uid){
  if(!db.notif || !ep) return;
  if(!Array.isArray(db.notif.aPurger)) db.notif.aPurger = [];
  if(db.notif.aPurger.some(x => x && x.ep === ep)) return;
  db.notif.aPurger.push({ ep:ep, uid:uid || null, quand:Date.now() });
  /* La file ne grossit pas indéfiniment. Deux cas la rendraient éternelle : un
     compte SUPPRIMÉ (le DELETE n'aboutira jamais, la ligne serveur est partie
     avec le compte) et un compte sur lequel on ne reviendra plus. On oublie
     donc au-delà d'un mois, et on garde les dix plus récentes : passé ce
     point, insister ne répare plus rien, ça ne fait qu'alourdir la base. */
  const limite = Date.now() - 30 * 86400000;
  db.notif.aPurger = db.notif.aPurger
    .filter(x => x && x.ep && (x.quand || 0) > limite)
    .slice(-10);
  saveDB();
}
/* B11 — la purge différée. Une entrée dont le compte n'est pas celui qui est
   connecté ATTEND : la supprimer avec le jeton de quelqu'un d'autre ne ferait
   rien (RLS), et la retirer de la liste reviendrait à abandonner pour de bon. */
/* UN SEUL PASSAGE À LA FOIS, et c'est indispensable : `boot`, le retour du
   réseau et `inscrireSiBesoin` peuvent la demander dans la même seconde. Deux
   passages concurrents liraient la même file avant que le premier ne la
   réécrive, et ressusciteraient des adresses déjà supprimées. Les appelants
   partagent donc la même promesse. */
let purgeEnCours = null;
function purgerAppareils(){
  if(purgeEnCours) return purgeEnCours;
  purgeEnCours = purgerAppareilsVraiment()
    .catch(()=>{})
    .then(()=>{ purgeEnCours = null; });
  return purgeEnCours;
}
async function purgerAppareilsVraiment(){
  if(!db.notif || !Array.isArray(db.notif.aPurger) || !db.notif.aPurger.length) return;
  if(!signedIn() || !syncReady()) return;
  const reste = [];
  for(const e of db.notif.aPurger){
    if(!e || !e.ep) continue;
    /* LE GARDE-FOU LE PLUS IMPORTANT DE CETTE FONCTION. Se déconnecter ne
       résilie pas l'abonnement du NAVIGATEUR : en revenant sur le même compte,
       `abonnerAppareil` réinscrit très exactement la même adresse. Purger
       celle-ci supprimerait alors la ligne VIVANTE — et comme `db.notif.abo`
       vaudrait toujours cette adresse, `inscrireSiBesoin` croirait l'appareil
       inscrit et ne retenterait jamais : plus aucune notification, sans un mot,
       définitivement. Exactement le défaut que B11.2 corrige, retourné.
       Une adresse redevenue la nôtre sort donc de la file, sans DELETE. */
    if(db.notif.abo && e.ep === db.notif.abo) continue;
    if(e.uid && db.auth && db.auth.uid !== e.uid){ reste.push(e); continue; }
    try{
      await sbFetch('/rest/v1/push_appareils?endpoint=eq.' + encodeURIComponent(e.ep),
                    { method:'DELETE', headers:{ Prefer:'return=minimal' } });
    }catch(err){ reste.push(e); }
  }
  db.notif.aPurger = reste;
  saveDB();
}
/* B11 — LE RATTRAPAGE, un seul point d'entrée : ce qui n'a pas pu partir part
   enfin, et le bandeau tombe tout seul. Appelé par `boot()` et par le retour du
   réseau. */
async function rejouerNotifEnAttente(){
  if(!db.notif || !signedIn() || !syncReady()) return;
  /* Le même verrou que `reessayerCloches` et `reinscrire`, pour la même raison :
     `boot()` et le retour du réseau peuvent tomber dans la même seconde, et
     deux `remplacer_cloches` concurrents se croiseraient. */
  if(!prendre('cloches')) return;
  try{
    await purgerAppareils();
    if(db.notif.desyncAt) await pousserCloches();
  } finally { rendre('cloches'); }
  if(typeof view !== 'undefined' && view === 'notifs') render();
}
if(typeof window !== 'undefined' && window.addEventListener){
  window.addEventListener('online', ()=>{ try{ rejouerNotifEnAttente(); }catch(e){} });
}

/* Le bouton de rattrapage de l'écran Notifications. */
async function reinscrire(){
  /* B11 (09/08) — le même verrou que `reessayerCloches`, qui l'avait déjà, lui.
     Sans lui, un double appui lançait deux `abonnerAppareil` ET deux
     `remplacer_cloches` concurrents : deux inscriptions pour un appareil, et
     deux réécritures complètes de la liste des cloches qui se croisent. */
  if(!prendre('cloches')) return;
  render();
  let ok = false;
  try{
    ok = await abonnerAppareil();
    if(ok) await pousserCloches();
  } finally { rendre('cloches'); render(); }
  toast(ok ? 'Cet appareil est inscrit' : 'Échec — ' + (db.notif.erreur || 'raison inconnue'));
}

/* Les cloches et le réglage. On efface puis on réécrit : la liste fait
   quelques lignes, et un titre éteint doit vraiment disparaître. */
async function pousserCloches(){
  /* B11 (09/08) — DEUX RAISONS DE NE RIEN ENVOYER, ET ELLES N'ONT PAS LE MÊME
     SENS. Depuis que le drapeau se pose dès la bascule d'une cloche, ce
     `return` pouvait laisser le bandeau allumé pour toujours, avec un
     « Réessayer » qui retombait dessus sans rien changer.
       · PAS DE SERVEUR CONFIGURÉ (`!syncReady`) — il n'y a personne à qui
         parler, ni maintenant ni plus tard : le drapeau n'a aucun objet, on
         l'éteint.
       · PAS DE COMPTE OUVERT (`!signedIn`) — l'envoi est seulement REMIS : au
         retour du compte, `inscrireSiBesoin` et `rejouerNotifEnAttente` le
         rejouent. On garde donc le drapeau, et c'est l'écran qui se tait tant
         qu'il n'y a personne à prévenir (voir `viewNotifications`). */
  if(!syncReady()){
    pousseEnVol = false;
    if(db.notif && db.notif.desyncAt){
      delete db.notif.desyncAt; delete db.notif.desyncMotif; saveDB();
    }
    return;
  }
  if(!signedIn()){ pousseEnVol = false; return; }
  const cles = Object.keys(db.notif.titres);
  try{
    await sbFetch('/rest/v1/push_reglages', {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: db.auth.uid, quand: db.notif.quand,
                             films: db.notif.films, maj: new Date().toISOString() })
    });
    /* B6 — UN SEUL appel, transactionnel. L'ancien code effaçait toutes les
       cloches puis réenvoyait la liste : si le réseau tombait entre les deux —
       cas ordinaire sur mobile — le serveur restait à zéro cloche, le `catch`
       était vide, et l'écran continuait d'afficher « Activées · 3 séries ».
       « On retentera au prochain changement » : sauf qu'il n'y en avait pas.
       Désormais la base voit soit l'ancienne liste, soit la nouvelle. */
    await sbFetch('/rest/v1/rpc/remplacer_cloches', {
      method:'POST',
      body: JSON.stringify({ p_cloches: cles.map(k=>({
        type: k.slice(0, k.indexOf(':')),
        tmdb_id: Number(k.slice(k.indexOf(':')+1))
      })) })
    });
    /* Tout est passé : le drapeau de désynchronisation tombe. */
    pousseEnVol = false;                                        // B11
    if(db.notif.desyncAt){ delete db.notif.desyncAt; delete db.notif.desyncMotif; saveDB(); }
  }catch(e){
    /* B11 — l'envoi n'est plus « en route » : le bandeau doit redevenir
       actionnable dans le même rendu que celui déclenché ci-dessous. */
    pousseEnVol = false;
    /* Et si malgré tout ça rate, on le DIT. Un drapeau que l'écran sait lire,
       plutôt qu'un `catch` vide — c'est la règle que l'auteur applique partout
       ailleurs (P2 du document de specs). */
    db.notif.desyncAt = Date.now();
    db.notif.desyncMotif = (typeof motifSynchro === 'function') ? motifSynchro(e)
                                                               : String(e && e.message || e);
    saveDB();
    if(typeof view !== 'undefined' && view === 'notifs') render();
  }
}

/* Réessayer depuis l'écran des notifications. */
async function reessayerCloches(){
  if(!prendre('cloches')) return;
  render();
  try{ await pousserCloches(); } finally { rendre('cloches'); render(); }
  if(!db.notif.desyncAt) toast('Réglages enregistrés');
}

/* Un seul point d'entrée : à appeler après tout changement de cloche ou de
   réglage. Sans abonnement d'appareil, envoyer des cloches ne servirait à rien. */
let pousseTimer;
/* B11 — « un envoi est-il en route ou en attente ? ». En MÉMOIRE seulement, et
   c'est voulu : au prochain démarrage, plus rien n'est en route, et le bandeau
   doit alors proposer « Réessayer » plutôt que d'annoncer un envoi imaginaire. */
let pousseEnVol = false;
function poussserPlusTard(){
  clearTimeout(pousseTimer);
  /* B11 (09/08) — LE DRAPEAU AVANT L'ATTENTE, PAS APRÈS. On patientait 1 200 ms
     avant de pousser, sans rien noter : le cas ordinaire — on allume une
     cloche, on verrouille le téléphone dans la seconde — ne laissait aucune
     trace. Le serveur n'apprenait jamais la cloche, et l'écran continuait
     d'annoncer « Activées · 1 série » au-dessus d'un serveur vide. Le correctif
     B6 couvrait le chemin « la requête a échoué » ; celui-ci, « la requête n'est
     jamais partie ».
     Le drapeau est posé tout de suite et n'est levé que par un `pousserCloches`
     RÉUSSI. Il devient une promesse tenue : tant qu'il est là, le serveur n'a
     pas la dernière version. Le bandeau existant et le rattrapage au démarrage
     font le reste. */
  /* Sans compte ni serveur joignable, il n'y a rien à envoyer et donc rien à
     avouer : le drapeau ne se pose que quand un envoi est réellement attendu. */
  if(db.notif && signedIn() && syncReady() && !db.notif.desyncAt){
    db.notif.desyncAt = Date.now();
    db.notif.desyncMotif = 'Le réglage n\'est pas encore parti au serveur.';
    saveDB();
  }
  pousseEnVol = true;
  pousseTimer = setTimeout(async ()=>{
    if(!signedIn()){ pousseEnVol = false; return; }
    if(Object.keys(db.notif.titres).length) await abonnerAppareil();
    await pousserCloches();
    pousseEnVol = false;
  }, 1200);
}

/* ---------------------------------------------------------------------------
   Les cloches voyagent d'un appareil à l'autre

   Elles vivaient sur un seul téléphone : changer d'iPhone les perdait toutes,
   alors même que le serveur, lui, les connaissait. Elles partent donc avec la
   bibliothèque, dans la même synchro.

   Ce qui ne part pas : l'abonnement push, qui ne veut rien dire ailleurs que
   sur cet appareil ; la dernière erreur d'inscription, pour la même raison ;
   et l'étiquette « Me prévenir », qui s'adresse à un écran, pas à quelqu'un.
--------------------------------------------------------------------------- */
function notifPourSynchro(){
  if(!db.notif) return null;
  const n = db.notif;
  return { quand:n.quand, quandChoisi:!!n.quandChoisi, films:n.films,
           titres:n.titres, titresOff:n.titresOff, maj:n.maj || 0 };
}

/* Pour chaque titre, le geste le plus récent l'emporte — allumer comme
   éteindre. Sans les dates d'extinction, un appareil resté en arrière
   rallumerait des cloches qu'on vient de couper ailleurs. */
function fusionnerNotif(rem){
  if(!rem || typeof rem !== 'object' || !db.notif) return false;
  const n = db.notif;
  let change = false;

  Object.keys(rem.titresOff || {}).forEach(k=>{
    const t = rem.titresOff[k];
    if(!n.titresOff[k] || t > n.titresOff[k]) n.titresOff[k] = t;
  });
  Object.keys(rem.titres || {}).forEach(k=>{
    const t = rem.titres[k];
    if(n.titres[k] && n.titres[k] >= t) return;
    if(n.titresOff[k] && n.titresOff[k] >= t) return;   // éteinte ici après coup
    n.titres[k] = t; change = true;
  });
  Object.keys(n.titresOff).forEach(k=>{
    if(n.titres[k] && n.titresOff[k] >= n.titres[k]){ delete n.titres[k]; change = true; }
  });
  /* Une extinction vieille de trois mois n'a plus rien à arbitrer. */
  const t0 = Date.now();
  Object.keys(n.titresOff).forEach(k=>{
    if(t0 - n.titresOff[k] > RETENTION_DECOCHE) delete n.titresOff[k];
  });

  /* Le réglage est un tout : on prend celui de l'appareil qui a tranché en
     dernier, plutôt que de mélanger deux choix contradictoires. */
  if((rem.maj || 0) > (n.maj || 0)){
    /* I9 — `quand` n'a plus qu'une valeur. Un appareil resté en arrière peut
       encore envoyer `soir` ou `samedi` : on ne la reprend pas, sinon la
       synchro rallumerait le réglage qui éteint tout. */
    if(typeof rem.quandChoisi === 'boolean') n.quandChoisi = rem.quandChoisi;
    if(rem.films && typeof rem.films === 'object'){
      /* I8 — l'objet distant peut porter l'ancienne forme. On le replie sur une
         COPIE : `rem` appartient à la charge utile reçue, on n'y touche pas. */
      const rf = Object.assign({}, rem.films);
      normaliserFilmsNotif(rf);
      ['cine','maison'].forEach(k=>{
        if(typeof rf[k] === 'boolean') n.films[k] = rf[k];
      });
    }
    n.maj = rem.maj; change = true;
  }
  n.actif = Object.keys(n.titres).length > 0;
  return change;
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
    db.notif.titresOff[k] = Date.now();
    if(!Object.keys(db.notif.titres).length) db.notif.actif = false;
    saveDB(); render(); poussserPlusTard(); scheduleSync();
    toast('Tu ne seras plus prévenu pour ' + titreDe(type,id));
    return;
  }

  /* Première cloche : c'est ici, et seulement ici, qu'iOS pose sa question. */
  if(!notifAutorisees()){
    const ok = await demanderPermissionNotif();
    if(!ok){ render(); return; }
  }
  db.notif.titres[k] = Date.now();
  delete db.notif.titresOff[k];
  db.notif.actif = true;
  saveDB(); render(); poussserPlusTard(); scheduleSync();
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
  if(!nb) return { ton:'attente', titre:'Autorisées, mais aucun titre surveillé',
                   sous:'Allume la cloche sur une série ou un film.' };
  /* Autorisé et des cloches allumées, mais le serveur ne sait pas où envoyer :
     c'est le cas qu'il ne faut surtout pas taire. */
  if(!db.notif.abo)
    return { ton:'refus', titre:'Cet appareil n\'est pas inscrit',
             sous: db.notif.erreur
               ? ('Dernière tentative : ' + db.notif.erreur)
               : 'Touche « Inscrire cet appareil » ci-dessous.' };
  return { ton:'ok', titre:'Notifications autorisées', sous:'Sur cet appareil' };
}

/* Le sous-titre de la ligne des réglages : l'état tient en quelques mots. */
function resumeNotif(){
  if(!notifPossibles()) return 'Indisponible sur cet appareil';
  if(permissionNotif() === 'denied') return 'Refusées';
  if(!notifAutorisees()) return 'Désactivées';
  const t = compterCloches('tv'), f = compterCloches('movie');
  if(!t && !f) return 'Autorisées · aucun titre surveillé';
  return 'Activées · ' + t + ' série' + (t>1?'s':'') + ', ' + f + ' film' + (f>1?'s':'');
}

/* I9 — la liste `QUANDS` a disparu avec la section « Quand ». Deux de ses trois
   entrées n'existaient pas côté serveur, et les choisir coupait tout. Le jour
   où un résumé sera vraiment construit, le bon moment pour le proposer est
   celui où le problème se pose — cinq notifications dans la même soirée — et
   non une liste de réglages où personne ne va.

   I8 — deux événements de film, plus trois. « Dispo en streaming » et « Sortie
   en VOD » tapaient tous deux dans le type 4 de TMDB. */
const EVENEMENTS_FILM = [
  { v:'cine',   t:'En salle' },
  { v:'maison', t:'À la maison' }
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

  /* B6 — l'aveu. Tant que le serveur n'a pas la dernière version des cloches,
     l'écran le dit ; sans ça il affichait « Activées · 3 séries » au-dessus
     d'un serveur vide. */
  /* B11 — DEUX SITUATIONS, DEUX PHRASES. Depuis que le drapeau est posé dès la
     bascule d'une cloche, il couvre aussi la seconde et demie pendant laquelle
     l'envoi est simplement en route : annoncer « Réglages non enregistrés » à
     ce moment-là serait une fausse alerte. Tant que l'envoi est en vol, l'écran
     dit qu'il est en vol — et ne propose pas de le relancer. `pousseEnVol` vit
     en mémoire : après un redémarrage, plus rien n'est en route, et c'est bien
     l'aveu complet qui s'affiche. */
  /* B11 — et rien à avouer tant qu'il n'y a pas de compte : l'envoi est remis,
     pas perdu, et un bandeau d'alerte devant quelqu'un qui vient de se
     déconnecter ne décrirait rien qu'il puisse réparer. */
  if(db.notif.desyncAt && signedIn()){
    const enVol = pousseEnVol;
    html += '<div class="wrap" style="padding-top:10px;padding-bottom:0">'+
      '<div class="banner" style="margin:0;display:flex;align-items:center;gap:12px">'+
        '<div style="flex:1"><b>'+(enVol ? 'Enregistrement en cours…'
                                         : 'Réglages non enregistrés')+'</b><br>'+
          '<span class="small">'+(enVol
            ? 'Tes alertes partent au serveur.'
            : esc(db.notif.desyncMotif || 'La connexion a été perdue '+
              'en cours d\'enregistrement.')+' Le serveur n\'a pas la dernière version '+
              'de tes alertes.')+'</span></div>'+
        (enVol ? ''
          : '<button class="btn" style="flex:0 0 auto;padding:9px 16px" '+
            (occupe('cloches') ? 'disabled ' : '')+'onclick="reessayerCloches()">'+
            (occupe('cloches') ? '…' : 'Réessayer')+'</button>')+
      '</div></div>';
  }

  if(notifPossibles() && notifAutorisees() && !db.notif.abo){
    html += '<div class="wrap" style="padding-top:0">'+
      '<button class="btn block" onclick="reinscrire()">Inscrire cet appareil</button>'+
      '<div class="tiny muted" style="margin-top:8px">Nécessaire une seule fois par '+
      'téléphone : c\'est ce qui dit au serveur où envoyer.</div></div>';
  }

  html += '<div class="sectitle">Mes films</div><div class="wrap" style="padding-top:0">'+
    '<div class="fchips">'+
      EVENEMENTS_FILM.map(f=>'<button class="chip'+(db.notif.films[f.v]?' on':'')+'" '+
        'onclick="basculerEvenementFilm(\''+f.v+'\')">'+f.t+'</button>').join('')+
    '</div>'+
    '<div class="small muted" style="margin-top:10px">Ces réglages ne concernent que les films '+
    'où tu as allumé la cloche. « À la maison » couvre le streaming et la location.</div>'+
  '</div>';

  const t = compterCloches('tv'), f = compterCloches('movie');
  html += '<div class="sectitle">Titres surveillés</div><div class="wrap" style="padding-top:0">'+
    '<button class="reg" onclick="go(\'clochettes\',{from:\'notifs\'})">'+
      '<i>'+I.cloche+'</i>'+
      '<span class="rtxt"><b>Voir la liste</b><em>'+
        t+' série'+(t>1?'s':'')+', '+f+' film'+(f>1?'s':'')+'</em></span>'+
      '<span class="ecaret">'+I.caret+'</span></button>'+
    '<div class="tiny muted" style="margin-top:12px">La cloche s\'allume aussi directement '+
    'depuis la fiche d\'une série ou d\'un film.</div>'+
  '</div>';

  /* I9 — la promesse que l'app tient vraiment, écrite une fois, à la place du
     choix de fréquence qui n'en était pas un. */
  html += '<div class="wrap tiny muted" style="padding-top:18px;padding-bottom:30px">'+
    'Tu es prévenu dès qu\'un épisode ou un film que tu surveilles sort.<br><br>'+
    'Sur iPhone, la vignette d\'une notification est toujours l\'icône de l\'app : '+
    'Apple n\'autorise pas les affiches pour une app web.</div>';
  return html;
}
function basculerEvenementFilm(v){
  db.notif.films[v] = !db.notif.films[v];
  /* Tout éteindre reviendrait à laisser des cloches allumées sans qu'aucun
     événement ne les déclenche : on garde au moins la sortie en salle. */
  if(!EVENEMENTS_FILM.some(f=>db.notif.films[f.v])) db.notif.films.cine = true;
  db.notif.maj = Date.now();
  saveDB(); render(); poussserPlusTard(); scheduleSync();
}

/* ---------- La liste des titres où la cloche est allumée ---------- */

function viewClochettes(){
  /* I9 — `nettoyerCloches()` était appelé ICI, c'est-à-dire depuis une fonction
     de rendu. Il MUTE `db` (il retire les cloches des titres disparus et date
     leur extinction) sans enregistrer : la modification attendait qu'un autre
     geste appelle `saveDB` pour être écrite, et disparaissait si l'app se
     fermait avant. Un rendu doit lire, jamais écrire.
     Le nettoyage a lieu au démarrage (`boot`) et après une fusion distante
     (`mergeRemote`), qui sont les deux seuls moments où un titre peut avoir
     quitté la bibliothèque sans que les cloches l'aient su. */
  let html = header('Titres surveillés', {back:"goBack()"});

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
