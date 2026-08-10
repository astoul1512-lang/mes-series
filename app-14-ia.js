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
   promet que l'app éteinte est EXACTEMENT l'app d'avant. */
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

function cacheIAVide(){
  return { jour:'', pitch:null, titres:null, humeurs:{}, rech:{ pourquoi:{} } };
}

function lireCacheIA(){
  let o = null;
  try{ o = JSON.parse(localStorage.getItem(IA_CLE) || 'null'); }catch(e){ o = null; }
  if(!o || typeof o !== 'object' || Array.isArray(o)) o = cacheIAVide();
  if(typeof o.jour !== 'string') o.jour = '';
  if(!o.humeurs || typeof o.humeurs !== 'object' || Array.isArray(o.humeurs)) o.humeurs = {};
  if(!o.rech || typeof o.rech !== 'object' || Array.isArray(o.rech)) o.rech = { pourquoi:{} };
  if(!o.rech.pourquoi || typeof o.rech.pourquoi !== 'object' || Array.isArray(o.rech.pourquoi))
    o.rech.pourquoi = {};
  return o;
}

function ecrireCacheIA(o){
  try{ localStorage.setItem(IA_CLE, JSON.stringify(o)); }catch(e){ /* plein : tant pis */ }
}

/* Éteindre un interrupteur efface SA moitié du cache, pas celle de l'autre
   écran : les deux IA s'éteignent séparément (SPEC-05 §6). */
function oublierCacheIA(quoi){
  const o = lireCacheIA();
  if(quoi === 'decouvrir'){ o.jour = ''; o.pitch = null; o.titres = null; o.humeurs = {}; }
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

function apresRenduDecouvrirIA(){
  if(!iaActive('decouvrir')) return;
  if(iaLotEnCours) return;
  const o = lireCacheIA();
  if(o.jour === todayISO()) return;      // le lot du jour est déjà là
  if(!prendreVerrouIA()) return;         // un autre onglet s'en occupe
  iaLotEnCours = true;
  /* Un tour de boucle d'événements : le rendu en cours se termine, la personne
     voit son écran, et seulement ensuite on parle au réseau. */
  setTimeout(()=>{ lotIAduJour().catch(()=>{}); }, 0);
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

    /* Le marqueur de jour se pose même si les deux requêtes ont échoué : une
       journée de dégradé silencieux vaut mieux qu'un écran qui redemande à
       chaque repeint. C'est la lecture stricte de « une tentative, pas de
       rafale » appliquée à la journée entière. */
    const maj = lireCacheIA();
    maj.jour = jour;
    maj.pitch = pitch ? { cle: cle, texte: pitch } : null;
    maj.titres = titres;
    ecrireCacheIA(maj);

    if(typeof view !== 'undefined' && view === 'discover' && typeof peindreDisc === 'function')
      peindreDisc();
  }finally{
    iaLotEnCours = false;
    rendreVerrouIA();
  }
}

/* Ce que la vitrine lit. Rendre `null` veut dire « garde ta ligne au cœur » —
   il n'y a pas de phrase creuse de remplacement (§3). */
function pitchIAduJour(x){
  if(!x || !iaActive('decouvrir')) return null;
  const o = lireCacheIA();
  if(o.jour !== todayISO() || !o.pitch) return null;
  if(o.pitch.cle !== x.media + ':' + x.id) return null;   // la proposition a tourné
  return texteIAAcceptable(o.pitch.texte, 220);
}

function intituleIA(cle, defaut){
  if(!iaActive('decouvrir')) return defaut;
  const o = lireCacheIA();
  if(o.jour !== todayISO() || !o.titres) return defaut;
  const v = o.titres[cle];
  return (typeof v === 'string' && v) ? v : defaut;
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
  if(!e || e.jusqua <= Date.now() || !e.texte) return null;
  if(e.cle !== x.media + ':' + x.id) return null;
  return texteIAAcceptable(e.texte, 220);
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
