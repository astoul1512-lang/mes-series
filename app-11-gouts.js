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
  if(cadre.anime !== null) return aimes.slice(0, combien);

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
           vedettes:[], parce:[], genres:[], acteurs:[], nouveautes:[],
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

/* Ce que chaque puce accepte. `anime` vaut true (que des animés), false
   (jamais d'animé) ou null (on ne tranche pas — c'est « Tout »). */
function cadreSugg(t){
  if(t === 'movie') return { medias:['movie'], anime:false };
  if(t === 'tv')    return { medias:['tv'],    anime:false };
  if(t === 'anime') return { medias:['tv'],    anime:true  };
  return { medias:['tv','movie'], anime:null };
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
  if(cadre.anime === true)  return estUnAnime(x);          // puce Animés
  if(cadre.anime === false) return !estUnAnime(x) && estOccidental(x);
  return perso || estUnAnime(x) || estOccidental(x);       // puce Tout
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
    const anim = { tv: genreParNom('tv','Animation'), movie: genreParNom('movie','Animation') };

    /* --- Première vague : ce qui vient de ma bibliothèque ---
       C'est le choix d'Adrien : « ce que tu as vraiment regardé » d'abord, les
       genres seulement en bouche-trou. On tire donc de six titres au lieu de
       trois, et on n'ira chercher le catalogue que si ça ne suffit pas. */
    /* Quatre points de départ sur « Tout » plutôt que six : au-delà, les rangées
       personnelles occupent tout l'écran et l'on ne voit plus rien d'autre. */
    const aimes = grainesSuggestions(cadre, cadre.anime === null ? 4 : 6);
    const acteurs = ((db.gouts||{}).acteurs || []).slice(0, 3);

    const persos = await Promise.all([
      ...aimes.map(t => sourceDouce(tmdb('/'+t.media+'/'+t.id+'/recommendations'))
        .then(d => ({ genre:'parce', titre:t.nom,
                      l:(d&&d.results||[]).map(r=>normaliser(r, t.media)) }))),
      /* TMDB ne sait filtrer les séries par acteur que pour les films : on passe
         donc par la filmographie de la personne, le même chemin que les fiches
         acteurs de l'app. */
      ...acteurs.map(a => sourceDouce(tmdb('/person/'+a.id+'/combined_credits'))
        .then(d => ({ genre:'acteurs', titre:a.nom,
                      l:((d&&d.cast)||[])
                        .filter(r => r.media_type === 'tv' || r.media_type === 'movie')
                        .sort((x,y)=>(y.popularity||0)-(x.popularity||0))
                        .map(r => normaliser(r, r.media_type)) })))
    ]);

    const parce = [], parActeur = [];
    let nPerso = 0;
    persos.forEach(r=>{
      const l = tamiser(r.l || [], vus, cadre, true).slice(0, 20);
      if(!l.length) return;
      nPerso += l.length;
      if(r.genre === 'parce') parce.push({ titre:r.titre, l:l });
      else                    parActeur.push({ titre:r.titre, l:l });
    });

    /* --- Seconde vague : le catalogue ---
       Les nouveautés sont demandées à chaque fois — « de nouvelles sorties »
       fait partie de la commande. Les genres, eux, ne servent qu'à combler. */
    const genres = genresRetenus();
    const besoinGenres = nPerso < SUGG_ASSEZ && genres.length > 0;
    const idsG = media => {
      const l = genres.map(n => genreParNom(media, n)).filter(x => x != null);
      /* Sur la puce Animés, l'animation est acquise : la garder comme critère
         ne trierait rien et écraserait les genres qui, eux, distinguent. */
      return cadre.anime === true ? l.filter(x => x !== anim[media]) : l;
    };

    const generiques = await Promise.all([
      ...cadre.medias.map(m => {
        const champ = m === 'movie' ? 'primary_release_date' : 'first_air_date';
        const p = { include_adult:'false', page:'1', sort_by:'popularity.desc',
                    [champ+'.gte']:debut, [champ+'.lte']:auj };
        if(cadre.anime === true){
          p.with_original_language = 'ja';
          if(anim[m] != null) p.with_genres = String(anim[m]);
        }
        return sourceDouce(tmdb('/discover/'+m, p))
          .then(d => ({ genre:'nouveautes', l:(d&&d.results||[]).map(r=>normaliser(r, m)) }));
      }),
      ...(besoinGenres ? cadre.medias.map(m => {
        const p = { include_adult:'false', page:'1', sort_by:'popularity.desc',
                    'vote_count.gte':'150' };
        let ids;
        if(cadre.anime === true){
          /* Sur la puce Animés, l'animation japonaise n'est pas une préférence
             mais la définition même de la puce : elle doit rester un ET. TMDB
             ne sait pas mêler un ET et un OU dans `with_genres` de façon dont
             on soit sûr — on s'en tient donc à l'animation seule, et les goûts
             de genre ne cadrent pas cette rangée-là. */
          p.with_original_language = 'ja';
          ids = [anim[m]].filter(x => x != null);
        } else {
          /* La barre verticale est un OU chez TMDB, la virgule un ET. « J'aime
             l'action ET l'aventure ET la comédie ET la guerre » ne décrit
             presque aucun titre ; « l'un ou l'autre » dit ce qu'on voulait. */
          ids = idsG(m).filter(x => x != null);
        }
        if(!ids.length) return Promise.resolve({genre:'genres', l:[]});
        p.with_genres = ids.join('|');
        return sourceDouce(tmdb('/discover/'+m, p))
          .then(d => ({ genre:'genres', l:(d&&d.results||[]).map(r=>normaliser(r, m)) }));
      }) : [])
    ]);

    const paqGenre = [], paqNouv = [];
    generiques.forEach(r=>{
      const l = tamiser(r.l || [], vus, cadre, false).slice(0, 20);
      if(!l.length) return;
      if(r.genre === 'genres') paqGenre.push(l); else paqNouv.push(l);
    });
    const parGenre = entrelacerSugg(paqGenre), nouv = entrelacerSugg(paqNouv);

    /* Le carrousel du jour : cinq titres pris d'abord dans ce qui vient de la
       bibliothèque. La rotation est calculée à partir de la date — stable toute
       la journée, différente demain, et jamais tirée au sort : la vitrine ne
       doit pas changer sous les doigts. */
    const bassin = []
      .concat(...parce.map(p => p.l.map(x => Object.assign({ pourquoi:'Parce que tu as regardé '+p.titre }, x))))
      .concat(...parActeur.map(p => p.l.map(x => Object.assign({ pourquoi:'Avec '+p.titre }, x))))
      .concat(parGenre.map(x => Object.assign({ pourquoi:'Dans tes genres' }, x)))
      .concat(nouv.map(x => Object.assign({ pourquoi:'Sortie récente' }, x)));
    const graine = Math.floor(Date.parse(auj) / 86400000);
    const vedettes = [];
    for(let i = 0; i < 5 && bassin.length; i++){
      const idx = (graine + i * 7) % bassin.length;
      vedettes.push(bassin.splice(idx, 1)[0]);
    }

    Object.assign(c, { etat:'ok', quand:Date.now(), vedettes:vedettes,
      parce:parce, acteurs:parActeur,
      genres:parGenre.slice(0, SUGG_MAX), nouveautes:nouv.slice(0, SUGG_MAX),
      base:aimes.map(t=>t.nom),
      /* Sur la puce Animés la rangée de secours ne suit pas les genres choisis :
         on ne les annonce donc pas dans son titre. */
      genresUtilises: (besoinGenres && cadre.anime !== true) ? genres : [] });
  }catch(e){
    c.etat = 'erreur';
  }
  suggCourantes();
  if(view === 'discover' && typeof peindreDisc === 'function') peindreDisc();
}

