"use strict";
/* ============================ L'IA CÔTÉ CLIENT ============================

   SPEC-04 lot C — écrit le 10/08/2026.

   Le lot B a posé le relais (`supabase/functions/ia`) sans lui donner un seul
   appelant. Ce fichier est le premier, et il restera le seul : tout ce qui
   parle à l'IA passe par ici, quel que soit l'écran. Découvrir (SPEC-04 §4.3
   et §2) aujourd'hui, la Recherche (SPEC-05 §6) au lot suivant.

   TROIS RÈGLES QUI NE SE NÉGOCIENT PAS, et qui expliquent la forme du fichier :

   1. « JAMAIS BLOQUANTE » (SPEC-04 §4.4). Aucune fonction d'ici n'est attendue
      par un rendu. L'écran s'affiche avec ce qu'il a — le texte de la veille,
      ou la ligne au cœur classique — puis se repeint quand la réponse arrive.
      Il n'y a donc PAS de spinner dans ce fichier, et il ne doit jamais y en
      avoir : un spinner, c'est une attente, et une attente est un blocage.

   2. « UNE TENTATIVE, PAS DE RAFALE ». Le relais renvoie TOUJOURS 200 : soit le
      texte, soit `{indisponible:true}`. Un `{indisponible:true}` n'est pas une
      panne à réessayer, c'est une réponse — tous les fournisseurs sont pleins,
      ou le budget est atteint. `appelIA` ne réessaie donc jamais, contrairement
      à `tmdb()` qui, lui, patiente trois fois sur un 429. Copier la plomberie
      de `tmdb()` ici serait exactement l'erreur : c'est pour ça que ce fichier
      passe par `sbFetch`, qui porte le jeton et rien d'autre.

   3. « CACHE D'ABORD ». Le cache vit en localStorage, PAS dans `db` : c'est du
      contenu jetable, propre à un appareil, et le faire voyager par la synchro
      ne ferait que créer des conflits de fusion pour deux phrases (§4.3). En
      revanche l'INTERRUPTEUR, lui, est une préférence : il vit dans
      `db.gouts.ia`, sous-bloc `ia` du mécanisme de SPEC-01 C4, et suit donc le
      compte d'un téléphone à l'autre. Allumer l'IA sur un appareil et la
      retrouver éteinte sur l'autre serait incompréhensible.

   Budget nominal, mesuré sur la mécanique ci-dessous et à re-mesurer si elle
   change : 2 requêtes au premier lancement du jour (le pitch du jour + les
   intitulés de rangées), 1 par humeur touchée dans la journée, 0 ensuite.
   Le plafond serveur est de 30 par personne et par jour. */

/* ------------------------------- RÉGLAGES -------------------------------- */

/* Le sous-bloc de goûts qui porte les deux interrupteurs. `migrerGouts` en
   garantit la présence ; ici on se contente de lire prudemment, parce que ce
   fichier est chargé avant qu'une base ait pu être migrée. */
function reglagesIA(){
  const g = (typeof db === 'object' && db && db.gouts) ? db.gouts : null;
  const o = (g && g.ia && typeof g.ia === 'object' && !Array.isArray(g.ia)) ? g.ia : null;
  return { decouvrir: !!(o && o.decouvrir), recherche: !!(o && o.recherche) };
}

/* `quoi` vaut 'decouvrir' ou 'recherche'. Tout le reste répond faux : une
   faute de frappe ne doit pas allumer l'IA par accident. */
function iaActive(quoi){
  const r = reglagesIA();
  if(quoi === 'decouvrir') return r.decouvrir;
  if(quoi === 'recherche') return r.recherche;
  return false;
}

/* L'interrupteur des Réglages. Éteindre efface le cache de l'écran concerné :
   sinon la phrase générée hier resterait affichée après extinction, et le §4.5
   promet que l'app éteinte est EXACTEMENT l'app d'avant.

   RETOUR-01 POINT 4 (11/08/2026) — L'INTERRUPTEUR SERT À COUPER, PAS À
   ALLUMER. L'IA est active par défaut pour un compte connecté (voir
   `migrerGouts`, app-11). Le sens du geste change : ce bouton est une SORTIE. */
function basculerIA(quoi){
  if(quoi !== 'decouvrir' && quoi !== 'recherche') return;
  if(!db.gouts) return;
  const o = (db.gouts.ia && typeof db.gouts.ia === 'object' && !Array.isArray(db.gouts.ia))
    ? db.gouts.ia : {};
  o[quoi] = !o[quoi];
  db.gouts.ia = { decouvrir: !!o.decouvrir, recherche: !!o.recherche };
  if(!o[quoi]) oublierCacheIA(quoi);
  if(typeof toucheGouts === 'function') toucheGouts('ia');
  else if(typeof saveDB === 'function') saveDB();
  if(typeof render === 'function') render();
  /* RETOUR-01 POINT 4 — À LA (RÉ)ACTIVATION, LE LOT PART IMMÉDIATEMENT. C'est
     le comportement qu'Adrien a observé en débloquant l'IA à la main le 10/08,
     et il est confirmé voulu ET testé. La raison du silence d'avant est
     simple : allumer l'interrupteur depuis les Réglages ne repeint pas
     Découvrir, or `apresRenduDecouvrirIA` est accroché au rendu de la vitrine.
     L'IA restait donc allumée et muette jusqu'au prochain passage sur
     Découvrir — ce qui ressemble à s'y méprendre à un interrupteur qui ne fait
     rien.

     CE QUE ÇA COÛTE, DIT JUSTE (correction de relecture, 11/08/2026). La
     première rédaction affirmait « rallumer trois fois dans la journée ne
     dépense pas une requête de plus ». C'est faux, et c'était mesurable :
     COUPER efface le marqueur de jour (`oublierCacheIA` pose `o.jour = ''`),
     donc chaque rallumage refait un lot complet — trois cycles couper/rallumer
     = trois lots = six requêtes. Les gardes qui tiennent vraiment sont le
     verrou inter-onglets et le drapeau de module, qui empêchent DEUX lots
     simultanés. Ce qui borne réellement le coût d'un interrupteur qu'on
     triture, c'est le plafond de trente : il SURVIT à l'extinction, parce que
     `oublierCacheIA` garde `n` en effaçant les textes. */
  if(o[quoi] && quoi === 'decouvrir' && typeof apresRenduDecouvrirIA === 'function')
    apresRenduDecouvrirIA();
}

/* ------------------------------- LE CACHE -------------------------------- */

/* Un seul blob, une seule écriture. La forme :

     { jour:'AAAA-MM-JJ',
       pitch:   { cle:'tv:1399', texte:'…' },          // le pitch du jour
       titres:  { acclames:'…', weekend:'…' },         // les intitulés réécrits
       humeurs: { frisson:{ jusqua:<ms>, cle:'tv:1399', texte:'…' } },
       rech:    { pourquoi:{ '<empreinte>':{ quand:<ms>, texte:'…' } } } }

   `jour` couvre le lot quotidien ; les humeurs ont leur propre échéance à 6 h
   du matin (§2), qui n'est pas la même chose qu'un changement de jour : une
   humeur touchée à 1 h du matin doit tenir jusqu'au petit matin, pas expirer
   soixante minutes plus tard. */
const IA_CLE = 'ms.ia.v1';

/* RETOUR-01 POINT 5 (11/08/2026) — `pitchs` : LE PITCH DE CHAQUE HERO, PAS
   SEULEMENT DU PREMIER DE LA JOURNÉE.
   Forme : { jour:'AAAA-MM-JJ', n:<places prises aujourd'hui>,
             t:{ '<humeur|->:<media>:<id>': '<texte, ou "" si rien à dire>' } }
   LA CLÉ EST (HUMEUR, TITRE), PAS LE TITRE SEUL, et c'est voulu : le pitch
   d'une humeur est un AUTRE texte que celui du jour — il dit en quoi le titre
   répond à l'ambiance demandée. Un même titre sous quatre humeurs coûte donc
   quatre requêtes. RETOUR-01 point 5 écrit « cache par titre » ; la lettre
   dirait de n'en faire qu'une, l'esprit (§2 de SPEC-04) dit le contraire. On
   suit l'esprit, et on l'écrit ici plutôt que de laisser croire au lecteur que
   la lettre est tenue. Relevé en relecture.
   La chaîne vide est un ÉTAT, pas un trou : elle veut dire « on a demandé, il
   n'y a rien à afficher » et empêche chaque repeint de redemander. */
function cacheIAVide(){
  return { jour:'', pitch:null, titres:null, humeurs:{},
           pitchs:{ jour:'', n:0, t:{} }, rech:{ pourquoi:{} } };
}

function lireCacheIA(){
  let o = null;
  try{ o = JSON.parse(localStorage.getItem(IA_CLE) || 'null'); }catch(e){ o = null; }
  if(!o || typeof o !== 'object' || Array.isArray(o)) o = cacheIAVide();
  if(typeof o.jour !== 'string') o.jour = '';
  if(!o.humeurs || typeof o.humeurs !== 'object' || Array.isArray(o.humeurs)) o.humeurs = {};
  if(!o.rech || typeof o.rech !== 'object' || Array.isArray(o.rech)) o.rech = { pourquoi:{} };
  /* SPEC-09 lot 1 — l'ordre du jour des rangées locales. Normalisé comme le
     reste : un cache écrit par une version antérieure n'a pas ce champ, et
     `ordreIARangee` doit lire `null` plutôt que `undefined.ids`. */
  if(!o.ordres || typeof o.ordres !== 'object' || Array.isArray(o.ordres)) o.ordres = null;
  /* SPEC-09 lot 1 (2/2) — les rangées composées par l'IA, par famille, plus le
     compteur d'anti-boucle du jour. Normalisé ici pour la même raison que le
     reste : un cache écrit par une version antérieure n'a pas ce champ. */
  if(!o.compo || typeof o.compo !== 'object' || Array.isArray(o.compo))
    o.compo = { jour:'', n:0, fams:{} };
  if(!o.compo.fams || typeof o.compo.fams !== 'object' || Array.isArray(o.compo.fams))
    o.compo.fams = {};
  if(typeof o.compo.n !== 'number' || !(o.compo.n >= 0)) o.compo.n = 0;
  if(!o.rech.pourquoi || typeof o.rech.pourquoi !== 'object' || Array.isArray(o.rech.pourquoi))
    o.rech.pourquoi = {};
  /* RETOUR-01 point 5 — le compteur de pitchs se remet à zéro au changement de
     jour, ici, en LECTURE : le plafond est journalier, et un cache de la veille
     ne doit jamais faire croire que la journée est déjà consommée. */
  if(!o.pitchs || typeof o.pitchs !== 'object' || Array.isArray(o.pitchs))
    o.pitchs = { jour:'', n:0, t:{} };
  if(!o.pitchs.t || typeof o.pitchs.t !== 'object' || Array.isArray(o.pitchs.t)) o.pitchs.t = {};
  if(typeof o.pitchs.n !== 'number' || !(o.pitchs.n >= 0)) o.pitchs.n = 0;
  const auj = (typeof todayISO === 'function') ? todayISO() : '';
  if(o.pitchs.jour !== auj) o.pitchs = { jour:auj, n:0, t:{} };
  return o;
}

function ecrireCacheIA(o){
  try{ localStorage.setItem(IA_CLE, JSON.stringify(o)); }catch(e){ /* plein : tant pis */ }
}

/* Éteindre un interrupteur efface SA moitié du cache, pas celle de l'autre
   écran : les deux IA s'éteignent séparément (SPEC-05 §6). */
function oublierCacheIA(quoi){
  const o = lireCacheIA();
  /* RETOUR-01 point 5 — les pitchs par titre s'effacent avec le reste de
     Découvrir, mais le COMPTEUR de la journée reste : couper puis rallumer
     l'IA ne doit pas rendre trente nouvelles requêtes. */
  if(quoi === 'decouvrir'){
    o.jour = ''; o.pitch = null; o.titres = null; o.humeurs = {}; o.ordres = null;
    /* Le COMPTEUR de compositions reste, comme celui des pitchs : couper puis
       rallumer l'IA ne doit pas rendre six nouvelles compositions. */
    o.compo = { jour:o.compo.jour, n:o.compo.n, fams:{} };
    o.pitchs = { jour:o.pitchs.jour, n:o.pitchs.n, t:{} };
  }
  if(quoi === 'recherche') o.rech = { pourquoi:{} };
  ecrireCacheIA(o);
}

/* 6 h du matin : l'échéance des humeurs. Touchée à 23 h, une humeur tient
   jusqu'au lendemain matin ; touchée à 7 h, jusqu'au matin suivant. */
function prochain6hIA(){
  const d = new Date();
  const cible = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6, 0, 0, 0);
  if(cible.getTime() <= d.getTime()) cible.setDate(cible.getDate() + 1);
  return cible.getTime();
}

/* ------------------------- L'APPEL, ET LUI SEUL -------------------------- */

/* Le relais exige un compte connecté (§4.1) : l'IA coûte, elle n'est pas
   offerte aux visiteurs. Sans compte, on ne tente rien — pas même pour
   récolter un 401 que personne ne lirait. */
function iaJoignable(){
  return typeof sbFetch === 'function' && typeof signedIn === 'function' && signedIn() &&
         !!(db.sync && db.sync.url && db.sync.key);
}

/* Ce que le relais interdit d'écrire, revalidé ICI (défense en profondeur,
   §4.1 : « le client revalide »). Le serveur a déjà refusé ces tournures ; si
   l'une passait malgré tout — gabarit modifié, relais d'une version plus
   ancienne encore déployée — elle ne s'afficherait pas pour autant. */
/* RECOPIÉ MOT POUR MOT de `supabase/functions/ia/gabarits.ts`, et la copie est
   DÉLIBÉRÉE. Le fichier de tests du relais duplique déjà ses longueurs maximales
   pour la même raison : deux barrières qui partagent leur source ne font qu'une
   barrière. Si le gabarit serveur est assoupli un jour, celle-ci tiendra encore,
   et un test le fera remarquer. Un motif de moins ici, c'est une phrase qui
   prête un sentiment à quelqu'un — le §0.4 n'admet pas de « presque ». */
const IA_AFFECT =
  "ador\\w*|aim\\w*|kiff\\w*|d[ée]vor\\w*|d[ée]test\\w*|pr[ée]f[ée]r\\w*|raffol\\w*|" +
  "boulevers\\w*|marqu[ée]\\w*|vibr\\w*|plu\\b|emball\\w*|conquis\\w*|touch[ée]\\w*";
const IA_POSSESSIF =
  "coups? de c(?:œ|oe)ur|chouchou\\w*|favori\\w*|pr[ée]f[ée]r[ée]\\w*|plaisir coupable|" +
  "immanquable\\w*|s[ée]rie culte|film culte|classique absolu";
const IA_INTERDIT = new RegExp([
  "\\btu\\s+(?:[a-zà-ÿ']{1,12}\\s+){0,2}(?:as|avais|es|en)?\\s*(?:" + IA_AFFECT + ")",
  "\\bt'(?:a|as|ont|avait)\\s+(?:[a-zà-ÿ]{1,10}\\s+){0,1}(?:" + IA_AFFECT + ")",
  "\\b(?:ton|ta|tes)\\s+(?:[a-zà-ÿ]{1,12}\\s+){0,2}(?:" + IA_POSSESSIF + ")",
  "\\btu\\s+ne\\s+t'(?:es|en)\\s+(?:\\w+\\s+)?jamais"
].join("|"), "i");

function texteIAAcceptable(s, maxlong){
  if(typeof s !== 'string') return null;
  const v = s.replace(/\s+/g, ' ').trim();
  if(!v) return null;
  if(v.length > maxlong) return null;
  if(IA_INTERDIT.test(v)) return null;
  return v;
}

/* L'appel. Renvoie l'objet du relais, ou `null` — et `null` veut dire « pas
   d'IA cette fois », jamais « réessaie ». Aucun `throw` ne sort d'ici : un
   écran ne tombe pas parce qu'une phrase d'agrément n'est pas venue. */
async function appelIA(tache, params){
  if(!iaJoignable()) return null;
  try{
    const d = await sbFetch('/functions/v1/ia', {
      method: 'POST',
      body: JSON.stringify({ tache: tache, params: params || {} })
    });
    if(!d || typeof d !== 'object' || d.indisponible) return null;
    return d;
  }catch(e){
    /* 400/401/403 sont des fautes de contrat, pas des pannes : les journaliser
       en console est utile au développement et invisible pour la personne. */
    if(e && e.status) console.warn('[ia] ' + tache + ' → ' + e.status + ' ' + e.message);
    return null;
  }
}

/* --------------------- CE QU'ON A LE DROIT D'ENVOYER --------------------- */

/* SPEC-04 §4.1 : « le minimum ». Des titres, des genres, des notes. Jamais un
   pseudo, jamais un identifiant, jamais un historique brut. Le gabarit serveur
   borne déjà ce qui part ; on ne s'en remet pas à lui pour autant — ce qui ne
   quitte pas le téléphone n'a pas besoin d'être filtré à l'arrivée. */
function titresAimesIA(max){
  const out = [];
  try{
    const avis = db.avis || {};
    ['tv', 'movie'].forEach(m=>{
      Object.keys(avis[m] || {}).forEach(id=>{
        if(!avis[m][id] || avis[m][id].v !== 1) return;
        const o = m === 'tv' ? db.shows[id] : db.movies[id];
        const nom = o && (o.name || o.title);
        if(nom) out.push({ nom: nom, quand: avis[m][id].quand || 0 });
      });
    });
  }catch(e){ /* base incomplète : on enverra moins, pas faux */ }
  return out.sort((a, b)=> b.quand - a.quand).slice(0, max || 8).map(x=> x.nom);
}

/* Les genres les plus aimés, en toutes lettres. Ce sont des mots du catalogue
   TMDB, pas des données personnelles. */
function genresAimesIA(max){
  const compte = {};
  try{
    const avis = db.avis || {};
    ['tv', 'movie'].forEach(m=>{
      Object.keys(avis[m] || {}).forEach(id=>{
        if(!avis[m][id] || avis[m][id].v !== 1) return;
        const o = m === 'tv' ? db.shows[id] : db.movies[id];
        ((o && o.genres) || []).forEach(g=>{ const n = String(g).trim(); if(n) compte[n] = (compte[n] || 0) + 1; });
      });
    });
  }catch(e){}
  return Object.keys(compte).sort((a, b)=> compte[b] - compte[a]).slice(0, max || 5);
}

