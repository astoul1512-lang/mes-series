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

  /* I10.4 — l'actualisation groupée dure plusieurs minutes et ne disait rien.
     Un bandeau plutôt qu'une fenêtre : elle bloquerait l'écran tout ce
     temps-là pour une tâche qui n'attend rien de personne. */
  html += blocMajSeries();

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

  /* POINT 22 (02/08, parti pris A) — l'ordre suit l'usage, pas l'historique du
     fichier. « Mes goûts » était la 8ᵉ ligne alors que c'est la plus ouverte :
     elle passe en tête. Et les titres nomment enfin l'usage du groupe —
     « Application » ne disait rien, puisque tout est l'application.
     Aucune entrée n'est ajoutée ni retirée : seuls l'ordre, les groupes, les
     titres et l'emplacement des paragraphes changent. */
  html += '<div class="sectitle">Ce que l\'app me propose</div><div class="wrap" style="padding-top:0">'+
    ligne('Mes goûts', resumeGouts(), "go('gouts',{from:'settings'})", I.coeur)+
    /* Le commentaire d'origine justifiait d'ÉLOIGNER cette ligne de
       « Mes abonnements », dont le nom ressemblait trop à « Mes plateformes ».
       La cause est corrigée à la source (02/08) : « Mes abonnements » s'appelle
       désormais « Mon cercle », mot que l'app emploie déjà partout ailleurs
       (voir `dans_mon_cercle()` et /supabase/migrations/004_dans_mon_cercle.sql).
       Plus de collision de noms, donc plus aucune raison de disperser l'écran :
       ne défaites pas ce rangement au nom de l'ancienne raison, elle est fausse. */
    ligne('Mes plateformes', resumePlates(), "go('plates',{from:'settings'})", I.tv)+
    ligne('Notifications', resumeNotif(), "go('notifs',{from:'settings'})", I.cloche)+
    /* La langue flottait seule, sous un paragraphe, sans groupe. Elle rejoint
       celui auquel elle appartient : c'est un réglage de ce que l'app propose. */
    '<label class="fld"><span>Langue des fiches</span>'+
      '<select id="lang" onchange="saveSettings()">'+
        /* I10.3 — « fr-FR » est un code de programmeur. La valeur envoyée à TMDB
           ne change pas ; seul l'intitulé lu par la personne change. */
        LANGUES.map(l=>'<option value="'+l.v+'" '+(db.lang===l.v?'selected':'')+'>'+l.t+'</option>').join('')+
      '</select></label>'+
  '</div>';

  /* Le compte de proches suivis n'est pas calculé ici : `partage.suivis` est
     déjà rempli par `chargerPartage()` au démarrage. On l'affiche s'il est là,
     on ne déclenche RIEN pour l'obtenir — cet écran ne doit pas dépendre du
     réseau pour se dessiner. */
  const nbSuivis = (typeof partage === 'object' && partage.charge) ? partage.suivis.length : 0;
  html += '<div class="sectitle">Moi et mes proches</div><div class="wrap" style="padding-top:0">'+
    ligne('Modifier mon profil', 'Prénom, avatar ou photo',
          "go('moi',{from:'settings'})", I.user)+
    /* POINT 22 (02/08) — SEUL renommage de ce point : « Mes abonnements » →
       « Mon cercle ». La destination et le code ne bougent pas : c'est toujours
       `ouvrirAbosDepuisReglages()` et l'écran `abos`. */
    ligne('Mon cercle',
          signedIn() ? 'La bibliothèque de tes proches'+
                       (nbSuivis ? ' · '+nbSuivis+' abonnement'+(nbSuivis>1?'s':'') : '')
                     : 'Nécessite un compte',
          "ouvrirAbosDepuisReglages()", I.user)+
    ligne(signedIn() ? 'Compte et synchronisation' : 'Sauvegarder en ligne',
          signedIn() ? esc(db.auth.email||'') : 'Tes séries à l\'abri, sur tous tes appareils',
          "go('account',{from:'settings'})", I.refresh)+
  '</div>';

  const nbShows = Object.keys(db.shows).length;
  /* Le rappel d'export ne concerne que ceux dont c'est la seule copie : une fois
     le compte connecté et la synchro passée, la sauvegarde est déjà faite. */
  /* Le compte étant obligatoire, plus personne n'est « sans compte ». Le rappel
     ne vise donc que celui dont la première synchro n'a jamais abouti : là, le
     fichier d'export est bien sa seule copie. */
  const oldExport = !db.syncedAt &&
                    (!db.lastExport || (Date.now()-db.lastExport) > 30*86400000);
  /* Les trois bandeaux restent EN TÊTE de ce groupe et n'ont pas suivi le
     paragraphe explicatif vers le bas : ils annoncent une donnée en danger,
     donc ils doivent être lus avant qu'on décide de ne pas exporter. */
  html += '<div class="sectitle">Sauvegarde et entretien</div><div class="wrap" style="padding-top:0">'+
    (memoryOnly ? '<div class="banner" style="margin:0 0 14px">Le stockage du navigateur est indisponible ici : '+
      '<b>tes données seront perdues à la fermeture</b>. Ouvre l\'app depuis une vraie adresse (https) pour la sauvegarde automatique, ou exporte régulièrement.</div>'
     /* F4 — le basculement sur IndexedDB seul était silencieux. Il n'est pas
        grave : rien n'est perdu tant que l'app se ferme normalement. Mais sans
        le second canal, une terminaison brutale d'iOS peut coûter les dernières
        secondes de cochage — et ça, ça se dit. */
     : (db.miroirSature ? '<div class="banner" style="margin:0 0 14px">La copie de secours rapide '+
        'ne tient plus dans ce navigateur : tes données sont enregistrées, mais '+
        '<b>les toutes dernières secondes pourraient se perdre</b> si le téléphone coupe l\'app brutalement. '+
        'Un export de temps en temps met à l\'abri.</div>'
     : (nbShows && oldExport ? '<div class="banner" style="margin:0 0 14px">'+
        (db.lastExport ? 'Dernière sauvegarde il y a plus d\'un mois.' : 'Tu n\'as jamais fait de sauvegarde.')+
        ' <b>Exporte ton fichier de temps en temps</b> : c\'est ta seule copie de secours si tu changes de téléphone.</div>' : '')))+
    ligne('Exporter une sauvegarde',
          db.lastExport ? 'Dernière : '+fmtDate(new Date(db.lastExport).toISOString().slice(0,10))
                        : 'Ta bibliothèque et tes réglages, sans identifiants',
          "exportData()", I.bookmark)+
    ligne('Importer une sauvegarde', 'Remplace la bibliothèque',
          "document.getElementById('imp').click()", I.plus)+
    '<input type="file" id="imp" accept="application/json,.json" style="display:none" onchange="importData(this)">'+
    ligne('Actualiser toutes les séries', 'Nouveaux épisodes et affiches',
          "refreshAll()", I.refresh)+
  '</div>';

  /* Le paragraphe coupait la liste en deux, entre le titre du groupe et la
     première action. Il passe SOUS le groupe : c'est une précision qu'on lit
     après avoir vu ce qu'on peut faire, pas un préambule à traverser. */
  html += '<div class="wrap tiny muted" style="padding-top:0;padding-bottom:10px">'+
    'Le fichier contient ta bibliothèque et tes réglages. Il ne contient aucun '+
    'mot de passe ni identifiant de connexion.</div>';

  /* POINT 22 (02/08) — « Tout effacer » sort du groupe et finit seul, en bas.
     Il était collé à « Actualiser toutes les séries », une action banale et
     répétable : le voisinage suggérait qu'il l'était aussi. Le libellé, le
     sous-titre et la confirmation de `wipe()` ne changent pas. */
  html += '<div class="wrap" style="padding-top:0">'+
    /* I10.2 — le sous-titre disait « de cet appareil ». C'était faux : `doWipe`
       appelle `markDeleted` sur chaque titre, donc la suppression remonte au
       serveur et redescend sur tous les appareils. Un libellé qui minimise une
       action irréversible est un piège, pas une imprécision. */
    ligne('Tout effacer', 'Vide ta bibliothèque partout : cet appareil, tes autres appareils et la sauvegarde en ligne',
          "wipe()", I.close, true)+
  '</div>';

  /* I10.1 — « données stockées uniquement sur cet appareil » était faux depuis
     que le compte est obligatoire : tout part dans l'espace en ligne, et un
     proche abonné lit la ligne entière. Une phrase rassurante et fausse est
     pire qu'une phrase exacte : elle empêche de se poser la question. */
  /* Le paragraphe TMDB coupait lui aussi la liste, juste avant la langue des
     fiches. Il rejoint le pied de page, qui est déjà l'endroit où l'app dit
     d'où viennent les données. Son texte est repris MOT POUR MOT, comme celui
     du pied : ce point ne déplace que des paragraphes, il n'en réécrit aucun.
     À noter pour un point ultérieur : les deux phrases se recouvrent
     largement, il y aura une fusion à trancher. */
  html += '<div class="wrap tiny muted center" style="padding-top:6px;padding-bottom:30px">'+
    'Mes Séries · tes données sont sur cet appareil et dans ton espace en ligne. '+
    'Personne d\'autre que toi et les proches que tu as invités n\'y a accès.<br>'+
    'Données films/séries fournies par TMDB.<br>'+
    'Les affiches, les résumés et les dates de diffusion viennent de TMDB. '+
    'Tu n\'as rien d\'autre à configurer.</div>';
  return html;
}

