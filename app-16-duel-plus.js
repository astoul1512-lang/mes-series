"use strict";
/* ==================== LE DUEL ACCESSIBLE — SPEC-06 ====================

   Écrit le 10/08/2026, lots A à D.

   CE FICHIER N'AJOUTE PAS UN SECOND MOTEUR DE DUEL. Le §0.3 est explicite :
   « le moteur existant est réutilisé tel quel, rien n'est réécrit ». app-11
   possède déjà l'Elo, l'appariement par voisins, le quota de nouveautés, le
   classement et le podium — SPEC-06 n'ajoute que des PORTES D'ENTRÉE vers eux :

     §2  un bandeau « Duel du jour » dans Découvrir (lot B) ;
     §3  un duel éclair à la fin d'une série ou d'un film (lot C) ;
     §4  une carte, un panthéon, une jauge et une pastille dans Mon profil (A) ;
     §5  un podium partageable en image (lot D).

   ZÉRO IA, ZÉRO REQUÊTE. Le §0.2 l'écrit deux fois : aucune tâche nouvelle dans
   la liste blanche du relais, aucun quota touché, et aucun appel TMDB non plus
   — tout se joue sur `db.classement`, `db.podium` et la bibliothèque, qui sont
   déjà là. La seule chose qui traverse le réseau dans ce fichier, ce sont les
   affiches du partage, et elles viennent du cache d'images du navigateur.

   ANTI-COLLISION AVEC SPEC-04 (§1, section bloquante). Le bandeau n'est PAS une
   rangée : pas de numéro, pas de règle des 10, pas de tuile « Tout voir », ses
   titres ne vont jamais dans « Aussi pour toi ». Il s'ancre sur une POSITION —
   après la première rangée rendue, quelle qu'elle soit — et jamais sur le nom
   d'une rangée : si SPEC-04 réordonne un jour, le bandeau suit sans retouche. */

/* ==================== §4.3 — LA JAUGE DE STABILITÉ ====================

   La formule fait foi, et elle est recopiée telle quelle depuis la spec :

       stab(f) = min(97, arrondi(100 × Σ min(nᵢ, 5) / 25))

   où T est le top 5 de `db.classement[f]` trié par score, et nᵢ le nombre de
   duels joués du titre i.

   TROIS PROPRIÉTÉS, ET CHACUNE EST UNE DÉCISION :

   · MONOTONE. Chaque duel joué fait monter la jauge, ou la laisse. Elle ne dit
     jamais « il reste X à faire » — le §0.4 interdit d'afficher un reste, et
     une jauge qui descend quand on joue serait exactement ça.
   · PLAFOND À 97 %. « Un goût vivant n'est jamais figé ; afficher 100 % serait
     un mensonge. » Ce n'est pas de la coquetterie : le classement continue de
     bouger tant qu'on regarde des choses.
   · ELLE PEUT RECULER quand un titre neuf entre dans le top 5, et c'est assumé.
     D'où le texte « stable à N % » et non « progression » : on décrit un état,
     pas un trajet.

   Le dénominateur 25 = 5 titres × 5 duels. En dessous de 5 titres classés, la
   somme est simplement plus petite — la jauge est basse, ce qui est vrai. */
const JAUGE_TOP = 5;
const JAUGE_DUELS = 5;
const JAUGE_PLAFOND = 97;

/* ATTENTION AU FAUX AMI : `classementTrie` N'EST PAS LA BONNE SOURCE ICI, et
   le cas de test du §8 le prouve. Elle écarte les titres de moins de
   `DUEL_MINI_N` (3) duels — c'est juste pour bâtir un podium, où l'on ne veut
   pas d'un titre couronné sur deux votes. Mais la formule du §4.3 dit « les 5
   premiers de `db.classement[f]` triés par score », sans plancher, et son
   propre exemple l'exige : « 5 × 2 → 40 » suppose que des titres à DEUX duels
   comptent. Passer par `classementTrie` rendait 0 sur ce cas. */
function stabiliteDuel(famille){
  if(typeof classementFamille !== 'function') return 0;
  const c = classementFamille(famille);
  const t = Object.keys(c)
    .sort((x, y)=> ((c[y] && c[y].s) || 0) - ((c[x] && c[x].s) || 0) ||
                   (x < y ? -1 : x > y ? 1 : 0))
    .slice(0, JAUGE_TOP);
  let somme = 0;
  t.forEach(id=>{ somme += Math.min(duelsJoues(famille, id), JAUGE_DUELS); });
  return Math.min(JAUGE_PLAFOND, Math.round(100 * somme / (JAUGE_TOP * JAUGE_DUELS)));
}

/* RETOUR-02 POINT 1 (11/08/2026) — DEUX HABILLAGES, UNE SEULE JAUGE.

   `compact` rend la forme de la variante C : la barre et son pourcentage en
   bout, sans la phrase. La phrase longue (« Ton classement {famille} est stable
   à N % ») reste sur les écrans de RÉSULTAT, où elle a la place et où elle
   raconte ce qui vient de se passer ; dans la carte du profil elle occupait une
   ligne entière pour dire ce qu'un « 48 % » dit en trois caractères.

   POURQUOI UNE OPTION ET PAS UNE SECONDE FONCTION : parce que le §4.3 dit que
   la jauge est la MÊME sur les trois écrans, et qu'un test le vérifie en
   relisant les appelants. Deux fonctions, c'est deux formules qui divergent un
   jour — et une jauge qui ne dit pas la même chose selon l'écran est pire
   qu'une jauge absente. Le calcul (`stabiliteDuel`) reste unique et intact. */
