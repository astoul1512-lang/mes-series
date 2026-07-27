"use strict";
/* ---------- Vue : Réglages ---------- */
function viewSettings(){
  let html = header('Réglages', {back:"goBack()"});

  /* Plus aucun champ de clé, pour personne : elle n'a rien à faire dans une
     interface. Elle vit dans un secret côté serveur, et l'app passe par le
     relais. Un champ, même masqué ou réservé, finirait par la faire descendre
     jusqu'au navigateur. */
  html += '<div class="sectitle">Fiches et affiches</div>';
  html += '<div class="wrap" style="padding-top:0">'+
    '<div class="tiny muted" style="margin:0 0 12px">Les affiches, les résumés et les dates '+
      'de diffusion viennent de TMDB. Tu n\'as rien à configurer : l\'app s\'en occupe.</div>'+
    '<label class="fld"><span>Langue des fiches</span>'+
      '<select id="lang">'+
        ['fr-FR','en-US','es-ES','de-DE','it-IT'].map(l=>'<option value="'+l+'" '+(db.lang===l?'selected':'')+'>'+l+'</option>').join('')+
      '</select></label>'+
    '<button class="btn block" onclick="saveSettings()">Enregistrer</button>'+
  '</div>';

  html += '<div class="sectitle">Sauvegarde en ligne</div>';
  html += '<div class="wrap" style="padding-top:0">'+
    /* On retient d'où l'on vient : la flèche du compte doit ramener ici,
       pas sauter au profil. */
    '<button class="btn ghost block" onclick="go(\'account\',{from:\'settings\'})">'+
      (signedIn() ? 'Compte connecté · '+esc(db.auth.email||'') : 'Configurer la synchro entre appareils')+
    '</button>'+
    (signedIn() ? '' : '<div class="tiny muted" style="margin-top:8px">Recommandé : tes données sont alors sauvegardées en ligne et identiques sur iPhone et ordinateur.</div>')+
  '</div>';

  html += '<div class="sectitle">Mes données</div>';
  const nbShows = Object.keys(db.shows).length;
  /* Le rappel d'export ne concerne que ceux dont c'est la seule copie : une fois
     le compte connecté et la synchro passée, la sauvegarde est déjà faite. */
  const oldExport = !signedIn() && !db.syncedAt &&
                    (!db.lastExport || (Date.now()-db.lastExport) > 30*86400000);
  html += '<div class="wrap" style="padding-top:0">'+
    (memoryOnly ? '<div class="banner" style="margin:0 0 14px">Le stockage du navigateur est indisponible ici : '+
      '<b>tes données seront perdues à la fermeture</b>. Ouvre l\'app depuis une vraie adresse (https) pour la sauvegarde automatique, ou exporte régulièrement.</div>'
     : (nbShows && oldExport ? '<div class="banner" style="margin:0 0 14px">'+
        (db.lastExport ? 'Dernière sauvegarde il y a plus d\'un mois.' : 'Tu n\'as jamais fait de sauvegarde.')+
        ' <b>Exporte ton fichier de temps en temps</b> : c\'est ta seule copie de secours si tu changes de téléphone.</div>' : ''))+
    (db.lastExport ? '<div class="tiny muted" style="margin:0 0 10px">Dernière sauvegarde : '+
        fmtDate(new Date(db.lastExport).toISOString().slice(0,10))+'</div>' : '')+
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="exportData()">Exporter mes données (JSON)</button>'+
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="document.getElementById(\'imp\').click()">Importer un fichier</button>'+
    '<input type="file" id="imp" accept="application/json,.json" style="display:none" onchange="importData(this)">'+
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="refreshAll()">Actualiser toutes les séries</button>'+
    '<button class="btn ghost block" style="color:#ff5a5a" onclick="wipe()">Tout effacer</button>'+
  '</div>';

  html += '<div class="wrap tiny muted center" style="padding-top:6px;padding-bottom:30px">'+
    'Mes Séries · données stockées uniquement sur cet appareil<br>Données films/séries fournies par TMDB.</div>';
  return html;
}

function saveSettings(){
  db.lang = document.getElementById('lang').value;
  saveDB(); toast('Réglages enregistrés');
}
function exportData(){
  const blob = new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
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
  // migration douce : garantir la présence des champs
  Object.values(db.shows).forEach(s=>{
    if(!s.watched) s.watched={};
    if(!s.seasons) s.seasons={};
    /* Les toutes premières versions nommaient l'image d'épisode « s » au lieu de « st ». */
    Object.values(s.seasons).forEach(eps=>{
      if(!Array.isArray(eps)) return;
      eps.forEach(ep=>{
        if(ep && ep.st === undefined && typeof ep.s === 'string' && ep.s.charAt(0) === '/'){
          ep.st = ep.s; delete ep.s;
        }
      });
    });
  });
  askPersist();
  document.body.classList.remove('booting');
  render();
  /* Arrivée par un lien de réinitialisation : elle passe avant tout le reste,
     y compris la mise en route — le lien ne dure qu'une heure. */
  if(typeof lireLienReinit === 'function' && lireLienReinit()) return go('motdepasse');
  /* Première ouverture : on déroule la mise en route plutôt que de lâcher
     l'arrivant devant des onglets vides et un mot inconnu. */
  if(!db.onboarde) demarrerAccueil();
  if(memoryOnly) toast('Stockage indisponible : pense à exporter tes données');
  if(syncReady() && signedIn()){ syncNow(true); majProfil(); chargerPartage(); }
}
boot();

/* Service worker : démarrage instantané et fonctionnement hors-ligne */
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}
