"use strict";
/* ---------- Vue : Réglages ---------- */
function viewSettings(){
  let html = header('Réglages', {back: params.from ? "goBack()" : null});

  html += '<div class="sectitle">Connexion TMDB</div>';
  html += '<div class="wrap" style="padding-top:0">'+
    '<label class="fld"><span>Clé API TMDB</span>'+
      '<input type="password" id="apikey" value="'+esc(db.apiKey)+'" placeholder="Colle ta clé ici" autocomplete="off">'+
      '<em>Clé API (v3) ou jeton d\'accès (v4). Créer un compte sur '+
      '<a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener">themoviedb.org</a>, '+
      'puis Paramètres → API → demander une clé (usage personnel, gratuit).</em></label>'+
    '<label class="fld"><span>Langue des fiches</span>'+
      '<select id="lang">'+
        ['fr-FR','en-US','es-ES','de-DE','it-IT'].map(l=>'<option value="'+l+'" '+(db.lang===l?'selected':'')+'>'+l+'</option>').join('')+
      '</select></label>'+
    '<button class="btn block" onclick="saveSettings()">Enregistrer</button>'+
  '</div>';

  html += '<div class="sectitle">Sauvegarde en ligne</div>';
  html += '<div class="wrap" style="padding-top:0">'+
    '<button class="btn ghost block" onclick="go(\'account\',{from:\'profile\'})">'+
      (signedIn() ? 'Compte connecté · '+esc(db.auth.email||'') : 'Configurer la synchro entre appareils')+
    '</button>'+
    (signedIn() ? '' : '<div class="tiny muted" style="margin-top:8px">Recommandé : tes données sont alors sauvegardées en ligne et identiques sur iPhone et ordinateur.</div>')+
  '</div>';

  html += '<div class="sectitle">Mes données</div>';
  const nbShows = Object.keys(db.shows).length;
  const oldExport = !db.lastExport || (Date.now()-db.lastExport) > 30*86400000;
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
  db.apiKey = document.getElementById('apikey').value.trim();
  db.lang = document.getElementById('lang').value;
  saveDB(); toast('Réglages enregistrés');
  if(db.apiKey) verifyKey();
}
async function verifyKey(){
  try{ await tmdb('/configuration'); toast('Clé TMDB valide ✓'); }
  catch(e){ toast(e.message==='BADKEY'?'Clé refusée par TMDB':'Impossible de vérifier la clé'); }
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
function importData(input){
  const f = input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const d = JSON.parse(r.result);
      if(!d.shows) throw new Error('bad');
      db.shows = d.shows||{}; db.movies = d.movies||{};
      if(d.apiKey) db.apiKey = d.apiKey;
      if(d.lang) db.lang = d.lang;
      saveDB(); render(); toast('Données importées');
    }catch(e){ toast('Fichier invalide'); }
  };
  r.readAsText(f);
  input.value='';
}
async function refreshAll(){
  const ids = Object.keys(db.shows);
  if(!ids.length) return toast('Aucune série');
  toast('Actualisation de '+ids.length+' série(s)…');
  let ok = 0;
  for(const id of ids){
    try{
      const fresh = await fetchShowFull(id);
      fresh.watched = db.shows[id].watched; fresh.addedAt = db.shows[id].addedAt;
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
  if(!db.apiKey) go('settings', {from:'follow'});
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
