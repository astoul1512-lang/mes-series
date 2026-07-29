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
  /* Date du dernier calcul des suggestions, pour ne les refaire qu'une fois
     par jour — chaque source coûte une requête. */
  if(typeof g.jour !== 'string') g.jour = '';
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
  return out.sort((a,b)=>b.score-a.score);
}

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

/* Une vitrine par puce, chacune avec son cache : passer de Séries à Animés ne
   doit pas relancer quatre requêtes si on vient d'y aller. */
const cacheSugg = {};
function suggVide(){
  return { etat:'froid' /* froid|attente|ok|erreur */, quand:0,
           vedettes:[], sections:[], esprit:null, acteurs:[], nouveautes:[],
           /* Ce sur quoi l'app s'est appuyée, gardé pour pouvoir le montrer :
              « je ne sais pas ce que l'app croit savoir » était le reproche. */
           base:[], genresUtilises:[] };
}
let suggestions = suggVide();       // celles de la puce affichée

/* Repointe `suggestions` sur la puce courante. Appelée par tout ce qui lit
   les suggestions : sans ça, changer de puce affichait celles de la
   précédente le temps d'un rendu. */
function suggCourantes(){
  const t = (ui.disc && ui.disc.type) || 'tout';
  if(!cacheSugg[t]) cacheSugg[t] = suggVide();
  suggestions = cacheSugg[t];
  return suggestions;
}
/* Les goûts ont changé : tout est à refaire, sur toutes les puces. */
function oublierSuggestions(){
  Object.keys(cacheSugg).forEach(t => { delete cacheSugg[t]; });
  suggCourantes();
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
function estOccidental(x){
  return !x.langue || LANGUES_OCCIDENT.indexOf(x.langue) >= 0;
}
/* La règle d'origine, dépendante de la puce.
   `perso` distingue ce qui découle de la bibliothèque (recommandations d'un
   titre regardé, acteur suivi) du catalogue générique. C'était l'incohérence
   de fond : l'app déduisait les goûts d'Adrien d'une bibliothèque d'animés,
   puis s'interdisait de lui en proposer un seul. Ce qui vient de chez lui n'a
   plus d'origine imposée ; seul le ratissage général reste cadré. */
function passeOrigine(x, cadre, perso){
  if(cadre.origine === 'anime')     return estUnAnime(x);
  if(cadre.origine === 'sansAnime') return !estUnAnime(x) && estOccidental(x);
  return perso || estUnAnime(x) || estOccidental(x);
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
  const p = { include_adult:'false', page:'1', sort_by:'popularity.desc', 'vote_count.gte':'120' };

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
  return { media:media, p:p };
}

async function chargerSuggestions(force){
  const type = (ui.disc && ui.disc.type) || 'tout';
  const c = suggCourantes();
  if(c.etat === 'attente') return;
  if(!force && c.etat === 'ok' && Date.now() - c.quand < SUGG_TTL) return;
  c.etat = 'attente';
  if(typeof peindreDisc === 'function') peindreDisc();
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
      .then(d => ({ kind:'esprit', titre:esprit.nom,
                    l:(d&&d.results||[]).map(x=>normaliser(x, esprit.media)) })));
    acteurs.forEach(a => demandes.push(sourceDouce(tmdb('/person/'+a.id+'/combined_credits'))
      .then(d => ({ kind:'acteur', titre:a.nom,
                    l:((d&&d.cast)||[])
                      .filter(x => x.media_type === 'tv' || x.media_type === 'movie')
                      .sort((x,y)=>(y.popularity||0)-(x.popularity||0))
                      .map(x => normaliser(x, x.media_type)) }))));
    /* Les nouveautés, sur chaque média du cadre de la puce. */
    cadre.medias.forEach(m=>{
      const champ = m === 'movie' ? 'primary_release_date' : 'first_air_date';
      const p = { include_adult:'false', page:'1', sort_by:'popularity.desc',
                  [champ+'.gte']:debut, [champ+'.lte']:auj };
      if(cadre.origine === 'anime'){
        p.with_original_language = 'ja';
        const a = genreParNom(m,'Animation');
        if(a != null) p.with_genres = String(a);
      }
      demandes.push(sourceDouce(tmdb('/discover/'+m, p))
        .then(d => ({ kind:'nouv', media:m, l:(d&&d.results||[]).map(x=>normaliser(x, m)) })));
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
      if(l.length) espritPret = { titre:r.titre, l:l };
    });
    const parActeur = [];
    parKind('acteur').forEach(r=>{
      const l = tamiser(r.l || [], vus, cadre, true).slice(0, 20);
      if(l.length) parActeur.push({ titre:r.titre, l:l });
    });
    const paqNouv = [];
    parKind('nouv').forEach(r=>{
      const l = tamiser(r.l || [], vus, cadre, false).slice(0, 20);
      if(l.length) paqNouv.push(l);
    });
    const nouv = entrelacerSugg(paqNouv);

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
      base:sections.map(s=>s.cle), genresUtilises:[] });
  }catch(e){
    c.etat = 'erreur';
  }
  suggCourantes();
  if(view === 'discover' && typeof peindreDisc === 'function') peindreDisc();
}

