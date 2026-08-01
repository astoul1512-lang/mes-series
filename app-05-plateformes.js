"use strict";
/* ---------- Où regarder : plateformes de streaming ----------
   TMDB fournit la disponibilité par pays grâce à son partenariat avec JustWatch,
   qui doit être cité. On ne montre que ce qui est inclus dans un abonnement
   (« flatrate ») ; le lien renvoie vers la page TMDB qui liste toutes les offres. */
const REGION_PLATO = 'FR';
const platos = {};                 // clé « tv:1399 » → {abo, lien} · 'attente' · null si échec

async function chargerPlateformes(type, id){
  const k = type+':'+id;
  if(platos[k] !== undefined) return;
  platos[k] = 'attente';
  try{
    const d = await tmdb('/'+type+'/'+id+'/watch/providers');
    const r = (d && d.results && d.results[REGION_PLATO]) || {};
    platos[k] = {
      abo:  Array.isArray(r.flatrate) ? r.flatrate : [],
      lien: (typeof r.link === 'string') ? r.link : ''
    };
  }catch(e){ delete platos[k]; }   // on oublie l'échec pour pouvoir réessayer à la prochaine ouverture
  peindrePlateformes(k);
}

function peindrePlateformes(k){
  const el = document.getElementById('plats');
  if(el && el.getAttribute('data-cle') === k) el.innerHTML = corpsPlateformes(k);
}

/* Emplacement réservé dans la page ; le contenu arrive dès la réponse. */
function blocPlateformes(type, id){
  const k = type+':'+id;
  if(platos[k] === undefined) setTimeout(()=>chargerPlateformes(type, id), 0);
  return '<div id="plats" data-cle="'+esc(k)+'">'+corpsPlateformes(k)+'</div>';
}

function corpsPlateformes(k){
  const p = platos[k];
  if(p === undefined || p === 'attente' || p === null) return '';   // rien tant qu'on ne sait pas
  const credit = '<div class="credit">Disponibilité fournie par JustWatch'+
    (p.lien ? ' · <a href="'+esc(p.lien)+'" target="_blank" rel="noopener">toutes les offres</a>' : '')+
    '</div>';
  if(!p.abo.length)
    return '<div class="sectitle">Où le regarder</div>'+
      '<div class="small muted" style="margin:0 16px">Aucun abonnement ne le propose en France.</div>'+
      credit;
  return '<div class="sectitle">Où le regarder</div><div class="plats">'+
    p.abo.map(f=>{
      const nom = f && f.provider_name ? String(f.provider_name) : '';
      const img = f && srcImage(f.logo_path,'w92') ? '<img loading="lazy" src="'+srcImage(f.logo_path,'w92')+'" alt="">'
                                   : '<div class="ph3">'+esc(nom.slice(0,1))+'</div>';
      return '<div class="plato">'+img+'<span>'+esc(nom)+'</span></div>';
    }).join('')+'</div>'+credit;
}

/* ---------- Casting ----------
   Chaque visage mène à la filmographie de la personne. Les fiches déjà en
   bibliothèque n'embarquent pas leur casting (on ne stocke que ce qui sert au
   suivi) : on va le chercher à l'ouverture, et on repeint la section. */
const castings = {};                 // 'tv:1399' → tableau | 'attente'

/* Un seul aller-retour sert le casting et la bande-annonce : les deux zones de
   la fiche appellent cette fonction, la seconde tombe sur le verrou et attend
   le même résultat. */
