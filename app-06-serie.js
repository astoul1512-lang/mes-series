"use strict";
/* ---------- Vue : détail série ---------- */
function viewShow(){
  const s = db.shows[params.id];
  if(!s) return header('Introuvable',{back:"go('follow')"});
  const back = "goBack()";
  const p = progress(s);
  const nx = nextToWatch(s);
  const total = allEpisodes(s,false).filter(ep=>s.watched[key(ep.s,ep.e)])
                 .reduce((a,ep)=>a+epRuntime(s,ep),0);

  let html = header(s.name,{back:back,
    right: boutonCloche('tv', s.id) +
           '<button class="iconbtn" onclick="showMenu('+s.id+')">'+I.dots+'</button>'});
  html += '<div class="hero">'+(s.backdrop?'<img src="'+IMG(s.backdrop,'w780')+'" alt="">':'')+'</div>';
  html += '<div class="dhead">'+posterEl(s.poster,'w342','',s.name)+
    '<div class="dmeta">'+
      '<h2>'+esc(s.name)+'</h2>'+
      '<div class="small muted">'+esc(year(s.first))+(s.network?' · '+esc(s.network):'')+
        ' · <span class="badge '+(s.status==='Ended'||s.status==='Canceled'?'end':'live')+'">'+
        esc(s.status==='Ended'?'Terminée':s.status==='Canceled'?'Annulée':'En cours')+'</span></div>'+
      (s.note?'<div style="margin-top:6px"><span class="note">'+I.star+(Math.round(s.note*10)/10)+'</span></div>':'')+
      '<div class="small muted" style="margin-top:6px">'+esc((s.genres||[]).slice(0,3).join(' · '))+'</div>'+
      zoneBande('tv', s.id)+
    '</div></div>';

  if(s.pause){
    html += '<div class="wrap" style="padding-bottom:0"><div class="card enpause">'+
      '<div><b>Série en pause</b><div class="tiny muted" style="margin-top:2px">'+
      'Elle n\'apparaît ni dans « À rattraper » ni dans le calendrier.</div></div>'+
      '<button class="btn ghost" onclick="basculerPause('+s.id+')">Reprendre</button></div></div>';
  }

  if(nx && !s.pause){
    /* Le bouton de pause accompagne l'action principale au lieu de dormir dans
       le menu ⋮ : trois appuis pour mettre une série de côté, c'était deux de
       trop. Icône seule — il ne doit pas concurrencer « marquer comme vu ».
       Il ne s'affiche que sur une série commencée : mettre en pause quelque
       chose qu'on n'a jamais ouvert ne veut rien dire, et c'est exactement ce
       qu'Adrien a pu faire par erreur sur une série à 0/26. */
    html += '<div class="wrap" style="padding-bottom:0">'+
      (peutSeMettreEnPause(s)
        ? '<div class="actions" style="padding:0">'+
            '<button class="btn" onclick="quickWatch('+s.id+')">'+
              I.check+' Marquer '+codeEp(nx.s,nx.e)+' comme vu</button>'+
            '<button class="btn ghost carre" onclick="basculerPause('+s.id+')" '+
              'title="Mettre en pause" aria-label="Mettre en pause">'+I.pause+'</button>'+
          '</div>'
        : '<button class="btn block" onclick="quickWatch('+s.id+')">'+
            I.check+' Marquer '+codeEp(nx.s,nx.e)+' comme vu</button>')+
      '<div class="tiny muted center" style="margin-top:8px">'+esc(nx.n)+'</div></div>';
  } else if(s.next){
    html += '<div class="wrap" style="padding-bottom:0"><div class="card" style="padding:14px;text-align:center">'+
      '<div class="small muted">Prochain épisode</div>'+
      '<div style="font-weight:700;margin-top:2px">'+codeEp(s.next.s,s.next.e)+' · '+esc(s.next.n||'')+'</div>'+
      '<div class="small" style="color:var(--accent);margin-top:2px">'+fmtDate(s.next.d)+'</div></div></div>';
  }

  html += '<div class="stats">'+
    '<div class="stat"><b>'+p.watched+'/'+p.total+'</b><span>épisodes vus</span></div>'+
    '<div class="stat"><b>'+p.pct+'%</b><span>progression</span></div>'+
    '<div class="stat"><b>'+fmtDurShort(total)+'</b><span>temps passé</span></div>'+
  '</div>';

  if(s.overview) html += '<div class="overview clamp" onclick="this.classList.toggle(\'clamp\')">'+esc(s.overview)+'</div>';

  html += blocPlateformes('tv', s.id);

  const toutVu = p.total > 0 && p.watched === p.total;
  html += '<div class="sectitle rowt">Épisodes'+
    '<button class="minibtn'+(toutVu?' on':'')+'" onclick="toggleToutVu('+s.id+')">'+
      (toutVu ? 'Tout décocher' : I.check+' Toute la série vue')+'</button></div>';
  html += '<div class="card" style="margin:0 16px;overflow:hidden">';
  seasonNums(s,true).forEach(n=>{
    const eps = s.seasons[n]||[];
    const w = eps.filter(ep=>s.watched[key(n,ep.e)]).length;
    const open = !!ui.openSeasons[s.id+'.'+n];
    html += '<div class="season">'+
      '<button class="shead '+(open?'open':'')+'" onclick="toggleSeason('+s.id+','+n+')">'+
        '<span class="caret">'+I.caret+'</span>'+
        '<b>'+(n===0?'Hors-série':'Saison '+n)+'</b>'+
        '<span class="spacer"></span>'+
        '<span class="tiny muted">'+w+'/'+eps.length+'</span>'+
        '<span class="ck '+(w===eps.length&&eps.length?'on':'')+'" onclick="event.stopPropagation();toggleWholeSeason('+s.id+','+n+')">'+I.check+'</span>'+
      '</button>';
    if(open){
      html += eps.map(ep=>{
        const on = !!s.watched[key(n,ep.e)];
        const fut = !aired(ep);
        return '<div class="eprow '+(fut?'future':'')+(on?' seen':'')+'" onclick="tapEp('+s.id+','+n+','+ep.e+')">'+
          '<span class="ck '+(on?'on':'')+'">'+I.check+'</span>'+
          epThumb(ep)+
          '<div class="epinfo">'+
            '<div class="epname">'+codeEp(n, ep.e)+' · '+esc(ep.n)+'</div>'+
            '<div class="epsub">'+(ep.d?fmtDate(ep.d):'Date inconnue')+(ep.r?' · '+ep.r+' min':'')+'</div>'+
          '</div></div>';
      }).join('');
    }
    html += '</div>';
  });
  html += '</div>';
  html += zoneCasting('tv', s.id);
  html += zoneRecos('tv', s.id);
  html += '<div style="height:28px"></div>';
  return html;
}
function toggleSeason(id,n){ const k=id+'.'+n; ui.openSeasons[k]=!ui.openSeasons[k]; render(); }

