"use strict";
/* ---------- Où regarder : plateformes de streaming ----------
   TMDB fournit la disponibilité par pays grâce à son partenariat avec JustWatch,
   qui doit être cité. On ne montre que ce qui est inclus dans un abonnement
   (« flatrate ») ; le lien renvoie vers la page TMDB qui liste toutes les offres. */
const REGION_PLATO = 'FR';
const platos = {};                 // clé « tv:1399 » → {abo, lien} · 'attente' · null si échec

async function chargerPlateformes(type, id){
  const k = type+':'+id;
  if(platos[k] !== undefined) return;
  platos[k] = 'attente';
  try{
    const d = await tmdb('/'+type+'/'+id+'/watch/providers');
    const r = (d && d.results && d.results[REGION_PLATO]) || {};
    platos[k] = {
      abo:  Array.isArray(r.flatrate) ? r.flatrate : [],
      lien: (typeof r.link === 'string') ? r.link : ''
    };
  }catch(e){ delete platos[k]; }   // on oublie l'échec pour pouvoir réessayer à la prochaine ouverture
  peindrePlateformes(k);
}

function peindrePlateformes(k){
  const el = document.getElementById('plats');
  if(el && el.getAttribute('data-cle') === k) el.innerHTML = corpsPlateformes(k);
}

/* Emplacement réservé dans la page ; le contenu arrive dès la réponse. */
function blocPlateformes(type, id){
  const k = type+':'+id;
  if(platos[k] === undefined) setTimeout(()=>chargerPlateformes(type, id), 0);
  return '<div id="plats" data-cle="'+esc(k)+'">'+corpsPlateformes(k)+'</div>';
}

function corpsPlateformes(k){
  const p = platos[k];
  if(p === undefined || p === 'attente' || p === null) return '';   // rien tant qu'on ne sait pas
  const credit = '<div class="credit">Disponibilité fournie par JustWatch'+
    (p.lien ? ' · <a href="'+esc(p.lien)+'" target="_blank" rel="noopener">toutes les offres</a>' : '')+
    '</div>';
  if(!p.abo.length)
    return '<div class="sectitle">Où le regarder</div>'+
      '<div class="small muted" style="margin:0 16px">Aucun abonnement ne le propose en France.</div>'+
      credit;
  return '<div class="sectitle">Où le regarder</div><div class="plats">'+
    p.abo.map(f=>{
      const nom = f && f.provider_name ? String(f.provider_name) : '';
      const img = f && f.logo_path ? '<img loading="lazy" src="'+IMG(f.logo_path,'w92')+'" alt="">'
                                   : '<div class="ph3">'+esc(nom.slice(0,1))+'</div>';
      return '<div class="plato">'+img+'<span>'+esc(nom)+'</span></div>';
    }).join('')+'</div>'+credit;
}

function castStrip(credits){
  const cast = ((credits||{}).cast||[]).slice(0,12);
  if(!cast.length) return '';
  return '<div class="sectitle">Casting</div><div class="cast">'+cast.map(p=>
    '<div class="cperson">'+
      (p.profile_path ? '<img loading="lazy" src="'+IMG(p.profile_path,'w185')+'" alt="">'
                      : '<div class="ph2">'+esc((p.name||'?')[0])+'</div>')+
      '<div class="cname">'+esc(p.name)+'</div>'+
      '<div class="crole">'+esc(p.character||'')+'</div>'+
    '</div>').join('')+'</div>';
}

