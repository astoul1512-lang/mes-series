"use strict";
/* ============================ Utilitaires ============================ */
const todayISO = ()=> new Date().toISOString().slice(0,10);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = (s,e)=> s+'x'+e;
const aired = ep => !!ep.d && ep.d <= todayISO();

function epRuntime(show, ep){ return ep.r || show.runtime || 42; }

function seasonNums(show, withSpecials){
  return Object.keys(show.seasons||{}).map(Number)
    .filter(n => withSpecials ? true : n > 0).sort((a,b)=>a-b);
}
function allEpisodes(show, withSpecials){
  const out = [];
  seasonNums(show, withSpecials).forEach(s=>{
    (show.seasons[s]||[]).forEach(ep=> out.push(Object.assign({}, ep, {s:s})));
  });
  return out;
}
function progress(show){
  const eps = allEpisodes(show,false).filter(aired);
  const w = eps.filter(ep => show.watched[key(ep.s,ep.e)]).length;
  return { watched:w, total:eps.length, pct: eps.length ? Math.round(w/eps.length*100) : 0 };
}
function nextToWatch(show){
  const eps = allEpisodes(show,false);
  for(const ep of eps){
    if(show.watched[key(ep.s,ep.e)]) continue;   // déjà vu : on passe, même sans date de diffusion
    if(!aired(ep)) break;                        // premier épisode non vu et pas encore diffusé : plus rien à rattraper
    return ep;
  }
  return null;
}
function isFinished(show){
  const p = progress(show);
  const ended = show.status==='Ended' || show.status==='Canceled';
  return p.total>0 && p.watched===p.total && ended && !show.next;
}

/* ===== STATUT D'UN TITRE — source unique de vérité =====
   Un titre a exactement un statut, déduit des épisodes réellement cochés :
     'avoir'   : rien de vu             (films non vus, séries à 0 épisode vu)
     'asuivre' : commencé, pas terminé  (séries en cours, y compris « à jour »)
     'vu'      : terminé                (films vus, séries finies intégralement)
   Les épisodes hors-série (saison 0) sont visibles mais ne comptent jamais.
   Aucun écran ne doit appliquer sa propre règle : tout passe par ici.        */
function statutSerie(s){
  /* Seule exception au calcul : une mise en pause posée à la main l'emporte.
     Les épisodes cochés sont conservés, la série reprendra où elle en était. */
  if(s && s.pause) return 'pause';
  if(progress(s).watched === 0) return 'avoir';
  if(isFinished(s)) return 'vu';
  return 'asuivre';
}
function statutFilm(m){ return m.seen ? 'vu' : 'avoir'; }
function statut(o){ return o && o.seasons !== undefined ? statutSerie(o) : statutFilm(o); }
const LIB_STATUT = { avoir:'À voir', asuivre:'À suivre', vu:'Vu', pause:'En pause' };

function fmtDur(min){
  if(!min) return '0 min';
  const d = Math.floor(min/1440), h = Math.floor((min%1440)/60), m = min%60;
  const p = [];
  if(d) p.push(d+' j');
  if(h) p.push(h+' h');
  if(m && !d) p.push(m+' min');
  return p.join(' ') || '0 min';
}
/* ===== Numérotation des épisodes — une seule fonction pour toute l'app =====
   Forme unique « S5E132 », utilisée partout : liste des épisodes, à rattraper,
   calendrier, fenêtres de confirmation et messages. */
function codeEp(s, e){ return 'S'+s+'E'+e; }

function fmtDurShort(min){
  if(!min) return '0h';
  const d = Math.floor(min/1440), h = Math.floor((min%1440)/60), m = min%60;
  if(d) return d+'j '+h+'h';
  if(h) return h+'h'+(m?String(m).padStart(2,'0'):'');
  return m+'min';
}
const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
function fmtDate(iso){
  if(!iso) return 'Date inconnue';
  const d = new Date(iso+'T12:00:00');
  return d.getDate()+' '+MOIS[d.getMonth()]+' '+d.getFullYear();
}
/* « il y a 3 min », « hier », « le 12 juin » — plus parlant qu'une date brute
   pour dire quand la dernière sauvegarde est partie. */