/* « série · 9 épisodes de 45 min », « film · 2 h 07 » — la forme du titre, qui
   aide le modèle à écrire juste sans rien dire de la personne. */
function formeTitreIA(x){
  if(!x) return '';
  if(x.media === 'movie') return 'film';
  return 'série';
}

/* --------------------- LE LOT QUOTIDIEN (SPEC-04 §4.3) -------------------- */

/* Les rangées dont l'intitulé est ÉDITORIAL — un libellé fixe, écrit par nous.
   Les autres portent une donnée dans leur titre (« Parce que tu as aimé Dark »,
   « Avec Gary Oldman », « Top 10 pour toi ») : les faire réécrire ferait perdre
   au passage le nom qui les justifie, et c'est précisément ce que le gabarit
   serveur interdit de perdre. On n'envoie donc que celles-ci. */
/* `cercle` EN EST SORTI (relecture du 10/08). « Vu par tes proches » n'est pas
   un libellé éditorial : il nomme une SOURCE — les bibliothèques du cercle — et
   le §1 rangée 4 demande de la conserver telle quelle. Une réécriture, même
   fidèle, ferait perdre le mot « proches », qui est toute la rangée. */
const IA_RANGEES_LIBELLES = ['acclames', 'weekend', 'pepites', 'classiques',
                             'nouv', 'avenir', 'reste'];

let iaLotEnCours = false;

/* Le déclencheur. Appelé APRÈS le premier rendu de Découvrir (§4.3), jamais
   avant : l'écran doit être à l'image avant qu'on dépense une requête. */
/* DEUX ONGLETS OUVERTS LE MÊME MATIN — relevé en relecture, mesuré à quatre
   requêtes au lieu de deux. `iaLotEnCours` est une variable de module : elle ne
   dit rien à l'autre onglet, et le marqueur de jour n'était écrit qu'APRÈS les
   deux requêtes, donc bien après que le second onglet avait décidé de partir.

   Le verrou est donc posé en localStorage, qui est le seul état partagé entre
   deux onglets, et il est posé AVANT la première requête. Il porte une
   estampille : un onglet fermé au milieu du lot laisserait sinon un verrou
   éternel, et le lot ne se ferait plus jamais. Une minute suffit largement —
   deux requêtes bornées à huit secondes chacune côté serveur. */
const IA_VERROU_CLE = 'ms.ia.verrou.v1';
const IA_VERROU_MS = 60000;

function prendreVerrouIA(){
  try{
    const v = Number(localStorage.getItem(IA_VERROU_CLE) || 0);
    if(v && Date.now() - v < IA_VERROU_MS) return false;
    localStorage.setItem(IA_VERROU_CLE, String(Date.now()));
    return true;
  }catch(e){ return true; }   // pas de stockage : on ne bloque pas le lot
}
function rendreVerrouIA(){
  try{ localStorage.removeItem(IA_VERROU_CLE); }catch(e){}
}

/* SPEC-09 LOT 1 — DEUX TRAVAUX DE FOND, ET UN SEUL À LA FOIS.

   Le lot du jour (pitch et intitulés) ne se fait qu'une fois par journée ; la
   composition des rangées, elle, peut repartir en cours de journée sur un
   SIGNAL FORT — un 👍, un 👎, un duel joué, un ajout. Ils partagent le verrou
   inter-onglets, donc ils ne peuvent pas tourner ensemble de toute façon.

   LE LOT DU JOUR PASSE D'ABORD, et l'ordre compte : c'est lui qui écrit la
   phrase du hero, la seule des deux qui se voit tout de suite. Si la
   composition se servait la première, elle prendrait le verrou à chaque rendu
   tant qu'il lui reste des familles à composer, et le pitch du matin
   arriverait le soir. */
function apresRenduDecouvrirIA(){
  if(!iaActive('decouvrir')) return;
  const o = lireCacheIA();
  if(!iaLotEnCours && o.jour !== todayISO() && prendreVerrouIA()){
    iaLotEnCours = true;
    /* Un tour de boucle d'événements : le rendu en cours se termine, la
       personne voit son écran, et seulement ensuite on parle au réseau. */
    setTimeout(()=>{ lotIAduJour().catch(()=>{}); }, 0);
    return;                              // une chose à la fois
  }
  apresRenduCompoIA();
}

async function lotIAduJour(){
  try{
    const jour = todayISO();
    const o = lireCacheIA();
    if(o.jour === jour) return;

    /* La proposition du jour telle qu'elle est affichée à cet instant. Si elle
       n'existe pas (profil vide, suggestions froides), on ne dépense rien : on
       repassera au prochain rendu, et le marqueur de jour n'est pas posé. */
    const x = (typeof propositionDuJour === 'function') ? propositionDuJour() : null;
    if(!x || !x.nom) return;    // le `finally` rend le verrou et lève le drapeau

    const cle = x.media + ':' + x.id;
    const aimes = titresAimesIA(8);

    /* Les DEUX places du lot, prises avant la première requête (correction de
       relecture, 11/08/2026 — voir le pavé du plafond). Plafond atteint : on
       pose quand même le marqueur de jour dans le `finally` ? Non — on sort
       sans le poser, pour que le lot reparte demain. Un jour où trente pitchs
       ont déjà été demandés n'a pas besoin d'un trente-et-unième. */
    if(!reserverPitchIA(2)) return;

    /* Requête 1 — le pitch du jour. */
    const r1 = await appelIA('pitch_jour', {
      titre: x.nom,
      genres: genresAimesIA(5),
      note: x.note || '',
      forme: formeTitreIA(x),
      aimes: aimes
    });
    const pitch = r1 ? texteIAAcceptable(r1.texte, 220) : null;

    /* Requête 2 — les intitulés de rangées. Elle ne part que si des rangées
       éditoriales sont réellement à l'écran : réécrire des titres que personne
       ne verra serait une requête pour rien. */
    let titres = null;
    const rangees = (typeof rangeesSuggerees === 'function') ? rangeesSuggerees() : [];
    const cles = rangees.map(r=> r.cle).filter(c=> IA_RANGEES_LIBELLES.indexOf(c) >= 0).slice(0, 12);
    if(cles.length){
      const base = rangees.filter(r=> cles.indexOf(r.cle) >= 0).map(r=> r.titre);
      const r2 = await appelIA('intitules_rangees', { intitules: base });
      const l = (r2 && Array.isArray(r2.textes)) ? r2.textes : null;
      /* Autant de textes que de titres envoyés, dans le même ordre — le relais
         le promet, on le vérifie. Un décalage renommerait une rangée avec le
         titre d'une autre : le dégradé est mille fois préférable. */
      if(l && l.length === cles.length){
        titres = {};
        for(let i = 0; i < cles.length; i++){
          const v = texteIAAcceptable(l[i], 60);
          if(v) titres[cles[i]] = v;
        }
        if(!Object.keys(titres).length) titres = null;
      }
    }

    /* Requête 3 et suivantes — SPEC-09 lot 1 : ranger les rangées locales, et
       contrôler la cohérence des éditoriales. Une requête par rangée
       RÉELLEMENT à l'écran ; `rangees` a déjà été calculé plus haut pour les
       intitulés, on ne le redemande pas (il a des effets de bord persistés). */
    const ordres = await ordresIAduJour(rangees);

    /* Le marqueur de jour se pose même si les requêtes ont échoué : une journée
       de dégradé silencieux vaut mieux qu'un écran qui redemande à chaque
       repeint. C'est la lecture stricte de « une tentative, pas de rafale »
       appliquée à la journée entière. */
    const maj = lireCacheIA();
    maj.jour = jour;
    maj.pitch = pitch ? { cle: cle, texte: pitch } : null;
    maj.titres = titres;
    /* SPEC-09 lot 1 — l'ordre du jour des rangées locales. `null` veut dire
       « aucune n'a répondu » : chaque rangée garde alors son ordre local, ce
       qui est le dégradé exigé par la borne 4 de la spec. */
    maj.ordres = ordres;
    /* RETOUR-01 point 5 — le résultat va dans le cache par titre comme les
       autres. Le lot n'est plus un cas à part : c'est le premier pitch de la
       journée, rien de plus. Les places, elles, ont été prises AU DÉPART, en
       tête de cette fonction. */
    maj.pitchs.t['-:' + cle] = pitch || '';
    ecrireCacheIA(maj);

    if(typeof view !== 'undefined' && view === 'discover' && typeof peindreDisc === 'function')
      peindreDisc();
  }finally{
    iaLotEnCours = false;
    rendreVerrouIA();
  }
}

/* Ce que la vitrine lit. Rendre `null` veut dire « garde ta ligne au cœur » —
   il n'y a pas de phrase creuse de remplacement (§3).

   RETOUR-01 POINT 5 — elle lit d'abord le cache PAR TITRE, puis retombe sur
   l'ancienne case unique du lot du jour. La double lecture n'est pas une
   hésitation : un cache écrit par la version d'hier (`ms.ia.v1` ne change pas
   de nom) doit continuer d'afficher son pitch, sinon la première ouverture
   après mise à jour perd la phrase du matin pour rien. */
function pitchIAduJour(x){
  if(!x || !iaActive('decouvrir')) return null;
  const o = lireCacheIA();
  const cle = x.media + ':' + x.id;
  const v = o.pitchs.t['-:' + cle];
  if(typeof v === 'string') return v ? texteIAAcceptable(v, 220) : null;
  if(o.jour !== todayISO() || !o.pitch) return null;
  if(o.pitch.cle !== cle) return null;                    // la proposition a tourné
  return texteIAAcceptable(o.pitch.texte, 220);
}

/* ---- RETOUR-01 POINT 5 : LE PITCH SUIT LE HERO, ET S'ARRÊTE À TRENTE ----

   CE QUI N'ALLAIT PAS. Le pitch ne couvrait que la PREMIÈRE proposition du
   jour. Un « Pas pour moi » et la proposition suivante retombait sur la ligne
   ❤ socle — vérifié, zéro appel. Trois gestes changent le hero : « Pas pour
   moi », changer de famille, poser ou retirer une humeur. Aucun des trois ne
   demandait de pitch.

   CE QUE ÇA FAIT MAINTENANT. À chaque rendu de la vitrine, on regarde le hero
   affiché : s'il n'a pas encore de pitch en cache, on en demande un. Une
   requête par TITRE, jamais par rendu — le cache est la garde, et il retient
   aussi les échecs (chaîne vide), sans quoi un repeint suffirait à redemander.

   NON BLOQUANT, ET C'EST LA MOITIÉ DU POINT. La ligne socle est déjà à
   l'écran ; le pitch la remplace quand il arrive, par un repeint ciblé de
   Découvrir. Rien n'attend, rien ne clignote, et si le pitch n'arrive jamais
   la ligne socle reste — mot pour mot, comme le §3 l'exige.

   LE PLAFOND : TRENTE PAR JOUR, puis socle silencieux. C'est le chiffre du
   RETOUR, et il vaut la peine de dire ce qu'il n'est PAS. Le commentaire
   d'origine affirmait que trente était « le budget par personne du relais, donc
   un plafond plus haut ne récolterait que des refus ». C'est faux, et la
   relecture l'a relevé : `BUDGET_UTILISATEUR_JOUR` est PARTAGÉ par les sept
   tâches — un plafond de trente sur les seuls pitchs garantit au contraire des
   refus serveur sur les autres. Trente est donc un plafond de CONFORT, pas une
   déduction : au-delà de trente propositions dans la journée, on n'est plus en
   train de choisir un film. Ça dégrade proprement dans tous les cas (refus
   serveur → `{indisponible}` → socle), mais le raisonnement écrit devait être
   juste.

   LE COMPTEUR SE PREND AU DÉPART, PAS AU RETOUR — CORRECTION DE RELECTURE
   (11/08/2026). Il était incrémenté à l'arrivée de la réponse : toute requête
   en vol était donc invisible du plafond, et `iaPitchsEnCours` ne gardait qu'une
   clé identique. Mesuré par le relecteur avec des valeurs réalistes (un « Pas
   pour moi » toutes les 700 ms, réponse en 2,5 s) : depuis n = 29, QUATRE
   appels partaient et n finissait à 33. Le critère « le 31ᵉ du jour ne part
   pas » n'était pas tenu.
   `reserverPitchIA()` prend la place AVANT d'appeler : le plafond compte des
   DÉPARTS, ce qui est la seule chose qu'il puisse honnêtement borner. Et le lot
   du jour, qui fait DEUX requêtes, en réserve deux ; le pitch d'humeur, qui en
   faisait une sans jamais compter, réserve la sienne.

   CE QU'IL NE FAUT PAS FAIRE : déclencher depuis `pitchOuRaison`. Elle est
   appelée à chaque construction de HTML, y compris par les tests et par les
   repeints partiels. Le déclenchement reste APRÈS le rendu (§4.4), au même
   endroit que le lot du jour. */
const IA_PITCH_MAX = 30;
let iaPitchsEnCours = {};

/* Prend `n` places dans le plafond du jour, ou rend `false` si elles n'y sont
   plus. Écrit tout de suite : une réservation qui attendrait la réponse ne
   réserverait rien. */
function reserverPitchIA(n){
  const combien = n || 1;
  const o = lireCacheIA();
  if(o.pitchs.n + combien > IA_PITCH_MAX) return false;
  o.pitchs.n += combien;
  ecrireCacheIA(o);
  return true;
}

function clePitchIA(hum, x){ return (hum || '-') + ':' + x.media + ':' + x.id; }

function toucherPitchHeroIA(){
  if(!iaActive('decouvrir')) return;
  /* Le lot du jour n'est pas encore passé : c'est LUI qui fera le premier
     pitch, avec son verrou inter-onglets. Deux demandes pour le même titre le
     même matin, c'est exactement ce que ce verrou existe pour éviter. */
  if(iaLotEnCours) return;
  const o = lireCacheIA();
  if(o.jour !== todayISO()) return;
  const x = (typeof propositionDuJour === 'function') ? propositionDuJour() : null;
  if(!x || !x.nom) return;
  const hum = (typeof humeurActive === 'function') ? humeurActive() : null;
  const k = clePitchIA(hum, x);
  if(typeof o.pitchs.t[k] === 'string') return;      // déjà demandé, réussi ou non
  /* Une humeur fraîchement posée a son propre chemin (`toucherHumeurIA`) et sa
     propre échéance à 6 h : on ne double pas sa requête. On ne prend le relais
     que lorsque SA case ne parle plus du titre affiché — c'est-à-dire après un
     « Pas pour moi » à l'intérieur de l'humeur. */
  if(hum){
    const e = o.humeurs[hum];
    if(iaHumeursEnCours[hum]) return;
    if(e && e.jusqua > Date.now() && e.cle === x.media + ':' + x.id) return;
  }
  if(iaPitchsEnCours[k]) return;
  /* Sans relais joignable, aucune requête ne partirait : on ne consomme pas une
     place du plafond pour un appel qui n'aura pas lieu. */
  if(!iaJoignable()) return;
  if(!reserverPitchIA(1)) return;                    // plafond atteint : socle silencieux
  iaPitchsEnCours[k] = true;
  setTimeout(()=>{ pitchHeroIA(k, hum, x).catch(()=>{}); }, 0);
}

async function pitchHeroIA(k, hum, x){
  try{
    const hdef = (hum && typeof humeurDef === 'function') ? humeurDef(hum) : null;
    /* `pms` et non `params` : `params` est un nom d'état partagé du dépôt, et
       le contrôle n° 5 du lanceur de tests refuse — à juste titre — qu'un
       fichier écrive un nom qui ne lui a pas été ouvert, fût-ce dans une
       portée locale. Le contrôle est statique ; il a raison de l'être. */
    const pms = {
      titre: x.nom,
      genres: genresAimesIA(5),
      note: x.note || '',
      forme: formeTitreIA(x),
      aimes: titresAimesIA(8)
    };
    if(hdef) pms.humeur = hdef.label;
    const r = await appelIA(hdef ? 'pitch_humeur' : 'pitch_jour', pms);
    const texte = r ? texteIAAcceptable(r.texte, 220) : null;
    /* On relit le cache au retour : une autre demande a pu aboutir entre-temps.
       Le compteur, lui, a déjà été pris au départ (`reserverPitchIA`) — le
       toucher ici compterait deux fois. */
    const o = lireCacheIA();
    o.pitchs.t[k] = texte || '';
    ecrireCacheIA(o);
    if(!texte) return;
    /* Le hero a pu tourner pendant la requête : on ne repeint que si la phrase
       qui vient de rentrer est celle du titre affiché. Sinon elle attendra
       tranquillement dans son cache — revenir dessus ne recoûtera rien. */
    const encore = (typeof propositionDuJour === 'function') ? propositionDuJour() : null;
    const humNow = (typeof humeurActive === 'function') ? humeurActive() : null;
    if(!encore || clePitchIA(humNow, encore) !== k) return;
    if(typeof view !== 'undefined' && view === 'discover' && typeof peindreDisc === 'function')
      peindreDisc();
  }finally{
    delete iaPitchsEnCours[k];
  }
}

function intituleIA(cle, defaut){
  if(!iaActive('decouvrir')) return defaut;
  const o = lireCacheIA();
  if(o.jour !== todayISO() || !o.titres) return defaut;
  const v = o.titres[cle];
  return (typeof v === 'string' && v) ? v : defaut;
}

/* ===========================================================================
   SPEC-09 LOT 1 §1.B et §1.C — L'IA RANGE LES RANGÉES LOCALES, ET EN ÉCARTE

   Décision d'Adrien du 31/08 : « L'IA compose une partie des rangées, les
   autres restent locales (Bientôt, Nouveautés, Vu par tes proches), mais
   vérifié sur TMDB » — puis, le même jour : « j'aimerais quand même que l'IA
   check ça pour être sûr de la cohérence avec le profil : Acclamés, Pépites,
   Week-end, Classiques, Incontournables. »

   DEUX NIVEAUX, ET LA DIFFÉRENCE COMPTE :
     · les ÉDITORIALES sont rangées ET contrôlées — un titre qui jure
       franchement avec le profil sort de la rangée ;
     · `nouv` et `cercle` sont seulement RANGÉES. « Vu par tes proches » est un
       FAIT SOCIAL, pas une suggestion : écarter un titre qu'un proche a
       réellement vu, ce serait effacer une information vraie parce qu'elle ne
       plaît pas. Et une nouveauté écartée serait une nouveauté cachée.
     · `avenir` (« Bientôt ») n'est NI rangée NI contrôlée, et la spec y insiste
       en toutes lettres : c'est un CALENDRIER, l'ordre EST l'information. Un
       titre qui « ne correspond pas au profil » y a sa place, puisque ce qu'on
       annonce est une DATE. Son absence de cette liste est la ligne la plus
       importante du lot.

   QUAND ÇA SE CALCULE : dans le lot du jour, APRÈS le premier rendu, jamais
   avant. Ce qui s'affiche aujourd'hui est ce qui a été calculé au lot
   précédent — donc rien ne bouge sous le doigt, c'est la règle transverse du
   dépôt et elle prime sur la fraîcheur.
   =========================================================================== */

