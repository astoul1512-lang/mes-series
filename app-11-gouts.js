"use strict";
/* ---------------------------------------------------------------------------
   Le profil de goût, et les suggestions qui en découlent.

   Parti pris, discuté avec Adrien : on ne demande RIEN pour commencer. L'app
   sait déjà ce qu'il regarde, ce qu'il finit, dans quels genres — un
   questionnaire à l'inscription exigerait un effort avant d'avoir rien rendu,
   et se périmerait. Le profil se déduit donc de la bibliothèque, et un écran
   « Mes goûts » permet ensuite de l'affiner : ajouter des acteurs, écarter un
   genre. Le formulaire existe, mais il est proposé, jamais imposé.

   Ce que la vitrine doit montrer, mot pour mot : « un mélange de film et
   série », « des choses qu'on n'a jamais vues ou de nouvelles sorties ».
   Depuis, chaque puce a sa propre vitrine : « Tout » mêle séries, films et
   animés ; les trois autres cadrent. Deux règles ne bougent jamais — on retire
   ce qui est déjà dans la bibliothèque, et on dit d'où vient chaque proposition.
--------------------------------------------------------------------------- */

/* Le bloc de préférences. Absent des bases d'avant : on le crée au démarrage. */
function migrerGouts(){
  if(!db.gouts || typeof db.gouts !== 'object') db.gouts = {};
  const g = db.gouts;
  /* Les genres que l'on aime, choisis à la main. Vide = on déduit. */
  if(!Array.isArray(g.genres)) g.genres = [];
  /* Les genres que l'on ne veut plus voir, quoi qu'en dise la déduction. */
  if(!Array.isArray(g.exclus)) g.exclus = [];
  /* Les acteurs favoris : {id, nom}. C'est la seule chose qu'on ne sait pas
     deviner sans aller chercher le casting de toute la bibliothèque. */
  if(!Array.isArray(g.acteurs)) g.acteurs = [];
  /* L'écran a-t-il déjà été proposé ? On ne le propose qu'une fois. */
  if(typeof g.propose !== 'boolean') g.propose = false;
  /* D5 — les graines d'amorçage : {media, id, nom, famille}. Ce sont des titres
     qu'on dit avoir aimés SANS les mettre dans la bibliothèque — de quoi faire
     démarrer les suggestions le premier jour, quand rien n'a encore été vu. */
  if(!Array.isArray(g.graines)) g.graines = [];
  /* La grille d'amorçage a-t-elle été refermée ? Elle ne se rouvre pas toute
     seule : on en sort par un bouton, et la bibliothèque prend le relais. */
  if(typeof g.amorcageFait !== 'boolean') g.amorcageFait = false;
  /* Les plateformes auxquelles la personne est abonnée : {id, nom, logo}.
     C'est la seule chose que l'app ne peut pas deviner — savoir qu'on regarde
     des séries Netflix ne dit pas qu'on paie Netflix. Le déclarer évite en
     prime le sondage à dix-neuf requêtes qui essayait de reconnaître les
     plateformes d'abonnement parmi les boutiques de location. */
  if(!Array.isArray(g.plates)) g.plates = [];
  /* La question a-t-elle été posée ? On ne la repose pas, même sans réponse. */
  if(typeof g.platesDemande !== 'boolean') g.platesDemande = false;
  /* Les suggestions se limitent-elles aux plateformes déclarées ? Non par
     défaut : mieux vaut découvrir un titre et savoir qu'il faut le louer que
     de ne jamais le croiser. */
  if(typeof g.suggMesPlates !== 'boolean') g.suggMesPlates = false;
  /* Date du dernier calcul des suggestions, pour ne les refaire qu'une fois
     par jour — chaque source coûte une requête. */
  if(typeof g.jour !== 'string') g.jour = '';
  /* E7 — les suggestions se limitent-elles à l'anglophone et à l'Europe de
     l'Ouest ? Oui par défaut : c'est le comportement actuel, et le changer
     sans qu'on le demande ferait bouger l'écran de tout le monde. */
  if(typeof g.toutesOrigines !== 'boolean') g.toutesOrigines = false;
}

/* B8 — toute modification des goûts est datée. C'est cet horodatage, et lui
   seul, qui départage deux appareils à la synchro : les préférences ne se
   fusionnent pas champ par champ, la plus récente gagne en bloc. Passer par
   une fonction plutôt que de le poser à la main dans les sept endroits qui
   modifient : le huitième aurait été oublié. */
function toucheGouts(){
  if(db.gouts) db.gouts.maj = Date.now();
  saveDB();
}

/* Le sous-titre de la ligne « Mes goûts » dans les réglages : il doit dire en
   un coup d'œil si l'app devine toute seule ou si on lui a donné des consignes. */
function resumeGouts(){
  const g = db.gouts || {};
  if(!goutsManuels()) return 'Automatique, d\'après ce que tu regardes';
  const bouts = [];
  if((g.genres||[]).length)  bouts.push(g.genres.length + (g.genres.length>1?' genres':' genre'));
  if((g.acteurs||[]).length) bouts.push(g.acteurs.length + (g.acteurs.length>1?' acteurs':' acteur'));
  if((g.exclus||[]).length)  bouts.push(g.exclus.length + ' écarté'+(g.exclus.length>1?'s':''));
  return bouts.join(' · ');
}

/* Le profil est-il réglé à la main, ou déduit ? Sert à l'écran des réglages. */
function goutsManuels(){
  const g = db.gouts || {};
  return (g.genres||[]).length > 0 || (g.acteurs||[]).length > 0 || (g.exclus||[]).length > 0;
}

/* ---------- Ce que l'app déduit toute seule ---------- */

/* Les genres favoris, pondérés par ce qui a réellement été regardé : une série
   finie pèse plus qu'une série ajoutée et jamais commencée. */
function genresDeduits(){
  const poids = {};
  Object.values(db.shows).forEach(s=>{
    const p = progress(s);
    if(!p.watched) return;                       // ajoutée mais jamais ouverte : ne dit rien
    const n = p.watched + (isFinished(s) ? 10 : 0);
    (s.genres||[]).forEach(g=>{ poids[g] = (poids[g]||0) + n; });
  });
  Object.values(db.movies).forEach(m=>{
    if(!m.seen) return;
    (m.genres||[]).forEach(g=>{ poids[g] = (poids[g]||0) + 5; });
  });
  return Object.keys(poids).sort((a,b)=>poids[b]-poids[a]);
}

/* Les genres réellement retenus : ceux choisis à la main s'ils existent,
   les déduits sinon — et jamais ceux qu'on a écartés.
   Ce qui a été coché à la main est retenu EN ENTIER. Le plafond de trois
   valait pour la déduction, où la queue de liste n'est que du bruit ; appliqué
   aux choix d'Adrien, il en jetait quatre sur sept sans rien dire. */
const GENRES_DEDUITS_MAX = 3;
function genresRetenus(){
  const g = db.gouts || {};
  const manuels = (g.genres||[]).length > 0;
  const base = manuels ? g.genres.slice() : genresDeduits().slice(0, GENRES_DEDUITS_MAX);
  const hors = g.exclus || [];
  return base.filter(x => hors.indexOf(x) < 0);
}

/* Les titres que l'on a visiblement aimés : finis, ou bien avancés. Ce sont
   eux qui serviront de point de départ aux recommandations. */