function jaugeDuelHtml(famille, compact){
  const n = stabiliteDuel(famille);
  if(compact)
    return '<div class="dcjauge"><div class="djb"><i style="width:'+n+'%"></i></div>'+
      '<span>'+n+' %</span></div>';
  return '<div class="djauge"><div class="djb"><i style="width:'+n+'%"></i></div>'+
    '<span>Ton classement '+esc(libelleFamilleDuel(famille))+' est stable à '+n+' %</span></div>';
}

function libelleFamilleDuel(f){
  return (typeof LIB_FAMILLE === 'object' && LIB_FAMILLE && LIB_FAMILLE[f]) || 'titres';
}

/* ===========================================================================
   RETOUR-02 POINTS 1, 2 ET 3 (11/08/2026) — LA CARTE DUEL, VARIANTE C

   CE QUI N'ALLAIT PAS, ET C'ÉTAIT TROIS CHOSES À LA FOIS :

     1. LA CARTE ÉTAIT TROP GROSSE. Grand podium à marches (132 px pour l'or),
        titre en accroche, jauge, deux boutons : plus de 300 px avant la
        bibliothèque, sur l'écran qu'on ouvre pour voir SA bibliothèque.
     2. LA FAMILLE ÉTAIT IMPOSÉE. `famillePantheon` prenait la plus jouée —
        donc toujours les animés chez Adrien — et rien ne permettait d'en
        changer. On ne montrait qu'un tiers du travail accompli.
     3. LE LIBELLÉ MENTAIT. La jauge parlait de `familleDuelProfil` (« où
        reste-t-il à jouer ») et le podium de `famillePantheon` (« où a-t-on le
        plus joué »). Deux fonctions, deux réponses, un seul écran : « Ton
        classement films est stable à 48 % » au-dessus d'un podium d'animés.

   CE QUE FAIT LA VARIANTE C — le n°1 mis en scène, sans hauteur :
     · les trois affiches du podium EN ÉVENTAIL (le n°1 devant, liseré doré,
       les 2 et 3 derrière, inclinés) — l'émotion du podium en un cinquième de
       la place ;
     · une phrase de règne : « {n°1} règne sur tes {famille} » ;
     · la jauge, avec son pourcentage discret en bout ;
     · le bouton « Jouer » à droite, séparé des puces ;
     · les puces famille SOUS la jauge, dans l'ordre imposé Films · Animés ·
       Séries.

   UNE SEULE SOURCE DE VÉRITÉ, ET C'EST LA CORRECTION DU POINT 3 : la famille
   affichée est celle que disent les puces (`familleDuelChoisie`), et TOUT en
   découle — le podium, la phrase, la jauge, le libellé et la famille de la
   session « Jouer ». `familleDuelProfil` et `famillePantheon` ne servent plus
   qu'à choisir le DÉFAUT, une fois, quand personne n'a encore choisi.

   PLUS AUCUN TOTAL EN ACCROCHE (point 1). Le titre disait « 370 nouveaux
   titres à départager ». `nouveauxADepartager` reste — c'est elle qui nourrit
   la pastille de la barre du bas (§4.4) — mais son chiffre ne s'affiche plus
   ici, ni ailleurs dans le profil.

   OÙ EST PASSÉ « ↗ PARTAGER ». L'éventail EST le bouton de partage : on touche
   son podium, on le partage. La variante C ne prévoit pas de second bouton, et
   `partagerPodium` n'avait qu'un seul appelant — le faire disparaître aurait
   rendu orpheline toute la chaîne de la carte de partage (§4.5), où le grand
   podium à marches continue de briller. C'est le seul point de ce lot qui
   n'est pas littéralement dans la maquette : à confirmer par Adrien.
=========================================================================== */

/* L'ordre des puces est IMPOSÉ par le point 1, et il n'est pas celui de
   `DUEL_FAMILLES` (film, serie, anime). On le déclare donc ici, en clair,
   plutôt que de compter sur un ordre voisin qui bougerait sans prévenir. */
const DUEL_C_ORDRE = ['film', 'anime', 'serie'];

/* La famille dont on parle sur le profil, PAR DÉFAUT : celle qui a le plus de
   nouveaux titres à départager, à défaut celle qui a le plus gros classement.
   Elle ne décide plus de ce qui est affiché — elle propose un premier choix. */
function familleDuelProfil(){
  const jouables = (typeof famillesDuel === 'function') ? famillesDuel() : [];
  if(!jouables.length) return null;
  const parNeufs = jouables.slice().sort((a, b)=>
    nouveauxADepartager(b.cle) - nouveauxADepartager(a.cle));
  if(nouveauxADepartager(parNeufs[0].cle) > 0) return parNeufs[0].cle;
  return jouables.slice().sort((a, b)=>
    Object.keys(classementFamille(b.cle)).length -
    Object.keys(classementFamille(a.cle)).length)[0].cle;
}

/* La famille du PANTHÉON : la plus jouée, c'est-à-dire celle dont le podium
   repose sur le plus de duels. Elle non plus ne décide plus seule : elle est
   le meilleur défaut quand il existe déjà un podium complet quelque part. */
