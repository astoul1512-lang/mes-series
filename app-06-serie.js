"use strict";
/* ---------- Vue : détail série ---------- */
function viewShow(){
  const s = db.shows[params.id];
  /* RETOUR-08 — plus de cul-de-sac : `ecranImpossible` (app-02) replie sur
     l'écran précédent, et sur l'onglet seulement s'il n'y en a pas. La flèche
     en dur `go('follow')` EMPILAIT, donc le retour suivant revenait ici. */
  if(!s) return ecranImpossible('show', 'follow',
    'Cette série n\'est plus dans ta bibliothèque.');
  const back = "goBack()";
  const p = progress(s);
  const nx = nextToWatch(s);
  const total = allEpisodes(s,false).filter(ep=>s.watched[key(ep.s,ep.e)])
                 .reduce((a,ep)=>a+epRuntime(s,ep),0);

  let html = header(s.name,{back:back,
    right: boutonCloche('tv', s.id) +
           '<button class="iconbtn" onclick="showMenu('+s.id+')">'+I.dots+'</button>'});
  html += '<div class="hero">'+(srcImage(s.backdrop,'w780')?'<img src="'+srcImage(s.backdrop,'w780')+'" alt="">':'')+'</div>';
  html += '<div class="dhead">'+posterEl(s.poster,'w342','',s.name)+
    '<div class="dmeta">'+
      '<h2>'+esc(s.name)+'</h2>'+
      '<div class="small muted">'+esc(year(s.first))+(s.network?' · '+esc(s.network):'')+
        ' · <span class="badge '+(s.status==='Ended'||s.status==='Canceled'?'end':'live')+'">'+
        esc(s.status==='Ended'?'Terminée':s.status==='Canceled'?'Annulée':'En cours')+'</span></div>'+
      (s.note?'<div style="margin-top:6px"><span class="note">'+I.star+(Math.round(s.note*10)/10)+'</span></div>':'')+
      /* POINT 3, 02/08 — TOUS les genres, et le principal EN TÊTE. La fiche
         tronquait à trois et cachait ainsi le genre qui explique la présence du
         titre dans une ambiance. `genresOrdonnes` (app-04) est la seule règle de
         tri des genres de l'app : on la réutilise telle quelle. */
      '<div class="small muted" style="margin-top:6px">'+
        esc(genresOrdonnes(s.genres||[]).join(' · '))+'</div>'+
    '</div></div>';

  /* POINT 9 — la bande-annonce n'est plus le plus petit bouton de l'écran,
     coincé sous les genres : ligne pleine largeur, entre le bloc du titre et la
     rangée d'actions. Le troisième argument demande cette variante. */
  html += zoneBande('tv', s.id, true);

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
    /* SPEC-10 §3 — le 💌 rejoint la rangée d'actions : même gabarit que les
       actions secondaires (`carre`), à côté de l'action principale. Il ne
       s'affiche que si le cercle n'est pas vide, `boutonRecoFiche` s'en
       charge — d'où la rangée à deux boutons même sans le bouton pause. */
    const reco = boutonRecoFiche('tv', s.id);
    const pause = peutSeMettreEnPause(s)
      ? '<button class="btn ghost carre" onclick="basculerPause('+s.id+')" '+
          'title="Mettre en pause" aria-label="Mettre en pause">'+I.pause+'</button>'
      : '';
    html += '<div class="wrap" style="padding-bottom:0">'+
      ((pause || reco)
        ? '<div class="actions" style="padding:0">'+
            '<button class="btn" onclick="quickWatch('+s.id+')">'+
              I.check+' Marquer '+codeEp(nx.s,nx.e)+' comme vu</button>'+
            pause + reco +
          '</div>'
        : '<button class="btn block" onclick="quickWatch('+s.id+')">'+
            I.check+' Marquer '+codeEp(nx.s,nx.e)+' comme vu</button>')+
      '<div class="tiny muted center" style="margin-top:8px">'+esc(nx.n)+'</div></div>'+
      bandeauRecoFiche('tv', s.id);
  } else if(s.next){
    html += '<div class="wrap" style="padding-bottom:0"><div class="card" style="padding:14px;text-align:center">'+
      '<div class="small muted">Prochain épisode</div>'+
      '<div style="font-weight:700;margin-top:2px">'+codeEp(s.next.s,s.next.e)+' · '+esc(s.next.n||'')+'</div>'+
      '<div class="small" style="color:var(--accent);margin-top:2px">'+fmtDate(s.next.d)+'</div></div></div>';
  }

  /* POINT 21 — le bloc d'état, juste sous la rangée d'actions, et rendu par la
     MÊME fonction que les deux fiches film (`blocAVoir`, app-05). Une série sans
     aucun épisode coché vaut `statutSerie === 'avoir'` : elle est dans l'onglet
     « À voir » du profil, au même titre qu'un film non vu, et rien ne le disait.
     L'exclusivité tient toute seule : cocher le premier épisode fait passer le
     statut à `asuivre` et le bloc disparaît au redessin — de même qu'une mise en
     pause, qui a déjà sa propre carte plus haut. */
  html += blocAVoir('tv', s.id);

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
      html += eps.map(ep=>
        ligneEpisode(s, n, ep, 'tapEp('+s.id+','+n+','+ep.e+')')).join('');
    }
    html += '</div>';
  });
  html += '</div>';
  html += zoneCasting('tv', s.id);
  html += zoneRecos('tv', s.id);
  html += '<div style="height:28px"></div>';
  return html;
}
/* ---------------------------------------------------------------------------
   UNE ligne d'épisode, pour les deux écrans qui en affichent

   La fiche et l'aperçu rendaient chacun leur ligne, avec leurs propres classes.
   Elles ont divergé : l'aperçu posait une coche TOUJOURS éteinte, même pour une
   série vue en entier — et comme un appui basculait l'état, toucher une coche
   vide pour comprendre RETIRAIT l'épisode des vus. Sans confirmation, sans
   barre Annuler, et en projetant sur la fiche.

   Une seule fonction pour les deux, donc, plutôt que corriger une instance :
   la divergence ne peut plus revenir. `sh` vaut `null` quand la série n'est pas
   dans la bibliothèque — rien n'est alors coché, ce qui est la vérité.
--------------------------------------------------------------------------- */
function ligneEpisode(sh, n, ep, action){
  const on  = !!(sh && sh.watched[key(n, ep.e)]);
  const fut = !aired(ep);
  return '<div class="eprow '+(fut?'future':'')+(on?' seen':'')+'" onclick="'+action+'">'+
    '<span class="ck '+(on?'on':'')+'">'+I.check+'</span>'+
    epThumb(ep)+
    '<div class="epinfo">'+
      '<div class="epname">'+codeEp(n, ep.e)+' · '+esc(ep.n||'')+'</div>'+
      '<div class="epsub">'+(ep.d?fmtDate(ep.d):'Date inconnue')+(ep.r?' · '+ep.r+' min':'')+'</div>'+
    '</div></div>';
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
  /* La série est-elle déjà suivie ? Tout ce bloc en dépend : les coches, ce que
     dit l'en-tête de saison, ce que fait un appui, et la phrase de pied. */
  const sh = db.shows[d.id] || null;
  let html = '<div class="sectitle">Épisodes</div>'+
    '<div class="card" style="margin:0 16px;overflow:hidden">';
  saisons.forEach(s=>{
    const n    = s.season_number;
    const k    = d.id + '.' + n;
    const open = !!ui.openSeasons[k];
    const etat = apercuSaisons[k];
    /* Sur une série suivie, l'en-tête compte les épisodes vus comme sur la
       fiche. « 8 ép. · 2021 » est une information de catalogue ; « 8/8 » dit
       où on en est, et c'est ce qu'on vient chercher. Le compte se fait sur la
       saison telle qu'elle est ENREGISTRÉE, pas sur ce que TMDB annonce : les
       deux peuvent diverger d'un épisode. */
    const epsLoc = sh ? (sh.seasons[n] || []) : [];
    const vus    = epsLoc.filter(e=>sh.watched[key(n, e.e)]).length;
    const compte = (sh && epsLoc.length)
      ? vus + '/' + epsLoc.length
      : s.episode_count + ' ép.' + (year(s.air_date) ? ' · '+esc(year(s.air_date)) : '');
    html += '<div class="season">'+
      '<button class="shead '+(open?'open':'')+'" onclick="toggleSaisonApercu('+d.id+','+n+')">'+
        '<span class="caret">'+I.caret+'</span>'+
        '<b>'+(n===0?'Hors-série':'Saison '+n)+'</b>'+
        '<span class="spacer"></span>'+
        '<span class="tiny muted">'+compte+'</span>'+
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
          ligneEpisode(sh, n, ep, 'cocherDepuisApercu('+d.id+','+n+','+ep.e+')')).join('');
      }
    }
    html += '</div>';
  });
  /* La phrase n'est vraie que pour une série absente. La laisser sur une série
     déjà suivie, c'était promettre un ajout qui n'aura pas lieu et un voyage
     qui n'aura pas lieu non plus. */
  return html + '</div>' + (sh ? '' :
    '<div class="wrap tiny muted" style="padding-top:10px">Cocher un épisode ajoute la série '+
    'à ta liste et t\'y emmène.</div>');
}