/* ---------------------------------------------------------------------------
   Les épisodes sur la fiche d'une série qu'on n'a pas ajoutée

   Avant, il fallait ajouter la série pour voir ce qu'il y avait dedans — un
   engagement demandé avant l'information qui permet de le prendre. La liste
   est donc la même ici, à ceci près que les épisodes ne sont chargés qu'à
   l'ouverture d'une saison : charger les vingt saisons d'une série qu'on ne
   fait que regarder en passant coûterait cher pour rien.

   Le même « id.n » sert de clé qu'ailleurs : la saison ouverte ici l'est
   encore sur la vraie fiche après l'ajout.
--------------------------------------------------------------------------- */
const apercuSaisons = {};                 // 'id.n' → 'attente' | [épisodes] | {erreur:1}

function toggleSaisonApercu(id, n){
  const k = id + '.' + n;
  ui.openSeasons[k] = !ui.openSeasons[k];
  render();
  if(ui.openSeasons[k]) chargerSaisonApercu(id, n);
}

async function chargerSaisonApercu(id, n){
  const k = id + '.' + n;
  const d = apercuSaisons[k];
  if(Array.isArray(d) || d === 'attente') return;
  apercuSaisons[k] = 'attente'; render();
  try{
    const s = await tmdb('/tv/' + id + '/season/' + n);
    apercuSaisons[k] = (s.episodes || []).map(ep=>({
      e: ep.episode_number, n: ep.name || ('Épisode ' + ep.episode_number),
      d: ep.air_date || null, r: ep.runtime || null, st: ep.still_path || null
    }));
  }catch(e){ apercuSaisons[k] = { erreur:1 }; }
  if(view === 'preview') render();
}