/* La langue demandée à TMDB, et son nom en clair. La valeur ne bouge pas :
   c'est elle qui part dans `?language=`. */
const LANGUES = [
  { v:'fr-FR', t:'Français' }, { v:'en-US', t:'Anglais' }, { v:'es-ES', t:'Espagnol' },
  { v:'de-DE', t:'Allemand' }, { v:'it-IT', t:'Italien' }
];

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
/* ---------------------------------------------------------------------------
   I10.4 — actualiser toutes les séries, en le disant.

   Pour 103 séries c'est de l'ordre de 210 requêtes et plusieurs minutes. Avant,
   un toast au départ, plus rien ensuite, et chaque échec avalé par un `catch`
   nu : on ne savait ni où on en était, ni ce qui avait raté.

   Le document proposait de brancher le callback `onStep` de `fetchShowFull`.
   Vérifié : `onStep` compte les PAQUETS DE SAISONS D'UNE SEULE SÉRIE, pas les
   séries. Il donnerait « 20/24 saisons » d'un titre dont on ignore le nom.
   Le compteur qui répond à la question posée est l'indice de la boucle.

   L'état vit hors du rendu : le bandeau se repeint tout seul, sans passer par
   `render()` — 103 reconstructions complètes du DOM pendant une tâche de fond
   seraient absurdes. Même procédé que `peindrePlateformes`.
--------------------------------------------------------------------------- */
let majSeries = { actif:false, fait:0, total:0, echecs:[], stop:false };