/* Cocher ici vaut « je suis cette série » : sans l'ajout, la coche n'aurait
   nulle part où être retenue. On ne coche que l'épisode touché — supposer que
   tout ce qui précède a été vu serait deviner à sa place. */
async function cocherDepuisApercu(id, n, e){
  const ou = { id:id, from: params.from || 'discover' };
  if(db.shows[id]){
    /* Série déjà suivie : exactement la règle de la fiche — la question sur les
       épisodes sautés, et la barre Annuler. Et on RESTE ici : on était venu
       consulter la liste, pas demander à changer d'écran. */
    return tapEp(id, n, e);
  }
  if(!prendre('serie:'+id)) return;
  const ecranDepart = view;
  toast('Ajout de la série…');
  try{
    const s = await fetchShowFull(id);
    s.watched = {}; s.addedAt = Date.now();
    s.watched[key(n, e)] = Date.now();
    s.updated = Date.now();
    db.shows[id] = s; saveDB();
    rendre('serie:'+id);
    toast('« '+s.name+' » ajoutée · '+codeEp(n,e)+' vu');
    /* Même règle qu'`addOrOpenShow` : on ne déplace personne après coup.
       Revue de stabilité du 02/08, constat A3-1. */
    if(view !== ecranDepart){ render(); return; }
    go('show', ou);
    versLesSaisons();
  }catch(err){
    rendre('serie:'+id); render();
    toast('Impossible d\'ajouter cette série');
  }
}

