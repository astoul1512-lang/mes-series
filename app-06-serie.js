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
    html += '<div class="wrap" style="padding-bottom:0"><button class="btn block" onclick="quickWatch('+s.id+')">'+
      I.check+' Marquer '+codeEp(nx.s,nx.e)+' comme vu</button>'+
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
  html += '<div style="height:28px"></div>';
  return html;
}
function toggleSeason(id,n){ const k=id+'.'+n; ui.openSeasons[k]=!ui.openSeasons[k]; render(); }

function showMenu(id){
  const s = db.shows[id];
  openSheet('<h3>'+esc(s.name)+'</h3><p class="small muted" style="margin:0 0 6px">Mise à jour : '+
      fmtDate(new Date(s.updated||Date.now()).toISOString().slice(0,10))+'</p>'+
    '<button class="opt" onclick="basculerPause('+id+')">'+
      (s.pause ? 'Reprendre cette série' : 'Mettre en pause')+'</button>'+
    '<button class="opt" onclick="refreshShow('+id+')">Actualiser les épisodes</button>'+
    '<button class="opt" onclick="markAllAired('+id+')">Tout marquer comme vu</button>'+
    '<button class="opt" onclick="unmarkAll('+id+')">Tout décocher</button>'+
    '<button class="opt danger" onclick="removeShow('+id+')">Retirer de ma liste</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

/* Mettre de côté sans rien perdre : la série quitte « À rattraper » et le
   calendrier, ses épisodes cochés restent intacts, et « Reprendre » la remet
   exactement où elle en était. */
function basculerPause(id){
  const s = db.shows[id];
  if(!s) return;
  closeSheet();
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
function removeShow(id){ markDeleted('shows',id); delete db.shows[id]; saveDB(); closeSheet(); go('follow'); }

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
