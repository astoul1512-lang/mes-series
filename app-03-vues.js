"use strict";
/* ============================ Rendu ============================ */
/* ---------- Mise en route : les trois écrans du premier lancement ----------
   Objectif : que quelqu'un qui n'a jamais entendu parler de TMDB arrive
   au bout sans aide. Chaque écran ne demande qu'une seule chose. */

const ACCUEIL_PAS = 3;

function demarrerAccueil(){ ui.pas = 0; ui.cleErr = ''; go('accueil'); }

function finirAccueil(destination){
  db.onboarde = true;
  saveDB();
  document.body.classList.remove('accueil');
  go(destination || 'discover');
}

function pasSuivant(){
  if(ui.pas === 0){
    const el = document.getElementById('prenom');
    const v = el ? el.value.trim() : '';
    if(v){ db.pseudo = v; saveDB(); }
  }
  ui.pas = Math.min(ACCUEIL_PAS - 1, (ui.pas || 0) + 1);
  ui.cleErr = '';
  render();
}
function pasPrecedent(){ ui.pas = Math.max(0, (ui.pas || 0) - 1); ui.cleErr = ''; render(); }

/* La clé est vérifiée auprès de TMDB avant de laisser passer : mieux vaut
   une erreur ici qu'un écran de recherche vide sans explication. */
async function validerCle(){
  const el = document.getElementById('cle');
  const v = el ? el.value.trim() : '';
  if(!v){ ui.cleErr = 'Colle ta clé dans le champ ci-dessus.'; return render(); }
  const btn = document.getElementById('btncle');
  if(btn){ btn.setAttribute('disabled',''); btn.innerHTML = '<span class="spin"></span> Vérification…'; }
  const avant = db.apiKey;
  db.apiKey = v;
  try{
    await tmdb('/configuration');
    saveDB();
    ui.cleErr = '';
    pasSuivant();
  }catch(e){
    db.apiKey = avant;
    ui.cleErr = (e.message === 'BADKEY')
      ? 'TMDB refuse cette clé. Vérifie que tu as bien copié la ligne « Clé de l\'API (v3) ».'
      : 'Impossible de joindre TMDB. Vérifie ta connexion, puis réessaie.';
    render();
  }
}

function puces(n){
  let h = '<div class="puces">';
  for(let i = 0; i < ACCUEIL_PAS; i++) h += '<i class="'+(i === n ? 'on' : '')+'"></i>';
  return h + '</div>';
}

