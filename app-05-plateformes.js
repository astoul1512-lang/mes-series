"use strict";
/* ---------- Où regarder : plateformes de streaming ----------
   TMDB fournit la disponibilité par pays grâce à son partenariat avec JustWatch,
   qui doit être cité. On ne montre que ce qui est inclus dans un abonnement
   (« flatrate ») ; le lien renvoie vers la page TMDB qui liste toutes les offres. */
const REGION_PLATO = 'FR';
const platos = {};                 // clé « tv:1399 » → {abo, lien} · 'attente' · null si échec

/* Les requêtes en vol, par clé. Sans elles, un second appel pendant le
   chargement repartait avec `platos[k] === 'attente'`, c'est-à-dire sans
   réponse — ce qui n'avait aucune conséquence tant que seul l'affichage
   appelait cette fonction, mais en a une depuis que `plateformesDe`
   (app-10) passe par ce cache. Constat A5-3. */
const platosEnVol = {};

async function chargerPlateformes(type, id){
  const k = type+':'+id;
  if(platosEnVol[k]) return platosEnVol[k];
  if(platos[k] !== undefined) return;
  platos[k] = 'attente';
  platosEnVol[k] = (async ()=>{
  try{
    const d = await tmdb('/'+type+'/'+id+'/watch/providers');
    const r = (d && d.results && d.results[REGION_PLATO]) || {};
    platos[k] = {
      abo:  Array.isArray(r.flatrate) ? r.flatrate : [],
      lien: (typeof r.link === 'string') ? r.link : ''
    };
  }catch(e){ delete platos[k]; }   // on oublie l'échec pour pouvoir réessayer à la prochaine ouverture
  peindrePlateformes(k);
  })();
  try{ await platosEnVol[k]; } finally { delete platosEnVol[k]; }
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
  if(!el) return;
  el.innerHTML = boutonBande(k);
  /* POINT 9 — L'ARRIVÉE, ET SEULEMENT L'ARRIVÉE.
     La classe qui porte l'animation est posée ICI et jamais dans `zoneBande` :
     c'est le seul moment où la ligne apparaît vraiment. Si `zoneBande` la
     posait, le moindre redessin de la fiche (ajouter à « À voir », cocher un
     épisode) rejouerait la croissance sous les yeux de quelqu'un qui n'a rien
     demandé — une bande-annonce déjà connue est là depuis le premier trait. */
  if(el.innerHTML) el.classList.add('fi9arr');
}
/* Aucun emplacement n'est réservé : le nœud reste VIDE tant qu'on cherche, et
   `:empty{display:none}` le retire alors complètement du flux (règle du socle
   pour `.zba`, reprise pour `fi9ba`). Le bouton n'apparaît que si une
   bande-annonce existe.

   POINT 9, 01/08 — `ligne` demande la LIGNE PLEINE LARGEUR posée entre le bloc
   du titre et la rangée d'actions : regarder la bande-annonce est une action au
   même titre que les deux autres, et souvent la première. C'est un paramètre et
   non une seconde fonction parce que la feuille du duel (`ficheDuel`, app-11)
   appelle la MÊME zone dans un contexte où la pleine largeur n'a pas de sens ;
   le rendu du bouton, lui, reste unique — c'est le conteneur qui porte la
   variante, et `peindreBande` n'a donc rien à savoir de l'écran qui l'appelle. */
function zoneBande(type, id, ligne){
  const k = type+':'+id;
  setTimeout(()=> chargerFiche(type, id), 0);
  /* `esc` protège la SOURCE ; le parseur redécode l'attribut, si bien que le
     nœud porte la clé brute et que `peindreBande` continue de le retrouver
     avec `k` non échappé. Ne pas « corriger » l'autre bout. */
  return '<div id="ba-'+esc(k)+'" class="'+(ligne ? 'fi9ba' : 'zba')+'">'+boutonBande(k)+'</div>';
}

