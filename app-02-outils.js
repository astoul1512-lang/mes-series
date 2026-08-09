"use strict";
/* ============================ Utilitaires ============================ */
/* `toISOString` est une des opérations les plus chères du moteur, et `aired` en
   demandait une PAR ÉPISODE testé : 7 040 appels pour une seule passe sur la
   bibliothèque d'Adrien, tous rendant la même chaîne. On garde la journée en
   mémoire trente secondes — le passage de minuit est rattrapé au pire une
   demi-minute plus tard, sur un écran qui se recalcule de toute façon.
   Revue de stabilité du 02/08, constat A2-3. */
let _jourISO = null, _jourISOts = 0;
const todayISO = ()=>{
  const n = Date.now();
  if(!_jourISO || n - _jourISOts > 30000){ _jourISO = new Date(n).toISOString().slice(0,10); _jourISOts = n; }
  return _jourISO;
};
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
/* F3 — `allEpisodes` alloue un objet par épisode, et les écrans l'appellent
   sept à onze fois par série et par rendu (mesuré le 31/07 sur une base de
   103 séries et 9 436 épisodes : 66 000 objets pour « En cours », 103 000 pour
   « Mon profil », à CHAQUE tap). D'où ce cache.

   L'invalidation est le seul endroit qui compte, alors elle est verrouillée
   par trois choses à la fois, et il faut qu'elles soient toutes d'accord :

     · l'identité de l'objet `seasons` — la fusion distante (`normaliserSerie`)
       et le rechargement TMDB (`fetchShow`) en produisent un neuf ;
     · l'empreinte des tailles — elle attrape un épisode ajouté ou retiré à
       l'intérieur d'une saison déjà connue ; elle coûte un tour de boucle par
       saison, soit une dizaine, pas par épisode ;
     · `updated` — il change à chaque modification de la série.

   Sous-invalider, c'est servir une liste périmée : un épisode neuf resterait
   invisible jusqu'au rechargement de l'app. Sur-invalider ne coûte qu'un
   recalcul. Le doute penche donc toujours du même côté.

   Ce que le cache ne surveille PAS, volontairement : `watched`. La liste des
   épisodes ne dépend pas de ceux qui sont vus — cocher n'a rien à invalider. */
const cacheEpisodes = new Map();
/* Au-delà de deux entrées par série, c'est qu'on garde des séries retirées.
   On vide plutôt que de tenir une comptabilité : le recalcul suivant coûte un
   rendu, la comptabilité coûterait un point d'accroche dans chaque suppression. */
const CACHE_EPISODES_MAX = 400;
function empreinteSaisons(sa){
  let t = '';
  for(const n in sa) t += n + ':' + ((sa[n] && sa[n].length) || 0) + ',';
  return t;
}
function oublierEpisodes(id){
  cacheEpisodes.delete(id + '|0');
  cacheEpisodes.delete(id + '|1');
}
function allEpisodes(show, withSpecials){
  const sa = show.seasons || {};
  const cle = show.id + '|' + (withSpecials ? 1 : 0);
  const marque = show.updated || 0;
  const taille = empreinteSaisons(sa);
  const e = cacheEpisodes.get(cle);
  if(e && e.saisons === sa && e.marque === marque && e.taille === taille) return e.liste;
  const out = [];
  seasonNums(show, withSpecials).forEach(s=>{
    (sa[s]||[]).forEach(ep=> out.push(Object.assign({}, ep, {s:s})));
  });
  if(cacheEpisodes.size >= CACHE_EPISODES_MAX) cacheEpisodes.clear();
  cacheEpisodes.set(cle, { saisons:sa, marque:marque, taille:taille, liste:out });
  return out;
}
/* F3 (2/2) — le mémo d'un rendu.

   Mémoïser `allEpisodes` n'a presque rien rendu : mesuré le 31/07, la liste ne
   pesait que 2 à 3 % du rendu. Le coût était dans ce que les appelants font de
   cette liste — `progress` la reparcourt entièrement, en construisant une clé
   de chaîne par épisode, et elle est appelée 4 fois par série sur « En cours »
   et 10 fois sur « Mon profil ». Sur 103 séries : 43 ms sur 48, et 99 ms
   sur 111.

   La difficulté d'un cache sur `progress`, c'est qu'il dépend de `watched`, et
   qu'on n'a aucun repère fiable et bon marché pour savoir si `watched` a
   changé — `Object.keys(watched).length` alloue un tableau de plusieurs
   milliers de chaînes, ce qui coûterait ce qu'on essaie d'économiser.

   D'où le choix : le mémo ne vit QUE pendant un rendu. Pendant un rendu, rien
   ne modifie la base — c'est une construction de chaîne, de bout en bout
   synchrone. Hors rendu, `memo` s'efface devant le calcul réel : le
   comportement est alors exactement celui d'avant, à l'octet près. Il n'y a
   donc aucune fenêtre où une valeur périmée puisse être servie.

   Résultat mesuré le 31/07, même base et même graine, médiane de neuf passes :
   « En cours » 48,4 ms -> 14,5 ms, « Mon profil » 116,1 ms -> 14,3 ms. Le
   nombre d'appels à `allEpisodes` tombe de 7 à 4 par série sur le premier
   écran, de 11 à 2 sur le second. Le fichier `mesure-lot-f.js` de l'atelier
   rejoue la mesure à l'identique.

   Le compteur de profondeur, plutôt qu'un booléen : `htmlDeLaVue` peut être
   appelée à l'intérieur d'un rendu (le geste de retour prépare l'écran de
   destination), et un booléen remis à faux par le rendu imbriqué éteindrait le
   mémo du rendu principal pour tout le reste de son parcours. */