function famillePantheon(){
  const fams = (typeof DUEL_FAMILLES === 'object') ? DUEL_FAMILLES.map(f => f.cle) : [];
  let meilleure = null, mieux = -1;
  fams.forEach(f=>{
    const pod = ((db.podium || {})[f] || []);
    if(pod.length < 3) return;
    const n = totalDuelsFamille(f);
    if(n > mieux){ mieux = n; meilleure = f; }
  });
  return meilleure;
}

/* Les familles proposées en puces, dans l'ordre imposé. On ne propose que les
   familles JOUABLES (`famillesDuel`, dix titres éligibles au moins) : une puce
   qui ouvre un podium vide est une puce qui ment. */
function famillesDuelC(){
  const jouables = ((typeof famillesDuel === 'function') ? famillesDuel() : []).map(f => f.cle);
  return DUEL_C_ORDRE.filter(f => jouables.indexOf(f) >= 0);
}

/* RETOUR-02 POINT 2 — LA FAMILLE SE CHOISIT, ELLE N'EST PLUS IMPOSÉE.

   Le choix vit dans `ui`, l'état d'écran, et PAS dans `db` : le RETOUR le dit
   en toutes lettres. Conséquence assumée — il ne voyage pas d'un appareil à
   l'autre et ne survit pas à un rechargement complet. Ce n'est pas une
   préférence de la personne au sens des goûts, c'est « ce que je regarde en ce
   moment » ; le mettre dans `db` le ferait synchroniser, dater un bloc de
   goûts, et arbitrer contre l'autre appareil pour un choix qui ne vaut que le
   temps d'un aller-retour d'onglet.

   Un choix devenu injouable (des titres retirés, la famille passe sous le
   seuil) retombe silencieusement sur le défaut : on ne montre jamais un podium
   vide sous une puce allumée. */
function familleDuelChoisie(){
  const dispo = famillesDuelC();
  if(!dispo.length) return null;
  if(ui.duelFam && dispo.indexOf(ui.duelFam) >= 0) return ui.duelFam;
  const defaut = famillePantheon() || familleDuelProfil();
  return (defaut && dispo.indexOf(defaut) >= 0) ? defaut : dispo[0];
}

function setFamilleDuel(f){
  if(famillesDuelC().indexOf(f) < 0) return;
  if(ui.duelFam === f) return;
  ui.duelFam = f;
  /* La carte vit dans `viewProfile`, qui n'a pas de repeint ciblé pour elle.
     Un rendu complet est le geste juste ici : la personne vient de changer de
     sujet, et tout l'entête du profil suit. */
  if(typeof render === 'function') render();
}

function totalDuelsFamille(f){
  const c = (typeof classementFamille === 'function') ? classementFamille(f) : {};
  let n = 0;
  Object.keys(c).forEach(id=>{ n += (c[id] && c[id].n) || 0; });
  /* Chaque duel incrémente DEUX titres : le total de duels est la moitié de la
     somme. Sans cette division, « bâti sur N duels » annoncerait le double —
     et c'est exactement le genre de chiffre que personne ne vérifie. */
  return Math.round(n / 2);
}

/* ==================== §4.1 et §4.2 — LA CARTE ET LE PANTHÉON ==================== */

/* Les trois premiers du podium d'une famille, résolus en titres. Rend une
   liste éventuellement plus courte que trois — l'éventail sait faire avec. */
function troisDuPodium(fam){
  const pod = ((db.podium || {})[fam] || []).slice(0, 3);
  if(!pod.length) return [];
  const parId = (typeof titresParIdDuel === 'function') ? titresParIdDuel(fam) : {};
  return pod.map(id => parId[String(id)]).filter(Boolean);
}

/* L'ÉVENTAIL. Le n°1 devant et doré, les 2 et 3 derrière, inclinés de part et
   d'autre. Les rangs 2 et 3 sont DÉCORATIFS — pas de nom, pas de médaille :
   c'est le prix assumé de la variante C, et la maquette le dit dans sa note.
   Le nom du n°1, lui, est dans la phrase de règne juste à côté. */
function eventailDuelHtml(fam, t){
  if(!t.length) return '';
  const aff = (x, cls)=> (typeof affDuel === 'function') ? affDuel(x, cls, 'w185') : '';
  return '<button class="dcev" onclick="partagerPodium(\''+fam+'\')" '+
      'aria-label="Partager mon podium">'+
    (t[1] ? '<span class="dcev2">'+aff(t[1], 'dcevimg')+'</span>' : '')+
    (t[2] ? '<span class="dcev3">'+aff(t[2], 'dcevimg')+'</span>' : '')+
    '<span class="dcev1">'+aff(t[0], 'dcevimg')+'</span>'+
  '</button>';
}

/* En tête de Mon profil. Le bloc Duel de Mes goûts (`carteDuelGouts`) RESTE en
   place, inchangé : le §0.6 le dit, et cette carte est un raccourci, pas un
   déménagement. */