async function chargerFiche(type, id){
  const k = type+':'+id;
  if(castings[k] !== undefined){
    /* Le casting est là mais la bande-annonce a pu échouer seule (le repli
       anglais tombé en panne) : sans ce rattrapage, le verrou commun la
       condamnait jusqu'au prochain démarrage. Pas pendant qu'un chargement
       est en cours, lui remplira les deux. */
    if(castings[k] !== 'attente' && bandes[k] === undefined) semerBande(type, id);
    return;
  }
  castings[k] = 'attente';
  try{
    const d = await tmdb('/'+type+'/'+id, { append_to_response:'credits,videos' });
    castings[k] = ((d.credits||{}).cast||[]).slice(0, 16);
    /* La langue d'origine sert aux suggestions : sur un titre japonais, les
       recommandations japonaises ont le droit de rester. */
    if(d.original_language) langueDe[k] = d.original_language;
    peindreCasting(k);
    await semerBande(type, id, d);
  }catch(e){ delete castings[k]; peindreCasting(k); }  // un échec s'oublie, pour réessayer
}
function peindreCasting(k){
  const el = document.getElementById('cast-'+k);
  if(el) el.innerHTML = castStrip(castings[k]);
}
/* Emplacement réservé dans une fiche : rempli dès que le casting arrive. */
function zoneCasting(type, id){
  const k = type+':'+id;
  setTimeout(()=> chargerFiche(type, id), 0);
  return '<div id="cast-'+k+'">'+castStrip(castings[k])+'</div>';
}

function castStrip(cast){
  if(!cast || cast === 'attente' || !cast.length) return '';
  return '<div class="sectitle">Casting</div><div class="cast" data-rail="cast">'+cast.slice(0,16).map(p=>
    '<button class="cperson" onclick="ouvrirActeur('+p.id+')">'+
      (srcImage(p.profile_path,'w185') ? '<img loading="lazy" src="'+srcImage(p.profile_path,'w185')+'" alt="">'
                      : '<div class="ph2">'+esc((p.name||'?')[0])+'</div>')+
      '<div class="cname">'+esc(p.name)+'</div>'+
      '<div class="crole">'+esc(p.character||'')+'</div>'+
    '</button>').join('')+'</div>';
}

/* ---------- « Dans le même esprit » ----------
   Les recommandations TMDB du titre : ce que les gens qui l'ont aimé ont
   aussi aimé. En bas de chaque fiche — découverte comme bibliothèque — pour
   rebondir une fois la fiche lue. Même règle d'origine que Découvrir, avec
   la même nuance : les titres de la langue du titre regardé restent, sinon
   la rangée d'un animé japonais serait toujours vide. */
const recos = {};                    // 'tv:1399' → 'attente' | tableau | null (rien)
const langueDe = {};                 // 'tv:1399' → 'ja' — remplie par les fiches

async function chargerRecos(type, id){
  const k = type+':'+id;
  if(recos[k] !== undefined) return;
  recos[k] = 'attente';
  try{
    const d = await tmdb('/'+type+'/'+id+'/recommendations');
    const langue = langueDe[k] || null;
    const gardes = (d.results||[])
      .filter(r => r && r.poster_path && (r.title || r.name))
      /* E7 — la règle d'origine vit dans `origineAdmise` (app-04) et nulle part
         ailleurs. `langue` est celle du titre dont on part : ses
         recommandations gardent son origine. */
      .filter(r => origineAdmise(r.original_language, langue))
      .slice(0, 12);
    recos[k] = gardes.length ? gardes : null;
  }catch(e){ delete recos[k]; }      // un échec s'oublie, pour réessayer
  peindreRecos(k, type);
}
function peindreRecos(k, type){
  const el = document.getElementById('reco-'+k);
  if(el) el.innerHTML = recoStrip(recos[k], type);
}
/* Emplacement réservé dans une fiche : rempli dès que les suggestions arrivent. */
function zoneRecos(type, id){
  const k = type+':'+id;
  setTimeout(()=> chargerRecos(type, id), 0);
  return '<div id="reco-'+k+'">'+recoStrip(recos[k], type)+'</div>';
}
function recoStrip(l, type){
  if(!l || l === 'attente' || !l.length) return '';
  return '<div class="sectitle">Dans le même esprit</div><div class="filmrow" data-rail="similaires">'+
    l.map(r=>'<div class="pcard sortiecarte" onclick="ouvrirTitre('+r.id+',\''+type+'\', view)">'+
      '<div class="wrapimg">'+posterEl(r.poster_path,'w342','',r.title||r.name)+'</div>'+
      '<div class="pname">'+esc(r.title||r.name)+'</div>'+
      (r.vote_average ? '<div class="psub">'+I.star+' '+(Math.round(r.vote_average*10)/10)+'</div>' : '')+
    '</div>').join('')+'</div>';
}

