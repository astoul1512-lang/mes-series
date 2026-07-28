"use strict";
/* ============================ Rendu ============================ */
/* ---------- Plus de mise en route ----------
   Les deux écrans d'accueil demandaient un prénom déjà redemandé au compte,
   puis vendaient des arguments répétés sur l'écran suivant. Soit on a un
   compte, soit on n'en a pas : l'app ouvre directement sur la porte d'entrée.
   `demarrerAccueil` reste, appelée par le démarrage, et se contente d'y aller
   en choisissant l'onglet le plus probable. */
function demarrerAccueil(){
  ui.acMode = premiereFois() ? 'creer' : 'connexion';
  go('account');
}
/* Cet appareil n'a jamais vu de session : on propose la création plutôt que
   la connexion. Ailleurs, c'est l'inverse — on se connecte bien plus souvent
   qu'on ne crée un compte. */
function premiereFois(){
  return !db.proprio && !(db.auth && db.auth.email);
}

/* Le HTML de l'écran courant. Isolé du reste pour pouvoir aussi fabriquer
   l'écran d'arrivée pendant le geste de retour, sans toucher à l'état. */
function corpsDeVue(){
  if(view==='follow')   return viewFollow();
  if(view==='discover') return viewDiscover();
  if(view==='sorties')  return viewSorties();
  if(view==='profile')  return viewProfile();
  if(view==='settings') return viewSettings();
  if(view==='show')     return viewShow();
  if(view==='preview')  return viewPreview();
  if(view==='movie')    return viewMovie();
  if(view==='account')  return viewAccount();
  if(view==='abos')     return viewAbos();
  if(view==='biblio')   return viewBiblio();
  if(view==='moi')      return viewMoi();
  if(view==='acteur')   return viewActeur();
  if(view==='motdepasse') return viewMotDePasse();
  if(view==='notifs')   return viewNotifications();
  if(view==='clochettes') return viewClochettes();
  if(view==='avatar')   return viewAvatar();
  return '';
}
/* Fabrique le HTML d'un autre écran que celui affiché, puis remet tout en place. */
function htmlDeLaVue(v, p){
  const vSauve = view, pSauve = params;
  view = v; params = p || {};
  let h = '';
  try{ h = corpsDeVue(); } finally { view = vSauve; params = pSauve; }
  return h;
}

/* Le compte est obligatoire. Sans session, l'app ne montre que l'écran de
   connexion et la réinitialisation de mot de passe — rien d'autre.
   Le contrôle est posé ici, dans le seul passage obligé du rendu : un `go()`
   oublié quelque part ne peut pas ouvrir une porte dérobée. */
const VUES_SANS_COMPTE = { account:1, motdepasse:1, avatar:1 };
/* `db.onboarde` ne veut plus rien dire depuis que la mise en route a disparu :
   la seule question est d'avoir une session ou non. Le champ reste dans la base
   pour ne pas casser la lecture d'une vieille sauvegarde, mais plus personne
   ne le lit. */
function porteFermee(){
  return !signedIn() && !VUES_SANS_COMPTE[view];
}