function titresAimes(){
  const out = [];
  Object.values(db.shows).forEach(s=>{
    const p = progress(s);
    if(!p.total) return;
    const part = p.watched / p.total;
    if(isFinished(s) || part >= 0.5)
      out.push({ media:'tv', id:s.id, nom:s.name, famille: familleDe(s, 'tv'),
                 score: part * 100 + p.watched });
  });
  Object.values(db.movies).forEach(m=>{
    if(m.seen) out.push({ media:'movie', id:m.id, nom:m.title, famille:'film', score: 60 });
  });
  /* D5 — les graines posées à la main sur la grille d'amorçage, quand la
     bibliothèque était encore vide. Elles comptent comme des titres aimés,
     avec un score DÉLIBÉRÉMENT BAS : dès que de vrais titres vus arrivent,
     ils passent devant. Une grille touchée le premier jour ne doit pas
     gouverner les suggestions six mois plus tard. */
  ((db.gouts && db.gouts.graines) || []).forEach(g=>{
    /* Une graine dont le titre est entré dans la bibliothèque ferait doublon. */
    if(g.media === 'tv' && db.shows[g.id]) return;
    if(g.media === 'movie' && db.movies[g.id]) return;
    out.push({ media:g.media, id:g.id, nom:g.nom||'', famille: g.famille||(g.media==='movie'?'film':'serie'),
               score: 20, graine:true });
  });
  return out.sort((a,b)=>b.score-a.score);
}

/* D5 — l'amorçage : vrai tant que la personne n'a rien vu ET n'a pas encore
   posé trois graines. C'est la seule condition d'affichage de la grille. */
/* Trois titres, c'est le MINIMUM pour que les suggestions veuillent dire
   quelque chose — pas une cible. La spec s'arrêtait à trois et faisait
   disparaître la grille à la seconde où l'on touchait la troisième affiche :
   on était éjecté d'un écran qu'on était en train d'utiliser, et le profil de
   goûts se réduisait au plus petit dénominateur possible.
   Maintenant la grille reste tant qu'on n'a pas dit qu'on avait fini. */
const GRAINES_MINI = 3;

function besoinAmorcage(){
  /* Une bibliothèque NON VIDE n'est pas une page blanche, même si rien n'y est
     encore coché : quelqu'un qui a ajouté vingt séries a déjà dit ce qu'il
     aime, et lui redemander trois titres serait insultant. La spec ne posait
     que la condition « aucun titre vu » — trop large. */
  if(Object.keys(db.shows).length + Object.keys(db.movies).length) return false;
  if(db.gouts && db.gouts.amorcageFait) return false;
  return titresAimes().filter(t=>!t.graine).length === 0;
}
/* On sort de la grille par une action explicite, jamais par surprise. */
function finirAmorcage(){
  db.gouts.amorcageFait = true;
  toucheGouts();
  if(typeof oublierSuggestions === 'function') oublierSuggestions();
  render();
}
function poserGraine(media, id, nom, famille){
  db.gouts.graines = db.gouts.graines || [];
  const i = db.gouts.graines.findIndex(x=>x.media===media && String(x.id)===String(id));
  if(i >= 0) db.gouts.graines.splice(i, 1);
  else db.gouts.graines.push({ media:media, id:id, nom:nom||'', famille:famille||'' });
  toucheGouts();
  /* Les suggestions repartent des nouvelles graines : sans ça, la vitrine
     resterait celle d'avant jusqu'au prochain démarrage. */
  if(typeof oublierSuggestions === 'function') oublierSuggestions();
  render();
}
const aGraine = (media, id)=>
  ((db.gouts && db.gouts.graines) || []).some(x=>x.media===media && String(x.id)===String(id));

/* De quelle famille relève un titre de la bibliothèque : film, animé, ou série.
   La langue d'origine n'est pas conservée localement — on se fie donc au genre
   « Animation », qui suffit à séparer ce qu'Adrien appelle ses animés du reste
   de ses séries. C'est une approximation assumée : un dessin animé occidental
   compterait comme un animé. Elle ne sert qu'à répartir les points de départ,
   jamais à filtrer un résultat. */
function familleDe(o, media){
  if(media === 'movie') return 'film';
  return (o.genres||[]).some(g=>/^animation$/i.test(String(g))) ? 'anime' : 'serie';
}

/* Les titres qui servent de point de départ aux recommandations.
   Sur « Tout », les prendre par score pur donnait six animés d'affilée : ce
   sont eux qu'Adrien a le plus avancés, et One Piece pèse mille épisodes. On
   pioche donc à tour de rôle dans les trois familles, pour que la vitrine
   parte de films, de séries ET d'animés — sa demande, mot pour mot. */
const FAMILLES = ['serie', 'film', 'anime'];
function grainesSuggestions(cadre, combien){
  const aimes = titresAimes().filter(t => cadre.medias.indexOf(t.media) >= 0);
  /* Une puce précise ne mélange rien : son cadre est déjà la variété voulue. */
  if(cadre.medias.length === 1) return aimes.slice(0, combien);

  const paniers = {};
  FAMILLES.forEach(f => { paniers[f] = aimes.filter(t => t.famille === f); });
  const out = [];
  for(let tour = 0; out.length < combien; tour++){
    let pris = 0;
    FAMILLES.forEach(f=>{
      if(out.length >= combien) return;
      const t = paniers[f][tour];
      if(t){ out.push(t); pris++; }
    });
    if(!pris) break;                        // tous les paniers sont épuisés
  }
  return out;
}

/* Déjà dans la bibliothèque ? Alors ce n'est pas une découverte. */
function dejaChezMoi(media, id){
  return media === 'tv' ? !!db.shows[id] : !!db.movies[id];
}
/* ---------- Le moteur ---------- */

/* Le cache dure une journée : au-delà, une « suggestion du jour » qui change
   à midi n'en est plus une. */
const SUGG_TTL = 24 * 3600000;
const SUGG_MAX = 40;                // au-delà, personne ne fait défiler
/* En dessous de ce nombre de propositions issues de la bibliothèque, on
   complète par les genres. Au-dessus, on s'en passe : les rangées de genre
   sont celles qu'Adrien ne reconnaissait pas — du Batman de 1999 parce qu'il
   regarde des animés d'action. */
const SUGG_ASSEZ = 20;
/* « BIENTÔT » NE REGARDE PAS À UNE DATE, MAIS À UN NOMBRE DE TITRES.

   Première version : une fenêtre de trois mois. Adrien, le 29/07 : « on
   n'applique pas une logique de nombre de mois mais plutôt de nombre de films
   dans le carrousel ». Une fenêtre fixe se vide en creux de calendrier et
   déborde en rentrée de septembre — le carrousel, lui, doit toujours être
   plein, et ne montrer que ce qui vient.

   Donc : on demande à TMDB les titres les plus ATTENDUS à partir de demain,
   sans borne haute, sur SUGG_AVENIR_PAGES pages. C'est le vivier. On le range
   ensuite par DATE, le plus proche d'abord — « il faut rester cohérent, on va
   faire une présentation dans un ordre chronologique ».

   Le vivier est servi tel quel à la grille « Tout voir » : elle ne redemande
   rien à TMDB. Une page de plus ramènerait des titres moins attendus dont les
   dates repartiraient en arrière, et la chronologie sauterait sous les yeux. */
const SUGG_AVENIR_PAGES = 3;        // 3 × 20 titres par média
const SUGG_AVENIR_MAX = 120;        // ce que la grille dépliée montre au plus

/* Une vitrine par puce, chacune avec son cache : passer de Séries à Animés ne
   doit pas relancer quatre requêtes si on vient d'y aller. */
