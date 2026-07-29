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
   D'où deux règles absolues ici : on mêle toujours les deux médias, et on
   retire systématiquement ce qui est déjà dans la bibliothèque.
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
   les déduits sinon — et jamais ceux qu'on a écartés. */
function genresRetenus(){
  const g = db.gouts || {};
  const base = (g.genres||[]).length ? g.genres.slice() : genresDeduits();
  const hors = g.exclus || [];
  return base.filter(x => hors.indexOf(x) < 0).slice(0, 3);
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
      out.push({ media:'tv', id:s.id, nom:s.name, score: part * 100 + p.watched });
  });
  Object.values(db.movies).forEach(m=>{
    if(m.seen) out.push({ media:'movie', id:m.id, nom:m.title, score: 60 });
  });
  return out.sort((a,b)=>b.score-a.score);
}

/* Déjà dans la bibliothèque ? Alors ce n'est pas une découverte. */
function dejaChezMoi(media, id){
  return media === 'tv' ? !!db.shows[id] : !!db.movies[id];
}

/* ---------- Le moteur ---------- */

const SUGG_TTL = 12 * 3600000;      // les suggestions se refont deux fois par jour au plus
const SUGG_MAX = 40;                // au-delà, personne ne fait défiler

let suggestions = { etat:'froid' /* froid|attente|ok|erreur */, quand:0,
                    vedettes:[], parce:[], genres:[], acteurs:[], nouveautes:[] };

/* Normalise un résultat TMDB, quel que soit son média. */
function normaliser(r, media){
  const nom = media === 'tv' ? r.name : r.title;
  if(!r || !r.id || !nom || !r.poster_path) return null;
  return { id:r.id, media:media, nom:nom, affiche:r.poster_path, bandeau:r.backdrop_path||null,
           date: media === 'tv' ? r.first_air_date : r.release_date,
           note: r.vote_average || null, votes: r.vote_count || 0,
           genre_ids: r.genre_ids || [], langue: r.original_language || null };
}

/* Le tamis commun à toutes les sources : jamais un titre déjà chez soi, jamais
   un genre écarté, jamais deux fois le même, et la règle d'origine de l'app. */
function tamiser(liste, vus){
  const hors = (db.gouts && db.gouts.exclus) || [];
  const idsHors = hors.map(nom => genreParNom('tv', nom) || genreParNom('movie', nom))
                      .filter(x => x != null);
  return liste.filter(x=>{
    if(!x) return false;
    const cle = x.media + ':' + x.id;
    if(vus[cle]) return false;
    if(dejaChezMoi(x.media, x.id)) return false;
    if(idsHors.some(g => x.genre_ids.indexOf(g) >= 0)) return false;
    if(x.langue && LANGUES_OCCIDENT.indexOf(x.langue) < 0) return false;
    vus[cle] = 1;
    return true;
  });
}

/* Une requête qui ne fait pas tomber tout le moteur si elle échoue : une
   source muette vaut mieux qu'un écran vide. */
async function sourceDouce(promesse){
  try{ return await promesse; }catch(e){ return null; }
}