function carteDuelProfil(){
  const fam = familleDuelChoisie();
  if(!fam) return '';
  const t = troisDuPodium(fam);
  const lib = libelleFamilleDuel(fam);
  /* LA PHRASE DE RÈGNE, et son repli. Avec un n°1, on le nomme — c'est le
     sujet de la carte. Sans podium du tout (famille jouable mais jamais
     jouée), on invite, sans jamais annoncer un reste à faire (§0.4). */
  const phrase = t.length
    ? esc(t[0].nom) + ' règne sur tes ' + esc(lib)
    : 'Départage tes ' + esc(lib);
  const fams = famillesDuelC();
  return '<div class="wrap" style="padding-bottom:0"><div class="card dprofc">'+
    '<div class="dcrang">'+
      eventailDuelHtml(fam, t)+
      '<div class="dctxt">'+
        '<b class="dcttl">'+phrase+'</b>'+
        jaugeDuelHtml(fam, true)+
        /* Les puces SOUS la jauge, dans l'ordre imposé. Elles peuvent passer à
           la ligne : sur un écran de 375 px, mieux vaut une carte un peu plus
           haute qu'une puce qui touche « Jouer ». */
        (fams.length > 1 ? '<div class="dcfams">'+fams.map(f=>
          '<button class="fchip'+(f === fam ? ' on' : '')+'" '+
            'aria-pressed="'+(f === fam ? 'true' : 'false')+'" '+
            'onclick="setFamilleDuel(\''+f+'\')">'+esc(libelleFamilleDuel(f))+'</button>').join('')+
        '</div>' : '')+
      '</div>'+
      '<button class="btn dcjouer" onclick="ouvrirDuel(\''+fam+'\')">Jouer</button>'+
    '</div>'+
  '</div></div>';
}

/* PIERRE TOMBALE — RETOUR-02 POINT 1, 11/08/2026. `pantheonHtml` construisait
   le grand podium à marches (or au centre, 132 px de haut) en tête de Mon
   profil. Le point 1 l'en retire : la variante C le remplace par l'éventail
   ci-dessus, cinq fois plus petit.

   IL N'A PAS ÉTÉ DÉPLACÉ, IL A ÉTÉ SUPPRIMÉ, et il faut le dire clairement.
   Le RETOUR dit « il reste sur la carte de PARTAGE, où il brille » — et c'est
   vrai : la carte de partage EXISTE toujours, entière, avec ses trois marches.
   Mais elle est dessinée au CANVAS (`construirePodiumPng`, §5), pas en HTML.
   Elle n'a jamais appelé `pantheonHtml` et ne l'appellera pas. Garder ici une
   fonction HTML sans appelant, c'est très exactement ce qui est arrivé à
   `duelPasVu` (point 19 du 02/08, puis point 6 de ce RETOUR) : du code mort
   qui a l'air vivant. Elle part, avec ses règles CSS (`.dpant`, `.dmarche`,
   `.dmaff`, `.dmnom`, `.dmsoc` et la surcouche premium de `.dmaff`).

   Ce qui a été VÉRIFIÉ avant de la retirer : `pantheonHtml` n'avait qu'un seul
   appelant, `carteDuelProfil`. `troisDuPodium`, qu'elle partageait avec
   l'éventail, reste — c'est elle qui porte la résolution podium → titres. */

/* ==================== §4.4 — LA PASTILLE DE LA BARRE DU BAS ====================

   Σ `nouveauxADepartager(f)` sur les familles jouables ; « 9+ » au-delà de 9 ;
   rien à zéro. C'est la SEULE pastille de la barre du bas — le §4.4 en réclame
   l'exclusivité, et si une autre spec en ajoute une, l'arbitrage se fait avant
   fusion. Aucune n'existe à ce jour, la question ne se pose pas encore. */
/* CORRECTION DE RELECTURE (10/08) — LA PASTILLE ÉTAIT RECALCULÉE À CHAQUE
   RENDU, et le commentaire juste au-dessus affirmait le contraire.

   `renderNav()` tourne à chaque `render()`, et ce compte parcourt la
   bibliothèque une fois par famille jouable — jusqu'à six passes complètes par
   rendu. Le §4.4 dit « recalculée aux mêmes moments que le bloc Duel, JAMAIS en
   continu », et le moyen existait déjà dans le dépôt : `signatureGouts()`, qui
   ne bouge que quand un goût bouge. On mémorise donc sur elle.

   Le podium entre dans cette signature (voir `signatureGouts`, app-11), et
   `nouveauxADepartager` le lit : un duel joué invalide bien le mémo. */
let pastilleDuelMemo = { sig:null, n:0 };

function compteDuelPastille(){
  const sig = (typeof signatureGouts === 'function') ? signatureGouts() : null;
  if(sig !== null && pastilleDuelMemo.sig === sig) return pastilleDuelMemo.n;
  const jouables = (typeof famillesDuel === 'function') ? famillesDuel() : [];
  let n = 0;
  jouables.forEach(f=>{ n += nouveauxADepartager(f.cle); });
  pastilleDuelMemo = { sig:sig, n:n };
  return n;
}

function texteDuelPastille(){
  const n = compteDuelPastille();
  if(n <= 0) return '';
  return n > 9 ? '9+' : String(n);
}

/* ==================== §2 — LE BANDEAU « DUEL DU JOUR » ====================

   État en localStorage, jamais dans `db` : c'est de l'état d'écran, même règle
   que la « Mémoire des rythmes » de SPEC-04 §1. Faire voyager une paire du jour
   par la synchro n'aurait aucun sens — deux appareils, deux journées. */
const DUELJOUR_CLE = 'ms.dueljour.v1';