/* Les rangées de la vitrine, dans l'ordre où elles s'affichent. L'ordre des
   sections est fixe — choix d'Adrien : « toujours le même ordre », pour savoir
   où regarder sans réfléchir. */
function rangeesSuggerees(){
  suggCourantes();
  const out = [];
  (suggestions.sections || []).forEach(s=>{ if(s.l.length) out.push({ titre:s.titre, l:s.l }); });
  (suggestions.acteurs || []).forEach(p=>{ if(p.l.length) out.push({ titre:'Avec '+p.titre, l:p.l }); });
  if(suggestions.esprit && suggestions.esprit.l.length)
    out.push({ titre:'Dans l\'esprit de '+suggestions.esprit.titre, l:suggestions.esprit.l });
  if((suggestions.nouveautes || []).length)
    out.push({ titre:'Sorties récentes', l:suggestions.nouveautes });
  return out;
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
function explicationProfil(){
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
  return {
    manuels: manuels,
    parFamille: parFamille,
    volume: { series: Object.values(db.shows).filter(s=>progress(s).watched>0).length,
              films:  Object.values(db.movies).filter(m=>m.seen).length },
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
  oublierSuggestions(); saveDB(); render();
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
  oublierSuggestions(); saveDB(); render();
}
function retirerExclu(nom){
  const g = db.gouts, i = g.exclus.indexOf(nom);
  if(i >= 0) g.exclus.splice(i,1);
}
function retirerActeur(id){
  db.gouts.acteurs = db.gouts.acteurs.filter(a=>String(a.id) !== String(id));
  oublierSuggestions(); saveDB(); render();
}
function ajouterActeur(id, nom){
  if(db.gouts.acteurs.some(a=>String(a.id) === String(id))) return;
  db.gouts.acteurs.push({ id:id, nom:nom });
  rechActeur = { q:'', res:null, occupe:false, seq:rechActeur.seq };
  oublierSuggestions(); saveDB(); render();
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
    '<button class="lact" onclick="ajouterActeur('+p.id+',\''+esc(p.nom).replace(/'/g,"\\'")+'\')">'+
      (p.photo ? '<img src="'+IMG(p.photo,'w185')+'" alt="">' : '<div class="ph2">'+esc(p.nom[0])+'</div>')+
      '<span>'+esc(p.nom)+'</span><i>'+I.plus+'</i>'+
    '</button>').join('')+'</div>';
}

function viewGouts(){
  const g = db.gouts;
  const depuisCompte = params.from === 'compte';
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

  let html = header('Mes goûts', depuisCompte ? {} : {back:"goBack()"});

  html += '<div class="wrap" style="padding-bottom:6px"><div class="small muted">'+
    (depuisCompte
      ? 'Rien n\'est obligatoire : sans réponse, l\'app apprend toute seule de ce que tu regardes. '+
        'Tu pourras revenir ici quand tu veux depuis les réglages.'
      : 'Ces réglages passent avant ce que l\'app devine. Laisse tout vide et elle reprend la main.')+
    '</div></div>';

  /* Le raisonnement complet, écrit noir sur blanc. La version courte de ce même
     bloc est dans la vitrine ; ici on montre en plus le détail des genres
     déduits et leur classement, puisque c'est l'écran où on les corrige. */
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
    lignes.push('<div><b>Acteurs suivis</b> '+esc(p.acteurs.join(', '))+'</div>');
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

  html += '<div class="sectitle">J\'aime</div>'+
    '<div class="chips wrapchips">'+genres.map(n=>
      '<button class="chip '+(g.genres.indexOf(n)>=0?'on':'')+'" '+
        'onclick="bascGoutGenre(\''+esc(n).replace(/'/g,"\\'")+'\')">'+esc(n)+'</button>').join('')+
    '</div>';

  html += '<div class="sectitle">Je ne veux pas voir</div>'+
    '<div class="chips wrapchips">'+genres.map(n=>
      '<button class="chip '+(g.exclus.indexOf(n)>=0?'hors':'')+'" '+
        'onclick="bascGoutExclu(\''+esc(n).replace(/'/g,"\\'")+'\')">'+esc(n)+'</button>').join('')+
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
  html += '<div class="gbarre'+(depuisCompte ? ' seul' : '')+'">'+
    (depuisCompte
      ? '<button class="btn block" onclick="finirGouts()">C\'est parti</button>'+
        '<button class="tiny muted" style="display:block;width:100%;text-align:center;padding:10px 8px 2px" '+
          'onclick="passerGouts()">Passer cette étape</button>'
      : '<button class="btn block" onclick="fermerGouts()">Terminé</button>'+
        '<div class="tiny muted center" style="margin-top:7px">Tes choix sont déjà enregistrés.</div>')+
  '</div>';
  return html;
}

/* Sortie depuis les réglages ou la vitrine : rien à enregistrer, tout l'a déjà
   été. On repart simplement d'où l'on vient, et les suggestions se referont. */
function fermerGouts(){
  toast('Goûts enregistrés');
  goBack();
}
function finirGouts(){
  db.gouts.propose = true; saveDB();
  oublierSuggestions();                       // le profil a changé : on recalcule
  go('follow');
}
function passerGouts(){
  db.gouts.propose = true; saveDB();
  go('follow');
}