function blocSaisonsApercu(d){
  const saisons = (d.seasons || []).filter(s=>s.episode_count > 0)
                    .sort((a,b)=>a.season_number - b.season_number);
  if(!saisons.length) return '';
  let html = '<div class="sectitle">Épisodes</div>'+
    '<div class="card" style="margin:0 16px;overflow:hidden">';
  saisons.forEach(s=>{
    const n    = s.season_number;
    const k    = d.id + '.' + n;
    const open = !!ui.openSeasons[k];
    const etat = apercuSaisons[k];
    html += '<div class="season">'+
      '<button class="shead '+(open?'open':'')+'" onclick="toggleSaisonApercu('+d.id+','+n+')">'+
        '<span class="caret">'+I.caret+'</span>'+
        '<b>'+(n===0?'Hors-série':'Saison '+n)+'</b>'+
        '<span class="spacer"></span>'+
        '<span class="tiny muted">'+s.episode_count+' ép.'+
          (year(s.air_date) ? ' · '+esc(year(s.air_date)) : '')+'</span>'+
      '</button>';
    if(open){
      if(etat && etat.erreur){
        html += '<div class="eprow" onclick="chargerSaisonApercu('+d.id+','+n+')">'+
          '<div class="epinfo"><div class="epsub">Chargement impossible — toucher pour réessayer'+
          '</div></div></div>';
      } else if(!Array.isArray(etat)){
        html += '<div class="eprow"><span class="spin"></span>'+
          '<div class="epinfo"><div class="epsub">Chargement des épisodes…</div></div></div>';
      } else {
        html += etat.map(ep=>
          '<div class="eprow '+(aired(ep)?'':'future')+'" '+
               'onclick="cocherDepuisApercu('+d.id+','+n+','+ep.e+')">'+
            '<span class="ck">'+I.check+'</span>'+
            epThumb(ep)+
            '<div class="epinfo">'+
              '<div class="epname">'+codeEp(n, ep.e)+' · '+esc(ep.n)+'</div>'+
              '<div class="epsub">'+(ep.d?fmtDate(ep.d):'Date inconnue')+
                (ep.r?' · '+ep.r+' min':'')+'</div>'+
            '</div></div>').join('');
      }
    }
    html += '</div>';
  });
  return html + '</div>'+
    '<div class="wrap tiny muted" style="padding-top:10px">Cocher un épisode ajoute la série '+
    'à ta liste et t\'y emmène.</div>';
}

/* Cocher ici vaut « je suis cette série » : sans l'ajout, la coche n'aurait
   nulle part où être retenue. On ne coche que l'épisode touché — supposer que
   tout ce qui précède a été vu serait deviner à sa place. */
async function cocherDepuisApercu(id, n, e){
  const ou = { id:id, from: params.from || 'discover' };
  if(db.shows[id]){ toggleEp(id, n, e); return go('show', ou); }
  if(ui.busy) return;
  ui.busy = true;
  toast('Ajout de la série…');
  try{
    const s = await fetchShowFull(id);
    s.watched = {}; s.addedAt = Date.now();
    s.watched[key(n, e)] = Date.now();
    s.updated = Date.now();
    db.shows[id] = s; saveDB();
    ui.busy = false;
    go('show', ou);
    versLesSaisons();
    toast('« '+s.name+' » ajoutée · '+codeEp(n,e)+' vu');
  }catch(err){
    ui.busy = false; render();
    toast('Impossible d\'ajouter cette série');
  }
}