function lireDuelJour(){
  let o = null;
  try{ o = JSON.parse(localStorage.getItem(DUELJOUR_CLE) || 'null'); }catch(e){ o = null; }
  if(!o || typeof o !== 'object' || o.date !== todayISO()) return null;
  if(!Array.isArray(o.paire) || o.paire.length !== 2) return null;
  return o;
}

function ecrireDuelJour(o){
  try{ localStorage.setItem(DUELJOUR_CLE, JSON.stringify(o)); }catch(e){}
}

function marquerDuelJourJoue(){
  const o = lireDuelJour();
  if(!o) return;
  o.joue = true;
  ecrireDuelJour(o);
}

/* La famille du jour (§2.2) : celle de la puce famille active si elle est
   jouable ; sinon celle qui a le plus de nouveaux à départager ; sinon la plus
   grosse. Aucune jouable → pas de bandeau, et c'est un refus net (§1.4) :
   Découvrir ne montre jamais un module de duel vide. */
function familleDuelJour(){
  const jouables = (typeof famillesDuel === 'function') ? famillesDuel() : [];
  if(!jouables.length) return null;
  const t = (ui.disc && ui.disc.type) || 'tout';
  const parPuce = { movie:'film', tv:'serie', anime:'anime' }[t];
  if(parPuce && jouables.some(f => f.cle === parPuce)) return parPuce;
  return familleDuelProfil();
}

/* La paire du jour. Réutilise l'esprit de `paireNeuveDuel` : un titre jamais
   joué contre une tête de podium si c'est possible, deux voisins de classement
   sinon. Jamais un titre récusé — `titresEligiblesDuel` les a déjà retirés. */
function composerDuelJour(){
  const fam = familleDuelJour();
  if(!fam) return null;
  const paquet = titresEligiblesDuel(fam);
  if(paquet.length < DUEL_MINI) return null;
  const pod = ((db.podium || {})[fam] || []).map(String);
  const neufs = paquet.filter(t => duelsJoues(fam, t.id) === 0);
  /* Dans l'ORDRE DU PODIUM, pas dans celui du paquet : le §2.2 dit « neuf
     contre TÊTE de podium », et filtrer le paquet rendait un titre quelconque
     parmi les dix. L'éclair, lui, prenait déjà `pod[0]`. */
  const parId = {};
  paquet.forEach(t=>{ parId[String(t.id)] = t; });
  const tetes = pod.map(x => parId[x]).filter(Boolean);
  let a = null, b = null;
  if(neufs.length && tetes.length){
    a = neufs[Math.floor(Math.random() * neufs.length)];
    b = tetes.find(x => cleDuel(x) !== cleDuel(a)) || null;
  }
  if(!a || !b){
    /* Deux voisins de classement : on prend un rang au hasard et son voisin
       immédiat, ce qui est la forme la plus serrée de `DUEL_VOISINS`. */
    const rangs = classementTrie(fam).map(String);
    const dispo = rangs.map(id => parId[id]).filter(Boolean);
    if(dispo.length >= 2){
      const i = Math.floor(Math.random() * (dispo.length - 1));
      a = dispo[i]; b = dispo[i + 1];
    }else if(paquet.length >= 2){
      a = paquet[0]; b = paquet[1];
    }
  }
  if(!a || !b || cleDuel(a) === cleDuel(b)) return null;
  return { date: todayISO(), famille: fam, paire: [cleDuel(a), cleDuel(b)], joue: false };
}

/* Le bandeau lui-même. Une seule porte d'entrée, appelée par `vitrineBody`
   après la première rangée rendue. Rend '' dans TOUS les cas de §1.4 : hors
   vitrine au repos, pendant l'amorçage, sans famille jouable, et une fois
   joué. */
function bandeauDuelJour(){
  if(typeof duelDisponible !== 'function' || !duelDisponible()) return '';
  if(typeof vitrineVisible === 'function' && !vitrineVisible()) return '';
  if(typeof besoinAmorcage === 'function' && besoinAmorcage()) return '';
  if(typeof duel === 'object' && duel && duel.actif) return '';
  let o = lireDuelJour();
  if(!o){
    o = composerDuelJour();
    if(!o) return '';
    ecrireDuelJour(o);
  }
  if(o.joue) return '';
  const t = titresDuelJour(o);
  if(!t) return '';
  return '<div class="duoband" onclick="jouerDuelJour()" role="button" tabindex="0">'+
    '<div class="dbaff">'+
      (typeof affDuel === 'function' ? affDuel(t[0], 'dba1', 'w154') : '')+
      '<span class="dbvs">VS</span>'+
      (typeof affDuel === 'function' ? affDuel(t[1], 'dba2', 'w154') : '')+
    '</div>'+
    '<div class="dbtxt">'+
      '<div class="dbkick">⚔ Duel du jour</div>'+
      '<b>'+esc(t[0].nom)+' ou '+esc(t[1].nom)+' ?</b>'+
      '<div class="tiny muted">30 secondes · affine ton classement</div>'+
    '</div>'+
    '<span class="btn mini dbgo">Jouer</span>'+
  '</div>';
}

/* Les deux titres de la paire mémorisée, retrouvés dans le paquet éligible du
   jour. S'ils n'y sont plus — titre retiré de la bibliothèque, récusé depuis —
   le bandeau ne s'affiche pas plutôt que de montrer une paire fantôme. */