/* ---------- Bande-annonce ----------
   TMDB range les vidéos d'un titre sous `videos`, obtenues en même temps que la
   fiche par `append_to_response`. Deux pièges :
   — la liste est filtrée sur la langue demandée, et en français elle est très
     souvent vide : on retente une fois en anglais avant de conclure qu'il n'y a
     pas de bande-annonce ;
   — tout n'est pas une bande-annonce (coulisses, extraits, featurettes) et tout
     n'est pas sur YouTube. On ne garde que Trailer et Teaser hébergés là. */
const bandes = {};                   // 'tv:1399' → {key, nom} | null (aucune) | 'attente'

function choisirBande(videos){
  const rang = v => v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 1 : 9;
  const bons = (videos||[])
    .filter(v => v && v.site === 'YouTube' && v.key && rang(v) < 9)
    .sort((a,b) => rang(a) - rang(b) || (b.official?1:0) - (a.official?1:0));
  return bons.length ? { key: bons[0].key, nom: bons[0].name || 'Bande-annonce' } : null;
}

/* Reçoit la fiche déjà chargée (ou va la rechercher si on ne la lui donne pas) :
   on lit d'abord les vidéos françaises, et on ne repart chercher en anglais que
   si le français n'a rien donné. */
async function semerBande(type, id, d){
  const k = type+':'+id;
  if(bandes[k] !== undefined) return;
  bandes[k] = 'attente';
  try{
    if(!d) d = await tmdb('/'+type+'/'+id, { append_to_response:'videos' });
    let b = choisirBande(((d && d.videos || {}).results) || []);
    if(!b){
      const e = await tmdb('/'+type+'/'+id, { append_to_response:'videos', language:'en-US' });
      b = choisirBande(((e.videos||{}).results)||[]);
    }
    bandes[k] = b || null;           // null = cherché, rien trouvé : on ne recommence pas
  }catch(err){ delete bandes[k]; }   // un échec s'oublie, pour pouvoir réessayer
  peindreBande(k);
}
function boutonBande(k){
  const b = bandes[k];
  if(!b || b === 'attente') return '';
  /* `escJs` et pas la clé nue : c'est la règle du projet pour TOUTE chaîne
     posée dans un `onclick`, et elle vaut ici comme ailleurs. La clé est
     aujourd'hui « movie:550 », donc l'échappement ne change rien — mais une
     règle qu'on n'applique que là où on croit en avoir besoin n'est plus une
     règle, c'est un pari. */
  return '<button class="btn ghost mini" onclick="ouvrirBande(\''+escJs(k)+'\')">'+I.play+' Bande-annonce</button>';
}
function peindreBande(k){
  const el = document.getElementById('ba-'+k);
  if(el) el.innerHTML = boutonBande(k);
}
/* Emplacement réservé : le bouton n'apparaît que si une bande-annonce existe. */
function zoneBande(type, id){
  const k = type+':'+id;
  setTimeout(()=> chargerFiche(type, id), 0);
  /* `esc` protège la SOURCE ; le parseur redécode l'attribut, si bien que le
     nœud porte la clé brute et que `peindreBande` continue de le retrouver
     avec `k` non échappé. Ne pas « corriger » l'autre bout. */
  return '<div id="ba-'+esc(k)+'" class="zba">'+boutonBande(k)+'</div>';
}
/* ---------- Lecteur ----------
   Le lecteur prend tout l'écran, sur fond noir : la vidéo occupe la plus grande
   surface possible dans les proportions 16:9, en portrait comme en paysage.
   La couche est créée à la volée plutôt que posée dans index.html : le service
   worker garde la page en cache, et une page en retard d'une version se
   retrouverait sans l'emplacement attendu par le script. */
