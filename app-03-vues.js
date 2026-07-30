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
  if(view==='rangee')   return viewRangee();
  if(view==='motdepasse') return viewMotDePasse();
  if(view==='notifs')   return viewNotifications();
  if(view==='clochettes') return viewClochettes();
  if(view==='avatar')   return viewAvatar();
  if(view==='gouts')    return viewGouts();
  if(view==='plates')   return viewPlates();
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
    view === 'motdepasse' || view === 'avatar' || (view === 'account' && !signedIn())
    || (view === 'gouts' && params.from === 'compte')
    || (view === 'plates' && params.from === 'compte'));
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
  /* Une seule fois : la démonstration du glissement sur une ligne d'abonnement. */
  if(view==='abos' && typeof montrerAstuceGlis === 'function') montrerAstuceGlis();
  if(view==='discover'){
    const inp = document.getElementById('q');
    if(inp && ui.focusSearch){ inp.focus(); ui.focusSearch=false; }
    if(typeof centrerTypeActif === 'function') centrerTypeActif();
    /* La vitrine et la grille filtrée ont chacune leur chargement : on ne
       dépense des requêtes que pour l'état réellement affiché. */
    if(typeof vitrineVisible === 'function' && vitrineVisible()) chargerSuggestions();
    else if(!ui.disc.charge && !ui.disc.loading) chargerDecouverte();
  }
}
function renderNav(){
  /* L'onglet Sorties a vécu quelques heures ici, puis Adrien l'a retiré :
     « pas terrible ». Son code dort dans app-10 — seule la section « Bientôt »
     d'À suivre en est restée, elle avait fait ses preuves. */
  const tabs = [
    ['discover','Découvrir',I.boussole],
    ['follow','À suivre',I.cal],
    ['profile','Mon profil',I.user]
  ];
  /* L'onglet à allumer. Chaque écran appartient à une des trois sections, et
     ceux qui s'ouvrent depuis plusieurs endroits suivent leur origine — sans
     quoi la barre s'éteignait : une fiche ouverte depuis la grille « Tout
     voir » arrivait avec from:'rangee', que personne ne savait rattacher, et
     plus aucun onglet n'était allumé. Une barre éteinte se lit comme une
     panne, pas comme une nuance. */
  const TAB_DIRECT = { discover:'discover', follow:'follow', profile:'profile',
    preview:'discover', rangee:'discover',
    account:'profile', abos:'profile', biblio:'profile', moi:'profile',
    notifs:'profile', clochettes:'profile' };
  let cur = TAB_DIRECT[view];
  if(!cur){
    /* show, movie, settings, acteur, gouts : l'onglet est celui d'où l'on vient. */
    cur = TAB_DIRECT[params.from]
       || ((view==='show'||view==='movie') ? 'follow'
          : view==='acteur' ? 'discover' : 'profile');
  }

  /* La barre n'est construite qu'une fois, puis seul son état change : c'est
     ce qui permet à la pastille de GLISSER d'un onglet à l'autre. Reconstruire
     le HTML à chaque rendu la téléportait au lieu de la faire voyager. */
  const nav = document.getElementById('nav');
  if(nav.childElementCount !== tabs.length + 1){
    nav.style.gridTemplateColumns = 'repeat('+tabs.length+',1fr)';
    nav.innerHTML = '<i id="navpip" class="cache"></i>' + tabs.map(([id,label,icon])=>
      '<button class="tab" onclick="go(\''+id+'\')">'+icon+'<span>'+label+'</span></button>'
    ).join('');
  }
  const boutons = nav.querySelectorAll('.tab');
  tabs.forEach(([id], i)=> boutons[i].classList.toggle('on', id === cur));
  const pip = document.getElementById('navpip');
  const idx = tabs.findIndex(([id])=> id === cur);
  pip.classList.toggle('cache', idx < 0);
  pip.style.width = (100 / tabs.length) + '%';
  if(idx >= 0) pip.style.left = (idx * (100 / tabs.length)) + '%';
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

/* ---------- Vue : À suivre ----------

   Deux blocs, deux formes franchement différentes — c'était le reproche
   d'Adrien sur l'ancienne version : trois listes de lignes qui se
   ressemblaient toutes.

   1. « À rattraper » : de grandes cartes image que l'on fait défiler du
      pouce, une par série en retard, avec le nombre d'épisodes en attente.
   2. « Calendrier » : UNE seule liste chronologique où les épisodes à venir
      et les sorties de tes films se mêlent, jour par jour. Deux sections
      d'avant (« À venir » et « Bientôt ») n'en font plus qu'une : c'est la
      même question — qu'est-ce qui arrive ? — donc une seule réponse.
--------------------------------------------------------------------------- */

/* Combien d'épisodes diffusés attendent d'être vus. */
function retardSerie(s){
  const t = todayISO();
  return allEpisodes(s, false)
    .filter(ep => ep.d && ep.d <= t && !s.watched[key(ep.s, ep.e)]).length;
}

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

  /* --- Le calendrier : épisodes futurs ET sorties de films, mêlés --- */
  /* Les séries pas encore commencées (« À voir ») n'apparaissent pas ici :
     cet onglet ne parle que de ce qu'on suit réellement. */
  const cal = [];
  shows.forEach(s=>{
    const st = statutSerie(s);
    if(st === 'avoir' || st === 'pause') return;
    allEpisodes(s,false).forEach(ep=>{ if(ep.d && ep.d >= t) cal.push({d:ep.d, show:s, ep:ep}); });
    if(s.next && s.next.d && s.next.d >= t && !(s.seasons[s.next.s]||[]).some(e=>e.e===s.next.e))
      cal.push({d:s.next.d, show:s, ep:{s:s.next.s, e:s.next.e, n:s.next.n, d:s.next.d}});
  });
  if(typeof filmsBientot === 'function')
    filmsBientot().forEach(f=> cal.push({d:f.dfr, film:f}));
  cal.sort((a,b)=>a.d.localeCompare(b.d));
  const agenda = cal.slice(0,80);

  let html = header('À suivre', {right:'<button class="iconbtn" onclick="go(\'discover\')">'+I.plus+'</button>'});
  html += needKeyBanner();

  /* L'écran vide n'a de sens que si rien n'est suivi du tout : quelqu'un qui
     n'a que des films doit quand même voir son calendrier. */
  const desFilms = (typeof filmsSuivisIds === 'function') && filmsSuivisIds().length;
  if(!shows.length && !desFilms){
    return html + '<div class="empty">'+I.tv+'<h3>Rien à suivre pour l\'instant</h3>'+
      '<p>Ajoute une série ou un film depuis la recherche : tu retrouveras ici tes prochains épisodes et les dates de diffusion.</p>'+
      '<button class="btn" onclick="go(\'discover\')">Chercher une série</button></div>';
  }

  /* Section 1 : les cartes du retard */
  html += '<div class="sectitle">À rattraper'+
    (todo.length?'<span class="cnt">'+todo.length+'</span>':'')+'</div>';
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
    html += '<div class="rattrap">'+todo.map(x=>carteRattrapage(x.s,x.ep)).join('')+'</div>';
  }

  /* Section 2 : le calendrier unique */
  html += '<div class="sectitle">Calendrier</div>';
  if(!agenda.length){
    html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:18px;text-align:center">'+
      '<div class="small muted">Aucune date annoncée pour tes séries et tes films.</div></div></div>';
  } else {
    let cur = '', out = '<div class="day">';
    agenda.forEach(i=>{
      if(i.d !== cur){ cur = i.d; out += '<div class="daylbl">'+fmtDayLabel(i.d)+'</div>'; }
      out += i.film ? ligneFilmCal(i.film) : ligneEpisodeCal(i.show, i.ep);
    });
    out += '</div>';
    html += out;
  }
  return html + '<div style="height:24px"></div>';
}