const cacheSugg = {};
function suggVide(){
  return { etat:'froid' /* froid|attente|ok|erreur */, quand:0,
           enCours:false, perime:false,
           vedettes:[], sections:[], esprit:null, acteurs:[], nouveautes:[], avenir:[],
           /* Ce sur quoi l'app s'est appuyée, gardé pour pouvoir le montrer :
              « je ne sais pas ce que l'app croit savoir » était le reproche. */
           base:[], genresUtilises:[] };
}
let suggestions = suggVide();       // celles de la puce affichée

/* Repointe `suggestions` sur la puce courante. Appelée par tout ce qui lit
   les suggestions : sans ça, changer de puce affichait celles de la
   précédente le temps d'un rendu. */
/* E1 — LE TRI ENTRE DANS LA CLÉ DE CACHE. Sans ça, changer d'ordre n'aurait
   eu aucun effet visible pendant 24 h (`SUGG_TTL`) : la vitrine aurait resservi
   le calcul précédent, et le réglage aurait eu l'air cassé. */
function cleSugg(){
  const t = (ui.disc && ui.disc.type) || 'tout';
  const tri = (ui.disc && ui.disc.tri) || 'populaire';
  return t + '|' + tri;
}
function suggCourantes(){
  const k = cleSugg();
  if(!cacheSugg[k]) cacheSugg[k] = suggVide();
  suggestions = cacheSugg[k];
  return suggestions;
}

/* Le `sort_by` à passer à TMDB, et le plancher de votes qui va avec. Une seule
   fonction : le tri était écrit en dur dans quatre requêtes différentes. */
function triSuggestions(){
  const tri = (ui.disc && ui.disc.tri) || 'populaire';
  return tri === 'note'
    ? { sort_by:'vote_average.desc', 'vote_count.gte': String(DISC_VOTES_MINI) }
    : { sort_by:'popularity.desc',   'vote_count.gte':'120' };
}
/* Les goûts ont changé : tout est à refaire, sur toutes les puces. */
function oublierSuggestions(){
  Object.keys(cacheSugg).forEach(t => { delete cacheSugg[t]; });
  suggCourantes();
}

/* ---------------------------------------------------------------------------
   La vitrine suit la bibliothèque

   Ce que la vitrine sait de toi, réduit à un nombre. Il change quand un titre
   entre dans la bibliothèque, quand une série se termine, quand un film est
   marqué vu — PAS quand on coche l'épisode 4 sur 12 d'une série déjà suivie :
   le profil n'a pas bougé, la sélection n'a aucune raison de bouger, et un
   recalcul coûte une douzaine de requêtes. Choix d'Adrien.
--------------------------------------------------------------------------- */
function signatureGouts(){
  let h = 0;
  const mel = n => { h = (h * 31 + (n|0)) | 0; };
  Object.keys(db.shows || {}).forEach(id=>{
    const s = db.shows[id];
    mel(Number(id) || 0);
    mel(isFinished(s) ? 2 : (progress(s).watched ? 1 : 0));
  });
  Object.keys(db.movies || {}).forEach(id=>{
    mel(Number(id) || 0);
    mel(db.movies[id].seen ? 2 : 1);
  });
  const g = db.gouts || {};
  mel((g.genres||[]).length); mel((g.exclus||[]).length); mel((g.acteurs||[]).length);
  /* Les plateformes comptent aussi : changer d'abonnement change ce qu'on peut
     regarder ce soir, et donc ce que la vitrine doit proposer. Les identifiants
     entrent dans le calcul, pas seulement leur nombre — échanger Netflix contre
     Disney+ ne bouge pas la longueur de la liste. */
  (g.plates||[]).forEach(p=> mel(p && p.id));
  mel(g.suggMesPlates ? 1 : 0);
  return h;
}

/* Appelée après chaque écriture de la base (`saveDB`), donc aussi bien après un
   geste ici qu'après une synchro venue d'un autre appareil. La vitrine se refait
   SOUS LES YEUX quand on est dessus, et se contente d'être marquée périmée
   ailleurs — inutile de recalculer les quatre puces pour celle qu'on regarde. */
let sigBiblio = null;
function veilleBiblio(){
  const s = signatureGouts();
  if(sigBiblio === null){ sigBiblio = s; return; }   // premier appel : on prend la mesure
  if(s === sigBiblio) return;
  sigBiblio = s;
  Object.keys(cacheSugg).forEach(t => { cacheSugg[t].perime = true; });
  if(typeof view !== 'undefined' && view === 'discover') chargerSuggestions();
}

/* Ce que chaque puce accepte. `origine` dit l'intention plutôt qu'un booléen :
     'anime'     — rien d'autre que de l'animation japonaise ;
     'sansAnime' — jamais d'animé, et rien hors du monde occidental ;
     'mixte'     — l'animation japonaise est admise, le reste du monde non.
   Adrien, sur la puce Films : « j'autorise les films d'animation ». Un film
   d'animation japonais y était écarté alors qu'un Pixar passait — la règle
   d'origine, écrite pour les séries, s'y appliquait sans raison. */
function cadreSugg(t){
  if(t === 'movie') return { medias:['movie'], origine:'mixte' };
  if(t === 'tv')    return { medias:['tv'],    origine:'sansAnime' };
  if(t === 'anime') return { medias:['tv'],    origine:'anime' };
  return { medias:['tv','movie'], origine:'mixte' };
}

/* Normalise un résultat TMDB, quel que soit son média. */
function normaliser(r, media){
  const nom = media === 'tv' ? r.name : r.title;
  if(!r || !r.id || !nom || !r.poster_path) return null;
  return { id:r.id, media:media, nom:nom, affiche:r.poster_path, bandeau:r.backdrop_path||null,
           date: media === 'tv' ? r.first_air_date : r.release_date,
           note: r.vote_average || null, votes: r.vote_count || 0,
           genre_ids: r.genre_ids || [], langue: r.original_language || null };
}

/* Un animé, au sens de la puce : japonais ET classé animation. Les deux
   conditions comptent — un drama japonais n'est pas un animé, un dessin animé
   américain non plus. */
function estUnAnime(x){
  if(x.langue !== 'ja') return false;
  const a = genreParNom(x.media, 'Animation');
  return a != null && x.genre_ids.indexOf(a) >= 0;
}
/* E7 — `estOccidental` a disparu : la règle d'origine est dans `origineAdmise`
   (app-04) et nulle part ailleurs. */
/* La règle d'origine, dépendante de la puce.
   `perso` distingue ce qui découle de la bibliothèque (recommandations d'un
   titre regardé, acteur suivi) du catalogue générique. C'était l'incohérence
   de fond : l'app déduisait les goûts d'Adrien d'une bibliothèque d'animés,
   puis s'interdisait de lui en proposer un seul. Ce qui vient de chez lui n'a
   plus d'origine imposée ; seul le ratissage général reste cadré. */
function passeOrigine(x, cadre, perso){
  if(cadre.origine === 'anime')     return estUnAnime(x);
  if(cadre.origine === 'sansAnime') return !estUnAnime(x) && origineAdmise(x.langue);
  return perso || estUnAnime(x) || origineAdmise(x.langue);
}

/* Le tamis commun à toutes les sources : jamais un titre déjà chez soi, jamais
   un genre écarté, jamais deux fois le même, et le cadre de la puce. */
function tamiser(liste, vus, cadre, perso){
  const hors = (db.gouts && db.gouts.exclus) || [];
  const idsHors = hors.map(nom => genreParNom('tv', nom) || genreParNom('movie', nom))
                      .filter(x => x != null);
  return liste.filter(x=>{
    if(!x) return false;
    if(cadre.medias.indexOf(x.media) < 0) return false;
    const cle = x.media + ':' + x.id;
    if(vus[cle]) return false;
    if(dejaChezMoi(x.media, x.id)) return false;
    if(idsHors.some(g => x.genre_ids.indexOf(g) >= 0)) return false;
    if(!passeOrigine(x, cadre, perso)) return false;
    vus[cle] = 1;
    return true;
  });
}