async function chargerSuggestions(force){
  if(suggestions.etat === 'attente') return;
  if(!force && suggestions.etat === 'ok' && Date.now() - suggestions.quand < SUGG_TTL) return;
  suggestions.etat = 'attente';
  if(typeof peindreDisc === 'function') peindreDisc();
  try{
    await Promise.all([chargerGenres('tv'), chargerGenres('movie')]);
    /* La feuille de filtres peut s'ouvrir depuis la vitrine, sans qu'aucune
       grille n'ait jamais été chargée : sans cet appel, sa liste de plateformes
       était vide. On ne l'attend pas — elle arrive en arrière-plan. */
    if(typeof chargerPlates === 'function' && typeof discMedia === 'function')
      chargerPlates(discMedia()).catch(()=>{});
    const vus = {};
    const aimes = titresAimes().slice(0, 3);
    const genres = genresRetenus();
    const acteurs = ((db.gouts||{}).acteurs || []).slice(0, 2);
    const auj = todayISO();
    const debut = isoIlYA(60);

    /* Les genres, traduits pour chaque média : « Drame » n'a pas le même
       identifiant côté séries et côté films. */
    const idsG = media => genres.map(n => genreParNom(media, n)).filter(x => x != null);

    const demandes = [
      /* 1. « Parce que tu as regardé … » — une source par titre aimé. */
      ...aimes.map(t => sourceDouce(tmdb('/'+t.media+'/'+t.id+'/recommendations'))
        .then(d => ({ genre:'parce', titre:t.nom, media:t.media,
                      l:(d&&d.results||[]).map(r=>normaliser(r, t.media)) }))),
      /* 2. Tes genres, des deux côtés — c'est ce qui mêle films et séries. */
      ...['tv','movie'].map(m => {
        const g = idsG(m);
        if(!g.length) return Promise.resolve({genre:'genres', l:[]});
        return sourceDouce(tmdb('/discover/'+m, { include_adult:'false', page:'1',
            sort_by:'popularity.desc', with_genres:g.join(','), 'vote_count.gte':'150' }))
          .then(d => ({ genre:'genres', l:(d&&d.results||[]).map(r=>normaliser(r, m)) }));
      }),
      /* 3. Les nouveautés, des deux côtés aussi. */
      ...['tv','movie'].map(m => {
        const champ = m === 'movie' ? 'primary_release_date' : 'first_air_date';
        return sourceDouce(tmdb('/discover/'+m, { include_adult:'false', page:'1',
            sort_by:'popularity.desc', [champ+'.gte']:debut, [champ+'.lte']:auj }))
          .then(d => ({ genre:'nouveautes', l:(d&&d.results||[]).map(r=>normaliser(r, m)) }));
      }),
      /* 4. Les acteurs favoris. TMDB ne sait filtrer les séries par acteur que
            pour les films : on passe donc par la filmographie de la personne,
            le même chemin que les fiches acteurs de l'app. */
      ...acteurs.map(a => sourceDouce(tmdb('/person/'+a.id+'/combined_credits'))
        .then(d => ({ genre:'acteurs', titre:a.nom,
                      l:((d&&d.cast)||[])
                        .filter(r => r.media_type === 'tv' || r.media_type === 'movie')
                        .sort((x,y)=>(y.popularity||0)-(x.popularity||0))
                        .map(r => normaliser(r, r.media_type)) })))
    ];

    const rep = await Promise.all(demandes);

    /* On sert d'abord les sources les plus personnelles : ce qui découle de ce
       qu'il a aimé passe avant les nouveautés génériques. */
    const parce = [], parGenre = [], parActeur = [], nouv = [];
    rep.forEach(r=>{
      const l = tamiser(r.l || [], vus).slice(0, 20);
      if(!l.length) return;
      if(r.genre === 'parce')      parce.push({ titre:r.titre, l:l });
      else if(r.genre === 'genres')     parGenre.push(...l);
      else if(r.genre === 'acteurs')    parActeur.push({ titre:r.titre, l:l });
      else                              nouv.push(...l);
    });

    /* Le carrousel du jour : les cinq meilleures, prises dans les sources les
       plus personnelles d'abord. La rotation est calculée à partir de la date,
       donc stable toute la journée et différente demain — rien de tiré au sort,
       sinon la vitrine changerait sous les doigts. */
    const bassin = []
      .concat(...parce.map(p => p.l.map(x => Object.assign({ pourquoi:'Parce que tu as regardé '+p.titre }, x))))
      .concat(...parActeur.map(p => p.l.map(x => Object.assign({ pourquoi:'Avec '+p.titre }, x))))
      .concat(parGenre.map(x => Object.assign({ pourquoi:'Dans tes genres' }, x)))
      .concat(nouv.map(x => Object.assign({ pourquoi:'Nouveauté' }, x)));
    const graine = Math.floor(Date.parse(auj) / 86400000);
    const vedettes = [];
    for(let i = 0; i < 5 && bassin.length; i++){
      const idx = (graine + i * 7) % bassin.length;
      vedettes.push(bassin.splice(idx, 1)[0]);
    }

    suggestions = { etat:'ok', quand:Date.now(), vedettes:vedettes,
                    parce:parce, acteurs:parActeur,
                    genres:parGenre.slice(0, SUGG_MAX), nouveautes:nouv.slice(0, SUGG_MAX) };
  }catch(e){
    suggestions.etat = 'erreur';
  }
  if(view === 'discover' && typeof peindreDisc === 'function') peindreDisc();
}

/* Les rangées de la vitrine, dans l'ordre où elles s'affichent. Chacune mêle
   films et séries — c'est la demande explicite d'Adrien. */
function rangeesSuggerees(){
  const out = [];
  suggestions.parce.forEach(p=>{
    if(p.l.length) out.push({ titre:'Parce que tu as regardé '+p.titre, l:p.l });
  });
  suggestions.acteurs.forEach(p=>{
    if(p.l.length) out.push({ titre:'Avec '+p.titre, l:p.l });
  });
  if(suggestions.genres.length){
    const g = genresRetenus();
    out.push({ titre: g.length ? 'Parce que tu aimes '+g.slice(0,2).join(' et ') : 'Pour toi',
               l: suggestions.genres });
  }
  if(suggestions.nouveautes.length) out.push({ titre:'Sorties récentes', l:suggestions.nouveautes });
  return out;
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
  saveDB(); render();
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
  saveDB(); render();
}
function retirerExclu(nom){
  const g = db.gouts, i = g.exclus.indexOf(nom);
  if(i >= 0) g.exclus.splice(i,1);
}
function retirerActeur(id){
  db.gouts.acteurs = db.gouts.acteurs.filter(a=>String(a.id) !== String(id));
  saveDB(); render();
}
function ajouterActeur(id, nom){
  if(db.gouts.acteurs.some(a=>String(a.id) === String(id))) return;
  db.gouts.acteurs.push({ id:id, nom:nom });
  rechActeur = { q:'', res:null, occupe:false, seq:rechActeur.seq };
  saveDB(); render();
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

  /* Ce que l'app a déduit — montré en clair, pour qu'on sache ce qu'on corrige. */
  const deduits = genresDeduits().slice(0,3);
  if(!g.genres.length && deduits.length){
    html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:12px 14px">'+
      '<div class="tiny muted">D\'après ce que tu regardes, tu aimes</div>'+
      '<div style="font-weight:700;margin-top:2px">'+esc(deduits.join(' · '))+'</div>'+
    '</div></div>';
  }

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

  html += '<div class="sectitle">Acteurs que je suis</div><div class="wrap" style="padding-top:0">';
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

  html += '<div class="wrap" style="padding-top:18px;padding-bottom:30px">'+
    (depuisCompte
      ? '<button class="btn block" onclick="finirGouts()">C\'est parti</button>'+
        '<button class="btn ghost block" style="margin-top:10px" onclick="passerGouts()">Passer</button>'
      : '<div class="tiny muted center">Les suggestions se refont à la prochaine ouverture de Découvrir.</div>')+
  '</div>';
  return html;
}

function finirGouts(){
  db.gouts.propose = true; saveDB();
  suggestions.etat = 'froid';                 // le profil a changé : on recalcule
  go('follow');
}
function passerGouts(){
  db.gouts.propose = true; saveDB();
  go('follow');
}