/* Les rangées CONTRÔLÉES (rangées + écartées). Ce sont exactement les cinq que
   la phrase d'Adrien nomme. `incont` est la clé de la décennie du jour — les
   « incontournables des années 90 » s'affichent sous cette clé-là, pas sous
   « 1990 ». */
const IA_RANGEES_CONTROLE = ['acclames', 'weekend', 'pepites', 'classiques', 'incont'];
/* Les rangées seulement RANGÉES. Voir le pavé : on ne cache pas un fait. */
const IA_RANGEES_ORDRE_SEUL = ['nouv', 'cercle'];

/* LE PLAFOND D'ÉCARTÉS — 40 % de la liste soumise (spec §1.C, borne 2).
   Au-delà, l'IA ne contrôle plus, elle recompose : on garde alors son ORDRE et
   on ignore les écartés en trop, les moins bien classés revenant en premier.
   C'est le comportement que la spec décrit mot pour mot, et il vaut mieux qu'un
   rejet total : l'ordre, lui, était bon. */
const IA_ECARTES_MAX_PCT = 0.40;
/* Combien de titres on soumet au jugement. La rangée n'en affiche que dix
   (`RANGEE_APERCU`) : en soumettre vingt laisse de quoi absorber les écartés
   SANS descendre chercher, plus bas dans la liste, des titres que l'IA n'aurait
   jamais vus. C'est la décision d'Adrien du 02/09 — « on n'a qu'à faire une
   requête plus importante à TMDB » — et c'est ce qui fait qu'un titre écarté
   n'est jamais remplacé par un titre non contrôlé. */
const IA_ORDRE_SOUMIS = 20;

/* La ligne d'un titre telle que le modèle la lit. Le même format que
   `classer_grille` : « 0. Whiplash (2014) · drame, musique · 8,4 ». Aucun
   identifiant ne part — le gabarit serveur les retirerait de toute façon, et
   le modèle n'en a aucun usage. */
function ligneTitreIA(x){
  const nom = String((x && x.nom) || '').slice(0, 70);
  if(!nom) return '';
  const an = String((x && x.date) || '').slice(0, 4);
  /* Les genres partent EN TOUTES LETTRES : un identifiant TMDB ne dit rien à un
     modèle, et `nomGenreParId` est déjà la traduction qu'emploie tout l'écran
     Découvrir. Sans nom de genre, le contrôle de cohérence n'aurait rien à
     confronter aux « genres écartés » du profil. */
  const g = ((x && x.genre_ids) || []).slice(0, 3)
    .map(id => (typeof nomGenreParId === 'function') ? nomGenreParId(x.media, id) : '')
    .filter(Boolean).join(', ');
  const n = (x && typeof x.note === 'number' && x.note > 0) ? x.note.toFixed(1) : '';
  return [nom + (an ? ' (' + an + ')' : ''), g, n].filter(Boolean).join(' · ');
}
/* La clé stable d'un titre. C'est elle qu'on stocke, JAMAIS l'indice : la liste
   est recalculée à chaque chargement de suggestions, et un indice mémorisé la
   veille désignerait alors n'importe quoi. */
function cleTitreIA(x){ return (x && x.media ? x.media : '') + ':' + (x && x.id); }

/* ------------------------- LA LECTURE (à chaque rendu) -------------------------

   SYNCHRONE, ET SANS LE MOINDRE APPEL RÉSEAU. Elle lit ce que le lot de la
   veille a écrit. C'est le même motif qu'`intituleIA`, et pour la même raison :
   ce qui s'affiche aujourd'hui a été décidé avant, donc rien ne bouge sous le
   doigt de personne.

   LES QUATRE BORNES DE LA SPEC SONT TENUES ICI, ET C'EST LE SEUL ENDROIT :
     1. RIEN N'EST AJOUTÉ. On part de la liste locale et on la RÉORDONNE ; une
        clé mémorisée qui ne correspond à aucun titre de la liste du jour est
        ignorée. La source reste la requête TMDB, donc « Acclamés par la
        critique » reste vrai.
     2. Le plafond de 40 % a déjà été appliqué à l'écriture (`ordonnerRangeeIA`).
     3. LA RÈGLE DES 10 PRIME. Si les écartés font passer la rangée sous
        `RANGEE_MINI`, on en réintègre juste assez pour repasser la barre — et
        on réintègre les DERNIERS écartés, ceux dont le modèle a parlé en
        dernier. Une rangée n'est jamais maigre, et jamais supprimée.
     4. ÉCHEC = ORDRE LOCAL. Pas de mémoire, IA éteinte, réponse d'hier : on
        rend la liste telle qu'elle est arrivée. Aucun écran ne se vide.

   CE QU'ELLE NE FAIT PAS : aller chercher un remplaçant plus bas dans la liste
   TMDB. Un titre écarté est remplacé par un titre que l'IA A VU ET RANGÉ — on
   lui en soumet vingt pour n'en afficher que dix, justement pour ça. Descendre
   à l'aveugle ramènerait des titres jamais contrôlés dans une rangée qu'on
   présente comme contrôlée, ce qui est pire que de ne rien contrôler. */
/* « Bientôt » NE PASSE JAMAIS PAR L'IA, et la garde est écrite deux fois : ici,
   et dans la liste des rangées éligibles au calcul. C'est volontairement
   redondant. La spec en fait sa phrase la plus catégorique — « `avenir` est
   hors de tout ça : ni réordonné, ni contrôlé, ni écarté » — parce qu'un
   calendrier dont on change l'ordre n'est plus un calendrier, et qu'un titre
   retiré d'un calendrier est une sortie qu'on ne verra pas venir. Une seule
   garde, côté calcul, laisserait un cache forgé ou une version future rouvrir
   le chemin ; celle-ci ferme la porte à l'endroit où l'ordre s'applique. */
const IA_RANGEE_INTOUCHABLE = 'avenir';

function ordreIARangee(cle, liste){
  if(cle === IA_RANGEE_INTOUCHABLE) return liste;
  if(!Array.isArray(liste) || liste.length < 2) return liste;
  if(!iaActive('decouvrir')) return liste;
  const o = lireCacheIA();
  if(o.jour !== todayISO() || !o.ordres) return liste;
  const v = o.ordres[cle];
  if(!v || !Array.isArray(v.ids) || !v.ids.length) return liste;

  const parCle = {};
  liste.forEach(x => { parCle[cleTitreIA(x)] = x; });
  const pris = {};
  const rangs = [];
  v.ids.forEach(c => {
    if(!parCle[c] || pris[c]) return;    // borne 1 : on n'ajoute jamais rien
    pris[c] = true;
    rangs.push(parCle[c]);
  });
  if(!rangs.length) return liste;

  /* Les écartés, puis TOUT LE RESTE de la liste locale dans son ordre d'origine
     — les titres que l'IA n'a pas vus (au-delà des vingt soumis) gardent leur
     place derrière ceux qu'elle a rangés. */
  const hors = {};
  (Array.isArray(v.hors) ? v.hors : []).forEach(c => { if(parCle[c]) hors[c] = true; });
  const suite = liste.filter(x => !pris[cleTitreIA(x)] && !hors[cleTitreIA(x)]);
  let out = rangs.concat(suite);

  /* BORNE 3 — LA RÈGLE DES 10 PRIME SUR LE CONTRÔLE. On réintègre les derniers
     écartés jusqu'à repasser le plancher : mieux vaut un titre discutable qu'une
     rangée maigre, et la spec tranche exactement dans ce sens. */
  const mini = (typeof RANGEE_MINI === 'number') ? RANGEE_MINI : 10;
  if(out.length < mini){
    const repris = (Array.isArray(v.hors) ? v.hors : []).slice().reverse()
      .map(c => parCle[c]).filter(Boolean);
    for(const x of repris){
      if(out.length >= mini) break;
      out.push(x);
    }
  }
  return out;
}

/* --------------------------- LE CALCUL (une fois par jour) --------------------------- */

/* Le tour complet : une requête par rangée éligible RÉELLEMENT à l'écran.
   Rend `{cle: {ids, hors}}`, ou `null` si rien n'a abouti.

   LES PLACES SE PRENNENT UNE PAR UNE, juste avant chaque requête, et pas en
   bloc au départ. En bloc, un plafond atteint aurait fait sauter TOUT le
   contrôle alors que deux rangées tenaient encore ; une par une, on range ce
   qu'on peut et on s'arrête où le budget s'arrête. Les rangées non traitées
   gardent simplement leur ordre local — c'est le dégradé, pas une panne.

   SÉQUENTIEL, JAMAIS EN PARALLÈLE. Sept requêtes lancées ensemble, c'est un
   429 sur le fournisseur, donc l'échelle qui descend, donc des réponses moins
   bonnes pour tout le monde — et ce lot tourne APRÈS le rendu, personne
   n'attend. */
async function ordresIAduJour(rangees){
  const eligibles = (rangees || []).filter(r =>
    r && r.l && r.l.length &&
    (IA_RANGEES_CONTROLE.indexOf(r.cle) >= 0 || IA_RANGEES_ORDRE_SEUL.indexOf(r.cle) >= 0));
  if(!eligibles.length) return null;
  const out = {};
  for(const r of eligibles){
    /* ON PREND LES PLACES DANS LE MÊME COMPTEUR QUE LES PITCHS, et c'est un
       choix, pas une facilité. `IA_PITCH_MAX` est un plafond de CONFORT côté
       client : il borne ce que Découvrir dépense en une journée, toutes tâches
       confondues. Depuis que le plafond par utilisateur est supprimé côté
       serveur (01/09), c'est le dernier frein journalier qui existe — lui
       donner un second compteur privé reviendrait à le contourner. Sept
       rangées prennent donc sept places sur les trente : le pitch du hero, qui
       est le plus visible, garde les vingt-trois autres. */
    if(!reserverPitchIA(1)) break;      // plafond de confort atteint : on s'arrête
    let o = null;
    try{ o = await ordonnerRangeeIA(r, IA_RANGEES_CONTROLE.indexOf(r.cle) >= 0); }
    catch(e){ o = null; }
    if(o) out[r.cle] = o;
  }
  return Object.keys(out).length ? out : null;
}

/* Une rangée, une requête. Rend `{ids, hors}` — les clés gardées dans le nouvel
   ordre, et les clés écartées — ou `null` si rien d'exploitable.
   `avecEcartes` à faux : on ignore ce que le modèle a pu écarter. */
async function ordonnerRangeeIA(r, avecEcartes){
  const liste = ((r && r.l) || []).slice(0, IA_ORDRE_SOUMIS);
  if(liste.length < 4) return null;      // trop court pour que ranger ait un sens
  const lignes = liste.map(ligneTitreIA);
  if(lignes.some(x => !x)) return null;  // une liste incomplète ne se juge pas
  const d = await appelIA('ordonner_rangee', {
    rangee: String(r.titre || '').slice(0, 60),
    candidats: lignes,
    profil: profilBancIA(),
    ecartes: genresEcartesBancIA()
  });
  if(!d || !Array.isArray(d.ordre) || !d.ordre.length) return null;

  const dedans = {};
  const ids = [];
  d.ordre.forEach(i => {
    const x = liste[i];
    if(!x || dedans[cleTitreIA(x)]) return;
    dedans[cleTitreIA(x)] = true;
    ids.push(cleTitreIA(x));
  });
  if(!ids.length) return null;

  /* LE PLAFOND DES 40 % (spec §1.C, borne 2), APPLIQUÉ ICI PARCE QUE C'EST ICI
     QU'ON SAIT COMBIEN DE TITRES ONT ÉTÉ SOUMIS — le relais, lui, ne le sait
     pas. Au-delà, « on garde l'ordre proposé et on ignore les écartés en
     trop » : on retient les premiers de la liste rendue par le modèle, les
     suivants REVIENNENT dans la rangée. Une IA qui écarte les trois quarts
     d'une rangée ne contrôle plus, elle recompose. */
  let hors = [];
  if(avecEcartes && Array.isArray(d.ecartes)){
    hors = d.ecartes.map(e => liste[e && e.i]).filter(Boolean).map(cleTitreIA)
                    .filter(c => !dedans[c]);
    const max = Math.floor(liste.length * IA_ECARTES_MAX_PCT);
    if(hors.length > max) hors = hors.slice(0, max);
  }
  return { ids: ids, hors: hors };
}

/* ---------------------- LES HUMEURS (SPEC-04 §2) ------------------------- */

/* UNE requête par humeur touchée, cache jusqu'à 6 h. Un second appui le même
   soir ne coûte rien — et un second appui qui DÉSÉLECTIONNE l'humeur ne coûte
   rien non plus, forcément : on ne touche à l'IA que quand une humeur devient
   active.

   POURQUOI `pitch_humeur` ET PAS `profil_humeur` — décision du 10/08, à
   soumettre à Adrien. Le §2 demande deux choses de l'IA : (a) affiner la
   recette selon le profil, (b) écrire le pitch du hero. Mais il n'accorde
   qu'UNE requête par humeur, et le relais du lot B rend, pour `profil_humeur`,
   une PHRASE (`{texte}` de 120 caractères), pas des critères TMDB. Une phrase
   ne peut pas affiner une requête `/discover` sans qu'on se mette à deviner des
   mots-clés dans du texte libre — exactement le genre d'à-peu-près que le §0.4
   proscrit ailleurs. L'affinage est donc fait ICI, localement et gratuitement,
   à partir des 👍/👎 (voir `recetteAffineeHumeur`), et la requête unique va au
   pitch, qui est la seule des deux moitiés que la personne voit.
   `profil_humeur` reste dans la liste blanche du relais, sans appelant, en
   attendant un lot qui lui donnera un schéma de critères. */

let iaHumeursEnCours = {};

function toucherHumeurIA(cle){
  if(!cle || !iaActive('decouvrir')) return;
  if(iaHumeursEnCours[cle]) return;
  const o = lireCacheIA();
  const e = o.humeurs[cle];
  if(e && e.jusqua > Date.now()) return;         // cache encore bon
  iaHumeursEnCours[cle] = true;
  setTimeout(()=>{ lotHumeurIA(cle).catch(()=>{}); }, 0);
}

/* C-2 (relecture du 10/08) — LE PITCH D'HUMEUR N'ARRIVAIT JAMAIS, ET AUCUN TEST
   NE LE DISAIT.

   `setHumeur` appelle `toucherHumeurIA` juste après `render()`. Mais une humeur
   a sa PROPRE case de cache de suggestions, vide au premier appui : le rendu
   qui vient de partir a lancé le chargement, il n'est pas revenu.
   `propositionDuJour()` rendait donc `null`, et la fonction sortait — sans
   appeler le relais, et sans même poser d'échéance. Le second appui, lui,
   DÉSÉLECTIONNE l'humeur. En usage nominal — un appui, on regarde — le pitch
   n'apparaissait donc jamais. Mesuré par le relecteur : appels = [], cache null.

   On attend maintenant que la proposition de l'humeur existe, par petits pas et
   avec une borne. Attendre n'est pas bloquer : personne n'attend cette
   promesse, l'écran est déjà à l'image depuis le `render()` de `setHumeur`, et
   au pire il ne se passe rien de plus qu'avant. La borne existe pour qu'une
   humeur qui ne rend rien (recette vide, réseau coupé) ne laisse pas un
   minuteur tourner en fond. */
const IA_ATTENTE_PAS = 400;
/* `let` et non `const` : la suite de tests raccourcit cette borne pour éprouver
   le COMPORTEMENT au bout de l'attente sans attendre huit secondes. Ce qui est
   testé reste le code de production — seule la durée change, et c'est
   exactement ce qu'un test a le droit de faire varier. */
let IA_ATTENTE_MAX = 8000;

function attendreProposition(){
  return new Promise(ok=>{
    const debut = Date.now();
    const voir = ()=>{
      const x = (typeof propositionDuJour === 'function') ? propositionDuJour() : null;
      if(x && x.nom) return ok(x);
      if(Date.now() - debut >= IA_ATTENTE_MAX) return ok(null);
      setTimeout(voir, IA_ATTENTE_PAS);
    };
    voir();
  });
}

async function lotHumeurIA(cle){
  try{
    const hdef = (typeof humeurDef === 'function') ? humeurDef(cle) : null;
    if(!hdef) return;
    const x = await attendreProposition();
    /* Toujours rien au bout de la borne : on ne pose PAS d'échéance, pour que
       le prochain appui puisse réessayer. Une humeur sans proposition n'est pas
       une humeur dont le pitch a échoué — c'est une humeur qui n'a rien à
       raconter encore. */
    if(!x || !x.nom) return;
    /* L'humeur a pu être retirée pendant l'attente : on ne dépense pas une
       requête pour un écran qu'on ne regarde plus. */
    if(typeof humeurActive === 'function' && humeurActive() !== cle) return;
    /* Correction de relecture (11/08/2026) — ce chemin-ci faisait une requête
       sans jamais toucher le compteur du jour : le plafond du point 5 ignorait
       purement et simplement les pitchs d'humeur. Il en prend une place, comme
       tout le monde. */
    if(!reserverPitchIA(1)) return;
    const r = await appelIA('pitch_humeur', {
      titre: x.nom,
      humeur: hdef.label,
      genres: genresAimesIA(5),
      note: x.note || '',
      forme: formeTitreIA(x),
      aimes: titresAimesIA(8)
    });
    const texte = r ? texteIAAcceptable(r.texte, 220) : null;
    const o = lireCacheIA();
    /* Échec compris : on pose quand même l'échéance, sinon chaque repeint de
       l'écran relancerait une requête (§4.4, « cache d'abord »). */
    o.humeurs[cle] = { jusqua: prochain6hIA(), cle: x.media + ':' + x.id, texte: texte || '' };
    ecrireCacheIA(o);
    if(typeof view !== 'undefined' && view === 'discover' && typeof peindreDisc === 'function')
      peindreDisc();
  }finally{
    delete iaHumeursEnCours[cle];
  }
}