function viewAccueil(){
  const n = ui.pas || 0;
  let h = '<div class="acc">';

  if(n === 0){
    h += '<div class="acclogo">'+I.tv+'</div>'+
      '<h1>Mes Séries</h1>'+
      '<p class="accsub">Tu coches les épisodes que tu as vus, l\'app retient où tu en es '+
      'et te dit quand la suite arrive.</p>'+
      '<label class="fld" style="margin-top:26px"><span>Comment tu t\'appelles ?</span>'+
        '<input type="text" id="prenom" value="'+esc(db.pseudo||'')+'" placeholder="Ton prénom" '+
        'autocomplete="given-name" onkeydown="if(event.key===\'Enter\'){this.blur();pasSuivant()}">'+
        '<em>Utilisé seulement si tu partages ta liste avec quelqu\'un. Tu peux laisser vide.</em></label>'+
      '<button class="btn block" style="margin-top:20px" onclick="pasSuivant()">Commencer</button>';
  }

  else if(n === 1){
    h += '<h1>Une clé, une seule fois</h1>'+
      '<p class="accsub">Les affiches, les résumés et les dates de diffusion viennent de '+
      '<b>TMDB</b>, une base de données de films et séries. Elle est gratuite, mais demande '+
      'une clé personnelle. Trois minutes, une fois pour toutes.</p>'+
      '<ol class="etapes">'+
        '<li>Crée un compte sur <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener">themoviedb.org</a>'+
          ' <span class="tiny muted">(un e-mail suffit)</span></li>'+
        '<li>Ouvre <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">Paramètres → API</a>'+
          ' et demande une clé pour un <i>usage personnel</i></li>'+
        '<li>Copie la ligne <b>Clé de l\'API (v3)</b> et colle-la ici</li>'+
      '</ol>'+
      '<label class="fld"><span>Ta clé TMDB</span>'+
        '<input type="text" id="cle" value="'+esc(db.apiKey||'')+'" placeholder="Colle ta clé ici" '+
        'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" '+
        'onkeydown="if(event.key===\'Enter\'){this.blur();validerCle()}"></label>'+
      (ui.cleErr ? '<div class="accerr">'+esc(ui.cleErr)+'</div>' : '')+
      '<button class="btn block" id="btncle" style="margin-top:16px" onclick="validerCle()">Vérifier et continuer</button>'+
      '<div class="accliens">'+
        '<button onclick="pasPrecedent()">Retour</button>'+
        '<button onclick="pasSuivant()">Plus tard</button>'+
      '</div>';
  }

  else {
    const qui = (db.pseudo||'').trim();
    h += '<div class="acclogo ok">'+I.check+'</div>'+
      '<h1>'+(qui ? 'Tout est prêt, '+esc(qui) : 'Tout est prêt')+'</h1>'+
      '<p class="accsub">'+(db.apiKey
        ? 'Ta clé fonctionne. Cherche une série que tu regardes en ce moment et coche les épisodes déjà vus.'
        : 'Tu pourras ajouter ta clé plus tard dans Mon profil → Réglages. Sans elle, la recherche ne fonctionnera pas.')+
      '</p>'+
      '<button class="btn block" style="margin-top:22px" onclick="finirAccueil(\'discover\')">'+
        'Chercher ma première série</button>'+
      '<div class="accliens">'+
        '<button onclick="finirAccueil(\'account\')">J\'ai déjà un compte</button>'+
      '</div>';
  }

  return h + puces(n) + '</div>';
}

function render(){
  const app = document.getElementById('app');
  let html = '';
  if(view==='accueil') html = viewAccueil();
  else if(view==='follow') html = viewFollow();
  else if(view==='discover') html = viewDiscover();
  else if(view==='profile') html = viewProfile();
  else if(view==='settings') html = viewSettings();
  else if(view==='show') html = viewShow();
  else if(view==='preview') html = viewPreview();
  else if(view==='movie') html = viewMovie();
  else if(view==='account') html = viewAccount();
  else if(view==='abos') html = viewAbos();
  else if(view==='biblio') html = viewBiblio();
  app.innerHTML = html;
  /* Pendant la mise en route, la barre du bas disparaît : rien d'autre à faire
     que d'aller au bout des trois écrans. */
  document.body.classList.toggle('accueil', view === 'accueil');
  app.classList.remove('enter','back');
  /* Retour au doigt : pas d'animation toute faite. L'écran d'arrivée est posé
     là où le geste s'est arrêté, puis il finit sa course. Aucun saut, un seul
     mouvement continu du début du geste jusqu'à l'arrivée. */
  if(repriseGeste && navDir === 'back'){
    const g = repriseGeste; repriseGeste = null;
    navDir = 'none';
    app.style.transition = 'none';
    app.style.transform = 'translate3d('+g.d+'px,0,0)';
    app.style.opacity = String(g.op);
    app.style.willChange = 'transform';
    /* Le mouvement est lancé à l'image suivante, avec une minuterie de secours :
       si l'app passe en arrière-plan juste à cet instant, les images sont
       suspendues et l'écran resterait décalé pour de bon. */
    let parti = false;
    const finir = ()=>{
      if(parti) return;
      parti = true;
      void app.offsetWidth;                       // le point de départ est bien pris en compte
      app.style.transition = 'transform .26s cubic-bezier(.22,.61,.36,1), opacity .26s';
      app.style.transform = 'translate3d(0,0,0)';
      app.style.opacity = '1';
      /* Tout est remis à plat : une couche graphique laissée en place
         déréglait les barres fixes sur iPhone. */
      setTimeout(()=>{
        app.style.transition=''; app.style.transform='';
        app.style.opacity=''; app.style.willChange='';
      }, 320);
    };
    requestAnimationFrame(finir);
    setTimeout(finir, 80);
  }
  repriseGeste = null;
  if(navDir==='enter' || navDir==='back'){
    void app.offsetWidth;
    const sens = navDir;
    app.classList.add(sens);
    /* On retire la classe dès la fin de l'animation : la laisser en place
       maintenait une couche graphique qui déréglait les barres fixes. */
    app.addEventListener('animationend', function fini(){
      app.classList.remove(sens);
      app.removeEventListener('animationend', fini);
    });
  }
  navDir = 'none';
  renderNav();
  if(view==='discover'){
    const inp = document.getElementById('q');
    if(inp && ui.focusSearch){ inp.focus(); ui.focusSearch=false; }
    /* Premier passage sur Découvrir : on va chercher les suggestions */
    if(!ui.disc.charge && !ui.disc.loading && db.apiKey) chargerDecouverte();
  }
}
function renderNav(){
  const tabs = [
    ['discover','Découvrir',I.boussole],
    ['follow','À suivre',I.cal],
    ['profile','Mon profil',I.user]
  ];
  const depuis = params.from;
  const cur = (view==='preview') ? 'discover'
            : (view==='account'||view==='abos'||view==='biblio') ? 'profile'
            : (view==='show'||view==='movie'||view==='settings')
              ? (depuis==='discover' ? 'discover' : (depuis||'profile'))
            : view;
  document.getElementById('nav').style.gridTemplateColumns = 'repeat('+tabs.length+',1fr)';
  document.getElementById('nav').innerHTML = tabs.map(([id,label,icon])=>
    '<button class="tab '+(cur===id?'on':'')+'" onclick="go(\''+id+'\')">'+icon+'<span>'+label+'</span></button>'
  ).join('');
}