function render(){
  const app = document.getElementById('app');
  if(porteFermee()){ view = 'account'; params = {}; navDir = 'none'; }
  const html = corpsDeVue();
  app.innerHTML = html;
  /* Porte d'entrée, mot de passe et choix de l'avatar occupent tout l'écran :
     la barre du bas n'a rien à y faire, il n'y a qu'une chose à faire. */
  document.body.classList.toggle('accueil',
    view === 'motdepasse' || view === 'avatar' || (view === 'account' && !signedIn()));
  app.classList.remove('enter','back');
  /* Le retour à deux couches gère lui-même son mouvement : pas d'animation par-dessus. */
  if(sansAnim){ sansAnim = false; navDir = 'none'; }
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
  /* Une seule fois : l'étiquette qui apprend à quoi sert la cloche. */
  if((view==='show' || view==='movie') && typeof montrerAstuceCloche === 'function')
    montrerAstuceCloche();
  if(view==='discover'){
    const inp = document.getElementById('q');
    if(inp && ui.focusSearch){ inp.focus(); ui.focusSearch=false; }
    /* Premier passage sur Découvrir : on va chercher les suggestions */
    if(!ui.disc.charge && !ui.disc.loading) chargerDecouverte();
  }
}
function renderNav(){
  const tabs = [
    ['discover','Découvrir',I.boussole],
    ['sorties','Sorties',I.clap],
    ['follow','À suivre',I.cal],
    ['profile','Mon profil',I.user]
  ];
  const depuis = params.from;
  const cur = (view==='preview') ? (depuis==='sorties' ? 'sorties' : 'discover')
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

/* Plus rien à réclamer à l'ouverture : la clé est fournie par le relais.
   La fonction reste, elle est appelée par les vues. */
function needKeyBanner(){ return ''; }

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

  /* L'écran vide n'a de sens que si rien n'est suivi du tout : quelqu'un qui
     n'a que des films doit quand même voir sa section « Bientôt ». */
  const desFilms = (typeof filmsSuivisIds === 'function') && filmsSuivisIds().length;
  if(!shows.length && !desFilms){
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

  /* Entre le retard et le calendrier des épisodes : tes films qui arrivent.
     La section n'existe que si un film suivi a une date française confirmée. */
  html += (typeof blocBientotPerso === 'function') ? blocBientotPerso() : '';

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
    /* Un engrenage plutôt que trois points : il mène à un écran, pas à un menu
       flottant, et son sens est immédiat. */
    right:'<button class="iconbtn" onclick="go(\'settings\',{from:\'profile\'})" '+
      'aria-label="Réglages">'+I.cog+'</button>',
    sub:'<div class="chips">'+tabs.map(([id,l,n])=>
      '<button class="chip '+(ui.profTab===id?'on':'')+'" onclick="ui.profTab=\''+id+'\';render()">'+
      l+' <span style="opacity:.65">'+n+'</span></button>').join('')+'</div>'
  });

  /* Une identité avant les chiffres : c'est ton profil, pas un tableau de bord. */
  const qui = (db.pseudo||'').trim();
  const depuis = plusAnciennementAjoute();
  /* Le bandeau menait à la personnalisation de l'avatar — le moins important de
     l'écran, pour la plus grosse cible. Il ouvre maintenant les réglages, où
     tout se trouve, et la personnalisation n'y est qu'une ligne parmi d'autres. */
  html += '<button class="entete" onclick="go(\'settings\',{from:\'profile\'})">'+
    avatarMoi('gros')+
    '<div class="etxt">'+
      '<div class="enom">'+(qui ? esc(qui) : 'Ton profil')+'</div>'+
      '<div class="tiny muted">'+(qui
        ? 'Mon compte et réglages'
        : 'Ton prénom, ton emblème, et tes séries à l\'abri')+'</div>'+
    '</div>'+
    '<span class="ecaret">'+I.caret+'</span>'+
  '</button>';

  /* Un seul bloc de chiffres. L'ancienne carte « X séries · Y films · soit Z »
     répétait deux des trois tuiles avec d'autres mots : les puces du haut
     donnent déjà les décomptes, la tuile du milieu donne déjà la durée. */
  html += '<div class="stats">'+
    '<div class="stat"><b>'+epCount+'</b><span>épisode'+(epCount>1?'s':'')+' vu'+(epCount>1?'s':'')+'</span></div>'+
    '<div class="stat"><b>'+fmtDurShort(minutes)+'</b><span>de visionnage</span></div>'+
    '<div class="stat"><b>'+doneShows+'</b><span>série'+(doneShows>1?'s':'')+' finie'+(doneShows>1?'s':'')+'</span></div>'+
  '</div>';

  /* Les abonnements tenaient une rangée d'avatars en plein milieu de l'écran :
     une ligne suffit, leur vrai foyer est l'écran qu'elle ouvre. */
  if(signedIn() && partage.suivis.length){
    const noms = partage.suivis.map(p=>p.pseudo).filter(Boolean);
    const resume = noms.length <= 2 ? noms.join(' et ')
                 : noms.slice(0,2).join(', ')+' et '+(noms.length-2)+' autre'+(noms.length>3?'s':'');
    html += '<div class="wrap" style="padding-top:0">'+
      '<button class="reg" style="width:100%" onclick="ouvrirAbos()">'+
        '<i>'+I.user+'</i>'+
        '<span class="rtxt"><b>Mes abonnements</b><em>'+esc(resume)+'</em></span>'+
        '<span class="ecaret">'+I.caret+'</span></button></div>';
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
/* L'ancien menu ⋮ a été supprimé le 28/07 : il doublait l'écran Réglages
   (mêmes actions, noms différents) et, en tant que panneau flottant, ne laissait
   nulle part où revenir après en avoir ouvert une entrée. Tout est passé dans
   `viewSettings`, atteignable par le bandeau du profil et par l'engrenage. */

/* Depuis quand cette bibliothèque existe : le plus ancien titre ajouté. */
function plusAnciennementAjoute(){
  let min = 0;
  [].concat(Object.values(db.shows), Object.values(db.movies)).forEach(o=>{
    const t = o && o.addedAt;
    if(t && t > 1000000000000 && (!min || t < min)) min = t;
  });
  if(!min) return '';
  const d = new Date(min);
  return MOIS[d.getMonth()]+' '+d.getFullYear();
}

/* ---------- Vue : mon profil, en modification ---------- */
/* ---------- L'avatar ----------
   Une photo OU une couleur et un emblème : jamais les deux superposés.
   Le même bloc sert dans « Mon profil » et dans l'étape qui suit la création
   du compte, pour que les deux ne divergent jamais. */
function ongletsAvatar(){
  const photo = !!(db.profil && db.profil.photo);
  return '<div class="fchips" style="justify-content:center;margin-bottom:20px">'+
    '<button class="chip'+(photo?'':' on')+'" onclick="modeAvatar(\'embleme\')">Couleur et emblème</button>'+
    '<button class="chip'+(photo?' on':'')+'" onclick="modeAvatar(\'photo\')">Une photo</button>'+
  '</div>';
}
function blocAvatar(){
  const p = db.profil || {};
  if(ui.avatarOnglet === 'photo' || (ui.avatarOnglet !== 'embleme' && p.photo)){
    return '<input type="file" id="avfic" accept="image/*" style="display:none" '+
             'onchange="choisirPhoto(this)">'+
           '<button class="btn ghost block" style="margin-bottom:10px" '+
             'onclick="document.getElementById(\'avfic\').click()">'+
             (p.photo ? 'Changer de photo' : 'Choisir une photo')+'</button>'+
           (p.photo
             ? '<button class="btn ghost block danger" onclick="retirerPhoto()">Retirer la photo</button>'
             : '')+
           '<div class="tiny muted center" style="padding:14px 6px 0">La photo est réduite à '+
           AVATAR_PX+' pixels et recadrée en carré avant d\'être enregistrée : elle pèse quelques '+
           'kilo-octets et part avec ta sauvegarde.</div>';
  }
  return '<div class="fgrp">Couleur</div>'+
    '<div class="pastilles">'+COULEURS_PROFIL.map(c=>
      '<button class="past '+(profilCouleur(p.couleur).id===c.id?'on':'')+'" title="'+esc(c.nom)+'" '+
        'aria-label="'+esc(c.nom)+'" onclick="choisirCouleur(\''+c.id+'\')" '+
        'style="background:linear-gradient(135deg,'+c.a+','+c.b+')"></button>').join('')+'</div>'+
    '<div class="fgrp">Emblème</div>'+
    '<div class="emblemes">'+EMBLEMES.map(e=>{
      const lettre = (db.pseudo||'?').trim().charAt(0).toUpperCase() || '?';
      const dedans = e.id === 'lettre' ? '<b>'+esc(lettre)+'</b>' : (I[e.id]||'');
      return '<button class="embl '+((p.embleme||'lettre')===e.id?'on':'')+'" title="'+esc(e.nom)+'" '+
        'aria-label="'+esc(e.nom)+'" onclick="choisirEmbleme(\''+e.id+'\')">'+dedans+'</button>';
    }).join('')+'</div>';
}
function modeAvatar(m){ ui.avatarOnglet = m; render(); }

async function choisirPhoto(input){
  const f = input && input.files && input.files[0];
  input.value = '';                       // pour pouvoir reprendre la même photo
  if(!f) return;
  try{
    const donnee = await photoVersAvatar(f);
    db.profil = Object.assign({}, db.profil, { photo: donnee });
    ui.avatarOnglet = 'photo';
    saveDB(); render();
    if(signedIn()) majProfil();
  }catch(e){ toast('Cette image n\'a pas pu être lue'); }
}
function retirerPhoto(){
  db.profil = Object.assign({}, db.profil, { photo: null });
  ui.avatarOnglet = 'embleme';
  saveDB(); render();
  if(signedIn()) majProfil();
}

/* L'étape qui suit la création d'un compte. On peut la passer : un avatar
   n'est pas une condition pour se servir de l'app. */
function viewAvatar(){
  return '<div class="wrap" style="padding-top:46px">'+
    '<div class="intro" style="margin-bottom:22px">'+
      '<div class="apercu">'+avatarMoi('geant')+'</div>'+
      '<h2 style="margin-top:14px">Ton avatar</h2>'+
      '<p>C\'est ce que verront les proches à qui tu partages ta bibliothèque. '+
      'Tu pourras le changer quand tu veux.</p>'+
    '</div>'+
    ongletsAvatar()+
    blocAvatar()+
    '<button class="btn block" style="margin-top:24px" onclick="finirAvatar()">Continuer</button>'+
    '<button class="tiny muted" style="display:block;width:100%;text-align:center;padding:14px 8px" '+
      'onclick="finirAvatar()">Passer cette étape</button>'+
  '</div>';
}
function finirAvatar(){
  saveDB();
  if(signedIn()) majProfil();
  go('follow');
}

function viewMoi(){
  let html = header('Mon profil', {back:"goBack()"});
  html += '<div class="wrap">'+
    '<div class="apercu">'+avatarMoi('geant')+
      '<div class="enom" style="margin-top:12px">'+
        ((db.pseudo||'').trim() ? esc(db.pseudo) : 'Sans prénom')+'</div>'+
    '</div>'+
    '<label class="fld"><span>Ton prénom</span>'+
      '<input type="text" id="mpseudo" value="'+esc(db.pseudo||'')+'" placeholder="Adrien" '+
      'autocomplete="given-name" oninput="apercuPseudo(this.value)">'+
      '<em>C\'est ce que voient les personnes qui te suivent. Tu peux laisser vide.</em></label>'+
    ongletsAvatar()+
    blocAvatar()+
    '<button class="btn block" style="margin-top:22px" onclick="enregistrerProfil()">Enregistrer</button>'+
  '</div>';
  return html + '<div style="height:30px"></div>';
}
/* L'aperçu suit la frappe, mais on ne réécrit pas l'écran : le champ perdrait le focus. */
function apercuPseudo(v){
  const nom = document.querySelector('.apercu .enom');
  if(nom) nom.textContent = v.trim() || 'Sans prénom';
  const p = db.profil || {};
  /* Une photo ne suit pas le prénom : seule l'initiale change en direct. */
  if(!p.photo && (p.embleme || 'lettre') === 'lettre'){
    const av = document.querySelector('.apercu .avatar');
    if(av) av.textContent = (v.trim().charAt(0) || '?').toUpperCase();
  }
}
function choisirCouleur(id){
  db.profil = Object.assign({}, db.profil, { couleur:id });
  gardePseudoSaisi(); render();
}
function choisirEmbleme(id){
  db.profil = Object.assign({}, db.profil, { embleme:id });
  gardePseudoSaisi(); render();
}
/* Choisir une couleur redessine l'écran : on n'y perd pas le prénom en cours de saisie. */
function gardePseudoSaisi(){
  const el = document.getElementById('mpseudo');
  if(el) db.pseudo = el.value.trim();
}
function enregistrerProfil(){
  gardePseudoSaisi();
  saveDB();
  if(typeof majProfil === 'function' && signedIn()) majProfil();
  toast('Profil enregistré');
  goBack();
}