/* Les rangées de la vitrine, dans l'ordre où elles s'affichent. */
function rangeesSuggerees(){
  suggCourantes();
  const out = [];
  suggestions.parce.forEach(p=>{
    if(p.l.length) out.push({ titre:'Parce que tu as regardé '+p.titre, l:p.l });
  });
  suggestions.acteurs.forEach(p=>{
    if(p.l.length) out.push({ titre:'Avec '+p.titre, l:p.l });
  });
  if(suggestions.genres.length){
    const g = suggestions.genresUtilises.length ? suggestions.genresUtilises : genresRetenus();
    out.push({ titre: g.length ? 'Parce que tu aimes '+g.slice(0,2).join(' et ') : 'Pour toi',
               l: suggestions.genres });
  }
  if(suggestions.nouveautes.length) out.push({ titre:'Sorties récentes', l:suggestions.nouveautes });
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
function explicationProfil(){
  const g = db.gouts || {};
  /* Les titres annoncés doivent être ceux dont les rangées partent réellement,
     pas les trois mieux notés de la bibliothèque : sur « Tout », les deux
     listes divergeaient depuis que les points de départ sont répartis. */
  const cadre = cadreSugg((ui.disc && ui.disc.type) || 'tout');
  const bases = grainesSuggestions(cadre, 3).map(t=>t.nom);
  const manuels = (g.genres||[]).length > 0;
  const genres = genresRetenus();
  return {
    manuels: manuels,
    bases: bases,
    genres: genres,
    acteurs: (g.acteurs||[]).map(a=>a.nom),
    exclus: (g.exclus||[]).slice(),
    /* La phrase d'origine : d'où viennent les genres retenus. */
    origine: manuels
      ? 'Tu as choisi ces genres toi-même.'
      : (bases.length
          ? 'Déduits de ce que tu as terminé ou bien avancé.'
          : 'Rien à déduire pour l\'instant : ta bibliothèque est trop jeune.')
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
  const deduits = genresDeduits();
  const lignes = [];
  if(p.bases.length)
    lignes.push('<div><b>Je pars de</b> '+esc(p.bases.join(', '))+'</div>');
  if(deduits.length)
    lignes.push('<div><b>Genres qui en ressortent</b> '+esc(deduits.slice(0,5).join(', '))+
      (deduits.length > 5 ? ' <span class="muted">et '+(deduits.length-5)+' autre'+
        (deduits.length-5>1?'s':'')+'</span>' : '')+'</div>');
  if(p.genres.length)
    lignes.push('<div><b>'+(p.manuels ? 'Ce que tu as choisi' : 'Ce que je retiens')+'</b> '+
      esc(p.genres.join(', '))+'</div>');
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