function titresDuelJour(o){
  const paquet = titresEligiblesDuel(o.famille);
  const a = paquet.find(t => cleDuel(t) === o.paire[0]);
  const b = paquet.find(t => cleDuel(t) === o.paire[1]);
  return (a && b) ? [a, b] : null;
}

/* §2.3 — une variante d'`ouvrirDuel` qui pose une session de TAILLE UN.
   Le vote passe par `duelVote` → `appliquerVote` → `ecrireClassement`,
   INCHANGÉS : le score s'écrit duel par duel, il survit déjà à tout. */
function jouerDuelJour(){
  const o = lireDuelJour();
  if(!o) return;
  const t = titresDuelJour(o);
  if(!t) return;
  const paquet = titresEligiblesDuel(o.famille);
  oublierDuel();
  const scores = {};
  paquet.forEach(x=>{ scores[cleDuel(x)] = scoreClassement(o.famille, x.id); });
  duel = Object.assign({}, DUEL_VIDE,
    { actif:true, famille:o.famille, paquet:paquet, scores:scores, joues:{},
      faits:0, ecran:'jeu', classe:[], sugg:null, rattrapage:[], vus:t.slice(),
      neufs:0, mode:'jour', paire:[t[0], t[1]] });
  if(view !== 'gouts') go('gouts', { from: view });
  else render();
}

/* §2.4 — l'écran de résultat LÉGER. Pas le résultat de session complet : un
   duel ne bâtit pas un classement, il l'affine. */
function ecranResultatDuelJour(){
  const fam = duel.famille;
  return '<div class="dres">'+
    '<div class="dfete" aria-hidden="true">✓</div>'+
    '<div class="drtitre">Duel du jour joué</div>'+
    jaugeDuelHtml(fam)+
    '<div class="dcta">'+
      '<button class="btn" onclick="ouvrirDuel(\''+fam+'\')">Enchaîner '+DUEL_TAILLE+' duels</button>'+
      /* `fermerDuel()` seul ne touche pas `view` : après `go('gouts', …)`, on
         restait sur Mes goûts et le libellé mentait. Relevé en relecture. */
      '<button class="btn ghost" onclick="retourDecouvrirDuel()">Retour à Découvrir</button>'+
    '</div>'+
  '</div>';
}

/* Le bouton du §2.4 dit « Retour à Découvrir » : il faut donc y retourner. */
function retourDecouvrirDuel(){
  oublierDuel();
  if(typeof go === 'function') go('discover');
  else render();
}

/* ==================== §3 — LE DUEL ÉCLAIR ====================

   Une question, une fois, à la fin d'un titre. Trois garde-fous, et ils
   comptent autant que la fonctionnalité :

     · UNE SEULE FOIS PAR TITRE (`eclairsPoses`). Fermer la feuille sans
       répondre compte comme posé : la question ne revient pas.
     · AU PLUS UN ÉCLAIR PAR SESSION D'APP. Finir trois séries d'affilée
       n'ouvre qu'une feuille.
     · JAMAIS BLOQUANT. La feuille s'ouvre APRÈS que le geste d'origine a été
       appliqué et confirmé ; la fermer est toujours possible ; rien n'attend
       la réponse. */
const ECLAIRS_CLE = 'ms.eclairs.v1';
let eclairFaitCetteSession = false;

function eclairsPoses(){
  let l = [];
  try{ l = JSON.parse(localStorage.getItem(ECLAIRS_CLE) || '[]'); }catch(e){ l = []; }
  return Array.isArray(l) ? l : [];
}
function noterEclairPose(cle){
  const l = eclairsPoses();
  if(l.indexOf(cle) < 0) l.push(cle);
  try{ localStorage.setItem(ECLAIRS_CLE, JSON.stringify(l.slice(-400))); }catch(e){}
}

/* Le point d'entrée unique, appelé par les DEUX chemins du §3.1 : une série qui
   passe à « tout vu » par un geste de la personne, et un film qui passe à vu.
   Il ne s'ouvre JAMAIS depuis un import ou une synchro — ces chemins-là ne
   passent pas par les fonctions qui l'appellent, et c'est ce qui garantit la
   règle plutôt qu'un drapeau qu'on oublierait de poser. */
function proposerDuelEclair(media, id, nom){
  if(eclairFaitCetteSession) return;
  /* Une session de duel en cours utilise l'objet `duel` : l'éclair le
     réquisitionne le temps d'un vote, il ne doit pas s'inviter au milieu. */
  if(typeof duel === 'object' && duel && duel.actif) return;
  if(typeof besoinAmorcage === 'function' && besoinAmorcage()) return;
  const cle = media + ':' + String(id);
  if(eclairsPoses().indexOf(cle) >= 0) return;
  const o = media === 'tv' ? db.shows[id] : db.movies[id];
  const fam = (typeof familleDe === 'function') ? familleDe(o || {}, media) : null;
  if(!fam) return;
  /* Famille non jouable, ou podium vide : pas d'adversaire légitime, donc
     silence. Poser la question contre un titre tiré au hasard ferait un duel
     qui ne veut rien dire, et il s'écrirait quand même dans le classement. */
  if(typeof famillesDuel === 'function' && !famillesDuel().some(f => f.cle === fam)) return;
  const pod = ((db.podium || {})[fam] || []).map(String);
  if(!pod.length) return;
  const parId = (typeof titresParIdDuel === 'function') ? titresParIdDuel(fam) : {};
  const adversaire = pod.map(x => parId[x]).filter(Boolean).find(x => String(x.id) !== String(id));
  if(!adversaire) return;
  eclairFaitCetteSession = true;
  noterEclairPose(cle);
  /* Après le geste, jamais pendant : un tour de boucle laisse la barre
     « Annuler » et le rendu se poser d'abord. */
  setTimeout(()=> ouvrirFeuilleEclair(media, id, nom || (o && (o.name || o.title)) || 'ce titre',
                                      fam, adversaire), 350);
}