function pitchIAHumeur(cle, x){
  if(!cle || !x || !iaActive('decouvrir')) return null;
  const o = lireCacheIA();
  const e = o.humeurs[cle];
  if(e && e.jusqua > Date.now() && e.texte && e.cle === x.media + ':' + x.id)
    return texteIAAcceptable(e.texte, 220);
  /* RETOUR-01 point 5 — la case d'humeur ne porte QU'UN titre, celui qui était
     à l'écran quand l'humeur a été posée. Après un « Pas pour moi » à
     l'intérieur de l'humeur, c'est le cache par titre qui prend le relais. */
  const v = o.pitchs.t[cle + ':' + x.media + ':' + x.id];
  return (typeof v === 'string' && v) ? texteIAAcceptable(v, 220) : null;
}

/* ------------- L'AFFINAGE LOCAL DE LA RECETTE D'HUMEUR (§2 a) ------------- */

/* Sans une seule requête, et sans une seule ligne de hasard : « Frissonner »
   pour quelqu'un qui a mis 👍 à des thrillers psychologiques et 👎 à des films
   d'horreur sanglants doit écarter le gore ; pour quelqu'un qui fait l'inverse,
   non. On lit les genres des titres notés et on en tire un réglage, que
   `requeteHumeur` applique par-dessus sa recette de base.

   Le mécanisme est volontairement pauvre : deux réglages, pas douze. Un
   réglage qu'on ne sait pas mesurer est un réglage qu'on ne pose pas. */
const IA_GENRES_DURS = /horreur|horror/i;
const IA_GENRES_TENDUS = /thriller|myst(è|e)re|mystery|crime|drame|drama/i;

function recetteAffineeHumeur(cle){
  const out = { sansGore: false, court: false };
  if(cle !== 'frisson' && cle !== 'detente') return out;
  let durs = 0, tendus = 0;
  try{
    const avis = db.avis || {};
    ['tv', 'movie'].forEach(m=>{
      Object.keys(avis[m] || {}).forEach(id=>{
        const a = avis[m][id];
        if(!a || (a.v !== 1 && a.v !== -1)) return;
        const o = m === 'tv' ? db.shows[id] : db.movies[id];
        const g = ((o && o.genres) || []).join(' ');
        if(IA_GENRES_DURS.test(g)) durs += a.v;
        if(IA_GENRES_TENDUS.test(g)) tendus += a.v;
      });
    });
  }catch(e){ return out; }
  /* On n'écarte le gore que si le profil le dit DEUX FOIS : de la tension
     aimée, et de l'horreur pas aimée. Un seul des deux serait du bruit. */
  if(cle === 'frisson') out.sansGore = (durs <= 0 && tendus > 0);
  return out;
}

/* ------------------ LA MOITIÉ PERSONNELLE DE « BIENTÔT » ------------------ */

/* R7 — décision d'Adrien du 10/08 : `bientotPerso` est ACTIVÉ, avec un budget
   de requêtes borné. Le lot A l'avait laissé de côté pour une raison chiffrée
   (une à deux requêtes par film suivi, à chaque ouverture de Découvrir) ; la
   décision ne dit pas de l'ignorer, elle dit de le borner. Trois bornes, donc :

   1. LE CACHE DES DATES EST PERSISTÉ 24 H (app-10, `datesFR`). Il était en
      mémoire : il mourait avec l'onglet, et la première ouverture du lendemain
      repayait tout. Persisté, le jour 2 coûte zéro requête.
   2. LE CALCUL EST DÉCLENCHÉ UNE FOIS PAR JOUR AU PLUS, à la première ouverture,
      en arrière-plan, jamais bloquant.
   3. LE PAQUET EST PLAFONNÉ (`BIENTOT_MAX_FILMS`, app-10). Une liste « à voir »
      de deux cents films ne justifie pas deux cents requêtes ; au-delà, on
      prend les plus récemment ajoutés et on le dit plutôt que de le taire.

   Le piège que la décision d'Adrien signale explicitement : `chargerBientotPerso`
   s'invalide sur la LISTE des films suivis (sa clé est la liste entière), donc
   ajouter un film relance tout le paquet. Avec le cache par film persisté,
   « tout le paquet » ne coûte plus qu'un film : les autres sont déjà connus.
   C'est la forme demandée — « un cache par film, la liste recalculée
   librement ». */
const IA_BIENTOT_CLE = 'ms.bientot.v1';

function bientotDejaFaitAujourdhui(){
  try{ return localStorage.getItem(IA_BIENTOT_CLE) === todayISO(); }catch(e){ return true; }
}

function marquerBientotDuJour(){
  try{ localStorage.setItem(IA_BIENTOT_CLE, todayISO()); }catch(e){}
}

/* Appelé après le premier rendu de Découvrir du jour, comme le lot IA — et
   pour la même raison. Sans rapport avec l'interrupteur IA : « Bientôt » n'a
   jamais rien demandé à un modèle, c'est du calendrier. */
function amorcerBientotDuJour(){
  if(bientotDejaFaitAujourdhui()) return;
  if(typeof chargerBientotPerso !== 'function' || typeof filmsSuivisIds !== 'function') return;
  const ids = filmsSuivisIds();
  if(!ids.length){ marquerBientotDuJour(); return; }
  marquerBientotDuJour();
  setTimeout(()=>{ Promise.resolve(chargerBientotPerso()).catch(()=>{}); }, 1200);
}

/* C-1 (relecture du 10/08) — CE QUI SUIVAIT `chargerBientotPerso` A ÉTÉ RETIRÉ,
   ET LE COMMENTAIRE QUI LE JUSTIFIAIT ÉTAIT FAUX.

   Il disait : « recomposer les suggestions suffit — c'est gratuit, tout est
   déjà en mémoire ». Ce n'est pas ce que fait `oublierSuggestions` (app-11) :
   elle pose `perime = true` ET `quand = 0` sur TOUTES les cases, ce qui force
   un recalcul complet de la vitrine. Mesuré par le relecteur, interrupteur IA
   ÉTEINT, 80 films à voir, première ouverture du jour : 115 requêtes TMDB
   ajoutées — 60 pour les dates, et 55 pour une vitrine reconstruite une seconde
   fois dans la même journée, sous les yeux, une à trois secondes après l'entrée.

   Deux règles étaient enfreintes d'un coup, et c'est ce qui rend le retrait
   évident plutôt que discutable :

   · §1, « JAMAIS DE CHANGEMENT SOUS LE DOIGT » — « tout renouvellement se
     calcule la nuit ou à l'ENTRÉE sur l'onglet ; jamais pendant que l'écran est
     affiché ». Un repeint 1 à 3 s après l'entrée est très exactement ça.
   · §6, « le quota TMDB d'une session normale n'explose pas ».

   CE QU'ON FAIT À LA PLACE : rien. On charge les dates, on les range dans leur
   cache persisté, et la rangée « Bientôt » les prendra à sa PROCHAINE
   composition naturelle — c'est-à-dire à la première ouverture du lendemain
   (`SUGG_TTL` vaut 24 h) ou dès qu'un goût change, ce qui arrive tout le temps.
   Le prix de ce choix est une latence : le tout premier jour, la moitié
   personnelle de « Bientôt » n'apparaît pas dans la seconde. C'est le bon prix
   à payer — l'autre option coûtait 55 requêtes et un écran qui bouge tout seul.

   BUDGET CONSIGNÉ (§6), après correction : première ouverture du tout premier
   jour, une requête par film suivi, plafonnée à `BIENTOT_MAX_FILMS` = 60 ;
   les jours suivants, ZÉRO — le cache par film est persisté et calé sur le jour
   (voir `datesFRDuJour`, app-10). Aucune requête de vitrine ajoutée, jamais. */

/* ==================== SPEC-05 lot B — L'IA DE LA RECHERCHE ====================

   Écrit le 10/08/2026. Trois tâches, trois déclencheurs, et pas un de plus :

     `envie_phrase`  — à la VALIDATION d'une envie dans la barre. Jamais à la
                       frappe (§3), et jamais quand `/search/multi` a répondu :
                       un titre trouvé, c'est zéro requête IA.
     `ambiance_desc` — au bouton « ✦ Traduire en réglages » de la feuille de
                       création d'ambiance. Un geste explicite, une requête.
     `pourquoi_lui`  — à l'ouverture d'un aperçu depuis une recherche AVEC une
                       sélection active. Cache 30 jours par (titre, empreinte
                       des critères).

   Tout est derrière l'interrupteur « IA de la Recherche », SÉPARÉ de celui de
   Découvrir et éteint lui aussi à la livraison. Éteint, la barre ne fait que
   titres et personnes (comportement actuel), la création d'ambiance n'a que
   l'onglet manuel, et la carte « Pourquoi lui » n'existe pas. Le §6 est
   catégorique là-dessus : « le socle sans IA est le produit, pas un mode
   dégradé ». */

/* Le vocabulaire du relais, traduit dans celui de l'app. Le serveur ne connaît
   que des CLÉS stables (« sf », « polar ») ; l'app, elle, pose des noms de
   genres TMDB, qui dépendent de la langue. La traduction se fait donc ici, et
   c'est le bon endroit : le relais n'a pas à savoir en quelle langue tourne
   l'app de quelqu'un. `genreParNom` rend `null` sur un genre absent de la
   famille — le critère tombe alors tout seul, sans bruit. */
const IA_GENRES_CLES = {
  comedie:'Comédie', drame:'Drame', polar:'Crime', thriller:'Thriller',
  horreur:'Horreur', sf:'Science-Fiction', fantastique:'Fantastique',
  action:'Action', aventure:'Aventure', romance:'Romance', mystere:'Mystère',
  guerre:'Guerre', western:'Western', familial:'Familial', histoire:'Histoire',
  documentaire:'Documentaire'
};

/* Poser les critères rendus par le relais dans l'état de la Recherche. On passe
   par `poserMotRech` — la mécanique existante — et surtout PAS par une écriture
   directe : c'est elle qui sait basculer un multiple, écarter un ingrédient
   d'ambiance recouvert, et relancer la requête. Une IA n'a pas de passe-droit
   sur les règles de l'écran. */
function appliquerCriteresIA(criteres){
  if(!Array.isArray(criteres) || !criteres.length) return 0;
  const r = etatRech();
  let n = 0;
  criteres.forEach(c=>{
    if(!c || typeof c !== 'object') return;
    const cle = String(c.cle || ''), val = String(c.val || '');
    if(cle === 'fam'){ if(['tout','film','serie','anime'].indexOf(val) >= 0){ r.fam = val; n++; } return; }
    if(cle === 'genre'){
      const nom = IA_GENRES_CLES[val];
      if(!nom) return;
      /* On ne pose que ce que la famille courante sait exprimer : un genre
         absent du catalogue rendrait `null` à la construction de la requête et
         resterait affiché en pilule — une pilule qui ne filtre rien est un
         mensonge à l'écran. */
      if(typeof genreParNom === 'function' && genreParNom(mediaRech(), nom) == null) return;
      if(listeRech('genre').map(String).indexOf(nom) < 0){ poserMotRech('genre', nom); n++; }
      return;
    }
    if(['epoque','duree','origine'].indexOf(cle) >= 0){
      if(listeRech(cle).map(String).indexOf(val) < 0){ poserMotRech(cle, val); n++; }
      return;
    }
    if(['note','statut','gore','pasvu'].indexOf(cle) >= 0){ poserMotRech(cle, val); n++; }
  });
  return n;
}

/* --------------------------- LE ROUTEUR D'ENVIE (§3) --------------------------- */

/* « Le texte ressemble-t-il à une envie ? » — heuristique LOCALE et simple,
   telle que le §3 la décrit : plus de trois mots, et aucun résultat de titre.
   Volontairement bête : une heuristique compliquée deviendrait une deuxième
   intelligence, non mesurée, qu'il faudrait maintenir. */
function ressembleAUneEnvieIA(q, nTitres, nGens){
  if(nTitres > 0 || nGens > 0) return false;
  return String(q || '').trim().split(/\s+/).filter(Boolean).length > 3;
}

let envieEnCoursIA = false;

/* RETOUR-01 POINT 6 (11/08/2026) — `force` COURT-CIRCUITE L'HEURISTIQUE, et
   c'est tout ce que le mode ✦ ajoute ici. L'heuristique existe pour DEVINER si
   un texte est une envie quand personne ne l'a dit ; quand quelqu'un a appuyé
   sur ✦, il l'a dit. Continuer à deviner reviendrait à refuser une envie de
   deux mots (« un braquage ») au motif qu'elle en fait moins de quatre, sur un
   écran qui vient de se teindre en violet pour annoncer le contraire.
   L'interrupteur « IA de la Recherche », lui, n'est pas court-circuité : ✦
   éteint ne rend pas l'IA obligatoire. */
function routerEnvieIA(q, nTitres, nGens, force){
  if(!iaActive('recherche')) return;
  if(envieEnCoursIA) return;
  if(!force && !ressembleAUneEnvieIA(q, nTitres, nGens)) return;
  envieEnCoursIA = true;
  setTimeout(()=>{ traduireEnvieIA(q).catch(()=>{}); }, 0);
}

async function traduireEnvieIA(q){
  try{
    const r = etatRech();
    const d = await appelIA('envie_phrase', { phrase: String(q || '').slice(0, 300) });
    if(d) noterRequeteIA();
    const criteres = (d && Array.isArray(d.criteres)) ? d.criteres : null;
    if(!criteres || !criteres.length){
      /* §3.3 — RIEN DE RECONNU : un message honnête, AUCUNE pilule fantôme,
         AUCUN résultat modifié. C'est aussi la réponse quand tous les
         fournisseurs sont saturés : de son point de vue, c'est la même chose,
         et lui inventer deux messages différents ne l'aiderait pas. */
      toast('✦ Pas compris — décris un genre, une époque, une durée…');
      return;
    }
    /* Le champ se vide : l'envie est devenue des pilules, la garder dans la
       barre laisserait l'écran en mode « recherche de titre » par-dessus. */
    r.q = ''; r.qtitres = []; r.qgens = [];
    const n = appliquerCriteresIA(criteres);
    if(!n){ toast('✦ Pas compris — décris un genre, une époque, une durée…'); return; }
    if(typeof relancerRech === 'function') relancerRech();
    toast('✦ Compris : une envie — 1 requête');
  }finally{
    envieEnCoursIA = false;
  }
}

/* ------------------ « TRADUIRE EN RÉGLAGES » (§2, ambiance) ------------------ */

function corpsCreaAmbianceIALotB(b){
  return '<textarea class="ambdesc" id="ambdesc" rows="3" '+
      'placeholder="ex. des soirées frissons mais jamais de gore, plutôt des séries, '+
      '50 min max, du bien noté">'+esc(b.desc || '')+'</textarea>'+
    '<div class="ambex">'+
      '<button onclick="exempleAmbianceIA(\'des soirées frissons mais jamais de gore, plutôt des séries, 50 min max, du bien noté\')">frissons sans gore</button>'+
      '<button onclick="exempleAmbianceIA(\'du rire léger, des épisodes courts, rien de sombre\')">rire léger</button>'+
    '</div>'+
    '<button class="btn block" style="margin-top:11px" onclick="traduireAmbianceIA()">'+
      '✦ Traduire en réglages</button>'+
    indicateurQuotaIA();
}

function exempleAmbianceIA(t){
  const el = document.getElementById('ambdesc');
  if(el){ el.value = t; }
  if(brouillonAmb) brouillonAmb.desc = t;
}

async function traduireAmbianceIA(){
  const b = brouillonAmb;
  if(!b) return;
  const el = document.getElementById('ambdesc');
  const phrase = String((el && el.value) || b.desc || '').trim();
  b.desc = phrase;
  if(!phrase){ toast('Décris l\'ambiance en une phrase'); return; }
  const d = await appelIA('ambiance_desc', { phrase: phrase.slice(0, 300) });
  if(d) noterRequeteIA();
  const criteres = (d && Array.isArray(d.criteres)) ? d.criteres : null;
  if(!criteres || !criteres.length){
    /* §6 — « réponse malformée → bascule automatique sur le manuel, sans
       réessai », et avec un mot d'excuse : la personne vient de taper trois
       lignes, lui rendre un écran muet serait grossier. */
    if(!brouillonAmb) return;
    brouillonAmb.onglet = 'man';
    peindreCreaAmbiance();
    toast('✦ Pas compris — règle-la à la main, c\'est deux touches');
    return;
  }
  if(!brouillonAmb) return;
  const g = brouillonAmb.regles;
  criteres.forEach(c=>{
    const cle = String(c.cle || ''), val = String(c.val || '');
    if(cle === 'fam'){ g.fam = val; return; }
    if(cle === 'genre'){ const n = IA_GENRES_CLES[val]; if(n && g.genre.indexOf(n) < 0) g.genre.push(n); return; }
    if(['epoque','duree','origine'].indexOf(cle) >= 0){ if(g[cle].indexOf(val) < 0) g[cle].push(val); return; }
    if(['note','statut','gore','pasvu'].indexOf(cle) >= 0) g[cle] = val;
  });
  if(d.nom) brouillonAmb.nom = d.nom;
  if(d.emoji) brouillonAmb.emoji = d.emoji;
  brouillonAmb.source = 'ia';
  brouillonAmb.onglet = 'man';
  peindreCreaAmbiance();
  toast('✦ Réglages déduits — vérifie et corrige avant d\'enregistrer');
}

/* ------------------------ L'INDICATEUR DE QUOTA ------------------------ */

/* SPEC-04 §4.4 et SPEC-05 §6 : l'indicateur est INTERDIT sur l'écran principal
   et AUTORISÉ dans les feuilles IA « à la demande ». Il vit donc ici, et nulle
   part ailleurs. Ce qu'il compte est LOCAL — les requêtes parties de cet
   appareil dans la minute — et il le dit sans prétendre connaître l'état du
   fournisseur, que le client ne voit jamais. Un chiffre honnête et modeste
   plutôt qu'un chiffre faux et rassurant. */
/* CORRECTION DE RELECTURE (10/08) — ON NE COMPTE QUE CE QUI A COÛTÉ.
   `noterRequeteIA` était appelée après l'`await` quoi qu'il arrive, y compris
   quand `appelIA` rendait `null` : un fournisseur saturé, un 401, un 403 ne
   consomment aucun quota, et l'indicateur les comptait quand même. Un chiffre
   honnête compte les réponses obtenues, pas les tentatives. */
