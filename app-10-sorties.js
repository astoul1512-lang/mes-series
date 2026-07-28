"use strict";
/* ONGLET RETIRÉ le 28/07 à la demande d'Adrien (« pas terrible »). L'écran
   n'est plus atteignable — plus d'entrée dans la barre ni dans corpsDeVue —
   mais tout le savoir-faire de ce fichier reste en service : la section
   « Bientôt » d'À suivre s'appuie sur dateFRDe, dansFenetre, plateformesDe et
   les constantes SORTIES_*. Si l'onglet doit renaître un jour sous une autre
   forme, tout est là. */

/* ---------- Vue : Sorties — l'actualité du cinéma et du streaming ----------

   Découvrir répond à « qu'est-ce que je pourrais regarder ? » ; cet écran
   répond à « qu'est-ce qui sort ? ». Trois sections : à l'affiche, bientôt en
   salle, bientôt en streaming. Tout vient de TMDB pour la France, rien n'est
   personnel ici — la version personnelle vit dans « À suivre ».

   Méfiance apprise en vérifiant : la liste « prochainement » de TMDB glisse
   parfois un vieux film qui ressort en salle, daté de sa sortie d'origine
   (RRR, 2022, y figurait le jour du test). La date affichée est donc toujours
   la vraie date française, redemandée film par film — jamais celle de la
   liste. Un film sans date française dans la fenêtre est écarté. */

const SORTIES_FENETRE = 60;          // jours d'avance pour « bientôt au cinéma »
const SORTIES_RECUL = 14;            // jours en arrière pour « nouveau en streaming »
const SORTIES_MONTRES = 10;          // lignes par liste : au-delà, c'est du bruit
const SORTIES_TTL = 30 * 60000;      // on ne redemande pas tout à chaque visite

/* 2 = avant-première limitée, 3 = salle ; 4 = numérique. Le physique (5) ne
   nous intéresse pas ici. */
const SORTIES_TYPES = { cine: [2, 3], stream: [4] };

/* Les salles françaises programment aussi des rétrospectives : Matrix, Alien
   et 2001 étaient réellement « à l'affiche » le jour où l'écran a été construit.
   Vrai, mais pas ce qu'on attend d'une page de sorties : on ne garde que les
   films récents, les reprises restent trouvables par la recherche.

   Deux lignes de défense, parce qu'une seule ne suffit pas :
   1. la date de la fiche (gratuite, écarte Matrix et ses semblables) ;
   2. la première projection au monde, lue dans les dates de sortie du film.
   La seconde attrape ce que la première laisse passer : « Kill Bill : The
   Whole Bloody Affair » a une fiche datée 2026 — le montage intégral ressorti
   cet été — mais sa première mondiale est à Cannes en 2004. Nouveau montage,
   vieux film. */
const SORTIES_RECENT_JOURS = 365;
function sortiesLimite(){
  return new Date(Date.now() - SORTIES_RECENT_JOURS * 86400000).toISOString().slice(0, 10);
}
function sortieRecente(f){
  return (f.release_date || '') >= sortiesLimite();
}
async function pasUneReprise(id){
  const d = await dateFRDe(id);
  return !d.premiere || d.premiere >= sortiesLimite();
}

/* Filtre une liste sur la première mondiale, par petits paquets, en gardant
   l'ordre d'origine (la popularité TMDB). */
async function sansReprises(films, max){
  const out = [];
  for(let i = 0; i < films.length && out.length < max; i += 5){
    const paquet = await Promise.all(films.slice(i, i + 5).map(async f => {
      try{ return (await pasUneReprise(f.id)) ? f : null; }
      catch(e){ return null; }        // sans réponse, on préfère écarter
    }));
    paquet.forEach(f => { if(f && out.length < max) out.push(f); });
  }
  return out;
}

let sorties = { salle: null, cine: null, stream: null,
                etat: 'froid' /* froid | attente | ok | erreur */, quand: 0 };

/* Les vraies dates françaises, film par film. Rempli une fois, gardé.
   Chaque genre garde TOUTES ses dates, triées : un film ressorti en salle a
   deux dates ciné, et c'est à l'appelant de choisir celle qui l'intéresse. */
const datesFR = {};                  // id → { cine:[...], stream:[...] }