function fmtQuand(ts){
  if(!ts) return 'jamais';
  const s = Math.max(0, Math.round((Date.now() - ts)/1000));
  if(s < 60) return 'à l\'instant';
  if(s < 3600){ const m = Math.round(s/60); return 'il y a '+m+' min'; }
  if(s < 86400){ const h = Math.round(s/3600); return 'il y a '+h+' h'; }
  const j = Math.round(s/86400);
  if(j === 1) return 'hier';
  if(j < 7) return 'il y a '+j+' jours';
  return 'le '+fmtDate(new Date(ts).toISOString().slice(0,10));
}
function fmtDateShort(iso){
  if(!iso) return '';
  const d = new Date(iso+'T12:00:00');
  return d.getDate()+' '+MOIS[d.getMonth()];
}
function fmtDayLabel(iso){
  const t = todayISO();
  if(iso===t) return "Aujourd'hui";
  const y = new Date(Date.now()-86400000).toISOString().slice(0,10);
  const tm = new Date(Date.now()+86400000).toISOString().slice(0,10);
  if(iso===y) return 'Hier';
  if(iso===tm) return 'Demain';
  const d = new Date(iso+'T12:00:00');
  return JOURS[d.getDay()]+' '+d.getDate()+' '+MOIS[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():'');
}
const year = iso => iso ? iso.slice(0,4) : '';

function posterEl(path, size, cls, alt){
  if(path) return '<img class="poster '+(cls||'')+'" loading="lazy" onerror="posterFail(this)" src="'+
    IMG(path,size)+'" alt="'+esc(alt||'')+'">';
  return '<div class="poster ph '+(cls||'')+'">'+esc((alt||'?').slice(0,18))+'</div>';
}
/* Vignette d'épisode : image TMDB si elle existe, sinon un cadre neutre de même taille.
   Chargement différé pour que les longues saisons restent fluides. */
function epThumb(ep){
  if(ep && ep.st)
    return '<div class="epthumb"><img loading="lazy" decoding="async" alt="" '+
           'onerror="thumbFail(this)" src="'+IMG(ep.st,'w300')+'"></div>';
  return '<div class="epthumb ph">'+I.frame+'</div>';
}
function thumbFail(img){
  const box = img.parentNode;
  if(box){ box.classList.add('ph'); box.innerHTML = I.frame; }
}

/* Si l'affiche ne charge pas, on retombe proprement sur le titre plutôt qu'une image cassée */
function posterFail(img){
  const d = document.createElement('div');
  d.className = img.className + ' ph';
  d.textContent = (img.getAttribute('alt')||'?').slice(0,18);
  img.replaceWith(d);
}

/* ============================ Avatar ============================ */
/* Un emblème et une couleur, rien de plus : c'est du texte, ça ne pèse rien
   dans les sauvegardes et ça voyage sans effort dans la synchro. */
const COULEURS_PROFIL = [
  { id:'corail', nom:'Corail',   a:'#ff6b57', b:'#b3452f' },
  { id:'ocean',  nom:'Océan',    a:'#3a9bdc', b:'#1f4f7a' },
  { id:'violet', nom:'Violet',   a:'#9b6bdc', b:'#5b3a8f' },
  { id:'menthe', nom:'Menthe',   a:'#3ecf8e', b:'#1f6f52' },
  { id:'ambre',  nom:'Ambre',    a:'#ffb84d', b:'#a86f1a' },
  { id:'rose',   nom:'Rose',     a:'#ff6b9d', b:'#a83a63' }
];
const EMBLEMES = [
  { id:'lettre', nom:'Mon initiale' },
  { id:'tv',     nom:'Télé' },
  { id:'coeur',  nom:'Cœur' },
  { id:'eclair', nom:'Éclair' },
  { id:'fusee',  nom:'Fusée' },
  { id:'lune',   nom:'Lune' },
  { id:'feu',    nom:'Feu' },
  { id:'star',   nom:'Étoile' }
];
function profilCouleur(id){
  return COULEURS_PROFIL.find(c=>c.id===id) || COULEURS_PROFIL[0];
}
/* L'avatar de n'importe qui : le sien, ou celui d'une personne du cercle.
   Une photo remplace la couleur et l'emblème — on ne superpose pas les deux.
   `profil` attend { pseudo, couleur, embleme, photo } ; tout est facultatif. */