function ouvrirFeuilleEclair(media, id, nom, fam, adv){
  openSheet('<h3>Tu viens de finir '+esc(nom)+'</h3>'+
    '<p class="small muted" style="margin:0 0 10px">Mieux ou moins bien que '+
      esc(adv.nom)+'&nbsp;?</p>'+
    '<div class="choix">'+
      '<button onclick="voterEclair(\''+media+'\',\''+escJs(String(id))+'\',\''+
        fam+'\',\''+escJs(String(adv.id))+'\',1)">'+esc(nom)+'</button>'+
      '<button onclick="voterEclair(\''+media+'\',\''+escJs(String(id))+'\',\''+
        fam+'\',\''+escJs(String(adv.id))+'\',0)">'+esc(adv.nom)+'</button>'+
      '<button onclick="closeSheet()">Je ne sais pas / les deux</button>'+
    '</div>', 'duel-eclair');
}

/* Le vote passe par le chemin EXISTANT — Elo, `ecrireClassement`, `saveDB` —
   et pas par une écriture directe. « Je ne sais pas » n'écrit rien : c'est le
   bouton qui ferme la feuille, et rien d'autre. */
/* CORRECTION DE RELECTURE (10/08) — L'ÉCLAIR PASSE PAR `appliquerVote`, COMME
   TOUTES LES AUTRES PORTES.

   La première version recalculait l'Elo sur place : un `K = … : 32` en dur
   réapparaissait — la constante que le dépôt avait justement fini par ne plus
   dupliquer — et surtout la règle du §1.7 ne s'appliquait pas. Cette règle dit
   qu'un titre non noté qui bat un titre 👍 passe à 👍, et elle vit dans
   `appliquerVote`. Deux portes vers le même moteur ne se comportaient donc pas
   pareil, ce que le §0.3 interdit en toutes lettres : « le moteur existant est
   réutilisé tel quel, rien n'est réécrit ».

   On pose donc une session de taille un, exactement comme le duel du jour, et
   on laisse `appliquerVote` faire son travail. Le drapeau « silencieux » lui
   dit de ne pas enchaîner ni redessiner — l'éclair n'a pas d'écran à lui. */
function titreEclair(fam, media, id){
  const parId = (typeof titresParIdDuel === 'function') ? titresParIdDuel(fam) : {};
  return parId[String(id)] ||
         { media:media, id:String(id), nom:'', famille:fam, genres:[], affiche:null };
}

function voterEclair(media, id, fam, advId, gagne){
  closeSheet();
  const x = titreEclair(fam, media, id);
  const adv = titreEclair(fam, media === 'tv' ? 'tv' : 'movie', advId);
  const paire = gagne ? [x, adv] : [adv, x];
  oublierDuel();
  const scores = {};
  paire.forEach(t=>{ scores[cleDuel(t)] = scoreClassement(fam, t.id); });
  duel = Object.assign({}, DUEL_VIDE,
    { actif:true, famille:fam, paquet:paire.slice(), scores:scores, joues:{},
      faits:0, ecran:'jeu', vus:paire.slice(), mode:'eclair', paire:paire });
  appliquerVote(0, true);            // silencieux : ni enchaînement, ni rendu
  if(typeof projeterPodium === 'function') projeterPodium(fam);
  oublierDuel();
  saveDB();
  toast('C\'est noté');
  render();
}

/* ==================== §5 — LE PODIUM PARTAGEABLE ====================

   Généré EN LOCAL au canvas, 1080 × 1350. Rien ne part vers le serveur : le
   partage est un fichier que la personne envoie elle-même, et aucun compte
   n'est requis. Une affiche qui échoue devient un aplat dégradé avec le titre
   en toutes lettres — l'image se génère quand même, réseau coupé compris. */
const PART_L = 1080, PART_H = 1350;

function partagerPodium(fam){
  construirePodiumPng(fam).then(blob=>{
    if(!blob) return toast('Impossible de créer l\'image');
    const nom = 'mon-podium-' + fam + '.png';
    const f = (typeof File === 'function') ? new File([blob], nom, { type:'image/png' }) : null;
    if(f && navigator.canShare && navigator.canShare({ files:[f] }) && navigator.share){
      navigator.share({ files:[f] }).catch(()=>{});
      return;
    }
    if(typeof URL !== 'undefined' && URL.createObjectURL){
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u; a.download = nom;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(u), 4000);
      toast('Image enregistrée');
      return;
    }
    partagerPodiumTexte(fam);
  }).catch(()=> partagerPodiumTexte(fam));
}

/* Dernier recours : le texte. Il dit la même chose, il tient dans n'importe
   quel champ, et il ne dépend d'aucune capacité du navigateur. */
