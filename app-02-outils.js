"use strict";
/* ============================ Utilitaires ============================ */
const todayISO = ()=> new Date().toISOString().slice(0,10);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* Une chaîne glissée dans un `onclick="f('…')"` traverse DEUX analyseurs : le
   parseur HTML décode d'abord les entités, puis JavaScript lit le littéral.
   `esc` seul ne suffit donc pas — il transforme l'apostrophe en `&#39;`, que le
   parseur HTML rend telle quelle à JavaScript, qui y voit la fin de sa chaîne
   (« Avec N'Golo » cassait le gestionnaire). On échappe pour JavaScript AVANT
   d'échapper pour HTML : la barre oblique, elle, survit au décodage.

   RÈGLE : toute chaîne glissée dans un `onclick` passe par `escJs`, JAMAIS par
   `esc(…).replace(/'/g, …)`. Cette seconde forme est un leurre — `esc` a déjà
   transformé l'apostrophe en `&#39;`, le `replace` ne trouve plus rien et ne
   fait donc rien. Elle traînait à trois endroits d'app-11 jusqu'au 30/07 :
   chercher « O'Toole » dans Mes goûts affichait bien le résultat, mais le
   bouton ne faisait rien, sans message. Contrôle :
       git grep -n "esc(.*)\.replace(/'/g"   → ne doit renvoyer que cette ligne. */
const escJs = s => esc(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"));
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
/* B4 — un épisode SANS DATE n'est pas « à venir » : c'est une lacune de TMDB,
   fréquente sur les vieux épisodes et les hors-série. L'ancienne boucle
   s'arrêtait dessus comme sur un épisode futur, `nextToWatch` rendait `null`,
   et la série entière s'évaporait du rail « À rattraper » — pendant que
   `retardSerie` continuait de compter des épisodes en retard et que
   `statutSerie` la classait toujours « à suivre ». Aucun écran ne signalait
   l'incohérence, et le bug ne se voyait que sur certaines séries.

   Règle retenue, explicitement : une lacune se saute, une date future arrête. */
function nextToWatch(show){
  const eps = allEpisodes(show,false);
  for(const ep of eps){
    if(show.watched[key(ep.s,ep.e)]) continue;   // déjà vu : on passe
    if(!ep.d) continue;                          // lacune TMDB : on saute, on ne s'arrête pas
    if(ep.d > todayISO()) break;                 // vraiment à venir : plus rien à rattraper
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
/* D6 — UN TERME PAR CONCEPT. Les clés internes et les libellés affichés ont
   divergé VOLONTAIREMENT : `asuivre` reste `asuivre` dans le code, `view` reste
   `follow`, `ROUTES.follow.seg` reste `a-suivre`. Renommer le code en même
   temps que l'interface multiplierait la surface de régression pour zéro
   bénéfice utilisateur — et les adresses déjà partagées cesseraient de marcher.
   Le mot « suivre » disparaît en revanche de tout ce qui est AFFICHÉ : il
   désignait à la fois l'onglet, le fait d'avoir commencé, et l'ajout. */
/* `asuivre` s'affiche « En cours », PAS « À rattraper » : une série commencée
   et à jour est bien en cours, et n'a rien à rattraper. « À rattraper » ne
   qualifie que la section qui liste les épisodes réellement en retard. */
const LIB_STATUT = { avoir:'À voir', asuivre:'En cours', vu:'Vu', pause:'En pause' };

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

/* ---------------------------------------------------------------------------
   La frontière de confiance des chemins d'image

   Un chemin d'affiche vient normalement de TMDB, et le coller tel quel dans un
   `src` ne poserait aucun problème. Mais `chargerBiblio` charge la colonne
   `data` d'une AUTRE personne — celle dont on a accepté le code de partage — et
   ses `poster` traversent `posterEl` comme les nôtres. Quelqu'un peut écrire
   dans sa propre ligne, par appel direct à l'API, un poster valant
   `/x.jpg" onerror="…` : le guillemet referme l'attribut et le reste s'exécute
   dans NOTRE app, avec notre jeton en mémoire.

   Deux verrous, parce qu'un seul finit toujours par être contourné : la forme
   est vérifiée (un chemin TMDB, rien d'autre), ET la sortie est échappée.
   TMDB utilise des chemins du type `/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg` :
   lettres, chiffres, point, tiret, souligné, barre oblique. */
/* Une barre oblique en tête, puis des segments de lettres, chiffres, point,
   tiret et souligné, séparés par UNE seule barre. Le refus du double slash
   n'est pas cosmétique : `//evil.example/x.jpg` est une adresse relative au
   protocole, que le navigateur charge depuis un serveur tiers — soit très
   exactement la balise de traçage que cette fonction existe pour empêcher.
   Mon premier essai, `/^\/[\w.\-\/]+$/`, la laissait passer. */
const cheminImage = p =>
  (typeof p === 'string' && /^\/[\w.-]+(?:\/[\w.-]+)*$/.test(p)) ? p : null;
/* Le `src` prêt à l'emploi, ou une chaîne vide si le chemin n'inspire pas
   confiance — les appelants savent déjà retomber sur leur cadre neutre. */
const srcImage = (p, size) => { const c = cheminImage(p); return c ? esc(IMG(c, size)) : ''; };

function posterEl(path, size, cls, alt){
  const src = srcImage(path, size);
  if(src) return '<img class="poster '+(cls||'')+'" loading="lazy" onerror="posterFail(this)" src="'+
    src+'" alt="'+esc(alt||'')+'">';
  return '<div class="poster ph '+(cls||'')+'">'+esc((alt||'?').slice(0,18))+'</div>';
}
/* Vignette d'épisode : image TMDB si elle existe, sinon un cadre neutre de même taille.
   Chargement différé pour que les longues saisons restent fluides. */
function epThumb(ep){
  const src = ep ? srcImage(ep.st, 'w300') : '';
  if(src)
    return '<div class="epthumb"><img loading="lazy" decoding="async" alt="" '+
           'onerror="thumbFail(this)" src="'+src+'"></div>';
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
/* E5 — CE QUI DOIT SE PASSER À LA FERMETURE D'UN PANNEAU.
   La feuille de filtres compose un brouillon et ne lance sa requête qu'à la
   fermeture — quelle que soit la fermeture : le bouton, le geste de tirage, un
   appui sur le fond, ou un lien qui referme avant de naviguer. Le rappel est
   désigné par une CLÉ et non par une fonction : `ouvrirFiltres` se redessine à
   chaque coche, et comparer des closures aurait fait « fermer » la feuille à
   chaque repeint. */
const FERMETURES = {};              // clé -> fonction, remplie par les écrans
let fermetureEnCours = null;
function poserFermeture(cle){
  if(fermetureEnCours && fermetureEnCours !== cle) jouerFermeture();
  fermetureEnCours = cle || null;
}
function jouerFermeture(){
  const cle = fermetureEnCours; fermetureEnCours = null;
  const f = cle && FERMETURES[cle];
  if(typeof f === 'function'){ try{ f(); }catch(e){} }
}
function openSheet(html, cle){
  const el = document.getElementById('sheetin');
  /* Un panneau DÉJÀ ouvert qu'on redessine garde sa position de lecture.
     La feuille de filtres se redessine à chaque puce touchée : remettre le
     défilement à zéro à chaque fois renvoyait en haut celui qui venait de
     cocher « Années 90 » en bas de la feuille. */
  const deja = document.getElementById('sheet').classList.contains('show');
  const y = deja ? el.scrollTop : 0;
  /* Une poignée en haut : elle dit que le panneau se tire, et donne une prise
     franche là où le contenu ne défile pas. */
  el.innerHTML = '<div class="poignee"></div>' + html;
  el.style.transition = ''; el.style.transform = '';
  document.getElementById('sheet').classList.add('show');
  /* Après l'affichage, pas avant : tant que le panneau est masqué il n'a pas de
     hauteur, et poser le défilement n'a aucun effet. */
  el.scrollTop = y;
  poserFermeture(cle);
}
function closeSheet(){
  const s = document.getElementById('sheet');
  s.classList.remove('show');
  jouerFermeture();
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

/* ================================ Routes ================================= */
/* C1 — un écran = une chaîne, et réciproquement.
   Deux fonctions PURES, sans effet de bord, volontairement pas encore
   branchées : c'est ce qui rend C1 livrable seul, sans toucher à la
   navigation. C2 posera `pushState`/`popstate` par-dessus.

   Le fragment (`#…`) est le seul endroit possible : GitHub Pages sert un
   fichier statique, il ne sait pas router `/serie/1399`.

   `partageable:false` marque un écran qui n'a aucun sens hors contexte — on ne
   le met pas dans une adresse et on refuse de le restaurer au démarrage. Trois
   raisons distinctes de le poser :
     · il porte un secret de passage (motdepasse) ;
     · il n'existe que dans un parcours (avatar, pendant l'inscription) ;
     · il dépend d'un état mémoire qu'une adresse ne transporte pas
       (rangee : une clé de rangée n'a de sens que dans la session qui l'a
       construite ; biblio : l'identité d'une personne suivie).
   `account` est non partageable parce que l'écran de compte contient l'adresse
   e-mail : une adresse qu'on colle dans une conversation ne doit pas y mener. */
const ROUTES = {
  discover:   { seg:'decouvrir',     partageable:true  },
  /* L'onglet Recherche est partageable sans paramètre : l'adresse mène à
     l'écran vide, pas à une requête. Les critères vivent en mémoire — les
     mettre dans l'adresse voudrait dire les restaurer au démarrage, donc
     ouvrir l'app sur une grille filtrée que personne n'a demandée ce jour-là. */
  search:     { seg:'recherche',     partageable:true  },
  follow:     { seg:'a-suivre',      partageable:true  },
  profile:    { seg:'profil',        partageable:true  },
  show:       { seg:'serie',         partageable:true,  cles:['id'] },
  movie:      { seg:'film',          partageable:true,  cles:['id'] },
  preview:    { seg:'apercu',        partageable:true,  cles:['id','type'] },
  acteur:     { seg:'personne',      partageable:true,  cles:['id'] },
  settings:   { seg:'reglages',      partageable:true  },
  abos:       { seg:'abonnements',   partageable:true  },
  moi:        { seg:'moi',           partageable:true  },
  gouts:      { seg:'gouts',         partageable:true  },
  plates:     { seg:'plateformes',   partageable:true  },
  notifs:     { seg:'notifications', partageable:true  },
  clochettes: { seg:'cloches',       partageable:true  },
  rangee:     { seg:'rangee',        partageable:false },
  biblio:     { seg:'bibliotheque',  partageable:false },
  account:    { seg:'compte',        partageable:false },
  avatar:     { seg:'avatar',        partageable:false },
  motdepasse: { seg:'motdepasse',    partageable:false },
  /* D1 — l'écran de présentation n'a aucun sens hors de son parcours : il ne
     s'affiche qu'une fois par appareil et ne mène nulle part qu'au formulaire. */
  bienvenue:  { seg:'bienvenue',     partageable:false }
};
/* `sorties` existe dans DEPTH et a encore sa fonction de rendu, mais son onglet
   a été retiré le 28/07 : aucun `go('sorties')` ne subsiste. Lui donner une
   route ouvrirait par une adresse un écran qu'on ne peut plus atteindre
   autrement. Le sort de ce code mort est tranché en H8, pas ici. */

/* Les seuls types que TMDB connaît, et les seuls que `loadPreview` sait mettre
   dans un chemin d'API. Une route qui en propose un autre est inventée : on la
   refuse, plutôt que d'aller demander `/nimporte-quoi/1399` au relais. */
const TYPES_APERCU = { tv:1, movie:1 };

/* `from` ne fait pas partie de l'identité d'un écran : c'est une béquille de
   l'ancienne navigation, que l'historique remplacera (C4.4). On ne le
   sérialise pas — sinon deux adresses désigneraient le même écran. */
function routeVersFragment(v, p){
  const r = ROUTES[v];
  if(!r || !r.partageable) return null;
  const bouts = [r.seg];
  let complet = true;
  (r.cles||[]).forEach(k=>{
    const val = p ? p[k] : null;
    if(val == null || val === '') complet = false;
    else bouts.push(encodeURIComponent(val));
  });
  /* Un écran à identité dont on n'a pas l'identité ne se sérialise pas : mieux
     vaut pas d'adresse du tout qu'une adresse tronquée qui ne se relit pas. */
  if(!complet) return null;
  return '#/' + bouts.join('/');
}

function fragmentVersRoute(frag){
  const s = String(frag || '');

  /* Ancienne forme émise par le serveur avant la refonte : `#show-1399`. Les
     notifications déjà parties peuvent dormir plusieurs jours dans le centre de
     notifications — à garder au moins un mois après le passage de `notifier` à
     la nouvelle forme. */
  const vieux = /^#?(show|movie)-(\d+)$/.exec(s);
  if(vieux) return { view: vieux[1], params: { id: vieux[2] } };

  /* Le lien de réinitialisation de mot de passe occupe le MÊME fragment sous une
     autre forme (`access_token=…&type=recovery`). Il ne commence pas par « / »,
     donc il tombe ici, et c'est voulu : au démarrage comme au `hashchange`, on
     lit le mot de passe d'abord et la route ensuite (C3). */
  if(!/^#?\//.test(s)) return null;

  const bouts = s.replace(/^#?\//, '').split('/').filter(Boolean);
  let seg;
  try{ seg = decodeURIComponent(bouts.shift() || ''); }
  catch(e){ return null; }        // « %E0 » seul fait jeter decodeURIComponent
  if(!seg) return null;

  for(const v in ROUTES){
    const r = ROUTES[v];
    if(r.seg !== seg || !r.partageable) continue;
    const cles = r.cles || [];
    const p = {};
    for(let i = 0; i < cles.length; i++){
      if(bouts[i] == null) return null;              // route incomplète
      try{ p[cles[i]] = decodeURIComponent(bouts[i]); }
      catch(e){ return null; }
    }
    /* Les identifiants TMDB sont numériques : une route qui n'en fournit pas un
       est inventée, on la refuse plutôt que d'ouvrir un écran vide. */
    if(cles.indexOf('id') >= 0 && !/^\d+$/.test(String(p.id || ''))) return null;
    if(cles.indexOf('type') >= 0 && !TYPES_APERCU[p.type]) return null;
    return { view: v, params: p };
  }
  return null;
}

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
           /* Abonnements : lequel des deux volets d'action est déplié
              ('suivre', 'code'), ou aucun. Les deux formulaires occupaient tout
              l'écran avant les personnes ; ils ne s'ouvrent plus qu'à la demande. */
           aboPanneau:null,
           /* Écran « Mes plateformes » : la liste complète est-elle dépliée ?
              On n'en montre qu'une douzaine d'emblée, TMDB en recense plus de
              cent pour la France. */
           mesPlatesTout:false,
           /* Découvrir : type affiché, genres cochés, tri, note minimale, page en cours */
           /* Découvrir : type affiché, genres cochés, plateformes cochées, tri,
              note minimale, page en cours */
           /* « Quoi » démarre sur tout le catalogue : les sorties des 90 derniers
              jours sont un sous-ensemble étroit, mauvais point de départ pour
              découvrir quelque chose. */
           disc:{ type:'tout', genres:[],
                  /* Les plateformes cochées dans la feuille. Elles démarrent sur
                     les abonnements déclarés (`semerPlatesFiltres`) ; le drapeau
                     dit si la personne y a mis la main depuis. */
                  plates:[], platesTouchees:false, toutesPlates:false,
                  /* Les envies : des identifiants de mots-clés TMDB. Un genre dit
                     « thriller », une envie dit « braquage » — c'est ce qui manquait
                     pour passer de mille titres à une poignée. */
                  envies:[],
                  /* La durée, côté films seulement. */
                  duree:'tout',
                  /* Les rubriques repliées de la feuille de filtres, par clé.
                     Repliées par défaut sauf les deux premières : la feuille
                     compte assez de rubriques pour devenir un formulaire. */
                  plies:{},
                  perimetre:'tout', tri:'populaire', noteMin:0,
                  page:1, pages:1, res:[], loading:false, err:'', charge:false },
           /* E5 — l'état de TRAVAIL de la feuille de filtres, distinct de
              `disc` qui est l'état appliqué. Créé à l'ouverture de la feuille,
              versé dans `disc` à sa fermeture, remis à null ensuite. */
           discBrouillon:null };

const DEPTH = { bienvenue:0, motdepasse:0, avatar:0, discover:0, search:0, sorties:0, follow:0, profile:0, preview:1, show:1, movie:1, settings:1, abos:1, moi:1, rangee:1, acteur:2, account:2, biblio:2, notifs:2, gouts:2, plates:2, clochettes:3 };
let navDir = 'none';
/* Position de défilement mémorisée pour les écrans qui sont des listes.
   Quitter une liste puis y revenir doit rendre la page là où on l'avait laissée ;
   une fiche, elle, s'ouvre toujours en haut. */
/* La filmographie d'un acteur en fait partie : elle compte parfois deux cents
   titres, et revenir d'une fiche pour retomber tout en haut est le reproche
   exact d'Adrien. */
const LISTES = { discover:1, search:1, follow:1, profile:1, abos:1, biblio:1, acteur:1, rangee:1 };
const memDefil = {};
/* Paramètres du dernier passage sur chaque écran. En revenant en arrière on
   remet l'écran d'arrivée exactement dans l'état où on l'avait quitté : sans
   ça, revenir d'un film vers la fiche d'un acteur retombait sur un écran vide
   qui ne savait plus de quel acteur ni d'où il venait. */
const memParams = {};
function paramsRetour(dest){ return memParams[dest] || {}; }

/* Deux listes du même écran ne partagent pas leur position : la bibliothèque
   d'Alex n'est pas celle de Camille, la filmographie de Morgan Freeman n'est
   pas celle de Tom Hanks. On repli sur `ui.acteurId` parce que le retour ne
   repasse pas toujours les paramètres de l'écran d'arrivée. */
function cleDefil(v, p){
  const q = p || params || {};
  if(v === 'biblio') return 'biblio:'+(q.id||'');
  if(v === 'acteur') return 'acteur:'+(q.id || ui.acteurId || '');
  /* Deux rangées dépliées ne partagent pas leur position : revenir des « films
     pour toi » ne doit pas rendre la grille des animés là où on avait laissé
     l'autre. */
  if(v === 'rangee') return 'rangee:'+(q.cle||'');
  return v;
}

/* L'ordre des onglets du bas — il donne le sens du glissement quand on passe
   de l'un à l'autre : vers Mon profil, le contenu arrive de la droite. */
const ONGLETS_BARRE = ['discover', 'search', 'follow', 'profile'];

/* ========================= Historique — C2 =========================
   `go()` reste la seule porte d'entrée, avec la même signature : les ~100
   appels existants ne bougent pas. On lui ajoute une pile d'historique réelle
   en dessous, et le retour — flèche, geste, bouton matériel d'Android — devient
   une seule et même mécanique.

   POURQUOI UN MIROIR DE LA PILE. Le navigateur ne donne accès qu'à l'état de
   l'entrée COURANTE (`history.state`) ; celui de l'entrée précédente est
   inaccessible sans y naviguer. Or le geste de retour a besoin de savoir vers
   quel écran il glisse AVANT de l'atteindre, pour le dessiner sous le doigt.
   D'où `pileHisto`, indexée : chaque entrée poussée porte son rang, et le rang
   reçu au `popstate` dit le sens du mouvement — ce qui gère aussi la marche
   avant, qu'une simple pile ne saurait pas distinguer d'un retour. */
let pileHisto = [], iHisto = -1;
/* `msv` distingue nos entrées de celles d'un tiers (extension, ancre). */
const etatHisto = (v, p, i)=> ({ msv:1, i:i, view:v, params:p||{} });
/* Nombre d'entrées derrière nous. On ne se fie PAS à `history.length`, qui
   compte aussi les pages visitées avant l'app. */
const historiqueInterne = ()=> Math.max(0, iHisto);
/* L'écran vers lequel le retour ramène. L'historique fait foi ; `currentBack()`
   ne sert plus que quand il n'y a rien derrière — entrée directe par une
   notification ou par un lien collé (voir C3). */
/* Le miroir n'est juste que si sa tête décrit bien l'écran affiché. Du code qui
   pose `view` à la main sans passer par `go()` le désaccorde — et alors le
   retour partirait n'importe où. Plutôt que de faire confiance aveuglément, on
   contrôle, et on se replie sur `currentBack()` quand ça ne colle pas.
   Sans ce garde-fou, C2 renvoyait sur la porte d'entrée depuis n'importe quel
   écran dès qu'un seul `view =` direct s'était glissé quelque part. */
function miroirJuste(){
  const t = pileHisto[iHisto];
  return !!t && t.view === view;
}
function cibleRetour(){
  const e = miroirJuste() ? pileHisto[iHisto - 1] : null;
  return e ? e.view : currentBack();
}
function paramsCibleRetour(){
  const e = miroirJuste() ? pileHisto[iHisto - 1] : null;
  return e ? e.params : paramsRetour(currentBack());
}
/* Le `popstate` déclenché par NOTRE propre `history.back()` quand l'écran a
   déjà été rendu (geste de retour) : il n'y a plus rien à faire, on l'avale. */
let popstateAAvaler = 0;

/* ===================== C3 — l'entrée directe =====================
   Destination retenue quand on arrive par un lien sans être connecté : elle est
   rejouée après connexion, sinon la notification touchée se perd. */
let destinationEnAttente = null;

/* Un écran atteint par une adresse n'a pas été préparé par le geste qui y mène
   d'habitude : l'aperçu attend `ui.preview`, la fiche attend une série qui
   peut ne plus être dans la bibliothèque. On répare ça ici, au seul endroit où
   une entrée directe passe. */
function preparerEntreeDirecte(v, p){
  let vue = v, par = Object.assign({}, p || {});
  if(vue === 'show' && !db.shows[par.id]){
    /* La série a été retirée entre l'envoi de la notification et l'appui.
       Plutôt qu'un cul-de-sac « Introuvable », on ouvre son aperçu : de là on
       peut la remettre dans la bibliothèque. */
    vue = 'preview'; par = { id: par.id, type: 'tv' };
  }else if(vue === 'movie' && !db.movies[par.id]){
    vue = 'preview'; par = { id: par.id, type: 'movie' };
  }
  if(vue === 'preview'){
    ui.preview = { id: par.id, type: par.type, loading: true, data: null, error: '' };
    /* Après le rendu : `loadPreview` redessine tout seul quand la réponse
       arrive, et il ne doit pas courir avant que l'écran existe. */
    setTimeout(()=>{ if(typeof loadPreview === 'function') loadPreview(); }, 0);
  }
  return { view: vue, params: par };
}

/* Rejoue la destination mise de côté. Appelée juste après une connexion
   réussie ; rend `true` si elle a pris la main. */
function rejouerDestination(){
  if(!destinationEnAttente) return false;
  const d = destinationEnAttente; destinationEnAttente = null;
  const c = preparerEntreeDirecte(d.view, d.params);
  go(c.view, c.params, 'enter', { remplacer:true });
  return true;
}

/* Première entrée de la session. Appelée par `boot()` avant le premier rendu :
   sans elle, le premier `popstate` arriverait sans état et on ne saurait pas
   d'où l'on vient. C3 remplacera cet amorçage par la lecture du fragment. */
function amorcerHistorique(){
  /* Le navigateur mémorise LUI AUSSI une position de défilement par entrée, et
     la restaure sur `history.back()` — après notre propre restauration, donc
     par-dessus. C'est ce qui renvoyait en haut de page tout retour passant par
     l'historique, en écrasant `memDefil`. L'app tient déjà ce registre, et le
     tient mieux (par liste et par identité) : on reprend la main.
     À poser avant la première entrée, sinon la première est déjà en « auto ». */
  try{ if('scrollRestoration' in history) history.scrollRestoration = 'manual'; }catch(e){}
  pileHisto = [{ view: view, params: params }];
  iHisto = 0;
  try{ history.replaceState(etatHisto(view, params, 0), '', routeVersFragment(view, params) || (location.pathname + location.search)); }
  catch(e){ /* rien de vital : seule la barre d'adresse serait en retard */ }
}

/* REMPLACER OU EMPILER — la question centrale de C2.
   Un écran qui se SUBSTITUE au précédent remplace son entrée ; un écran où l'on
   DESCEND en pousse une nouvelle. Le document proposait de trancher sur
   `DEPTH`, mais `DEPTH` est trop grossier : `rangee`, `preview`, `show` et
   `movie` valent tous 1, alors qu'ouvrir une fiche depuis une rangée dépliée
   est une descente et qu'ajouter une série depuis un aperçu est une
   substitution. On l'écrit donc explicitement, cas par cas.

   Deux substitutions, pas une de plus :
   · onglet du bas → onglet du bas. Sinon dix allers-retours entre Découvrir et
     Mon profil créent dix entrées et le retour devient un labyrinthe.
   · aperçu → fiche du même titre. Ajouter une série remplace l'aperçu par sa
     fiche ; empiler renverrait le retour sur l'aperçu d'un titre qu'on vient
     de quitter, où il n'y a plus rien à faire.
   Tout le reste empile. En cas de doute, empiler : le pire d'une entrée en
   trop est un appui de retour supplémentaire ; le pire d'une entrée manquante
   est un écran qu'on ne peut plus atteindre en revenant. */
function substitue(avant, apres){
  if(ONGLETS_BARRE.indexOf(avant) >= 0 && ONGLETS_BARRE.indexOf(apres) >= 0) return true;
  if(avant === 'preview' && (apres === 'show' || apres === 'movie')) return true;
  return false;
}

function inscrireHistorique(v, p, remplacer){
  const frag = routeVersFragment(v, p);
  /* Un écran non partageable ne met pas d'adresse dans la barre — mais il a
     bien une entrée d'historique, sinon le retour le sauterait. On garde alors
     l'adresse courante. */
  const url = frag || (location.pathname + location.search);
  const etat = { view: v, params: p || {} };
  if(remplacer){
    pileHisto[iHisto] = etat;
  }else{
    iHisto++;
    pileHisto.length = iHisto;               // une nouvelle branche efface la marche avant
    pileHisto.push(etat);
  }
  try{
    if(remplacer) history.replaceState(etatHisto(v, p, iHisto), '', url);
    else history.pushState(etatHisto(v, p, iHisto), '', url);
  }catch(e){
    /* Safari limite le nombre de pushState par intervalle (~100 / 30 s). Si ça
       refuse, on continue : la navigation interne marche, seule la barre
       d'adresse est en retard. Le miroir, lui, reste juste. */
  }
}

function go(v, p, dir, opts){
  opts = opts || {};
  if(view===v && JSON.stringify(params)===JSON.stringify(p||{})){ window.scrollTo(0,0); render(); return; }
  const ancienneVue = view;
  if(LISTES[view]) memDefil[cleDefil(view)] = window.scrollY || 0;
  memoriserRails();
  /* En revenant sur Découvrir sans recherche en cours, le champ se referme :
     on retrouve l'écran de suggestions net. Une recherche en cours, elle, survit. */
  /* E2 — il n'y a plus de champ à refermer : il est toujours à l'écran. Une
     recherche en cours survit toujours à un aller-retour, c'est `ui.searchQ`
     qui la porte et personne n'y touche ici. */
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

  /* L'historique s'écrit APRÈS le rendu, et sur `view` plutôt que sur `v` :
     `render()` renvoie sur la porte d'entrée quand la session est fermée
     (`porteFermee`), et c'est cet écran-là qui doit entrer dans l'historique,
     pas celui qu'on avait demandé.
     `depuisHistorique` : l'appel vient de `popstate`, l'entrée existe déjà —
     en pousser une autre empilerait un cran à chaque retour et l'historique ne
     se viderait jamais. C'est le piège n°1 du lot. */
  if(!opts.depuisHistorique && iHisto >= 0){
    inscrireHistorique(view, params, opts.remplacer || substitue(ancienneVue, view));
  }
}

/* Une liste qui repart de zéro (nouvelle recherche, filtre changé) oublie sa position. */
function oublierDefil(v){ delete memDefil[cleDefil(v)]; }

/* C4.3 — la position HORIZONTALE des rails.
   `memDefil` ne gardait que `window.scrollY` : aucun conteneur à défilement
   horizontal ne retenait sa position. Conséquences observées : ajouter un film
   depuis le carrousel le ramenait à la première diapositive, cocher un épisode
   remettait « À rattraper » au début, et toute action sur Découvrir remettait
   toutes les rangées à zéro.
   Les rails sont repérés par `data-rail`, posé sur le conteneur, et indexés par
   la clé de l'écran — deux rangées dépliées ne partagent pas leur position.
   F2 (repeindre au lieu de tout reconstruire) rendra ceci partiellement inutile
   sur les chemins qu'il couvre ; ça vaut quand même pour tous les autres. */
function memoriserRails(){
  document.querySelectorAll('[data-rail]').forEach(el=>{
    memDefil['rail:'+cleDefil(view)+':'+el.dataset.rail] = el.scrollLeft;
  });
}
function restaurerRails(){
  document.querySelectorAll('[data-rail]').forEach(el=>{
    const x = memDefil['rail:'+cleDefil(view)+':'+el.dataset.rail];
    if(x) el.scrollLeft = x;
  });
}
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
  if(view==='rangee') return params.from || 'discover';
  if(view==='biblio') return params.from || 'abos';
  if(view==='notifs') return params.from || 'settings';
  if(view==='clochettes') return params.from || 'notifs';
  /* D3 — la branche `from === 'compte'` a disparu avec l'inscription en trois
     écrans : ces deux-là ne s'ouvrent plus que depuis les Réglages, la feuille
     de filtres ou la carte d'invitation, et ont donc toujours un retour. */
  if(view==='gouts') return params.from || 'settings';
  if(view==='plates') return params.from || 'settings';
  return null;
}
function goBack(){
  /* Le lecteur vidéo passe avant tout le reste : le geste de retour le ferme
     au lieu de quitter la fiche qui est dessous. */
  if(typeof lecteurOuvert === 'function' && lecteurOuvert()) return fermerBande();
  if(document.getElementById('sheet').classList.contains('show')) return closeSheet();
  const t = cibleRetour();
  if(!t) return;
  /* Un deuxième appui pendant que l'écran glisse encore ne doit pas lancer
     un second retour par-dessus le premier. */
  if(typeof glisseRetour !== 'undefined'){
    if(glisseRetour.enCours()) return;
    /* La flèche joue exactement le même mouvement que le doigt : l'app garde
       un seul langage pour revenir en arrière. Le geste se charge lui-même de
       reculer dans l'historique, à la fin de l'animation. */
    if(glisseRetour.jouer()) return;
  }
  reculer();
}

/* Reculer d'un cran, sans animation. Une seule mécanique pour la flèche, le
   geste et le bouton matériel : l'historique. */
function reculer(){
  if(historiqueInterne() > 0 && miroirJuste()) return history.back();
  /* Rien derrière : on est entré directement sur cet écran. On remplace
     l'entrée courante plutôt que d'en empiler une, sinon le retour suivant
     ramènerait ici. */
  const t = currentBack();
  if(t) go(t, paramsRetour(t), 'back', { remplacer:true });
}

window.addEventListener('popstate', function(e){
  /* Le lecteur et la feuille modale passent avant : sur iOS comme sur Android,
     le geste de retour doit d'abord les fermer. Ils ne sont pas dans
     l'historique, alors on repousse l'entrée qu'on vient de consommer.
     Motif retenu pour cette livraison ; les mettre DANS l'historique serait
     plus juste mais toucherait `openSheet`, `closeSheet`, `ouvrirBande`,
     `fermerBande` et tous leurs appelants — noté comme amélioration. */
  /* En repoussant l'entrée consommée, on REMET AUSSI l'adresse de l'écran
     courant. `location.href` porte déjà celle de l'entrée précédente — le
     navigateur l'a changée avant de nous prévenir — et la repousser telle
     quelle laissait la barre d'adresse en désaccord avec l'écran. Pire :
     `history.back()` déclenche `popstate` PUIS `hashchange`, et l'écouteur de
     `hashchange` (C3) voyait alors un fragment étranger à l'écran affiché et
     renaviguait par-dessus. Les deux écouteurs se marchaient dessus. */
  const adresseCourante = ()=> routeVersFragment(view, params) || (location.pathname + location.search);
  if(typeof lecteurOuvert === 'function' && lecteurOuvert()){
    fermerBande();
    try{ history.pushState(etatHisto(view, params, iHisto), '', adresseCourante()); }catch(err){}
    return;
  }
  const feuille = document.getElementById('sheet');
  if(feuille && feuille.classList.contains('show')){
    closeSheet();
    try{ history.pushState(etatHisto(view, params, iHisto), '', adresseCourante()); }catch(err){}
    return;
  }
  /* Retour déjà rendu par le geste de glissement : l'écran est le bon, il ne
     reste qu'à laisser l'historique se replacer. */
  if(popstateAAvaler > 0){
    popstateAAvaler--;
    const st0 = e.state;
    if(st0 && st0.msv) iHisto = st0.i;
    return;
  }
  const st = e.state;
  if(st && st.msv){
    const sens = st.i < iHisto ? 'back' : 'enter';
    iHisto = st.i;
    go(st.view, st.params, sens, { depuisHistorique:true });
    return;
  }
  /* Pas d'état : entrée poussée par un tiers, ou tout premier chargement. On
     ne devine pas — on reste où on est et on réinscrit notre entrée, plutôt
     que de renvoyer l'utilisateur sur un écran qu'il n'a pas demandé.
     C3 lira le fragment ici. */
  try{ history.replaceState(etatHisto(view, params, iHisto), '', location.href); }catch(err){}
});
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
  let couche = null, voile = null, cible = null, cibleParams = {}, largeur = 0, frame = 0, d = 0, fini = false;

  const app = ()=> document.getElementById('app');
  const enCours = ()=> !!couche;

  /* Prépare la couche du dessous avec l'écran d'arrivée. */
  function preparer(){
    /* La destination vient de l'historique, pas de `currentBack()` : c'est ce
       qui garantit que l'écran dessiné sous le doigt est bien celui où le
       relâchement va mener. `currentBack()` déduisait la cible de `params.from`,
       qui peut désigner un autre écran que celui d'où l'on vient réellement. */
    const dest = cibleRetour();
    if(!dest || couche) return false;
    cible = dest;
    cibleParams = paramsCibleRetour() || {};
    largeur = window.innerWidth || 375;

    couche = document.createElement('div');
    couche.className = 'souscran';
    /* Le même habillage que l'écran normal, sinon la mise en page ne suit pas. */
    couche.innerHTML = '<div class="app">'+htmlDeLaVue(dest, cibleParams)+'</div>';
    voile = document.createElement('div');
    voile.className = 'sousvoile';

    const el = app();
    /* Après #app dans le document, pas avant : les identifiants sont en double
       le temps du geste, et tout le code doit continuer à trouver l'écran réel.
       L'empilement, lui, est donné par les z-index. */
    el.insertAdjacentElement('afterend', couche);
    couche.insertAdjacentElement('afterend', voile);
    /* Même position de lecture que si on y était resté. Les paramètres de
       l'écran d'arrivée doivent venir de SA mémoire, pas de l'écran courant :
       `cleDefil(dest)` seul lisait les paramètres de la fiche qu'on quitte,
       la clé devenait « rangee: » au lieu de « rangee:film », et la grille
       dépliée se montrait en haut pendant le geste avant de sauter à la bonne
       position au relâchement. C'est aussi ce qui obligeait `cleDefil` à se
       replier sur `ui.acteurId` pour les filmographies. */
    const y = LISTES[dest] ? (memDefil[cleDefil(dest, cibleParams)] || 0) : 0;
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
    /* L'écran est rendu TOUT DE SUITE : la couche du dessous est retirée juste
       après, et attendre le `popstate` — qui arrive au tour de boucle suivant —
       laisserait voir un éclair de l'écran qu'on vient de quitter.
       On rend donc à la main, sans écrire l'historique, puis on recule pour de
       vrai ; le `popstate` qui en découle n'a plus rien à faire et se fait
       avaler. C'est la seule entorse au principe « l'historique fait foi », et
       elle est là pour l'image, pas pour la logique. */
    const recule = historiqueInterne() > 0 && miroirJuste();
    if(recule) popstateAAvaler++;
    go(cible, cibleParams, 'back', recule ? { depuisHistorique:true } : { remplacer:true });
    if(recule) history.back();
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
const RAILS = '.rangee, .cast, .rattrap, .filmrow, .chips, .souschips, .seasonpill, .aborow, .carr';

(function swipeBack(){
  const SEUIL = 60;
  let x0=null, y0=null, t0=0, actif=false;

  let surVideo = false;   // le geste a commencé pendant qu'une vidéo jouait

  document.addEventListener('touchstart', e=>{
    const t = e.touches[0];
    actif = false;
    surVideo = typeof lecteurOuvert === 'function' && lecteurOuvert();
    /* C4.2 — TOUS les rails horizontaux ont `padding-left: 16px`, donc leur
       premier élément commence DANS la zone d'armement du geste de retour.
       Ramener un rail vers la droite depuis sa portion gauche déclenchait le
       glissement de page en même temps que le défilement du rail : les
       écouteurs sont `{passive:true}`, les deux mouvements jouaient ensemble.
       Le défaut ne se voyait pas sur Découvrir, qui n'a pas de cible de retour.
       La liste comprend `.souschips` et `.carr`, que le document oubliait.
       DETTE : elle est à tenir à jour à la main ; un attribut `data-rail` sur
       les conteneurs serait plus sûr — c'est ce que fait C4.3, à terme les deux
       se rejoindront. */
    if(t.target && t.target.closest && t.target.closest(RAILS)){ x0=null; return; }
    if(t.clientX <= 28 && (surVideo || cibleRetour()) &&
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