function blocMajSeries(){
  const m = majSeries;
  if(!m.actif && !m.echecs.length) return '';
  return '<div class="wrap" style="padding-bottom:0"><div class="banner" id="majprog" style="margin:0">'+
    corpsMajSeries()+'</div></div>';
}
function corpsMajSeries(){
  const m = majSeries;
  if(m.actif){
    return '<div style="display:flex;align-items:center;gap:12px">'+
      '<div style="flex:1"><b>Actualisation en cours</b><br>'+
        '<span class="small">'+m.fait+' / '+m.total+' séries</span></div>'+
      '<button class="btn ghost" style="flex:0 0 auto;padding:9px 16px" '+
        'onclick="arreterMajSeries()">Arrêter</button></div>';
  }
  /* Terminé, mais des séries ont échoué : on les nomme. Un décompte sans les
     noms n'apprend rien — on ne sait pas laquelle rouvrir. */
  return '<div style="display:flex;align-items:center;gap:12px">'+
    '<div style="flex:1"><b>'+m.echecs.length+' série'+(m.echecs.length>1?'s n\'ont':' n\'a')+
      ' pas répondu</b><br><span class="small">'+esc(m.echecs.join(' · '))+'</span></div>'+
    '<button class="btn ghost" style="flex:0 0 auto;padding:9px 16px" '+
      'onclick="oublierEchecsMaj()">Fermer</button></div>';
}
function peindreMajSeries(){
  const el = document.getElementById('majprog');
  if(el) el.innerHTML = corpsMajSeries();
  else render();          // l'écran a changé pendant la tâche : on le refait entier
}
function arreterMajSeries(){ majSeries.stop = true; }
function oublierEchecsMaj(){ majSeries.echecs = []; render(); }

