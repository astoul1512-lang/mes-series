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
  /* LOT A — les sous-genres d'animé retenus (§5.6). Le genre « Animation » ne
     sépare rien côté animé : tout y est étiqueté Animation + Action & Aventure.
     La clé est posée ici parce que le contrat de données du lot l'exige et
     qu'elle doit entrer dans la synchro dès maintenant ; l'écran qui la remplit
     appartient au parcours d'inscription, donc à un autre lot. */
  if(!Array.isArray(g.animeSous)) g.animeSous = [];
  /* LOT A — les titres dont on a déclaré, en plein duel, ne pas les avoir vus.
     Le paquet du duel vient de titres SUPPOSÉS vus ; sans mémoire, le même
     titre inconnu reviendrait à chaque session et il faudrait le récuser
     indéfiniment. Ce n'est pas un avis : ça ne dit rien du goût, seulement que
     la bibliothèque se trompe sur ce titre. */
  if(!Array.isArray(g.pasVus)) g.pasVus = [];
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

/* ===========================================================================
   LOT A — LE SIGNAL D'APPRÉCIATION

   Tout ce qui précède reposait sur une équation fausse : vu = aimé. Un titre
   terminé devenait un modèle à copier, alors qu'on finit des séries par
   habitude. Ce bloc récolte ce qui a été RÉELLEMENT aimé, et rien d'autre.

   Une seule règle gouverne toute la section : l'app ne déduit rien à la place
   de la personne. Un avis se déclare, il ne se devine pas — et partout où on
   en demande un, il faut pouvoir dire « je ne peux pas répondre ». Sans cette
   porte de sortie, on récolte du bruit en croyant récolter du signal.
=========================================================================== */

/* L'avis porté sur un titre : 1, -1, ou 0 quand il n'y en a pas.
   Zéro et « pas d'avis » sont la même chose ici parce qu'aucun appelant n'a
   besoin de les distinguer ; là où la distinction compte (le poids), c'est
   `poidsTitre` qui tranche. */
function avisDe(media, id){
  const a = db.avis && db.avis[media] && db.avis[media][String(id)];
  return (a && (a.v === 1 || a.v === -1)) ? a.v : 0;
}
const aAime    = (media, id)=> avisDe(media, id) === 1;
const aPasAime = (media, id)=> avisDe(media, id) === -1;

/* Poser un avis. Repasser le même pouce l'ANNULE — c'est le seul geste de
   retour disponible sur la barre, qui n'a pas de bouton « Annuler », et c'est
   aussi ce qui permet de reprendre un 👎 depuis « Écartés » d'un seul appui. */
function poserAvis(media, id, v){
  if(v !== 1 && v !== -1) return retirerAvis(media, id);
  db.avis = db.avis || { tv:{}, movie:{} };
  db.avis[media] = db.avis[media] || {};
  const cle = String(id);
  if(avisDe(media, id) === v) return retirerAvis(media, id);
  db.avis[media][cle] = { v:v, quand: Date.now() };
  /* Un avis posé efface la trace de son effacement : sinon la synchro suivante
     verrait un effacement plus récent que l'avis et le reprendrait. */
  if(db.avisRetires && db.avisRetires[media]) delete db.avisRetires[media][cle];
  apresAvis();
  return v;
}
function retirerAvis(media, id){
  const cle = String(id);
  if(db.avis && db.avis[media]) delete db.avis[media][cle];
  db.avisRetires = db.avisRetires || { tv:{}, movie:{} };
  db.avisRetires[media] = db.avisRetires[media] || {};
  db.avisRetires[media][cle] = Date.now();
  apresAvis();
  return 0;
}
/* Un avis change ce que l'app croit savoir : la vitrine doit répondre TOUT DE
   SUITE. C'est le contrat du §3.9 — un geste qui ne change rien à l'écran est
   un geste qu'on ne refait pas. `saveDB` déclenche la synchro et `veilleBiblio`
   par-dessus ; `oublierSuggestions` force le recalcul sans attendre les 24 h de
   cache, qui feraient passer le pouce pour inopérant. */
function apresAvis(){
  if(typeof oublierSuggestions === 'function') oublierSuggestions();
  saveDB();
}

/* ---------- Le poids d'un titre dans le profil de goût ----------
   Règle commune à tous les lots, elle ne se discute pas :
     👍 → 2 · aucun avis → 1 · 👎 → 0, c'est-à-dire exclu.
   Les titres non qualifiés comptent à moitié plutôt que zéro : sans ça, au
   premier lancement personne n'a de 👍, donc personne n'a de suggestions. Une
   falaise, là où il faut une pente. */
const POIDS_AIME = 2, POIDS_NEUTRE = 1, POIDS_ECARTE = 0;
function poidsTitre(media, id){
  const v = avisDe(media, id);
  return v === 1 ? POIDS_AIME : v === -1 ? POIDS_ECARTE : POIDS_NEUTRE;
}

/* Les titres explicitement écartés, pour la liste du même nom dans Mes goûts.
   Sans retour en arrière possible, on cesse de voter — c'est le garde-fou
   nommé dans la spec, et il n'a de sens que si l'écran existe. */
function titresEcartes(){
  const out = [];
  Object.keys((db.avis && db.avis.tv) || {}).forEach(id=>{
    if(avisDe('tv', id) !== -1) return;
    const s = db.shows[id];
    out.push({ media:'tv', id:id, nom:(s && s.name) || 'Titre retiré de ta liste',
               affiche:(s && s.poster) || null, quand:db.avis.tv[id].quand || 0 });
  });
  Object.keys((db.avis && db.avis.movie) || {}).forEach(id=>{
    if(avisDe('movie', id) !== -1) return;
    const m = db.movies[id];
    out.push({ media:'movie', id:id, nom:(m && m.title) || 'Titre retiré de ta liste',
               affiche:(m && m.poster) || null, quand:db.avis.movie[id].quand || 0 });
  });
  return out.sort((a,b)=>b.quand-a.quand);
}

/* ===========================================================================
   LOT A — LE MODÈLE DE GOÛT (chapitre 2)

   Deux erreurs à ne pas commettre, et le code les évite explicitement :

   1. LE GENRE EST TROP GROS. Mesuré sur TMDB : « comédie » seul rend 173 456
      titres, « comédie + enquête policière » en rend 379. Un genre ne dit pas
      un goût — d'où le taux, qui au moins dit lesquels on aime.

   2. UN GOÛT N'EST PAS UNIQUE. On peut adorer la SF exigeante ET les comédies
      familiales ; la moyenne des deux ne ressemble à ni l'une ni l'autre. D'où
      DEUX moteurs séparés, `moteurHabitude` et `moteurCoeur`, qu'il ne faut
      JAMAIS fondre dans un même calcul.
=========================================================================== */

/* Un genre ne compte qu'à partir de ce nombre de titres vus. En dessous, le
   taux n'est pas une mesure : c'est un accident. « 1 vu, 1 aimé » ferait un
   genre à 100 % qui gouvernerait tout l'écran. */
const GENRE_PLANCHER = 3;

/* Tous les titres VUS d'une famille, avec leur média, leur nom et leurs genres.
   Un titre ajouté et jamais ouvert n'en est pas : il ne dit rien, ni dans un
   sens ni dans l'autre. C'est la matière première des deux moteurs et du duel,
   d'où une seule fonction pour les trois. */
function titresVus(famille){
  const out = [];
  Object.values(db.shows).forEach(s=>{
    /* Sur le nombre d'épisodes cochés et non sur `statutSerie` : une série mise
       en pause porte le statut « pause », qui masque le fait qu'on ne l'ait
       jamais ouverte. Même critère que `genresDeduits` et `famillesVues`. */
    if(!s || !progress(s).watched) return;
    const f = familleDe(s, 'tv');
    if(famille && f !== famille) return;
    out.push({ media:'tv', id:String(s.id), nom:s.name, famille:f,
               genres:s.genres || [], affiche:s.poster || null,
               date:s.first || null, fini:isFinished(s), part:progress(s).pct });
  });
  Object.values(db.movies).forEach(m=>{
    if(!m || !m.seen) return;
    if(famille && famille !== 'film') return;
    out.push({ media:'movie', id:String(m.id), nom:m.title, famille:'film',
               genres:m.genres || [], affiche:m.poster || null,
               date:m.date || null, fini:true, part:100 });
  });
  return out;
}

/* « Sur les SF que tu as vues, combien tu en as aimé ? » — et non « combien de
   SF as-tu vues ». Le volume mesure l'habitude, le taux mesure l'amour. Le
   drame passe de dernier à premier alors qu'il ne pèse que six titres, et c'est
   juste.
   Les titres 👎 comptent dans les VUS mais jamais dans les AIMÉS : c'est ce qui
   fait chuter le taux d'un genre qu'on subit. */
function tauxParGenre(famille){
  const par = {};
  titresVus(famille).forEach(t=>{
    const v = avisDe(t.media, t.id);
    (t.genres || []).forEach(g=>{
      const e = par[g] || (par[g] = { genre:g, vus:0, aimes:0, poids:0 });
      e.vus++;
      if(v === 1) e.aimes++;
      e.poids += poidsTitre(t.media, t.id) * (t.fini ? 1.5 : 1);
    });
  });
  return Object.values(par).map(e=>
    Object.assign(e, { taux: e.vus ? e.aimes / e.vus : 0, mesurable: e.vus >= GENRE_PLANCHER }));
}

/* Les genres classés AU TAUX, plancher appliqué. Exposé pour les rangées de
   Découvrir, qui ne sont pas de ce lot. */
function genresParTaux(famille){
  const hors = (db.gouts && db.gouts.exclus) || [];
  return tauxParGenre(famille)
    .filter(e => e.mesurable && e.aimes > 0 && hors.indexOf(e.genre) < 0)
    .sort((a,b)=> b.taux - a.taux || b.vus - a.vus)
    .map(e => e.genre);
}

/* MOTEUR 1 — L'HABITUDE. Le volume, corrigé par le taux. Il confirme, il
   remplit, il rassure : « Des drames pour toi ».

   La correction est multiplicative et bornée : un genre sans aucun 👍 garde
   exactement son poids d'avant, un genre aimé à 100 % triple. C'est ce qui
   garantit qu'au premier lancement — zéro avis partout — l'ordre est
   RIGOUREUSEMENT celui d'avant ce lot. On n'a le droit de bouger l'écran de
   quelqu'un qu'à partir du moment où il a dit quelque chose. */
function moteurHabitude(famille){
  const hors = (db.gouts && db.gouts.exclus) || [];
  return tauxParGenre(famille)
    .filter(e => e.poids > 0 && hors.indexOf(e.genre) < 0)
    .map(e => ({ genre:e.genre, score: e.poids * (1 + 2 * (e.mesurable ? e.taux : 0)) }))
    .sort((a,b)=> b.score - a.score)
    .map(e => e.genre);
}

/* MOTEUR 2 — LE CŒUR. Les titres qui servent de point de départ : « Dans
   l'esprit de Whiplash ». Il part d'un favori et explore loin.

   L'ordre dit tout le raisonnement : le podium d'abord (la personne a joué, on
   la croit), les 👍 ensuite (elle l'a dit), le reste enfin (on ne sait pas, on
   ne prétend rien). Les 👎 n'y sont jamais : poids 0 veut dire exclu.
   UN SEUL 👍 SUFFIT à ouvrir la rangée — le duel n'est jamais un péage. */
function moteurCoeur(famille){
  const rang = ((db.podium || {})[famille] || []).map(String);
  return titresVus(famille)
    .filter(t => avisDe(t.media, t.id) !== -1)
    .map(t=>{
      const i = rang.indexOf(String(t.id));
      return Object.assign({}, t, {
        rang: i,
        score: (i >= 0 ? 10000 - i * 100 : 0) + (aAime(t.media, t.id) ? 1000 : 0)
               + (t.fini ? 50 : 0) + t.part });
    })
    .sort((a,b)=> b.score - a.score);
}

/* L'ÉCHELLE DE DÉGRADATION (§2.4). Ce qu'on peut faire avec ce qu'on a — et
   ce qu'il faut DIRE quand on ne peut pas. L'app ne surjoue jamais ce qu'elle
   sait : jamais « adoré » sur un simple 👍, jamais « ton préféré » sans duel. */
function niveauProfil(){
  const podium = ['film','serie','anime'].some(f => (((db.podium||{})[f])||[]).length);
  if(podium) return 'podium';
  const aime = ['tv','movie'].some(m =>
    Object.keys((db.avis && db.avis[m]) || {}).some(id => avisDe(m, id) === 1));
  if(aime) return 'aimes';
  if(titresVus().length) return 'vus';
  return 'rien';
}

/* Le titre de tête d'une famille, et de quel signal il tire sa légitimité.
   C'est ce couple, et lui seul, qui autorise une formulation à l'écran :
     'podium' → « Ton film préféré : Whiplash »
     'aime'   → « Parce que tu as aimé Whiplash »
     'vu'     → rien de tout ça : on n'a qu'un titre regardé.
   Exposé pour les rangées de Découvrir, qui ne sont pas de ce lot. */
function titrePhare(famille){
  const l = moteurCoeur(famille);
  if(!l.length) return null;
  const t = l[0];
  return Object.assign({}, t,
    { signal: t.rang >= 0 ? 'podium' : aAime(t.media, t.id) ? 'aime' : 'vu' });
}

/* Le sous-titre de la ligne « Mes goûts » dans les réglages : il doit dire en
   un coup d'œil si l'app devine toute seule ou si on lui a donné des consignes. */