/* Le plus proche d'abord. Sert à « Bientôt », où la date est le sujet même de
   la rangée : à date égale, le plus attendu passe devant, l'ordre reçu de TMDB
   étant déjà celui de la popularité. */
function trierParDate(liste){
  return liste.map((x,i)=>({x:x,i:i}))
    .sort((a,b)=> a.x.date === b.x.date ? a.i - b.i : (a.x.date < b.x.date ? -1 : 1))
    .map(o=>o.x);
}

/* Une requête qui ne fait pas tomber tout le moteur si elle échoue : une
   source muette vaut mieux qu'un écran vide. */
async function sourceDouce(promesse){
  try{ return await promesse; }catch(e){ return null; }
}

/* Les paquets « genres » et « nouveautés » arrivent média par média. Les mettre
   bout à bout donnait vingt séries avant le premier film : le mélange n'existait
   qu'au bout du défilement. On les entrelace un pour un. */
function entrelacerSugg(paquets){
  const out = [];
  for(let i = 0; paquets.some(p => i < p.length); i++)
    paquets.forEach(p => { if(i < p.length) out.push(p[i]); });
  return out;
}
/* ---------------------------------------------------------------------------
   Les sections d'une vitrine

   Refonte demandée par Adrien : « pas par rapport à 1 titre que j'ai vu mais
   par rapport à l'ensemble des séries ou films que j'ai consommé ». Les rangées
   partaient chacune d'un titre ; elles partent maintenant du profil de genres,
   calculé SÉPARÉMENT par famille. C'est ce qui manquait — un seul profil global
   servait aux trois, d'où du Batman de 1999 déduit de ses animés d'action.

   Et sa règle, mot pour mot : « si la personne n'a pas renseigné d'animé il n'y
   a pas de sélection d'animé ». Une section n'existe que si sa famille existe
   dans la bibliothèque. Un seul titre suffit.
--------------------------------------------------------------------------- */
const SECTIONS_TOUT = [
  { cle:'serie', titre:'Des séries pour toi', cadre:{ medias:['tv'],    origine:'sansAnime' } },
  { cle:'film',  titre:'Des films pour toi',  cadre:{ medias:['movie'], origine:'mixte'     } },
  { cle:'anime', titre:'Des animés pour toi', cadre:{ medias:['tv'],    origine:'anime'     } }
];

/* Les familles réellement présentes dans la bibliothèque, d'après ce qui a été
   regardé — pas d'après ce qui a été ajouté sans jamais être ouvert. */
function famillesVues(){
  const vu = {};
  Object.values(db.shows).forEach(s=>{
    if(progress(s).watched > 0) vu[familleDe(s,'tv')] = true;
  });
  if(Object.values(db.movies).some(m=>m.seen)) vu.film = true;
  return vu;
}

/* Les sections à construire pour la puce affichée. Sur une puce précise il n'y
   en a qu'une, celle de la puce : elle est demandée explicitement, donc elle
   s'affiche même sans historique dans cette famille. */
function sectionsPourPuce(type){
  if(type === 'tv')    return [{ cle:'serie', titre:'Des séries pour toi', cadre:cadreSugg('tv') }];
  if(type === 'movie') return [{ cle:'film',  titre:'Des films pour toi',  cadre:cadreSugg('movie') }];
  if(type === 'anime') return [{ cle:'anime', titre:'Des animés pour toi', cadre:cadreSugg('anime') }];
  const vues = famillesVues();
  return SECTIONS_TOUT.filter(s => vues[s.cle]);
}

/* Le profil de genres, calculé famille par famille. Un genre choisi à la main
   l'emporte partout : c'est la promesse de l'écran « Mes goûts », qui annonce
   que ces réglages passent avant ce que l'app devine. */
function genresDeFamille(famille){
  const g = db.gouts || {};
  const hors = g.exclus || [];
  if((g.genres||[]).length) return g.genres.filter(x => hors.indexOf(x) < 0);

  const poids = {};
  Object.values(db.shows).forEach(s=>{
    if(familleDe(s,'tv') !== famille) return;
    const p = progress(s);
    if(!p.watched) return;
    const n = p.watched + (isFinished(s) ? 10 : 0);
    (s.genres||[]).forEach(x=>{ poids[x] = (poids[x]||0) + n; });
  });
  if(famille === 'film') Object.values(db.movies).forEach(m=>{
    if(!m.seen) return;
    (m.genres||[]).forEach(x=>{ poids[x] = (poids[x]||0) + 5; });
  });
  return Object.keys(poids)
    .sort((a,b)=>poids[b]-poids[a])
    .filter(x => hors.indexOf(x) < 0)
    .slice(0, GENRES_DEDUITS_MAX);
}

/* La requête d'une section. Les genres partent en OU — « action OU aventure »
   décrit ce qu'on voulait dire, « action ET aventure » ne décrit presque rien.
   Seule exception : sur les animés, l'animation japonaise n'est pas une
   préférence mais la définition de la section, elle reste donc un ET. */
function requeteSection(sec){
  const media = sec.cadre.medias[0];
  const noms = genresDeFamille(sec.cle);
  const anim = genreParNom(media, 'Animation');
  const p = Object.assign({ include_adult:'false', page:'1' }, triSuggestions());

  if(sec.cadre.origine === 'anime'){
    p.with_original_language = 'ja';
    /* Animation, plus le genre dominant s'il en existe un autre : deux
       identifiants séparés par une virgule sont un ET chez TMDB, ce qui est
       exactement ce qu'on veut ici. */
    const autre = noms.map(n=>genreParNom(media,n)).filter(x => x != null && x !== anim)[0];
    const ids = [anim, autre].filter(x => x != null);
    if(!ids.length) return null;
    p.with_genres = ids.join(',');
  } else {
    const ids = noms.map(n=>genreParNom(media,n)).filter(x => x != null);
    if(ids.length) p.with_genres = ids.join('|');
  }
  /* Ici plutôt qu'au point d'appel : cette fonction sert à la fois à bâtir la
     rangée et à en chercher la suite. La grille dépliée et le rail montrent
     ainsi la même chose. */
  Object.assign(p, filtreMesPlates());
  return { media:media, p:p };
}

/* Les paramètres TMDB qui restreignent aux plateformes déclarées — ou rien du
   tout si la personne n'a pas demandé cette restriction. Un objet vide se
   fusionne sans condition, ce qui évite un `if` à chaque appel. */
function filtreMesPlates(){
  return (typeof paramsMesPlates === 'function' && suggSurMesPlates())
    ? paramsMesPlates() : {};
}