const IA_QUOTA_CLE = 'ms.iaquota.v1';
const IA_QUOTA_MINUTE = 15;

function lireQuotaIA(){
  let l = [];
  try{ l = JSON.parse(localStorage.getItem(IA_QUOTA_CLE) || '[]'); }catch(e){ l = []; }
  if(!Array.isArray(l)) l = [];
  const limite = Date.now() - 60000;
  return l.filter(t => typeof t === 'number' && t > limite);
}
function noterRequeteIA(){
  const l = lireQuotaIA();
  l.push(Date.now());
  try{ localStorage.setItem(IA_QUOTA_CLE, JSON.stringify(l.slice(-40))); }catch(e){}
}
function indicateurQuotaIA(){
  const reste = Math.max(0, IA_QUOTA_MINUTE - lireQuotaIA().length);
  const pct = Math.round(reste / IA_QUOTA_MINUTE * 100);
  return '<div class="iaq"><i style="width:'+pct+'%"></i>'+
    '<span>'+reste+' / '+IA_QUOTA_MINUTE+' requêtes restantes cette minute</span></div>';
}

/* ------------------ « POURQUOI IL TE CORRESPOND » (§8) ------------------ */

/* Cache 30 jours par (titre, empreinte des critères) : le §6 le demande, et il
   a raison — la réponse dépend des DEUX. Le même titre sous une autre
   sélection mérite une autre phrase ; le même titre sous la même sélection n'en
   mérite pas une seconde. */
const IA_POURQUOI_TTL = 30 * 86400000;
const IA_POURQUOI_ECHEC = 3600000;      // un échec ne se garde qu'une heure
const IA_POURQUOI_MAX = 120;

function empreinteCriteresIA(){
  const r = etatRech();
  return [r.fam, r.ambiance || '', r.amb || '',
          listeRech('genre').join('+'), listeRech('origine').join('+'),
          listeRech('epoque').join('+'), listeRech('duree').join('+'),
          listeRech('plate').join('+'), r.note || '', r.pasvu || '',
          r.statut || '', r.gore || '', r.avec || ''].join('|');
}

function clePourquoiIA(media, id){
  return media + ':' + id + '@' + empreinteCriteresIA();
}

/* L'ENTRÉE, et le TEXTE, sont deux choses distinctes — et les confondre coûtait
   une rafale. Un échec est mémorisé avec un texte vide (voir plus bas) ; si
   l'appelant ne regardait que le texte, il ne verrait rien en cache et
   redemanderait à chaque ré-ouverture de l'aperçu. `entreePourquoiIA` répond
   « on a déjà demandé », `lirePourquoiIA` répond « et voici ce qu'on affiche ». */
function entreePourquoiIA(media, id){
  const o = lireCacheIA();
  const e = o.rech.pourquoi[clePourquoiIA(media, id)];
  if(!e) return null;
  /* `jusqua` porte l'échéance — un mois pour un texte, une heure pour un
     échec. Les entrées écrites avant cette correction n'en ont pas : on
     retombe alors sur l'ancien calcul. */
  const fin = (typeof e.jusqua === 'number') ? e.jusqua : (e.quand + IA_POURQUOI_TTL);
  return fin > Date.now() ? e : null;
}
function lirePourquoiIA(media, id){
  if(!iaActive('recherche')) return null;
  const e = entreePourquoiIA(media, id);
  return e ? texteIAAcceptable(e.texte, 220) : null;
}

let pourquoiEnCoursIA = {};

/* Appelé par l'aperçu. Rend TOUT DE SUITE ce qu'il a (souvent rien), et va
   chercher le reste en arrière-plan : l'aperçu ne l'attend jamais. */
function blocPourquoiIA(media, id, titre){
  if(!iaActive('recherche')) return '';
  /* §8 — la carte n'a de sens qu'AVEC une sélection active : « pourquoi il te
     correspond » suppose un « à quoi ». Sans critères, on ne dépense rien. */
  if(typeof selectionActiveRech !== 'function' || !selectionActiveRech()) return '';
  const t = lirePourquoiIA(media, id);
  if(t) return '<div class="iapq"><b>✦ Pourquoi il te correspond</b><p>'+esc(t)+'</p></div>';
  /* Déjà demandé — et refusé, ou rendu invalide : on n'y revient pas. « Une
     tentative, pas de rafale » vaut aussi pour un écran qu'on rouvre. */
  if(entreePourquoiIA(media, id)) return '';
  demanderPourquoiIA(media, id, titre);
  /* Rien à l'écran tant que rien n'est arrivé : le §6 dit « la carte ne
     s'affiche pas », pas « un cadre vide clignote ». */
  return '';
}

function demanderPourquoiIA(media, id, titre){
  const cle = clePourquoiIA(media, id);
  if(pourquoiEnCoursIA[cle]) return;
  pourquoiEnCoursIA[cle] = true;
  setTimeout(()=>{ chargerPourquoiIA(media, id, titre, cle).catch(()=>{}); }, 0);
}

async function chargerPourquoiIA(media, id, titre, cle){
  try{
    const mots = (typeof motsPhraseRech === 'function') ? motsPhraseRech().map(m => m.mot) : [];
    const d = await appelIA('pourquoi_lui', {
      titre: titre || '', genres: genresAimesIA(5),
      forme: media === 'tv' ? 'série' : 'film',
      criteres: mots, aimes: titresAimesIA(6)
    });
    if(d) noterRequeteIA();
    const texte = d ? texteIAAcceptable(d.texte, 220) : null;
    const o = lireCacheIA();
    /* On mémorise l'échec aussi, avec un texte vide : sans ça, chaque
       ré-affichage de l'aperçu relancerait une requête pour la même réponse.
       C'est « une tentative, pas de rafale » appliqué à un écran qu'on rouvre. */
    /* CORRECTION DE RELECTURE — UN ÉCHEC NE VAUT PAS TRENTE JOURS DE SILENCE.
       Un succès se garde un mois (la phrase ne change pas). Un échec, lui, vient
       souvent d'une saturation passagère : le garder aussi longtemps
       transformait une dégradation en mutisme. Il tient une heure — assez pour
       qu'on ne repaie pas dix ré-ouvertures d'affilée, assez peu pour que la
       carte revienne le soir même. */
    o.rech.pourquoi[cle] = { quand: Date.now(), texte: texte || '',
                             jusqua: Date.now() + (texte ? IA_POURQUOI_TTL : IA_POURQUOI_ECHEC) };
    const cles = Object.keys(o.rech.pourquoi);
    if(cles.length > IA_POURQUOI_MAX){
      const garde = cles.sort((a, b)=> o.rech.pourquoi[b].quand - o.rech.pourquoi[a].quand)
                        .slice(0, IA_POURQUOI_MAX);
      const neuf = {};
      garde.forEach(k=>{ neuf[k] = o.rech.pourquoi[k]; });
      o.rech.pourquoi = neuf;
    }
    ecrireCacheIA(o);
    if(texte && typeof view !== 'undefined' && view === 'preview' && typeof render === 'function')
      render();
  }finally{
    delete pourquoiEnCoursIA[cle];
  }
}

/* ===========================================================================
   RETOUR-01 POINT 8 (11/08/2026) — LE TRI « ✦ MES GOÛTS » DEVIENT RÉELLEMENT IA

   CE QUI N'ALLAIT PAS. Le bouton portait une ✦ — le signe que l'app réserve à
   l'IA partout ailleurs — et le tri derrière était à 100 % local. Ce n'était pas
   une panne, c'était un mensonge d'étiquette. Décision d'Adrien : l'IA doit
   faire le classement, et la ✦ redevient honnête.

   L'ARCHITECTURE EST IMPOSÉE PAR LE §8, ET ELLE EST LA SEULE POSSIBLE. Classer
   24 478 titres par IA n'existe pas. Ce qui existe, c'est affiner le HAUT d'un
   pré-classement local :

     ① le moteur local pré-classe tout, comme aujourd'hui (`ordonnerParGoutRech`,
        `scoreGoutRech` — pas une ligne n'y change) ;
     ② `classer_grille` envoie le profil agrégé et les CENT PREMIERS candidats,
        et reçoit l'ordre affiné — une liste d'INDICES, jamais des titres ;
     ③ UNE requête par grille, cache par signature (famille + filtres), et la
        signature porte `signatureGouts` : un 👍 de plus périme le classement ;
     ④ non bloquant — l'ordre local s'affiche tout de suite, l'ordre IA s'applique
        à l'arrivée SEULEMENT si la personne n'a pas encore défilé ; sinon il
        attend le prochain affichage. Jamais de réorganisation sous le doigt ;
     ⑤ au-delà des cent premiers, l'ordre local continue, sans rupture ;
     ⑥ IA indisponible → tri local, sans bruit. Le §6 de SPEC-05 est catégorique :
        « le socle sans IA est le produit, pas un mode dégradé ».

   POURQUOI LE CACHE VIT EN MÉMOIRE ET PAS DANS `localStorage`. Un classement de
   grille est attaché à une session de recherche : on filtre, on regarde, on
   change d'avis. Le §8 demande « re-filtrer à l'identique = zéro appel », ce
   qu'une mémoire de module tient parfaitement. Le persister ferait ressortir au
   matin l'ordre d'hier soir, pour une grille dont TMDB aura changé la première
   page — un cache qui survit à sa donnée est un cache qui ment. */

const IA_GRILLE_MAX = 100;
/* Signature → { rangs:{ 'media:id':n }, quand }. Bornée : une session de
   recherche fait quelques grilles, pas mille, et on ne veut pas d'une fuite. */
const IA_GRILLE_CACHE_MAX = 20;
let iaGrilleCache = {};
let iaGrilleEnCours = {};

/* La signature d'une grille : famille + filtres + l'état des goûts. C'est elle
   qui décide « même grille » et « autre grille » — donc elle qui décide si une
   requête part. Elle est construite à partir de l'état de la Recherche, jamais
   à partir de ce qui est affiché : deux écrans identiques doivent donner la
   même signature, y compris à un titre près dans la fournée. */
function signatureGrilleIA(){
  if(typeof etatRech !== 'function') return null;
  const r = etatRech();
  const l = c => (typeof listeRech === 'function') ? listeRech(c).slice().sort().join(',') : '';
  const sig = (typeof signatureGouts === 'function') ? signatureGouts() : 0;
  return [r.fam, r.amb || '', r.ambiance || '', r.note || '', r.pasvu || '',
          r.statut || '', r.gore || '', r.avec || '',
          l('genre'), l('origine'), l('epoque'), l('duree'), l('plate'),
          (r.sans || []).slice().sort().join(','), 'g' + sig].join('|');
}

/* Ce que `ordonnerParGoutRech` consulte (app-15). Rend `null` quand il n'y a
   rien à appliquer — et « rien » est le cas normal : IA éteinte, tri « note »,
   classement pas encore arrivé. */
function ordreIAGrilleRech(){
  if(typeof iaActive !== 'function' || !iaActive('recherche')) return null;
  if(typeof triRech === 'function' && triRech() !== 'gouts') return null;
  const sig = signatureGrilleIA();
  if(!sig) return null;
  const e = iaGrilleCache[sig];
  return (e && e.rangs) ? e.rangs : null;
}

/* Ce que le modèle a le droit de voir de la personne : des genres et des
   titres, agrégés. Jamais un pseudo, jamais un identifiant, jamais un
   historique — §4.1, la même règle que partout ailleurs dans ce fichier. */
function profilGrilleIA(){
  const bouts = [];
  try{
    const g = (typeof profilGoutsRech === 'function') ? profilGoutsRech() : null;
    if(g){
      const forts = Object.keys(g).sort((a, b)=> g[b] - g[a]).slice(0, 6);
      if(forts.length) bouts.push('genres les plus regardés : ' + forts.join(', '));
    }
  }catch(e){}
  const aimes = titresAimesIA(6);
  if(aimes.length) bouts.push('titres aimés : ' + aimes.join(', '));
  return bouts.join(' ; ').slice(0, 400);
}

/* Une ligne par candidat, dans l'ordre local. Le format est celui du gabarit
   serveur : il numérote lui-même, on ne lui envoie que le contenu. */
function candidatGrilleIA(x){
  const an = (x.release_date || x.first_air_date || '').slice(0, 4);
  const genres = (typeof genresTitreRech === 'function')
    ? genresTitreRech(x, x.__media).slice(0, 3).join(', ') : '';
  const note = (typeof x.vote_average === 'number' && x.vote_average)
    ? String(Math.round(x.vote_average * 10) / 10) : '';
  const nom = String(x.title || x.name || x.nom || '').slice(0, 60);
  return [nom, an ? '(' + an + ')' : '', genres ? '· ' + genres : '', note ? '· ' + note : '']
    .filter(Boolean).join(' ');
}

/* Le déclencheur. Appelé APRÈS que la grille est à l'écran — jamais pendant sa
   construction, exactement comme le pitch de Découvrir (§4.4). */
function toucherClassementIA(){
  if(!iaActive('recherche')) return;
  if(typeof triRech !== 'function' || triRech() !== 'gouts') return;
  if(typeof etatRech !== 'function') return;
  const r = etatRech();
  if(!Array.isArray(r.res) || r.res.length < 2) return;
  const sig = signatureGrilleIA();
  if(!sig) return;
  if(iaGrilleCache[sig]) return;          // ③ re-filtrer à l'identique ne coûte rien
  if(iaGrilleEnCours[sig]) return;
  iaGrilleEnCours[sig] = true;
  setTimeout(()=>{ classerGrilleIA(sig).catch(()=>{}); }, 0);
}

async function classerGrilleIA(sig){
  try{
    const r = etatRech();
    /* ② les cent premiers du pré-classement local, et eux seuls. On fige la
       liste ICI : la fournée suivante peut arriver pendant la requête, et un
       ordre rendu sur une liste qui a bougé désignerait d'autres titres. */
    /* CORRECTION DE RELECTURE (11/08/2026) — LES DEUX NUMÉROTATIONS DOIVENT
       ÊTRE LA MÊME. Le client envoyait `cands.map(candidatGrilleIA)` et
       remappait la réponse par `cands[i]`. Or le serveur numérote APRÈS
       filtrage : `liste()` fait `.map(texte).filter(Boolean)` puis numérote.
       Une seule ligne vide côté serveur — et `candidatGrilleIA` rend `''` quand
       titre, année, genres et note sont tous absents — décalait TOUTE la
       numérotation, et le classement désignait alors les mauvais titres, en
       silence. Probabilité faible, conséquence indétectable : le pire couple.
       On filtre donc ICI, et on garde le titre et sa ligne appariés. Ce qui
       part est exactement ce qui sera numéroté. */
    const paires = r.res.slice(0, IA_GRILLE_MAX)
      .map(x => ({ x:x, ligne: candidatGrilleIA(x) }))
      .filter(e => !!e.ligne);
    const cands = paires.map(e => e.x);
    if(cands.length < 2) return;
    const d = await appelIA('classer_grille', {
      profil: profilGrilleIA(),
      candidats: paires.map(e => e.ligne)
    });
    if(d) noterRequeteIA();
    const ordre = (d && Array.isArray(d.ordre)) ? d.ordre : null;
    /* ⑥ IA indisponible ou réponse inutilisable → rien. On mémorise quand même
       la signature, avec un classement VIDE : sans ça, chaque « Voir plus »
       relancerait la même requête pour le même silence. */
    const rangs = {};
    if(ordre){
      let n = 0;
      ordre.forEach(i=>{
        const x = cands[i];
        if(!x) return;                    // indice hors de NOTRE liste : il tombe
        const k = x.__media + ':' + x.id;
        if(k in rangs) return;
        rangs[k] = n++;
      });
    }
    iaGrilleCache[sig] = { rangs: Object.keys(rangs).length ? rangs : null, quand: Date.now() };
    const cles = Object.keys(iaGrilleCache);
    if(cles.length > IA_GRILLE_CACHE_MAX){
      const garde = cles.sort((a, b)=> iaGrilleCache[b].quand - iaGrilleCache[a].quand)
                        .slice(0, IA_GRILLE_CACHE_MAX);
      const neuf = {};
      garde.forEach(k=>{ neuf[k] = iaGrilleCache[k]; });
      iaGrilleCache = neuf;
    }
    appliquerOrdreIARech(sig);
  }finally{
    delete iaGrilleEnCours[sig];
  }
}

/* ④ LA RÈGLE DU DOIGT, et c'est elle qui décide de tout ici.

   Réordonner une grille qu'on est en train de parcourir fait disparaître le
   titre qu'on regardait. La règle du §1 de SPEC-04 — « jamais de changement
   sous le doigt » — vaut ici mot pour mot. On applique donc SEULEMENT si la
   personne est encore en haut de l'écran, c'est-à-dire si elle n'a pas commencé
   à parcourir. Sinon on ne fait rien : le classement est en cache, et le
   prochain affichage complet de la grille (changement de filtre, retour sur
   l'onglet, bascule de tri) le prendra tel quel, sans une requête de plus.

   CORRECTION DE RELECTURE (11/08/2026) — LE SEUIL PASSE DE 40 PX À ZÉRO. « Sous
   40 px » ne dit pas « il n'a pas défilé », il dit « il n'a pas beaucoup
   défilé ». Le scénario relevé : la grille se peint, le doigt lance un
   défilement inertiel, la réponse arrive 900 ms plus tard alors que `scrollY`
   vaut 30 — la garde passait, et `peindreRech()` remplaçait tout le contenu EN
   PLEIN MOUVEMENT. C'est exactement ce que ④ interdit.
   Zéro est le seul seuil qui se défende sans modéliser l'inertie : au-dessus,
   il faudrait un `scrollend` ou un drapeau tactile, c'est-à-dire une machinerie
   pour gagner quelques réordonnancements dont personne n'a besoin — le
   classement s'appliquera au prochain affichage, gratuitement. */

function appliquerOrdreIARech(sig){
  if(typeof view === 'undefined' || view !== 'search') return;
  if(signatureGrilleIA() !== sig) return;              // la grille a changé de sujet
  const e = iaGrilleCache[sig];
  if(!e || !e.rangs) return;
  if((window.scrollY || 0) !== 0) return;   // on a parcouru : ce sera pour la prochaine fois
  const r = etatRech();
  if(typeof ordonnerParGoutRech !== 'function') return;
  r.res = ordonnerParGoutRech(r.res);
  r.matchI = 0;
  if(typeof peindreRech === 'function') peindreRech();
}