function coucheLecteur(){
  let el = document.getElementById('lecteur');
  if(!el){
    el = document.createElement('div');
    el.id = 'lecteur'; el.className = 'lecteur';
    el.addEventListener('click', e=>{ if(e.target === el) fermerBande(); });
    document.body.appendChild(el);
    /* Au clavier (ordinateur), Échap ferme la vidéo comme partout ailleurs. */
    document.addEventListener('keydown', e=>{
      if(e.key === 'Escape' && lecteurOuvert()) fermerBande();
    });
  }
  return el;
}
function lecteurOuvert(){
  const el = document.getElementById('lecteur');
  return !!(el && el.classList.contains('show'));
}
/* Le plein écran commandé par le site n'existe pas sur iPhone : Safari ne
   l'accorde qu'aux vidéos, jamais à un cadre. Là où il manque, c'est le bouton
   du lecteur YouTube lui-même qui fait le travail — on le dit au lieu d'afficher
   une commande qui ne ferait rien. */
function pleinEcranPossible(){
  return !!(document.fullscreenEnabled &&
            typeof Element !== 'undefined' && Element.prototype.requestFullscreen);
}
function pleinEcran(){
  const e = document.getElementById('ytwrap');
  if(!e) return;
  /* Ces appels rendent des promesses : un refus du navigateur doit rester
     silencieux, pas remonter en erreur non rattrapée. */
  try{
    const p = document.fullscreenElement ? document.exitFullscreen() : e.requestFullscreen();
    if(p && p.catch) p.catch(()=>{});
  }catch(err){}
}
function ouvrirBande(k){
  const b = bandes[k];
  if(!b || b === 'attente') return;
  const id = encodeURIComponent(b.key);
  const el = coucheLecteur();
  el.innerHTML =
    '<div class="lecteurbar">'+
      '<b>'+esc(b.nom)+'</b>'+
      (pleinEcranPossible()
        ? '<button onclick="pleinEcran()" aria-label="Plein écran">'+I.plein+'</button>' : '')+
      '<button onclick="fermerBande()" aria-label="Fermer">'+I.close+'</button>'+
    '</div>'+
    '<div class="ytbox" id="ytwrap"><iframe src="https://www.youtube-nocookie.com/embed/'+id+
      '?autoplay=1&rel=0&playsinline=1" title="Bande-annonce" allowfullscreen '+
      'allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen">'+
    '</iframe></div>'+
    '<div class="lecteurbas">'+
      (pleinEcranPossible() ? ''
        : '<span class="tiny">Plein écran : le bouton en bas à droite du lecteur.</span>')+
      /* Certaines vidéos interdisent la lecture embarquée : le lecteur affiche
         alors une erreur, et ce lien reste la porte de sortie. */
      '<a href="https://www.youtube.com/watch?v='+id+'" target="_blank" rel="noopener">'+
        'Ouvrir dans YouTube</a>'+
    '</div>';
  el.classList.add('show');
  document.body.classList.add('fige');       // la fiche ne défile plus derrière
}
function fermerBande(){
  const el = document.getElementById('lecteur');
  if(!el) return;
  try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(e){}
  el.classList.remove('show');
  el.innerHTML = '';                          // sans ça, le son continuerait
  document.body.classList.remove('fige');
}