function avatarDe(profil, cls){
  const p = profil || {};
  const nom = (p.pseudo || '').trim();
  if(p.photo){
    return '<img class="avatar photo '+(cls||'')+'" src="'+esc(p.photo)+'" '+
           'alt="'+esc(nom || 'Avatar')+'">';
  }
  const c = profilCouleur(p.couleur);
  const lettre = (nom || '?').charAt(0).toUpperCase() || '?';
  const dedans = (p.embleme && p.embleme !== 'lettre' && I[p.embleme]) ? I[p.embleme] : esc(lettre);
  return '<div class="avatar '+(cls||'')+'" style="background:linear-gradient(135deg,'+c.a+','+c.b+')">'+
    dedans+'</div>';
}
function avatarMoi(cls){
  const p = db.profil || {};
  return avatarDe({ pseudo:db.pseudo, couleur:p.couleur, embleme:p.embleme, photo:p.photo }, cls);
}

/* ---------- La photo d'avatar ----------
   Réduite et recadrée au carré avant d'être gardée : une photo d'iPhone pèse
   plusieurs mégaoctets, elle passerait dans chaque synchro et dans chaque
   export. À 256 pixels, c'est quelques kilo-octets et c'est bien assez pour
   un rond de 96 pixels à l'écran. */
const AVATAR_PX = 256;
function photoVersAvatar(fichier){
  return new Promise((res, rej)=>{
    if(!fichier || !/^image\//.test(fichier.type || '')) return rej(new Error('pas une image'));
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = ()=>{
      try{
        /* Recadrage centré : on garde le carré du milieu, comme le fait
           n'importe quelle app de messagerie. */
        const cote = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth  - cote) / 2;
        const sy = (img.naturalHeight - cote) / 2;
        const cv = document.createElement('canvas');
        cv.width = cv.height = AVATAR_PX;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, sx, sy, cote, cote, 0, 0, AVATAR_PX, AVATAR_PX);
        const donnee = cv.toDataURL('image/jpeg', 0.82);
        URL.revokeObjectURL(url);
        if(!donnee || donnee.length < 100) return rej(new Error('image illisible'));
        res(donnee);
      }catch(e){ URL.revokeObjectURL(url); rej(e); }
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); rej(new Error('image illisible')); };
    img.src = url;
  });
}

/* ============================ UI helpers ============================ */
let toastTimer;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}
function openSheet(html){
  const el = document.getElementById('sheetin');
  /* Une poignée en haut : elle dit que le panneau se tire, et donne une prise
     franche là où le contenu ne défile pas. */
  el.innerHTML = '<div class="poignee"></div>' + html;
  el.style.transition = ''; el.style.transform = '';
  document.getElementById('sheet').classList.add('show');
  /* Après l'affichage, pas avant : tant que le panneau est masqué il n'a pas de
     hauteur, et remettre le défilement à zéro n'a aucun effet. */
  el.scrollTop = 0;
}
function closeSheet(){
  const s = document.getElementById('sheet');
  s.classList.remove('show');
  /* Un lecteur vidéo laissé dans le panneau continuerait de jouer, sans image
     et sans moyen de l'arrêter. On le retire à la fermeture. */
  const f = s.querySelector('iframe');
  if(f) f.remove();
  /* Le panneau peut avoir été laissé décalé par un geste : on le remet d'aplomb
     pour la prochaine ouverture. */
  const el = document.getElementById('sheetin');
  if(el){ el.style.transition = ''; el.style.transform = ''; }
}
document.getElementById('sheet').addEventListener('click', e=>{ if(e.target.id==='sheet') closeSheet(); });

/* ============================ État de navigation ============================ */
let view = 'follow';
let params = {};
let ui = { profTab:'series', editServer:false, searchQ:'', searchRes:null, searching:false, searchErr:'',
           openSeasons:{}, busy:false,
           /* Quel onglet d'avatar est ouvert : 'embleme', 'photo', ou rien —
              auquel cas on montre celui qui correspond à l'avatar actuel. */
           avatarOnglet:null,
           /* Sorties : la section affichée — l'affiche par défaut. */
           sortiesOnglet:'salle',
           /* Découvrir : type affiché, genres cochés, tri, note minimale, page en cours */
           /* Découvrir : type affiché, genres cochés, plateformes cochées, tri,
              note minimale, page en cours */
           /* « Quoi » démarre sur tout le catalogue : les sorties des 90 derniers
              jours sont un sous-ensemble étroit, mauvais point de départ pour
              découvrir quelque chose. */
           disc:{ type:'tout', genres:[], plates:[], toutesPlates:false,
                  perimetre:'tout', tri:'populaire', noteMin:0,
                  page:1, pages:1, res:[], loading:false, err:'', charge:false } };