/* ---------------------------------------------------------------------------
   POINTS 9 ET 21 — L'ÉTAT « À VOIR », ÉCRIT UNE SEULE FOIS

   Le reproche du 02/08, vidéo à l'appui sur « Demon Slayer : La Forteresse
   Infinie » : « quand je clique sur "à voir" ce n'est pas suffisamment visuel,
   on ne sait pas qu'on l'a ajouté à notre liste. […] quand tu retournes sur la
   fiche, impossible de savoir qu'il est dans ta liste. » Le bouton était écrit
   sans condition : rigoureusement identique avant et après, un message de deux
   secondes, et aucun moyen de retirer.

   PARTI PRIS C, validé le 02/08 (« je valide la proposition C ») : un bloc posé
   JUSTE SOUS les deux boutons — pas de ruban en haut de fiche, qui était la
   proposition D de la même maquette. C'est la maquette du parcours en sept
   écrans qui fait foi, et son bouton s'appelle mot pour mot « C — le bloc sous
   les boutons » : les deux actions restent donc en place. C'est aussi la seule
   lecture qui laisse « Marquer vu » atteignable depuis un titre déjà rangé dans
   la liste à voir — sans quoi le passage de « à voir » à « vu », qui est la
   garantie n°4 du parcours, n'aurait aucun chemin sur la fiche.

   TROIS ÉCRANS, UNE SEULE FONCTION. `viewPreview`, `viewMovie` et `viewShow`
   affichaient déjà le même en-tête avec les mêmes défauts ; deux blocs qui se
   ressemblent, c'est exactement le défaut que ce lot corrige ailleurs.

   LE VOCABULAIRE A ÉTÉ VÉRIFIÉ, et il l'a été deux fois parce qu'il a été faux
   une fois : un titre à voir relève de `statutFilm(m) === 'avoir'` (ou de
   `statutSerie` à zéro épisode vu) et se retrouve dans MON PROFIL, onglet
   « À voir » — `listesProfil().avoir`, app-03. Pas « En cours », qui est le
   libellé de `asuivre`.

   L'EXCLUSIVITÉ EST GARANTIE PAR LE STATUT LUI-MÊME, et non par une condition
   écrite à la main ici : le bloc ne s'affiche que si `statut(o) === 'avoir'`.
   Marquer un film vu bascule `statutFilm` sur 'vu', cocher le premier épisode
   bascule `statutSerie` sur 'asuivre', mettre en pause bascule sur 'pause' —
   dans les trois cas le bloc disparaît au redessin suivant, sans que personne
   ait à y penser. Un titre ne peut pas être à la fois à voir et vu.
--------------------------------------------------------------------------- */

/* Le seul mot qui change entre l'ajout et les retrouvailles : « Ajouté à ta
   liste / Annuler » au moment du geste, « Dans ta liste à voir / Retirer »
   ensuite. Ce n'est pas un état persistant — c'est la mémoire du geste qu'on
   vient de faire, et elle meurt avec l'écran. Deux gardes, parce qu'il n'existe
   aucun crochet de sortie d'écran hors de `go()`, qui n'est pas de ce lot :
   l'écran doit être le MÊME (vue et titre), et le geste doit être récent. Au
   rechargement de l'app la variable n'existe plus, donc « dix jours plus tard »
   dit toujours « Dans ta liste à voir » — c'est la garantie n°2 du parcours. */
let avoirFrais = null;                      // { cle, vue, ref, t } · null = rien de frais
const AVOIR_FRAIS_MS = 90000;

function ajoutAVoirFrais(media, id){
  const f = avoirFrais;
  return !!(f && f.cle === media+':'+String(id) && f.vue === view &&
            f.ref === String(params.id || '') && Date.now() - f.t < AVOIR_FRAIS_MS);
}

/* LE BLOC. Une seule fonction, appelée par les trois fiches. Elle décide seule
   de s'afficher ou non : les appelants n'ont aucune condition à répéter. */
function blocAVoir(media, id){
  const o = media === 'tv' ? db.shows[id] : db.movies[id];
  if(!o || statut(o) !== 'avoir') return '';
  const frais = ajoutAVoirFrais(media, id);
  return '<div class="fi9etat">'+
    '<span class="fi9ic">'+I.bookmark+'</span>'+
    '<span class="fi9tx"><b>'+(frais ? 'Ajouté à ta liste' : 'Dans ta liste à voir')+'</b>'+
      '<i>Sur ton profil, onglet « À voir »</i></span>'+
    /* `escJs` pour TOUTE chaîne posée dans un `onclick` — la règle du projet,
       appliquée ici comme ailleurs même quand les valeurs sont sûres. */
    '<button class="fi9rm" onclick="retirerDeLaListeAVoir(\''+escJs(media)+'\',\''+
      escJs(String(id))+'\')">'+(frais ? 'Annuler' : 'Retirer')+'</button>'+
  '</div>';
}

/* Ajouter un film à la liste à voir. Le détour par une fonction d'ici existe
   pour une seule raison : marquer le geste comme frais AVANT qu'`addMovie`
   (app-04, hors périmètre) ne repeigne l'écran, sans quoi le bloc s'afficherait
   déjà dans sa forme durable au moment même de l'ajout. */
function ajouterAVoir(id){
  avoirFrais = { cle:'movie:'+String(id), vue:view, ref:String(params.id || ''), t:Date.now() };
  addMovie(id, false);
}

/* RETIRER — ce chemin n'existait nulle part avant le 02/08. Il ne réinvente
   rien : `removeMovie` et `removeShow` savent déjà retirer un titre, prévenir,
   et quitter la fiche quand elle disparaît avec lui. Le nom est long exprès :
   il dit de quelle liste on sort, et il ne se confond avec aucun des deux. */