function viewPreview(){
  const isTv = params.type==='tv';
  const back = "goBack()";
  const st = ui.preview || {};

  if(st.loading) return header('Chargement…',{back:back})+
    '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Chargement de la fiche…</p></div>';
  if(st.error) return header('Erreur',{back:back})+
    '<div class="empty"><h3>Oups</h3><p>'+esc(st.error)+'</p>'+
    '<button class="btn ghost" onclick="loadPreview()">Réessayer</button></div>';
  if(!st.data) return header('',{back:back});

  const d = st.data;
  const title = isTv ? d.name : d.title;
  const date = isTv ? d.first_air_date : d.release_date;
  const inList = isTv ? !!db.shows[d.id] : !!db.movies[d.id];
  const note = d.vote_average ? Math.round(d.vote_average*10)/10 : null;

  let html = header(title,{back:back});
  html += '<div class="hero">'+(srcImage(d.backdrop_path,'w780')?'<img src="'+srcImage(d.backdrop_path,'w780')+'" alt="">':'')+'</div>';
  html += '<div class="dhead">'+posterEl(d.poster_path,'w342','',title)+
    '<div class="dmeta">'+
      '<h2>'+esc(title)+'</h2>'+
      '<div class="small muted">'+esc(year(date))+
        (isTv && d.networks && d.networks[0] ? ' · '+esc(d.networks[0].name) : '')+
        (!isTv && d.runtime ? ' · '+d.runtime+' min' : '')+'</div>'+
      (note ? '<div style="margin-top:6px"><span class="note">'+I.star+note+'</span>'+
        '<span class="tiny muted" style="margin-left:6px">'+(d.vote_count||0)+' votes</span></div>' : '')+
      '<div class="small muted" style="margin-top:6px">'+esc((d.genres||[]).map(g=>g.name).slice(0,3).join(' · '))+'</div>'+
      zoneBande(isTv?'tv':'movie', d.id)+
    '</div></div>';

  /* Boutons d'action */
  if(isTv){
    /* Une série déjà dans la liste peut se mettre de côté d'ici : le geste
       n'existait qu'au fond du menu ⋮ de sa propre fiche, ou par appui long
       depuis « À rattraper ». Bouton d'icône seule, posé à côté de l'action
       principale — discret, comme demandé, mais toujours à portée. */
    const s0 = db.shows[d.id];
    const enPause = !!(s0 && s0.pause);
    /* Rien à mettre en pause tant que la série n'est pas commencée : le bouton
       n'apparaît donc pas sur une série tout juste ajoutée. Il revient dès le
       premier épisode coché, et reste toujours là pour reprendre. */
    const boutonPause = (enPause || peutSeMettreEnPause(s0))
      ? '<button class="btn ghost carre'+(enPause?' actif':'')+'" onclick="basculerPause('+d.id+')" '+
          'title="'+(enPause?'Reprendre cette série':'Mettre en pause')+'" '+
          'aria-label="'+(enPause?'Reprendre cette série':'Mettre en pause')+'">'+
          (enPause ? I.play : I.pause)+'</button>'
      : '';
    html += '<div class="actions">'+ (inList
      ? '<button class="btn" onclick="go(\'show\',{id:'+d.id+', from:\''+(params.from||'discover')+'\'})">'+I.eye+' Ouvrir ma fiche</button>'+
        boutonPause
      : '<button class="btn" id="addbtn" onclick="addOrOpenShow('+d.id+')">'+I.plus+' Ajouter à ma liste</button>')
      +'</div>'+
      (enPause ? '<div class="wrap" style="padding:8px 16px 0"><div class="tiny muted center">'+
        'En pause : elle n\'apparaît ni dans « À rattraper » ni dans le calendrier.</div></div>' : '');
  } else {
    const m = db.movies[d.id];
    html += '<div class="actions">'+
      /* LOT A — `marquerFilmVu` plutôt que `addMovie(id, true)` : marquer un
         film vu doit poser la question « tu as aimé ? », d'où qu'on le fasse.
         Le détour existe parce que `addMovie` vit dans app-04, hors du
         périmètre de ce lot. */
      '<button class="btn" style="'+(m&&m.seen?'background:var(--ok);color:#08130d':'')+'" onclick="marquerFilmVu('+d.id+')">'+
        I.check+(m&&m.seen?' Déjà vu':' Marquer vu')+'</button>'+
      '<button class="btn ghost" onclick="addMovie('+d.id+',false)">'+I.bookmark+' À voir</button>'+
    '</div>';
  }

  /* Chiffres clés */
  if(isTv){
    html += '<div class="stats">'+
      '<div class="stat"><b>'+(d.number_of_seasons||'?')+'</b><span>saison'+((d.number_of_seasons||0)>1?'s':'')+'</span></div>'+
      '<div class="stat"><b>'+(d.number_of_episodes||'?')+'</b><span>épisodes</span></div>'+
      '<div class="stat"><b>'+(d.episode_run_time&&d.episode_run_time[0]?d.episode_run_time[0]+' min':'—')+'</b><span>par épisode</span></div>'+
    '</div>';
    const totalMin = (d.number_of_episodes||0)*((d.episode_run_time&&d.episode_run_time[0])||42);
    html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:13px;text-align:center">'+
      '<span class="small muted">Tout regarder&nbsp;: </span><b>'+fmtDur(totalMin)+'</b>'+
      '<span class="small muted"> · '+esc(d.status==='Ended'?'série terminée':d.status==='Canceled'?'annulée':'en cours')+'</span>'+
      '</div></div>';
  } else {
    html += '<div class="stats">'+
      '<div class="stat"><b>'+(d.runtime?fmtDurShort(d.runtime):'—')+'</b><span>durée</span></div>'+
      '<div class="stat"><b>'+esc(year(date)||'—')+'</b><span>sortie</span></div>'+
      '<div class="stat"><b>'+(note||'—')+'</b><span>note TMDB</span></div>'+
    '</div>';
  }

  if(d.overview) html += '<div class="sectitle">Synopsis</div><div class="overview" style="margin-top:0">'+esc(d.overview)+'</div>';
  else html += '<div class="overview muted" style="font-style:italic">Pas de synopsis disponible en français.</div>';

  html += blocPlateformes(isTv ? 'tv' : 'movie', d.id);

  /* Détail des saisons, épisode par épisode : voir ce qu'il y a dedans ne
     demande plus d'ajouter la série d'abord. */
  if(isTv) html += blocSaisonsApercu(d);

  html += castStrip(((d.credits||{}).cast||[]));
  html += zoneRecos(isTv ? 'tv' : 'movie', d.id);
  html += '<div style="height:30px"></div>';
  return html;
}