async function dateFRDe(id){
  if(datesFR[id]) return datesFR[id];
  const rep = await tmdb('/movie/' + id + '/release_dates');
  const fr = ((rep.results || []).find(r => r.iso_3166_1 === 'FR') || {}).release_dates || [];
  const prendre = types => fr.filter(d => types.includes(d.type) && d.release_date)
                             .map(d => d.release_date.slice(0, 10)).sort();
  /* La première projection au monde, tous pays et tous types confondus :
     c'est elle qui dit si un film est neuf ou ressorti. */
  const toutes = (rep.results || [])
    .flatMap(r => (r.release_dates || []).map(d => (d.release_date || '').slice(0, 10)))
    .filter(Boolean).sort();
  return (datesFR[id] = { cine: prendre(SORTIES_TYPES.cine), stream: prendre(SORTIES_TYPES.stream),
                          premiere: toutes[0] || null });
}

/* La première date du genre dans [de, a], ou null. */
function dansFenetre(dates, de, a){
  return (dates || []).find(x => x >= de && x <= a) || null;
}

/* Garde les films dont une date française du bon genre tombe dans la fenêtre,
   triés par date. Les dates sont demandées par petits paquets : une liste de
   dix films ne justifie pas dix requêtes simultanées sur un téléphone. */
async function avecDatesFR(films, genre, de, a){
  const out = [];
  const src = films.slice(0, SORTIES_MONTRES * 2);       // marge : certains seront écartés
  for(let i = 0; i < src.length && out.length < SORTIES_MONTRES; i += 5){
    const paquet = await Promise.all(src.slice(i, i + 5).map(async f => {
      try{
        const dates = await dateFRDe(f.id);
        /* Une reprise a une date française toute neuve — c'est justement le
           piège : la première mondiale tranche. */
        if(dates.premiere && dates.premiere < sortiesLimite()) return null;
        const d = dansFenetre(dates[genre], de, a);
        return d ? Object.assign({ dfr: d }, f) : null;
      }catch(e){ return null; }
    }));
    paquet.forEach(f => { if(f && out.length < SORTIES_MONTRES) out.push(f); });
  }
  return out.sort((a2, b) => a2.dfr.localeCompare(b.dfr));
}

/* Sur quel abonnement le film vient-il d'arriver ? Connu seulement une fois le
   film en ligne — les plateformes n'annoncent rien à l'avance à TMDB, c'est
   vérifié. D'où le sens de la section : ce qui vient d'arriver, pas ce qui
   arrivera. Les offres à la pub et les revendeurs sont repliés sur la
   plateforme mère, comme partout dans l'app (PLATES_PUB). */
async function plateformesDe(id){
  const rep = await tmdb('/movie/' + id + '/watch/providers');
  const fr = ((rep.results || {}).FR || {});
  const noms = [];
  (fr.flatrate || []).forEach(p => {
    const nom = (p.provider_name || '').trim();
    if(nom && !PLATES_PUB.test(nom) && noms.indexOf(nom) < 0) noms.push(nom);
  });
  return noms;
}

async function chargerSorties(force){
  if(sorties.etat === 'attente') return;
  if(!force && sorties.etat === 'ok' && Date.now() - sorties.quand < SORTIES_TTL) return;
  sorties.etat = 'attente'; render();
  try{
    const auj = todayISO();
    const fin   = new Date(Date.now() + SORTIES_FENETRE * 86400000).toISOString().slice(0, 10);
    const debut = new Date(Date.now() - SORTIES_RECUL   * 86400000).toISOString().slice(0, 10);
    const [salle, prochains, numerique] = await Promise.all([
      tmdb('/movie/now_playing', { region: 'FR', page: '1' }),
      tmdb('/movie/upcoming',    { region: 'FR', page: '1' }),
      /* Arrivées numériques des deux dernières semaines : c'est là que la
         plateforme est connue. */
      tmdb('/discover/movie', { region: 'FR', watch_region: 'FR', with_release_type: '4',
        sort_by: 'popularity.desc', 'release_date.gte': debut, 'release_date.lte': auj })
    ]);
    const net = l => (l.results || []).filter(f => f && f.id && (f.title || '').trim() && sortieRecente(f));
    /* À l'affiche : la liste TMDB fait foi pour « qui est en salle », mais
       chaque film passe le contrôle de première mondiale. Pas de compteur :
       le total TMDB inclut les reprises et tout le fond de catalogue, il ne
       correspondrait jamais à la rangée affichée. */
    sorties.salle = { films: await sansReprises(net(salle), 12) };
    const cine = await avecDatesFR(net(prochains), 'cine', auj, fin);

    /* Le streaming : films arrivés récemment, gardés seulement si au moins un
       abonnement les propose — sans plateforme, la ligne ne dirait rien. */
    const candidats = await avecDatesFR(net(numerique), 'stream', debut, auj);
    const stream = [];
    for(let i = 0; i < candidats.length; i += 5){
      await Promise.all(candidats.slice(i, i + 5).map(async f => {
        try{
          const noms = await plateformesDe(f.id);
          if(noms.length) stream.push(Object.assign({ plates: noms }, f));
        }catch(e){ /* sans réponse, pas de ligne */ }
      }));
    }
    stream.sort((a, b) => b.dfr.localeCompare(a.dfr));   // le plus frais d'abord

    sorties.cine = cine; sorties.stream = stream;
    sorties.etat = 'ok'; sorties.quand = Date.now();
  }catch(e){
    sorties.etat = 'erreur';
  }
  if(view === 'sorties') render();
}