function resumeGouts(){
  const g = db.gouts || {};
  /* LOT A — les pouces comptent autant que les genres cochés : ce sont eux, et
     non la déduction, qui gouvernent désormais les suggestions. Dire
     « automatique » à quelqu'un qui a déclaré vingt titres serait faux. */
  const aimes = ['tv','movie'].reduce((n,m)=>
    n + Object.keys((db.avis && db.avis[m]) || {}).filter(id => avisDe(m, id) === 1).length, 0);
  if(!goutsManuels() && !aimes) return 'Automatique, d\'après ce que tu regardes';
  const bouts = [];
  if(aimes) bouts.push(aimes + ' titre'+(aimes>1?'s':'')+' aimé'+(aimes>1?'s':''));
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

/* Les titres qui servent de point de départ aux recommandations.
   LOT A — le nom de cette fonction MENTAIT, et c'était la cause n°1 du manque
   de pertinence de Découvrir : « fini ou vu à plus de 50 % » n'est pas « aimé »,
   c'est « regardé ». On finit des séries par habitude, par inertie, parce
   qu'elles traînaient.
   Le calcul reste le même faute de mieux — on ne peut pas inventer un signal —
   mais il obéit désormais à ce qui a été DIT :
     · un titre 👎 en sort complètement, quoi qu'on en ait regardé (poids 0) ;
     · un titre 👍 passe devant tout ce qui n'a été que regardé ;
     · un titre du podium passe devant les autres 👍.
   Sans un seul avis en base, l'ordre est exactement celui d'avant. */
function titresAimes(){
  const out = [];
  const bonus = (media, id, famille)=>{
    const rang = ((db.podium || {})[famille] || []).map(String).indexOf(String(id));
    return (rang >= 0 ? 10000 - rang * 100 : 0) + (aAime(media, id) ? 1000 : 0);
  };
  Object.values(db.shows).forEach(s=>{
    const p = progress(s);
    if(!p.total) return;
    if(aPasAime('tv', s.id)) return;
    const part = p.watched / p.total;
    const fam = familleDe(s, 'tv');
    /* Un 👍 fait entrer un titre même peu avancé : la personne vient de dire
       qu'elle l'aime, on n'a pas à lui opposer un compteur d'épisodes. */
    if(isFinished(s) || part >= 0.5 || aAime('tv', s.id))
      out.push({ media:'tv', id:s.id, nom:s.name, famille: fam,
                 score: part * 100 + p.watched + bonus('tv', s.id, fam) });
  });
  Object.values(db.movies).forEach(m=>{
    if(!m.seen || aPasAime('movie', m.id)) return;
    out.push({ media:'movie', id:m.id, nom:m.title, famille:'film',
               score: 60 + bonus('movie', m.id, 'film') });
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
    /* LOT A — un 👎 posé depuis prime sur une graine posée le premier jour. */
    if(aPasAime(g.media, g.id)) return;
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

const FAMILLES = ['serie', 'film', 'anime'];
/* LOT D — `grainesSuggestions` a été RETIRÉE ici, et il faut dire pourquoi
   plutôt que de laisser un trou.

   Elle entrelaçait les trois familles pour choisir le point de départ des
   recommandations, à partir de `titresAimes()` — qui, malgré son nom, contient
   tout ce qui a été REGARDÉ. C'est exactement l'équation fausse du §1.1, et
   elle survivait là. Le point de départ vient désormais de `graineEsprit`, qui
   ne connaît que le podium et les 👍, et qui applique l'échelle de dégradation
   du §2.4. Aucun autre fichier ne l'appelait — vérifié avant de la retirer. */

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
/* LOT D — une case par rangée du catalogue du §3.4, plus la réserve de la
   proposition du jour. Le carrousel de vedettes a disparu : « une seule
   proposition justifiée en dit plus que dix génériques » (§3.3). */
function suggVide(){
  return { etat:'froid' /* froid|attente|ok|erreur */, quand:0,
           enCours:false, perime:false,
           /* La réserve de la proposition du jour : le premier candidat non
              écarté est celui qu'on montre. §3.8 — « la carte est remplacée
              immédiatement par le candidat suivant » ; sans réserve, « Pas pour
              moi » laisserait un trou en haut de l'écran. */
           propositions:[],
           esprit:null, favoris:null, acteur:null, genre:null,
           sections:[], cercle:null, incont:null, plates:null,
           nouveautes:[], avenir:[],
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
  /* LOT A — un pouce et un duel déplacent le profil bien plus qu'un genre
     coché : ils doivent donc périmer la vitrine. Sans ces trois lignes, un 👍
     ne se serait vu à l'écran qu'au bout des 24 h de cache, et le geste aurait
     eu l'air sans effet — exactement ce que le §3.9 interdit. */
  ['tv','movie'].forEach(m=>{
    const t = (db.avis && db.avis[m]) || {};
    Object.keys(t).forEach(id=>{ mel(Number(id) || 0); mel(t[id].v); });
  });
  ['film','serie','anime'].forEach(f=>
    (((db.podium||{})[f])||[]).forEach(id=> mel(Number(id) || 0)));
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
  /* LOT C — LES DEUX identifiants, pas le premier trouvé. Ce tamis passe sur
     des films ET sur des séries mêlés ; ne retenir qu'un identifiant par genre
     écarté ne protégeait donc qu'une famille sur deux. « Pas d'horreur »
     écartait les films d'horreur et laissait passer les séries.
     Le `||` d'origine masquait le problème tant que `genreParNom('tv', …)`
     rendait `null` sur les genres de films : depuis qu'il sait traduire
     (`GENRE_SERIE`, app-04), il aurait renvoyé l'identifiant SÉRIE et cessé de
     protéger les films — l'inverse exact du défaut, sur une consigne que la
     personne a donnée explicitement. On prend les deux, une fois chacun. */
  const idsHors = [];
  hors.forEach(nom=>{
    [genreParNom('tv', nom), genreParNom('movie', nom)].forEach(id=>{
      if(id != null && idsHors.indexOf(id) < 0) idsHors.push(id);
    });
  });
  return liste.filter(x=>{
    if(!x) return false;
    if(cadre.medias.indexOf(x.media) < 0) return false;
    const cle = x.media + ':' + x.id;
    if(vus[cle]) return false;
    if(dejaChezMoi(x.media, x.id)) return false;
    /* LOT D §3.8 — « Pas pour moi » veut dire « ne me le remontre pas ». Le
       titre sort de toutes les rangées, pas seulement de celle où il a été
       refusé : le contraire ferait réapparaître deux lignes plus bas ce qu'on
       vient d'écarter. Appel gardé : app-11 ne dépend pas d'app-04. */
    if(typeof estRefuseSugg === 'function' && estRefuseSugg(x.media, x.id)) return false;
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
    /* LOT A — le poids du titre entre dans le calcul : un 👎 ne pèse plus rien
       (poids 0), un 👍 pèse double. Une série subie jusqu'au bout cessait
       jusqu'ici de se distinguer d'une série adorée. */
    const w = poidsTitre('tv', s.id);
    if(!w) return;
    const n = (p.watched + (isFinished(s) ? 10 : 0)) * w;
    (s.genres||[]).forEach(x=>{ poids[x] = (poids[x]||0) + n; });
  });
  if(famille === 'film') Object.values(db.movies).forEach(m=>{
    if(!m.seen) return;
    const w = poidsTitre('movie', m.id);
    if(!w) return;
    (m.genres||[]).forEach(x=>{ poids[x] = (poids[x]||0) + 5 * w; });
  });
  /* LE TAUX PLUTÔT QUE LE VOLUME (§2.2). Le volume mesure l'habitude, le taux
     mesure l'amour — mais aucun des deux seul ne suffit, donc on corrige l'un
     par l'autre plutôt que de choisir. Multiplicatif et borné : un genre sans
     aucun 👍 garde exactement son score d'avant, ce qui rend ce lot invisible
     pour qui n'a encore rien déclaré. Le plancher de trois titres protège du
     genre à un seul vu qui afficherait 100 %. */
  const taux = {};
  tauxParGenre(famille).forEach(e=>{ taux[e.genre] = e.mesurable ? e.taux : 0; });
  return Object.keys(poids)
    .map(x => ({ nom:x, score: poids[x] * (1 + 2 * (taux[x] || 0)) }))
    .sort((a,b)=> b.score - a.score)
    .map(x => x.nom)
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

/* ===========================================================================
   LOT D — LE CATALOGUE DES RANGÉES (§3.4)

   Dix rangées, un ordre fixe, et pour chacune une condition d'affichage. La
   règle qui gouverne tout le reste : UNE RANGÉE QUI N'A RIEN À DIRE NE
   S'AFFICHE PAS. Il n'y a donc aucun plafond de longueur — c'est la condition
   qui règle l'écran, pas un quota. Un profil nourri voit une dizaine de
   rangées, un profil qui démarre en voit quatre.

   Et la règle d'écriture, §3.2 : CHAQUE RANGÉE DIT D'OÙ ELLE VIENT, DANS SON
   TITRE. Pas de sous-titre, pas de pastille, aucun vocabulaire de moteur à
   l'écran. Les quatre moteurs (cœur, habitude, actu, cercle) sont un outil de
   spec ; ils ne sont écrits nulle part dans l'interface. C'est pour ça que
   chaque rangée porte ci-dessous un `titre` complet et rien d'autre : s'il
   fallait une seconde ligne pour l'expliquer, la rangée serait mal conçue.
=========================================================================== */

/* Le numéro du jour. Toute la rotation quotidienne en dépend — le titre du
   jour, l'acteur mis en avant, la décennie des incontournables (§3.9). Il est
   calculé sur la DATE et jamais tiré au sort : stable toute la journée,
   différent demain, et surtout identique d'un rendu à l'autre — sans quoi
   l'écran bougerait sous les doigts, ce que le §3.9 interdit. */
function jourVitrine(){ return Math.floor(Date.parse(todayISO()) / 86400000); }

/* Trois 👍 pour ouvrir « Ce que tes favoris ont en commun » (§3.4), et deux
   favoris au moins pour qu'un titre y entre — sinon « en commun » ne veut rien
   dire et la rangée n'est qu'une seconde « Dans l'esprit de ». */
const FAVORIS_MINI = 3, FAVORIS_CROISEMENT = 2;
/* La profondeur de la réserve de la proposition du jour. « Pas pour moi »
   remplace la carte immédiatement (§3.8) : sans réserve, le deuxième refus de
   la journée laisserait un trou en tête d'écran. Douze, c'est plus de refus
   qu'on n'en enchaîne, et ça ne coûte aucune requête de plus. */
const PROPOSITIONS_RESERVE = 12;

/* §3.4 rangée 4 — le titre de la rangée de genre. IL DOIT SE SUFFIRE (§3.2) :
   c'est lui, et rien d'autre, qui dit d'où vient la rangée.

   Deux tournures selon que le genre se compte ou non — « Des drames pour toi »
   mais « De la science-fiction pour toi ». La table porte donc l'article avec
   le mot : un pluriel mécanique aurait écrit « Des science-fictions ». Un genre
   absent de la table retombe sur une phrase qui reste vraie quel que soit le
   mot, plutôt que sur une tournure fausse. */
const GENRE_PLURIEL = {
  'action':'de l\'action', 'aventure':'de l\'aventure', 'animation':'de l\'animation',
  'comédie':'des comédies', 'crime':'des polars', 'documentaire':'des documentaires',
  'drame':'des drames', 'familial':'des histoires de famille', 'fantastique':'du fantastique',
  'histoire':'de l\'histoire', 'horreur':'de l\'horreur', 'musique':'de la musique',
  'mystère':'du mystère', 'romance':'de la romance', 'science-fiction':'de la science-fiction',
  'téléfilm':'des téléfilms', 'thriller':'des thrillers', 'western':'des westerns',
  'action & adventure':'de l\'action', 'sci-fi & fantasy':'de la science-fiction',
  'kids':'des programmes pour enfants', 'reality':'de la téléréalité',
  'soap':'des feuilletons', 'talk':'des talk-shows', 'news':'de l\'info'
};
function titreRangeeGenre(nom){
  const p = GENRE_PLURIEL[String(nom || '').toLowerCase()];
  if(!p) return 'Ce que tu aimes le plus souvent : ' + nom;
  return p.charAt(0).toUpperCase() + p.slice(1) + ' pour toi';
}

/* §3.3 — LA RAISON DE LA PROPOSITION DU JOUR, et elle ne surjoue jamais ce que
   l'app sait. Un duel joué autorise « ton préféré », un simple 👍 n'autorise
   que « tu as aimé », et sans aucun signal on ne prétend rien du tout : on dit
   que c'est un incontournable, ce qui est vrai de la source. Jamais « adoré »
   sur un simple 👍 — c'est exactement le travers dénoncé au §1.1. */
const LIB_PREFERE = { film:'Ton film préféré', serie:'Ta série préférée',
                      anime:'Ton animé préféré' };
function raisonDuJour(graine){
  if(!graine) return 'Un incontournable que tu n\'as pas encore vu';
  if(graine.signal === 'podium')
    return (LIB_PREFERE[graine.famille] || 'Ton préféré') + ' : ' + graine.nom;
  return 'Parce que tu as aimé ' + graine.nom;
}

/* Les familles couvertes par une puce. Le cadre parle en médias TMDB
   (`tv`/`movie`), le moteur de goût parle en familles (`serie`/`film`/`anime`) :
   c'est la table de passage entre les deux. */
function famillesDuCadre(cadre){
  if(cadre.origine === 'anime') return ['anime'];
  if(cadre.medias.length === 1) return [cadre.medias[0] === 'movie' ? 'film' : 'serie'];
  return ['film','serie','anime'];
}

/* Les titres réellement AIMÉS, dans le cadre de la puce, du plus légitime au
   moins légitime. C'est la matière des rangées de cœur — et la condition
   d'affichage des rangées 1 et 2 se lit directement sur sa longueur.

   Les graines de la grille d'amorçage en font partie : la question posée
   là-bas est « lesquels tu as AIMÉS ? » (§5.5), pas « lesquels tu as vus ».
   Les écarter aurait laissé sans rangée de cœur quelqu'un qui vient
   précisément de dire ce qu'il aime — le contraire de ce que la grille promet.
   Leur score reste délibérément bas : un vrai 👍 passe devant. */
function titresAimesSugg(cadre){
  const out = [], vus = {};
  famillesDuCadre(cadre).forEach(f=>{
    moteurCoeur(f).forEach(t=>{
      if(cadre.medias.indexOf(t.media) < 0) return;
      if(!aAime(t.media, t.id)) return;
      const cle = t.media+':'+t.id;
      if(vus[cle]) return; vus[cle] = 1;
      out.push({ media:t.media, id:String(t.id), nom:t.nom, famille:f,
                 rang:t.rang, score:t.score });
    });
  });
  ((db.gouts && db.gouts.graines) || []).forEach(g=>{
    if(!g || cadre.medias.indexOf(g.media) < 0) return;
    const fam = g.famille || (g.media === 'movie' ? 'film' : 'serie');
    if(famillesDuCadre(cadre).indexOf(fam) < 0) return;
    if(aPasAime(g.media, g.id)) return;
    const cle = g.media+':'+g.id;
    if(vus[cle]) return; vus[cle] = 1;
    out.push({ media:g.media, id:String(g.id), nom:g.nom||'', famille:fam,
               rang:-1, score:20, graine:true });
  });
  return out.sort((a,b)=> b.score - a.score);
}

/* Le titre dont part « Dans l'esprit de … », et LE SIGNAL QUI L'AUTORISE.

   L'ordre n'est pas cosmétique, c'est l'échelle de dégradation du §2.4 :
     · un podium existe → on part de son n°1, et on a le droit de dire
       « ton film préféré » ; il ne tourne pas, c'est un classement ;
     · pas de podium mais des 👍 → rotation quotidienne parmi eux, et on ne
       dit rien de plus que « tu as aimé » ;
     · rien du tout → pas de rangée de cœur, et l'app le dit ailleurs.
   Jamais « adoré » sur un simple 👍 : c'est le travers dénoncé au §1.1. */
function graineEsprit(cadre){
  const fams = famillesDuCadre(cadre);
  for(let i = 0; i < fams.length; i++){
    const id = (((db.podium || {})[fams[i]]) || [])[0];
    if(id == null) continue;
    const t = moteurCoeur(fams[i]).find(x => String(x.id) === String(id));
    if(t && cadre.medias.indexOf(t.media) >= 0)
      return { media:t.media, id:String(t.id), nom:t.nom, famille:fams[i], signal:'podium' };
  }
  const aimes = titresAimesSugg(cadre);
  if(!aimes.length) return null;
  const t = aimes[jourVitrine() % aimes.length];
  return { media:t.media, id:t.id, nom:t.nom, famille:t.famille, signal:'aime' };
}

/* §3.6 — UNE SEULE RANGÉE ACTEUR, jamais trois. Trois rangées quasi
   identiques alourdissent l'écran sans rien apporter.

   « L'acteur est choisi par sa présence dans les titres aimés. » Cette
   présence ne se lit pas localement : il faut la filmographie. On en examine
   donc trois par jour — exactement le nombre de requêtes que coûtaient les
   trois rangées d'avant, à l'unité près — et la fenêtre TOURNE, ce qui donne
   son tour à chaque acteur déclaré au fil des jours. C'est la « rotation
   quotidienne parmi les mieux placés » : on classe ceux du jour, on n'en garde
   qu'un. Le défaut que ça corrige : les 3 PREMIERS acteurs ajoutés, pour
   toujours — en ajouter 30 n'en faisait jamais apparaître 27. */
const ACTEURS_EXAMEN = 3;
function acteursExamines(){
  const l = ((db.gouts || {}).acteurs) || [];
  if(l.length <= ACTEURS_EXAMEN) return l.slice();
  const d = jourVitrine() % l.length;
  const out = [];
  for(let i = 0; i < ACTEURS_EXAMEN; i++) out.push(l[(d + i) % l.length]);
  return out;
}

/* §2.2 — LE GENRE AU MEILLEUR TAUX, celui de la rangée « Des drames pour toi ».
   Pas « ce que tu regardes le plus » mais « ce que tu aimes le plus souvent ».
   Le plancher de `tauxParGenre` fait le tri : un genre à un seul titre vu
   afficherait 100 % et gouvernerait l'écran.

   Les familles sont fondues sur le nom CANONIQUE : « Action » côté films et
   « Action & Adventure » côté séries sont le même genre, et les compter deux
   fois donnait deux rangées jumelles — le même défaut que le pavé de texte du
   point 8 affichait en toutes lettres. */
function genreDuTaux(cadre){
  const par = {};
  famillesDuCadre(cadre).forEach(f=>{
    tauxParGenre(f).forEach(e=>{
      if(!e.mesurable || !e.aimes) return;
      const nom = (typeof genreCanon === 'function') ? genreCanon(e.genre) : e.genre;
      const c = par[nom] || (par[nom] = { nom:nom, vus:0, aimes:0 });
      c.vus += e.vus; c.aimes += e.aimes;
    });
  });
  const hors = (db.gouts && db.gouts.exclus) || [];
  const horsCanon = hors.map(n => (typeof genreCanon === 'function') ? genreCanon(n) : n);
  return Object.keys(par).map(k => par[k])
    .filter(e => horsCanon.indexOf(e.nom) < 0)
    .map(e => Object.assign(e, { taux: e.aimes / e.vus }))
    .sort((a,b)=> b.taux - a.taux || b.vus - a.vus)[0] || null;
}

/* §3.7 — LA RANGÉE QUI NE TE RESSEMBLE PAS. Bornée par ÉPOQUE, jamais par
   genre : un incontournable se voit pour se faire son idée. La décennie tourne
   au jour, sinon on sert Le Parrain et Shawshank jusqu'à la fin des temps, et
   ELLE PASSE DANS LE TITRE. Le seul garde-fou est le genre explicitement
   écarté dans Mes goûts — ce n'est pas une borne de genre, c'est le respect
   d'une consigne donnée ; `tamiser` s'en charge pour toutes les rangées. */
const DECENNIES_INCONT = [
  { cle:'1970', titre:'Les incontournables des années 70',   de:'1970-01-01', a:'1979-12-31' },
  { cle:'1980', titre:'Les incontournables des années 80',   de:'1980-01-01', a:'1989-12-31' },
  { cle:'1990', titre:'Les incontournables des années 90',   de:'1990-01-01', a:'1999-12-31' },
  { cle:'2000', titre:'Les incontournables des années 2000', de:'2000-01-01', a:'2009-12-31' },
  { cle:'2010', titre:'Les incontournables des années 2010', de:'2010-01-01', a:'2019-12-31' }
];
function decennieVitrine(){
  return DECENNIES_INCONT[jourVitrine() % DECENNIES_INCONT.length];
}
/* Beaucoup de votes ET très bien noté : c'est la définition de « forte
   reconnaissance » du §3.7. Le plancher diffère entre films et séries — le
   catalogue de séries est beaucoup plus petit, le même chiffre le viderait. */
function requeteIncont(media, dec){
  const champ = media === 'movie' ? 'primary_release_date' : 'first_air_date';
  const p = { include_adult:'false', page:'1', sort_by:'vote_count.desc',
              'vote_count.gte': media === 'movie' ? '4000' : '1500',
              'vote_average.gte':'7.3' };
  p[champ+'.gte'] = dec.de; p[champ+'.lte'] = dec.a;
  /* Pas de filtre plateformes ici, DÉLIBÉRÉMENT : cette rangée parle de
     notoriété, pas de catalogue, et sa condition d'affichage est « toujours »
     (§3.4). La restreindre aux abonnements déclarés l'aurait fait disparaître
     certains jours — une rangée « toujours » qui s'absente est un écran cassé.
     Même raison que pour « Bientôt » et « Avec X ». */
  return { media:media, p:p };
}

/* §3.4 rangée 8 — ce qui est réellement lançable ce soir. La rangée n'existe
   que si des abonnements ont été déclarés : c'est la seule chose que l'app ne
   peut pas deviner, et sans elle la requête n'a pas de sujet. */
function requetePlatesRangee(media){
  const l = (typeof mesPlates === 'function') ? mesPlates() : [];
  if(!l.length) return null;
  const p = Object.assign({ include_adult:'false', page:'1' }, triSuggestions(), {
    with_watch_providers: l.map(x=>x.id).join('|'),
    watch_region: REGION_PLATO,
    with_watch_monetization_types: 'flatrate' });
  return { media:media, p:p };
}
/* « Sur Netflix et Max » — le titre NOMME les plateformes tant qu'elles
   tiennent, parce que c'est ça qui dit d'où vient la rangée (§3.2). Au-delà de
   deux, la liste cesse d'être lisible d'un coup d'œil et on retombe sur une
   formule générale. */
function titreRangeePlates(){
  const l = (typeof mesPlates === 'function') ? mesPlates() : [];
  if(!l.length) return '';
  if(l.length === 1) return 'Sur ' + l[0].nom;
  if(l.length === 2) return 'Sur ' + l[0].nom + ' et ' + l[1].nom;
  return 'Sur tes plateformes';
}

/* §3.5 — LE CERCLE, la meilleure carte et elle est déjà dans l'app.

   Aucune donnée nouvelle à collecter : le partage existe déjà. UNE SEULE
   rangée, généraliste, qui mélange les bibliothèques de tous les proches —
   pas de rangée par personne, on n'en met aucun en avant. Pas de proches, pas
   de section, et AUCUNE invitation dans Découvrir.

   FRONTIÈRE DE CONFIANCE. Ces objets viennent de la colonne `data` d'une AUTRE
   personne, qu'elle peut écrire par appel direct à l'API. Un identifiant qui
   n'est pas une suite de chiffres n'entre pas dans le paquet (`estIdTmdb`) —
   et pas un échappement à la place : `escJs` laisserait passer un identifiant
   absurde jusqu'à `/tv/<n'importe quoi>` côté relais. */
const CERCLE_BIBLIOS_MAX = 6;      // au-delà, c'est une cascade réseau, pas une rangée
async function chargerBibliosCercle(){
  const suivis = ((typeof partage === 'object' && partage && partage.suivis) || [])
    .slice(0, CERCLE_BIBLIOS_MAX);
  if(!suivis.length) return [];
  await Promise.all(suivis.map(async p=>{
    if(biblios[p.id]) return;                     // déjà en mémoire : on ne redemande pas
    try{ await chargerBiblio(p.id); }catch(e){}
  }));
  return suivis.filter(p => biblios[p.id] && !biblios[p.id].erreur);
}

/* L'ORDRE FAIT TOUTE LA VALEUR DE LA RANGÉE, puisqu'elle est unique. Trois
   critères, dans cet ordre exact (§3.5) :
     1. combien de proches l'ont — le principe de corroboration ;
     2. la proximité avec les goûts, à égalité ;
     3. la récence chez eux.
   Et on exclut ce qu'il a déjà : `tamiser` s'en charge en aval.

   La famille se lit sur les genres, comme `familleDe` le fait déjà pour la
   bibliothèque locale : une bibliothèque partagée ne porte pas la langue
   d'origine. C'est l'approximation que l'app assume depuis toujours, elle ne
   sert ici qu'à répartir, jamais à écarter un résultat d'une requête. */
async function titresDuCercle(cadre){
  return cercleDepuisBiblios(await chargerBibliosCercle(), cadre);
}
/* Le classement est séparé de la lecture réseau, et pas par élégance : c'est
   l'ordre qui fait toute la valeur de cette rangée, et un tri qu'on ne peut
   pas éprouver sans serveur ne s'éprouve jamais. */
function cercleDepuisBiblios(gens, cadre){
  if(!gens.length) return [];
  const fams = famillesDuCadre(cadre);
  const mesGenres = {};
  fams.forEach(f => genresDeFamille(f).forEach(n=>{ mesGenres[String(n).toLowerCase()] = 1; }));

  const compte = {};
  gens.forEach(p=>{
    const b = biblios[p.id] || {};
    [['shows','tv'],['movies','movie']].forEach(([cle, media])=>{
      if(cadre.medias.indexOf(media) < 0) return;
      Object.values(b[cle] || {}).forEach(o=>{
        if(!o || o.id == null || !estIdTmdb(o.id)) return;
        const nom = media === 'tv' ? o.name : o.title;
        if(!nom || !o.poster) return;
        const genres = Array.isArray(o.genres) ? o.genres.map(String) : [];
        if(fams.indexOf(familleDe({ genres:genres }, media)) < 0) return;
        const k = media+':'+o.id;
        const e = compte[k] || (compte[k] = { media:media, o:o, nom:nom, genres:genres,
                                              n:0, quand:0 });
        e.n++;
        const q = Number(o.watchedAt || o.addedAt || 0);
        if(isFinite(q) && q > e.quand) e.quand = q;
      });
    });
  });

  return Object.keys(compte).map(k=>compte[k])
    .map(e=>{
      const proximite = e.genres.filter(g => mesGenres[g.toLowerCase()]).length;
      /* Les genres partagés sont retraduits en identifiants TMDB : sans eux, un
         genre explicitement écarté dans Mes goûts passerait au travers de
         `tamiser`, qui ne sait lire qu'une liste d'identifiants. Une consigne
         donnée par la personne ne doit sauter sur aucune source. */
      const ids = e.genres.map(g => genreParNom(e.media, g)).filter(x => x != null);
      return { corrob:e.n, proximite:proximite, quand:e.quand,
               x:{ id:e.o.id, media:e.media, nom:e.nom, affiche:e.o.poster,
                   bandeau:null,
                   date: e.media === 'tv' ? (e.o.first || null) : (e.o.date || null),
                   note: e.o.note || null, votes:0, genre_ids:ids, langue:null } };
    })
    .sort((a,b)=> b.corrob - a.corrob || b.proximite - a.proximite || b.quand - a.quand)
    .map(e => e.x);
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
    const jour = jourVitrine();
    const sections = sectionsPourPuce(type);

    /* LOT D — les rangées de cœur partent de ce qui a été AIMÉ, jamais de ce
       qui a seulement été regardé. C'était la cause n°1 du manque de
       pertinence (§1.1) : « vu = aimé » est une équation fausse. */
    const aimes = titresAimesSugg(cadre);
    const esprit = graineEsprit(cadre);
    /* §3.4 rangée 2 — « Ce que tes favoris ont en commun » ne s'ouvre qu'à
       partir de trois 👍 : en dessous, un croisement ne croise rien. */
    const favoris = aimes.length >= FAVORIS_MINI ? aimes.slice(0, FAVORIS_MINI) : [];
    const acteurs = acteursExamines();
    const genreT = genreDuTaux(cadre);
    const dec = decennieVitrine();

    const demandes = [];
    sections.forEach(sec=>{
      const r = requeteSection(sec);
      if(!r) return demandes.push(Promise.resolve({ kind:'section', sec:sec, l:[] }));
      demandes.push(sourceDouce(tmdb('/discover/'+r.media, r.p))
        .then(d => ({ kind:'section', sec:sec, l:(d&&d.results||[]).map(x=>normaliser(x, r.media)) })));
    });

    /* Les recommandations d'un titre servent DEUX rangées — « Dans l'esprit
       de X » et le croisement des favoris — et le n°1 du podium est presque
       toujours aussi le premier des favoris. On demande donc chaque titre une
       seule fois et on répartit ensuite : sans ce dédoublonnage, la même
       requête partait deux fois à chaque calcul. */
    const recoCles = [];
    if(esprit) recoCles.push(esprit.media+':'+esprit.id);
    favoris.forEach(t=>{
      const k = t.media+':'+t.id;
      if(recoCles.indexOf(k) < 0) recoCles.push(k);
    });
    recoCles.forEach(k=>{
      const m = k.slice(0, k.indexOf(':')), id = k.slice(k.indexOf(':')+1);
      demandes.push(sourceDouce(tmdb('/'+m+'/'+id+'/recommendations'))
        .then(d => ({ kind:'reco', cle:k,
                      l:(d&&d.results||[]).map(x=>normaliser(x, m)) })));
    });

    acteurs.forEach(a => demandes.push(sourceDouce(tmdb('/person/'+a.id+'/combined_credits'))
      .then(d => ({ kind:'acteur', titre:a.nom, id:a.id,
                    l:((d&&d.cast)||[])
                      .filter(x => x.media_type === 'tv' || x.media_type === 'movie')
                      .sort((x,y)=>(y.popularity||0)-(x.popularity||0))
                      .map(x => normaliser(x, x.media_type)) }))));

    /* §3.4 rangée 4 — le genre au meilleur TAUX, nommé dans le titre. */
    if(genreT) cadre.medias.forEach(m=>{
      const gid = genreParNom(m, genreT.nom);
      if(gid == null) return;
      const p = Object.assign({ include_adult:'false', page:'1' }, triSuggestions());
      if(cadre.origine === 'anime'){
        p.with_original_language = 'ja';
        const a = genreParNom(m, 'Animation');
        /* Sur les animés, l'animation japonaise est la définition de la puce et
           non une préférence : les deux identifiants partent en ET (virgule). */
        p.with_genres = (a != null && a !== gid) ? [a, gid].join(',') : String(gid);
      } else p.with_genres = String(gid);
      Object.assign(p, filtreMesPlates());
      demandes.push(sourceDouce(tmdb('/discover/'+m, p))
        .then(d => ({ kind:'genre', media:m, l:(d&&d.results||[]).map(x=>normaliser(x, m)) })));
    });

    /* §3.4 rangée 6 — le cercle. Aucune requête TMDB : la matière est déjà là. */
    demandes.push(titresDuCercle(cadre)
      .then(l => ({ kind:'cercle', l:l }), () => ({ kind:'cercle', l:[] })));

    /* §3.4 rangée 7 — les incontournables de la décennie du jour. */
    cadre.medias.forEach(m=>{
      const r = requeteIncont(m, dec);
      demandes.push(sourceDouce(tmdb('/discover/'+m, r.p))
        .then(d => ({ kind:'incont', media:m, l:(d&&d.results||[]).map(x=>normaliser(x, m)) })));
    });

    /* §3.4 rangée 8 — ce qui est lançable ce soir, sur les abonnements déclarés. */
    cadre.medias.forEach(m=>{
      const r = requetePlatesRangee(m);
      if(!r) return;
      demandes.push(sourceDouce(tmdb('/discover/'+m, r.p))
        .then(d => ({ kind:'plates', media:m, l:(d&&d.results||[]).map(x=>normaliser(x, m)) })));
    });
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

    /* L'ORDRE DE DÉPOUILLEMENT SUIT L'ORDRE D'AFFICHAGE — et c'est ce qui a
       changé avec ce lot. Le premier servi garde les titres, les suivants
       héritent du reste (`vus` est partagé). Dépouiller les sections d'abord,
       comme avant, revenait à vider « Dans l'esprit de X » de ses meilleurs
       titres au profit d'une rangée générique affichée cinq crans plus bas.
       Du plus personnel au plus générique, exactement comme le §3.4 range
       l'écran. */
    const parKind = k => rep.filter(r => r && r.kind === k);
    const recos = {};
    parKind('reco').forEach(r=>{ recos[r.cle] = r.l || []; });

    /* 2 — Ce que tes favoris ont en commun. Un titre n'entre que s'il est
       proposé par AU MOINS DEUX favoris : c'est le « en commun » du titre, et
       c'est aussi ce qui distingue cette rangée de la précédente. Un seul
       favori suffirait à en faire une deuxième « Dans l'esprit de ».

       ELLE EST DÉPOUILLÉE AVANT LA RANGÉE 1, ET C'EST LA SEULE EXCEPTION À
       L'ORDRE D'AFFICHAGE. Vérifié en le faisant dans l'autre sens : la
       rangée 2 sortait TOUJOURS vide. Ce n'est pas un hasard mais une
       nécessité — un titre du croisement est, par construction, recommandé
       par le favori n°1, donc déjà pris par « Dans l'esprit de » quelques
       lignes plus haut. Le croisement est la ressource rare (il faut deux
       favoris d'accord) ; la rangée 1 pioche dans vingt candidats et ne perd
       rien à passer en second. La règle générale — le premier servi garde les
       titres — n'est pas contredite : elle est ordonnée par la rareté quand
       deux rangées puisent au même endroit. */
    let favorisPret = null;
    if(favoris.length >= FAVORIS_MINI){
      const compte = {};
      favoris.forEach(t=>{
        const vusIci = {};
        (recos[t.media+':'+t.id] || []).forEach(x=>{
          if(!x) return;
          const k = x.media+':'+x.id;
          if(vusIci[k]) return; vusIci[k] = 1;    // un favori ne vote qu'une fois
          const e = compte[k] || (compte[k] = { n:0, x:x });
          e.n++;
        });
      });
      const croises = Object.keys(compte).map(k=>compte[k])
        .filter(e => e.n >= FAVORIS_CROISEMENT)
        .sort((a,b)=> b.n - a.n)
        .map(e => e.x);
      const l = tamiser(croises, vus, cadre, true).slice(0, SUGG_MAX);
      if(l.length) favorisPret = { l:l };
    }

    /* 1 — Dans l'esprit de X */
    let espritPret = null;
    if(esprit){
      const l = tamiser(recos[esprit.media+':'+esprit.id] || [], vus, cadre, true).slice(0, SUGG_MAX);
      if(l.length) espritPret = { titre:esprit.nom, id:esprit.id, media:esprit.media,
                                  signal:esprit.signal, famille:esprit.famille, l:l };
    }

    /* 3 — Avec [acteur] : une seule rangée, celle du mieux placé. Le classement
       se fait sur la présence dans les titres AIMÉS, comme le §3.6 le demande ;
       à défaut de 👍, sur la présence dans la bibliothèque ; à défaut encore,
       sur l'ordre de déclaration, que l'ordre de `rep` conserve. */
    const cleAime = {};
    aimes.forEach(t=>{ cleAime[t.media+':'+t.id] = 1; });
    let acteurPret = null, meilleur = -1;
    parKind('acteur').forEach(r=>{
      const brut = r.l || [];
      const presence = brut.reduce((n,x)=> n + (x && cleAime[x.media+':'+x.id] ? 1 : 0), 0);
      const secours = brut.reduce((n,x)=> n + (x && dejaChezMoi(x.media, x.id) ? 1 : 0), 0);
      const note = presence * 1000 + secours;
      if(note <= meilleur) return;
      meilleur = note;
      acteurPret = { id:r.id, titre:r.titre, brut:brut };
    });
    if(acteurPret){
      const l = tamiser(acteurPret.brut, vus, cadre, true).slice(0, SUGG_MAX);
      acteurPret = l.length ? { id:acteurPret.id, titre:acteurPret.titre, l:l } : null;
    }

    /* 4 — Des drames pour toi */
    let genrePret = null;
    if(genreT){
      const paq = parKind('genre').map(r => tamiser(r.l || [], vus, cadre, false));
      const l = entrelacerSugg(paq).slice(0, SUGG_MAX);
      if(l.length) genrePret = { nom:genreT.nom, titre:titreRangeeGenre(genreT.nom), l:l };
    }

    /* 5 — Des séries / des films / des animés pour toi */
    const sectionsPretes = [];
    parKind('section').forEach(r=>{
      const l = tamiser(r.l || [], vus, r.sec.cadre, false).slice(0, SUGG_MAX);
      if(l.length) sectionsPretes.push({ cle:r.sec.cle, titre:r.sec.titre, l:l });
    });

    /* 6 — Vu par tes proches */
    let cerclePret = null;
    parKind('cercle').forEach(r=>{
      const l = tamiser(r.l || [], vus, cadre, true).slice(0, SUGG_MAX);
      if(l.length) cerclePret = { l:l };
    });

    /* 7 — Les incontournables de la décennie du jour */
    let incontPret = null;
    {
      const paq = parKind('incont').map(r => tamiser(r.l || [], vus, cadre, false));
      const l = entrelacerSugg(paq).slice(0, SUGG_MAX);
      if(l.length) incontPret = { cle:dec.cle, titre:dec.titre, l:l };
    }

    /* 8 — Sur Netflix et Max */
    let platesPret = null;
    {
      const paq = parKind('plates').map(r => tamiser(r.l || [], vus, cadre, false));
      const l = entrelacerSugg(paq).slice(0, SUGG_MAX);
      if(l.length) platesPret = { titre:titreRangeePlates(), l:l };
    }

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

    /* §3.3 — LA PROPOSITION DU JOUR. Un seul titre, plein cadre, avec sa raison
       écrite. Elle remplace le carrousel de vedettes, qui ne disait rien de la
       personne : une seule proposition justifiée en dit plus que dix
       génériques.

       On garde une RÉSERVE et pas un titre unique, parce que « Pas pour moi »
       doit remplacer la carte immédiatement (§3.8). La réserve part de la
       source la plus légitime disponible — la rangée de cœur si elle existe,
       les incontournables sinon, ce qui est exactement l'échelle du §2.4 — et
       elle est décalée d'un cran par jour : la proposition change demain sans
       jamais bouger dans la journée (§3.9). */
    const source = espritPret ? espritPret.l : (incontPret ? incontPret.l : []);
    const raison = raisonDuJour(espritPret ? esprit : null);
    const propositions = [];
    for(let i = 0; i < Math.min(PROPOSITIONS_RESERVE, source.length); i++)
      propositions.push(Object.assign({ pourquoi:raison }, source[(jour + i) % source.length]));

    Object.assign(c, { etat:'ok', quand:Date.now(),
      propositions:propositions,
      esprit:espritPret, favoris:favorisPret, acteur:acteurPret, genre:genrePret,
      sections:sectionsPretes, cercle:cerclePret, incont:incontPret, plates:platesPret,
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
/* LE CATALOGUE DU §3.4, DANS SON ORDRE FIXE. On sait où regarder sans
   réfléchir, et l'ordre raconte quelque chose : du plus personnel au plus
   générique.

     1  Dans l'esprit de X               ≥ 1 titre 👍
     2  Ce que tes favoris ont en commun ≥ 3 titres 👍
     3  Avec [acteur]                    ≥ 1 acteur déclaré
     4  Des drames pour toi              ≥ 1 genre au-dessus du plancher
     5  Des séries / films / animés      idem
     6  Vu par tes proches               ≥ 1 proche
     7  Les incontournables des années X toujours
     8  Sur Netflix et Max               ≥ 1 plateforme déclarée
     9  Sorties récentes                 toujours
    10  Bientôt                          si non vide

   Ces conditions ne sont pas relues ici : elles ont déjà décidé, au calcul, si
   la case était remplie ou laissée à `null`. UNE CASE VIDE NE PRODUIT AUCUNE
   RANGÉE — c'est la règle « pas de plafond fixe » du §3.4 : c'est la condition
   qui règle la longueur de l'écran, pas un quota.

   Le titre de la proposition du jour est retiré de sa rangée d'origine : le
   voir en grand puis le revoir six vignettes plus bas donnerait l'impression
   que l'app se répète. */
function rangeesSuggerees(){
  suggCourantes();
  const out = [];
  const jour = propositionDuJour();
  /* DEUX RETRAITS À CHAQUE RENDU, et ils se font ici plutôt qu'au calcul :
     ils doivent se voir TOUT DE SUITE (§3.9), et refaire une vingtaine de
     requêtes à chaque « Pas pour moi » serait le prix d'un simple geste.

       · le titre montré en grand, qui n'a pas à revenir six vignettes plus
         bas — l'app aurait l'air de se répéter ;
       · ce qui a été écarté, dans TOUTES les rangées et pas seulement dans
         celle où le refus a eu lieu. `tamiser` s'en chargera au prochain
         calcul ; d'ici là, les listes en mémoire le contiennent encore. */
  const propre = l => l.filter(x=>{
    if(jour && x.media === jour.media && String(x.id) === String(jour.id)) return false;
    if(typeof estRefuseSugg === 'function' && estRefuseSugg(x.media, x.id)) return false;
    return true;
  });
  const poser = (cle, titre, l)=>{
    const liste = (typeof classerParMalus === 'function') ? classerParMalus(propre(l)) : propre(l);
    if(liste.length) out.push({ cle:cle, titre:titre, l:liste });
  };

  const s = suggestions;
  if(s.esprit && s.esprit.l.length)  poser('esprit',  'Dans l\'esprit de '+s.esprit.titre, s.esprit.l);
  if(s.favoris && s.favoris.l.length) poser('favoris','Ce que tes favoris ont en commun', s.favoris.l);
  if(s.acteur && s.acteur.l.length)  poser('acteur:'+s.acteur.id, 'Avec '+s.acteur.titre, s.acteur.l);
  if(s.genre && s.genre.l.length)    poser('genre',   s.genre.titre, s.genre.l);
  (s.sections || []).forEach(x=>{ if(x.l.length) poser(x.cle, x.titre, x.l); });
  if(s.cercle && s.cercle.l.length)  poser('cercle',  'Vu par tes proches', s.cercle.l);
  if(s.incont && s.incont.l.length)  poser('incont',  s.incont.titre, s.incont.l);
  if(s.plates && s.plates.l.length)  poser('plates',  s.plates.titre, s.plates.l);
  if((s.nouveautes || []).length)    poser('nouv',    'Sorties récentes', s.nouveautes);
  /* « Bientôt » vient après « Sorties récentes » : on lit le présent avant
     l'avenir, et une rangée vide (peu d'animés annoncés, par exemple) ne
     s'affiche tout simplement pas. */
  if((s.avenir || []).length)        poser('avenir',  'Bientôt', s.avenir);
  return out;
}

/* La proposition du jour effectivement à l'écran : le premier candidat de la
   réserve qui n'a pas été écarté. « Pas pour moi » consomme le suivant, et
   l'effet est visible tout de suite (§3.8). */
function propositionDuJour(){
  suggCourantes();
  const l = suggestions.propositions || [];
  for(let i = 0; i < l.length; i++){
    const x = l[i];
    if(typeof estRefuseSugg === 'function' && estRefuseSugg(x.media, x.id)) continue;
    if(dejaChezMoi(x.media, x.id)) continue;
    return x;
  }
  return null;
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

  /* LOT D — TROIS RANGÉES QUI NE VONT RIEN RECHERCHER, et il faut dire
     pourquoi plutôt que de laisser croire à un oubli :

       · « Ce que tes favoris ont en commun » est un CROISEMENT. Sa page 2
         n'existe pas : il faudrait redemander les trois filmographies pour
         recroiser, et le croisement d'une page 2 avec une page 2 ne donne
         presque jamais rien. On sert le croisement déjà calculé.
       · « Vu par tes proches » est bâti sur des bibliothèques finies, déjà
         lues en entier. Il n'y a pas de suite à aller chercher.
       · « Bientôt » a été bâti d'un bloc et rangé par date : redemander une
         page ramènerait des titres moins attendus dont les dates repartiraient
         en arrière, et la chronologie sauterait au milieu de la grille. */
  if(cle === 'favoris' || cle === 'cercle'){
    if(page > 1) return { titres:[], pages:1 };
    const bloc = suggCourantes()[cle === 'favoris' ? 'favoris' : 'cercle'];
    const tout = (bloc && bloc.l) || [];
    return { titres: tout.filter(x => !vus[x.media+':'+x.id]), pages:1 };
  }

  /* Le genre du jour, les incontournables et les plateformes : exactement la
     requête qui a bâti la rangée, page suivante. Les médias du cadre sont
     enchaînés et entrelacés, comme pour les nouveautés — sinon on lirait vingt
     séries avant le premier film. */
  if(cle === 'genre' || cle === 'incont' || cle === 'plates'){
    const c = suggCourantes();
    const paquets = [], totaux = [];
    for(const m of cadre.medias){
      let p = null;
      if(cle === 'genre'){
        const gid = c.genre ? genreParNom(m, c.genre.nom) : null;
        if(gid == null) continue;
        p = Object.assign({ include_adult:'false' }, triSuggestions());
        if(cadre.origine === 'anime'){
          p.with_original_language = 'ja';
          const a = genreParNom(m, 'Animation');
          p.with_genres = (a != null && a !== gid) ? [a, gid].join(',') : String(gid);
        } else p.with_genres = String(gid);
        Object.assign(p, filtreMesPlates());
      } else if(cle === 'incont'){
        const dec = DECENNIES_INCONT.find(x => x.cle === (c.incont && c.incont.cle)) || decennieVitrine();
        p = requeteIncont(m, dec).p;
      } else {
        const r = requetePlatesRangee(m);
        if(!r) continue;
        p = r.p;
      }
      p.page = String(page);
      const d = await sourceDouce(tmdb('/discover/'+m, p));
      totaux.push((d&&d.total_pages)||1);
      paquets.push(tamiser(((d&&d.results)||[]).map(x=>normaliser(x, m)), vus, cadre, false));
    }
    if(!paquets.length) return { titres:[], pages:1 };
    return { titres: entrelacerSugg(paquets), pages: Math.max.apply(null, totaux) };
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
    /* POINT 8 DES RETOURS v85 — « action, action & adventure, comédie » : le
       même genre écrit deux fois, une fois en libellé film et une fois en
       libellé série. Le dédoublonnage se fait ICI, dans la fonction qui produit
       la liste, et pas dans chaque endroit qui l'affiche : le défaut venait de
       la FUSION des familles, c'est donc la fusion qu'il faut corriger.
       `genreCanon` ramène les trois libellés de séries qui ont un équivalent
       film sur ce dernier — c'est la même table que `GENRE_SERIE`, lue à
       l'envers. */
    const fondus = [];
    parFamille.forEach(f=>f.genres.forEach(n=>{
      const c = (typeof genreCanon === 'function') ? genreCanon(n) : n;
      if(fondus.indexOf(c) < 0) fondus.push(c);
    }));
    return { volume: volume, genres: fondus.slice(0, 3),
             aDire: fondus.length > 0 || volume.series > 0 || volume.films > 0 };
  }
  /* LOT A — le nom de tête de chaque famille classée. On ne nomme que ce qui
     vient d'un duel joué : un titre simplement aimé n'est pas « préféré », et
     l'app ne doit jamais prétendre en savoir plus qu'elle n'en sait. */
  const podium = [];
  DUEL_FAMILLES.forEach(f=>{
    const id = (((db.podium||{})[f.cle]) || [])[0];
    if(!id) return;
    /* Le podium ne garde que des identifiants nus, et les espaces d'identifiants
       TMDB des séries et des films se recouvrent : 550 est Fight Club côté film
       ET un identifiant de série valide. On interroge donc la bonne collection
       en premier, selon la famille — sinon « Tes préférés » nomme un titre qui
       n'a jamais été départagé. */
    const media = f.cle === 'film' ? 'movie' : 'tv';
    const o = (media === 'movie' ? db.movies[id] : db.shows[id]) ||
              db.shows[id] || db.movies[id];
    const nom = (o && (media === 'movie' ? (o.title || o.name) : (o.name || o.title))) ||
      (((g.graines||[]).find(x=> String(x.id) === String(id) && x.media === media) || {}).nom);
    if(nom) podium.push(nom);
  });
  const compter = v => ['tv','movie'].reduce((n,m)=>
    n + Object.keys((db.avis && db.avis[m]) || {}).filter(id => avisDe(m, id) === v).length, 0);
  return {
    manuels: manuels,
    parFamille: parFamille,
    volume: volume,
    aimes: compter(1),
    pasAimes: compter(-1),
    podium: podium,
    acteurs: (g.acteurs||[]).map(a=>a.nom),
    exclus: (g.exclus||[]).slice(),
    origine: manuels
      ? 'Tu as choisi ces genres toi-même : ils passent avant ce que je devine.'
      : (parFamille.length
          ? 'Calculés séparément pour chaque famille, d\'après tout ce que tu as regardé.'
          : 'Rien à déduire pour l\'instant : coche quelques épisodes.')
  };
}

/* ===========================================================================
   LOT A — LA BARRE « TU AS AIMÉ ? » (§1.3)

   Une seule barre, au format et à l'emplacement de la barre « Annuler ». Elle
   porte le FAIT, formulé comme un moment et non comme une transaction, la
   question en sous-titre, deux cibles, et une croix.

   Elle NE contient PAS de bouton « Annuler ». C'était le point le plus discuté :
   trois actions dans un mouchoir de poche, dont une destructrice, et « Annuler »
   qui perd le premier rôle alors qu'il est le plus urgent. Les deux se suivent
   donc au lieu de se mélanger — voir `filerAvis`.

   Ne pas répondre est une réponse valide : la barre s'efface seule et le titre
   reste non qualifié. Mais la sortie doit être VISIBLE : sans porte de sortie
   explicite, on apprend à ignorer la barre — y compris quand elle sert à autre
   chose.
=========================================================================== */

/* Plus long que les 10 s de la barre « Annuler » : celle-ci ne court pas après
   un regret, elle attend une réponse, et on lit avant de répondre. */
const AVIS_DUREE = 12000;
let avisAffiche = null;        // { media, id, fait } en ce moment à l'écran
/* UNE FILE, pas une seule place. Terminer une saison par un geste groupé met la
   question derrière la barre « Annuler » ; marquer un film vu pendant ces dix
   secondes écrasait purement et simplement la première question, qui n'était
   alors jamais posée. Deux titres, deux questions, l'une après l'autre. */
let avisEnFile = [];
let avisTimer = null;

/* La couche est créée à la volée plutôt que posée dans `index.html`, pour la
   même raison que le lecteur vidéo : le service worker garde la page en cache,
   et une page en retard d'une version se retrouverait sans l'emplacement
   attendu par le script. */
function coucheAvis(){
  let el = document.getElementById('barreavis');
  if(!el){
    el = document.createElement('div');
    el.id = 'barreavis'; el.className = 'barreavis';
    document.body.appendChild(el);
  }
  return el;
}

/* Le point d'entrée unique. Deux refus, tous deux volontaires :
   · un titre qui porte déjà un avis ne se redemande pas — la personne a
     répondu, la relancer à chaque fin de saison serait du harcèlement, et son
     avis reste modifiable dans Mes goûts ;
   · une barre « Annuler » occupe la place : on prend la file. Annuler reste
     Annuler, et la question ne pollue pas un geste qu'on est peut-être en train
     de regretter. */
function proposerAvis(media, id, fait){
  if(!id || !fait) return;
  if(avisDe(media, id) !== 0) return;
  const p = { media:media, id:String(id), fait:fait };
  if(avisEnFile.some(x => x.media === p.media && x.id === p.id)) return;
  if(typeof undoData !== 'undefined' && undoData){ avisEnFile.push(p); return; }
  montrerAvis(p);
}
/* La barre « Annuler » vient de partir sans avoir été utilisée : la question
   prend sa place. Appelée par `hideUndo`. */
function filerAvis(){
  const p = avisEnFile.shift();
  if(p) montrerAvis(p);
}
/* Une action groupée vient d'être annulée : la saison n'est plus terminée, il
   n'y a plus rien à demander SUR CE TITRE. Sur les autres, si — annuler le
   cochage d'une saison de Breaking Bad ne doit pas faire disparaître la
   question posée sur le film marqué vu trente secondes plus tôt.
   Appelée par `doUndo`, qui sait quelle série il vient de remettre en état. */
function annulerFileAvis(media, id){
  if(media == null){ avisEnFile = []; return; }
  const c = String(id);
  avisEnFile = avisEnFile.filter(x => !(x.media === media && x.id === c));
  if(avisAffiche && avisAffiche.media === media && avisAffiche.id === c) fermerAvis();
}
/* Une barre « Annuler » vient d'apparaître. Les deux occupent EXACTEMENT le même
   emplacement, et la question, posée au-dessus, offrait ses pouces là où le
   doigt visait « Annuler » : on croyait annuler une saison, on posait un 👍 sur
   un film. La question recule donc dans la file, et revient quand la place est
   libre. Appelée par `pushUndo`. */
function reculerAvis(){
  if(!avisAffiche) return;
  avisEnFile.unshift(avisAffiche);
  fermerAvis();
}

function montrerAvis(p){
  if(avisDe(p.media, p.id) !== 0) return;   // répondu entre-temps, d'un autre écran
  /* Le toast occupe le même bas d'écran, avec un z-index plus fort : « Marqué
     comme vu ✓ » recouvrait pendant deux secondes le fait et le pouce 👎 de la
     question qu'il venait lui-même de déclencher. La barre dit mieux la même
     chose — le toast s'efface. */
  if(typeof cacherToast === 'function') cacherToast();
  avisAffiche = p;
  const el = coucheAvis();
  el.innerHTML =
    '<div class="bacol"><span>'+esc(p.fait)+'</span><small>Tu as aimé&nbsp;?</small></div>'+
    '<div class="bapouces">'+
      '<button class="bapouce non" aria-label="Je n\'ai pas aimé" '+
        'onclick="repondreAvis(-1)">👎</button>'+
      '<button class="bapouce oui" aria-label="J\'ai aimé" '+
        'onclick="repondreAvis(1)">👍</button>'+
    '</div>'+
    '<button class="bacroix" aria-label="Fermer sans répondre" '+
      'onclick="fermerAvis()">'+I.close+'</button>';
  el.classList.add('show');
  document.body.classList.add('avis');
  clearTimeout(avisTimer);
  avisTimer = setTimeout(fermerAvis, AVIS_DUREE);
}
function fermerAvis(){
  clearTimeout(avisTimer);
  const el = document.getElementById('barreavis');
  if(el) el.classList.remove('show');
  document.body.classList.remove('avis');
  avisAffiche = null;
}
function repondreAvis(v){
  const p = avisAffiche;
  if(!p) return;
  fermerAvis();
  poserAvis(p.media, p.id, v);
  /* Un message court, et qui dit à quoi ça sert. « Enregistré » n'apprend
     rien ; ce qui donne envie de recommencer, c'est de voir que ça compte. */
  toast(v === 1 ? '👍 Noté — ça guidera tes suggestions'
                : '👎 Noté — on t\'en proposera moins comme ça');
  if(typeof render === 'function') render();
}

/* ---------- Les deux déclenchements (§1.3) ---------- */

/* Les saisons intégralement vues, hors-série exclus. Les hors-série ne sont pas
   une saison : les compter ferait poser la question au mauvais moment, et ne
   pas les compter ne prive de rien. */
function saisonsFinies(sh){
  const out = {};
  if(!sh) return out;
  seasonNums(sh, false).forEach(n=>{
    const eps = (sh.seasons[n] || []).filter(aired);
    if(eps.length && eps.every(ep => sh.watched[key(n, ep.e)])) out[n] = 1;
  });
  return out;
}

/* À LA FIN D'UNE SAISON, jamais sur un épisode isolé. Un épisode ne dit rien —
   et la question, posée à chaque coche, deviendrait le bruit de fond de l'app.
   Appelée par `applyWatched`, qui est le passage unique de toute modification
   des épisodes vus : un seul point d'accroche, donc aucun chemin oublié. */
function signalerSaisonsFinies(sh, avant, apres){
  const neuves = Object.keys(apres).filter(n => !avant[n]).map(Number);
  if(!neuves.length) return;
  const derniere = Math.max.apply(null, neuves);
  /* Sans guillemets : la ligne ne fait qu'une hauteur et tronque au-delà d'une
     vingtaine de caractères, or « … » en coûte quatre pour rien. */
  const fait = isFinished(sh)
    ? sh.name+', terminée 🎉'
    : sh.name+', saison '+derniere+' terminée 🎉';
  proposerAvis('tv', sh.id, fait);
}

/* À CHAQUE FILM MARQUÉ VU. Un film est binaire : il n'y a pas d'autre moment
   où poser la question, et pas de raison de la reporter. */
function signalerFilmVu(id){
  const m = db.movies[id];
  if(!m || !m.seen) return;
  proposerAvis('movie', id, m.title+', vu 🎉');
}

/* ===========================================================================
   LOT A — LE DUEL (§1.5)

   Comparer est beaucoup plus facile que juger dans l'absolu. « Est-ce que j'ai
   aimé Ozark ? » n'a pas de réponse nette ; « Ozark ou Breaking Bad ? » se
   tranche en une seconde.

   Cinq règles, toutes actées, toutes implémentées ici :
     1. même famille — film contre film, série contre série, animé contre animé ;
     2. adversaires CHOISIS, pas tirés au hasard : on apprend quand c'est serré ;
     3. session courte et bornée — dix duels, jamais de puits sans fond ;
     4. une sortie honnête — « Je ne sais pas / les deux » ;
     5. ça finit TOUJOURS par un résultat, et la boucle se ferme dans la session.

   Et deux garde-fous : un titre mal classé ne devient jamais un 👎, et un 👎
   doit pouvoir être repris (liste « Écartés », plus bas).
=========================================================================== */

const DUEL_TAILLE = 10;      // dix duels, ~40 secondes
const DUEL_MINI = 10;        // une famille s'ouvre à partir de dix titres éligibles
const DUEL_ALEA = 3;         // les premiers duels au hasard, faute de repères
const DUEL_VOISINS = 4;      // parmi combien de rangs voisins on cherche l'adversaire
const RATTRAPAGE_MAX = 10;   // une dizaine de lignes, jamais cent

/* ---------------------------------------------------------------------------
   R1 · point 11 — LE CLASSEMENT GLOBAL ET PERMANENT

   Avant : les scores de duel étaient JETÉS à la fin de chaque partie, et seuls
   dix identifiants survivaient — puis revenaient sous forme de bonus de départ
   (`1000 + (rang.length − i) × 12`). Le n°1 sortant démarrait 120 points devant
   un titre jamais classé, et avec K = 32 il fallait trois victoires directes
   pour le déloger. Comme l'appariement ne confrontait que des voisins de
   classement, ces trois rencontres n'arrivaient jamais. On jetait le travail et
   on gardait le résultat : le podium ne pouvait mécaniquement plus bouger.

   Maintenant : chaque titre porte SON score, en permanence, dans
   `db.classement`. Une partie ne recommence plus à zéro, elle continue. Et
   `db.podium` — que beaucoup de code lit — n'est plus la source de vérité mais
   une PROJECTION, recalculée à la fin de chaque partie. Sa forme, son nom et
   son contenu attendu ne changent pas d'un caractère.
--------------------------------------------------------------------------- */
const DUEL_SCORE0 = 1000;    // score d'un titre jamais rencontré
const DUEL_K = 32;           // le K de l'Elo, inchangé
/* Un titre est CLASSÉ dès son premier duel, mais n'entre au podium qu'à partir
   de trois confrontations : sans ce seuil, un titre qui a gagné une fois par
   chance coifferait un titre qui a gagné quinze fois. */
const DUEL_MINI_N = 3;
/* Sur les dix duels d'une session, au moins quatre opposent un titre jamais
   joué à un titre déjà présent au podium. Un classement global ne bouge que sur
   ce qui est joué : sans cette règle, on aurait immobilisé le classement plus
   proprement, c'est tout. */
const DUEL_NEUFS = 4;

/* La famille du classement, créée à la demande. `reparerBase` la crée déjà au
   démarrage ; ce garde couvre une base arrivée d'ailleurs entre-temps. */
function classementFamille(fam){
  if(!db.classement || typeof db.classement !== 'object')
    db.classement = { film:{}, serie:{}, anime:{}, maj:0 };
  if(!db.classement[fam] || typeof db.classement[fam] !== 'object') db.classement[fam] = {};
  return db.classement[fam];
}
function scoreClassement(fam, id){
  const e = classementFamille(fam)[String(id)];
  return e && typeof e.s === 'number' ? e.s : DUEL_SCORE0;
}
function duelsJoues(fam, id){
  const e = classementFamille(fam)[String(id)];
  return e && typeof e.n === 'number' ? e.n : 0;
}
function ecrireClassement(fam, id, s, n){
  classementFamille(fam)[String(id)] = { s:s, n:n };
  db.classement.maj = Date.now();
}
/* LA PROJECTION. `db.podium` garde exactement la forme qu'il a toujours eue —
   au plus dix identifiants par famille, du meilleur au moins bon — mais il est
   désormais DÉDUIT du classement au lieu d'être entretenu à la main. C'est ce
   qui le garde juste sans que les rangées de Découvrir, les suggestions ni le
   point de départ du jeu de Recherche aient à changer d'une ligne.
   L'égalité de score se départage sur l'identifiant : un podium doit être le
   même sur les deux téléphones, y compris quand deux titres se valent. */
function classementTrie(fam){
  const c = classementFamille(fam);
  return Object.keys(c)
    .filter(id => (c[id] && c[id].n || 0) >= DUEL_MINI_N)
    .sort((x,y)=> (c[y].s - c[x].s) || (x < y ? -1 : x > y ? 1 : 0));
}
/* LE SEUIL COMMANDE L'ENTRÉE AU PODIUM, JAMAIS LA SORTIE.
   Première écriture de cette fonction : elle remplaçait le podium par la seule
   projection. Conséquence, trouvée à la relecture et rejouée sur la vraie base
   d'Adrien : le classement démarrant vide, aucun titre n'atteint trois duels
   avant plusieurs parties — la projection rendait donc une liste presque vide
   QUI ÉCRASAIT UN PODIUM DE DIX TITRES. Une seule partie et l'app se croyait
   revenue au premier jour ; il fallait une quinzaine de parties pour revenir à
   dix. On aurait corrigé l'immobilité du podium en le vidant.
   Donc : on complète la projection avec les identifiants de l'ancien podium
   encore absents, dans leur ordre, jusqu'à dix. Un titre entre au podium quand
   il a joué ses trois duels ; il n'en sort que poussé dehors par un meilleur.
   Le podium ne rétrécit jamais — c'est aussi ce que la fusion entre deux
   appareils suppose pour lire une famille vide comme « rien joué ici ». */
function projeterPodium(fam){
  db.podium = db.podium || {};
  const ancien = Array.isArray(db.podium[fam]) ? db.podium[fam].map(String) : [];
  const neuf = classementTrie(fam).slice(0, PODIUM_MAX);
  const deja = {};
  neuf.forEach(id=>{ deja[id] = 1; });
  for(const id of ancien){
    if(neuf.length >= PODIUM_MAX) break;
    if(deja[id]) continue;
    deja[id] = 1; neuf.push(id);
  }
  db.podium[fam] = neuf;
  db.podium.maj = Date.now();
}

const DUEL_FAMILLES = [
  { cle:'film',  nom:'films',  titre:'Départage tes films'  },
  { cle:'serie', nom:'séries', titre:'Départage tes séries' },
  { cle:'anime', nom:'animés', titre:'Départage tes animés' }
];
/* `vus` — les titres réellement APPARUS dans les paires de la session, dans
   l'ordre où ils sont passés à l'écran. C'est la matière de « Encore une
   chose » (point 12) : le paquet entier ne dit pas ce qu'on a vu.
   `neufs` — combien de duels « titre jamais joué contre titre du podium » ont
   déjà été servis (point 11, règle 3). */
const DUEL_VIDE = { actif:false, famille:null, paquet:[], scores:{}, joues:{},
                    faits:0, paire:null, choix:null, ecran:'jeu',
                    classe:[], sugg:null, rattrapage:[], vus:[], neufs:0,
                    podiumPret:false, tete:null };
let duel = Object.assign({}, DUEL_VIDE);

/* QUI ENTRE DANS LE JEU. Un titre vu y entre, qu'il porte un 👍 ou rien du
   tout — c'est justement ce qu'on cherche à départager. Un titre ajouté et
   jamais ouvert reste dans « à voir un jour » : il n'a rien à dire. Un titre
   👎 sort du jeu : aucune suggestion ne sera bâtie dessus, le classer serait du
   temps perdu.
   Les graines de la grille d'amorçage en font partie : ce sont des titres
   déclarés aimés, et sans elles quelqu'un qui vient de s'inscrire n'aurait
   jamais assez de matière pour jouer. */
function titresEligiblesDuel(famille){
  const pasVus = (db.gouts && db.gouts.pasVus) || [];
  const recuse = c => pasVus.indexOf(c) >= 0;
  const out = [], deja = {};
  titresVus(famille).forEach(t=>{
    const c = t.media+':'+t.id;
    if(avisDe(t.media, t.id) === -1 || recuse(c)) return;
    deja[c] = 1; out.push(t);
  });
  ((db.gouts && db.gouts.graines) || []).forEach(g=>{
    const fam = g.famille || (g.media === 'movie' ? 'film' : 'serie');
    if(famille && fam !== famille) return;
    const c = g.media+':'+g.id;
    if(deja[c] || recuse(c) || avisDe(g.media, g.id) === -1) return;
    deja[c] = 1;
    out.push({ media:g.media, id:String(g.id), nom:g.nom || 'Sans titre', famille:fam,
               genres:[], affiche:null, date:null, fini:false, part:0, graine:true });
  });
  return out;
}

/* LE JEU NE PROPOSE QUE LES FAMILLES PRÊTES. Quarante films et six animés :
   on départage les films, pas les animés. En dessous de dix titres, un podium
   ne veut rien dire — on classerait ce qu'on a, pas ce qu'on préfère. */
function famillesDuel(){
  return DUEL_FAMILLES.filter(f => titresEligiblesDuel(f.cle).length >= DUEL_MINI);
}
function duelDisponible(){ return famillesDuel().length > 0; }

/* « 4 nouveaux titres à départager », jamais « viens jouer ». Le duel revient
   quand il a de la matière, et l'invitation le DIT : ce qui n'a pas encore été
   classé et sur quoi rien n'a été déclaré. Zéro nouveau titre = aucune raison
   de relancer, et l'app ne prétend pas le contraire. */
function nouveauxADepartager(famille){
  const rang = ((db.podium || {})[famille] || []).map(String);
  return titresEligiblesDuel(famille)
    .filter(t => rang.indexOf(String(t.id)) < 0 && !aAime(t.media, t.id)).length;
}

const cleDuel = t => t.media+':'+t.id;

function ouvrirDuel(famille){
  const paquet = titresEligiblesDuel(famille);
  if(paquet.length < DUEL_MINI)
    return toast('Il faut une dizaine de titres vus pour départager');
  /* R1 · point 11 — LE SCORE VIENT DU CLASSEMENT, PLUS DU PODIUM.
     Le bonus de départ reconstruit depuis le podium a disparu, et avec lui le
     petit bonus de 25 points d'un 👍 : le contrat de données ne connaît qu'un
     score de départ, 1000, pour un titre jamais rencontré. Une session ne
     recommence plus à zéro, elle reprend là où la précédente s'est arrêtée. */
  const scores = {};
  paquet.forEach(t=>{ scores[cleDuel(t)] = scoreClassement(famille, t.id); });
  duel = Object.assign({}, DUEL_VIDE,
    { actif:true, famille:famille, paquet:paquet, scores:scores, joues:{},
      faits:0, ecran:'jeu', classe:[], sugg:null, rattrapage:[], vus:[], neufs:0 });
  duelSuivant();
  if(view !== 'gouts') go('gouts', { from: view });
  else render();
}

function fermerDuel(){
  oublierDuel();
  render();
}
/* Range la session sans rien redessiner. Appelée par `go()` dès qu'on quitte
   Mes goûts : la barre du bas reste atteignable pendant une partie, et un duel
   laissé actif après un changement d'onglet empoisonnait toute l'app — le
   premier appui sur « retour » était mangé par `goBack`, le geste de bord
   restait désarmé partout, et revenir dans Mes goûts rouvrait l'arène au lieu
   de l'écran. Le podium, lui, est déjà enregistré : on ne perd rien d'acquis. */
function oublierDuel(){ duel = Object.assign({}, DUEL_VIDE); }

/* ADVERSAIRES CHOISIS, PAS TIRÉS AU HASARD. Les premiers duels au hasard —
   on n'a aucun repère — puis on fait s'affronter les titres qui se tiennent :
   c'est là que l'information est, un écart de dix places n'apprend rien.
   Le départ est pris à un rang quelconque et non toujours en tête : sinon les
   dix duels d'une session ne parleraient jamais que des dix meilleurs. */
/* R1 · point 11, règle 3 — UNE PAIRE « NEUF CONTRE PODIUM ».
   Un titre jamais joué (`n = 0`) contre un titre déjà présent au podium. C'est
   la seule façon qu'un nouveau venu a de rencontrer le haut du classement :
   laissé à l'appariement par voisinage, il ne croiserait que d'autres inconnus.
   `nouveauxADepartager` savait déjà compter les titres neufs ; l'information
   existait, elle n'était simplement pas utilisée pour composer les paires.
   Rend `null` si l'un des deux camps est vide — on n'invente rien. */
function paireNeuveDuel(marque){
  const fam = duel.famille;
  const pod = ((db.podium || {})[fam] || []).map(String);
  const neufs = duel.paquet.filter(t => duelsJoues(fam, t.id) === 0);
  const tetes = duel.paquet.filter(t => pod.indexOf(String(t.id)) >= 0);
  if(!neufs.length || !tetes.length) return null;
  const melange = l => l.slice().sort(()=> Math.random() - 0.5);
  for(const a of melange(neufs))
    for(const b of melange(tetes))
      if(cleDuel(a) !== cleDuel(b) && !duel.joues[marque(a, b)]) return [a, b];
  return null;
}

function duelSuivant(){
  duel.choix = null;
  if(duel.faits >= DUEL_TAILLE || duel.paquet.length < 2) return terminerDuel();
  const p = duel.paquet;
  const marque = (a,b)=>{
    const x = cleDuel(a), y = cleDuel(b);
    return x < y ? x+'|'+y : y+'|'+x;
  };
  let a = null, b = null, neuve = false;
  /* Un duel sur deux est réservé au neuf — soit quatre sur dix, le minimum de
     la règle 3 — et si la fin de session approche sans qu'ils aient tous été
     servis, ils passent devant tout le reste. Les intercaler plutôt que de les
     mettre en bloc au début garde la partie variée. */
  const dus = DUEL_NEUFS - duel.neufs;
  if(dus > 0 && (duel.faits % 2 === 0 || dus >= DUEL_TAILLE - duel.faits)){
    const pr = paireNeuveDuel(marque);
    if(pr){ a = pr[0]; b = pr[1]; neuve = true; }
  }
  if(!b && duel.faits < DUEL_ALEA){
    for(let essai = 0; essai < 40 && !b; essai++){
      const i = Math.floor(Math.random() * p.length);
      let j = Math.floor(Math.random() * p.length);
      if(j === i) j = (i + 1) % p.length;
      if(!duel.joues[marque(p[i], p[j])]){ a = p[i]; b = p[j]; }
    }
  }
  if(!b){
    const tri = p.slice().sort((x,y)=> duel.scores[cleDuel(y)] - duel.scores[cleDuel(x)]);
    const departs = tri.map((t,i)=>i).sort(()=> Math.random() - 0.5);
    for(const i of departs){
      for(let j = i + 1; j < Math.min(tri.length, i + 1 + DUEL_VOISINS); j++){
        if(!duel.joues[marque(tri[i], tri[j])]){ a = tri[i]; b = tri[j]; break; }
      }
      if(b) break;
    }
    /* Tous les voisinages épuisés : on prend n'importe quelle paire encore
       vierge plutôt que d'arrêter la session sur une impasse. */
    if(!b) for(let i = 0; i < tri.length - 1 && !b; i++)
      for(let j = i + 1; j < tri.length && !b; j++)
        if(!duel.joues[marque(tri[i], tri[j])]){ a = tri[i]; b = tri[j]; }
  }
  if(!b) return terminerDuel();                 // plus rien à départager
  duel.joues[marque(a, b)] = 1;
  duel.paire = [a, b];
  if(neuve) duel.neufs++;
  /* R1 · point 12 — on note ce qui est PASSÉ À L'ÉCRAN, dans l'ordre. C'est ce
     qui permettra à « Encore une chose » de ne parler que du duel qu'on vient
     de finir, au lieu de repartir dans toute la bibliothèque. */
  duel.vus.push(a, b);
}

/* Le tap sur une affiche EST le vote : c'est le geste principal, il ne partage
   rien avec autre chose. Le temps d'arrêt avant le duel suivant n'est pas
   décoratif — sans lui, on ne voit pas ce qu'on vient de choisir, et on doute. */
function duelVote(i){
  if(!duel.actif || !duel.paire || duel.choix) return;
  duel.choix = cleDuel(duel.paire[i]);
  render();
  setTimeout(()=> appliquerVote(i), 320);
}
function appliquerVote(i){
  if(!duel.actif || !duel.paire) return;
  const g = duel.paire[i], p = duel.paire[1 - i];
  const kg = cleDuel(g), kp = cleDuel(p);
  /* Un classement par confrontations, à la manière des échecs : battre un titre
     bien placé rapporte plus que battre un titre déjà relégué. C'est ce qui
     permet de trouver le sommet en une dizaine de duels au lieu des centaines
     qu'un tri complet demanderait. */
  const K = DUEL_K;
  const attendu = 1 / (1 + Math.pow(10, (duel.scores[kp] - duel.scores[kg]) / 400));
  duel.scores[kg] += K * (1 - attendu);
  duel.scores[kp] -= K * (1 - attendu);
  /* R1 · point 11, règle 1 — LE SCORE SURVIT À LA PARTIE. On écrit duel par
     duel, et non à la fin : une session abandonnée en cours de route garde ce
     qu'elle a appris, et c'est aussi ce qui compte les confrontations. */
  ecrireClassement(duel.famille, g.id, duel.scores[kg], duelsJoues(duel.famille, g.id) + 1);
  ecrireClassement(duel.famille, p.id, duel.scores[kp], duelsJoues(duel.famille, p.id) + 1);
  /* Enregistré tout de suite — `saveDB` est déjà différé de 150 ms, donc dix
     duels d'affilée ne coûtent pas dix écritures. Sans cet appel, une session
     quittée en cours de route (changement d'onglet, app fermée par iOS) perdait
     tout ce qu'elle avait appris, et on aurait réinstallé exactement le défaut
     qu'on vient de corriger : jeter le travail. */
  saveDB();
  /* §1.7, L'EXCEPTION. Un titre non noté qui bat un titre 👍 passe à 👍 : la
     personne vient de déclarer qu'elle le préfère à quelque chose qu'elle aime.
     C'est une déclaration explicite, pas une déduction — et c'est exactement ce
     que la pastille « 👍 déjà aimé » rend visible sur la carte adverse. */
  if(avisDe(g.media, g.id) === 0 && aAime(p.media, p.id)) poserAvis(g.media, g.id, 1);
  /* LE GARDE-FOU, et il n'y a rien à écrire pour l'obtenir : le perdant ne
     devient JAMAIS un 👎. Finir dernier parmi quarante titres aimés n'est pas
     un rejet. Le duel donne l'ordre, jamais le signe. */
  duel.faits++;
  duelSuivant();
  render();
}
/* UNE SORTIE HONNÊTE. Sans elle, on tranche au hasard et on pollue son propre
   classement — un classement faux vaut moins que pas de classement du tout.
   Le duel est compté comme joué : la session reste bornée à dix. */
function duelPasse(){
  if(!duel.actif || duel.choix) return;
  duel.faits++;
  duelSuivant();
  render();
}
/* « Je ne l'ai pas vu ». Le paquet vient de titres SUPPOSÉS vus — la grille
   d'inscription et la bibliothèque — et ces deux sources contiennent forcément
   des erreurs. Le titre sort du paquet, pour cette session et pour les
   suivantes : sans mémoire, il faudrait le récuser à chaque fois.
   Ce n'est pas un avis : ça ne dit rien du goût, seulement que la bibliothèque
   se trompe. Le duel n'est donc pas compté. */
function duelPasVu(media, id){
  if(typeof closeSheet === 'function') closeSheet();
  const c = media+':'+String(id);
  duel.paquet = duel.paquet.filter(t => cleDuel(t) !== c);
  db.gouts.pasVus = db.gouts.pasVus || [];
  if(db.gouts.pasVus.indexOf(c) < 0) db.gouts.pasVus.push(c);
  /* Une graine posée par erreur sur la grille d'amorçage se retire pour de bon :
     elle nourrissait les suggestions sur la foi d'un titre jamais vu.

     À REPRENDRE DANS UN LOT SUIVANT. C'est le seul endroit du lot où une
     déclaration de la personne est DÉTRUITE sans retour possible, alors que le
     lot s'impose partout ailleurs la règle inverse : un 👎 se reprend depuis la
     liste « Titres écartés » de Mes goûts. « Je ne l'ai pas vu » devra faire
     pareil — renvoyer le titre dans cette liste plutôt que l'effacer — pour que
     le bouton du milieu, juste sous « C'est celui-là », cesse d'être le seul
     geste irréversible de l'app. Laissé tel quel sciemment : la correction
     demande un écran, pas une retouche. */
  const gr = (db.gouts && db.gouts.graines) || [];
  const i = gr.findIndex(x => x.media === media && String(x.id) === String(id));
  if(i >= 0){ gr.splice(i, 1); if(typeof oublierSuggestions === 'function') oublierSuggestions(); }
  toucheGouts();
  duelSuivant();
  render();
}

/* ÇA FINIT TOUJOURS PAR UN RÉSULTAT. Une session de tri sans récompense
   immédiate n'est jouée qu'une fois. */
function terminerDuel(){
  if(!duel.actif) return;
  duel.paire = null; duel.choix = null;
  /* R1 · point 11, règle 4 — LE PODIUM EST RECALCULÉ, PAS ÉCRIT.
     Les titres de la famille, triés par score décroissant, filtrés sur trois
     duels joués au moins, coupés à dix. Tout le reste de l'app continue de lire
     `db.podium` sans savoir que sa nature a changé. */
  const fam = duel.famille;
  projeterPodium(fam);
  /* Ce que l'écran de résultat montre, c'est le haut du CLASSEMENT — le vrai
     podium, celui qui vient d'être enregistré. Tant qu'aucun titre n'a atteint
     ses trois duels, il est vide : on montre alors l'ordre de la session, qui
     est ce que la personne vient réellement de faire. La phrase du bas dit
     laquelle des deux choses elle est en train de lire. */
  const parId = {};
  titresEligiblesDuel(fam).forEach(t=>{ parId[String(t.id)] = t; });
  duel.paquet.forEach(t=>{ parId[String(t.id)] = t; });
  duel.classe = db.podium[fam].map(id => parId[id]).filter(Boolean);
  duel.podiumPret = duel.classe.length > 0;
  if(!duel.classe.length)
    duel.classe = duel.paquet.slice()
      .sort((a,b)=> duel.scores[cleDuel(b)] - duel.scores[cleDuel(a)]);
  /* R1 · point 2 de la relecture — NE RIEN PROMETTRE QU'ON NE TIENDRA PAS.
     L'écran de résultat annonçait « X devient ton point de départ, la rangée
     "Dans l'esprit de X" remplace la rotation au hasard ». Ce n'était vrai que
     si X est BIEN le titre dont la rangée part. Deux cas où ça ne l'était pas :
     le podium encore vide (on nommait alors le premier de la session), et une
     famille jouée alors qu'une autre porte déjà un podium — `departJeuRech`
     prend le premier podium non vide dans l'ordre films, séries, animés, pas
     celui qu'on vient de jouer.
     On demande donc directement à la fonction qui alimente la rangée quel titre
     elle retiendra, et on ne promet que s'il s'agit du nôtre. Lecture seule :
     rien n'est modifié dans `app-12-recherche.js`, hors de ce lot. */
  duel.tete = null;
  if(duel.podiumPret){
    const numeroUn = String((db.podium[fam] || [])[0] || '');
    const depart = (typeof departJeuRech === 'function') ? departJeuRech() : null;
    if(depart && String(depart.id) === numeroUn) duel.tete = parId[numeroUn] || null;
  }
  duel.ecran = 'resultat';
  apresAvis();                      // enregistre, et périme la vitrine
  chargerSuggDuel(duel.tete);
  render();
}

/* LA BOUCLE SE FERME DANS LA SESSION : cinq titres à découvrir, recalculés à
   partir du nouveau numéro un. C'est la preuve que l'effort a changé quelque
   chose, tout de suite — et c'est ça qui donne envie de rejouer. */
async function chargerSuggDuel(tete){
  if(!tete){ duel.sugg = []; return; }
  duel.sugg = 'attente';
  try{
    const d = await tmdb('/'+tete.media+'/'+tete.id+'/recommendations');
    duel.sugg = ((d && d.results) || [])
      .map(x => normaliser(x, tete.media))
      .filter(x => x && !dejaChezMoi(x.media, x.id))
      .slice(0, 5);
  }catch(e){ duel.sugg = []; }      // une source muette vaut mieux qu'un écran bloqué
  if(view === 'gouts' && duel.actif) render();
}

function rejouerDuel(){ ouvrirDuel(duel.famille); }

/* ---------------------------------------------------------------------------
   LA LISTE DE RATTRAPAGE (§1.6)

   Le duel vient de mettre la personne en mode « je juge » : c'est là qu'elle
   est le plus disposée à enchaîner. Et surtout, le duel ne saura JAMAIS dire
   « celui-là, je l'ai détesté » — il ne fait que classer. La liste complète ce
   trou. Le duel donne l'ordre, la liste donne le signe.

   La liste est figée à l'entrée : répondre ne doit pas faire disparaître la
   ligne sous le doigt ni décaler les suivantes.
--------------------------------------------------------------------------- */
/* R1 · point 12 — SEULEMENT LE DUEL QUI VIENT DE FINIR.
   La liste prenait le paquet PUIS toute la bibliothèque. Un titre départagé à
   l'écran précédent revenait en tête avec « tu l'as aimé ? » — « je viens de te
   répondre, et tu me redemandes » — et le reste (Yu-Gi-Oh, Naruto, Death Note…)
   n'avait été vu nulle part dans la session : rien ne reliait l'écran au duel.
   L'intention était pourtant juste, et elle est écrite dans le code : le duel
   donne un ORDRE, jamais un SIGNE. C'est sa présentation qui échouait.
   Désormais : les titres réellement apparus dans les paires, les derniers vus
   en haut, sans ceux qui portent déjà un 👍 ou un 👎. */
function titresARattraper(){
  /* Un titre récusé pendant la partie (« Je ne l'ai pas vu ») est sorti du
     paquet ; il n'a rien à faire ici non plus. Demander « tu l'as aimé ? » à
     quelqu'un qui vient de dire qu'il ne l'a pas vu est la même faute que celle
     que le point 12 corrige, à un écran de distance. */
  const recuse = (db.gouts && db.gouts.pasVus) || [];
  const vus = {}, out = [];
  for(let i = (duel.vus || []).length - 1; i >= 0; i--){
    const t = duel.vus[i], c = cleDuel(t);
    if(vus[c] || recuse.indexOf(c) >= 0 || avisDe(t.media, t.id) !== 0) continue;
    vus[c] = 1; out.push(t);
  }
  return out.slice(0, RATTRAPAGE_MAX);
}
function ouvrirRattrapage(){
  duel.rattrapage = titresARattraper();
  /* LISTE VIDE ⇒ ÉCRAN SAUTÉ. Un écran qui ne demande rien ne s'affiche pas.
     Le bouton du résultat dit déjà « Terminer » dans ce cas (`ecranDuelResultat`) ;
     ce garde couvre le chemin par lequel on arriverait quand même ici. */
  if(!duel.rattrapage.length) return fermerDuel();
  duel.ecran = 'rattrapage';
  render();
}
/* TROIS ÉTATS : 👍, 👎, et RIEN — qui est le défaut et une réponse parfaitement
   valide. Repasser le même pouce revient donc au troisième état. */
function avisRattrapage(media, id, v){
  poserAvis(media, id, v);
  render();
}

/* ---------------------------------------------------------------------------
   Le synopsis d'un titre, pour la fiche ouverte depuis le duel

   Un doute sur l'un des deux titres et on est bloqué : il faut une porte de
   sortie. La bibliothèque porte déjà le synopsis des titres qu'elle contient ;
   pour une graine, qui n'y est pas, on va le chercher une fois.
--------------------------------------------------------------------------- */
const synopsisDuel = {};             // 'tv:1399' → texte | 'attente' | ''
function synopsisDe(media, id){
  const local = media === 'tv' ? db.shows[id] : db.movies[id];
  if(local && local.overview) return local.overview;
  const k = media+':'+id;
  if(synopsisDuel[k] === undefined){
    synopsisDuel[k] = 'attente';
    tmdb('/'+media+'/'+id)
      .then(d=>{ synopsisDuel[k] = (d && d.overview) || ''; peindreSynopsisDuel(k); })
      .catch(()=>{ synopsisDuel[k] = ''; peindreSynopsisDuel(k); });
  }
  return synopsisDuel[k];
}
/* `k` est la clé BRUTE, et c'est volontaire : côté fiche l'identifiant est posé
   par `esc()`, mais le parseur HTML redécode l'attribut, si bien que la valeur
   réellement portée par le nœud est la clé brute. Échapper ici aussi ferait
   diverger les deux bouts et le synopsis ne se peindrait plus. */
function peindreSynopsisDuel(k){
  const el = document.getElementById('syn-'+k);
  if(el) el.textContent = synopsisDuel[k] === 'attente' ? '' : (synopsisDuel[k] || '');
}

/* ---------------------------------------------------------------------------
   L'écran du duel

   Deux affiches empilées, un VS au milieu, la question au-dessus, et sous les
   cartes la sortie neutre. « 3 / 10 » et une barre qui avance : c'est ce qui
   fait aller au bout — un jeu sans fin visible est un jeu qu'on quitte à la
   troisième carte.
--------------------------------------------------------------------------- */
function affDuel(t, cls){
  const src = srcImage(t.affiche, 'w342');
  return src
    ? '<img class="'+cls+'" src="'+src+'" alt="" onerror="posterFail(this)">'
    : '<div class="'+cls+' ph">'+esc((t.nom || '?').slice(0, 22))+'</div>';
}
function carteDuel(t, i){
  const etat = !duel.choix ? '' : (duel.choix === cleDuel(t) ? ' gagne' : ' perd');
  const an = t.date ? year(t.date) : '';
  return '<button class="dcarte'+etat+'" onclick="duelVote('+i+')" '+
      'aria-label="Choisir '+esc(t.nom)+'">'+
    affDuel(t, 'dcimg')+
    /* LA PASTILLE « déjà aimé » rend visible la règle du §1.7 : un titre non
       qualifié qui bat un titre aimé devient aimé à son tour. Sans elle, la
       règle s'appliquerait dans le dos de la personne. */
    (aAime(t.media, t.id) ? '<span class="dpouce">👍 déjà aimé</span>' : '')+
    /* R1 · point 1 — `.dinfo` s'appelait comme le bloc titre de l'aperçu de
       Recherche et l'écrasait. Renommée `.dpastille`, nom vérifié libre. */
    '<span class="dpastille" onclick="event.stopPropagation();ficheDuel(\''+t.media+'\',\''+
      escJs(String(t.id))+'\')" role="button" aria-label="Voir la fiche">i</span>'+
    '<span class="dtxt"><b>'+esc(t.nom)+'</b>'+
      (an ? '<i>'+esc(an)+'</i>' : '')+'</span>'+
  '</button>';
}
function ecranDuelJeu(){
  const [a, b] = duel.paire || [];
  if(!a || !b) return '<div class="empty"><p>Plus rien à départager.</p></div>';
  const avance = Math.round(duel.faits / DUEL_TAILLE * 100);
  return '<div class="darene">'+
    '<div class="dbarre"><i style="width:'+avance+'%"></i></div>'+
    '<div class="dquest">Lequel tu as préféré&nbsp;?</div>'+
    '<div class="dsous">Il n\'y a pas de mauvaise réponse.</div>'+
    '<div class="dcartes">'+carteDuel(a, 0)+'<span class="dvs">VS</span>'+carteDuel(b, 1)+'</div>'+
    /* Une sortie honnête, écrite en toutes lettres. */
    '<button class="dneutre" onclick="duelPasse()">Je ne sais pas / les deux</button>'+
  '</div>';
}

/* LA FICHE, ACCESSIBLE DEPUIS LE DUEL. Deux sorties, et elles comptent autant
   l'une que l'autre : « C'est celui-là » vote directement — pas de retour en
   arrière puis de re-visée, on ne casse pas le rythme d'un jeu de quarante
   secondes — et « Je ne l'ai pas vu » nettoie le paquet.
   Principe général : chaque fois qu'on demande un avis, il faut pouvoir dire
   « je ne peux pas répondre ». */
function ficheDuel(media, id){
  const t = (duel.paire || []).find(x => x.media === media && String(x.id) === String(id));
  if(!t) return;
  const i = duel.paire.indexOf(t);
  const syn = synopsisDe(media, id);
  const an = t.date ? year(t.date) : '';
  openSheet(
    '<h3>'+esc(t.nom)+'</h3>'+
    (an ? '<p class="small muted" style="margin:0 0 8px">'+esc(an)+'</p>' : '')+
    '<div id="syn-'+media+':'+esc(String(id))+'" class="overview" style="margin:0 0 12px">'+
      esc(syn === 'attente' ? '' : (syn || ''))+'</div>'+
    zoneBande(media, id)+
    '<button class="opt" onclick="closeSheet();duelVote('+i+')">C’est celui-là</button>'+
    '<button class="opt" onclick="duelPasVu(\''+media+'\',\''+escJs(String(id))+'\')">'+
      'Je ne l’ai pas vu</button>'+
    '<button class="opt" onclick="closeSheet()">Revenir au duel</button>');
}

/* Le résultat. Deux blocs, deux fonctions : le podium, c'est la fierté ; les
   cinq titres, c'est la preuve que l'effort a changé quelque chose. Et une
   note qui explique le gain en UNE phrase — c'est elle qui donne envie de
   rejouer, pas le podium. */
const RANGS = ['🥇','🥈','🥉'];
function ecranDuelResultat(){
  const trois = (duel.classe || []).slice(0, 3);
  /* PAS `trois[0]`, mais le titre dont la rangée de suggestions part réellement
     — `terminerDuel` l'a vérifié auprès de `departJeuRech`. Vaut `null` quand
     la promesse ne tient pas, et le bloc entier disparaît alors. */
  const tete = duel.tete;
  const nomFam = (DUEL_FAMILLES.find(f => f.cle === duel.famille) || {}).nom || 'titres';
  let html = '<div class="dres">'+
    '<div class="dfete">🏆</div>'+
    '<div class="drtitre">Ton podium</div>'+
    '<div class="drsous">D\'après tes '+duel.faits+' duel'+(duel.faits>1?'s':'')+'</div>';
  /* Le n°1 au milieu et plus haut : un podium se lit d'un coup d'œil, pas en
     lisant les médailles une par une. */
  const ordre = trois.length >= 3 ? [trois[1], trois[0], trois[2]]
              : trois.length === 2 ? [trois[1], trois[0]] : trois;
  html += '<div class="dpodium">'+ordre.map(t=>{
    const r = trois.indexOf(t);
    return '<div class="dpod'+(r === 0 ? ' un' : '')+'">'+
      '<div class="drang">'+RANGS[r]+'</div>'+
      affDuel(t, 'dpaff')+
      '<div class="dpnom">'+esc(t.nom)+'</div></div>';
  }).join('')+'</div>';

  if(tete){
    html += '<div class="sectitle">Ce que ça change tout de suite</div>';
    if(duel.sugg === 'attente')
      html += '<div class="wrap" style="padding-top:0"><span class="spin"></span></div>';
    else if((duel.sugg || []).length)
      html += '<div class="drail" data-rail="duelsugg">'+duel.sugg.map(x=>
        '<button class="djq" onclick="ouvrirApercuDuel(\''+x.media+'\','+x.id+')">'+
          affDuel({ affiche:x.affiche, nom:x.nom }, 'djqaff')+
          '<span class="djqnom">'+esc(x.nom)+'</span></button>').join('')+'</div>';
    html += '<div class="wrap" style="padding-top:10px"><div class="card dnote">'+
      '<b>'+esc(tete.nom)+'</b> devient ton point de départ. La rangée '+
      '« Dans l\'esprit de '+esc(tete.nom)+' » remplace la rotation au hasard, '+
      'dès maintenant.</div></div>';
  }
  /* R1 · point 12 — « Continuer → » n'ouvre l'écran suivant que s'il a quelque
     chose à demander. Tout est déjà qualifié : le bouton dit « Terminer » et
     referme, plutôt que de mener à une page vide. */
  const reste = titresARattraper().length;
  html += '<div class="dcta">'+
      '<button class="btn ghost" onclick="rejouerDuel()">Encore '+DUEL_TAILLE+' duels</button>'+
      (reste
        ? '<button class="btn" onclick="ouvrirRattrapage()">Continuer →</button>'
        : '<button class="btn" onclick="fermerDuel()">Terminer</button>')+
    '</div>'+
    /* R1 · point 11 — on ne dit pas « ton podium est enregistré » tant qu'il est
       vide. Un titre y entre à partir de trois duels joués : les toutes
       premières parties construisent le classement avant de figer un podium, et
       il vaut mieux l'écrire que de laisser croire à un écran cassé. */
    '<div class="tiny muted center" style="margin-top:10px">'+
      (duel.podiumPret
        ? 'Ton podium '+esc(nomFam ? 'des '+nomFam : '')+' est enregistré.'
        : 'Tes duels sont enregistrés. Un titre entre au podium à partir de '+
          DUEL_MINI_N+' duels joués — encore quelques parties et il se figera.')+
    '</div>'+
  '</div>';
  return html;
}
/* Quitter le duel pour ouvrir une fiche perdrait la session : on ferme
   proprement d'abord, et on garde le podium — il est déjà enregistré. */
function ouvrirApercuDuel(media, id){
  duel = Object.assign({}, DUEL_VIDE);
  ui.preview = { id:id, type:media, loading:true, data:null, error:'' };
  go('preview', { id:id, type:media, from:'gouts' });
  /* Après le rendu : `loadPreview` redessine seul quand la réponse arrive, et
     il ne doit pas courir avant que l'écran existe. */
  if(typeof loadPreview === 'function') setTimeout(loadPreview, 0);
}

function ecranRattrapage(){
  /* Pas de titre ici : l'en-tête porte déjà « Encore une chose », et le
     répéter à dix pixels de distance donne l'impression d'un écran cassé. */
  let html = '<div class="wrap"><div class="drsous" style="text-align:left;margin:0 0 6px">'+
    'Tant que tu es lancé : ceux-là, tu les as aimés&nbsp;?</div></div>';
  if(!duel.rattrapage.length){
    html += '<div class="empty"><p>Tout est déjà qualifié. Rien à faire ici.</p></div>';
  } else {
    html += '<div class="wrap" style="padding-top:0">'+duel.rattrapage.map(t=>{
      const v = avisDe(t.media, t.id);
      return '<div class="rlig">'+
        affDuel(t, 'rlaff')+
        '<div class="rli"><b>'+esc(t.nom)+'</b>'+
          (t.date ? '<span>'+esc(year(t.date))+'</span>' : '')+'</div>'+
        '<div class="rduo">'+
          '<button class="rpb non'+(v === -1 ? ' on' : '')+'" aria-pressed="'+(v === -1)+'" '+
            'onclick="avisRattrapage(\''+t.media+'\',\''+escJs(String(t.id))+'\',-1)">👎</button>'+
          '<button class="rpb oui'+(v === 1 ? ' on' : '')+'" aria-pressed="'+(v === 1)+'" '+
            'onclick="avisRattrapage(\''+t.media+'\',\''+escJs(String(t.id))+'\',1)">👍</button>'+
        '</div></div>';
    }).join('')+'</div>';
  }
  html += '<div class="wrap"><div class="card dnote">Rien n\'est obligatoire. '+
      'Ce que tu ne touches pas reste simplement non qualifié.</div></div>'+
    '<div class="dcta"><button class="btn block" onclick="fermerDuel()">Terminer</button></div>'+
    '<div style="height:24px"></div>';
  return html;
}

function ecranDuel(){
  const t = duel.ecran === 'jeu'
    ? (DUEL_FAMILLES.find(f => f.cle === duel.famille) || {}).titre || 'Le duel'
    : duel.ecran === 'resultat' ? 'Le résultat' : 'Encore une chose';
  const compteur = duel.ecran === 'jeu'
    ? '<span class="dcompte">'+Math.min(duel.faits + 1, DUEL_TAILLE)+' / '+DUEL_TAILLE+'</span>'
    : '';
  let html = header(t, { right: compteur+
    '<button class="iconbtn" onclick="fermerDuel()" aria-label="Fermer">'+I.close+'</button>' });
  html += duel.ecran === 'jeu' ? ecranDuelJeu()
        : duel.ecran === 'resultat' ? ecranDuelResultat()
        : ecranRattrapage();
  return html;
}

/* La carte d'invitation, en tête de Mes goûts. Elle dit ce qu'il y a à gagner
   et combien il reste à faire, jamais « viens jouer ». */
function carteDuelGouts(){
  const prets = famillesDuel();
  if(!prets.length){
    /* On explique l'absence plutôt que de la taire : une fonctionnalité qui
       n'apparaît pas sans raison passe pour cassée. */
    return '<div class="wrap" style="padding-top:0"><div class="card dinvit">'+
      '<div class="ditit">🏆 Le duel</div>'+
      '<div class="tiny muted">Deux affiches, tu choisis celle que tu as préférée. '+
      'Il s\'ouvre famille par famille, à partir d\'une dizaine de titres vus '+
      'dans la même famille.</div></div></div>';
  }
  const lignes = prets.map(f=>{
    const n = nouveauxADepartager(f.cle);
    const rang = ((db.podium || {})[f.cle] || []).length;
    const dit = !rang ? 'Départage tes '+f.nom
              : n ? n+' nouveau'+(n>1?'x':'')+' titre'+(n>1?'s':'')+' à départager'
                  : 'Rejouer — ton podium est à jour';
    return '<button class="dfam" onclick="ouvrirDuel(\''+f.cle+'\')">'+
      '<span class="dfnom">'+esc(f.nom.charAt(0).toUpperCase()+f.nom.slice(1))+'</span>'+
      '<span class="dfdit">'+esc(dit)+'</span>'+
      '<i>'+I.caret+'</i></button>';
  }).join('');
  return '<div class="wrap" style="padding-top:0"><div class="card dinvit">'+
    '<div class="ditit">🏆 Le duel</div>'+
    '<div class="tiny muted" style="margin-bottom:10px">Deux affiches, tu choisis '+
      'celle que tu as préférée. Dix duels, une quarantaine de secondes.</div>'+
    lignes+'</div></div>';
}

/* La liste « Écartés ». Sans retour en arrière, on cesse de voter — c'est le
   second garde-fou du §1.5, et il n'existe que si cet écran existe. */
function blocEcartes(){
  const l = titresEcartes();
  if(!l.length) return '';
  return '<div class="sectitle">Titres écartés<span class="cnt">'+l.length+'</span></div>'+
    '<div class="wrap" style="padding-top:0">'+
      '<div class="small muted" style="margin-bottom:8px">Aucune suggestion n\'est '+
        'bâtie sur ces titres. Un appui les remet dans le jeu.</div>'+
      l.map(t=>'<div class="rlig">'+
        affDuel(t, 'rlaff')+
        '<div class="rli"><b>'+esc(t.nom)+'</b><span>👎 écarté</span></div>'+
        '<button class="btn ghost mini" onclick="reprendreEcarte(\''+t.media+'\',\''+
          escJs(String(t.id))+'\')">Remettre</button>'+
      '</div>').join('')+
    '</div>';
}
function reprendreEcarte(media, id){
  retirerAvis(media, id);
  toast('Remis dans le jeu');
  render();
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
  /* LOT A — le duel VIT ICI. Il occupe l'écran entier plutôt que d'ouvrir une
     vue à lui : c'est un jeu de quarante secondes lancé depuis cette page, et
     on y revient à la fin. Le retour (flèche, geste, bouton matériel) le ferme
     sans quitter Mes goûts — voir `goBack`. */
  if(duel.actif) return ecranDuel();
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

  /* LOT A — le duel en tête d'écran : c'est la seule chose de cette page qui
     rapporte quelque chose en trente secondes. Les deux listes de genres, elles,
     se corrigent une fois par an. */
  html += carteDuelGouts();

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
    lignes.push('<div><b>Genres écartés</b> '+esc(p.exclus.join(', '))+'</div>');
  /* LOT A — CE QUI A ÉTÉ DIT, distingué de ce qui a été déduit. C'est
     exactement le reproche d'Adrien — « je ne sais pas ce que l'app croit
     savoir » — et la réponse a changé de nature : une partie du profil n'est
     plus une déduction, c'est une déclaration. Elle doit se lire comme telle. */
  if(p.aimes)
    lignes.push('<div><b>Tu as aimé</b> '+p.aimes+' titre'+(p.aimes>1?'s':'')+
      (p.pasAimes ? ', et écarté '+p.pasAimes : '')+'</div>');
  if(p.podium.length)
    lignes.push('<div><b>Tes préférés</b> '+esc(p.podium.join(' · '))+'</div>');

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

  /* LOT A — la reprise des 👎. Placée juste après les genres écartés, parce que
     c'est la même question posée à deux échelles : ce que je ne veux plus voir. */
  html += blocEcartes();

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