let profondeurRendu = 0;
const memoRendu = new Map();
/* Le vidage à l'entrée fait doublon avec celui de la sortie, et aucun test ne
   peut le prendre en défaut : `sortirRendu` est appelée depuis un `finally`,
   donc la table est toujours déjà vide ici. Il reste quand même, comme filet
   pour le jour où quelqu'un ajoutera un appel à `entrerRendu` ailleurs. C'est
   dit ici pour qu'on ne cherche pas le test qui le protège : il n'y en a pas,
   et le mutation testing du 31/07 le confirme. */
function entrerRendu(){ if(profondeurRendu === 0) memoRendu.clear(); profondeurRendu++; }
function sortirRendu(){
  if(profondeurRendu > 0) profondeurRendu--;
  if(profondeurRendu === 0) memoRendu.clear();
}
/* ===== Les verrous d'action, un par ressource =====
   `occupe` répond « cette action-là est déjà en cours ». `prendre` pose le
   verrou et rend faux s'il était déjà posé — donc `if(!prendre(cle)) return;`
   remplace exactement l'ancien `if(ui.busy) return; ui.busy = true;`.
   `rendre` le relâche, et doit être appelé sur TOUS les chemins de sortie.
   Revue de stabilité du 02/08, constat A3-2. */
function occupe(cle){ return !!(ui && ui.busy && ui.busy[cle]); }
function prendre(cle){
  if(!ui.busy || typeof ui.busy !== 'object') ui.busy = {};
  if(ui.busy[cle]) return false;
  ui.busy[cle] = 1;
  return true;
}
function rendre(cle){ if(ui.busy && typeof ui.busy === 'object') delete ui.busy[cle]; }

function memo(cle, calcul){
  if(!profondeurRendu) return calcul();
  if(memoRendu.has(cle)) return memoRendu.get(cle);
  const r = calcul();
  memoRendu.set(cle, r);
  return r;
}