/* ===========================================================================
   SPEC-09 LOT 0 (29/08/2026) — LE BANC D'ESSAI IA, ET RIEN D'AUTRE

   LA VISION, ACTÉE PAR ADRIEN : l'IA ne se contente plus d'habiller Découvrir
   (pitchs, intitulés) — elle CHOISIT les titres, au service du profil. Elle ne
   remplace RIEN aujourd'hui : ce lot livre le banc d'essai qui permet d'en
   juger, et rien de ce qu'il affiche n'atteint l'écran Découvrir réel.

   CE QUE LE BANC MONTRE, PAR FAMILLE ET CÔTE À CÔTE :
     · à gauche, les rangées proposées par l'IA (tâche `suggestions_famille`) ;
     · à droite, les rangées que Découvrir affiche AUJOURD'HUI, calculées par le
       vrai moteur (`rangeesActuellesDe`, app-11).

   LA CHAÎNE DE CONFIANCE, ET ELLE EST LE CŒUR DU LOT. Le modèle propose des
   NOMS, de tête. Un nom n'est pas un titre :
     1. il est cherché sur TMDB (`/search/movie` ou `/search/tv`) ;
     2. introuvable → JETÉ ; ambigu (deux résultats aussi plausibles, et aucune
        année pour trancher) → JETÉ. On ne devine pas ;
     3. ce qui reste passe le TAMIS EXISTANT — `tamiser` (app-11) : déjà chez
        soi, « pas pour moi », genres écartés, cadre de la famille.
   Les jetés sont COMPTÉS et LISTÉS : un banc qui cache son taux de déchet ne
   sert à rien pour décider.

   BORNES DURES DU LOT (elles sont dans l'ordre de mission, pas dans mon
   jugement) : le lot 1 de SPEC-09 — remplacer les rangées de Découvrir,
   réordonner, signaux forts — N'EST PAS ICI et ne doit pas être commencé. La
   Recherche ne change pas d'un octet. L'écran Découvrir réel est identique au
   pixel : ce fichier n'écrit rien dans `db`, rien dans `cacheSugg` qui ne soit
   ce que Découvrir aurait calculé lui-même, et remet la puce où il l'a trouvée.
   =========================================================================== */

/* L'accès. L'écran est CACHÉ : il n'existe pas dans les Réglages tant qu'on ne
   l'a pas déverrouillé, en touchant sept fois le pied de page. Pourquoi pas un
   simple bouton : ce n'est pas une fonctionnalité, c'est un instrument de
   mesure, et il montrerait à quelqu'un d'autre qu'Adrien un écran qui ne lui
   promet rien. Le déverrouillage vit en localStorage — donc PAR APPAREIL, hors
   synchro : c'est un réglage d'atelier, il n'a rien à faire dans `db.gouts`
   qui voyage d'un téléphone à l'autre. */
const BANC_DEV_CLE = 'ms.dev.v1';
const BANC_DEV_TOUCHES = 7;
let bancDevCompte = 0;
function bancDevOuvert(){
  try{ return localStorage.getItem(BANC_DEV_CLE) === '1'; }catch(e){ return false; }
}
function toucherPiedReglages(){
  if(bancDevOuvert()) return;
  bancDevCompte++;
  if(bancDevCompte < BANC_DEV_TOUCHES){
    /* On ne dit rien avant la cinquième : un compteur qui s'annonce dès le
       premier appui transforme un pied de page en devinette pour tout le monde. */
    if(bancDevCompte >= 5 && typeof toast === 'function')
      toast((BANC_DEV_TOUCHES - bancDevCompte) + ' de plus…');
    return;
  }
  try{ localStorage.setItem(BANC_DEV_CLE, '1'); }catch(e){}
  bancDevCompte = 0;
  if(typeof toast === 'function') toast('Outils de développement affichés');
  if(typeof render === 'function') render();
}
function fermerDevBanc(){
  try{ localStorage.removeItem(BANC_DEV_CLE); }catch(e){}
  bancDevCompte = 0;
  if(typeof toast === 'function') toast('Outils masqués');
  /* RETOUR-08 — ON REVIENT EN ARRIÈRE, ON N'EMPILE PAS. `go('settings', …)`
     poussait une entrée : le retour suivant ramenait sur un banc qu'on venait
     de rendre inatteignable autrement. `goBack` rend l'écran précédent, qui est
     précisément les Réglages d'où l'on est venu. */
  if(typeof goBack === 'function') goBack();
  else if(typeof render === 'function') render();
}

/* Les quatre familles du banc. `cle` est ce qui part au relais (le vocabulaire
   fermé de `CRITERES_PERMIS.fam`), `puce` est l'identifiant de la puce de
   Découvrir (`ui.disc.type`), `media` dit à quel point de terminaison TMDB il
   faut demander la vérification d'un titre de cette famille. */
const BANC_FAMILLES = [
  { cle:'tout',  puce:'tout',  nom:'Tout' },
  { cle:'film',  puce:'movie', nom:'Films' },
  { cle:'serie', puce:'tv',    nom:'Séries' },
  { cle:'anime', puce:'anime', nom:'Animés' }
];
/* L'état du banc. En mémoire seulement : un banc ne se restaure pas, il se
   relance. Les VOTES, eux, survivent (localStorage) — c'est tout leur intérêt. */
let bancEtat = { encours:false, fait:false, err:'', fams:{}, mesures:null };

/* Le profil de goûts AGRÉGÉ. Le minimum, comme les tâches IA existantes : des
   genres, quelques titres, des noms de plateformes. Jamais d'identité, jamais
   l'historique brut, jamais une date de visionnage. */
function profilBancIA(){
  const bouts = [];
  try{
    const g = (typeof profilGoutsRech === 'function') ? profilGoutsRech() : null;
    if(g){
      const forts = Object.keys(g).sort((a, b)=> g[b] - g[a]).slice(0, 6);
      if(forts.length) bouts.push('genres les plus regardés : ' + forts.join(', '));
    }
  }catch(e){}
  const gAimes = genresAimesIA(5);
  if(gAimes.length) bouts.push('genres des titres notés en positif : ' + gAimes.join(', '));
  const n = bancNombreAvis();
  if(n.pouce || n.pouceBas)
    bouts.push(n.pouce + ' titres approuvés, ' + n.pouceBas + ' refusés');
  return bouts.join(' ; ').slice(0, 400);
}
/* Combien de 👍 et de 👎, sans dire lesquels : un ordre de grandeur aide le
   modèle à savoir s'il parle à quelqu'un qui a beaucoup noté ou non. */
function bancNombreAvis(){
  let pouce = 0, pouceBas = 0;
  try{
    const avis = db.avis || {};
    ['tv', 'movie'].forEach(m=>{
      Object.keys(avis[m] || {}).forEach(id=>{
        const v = avis[m][id] && avis[m][id].v;
        if(v === 1) pouce++; else if(v === -1) pouceBas++;
      });
    });
  }catch(e){}
  return { pouce: pouce, pouceBas: pouceBas };
}
/* Le podium des duels, en NOMS. C'est le jugement le plus fort qu'on ait :
   la personne a comparé deux titres et tranché, plusieurs fois. */
function podiumBancIA(fam){
  const out = [];
  try{
    const fams = fam === 'tout' ? ['film','serie','anime'] : [fam];
    fams.forEach(f=>{
      (((db.podium || {})[f]) || []).slice(0, 3).forEach(id=>{
        const o = db.shows[id] || db.movies[id];
        const nom = o && (o.name || o.title);
        if(nom && out.indexOf(nom) < 0) out.push(nom);
      });
    });
  }catch(e){}
  return out.slice(0, 5);
}
function plateformesBancIA(){
  try{ return (typeof mesPlates === 'function' ? mesPlates() : [])
                .map(p => String(p.nom || '')).filter(Boolean).slice(0, 8); }
  catch(e){ return []; }
}
function genresEcartesBancIA(){
  try{ return ((db.gouts && db.gouts.exclus) || []).map(String).slice(0, 8); }
  catch(e){ return []; }
}

/* --------------------- LA VÉRIFICATION SUR TMDB --------------------- */

/* Deux noms se comparent SANS accents, sans casse et sans ponctuation : « Le
   Loup de Wall Street » et « le loup de wall street » sont le même titre, et un
   modèle n'a aucune raison de rendre la typographie exacte de TMDB.
   Écrite pour le banc d'essai (SPEC-09), reprise telle quelle par l'interprète
   de la barre ✦ (SPEC-11) : c'est la MÊME question posée aux deux endroits —
   « le nom que le modèle a écrit désigne-t-il bien ce que TMDB me rend ? ». */
function normNomIA(s){
  let v = String(s == null ? '' : s).toLowerCase();
  /* `normalize` manque sur de très vieux moteurs : sans lui on compare les
     accents tels quels, ce qui est moins tolérant mais jamais faux. */
  if(v.normalize) v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return v.replace(/[^a-z0-9]+/g, ' ').trim();
}
/* La règle d'ambiguïté, écrite une fois : on garde un résultat s'il est SEUL à
   porter le nom demandé, ou si l'année tranche. Deux « Dune » sans année, on
   jette — proposer le mauvais serait pire que ne rien proposer, parce que
   personne ne verrait l'erreur.
   `annee` peut manquer : le modèle n'est pas obligé de la donner. */
function bancChoisirResultat(res, nom, annee, media){
  const cible = normNomIA(nom);
  const cands = (res || []).filter(r => r && r.id && r.poster_path).map(r=>{
    const t = media === 'movie' ? r.title : r.name;
    const orig = media === 'movie' ? r.original_title : r.original_name;
    const d = (media === 'movie' ? r.release_date : r.first_air_date) || '';
    return { r:r, exact: normNomIA(t) === cible || normNomIA(orig) === cible,
             an: Number(d.slice(0, 4)) || 0 };
  });
  const exacts = cands.filter(c => c.exact);
  if(!exacts.length) return { pris:null, raison:'introuvable' };
  if(exacts.length === 1) return { pris:exacts[0].r, raison:'' };
  if(annee){
    /* Une année à un an près : TMDB date un film à sa première projection, le
       modèle le date de sa sortie en salles. Un an d'écart n'est pas une
       erreur, c'est la même œuvre. */
    const parAn = exacts.filter(c => Math.abs(c.an - annee) <= 1);
    if(parAn.length === 1) return { pris:parAn[0].r, raison:'' };
  }
  return { pris:null, raison:'ambigu' };
}
/* Une vérification = une requête TMDB. Rend le titre NORMALISÉ (le format du
   moteur de suggestions, `normaliser` d'app-11) ou la raison du rejet. */