function showMenu(id){
  const s = db.shows[id];
  /* C5 — une feuille ouverte sur une série disparue plantait avant même de
     s'afficher (`s.name`), et emportait l'écran avec elle. */
  if(!s) return;
  openSheet('<h3>'+esc(s.name)+'</h3><p class="small muted" style="margin:0 0 6px">Mise à jour : '+
      fmtDate(new Date(s.updated||Date.now()).toISOString().slice(0,10))+'</p>'+
    /* « Reprendre » reste toujours proposé — sans quoi une série mise en pause
       par erreur avant cette règle n'aurait plus aucun moyen d'en sortir. */
    (s.pause || peutSeMettreEnPause(s)
      ? '<button class="opt" onclick="basculerPause('+id+')">'+
          (s.pause ? 'Reprendre cette série' : 'Mettre en pause')+'</button>'
      : '')+
    /* I6 — la seule entrée de ce menu qui s'adresse à quelqu'un d'autre. Elle
       n'apparaît que si le cercle n'est pas vide : proposer « recommander » à
       qui ne suit personne, c'est ouvrir une feuille vide. */
    (typeof cercle === 'function' && cercle().length
      ? '<button class="opt" onclick="menuRecommander(\'tv\','+id+')">Recommander à…</button>'
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

/* Décocher est le geste le plus facile à faire par accident — un rond de
   26 pixels dans une liste dense. Il passe donc toujours par `applyWatched` :
   une seule sauvegarde, un seul statut recalculé, un seul point d'accroche.

   §1.4 — mais SANS la barre « Annuler », parce qu'ici un second appui AU MÊME
   ENDROIT défait le geste : le rond ne bouge pas, il fait exactement l'inverse,
   et il n'y a rien à reconstruire de mémoire. Une barre qui apparaît à chaque
   coche encombre le bas de l'écran toute la soirée — et occupe la place de la
   question qui, elle, n'arrive qu'une fois par saison.
   C'est le critère, et lui seul : voir `applyWatched`. */
function toggleEp(id,s,e){
  const sh = db.shows[id];
  if(!sh) return;
  const k = key(s,e), etaitVu = !!sh.watched[k];
  applyWatched(id, x=>{ if(etaitVu) delete x.watched[k]; else x.watched[k] = Date.now(); },
               codeEp(s,e) + (etaitVu ? ' décoché' : ' vu'), { annulable:false });
}
/* Cocher une saison marque aussi les précédentes ; la décocher libère les suivantes.
   Les hors-série (saison 0) restent indépendants et ne déclenchent aucune cascade. */
function toggleWholeSeason(id, n){
  const sh = db.shows[id];
  /* C5 (09/08) — même garde que `toggleEp` juste au-dessus, qui l'avait déjà.
     Le DOM peut être en retard sur la base : une synchro entrante qui retire
     une série, un changement de compte, un import — et l'écran affiche encore
     des boutons qui portent l'identifiant d'une série disparue. Sans garde,
     `sh.seasons` lève un TypeError et l'écran entier se fige (voir `render`). */
  if(!sh) return;
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
  if(!sh) return;                                  // C5 — voir `toggleWholeSeason`
  const nb = allEpisodes(sh,true).filter(ep=>aired(ep) && !sh.watched[key(ep.s,ep.e)]).length;
  if(!nb) return toast('Déjà tout vu');
  applyWatched(id, s=>{
    const t = Date.now();
    allEpisodes(s,true).forEach(ep=>{ if(aired(ep)) s.watched[key(ep.s,ep.e)] = t; });
  }, nb+' épisode'+(nb>1?'s':'')+' marqué'+(nb>1?'s':'')+' vu'+(nb>1?'s':''));
}
function toutDecocher(id){
  const sh = db.shows[id];
  if(!sh) return;                                  // C5 — voir `toggleWholeSeason`
  const nb = Object.keys(sh.watched || {}).length;
  if(!nb) return;
  applyWatched(id, s=>{ s.watched = {}; },
    nb+' épisode'+(nb>1?'s':'')+' décoché'+(nb>1?'s':''));
}
function toggleToutVu(id){
  if(!db.shows[id]) return;                        // C5 — voir `toggleWholeSeason`
  const p = progress(db.shows[id]);
  if(p.total > 0 && p.watched === p.total) toutDecocher(id); else marquerToutVu(id);
}
/* ===== Marquage groupé, statut recalculé une seule fois, action annulable ===== */
let undoData = null, undoTimer = null;

function pushUndo(showId, prevWatched, label){
  /* LOT A — les deux barres partagent le même emplacement au pixel près, et la
     question se posait PAR-DESSUS « Annuler » avec un z-index plus fort : le
     doigt qui visait « Annuler » tombait sur un pouce. Elle recule dans la file
     et reviendra quand la place sera libre. */
  if(typeof reculerAvis === 'function') reculerAvis();
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
  /* LOT A — la barre « Annuler » libère la place : si une question « tu as
     aimé ? » attendait derrière, c'est son tour. Les deux se suivent au lieu de
     se mélanger — Annuler reste Annuler, et la question ne pollue pas un geste
     qu'on est peut-être en train de regretter. */
  if(typeof filerAvis === 'function') filerAvis();
}
function doUndo(){
  if(!undoData) return;
  /* LOT A — la saison n'est plus terminée : il n'y a plus rien à demander SUR
     CETTE SÉRIE. Les questions en attente sur d'autres titres, elles, restent
     valables. Avant `hideUndo`, qui déclenche justement la file. */
  if(typeof annulerFileAvis === 'function') annulerFileAvis('tv', undoData.showId);
  const sh = db.shows[undoData.showId];
  if(sh){
    const avant = Object.assign({}, sh.watched);
    sh.watched = undoData.prev;
    noterDecoches(sh, avant);
    saveDB();
  }
  hideUndo(); render(); toast('Annulé');
}

/* Applique une modification d'un coup : une sauvegarde, un rendu, un statut
   recalculé — et c'est le PASSAGE UNIQUE de toute modification des épisodes vus.
   C'est pour ça que les deux nouveautés du lot A s'accrochent ici et nulle part
   ailleurs : aucun chemin ne peut les contourner.

   `opts.annulable` — §1.4. LE CRITÈRE N'EST PAS « unitaire ou groupé ». C'est :
   **un second appui au même endroit défait-il le geste ?**
   La première formulation était fausse, et elle a coûté un défaut réel : le rond
   de la carte « À rattraper » est unitaire, il avait donc perdu sa barre — sauf
   qu'il ne se ré-appuie pas, puisqu'il pointe déjà sur l'épisode suivant.
   Là où la réponse est OUI — la coche d'une ligne d'épisode, sur la fiche —
   la barre disparaît : le bouton est sous le doigt, il fait exactement l'inverse,
   et une barre à chaque coche encombrerait le bas de l'écran toute la soirée en
   occupant la place où la question « tu as aimé ? » doit venir.
   Là où la réponse est NON, la barre reste. Deux familles de cas :
     · les actions groupées — après une cascade, un second clic ne restaure rien,
       et personne ne se souvient de ce qui était coché avant ;
     · les gestes dont la cible BOUGE — le rond de « À rattraper » vise déjà
       l'épisode suivant, ou la carte a disparu du rail.
   Le défaut est `true` : en cas d'oubli, on retombe sur le comportement d'avant
   ce lot, jamais sur la perte silencieuse d'un moyen de revenir en arrière. */
function applyWatched(showId, mutate, label, opts){
  const sh = db.shows[showId];
  if(!sh) return;
  const annulable = !opts || opts.annulable !== false;
  const prev = Object.assign({}, sh.watched);
  const saisonsAvant = (typeof saisonsFinies === 'function') ? saisonsFinies(sh) : {};
  /* SPEC-06 §3.1 — L'ÉTAT « TOUT VU » AVANT LE GESTE. C'est le seul moyen de
     distinguer « la série vient de se terminer » de « elle l'était déjà ».
     Ce point d'accroche vaut pour les DEUX chemins que le §3.1 nomme (le
     dernier épisode coché et « Toute la série vue ») parce que les deux
     passent par ici — et les imports comme la synchro, eux, n'y passent pas :
     la règle « seuls les gestes locaux déclenchent » est donc garantie par la
     forme du code, pas par un drapeau qu'on pourrait oublier de poser. */
  const finiAvant = (typeof isFinished === 'function') ? isFinished(sh) : false;
  mutate(sh);
  noterDecoches(sh, prev);
  saveDB(); render();
  if(annulable) pushUndo(showId, prev, label);
  /* Après `pushUndo` : la question doit voir si une barre « Annuler » vient
     d'être posée, pour prendre la file derrière elle. */
  if(typeof signalerSaisonsFinies === 'function')
    signalerSaisonsFinies(sh, saisonsAvant, saisonsFinies(sh));
  /* §3.3 — après que le geste a été appliqué ET confirmé (la barre « Annuler »
     est posée juste au-dessus) : la feuille ne bloque rien, elle se glisse
     derrière. */
  if(!finiAvant && typeof isFinished === 'function' && isFinished(sh) &&
     typeof proposerDuelEclair === 'function')
    proposerDuelEclair('tv', showId, sh.name);
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

/* Un seul épisode, sur la fiche : la coche reste sous le doigt et un second
   appui la défait. Pas de barre « Annuler » (§1.4). */
function marquerSeul(id, n, e){
  applyWatched(id, sh=>{ sh.watched[key(n,e)] = Date.now(); },
               codeEp(n,e)+' marqué vu', { annulable:false });
}
function marquerCascade(id, n, e){
  const sh = db.shows[id];
  const liste = episodesAvant(sh, n, e).concat([{s:n, e:e}]);
  const nb = liste.length;
  applyWatched(id, s2=>{ const t = Date.now(); liste.forEach(ep=> s2.watched[key(ep.s,ep.e)] = t); },
               nb+' épisodes marqués vus');
}

/* B5 — le rond de la carte « À rattraper ». C'est le geste le plus exposé de
   l'app : un rond au milieu d'un rail qui défile sous le pouce.

   §1.4 — il GARDE sa barre « Annuler », et c'est le cas qui a servi à corriger
   la règle. Le critère n'est pas « un épisode ou plusieurs », c'est « un second
   appui au même endroit défait-il le geste ? ». Ici, non : dès le premier appui
   le rond pointe sur l'épisode SUIVANT, ou la carte a quitté le rail parce que
   la série n'a plus de retard. Un second appui ne défait donc rien — il marque
   un épisode de plus. Sans barre, il ne restait aucun moyen de revenir en
   arrière sur place.
   Conséquence assumée : quand ce rond termine une saison, la question « tu as
   aimé ? » prend la file derrière la barre et arrive à sa disparition. Les deux
   ne se superposent jamais — voir `reculerAvis` / `filerAvis`. */
function quickWatch(id, ev){
  if(ev) ev.stopPropagation();
  const s = db.shows[id];
  if(!s) return;                                   // C5 — voir `toggleWholeSeason`
  const nx = nextToWatch(s);
  if(!nx) return;
  applyWatched(id, x=>{ x.watched[key(nx.s,nx.e)] = Date.now(); },
               codeEp(nx.s,nx.e)+' vu');
}
