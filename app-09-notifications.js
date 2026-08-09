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
   Idempotent : rejouable sans effet.

   S7 (09/08) — CE PLIAGE RESTE. La spec demandait de le retirer, et ce serait
   une régression : ce n'est pas un repli défensif, c'est LA MIGRATION, et elle
   est la seule. La base locale de quelqu'un qui n'a pas rouvert l'app depuis le
   30/07 porte encore `{cine, stream, vod}`. Sans ce pliage, elle ne resterait
   pas en l'état : la ligne suivante de `migrerNotif` remettrait `maison` à
   `true` par défaut, et quelqu'un qui avait ÉTEINT « À la maison » recevrait de
   nouveau les notifications qu'il a refusées.

   Son jumeau serveur (`genresVoulus`, notifier/index.ts) reste lui aussi, pour
   la raison symétrique : tant qu'un appareil peut écrire l'ancienne forme dans
   `push_reglages`, la replier vaut mieux que la lire de travers. Les deux
   partiront ENSEMBLE, au lot qui suivra la bascule complète de la version — la
   preuve à exiger est le contrôle n°4 de la migration 012. */
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

/* ---------------------------------------------------------------------------
   C7 (09/08) — CET APPAREIL SONNE POUR LE COMPTE CONNECTÉ, ET POUR LUI SEUL

   L'envoi partait avec `Prefer: resolution=merge-duplicates` mais SANS dire sur
   quelle colonne résoudre. La clé primaire de `push_appareils` est `id uuid`,
   tirée au hasard : elle ne collisionne jamais. C'est `endpoint` qui porte
   l'unicité — et la violation remontait donc en 409, sans jamais rien
   remplacer. Deux conséquences, toutes deux constatables :

     · réinstaller la PWA (le navigateur rend le MÊME endpoint) rendait la
       réinscription impossible, avec un message PostgREST brut à l'écran ;
     · si B se connecte sur le téléphone de A sans que A se soit déconnecté, la
       ligne de A survit : A continue de recevoir SES notifications sur le
       téléphone de B, et B n'en reçoit aucune.

   DEUX CHEMINS, ET L'ORDRE COMPTE.
     1. `?on_conflict=endpoint` : l'upsert remplace la ligne au même endpoint,
        `user_id` compris. Suffit dans le cas courant — la ligne est déjà la
        nôtre, ou elle n'existe pas.
     2. Si la ligne appartient à QUELQU'UN D'AUTRE, l'UPDATE sous-jacent porte
        sur une ligne que la policy « mes lignes seulement » (003) rend
        invisible : Postgres refuse, et il a raison. On passe alors par
        `reprendre_endpoint`, une fonction `security definer` qui n'a le droit
        que d'une chose — effacer la ligne à cet endpoint, puis en insérer une
        pour l'appelant (migration 012).

   Le premier chemin d'abord, et pas l'inverse : la fonction serveur peut ne pas
   être installée (migration pas encore jouée), et l'immense majorité des
   inscriptions n'en a aucun besoin.
--------------------------------------------------------------------------- */
async function poserAbonnement(j){
  const corps = { user_id: db.auth.uid, endpoint: j.endpoint,
                  p256dh: j.keys.p256dh, auth: j.keys.auth,
                  vu: new Date().toISOString(), echecs: 0 };
  try{
    await sbFetch('/rest/v1/push_appareils?on_conflict=endpoint', {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(corps)
    });
    return true;
  }catch(e){
    /* Cet appareil appartient à un autre compte. C'est le seul cas où l'on
       insiste, et on n'insiste que pour ça : un 409 (unicité) ou un 403/42501
       (la policy refuse de toucher la ligne d'autrui). Toute autre erreur —
       réseau, jeton, serveur — remonte telle quelle. */
    const st = e && e.status;
    const msg = String((e && e.message) || '');
    if(st !== 409 && st !== 403 && st !== 401 && !/policy|permission|duplicate|unique/i.test(msg)) throw e;
    if(st === 401) throw e;                       // ce n'est pas un conflit, c'est une session morte
    await sbFetch('/rest/v1/rpc/reprendre_endpoint', {
      method:'POST',
      body: JSON.stringify({ p_endpoint: j.endpoint,
                             p_p256dh: j.keys.p256dh, p_auth: j.keys.auth })
    });
    return true;
  }
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
    await poserAbonnement(j);
    db.notif.abo = j.endpoint; db.notif.erreur = null; saveDB();
    return true;
  }catch(e){
    return echecAbo(etape + ' — ' + motifAbonnement(e));
  }
}