async function chargerSuggestions(force){
  const type = (ui.disc && ui.disc.type) || 'tout';
  const c = suggCourantes();
  /* Un calcul déjà en route : on ne le double pas, on note qu'il faudra
     repasser. Sans ça, cocher deux titres coup sur coup perdait le second. */
  if(c.enCours){ c.perime = true; return; }
  if(!force && !c.perime && c.etat === 'ok' && Date.now() - c.quand < SUGG_TTL) return;
  c.enCours = true; c.perime = false;
  /* Recalcul EN DOUCEUR quand il y a déjà de quoi remplir l'écran : la vitrine
     reste lisible pendant qu'on la refait, au lieu de laisser la place à un
     rond qui tourne. C'est ce qui rend supportable un recalcul déclenché par un
     geste — cocher un film depuis la vitrine ne doit pas la faire disparaître. */
  const douce = c.etat === 'ok';
  if(!douce){
    c.etat = 'attente';
    if(typeof peindreDisc === 'function') peindreDisc();
  }
  try{
    await Promise.all([chargerGenres('tv'), chargerGenres('movie')]);
    /* La feuille de filtres peut s'ouvrir depuis la vitrine, sans qu'aucune
       grille n'ait jamais été chargée : sans cet appel, sa liste de plateformes
       était vide. On ne l'attend pas — elle arrive en arrière-plan. */
    if(typeof chargerPlates === 'function' && typeof discMedia === 'function')
      chargerPlates(discMedia()).catch(()=>{});

    const cadre = cadreSugg(type);
    const vus = {};
    const auj = todayISO();
    const debut = isoIlYA(60);
    const demain = isoDansN(1);
    const sections = sectionsPourPuce(type);
    const acteurs = ((db.gouts||{}).acteurs || []).slice(0, 3);

    /* Le titre qui sert de comparaison du jour. Une seule rangée, choisie parmi
       ce qu'on a terminé ou bien avancé — et intitulée « Dans l'esprit de » et
       non « parce que tu as aimé » : l'app ne sait pas si on a aimé, elle sait
       seulement qu'on l'a regardé. Adrien a mis le doigt dessus. */
    const candidats = grainesSuggestions(cadre, 12);
    const graineJour = Math.floor(Date.parse(auj) / 86400000);
    const esprit = candidats.length ? candidats[graineJour % candidats.length] : null;

    const demandes = [];
    sections.forEach(sec=>{
      const r = requeteSection(sec);
      if(!r) return demandes.push(Promise.resolve({ kind:'section', sec:sec, l:[] }));
      demandes.push(sourceDouce(tmdb('/discover/'+r.media, r.p))
        .then(d => ({ kind:'section', sec:sec, l:(d&&d.results||[]).map(x=>normaliser(x, r.media)) })));
    });
    if(esprit) demandes.push(sourceDouce(tmdb('/'+esprit.media+'/'+esprit.id+'/recommendations'))
      .then(d => ({ kind:'esprit', titre:esprit.nom, id:esprit.id, media:esprit.media,
                    l:(d&&d.results||[]).map(x=>normaliser(x, esprit.media)) })));
    acteurs.forEach(a => demandes.push(sourceDouce(tmdb('/person/'+a.id+'/combined_credits'))
      .then(d => ({ kind:'acteur', titre:a.nom, id:a.id,
                    l:((d&&d.cast)||[])
                      .filter(x => x.media_type === 'tv' || x.media_type === 'movie')
                      .sort((x,y)=>(y.popularity||0)-(x.popularity||0))
                      .map(x => normaliser(x, x.media_type)) }))));
    /* Les nouveautés, sur chaque média du cadre de la puce. */
    cadre.medias.forEach(m=>{
      const champ = m === 'movie' ? 'primary_release_date' : 'first_air_date';
      /* Les nouveautés gardent leur propre ordre : trier « les mieux notées »
         une fenêtre de sorties récentes donnerait une liste sans rapport avec
         la nouveauté, ce que la rangée promet. */
      const p = { include_adult:'false', page:'1', sort_by:'popularity.desc',
                  [champ+'.gte']:debut, [champ+'.lte']:auj };
      if(cadre.origine === 'anime'){
        p.with_original_language = 'ja';
        const a = genreParNom(m,'Animation');
        if(a != null) p.with_genres = String(a);
      }
      Object.assign(p, filtreMesPlates());
      demandes.push(sourceDouce(tmdb('/discover/'+m, p))
        .then(d => ({ kind:'nouv', media:m, l:(d&&d.results||[]).map(x=>normaliser(x, m)) })));

      /* Ce qui n'est pas encore sorti : à partir de demain, SANS borne haute.
         Pas de plancher de votes ni de tri par note — ces titres n'en ont
         aucun (mesuré le 29/07 : zéro sur 2 005 films à venir). Plusieurs
         pages, parce que le vivier sera reclassé par date juste après : sur
         une seule page, « le plus proche » ne serait le plus proche que parmi
         vingt titres.

         Le filtre « seulement mes plateformes » ne s'applique PAS ici : un
         titre qui n'est pas sorti n'est encore sur aucune plateforme, et TMDB
         rendrait donc une rangée vide. « Bientôt » parle de dates, pas de
         catalogues. Même raison pour les rangées d'acteurs et « Dans l'esprit
         de » : leurs sources TMDB (filmographie, recommandations) n'acceptent
         aucun filtre de plateforme. La vitrine le dit sous les puces. */
      for(let pg = 1; pg <= SUGG_AVENIR_PAGES; pg++){
        const pa = { include_adult:'false', page:String(pg), sort_by:'popularity.desc',
                     [champ+'.gte']:demain };
        if(cadre.origine === 'anime'){
          pa.with_original_language = 'ja';
          const a = genreParNom(m,'Animation');
          if(a != null) pa.with_genres = String(a);
        }
        demandes.push(sourceDouce(tmdb('/discover/'+m, pa))
          .then(d => ({ kind:'avenir', media:m, l:(d&&d.results||[]).map(x=>normaliser(x, m)) })));
      }
    });

    const rep = await Promise.all(demandes);

    /* L'ordre de dépouillement fixe les priorités : ce qui est servi en premier
       garde les titres, les suivants héritent du reste. Les sections d'abord —
       ce sont elles que l'écran doit montrer. */
    const parKind = k => rep.filter(r => r && r.kind === k);
    const sectionsPretes = [];
    parKind('section').forEach(r=>{
      const l = tamiser(r.l || [], vus, r.sec.cadre, false).slice(0, SUGG_MAX);
      if(l.length) sectionsPretes.push({ cle:r.sec.cle, titre:r.sec.titre, l:l });
    });
    let espritPret = null;
    parKind('esprit').forEach(r=>{
      const l = tamiser(r.l || [], vus, cadre, true).slice(0, 20);
      if(l.length) espritPret = { titre:r.titre, id:r.id, media:r.media, l:l };
    });
    const parActeur = [];
    parKind('acteur').forEach(r=>{
      const l = tamiser(r.l || [], vus, cadre, true).slice(0, 20);
      if(l.length) parActeur.push({ id:r.id, titre:r.titre, l:l });
    });
    const paqNouv = [];
    parKind('nouv').forEach(r=>{
      const l = tamiser(r.l || [], vus, cadre, false).slice(0, 20);
      if(l.length) paqNouv.push(l);
    });
    const nouv = entrelacerSugg(paqNouv);

    /* « Bientôt » : on ne mélange pas les médias un pour un comme ailleurs —
       c'est la DATE qui range la rangée. Une affiche est exigée : un titre
       annoncé sans visuel n'est qu'une ligne de texte dans un carrousel. */
    const avenir = trierParDate(
      tamiser([].concat(...parKind('avenir').map(r => r.l || [])), vus, cadre, false)
        .filter(x => x.affiche && x.date)
    ).slice(0, SUGG_AVENIR_MAX);

    /* Le carrousel du jour : cinq titres pris dans les sections d'abord, dans
       l'ordre où elles s'affichent, puis dans le reste. La rotation vient de la
       date — stable toute la journée, différente demain, jamais tirée au sort. */
    const bassin = []
      .concat(...sectionsPretes.map(s => s.l.map(x => Object.assign({ pourquoi:s.titre }, x))))
      .concat(...parActeur.map(p => p.l.map(x => Object.assign({ pourquoi:'Avec '+p.titre }, x))))
      .concat(espritPret ? espritPret.l.map(x => Object.assign({ pourquoi:'Dans l\'esprit de '+espritPret.titre }, x)) : [])
      .concat(nouv.map(x => Object.assign({ pourquoi:'Sortie récente' }, x)));
    const vedettes = [];
    for(let i = 0; i < 5 && bassin.length; i++){
      const idx = (graineJour + i * 7) % bassin.length;
      vedettes.push(bassin.splice(idx, 1)[0]);
    }

    Object.assign(c, { etat:'ok', quand:Date.now(), vedettes:vedettes,
      sections:sectionsPretes, esprit:espritPret, acteurs:parActeur,
      nouveautes:nouv.slice(0, SUGG_MAX),
      /* Gardé en entier, pas coupé à SUGG_MAX : c'est cette liste-là que la
         grille « Tout voir » déroule, et elle est déjà dans l'ordre. */
      avenir:avenir,
      base:sections.map(s=>s.cle), genresUtilises:[] });
  }catch(e){
    /* En douceur, un échec réseau ne doit pas effacer une vitrine qui marchait :
       on garde l'ancienne à l'écran et on retentera au prochain changement. */
    if(!douce) c.etat = 'erreur';
  }
  c.enCours = false;
  suggCourantes();
  /* La bibliothèque a bougé pendant le calcul : on repasse. */
  if(c.perime){ chargerSuggestions(); return; }
  if(view === 'discover' && typeof peindreDisc === 'function') peindreDisc();
}