function retirerDeLaListeAVoir(media, id){
  avoirFrais = null;
  const n = Number(id);
  const ref = isFinite(n) ? n : id;
  if(media === 'tv') removeShow(ref);
  else removeMovie(ref);
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
      /* POINT 3, 02/08 — TOUS les genres, et le principal EN TÊTE.
         La troncature à trois faisait mentir la fiche : « Envie de rigoler »
         sortait *Kung Fu Panda 4* en premier résultat, et sa fiche annonçait
         « Action · Aventure · Animation » sans le mot « Comédie ». L'app se
         contredisait sous les yeux de celui qui cherche, alors que la recherche
         avait raison — TMDB classe bien ce film en comédie. `genresOrdonnes`
         (app-04) est la MÊME fonction que celle qui nomme le genre principal
         ailleurs : une seconde version de la règle serait exactement la
         divergence que ce lot combat. */
      '<div class="small muted" style="margin-top:6px">'+
        esc(genresOrdonnes((d.genres||[]).map(g=>g.name)).join(' · '))+'</div>'+
    '</div></div>';

  /* POINT 9 — la bande-annonce quitte le bloc du titre, où elle était le plus
     petit bouton de l'écran (`btn ghost mini`, sous la ligne des genres) pour
     ce qui est souvent la première chose qu'on veut faire. Elle passe en ligne
     pleine largeur, ici : entre le bloc du titre et la rangée d'actions. */
  html += zoneBande(isTv?'tv':'movie', d.id, true);

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
      /* SPEC-10 §3 — le 💌 est sur la fiche d'un titre, suivi OU NON : on
         recommande souvent ce qu'on vient de voir passer, pas seulement ce
         qu'on a déjà rangé chez soi. */
      + boutonRecoFiche('tv', d.id)
      +'</div>'+
      bandeauRecoFiche('tv', d.id)+
      (enPause ? '<div class="wrap" style="padding:8px 16px 0"><div class="tiny muted center">'+
        'En pause : elle n\'apparaît ni dans « À rattraper » ni dans le calendrier.</div></div>' : '')+
      /* POINT 21 — une série ajoutée mais dont aucun épisode n'est coché est,
         elle aussi, dans l'onglet « À voir » du profil (`listesProfil`). Elle a
         donc droit au même bloc et au même « Retirer » : l'état ne dépend pas du
         média, il dépend du statut. */
      blocAVoir('tv', d.id);
  } else {
    const m = db.movies[d.id];
    const vu = !!(m && m.seen);
    html += '<div class="actions">'+
      /* LOT A — `marquerFilmVu` plutôt que `addMovie(id, true)` : marquer un
         film vu doit poser la question « tu as aimé ? », d'où qu'on le fasse.
         Le détour existe parce que `addMovie` vit dans app-04, hors du
         périmètre de ce lot. */
      '<button class="btn" style="'+(vu?'background:var(--ok);color:#08130d':'')+'" onclick="marquerFilmVu('+d.id+')">'+
        I.check+(vu?' Déjà vu':' Marquer vu')+'</button>'+
      /* POINT 21 — trois formes pour la seconde action, et jamais deux à la fois.
         · film vu : RIEN. Proposer « À voir » à côté d'un « Déjà vu » vert
           laisserait croire qu'un titre peut être les deux, ce que le parcours
           validé le 02/08 interdit explicitement.
         · film déjà dans la liste : un témoin, pas un bouton. Il dit où le geste
           a eu lieu ; le seul chemin de retrait est le lien du bloc juste
           dessous, pour qu'il n'y en ait qu'un et qu'il porte un nom.
         · sinon : le bouton, qui passe par `ajouterAVoir` et non plus par
           `addMovie` en direct. */
      (vu ? ''
          : m && statutFilm(m) === 'avoir'
            ? '<span class="btn ghost fi9dans" aria-disabled="true">'+I.bookmark+' Dans ma liste</span>'
            : '<button class="btn ghost" onclick="ajouterAVoir('+d.id+')">'+I.bookmark+' À voir</button>')+
      boutonRecoFiche('movie', d.id)+
    '</div>'+
    bandeauRecoFiche('movie', d.id)+
    blocAVoir('movie', d.id);
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

  /* SPEC-05 §8 — « ✦ POURQUOI IL TE CORRESPOND », AU-DESSUS DU SYNOPSIS ET
     JAMAIS À SA PLACE. Le §8 le dit en toutes lettres : « le synopsis officiel
     reste affiché dessous, intact ». La carte n'apparaît que si l'aperçu vient
     d'une recherche AVEC une sélection active et que l'interrupteur « IA de la
     Recherche » est allumé ; sinon `blocPourquoiIA` rend une chaîne vide et cet
     écran est exactement celui d'avant, à la ligne près. */
  if((params||{}).from === 'search' && typeof blocPourquoiIA === 'function')
    html += blocPourquoiIA(isTv ? 'tv' : 'movie', d.id, title);

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
  /* L'identifiant compte autant que l'écran : ouvrir un second acteur pendant
     que le premier charge faisait repeindre la fiche de B par la réponse de A —
     un clignotement, et la position de lecture perdue.
     Revue de stabilité du 02/08, constat A3-5. */
  if(view === 'acteur' && String(params.id) === String(id)) render();
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
  /* RETOUR-08 — même correction que pour la fiche série (app-06) : on se replie
     au lieu de laisser un écran de trois mots dont la flèche empile. */
  if(!m) return ecranImpossible('movie', 'follow',
    'Ce film n\'est plus dans ta bibliothèque.');
  let html = header(m.title,{back:back,
    right: boutonCloche('movie', m.id) +
           '<button class="iconbtn" onclick="movieMenu('+m.id+')">'+I.dots+'</button>'});
  html += '<div class="hero">'+(srcImage(m.backdrop,'w780')?'<img src="'+srcImage(m.backdrop,'w780')+'" alt="">':'')+'</div>';
  html += '<div class="dhead">'+posterEl(m.poster,'w342','',m.title)+
    '<div class="dmeta"><h2>'+esc(m.title)+'</h2>'+
      '<div class="small muted">'+esc(year(m.date))+(m.runtime?' · '+m.runtime+' min':'')+'</div>'+
      (m.note?'<div style="margin-top:6px"><span class="note">'+I.star+(Math.round(m.note*10)/10)+'</span></div>':'')+
      /* POINT 3 — tous les genres, principal en tête. Voir `viewPreview`. */
      '<div class="small muted" style="margin-top:6px">'+
        esc(genresOrdonnes(m.genres||[]).join(' · '))+'</div>'+
    '</div></div>';
  /* POINT 9 — la ligne pleine largeur, entre le bloc du titre et l'action. */
  html += zoneBande('movie', m.id, true);
  /* SPEC-10 §3 — le 💌 à côté de l'action principale. `block` devient `btn`
     quand il a un voisin : deux boutons pleine largeur l'un sous l'autre
     feraient deux actions principales, ce qu'il n'y a pas. */
  const recoF = boutonRecoFiche('movie', m.id);
  html += '<div class="actions"><button class="'+(recoF ? 'btn' : 'btn block')+'" style="'+(m.seen?'background:var(--ok);color:#08130d':'')+
    '" onclick="toggleMovie('+m.id+')">'+I.check+(m.seen ? (dateVue(m.watchedAt) ? ' Vu le '+dateVue(m.watchedAt) : ' Vu') : ' Marquer comme vu')+'</button>'+
    recoF+'</div>'+
    bandeauRecoFiche('movie', m.id);
  /* POINT 21 — un film de la bibliothèque qui n'est pas vu EST un film à voir.
     Sa fiche ne le disait pas davantage que l'aperçu, et le seul retrait passait
     par le menu ⋮. Le bloc dit l'état et porte « Retirer ». */
  html += blocAVoir('movie', m.id);
  if(m.overview) html += '<div class="sectitle">Synopsis</div><div class="overview" style="margin-top:0">'+esc(m.overview)+'</div>';
  html += blocPlateformes('movie', m.id);
  html += zoneCasting('movie', m.id);
  html += zoneRecos('movie', m.id);
  html += '<div style="height:30px"></div>';
  return html;
}
function toggleMovie(id){
  const m = db.movies[id]; if(!m) return;
  /* C3 (09/08) — le geste passe par `marquerFilm` (app-01), qui DATE le
     décochage. Écrit à la main ici, il ne laissait aucune trace : la fusion
     tranchait sur `watchedAt` seul, l'autre appareil — qui croit toujours le
     film vu — gagnait donc toujours, et le film redevenait « vu » à la synchro
     suivante. Sur tous les appareils, et sans un mot. */
  marquerFilm(m, !m.seen);
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
  const dejaVu = !!(db.movies[id] && db.movies[id].seen);
  const p = addMovie(id, true);
  const suite = ()=>{
    if(typeof signalerFilmVu === 'function') signalerFilmVu(id);
    /* SPEC-06 §3.1 — un film qui PASSE à vu, par un geste de la personne. Le
       remarquer une seconde fois sur un film déjà vu ne serait pas une fin de
       visionnage, ce serait un doublon. */
    if(!dejaVu && typeof proposerDuelEclair === 'function')
      proposerDuelEclair('movie', id, (db.movies[id] || {}).title);
  };
  if(p && typeof p.then === 'function') p.then(suite, ()=>{});
  else suite();
}
function movieMenu(id){
  const m = db.movies[id];
  if(!m) return;                                   // C5 — voir `showMenu`, app-06
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