function showMenu(id){
  const s = db.shows[id];
  openSheet('<h3>'+esc(s.name)+'</h3><p class="small muted" style="margin:0 0 6px">Mise à jour : '+
      fmtDate(new Date(s.updated||Date.now()).toISOString().slice(0,10))+'</p>'+
    /* « Reprendre » reste toujours proposé — sans quoi une série mise en pause
       par erreur avant cette règle n'aurait plus aucun moyen d'en sortir. */
    (s.pause || peutSeMettreEnPause(s)
      ? '<button class="opt" onclick="basculerPause('+id+')">'+
          (s.pause ? 'Reprendre cette série' : 'Mettre en pause')+'</button>'
      : '')+
    '<button class="opt" onclick="refreshShow('+id+')">Actualiser les épisodes</button>'+
    '<button class="opt" onclick="markAllAired('+id+')">Tout marquer comme vu</button>'+
    '<button class="opt" onclick="unmarkAll('+id+')">Tout décocher</button>'+
    '<button class="opt danger" onclick="removeShow('+id+')">Retirer de ma liste</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

/* Une série jamais commencée n'a rien à mettre en pause : elle n'apparaît déjà
   ni dans « À rattraper » ni dans le calendrier, la pause ne changerait rien.
   Une série déjà en pause peut toujours reprendre, quel que soit son avancement. */
function peutSeMettreEnPause(s){
  return !!s && !s.pause && progress(s).watched > 0;
}

/* Mettre de côté sans rien perdre : la série quitte « À rattraper » et le
   calendrier, ses épisodes cochés restent intacts, et « Reprendre » la remet
   exactement où elle en était. */
function basculerPause(id){
  const s = db.shows[id];
  if(!s) return;
  closeSheet();
  /* Dernier rempart : l'écran peut être en retard sur la base. */
  if(!s.pause && !peutSeMettreEnPause(s))
    return toast('Commence-la d\'abord : il n\'y a rien à mettre en pause');
  if(s.pause){
    delete s.pause; delete s.pauseLe;
    s.updated = Date.now(); saveDB(); render();
    toast('« '+s.name+' » reprise');
  } else {
    s.pause = true; s.pauseLe = Date.now();
    s.updated = Date.now(); saveDB(); render();
    toast('« '+s.name+' » mise en pause');
  }
}
async function refreshShow(id){
  closeSheet(); toast('Actualisation…');
  try{
    const fresh = await fetchShowFull(id);
    const ancien = db.shows[id];
    fresh.watched = ancien.watched; fresh.addedAt = ancien.addedAt;
    if(ancien.unwatched) fresh.unwatched = ancien.unwatched;
    if(ancien.pause){ fresh.pause = true; fresh.pauseLe = ancien.pauseLe; }   // l'actualisation ne réveille pas une série mise de côté
    db.shows[id] = fresh; saveDB(); render(); toast('À jour');
  }catch(e){ toast('Échec de l\'actualisation'); }
}
function markAllAired(id){ closeSheet(); marquerToutVu(id); }
function unmarkAll(id){ closeSheet(); toutDecocher(id); }
/* Retirer un titre ne doit pas déporter ailleurs. Sur sa propre fiche il faut
   bien la quitter — elle n'existe plus — mais on revient d'où l'on vient, pas
   systématiquement dans « À suivre » : venu de Découvrir, on y retourne.
   Partout ailleurs (aperçu, liste, profil), l'écran reste valable et se
   contente de se redessiner. */
function removeShow(id){
  const s = db.shows[id];
  const nom = (s && s.name) || 'La série';
  markDeleted('shows',id); delete db.shows[id]; saveDB(); closeSheet();
  toast('« '+nom+' » retirée de ta liste');
  if(view === 'show') goBack(); else render();
}

function toggleEp(id,s,e){
  const sh = db.shows[id], k = key(s,e);
  const avant = Object.assign({}, sh.watched);
  if(sh.watched[k]) delete sh.watched[k]; else sh.watched[k] = Date.now();
  noterDecoches(sh, avant);
  saveDB(); render();
}
/* Cocher une saison marque aussi les précédentes ; la décocher libère les suivantes.
   Les hors-série (saison 0) restent indépendants et ne déclenchent aucune cascade. */
function toggleWholeSeason(id, n){
  const sh = db.shows[id];
  const eps = sh.seasons[n] || [];
  const allOn = eps.length > 0 && eps.every(ep => sh.watched[key(n, ep.e)]);
  const cibles = (n === 0) ? [0]
      : allOn ? seasonNums(sh,false).filter(x => x >= n)
              : seasonNums(sh,false).filter(x => x <= n);

  let nb = 0;
  cibles.forEach(x => (sh.seasons[x]||[]).forEach(ep=>{
    const on = !!sh.watched[key(x, ep.e)];
    if(allOn ? on : (!on && aired(ep))) nb++;
  }));
  if(!nb) return;

  const quoi = (n === 0) ? 'Hors-série'
      : cibles.length > 1 ? 'Saisons '+Math.min.apply(null,cibles)+' à '+Math.max.apply(null,cibles)
      : 'Saison '+n;
  applyWatched(id, s2=>{
    const t = Date.now();
    cibles.forEach(x => (s2.seasons[x]||[]).forEach(ep=>{
      if(allOn) delete s2.watched[key(x, ep.e)];
      else if(aired(ep)) s2.watched[key(x, ep.e)] = t;
    }));
  }, quoi+' · '+nb+(allOn ? ' décoché' : ' vu')+(nb>1?'s':''));
}

/* Toute la série vue / tout décocher — même moteur, donc annulable */
function marquerToutVu(id){
  const sh = db.shows[id];
  const nb = allEpisodes(sh,true).filter(ep=>aired(ep) && !sh.watched[key(ep.s,ep.e)]).length;
  if(!nb) return toast('Déjà tout vu');
  applyWatched(id, s=>{
    const t = Date.now();
    allEpisodes(s,true).forEach(ep=>{ if(aired(ep)) s.watched[key(ep.s,ep.e)] = t; });
  }, nb+' épisode'+(nb>1?'s':'')+' marqué'+(nb>1?'s':'')+' vu'+(nb>1?'s':''));
}
function toutDecocher(id){
  const nb = Object.keys(db.shows[id].watched).length;
  if(!nb) return;
  applyWatched(id, s=>{ s.watched = {}; },
    nb+' épisode'+(nb>1?'s':'')+' décoché'+(nb>1?'s':''));
}
function toggleToutVu(id){
  const p = progress(db.shows[id]);
  if(p.total > 0 && p.watched === p.total) toutDecocher(id); else marquerToutVu(id);
}
/* ===== Marquage groupé, statut recalculé une seule fois, action annulable ===== */
let undoData = null, undoTimer = null;

function pushUndo(showId, prevWatched, label){
  undoData = { showId, prev: prevWatched };
  const el = document.getElementById('undo');
  el.innerHTML = '<span>'+esc(label)+'</span><button onclick="doUndo()">Annuler</button>';
  el.classList.add('show');
  document.body.classList.add('undo');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 10000);
}
function hideUndo(){
  clearTimeout(undoTimer);
  const el = document.getElementById('undo');
  if(el) el.classList.remove('show');
  document.body.classList.remove('undo');
  undoData = null;
}
function doUndo(){
  if(!undoData) return;
  const sh = db.shows[undoData.showId];
  if(sh){
    const avant = Object.assign({}, sh.watched);
    sh.watched = undoData.prev;
    noterDecoches(sh, avant);
    saveDB();
  }
  hideUndo(); render(); toast('Annulé');
}

/* Applique une modification d'un coup : une sauvegarde, un rendu, un statut recalculé */
function applyWatched(showId, mutate, label){
  const sh = db.shows[showId];
  if(!sh) return;
  const prev = Object.assign({}, sh.watched);
  mutate(sh);
  noterDecoches(sh, prev);
  saveDB(); render();
  pushUndo(showId, prev, label);
}

/* Épisodes antérieurs, diffusés et non vus, sur toute la série (hors-série exclus) */
function episodesAvant(sh, n, e){
  return allEpisodes(sh, false).filter(ep=>
    (ep.s < n || (ep.s === n && ep.e < e)) && aired(ep) && !sh.watched[key(ep.s,ep.e)]);
}

/* Appui sur une ligne d'épisode */
function tapEp(id, n, e){
  const sh = db.shows[id];
  if(!sh) return;
  if(sh.watched[key(n,e)]){ toggleEp(id,n,e); return; }      // déjà vu → on décoche, sans question
  const avant = episodesAvant(sh, n, e);
  if(!avant.length){ marquerSeul(id, n, e); return; }         // rien derrière → on coche directement
  const ep = (sh.seasons[n]||[]).find(x=>x.e===e) || {};
  const nb = avant.length;
  openSheet('<h3>'+codeEp(n,e)+' · '+esc(ep.n||'')+'</h3>'+
    '<p class="small muted" style="margin:0 0 8px">Marquer aussi '+
      (nb>1 ? 'les '+nb+' épisodes précédents' : "l'épisode précédent")+' comme vus&nbsp;?</p>'+
    '<button class="opt" onclick="closeSheet();marquerCascade('+id+','+n+','+e+')">Tout marquer</button>'+
    '<button class="opt" onclick="closeSheet();marquerSeul('+id+','+n+','+e+')">Cet épisode uniquement</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

function marquerSeul(id, n, e){
  applyWatched(id, sh=>{ sh.watched[key(n,e)] = Date.now(); },
               codeEp(n,e)+' marqué vu');
}
function marquerCascade(id, n, e){
  const sh = db.shows[id];
  const liste = episodesAvant(sh, n, e).concat([{s:n, e:e}]);
  const nb = liste.length;
  applyWatched(id, s2=>{ const t = Date.now(); liste.forEach(ep=> s2.watched[key(ep.s,ep.e)] = t); },
               nb+' épisodes marqués vus');
}

function quickWatch(id, ev){
  if(ev) ev.stopPropagation();
  const s = db.shows[id], nx = nextToWatch(s);
  if(!nx) return;
  const avant = Object.assign({}, s.watched);
  s.watched[key(nx.s,nx.e)] = Date.now();
  noterDecoches(s, avant);
  saveDB(); render();
  toast(codeEp(nx.s,nx.e)+' vu ✓');
}
