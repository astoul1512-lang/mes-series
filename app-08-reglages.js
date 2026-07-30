"use strict";
/* ---------- Vue : Réglages ---------- */
function viewSettings(){
  /* Cet écran a absorbé l'ancien menu ⋮ du profil : les deux contenaient les
     mêmes actions sous des noms différents (« Exporter une sauvegarde » ici,
     « Exporter mes données » là), et personne ne savait plus où aller.
     Un seul endroit, des groupes nommés, et revenir d'une sous-page ramène ici
     puisque c'est un écran et non un panneau flottant. */
  const ligne = (txt, sous, action, icone, danger)=>
    '<button class="reg'+(danger?' danger':'')+'" onclick="'+action+'">'+
      '<i>'+icone+'</i>'+
      '<span class="rtxt"><b>'+txt+'</b>'+(sous?'<em>'+sous+'</em>':'')+'</span>'+
      '<span class="ecaret">'+I.caret+'</span>'+
    '</button>';

  let html = header('Mon compte et réglages', {back:"goBack()"});

  /* Une carte d'identité, pas un bouton : ce qu'on peut faire est listé juste
     en dessous, nommé. Le gros bloc cliquable qui menait à l'avatar était
     précisément ce qui trompait tout le monde. */
  const qui = (db.pseudo||'').trim();
  const depuis = plusAnciennementAjoute();
  html += '<div class="wrap"><div class="entete">'+
    avatarMoi('gros')+
    '<div class="etxt">'+
      '<div class="enom">'+(qui ? esc(qui) : 'Ton profil')+'</div>'+
      '<div class="tiny muted">'+(depuis ? 'Membre depuis '+depuis : 'Bienvenue')+'</div>'+
    '</div></div></div>';

  html += '<div class="sectitle">Mon compte</div><div class="wrap" style="padding-top:0">'+
    ligne('Modifier mon profil', 'Prénom, avatar ou photo',
          "go('moi',{from:'settings'})", I.user)+
    ligne(signedIn() ? 'Compte et synchronisation' : 'Sauvegarder en ligne',
          signedIn() ? esc(db.auth.email||'') : 'Tes séries à l\'abri, sur tous tes appareils',
          "go('account',{from:'settings'})", I.refresh)+
    ligne('Mes abonnements',
          signedIn() ? 'La bibliothèque de tes proches' : 'Nécessite un compte',
          "ouvrirAbosDepuisReglages()", I.user)+
  '</div>';

  const nbShows = Object.keys(db.shows).length;
  /* Le rappel d'export ne concerne que ceux dont c'est la seule copie : une fois
     le compte connecté et la synchro passée, la sauvegarde est déjà faite. */
  /* Le compte étant obligatoire, plus personne n'est « sans compte ». Le rappel
     ne vise donc que celui dont la première synchro n'a jamais abouti : là, le
     fichier d'export est bien sa seule copie. */
  const oldExport = !db.syncedAt &&
                    (!db.lastExport || (Date.now()-db.lastExport) > 30*86400000);
  html += '<div class="sectitle">Mes données</div><div class="wrap" style="padding-top:0">'+
    (memoryOnly ? '<div class="banner" style="margin:0 0 14px">Le stockage du navigateur est indisponible ici : '+
      '<b>tes données seront perdues à la fermeture</b>. Ouvre l\'app depuis une vraie adresse (https) pour la sauvegarde automatique, ou exporte régulièrement.</div>'
     : (nbShows && oldExport ? '<div class="banner" style="margin:0 0 14px">'+
        (db.lastExport ? 'Dernière sauvegarde il y a plus d\'un mois.' : 'Tu n\'as jamais fait de sauvegarde.')+
        ' <b>Exporte ton fichier de temps en temps</b> : c\'est ta seule copie de secours si tu changes de téléphone.</div>' : ''))+
    '<div class="tiny muted" style="margin:0 0 12px">Le fichier contient ta bibliothèque et tes '+
      'réglages. Il ne contient aucun mot de passe ni identifiant de connexion.</div>'+
    ligne('Exporter une sauvegarde',
          db.lastExport ? 'Dernière : '+fmtDate(new Date(db.lastExport).toISOString().slice(0,10))
                        : 'Ta bibliothèque et tes réglages, sans identifiants',
          "exportData()", I.bookmark)+
    ligne('Importer une sauvegarde', 'Remplace la bibliothèque',
          "document.getElementById('imp').click()", I.plus)+
    '<input type="file" id="imp" accept="application/json,.json" style="display:none" onchange="importData(this)">'+
    ligne('Actualiser toutes les séries', 'Nouveaux épisodes et affiches',
          "refreshAll()", I.refresh)+
    ligne('Tout effacer', 'Vide la bibliothèque de cet appareil', "wipe()", I.close, true)+
  '</div>';

  html += '<div class="sectitle">Application</div><div class="wrap" style="padding-top:0">'+
    ligne('Mes goûts', resumeGouts(), "go('gouts',{from:'settings'})", I.coeur)+
    /* Rangé ici, sous « Application », et NON dans « Mon compte » : le groupe
       du haut contient déjà « Mes abonnements », qui désigne les proches qu'on
       suit. Deux lignes voisines nommées presque pareil pour deux choses sans
       rapport, c'est exactement le désordre que cet écran a fini par ranger. */
    ligne('Mes plateformes', resumePlates(), "go('plates',{from:'settings'})", I.tv)+
    ligne('Notifications', resumeNotif(), "go('notifs',{from:'settings'})", I.cloche)+
    '<div style="height:14px"></div>'+
    '<div class="tiny muted" style="margin:0 0 12px">Les affiches, les résumés et les dates '+
      'de diffusion viennent de TMDB. Tu n\'as rien d\'autre à configurer.</div>'+
    '<label class="fld"><span>Langue des fiches</span>'+
      '<select id="lang" onchange="saveSettings()">'+
        ['fr-FR','en-US','es-ES','de-DE','it-IT'].map(l=>'<option value="'+l+'" '+(db.lang===l?'selected':'')+'>'+l+'</option>').join('')+
      '</select></label>'+
  '</div>';

  html += '<div class="wrap tiny muted center" style="padding-top:6px;padding-bottom:30px">'+
    'Mes Séries · données stockées uniquement sur cet appareil<br>Données films/séries fournies par TMDB.</div>';
  return html;
}