function header(title, opts){
  opts = opts||{};
  return '<header><div class="hbar">'+
    (opts.back ? '<button class="iconbtn" onclick="'+opts.back+'">'+I.back+'</button>' : '')+
    '<div class="htitle">'+esc(title)+'</div>'+
    (opts.right||'')+
  '</div>'+(opts.sub||'')+'</header>';
}

function needKeyBanner(){
  if(db.apiKey) return '';
  return '<div class="banner">Pour chercher des séries, ajoute ta clé TMDB dans <b>Réglages</b>. '+
         "C'est gratuit et ça prend 2 minutes.</div>";
}

/* ---------- Vue : À suivre (à rattraper + à venir) ---------- */
function viewFollow(){
  const shows = Object.values(db.shows);
  const t = todayISO();

  /* --- À rattraper : le prochain épisode non vu de chaque série --- */
  const todo = [];
  shows.forEach(s=>{
    if(statutSerie(s) !== 'asuivre') return;   // ni les non commencées, ni les terminées
    const nx = nextToWatch(s);
    if(nx) todo.push({s:s, ep:nx});
  });
  todo.sort((a,b)=> (b.ep.d||'').localeCompare(a.ep.d||''));   // épisode le plus récent d'abord

  /* --- À venir : diffusions futures --- */
  /* Les séries pas encore commencées (« À voir ») n'apparaissent pas ici :
     cet onglet ne parle que de ce qu'on suit réellement. */
  const items = [];
  shows.forEach(s=>{
    const st = statutSerie(s);
    if(st === 'avoir' || st === 'pause') return;
    allEpisodes(s,false).forEach(ep=>{ if(ep.d && ep.d >= t) items.push({d:ep.d, show:s, ep:ep}); });
    if(s.next && s.next.d && s.next.d >= t && !(s.seasons[s.next.s]||[]).some(e=>e.e===s.next.e))
      items.push({d:s.next.d, show:s, ep:{s:s.next.s, e:s.next.e, n:s.next.n, d:s.next.d}});
  });
  items.sort((a,b)=>a.d.localeCompare(b.d));
  const upcoming = items.slice(0,80);

  let html = header('À suivre', {right:'<button class="iconbtn" onclick="go(\'discover\')">'+I.plus+'</button>'});
  html += needKeyBanner();

  if(!shows.length){
    return html + '<div class="empty">'+I.tv+'<h3>Rien à suivre pour l\'instant</h3>'+
      '<p>Ajoute une série ou un film depuis la recherche : tu retrouveras ici tes prochains épisodes et les dates de diffusion.</p>'+
      '<button class="btn" onclick="go(\'discover\')">Chercher une série</button></div>';
  }

  /* Section 1 */
  html += '<div class="sectitle">À rattraper'+(todo.length?'<span class="cnt">'+todo.length+'</span>':'')+'</div>';
  if(!todo.length){
    const enAttente = shows.filter(x=>statutSerie(x)==='avoir').length;
    html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:18px;text-align:center">'+
      (enAttente
        ? '<div style="font-size:15px;font-weight:650">Rien de commencé</div>'+
          '<div class="small muted" style="margin-top:3px">'+enAttente+' série'+(enAttente>1?'s':'')+
          ' t\'attend'+(enAttente>1?'ent':'')+' dans « À voir ».</div>'+
          '<button class="btn ghost" style="margin-top:12px" onclick="ui.profTab=\'avoir\';go(\'profile\')">Ouvrir À voir</button>'
        : '<div style="font-size:15px;font-weight:650">Tu es à jour partout 🎉</div>'+
          '<div class="small muted" style="margin-top:3px">Plus aucun épisode diffusé en attente.</div>')+
      '</div></div>';
  } else {
    html += '<div class="list">'+todo.map(x=>catchupRow(x.s,x.ep)).join('')+'</div>';
  }

  /* Section 2 */
  html += '<div class="sectitle">À venir</div>';
  if(!upcoming.length){
    html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:18px;text-align:center">'+
      '<div class="small muted">Aucune date de diffusion annoncée pour tes séries.</div></div></div>';
  } else {
    let cur = '', out = '<div class="day">';
    upcoming.forEach(i=>{
      if(i.d !== cur){ cur = i.d; out += '<div class="daylbl">'+fmtDayLabel(i.d)+'</div>'; }
      const thumb = IMG(i.ep.st,'w300') || IMG(i.show.backdrop,'w300') || IMG(i.show.poster,'w154');
      out += '<div class="crow" onclick="go(\'show\',{id:'+i.show.id+',from:\'follow\'})">'+
        (thumb ? '<img class="cthumb" loading="lazy" src="'+thumb+'" alt="">' : '<div class="cthumb"></div>')+
        '<div class="epinfo">'+
          '<div class="epname">'+esc(i.show.name)+'</div>'+
          '<div class="epsub">'+codeEp(i.ep.s,i.ep.e)+' · '+esc(i.ep.n||'')+'</div>'+
        '</div></div>';
    });
    out += '</div>';
    html += out;
  }
  return html + '<div style="height:24px"></div>';
}