function partagerPodiumTexte(fam){
  const noms = nomsPodium(fam);
  if(!noms.length) return;
  const t = 'Mon podium : ' + noms.map((n, i)=> (i + 1) + '. ' + n).join(' · ') + ' — mes-series.app';
  if(navigator.share) return navigator.share({ text:t }).catch(()=>{});
  if(navigator.clipboard && navigator.clipboard.writeText)
    return navigator.clipboard.writeText(t).then(()=> toast('Podium copié'), ()=>{});
  toast(t);
}

function nomsPodium(fam){
  const pod = ((db.podium || {})[fam] || []).slice(0, 3);
  const parId = (typeof titresParIdDuel === 'function') ? titresParIdDuel(fam) : {};
  return pod.map(id => parId[String(id)]).filter(Boolean).map(x => x.nom);
}

/* `crossOrigin='anonymous'` : image.tmdb.org sert les en-têtes CORS, donc le
   canvas ne se souille pas et `toBlob` fonctionne. Sans cette ligne, la
   génération échouerait silencieusement à la dernière étape — c'est le piège
   classique, et le §5.1 le nomme. */
function chargerAffichePartage(chemin){
  return new Promise(ok=>{
    const url = (typeof srcImage === 'function') ? srcImage(chemin, 'w342') : '';
    if(!url) return ok(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=> ok(img);
    img.onerror = ()=> ok(null);
    /* `srcImage` échappe pour le HTML ; ici on a besoin de l'URL brute. */
    img.src = url.replace(/&amp;/g, '&');
  });
}

async function construirePodiumPng(fam){
  const pod = ((db.podium || {})[fam] || []).slice(0, 3);
  const parId = (typeof titresParIdDuel === 'function') ? titresParIdDuel(fam) : {};
  const t = pod.map(id => parId[String(id)]).filter(Boolean);
  if(t.length < 3) return null;
  const c = document.createElement('canvas');
  c.width = PART_L; c.height = PART_H;
  const g = c.getContext('2d');
  if(!g) return null;

  g.fillStyle = '#07070a';
  g.fillRect(0, 0, PART_L, PART_H);
  /* Le cadre doré discret de la maquette 14. */
  g.strokeStyle = 'rgba(212,175,55,.45)'; g.lineWidth = 6;
  g.strokeRect(24, 24, PART_L - 48, PART_H - 48);

  g.fillStyle = '#eef0f5';
  g.textAlign = 'center';
  g.font = '700 62px system-ui, -apple-system, sans-serif';
  g.fillText('Mon panthéon ' + libelleFamilleDuel(fam), PART_L / 2, 150);

  const images = await Promise.all(t.map(x => chargerAffichePartage(x.affiche)));
  /* Or au centre et plus haut, argent à gauche, bronze à droite. */
  const places = [
    { i:1, x:96,  y:560, w:260, h:390 },
    { i:0, x:400, y:430, w:280, h:420 },
    { i:2, x:724, y:560, w:260, h:390 }
  ];
  places.forEach(p=>{
    const img = images[p.i], titre = t[p.i];
    if(img){ g.drawImage(img, p.x, p.y, p.w, p.h); }
    else{
      const d = g.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
      d.addColorStop(0, '#26304a'); d.addColorStop(1, '#12141c');
      g.fillStyle = d; g.fillRect(p.x, p.y, p.w, p.h);
      g.fillStyle = '#eef0f5'; g.font = '700 26px system-ui, sans-serif';
      envelopperTexte(g, titre.nom, p.x + p.w / 2, p.y + p.h / 2, p.w - 24, 32);
    }
    g.strokeStyle = 'rgba(212,175,55,.6)'; g.lineWidth = 3;
    g.strokeRect(p.x, p.y, p.w, p.h);
    g.fillStyle = '#d4af37'; g.font = '800 44px system-ui, sans-serif';
    g.fillText(String(p.i + 1), p.x + p.w / 2, p.y + p.h + 58);
    g.fillStyle = '#eef0f5'; g.font = '600 26px system-ui, sans-serif';
    envelopperTexte(g, titre.nom, p.x + p.w / 2, p.y + p.h + 104, p.w, 32);
  });

  g.fillStyle = '#8b92a4'; g.font = '400 30px system-ui, sans-serif';
  g.fillText('Bâti sur ' + totalDuelsFamille(fam) + ' duels · ' + moisAnnee(),
             PART_L / 2, PART_H - 150);
  g.fillStyle = '#eef0f5'; g.font = '700 32px system-ui, sans-serif';
  g.fillText('mes-series.app', PART_L / 2, PART_H - 90);

  return await new Promise(ok=>{
    try{ c.toBlob(b => ok(b), 'image/png'); }catch(e){ ok(null); }
  });
}

function envelopperTexte(g, texte, x, y, largeur, hauteurLigne){
  const mots = String(texte || '').split(' ');
  let ligne = '', l = 0;
  mots.forEach(m=>{
    const essai = ligne ? ligne + ' ' + m : m;
    if(g.measureText(essai).width > largeur && ligne){
      g.fillText(ligne, x, y + l * hauteurLigne); ligne = m; l++;
    }else ligne = essai;
  });
  if(ligne && l < 2) g.fillText(ligne, x, y + l * hauteurLigne);
}

const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août',
                 'septembre','octobre','novembre','décembre'];
function moisAnnee(){
  const d = new Date();
  return MOIS_FR[d.getMonth()] + ' ' + d.getFullYear();
}