/* Une ligne d'épisode dans le calendrier. */
function ligneEpisodeCal(s, ep){
  /* `srcImage` : le chemin peut venir de la bibliothèque d'un proche, donc
     d'ailleurs que de TMDB. Voir la frontière de confiance dans app-02. */
  const thumb = srcImage(ep.st,'w300') || srcImage(s.backdrop,'w300') || srcImage(s.poster,'w154');
  return '<div class="crow" onclick="go(\'show\',{id:'+s.id+',from:\'follow\'})">'+
    (thumb ? '<img class="cthumb" loading="lazy" src="'+thumb+'" alt="">' : '<div class="cthumb"></div>')+
    '<div class="epinfo">'+
      '<div class="epname">'+esc(s.name)+'</div>'+
      '<div class="epsub">'+codeEp(ep.s,ep.e)+' · '+esc(ep.n||'')+'</div>'+
    '</div></div>';
}

/* Une ligne de film dans le même calendrier : même forme, autre sous-titre. */
function ligneFilmCal(f){
  return '<div class="crow" onclick="go(\'movie\',{id:'+f.id+',from:\'follow\'})">'+
    (srcImage(f.image,'w300')
       ? '<img class="cthumb" loading="lazy" src="'+srcImage(f.image,'w300')+'" alt="">'
       : '<div class="cthumb"></div>')+
    '<div class="epinfo">'+
      '<div class="epname">'+esc(f.titre)+'</div>'+
      '<div class="epsub film">'+esc(f.mot)+'</div>'+
    '</div></div>';
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

/* La carte d'une série en retard. L'image passe au premier plan, le texte se
   pose dessus dans un dégradé — c'est la même grammaire que le héros d'une
   fiche. Le badge dit combien d'épisodes attendent, le rond bleu en coche un
   d'un seul geste, l'appui long ouvre la mise en pause (comme avant). */
function carteRattrapage(s, nx){
  const n = retardSerie(s);
  const img = srcImage(s.backdrop,'w780') || srcImage(s.poster,'w342');
  return '<div class="rcarte">'+
    '<div class="rfond" onclick="pressClic('+s.id+',event)"'+
      ' ontouchstart="pressStart('+s.id+',event)" ontouchend="pressEnd()" ontouchmove="pressMove(event)"'+
      ' ontouchcancel="pressEnd()">'+
      (img ? '<img loading="lazy" src="'+img+'" alt="">' : '')+
      (n > 1 ? '<span class="rbadge">'+n+' ép.</span>' : '')+
      '<div class="rtexte">'+
        '<b>'+esc(s.name)+'</b>'+
        '<i>'+codeEp(nx.s,nx.e)+' · '+esc(nx.n||'')+'</i>'+
      '</div>'+
    '</div>'+
    /* Les deux actions restent VISIBLES : mettre en pause ne doit pas
       dépendre d'un appui long que personne ne devine. */
    '<div class="ract">'+
      '<button class="rond" title="Options" onclick="menuPause('+s.id+')">'+I.dots+'</button>'+
      '<button class="rond vu" title="Marquer '+codeEp(nx.s,nx.e)+' comme vu" '+
        'onclick="quickWatch('+s.id+',event)">'+I.check+'</button>'+
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

  /* ---------------------------------------------------------------------
     L'en-tête façon Instagram, voulu par Adrien : photo à gauche, compteurs
     à droite, prénom, une ligne de stats, puis les puces et les jaquettes.

     Le fond est fait de TES affiches, floutées : le profil devient la fiche
     de ta bibliothèque, et il est différent chez chacun. Sans affiche, on
     retombe sur un dégradé sobre plutôt que sur un trou noir.
  --------------------------------------------------------------------- */
  const qui = (db.pseudo||'').trim();
  const nbSeries = Object.keys(db.shows).length;
  const nbAbonnes = (partage.abonnes||[]).length;
  const nbAbos = (partage.suivis||[]).length;

  const affiches = Object.values(db.shows).map(x=>x.poster).filter(Boolean).slice(0,5);
  const fond = affiches.length
    ? '<div class="pfond">'+affiches.map(p=>
        /* Dans une url() de CSS : une apostrophe ou une parenthèse suffirait à
           sortir de la déclaration. On filtre AVANT de composer. */
        '<i style="background-image:url('+srcImage(p,'w154')+')"></i>').join('')+'</div>'
    : '<div class="pfond uni"></div>';

  const compteur = (n, mot, action)=>
    '<button class="pcompt"'+(action?' onclick="'+action+'"':'')+'>'+
      '<b>'+n+'</b><span>'+mot+'</span></button>';

  let html = header('Mon profil', {
    /* Un engrenage plutôt que trois points : il mène à un écran, pas à un menu
       flottant, et son sens est immédiat. */
    right:'<button class="iconbtn" onclick="go(\'settings\',{from:\'profile\'})" '+
      'aria-label="Réglages">'+I.cog+'</button>'
  });

  html += '<div class="phero">'+fond+'<div class="pdevant">'+
    '<div class="phaut">'+
      '<button class="panneau" onclick="go(\'moi\',{from:\'profile\'})" aria-label="Changer d\'avatar">'+
        avatarMoi('gros')+'</button>'+
      '<div class="pcompts">'+
        compteur(nbSeries, 'série'+(nbSeries>1?'s':''), '') +
        compteur(nbAbonnes, 'abonné'+(nbAbonnes>1?'s':''), 'ouvrirAbos()') +
        compteur(nbAbos, 'abonnement'+(nbAbos>1?'s':''), 'ouvrirAbos()') +
      '</div>'+
    '</div>'+
    '<div class="pnom">'+(qui ? esc(qui) : 'Ton profil')+'</div>'+
    '<div class="pstats">'+epCount+' épisode'+(epCount>1?'s':'')+' · '+
      fmtDurShort(minutes)+' de visionnage · '+doneShows+' série'+(doneShows>1?'s':'')+
      ' finie'+(doneShows>1?'s':'')+'</div>'+
  '</div></div>';

  /* Les visages de tes abonnements, juste sous l'identité : un tap ouvre la
     bibliothèque de la personne, comme avant. */
  if(signedIn() && partage.suivis.length){
    html += '<div class="aborow">'+partage.suivis.slice(0,10).map(p=>
      '<button class="abomini" onclick="ouvrirBiblio(\''+p.id+'\')">'+
        avatarDe(p)+'<span>'+esc(p.pseudo)+'</span></button>').join('')+
      '<button class="abomini" onclick="ouvrirAbos()">'+
        '<div class="avatar plus">'+I.plus+'</div><span>Gérer</span></button>'+
    '</div>';
  }

  html += '<div class="chips" style="padding-top:12px">'+tabs.map(([id,l,n])=>
    '<button class="chip '+(ui.profTab===id?'on':'')+'" onclick="ui.profTab=\''+id+'\';render()">'+
    l+' <span style="opacity:.65">'+n+'</span></button>').join('')+'</div>';

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
  /* Dernière étape de la création : ses goûts, qu'on peut passer d'un bouton.
     Quelqu'un qui a déjà répondu une fois (nouvel appareil, même compte) n'y
     repasse pas — `propose` est synchronisé avec le reste de la base. */
  if(db.gouts && !db.gouts.propose) return go('gouts',{from:'compte'});
  /* Les goûts déjà répondus, il reste peut-être la question des plateformes :
     elle est arrivée après, et les comptes créés avant ne l'ont jamais vue. */
  if(typeof apresGouts === 'function') return apresGouts();
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