/* Les abonnements gardent leur provenance : on revient sur les réglages, pas
   sur le profil. */
function ouvrirAbosDepuisReglages(){
  go('abos', {from:'settings'});
  if(signedIn()) chargerPartage();
}

function saveSettings(){
  const el = document.getElementById('lang');
  if(!el || el.value === db.lang) return;
  db.lang = el.value;
  saveDB(); toast('Langue des fiches enregistrée');
}
function exportData(){
  /* Un export part dans iCloud, dans un dossier Téléchargements, dans un mail.
     Il ne doit JAMAIS contenir de quoi ouvrir une session : `db.auth` porte le
     jeton de rafraîchissement, qui survit à un changement de mot de passe et
     permet de lire la bibliothèque, de modifier le profil vu par les proches,
     et de supprimer le compte. `db.sync` n'a rien à y faire non plus : ces
     coordonnées sont publiables, mais elles trompent si le fichier est
     réimporté sur une autre configuration.

     Copie de surface : `shows` et `movies` restent partagés avec `db`, on ne
     fait que les lire. */
  const copie = Object.assign({}, db);
  delete copie.auth;
  delete copie.sync;
  const blob = new Blob([JSON.stringify(copie,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mes-series-'+todayISO()+'.json';
  a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  db.lastExport = Date.now(); saveDB(); render();
  toast('Sauvegarde générée');
}
const objetSimple = o => !!o && typeof o === 'object' && !Array.isArray(o);
let importEnAttente = null;

function importData(input){
  const f = input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    let d;
    try{ d = JSON.parse(r.result); }catch(e){ return toast('Fichier illisible'); }
    if(!objetSimple(d) || !objetSimple(d.shows) || (d.movies !== undefined && !objetSimple(d.movies)))
      return toast('Ce fichier n\'est pas une sauvegarde Mes séries');

    importEnAttente = d;
    const nb = Object.keys(d.shows).length, nf = Object.keys(d.movies||{}).length;
    const actuel = Object.keys(db.shows).length + Object.keys(db.movies).length;
    if(!actuel) return appliquerImport();
    openSheet('<h3>Remplacer la bibliothèque ?</h3>'+
      '<p class="small muted" style="margin:0 0 8px">La sauvegarde contient '+nb+' série(s) et '+nf+
      ' film(s). Elle remplacera les '+actuel+' titre(s) actuellement enregistrés, ici et sur les '+
      'appareils synchronisés.</p>'+
      '<button class="opt danger" onclick="closeSheet();appliquerImport()">Remplacer</button>'+
      '<button class="opt" onclick="closeSheet();importEnAttente=null">Annuler</button>');
  };
  r.readAsText(f);
  input.value='';
}
/* On note les titres qui disparaissent : sans cela, la synchro les ramènerait. */
function appliquerImport(){
  const d = importEnAttente; if(!d) return;
  importEnAttente = null;
  const neufs = { shows: d.shows||{}, movies: d.movies||{} };
  const del = db.deleted = db.deleted || {shows:{},movies:{}};
  ['shows','movies'].forEach(k=>{
    Object.keys(db[k]).forEach(id=>{ if(!neufs[k][id]) markDeleted(k, id); });
    /* un titre restauré depuis une sauvegarde doit l'emporter sur son ancienne suppression */
    Object.keys(neufs[k]).forEach(id=>{
      const it = neufs[k][id];
      if(it && del[k][id] && del[k][id] >= (it.addedAt||0)) it.addedAt = Date.now();
    });
  });
  db.shows = neufs.shows; db.movies = neufs.movies;
  if(d.lang) db.lang = d.lang;
  /* B8 — l'export contient les goûts, le profil et les cloches depuis A2 :
     les ignorer à l'import, c'était promettre une sauvegarde qui n'en était
     pas une. On les reprend, puis on remet les champs manquants d'une version
     antérieure à leur place. */
  if(d.gouts && typeof d.gouts === 'object'){
    db.gouts = d.gouts;
    if(typeof migrerGouts === 'function') migrerGouts();
  }
  if(d.profil && typeof d.profil === 'object') db.profil = d.profil;
  if(d.notif && typeof d.notif === 'object'){
    db.notif = d.notif;
    if(typeof migrerNotif === 'function') migrerNotif();
  }
  saveDB(); render(); toast('Données importées');
}
async function refreshAll(){
  const ids = Object.keys(db.shows);
  if(!ids.length) return toast('Aucune série');
  toast('Actualisation de '+ids.length+' série(s)…');
  let ok = 0;
  for(const id of ids){
    try{
      const fresh = await fetchShowFull(id);
      const ancien = db.shows[id];
      fresh.watched = ancien.watched; fresh.addedAt = ancien.addedAt;
      if(ancien.unwatched) fresh.unwatched = ancien.unwatched;
      if(ancien.pause){ fresh.pause = true; fresh.pauseLe = ancien.pauseLe; }   // une actualisation groupée ne réveille pas une série mise de côté
      db.shows[id] = fresh; ok++;
    }catch(e){}
    await sleep(120);
  }
  saveDB(); render(); toast(ok+' série(s) actualisée(s)');
}
function wipe(){
  openSheet('<h3>Tout effacer ?</h3><p class="small muted" style="margin:0 0 8px">'+
    'Séries, films et progression seront supprimés définitivement de cet appareil.</p>'+
    '<button class="opt danger" onclick="doWipe()">Oui, tout effacer</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}
function doWipe(){
  /* On marque chaque titre comme supprimé, sinon la synchro les ferait revenir. */
  ['shows','movies'].forEach(k=> Object.keys(db[k]).forEach(id=> markDeleted(k, id)));
  db.shows = {}; db.movies = {};
  saveDB(); closeSheet(); go('follow'); toast('Données effacées');
}

/* ============================ Démarrage ============================ */
async function boot(){
  await loadDB();
  /* B7 — le registre de migrations, AVANT le premier rendu et après la lecture
     de la base. Il porte désormais aussi la remise en forme douce (présence de
     `watched`/`seasons`, renommage `ep.s → ep.st`), rapatriée depuis ici avec
     son test : `migrer()` seul doit suffire à rendre la base exploitable.
     `migrerNotif` et `migrerGouts` restent dehors — un par un, chacun avec son
     test, sinon on déplace du code sans filet. */
  if(typeof migrer === 'function') migrer();
  /* Les préférences de notification n'existent pas dans les bases d'avant :
     on les crée avant le premier rendu, sinon l'écran des réglages plante. */
  migrerNotif();
  migrerGouts();
  /* Les abonnements déclarés arrivent cochés dans la feuille de filtres. Ici,
     après `migrerGouts` et avant le premier rendu : `ui` est bâti au chargement
     du script, quand la base n'est pas encore lue. */
  semerPlatesFiltres();
  nettoyerCloches();
  askPersist();
  document.body.classList.remove('booting');
  render();
  /* Arrivée par un lien de réinitialisation : elle passe avant tout le reste,
     y compris la mise en route — le lien ne dure qu'une heure. */
  if(typeof lireLienReinit === 'function' && lireLienReinit()) return go('motdepasse');
  /* Sans session, l'app s'ouvre sur la porte d'entrée, avec l'onglet le plus
     probable selon que l'appareil a déjà connu un compte ou non. */
  if(!signedIn()) demarrerAccueil();
  if(memoryOnly) toast('Stockage indisponible : pense à exporter tes données');
  if(syncReady() && signedIn()){ syncNow(true); majProfil(); chargerPartage(); inscrireSiBesoin(); }
}
/* `test.html` charge les mêmes fichiers dans le même ordre, pour éprouver le
   VRAI code et non une copie. Il pose `MODE_TEST` avant de les charger : sans
   ce garde-fou, `boot()` démarrerait l'app pour de bon au milieu des tests —
   IndexedDB, synchro et tout le reste. */
if(!window.MODE_TEST) boot();

/* Service worker : démarrage instantané et fonctionnement hors-ligne.
   Pas en mode test : la page de tests n'a rien à mettre en cache, et un SW
   enregistré depuis elle servirait l'app par-dessus. */
if(!window.MODE_TEST && 'serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}