const DEPTH = { motdepasse:0, avatar:0, discover:0, sorties:0, follow:0, profile:0, preview:1, show:1, movie:1, settings:1, abos:1, moi:1, acteur:2, account:2, biblio:2, notifs:2, gouts:2, clochettes:3 };
let navDir = 'none';
/* Position de défilement mémorisée pour les écrans qui sont des listes.
   Quitter une liste puis y revenir doit rendre la page là où on l'avait laissée ;
   une fiche, elle, s'ouvre toujours en haut. */
const LISTES = { discover:1, follow:1, profile:1, abos:1, biblio:1 };
const memDefil = {};
/* Paramètres du dernier passage sur chaque écran. En revenant en arrière on
   remet l'écran d'arrivée exactement dans l'état où on l'avait quitté : sans
   ça, revenir d'un film vers la fiche d'un acteur retombait sur un écran vide
   qui ne savait plus de quel acteur ni d'où il venait. */
const memParams = {};
function paramsRetour(dest){ return memParams[dest] || {}; }

function cleDefil(v, p){
  return v === 'biblio' ? 'biblio:'+((p||params||{}).id||'') : v;
}

/* L'ordre des onglets du bas — il donne le sens du glissement quand on passe
   de l'un à l'autre : vers Mon profil, le contenu arrive de la droite. */
const ONGLETS_BARRE = ['discover', 'follow', 'profile'];

function go(v, p, dir){
  if(view===v && JSON.stringify(params)===JSON.stringify(p||{})){ window.scrollTo(0,0); render(); return; }
  if(LISTES[view]) memDefil[cleDefil(view)] = window.scrollY || 0;
  /* En revenant sur Découvrir sans recherche en cours, le champ se referme :
     on retrouve l'écran de suggestions net. Une recherche en cours, elle, survit. */
  if(v === 'discover' && !(ui.searchQ||'').trim()) ui.champOuvert = false;
  const a = DEPTH[view]||0, b = DEPTH[v]||0;
  navDir = dir || (b > a ? 'enter' : b < a ? 'back' : 'none');
  if(navDir === 'enter') memParams[view] = params;
  /* Un changement d'onglet n'avait aucun mouvement : l'écran claquait d'un
     état à l'autre, à contre-courant de la pastille qui glisse. Le contenu
     arrive maintenant du côté d'où l'on vient. */
  const deTab = ONGLETS_BARRE.indexOf(view), versTab = ONGLETS_BARRE.indexOf(v);
  view = v; params = p||{};
  if(typeof hideUndo === 'function') hideUndo();
  render();
  const app = document.getElementById('app');
  app.classList.remove('tabg-d', 'tabg-g');
  if(navDir === 'none' && deTab >= 0 && versTab >= 0 && deTab !== versTab){
    void app.offsetWidth;                    // repart de zéro si on enchaîne vite
    app.classList.add(versTab > deTab ? 'tabg-d' : 'tabg-g');
  }
  const y = LISTES[v] ? (memDefil[cleDefil(v, p)] || 0) : 0;
  window.scrollTo(0, y);
  /* La grille se peuple parfois juste après le rendu : on repositionne une fois de plus. */
  if(y) requestAnimationFrame(()=> window.scrollTo(0, y));
}