async function refreshAll(){
  if(majSeries.actif) return;
  const ids = Object.keys(db.shows);
  if(!ids.length) return toast('Aucune série');
  majSeries = { actif:true, fait:0, total:ids.length, echecs:[], stop:false };
  render();
  let ok = 0;
  for(const id of ids){
    if(majSeries.stop) break;
    /* Le nom est lu AVANT la requête : si elle échoue, `db.shows[id]` est
       toujours l'ancienne fiche et porte le nom qu'on veut afficher. */
    const nom = (db.shows[id] && db.shows[id].name) || ('Série '+id);
    try{
      const fresh = await fetchShowFull(id);
      const ancien = db.shows[id];
      fresh.watched = ancien.watched; fresh.addedAt = ancien.addedAt;
      if(ancien.unwatched) fresh.unwatched = ancien.unwatched;
      if(ancien.pause){ fresh.pause = true; fresh.pauseLe = ancien.pauseLe; }   // une actualisation groupée ne réveille pas une série mise de côté
      db.shows[id] = fresh; ok++;
    }catch(e){
      /* P2 — l'échec ne disparaît plus dans un `catch` nu : il porte un nom et
         il remonte à l'écran à la fin. */
      majSeries.echecs.push(nom);
      console.warn('actualisation impossible : '+nom, e);
    }
    majSeries.fait++;
    peindreMajSeries();
    await sleep(120);
  }
  const arrete = majSeries.stop;
  majSeries.actif = false; majSeries.stop = false;
  saveDB(); render();
  toast(arrete ? ('Arrêté · '+ok+' série(s) actualisée(s)')
               : (ok+' série(s) actualisée(s)'));
}
function wipe(){
  /* I10.2 — l'action efface partout, et c'est irréversible. La confirmation dit
     donc COMBIEN de titres partent et OÙ, et propose la sauvegarde sur-le-champ
     plutôt que de la conseiller ailleurs. Le modèle est celui, déjà bon, de la
     suppression de compte. */
  const ns = Object.keys(db.shows).length, nf = Object.keys(db.movies).length;
  const quoi = [ns ? ns+' série'+(ns>1?'s':'') : '', nf ? nf+' film'+(nf>1?'s':'') : '']
                 .filter(Boolean).join(' et ') || 'Ta bibliothèque';
  openSheet('<h3>Tout effacer ?</h3>'+
    '<p class="small muted" style="margin:0 0 10px"><b style="color:#ff5a5a">'+esc(quoi)+'</b> '+
      'et toute ta progression seront supprimés <b>partout</b> : de cet appareil, de tes '+
      'autres appareils et de ta sauvegarde en ligne. C\'est irréversible.</p>'+
    (ns+nf ? '<div class="card" style="padding:11px 12px;margin-bottom:6px">'+
      '<div class="small">'+(db.lastExport
        ? 'Dernière sauvegarde : '+esc(fmtDate(new Date(db.lastExport).toISOString().slice(0,10)))
        : 'Tu n\'as jamais fait de sauvegarde.')+'</div>'+
      '<button class="btn ghost block" style="margin-top:9px" onclick="exportData()">Exporter d\'abord</button>'+
    '</div>' : '')+
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
  /* LOT C — la forme de `db.avis`, garantie avant le premier rendu comme les
     deux migrations ci-dessus. Elle ne transforme rien : elle crée les deux
     seaux `tv` et `movie` s'ils manquent, et c'est tout. */
  if(typeof inscMigrerAvis === 'function') inscMigrerAvis();
  /* Les abonnements déclarés arrivent cochés dans la feuille de filtres. Ici,
     après `migrerGouts` et avant le premier rendu : `ui` est bâti au chargement
     du script, quand la base n'est pas encore lue. */
  semerPlatesFiltres();
  /* I9 — le nettoyage a quitté le rendu de l'écran des cloches, où il mutait
     `db` sans jamais l'enregistrer. Ici, et son résultat est écrit. */
  if(nettoyerCloches()) saveDB();
  askPersist();
  document.body.classList.remove('booting');

  /* ===================== C3 — l'entrée directe =====================
     ORDRE IMPÉRATIF : le lien de réinitialisation se lit AVANT toute route. Il
     occupe le même fragment sous une autre forme (`access_token=…&type=recovery`),
     et l'écriture de l'historique réécrit l'adresse — donc l'effacerait avant
     que quiconque l'ait lu. Le lien ne dure qu'une heure et ne sert qu'une
     fois : le perdre est irrattrapable. Même ordre dans `hashchange`. */
  if(typeof lireLienReinit === 'function' && lireLienReinit()){
    view = 'motdepasse'; params = {};
    render();
    amorcerHistorique();
    return;
  }

  const depart = typeof fragmentVersRoute === 'function' ? fragmentVersRoute(location.hash) : null;
  if(depart && !signedIn() && !VUES_SANS_COMPTE[depart.view]){
    /* Une notification touchée alors qu'on est déconnecté ne doit pas se
       perdre : on retient la destination et on la rejoue après connexion. */
    destinationEnAttente = depart;
  }else if(depart && signedIn()){
    const c = preparerEntreeDirecte(depart.view, depart.params);
    view = c.view; params = c.params;
  }

  render();
  amorcerHistorique();
  /* Sans session, l'app s'ouvre sur la porte d'entrée, avec l'onglet le plus
     probable selon que l'appareil a déjà connu un compte ou non. */
  if(!signedIn()) demarrerAccueil();
  /* LOT C — une inscription abandonnée en cours de route reprend là où elle
     s'est arrêtée. `db.inscription` n'existe QUE pendant le parcours et n'est
     posée que par `demarrerInscription` : un compte déjà en service n'a pas
     cette clé et n'est donc jamais dérouté ici.
     Après `amorcerHistorique` pour que l'entrée reprise remplace la première
     plutôt que d'en empiler une. Et jamais par-dessus une entrée directe
     (`depart`) : quelqu'un qui touche une notification veut la fiche, pas la
     suite de son inscription — elle l'attendra à la prochaine ouverture. */
  else if(!depart && typeof reprendreInscription === 'function') reprendreInscription();
  if(memoryOnly) toast('Stockage indisponible : pense à exporter tes données');
  /* I9 — quelqu'un avait choisi « un résumé le soir » ou « le samedi », donc
     ne recevait plus rien du tout. La migration 3 l'a remis sur « dès la
     sortie » ; il doit l'apprendre, une fois, plutôt que de constater un jour
     que les notifications sont revenues sans raison. */
  if(db.notif && db.notif.reprisI9){
    delete db.notif.reprisI9; saveDB();
    setTimeout(()=> toast('Tes notifications sont réactivées : le résumé groupé n\'existait pas encore'), 900);
  }
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