function progress(show){
  return memo('p'+show.id, ()=>{
    const eps = allEpisodes(show,false).filter(aired);
    const w = eps.filter(ep => show.watched[key(ep.s,ep.e)]).length;
    return { watched:w, total:eps.length, pct: eps.length ? Math.round(w/eps.length*100) : 0 };
  });
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
  return memo('n'+show.id, ()=>{
    const eps = allEpisodes(show,false);
    for(const ep of eps){
      if(show.watched[key(ep.s,ep.e)]) continue;   // déjà vu : on passe
      if(!ep.d) continue;                          // lacune TMDB : on saute, on ne s'arrête pas
      if(ep.d > todayISO()) break;                 // vraiment à venir : plus rien à rattraper
      return ep;
    }
    return null;
  });
}
function isFinished(show){
  return memo('f'+show.id, ()=>{
    const p = progress(show);
    const ended = show.status==='Ended' || show.status==='Canceled';
    return p.total>0 && p.watched===p.total && ended && !show.next;
  });
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
  return memo('s'+s.id, ()=>{
    if(progress(s).watched === 0) return 'avoir';
    if(isFinished(s)) return 'vu';
    return 'asuivre';
  });
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

/* `pressee` : l'image n'est PAS sous la ligne de flottaison, elle EST l'écran.
   `loading="lazy"` est juste pour une vignette de rangée et faux pour la carte
   du jeu, qui occupe toute la hauteur visible : le navigateur avait le droit de
   retarder sa demande, et c'est une des trois causes du clignotement du
   point 7. Le duel de Mes goûts avait déjà sa propre balise sans différé — la
   bonne règle existait dans le dépôt, elle n'était simplement pas appliquée
   ici. Le défaut reste inchangé pour les quinze autres appels. */
function posterEl(path, size, cls, alt, pressee){
  const src = srcImage(path, size);
  if(src) return '<img class="poster '+(cls||'')+'"'+
    /* C9 — REVUE DU 07/08 : `decoding="async"` partout, pas seulement sur la
       carte pressée. Sans lui, le décodage d'une affiche peut tomber sur le fil
       de l'écran, pendant le geste — la règle existait déjà ici même, elle
       n'était appliquée qu'à une branche. */
    (pressee ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"')+
    ' onerror="posterFail(this)" src="'+src+'" alt="'+esc(alt||'')+'">';
  return '<div class="poster ph '+(cls||'')+'">'+esc((alt||'?').slice(0,18))+'</div>';
}
/* Demander une image AVANT d'en avoir besoin. Rien à l'écran, rien à nettoyer :
   le navigateur la met dans son cache HTTP et la balise qui la réclamera plus
   tard l'aura tout de suite. Sert au jeu de Recherche, où l'affiche EST l'écran
   et où son arrivée tardive se voit (point 7). */
const dejaPrechargees = {};
function precharger(src){
  if(!src || dejaPrechargees[src]) return;
  dejaPrechargees[src] = 1;
  try{ const i = new Image(); i.decoding = 'async'; i.src = src; }catch(e){}
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
/* Le toast et les deux barres du bas se disputent le même emplacement, et le
   toast a le z-index le plus fort : il recouvre ce qu'il annonce. Quand une
   barre prend la parole au même endroit, elle le fait taire. */
function cacherToast(){
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  if(t) t.classList.remove('show');
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
  /* C3 : la garde ne se pose qu'à l'OUVERTURE — un panneau redessiné à chaque
     puce touchée ne doit pas empiler une entrée par puce. */
  if(!deja) poserGarde('feuille');
}
/* ===========================================================================
   C3 — REVUE DU 07/08 : LES GARDES D'HISTORIQUE.
   Un état plein écran qui n'est pas une vue (feuille de filtres, jeu de
   Recherche, recherche plein écran du profil) pose une « entrée-garde » dans
   l'historique du navigateur à son ouverture. Sans elle, sur un onglet de la
   barre du bas — où les onglets se REMPLACENT au lieu de s'empiler — il n'y a
   AUCUNE entrée derrière : le bouton retour du téléphone quittait l'app avec
   la feuille ouverte, et toute la recherche composée était perdue (reproduit
   par la revue, constat C3).
   L'entrée-garde décrit l'écran COURANT : consommée par le bouton du
   téléphone, l'écouteur `popstate` ferme l'état ouvert et l'historique est
   déjà retombé au bon endroit ; retirée par une fermeture DANS l'app
   (`retirerGarde` → `history.back()`), le `popstate` qui s'ensuit décrit
   l'écran affiché et la garde « même écran » l'absorbe sans rien rendre.
   Le miroir (`pileHisto`, `iHisto`) n'avance PAS : une garde n'est pas une
   navigation, et les gestes de retour restent bloqués tant que l'état est
   ouvert — comme avant.
   Une navigation volontaire pendant qu'une garde est posée la rend orpheline :
   `go()` l'oublie simplement (`gardesHisto[nom] = false`) ; l'entrée restante
   décrit un écran réel et sera remplacée par la prochaine substitution ou
   absorbée par la garde « même écran » — au pire, un appui retour de plus,
   jamais une sortie d'app ni un écran faux. */
const gardesHisto = {};
function poserGarde(nom){
  if(gardesHisto[nom]) return;
  try{
    history.pushState(etatHisto(view, params, iHisto), '',
      routeVersFragment(view, params) || (location.pathname + location.search));
    gardesHisto[nom] = true;
  }catch(e){}
}
function consommerGarde(nom){
  if(!gardesHisto[nom]) return false;
  gardesHisto[nom] = false;
  return true;
}
function retirerGarde(nom){
  if(!gardesHisto[nom]) return;
  gardesHisto[nom] = false;
  try{ history.back(); }catch(e){}
}

function closeSheet(){
  const s = document.getElementById('sheet');
  s.classList.remove('show');
  retirerGarde('feuille');   // C3 : fermée dans l'app → l'entrée-garde s'en va aussi
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

/* ---------------------------------------------------------------------------
   C2 (09/08) — UNE QUESTION DONT LA RÉPONSE SE LIT DANS LE CODE

   Les feuilles existantes posent leurs questions en branchant deux `onclick`
   sur deux fonctions nommées, et la suite du travail vit dans ces fonctions.
   Ça marche partout ici — sauf quand la question tombe AU MILIEU d'une
   opération asynchrone qu'il faut reprendre après la réponse : c'est le cas de
   l'effacement d'une bibliothèque au changement de compte (C2), posé en plein
   `applySession`. Il faut pouvoir écrire `if(await confirmerDansFeuille(…))`.

   `confirm()` du navigateur est exclu : il s'affiche hors du style de l'app,
   une PWA installée peut l'escamoter, et le projet ne s'en sert nulle part.

   QUATRE FAÇONS DE RÉPONDRE NON, UNE SEULE DE RÉPONDRE OUI. Le bouton
   « Annuler », l'appui sur le fond, le bouton retour du téléphone et le geste
   de tiroir valent tous NON : on ne détruit rien sur un geste flou. Le rappel
   de fermeture (`FERMETURES`) les attrape tous les quatre d'un coup, puisque
   les quatre passent par `closeSheet`.
--------------------------------------------------------------------------- */
let reponseFeuille = null;
function confirmerDansFeuille(titre, texte, libelleOui, libelleNon){
  /* Une question déjà en attente reçoit un NON avant que la suivante s'ouvre :
     deux promesses sur la même feuille, et la première ne se dénouerait
     jamais — l'appel qui l'attend resterait bloqué pour de bon. */
  if(reponseFeuille) repondreFeuille(false);
  return new Promise(res=>{
    reponseFeuille = res;
    FERMETURES['confirmation'] = ()=> repondreFeuille(false);
    openSheet('<h3>'+esc(titre)+'</h3>'+
      '<p class="small muted" style="margin:0 0 14px">'+esc(texte)+'</p>'+
      '<button class="opt danger" onclick="repondreFeuille(true)">'+esc(libelleOui)+'</button>'+
      '<button class="opt" onclick="repondreFeuille(false)">'+esc(libelleNon)+'</button>',
      'confirmation');
  });
}
function repondreFeuille(oui){
  const res = reponseFeuille;
  /* Vidés AVANT de refermer : `closeSheet` rejoue le rappel de fermeture, qui
     rappelle cette fonction. Sans ce garde-fou on répondrait deux fois — la
     seconde sur une promesse déjà dénouée, donc en silence, ce qui est
     exactement le genre de silence qui se paye plus tard. */
  reponseFeuille = null;
  FERMETURES['confirmation'] = null;
  if(!res) return;
  closeSheet();
  res(!!oui);
}

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
           /* `busy` était UN booléen pour quatre écrans : lancer l'ajout d'une
              série depuis un aperçu, quitter l'écran, puis toucher « Ajouter »
              ailleurs ne faisait RIEN — pas de toast, pas de rond, pendant
              jusqu'à quinze secondes. C'est maintenant un verrou PAR RESSOURCE,
              posé et rendu par `prendre`/`rendre` ci-dessous.
              Revue de stabilité du 02/08, constat A3-2. */
           openSeasons:{}, busy:{},
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
/* C2 — REVUE DU 07/08 : les fiches aussi retiennent leur position, mais avec
   une règle plus fine que les listes : la position n'est rendue QU'AU RETOUR
   (flèche, balayage, bouton du téléphone). Une fiche OUVERTE — depuis une
   liste, une recherche, une notification — part toujours du haut, et sa
   mémoire d'avant est oubliée à cet instant. Avant ce correctif, descendre
   dans une fiche longue, ouvrir un acteur et revenir remettait la fiche tout
   en haut (reproduit par `tests/phase2.js`) — le reproche exact d'Adrien,
   version fiches. */
const FICHES = { show:1, movie:1, preview:1 };
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
  /* C7/C2 — REVUE DU 07/08 : les fiches aussi ont chacune leur position. La
     clé nue `show` était PARTAGÉE par toutes les séries : le casting défilé de
     la fiche B s'appliquait à la fiche A rouverte ensuite (reproduit par
     `tests/phase2.js`). Même règle que `biblio` et `acteur`, trois lignes
     plus haut. */
  if(v === 'show' || v === 'movie' || v === 'preview') return v+':'+(q.id||'');
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
/* Voir le commentaire dans `go()`. Rempli à chaque navigation, lu par les
   écrans qui doivent distinguer une ouverture d'un retour. */
let dernierGo = { vue:null, dir:'none', historique:false };
/* « Est-on ARRIVÉ sur cet écran, ou y REVIENT-on ? » Un retour, c'est un `dir`
   à `back` ou un appel venu de l'historique. Tout le reste est une arrivée. */
function arriveeNeuve(vue){
  return !(dernierGo.vue === vue && (dernierGo.dir === 'back' || dernierGo.historique));
}
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
/* POINT 4C DU CYCLE 3 — LE COMPTEUR `popstateAAvaler` A ÉTÉ SUPPRIMÉ.
   Il avalait le `popstate` découlant de notre propre `history.back()` après un
   rendu manuel, borné par un garde-fou d'une seconde — UN PARI SUR LE TEMPS.
   Pari perdu de temps en temps : un `popstate` tardif était rejoué comme un
   vrai retour (l'écran remontait en haut de page et se redessinait), ou un
   vrai retour ultérieur était avalé (un écran sautait). Reproduit par
   `tests/nav-cycle3.js` avant correction.
   Le retour du geste passe désormais par l'historique ET PAR LUI SEUL : voir
   `poser()` (le rendu attend le `popstate`) et, dans l'écouteur `popstate`, la
   garde « même écran » qui absorbe sans re-rendre un événement décrivant
   l'écran déjà affiché. */

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
    setTimeout(()=>{ if(typeof loadPreview === 'function') loadPreview(par.id, par.type); }, 0);
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
  if(!opts.depuisHistorique){
    /* C4 : une navigation volontaire désarme un retour encore en vol — le
       secours de 900 ms ne rendra pas l'écran de départ par-dessus le sien. */
    if(typeof glisseRetour === 'object' && glisseRetour && glisseRetour.abandonnerAttente)
      glisseRetour.abandonnerAttente();
    /* C3 : et rend orphelines les entrées-gardes encore posées — voir le
       commentaire des gardes, plus haut. */
    for(const k in gardesHisto) gardesHisto[k] = false;
  }
  if(view===v && JSON.stringify(params)===JSON.stringify(p||{})){
    /* Réappuyer sur l'onglet où l'on est déjà remonte en haut : c'est voulu.
       POINT 4 DU CYCLE 3 — mais quand l'appel vient de l'HISTORIQUE (un
       `popstate` qui décrit l'écran déjà affiché), remonter en haut perdrait
       la position sans qu'aucun geste ne l'ait demandé. */
    if(!opts.depuisHistorique) window.scrollTo(0,0);
    render(); return;
  }
  const ancienneVue = view;
  if(LISTES[view] || FICHES[view]) memDefil[cleDefil(view)] = window.scrollY || 0;
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
  /* LOT A — le duel n'est pas une vue à lui : il occupe l'écran de Mes goûts.
     Quitter cet écran par n'importe quel chemin — un onglet du bas, un lien,
     une notification — doit donc ranger la session, sinon `duel.actif` reste
     vrai partout ailleurs et confisque le retour dans toute l'app. */
  if(typeof duel !== 'undefined' && duel && duel.actif && view === 'gouts' && v !== 'gouts')
    oublierDuel();
  /* Trois ressources d'écran survivaient à un changement d'onglet et suivaient
     l'utilisateur ailleurs. Elles sont rangées ici, au même endroit que le duel,
     pour qu'il n'y ait qu'UN point de fermeture d'écran dans l'app.
     Revue de stabilité du 02/08, constats A3-3 et A3-6. */
  /* La barre « Tu as aimé ? » restait 12 secondes, par-dessus l'écran d'arrivée,
     et répondre écrivait un avis sur un titre qui n'était plus nulle part. */
  if(typeof fermerAvis === 'function' && typeof avisAffiche !== 'undefined' && avisAffiche)
    fermerAvis();
  /* Le minuteur de frappe de Recherche partait après coup, et sa requête
     n'était jamais abandonnée : elle retardait celles de l'écran d'arrivée. */
  if(view === 'search' && v !== 'search' && typeof avorterRech === 'function'){
    if(typeof rechTimer !== 'undefined') clearTimeout(rechTimer);
    avorterRech();
  }
  /* ===== POINT 8 — DE QUOI UN ÉCRAN PEUT SAVOIR S'IL EST « OUVERT » OU « REVENU »
     Le dernier `go()`, réduit à ce qui distingue une ouverture d'un retour.
     Générique volontairement : `go()` n'a pas à connaître les écrans, et un
     écran n'a pas à deviner d'où il vient en fouillant l'historique.
     `historique` : l'appel vient de `popstate`. `dir === 'back'` : la flèche de
     l'app, le geste de glissement, ou le bouton matériel. Les QUATRE chemins de
     retour passent par l'un ou l'autre — c'est ce qui rend le discriminant
     complet, là où le marqueur posé dans `params` se perdait sur certains. */
  dernierGo = { vue: v, dir: navDir, historique: !!opts.depuisHistorique };
  view = v; params = p||{};
  if(typeof hideUndo === 'function') hideUndo();
  railsDejaReleves = true;   // C7 : le relevé juste est fait plus haut, sur l'écran quitté
  render();
  const app = document.getElementById('app');
  app.classList.remove('tabg-d', 'tabg-g');
  if(navDir === 'none' && deTab >= 0 && versTab >= 0 && deTab !== versTab){
    void app.offsetWidth;                    // repart de zéro si on enchaîne vite
    app.classList.add(versTab > deTab ? 'tabg-d' : 'tabg-g');
  }
  /* C2 — une liste restaure toujours ; une fiche ne restaure qu'au retour, et
     une ouverture neuve efface sa mémoire pour que la position d'une visite
     passée ne resurgisse pas plus tard. */
  const revient = navDir === 'back' || !!opts.depuisHistorique;
  const y = (LISTES[v] || (FICHES[v] && revient)) ? (memDefil[cleDefil(v, p)] || 0) : 0;
  if(FICHES[v] && !revient) oublierDefil(v);
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
/* C7 — REVUE DU 07/08 : pendant une navigation, `go()` relève les rails AVANT
   de changer `view` (clé juste), puis `render()` les relevait UNE SECONDE FOIS
   — mais à ce moment-là `view` porte déjà l'écran d'arrivée alors que le DOM
   montre encore l'écran quitté. Résultat : le défilement du casting d'une
   fiche s'écrivait sous la clé d'une autre, et la rangée s'ouvrait « au
   milieu » sans raison (reproduit par `tests/phase2.js`). `go()` lève ce
   drapeau juste avant `render()` ; le relevé de trop se saute et le consomme.
   Les redessins SANS navigation (cocher un épisode, ajouter un film) — ceux
   pour lesquels C4.3 existe — gardent leur relevé, drapeau baissé. */
let railsDejaReleves = false;
function memoriserRails(){
  if(railsDejaReleves){ railsDejaReleves = false; return; }
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
  /* LOT A — le duel occupe tout l'écran de Mes goûts sans être une vue à lui :
     le retour doit donc le refermer avant de quitter l'écran, exactement comme
     il referme d'abord le lecteur ou un panneau. Sans ça, un geste de retour
     lancé pendant une partie faisait sortir de Mes goûts et perdait la session
     — et l'écran d'arrivée dessiné sous le doigt aurait été le mauvais. */
  if(typeof duel !== 'undefined' && duel && duel.actif) return fermerDuel();
  /* C3/S1 — REVUE DU 07/08 : le jeu de Recherche et la recherche plein écran
     du profil se ferment comme le duel, au lieu d'être ignorés (la partie ou
     la saisie se perdait, ou le geste ne faisait rien du tout). Les fermetures
     retirent elles-mêmes leur entrée-garde. */
  if(view === 'search' && typeof etatRech === 'function' && etatRech().jeu
     && typeof fermerJeuRech === 'function') return fermerJeuRech();
  if(view === 'profile' && typeof pf12 !== 'undefined' && pf12.ouvert
     && typeof fermerRechPf12 === 'function') return fermerRechPf12();
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
    /* C3 : si l'entrée consommée était la garde posée à l'ouverture,
       l'historique est déjà retombé sur l'entrée de l'écran courant — rien à
       repousser. Le rattrapage ne sert plus qu'au cas où la garde n'avait pas
       pu se poser (limite Safari). `consommerGarde` AVANT `closeSheet`, pour
       que la fermeture ne recule pas l'historique une seconde fois. */
    const garde = consommerGarde('feuille');
    closeSheet();
    if(!garde){ try{ history.pushState(etatHisto(view, params, iHisto), '', adresseCourante()); }catch(err){} }
    return;
  }
  /* LOT A — même traitement que la feuille pour le duel : le bouton matériel
     d'Android le referme au lieu de quitter Mes goûts, et on repousse l'entrée
     qu'on vient de consommer. */
  if(typeof duel !== 'undefined' && duel && duel.actif){
    fermerDuel();
    try{ history.pushState(etatHisto(view, params, iHisto), '', adresseCourante()); }catch(err){}
    return;
  }
  /* C3 — REVUE DU 07/08 : le jeu de Recherche et la recherche plein écran du
     profil reçoivent les mêmes droits que la feuille et le duel. Avant, aucun
     chemin de retour ne les connaissait : le bouton du téléphone quittait
     l'écran et la partie — ou la saisie — était perdue. */
  if(view === 'search' && typeof etatRech === 'function' && etatRech().jeu){
    const garde = consommerGarde('jeu');
    if(typeof fermerJeuRech === 'function') fermerJeuRech();
    if(!garde){ try{ history.pushState(etatHisto(view, params, iHisto), '', adresseCourante()); }catch(err){} }
    return;
  }
  if(view === 'profile' && typeof pf12 !== 'undefined' && pf12.ouvert){
    const garde = consommerGarde('pf12');
    if(typeof fermerRechPf12 === 'function') fermerRechPf12();
    if(!garde){ try{ history.pushState(etatHisto(view, params, iHisto), '', adresseCourante()); }catch(err){} }
    return;
  }
  /* POINT 4C DU CYCLE 3 — un retour de geste est en vol : ce `popstate` est le
     sien, c'est LUI qui rend l'écran d'arrivée (la couche du dessous l'affiche
     déjà, donc sans éclair). Plus de compteur à avaler, plus de pari. */
  if(typeof glisseRetour === 'object' && glisseRetour && glisseRetour.retourConsomme
     && glisseRetour.retourConsomme(e)) return;
  const st = e.state;
  /* C4 — REVUE DU 07/08 : un `popstate` retardataire — le retour différé d'un
     geste que l'utilisateur a abandonné en naviguant ailleurs — ne doit pas
     fermer l'écran qu'il vient d'ouvrir. On repousse l'entrée de l'écran
     affiché et on ne bouge pas. La garde « même écran » plus bas couvre déjà
     le cas où le retardataire décrit l'écran affiché ; ici, celui où il
     décrirait un autre écran et NAVIGUERAIT. `retardataire()` est consommé en
     dernier, pour ne pas gaspiller la fenêtre sur un cas déjà inoffensif. */
  if(st && st.msv
     && (st.view !== view || JSON.stringify(st.params || {}) !== JSON.stringify(params || {}))
     && typeof glisseRetour === 'object' && glisseRetour.retardataire && glisseRetour.retardataire()){
    try{ history.pushState(etatHisto(view, params, iHisto), '', adresseCourante()); }catch(err){}
    return;
  }
  if(st && st.msv){
    /* POINT 4C DU CYCLE 3 — LA GARDE « MÊME ÉCRAN ». Un `popstate` qui décrit
       l'écran DÉJÀ affiché n'a rien à rendre : c'est la fin de course d'un
       retour déjà rendu (le secours du geste, quand le navigateur a différé
       `history.back` au-delà du délai). On se recale sur son rang et c'est
       tout — le rejouer via `go()` re-rendait l'écran et le renvoyait en haut
       de page (reproduit par `tests/nav-cycle3.js`). Deux entrées voisines ne
       peuvent pas être identiques (`go()` refuse d'empiler l'écran courant) :
       cette garde ne peut donc pas absorber une vraie navigation. */
    if(st.view === view && JSON.stringify(st.params || {}) === JSON.stringify(params || {})){
      iHisto = st.i;
      return;
    }
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
  /* POINT 4C DU CYCLE 3 — le retour en vol : entre le relâchement du geste et
     le `popstate` qui rendra l'écran d'arrivée, la couche du dessous reste
     affichée. `attente` porte la destination, la couche à nettoyer, et un
     secours si le navigateur ne donne jamais suite. */
  let attente = null;

  const app = ()=> document.getElementById('app');
  const enCours = ()=> !!couche || !!attente;

  /* Prépare la couche du dessous avec l'écran d'arrivée. */
  function preparer(){
    /* La destination vient de l'historique, pas de `currentBack()` : c'est ce
       qui garantit que l'écran dessiné sous le doigt est bien celui où le
       relâchement va mener. `currentBack()` déduisait la cible de `params.from`,
       qui peut désigner un autre écran que celui d'où l'on vient réellement. */
    const dest = cibleRetour();
    if(!dest || couche || attente) return false;
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
  /* POINT 4C DU CYCLE 3 — LE PARI EST SUPPRIMÉ, PAS ALLONGÉ. L'ancien code
     rendait l'écran à la main, reculait ensuite dans l'historique, et armait
     un compteur (garde-fou d'une seconde) pour avaler le `popstate` à venir.
     Deux rendus possibles pour un seul retour : c'est le mécanisme commun aux
     constats B, C et D, reproduit par `tests/nav-cycle3.js`.
     Désormais, quand le retour passe par l'historique, C'EST LE `popstate` QUI
     REND — un seul chemin, un seul rendu. Pas d'éclair pour autant : la couche
     du dessous, qui montre déjà l'écran d'arrivée à la bonne position, reste
     affichée jusqu'à ce rendu (`retourConsomme`). Si le navigateur a différé
     `history.back` (page masquée), un secours rend à la main après 900 ms, et
     le `popstate` tardif est absorbé par la garde « même écran » de
     l'écouteur — sans re-rendre, sans re-défiler. */
  function nettoyerRetour(rv){
    const el = app();
    if(el){
      el.style.transform=''; el.style.opacity=''; el.style.willChange=''; el.style.transition='';
      el.classList.remove('glisse');
    }
    if(rv.couche) rv.couche.remove();
    if(rv.voile) rv.voile.remove();
  }
  /* Appelée par l'écouteur `popstate` (app-02, plus haut) : vrai si ce
     `popstate` est celui d'un retour de geste en vol — alors c'est ici qu'on
     rend l'écran d'arrivée et qu'on retire la couche. */
  function retourConsomme(e){
    if(!attente) return false;
    const rv = attente; attente = null;
    clearTimeout(rv.secours);
    const st = e && e.state;
    sansAnim = true;
    if(st && st.msv){ iHisto = st.i; go(st.view, st.params, 'back', { depuisHistorique:true }); }
    else go(rv.cible, rv.params, 'back', { depuisHistorique:true });
    nettoyerRetour(rv);
    return true;
  }
  function poser(){
    if(fini) return;
    fini = true;
    const el = app();
    if(frame){ cancelAnimationFrame(frame); frame = 0; }
    if(el) el.style.transition = 'none';
    const recule = historiqueInterne() > 0 && miroirJuste();
    if(recule){
      /* Le retour passe par l'historique, et par lui seul. La couche reste à
         l'écran (elle montre déjà la destination, à la bonne position de
         lecture) ; le `popstate` — qui arrive au tour de boucle suivant —
         déclenche le rendu et le nettoyage via `retourConsomme`. */
      const rv = { cible: cible, params: cibleParams, couche: couche, voile: voile };
      rv.secours = setTimeout(()=>{
        /* Le navigateur n'a pas donné suite (page masquée, `history.back`
           différé) : on rend à la main et on recule le miroir nous-mêmes. Si
           le `popstate` finit par arriver, il décrira l'écran désormais
           affiché et la garde « même écran » l'absorbera sans rien rejouer. */
        if(attente !== rv) return;
        attente = null;
        iHisto = Math.max(0, iHisto - 1);
        sansAnim = true;
        go(rv.cible, rv.params, 'back', { depuisHistorique:true });
        nettoyerRetour(rv);
      }, 900);
      attente = rv;
      couche = null; voile = null; cible = null; d = 0;
      history.back();
      return;
    }
    /* Rien derrière : entrée directe sur cet écran, le retour ne passe pas par
       l'historique. Rendu immédiat, comme avant. */
    sansAnim = true;
    go(cible, cibleParams, 'back', { remplacer:true });
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
    /* C1 — REVUE DU 07/08 : le secours doit RETIRER l'écouteur, pas seulement
       achever. Un geste abandonné dont le doigt est revenu au bord relâche sur
       une transformation déjà à zéro : la transition ne démarre pas,
       `transitionend` ne vient jamais, et l'écouteur restait posé pour toujours
       sur `#app` — qui, lui, ne disparaît jamais. Au vrai retour suivant, ce
       fantôme se réveillait au milieu du mouvement et démontait la couche
       d'arrivée sous le doigt : c'est l'écran qui saute, reproduit par
       `tests/phase2.js`. Même défaut, même remède que l'écouteur `animationend`
       de `render()` (app-03, correctif B10).
       `ev.target !== el` : `transitionend` BOUILLONNE — une carte qui anime son
       propre `transform` à l'intérieur de l'écran ne doit pas terminer le geste
       à sa place.
       `consomme` : quand la transition finit normalement, le secours ne doit
       pas rejouer `achever` 120 ms plus tard par-dessus un geste suivant. */
    let consomme = false;
    const fin = ev => {
      if(ev.target !== el || ev.propertyName !== 'transform') return;
      consomme = true;
      el.removeEventListener('transitionend', fin);
      achever();
    };
    el.addEventListener('transitionend', fin);
    setTimeout(()=>{
      if(consomme) return;
      consomme = true;
      el.removeEventListener('transitionend', fin);
      achever();
    }, duree + 120);
  }

  /* C4 — REVUE DU 07/08 : l'utilisateur a navigué pendant qu'un retour demandé
     au navigateur était encore en vol (`history.back` différé — page masquée,
     téléphone chargé). Sans ce désarmement, le secours de 900 ms redessinait
     l'écran de départ PAR-DESSUS celui que l'utilisateur venait d'ouvrir, puis
     le `popstate` différé renvoyait encore ailleurs : deux navigations
     spontanées pour un seul geste (reproduit par `tests/phase2.js`). */
  let enFuite = 0;
  function abandonnerAttente(){
    if(!attente) return false;
    const rv = attente; attente = null;
    clearTimeout(rv.secours);
    nettoyerRetour(rv);
    enFuite = Date.now();
    return true;
  }
  /* Vrai UNE SEULE FOIS si un `popstate` survient peu après un abandon : c'est
     le retour différé du geste abandonné, pas un geste de l'utilisateur.
     Fenêtre courte (2,5 s) : au-delà, un vrai appui retour reprend ses droits
     — et même dans la fenêtre, un vrai appui absorbé se rejoue au deuxième
     appui, là où l'ancien comportement fermait un écran sans raison. */
  function retardataire(){
    if(!enFuite || Date.now() - enFuite > 2500) return false;
    enFuite = 0;
    return true;
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

  return { suivre, terminer, remettre, jouer, enCours, retourConsomme,
           abandonnerAttente, retardataire };
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
    /* LOT A — pendant un duel, le balayage ne doit pas dessiner l'écran d'où
       l'on vient : le duel n'est pas une entrée d'historique, la couche du
       dessous montrerait le mauvais écran et le relâchement quitterait Mes
       goûts en perdant la session. On sort par la croix, ou par le bouton
       matériel (traité au `popstate`). */
    if(typeof duel !== 'undefined' && duel && duel.actif && !surVideo){ x0=null; return; }
    /* C3/S1 — même raison que le duel : le jeu de Recherche et la recherche
       plein écran du profil ne sont pas des entrées d'historique. Le balayage
       est refusé (le jeu a d'ailleurs ses propres gestes de cartes) ; on sort
       par la flèche ou le bouton du téléphone, qui savent désormais les
       fermer. */
    if(view === 'search' && typeof etatRech === 'function' && etatRech().jeu && !surVideo){ x0=null; return; }
    if(view === 'profile' && typeof pf12 !== 'undefined' && pf12.ouvert && !surVideo){ x0=null; return; }
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