/* ---------- Le rendu ---------- */

function carteSortie(f){
  const note = f.vote_average ? Math.round(f.vote_average * 10) / 10 : null;
  return '<div class="pcard sortiecarte" onclick="openPreview(' + f.id + ',\'movie\',\'sorties\')">' +
    '<div class="wrapimg">' + posterEl(f.poster_path, 'w342', '', f.title) + '</div>' +
    '<div class="pname">' + esc(f.title) + '</div>' +
    (note ? '<div class="psub">' + I.star + ' ' + note + '</div>' : '') +
  '</div>';
}

function lignesSorties(films, mot){
  let cur = '', html = '<div class="day">';
  films.forEach(f => {
    if(f.dfr !== cur){ cur = f.dfr; html += '<div class="daylbl">' + fmtDayLabel(f.dfr) + '</div>'; }
    html += '<div class="crow" onclick="openPreview(' + f.id + ',\'movie\',\'sorties\')">' +
      (f.backdrop_path || f.poster_path
        ? '<img class="cthumb" loading="lazy" src="' + IMG(f.backdrop_path || f.poster_path, 'w300') + '" alt="">'
        : '<div class="cthumb"></div>') +
      '<div class="epinfo">' +
        '<div class="epname">' + esc(f.title) + '</div>' +
        '<div class="epsub">' + (f.plates ? 'Sur ' + esc(f.plates.join(', ')) : mot) + '</div>' +
      '</div></div>';
  });
  return html + '</div>';
}

function sectionVide(texte){
  return '<div class="wrap" style="padding-top:0"><div class="card" style="padding:16px;text-align:center">' +
    '<div class="small muted">' + esc(texte) + '</div></div></div>';
}

/* Trois sections empilées faisaient un écran interminable, et les puces du
   haut ressemblaient à des filtres sans en être : le retour d'Adrien, capture
   à l'appui. Désormais les puces sont de vrais onglets — une seule section
   affichée à la fois, comme dans Découvrir. L'écran s'ouvre sur l'affiche. */
function viewSorties(){
  if(!ui.sortiesOnglet) ui.sortiesOnglet = 'salle';
  if(sorties.etat === 'froid' || (sorties.etat === 'ok' && Date.now() - sorties.quand > SORTIES_TTL))
    setTimeout(() => chargerSorties(false), 0);

  let html = header('Sorties', {
    sub: '<div class="chips" style="padding:0 16px 10px">' +
      [['salle', 'Au cinéma'], ['cine', 'Bientôt au cinéma'], ['stream', 'Nouveau en streaming']]
        .map(([id, l]) => '<button class="chip' + (ui.sortiesOnglet === id ? ' on' : '') + '" ' +
          'onclick="choisirSorties(\'' + id + '\')">' + l + '</button>').join('') +
    '</div>'
  });

  if(sorties.etat === 'attente' || sorties.etat === 'froid')
    return html + '<div class="empty"><span class="spin"></span>' +
      '<p style="margin-top:12px">Chargement des sorties…</p></div>';
  if(sorties.etat === 'erreur')
    return html + '<div class="empty"><h3>Oups</h3><p>Impossible de charger les sorties.</p>' +
      '<button class="btn ghost" onclick="chargerSorties(true)">Réessayer</button></div>';

  if(ui.sortiesOnglet === 'salle'){
    /* Une vraie grille pleine page : les douze films d'un coup d'œil, au lieu
       d'une rangée à faire défiler du pouce. */
    html += sorties.salle.films.length
      ? '<div class="pgrid" style="margin-top:6px">' + sorties.salle.films.map(carteSortie).join('') + '</div>'
      : sectionVide('Rien à l\'affiche — ce serait étonnant, réessaie plus tard.');
  } else if(ui.sortiesOnglet === 'cine'){
    html += sorties.cine.length
      ? lignesSorties(sorties.cine, 'Sortie salle')
      : sectionVide('Aucune sortie salle datée pour la France dans les ' + SORTIES_FENETRE + ' prochains jours.');
  } else {
    html += sorties.stream.length
      ? lignesSorties(sorties.stream, '')
      : sectionVide('Aucune arrivée sur un abonnement ces ' + SORTIES_RECUL + ' derniers jours.');
    html += '<div class="wrap tiny muted" style="padding-top:14px">' +
      'Plateformes pour la France, fournies par TMDB et JustWatch. Elles ne sont connues ' +
      'qu\'une fois le film en ligne — personne ne les annonce à l\'avance de façon fiable.</div>';
  }

  return html + '<div style="height:26px"></div>';
}