/* Une liste qui repart de zéro (nouvelle recherche, filtre changé) oublie sa position. */
function oublierDefil(v){ delete memDefil[cleDefil(v)]; }
/* Cible du retour selon l'écran courant — utilisée par la flèche et par le balayage */
function currentBack(){
  if(view==='show' || view==='movie') return params.from || 'follow';
  if(view==='preview') return params.from || 'discover';
  /* Ces deux écrans s'ouvrent depuis plusieurs endroits : sans cible par défaut,
     la flèche disparaissait et on se retrouvait coincé. */
  if(view==='settings') return params.from || 'profile';
  if(view==='account') return params.from || 'settings';
  if(view==='abos') return params.from || 'profile';
  if(view==='moi') return params.from || 'profile';
  if(view==='acteur') return params.from || 'discover';
  if(view==='biblio') return params.from || 'abos';
  if(view==='notifs') return params.from || 'settings';
  if(view==='clochettes') return params.from || 'notifs';
  /* Depuis la création du compte, il n'y a pas de « retour » : l'écran
     précédent était le choix de l'avatar, déjà validé. On en sort par
     « C'est parti » ou « Passer ». */
  if(view==='gouts') return params.from === 'compte' ? null : (params.from || 'settings');
  return null;
}
function goBack(){
  /* Le lecteur vidéo passe avant tout le reste : le geste de retour le ferme
     au lieu de quitter la fiche qui est dessous. */
  if(typeof lecteurOuvert === 'function' && lecteurOuvert()) return fermerBande();
  if(document.getElementById('sheet').classList.contains('show')) return closeSheet();
  const t = currentBack();
  if(!t) return;
  /* Un deuxième appui pendant que l'écran glisse encore ne doit pas lancer
     un second retour par-dessus le premier. */
  if(typeof glisseRetour !== 'undefined'){
    if(glisseRetour.enCours()) return;
    /* La flèche joue exactement le même mouvement que le doigt : l'app garde
       un seul langage pour revenir en arrière. */
    if(glisseRetour.jouer()) return;
  }
  go(t, paramsRetour(t), 'back');
}
/* ===================== Retour arrière : deux écrans à l'image =====================
   Comme sur iOS. L'écran quitté glisse vers la droite ; l'écran d'arrivée est
   déjà là, dessous, et remonte depuis la gauche à vitesse réduite (parallaxe),
   sous un voile qui s'éclaircit. On voit les deux en même temps, du début à la
   fin du geste — c'est ça qui fait la fluidité, pas la durée de l'animation.

   L'écran d'arrivée est fabriqué dans une couche à part, défilable, placée à la
   position de lecture qu'on lui connaît : son en-tête colle donc normalement.
   Au bout du geste, cette couche est remplacée par le vrai rendu, au même
   endroit et à la même position : la substitution ne se voit pas. */
let sansAnim = false;         // render() ne doit pas rejouer d'animation par-dessus