/* Les rangées de la vitrine, dans l'ordre où elles s'affichent. L'ordre des
   sections est fixe — choix d'Adrien : « toujours le même ordre », pour savoir
   où regarder sans réfléchir. */
/* Chaque rangée porte une clé stable : c'est elle qui permet à l'écran
   « Tout voir » de retrouver sa liste au retour d'une fiche, sans qu'on ait à
   recopier les titres dans les paramètres de navigation. Les acteurs sont
   désignés par leur nom faute d'identifiant conservé à ce stade — deux acteurs
   homonymes dans la même vitrine se partageraient la rangée, ce qui reste
   préférable à une clé qui change à chaque calcul. */
function rangeesSuggerees(){
  suggCourantes();
  const out = [];
  (suggestions.sections || []).forEach(s=>{ if(s.l.length) out.push({ cle:s.cle, titre:s.titre, l:s.l }); });
  (suggestions.acteurs || []).forEach(p=>{ if(p.l.length) out.push({ cle:'acteur:'+p.id, titre:'Avec '+p.titre, l:p.l }); });
  if(suggestions.esprit && suggestions.esprit.l.length)
    out.push({ cle:'esprit', titre:'Dans l\'esprit de '+suggestions.esprit.titre, l:suggestions.esprit.l });
  if((suggestions.nouveautes || []).length)
    out.push({ cle:'nouv', titre:'Sorties récentes', l:suggestions.nouveautes });
  /* « Bientôt » vient après « Sorties récentes » : on lit le présent avant
     l'avenir, et une rangée vide (peu d'animés annoncés, par exemple) ne
     s'affiche tout simplement pas. */
  if((suggestions.avenir || []).length)
    out.push({ cle:'avenir', titre:'Bientôt', l:suggestions.avenir });
  return out;
}

/* ---------------------------------------------------------------------------
   Aller chercher la SUITE d'une rangée

   Adrien, en voyant la première version : « à quoi sert le voir plus si on voit
   la même liste que le carrousel ? ». Il avait raison — chaque rangée ne
   demandait qu'UNE page à TMDB (vingt titres au plus), et le rail les montrait
   déjà tous. Déplier ne changeait que la mise en page.

   Maintenant la rangée est un aperçu (dix titres) et la grille va chercher la
   suite, page après page. Cette fonction rend une page supplémentaire, déjà
   normalisée et tamisée contre `vus` — la même règle que la vitrine, sinon on
   reproposerait des titres qu'on a déjà écartés dix lignes plus haut.
--------------------------------------------------------------------------- */
async function chargerPageRangee(cle, page, vus){
  const type = (ui.disc && ui.disc.type) || 'tout';
  const cadre = cadreSugg(type);

  /* Un acteur : la filmographie arrive d'un bloc, il n'y a pas de page 2.
     La vitrine n'en garde que vingt titres ; ici on les prend tous. */
  if(cle.indexOf('acteur:') === 0){
    if(page > 1) return { titres:[], pages:1 };
    const d = await tmdb('/person/'+cle.slice(7)+'/combined_credits');
    const l = ((d&&d.cast)||[])
      .filter(x => x.media_type === 'tv' || x.media_type === 'movie')
      .sort((x,y)=>(y.popularity||0)-(x.popularity||0))
      .map(x => normaliser(x, x.media_type));
    return { titres: tamiser(l, vus, cadre, true), pages:1 };
  }

  if(cle === 'esprit'){
    const e = suggCourantes().esprit;
    if(!e || !e.id) return { titres:[], pages:1 };
    const d = await tmdb('/'+e.media+'/'+e.id+'/recommendations', { page:String(page) });
    const l = ((d&&d.results)||[]).map(x=>normaliser(x, e.media));
    return { titres: tamiser(l, vus, cadre, true), pages:(d&&d.total_pages)||1 };
  }

  /* « Bientôt » ne va rien rechercher : le vivier a été bâti d'un bloc et
     rangé par date à la construction de la vitrine. La grille en sert la
     suite. Redemander une page à TMDB ramènerait des titres moins attendus,
     dont les dates repartiraient en arrière au milieu de la grille — la
     chronologie qu'Adrien a demandée sauterait sous les yeux. */
  if(cle === 'avenir'){
    if(page > 1) return { titres:[], pages:1 };
    const tout = suggCourantes().avenir || [];
    return { titres: tout.filter(x => !vus[x.media+':'+x.id]), pages:1 };
  }

  /* Les nouveautés interrogent chaque média du cadre et s'entrelacent, comme
     dans la vitrine — sinon on lirait vingt séries avant le premier film. */
  if(cle === 'nouv'){
    const auj = todayISO(), debut = isoIlYA(60);
    const paquets = [], totaux = [];
    for(const m of cadre.medias){
      const champ = m === 'movie' ? 'primary_release_date' : 'first_air_date';
      const p = { include_adult:'false', page:String(page), sort_by:'popularity.desc',
                  [champ+'.gte']:debut, [champ+'.lte']:auj };
      if(cadre.origine === 'anime'){
        p.with_original_language = 'ja';
        const a = genreParNom(m,'Animation');
        if(a != null) p.with_genres = String(a);
      }
      Object.assign(p, filtreMesPlates());
      const d = await sourceDouce(tmdb('/discover/'+m, p));
      totaux.push((d&&d.total_pages)||1);
      paquets.push(tamiser(((d&&d.results)||[]).map(x=>normaliser(x,m)), vus, cadre, false));
    }
    return { titres: entrelacerSugg(paquets), pages: Math.max.apply(null, totaux) };
  }

  /* Une section : exactement la requête qui a bâti la rangée, page suivante. */
  const sec = sectionsPourPuce(type).find(s=>s.cle===cle) || SECTIONS_TOUT.find(s=>s.cle===cle);
  if(!sec) return { titres:[], pages:1 };
  const r = requeteSection(sec);
  if(!r) return { titres:[], pages:1 };
  r.p.page = String(page);
  const d = await tmdb('/discover/'+r.media, r.p);
  const l = ((d&&d.results)||[]).map(x=>normaliser(x, r.media));
  return { titres: tamiser(l, vus, sec.cadre, false), pages:(d&&d.total_pages)||1 };
}

/* La rangée désignée par une clé, ou `null` si elle n'existe plus — cas réel :
   les suggestions ont été recalculées (24 h de cache écoulées, ou changement de
   puce) pendant qu'on était sur une fiche. L'écran doit alors le dire, pas
   afficher une grille vide. */