async function bancVerifierTitre(t, mesures){
  const media = t.media === 'film' ? 'movie' : 'tv';
  /* `envoi` et pas `params` : `params` est l'état de navigation global (app-02),
     et un `const` local du même nom ferait tomber le contrôle « état partagé »
     des tests — à raison, puisqu'on ne peut plus lire l'un sans se demander si
     l'autre a bougé. */
  const envoi = { query: t.nom, include_adult:'false' };
  if(t.annee) envoi[media === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = String(t.annee);
  let d = null;
  try{
    mesures.tmdb++;
    d = await tmdb('/search/' + media, envoi);
  }catch(e){ return { jete:{ nom:t.nom, raison:'réseau' } }; }
  let choix = bancChoisirResultat(d && d.results, t.nom, t.annee, media);
  /* L'année filtrait peut-être trop dur : TMDB range parfois une série sous son
     année de PREMIÈRE diffusion dans un autre pays. Une seconde chance, sans
     l'année, avant de jeter — et elle est comptée comme une requête de plus,
     parce qu'elle en est une. */
  if(!choix.pris && t.annee && choix.raison === 'introuvable'){
    try{
      mesures.tmdb++;
      d = await tmdb('/search/' + media, { query:t.nom, include_adult:'false' });
      choix = bancChoisirResultat(d && d.results, t.nom, t.annee, media);
    }catch(e){}
  }
  if(!choix.pris) return { jete:{ nom:t.nom, raison:choix.raison || 'introuvable' } };
  const x = (typeof normaliser === 'function') ? normaliser(choix.pris, media) : null;
  if(!x) return { jete:{ nom:t.nom, raison:'sans affiche' } };
  return { titre:x };
}

/* --------------------------- LA GÉNÉRATION --------------------------- */

/* Une famille : une requête IA, puis autant de requêtes TMDB que de titres
   proposés, par paquets de six — le même plafond que l'amorçage de la
   Recherche, et pour la même raison : une rafale de vingt requêtes simultanées
   sur le relais TMDB finit en 429. */
const BANC_VERIF_PAR_FOIS = 6;
async function bancFamilleIA(f, mesures){
  const envoi = {
    famille: f.cle,
    profil: profilBancIA(),
    aimes: titresAimesIA(12),
    podium: podiumBancIA(f.cle),
    genres: genresAimesIA(5),
    ecartes: genresEcartesBancIA(),
    plateformes: plateformesBancIA()
  };
  const d = await appelIA('suggestions_famille', envoi);
  if(d) noterRequeteIA();
  if(!d || !Array.isArray(d.rangees) || !d.rangees.length)
    return { err:'L\'IA n\'a rien rendu (coupée, saturée, ou réponse refusée).', rangees:[], jetes:[] };

  const jetes = [];
  const rangees = [];
  /* Le tamis est PARTAGÉ par toutes les rangées d'une même famille : c'est ce
     qui empêche le même titre d'apparaître dans trois rangées — exactement
     comme dans la vitrine réelle. */
  const vus = {};
  const cadre = (typeof cadreSugg === 'function') ? cadreSugg(f.puce)
                                                  : { medias:['tv','movie'], origine:'mixte' };
  for(const r of d.rangees){
    const bruts = [];
    const liste = (r.titres || []);
    for(let k = 0; k < liste.length; k += BANC_VERIF_PAR_FOIS){
      const paquet = liste.slice(k, k + BANC_VERIF_PAR_FOIS);
      const rep = await Promise.all(paquet.map(t => bancVerifierTitre(t, mesures)));
      rep.forEach(o=>{
        mesures.proposes++;
        if(o.jete){ jetes.push(o.jete); return; }
        bruts.push(o.titre);
      });
    }
    const avantTamis = bruts.length;
    const gardes = (typeof tamiser === 'function') ? tamiser(bruts, vus, cadre, false) : bruts;
    /* Ce que le tamis retire est COMPTÉ À PART de ce que TMDB n'a pas trouvé :
       ce ne sont pas les mêmes reproches. Un titre introuvable est une erreur
       du modèle ; un titre tamisé est une proposition juste mais déjà vue,
       écartée, ou hors cadre — et c'est une information sur la consigne, pas
       sur la mémoire du modèle. */
    mesures.tamises += (avantTamis - gardes.length);
    if(gardes.length) rangees.push({ titre:String(r.titre || ''), l:gardes });
  }
  return { err:'', rangees:rangees, jetes:jetes };
}

async function bancGenererIA(){
  if(bancEtat.encours) return;
  bancEtat = { encours:true, fait:false, err:'', fams:{}, mesures:null };
  if(typeof render === 'function') render();
  const t0 = Date.now();
  const mesures = { tmdb:0, proposes:0, tamises:0, ms:0 };
  try{
    for(const f of BANC_FAMILLES){
      /* L'IA d'abord, la vitrine ensuite : si le relais est coupé, on le sait
         avant d'avoir dépensé trente requêtes TMDB pour la colonne de droite. */
      const ia = iaActive('decouvrir')
        ? await bancFamilleIA(f, mesures)
        : { err:'L\'IA de Découvrir est coupée dans les Réglages.', rangees:[], jetes:[] };
      const actuelles = (typeof rangeesActuellesDe === 'function')
        ? await rangeesActuellesDe(f.puce) : [];
      bancEtat.fams[f.cle] = { ia:ia, actuelles:actuelles };
      /* On repeint à chaque famille finie : quatre familles, c'est long, et un
         écran qui n'affiche rien pendant une minute a l'air cassé. */
      if(view === 'banc' && typeof render === 'function') render();
    }
  }catch(e){
    bancEtat.err = 'Le banc s\'est arrêté : ' + ((e && e.message) || 'erreur inconnue');
  }
  mesures.ms = Date.now() - t0;
  bancEtat.mesures = mesures;
  bancEtat.encours = false; bancEtat.fait = true;
  if(typeof render === 'function') render();
}

/* ===========================================================================
   SPEC-09 LOT 1 (2/2) — L'IA COMPOSE LES RANGÉES PERSONNELLES DE DÉCOUVRIR

   Décision d'Adrien du 31/08 : « L'IA compose une partie des rangées, les
   autres restent locales (Bientôt, Nouveautés, Vu par tes proches), mais
   vérifié sur TMDB. »

   CE LOT NE RÉÉCRIT RIEN : il BRANCHE sur l'écran réel la chaîne que le banc
   d'essai (lot 0) a mise au point et qui tourne depuis le 29/08 —
   `bancFamilleIA` : une requête IA, chaque titre proposé cherché sur TMDB,
   l'ambigu et l'introuvable JETÉS sans discussion, puis le tamis habituel
   (déjà chez moi, « pas pour moi », genres exclus, cadre de la famille). Le
   nom de cette fonction commence toujours par « banc » parce que c'est là
   qu'elle est née et que la renommer ne rendrait pas le code plus vrai ; elle
   est maintenant partagée par les deux, comme `normNomIA` l'est entre le banc
   et l'interprète de la barre ✦.

   LES RANGÉES QUE L'IA COMPOSE (liste A de la spec) : `top10`, `esprit`,
   `favoris`, `genre`, `acteur:<id>`, `serie`/`film`/`anime`, `reste`. Elles
   sont REMPLACÉES par les siennes, intitulés compris — elle nomme ce qu'elle
   compose, et `intitules_rangees` ne s'applique donc plus qu'aux rangées
   locales.

   CE QUI RESTE LOCAL, SOURCE INCHANGÉE : `avenir` (un calendrier), `nouv`,
   `cercle`, et les éditoriales — celles-là sont seulement rangées et
   contrôlées, c'est le lot 1a.

   LE DÉGRADÉ PRIME SUR TOUT LE RESTE (§4) : IA coupée, en panne, hors quota ou
   réponse invalide → l'écran redevient EXACTEMENT celui d'aujourd'hui, moteur
   local intégral, sans message d'erreur et sans trou. C'est une règle du
   dépôt, pas une option de ce lot.
   =========================================================================== */

/* Les clés de rangée que l'IA remplace. Tout ce qui n'est pas là reste local.
   `acteur:` est un préfixe : la clé porte l'identifiant de la personne. */
const IA_RANGEES_COMPOSEES = ['top10', 'esprit', 'favoris', 'genre', 'reste',
                              'serie', 'film', 'anime'];
function estRangeeComposeeIA(cle){
  return IA_RANGEES_COMPOSEES.indexOf(cle) >= 0 || String(cle).indexOf('acteur:') === 0;
}

/* L'ANTI-BOUCLE (§3) — six compositions par jour au plus, tous motifs
   confondus. Sans lui, un après-midi de 👍 et de duels ferait repartir une
   composition à chaque geste : c'est-à-dire une rafale de requêtes IA ET de
   requêtes TMDB, pour un écran que personne ne regarde entre-temps.
   Six, c'est quatre familles plus deux recompositions sur signal fort — la
   spec pose ce chiffre comme défaut, et il est ici et nulle part ailleurs. */
const IA_COMPO_MAX_JOUR = 6;

/* Le compteur de compositions du jour, dans le cache IA. Il se remet à zéro au
   changement de jour, EN LECTURE, comme celui des pitchs — un compteur de la
   veille ne doit jamais faire croire que la journée est consommée. */
function compoCompteIA(){
  const o = lireCacheIA();
  const auj = todayISO();
  if(!o.compo || o.compo.jour !== auj) return 0;
  return o.compo.n || 0;
}

/* La signature des goûts au moment de la composition. C'est elle qui dit qu'un
   signal fort est passé — un 👍, un 👎, un duel joué, un ajout. On réutilise
   `signatureGouts` d'app-11 : une seconde définition finirait par diverger de
   celle qui invalide déjà le cache des suggestions. */
function compoSignatureIA(){
  try{ return (typeof signatureGouts === 'function') ? String(signatureGouts()) : ''; }
  catch(e){ return ''; }
}

/* --------------------------- LA LECTURE (à chaque rendu) --------------------------- */

/* SYNCHRONE, SANS RÉSEAU, ET ELLE SERT LA COMPOSITION PRÉCÉDENTE tant que la
   nouvelle n'est pas écrite. C'est ce qui tient la règle transverse du dépôt :
   une recomposition s'affiche à la PROCHAINE entrée d'écran, jamais sous le
   doigt de quelqu'un qui est en train de faire défiler.

   LE TAMIS EST REPASSÉ ICI, et ce n'est pas de la méfiance : entre la
   composition d'hier soir et ce rendu-ci, la personne a pu ajouter un de ces
   titres à sa bibliothèque ou le refuser. Le proposer encore serait la seule
   chose qui se verrait vraiment. C'est le même réflexe que `poserTop`, qui
   refait un `dejaChezMoi` à la main sur un cache qui peut être périmé. */
function compoIARangees(puce){
  if(!iaActive('decouvrir')) return null;
  const o = lireCacheIA();
  const c = o.compo && o.compo.fams && o.compo.fams[puce || 'tout'];
  if(!c || !Array.isArray(c.rangees) || !c.rangees.length) return null;
  if(c.jour !== todayISO()) return null;      // une composition d'hier ne sert pas

  const vus = {};
  const cadre = (typeof cadreSugg === 'function') ? cadreSugg(puce)
                                                  : { medias:['tv','movie'], origine:'mixte' };
  const out = [];
  c.rangees.forEach((r, i)=>{
    const brut = Array.isArray(r.l) ? r.l : [];
    const l = (typeof tamiser === 'function') ? tamiser(brut, vus, cadre, false) : brut;
    if(l.length) out.push({ cle:'ia:' + i, titre:String(r.titre || ''), l:l, ia:true });
  });
  return out.length ? out : null;
}

/* --------------------------- LE CALCUL (au lot du jour, et sur signal fort) --------------------------- */

/* Une famille. Rend `true` si des rangées ont été écrites.

   LA TENTATIVE EST TOUJOURS INSCRITE, MÊME QUAND ELLE ÉCHOUE, et c'est le
   garde-fou le plus important de cette fonction. Sans lui, une réponse vide —
   relais coupé, quota atteint, JSON refusé — laisserait `compoIAaFaire` rendre
   `true` indéfiniment, donc une nouvelle tentative À CHAQUE RENDU de l'écran.
   Une rafale, exactement ce que le §3 demande d'éviter, et personne ne la
   verrait : elle est silencieuse par construction. C'est la même règle que le
   lot du jour, qui pose son marqueur même quand ses deux requêtes ont échoué —
   « une journée de dégradé silencieux vaut mieux qu'un écran qui redemande à
   chaque repeint ».

   UNE COMPOSITION QUI ÉCHOUE N'EFFACE PAS LA PRÉCÉDENTE : on garde ses rangées
   si elle en avait. Écraser une bonne composition par une liste vide serait le
   seul moyen de rendre l'écran pire qu'avant. */
async function composerFamilleIA(puce){
  const f = BANC_FAMILLES.filter(x => x.puce === puce)[0] || BANC_FAMILLES[0];
  const mesures = { tmdb:0, proposes:0, tamises:0, ms:0 };
  const t0 = Date.now();
  let r = null;
  try{ r = await bancFamilleIA(f, mesures); }catch(e){ r = null; }
  mesures.ms = Date.now() - t0;

  /* La spec demande de FOURNIR LARGE : environ deux fois ce qui sera affiché,
     parce que la vérification TMDB et le tamis en retirent une partie. On garde
     au plus six rangées et douze titres chacune — au-delà, on stocke des
     vignettes que personne ne fera défiler, dans un `localStorage` qui n'est
     pas extensible. */
  const rangees = (r && !r.err ? r.rangees || [] : []).slice(0, 6).map(x => ({
    titre: String(x.titre || '').slice(0, 60),
    l: (x.l || []).slice(0, 12)
  })).filter(x => x.titre && x.l.length);

  const o = lireCacheIA();
  const auj = todayISO();
  if(!o.compo || o.compo.jour !== auj) o.compo = { jour:auj, n:0, fams:{} };
  if(!o.compo.fams || typeof o.compo.fams !== 'object') o.compo.fams = {};
  const avant = o.compo.fams[f.puce];
  o.compo.n = (o.compo.n || 0) + 1;
  o.compo.fams[f.puce] = {
    jour: auj, sig: compoSignatureIA(),
    /* Rien de neuf : on reconduit ce qui était là, s'il est du jour. */
    rangees: rangees.length ? rangees
            : ((avant && avant.jour === auj && avant.rangees) || []),
    /* Les mesures voyagent avec la composition : c'est le taux de jetés que la
       spec demande de rapporter, et il ne se reconstitue pas après coup. */
    proposes: mesures.proposes, jetes: ((r && r.jetes) || []).length,
    tamises: mesures.tamises, tmdb: mesures.tmdb, ms: mesures.ms
  };
  ecrireCacheIA(o);
  return rangees.length > 0;
}

/* Le déclencheur, appelé après chaque rendu de la vitrine (jamais avant).
   Trois raisons de composer, dans l'ordre où on les teste :
     · rien pour cette famille aujourd'hui ;
     · la signature des goûts a bougé depuis — c'est le SIGNAL FORT du §3
       (un 👍, un 👎, un duel joué, un ajout) ;
     · rien d'autre. On ne compose pas « pour voir ».
   Et dans tous les cas, l'anti-boucle a le dernier mot. */
function compoIAaFaire(puce){
  if(!iaActive('decouvrir')) return false;
  if(compoCompteIA() >= IA_COMPO_MAX_JOUR) return false;
  const o = lireCacheIA();
  const c = o.compo && o.compo.fams && o.compo.fams[puce];
  if(!c || c.jour !== todayISO()) return true;
  return c.sig !== compoSignatureIA();
}

let compoEnCoursIA = false;
function apresRenduCompoIA(){
  if(compoEnCoursIA) return;
  const puce = (typeof ui !== 'undefined' && ui.disc && ui.disc.type) ? ui.disc.type : 'tout';
  if(!compoIAaFaire(puce)) return;
  if(!prendreVerrouIA()) return;         // un autre onglet s'en occupe
  compoEnCoursIA = true;
  /* Un tour de boucle d'événements : l'écran en cours finit de se peindre, la
     personne le voit, et seulement ensuite on parle au réseau. */
  setTimeout(async ()=>{
    try{
      const ecrit = await composerFamilleIA(puce);
      /* ON NE REPEINT PAS. La composition qui vient d'arriver s'affichera à la
         PROCHAINE entrée d'écran — c'est la règle transverse du dépôt, et c'est
         aussi la demande explicite du §3 : « jamais de rangée qui bouge sous le
         doigt ». Un `peindreDisc()` ici ferait exactement ce qu'elle interdit,
         et ce serait le premier réflexe. */
      if(!ecrit && typeof console !== 'undefined' && console.debug)
        console.debug('[ia] composition sans résultat pour ' + puce);
    }catch(e){}
    finally{ compoEnCoursIA = false; rendreVerrouIA(); }
  }, 0);
}

/* ------------------------------ LES VOTES ------------------------------ */

/* Un vote porte sur une RANGÉE — c'est la maille que la spec demande, et c'est
   la bonne : ce qu'on juge, c'est l'idée de la rangée et la cohérence de ce
   qu'elle rassemble, pas un titre isolé.
   La clé est (famille, intitulé de la rangée) : elle survit à une seconde
   génération qui reproposerait la même idée, ce qui est exactement ce qu'on
   veut mesurer sur plusieurs jours. */
const BANC_VOTES_CLE = 'ms.banc.v1';
function bancVotes(){
  try{
    const o = JSON.parse(localStorage.getItem(BANC_VOTES_CLE) || '{}');
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  }catch(e){ return {}; }
}
function bancCleVote(fam, titre){ return fam + '|' + String(titre || '').slice(0, 80); }
function bancVoteDe(fam, titre){
  const v = bancVotes()[bancCleVote(fam, titre)];
  return (v && v.v) || 0;
}
function bancVoter(fam, titre, v){
  const o = bancVotes();
  const k = bancCleVote(fam, titre);
  /* Re-toucher le même pouce l'annule : un vote qu'on ne peut pas retirer est
     un vote qu'on hésite à donner. */
  if(o[k] && o[k].v === v) delete o[k];
  else o[k] = { v:v, fam:fam, titre:String(titre || '').slice(0, 80), quand:Date.now() };
  try{ localStorage.setItem(BANC_VOTES_CLE, JSON.stringify(o)); }catch(e){}
  if(typeof render === 'function') render();
}
function bancNbVotes(){ return Object.keys(bancVotes()).length; }
/* L'export : un fichier JSON, comme la sauvegarde de l'app. Il contient les
   votes ET les rangées qui étaient à l'écran au moment de l'export, sans quoi
   un pouce en bas six semaines plus tard ne dirait plus sur quoi il portait. */
function bancExporterVotes(){
  const paquet = { app:'mes-series', quoi:'banc-essai-ia', quand:new Date().toISOString(),
                   votes:bancVotes(), mesures:bancEtat.mesures || null, familles:{} };
  BANC_FAMILLES.forEach(f=>{
    const e = bancEtat.fams[f.cle];
    if(!e) return;
    paquet.familles[f.cle] = {
      rangees: (e.ia.rangees || []).map(r => ({ titre:r.titre, titres:r.l.map(x => x.nom) })),
      jetes: e.ia.jetes || []
    };
  });
  try{
    const b = new Blob([JSON.stringify(paquet, null, 2)], { type:'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u; a.download = 'banc-ia-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(u), 1000);
    if(typeof toast === 'function') toast('Votes exportés');
  }catch(e){ if(typeof toast === 'function') toast('Export impossible ici'); }
}

/* ------------------------------- L'ÉCRAN ------------------------------- */

function bancVignette(x){
  const img = x.affiche ? '<img loading="lazy" src="'+IMG(x.affiche, 'w185')+'" alt="">'
                        : '<div class="bncvide"></div>';
  return '<div class="bncv" title="'+esc(x.nom)+'">'+img+
    '<span>'+esc(x.nom)+'</span></div>';
}
function bancColonneIA(fam, e){
  if(e.ia.err) return '<div class="bncnote">'+esc(e.ia.err)+'</div>';
  if(!e.ia.rangees.length) return '<div class="bncnote">Aucune rangée n\'a survécu à la vérification.</div>';
  return e.ia.rangees.map(r=>{
    const v = bancVoteDe(fam, r.titre);
    return '<div class="bncr"><div class="bnch">'+
      '<b>'+esc(r.titre)+'</b>'+
      '<span class="bncvotes">'+
        '<button class="bncp'+(v === 1 ? ' on' : '')+'" '+
          'onclick="bancVoter(\''+escJs(fam)+'\',\''+escJs(r.titre)+'\',1)">👍</button>'+
        '<button class="bncp'+(v === -1 ? ' on' : '')+'" '+
          'onclick="bancVoter(\''+escJs(fam)+'\',\''+escJs(r.titre)+'\',-1)">👎</button>'+
      '</span></div>'+
      '<div class="bncl">'+r.l.map(bancVignette).join('')+'</div></div>';
  }).join('');
}
function bancColonneActuelle(e){
  if(!e.actuelles.length) return '<div class="bncnote">Découvrir n\'a rien à afficher pour cette puce.</div>';
  return e.actuelles.map(r=>
    '<div class="bncr"><div class="bnch"><b>'+esc(r.titre)+'</b></div>'+
    '<div class="bncl">'+r.l.map(bancVignette).join('')+'</div></div>').join('');
}
function bancJetes(e){
  const l = e.ia.jetes || [];
  if(!l.length) return '';
  return '<div class="bncjetes"><b>'+l.length+' titre'+(l.length > 1 ? 's' : '')+
    ' jeté'+(l.length > 1 ? 's' : '')+' avant affichage</b> — '+
    l.map(j => esc(j.nom) + ' (' + esc(j.raison) + ')').join(' · ')+'</div>';
}
function bancMesures(){
  const m = bancEtat.mesures;
  if(!m) return '';
  const jetes = jetesTotalBanc();
  const taux = m.proposes ? Math.round(jetes / m.proposes * 100) : 0;
  return '<div class="bncmes">'+
    '<span><b>'+jetes+' / '+m.proposes+'</b> titres jetés ('+taux+' %)</span>'+
    '<span><b>'+m.tamises+'</b> retirés par le tamis</span>'+
    '<span><b>'+m.tmdb+'</b> requêtes TMDB de vérification</span>'+
    '<span><b>'+(m.ms / 1000).toFixed(1).replace('.', ',')+' s</b> au total</span>'+
  '</div>';
}
/* ---------------------------------------------------------------------------
   SPEC-09 LOT 1 — LE TAUX DE JETÉS DE L'ÉCRAN RÉEL, ET PAS SEULEMENT DU BANC.

   La spec demande de mesurer ce taux et de le rapporter. Le banc le donne pour
   SES propres tirages — mais le banc, on l'ouvre exprès, et il tire sur un
   profil qu'on choisit. Ce qui compte pour de bon, c'est ce que la composition
   de l'écran RÉEL a jeté hier soir, sans que personne regarde.

   Ces chiffres-là sont écrits par `composerFamilleIA` à chaque composition, et
   cette ligne est le seul endroit où on peut les lire. Sans elle, ils
   existeraient sans être lisibles — c'est-à-dire qu'ils n'existeraient pas.

   AU-DESSUS DE 30 %, LA SPEC DEMANDE DE RESSERRER LE PROMPT plutôt que de
   laisser filer : le seuil est écrit dans le texte affiché, pour que la
   décision se prenne en regardant le chiffre et pas de mémoire.
--------------------------------------------------------------------------- */
function bancMesuresReelles(){
  const c = lireCacheIA().compo;
  if(!c || !c.fams) return '';
  const noms = Object.keys(c.fams);
  if(!noms.length) return '';
  let proposes = 0, jetes = 0, tamises = 0, tmdb = 0;
  noms.forEach(k=>{
    const f = c.fams[k];
    proposes += f.proposes || 0; jetes += f.jetes || 0;
    tamises += f.tamises || 0;   tmdb += f.tmdb || 0;
  });
  if(!proposes) return '';
  const taux = Math.round(jetes / proposes * 100);
  return '<div class="bncmes">'+
    '<span><b>Écran réel, '+esc(c.jour || '')+'</b></span>'+
    '<span><b>'+jetes+' / '+proposes+'</b> titres jetés ('+taux+' %'+
      (taux > 30 ? ' — au-dessus des 30 % : resserrer le prompt' : '')+')</span>'+
    '<span><b>'+tamises+'</b> retirés par le tamis</span>'+
    '<span><b>'+tmdb+'</b> requêtes TMDB de vérification</span>'+
    '<span><b>'+noms.length+'</b> composition'+(noms.length > 1 ? 's' : '')+
      ' sur '+IA_COMPO_MAX_JOUR+' possibles aujourd\'hui</span>'+
  '</div>';
}

function jetesTotalBanc(){
  let n = 0;
  BANC_FAMILLES.forEach(f=>{ const e = bancEtat.fams[f.cle]; if(e) n += (e.ia.jetes || []).length; });
  return n;
}

function viewBancIA(){
  let html = header('Banc d\'essai IA', { back:"goBack()" });
  html += '<div class="wrap bnctete">'+
    '<p class="tiny muted">L\'IA compose les rangées elle-même, au service de ton profil. '+
    'Chaque titre proposé est vérifié sur TMDB avant d\'être affiché, puis passe le tamis '+
    'habituel (déjà vu, écarté, « pas pour moi », genres exclus). '+
    'Vote par rangée : ce sont ces votes qui décideront de la suite.</p>';
  /* SPEC-09 LOT 1 (01/09/2026) — LA PHRASE « rien de ce que tu vois ici
     n'atteint l'écran Découvrir » A ÉTÉ RETIRÉE, parce qu'elle est devenue
     fausse : la même chaîne compose maintenant les rangées personnelles de
     l'écran réel. Laisser la phrase aurait été pire qu'un oubli — c'est le
     genre de mensonge qu'on croit six mois. Ce qui reste vrai, et qui la
     remplace : les TIRAGES du banc, eux, restent des tirages d'essai. */
  html += '<p class="tiny muted">Depuis SPEC-09 lot 1, cette chaîne compose '+
    'aussi les rangées personnelles de l\'écran Découvrir. Les tirages faits '+
    'ICI restent des essais : ils ne remplacent rien.</p>';
  html += bancMesuresReelles();
  if(!iaActive('decouvrir'))
    html += '<div class="banner">L\'IA de Découvrir est coupée dans les Réglages : '+
      'le banc ne peut rien demander. Rien d\'autre ne change.</div>';
  html += '<div class="bncbar">'+
    '<button class="btn" onclick="bancGenererIA()"'+(bancEtat.encours ? ' disabled' : '')+'>'+
      (bancEtat.encours ? 'Génération…' : (bancEtat.fait ? 'Regénérer' : 'Générer'))+'</button>'+
    '<button class="btn ghost" onclick="bancExporterVotes()">Exporter les votes ('+bancNbVotes()+')</button>'+
    '<button class="btn ghost" onclick="fermerDevBanc()">Masquer les outils</button>'+
  '</div>';
  if(bancEtat.err) html += '<div class="banner">'+esc(bancEtat.err)+'</div>';
  html += bancMesures();
  html += '</div>';

  BANC_FAMILLES.forEach(f=>{
    const e = bancEtat.fams[f.cle];
    if(!e) return;
    html += '<div class="sectitle">'+esc(f.nom)+'</div>'+
      '<div class="bnc2">'+
        '<div class="bncc"><div class="bncct">Proposé par l\'IA</div>'+bancColonneIA(f.cle, e)+'</div>'+
        '<div class="bncc"><div class="bncct">Découvrir aujourd\'hui</div>'+bancColonneActuelle(e)+'</div>'+
      '</div>'+ bancJetes(e);
  });
  if(!bancEtat.fait && !bancEtat.encours)
    html += '<div class="wrap tiny muted">Touche « Générer » : quatre requêtes IA et '+
            'quelques dizaines de vérifications TMDB. Compte une minute.</div>';
  return html;
}

/* ===========================================================================
   SPEC-11 (29/08/2026) — LA BARRE ✦ DEVIENT UN VRAI INTERPRÈTE

   LA DEMANDE D'ADRIEN, mot pour mot : « je veux pouvoir taper "je cherche un
   film d'action avec Will Smith" comme "je cherche le film où Leonardo DiCaprio
   est courtier et se drogue" (pour trouver Le Loup de Wall Street), et "je veux
   un film d'action et d'aventure" ».

   TROIS CAPACITÉS MANQUAIENT au routeur d'envie, et une seule tâche les apporte
   toutes les trois :
     · LES PERSONNES — un nom au générique n'est pas une dimension de filtre ;
       il se résout sur `/search/person` et devient `with_people` ;
     · LES DESCRIPTIONS — « le film où un courtier se drogue » ne décrit pas des
       critères, il décrit UNE ŒUVRE. C'est le mode `titre` ;
     · LE ET DE GENRES — « action ET aventure » posait deux genres en OU, ce qui
       n'est pas ce qui a été demandé. Le réglage du RETOUR-04 existe déjà ; il
       manquait quelqu'un pour le basculer.

   CE QUI NE CHANGE PAS, ET C'EST LA MOITIÉ DU LOT : la grille, son cache, ses
   planchers, le mode ⌕ normal. Le ✦ éteint reste la recherche de titre
   d'aujourd'hui. IA indisponible ou réponse invalide → le comportement
   d'aujourd'hui, à l'identique. Le ✦ ne meurt jamais.

   BUDGET : UNE requête IA par validation, jamais pendant la frappe (RB-1 tient,
   et elle est même renforcée : c'est `validerRech` qui appelle, pas
   `saisieRech`), cache par phrase EXACTE pour la session, plus les quelques
   requêtes TMDB de résolution — une par personne, une par candidat. */

const IA_PHRASE_CACHE_MAX = 20;
/* Phrase exacte (minuscules) → réponse validée, ou `null` pour « on a demandé,
   ça n'a rien donné ». Le `null` compte : re-valider deux fois la même phrase
   incomprise ne doit pas repayer la requête. En mémoire, comme le cache de
   grille — une session, pas plus. */
let iaPhraseCache = {};
let interpEnCoursIA = false;

function oublierCachePhraseIA(){ iaPhraseCache = {}; }

/* RETOUR-10 §2 — « ce qui a été compris, en clair ». Trois ou quatre mots, pas
   un rapport : la ligne fait une seule hauteur et doit rester lisible d'un coup
   d'œil. Le texte sort du relais, donc il est NON SÛR — `ligneStatutIA`
   l'échappe, et on ne le pousse jamais dans un `onclick`. */
function resumeComprisIA(d){
  if(!d) return '';
  if(d.mode === 'titre'){
    const n = ((d.titres || []).length) | 0;
    return n ? (n > 1 ? n + ' pistes possibles' : '1 titre probable') : '';
  }
  const f = d.filtres || {};
  const bouts = [];
  if(f.famille) bouts.push(String(f.famille));
  (f.genres || []).slice(0, 3).forEach(g => bouts.push(String(g)));
  (f.personnes || []).slice(0, 2).forEach(p => bouts.push(String(p)));
  if(f.epoque) bouts.push(String(f.epoque));
  if(f.duree) bouts.push(String(f.duree));
  (f.plateformes || []).slice(0, 2).forEach(p => bouts.push(String(p)));
  return bouts.slice(0, 5).join(' · ');
}

async function interpreterRechercheIA(phrase){
  const q = String(phrase == null ? '' : phrase).trim();
  if(!q) return;
  /* Le mode ✦ ne s'allume pas sans l'interrupteur, mais le chemin
     programmatique existe : on rend alors la recherche de texte, pas un écran
     muet. */
  if(typeof iaActive !== 'function' || !iaActive('recherche')) return repliTexteIA(q);
  if(interpEnCoursIA) return;
  interpEnCoursIA = true;
  try{
    const cle = q.toLowerCase();
    let d;
    if(Object.prototype.hasOwnProperty.call(iaPhraseCache, cle)){
      /* CACHE : AUCUN ALLER-RETOUR, DONC AUCUNE LIGNE DE STATUT (RETOUR-10 §2).
         Refaire la même phrase répond dans la même frame ; poser « Je lis ta
         phrase… » ici la ferait apparaître et disparaître d'un seul coup —
         un clignotement, c'est-à-dire exactement l'impression de panne que ce
         lot existe pour supprimer. */
      d = iaPhraseCache[cle];
    }else{
      if(typeof poserStatutIA === 'function') poserStatutIA('lit');
      /* RETOUR-10 §1 — l'escalade se passe sur le serveur, qui ne parle qu'une
         fois. Passé 1 400 ms sans réponse, le petit modèle a presque toujours
         déjà rendu la main : ce qui dure est le second essai, et on le dit.
         Voir le pavé d'`IA_LOIN_APRES_MS` (app-12) pour le chiffre et pour ce
         que cette déduction peut coûter. */
      if(typeof guetterEscaladeIA === 'function') guetterEscaladeIA();
      d = await appelIA('interpreter_recherche', { phrase: q.slice(0, 300) });
      if(d) noterRequeteIA();
      const cles = Object.keys(iaPhraseCache);
      if(cles.length >= IA_PHRASE_CACHE_MAX) delete iaPhraseCache[cles[0]];
      iaPhraseCache[cle] = d || null;
    }
    if(!d || (d.mode !== 'filtres' && d.mode !== 'titre')){
      /* LE COMPORTEMENT D'AUJOURD'HUI, À L'IDENTIQUE : c'est mot pour mot ce
         que `traduireEnvieIA` dit quand le relais ne rend rien d'exploitable.
         Aucune pilule fantôme, aucun résultat modifié. */
      toast('✦ Pas compris — décris un genre, une époque, une durée…');
      return;
    }
    /* RETOUR-10 §2 — « ✓ Compris », et ce qui a été compris EN CLAIR. La ligne
       reste pendant la suite du travail : après la réponse de l'IA, on résout
       encore les personnes sur `/search/person` et on vérifie les candidats sur
       `/search/multi`. C'est du temps que la personne voit passer, et il est
       maintenant justifié au lieu d'être subi. */
    if(typeof poserStatutIA === 'function') poserStatutIA('compris', resumeComprisIA(d));
    if(d.mode === 'titre') return await poserCandidatsIA(q, d.titres || []);
    return await poserFiltresIA(d.filtres || {});
  }catch(e){
    toast('✦ Pas compris — décris un genre, une époque, une durée…');
  }finally{
    interpEnCoursIA = false;
    /* La ligne s'efface quand les résultats sont peints — c'est-à-dire ici,
       une fois `poserFiltresIA` / `poserCandidatsIA` terminés. En cas de panne,
       elle laisse la place au message d'erreur habituel (le `toast` ci-dessus),
       et le liseré s'arrête dans tous les cas : un échec ne doit pas laisser la
       barre courir indéfiniment. */
    if(typeof effacerStatutIA === 'function') effacerStatutIA();
  }
}

/* La bascule silencieuse : on éteint le ✦ et on cherche la phrase comme un
   titre. « Silencieuse » veut dire SANS message d'échec — la personne voit une
   recherche de texte normale, pas un rapport d'erreur d'IA. La couleur de la
   barre change, et c'est la seule chose qui le dit : elle annonce honnêtement
   ce que l'écran fait maintenant. */
function repliTexteIA(q){
  const r = etatRech();
  r.envie = false;
  r.q = q;
  r.candIA = null;
  if(typeof render === 'function') render();
  if(typeof lancerTitre === 'function') lancerTitre(true);
}

/* ---------------------- MODE `filtres` ---------------------- */

/* Les noms d'usage des plateformes, par clé du vocabulaire fermé du relais.
   On ne pose QUE ce que la personne a déclaré : `mesPlates()` est la liste de
   référence, et un nom qui n'y correspond pas tombe — comme un critère
   inventé. Plusieurs écritures par clé, parce que TMDB nomme « Amazon Prime
   Video » ce que tout le monde appelle « Prime ». */
const IA_PLATES_NOMS = {
  netflix:['netflix'],
  prime:['amazon prime video','prime video','amazon video','prime'],
  disney:['disney plus','disney+'],
  canal:['canal+','canal plus','mycanal'],
  appletv:['apple tv plus','apple tv+','apple tv'],
  max:['max','hbo max'],
  crunchyroll:['crunchyroll'],
  adn:['animation digital network','adn']
};
function plateDeCleIA(cle){
  const noms = IA_PLATES_NOMS[cle];
  if(!noms) return null;
  const mes = (typeof mesPlates === 'function') ? mesPlates() : [];
  const trouve = mes.find(p => noms.indexOf(normNomIA(p.nom)) >= 0);
  return trouve ? trouve.id : null;
}

async function poserFiltresIA(f){
  const r = etatRech();
  /* Les personnes d'abord, parce que ce sont les seules qui coûtent du réseau :
     si aucune ne se résout et que rien d'autre n'a été compris, on le dira
     avant d'avoir touché à l'écran. */
  const gens = [];
  for(const nom of (f.personnes || []).slice(0, 3)){
    const p = await resoudrePersonneIA(nom);
    if(p && !gens.some(x => String(x.id) === String(p.id))) gens.push(p);
  }
  /* Le vocabulaire du relais, traduit dans celui de l'app — on réutilise
     `appliquerCriteresIA` (lot B), qui sait poser un mot par la mécanique de
     l'écran plutôt qu'en écrivant l'état à la main. */
  /* B3 (relecture du 29/08) — UNE PERSONNE IMPOSE LA FAMILLE FILMS.
     `/discover/tv` n'accepte ni `with_people`, ni `with_cast`, ni `with_crew` :
     hors des films, la personne ne filtrerait rien et la pilule mentirait. On
     pose donc Films en même temps que la personne, quoi qu'ait dit le modèle —
     et on le DIT dans le message, parce que passer de « Séries » à « Films »
     sans un mot serait tout aussi déroutant. */
  const forceFilm = gens.length > 0;
  const famDemandee = f.famille || '';
  const criteres = [];
  if(forceFilm) criteres.push({ cle:'fam', val:'film' });
  else if(f.famille) criteres.push({ cle:'fam', val:f.famille });
  (f.genres || []).forEach(g => criteres.push({ cle:'genre', val:g }));
  if(f.origine) criteres.push({ cle:'origine', val:f.origine });
  if(f.epoque) criteres.push({ cle:'epoque', val:f.epoque });
  if(f.duree) criteres.push({ cle:'duree', val:f.duree });
  if(f.note_mini) criteres.push({ cle:'note', val:f.note_mini });

  /* La phrase du haut redevient des pilules : la garder dans la barre
     laisserait l'écran en mode « recherche de titre » par-dessus. */
  r.q = ''; r.qtitres = []; r.qgens = []; r.qerr = '';
  r.candIA = null;
  let n = appliquerCriteresIA(criteres);
  /* Les plateformes : posées par la mécanique de l'écran, comme le reste. */
  (f.plateformes || []).forEach(cle=>{
    const id = plateDeCleIA(cle);
    if(id == null) return;
    if(listeRech('plate').map(String).indexOf(String(id)) < 0){
      poserMotRech('plate', id); n++;
    }
  });
  /* Les personnes sont posées APRÈS la famille : `setFamRech` les retire quand
     on quitte les films (B3), et la poser d'abord reviendrait à les effacer
     nous-mêmes. `appliquerCriteresIA` écrit `r.fam` directement, pas par
     `setFamRech`, mais l'ordre reste le bon — et il le restera si un jour
     `appliquerCriteresIA` passe par la voie normale. */
  if(gens.length){ r.personnes = gens; n += gens.length; }
  /* LE ET DE GENRES, POSÉ APRÈS LES GENRES ET PAS AVANT : `poserMotRech` remet
     `genreEt` à faux dès qu'il reste moins de deux genres cochés (RETOUR-04
     point 1), donc le poser d'abord reviendrait à ne rien poser du tout. */
  if(f.genres_et === true && listeRech('genre').length >= 2){ r.genreEt = true; n++; }
  if(!n){
    toast('✦ Pas compris — décris un genre, une époque, une durée…');
    return;
  }
  if(typeof relancerRech === 'function') relancerRech();
  /* Le message dit ce qui s'est passé, y compris quand l'écran a bougé plus que
     demandé : « des séries avec Will Smith » a beau être une phrase valable, la
     réponse honnête est une grille de films et la raison. */
  toast(forceFilm && famDemandee && famDemandee !== 'film'
    ? '✦ Compris — sur les films : une personne ne se filtre que là'
    : '✦ Compris — 1 requête');
}

/* « le premier résultat NET », et la définition de « net » est ici, une fois.
   TMDB rend ses personnes par popularité décroissante. On garde la première
   dont le NOM correspond exactement à ce qui a été demandé — et seulement si
   aucune autre correspondance exacte n'est de popularité comparable. Deux
   homonymes également connus, on ne devine pas : on ignore. Poser le mauvais
   acteur donnerait une grille fausse que personne ne verrait comme fausse. */
const IA_PERSONNE_ECART = 2;
async function resoudrePersonneIA(nom){
  const cible = normNomIA(nom);
  if(!cible) return null;
  let d = null;
  try{ d = await tmdb('/search/person', { query: String(nom).slice(0, 60), include_adult:'false' }); }
  catch(e){ return null; }
  const exacts = ((d && d.results) || [])
    .filter(p => p && p.id && normNomIA(p.name) === cible);
  if(!exacts.length) return null;
  if(exacts.length > 1){
    const a = Number(exacts[0].popularity) || 0, b = Number(exacts[1].popularity) || 0;
    if(!(a >= b * IA_PERSONNE_ECART)) return null;      // ambigu : on ne devine pas
  }
  return { id: exacts[0].id, nom: exacts[0].name };
}

/* ---------------------- MODE `titre` ---------------------- */

/* Chaque candidat est confronté à `/search/multi` — le point de terminaison que
   la barre interroge déjà, donc rien de neuf à autoriser côté relais. Le média
   annoncé par le modèle sert de FILTRE, pas de vérité : il se trompe parfois de
   film/série, et un titre juste ne doit pas tomber pour ça. */
async function verifierCandidatIA(t){
  const attendu = t.media === 'film' ? 'movie' : 'tv';
  let d = null;
  try{ d = await tmdb('/search/multi', { query: String(t.nom).slice(0, 80), include_adult:'false' }); }
  catch(e){ return null; }
  const cible = normNomIA(t.nom);
  const l = ((d && d.results) || []).filter(x =>
    x && x.id && x.poster_path && (x.media_type === 'movie' || x.media_type === 'tv'));
  const nomDe = x => x.media_type === 'movie' ? x.title : x.name;
  const origDe = x => x.media_type === 'movie' ? x.original_title : x.original_name;
  const dateDe = x => (x.media_type === 'movie' ? x.release_date : x.first_air_date) || '';
  const exacts = l.filter(x => normNomIA(nomDe(x)) === cible || normNomIA(origDe(x)) === cible);
  if(!exacts.length) return null;
  /* Le média annoncé départage quand plusieurs titres portent le même nom (un
     film et sa série) ; l'année aussi, quand elle est là. */
  let choix = exacts.filter(x => x.media_type === attendu);
  if(!choix.length) choix = exacts;
  if(t.annee && choix.length > 1){
    const parAn = choix.filter(x => Math.abs((Number(dateDe(x).slice(0, 4)) || 0) - t.annee) <= 1);
    if(parAn.length) choix = parAn;
  }
  const x = choix[0];
  return { id:x.id, media:x.media_type, nom:nomDe(x) || origDe(x),
           affiche:x.poster_path, date:dateDe(x) };
}

async function poserCandidatsIA(q, titres){
  const trouves = [];
  for(const t of (titres || []).slice(0, 5)){
    const x = await verifierCandidatIA(t);
    if(x && !trouves.some(y => y.media === x.media && String(y.id) === String(x.id)))
      trouves.push(x);
  }
  /* AUCUN CANDIDAT TROUVÉ → bascule silencieuse sur la recherche de texte.
     Le modèle a peut-être nommé une œuvre qui n'existe pas, ou la personne
     tapait finalement un titre : dans les deux cas, chercher le texte est la
     chose la plus utile qu'on puisse faire, et elle ne demande rien. */
  if(!trouves.length) return repliTexteIA(q);
  const r = etatRech();
  r.candIA = { phrase:q, liste:trouves };
  /* Le champ se vide, comme en mode `filtres` : sans ça l'écran resterait en
     recherche de titre et la carte ne serait jamais rendue. La grille, elle,
     ne bouge PAS — on n'a rien filtré, on a répondu à une question. */
  r.q = ''; r.qtitres = []; r.qgens = []; r.qerr = '';
  if(typeof peindreRech === 'function') peindreRech();
  else if(typeof render === 'function') render();
}