const glisseRetour = (function(){
  const PARALLAXE = 0.28;                    // part de la largeur dont l'arrivée est décalée
  const VOILE = 0.3;                         // noir posé sur l'arrivée au repos
  let couche = null, voile = null, cible = null, largeur = 0, frame = 0, d = 0, fini = false;

  const app = ()=> document.getElementById('app');
  const enCours = ()=> !!couche;

  /* Prépare la couche du dessous avec l'écran d'arrivée. */
  function preparer(){
    const dest = currentBack();
    if(!dest || couche) return false;
    cible = dest;
    largeur = window.innerWidth || 375;

    couche = document.createElement('div');
    couche.className = 'souscran';
    /* Le même habillage que l'écran normal, sinon la mise en page ne suit pas. */
    couche.innerHTML = '<div class="app">'+htmlDeLaVue(dest, paramsRetour(dest))+'</div>';
    voile = document.createElement('div');
    voile.className = 'sousvoile';

    const el = app();
    /* Après #app dans le document, pas avant : les identifiants sont en double
       le temps du geste, et tout le code doit continuer à trouver l'écran réel.
       L'empilement, lui, est donné par les z-index. */
    el.insertAdjacentElement('afterend', couche);
    couche.insertAdjacentElement('afterend', voile);
    /* Même position de lecture que si on y était resté. */
    const y = LISTES[dest] ? (memDefil[cleDefil(dest)] || 0) : 0;
    couche.scrollTop = y;

    el.classList.add('glisse');
    el.style.transition = 'none';
    el.style.willChange = 'transform';
    d = 0; fini = false;
    peindre();
    return true;
  }

  /* Une seule écriture de style par image : iOS envoie les événements tactiles
     plus vite que l'écran ne se rafraîchit, et écrire à chaque fois fait sauter
     des images — c'est ce qui hachait le mouvement. */
  function peindre(){
    frame = 0;
    const el = app(); if(!el || !couche) return;
    const part = Math.min(1, d / largeur);
    el.style.transform = 'translate3d('+d+'px,0,0)';
    couche.style.transform = 'translate3d('+(-(1 - part) * largeur * PARALLAXE)+'px,0,0)';
    voile.style.opacity = String(VOILE * (1 - part));
  }

  function suivre(dx){
    if(!couche && !preparer()) return;
    d = Math.max(0, Math.min(dx, largeur));
    if(!frame) frame = requestAnimationFrame(peindre);
  }

  /* Fin du mouvement : la couche cède la place au vrai rendu, d'un seul bloc,
     donc sans clignotement. */
  function poser(){
    if(fini) return;
    fini = true;
    const el = app();
    if(frame){ cancelAnimationFrame(frame); frame = 0; }
    if(el) el.style.transition = 'none';
    sansAnim = true;
    go(cible, paramsRetour(cible), 'back');
    if(el){
      el.style.transform=''; el.style.opacity=''; el.style.willChange=''; el.style.transition='';
      el.classList.remove('glisse');
    }
    if(couche) couche.remove();
    if(voile) voile.remove();
    couche = null; voile = null; cible = null; d = 0;
  }

  function remettre(){
    const el = app();
    if(frame){ cancelAnimationFrame(frame); frame = 0; }
    if(el){ el.style.transform=''; el.style.opacity=''; el.style.willChange=''; el.style.transition='';
            el.classList.remove('glisse'); }
    if(couche) couche.remove();
    if(voile) voile.remove();
    couche = null; voile = null; cible = null; d = 0; fini = false;
  }

  /* Anime jusqu'au bout (aboutir) ou jusqu'au retour en place (abandonner).
     Une minuterie de secours double la fin de transition : si l'app passe en
     arrière-plan pile à cet instant, l'écran ne doit pas rester de travers. */
  function terminer(aboutir){
    const el = app();
    if(!couche || !el) return;
    if(frame){ cancelAnimationFrame(frame); frame = 0; }
    const reste = aboutir ? (largeur - d) : d;
    const duree = Math.max(140, Math.min(320, Math.round(reste / largeur * 340) + 110));
    const cb = 'cubic-bezier(.22,.61,.36,1)';
    el.style.transition = 'transform '+duree+'ms '+cb;
    couche.style.transition = 'transform '+duree+'ms '+cb;
    voile.style.transition = 'opacity '+duree+'ms '+cb;
    d = aboutir ? largeur : 0;
    const part = aboutir ? 1 : 0;
    el.style.transform = 'translate3d('+d+'px,0,0)';
    couche.style.transform = 'translate3d('+(-(1 - part) * largeur * PARALLAXE)+'px,0,0)';
    voile.style.opacity = String(VOILE * (1 - part));
    const achever = ()=> aboutir ? poser() : remettre();
    el.addEventListener('transitionend', function fin(ev){
      if(ev.propertyName !== 'transform') return;
      el.removeEventListener('transitionend', fin);
      achever();
    });
    setTimeout(achever, duree + 120);
  }

  /* Retour sans geste (flèche, balayage impossible) : même mouvement, joué seul. */
  function jouer(){
    if(couche || !preparer()) return false;
    d = 0; peindre();
    let parti = false;
    const lancer = ()=>{ if(parti) return; parti = true; void app().offsetWidth; terminer(true); };
    requestAnimationFrame(lancer);
    setTimeout(lancer, 80);
    return true;
  }

  return { suivre, terminer, remettre, jouer, enCours };
})();

