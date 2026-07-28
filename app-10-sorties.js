"use strict";
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

const SORTIES_FENETRE = 60;          // jours d'avance pour les deux « bientôt »
const SORTIES_MONTRES = 10;          // lignes par liste : au-delà, c'est du bruit
const SORTIES_TTL = 30 * 60000;      // on ne redemande pas tout à chaque visite

/* 2 = avant-première limitée, 3 = salle ; 4 = numérique. Le physique (5) ne
   nous intéresse pas ici. */
const SORTIES_TYPES = { cine: [2, 3], stream: [4] };

let sorties = { salle: null, cine: null, stream: null,
                etat: 'froid' /* froid | attente | ok | erreur */, quand: 0 };

/* Les vraies dates françaises, film par film. Rempli une fois, gardé. */
const datesFR = {};                  // id → { cine:'2026-07-29'|null, stream:...|null }

async function dateFRDe(id){
  if(datesFR[id]) return datesFR[id];
  const rep = await tmdb('/movie/' + id + '/release_dates');
  const fr = ((rep.results || []).find(r => r.iso_3166_1 === 'FR') || {}).release_dates || [];
  const prendre = types => {
    const bonnes = fr.filter(d => types.includes(d.type) && d.release_date)
                     .map(d => d.release_date.slice(0, 10)).sort();
    return bonnes[0] || null;
  };
  return (datesFR[id] = { cine: prendre(SORTIES_TYPES.cine), stream: prendre(SORTIES_TYPES.stream) });
}

/* Garde les films dont la date française du bon genre tombe dans la fenêtre,
   triés par date. Les dates sont demandées par petits paquets : une liste de
   dix films ne justifie pas dix requêtes simultanées sur un téléphone. */
async function avecDatesFR(films, genre){
  const auj = todayISO();
  const fin = new Date(Date.now() + SORTIES_FENETRE * 86400000).toISOString().slice(0, 10);
  const out = [];
  const src = films.slice(0, SORTIES_MONTRES * 2);       // marge : certains seront écartés
  for(let i = 0; i < src.length && out.length < SORTIES_MONTRES; i += 5){
    const paquet = await Promise.all(src.slice(i, i + 5).map(async f => {
      try{
        const d = (await dateFRDe(f.id))[genre];
        return (d && d >= auj && d <= fin) ? Object.assign({ dfr: d }, f) : null;
      }catch(e){ return null; }
    }));
    paquet.forEach(f => { if(f && out.length < SORTIES_MONTRES) out.push(f); });
  }
  return out.sort((a, b) => a.dfr.localeCompare(b.dfr));
}

async function chargerSorties(force){
  if(sorties.etat === 'attente') return;
  if(!force && sorties.etat === 'ok' && Date.now() - sorties.quand < SORTIES_TTL) return;
  sorties.etat = 'attente'; render();
  try{
    const auj = todayISO();
    const fin = new Date(Date.now() + SORTIES_FENETRE * 86400000).toISOString().slice(0, 10);
    const [salle, prochains, numerique] = await Promise.all([
      tmdb('/movie/now_playing', { region: 'FR', page: '1' }),
      tmdb('/movie/upcoming',    { region: 'FR', page: '1' }),
      tmdb('/discover/movie', { region: 'FR', watch_region: 'FR', with_release_type: '4',
        sort_by: 'popularity.desc', 'release_date.gte': auj, 'release_date.lte': fin })
    ]);
    const net = l => (l.results || []).filter(f => f && f.id && (f.title || '').trim());
    /* À l'affiche : la liste TMDB fait foi, aucune date n'est montrée. */
    sorties.salle = { total: salle.total_results || 0, films: net(salle).slice(0, 12) };
    /* Les deux « bientôt » : chaque date est revérifiée à la source. */
    const [cine, stream] = await Promise.all([
      avecDatesFR(net(prochains), 'cine'),
      avecDatesFR(net(numerique), 'stream')
    ]);
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
        '<div class="epsub">' + mot + '</div>' +
      '</div></div>';
  });
  return html + '</div>';
}

function sectionVide(texte){
  return '<div class="wrap" style="padding-top:0"><div class="card" style="padding:16px;text-align:center">' +
    '<div class="small muted">' + esc(texte) + '</div></div></div>';
}

function viewSorties(){
  if(sorties.etat === 'froid' || (sorties.etat === 'ok' && Date.now() - sorties.quand > SORTIES_TTL))
    setTimeout(() => chargerSorties(false), 0);

  let html = header('Sorties', {
    sub: '<div class="chips" style="padding:0 16px 10px">' +
      [['salle', 'Au cinéma'], ['cine', 'Bientôt au cinéma'], ['stream', 'Bientôt en streaming']]
        .map(([id, l]) => '<button class="chip" onclick="allerSection(\'sor-' + id + '\')">' + l + '</button>').join('') +
    '</div>'
  });

  if(sorties.etat === 'attente' || sorties.etat === 'froid')
    return html + '<div class="empty"><span class="spin"></span>' +
      '<p style="margin-top:12px">Chargement des sorties…</p></div>';
  if(sorties.etat === 'erreur')
    return html + '<div class="empty"><h3>Oups</h3><p>Impossible de charger les sorties.</p>' +
      '<button class="btn ghost" onclick="chargerSorties(true)">Réessayer</button></div>';

  html += '<div class="sectitle" id="sor-salle">Au cinéma en ce moment' +
    (sorties.salle.total ? '<span class="cnt">' + sorties.salle.total + '</span>' : '') + '</div>';
  html += sorties.salle.films.length
    ? '<div class="filmrow">' + sorties.salle.films.map(carteSortie).join('') + '</div>'
    : sectionVide('Rien à l\'affiche — ce serait étonnant, réessaie plus tard.');

  html += '<div class="sectitle" id="sor-cine">Bientôt au cinéma</div>';
  html += sorties.cine.length
    ? lignesSorties(sorties.cine, 'Sortie salle')
    : sectionVide('Aucune sortie salle datée pour la France dans les ' + SORTIES_FENETRE + ' prochains jours.');

  html += '<div class="sectitle" id="sor-stream">Bientôt en streaming</div>';
  html += sorties.stream.length
    ? lignesSorties(sorties.stream, 'Disponible en numérique')
    : sectionVide('Aucune arrivée numérique datée pour la France dans les ' + SORTIES_FENETRE + ' prochains jours.');

  html += '<div class="wrap tiny muted" style="padding-top:14px;padding-bottom:26px">' +
    'Dates de sortie pour la France, fournies par TMDB. Un film sans date française confirmée n\'apparaît pas.</div>';
  return html;
}

function allerSection(id){
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          if(d.cine && d.cine >= auj && d.cine <= fin)
            out.push({ id: id, titre: titre, dfr: d.cine, mot: 'Sort au cinéma',
                       image: m.backdrop || m.poster });
          /* Les deux peuvent tomber dans la fenêtre (salle puis numérique) :
             ce sont deux nouvelles distinctes, on annonce les deux. */
          if(d.stream && d.stream >= auj && d.stream <= fin)
            out.push({ id: id, titre: titre, dfr: d.stream, mot: 'Arrive en streaming',
                       image: m.backdrop || m.poster });
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