function rangeeParCle(cle){
  return rangeesSuggerees().find(r => r.cle === cle) || null;
}

/* ---------------------------------------------------------------------------
   « Ce que l'app croit savoir »

   Le reproche d'Adrien, mot pour mot : « je ne sais pas ce que l'app croit
   savoir ». Tant que le raisonnement reste caché, une suggestion ratée passe
   pour de l'arbitraire — alors qu'elle est presque toujours la conséquence
   visible d'une déduction discutable. On l'affiche donc là où les suggestions
   sont, pas seulement dans un écran de réglages.
--------------------------------------------------------------------------- */

/* Les deux phrases qui expliquent le profil courant. Rendues séparément pour
   que la vitrine en montre une version courte et l'écran des goûts la version
   complète, sans écrire le raisonnement à deux endroits. */
const LIB_FAMILLE = { serie:'séries', film:'films', anime:'animés' };
function explicationProfil(court){
  const g = db.gouts || {};
  const manuels = (g.genres||[]).length > 0;
  /* Le panneau doit décrire ce qui alimente RÉELLEMENT les sections : le profil
     de genres par famille, et non plus une poignée de titres de départ. C'est
     la question d'Adrien — « je ne sais pas ce que l'app croit savoir » — et la
     réponse a changé de nature en même temps que le moteur. */
  const type = (ui.disc && ui.disc.type) || 'tout';
  const parFamille = sectionsPourPuce(type).map(sec=>({
    nom: LIB_FAMILLE[sec.cle] || sec.cle,
    genres: genresDeFamille(sec.cle)
  })).filter(f => f.genres.length);
  const volume = { series: Object.values(db.shows).filter(s=>progress(s).watched>0).length,
                   films:  Object.values(db.movies).filter(m=>m.seen).length };
  /* E6 — LA FORME COURTE, celle de la vitrine. Ce commentaire annonçait les
     deux formes depuis le début ; seule la longue avait été branchée. Les
     genres des familles y sont fondus en une liste de trois : le détail par
     famille appartient à l'écran où on le corrige, pas à celui où on regarde
     des affiches. */
  if(court){
    const fondus = [];
    parFamille.forEach(f=>f.genres.forEach(n=>{ if(fondus.indexOf(n) < 0) fondus.push(n); }));
    return { volume: volume, genres: fondus.slice(0, 3),
             aDire: fondus.length > 0 || volume.series > 0 || volume.films > 0 };
  }
  return {
    manuels: manuels,
    parFamille: parFamille,
    volume: volume,
    acteurs: (g.acteurs||[]).map(a=>a.nom),
    exclus: (g.exclus||[]).slice(),
    origine: manuels
      ? 'Tu as choisi ces genres toi-même : ils passent avant ce que je devine.'
      : (parFamille.length
          ? 'Calculés séparément pour chaque famille, d\'après tout ce que tu as regardé.'
          : 'Rien à déduire pour l\'instant : coche quelques épisodes.')
  };
}

/* ---------------------------------------------------------------------------
   L'écran « Mes goûts »

   Proposé une fois après la création du compte, avec un bouton « Passer » bien
   visible : ne rien remplir laisse le mode automatique, qui fonctionne déjà.
   Le même écran vit dans les réglages, pour le jour où l'on veut reprendre
   la main. Trois réglages seulement : ce qu'on aime, ce qu'on ne veut pas
   voir, et les acteurs qu'on suit.
--------------------------------------------------------------------------- */

let rechActeur = { q:'', res:null, occupe:false, seq:0 };
/* Une seule tentative de chargement des genres par session : sans ce verrou,
   un écran sans genres se redessinait à l'infini. */
let goutsGenresDemandes = false;

/* Tous les genres connus, séries et films confondus, sans doublon de nom. */
function tousLesGenres(){
  const vus = {}, out = [];
  ['tv','movie'].forEach(m=>{
    (genresTMDB[m]||[]).forEach(g=>{
      if(vus[g.nom]) return;
      vus[g.nom] = 1; out.push(g.nom);
    });
  });
  return out.sort((a,b)=>a.localeCompare(b,'fr'));
}

function bascGoutGenre(nom){
  const g = db.gouts;
  const i = g.genres.indexOf(nom);
  if(i >= 0) g.genres.splice(i,1); else { g.genres.push(nom); retirerExclu(nom); }
  oublierSuggestions(); toucheGouts(); render();
}
function bascGoutExclu(nom){
  const g = db.gouts;
  const i = g.exclus.indexOf(nom);
  if(i >= 0) g.exclus.splice(i,1);
  else {
    g.exclus.push(nom);
    const j = g.genres.indexOf(nom);
    if(j >= 0) g.genres.splice(j,1);          // aimer et écarter à la fois n'a pas de sens
  }
  oublierSuggestions(); toucheGouts(); render();
}
function retirerExclu(nom){
  const g = db.gouts, i = g.exclus.indexOf(nom);
  if(i >= 0) g.exclus.splice(i,1);
}
function retirerActeur(id){
  db.gouts.acteurs = db.gouts.acteurs.filter(a=>String(a.id) !== String(id));
  oublierSuggestions(); toucheGouts(); render();
}
function ajouterActeur(id, nom){
  if(db.gouts.acteurs.some(a=>String(a.id) === String(id))) return;
  db.gouts.acteurs.push({ id:id, nom:nom });
  rechActeur = { q:'', res:null, occupe:false, seq:rechActeur.seq };
  oublierSuggestions(); toucheGouts(); render();
}

async function chercherActeur(q){
  rechActeur.q = q;
  const seq = ++rechActeur.seq;
  if(q.trim().length < 2){ rechActeur.res = null; rechActeur.occupe = false; return peindreActeurs(); }
  rechActeur.occupe = true; peindreActeurs();
  try{
    const d = await tmdb('/search/person', { query:q.trim(), include_adult:'false' });
    if(seq !== rechActeur.seq) return;
    rechActeur.res = (d.results||[])
      .filter(p => p && p.id && p.name)
      .slice(0, 8)
      .map(p => ({ id:p.id, nom:p.name, photo:p.profile_path||null }));
  }catch(e){
    if(seq !== rechActeur.seq) return;
    rechActeur.res = [];
  }
  rechActeur.occupe = false;
  peindreActeurs();
}

/* Seule la liste se redessine : redessiner l'écran emporterait le champ. */
function peindreActeurs(){
  const el = document.getElementById('resacteurs');
  if(el) el.innerHTML = corpsRechActeur();
}
function corpsRechActeur(){
  if(rechActeur.occupe)
    return '<div class="tiny muted" style="padding:8px 0">Recherche…</div>';
  if(!rechActeur.res) return '';
  if(!rechActeur.res.length)
    return '<div class="tiny muted" style="padding:8px 0">Personne de ce nom.</div>';
  return '<div class="listact">'+rechActeur.res.map(p=>
    '<button class="lact" onclick="ajouterActeur('+p.id+',\''+escJs(p.nom)+'\')">'+
      (srcImage(p.photo,'w185') ? '<img src="'+srcImage(p.photo,'w185')+'" alt="">' : '<div class="ph2">'+esc(p.nom[0])+'</div>')+
      '<span>'+esc(p.nom)+'</span><i>'+I.plus+'</i>'+
    '</button>').join('')+'</div>';
}