/* Appui long sur une ligne « À rattraper » : c'est là qu'on se dit qu'on ne
   suit plus la série. On propose de la mettre de côté sans quitter l'écran. */
let pressTimer = null, pressLong = false, pressX = 0, pressY = 0;
function pressStart(id, ev){
  pressLong = false;
  const t = ev && ev.touches && ev.touches[0];
  pressX = t ? t.clientX : 0; pressY = t ? t.clientY : 0;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(()=>{ pressLong = true; menuPause(id); }, 500);
}
/* Un doigt posé bouge toujours de quelques pixels : on ne renonce qu'au-delà
   de 12 px, sinon le geste est annulé avant même d'avoir commencé. */
function pressMove(ev){
  const t = ev && ev.touches && ev.touches[0];
  if(!t) return;
  if(Math.abs(t.clientX - pressX) > 12 || Math.abs(t.clientY - pressY) > 12) pressEnd();
}
function pressEnd(){ clearTimeout(pressTimer); }
function pressClic(id, ev){
  if(pressLong){ pressLong = false; if(ev) ev.stopPropagation(); return; }
  go('show', {id:id, from:'follow'});
}
function menuPause(id){
  const s = db.shows[id];
  if(!s) return;
  if(navigator.vibrate) try{ navigator.vibrate(8); }catch(e){}
  openSheet('<h3>'+esc(s.name)+'</h3>'+
    '<p class="small muted" style="margin:0 0 8px">Elle disparaîtra d\'« À rattraper » et du calendrier. '+
    'Tes épisodes cochés sont conservés.</p>'+
    '<button class="opt" onclick="basculerPause('+id+')">Mettre en pause</button>'+
    '<button class="opt" onclick="closeSheet();go(\'show\',{id:'+id+',from:\'follow\'})">Ouvrir la fiche</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

function catchupRow(s, nx){
  const p = progress(s);
  const recent = nx.d && nx.d < todayISO() && (Date.now()-Date.parse(nx.d)) < 45*86400000;
  return '<div class="srow">'+
    '<div style="display:flex;gap:12px;flex:1;min-width:0" onclick="pressClic('+s.id+',event)"'+
      ' ontouchstart="pressStart('+s.id+',event)" ontouchend="pressEnd()" ontouchmove="pressMove(event)"'+
      ' ontouchcancel="pressEnd()">'+
      posterEl(s.poster,'w154','',s.name)+
      '<div class="sinfo">'+
        '<div class="sname">'+esc(s.name)+'</div>'+
        '<div class="snext"><b>'+codeEp(nx.s,nx.e)+'</b> · '+esc(nx.n)+'</div>'+
        '<div class="tiny muted" style="margin-top:2px">'+
          p.watched+' / '+p.total+' épisodes'+
          (recent ? ' · sorti le '+fmtDateShort(nx.d) : '')+'</div>'+
        '<div class="bar"><i style="width:'+p.pct+'%"></i></div>'+
      '</div>'+
    '</div>'+
    /* Le menu est visible : la mise en pause ne doit pas dépendre d'un geste caché. */
    '<div class="srowact">'+
      '<button class="rowdots" title="Options" onclick="menuPause('+s.id+')">'+I.dots+'</button>'+
      '<button class="watchbtn" title="Marquer '+codeEp(nx.s,nx.e)+' comme vu" onclick="quickWatch('+s.id+',event)">'+I.check+'</button>'+
    '</div>'+
  '</div>';
}

/* ---------- Vue : Mon profil ---------- */
function lastWatchedAt(s){
  let m = 0;
  for(const k in s.watched){ if(s.watched[k] > m) m = s.watched[k]; }
  return m;
}

function viewProfile(){
  let epCount = 0, minutes = 0, doneShows = 0;
  Object.values(db.shows).forEach(s=>{
    allEpisodes(s,true).forEach(ep=>{
      if(s.watched[key(ep.s,ep.e)]){ epCount++; minutes += epRuntime(s,ep); }
    });
    if(isFinished(s)) doneShows++;
  });
  const seenMovies = Object.values(db.movies).filter(m=>m.seen);
  seenMovies.forEach(m=> minutes += (m.runtime||100));

  const startedShows = Object.values(db.shows)
    .filter(s=>{ const st = statutSerie(s); return st!=='avoir' && st!=='pause'; })
    .sort((a,b)=>lastWatchedAt(b)-lastWatchedAt(a));
  const watchedMovies = Object.values(db.movies).filter(m=>statutFilm(m)==='vu')
    .sort((a,b)=>(b.watchedAt||0)-(a.watchedAt||0));
  const toWatch = [].concat(
    Object.values(db.shows).filter(s=>statutSerie(s)==='avoir').map(s=>({type:'show', o:s})),
    Object.values(db.movies).filter(m=>statutFilm(m)==='avoir').map(m=>({type:'movie', o:m}))
  );

  const enPause = Object.values(db.shows).filter(s=>statutSerie(s)==='pause')
    .sort((a,b)=>(b.pauseLe||0)-(a.pauseLe||0));

  const tabs = [['series','Séries',startedShows.length],
                ['films','Films',watchedMovies.length],
                ['avoir','À voir',toWatch.length]];
  if(enPause.length) tabs.push(['pause','En pause',enPause.length]);
  /* la puce « En pause » disparaît quand la dernière série reprend : on ne laisse pas
     l'onglet sélectionné pointer dans le vide */
  if(!tabs.some(t=>t[0]===ui.profTab)) ui.profTab = 'series';

  let html = header('Mon profil', {
    right:'<button class="iconbtn" onclick="profileMenu()">'+I.dots+'</button>',
    sub:'<div class="chips">'+tabs.map(([id,l,n])=>
      '<button class="chip '+(ui.profTab===id?'on':'')+'" onclick="ui.profTab=\''+id+'\';render()">'+
      l+' <span style="opacity:.65">'+n+'</span></button>').join('')+'</div>'
  });

  html += '<div class="stats">'+
    '<div class="stat"><b>'+epCount+'</b><span>épisode'+(epCount>1?'s':'')+' vu'+(epCount>1?'s':'')+'</span></div>'+
    '<div class="stat"><b>'+fmtDurShort(minutes)+'</b><span>de visionnage</span></div>'+
    '<div class="stat"><b>'+doneShows+'</b><span>série'+(doneShows>1?'s':'')+' finie'+(doneShows>1?'s':'')+'</span></div>'+
  '</div>';
  html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:13px;text-align:center">'+
    '<span class="small muted">'+startedShows.length+' série'+(startedShows.length>1?'s':'')+' suivie'+(startedShows.length>1?'s':'')+
    ' · '+watchedMovies.length+' film'+(watchedMovies.length>1?'s':'')+' vu'+(watchedMovies.length>1?'s':'')+
    ' · soit '+fmtDur(minutes)+'</span></div></div>';

  if(signedIn() && partage.suivis.length){
    html += '<div class="sectitle">Mes abonnements<span class="cnt">'+partage.suivis.length+'</span></div>'+
      '<div class="aborow">'+partage.suivis.slice(0,8).map(p=>
        '<button class="abomini" onclick="ouvrirBiblio(\''+p.id+'\')">'+
          '<div class="avatar">'+esc((p.pseudo||'?').charAt(0).toUpperCase())+'</div>'+
          '<span>'+esc(p.pseudo)+'</span></button>').join('')+
        '<button class="abomini" onclick="ouvrirAbos()"><div class="avatar plus">'+I.plus+'</div><span>Gérer</span></button>'+
      '</div>';
  }

  let cards = '';
  if(ui.profTab==='series'){
    if(!startedShows.length) cards = emptyProf('Aucune série commencée', 'Coche un épisode et la série apparaîtra ici.');
    else cards = '<div class="pgrid">'+startedShows.map(showCard).join('')+'</div>';
  } else if(ui.profTab==='films'){
    if(!watchedMovies.length) cards = emptyProf('Aucun film vu', 'Marque un film comme vu depuis la recherche.');
    else cards = '<div class="pgrid">'+watchedMovies.map(movieCard).join('')+'</div>';
  } else if(ui.profTab==='pause'){
    if(!enPause.length) cards = emptyProf('Aucune série en pause', 'Une série mise de côté se range ici, sans rien perdre.');
    else cards = '<div class="pgrid">'+enPause.map(showCard).join('')+'</div>';
  } else {
    /* « À voir » mélange séries et films : un petit filtre permet de ne garder
       que l'un des deux. Il n'apparaît que s'il y a effectivement les deux. */
    const nbS = toWatch.filter(x=>x.type==='show').length;
    const nbF = toWatch.length - nbS;
    const quoi = ui.avoirTri || 'tout';
    const liste = toWatch.filter(x=> quoi==='tout' ? true
                                   : quoi==='series' ? x.type==='show' : x.type==='movie');
    if(nbS && nbF){
      cards += '<div class="souschips">'+
        [['tout','Tout',toWatch.length],['series','Séries',nbS],['films','Films',nbF]].map(([id,l,n])=>
          '<button class="chip '+(quoi===id?'on':'')+'" onclick="ui.avoirTri=\''+id+'\';render()">'+
          l+' <span style="opacity:.65">'+n+'</span></button>').join('')+'</div>';
    }
    if(!toWatch.length) cards += emptyProf('Rien en attente', 'Les séries ajoutées mais pas commencées et les films « à voir » se rangent ici.');
    else if(!liste.length) cards += emptyProf(quoi==='series'?'Aucune série en attente':'Aucun film en attente',
                                              'Change de filtre juste au-dessus.');
    else cards += '<div class="pgrid">'+liste.map(x=> x.type==='show' ? showCard(x.o) : movieCard(x.o)).join('')+'</div>';
  }
  return html + cards + '<div style="height:26px"></div>';
}

function emptyProf(title, sub){
  return '<div class="empty" style="padding:38px 24px"><h3>'+esc(title)+'</h3><p>'+esc(sub)+'</p>'+
    '<button class="btn ghost" onclick="go(\'discover\')">Ouvrir la recherche</button></div>';
}

function showCard(s){
  const p = progress(s);
  const full = p.total>0 && p.watched===p.total;
  const st = statutSerie(s);
  const sub = st==='pause'
      ? 'En pause · '+p.watched+'/'+p.total
      : st==='avoir'
      ? (p.total ? p.total+' épisode'+(p.total>1?'s':'') : 'Pas encore diffusée')
      : (full ? (isFinished(s)?'Terminée':'À jour') : p.pct+'%');
  return '<div class="pcard">'+
    '<div class="ptap" onclick="go(\'show\',{id:'+s.id+',from:\'profile\'})">'+
      '<div class="wrapimg">'+posterEl(s.poster,'w342','',s.name)+
        (st!=='avoir' && p.total ? '<div class="pbadge '+(full?'done':'')+'">'+p.watched+'/'+p.total+'</div>' : '')+
        (st!=='avoir' ? '<div class="pbar"><i class="'+(full?'full':'')+'" style="width:'+p.pct+'%"></i></div>' : '')+
      '</div>'+
      '<div class="pname">'+esc(s.name)+'</div>'+
      '<div class="psub">'+sub+'</div>'+
    '</div>'+
  '</div>';
}

function movieCard(m){
  return '<div class="pcard">'+
    '<div class="ptap" onclick="go(\'movie\',{id:'+m.id+',from:\'profile\'})">'+
      '<div class="wrapimg">'+posterEl(m.poster,'w342','',m.title)+
        (statutFilm(m)==='vu' ? '<div class="pbadge done">vu</div>' : '')+
      '</div>'+
      '<div class="pname">'+esc(m.title)+'</div>'+
      '<div class="psub">'+esc(year(m.date))+'</div>'+
    '</div>'+
  '</div>';
}

function ouvrirAbos(){
  go('abos', {from:'profile'});
  if(signedIn()) chargerPartage();
}
function profileMenu(){
  openSheet('<h3>Options</h3><p class="small muted" style="margin:0 0 8px">Réglages et sauvegardes</p>'+
    '<button class="opt" onclick="closeSheet();ouvrirAbos()">Mes abonnements</button>'+
    '<button class="opt" onclick="closeSheet();go(\'account\',{from:\'profile\'})">Compte & synchro</button>'+
    '<button class="opt" onclick="closeSheet();go(\'settings\',{from:\'profile\'})">Réglages</button>'+
    '<button class="opt" onclick="closeSheet();exportData()">Exporter une sauvegarde</button>'+
    '<button class="opt" onclick="closeSheet();document.getElementById(\'impHidden\').click()">Importer une sauvegarde</button>'+
    '<button class="opt" onclick="closeSheet();refreshAll()">Actualiser toutes les séries</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>'+
    '<input type="file" id="impHidden" accept="application/json,.json" style="display:none" onchange="importData(this)">');
}