function choisirSorties(id){
  ui.sortiesOnglet = id;
  render();
  window.scrollTo(0, 0);
}

/* ---------- « Bientôt » dans À suivre : la version personnelle ----------

   Même donnée, autre question : non plus « qu'est-ce qui sort ? » mais
   « est-ce qu'un de MES films arrive ? ». Concernés : les films de la liste
   « À voir » et ceux où la cloche est allumée. Les dates viennent du même
   cache film par film que l'onglet Sorties — jamais de la fiche locale, dont
   la date est celle de la sortie d'origine, pas de la France. */

let bientotPerso = { films: null, cle: '', attente: false };

function filmsSuivisIds(){
  const ids = {};
  Object.values(db.movies).forEach(m => { if(!m.seen) ids[m.id] = 1; });
  Object.keys((db.notif && db.notif.titres) || {}).forEach(k => {
    if(k.indexOf('movie:') === 0) ids[Number(k.slice(6))] = 1;
  });
  return Object.keys(ids).map(Number);
}

async function chargerBientotPerso(){
  const ids = filmsSuivisIds();
  const cle = ids.slice().sort((a, b) => a - b).join(',');
  if(bientotPerso.attente || (bientotPerso.films && bientotPerso.cle === cle)) return;
  bientotPerso.attente = true;
  const auj = todayISO();
  const fin = new Date(Date.now() + SORTIES_FENETRE * 86400000).toISOString().slice(0, 10);
  const out = [];
  try{
    for(let i = 0; i < ids.length; i += 5){
      await Promise.all(ids.slice(i, i + 5).map(async id => {
        try{
          const d = await dateFRDe(id);
          const m = db.movies[id];
          const titre = m ? m.title : '';
          if(!titre) return;
          const dc = dansFenetre(d.cine, auj, fin);
          if(dc) out.push({ id: id, titre: titre, dfr: dc, mot: 'Sort au cinéma',
                            image: m.backdrop || m.poster });
          /* Les deux peuvent tomber dans la fenêtre (salle puis numérique) :
             ce sont deux nouvelles distinctes, on annonce les deux. */
          const ds = dansFenetre(d.stream, auj, fin);
          if(ds){
            /* La plateforme, si elle est déjà connue — c'est-à-dire le jour J
               ou après. Avant, personne ne la connaît, et on ne devine pas. */
            let noms = [];
            try{ noms = await plateformesDe(id); }catch(e){}
            out.push({ id: id, titre: titre, dfr: ds,
                       mot: noms.length ? 'Arrive sur ' + noms.join(', ') : 'Arrive en streaming',
                       image: m.backdrop || m.poster });
          }
        }catch(e){ /* film sans réponse : on ne montre rien plutôt que faux */ }
      }));
    }
    out.sort((a, b) => a.dfr.localeCompare(b.dfr));
    bientotPerso = { films: out, cle: cle, attente: false };
  }catch(e){
    bientotPerso.attente = false;
    return;                       // on retentera au prochain passage
  }
  if(view === 'follow') render();
}

/* Le HTML de la section, ou '' : une section vide n'existe pas. */
function blocBientotPerso(){
  const ids = filmsSuivisIds();
  if(!ids.length) return '';
  const cle = ids.slice().sort((a, b) => a - b).join(',');
  if(!bientotPerso.films || bientotPerso.cle !== cle) setTimeout(chargerBientotPerso, 0);
  const films = (bientotPerso.cle === cle && bientotPerso.films) ? bientotPerso.films : [];
  if(!films.length) return '';
  let cur = '', html = '<div class="sectitle">Bientôt<span class="cnt">' + films.length + '</span></div><div class="day">';
  films.forEach(f => {
    if(f.dfr !== cur){ cur = f.dfr; html += '<div class="daylbl">' + fmtDayLabel(f.dfr) + '</div>'; }
    html += '<div class="crow" onclick="go(\'movie\',{id:' + f.id + ',from:\'follow\'})">' +
      (f.image ? '<img class="cthumb" loading="lazy" src="' + IMG(f.image, 'w300') + '" alt="">'
               : '<div class="cthumb"></div>') +
      '<div class="epinfo">' +
        '<div class="epname">' + esc(f.titre) + '</div>' +
        '<div class="epsub">' + f.mot + '</div>' +
      '</div></div>';
  });
  return html + '</div>';
}