/* C7 — le message affiché quand l'inscription rate. Un 409 qui survit aux deux
   chemins ci-dessus veut dire une chose et une seule, et il faut la dire dans
   la langue de la personne plutôt que dans celle de PostgREST — qui répondait
   jusqu'ici « duplicate key value violates unique constraint
   push_appareils_endpoint_key », affiché tel quel sur l'écran des
   notifications. */
function motifAbonnement(e){
  const st = e && e.status;
  const brut = String((e && (e.message || e.name)) || 'erreur inconnue');
  if(st === 409 || /duplicate key|unique constraint/i.test(brut))
    return 'cet appareil était inscrit pour un autre compte — réessaie';
  if(st === 404 || /reprendre_endpoint/i.test(brut))
    return 'le serveur n\'a pas encore la mise à jour des notifications (migration 013)';
  return brut.slice(0, 120);
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
  db.notif.abo = null; db.notif.erreur = null; saveDB();
  if(!ep || !signedIn() || !syncReady()) return;
  /* RLS oblige : cette requête ne peut toucher que les lignes de la personne
     connectée, le filtre sur l'adresse suffit. */
  sbFetch('/rest/v1/push_appareils?endpoint=eq.' + encodeURIComponent(ep),
          { method:'DELETE', headers:{ Prefer:'return=minimal' } }).catch(()=>{});
}

/* Le bouton de rattrapage de l'écran Notifications. */
async function reinscrire(){
  const ok = await abonnerAppareil();
  if(ok) await pousserCloches();
  render();
  toast(ok ? 'Cet appareil est inscrit' : 'Échec — ' + (db.notif.erreur || 'raison inconnue'));
}

/* Les cloches et le réglage. On efface puis on réécrit : la liste fait
   quelques lignes, et un titre éteint doit vraiment disparaître. */
async function pousserCloches(){
  if(!signedIn() || !syncReady()) return;
  const cles = Object.keys(db.notif.titres);
  /* RELECTURE DU 09/08 — LA FENÊTRE OÙ CET ENVOI DÉTRUIT AU LIEU DE DIRE.
     `remplacer_cloches` REMPLACE : une liste vide efface toutes les cloches du
     compte côté serveur. C'est voulu — c'est comme ça qu'une cloche éteinte
     disparaît vraiment. Mais après un changement de compte, la base locale est
     vide et n'a pas encore vu le serveur : `inscrireSiBesoin()` part en même
     temps que la première synchro, et si celle-ci échoue (métro, avion,
     serveur en panne), cet envoi effaçait TOUTES les cloches que la personne
     avait posées ailleurs. Silencieusement, et sans que rien ne les ramène.
     Une liste vide qui n'a jamais été confrontée au serveur ne prouve rien :
     on ne la fait pas valoir. Une liste NON vide, elle, est un état local
     explicite et part comme avant. Le cas se répare tout seul dès que la
     synchro aboutit (`db.syncedAt` est posé, les cloches sont redescendues). */
  if(!cles.length && !db.syncedAt) return;
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
    if(db.notif.desyncAt){ delete db.notif.desyncAt; delete db.notif.desyncMotif; saveDB(); }
  }catch(e){
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
function poussserPlusTard(){
  clearTimeout(pousseTimer);
  pousseTimer = setTimeout(async ()=>{
    if(!signedIn()) return;
    if(Object.keys(db.notif.titres).length) await abonnerAppareil();
    await pousserCloches();
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
  if(db.notif.desyncAt){
    html += '<div class="wrap" style="padding-top:10px;padding-bottom:0">'+
      '<div class="banner" style="margin:0;display:flex;align-items:center;gap:12px">'+
        '<div style="flex:1"><b>Réglages non enregistrés</b><br>'+
          '<span class="small">'+esc(db.notif.desyncMotif || 'La connexion a été perdue '+
          'en cours d\'enregistrement.')+' Le serveur n\'a pas la dernière version '+
          'de tes alertes.</span></div>'+
        '<button class="btn" style="flex:0 0 auto;padding:9px 16px" '+
          (occupe('cloches') ? 'disabled ' : '')+'onclick="reessayerCloches()">'+
          (occupe('cloches') ? '…' : 'Réessayer')+'</button>'+
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