/* Balayage depuis le bord gauche pour revenir en arrière */
(function swipeBack(){
  const SEUIL = 60;
  let x0=null, y0=null, t0=0, actif=false;

  let surVideo = false;   // le geste a commencé pendant qu'une vidéo jouait

  document.addEventListener('touchstart', e=>{
    const t = e.touches[0];
    actif = false;
    surVideo = typeof lecteurOuvert === 'function' && lecteurOuvert();
    if(t.clientX <= 28 && (surVideo || currentBack()) &&
       !document.getElementById('sheet').classList.contains('show')){
      x0=t.clientX; y0=t.clientY; t0=Date.now();
    } else x0=null;
  }, {passive:true});

  document.addEventListener('touchmove', e=>{
    if(x0===null) return;
    const t = e.touches[0];
    const dx = t.clientX-x0, dy = Math.abs(t.clientY-y0);
    if(!actif && (dy > 20 || dx < 6)){ if(dy > 20) x0 = null; return; }  // c'est un défilement
    /* Pendant une vidéo, l'écran ne doit pas glisser dessous : le geste ne fera
       que fermer le lecteur, au relâchement. */
    if(!surVideo) glisseRetour.suivre(dx);
    actif = true;
  }, {passive:true});

  document.addEventListener('touchend', e=>{
    if(x0===null){ if(actif && !surVideo) glisseRetour.terminer(false); actif=false; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX-x0, dy = Math.abs(t.clientY-y0);
    /* Un geste franc, ou un geste vif même court : on part. */
    const vite = dx > 24 && (Date.now()-t0) < 260;
    const part = (dx > SEUIL || vite) && dy < 45 && Date.now()-t0 < 900;
    /* Le même geste que pour revenir en arrière, mais appliqué à la vidéo :
       il la ferme et on retrouve la fiche exactement où on l'avait laissée. */
    if(surVideo){ if(actif && part) fermerBande(); }
    else if(actif) glisseRetour.terminer(part);
    x0=null; actif=false; surVideo=false;
  }, {passive:true});
})();


/* ===================== Fermer un panneau en le tirant vers le bas =====================
   Le panneau des filtres occupe presque tout l'écran : il n'y a pas de zone à
   côté où appuyer, et le bouton du bas était la seule sortie.

   Deux règles, celles d'iOS, pour ne pas se battre avec le défilement :
   — sur la poignée ou le titre, le geste tire toujours le panneau ;
   — dans le contenu, il ne le tire que si l'on est déjà en haut de la liste.
   Partout ailleurs, le doigt fait défiler, comme avant. */
(function glisseFeuille(){
  const SEUIL = 110;                    // distance au-delà de laquelle on ferme
  const VITE = 0.55;                    // ou vitesse suffisante, même sur peu de distance
  const el = ()=> document.getElementById('sheetin');
  let y0 = 0, t0 = 0, dy = 0, actif = false, arme = false;

  function surLaPoignee(cible){
    const in_ = el(); if(!in_ || !cible) return false;
    if(cible.classList && cible.classList.contains('poignee')) return true;
    /* Le titre collant en haut du panneau fait aussi office de prise. */
    return !!(cible.closest && cible.closest('#sheetin > h3'));
  }

  document.addEventListener('touchstart', e=>{
    actif = false; arme = false; dy = 0;
    const in_ = el();
    if(!in_ || !document.getElementById('sheet').classList.contains('show')) return;
    const t = e.touches[0];
    if(!in_.contains(e.target)) return;          // le fond gère déjà la fermeture
    /* Un champ de saisie garde le doigt pour lui. */
    if(e.target.closest && e.target.closest('input,select,textarea')) return;
    arme = surLaPoignee(e.target) || in_.scrollTop <= 0;
    y0 = t.clientY; t0 = Date.now();
  }, {passive:true});

  document.addEventListener('touchmove', e=>{
    if(!arme) return;
    const in_ = el(); if(!in_) return;
    const d = e.touches[0].clientY - y0;
    if(!actif){
      if(d < 6) return;                          // vers le haut ou immobile : on laisse défiler
      actif = true;
      in_.style.transition = 'none';
    }
    dy = Math.max(0, d);
    /* Passé le seuil, le panneau résiste : on sent qu'on est allé assez loin. */
    const suivi = dy > SEUIL ? SEUIL + (dy - SEUIL) * 0.4 : dy;
    in_.style.transform = 'translate3d(0,'+suivi+'px,0)';
    if(e.cancelable) e.preventDefault();          // sinon le contenu défile en même temps
  }, {passive:false});

  document.addEventListener('touchend', ()=>{
    const in_ = el();
    if(!actif || !in_){ arme = false; return; }
    const vitesse = dy / Math.max(1, Date.now() - t0);
    in_.style.transition = 'transform .26s cubic-bezier(.22,.61,.36,1)';
    if(dy > SEUIL || vitesse > VITE){
      /* On accompagne le geste jusqu'en bas avant de refermer : le panneau ne
         disparaît pas sous le doigt. */
      in_.style.transform = 'translate3d(0,'+(in_.offsetHeight + 40)+'px,0)';
      setTimeout(closeSheet, 200);
    } else {
      in_.style.transform = '';
    }
    actif = false; arme = false; dy = 0;
  }, {passive:true});
})();