/* ---------- Vue : une personne et tout ce qu'elle a tourné ---------- */
const gens = {};                     // id → { info, roles } | 'attente' | { erreur }

function ouvrirActeur(id){
  /* La cible du retour ne transporte pas de paramètres : on retient le dernier
     acteur ouvert pour pouvoir y revenir depuis une fiche. */
  ui.acteurId = id;
  go('acteur', { id:id, from: view }, 'enter');
  chargerActeur(id);
}

async function chargerActeur(id){
  if(gens[id] && gens[id] !== 'attente' && !gens[id].erreur) return render();
  gens[id] = 'attente';
  render();
  try{
    const [info, credits] = await Promise.all([
      tmdb('/person/'+id),
      tmdb('/person/'+id+'/combined_credits')
    ]);
    gens[id] = { info: info, roles: rangerFilmographie(credits) };
  }catch(e){
    gens[id] = { erreur: 'Impossible de charger cette fiche' };
  }
  if(view === 'acteur') render();
}

/* TMDB répète une même série autant de fois que la personne y a de rôles, et
   mélange les passages en plateau où elle joue son propre rôle. On regroupe, on
   écarte ces derniers, et on classe du plus récent au plus ancien. */
const SOI_MEME = /\b(self|himself|herself|themselves|lui-m[êe]me|elle-m[êe]me)\b/i;
function rangerFilmographie(credits){
  const vus = {};
  ((credits||{}).cast || []).forEach(r=>{
    if(!r || !r.id) return;
    const media = r.media_type === 'movie' ? 'movie' : 'tv';
    if(SOI_MEME.test(r.character||'')) return;
    const k = media+':'+r.id;
    const date = (media === 'movie' ? r.release_date : r.first_air_date) || '';
    if(!vus[k] || (r.vote_count||0) > (vus[k].vote_count||0)){
      vus[k] = Object.assign({}, r, { media:media, date:date });
    }
  });
  return Object.values(vus).sort((a,b)=>{
    if(!a.date) return 1;
    if(!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}

function ageDe(info){
  if(!info || !info.birthday) return '';
  const n = new Date(info.birthday+'T12:00:00');
  const fin = info.deathday ? new Date(info.deathday+'T12:00:00') : new Date();
  let a = fin.getFullYear() - n.getFullYear();
  const m = fin.getMonth() - n.getMonth();
  if(m < 0 || (m === 0 && fin.getDate() < n.getDate())) a--;
  if(a < 0 || a > 130) return '';
  return info.deathday ? 'mort à '+a+' ans' : a+' ans';
}

function basculerBio(){ ui.bioOuverte = !ui.bioOuverte; render(); }
function setActeurTri(t){ ui.acteurTri = t; render(); }

function viewActeur(){
  const id = params.id || ui.acteurId;
  const d = gens[id];
  const back = "goBack()";

  if(!d || d === 'attente')
    return header('Chargement…', {back:back})+
      '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Chargement de la fiche…</p></div>';
  if(d.erreur)
    return header('Oups', {back:back})+
      '<div class="empty"><h3>'+esc(d.erreur)+'</h3><p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerActeur('+id+')">Réessayer</button></div>';

  const info = d.info || {}, roles = d.roles || [];
  const series = roles.filter(r=>r.media === 'tv');
  const films  = roles.filter(r=>r.media === 'movie');
  const tri = ui.acteurTri || 'tout';
  const liste = tri === 'tv' ? series : tri === 'movie' ? films : roles;

  let html = header(info.name || 'Fiche', {back:back});

  /* Identité */
  const meta = [ info.known_for_department === 'Directing' ? 'Réalisation'
               : info.known_for_department === 'Writing' ? 'Écriture' : 'Interprétation',
                 ageDe(info), (info.place_of_birth||'').split(',').pop().trim() ]
               .filter(Boolean).join(' · ');
  html += '<div class="pers">'+
    (info.profile_path
      ? '<img class="persimg" src="'+srcImage(info.profile_path,'w342')+'" alt="">'
      : '<div class="persimg ph2">'+esc((info.name||'?')[0])+'</div>')+
    '<div class="persnom">'+esc(info.name||'')+'</div>'+
    (meta ? '<div class="small muted">'+esc(meta)+'</div>' : '')+
  '</div>';

  /* Biographie, repliée par défaut : trois lignes suffisent à situer quelqu'un. */
  if((info.biography||'').trim()){
    const ouverte = !!ui.bioOuverte;
    html += '<div class="wrap" style="padding-top:0">'+
      '<div class="bio'+(ouverte?' ouverte':'')+'">'+esc(info.biography)+'</div>'+
      '<button class="lienplus" onclick="basculerBio()">'+
        (ouverte ? 'Réduire' : 'Lire la biographie')+'</button>'+
    '</div>';
  }

  /* Filmographie */
  const dejaVus = liste.filter(r=>{
    const it = r.media === 'tv' ? db.shows[r.id] : db.movies[r.id];
    return !!it;
  }).length;

  html += '<div class="sectitle">Filmographie<span class="cnt">'+roles.length+'</span></div>';
  if(series.length && films.length){
    html += '<div class="souschips">'+
      [['tout','Tout',roles.length],['tv','Séries',series.length],['movie','Films',films.length]]
      .map(([k,l,n])=>'<button class="chip '+(tri===k?'on':'')+'" onclick="setActeurTri(\''+k+'\')">'+
        l+' <span style="opacity:.65">'+n+'</span></button>').join('')+'</div>';
  }
  if(dejaVus)
    html += '<div class="wrap" style="padding:0 16px 10px"><span class="tiny muted">'+
      dejaVus+' titre'+(dejaVus>1?'s':'')+' de cette liste '+(dejaVus>1?'sont':'est')+
      ' déjà dans ta bibliothèque</span></div>';

  html += liste.length
    ? '<div class="grid">'+liste.map(r=>carteTitre(r, r.media, 'acteur')).join('')+'</div>'
    : '<div class="empty"><p>Rien à afficher pour ce filtre.</p></div>';

  return html + '<div style="height:30px"></div>';
}

/* ---------- Vue : fiche film de ma liste ---------- */
function viewMovie(){
  const m = db.movies[params.id];
  const back = "goBack()";
  if(!m) return header('Introuvable',{back:"go('profile')"});
  let html = header(m.title,{back:back,
    right: boutonCloche('movie', m.id) +
           '<button class="iconbtn" onclick="movieMenu('+m.id+')">'+I.dots+'</button>'});
  html += '<div class="hero">'+(srcImage(m.backdrop,'w780')?'<img src="'+srcImage(m.backdrop,'w780')+'" alt="">':'')+'</div>';
  html += '<div class="dhead">'+posterEl(m.poster,'w342','',m.title)+
    '<div class="dmeta"><h2>'+esc(m.title)+'</h2>'+
      '<div class="small muted">'+esc(year(m.date))+(m.runtime?' · '+m.runtime+' min':'')+'</div>'+
      (m.note?'<div style="margin-top:6px"><span class="note">'+I.star+(Math.round(m.note*10)/10)+'</span></div>':'')+
      '<div class="small muted" style="margin-top:6px">'+esc((m.genres||[]).slice(0,3).join(' · '))+'</div>'+
      zoneBande('movie', m.id)+
    '</div></div>';
  html += '<div class="actions"><button class="btn block" style="'+(m.seen?'background:var(--ok);color:#08130d':'')+
    '" onclick="toggleMovie('+m.id+')">'+I.check+(m.seen?' Vu le '+fmtDate(new Date(m.watchedAt).toISOString().slice(0,10)):' Marquer comme vu')+'</button></div>';
  if(m.overview) html += '<div class="sectitle">Synopsis</div><div class="overview" style="margin-top:0">'+esc(m.overview)+'</div>';
  html += blocPlateformes('movie', m.id);
  html += zoneCasting('movie', m.id);
  html += zoneRecos('movie', m.id);
  html += '<div style="height:30px"></div>';
  return html;
}
function toggleMovie(id){
  const m = db.movies[id]; if(!m) return;
  m.seen = !m.seen; m.watchedAt = m.seen ? Date.now() : null;
  saveDB(); render();
  /* LOT A, §1.3 — à CHAQUE film marqué vu. Un film est binaire : il n'y a pas
     d'autre moment où poser la question, et pas de raison de la reporter.
     Décocher, en revanche, ne retire pas l'avis : « je ne l'ai plus dans mes
     films vus » ne veut pas dire « je ne l'ai plus aimé ». */
  if(m.seen && typeof signalerFilmVu === 'function') signalerFilmVu(id);
}
/* Marquer un film vu depuis un aperçu — c'est-à-dire depuis un titre qui n'est
   pas encore dans la bibliothèque. `addMovie` fait l'ajout et l'enregistrement ;
   ici on n'ajoute que la question, une fois l'ajout réellement abouti. */
function marquerFilmVu(id){
  const p = addMovie(id, true);
  const suite = ()=>{ if(typeof signalerFilmVu === 'function') signalerFilmVu(id); };
  if(p && typeof p.then === 'function') p.then(suite, ()=>{});
  else suite();
}
function movieMenu(id){
  const m = db.movies[id];
  openSheet('<h3>'+esc(m.title)+'</h3><p class="small muted" style="margin:0 0 8px">'+esc(year(m.date))+'</p>'+
    '<button class="opt danger" onclick="removeMovie('+id+')">Retirer de ma liste</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}
function removeMovie(id){
  const m = db.movies[id];
  const nom = (m && m.title) || 'Le film';
  markDeleted('movies',id); delete db.movies[id]; saveDB(); closeSheet();
  toast('« '+nom+' » retiré de ta liste');
  /* Même règle que pour les séries : on ne quitte l'écran que s'il a disparu
     avec le titre, et on revient alors d'où l'on vient. */
  if(view==='movie') goBack(); else render();
}