function viewPreview(){
  const isTv = params.type==='tv';
  const back = "goBack()";
  const st = ui.preview || {};

  if(st.loading) return header('Chargement…',{back:back})+
    '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Chargement de la fiche…</p></div>';
  if(st.error) return header('Erreur',{back:back})+
    '<div class="empty"><h3>Oups</h3><p>'+esc(st.error)+'</p>'+
    '<button class="btn ghost" onclick="loadPreview()">Réessayer</button></div>';
  if(!st.data) return header('',{back:back});

  const d = st.data;
  const title = isTv ? d.name : d.title;
  const date = isTv ? d.first_air_date : d.release_date;
  const inList = isTv ? !!db.shows[d.id] : !!db.movies[d.id];
  const note = d.vote_average ? Math.round(d.vote_average*10)/10 : null;

  let html = header(title,{back:back});
  html += '<div class="hero">'+(d.backdrop_path?'<img src="'+IMG(d.backdrop_path,'w780')+'" alt="">':'')+'</div>';
  html += '<div class="dhead">'+posterEl(d.poster_path,'w342','',title)+
    '<div class="dmeta">'+
      '<h2>'+esc(title)+'</h2>'+
      '<div class="small muted">'+esc(year(date))+
        (isTv && d.networks && d.networks[0] ? ' · '+esc(d.networks[0].name) : '')+
        (!isTv && d.runtime ? ' · '+d.runtime+' min' : '')+'</div>'+
      (note ? '<div style="margin-top:6px"><span class="note">'+I.star+note+'</span>'+
        '<span class="tiny muted" style="margin-left:6px">'+(d.vote_count||0)+' votes</span></div>' : '')+
      '<div class="small muted" style="margin-top:6px">'+esc((d.genres||[]).map(g=>g.name).slice(0,3).join(' · '))+'</div>'+
    '</div></div>';

  /* Boutons d'action */
  if(isTv){
    html += '<div class="actions">'+ (inList
      ? '<button class="btn" onclick="go(\'show\',{id:'+d.id+', from:\''+(params.from||'discover')+'\'})">'+I.eye+' Ouvrir ma fiche</button>'
      : '<button class="btn" id="addbtn" onclick="addOrOpenShow('+d.id+')">'+I.plus+' Ajouter à ma liste</button>')
      +'</div>';
  } else {
    const m = db.movies[d.id];
    html += '<div class="actions">'+
      '<button class="btn" style="'+(m&&m.seen?'background:var(--ok);color:#08130d':'')+'" onclick="addMovie('+d.id+',true)">'+
        I.check+(m&&m.seen?' Déjà vu':' Marquer vu')+'</button>'+
      '<button class="btn ghost" onclick="addMovie('+d.id+',false)">'+I.bookmark+' À voir</button>'+
    '</div>';
  }

  /* Chiffres clés */
  if(isTv){
    html += '<div class="stats">'+
      '<div class="stat"><b>'+(d.number_of_seasons||'?')+'</b><span>saison'+((d.number_of_seasons||0)>1?'s':'')+'</span></div>'+
      '<div class="stat"><b>'+(d.number_of_episodes||'?')+'</b><span>épisodes</span></div>'+
      '<div class="stat"><b>'+(d.episode_run_time&&d.episode_run_time[0]?d.episode_run_time[0]+' min':'—')+'</b><span>par épisode</span></div>'+
    '</div>';
    const totalMin = (d.number_of_episodes||0)*((d.episode_run_time&&d.episode_run_time[0])||42);
    html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:13px;text-align:center">'+
      '<span class="small muted">Tout regarder&nbsp;: </span><b>'+fmtDur(totalMin)+'</b>'+
      '<span class="small muted"> · '+esc(d.status==='Ended'?'série terminée':d.status==='Canceled'?'annulée':'en cours')+'</span>'+
      '</div></div>';
  } else {
    html += '<div class="stats">'+
      '<div class="stat"><b>'+(d.runtime?fmtDurShort(d.runtime):'—')+'</b><span>durée</span></div>'+
      '<div class="stat"><b>'+esc(year(date)||'—')+'</b><span>sortie</span></div>'+
      '<div class="stat"><b>'+(note||'—')+'</b><span>note TMDB</span></div>'+
    '</div>';
  }

  if(d.overview) html += '<div class="sectitle">Synopsis</div><div class="overview" style="margin-top:0">'+esc(d.overview)+'</div>';
  else html += '<div class="overview muted" style="font-style:italic">Pas de synopsis disponible en français.</div>';

  html += blocPlateformes(isTv ? 'tv' : 'movie', d.id);

  /* Détail des saisons */
  if(isTv && d.seasons && d.seasons.length){
    html += '<div class="sectitle">Saisons</div><div class="seasonpill">'+
      d.seasons.filter(s=>s.season_number>0).map(s=>
        '<div class="spill"><b>S'+s.season_number+'</b><span>'+s.episode_count+' ép.</span>'+
        '<span>'+esc(year(s.air_date)||'')+'</span></div>').join('')+'</div>';
  }

  html += castStrip(d.credits);
  html += '<div style="height:30px"></div>';
  return html;
}

/* ---------- Vue : fiche film de ma liste ---------- */
function viewMovie(){
  const m = db.movies[params.id];
  const back = "goBack()";
  if(!m) return header('Introuvable',{back:"go('profile')"});
  let html = header(m.title,{back:back,
    right:'<button class="iconbtn" onclick="movieMenu('+m.id+')">'+I.dots+'</button>'});
  html += '<div class="hero">'+(m.backdrop?'<img src="'+IMG(m.backdrop,'w780')+'" alt="">':'')+'</div>';
  html += '<div class="dhead">'+posterEl(m.poster,'w342','',m.title)+
    '<div class="dmeta"><h2>'+esc(m.title)+'</h2>'+
      '<div class="small muted">'+esc(year(m.date))+(m.runtime?' · '+m.runtime+' min':'')+'</div>'+
      (m.note?'<div style="margin-top:6px"><span class="note">'+I.star+(Math.round(m.note*10)/10)+'</span></div>':'')+
      '<div class="small muted" style="margin-top:6px">'+esc((m.genres||[]).slice(0,3).join(' · '))+'</div>'+
    '</div></div>';
  html += '<div class="actions"><button class="btn block" style="'+(m.seen?'background:var(--ok);color:#08130d':'')+
    '" onclick="toggleMovie('+m.id+')">'+I.check+(m.seen?' Vu le '+fmtDate(new Date(m.watchedAt).toISOString().slice(0,10)):' Marquer comme vu')+'</button></div>';
  if(m.overview) html += '<div class="sectitle">Synopsis</div><div class="overview" style="margin-top:0">'+esc(m.overview)+'</div>';
  html += blocPlateformes('movie', m.id);
  html += '<div style="height:30px"></div>';
  return html;
}
function toggleMovie(id){
  const m = db.movies[id]; if(!m) return;
  m.seen = !m.seen; m.watchedAt = m.seen ? Date.now() : null;
  saveDB(); render();
}
function movieMenu(id){
  const m = db.movies[id];
  openSheet('<h3>'+esc(m.title)+'</h3><p class="small muted" style="margin:0 0 8px">'+esc(year(m.date))+'</p>'+
    '<button class="opt danger" onclick="removeMovie('+id+')">Retirer de ma liste</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}
function removeMovie(id){
  markDeleted('movies',id); delete db.movies[id]; saveDB(); closeSheet();
  if(view==='movie'){ ui.profTab='films'; go('profile'); } else render();
}
