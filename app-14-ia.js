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
const IA_RANGEES_LIBELLES = ['acclames', 'weekend', 'pepites', 'classiques',
                             'nouv', 'cercle', 'avenir', 'reste'];

let iaLotEnCours = false;

/* Le déclencheur. Appelé APRÈS le premier rendu de Découvrir (§4.3), jamais
   avant : l'écran doit être à l'image avant qu'on dépense une requête. */
function apresRenduDecouvrirIA(){
  if(!iaActive('decouvrir')) return;
  if(iaLotEnCours) return;
  const o = lireCacheIA();
  if(o.jour === todayISO()) return;      // le lot du jour est déjà là
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
    if(!x || !x.nom){ iaLotEnCours = false; return; }

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
   `profil_humeur` A ÉTÉ RETIRÉE de la liste blanche du relais — Adrien, le
   10/08, à la lecture de ce compte rendu : une liste FERMÉE qui garde une porte
   dont personne ne se sert n'est plus fermée, elle est juste plus grande. Le
   pavé de `functions/ia/config.ts` porte le détail, et deux contrôles tiennent
   désormais l'accord entre les tâches déclarées et les tâches appelées (un cas
   d'`index.test.ts`, le contrôle n° 15 du lanceur). Si elle revient un jour, ce
   sera avec un schéma de CRITÈRES, comme `envie_phrase`. */

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

async function lotHumeurIA(cle){
  try{
    const hdef = (typeof humeurDef === 'function') ? humeurDef(cle) : null;
    if(!hdef) return;
    const x = (typeof propositionDuJour === 'function') ? propositionDuJour() : null;
    if(!x || !x.nom) return;
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
  setTimeout(()=>{
    Promise.resolve(chargerBientotPerso()).then(()=>{
      /* La rangée « Bientôt » lit `bientotPerso` sans le déclencher (app-11) :
         maintenant qu'il est rempli, il faut le lui redire. Recomposer les
         suggestions suffit — c'est gratuit, tout est déjà en mémoire. */
      if(typeof oublierSuggestions === 'function') oublierSuggestions();
      if(typeof view !== 'undefined' && view === 'discover' && typeof chargerSuggestions === 'function')
        chargerSuggestions();
    }).catch(()=>{});
  }, 1200);   // on laisse la vitrine finir ses propres requêtes d'abord
}

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

function routerEnvieIA(q, nTitres, nGens){
  if(!iaActive('recherche')) return;
  if(envieEnCoursIA) return;
  if(!ressembleAUneEnvieIA(q, nTitres, nGens)) return;
  envieEnCoursIA = true;
  setTimeout(()=>{ traduireEnvieIA(q).catch(()=>{}); }, 0);
}

async function traduireEnvieIA(q){
  try{
    const r = etatRech();
    const d = await appelIA('envie_phrase', { phrase: String(q || '').slice(0, 300) });
    noterRequeteIA();
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
  noterRequeteIA();
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
  return (e && e.quand > Date.now() - IA_POURQUOI_TTL) ? e : null;
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
    noterRequeteIA();
    const texte = d ? texteIAAcceptable(d.texte, 220) : null;
    const o = lireCacheIA();
    /* On mémorise l'échec aussi, avec un texte vide : sans ça, chaque
       ré-affichage de l'aperçu relancerait une requête pour la même réponse.
       C'est « une tentative, pas de rafale » appliqué à un écran qu'on rouvre. */
    o.rech.pourquoi[cle] = { quand: Date.now(), texte: texte || '' };
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