function viewGouts(){
  const g = db.gouts;
  /* D3 — cet écran ne fait plus partie de l'inscription : plus personne
     n'appelle `go('gouts',{from:'compte'})`. La variante « dernière étape de
     la création » — en-tête sans flèche, bouton « C'est parti », lien « Passer
     cette étape » — est retirée avec elle. */
  const genres = tousLesGenres();
  /* Les genres viennent de TMDB. On ne redemande que ce qui n'est pas encore
     en mémoire, et on ne redessine que si la liste a réellement changé :
     redessiner à chaque fois relançait le rendu en boucle le jour où TMDB
     répondait une liste vide. */
  if(!genres.length && !goutsGenresDemandes){
    goutsGenresDemandes = true;
    setTimeout(()=>{
      Promise.all([chargerGenres('tv'), chargerGenres('movie')])
        .then(()=>{ if(view === 'gouts' && tousLesGenres().length) render(); })
        .catch(()=>{});
    }, 0);
  }

  let html = header('Mes goûts', {back:"goBack()"});

  html += '<div class="wrap" style="padding-bottom:6px"><div class="small muted">'+
    'Ces réglages passent avant ce que l\'app devine. Laisse tout vide et elle reprend la main.'+
    '</div></div>';

  /* Le raisonnement complet, écrit noir sur blanc. La version courte de ce même
     bloc est sous le carrousel de la vitrine (§E6, `blocProfilCourt`) ; ici on
     montre en plus le détail des genres déduits famille par famille, puisque
     c'est l'écran où on les corrige. */
  const p = explicationProfil();
  const lignes = [];
  const v = p.volume;
  if(v.series || v.films)
    lignes.push('<div><b>Je pars de</b> '+
      [v.series ? v.series+' série'+(v.series>1?'s':'')+' commencée'+(v.series>1?'s':'') : '',
       v.films  ? v.films+' film'+(v.films>1?'s':'')+' vu'+(v.films>1?'s':'')            : ''
      ].filter(Boolean).join(' et ')+'</div>');
  /* Le détail par famille : c'est ici qu'on le corrige, donc c'est ici qu'il
     doit être le plus explicite. */
  p.parFamille.forEach(f=>
    lignes.push('<div><b>Tes '+esc(f.nom)+'</b> '+esc(f.genres.join(', '))+'</div>'));
  if(p.acteurs.length)
    lignes.push('<div><b>Acteurs surveillés</b> '+esc(p.acteurs.join(', '))+'</div>');
  if(p.exclus.length)
    lignes.push('<div><b>Écartés</b> '+esc(p.exclus.join(', '))+'</div>');

  html += '<div class="wrap" style="padding-top:0"><div class="profcarte">'+
    '<div class="proftitre">'+I.boussole+' Ce que je crois savoir de toi</div>'+
    (lignes.length
      ? '<div class="proflignes">'+lignes.join('')+'</div>'+
        '<div class="tiny muted" style="margin-top:8px">'+esc(p.origine)+'</div>'
      : '<div class="tiny muted">Rien encore. Coche quelques épisodes, ou choisis '+
        'des genres ci-dessous — les deux marchent.</div>')+
  '</div></div>';

  /* E7 — DIRE LE FILTRAGE GÉOGRAPHIQUE, ET POUVOIR LE LEVER. Écarter le
     coréen, le japonais non-animé, l'indien, était un choix défendable — mais
     muet. Quelqu'un qui regarde des K-dramas n'en recevait jamais une seule
     suggestion et n'avait aucun moyen de comprendre pourquoi. */
  const tout = !!g.toutesOrigines;
  const pucOrig = (v, txt)=>
    '<button class="chip '+(tout === v ? 'on' : '')+'" aria-pressed="'+(tout === v)+'" '+
      'onclick="setToutesOrigines('+(v?'true':'false')+')">'+txt+'</button>';
  html += '<div class="sectitle">Origine des suggestions</div>'+
    '<div class="wrap" style="padding-top:0">'+
      '<div class="small muted" style="margin-bottom:8px">Les suggestions '+
        'privilégient les productions anglophones et européennes. La recherche '+
        'par titre, elle, n\'est jamais filtrée.</div>'+
      '<div class="chips ochips">'+pucOrig(false,'Anglophone et Europe')+
                            pucOrig(true,'Toutes les origines')+'</div>'+
    '</div>';

  html += '<div class="sectitle">J\'aime</div>'+
    '<div class="chips wrapchips">'+genres.map(n=>
      '<button class="chip '+(g.genres.indexOf(n)>=0?'on':'')+'" '+
        'onclick="bascGoutGenre(\''+escJs(n)+'\')">'+esc(n)+'</button>').join('')+
    '</div>';

  html += '<div class="sectitle">Je ne veux pas voir</div>'+
    '<div class="chips wrapchips">'+genres.map(n=>
      '<button class="chip '+(g.exclus.indexOf(n)>=0?'hors':'')+'" '+
        'onclick="bascGoutExclu(\''+escJs(n)+'\')">'+esc(n)+'</button>').join('')+
    '</div>';

  /* « Je suis obligé de sélectionner des acteurs ? » — non, et il fallait
     l'écrire : la recherche d'acteurs était le dernier élément actif de la
     page, ce qui la faisait passer pour une étape à franchir. */
  html += '<div class="sectitle">Acteurs que je suis <span class="facult">facultatif</span></div>'+
    '<div class="wrap" style="padding-top:0">';
  if(g.acteurs.length){
    html += '<div class="listact choisis">'+g.acteurs.map(a=>
      '<div class="lact"><div class="ph2">'+esc(a.nom[0])+'</div><span>'+esc(a.nom)+'</span>'+
      '<button class="lretirer" onclick="retirerActeur('+a.id+')" aria-label="Retirer">'+I.close+'</button></div>'
    ).join('')+'</div>';
  }
  html += '<input class="inp" id="qact" type="search" placeholder="Chercher un acteur ou une actrice" '+
    'value="'+esc(rechActeur.q)+'" oninput="chercherActeur(this.value)" autocomplete="off">'+
    '<div id="resacteurs">'+corpsRechActeur()+'</div>'+
  '</div>';

  /* La barre de validation est collée en bas, pas reléguée en fin de page.
     Adrien : « je ne peux pas valider ma sélection » — il fallait faire défiler
     deux listes de vingt genres et la recherche d'acteurs pour l'atteindre.
     Les choix sont enregistrés au fil des appuis ; le bouton ne sert qu'à
     refermer l'écran, et le dit. */
  html += '<div style="height:26px"></div>';
  html += '<div class="gbarre">'+
    '<button class="btn block" onclick="fermerGouts()">Terminé</button>'+
    '<div class="tiny muted center" style="margin-top:7px">Tes choix sont déjà enregistrés.</div>'+
  '</div>';
  return html;
}

/* E7 — le basculement doit se voir TOUT DE SUITE. Sans `oublierSuggestions`,
   la vitrine aurait resservi son calcul précédent pendant 24 h (`SUGG_TTL`) et
   l'interrupteur aurait eu l'air cassé. */
function setToutesOrigines(v){
  const g = db.gouts; if(!g) return;
  if(!!g.toutesOrigines === !!v) return;
  g.toutesOrigines = !!v;
  oublierSuggestions();
  toucheGouts();
  render();
}

/* Sortie depuis les réglages ou la vitrine : rien à enregistrer, tout l'a déjà
   été. On repart simplement d'où l'on vient, et les suggestions se referont. */
function fermerGouts(){
  toast('Goûts enregistrés');
  goBack();
}
/* D3 — `apresGouts`, `finirGouts` et `passerGouts` enchaînaient les écrans de
   l'inscription. L'inscription s'arrête maintenant à l'avatar : il ne reste
   que la sortie normale, `fermerGouts`, qui rend la main à l'écran d'où l'on
   vient. */
