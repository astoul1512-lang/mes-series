"use strict";
/* La recherche TMDB n'accepte ni genre ni langue : quand la puce Animés est
   choisie, on écarte nous-mêmes ce qui n'est pas de l'animation japonaise.
   Si les résultats ne portent pas ces informations, on ne filtre pas à l'aveugle. */
function garderAnimes(res){
  if(ui.disc.type !== 'anime') return res;
  const anim = genreParNom('tv','Animation');
  if(anim == null) return res;
  const exploitables = res.every(r => r && typeof r.original_language === 'string' && Array.isArray(r.genre_ids));
  if(!exploitables) return res;
  return res.filter(r => r.original_language === 'ja' && r.genre_ids.indexOf(anim) >= 0);
}

/* E7 — LA RÈGLE D'ORIGINE, ÉCRITE UNE SEULE FOIS.

   Elle l'était trois fois : `garderOccident` ici, le `.filter()` de
   `chargerRecos` dans app-05, `estOccidental` dans app-11. Et les trois ne
   traitaient pas pareil le cas « langue absente » — le lot entier échappait au
   filtre ici, le titre passait là, le titre passait ailleurs. Un même titre
   pouvait donc être proposé sur un écran et écarté sur l'autre. Une seule
   fonction désormais, et c'est la seule que l'interrupteur « Ouvrir à toutes
   les origines » débranche : brancher l'interrupteur sur trois implémentations
   divergentes aurait garanti un comportement incohérent selon l'écran.

   Langue inconnue : le titre passe. On ne devine pas, et vider l'écran sur une
   absence de donnée serait le pire des deux.
   `langueVoisine` : la langue du titre dont on part. Les recommandations d'une
   série coréenne restent coréennes — c'est l'exception que portait app-05,
   elle est conservée telle quelle. */
function toutesOrigines(){ return !!(db.gouts && db.gouts.toutesOrigines); }
function origineAdmise(langue, langueVoisine){
  if(toutesOrigines()) return true;
  if(typeof langue !== 'string' || !langue) return true;
  if(LANGUES_OCCIDENT.indexOf(langue) >= 0) return true;
  return !!(langueVoisine && langue === langueVoisine);
}
/* Écarte des suggestions ce qui n'est pas occidental. La puce Animés est
   japonaise par construction : elle n'est pas concernée. */
function garderOccident(res){
  if(ui.disc.type === 'anime') return res;
  if(toutesOrigines()) return res;
  return res.filter(r => origineAdmise(r && r.original_language));
}

/* Vignette commune aux suggestions et aux résultats de recherche. */
function carteTitre(r, media, from){
  const isTv = media === 'tv';
  const name = isTv ? r.name : r.title;
  const date = isTv ? r.first_air_date : r.release_date;
  const item = isTv ? db.shows[r.id] : db.movies[r.id];
  const st   = item ? statut(item) : null;
  const note = r.vote_average ? Math.round(r.vote_average*10)/10 : null;
  const votes = r.vote_count || 0;

  let coin = '';
  if(st === 'vu')         coin = '<div class="tick vu">'+I.check+'</div>';
  else if(st === 'avoir') coin = '<div class="tick avoir">'+I.bookmark+'</div>';
  else if(st === 'asuivre'){
    const p = progress(item);
    coin = '<div class="tick suivi">'+p.watched+'/'+p.total+'</div>';
  }

  const prov = from || 'discover';
  return '<button class="gcard" onclick="ouvrirTitre('+r.id+',\''+media+'\',\''+prov+'\')">'+
    posterEl(r.poster_path,'w342','',name)+ coin +
    (note ? '<div class="gnote">'+I.star+note.toFixed(1)+'</div>' : '')+
    '<div class="gname">'+esc(name)+'</div>'+
    /* Pas encore sorti : la date dit quelque chose, l'année seule non. */
    (estAVenir(date)
      ? '<div class="gyear"><span class="vgquand">'+esc(dateCourte(date))+'</span></div>'
      : '<div class="gyear">'+esc(year(date))+(votes?' · '+votes+' vote'+(votes>1?'s':''):'')+'</div>')+
    (st ? '<div class="gstat '+st+'">'+LIB_STATUT[st]+'</div>' : '')+
  '</button>';
}

/* Amène l'écran sur la liste des saisons, là où se fait l'ajustement */
function versLesSaisons(){
  setTimeout(()=>{
    const el = document.querySelector('.sectitle.rowt');
    if(el) el.scrollIntoView({block:'start', behavior:'smooth'});
  }, 60);
}

/* SPEC-10 §4 — `sansOuvrir` : ajouter SANS partir sur la fiche.
   La carte reco du centre doit se replier SOUS LES YEUX, dans le fil (« ✓ Dans
   ta liste — X est notifié ») : téléporter sur la fiche ferait disparaître le
   fil, la carte, et la démonstration que le geste a marché. Un paramètre
   optionnel, faux par défaut, plutôt qu'un second chemin d'ajout : le premier
   ne change rien pour les cinq appelants existants, le second aurait donné deux
   fonctions à corriger le jour où l'ajout d'une série changera. */
async function addOrOpenShow(id, sansOuvrir){
  if(db.shows[id]) return sansOuvrir ? render()
                                     : go('show',{id:id, from: params.from || 'discover'});
  if(!prendre('serie:'+id)) return;
  /* `fetchShowFull` enchaîne une requête plus une par paquet de vingt saisons :
     plusieurs secondes sur réseau mobile. Pendant ce temps l'utilisateur a pu
     changer d'écran — et l'app le téléportait alors sur la fiche de la série,
     plusieurs secondes après son geste. On note d'où l'on part AVANT l'attente,
     et si l'écran a changé on se contente du toast.
     Revue de stabilité du 02/08, constat A3-1. */
  const ecranDepart = view, depuis = params.from || 'discover';
  const btn = document.getElementById('addbtn');
  const setBtn = t=>{ if(btn) btn.innerHTML = '<span class="spin"></span> '+t; };
  if(btn) btn.setAttribute('disabled','');
  setBtn('Chargement des épisodes…');
  try{
    /* La fiche de base est peut-être déjà en main : l'aperçu vient de la
       charger. Constat A5-2. */
    const dejaLa = (ui.preview && ui.preview.id === id && ui.preview.data) || null;
    const s = await fetchShowFull(id, (a,b)=> setBtn('Saisons '+a+'/'+b+'…'), dejaLa);
    s.watched = {}; s.addedAt = Date.now();
    db.shows[id] = s; saveDB();
    toast('« '+s.name+' » ajoutée');
    rendre('serie:'+id);
    if(sansOuvrir || view !== ecranDepart){ render(); return; }
    go('show',{id:id, from: depuis});
    versLesSaisons();
  }catch(e){
    rendre('serie:'+id); render();
    toast("Impossible d'ajouter cette série");
  }
}

/* `fiche` : la fiche TMDB quand l'appelant l'a déjà sous les yeux — c'est le
   cas de l'aperçu, dont tout le rendu est bâti dessus. Sans elle, l'app
   redemandait au réseau une fiche affichée juste au-dessus, et un appui sur
   « À voir » échouait hors ligne. Constat A5-1. */
async function addMovie(id, seen, fiche){
  try{
    /* À défaut d'une fiche passée par l'appelant, celle de l'aperçu si c'est le
       même film : l'écran est entièrement bâti dessus, la redemander au réseau
       faisait attendre — et échouait hors ligne. */
    const enMain = fiche ||
      ((ui.preview && String(ui.preview.id) === String(id) && ui.preview.type === 'movie' &&
        ui.preview.data && ui.preview.data.id) ? ui.preview.data : null);
    const m = db.movies[id] ? null : (enMain || await tmdb('/movie/'+id));
    if(m){
      db.movies[id] = { id:m.id, title:m.title, poster:m.poster_path, backdrop:m.backdrop_path,
        date:m.release_date, runtime:m.runtime, overview:m.overview,
        genres:(m.genres||[]).map(g=>g.name), note:m.vote_average||null,
        seen:!!seen, watchedAt: seen?Date.now():null, addedAt:Date.now() };
    } else {
      /* C3 (09/08) — SECOND point d'écriture du « vu » d'un film, et il faisait
         la même chose que `toggleMovie` : reposer un film DÉJÀ dans la
         bibliothèque dans « À voir » le décochait sans dater le geste, donc
         sans qu'il survive à la synchro. `marquerFilm` (app-01) est désormais
         le seul passage — les deux appels sont ici et dans app-05.
         Le cas du dessus (film ABSENT de la bibliothèque) n'en a pas besoin :
         il n'y a pas de décochage possible sur un titre qu'on vient d'ajouter,
         et l'objet neuf ne porte donc jamais d'`unseenAt`. */
      marquerFilm(db.movies[id], !!seen);
    }
    saveDB();
    toast(seen ? 'Marqué comme vu ✓' : 'Ajouté à « À voir »');
    render();
  }catch(e){ toast("Erreur lors de l'ajout"); }
}

/* ---------- Vue : Découvrir (suggestions, filtres, nouveautés) ----------
   Tout passe par /discover/tv et /discover/movie. Les genres ne sont jamais
   codés en dur : ils sont demandés à TMDB (/genre/tv/list, /genre/movie/list)
   pour que les identifiants et les libellés français viennent de la source. */

/* Chaque puce ouvre sa propre vitrine de suggestions ; poser un filtre bascule
   sur la grille. « Tout » mêle les trois, les autres cadrent.
   « Mini-séries » a été retiré à la demande d'Adrien : c'était un sous-cas des
   séries, qui prenait une place de premier rang sans rien apporter à personne. */
const DISC_TYPES = [
  { id:'tout',  label:'Tout' },
  { id:'tv',    label:'Séries' },
  { id:'movie', label:'Films' },
  { id:'anime', label:'Animés' }
];
/* Deux réglages distincts, longtemps mélangés dans une seule rangée :
   ce qu'on regarde (tout le catalogue ou les sorties récentes),
   et dans quel ordre on le classe. */
/* Une seule question pour le temps qui passe : « Toutes » ouvre le catalogue,
   « Sorties récentes » le referme sur les derniers mois, et les décennies
   ouvrent une fenêtre précise. Deux réglages de date distincts se seraient
   contredits — celui-ci en remplace un seul. */
const DISC_PERIMETRES = [
  /* Pas de résumé quand rien n'est choisi : « Toutes » sur la ligne repliée
     laissait croire à un réglage actif. */
  { id:'tout',   label:'Peu importe',       court:'' },
  /* Pas de période « À venir » ici. Elle a existé une soirée, le 29/07 : Adrien
     l'a écartée en montrant sa vitrine — « je ne pensais pas aux filtres, je
     pensais à ça ». Ce qui n'est pas encore sorti se lit dans la rangée
     « Bientôt », pas dans un réglage qu'il faut aller chercher. */
  { id:'recent', label:'Sorties récentes',  court:'Sorties récentes' },
  { id:'2020s',  label:'Depuis 2020',       court:'depuis 2020', de:'2020-01-01', a:'2099-12-31' },
  { id:'2010s',  label:'Années 2010',       court:'années 2010', de:'2010-01-01', a:'2019-12-31' },
  { id:'2000s',  label:'Années 2000',       court:'années 2000', de:'2000-01-01', a:'2009-12-31' },
  { id:'1990s',  label:'Années 90',         court:'années 90',   de:'1990-01-01', a:'1999-12-31' },
  { id:'1980s',  label:'Années 80',         court:'années 80',   de:'1980-01-01', a:'1989-12-31' }
];
/* LA DURÉE EST DÉSACTIVÉE, et il faut dire pourquoi.

   `with_runtime` a été mesuré en direct le 29/07 sur des films établis d'avant
   2020, là où les fiches TMDB sont les plus sûres : la borne « 1 à 95 min »
   ramenait Les Infiltrés (151 min), Toy Story 3 (103) et WALL·E (98) — quatre
   titres hors bornes sur dix. La borne « 150 min et plus » ramenait Spider-Man
   (121) et Inception (148) — trois sur huit. La durée que TMDB garde dans son
   index de recherche n'est pas celle de la fiche.

   Un filtre qui se trompe trois fois sur dix est pire que pas de filtre : on
   croit avoir répondu à « j'ai une heure et demie » et on se retrouve devant
   2h30. Tant que ça n'est pas fiable, la rubrique reste hors de la feuille.
   Le tableau ci-dessous est conservé : il ne coûte rien et servira le jour où
   l'on aura de quoi vérifier la durée autrement. */
const DISC_DUREE_FIABLE = false;
const DISC_DUREES = [
  { id:'tout', label:'Peu importe',   court:'' },
  { id:'court',label:'Moins d\'1h30', court:'moins d\'1h30', max:89 },
  { id:'moyen',label:'Moins de 2h',   court:'moins de 2h',   max:119 },
  { id:'long', label:'2h et plus',    court:'2h et plus',    min:120 }
];
const DISC_TRIS = [
  { id:'populaire', label:'Les plus populaires', court:'populaire' },
  { id:'note',      label:'Les mieux notées',    court:'mieux notées' }
];
/* Le plancher de votes, posé dès qu'on trie par note ou qu'on exige une note
   minimale. Sans lui, `vote_average.desc` remonte les 10/10 à trois voix.
   Il était à 300 pour le tri et à 100 pour la note minimale : deux valeurs
   pour la même idée, dont la plus sévère écartait des titres en silence.
   Une seule valeur, mesurée, et ANNONCÉE dans la feuille. */
const DISC_VOTES_MINI = 100;
const DISC_NOTES = [
  { v:0, label:'Toutes' }, { v:6, label:'6 et +' }, { v:7, label:'7 et +' }, { v:8, label:'8 et +' }
];
const DISC_FENETRE = 90;     // « sorti récemment » = les 90 derniers jours

/* ---------------------------------------------------------------------------
   Les envies

   Un genre décrit un rayon de vidéoclub — « thriller », c'est des milliers de
   titres. Une envie décrit une soirée : un braquage, une enquête, une boucle
   temporelle. TMDB appelle ça des mots-clés, et c'est le seul moyen d'être
   précis sans écrire une phrase.

   Chaque identifiant a été relevé EN DIRECT sur TMDB, pas deviné : le nom du
   mot-clé devait correspondre exactement. Un identifiant inventé ne renvoie
   pas d'erreur, il renvoie une liste vide — d'où la vérification.

   `puces` dit où l'envie a un sens : « isekai » n'existe pas côté films,
   « hôpital » ne veut rien dire dans une liste d'animés. Sur la puce « Tout »,
   on montre le fonds commun. */
const ENVIES = [
  { id:6149,   label:'Enquête policière', puces:['tout','tv','movie'] },
  { id:9826,   label:'Meurtre',           puces:['tout','tv','movie'] },
  { id:10291,  label:'Crime organisé',    puces:['tout','tv','movie'] },
  { id:378,    label:'Prison',            puces:['tout','tv','movie'] },
  { id:9748,   label:'Vengeance',         puces:['tout','tv','movie'] },
  { id:6078,   label:'Politique',         puces:['tout','tv','movie'] },
  { id:11612,  label:'Hôpital',           puces:['tout','tv'] },
  { id:6282,   label:'Au boulot',         puces:['tout','tv','movie'] },
  { id:12279,  label:'Drame familial',    puces:['tout','tv','movie'] },
  { id:6054,   label:'Amitié',            puces:['tout','tv','movie','anime'] },
  { id:6270,   label:'Lycée',             puces:['tout','tv','movie'] },
  { id:10854,  label:'Boucle temporelle', puces:['tout','tv','movie','anime'] },
  { id:12332,  label:'Apocalypse',        puces:['tout','tv','movie','anime'] },
  { id:4458,   label:'Monde d\'après',    puces:['tout','tv','movie','anime'] },
  { id:9715,   label:'Super-héros',       puces:['tout','tv','movie'] },
  { id:6152,   label:'Surnaturel',        puces:['tout','tv','movie','anime'] },
  { id:2343,   label:'Magie',             puces:['tout','tv','movie','anime'] },
  { id:177895, label:'Dark fantasy',      puces:['tout','tv','movie','anime'] },
  { id:161176, label:'Space opera',       puces:['tout','tv','movie','anime'] },
  { id:6075,   label:'Sport',             puces:['tout','tv','movie','anime'] },
  { id:1918,   label:'Cuisine',           puces:['tout','tv','movie','anime'] },
  { id:1462,   label:'Samouraï',          puces:['tout','tv','movie','anime'] },
  /* Le vocabulaire propre aux animés : ces mots-clés n'ont aucun équivalent
     utile ailleurs, et ce sont ceux qu'on emploie vraiment pour en parler. */
  { id:207826, label:'Shōnen',            puces:['anime'] },
  { id:237451, label:'Isekai',            puces:['anime'] },
  { id:10046,  label:'Mecha',             puces:['anime'] },
  { id:9914,   label:'Tranche de vie',    puces:['anime'] },
  { id:12380,  label:'Tournoi',           puces:['anime'] },
  { id:15001,  label:'Démons',            puces:['anime'] },
  { id:10873,  label:'École',             puces:['anime'] }
];
function enviesAffichees(){
  const t = ui.disc.type;
  return ENVIES.filter(e => e.puces.indexOf(t) >= 0);
}
function envieParId(id){ return ENVIES.find(e => e.id === id) || null; }

/* Origine des titres proposés dans Découvrir.
   Classé par popularité, TMDB fait remonter énormément de production indienne,
   coréenne, japonaise et chinoise, qui noyait le reste. Les suggestions se
   limitent donc à l'anglophone et à l'Europe de l'Ouest.
   Deux exceptions volontaires :
   — la puce Animés, japonaise par construction, n'est pas concernée ;
   — la recherche par titre n'est jamais filtrée : chercher « Parasite » doit
     le trouver. C'est déjà le cas, les filtres ne s'appliquent pas à /search.
   Le tri se fait sur `original_language` renvoyé par TMDB, pas sur un paramètre
   de requête : c'est le seul champ dont on soit certain du comportement. */
const LANGUES_OCCIDENT = ['en','fr','es','it','de','pt','nl','sv','da','no','nb','fi','is'];
/* Une fournée vise une cinquantaine de titres : une seule page TMDB (20 films
   au mieux) faisait un écran trop court, et « Voir plus » n'apportait presque
   rien — le reproche exact d'Adrien. Trois requêtes par fournée, pas plus :
   au-delà, c'est le quota qu'on brûle pour du défilement. */
const DISC_CIBLE = 40;       // en dessous, on va chercher la page suivante
const DISC_PAGES_MAX = 3;    // jamais plus de 3 requêtes pour remplir un écran

const genresTMDB = { tv:null, movie:null };
const platesTMDB = { tv:null, movie:null };
/* Nombre de plateformes montrées d'emblée dans les filtres ; le reste
   se déplie à la demande. TMDB en recense plus de cent pour la France. */
const PLATES_VEDETTE = 12;
/* TMDB mélange dans une même liste les abonnements (Netflix) et les boutiques de
   location à l'acte (Canal VOD, Orange VOD), sans jamais dire lesquelles sont
   lesquelles. Et son paramètre « type d'offre » est ignoré dès qu'on le combine
   avec un fournisseur : demander Canal VOD en abonnement renvoie quand même ses
   films à louer. On ne peut donc pas se fier à la requête ; on apprend la réponse
   ailleurs. Sur un échantillon de titres populaires, on relève les plateformes
   qui apparaissent réellement en « flatrate » : celles-là font de l'abonnement,
   les autres sont des boutiques et n'ont rien à faire dans ce filtre.
   L'échantillon suit ce que l'écran montre : sur la puce Animés il est fait
   d'animés, ce qui fait apparaître Crunchyroll et ADN, invisibles dans un
   échantillon de séries généralistes. Ce qui a été appris ne se perd jamais :
   les plateformes s'accumulent d'un type à l'autre. */
const PLATES_ECHANTILLON = 18, PLATES_PAQUET = 6, PLATES_MINI = 4;
/* Doublons du même service, écartés de la liste : les formules avec publicité,
   et les revendeurs (« Paramount+ Amazon Channel » n'est qu'une façon de payer
   Paramount+, le catalogue est le même). */
const PLATES_PUB = /\bwith ads\b|\bavec (de la )?pub|\b(amazon|apple tv) channel\b/i;
const platesAbo = { tv:{}, movie:{} };      // id → true (fait de l'abonnement en France)
const platesAboFait = { tv:false, movie:false };
const sondagesFaits = {};                   // « tv:anime » → true
let sondageEnCours = false;
let discSeq = 0;

/* Le média TMDB derrière chaque puce : les animés restent des séries. */
function discMedia(){ return ui.disc.type === 'movie' ? 'movie' : 'tv'; }
function isoIlYA(jours){ return new Date(Date.now() - jours*86400000).toISOString().slice(0,10); }
function isoDansN(jours){ return new Date(Date.now() + jours*86400000).toISOString().slice(0,10); }

/* LOT C — les cinq genres de films que TMDB nomme autrement côté séries.

   Les goûts sont enregistrés sous un seul nom (`db.gouts.genres`), et ce nom
   vient forcément de l'une des deux taxonomies. Côté films TMDB dit « Action »
   et « Science-Fiction » ; côté séries il dit « Action & Adventure » et
   « Sci-Fi & Fantasy ». Sans cette table, quelqu'un qui coche « Action » n'a
   JAMAIS reçu une série d'action : le nom ne se retrouvait pas dans la liste
   des séries, `genreParNom` rendait `null`, et l'appelant filtrait
   silencieusement. C'était vrai de l'écran « Mes goûts » bien avant le lot C.

   Les six autres libellés de films — Histoire, Horreur, Musique, Romance,
   Sport, Thriller — n'ont réellement AUCUN équivalent en série chez TMDB : la
   taxonomie des séries ne les connaît pas du tout. Rien ne peut les sauver
   ici ; l'écran d'inscription le dit maintenant à qui les coche.

   `INSC_GENRE_TV` (app-13) tient la correspondance dans l'autre sens, pour la
   déduction. Les deux tables sont courtes et chacune vit là où elle sert. */
/* MESURÉ LE 02/08, ET ÇA CORRIGE UN TROU RÉEL : sur `/genre/tv/list` en
   `fr-FR`, TMDB rend « **Science-Fiction & Fantastique** » et non
   « Sci-Fi & Fantasy ». Les deux orthographes sont donc listées ici — l'app
   demande toujours `language=fr-FR`, mais un cache déjà rempli en anglais, un
   repli de TMDB ou un changement de langue rendrait l'autre. Sans la forme
   française, `genreParNom('tv','Science-Fiction')` rendait `null` : cocher
   « Science-Fiction » ne produisait rien côté séries, en silence. */
const GENRE_SERIE = {
  'action':          'Action & Adventure',
  'aventure':        'Action & Adventure',
  'science-fiction': 'Science-Fiction & Fantastique',
  'fantastique':     'Science-Fiction & Fantastique',
  'guerre':          'War & Politics'
};
/* Les deux orthographes possibles d'un même genre de séries, essayées dans
   l'ordre. Une seule table, lue par `genreParNom` et par `genreCanon`. */
const GENRE_SERIE_ALT = {
  'science-fiction & fantastique': 'sci-fi & fantasy',
  'sci-fi & fantasy':              'science-fiction & fantastique'
};

/* Le nom EXACT est toujours essayé en premier : la traduction n'est qu'un
   repli. C'est ce qui garantit qu'aucun appel ne change de résultat — seuls
   des `null` deviennent des identifiants, jamais l'inverse. */
function genreParNom(media, nom){
  const l = genresTMDB[media] || [];
  const cle = String(nom == null ? '' : nom).toLowerCase();
  let g = l.find(x => (x.nom||'').toLowerCase() === cle);
  if(!g && media === 'tv' && GENRE_SERIE[cle]){
    const equiv = GENRE_SERIE[cle].toLowerCase();
    g = l.find(x => (x.nom||'').toLowerCase() === equiv);
    if(!g && GENRE_SERIE_ALT[equiv]){
      const autre = GENRE_SERIE_ALT[equiv];
      g = l.find(x => (x.nom||'').toLowerCase() === autre);
    }
  }
  return g ? g.id : null;
}

/* LOT D — LA MÊME TABLE, LUE À L'ENVERS.

   `GENRE_SERIE` traduit un nom de genre vers la taxonomie des séries. Il
   manquait le chemin inverse, et c'est lui qui produisait le défaut relevé au
   point 8 des retours de la v85 : « Genres retenus : action, ACTION &
   ADVENTURE, comédie » — le même genre compté deux fois, une fois sous son
   libellé film et une fois sous son libellé série.

   `genreCanon` ramène tout sur le libellé FILM, qui sert de forme canonique.
   Ce sens-là et pas l'autre, pour une raison précise : `genreParNom('tv',
   'Action')` sait retrouver « Action & Adventure » grâce à `GENRE_SERIE`,
   alors que `genreParNom('movie', 'Action & Adventure')` ne peut rien faire.
   Canoniser vers le film ne perd donc jamais un identifiant.

   Un nom inconnu ressort tel quel : cette fonction normalise, elle ne filtre
   pas. */
/* La forme FRANÇAISE de la science-fiction des séries manquait, et c'est un
   défaut mesuré le 02/08 : TMDB rend « Science-Fiction & Fantastique » en
   `fr-FR`, jamais « Sci-Fi & Fantasy ». La canonisation ne mordait donc pas —
   un genre non canonisé tombe en dernier dans `GENRE_PRIORITE`, et une série de
   fantasy pouvait se voir nommée par « Action et aventure ». */
const GENRE_CANON = {
  'action & adventure':'Action',
  'sci-fi & fantasy':'Science-Fiction',
  'science-fiction & fantastique':'Science-Fiction',
  'war & politics':'Guerre',
  'guerre & politique':'Guerre'
};
function genreCanon(nom){
  return GENRE_CANON[String(nom == null ? '' : nom).toLowerCase()] || nom;
}
/* ============ POINT 4, LEVIER 2 — LE GENRE PRINCIPAL D'UN TITRE ============

   TMDB NE FOURNIT AUCUN GENRE PRINCIPAL. Pas de champ, pas de pondération, pas
   de classement : une liste plate. Les trois genres qu'affichait la fiche
   n'étaient donc pas « les trois principaux », c'étaient les trois premiers
   d'un rangement qui ne veut rien dire — et c'est ce qui faisait que
   *Kung Fu Panda 4* n'annonçait nulle part « Comédie ».

   C'est aussi ce qui empêchait la règle anti-monotonie de mordre : elle
   comparait les titres sur `genre_ids[0]`, et l'animation n'est presque jamais
   le premier genre chez TMDB (Kung Fu Panda commence par Action, Les Nouveaux
   Héros par Aventure). Trois dessins animés lui paraissaient donc être trois
   genres différents.

   L'ORDRE, du plus fort au plus faible ; le genre principal d'un titre est le
   premier de cette liste qu'il porte :

     1. LA FORME       — Documentaire, Animation. C'est la première chose que
                         l'œil voit, et c'est précisément celle que TMDB range
                         rarement en tête.
     2. LE REGISTRE LOURD — Horreur, Guerre, Western, Crime, Thriller, Mystère,
                         Histoire, Science-Fiction, Fantastique, Musique.
     3. LE REGISTRE LÉGER — Comédie, puis Romance.
     4. LES PASSE-PARTOUT — Action, Aventure, Drame, Familial.

   L'ÉTAGE 2 AU-DESSUS DE LA COMÉDIE EST UNE CORRECTION, PAS UN CHOIX DE DÉPART.
   La première version mettait Comédie avant Crime ; Adrien l'a mise à l'épreuve
   sur dix titres et elle est tombée sur *Barry Seal* (Action, Comédie, Crime),
   rangé en Comédie — c'est-à-dire mot pour mot son reproche initial, « Kill
   Bill dans comédie ». Règle corrigée : LE GENRE LE PLUS LOURD GAGNE TOUJOURS.
   Barry Seal → Crime. Kill Bill → Crime. Hitch et American Pie restent Comédie.

   CE GENRE NOMME, IL NE RETIRE JAMAIS RIEN. Shrek reste dans les résultats
   « familial », Hitch dans « romance ». Les seuls retraits de l'app sont ceux
   des ambiances, décidés recette par recette, et ils se lisent dans la phrase.

   ZORRO — MESURÉ LE 02/08, ET LA QUESTION SE FERME. TMDB ne donne au *Masque
   de Zorro* que **Action et Aventure**, aucun Western. La règle le range donc
   déjà en Action, ce qu'Adrien demandait : rien à arbitrer, aucune ligne à
   déplacer dans ce tableau. C'était la mémoire qui était en faute, pas l'ordre.

   SPORT N'EXISTE PAS CHEZ TMDB, ni pour les films ni pour les séries. Aucune
   règle de tri ne peut inventer une étiquette absente : *F1 Le Film* restera
   Action. Le seul chemin serait le mot-clé, et Adrien a refusé d'ouvrir le
   point le 02/08 en connaissance de cause.

   ELLE NE DÉPEND PAS DE L'ORDRE DE TMDB : elle lit l'ENSEMBLE des genres du
   titre et cherche le premier de SA liste à elle. La réserve « l'ordre de
   `genre_ids` n'est pas forcément celui de `genres` » est donc sans objet ici.

   Les noms sont canonisés (`genreCanon`) avant comparaison : une série porte
   « Action & Adventure » là où un film porte « Action », et il n'y a qu'une
   seule table de priorité pour les deux. */
const GENRE_PRIORITE = [
  /* 1 — la forme */
  'Documentaire', 'Animation',
  /* 2 — le registre lourd */
  'Horreur', 'Guerre', 'Western', 'Crime', 'Thriller', 'Mystère', 'Histoire',
  'Science-Fiction', 'Fantastique', 'Musique',
  /* 3 — le registre léger */
  'Comédie', 'Romance',
  /* 4 — les passe-partout */
  'Action', 'Aventure', 'Drame', 'Familial'
];
function rangGenre(nom){
  const i = GENRE_PRIORITE.indexOf(genreCanon(nom));
  /* Un genre absent de la liste (Kids, News, Reality, Soap, Talk, Téléfilm)
     passe en dernier : il nomme moins bien qu'aucun de ceux du tableau. */
  return i < 0 ? GENRE_PRIORITE.length : i;
}
/* Rend le NOM du genre principal parmi une liste de noms. Liste vide → ''. */
function genrePrincipalNom(noms){
  const l = (noms || []).filter(n => n);
  if(!l.length) return '';
  return l.slice().sort((a,b)=> rangGenre(a) - rangGenre(b))[0];
}
/* La même chose à partir d'identifiants TMDB et d'un média — c'est la forme
   dont se sert la grille de Recherche, qui ne reçoit que des `genre_ids`. */
function genrePrincipalId(media, ids){
  const l = (ids || []).map(id => nomGenreParId(media, id)).filter(n => n);
  const n = genrePrincipalNom(l);
  if(!n) return null;
  const g = (genresTMDB[media] || []).find(x => genreCanon(x.nom) === genreCanon(n));
  return g ? g.id : null;
}
/* La liste des genres d'un titre, PRINCIPAL EN TÊTE et le reste derrière, dans
   l'ordre où TMDB les donne. C'est ce que la fiche affiche (point 3) : tous les
   genres, jamais tronqués, et celui qui explique la présence du titre en
   premier. */
function genresOrdonnes(noms){
  const l = (noms || []).filter(n => n);
  if(l.length < 2) return l;
  const p = genrePrincipalNom(l);
  return [p].concat(l.filter(n => n !== p));
}

/* Le libellé d'un identifiant de genre TMDB, dans le média où il a été lu.
   Sert au malus de « Pas pour moi » : on retient un NOM canonique et non un
   identifiant, sans quoi refuser un film d'action ne dirait rien d'une série
   d'action — les deux taxonomies ne partagent aucun identifiant. */
function nomGenreParId(media, id){
  const g = (genresTMDB[media] || []).find(x => x.id === id);
  return g ? g.nom : null;
}

/* ============ POINT 16 — L'ÉCRAN CESSE D'ÊTRE BILINGUE ============

   Repéré sur les captures d'Adrien, pas demandé par lui, puis ouvert comme
   point à part entière le 02/08 : « pour les puces pour les animés je te laisse
   faire le nécessaire ! »

   LE CONSTAT. La taxonomie des SÉRIES de TMDB n'est pas entièrement traduite en
   français et elle était servie telle quelle. Relevé en direct le 02/08 sur
   `/genre/tv/list?language=fr-FR` : TMDB traduit bien « Comédie »,
   « Documentaire », « Drame », « Familial », « Mystère » et
   « Science-Fiction & Fantastique », mais il laisse en anglais « Action &
   Adventure », « Kids », « News », « Reality », « Soap », « Talk » et
   « War & Politics ». À côté des autres, l'écran est bilingue.

   ON TRADUIT CE QU'ON AFFICHE, JAMAIS CE QU'ON ENVOIE. L'identifiant expédié à
   TMDB ne change pas, aucune requête ne change, aucun comportement ne change.
   C'est un libellé, rien d'autre.

   La table se limite aux SEPT qui ne sont pas traduits : traduire ce que TMDB
   traduit déjà créerait une seconde source de vérité qui divergerait le jour où
   TMDB corrigera la sienne. */
const GENRE_FR = {
  'action & adventure':'Action et aventure',
  'kids':'Jeunesse',
  'news':'Information',
  'reality':'Téléréalité',
  'soap':'Feuilleton',
  'talk':'Talk-show',
  'war & politics':'Guerre et politique'
};
function libelleGenre(nom){
  return GENRE_FR[String(nom == null ? '' : nom).toLowerCase()] || nom;
}

/* ===== LES GENRES QUI NE RENDENT RIEN, RETIRÉS APRÈS MESURE =====

   « À MESURER AVANT DE RETIRER », famille par famille : un genre n'est retiré
   que si la mesure le montre vide ou quasi vide, jamais parce qu'il « semble »
   hors sujet. C'est la règle de la maison, et elle vaut ici comme ailleurs.

   MESURÉ LE 02/08 sur `/discover/tv`, langues `ja|zh|ko`, genre Animation, avec
   le plancher de 80 votes de la grille — c'est-à-dire exactement ce que la puce
   « Animés » demande :

     Documentaire 0 · News 0 · Reality 0 · Soap 0 · Talk 0 · Western 1
     War & Politics 12 · Familial 19 · Kids 27 · Crime 30 · Mystère 99
     Drame 254 · Comédie 342 · Action & Adventure 411 · Sci-Fi & Fantasy 444

   LES SIX PREMIERS SONT RETIRÉS de la puce Animés : ils proposent une réponse
   qui rendra zéro, ou un seul titre. Les suivants sont MINCES et non vides —
   War & Politics à 12, Familial à 19 — ils restent, et le chiffre est signalé à
   Adrien plutôt qu'arbitré ici.

   SUR LA PUCE SÉRIES, RIEN N'EST RETIRÉ : mesuré au même moment, le plus maigre
   est News à 11, puis Talk à 36 et Western à 40. Aucun n'est vide. */
const GENRES_VIDES_ANIME = ['documentaire','news','reality','soap','talk','western'];
function genreUtile(nomGenre, famille){
  if(famille !== 'anime') return true;
  return GENRES_VIDES_ANIME.indexOf(String(nomGenre || '').toLowerCase()) < 0;
}

/* Les genres proposés dépendent du type choisi. Pour les animés, « Animation »
   est déjà imposé : inutile de le proposer une deuxième fois. */
function genresAffiches(){
  const l = genresTMDB[discMedia()] || [];
  const t = ui.disc.type;
  return l.filter(g => !(t === 'anime' && (g.nom||'').toLowerCase() === 'animation'))
          .filter(g => genreUtile(g.nom, t));
}

/* Les plateformes proposées viennent de TMDB pour la France, classées par
   l'ordre d'affichage que JustWatch donne au pays : Netflix et Disney+ avant
   les catalogues confidentiels. La liste diffère entre séries et films.
   Tant que rien n'a été appris sur l'abonnement, on montre tout — mieux vaut
   une plateforme de trop qu'une liste qui s'évapore sous les doigts. */
/* ---------- Ce à quoi la personne est abonnée ----------
   Déclaré à l'inscription, modifiable dans les réglages. C'est la seule chose
   que l'app ne peut pas déduire : voir quelqu'un regarder des séries Netflix
   ne dit pas qu'il paie Netflix. */
function mesPlates(){ return ((db.gouts||{}).plates) || []; }
function aDeclarePlates(){ return mesPlates().length > 0; }
/* Restreindre les suggestions n'a de sens qu'une fois la liste donnée : sinon
   la vitrine se viderait sans que personne comprenne pourquoi. */
function suggSurMesPlates(){ return !!((db.gouts||{}).suggMesPlates) && aDeclarePlates(); }
/* Les paramètres TMDB correspondants. Les mêmes que ceux du filtre de la
   feuille : « ou » entre les plateformes, région obligatoire, abonnement seul. */
function paramsMesPlates(){
  const l = mesPlates();
  if(!l.length) return {};
  return { with_watch_providers: l.map(p=>p.id).join('|'),
           watch_region: REGION_PLATO,
           with_watch_monetization_types: 'flatrate' };
}

/* Les abonnements déclarés arrivent DÉJÀ COCHÉS dans la feuille de filtres —
   demande d'Adrien, 30/07 : « il faudrait que les plateformes sélectionnées en
   amont dans les goûts soient déjà sélectionnées ». Tant qu'on n'y a pas
   touché, la sélection suit la déclaration : en ajouter une dans les réglages
   la coche ici aussi, sans qu'on ait à repasser. */
function semerPlatesFiltres(){
  const d = ui.disc;
  if(d.platesTouchees) return;
  d.plates = mesPlates().map(p => ({ id:p.id, nom:p.nom, logo:p.logo }));
}

function platesRetenues(){
  const media = discMedia(), l = platesTMDB[media] || [];
  /* Une déclaration l'emporte sur toute déduction : ce qu'on a coché soi-même
     passe en tête de la feuille, le reste du catalogue suit. Et le sondage
     n'a plus lieu d'être — on ne cherche plus à reconnaître les plateformes
     d'abonnement, on nous les a dites. Dix-neuf requêtes en moins par type. */
  const mien = mesPlates();
  if(mien.length){
    const rang = {};
    mien.forEach((p,i)=>{ rang[p.id] = i; });
    return l.slice().sort((a,b)=>
      (rang[a.id] === undefined ? 9999 : rang[a.id]) -
      (rang[b.id] === undefined ? 9999 : rang[b.id]));
  }
  if(!platesAboFait[media]) return l;                 // rien d'appris : on montre tout
  return l.filter(p => platesAbo[media][p.id]);
}

/* La liste montrée à la question « à quoi es-tu abonné » ne dépend pas du type
   affiché à l'écran : on est abonné à Netflix, pas à « Netflix pour les
   séries ». On fusionne donc les deux listes TMDB, en gardant pour chaque
   plateforme le meilleur rang d'affichage des deux. */
function platesToutesMedias(){
  const par = {};
  ['tv','movie'].forEach(m=>{
    (platesTMDB[m]||[]).forEach(p=>{
      if(!par[p.id] || p.rang < par[p.id].rang) par[p.id] = p;
    });
  });
  return Object.keys(par).map(k=>par[k])
    .sort((a,b)=> (a.rang - b.rang) || a.nom.localeCompare(b.nom));
}
function platesAffichees(){
  const l = platesRetenues();
  return ui.disc.toutesPlates ? l : l.slice(0, PLATES_VEDETTE);
}
function platesCachees(){
  return Math.max(0, platesRetenues().length - PLATES_VEDETTE);
}

/* Apprend quelles plateformes font de l'abonnement, en regardant les offres
   réelles d'un échantillon de titres populaires. Un échantillon trop pauvre est
   ignoré : mieux vaut proposer trop de plateformes que vider la liste. */
async function sonderPlates(media){
  const cle = media+':'+ui.disc.type;
  /* Plus rien à deviner dès que la personne a déclaré ses abonnements. */
  if(aDeclarePlates()) return false;
  if(sondageEnCours || sondagesFaits[cle]) return false;
  sondageEnCours = true;
  /* Marqué tout de suite, et non à la fin : un échantillon trop pauvre sortait
     par le `return false` plus bas SANS être noté, et les dix-neuf requêtes
     repartaient à chaque changement de filtre. */
  sondagesFaits[cle] = true;
  try{
    /* Même requête que l'écran, sans le filtre plateformes : l'échantillon
       ressemble à ce que l'utilisateur regarde. */
    const p = discParams();
    delete p.with_watch_providers; delete p.watch_region; delete p.with_watch_monetization_types;
    p.page = '1'; p.sort_by = 'popularity.desc';
    delete p['vote_count.gte']; delete p['vote_average.gte'];
    const d = await tmdb('/discover/'+media, p);
    const ids = (d.results||[]).slice(0, PLATES_ECHANTILLON).map(r=>r.id);
    const vues = Object.assign({}, platesAbo[media]);   // on accumule, jamais on n'oublie
    for(let i=0; i<ids.length; i+=PLATES_PAQUET){
      await Promise.all(ids.slice(i, i+PLATES_PAQUET).map(async id=>{
        try{
          const w = await tmdb('/'+media+'/'+id+'/watch/providers');
          const fr = (w && w.results && w.results[REGION_PLATO]) || {};
          (fr.flatrate||[]).forEach(f=>{ if(f && f.provider_id) vues[f.provider_id] = true; });
        }catch(e){}
      }));
    }
    if(Object.keys(vues).length < PLATES_MINI) return false;
    /* Ce qu'on a coché reste proposé, même si l'échantillon ne l'a pas croisé. */
    ui.disc.plates.forEach(x=> vues[x.id] = true);
    platesAbo[media] = vues;
    platesAboFait[media] = true;
  } finally { sondageEnCours = false; }
  return true;
}

/* Traduit l'état des filtres en paramètres TMDB.
   Les genres sont retenus par leur nom : « Comédie » suit quand on passe
   des séries aux films, même si TMDB ne lui donne pas le même identifiant. */
function discParams(){
  const d = ui.disc, media = discMedia();
  const p = { include_adult:'false', page:String(d.page) };

  /* Les genres partent en OU — la barre verticale, pas la virgule.

     La virgule est un ET chez TMDB. Cocher « Comédie » et « Crime » exigeait
     donc les deux à la fois, alors que la feuille écrit noir sur blanc « tu
     cherches comédie OU crime ». L'écran promettait une chose et la requête en
     faisait une autre.

     Sur la puce Animés, l'animation japonaise est la DÉFINITION de la puce,
     pas une préférence : elle devrait rester un ET. Mais mélanger les deux
     (`16,10759|10765`) ne marche pas — mesuré le 29/07, TMDB rend alors
     exactement le même total qu'avec `16,10759` seul : tout ce qui suit la
     barre est ignoré, en silence. On s'appuie donc sur la langue dans la
     requête et on vérifie l'animation chez nous (`garderAnimes`). Le tamis ne
     retire presque rien : sur 80 séries japonaises d'action ou de SF lues,
     79 portaient bien le genre Animation. */
  const ids = d.genres.map(n => genreParNom(media, n)).filter(x => x != null);
  if(d.type === 'anime'){
    p.with_original_language = 'ja';
    const anim = genreParNom(media, 'Animation');
    if(ids.length) p.with_genres = ids.join('|');          // Animation trié chez nous
    else if(anim != null) p.with_genres = String(anim);
  }else if(ids.length) p.with_genres = ids.join('|');

  /* Les envies partent en OU, comme les genres : cocher « braquage » ET
     « enquête » ne doit pas exiger les deux à la fois — presque aucun titre ne
     porterait les deux mots-clés, et on tomberait sur un écran vide. */
  if(d.envies.length) p.with_keywords = d.envies.join('|');

  /* Plateformes : « ou » entre elles (barre verticale), et uniquement ce qui est
     inclus dans un abonnement. TMDB exige la région avec ce filtre. */
  if(d.plates.length){
    p.with_watch_providers = d.plates.map(x => x.id).join('|');
    p.watch_region = REGION_PLATO;
    p.with_watch_monetization_types = 'flatrate';
  }

  /* Trier par note EXIGE un plancher de votes, sinon un 10/10 à trois voix
     passe devant tout le reste. Mais ce plancher retire des titres sans le
     dire, et 300 votes était bien trop haut : « 86 Eighty Six » (258 votes,
     8,1 de moyenne) devenait introuvable pour Adrien, qui n'avait choisi
     qu'un ORDRE. Mesuré le 29/07 sur les animés d'action depuis 2020 :
     300 votes ne laissaient que 40 titres, 100 en laissent 101.
     Le plancher est maintenant écrit dans la feuille, sous le tri. */
  if(d.tri === 'note'){ p.sort_by = 'vote_average.desc'; p['vote_count.gte'] = String(DISC_VOTES_MINI); }
  else p.sort_by = 'popularity.desc';

  /* « Peu importe » ne pose aucune borne de date : c'est tout le catalogue.
     Les décennies portent les leurs, « Sorties récentes » reste une fenêtre
     glissante calculée à partir d'aujourd'hui. */
  const champ = media === 'movie' ? 'primary_release_date' : 'first_air_date';
  if(d.perimetre === 'recent'){
    p[champ+'.gte'] = isoIlYA(DISC_FENETRE);
    p[champ+'.lte'] = todayISO();
  }else{
    const per = DISC_PERIMETRES.find(x=>x.id === d.perimetre);
    if(per && per.de){ p[champ+'.gte'] = per.de; p[champ+'.lte'] = per.a; }
  }

  /* La durée ne part QUE si elle a été mesurée fiable — voir DISC_DUREE_FIABLE.
     La borne basse à 1 est indispensable le jour où on la rallumera : sans
     elle, tout ce dont TMDB ignore la durée passe pour un film court. */
  if(DISC_DUREE_FIABLE && media === 'movie'){
    const du = DISC_DUREES.find(x=>x.id === d.duree);
    if(du && du.max != null){ p['with_runtime.lte'] = String(du.max); p['with_runtime.gte'] = '1'; }
    if(du && du.min != null) p['with_runtime.gte'] = String(du.min);
  }
  if(d.noteMin){
    p['vote_average.gte'] = String(d.noteMin);
    if(!p['vote_count.gte']) p['vote_count.gte'] = String(DISC_VOTES_MINI);
  }

  /* RETOUR-04 POINT 2 (27/08/2026) — FILTRE PLATEFORME POSÉ, LE PLANCHER DE
     VOTES SAUTE. La règle est la même des deux côtés de l'app, et elle est
     écrite ici aussi parce que la Recherche et Découvrir composent leurs
     requêtes séparément : la poser à un seul endroit la laisserait tomber à
     l'autre au premier lot venu. Constat d'Adrien : « tous les films
     Netflix/Prime/Disney+/Canal+/Apple TV+/Max/Crunchyroll/ADN doivent être
     présents » — et la mesure lui donne raison (relais, région FR, 27/08) :

       | Requête                          | plancher 80 | sans plancher | coupé |
       | 8 grandes plateformes FR, films  |       6 312 |        16 680 |  −62 %|
       | 8 grandes plateformes FR, séries |       2 606 |         8 755 |  −70 %|
       | Crunchyroll + ADN (animés)       |         453 |         1 711 |  −73 %|

     Être au catalogue d'une plateforme est déjà une sélection éditoriale : le
     plancher n'y protège de rien et ampute les deux tiers du catalogue.

     L'EXCEPTION, ET ELLE COMPTE : dès que la NOTE entre en jeu — tri par note
     (`vote_average.desc`) ou note minimale — le plancher reste, plateforme ou
     pas. Une moyenne portée par quatre votes ne veut rien dire, c'est la
     mesure du 02/08 qui l'a montré ; `DISC_VOTES_MINI` s'applique alors comme
     aujourd'hui. C'est pourquoi le test porte sur `vote_average` et non sur le
     seul filtre plateforme.

     Aujourd'hui, dans Découvrir, ce retrait ne trouve rien à retirer : le seul
     `vote_count.gte` de cette fonction est justement celui de la note. C'est
     voulu — la règle est posée AVANT qu'un plancher de grille n'arrive ici, pas
     après avoir constaté qu'il coupe. */
  if(p.with_watch_providers && !p['vote_average.gte']
     && String(p.sort_by||'').indexOf('vote_average') < 0){
    delete p['vote_count.gte'];
  }
  return p;
}

async function chargerGenres(media){
  if(genresTMDB[media]) return genresTMDB[media];
  const d = await tmdb('/genre/'+media+'/list');
  genresTMDB[media] = (d.genres||[]).map(g=>({ id:g.id, nom:g.name }));
  return genresTMDB[media];
}

/* Liste des plateformes disponibles en France. Un échec n'est pas bloquant :
   la section reste simplement vide dans les filtres. */
async function chargerPlates(media){
  if(platesTMDB[media]) return platesTMDB[media];
  try{
    const d = await tmdb('/watch/providers/'+media, { watch_region: REGION_PLATO });
    platesTMDB[media] = (d.results||[])
      .filter(p => p && p.provider_id && p.provider_name)
      /* TMDB compte les formules avec publicité comme des plateformes à part
         (« Netflix Standard with Ads »). C'est le même service, la même
         bibliothèque : on ne garde que l'entrée principale. */
      .filter(p => !PLATES_PUB.test(p.provider_name))
      .map(p=>{
        /* TMDB donne un ordre d'affichage par pays, et un ordre général en secours. */
        let rang = 9999;
        if(p.display_priorities && p.display_priorities[REGION_PLATO] != null) rang = p.display_priorities[REGION_PLATO];
        else if(p.display_priority != null) rang = p.display_priority;
        return { id:p.provider_id, nom:String(p.provider_name), logo:p.logo_path||null, rang:rang };
      })
      .sort((a,b)=> (a.rang - b.rang) || a.nom.localeCompare(b.nom));
  }catch(e){ platesTMDB[media] = []; }
  return platesTMDB[media];
}

async function chargerDecouverte(suite){
  const d = ui.disc;
  const seq = ++discSeq;
  d.page = suite ? d.page + 1 : 1;
  /* Une nouvelle liste (type ou filtre changé) repart du haut ;
     « Voir plus » ne bouge évidemment pas la page. */
  if(!suite){
    d.res = []; d.pages = 1;
    oublierDefil('discover');
    if(view === 'discover') window.scrollTo(0,0);
  }
  d.loading = true; d.err = '';
  peindreDisc();
  try{
    const media = discMedia();
    await chargerGenres(media);
    /* La liste des plateformes n'est pas bloquante : elle vient en arrière-plan.
       Elle n'a plus de feuille à rafraîchir depuis que celle-ci est partie dans
       Recherche ; elle sert encore à `platesRetenues`. */
    chargerPlates(media);
    /* Un genre qui n'existe pas pour ce type est retiré, mais on le dit. */
    const perdus = d.genres.filter(n => genreParNom(media, n) == null);
    if(perdus.length){
      d.genres = d.genres.filter(n => genreParNom(media, n) != null);
      toast(perdus.length > 1
        ? 'Genres sans équivalent ici : '+perdus.join(', ')
        : '« '+perdus[0]+' » n\'existe pas pour ce type');
    }
    /* On enchaîne les pages TMDB jusqu'à la cible — la même mécanique comble
       au passage les trous creusés par le filtre des titres non occidentaux.
       Un catalogue épuisé (pageLue >= pagesTotal) est une réponse complète. */
    let trouves = [], pagesTotal = 1, pageLue = d.page;
    for(let tour = 0; tour < DISC_PAGES_MAX; tour++){
      const p = discParams();
      p.page = String(pageLue);
      const data = await tmdb('/discover/'+media, p);
      if(seq !== discSeq) return;
      pagesTotal = data.total_pages || 1;
      const bruts = (data.results||[]).filter(r => r.poster_path);
      /* `garderAnimes` est neutre hors de la puce Animés, `garderOccident` est
         neutre dedans : les deux peuvent s'enchaîner sans condition. Le premier
         est devenu nécessaire ici depuis que les genres cochés partent en OU —
         c'est lui qui garantit l'animation que la requête ne peut plus exiger. */
      trouves = trouves.concat(garderAnimes(garderOccident(bruts)));
      if(trouves.length >= DISC_CIBLE || pageLue >= pagesTotal) break;
      pageLue++;
    }
    d.page = pageLue;
    /* Le classement TMDB bouge entre deux requêtes : un même film peut figurer
       sur deux pages voisines. Sans ce tri, il apparaîtrait deux fois. */
    const vus = {};
    (suite ? d.res : []).forEach(r => { vus[r.id] = 1; });
    trouves = trouves.filter(r => vus[r.id] ? false : (vus[r.id] = 1));
    d.res = suite ? d.res.concat(trouves) : trouves;
    d.pages = pagesTotal;
    d.loading = false; d.err = ''; d.charge = true;
    peindreDisc();
  }catch(e){
    if(seq !== discSeq) return;
    if(suite) d.page = Math.max(1, d.page - 1);
    d.loading = false; d.charge = true;
    d.err = (e.message === 'BADKEY') ? 'Service indisponible' : 'Pas de connexion';
    peindreDisc();
  }
}

/* Ne repeint que la zone des résultats : les puces gardent leur défilement.
   La ligne de résumé et le bouton Filtres sont remis à jour au passage,
   pour que l'état des filtres reste visible sous les puces de type. */
function peindreDisc(){
  if(view !== 'discover') return;
  const el = document.getElementById('dres');
  if(!el) return render();
  /* Il n'y a plus qu'un état à peindre : le champ, la ligne de résumé et le
     bouton Filtres sont partis dans Recherche (§3.1). Ce qui reste de E1 — la
     règle d'affichage écrite au même endroit dans la vue et dans le repeint —
     n'a plus d'objet : il n'y a plus de ligne de résumé à masquer. */
  el.innerHTML = vitrineVisible() ? vitrineBody() : discBody();
}

/* R1 (relecture du 10/08) — RE-TOUCHER LA FAMILLE ACTIVE REVIENT À « TOUT ».
   C'est écrit au §0.3 et c'est ce que fait la maquette (`setFam`). Avant, la
   fonction sortait par la porte de service (`if(type === t) return`) : la
   famille était le SEUL filtre de l'écran qu'on ne pouvait pas retirer par où
   on l'avait posé — l'humeur, elle, se désélectionne. Une asymétrie qu'on ne
   remarque pas en lisant le code et qui saute aux yeux au doigt.
   « Tout » reste inerte au second appui : il n'y a rien au-dessus de lui. */
function setDiscType(t){
  if(ui.disc.type === t){
    if(t === 'tout') return;
    t = 'tout';
  }
  ui.disc.type = t;
  ui.disc.typeForce = false;      // E4 — choix explicite : plus rien à signaler
  render();
  /* Chacun son chargement : la vitrine au repos, la grille quand on filtre.
     La vitrine, elle, a DÉJÀ été lancée par `render()` — la relancer ici la
     marquait périmée en plein calcul, et tout le travail était refait une
     seconde fois pour un simple changement de puce.
     Revue de stabilité du 02/08, constat A1-8. */
  if(!vitrineVisible()) chargerDecouverte();
}
function filtresActifs(){
  const d = ui.disc;
  /* Les plateformes ne comptent que si on y a touché. Sans ça, une personne
     ayant déclaré ses abonnements ouvrait Découvrir sur la grille filtrée : sa
     vitrine avait disparu sans qu'elle ait rien demandé. */
  /* E1 — LE TRI N'EST PAS UN FILTRE. Il ordonne, il ne retranche rien. Le
     laisser ici faisait disparaître toute la vitrine personnalisée — carrousel,
     « Des séries pour toi », « Dans l'esprit de… », « Avec X » — sur un simple
     changement d'ordre, et il fallait retrouver la croix de la ligne de résumé
     pour revenir. Le tri s'applique désormais À L'INTÉRIEUR des rangées.

     Le PÉRIMÈTRE reste, lui, contrairement à ce que proposait le document : il
     pose une borne de date (`primary_release_date.gte/lte`, voir
     `paramsDecouverte`). « Années 90 » retranche des titres du catalogue —
     c'est une restriction, pas un cadrage. Vérifié dans le code avant de
     trancher, comme la spec le demandait. */
  return d.genres.length > 0 || (d.platesTouchees && d.plates.length > 0) || d.envies.length > 0 ||
         d.noteMin > 0 || d.perimetre !== 'tout' ||
         (DISC_DUREE_FIABLE && d.duree && d.duree !== 'tout' && discMedia() === 'movie');
}


/* ---------------------------------------------------------------------------
   Découvrir a deux états, et un seul tap les sépare.

   AU REPOS — la vitrine : un titre mis en avant en grand, puis des rangées
   thématiques que l'on fait défiler du pouce. La loupe et le bouton Filtres
   restent en haut, toujours visibles : c'est le reproche d'Adrien sur la
   première maquette, on ne perd jamais la notion de filtre.

   FILTRÉ OU EN RECHERCHE — la grille : dès qu'un filtre mord, la vitrine
   s'efface au profit des résultats, avec le résumé de ce qui est appliqué et
   une croix pour tout effacer. Toute la puissance d'avant, intacte.
--------------------------------------------------------------------------- */
/* Chaque puce a désormais sa vitrine : Tout mêle séries, films et animés, les
   trois autres cadrent. La grille filtrée n'apparaît que si un filtre mord. */
/* DEPUIS LE RETRAIT DE LA FEUILLE (§3.1), PLUS RIEN NE POSE DE FILTRE : cette
   fonction rend donc toujours vrai, et la grille (`discBody`, `chargerDecouverte`,
   `discParams`) n'est plus atteignable depuis l'interface.
   Elle N'A PAS été supprimée, et c'est délibéré : c'est le moteur de Découvrir,
   pas la feuille, et le lot qui refera le chapitre 3 décidera de son sort. Le
   retrait demandé ici portait sur les deux portes d'entrée, pas sur le moteur. */
function vitrineVisible(){
  return !filtresActifs();
}

/* ===========================================================================
   LOT D §3.8 — « PAS POUR MOI » N'EST PAS UN 👎

   Deux gestes, deux sens, deux poids — et les confondre serait une faute :

     👎 sur un titre VU          « je n'ai pas aimé »     profil négatif, fort
     Pas pour moi sur une SUGGESTION  « ne me le remontre pas »  écarté, malus léger

   Un refus sur un titre qu'on n'a pas vu ne dit presque rien du goût : il dit
   « pas envie, là, maintenant ». Le traiter comme un rejet ferme condamnerait
   un genre entier en trois refus de politesse. Rien n'est donc écrit dans
   `db.avis` — jamais, à aucune condition.

   Où c'est rangé : dans `db.gouts`, qui part en entier à la synchro et que
   `toucheGouts` date. Le contrat de données du lot interdit d'écrire dans les
   clés existantes ; celle-ci est neuve, et elle est créée à la volée plutôt
   que dans `migrerGouts`, qui n'est pas de ce lot.
=========================================================================== */

/* Au-delà, on oublie les plus anciens. Ce bloc voyage à chaque synchro : un
   journal qui ne se vide jamais finit par coûter plus cher que ce qu'il rend. */
const REFUS_MAX = 300;
function refusSugg(){
  const g = db.gouts;
  if(!g) return {};
  if(!g.pasPourMoi || typeof g.pasPourMoi !== 'object' || Array.isArray(g.pasPourMoi))
    g.pasPourMoi = {};
  return g.pasPourMoi;
}
function estRefuseSugg(media, id){
  return !!refusSugg()[media + ':' + String(id)];
}
/* Le geste lui-même. On retient les GENRES du titre au moment du refus : c'est
   tout ce dont le malus a besoin, et c'est la seule information qui survivra
   au titre lui-même. */
function refuserSugg(x){
  if(!x || !db.gouts) return;
  const r = refusSugg();
  const genres = (x.genre_ids || [])
    .map(g => nomGenreParId(x.media, g))
    .filter(Boolean)
    .map(genreCanon);
  r[x.media + ':' + String(x.id)] = { quand: Date.now(), g: genres };
  const cles = Object.keys(r);
  if(cles.length > REFUS_MAX)
    cles.sort((a,b)=> (r[a].quand||0) - (r[b].quand||0))
        .slice(0, cles.length - REFUS_MAX)
        .forEach(k => { delete r[k]; });
  toucheGouts('pasPourMoi');
}

/* Le malus, et il est LÉGER : il décale, il ne retire rien. Un titre dont le
   genre a été refusé cinq fois recule d'une dizaine de places — assez pour
   qu'on cesse de le voir en tête, pas assez pour qu'un genre disparaisse sur
   trois refus de politesse. La borne haute est là pour ça.

   Le tri est STABLE : à malus égal, l'ordre reçu du moteur est conservé au
   titre près. C'est ce qui garantit qu'aucun refus ne réordonne un écran
   entier. */
const MALUS_PAS = 2, MALUS_MAX = 5;
function poidsRefusGenres(){
  const par = {}, r = refusSugg();
  Object.keys(r).forEach(k=>{
    (r[k].g || []).forEach(n=>{ par[n] = (par[n] || 0) + 1; });
  });
  return par;
}
function malusTitre(x, par){
  let n = 0;
  (x.genre_ids || []).forEach(g=>{
    const nom = nomGenreParId(x.media, g);
    if(nom) n += par[genreCanon(nom)] || 0;
  });
  return n;
}
function classerParMalus(l){
  const par = poidsRefusGenres();
  if(!Object.keys(par).length) return l;
  return l.map((x, i)=> ({ x:x, r: i + MALUS_PAS * Math.min(MALUS_MAX, malusTitre(x, par)) }))
    .sort((a,b)=> a.r - b.r)
    .map(o => o.x);
}

/* ---------------------------------------------------------------------------
   §3.3 — LA PROPOSITION DU JOUR

   Un seul titre, plein cadre, avec sa raison écrite et deux actions. Elle
   remplace le carrousel de cinq vedettes, qui ne disait rien de la personne :
   une seule proposition justifiée en dit plus que dix génériques.

   La raison est calculée par le moteur (`raisonDuJour`), pas ici : c'est lui
   qui sait de quel signal elle tire sa légitimité, et l'app ne doit jamais
   prétendre en savoir plus qu'elle n'en sait.
--------------------------------------------------------------------------- */
/* SPEC-04 lot C — la seule porte entre la vitrine et l'IA, et elle est à sens
   unique : elle LIT un cache, elle ne déclenche rien. Le déclenchement est
   ailleurs (`apresRenduDecouvrirIA`), après le rendu, jamais pendant — sinon un
   simple repeint partiel dépenserait une requête (§4.4, « cache d'abord »).
   `app-14-ia.js` peut être absent (un vieux cache de service worker qui n'a
   pas encore le fichier) : on ne suppose rien. */
function pitchOuRaison(x, hum){
  if(hum && typeof pitchIAHumeur === 'function'){
    const p = pitchIAHumeur(hum, x);
    if(p) return p;
  }
  if(!hum && typeof pitchIAduJour === 'function'){
    const p = pitchIAduJour(x);
    if(p) return p;
  }
  return x.pourquoi || '';
}

function propositionJourHtml(x){
  if(!x) return '';
  const bouts = [year(x.date), x.note ? '★ '+(Math.round(x.note*10)/10) : ''].filter(Boolean);
  const img = srcImage(x.bandeau,'w780') || srcImage(x.affiche,'w342');
  const id = Number(x.id), media = x.media === 'tv' ? 'tv' : 'movie';
  /* SPEC-04 §2 — LE HERO CHANGE D'HABIT, PAS DE FORME. La vitrine est
     conservée telle quelle (§0.1) : même image plein cadre, même titre, même
     ligne de raison, mêmes deux boutons. Une humeur posée en change seulement
     le libellé (« ✦ Pour frissonner ce soir ») et la couleur du bouton
     principal. Retirer l'humeur rend exactement l'écran d'avant. */
  const hum = (typeof humeurActive === 'function') ? humeurActive() : null;
  const hdef = (hum && typeof humeurDef === 'function') ? humeurDef(hum) : null;
  return '<div class="d4jour">'+
    '<button class="d4voir" onclick="ouvrirTitre('+id+',\''+media+'\',\'discover\')" '+
      'aria-label="'+esc(x.nom)+'">'+
      (img ? '<img class="d4img" loading="lazy" src="'+img+'" alt="">' : '<div class="d4img"></div>')+
    '</button>'+
    /* RETOUR-01 POINT 1 (11/08/2026) — LES PUCES NE SONT PLUS SUR L'IMAGE.
       Elles y étaient posées en verre dépoli depuis R6 (10/08). Constat de prod
       sur iPhone : elles se superposent au visage de l'affiche. Le calcul le
       confirme — deux rangées de ~35 px, un `top:10px`, et un `.d4bas` qui
       remonte de 92 px ne laissent que 122 px d'image libre, 72 px seulement
       sous 360 px de large. Aucun réglage de voile ne rattrape ça : le problème
       n'est pas la LISIBILITÉ des puces (le voile la réglait très bien), c'est
       le RECOUVREMENT de l'image. Les puces descendent donc dans le flux,
       AU-DESSUS du hero, dans la bande qui existait déjà pour les écrans sans
       hero (`bandeChips`) : un seul habillage au lieu de deux, et zéro
       chevauchement possible, à n'importe quelle largeur.
       PIERRE TOMBALE : `.h4voile` et `.h4surhero` n'ont plus d'emploi ; leurs
       règles quittent `app.css` avec ce point. */
    '<div class="d4bas">'+
      '<div class="d4tag'+(hdef ? ' h4on' : '')+'">'+
        (hdef ? '✦ '+esc(hdef.ceSoir) : 'La proposition du jour')+'</div>'+
      '<h2 class="d4nom">'+esc(x.nom)+'</h2>'+
      '<div class="d4meta">'+esc((media==='tv'?'Série':'Film')+(bouts.length?' · '+bouts.join(' · '):''))+'</div>'+
      /* Le cœur dit « ça vient de tes goûts ». En mode humeur c'est faux : le
         titre vient de la recette de l'humeur, pas du profil. On met donc
         l'étoile violette, qui dit « tu as demandé ça ce soir », et on ne fait
         pas passer une recette pour une déduction personnelle. */
      /* SPEC-04 lot C §3 — LE PITCH REMPLACE LA LIGNE DE RAISON, OU NE LA
         REMPLACE PAS. Trois conditions pour qu'il s'affiche : l'interrupteur
         allumé, un lot du jour arrivé, et un texte qui passe la validation de
         sortie (longueur, §0.4). Si l'une manque — et c'est le cas par défaut,
         l'interrupteur étant éteint à la livraison — la ligne au cœur actuelle
         reste, mot pour mot. Jamais de placeholder, jamais de phrase creuse :
         c'est écrit noir sur blanc au §3. */
      '<div class="d4pq'+(hdef ? ' h4pq' : '')+'">'+
        (hdef ? '<span class="h4etoile" aria-hidden="true">✦</span>' : I.coeur)+
        '<span>'+esc(pitchOuRaison(x, hum) || 'À découvrir')+'</span></div>'+
      '<div class="d4act">'+
        '<button class="btn'+(hdef ? ' h4btn' : '')+'"'+(occupe('serie:'+id)?' disabled':'')+
          ' onclick="ajouterProposition('+id+',\''+media+'\')">Ajouter à ma liste</button>'+
        '<button class="btn ghost" onclick="pasPourMoiProposition()">Pas pour moi</button>'+
      '</div>'+
    '</div></div>';
}

/* « Ajouter à ma liste » NE QUITTE PAS DÉCOUVRIR. C'est une des deux actions
   d'une carte qu'on enchaîne : partir sur la fiche de la série ferait perdre
   l'écran qu'on était en train de parcourir. `addOrOpenShow` reste le chemin
   normal depuis un aperçu, où l'on VOULAIT ouvrir la fiche ; ici on ajoute et
   on reste. Le titre entre alors dans la bibliothèque, donc il sort des
   suggestions, donc la proposition passe à la suivante — sans qu'on ait rien
   à écrire pour ça. */
async function ajouterProposition(id, media){
  if(media !== 'tv') return addMovie(id, false);
  if(db.shows[id]) return;
  if(!prendre('serie:'+id)) return;
  peindreDisc();
  try{
    const s = await fetchShowFull(id);
    s.watched = {}; s.addedAt = Date.now();
    db.shows[id] = s; saveDB();
    toast('« '+s.name+' » ajoutée');
  }catch(e){ toast('Impossible d\'ajouter cette série'); }
  rendre('serie:'+id);
  render();
}

/* La carte est remplacée IMMÉDIATEMENT par le candidat suivant : l'effet est
   visible tout de suite, et le titre écarté ne revient pas. Un geste qui ne
   change rien à l'écran est un geste qu'on ne refait pas (§3.9). */
function pasPourMoiProposition(){
  const x = propositionDuJour();
  if(!x) return;
  refuserSugg(x);
  peindreDisc();
}

/* Une vignette de rangée, à partir d'un titre normalisé par le moteur de
   goûts — films et séries mêlés, donc le média voyage avec chaque titre. */
/* `depuis` dit à quel écran la fiche devra revenir. Sans lui, ouvrir un titre
   depuis une rangée dépliée puis revenir en arrière retombait sur Découvrir :
   on perdait la grille qu'on était en train de parcourir. Ce paramètre se passe
   toujours explicitement — `l.map(vignetteSugg)` lui glisserait l'index. */
/* « le 12 août », ou « août 2027 » quand c'est loin. Sert aux titres qui ne
   sont pas encore sortis : leur date est la seule chose qu'on sache d'eux. */
const MOIS_COURT = ['janv.','févr.','mars','avril','mai','juin','juil.',
                    'août','sept.','oct.','nov.','déc.'];
function dateCourte(iso){
  if(!iso || iso.length < 10) return year(iso);
  const [a,m,j] = iso.split('-').map(Number);
  if(!a || !m || !j) return year(iso);
  const cetteAnnee = Number(todayISO().slice(0,4));
  return a === cetteAnnee ? j+' '+MOIS_COURT[m-1] : MOIS_COURT[m-1]+' '+a;
}
function estAVenir(iso){ return !!iso && iso > todayISO(); }

/* SPEC-04 §0.3 — LE BADGE DE FAMILLE, et il n'existe qu'en « Tout ».
   Dès qu'une famille est choisie, il répéterait la puce active sur chacune des
   affiches de l'écran : une information qu'on a déjà lue en haut n'a pas à être
   collée quarante fois. En « Tout », en revanche, c'est la seule chose qui
   distingue une série d'un film dans un rail mêlé.
   `estUnAnime` (app-11) est la MÊME règle que celle qui cadre la puce Animés —
   japonais ET classé animation : deux étiquettes qui se contrediraient sur le
   même titre seraient pires qu'une seule. */
const BADGE_FAMILLE = { movie:'FILM', tv:'SÉRIE', anime:'ANIMÉ' };
function badgeFamille(x){
  if(((ui.disc && ui.disc.type) || 'tout') !== 'tout') return '';
  const f = (typeof estUnAnime === 'function' && estUnAnime(x)) ? 'anime' : x.media;
  const lib = BADGE_FAMILLE[f];
  return lib ? '<span class="h4badge">'+lib+'</span>' : '';
}

function vignetteSugg(x, depuis){
  const item = x.media === 'tv' ? db.shows[x.id] : db.movies[x.id];
  /* Un titre à venir n'a ni note ni votes : afficher une étoile vide n'aurait
     rien dit, alors que sa DATE est précisément ce qu'on vient chercher. */
  const aVenir = estAVenir(x.date);
  const tete = aVenir ? '<span class="vgquand">'+esc(dateCourte(x.date))+'</span> '
             : x.note ? I.star+' '+(Math.round(x.note*10)/10)+' '
             : '';
  /* SPEC-04 — LE BADGE REMPLACE LA MENTION SOUS L'AFFICHE, il ne s'y ajoute
     pas. `.vgmed` disait déjà « Film » / « Série » sous la note ; garder les
     deux ferait dire deux fois la même chose à dix centimètres d'écart, sur
     chacune des cent affiches de l'écran. Hors « Tout », il n'y a pas de badge
     et la mention reprend sa place — sauf qu'elle est alors redondante avec la
     puce active, ce qui était déjà vrai avant ce lot et ne l'est pas devenu. */
  const badge = badgeFamille(x);
  return '<button class="vgn" onclick="ouvrirTitre('+x.id+',\''+x.media+'\',\''+(depuis||'discover')+'\')">'+
    '<div class="vgimg">'+posterEl(x.affiche,'w342','',x.nom)+ badge +
      (item ? '<span class="vgdeja">'+I.check+'</span>' : '')+'</div>'+
    '<div class="vgnom">'+esc(x.nom)+'</div>'+
    '<div class="vgnote">'+tete+
      (badge ? '' : '<span class="vgmed">'+(x.media==='tv'?'Série':'Film')+'</span>')+'</div>'+
  '</button>';
}

function vitrineBody(){
  /* D5 — sur une bibliothèque vide, la vitrine n'avait rien pour se construire :
     `famillesVues()` rendait zéro section, `titresAimes()` zéro graine, et il ne
     restait qu'un carrousel de sorties récentes suivi d'une rangée de sorties
     récentes. Le tout premier Découvrir ne parlait de personne.
     On demande donc trois titres, en montrant des affiches plutôt qu'un
     formulaire — un choix d'images, pas un questionnaire. */
  if(typeof besoinAmorcage === 'function' && besoinAmorcage()) return amorcageBody();
  const e = suggCourantes().etat;
  /* R6 — les puces ne quittent JAMAIS l'écran. Chaque sortie de secours de
     cette fonction emmène donc la bande avec elle : sans hero, elles n'ont plus
     d'image sur quoi se poser, mais elles restent le seul moyen de changer de
     famille ou de retirer une humeur — et c'est précisément dans un écran vide
     qu'on en a besoin. */
  if(e === 'froid' || e === 'attente')
    return bandeChips() + '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">On prépare tes suggestions…</p></div>';
  if(e === 'erreur')
    return bandeChips() + '<div class="empty">'+I.boussole+'<h3>Pas de connexion</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerSuggestions(true)">Réessayer</button></div>';

  const rangees = rangeesSuggerees();
  const jour = propositionDuJour();
  if(!jour && !rangees.length)
    return bandeChips() + '<div class="empty">'+I.boussole+'<h3>Rien à proposer '+esc(dansCettePuce())+'</h3>'+
      '<p>Ajoute une série ou un film : les suggestions se règlent sur ce que tu regardes.</p>'+
      '<button class="btn ghost" onclick="go(\'search\')">Chercher un titre</button></div>';

  /* RETOUR-01 POINTS 1 ET 2 (11/08/2026) — la bande de puces devient
     INCONDITIONNELLE : elle précède le hero au lieu de se poser dessus. Tous
     les états de cet écran (avec hero, sans hero, vide, en erreur, en attente)
     ouvrent donc sur exactement la même bande, au même endroit — c'est ce que
     R6 cherchait, en plus simple.
     Le lien « Ajuster mes goûts → » a disparu avec le point 2. */
  let html = bandeChips() + propositionJourHtml(jour) + carteProfilPauvre();
  /* UN SEUL NIVEAU DE TEXTE : le titre (§3.2). Pas de sous-titre, pas de
     pastille, pas de code couleur, aucun vocabulaire de moteur. Si une rangée
     ne sait pas s'expliquer dans son titre, c'est la rangée qui est mal
     conçue — c'est au moteur de la nommer mieux, pas à l'écran de la
     rattraper avec une seconde ligne. */
  rangees.forEach((r, iR)=>{
    /* SPEC-06 §1.3 — LE POINT D'ANCRAGE UNIQUE DU BANDEAU « DUEL DU JOUR ».
       Il s'insère APRÈS LA PREMIÈRE RANGÉE RENDUE, quelle qu'elle soit — on
       s'ancre sur la POSITION, jamais sur le nom d'une rangée : si le tableau
       du §1 de SPEC-04 est réordonné un jour, le bandeau suivra sans retouche.
       Ce n'est PAS une rangée (§1.1) : pas de numéro, pas de règle des 10, pas
       de tuile « Tout voir », et ses deux titres ne vont jamais dans « Aussi
       pour toi ». C'est la SEULE ligne que SPEC-06 ajoute à ce fichier — le
       §8 en fait un critère d'acceptation vérifiable au diff. */
    if(iR === 1) html += bandeauApresPremiereRangee();
    /* SPEC-04 lot C — l'intitulé peut avoir été réécrit par le lot quotidien.
       `intituleIA` rend le titre d'origine dès que l'IA est éteinte, que le lot
       n'est pas là, ou que la rangée n'en fait pas partie : la ligne ci-dessous
       est donc STRICTEMENT celle d'avant quand rien n'est allumé. */
    const titreJs = (typeof intituleIA === 'function') ? intituleIA(r.cle, r.titre) : r.titre;
    html += '<div class="sectitle">'+esc(titreJs)+'</div>'+
      '<div class="rangee'+(r.top ? ' h4top' : '')+'" data-rail="rangee-'+esc(r.cle||r.titre)+'">'+
        r.l.slice(0, RANGEE_APERCU)
          .map((x, i) => r.top ? vignetteTop(x, i) : vignetteSugg(x, 'discover')).join('')+
        finRangee(r)+'</div>';
  });
  /* §4.3 — LE LOT SE GÉNÈRE APRÈS LE PREMIER RENDU, jamais avant. La vitrine
     ci-dessus est déjà construite : ce qui suit ne fait que poser un rendez-vous
     pour le tour de boucle suivant, et il est idempotent. Deux rendez-vous sont
     pris ici, et ils n'ont rien à voir l'un avec l'autre : le lot IA (textes,
     soumis à l'interrupteur) et la moitié personnelle de « Bientôt » (dates
     françaises, R7 — du calendrier, aucun modèle). */
  /* SPEC-06 §1.3 — « après la première rangée rendue, quelle qu'elle soit ».
     Avec une seule rangée à l'écran, `iR === 1` n'arrivait jamais et le bandeau
     disparaissait — sans effet aujourd'hui (treize rangées au démarrage), mais
     l'ancrage doit dire ce qu'il promet. Relevé en relecture. */
  if(rangees.length === 1) html += bandeauApresPremiereRangee();
  apresRenduVitrine();
  return html + '<div style="height:6px"></div>';
}

/* Les rendez-vous d'après-rendu. Groupés dans une fonction pour que
   `vitrineBody` reste lisible et que le test de non-régression ait un seul
   nom à surveiller. Toute la prudence est chez les appelées : elles vérifient
   leur propre cache et ne font rien deux fois. */
/* Le seul point d'entrée du bandeau de SPEC-06 dans ce fichier. Il rend '' dès
   que `app-16-duel-plus.js` n'est pas là, ou que l'une des quatre conditions du
   §1.4 mord. */
function bandeauApresPremiereRangee(){
  return (typeof bandeauDuelJour === 'function') ? bandeauDuelJour() : '';
}

function apresRenduVitrine(){
  if(typeof apresRenduDecouvrirIA === 'function') apresRenduDecouvrirIA();
  /* RETOUR-01 POINT 5 (11/08/2026) — le pitch suit le hero. Ce rendez-vous-ci
     est pris à CHAQUE rendu de la vitrine, et c'est voulu : les trois gestes
     qui changent le hero (« Pas pour moi », famille, humeur) passent tous par
     là. Il est idempotent — un titre déjà pitché, ou déjà tenté, ne redéclenche
     rien — et il est borné à trente requêtes par jour. */
  if(typeof toucherPitchHeroIA === 'function') toucherPitchHeroIA();
  if(typeof amorcerBientotDuJour === 'function') amorcerBientotDuJour();
}

/* ---------------------------------------------------------------------------
   POINT 8 DES RETOURS v85 — CE QUI REMPLACE LES DEUX PAVÉS DE TEXTE

   Deux blocs s'affichaient ici : l'aveu technique sur les plateformes (« TMDB
   ne sait pas y filtrer… ») et le rapport de diagnostic (« Je pars de tes 97
   séries commencées et 382 films vus… »). Les deux sont partis.

     · L'aveu technique est SUPPRIMÉ, purement et simplement. Le nom d'un
       fournisseur de données et ce qu'il ne sait pas faire n'ont rien à faire
       sous les yeux de quelqu'un qui cherche quoi regarder.
     · Les chiffres du profil restent dans Mes goûts, où la version longue
       existe déjà (`explicationProfil`). On n'en duplique pas une ligne : le
       lien y mène, c'est tout.

   Ce que la maquette a rendu visible et qui a emporté la décision : le pavé
   repoussait la proposition du jour de près de cent pixels. On ouvrait l'app
   et on lisait deux paragraphes avant de voir le premier film. Et
   l'explication existe déjà au bon endroit — chaque titre porte sa raison.

   PIERRE TOMBALE — RETOUR-01 POINT 2, 11/08/2026. Le lien de remplacement
   « Ajuster mes goûts → » est SUPPRIMÉ à son tour, sur décision d'Adrien : le
   duel est mis en avant partout, et un lien qui envoie régler ses goûts à la
   main n'a plus sa place en tête de Découvrir. `lienAjusterGouts()` n'existe
   plus, son unique appelant (`vitrineBody`) non plus, et la règle `.d4lien`
   quitte `app.css`. L'écran Mes goûts reste accessible par Mon profil (engrenage
   → Mon compte et réglages → première ligne), et par les deux appels
   CONTEXTUELS qui subsistent ailleurs : « Dire ce que j'aime → » dans le repli
   de la carte de profil pauvre (plus bas dans ce fichier) et le bandeau du duel
   (`app-16`). Ce que le point 2 retire, c'est le lien PERMANENT en tête de
   Découvrir — pas tous les chemins. La première rédaction disait « son SEUL
   chemin » : c'était faux, et une pierre tombale doit être la vérité durable du
   dépôt. Relevé en relecture.
   Ce qu'il ne faut pas faire en le regrettant : le remettre ailleurs dans
   Découvrir. Il a déjà été déplacé une fois ; le point 2 ne demande pas un
   nouvel emplacement, il demande sa disparition.
--------------------------------------------------------------------------- */

/* §1.5 / §2.4 — DÉCOUVRIR APPELLE LE DUEL QUAND LE PROFIL EST TROP PAUVRE, et
   seulement là. Une bibliothèque garnie mais aucun 👍, c'est exactement le cas
   où l'app propose mal ET où deux minutes changent tout l'écran : les rangées
   de cœur sont fermées, la proposition du jour n'a rien de mieux qu'un
   incontournable à offrir.

   Elle ne se ferme pas à la main, et c'est voulu : elle disparaît d'elle-même
   au premier 👍. Une carte qu'on peut faire taire sans rien changer revient
   demain ; celle-ci ne revient que tant qu'elle a raison. */
function carteProfilPauvre(){
  if(typeof titresAimes !== 'function') return '';
  const aime = ['tv','movie'].some(m =>
    Object.keys((db.avis && db.avis[m]) || {}).some(id => avisDe(m, id) === 1));
  if(aime) return '';
  const n = Object.keys(db.shows).length + Object.keys(db.movies).length;
  if(!n) return '';                       // page blanche : c'est la grille d'amorçage qui parle
  const prets = (typeof famillesDuel === 'function') ? famillesDuel() : [];
  const f = prets[0];
  return '<div class="d4appel">'+
    '<b>Je te propose mal.</b>'+
    '<p>Tu as '+n+' titre'+(n>1?'s':'')+' dans ta bibliothèque, mais je ne sais pas '+
      'lesquels t\'ont plu. Deux minutes pour me le dire, et cet écran change '+
      'complètement.</p>'+
    (f ? '<button class="btn" onclick="ouvrirDuel(\''+escJs(f.cle)+'\')">Départager mes '+
           esc(f.nom)+' →</button>'
       : '<button class="btn" onclick="go(\'gouts\',{from:\'discover\'})">Dire ce que j\'aime →</button>')+
  '</div>';
}

/* ===================== D5 — la grille d'amorçage ===================== */
/* D'OÙ VIENNENT CES TITRES — mesuré en production, pas supposé.

   Première version : `/trending/all/week`, comme le document le proposait.
   DEUX défauts, tous deux vérifiés en direct sur le relais :

   1. `/trending` n'est PAS dans la liste blanche du relais (`AUTORISES`, dans
      supabase/functions/tmdb/index.ts) : les trois pages renvoyaient 404. La
      grille serait tombée sur « Pas de connexion » à chaque ouverture, pour
      tout le monde, sans que rien ne le signale.
   2. Même autorisé, « tendances de la semaine » ne répond pas à la question
      posée. On demande « qu'est-ce que tu as aimé ? » : il faut des titres que
      les gens RECONNAISSENT, pas le buzz du moment.

   Source retenue : `/discover`, trié par nombre de votes décroissant, avec un
   plancher élevé. Relevé en production : Interstellar, Inception, Fight Club
   côté films ; Game of Thrones, Breaking Bad, Squid Game côté séries.

   TROIS familles, pas une. `garderOccident` écarte le japonais : la grille
   n'aurait proposé aucun animé, alors que c'est le gros de la bibliothèque
   d'Adrien. Une personne qui regarde surtout des animés n'aurait eu aucun moyen
   de le dire. On interroge donc explicitement les trois familles et on les
   entrelace, comme `grainesSuggestions` le fait déjà pour la vitrine. */
let amorcage = { etat:'froid', l:[] };

const SOURCES_AMORCAGE = [
  { cle:'film',  chemin:'/discover/movie',
    p:{ sort_by:'vote_count.desc', 'vote_count.gte':5000 }, media:'movie' },
  { cle:'serie', chemin:'/discover/tv',
    p:{ sort_by:'vote_count.desc', 'vote_count.gte':2000 }, media:'tv' },
  /* Le genre 16 est « Animation » chez TMDB ; la langue d'origine évite les
     dessins animés occidentaux, qui relèvent d'un autre goût. */
  { cle:'anime', chemin:'/discover/tv',
    p:{ sort_by:'vote_count.desc', 'vote_count.gte':300,
        with_genres:16, with_original_language:'ja' }, media:'tv' }
];

async function chargerAmorcage(force){
  if(amorcage.etat === 'attente') return;
  if(amorcage.etat === 'ok' && !force) return;
  amorcage.etat = 'attente'; render();
  /* `allSettled` et non `all` : une famille qui échoue ne doit pas emporter les
     deux autres. Une grille de films et de séries vaut mieux qu'un écran
     d'erreur. */
  const rep = await Promise.allSettled(SOURCES_AMORCAGE.map(src=>
    tmdb(src.chemin, Object.assign({ page:1 }, src.p))));

  const paniers = {};
  rep.forEach((r, i)=>{
    const src = SOURCES_AMORCAGE[i];
    paniers[src.cle] = (r.status === 'fulfilled' ? ((r.value && r.value.results) || []) : [])
      .filter(x => x && x.poster_path)
      .map(x => ({ media:src.media, id:x.id, famille:src.cle, affiche:x.poster_path,
                   nom: src.media === 'movie' ? (x.title||'') : (x.name||'') }));
  });

  /* On entrelace : trois familles à parts égales plutôt qu'un bloc de films
     suivi d'un bloc de séries. Quelqu'un qui ne fait défiler qu'un écran doit
     voir les trois. */
  const vus = {}, out = [];
  for(let tour = 0; out.length < 30; tour++){
    let pris = 0;
    SOURCES_AMORCAGE.forEach(src=>{
      const x = (paniers[src.cle] || [])[tour];
      if(!x || out.length >= 30) return;
      const cle = x.media+':'+x.id;
      if(vus[cle]) return;
      vus[cle] = 1; out.push(x); pris++;
    });
    if(!pris) break;
  }
  amorcage = { etat: out.length ? 'ok' : 'erreur', l: out };
  if(view === 'discover') render();
}

function amorcageBody(){
  if(amorcage.etat === 'froid'){ setTimeout(()=>chargerAmorcage(), 0); }
  if(amorcage.etat === 'froid' || amorcage.etat === 'attente')
    return '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">On prépare quelques titres…</p></div>';
  if(amorcage.etat === 'erreur' || !amorcage.l.length)
    return '<div class="empty">'+I.boussole+'<h3>Pas de connexion</h3>'+
      '<p>On a besoin du réseau pour te proposer des titres. Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerAmorcage(true)">Réessayer</button></div>';

  const n = ((db.gouts && db.gouts.graines) || []).length;
  const reste = Math.max(0, GRAINES_MINI - n);
  return '<div class="wrap" style="padding-bottom:2px">'+
      '<div class="amtitre">Qu\'est-ce que tu as aimé ?</div>'+
      '<div class="small muted">'+
        (reste
          ? 'Touche au moins '+GRAINES_MINI+' titres — '+
            (n ? 'encore '+reste+'. ' : 'plus tu en mets, mieux ça vise. ')
          : n+' titre'+(n>1?'s':'')+' choisi'+(n>1?'s':'')+'. Continue tant que tu veux, '+
            'c\'est ce qui affine le plus. ')+
        'Ça ne les ajoute pas à ta bibliothèque.</div>'+
    '</div>'+
    '<div class="amgrille">'+
      amorcage.l.map(x=>{
        const on = aGraine(x.media, x.id);
        const img = srcImage(x.affiche,'w342');
        return '<button class="amcase'+(on?' on':'')+'" '+
          'onclick="poserGraine(\''+escJs(x.media)+'\','+Number(x.id)+',\''+escJs(x.nom)+'\',\''+
            escJs(x.famille||(x.media==='movie'?'film':'serie'))+'\')" '+
          'aria-pressed="'+(on?'true':'false')+'" aria-label="'+esc(x.nom)+'">'+
          (img ? '<img loading="lazy" src="'+img+'" alt="">' : '<span class="amvide">'+esc(x.nom)+'</span>')+
          (on ? '<span class="amcoche">'+I.check+'</span>' : '')+
        '</button>';
      }).join('')+
    '</div>'+
    '<div class="wrap">'+
      '<button class="btn block"'+(reste ? ' disabled' : '')+' onclick="finirAmorcage()">'+
        (reste ? 'Encore '+reste+' titre'+(reste>1?'s':'') : 'C\'est bon, montre-moi')+'</button>'+
      '<button class="btn ghost" style="width:100%;margin-top:9px" onclick="go(\'search\')">'+
        'Je préfère chercher un titre</button>'+
    '</div>'+
    '<div style="height:14px"></div>';
}

/* LOT D — `carteInvitGouts` a été RETIRÉE, remplacée par `carteProfilPauvre`.
   Elle invitait à régler ses goûts dès cinq titres aimés, refusable une fois
   pour toutes. Deux cartes d'invitation sur le même écran, c'en était une de
   trop, et la nouvelle est mieux fondée : elle ne s'affiche que quand l'app
   propose RÉELLEMENT mal (aucun 👍), elle dit ce que ça coûte et ce que ça
   change, et elle s'efface d'elle-même dès la première réponse au lieu de se
   faire congédier. `db.invitGoutsVue` n'est plus lu ; il reste dans les bases
   existantes, sans effet. */

/* Le rail est un APERÇU, pas la liste. Dix titres : de quoi balayer du pouce
   sans que ça devienne un couloir sans fin, et de quoi laisser à « Tout voir »
   quelque chose à montrer. */
const RANGEE_APERCU = 10;
/* Ce que la grille dépliée vise avant de rendre la main, et ce qu'ajoute
   chaque « Voir plus ». Une page TMDB rend vingt titres : trois pages environ,
   moins ce que le tamis retire. */
const RANGEE_LOT = 50;
/* Au-delà, on arrête d'insister : une page entièrement filtrée n'est pas une
   panne, mais dix d'affilée veulent dire que la source est épuisée. */
const RANGEE_PAGES_MAX = 8;

/* La dernière tuile de la rangée : « Tout voir ». Elle est au BOUT du rail,
   pas en haut à droite — choix d'Adrien. C'est le geste naturel : on pousse les
   affiches jusqu'à ce qu'il n'y en ait plus, et on tombe dessus sans lever le
   pouce ni remonter chercher un bouton. */
function finRangee(r){
  if(!r.cle || !r.l.length) return '';
  /* SPEC-04 §0.5 — LA TUILE NE PARAÎT QUE S'IL Y A VRAIMENT PLUS À VOIR, et
     elle dit COMBIEN : « Tout voir · les 34 ». Elle s'affichait jusqu'ici sur
     toutes les rangées, y compris celles dont la grille dépliée n'avait rien
     de plus à montrer que le rail — c'était la promesse d'un ailleurs qui
     n'existait pas. Le compte est celui de la rangée en mémoire, pas une
     estimation : la grille sait aller chercher la suite au-delà. */
  if(r.l.length <= RANGEE_APERCU) return '';
  /* Pas de classe `vgn` : ce n'est pas une vignette de titre, et tout ce qui
     parcourt `.rangee .vgn` (les tests de mise en page, notamment) y chercherait
     un nom et une note qu'elle n'a pas. */
  return '<button class="vgtout" onclick="ouvrirRangee(\''+escJs(r.cle)+'\')">'+
    '<div class="vgimg vgtoutbox">'+
      '<span class="vgtrond">'+I.caret+'</span>'+
      '<b>Tout voir</b>'+
      '<i>les '+r.l.length+'</i>'+
    '</div></button>';
}

/* SPEC-04 §1 rangée 2 — LA VIGNETTE DU TOP 10, et elle ne ressemble à aucune
   autre : le chiffre est le sujet. Pas de nom sous l'affiche, pas de note —
   ce sont des titres que la personne a déjà vus, elle les reconnaît à l'image ;
   ce qu'elle vient lire ici, c'est le RANG. Le nom part dans `aria-label`,
   parce qu'une affiche muette n'est lisible par personne d'autre que l'œil. */
function vignetteTop(x, i){
  return '<button class="h4rangc" onclick="ouvrirTitre('+Number(x.id)+',\''+escJs(x.media)+'\',\'discover\')" '+
    'aria-label="'+esc((i+1)+'. '+x.nom)+'">'+
    '<span class="h4rang" aria-hidden="true">'+(i+1)+'</span>'+
    '<span class="h4aff">'+posterEl(x.affiche,'w342','',x.nom)+'</span>'+
  '</button>';
}

/* SPEC-04 §0.2 — LES QUATRE HUMEURS, en puces « verre dépoli » sous les puces
   de famille. Les deux rangées se CUMULENT : la famille cadre ce qu'on regarde,
   l'humeur dit ce qu'on veut ressentir, et aucune des deux n'annule l'autre.
   Un second appui sur l'humeur active la retire — c'est la seule sortie, et
   elle est au même endroit que l'entrée. */
function humeurChips(){
  const on = (typeof humeurActive === 'function') ? humeurActive() : null;
  if(typeof HUMEURS === 'undefined') return '';
  return '<div class="chips h4chips">'+
    HUMEURS.map(h =>
      '<button class="chip h4chip'+(on === h.cle ? ' on' : '')+'" '+
        'aria-pressed="'+(on === h.cle ? 'true' : 'false')+'" '+
        'onclick="setHumeur(\''+escJs(h.cle)+'\')">'+h.emoji+' '+esc(h.label)+'</button>').join('')+
  '</div>';
}

/* R6 (relecture du 10/08, arbitré par Adrien) — LES DEUX RANGÉES DE PUCES SONT
   SUR LE HERO, comme la maquette qui fait foi.

   Elles étaient dans l'en-tête collant. Ce qui a emporté la décision : la
   maquette pose les deux rangées en verre dépoli PAR-DESSUS l'image, et
   l'en-tête de la spec dit qu'elle fait foi.

   CE QU'IL FALLAIT ÉVITER EN LES DÉPLAÇANT, et c'est le vrai risque du
   changement : que les puces DISPARAISSENT. `peindreDisc` ne repeint que
   `#dres` ; des puces laissées dans l'en-tête et un hero qui s'efface (dernier
   « Pas pour moi » de la réserve, écran vide, grille d'amorçage) auraient donné
   un écran sans aucun filtre, sans qu'un rendu complet vienne le réparer. Les
   puces vivent donc TOUJOURS dans `#dres` : posées sur l'image quand il y a une
   image, dans une bande ordinaire sinon. Un seul endroit, deux habillages. */
function chipsDecouvrir(){
  return '<div class="chips types">'+
    DISC_TYPES.map(t=>
      '<button class="chip '+(ui.disc.type===t.id?'on':'')+'" onclick="setDiscType(\''+t.id+'\')">'+
        t.label+'</button>').join('')+'</div>' + humeurChips();
}
/* La bande de repli, quand il n'y a pas de hero sous les puces. */
function bandeChips(){ return '<div class="h4bande">'+chipsDecouvrir()+'</div>'; }
function setHumeur(cle){
  const d = ui.disc;
  if(!d) return;
  const avant = d.humeur || null;
  d.humeur = (avant === cle) ? null : cle;
  /* L'écran change de composition : la position mémorisée désignerait le
     milieu d'une liste qui n'existe plus. */
  oublierDefil('discover');
  if(view === 'discover') window.scrollTo(0, 0);
  /* `render()` relance le calcul de la vitrine s'il le faut — et il ne le fait
     PAS quand la case de cache existe déjà, ce qui est le cas de l'écran au
     repos qu'on vient de quitter. Revenir au repos ne coûte donc rien. */
  render();
  /* SPEC-04 lot C §2 — UNE requête par humeur TOUCHÉE, et « touchée » veut dire
     « devenue active ». Désélectionner ne coûte rien, et re-toucher la même
     humeur dans la soirée non plus : `toucherHumeurIA` sort tout de suite si le
     cache tient encore (échéance à 6 h du matin). Le rendu ci-dessus est déjà
     parti : l'écran d'humeur est à l'image AVANT que la requête ne commence. */
  if(d.humeur && typeof toucherHumeurIA === 'function') toucherHumeurIA(d.humeur);
  if(!d.humeur) toast('Retour à la proposition du jour');
}

/* ---------------------------------------------------------------------------
   Une rangée dépliée en grille

   La rangée montre dix titres ; ici on va chercher la suite auprès de TMDB,
   page après page, avec exactement la requête qui a bâti la rangée. Le premier
   lot part tout seul à l'ouverture, les suivants sur « Voir plus ».

   Les titres déjà connus servent d'amorce : la grille s'affiche pleine dès la
   première image, et le chargement se voit en bas plutôt qu'à la place de tout.
--------------------------------------------------------------------------- */
let rangeeVue = { cle:null, titre:'', l:[], vus:{}, page:0, pages:1,
                  loading:false, err:'', fini:false, seq:0 };

function ouvrirRangee(cle){
  amorcerRangee(cle);
  /* Ouvrir la rangée est un nouveau départ : la liste vient d'être remise à
     zéro, la position mémorisée lors d'une visite précédente désignerait le
     milieu d'une grille qui n'existe plus. Revenir d'une fiche, en revanche,
     garde sa position — c'est `go` qui la restaure, pas nous. */
  delete memDefil[cleDefil('rangee', { cle:cle })];
  go('rangee', { cle:cle, from:'discover' }, 'enter');
  chargerRangee();
}

/* Repart de la rangée telle qu'elle est dans la vitrine. Appelée aussi au
   retour d'une fiche si l'état a été perdu entre-temps. */
function amorcerRangee(cle){
  const r = rangeeParCle(cle);
  rangeeVue = { cle:cle, titre: r ? r.titre : 'Suggestions',
                l: r ? r.l.slice() : [], vus:{}, page:0, pages:99,
                loading:false, err:'', fini:!r, seq: rangeeVue.seq + 1 };
  rangeeVue.l.forEach(x=>{ rangeeVue.vus[x.media+':'+x.id] = 1; });
}

/* Un lot : on enchaîne les pages jusqu'à RANGEE_LOT titres neufs, ou jusqu'à
   épuisement de la source. Une page peut ne rien rapporter du tout — tout son
   contenu est déjà chez toi — sans que ce soit la fin pour autant. */
async function chargerRangee(){
  const st = rangeeVue;
  if(st.loading || st.fini || !st.cle) return;
  const seq = st.seq;
  st.loading = true; st.err = '';
  if(view === 'rangee') render();
  const vise = st.l.length + RANGEE_LOT;
  try{
    for(let tour = 0; tour < RANGEE_PAGES_MAX; tour++){
      const d = await chargerPageRangee(st.cle, st.page + 1, st.vus);
      if(seq !== rangeeVue.seq) return;              // on a changé de rangée entre-temps
      st.page++;
      st.pages = d.pages || 1;
      st.l = st.l.concat(d.titres);
      if(st.page >= st.pages){ st.fini = true; break; }
      if(st.l.length >= vise) break;
    }
  }catch(e){
    if(seq !== rangeeVue.seq) return;
    st.err = 'Pas de connexion';
  }
  st.loading = false;
  if(view === 'rangee') render();
}

/* ---------------------------------------------------------------------------
   Écran « Mes plateformes »

   Le même écran sert trois fois : dernière étape de la création du compte
   (`from:'compte'` — pas de flèche de retour, un bouton « Passer »), entrée des
   réglages, et raccourci depuis la feuille de filtres. Rien n'est obligatoire.

   Pourquoi demander alors que le reste du profil se déduit : parce que ça ne se
   déduit pas. Voir quelqu'un regarder trois séries Netflix ne dit pas s'il paie
   Netflix, s'il les a vues chez un ami ou s'il les a achetées. Et la réponse
   sert deux fois — elle range la feuille de filtres, et elle remplace le
   sondage de dix-neuf requêtes qui tentait de deviner, à chaque changement de
   filtre, quelles plateformes font de l'abonnement en France.
--------------------------------------------------------------------------- */
function viewPlates(){
  /* D3 — cet écran ne fait plus partie de l'inscription non plus : le même
     raisonnement que pour « Mes goûts » s'y applique, et Adrien l'a tranché le
     30/07. Il ne s'ouvre plus que depuis les Réglages ou la feuille de filtres. */
  const toutes = platesToutesMedias();

  /* Les listes viennent de TMDB. On les demande une fois, et on ne redessine
     que si elles apportent vraiment quelque chose — sans ce garde-fou, une
     réponse vide relançait le rendu en boucle. */
  if(!toutes.length && !platesEcranDemande){
    platesEcranDemande = true;
    setTimeout(()=>{
      Promise.all([chargerPlates('tv'), chargerPlates('movie')])
        .then(()=>{ if(view === 'plates' && platesToutesMedias().length) render(); })
        .catch(()=>{});
    }, 0);
  }

  let html = header('Mes plateformes', {back:"goBack()"});

  html += '<div class="wrap" style="padding-bottom:6px"><div class="small muted">'+
    'Ce que tu coches ici passe en tête dans les filtres, et te permet de '+
    'limiter les suggestions à ce que tu peux regarder sans rien payer de plus.'+
    '</div></div>';

  /* La liste peut ne jamais arriver — TMDB en panne, ou hors-ligne. La barre du
     bas est ajoutée dans tous les cas : sans elle, on resterait coincé sur un
     rond qui tourne, au beau milieu de la création du compte. */
  /* Le réglage est posé même si la liste n'arrive jamais : il porte sur les
     plateformes DÉJÀ déclarées, et rien n'oblige à recharger le catalogue
     TMDB pour changer d'avis dessus. */
  if(!toutes.length) return html +
    '<div class="wrap"><div class="empty"><span class="spin"></span>'+
    '<p style="margin-top:12px">On récupère la liste des plateformes…</p></div></div>'+
    barreSuggPlates() + barrePlates();

  const choisies = mesPlates();
  const vues = ui.mesPlatesTout ? toutes : toutes.slice(0, PLATES_VEDETTE);
  /* Une plateforme cochée reste visible même si elle est loin dans la liste :
     replier « Voir plus » ne doit pas faire disparaître un choix sous les yeux. */
  const horsVue = choisies.filter(c => !vues.some(p => p.id === c.id));
  const liste = vues.concat(horsVue.map(c =>
    toutes.find(p => p.id === c.id) || { id:c.id, nom:c.nom, logo:c.logo }));
  const reste = Math.max(0, toutes.length - vues.length - horsVue.length);

  html += '<div class="wrap" style="padding-top:0"><div class="fchips">'+
    liste.map(p=>{
      const on = choisies.some(x => x.id === p.id);
      const logo = srcImage(p.logo,'w45') ? '<img loading="lazy" src="'+srcImage(p.logo,'w45')+'" alt="">' : '';
      return '<button class="chip chiplogo '+(on?'on':'')+'" aria-pressed="'+(on?'true':'false')+'" '+
        'onclick="bascMaPlate('+p.id+')">'+logo+'<span>'+esc(p.nom)+'</span></button>';
    }).join('')+'</div>';

  if(reste || ui.mesPlatesTout)
    html += '<button class="lienplus" onclick="voirToutesMesPlates()">'+
      (ui.mesPlatesTout ? 'Ne montrer que les principales'
                        : 'Voir les '+reste+' autres plateformes')+'</button>';

  html += '<div class="tiny muted" style="margin-top:14px">'+
    (choisies.length
      ? esc(choisies.length > 1 ? choisies.length+' plateformes sélectionnées'
                                : '1 plateforme sélectionnée')+
        ' · <button class="lienplus" style="margin:0" onclick="viderMesPlates()">Tout décocher</button>'
      : 'Rien de coché : l\'app te proposera tout, sans distinction.')+
  '</div></div>';

  html += barreSuggPlates();

  return html + barrePlates();
}
let platesEcranDemande = false;

/* La barre de validation, collée en bas comme celle des goûts. Les choix sont
   enregistrés au fil des appuis ; le bouton ne sert qu'à refermer l'écran. */
function barrePlates(){
  return '<div style="height:26px"></div>'+
    '<div class="gbarre">'+
    '<button class="btn block" onclick="fermerMesPlates()">Terminé</button>'+
    '<div class="tiny muted center" style="margin-top:7px">Tes choix sont déjà enregistrés.</div>'+
    '</div>';
}

/* Le sous-titre de la ligne des réglages : il doit dire en un coup d'œil si la
   question a été répondue, et par quoi. */
function resumePlates(){
  const l = mesPlates();
  if(!l.length) return 'Aucune — l\'app propose tout';
  if(l.length <= 2) return l.map(p=>p.nom).join(' et ');
  return l.length+' plateformes';
}

function bascMaPlate(id){
  const g = db.gouts; if(!g) return;
  const k = g.plates.findIndex(x => x.id === id);
  if(k >= 0) g.plates.splice(k, 1);
  else {
    const p = platesToutesMedias().find(x => x.id === id);
    if(!p) return;
    g.plates.push({ id:p.id, nom:p.nom, logo:p.logo });
    /* Ce qu'on déclare est une plateforme d'abonnement, par définition : le
       sondage n'a plus rien à apprendre là-dessus, et le filtre ne doit pas
       l'écarter au prétexte qu'un échantillon ne l'a pas croisée. */
    ['tv','movie'].forEach(m=>{ platesAbo[m][p.id] = true; });
  }
  /* `toucheGouts` date et enregistre : la signature des goûts a changé, la
     vitrine se refera d'elle-même sous les yeux, et la modification saura
     s'imposer sur l'autre appareil. */
  toucheGouts('plates');
  semerPlatesFiltres();
  render();
}
function voirToutesMesPlates(){ ui.mesPlatesTout = !ui.mesPlatesTout; render(); }
function viderMesPlates(){
  if(!db.gouts) return;
  db.gouts.plates = [];
  toucheGouts('plates'); semerPlatesFiltres(); render();
}
function finirMesPlates(){
  db.gouts.platesDemande = true; toucheGouts('plates');
  go('follow');
}
function fermerMesPlates(){
  db.gouts.platesDemande = true; toucheGouts('plates');
  toast('Plateformes enregistrées');
  goBack();
}

/* POINT 8 — LE RÉGLAGE A DÉMÉNAGÉ, IL N'A PAS DISPARU.

   Cette ligne vivait sous le carrousel de Découvrir. Elle portait deux choses :
   le choix « toutes les plateformes / les miennes », et l'aveu technique sur
   ce que TMDB ne sait pas filtrer. L'aveu est supprimé ; le choix, lui, est un
   vrai réglage et on ne pouvait pas le laisser orphelin — il n'existait nulle
   part ailleurs.

   Il rejoint donc « Mes plateformes », qui est l'écran de la question : on y
   coche ses abonnements, on y dit dans la foulée si les suggestions doivent
   s'y limiter. Découvrir redevient un écran qu'on parcourt, pas qu'on règle. */
function barreSuggPlates(){
  if(!aDeclarePlates()) return '';
  const on = suggSurMesPlates();
  const puce = (v, txt) =>
    '<button class="chip '+(!!v === on ? 'on' : '')+'" aria-pressed="'+(!!v === on)+'" '+
      'onclick="setSuggPlates('+(v?'true':'false')+')">'+txt+'</button>';
  return '<div class="wrap" style="padding-top:0">'+
      '<div class="small muted" style="margin-bottom:8px">Les suggestions de Découvrir '+
        'doivent-elles se limiter à ces plateformes ?</div>'+
      '<div class="fchips">'+puce(false, 'Tout me proposer')+puce(true, 'Seulement les miennes')+'</div>'+
    '</div>';
}
function setSuggPlates(v){
  const g = db.gouts; if(!g) return;
  if(!!g.suggMesPlates === !!v) return;
  g.suggMesPlates = !!v;
  /* `toucheGouts` déclenche la veille : la signature des goûts vient de
     changer, la vitrine se refera d'elle-même au retour sur Découvrir. */
  toucheGouts('plates');
  render();
}

function viewRangee(){
  /* Le retour d'une fiche repasse par ici : si l'état ne correspond plus à
     l'écran demandé, on le reconstruit avant de dessiner. */
  if(rangeeVue.cle !== params.cle) amorcerRangee(params.cle);
  const st = rangeeVue;

  if(!st.l.length && !st.loading)
    return header('Suggestions', { back:'goBack()' }) +
      '<div class="empty">'+I.boussole+'<h3>Cette liste a été recalculée</h3>'+
      '<p>Les suggestions se rafraîchissent toutes les 24 heures. Reviens à Découvrir '+
      'pour voir la nouvelle sélection.</p>'+
      '<button class="btn ghost" onclick="go(\'discover\')">Retour à Découvrir</button></div>';

  let bas = '';
  if(st.err)
    bas = '<div class="plus"><div class="small muted" style="margin-bottom:8px">'+esc(st.err)+'</div>'+
          '<button class="btn ghost" onclick="chargerRangee()">Réessayer</button></div>';
  else if(st.loading)
    bas = '<div class="plus"><button class="btn ghost" disabled>'+
          '<span class="spin"></span> Chargement…</button></div>';
  else if(!st.fini)
    bas = '<div class="plus"><button class="btn ghost" onclick="chargerRangee()">Voir plus</button></div>';

  return header(st.titre, { back:'goBack()' }) +
    '<div class="vgrid">'+st.l.map(x=>vignetteSugg(x,'rangee')).join('')+'</div>'+
    bas + '<div style="height:20px"></div>';
}

/* Le nom de ce qu'on regarde, pour les messages : « dans les animés ». */
function dansCettePuce(){
  const t = ui.disc.type;
  /* SPEC-04 — quand une humeur est posée, c'est ELLE qu'il faut nommer : dire
     « rien à proposer dans les animés » à quelqu'un qui vient de demander à
     frissonner lui cache la moitié de la raison, et surtout le geste qui
     répare (retirer l'humeur, pas changer de famille). */
  const h = (typeof humeurActive === 'function') ? humeurActive() : null;
  const hdef = (h && typeof humeurDef === 'function') ? humeurDef(h) : null;
  const ou = t === 'tv' ? 'dans les séries'
           : t === 'movie' ? 'dans les films'
           : t === 'anime' ? 'dans les animés' : '';
  if(hdef) return (ou ? ou + ' ' : '') + 'avec cette humeur';
  return ou || 'pour l\'instant';
}

function viewDiscover(){
  /* §3.1 — DEUX RETRAITS, ET IL NE RESTE QUE LES PUCES.
     Conséquence directe de la règle « Découvrir sert à découvrir, Recherche
     sert à trouver » :
       · LE CHAMP DE RECHERCHE PAR TITRE est parti. Deux portes pour la même
         chose, c'en était une de trop ; il vit maintenant dans Recherche, où
         il cherche aussi les personnes.
       · LA FEUILLE DE FILTRES (envies, durée, note, tri) est partie elle
         aussi. Un filtre, c'est de l'intention — donc de la Recherche.
     Ce qui disparaît avec elles : la ligne de résumé, qui ne résumait que des
     filtres, et le bouton qui les ouvrait.
     Découvrir devient un écran qu'on PARCOURT, pas qu'on interroge. */
  /* R6 — L'EN-TÊTE NE PORTE PLUS LES PUCES. Elles sont descendues dans `#dres`
     (voir `chipsDecouvrir`), posées sur le hero comme la maquette le veut. Ce
     qu'on perd : elles ne sont plus collantes au défilement. Ce qu'on gagne :
     elles sont là où la maquette les met, et elles survivent aux repeints
     partiels. C'est l'arbitrage d'Adrien du 10/08. */
  /* SPEC-10 §0.2 — la cloche, en haut à droite, la même que sur En cours et
     Mon profil : même pastille, même compte. C'est la SEULE ligne que ce lot
     ajoute à Découvrir (§7). */
  return header('Découvrir', { right: clocheCentre() }) + needKeyBanner() +
    '<div id="dres">'+(vitrineVisible() ? vitrineBody() : (bandeChips() + discBody()))+'</div>' +
    '<div style="height:20px"></div>';
}

/* E2 — MESURÉ APRÈS LE RETRAIT DE LA LOUPE : quatre puces (Tout, Séries,
   Films, Animés) tiennent dans 375 px, la rangée ne défile plus. La fonction
   reste malgré tout : elle ne fait rien quand tout tient (`scrollWidth <=
   clientWidth`), et une traduction plus longue ou un réglage d'accessibilité
   qui grossit le texte referait défiler la rangée. La retirer ne gagnerait
   rien et rouvrirait le défaut qu'elle corrige. */
function centrerTypeActif(){
  const r = document.querySelector('.chips.types');
  if(!r || r.scrollWidth <= r.clientWidth) return;
  const on = r.querySelector('.chip.on');
  if(!on) return;
  const cible = on.offsetLeft - (r.clientWidth - on.offsetWidth) / 2;
  r.scrollTo({ left: Math.max(0, cible), behavior:'auto' });
}

function discBody(){
  const d = ui.disc;
  if(d.loading && !d.res.length)
    return '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Recherche de titres…</p></div>';
  if(d.err)
    return '<div class="empty">'+I.boussole+'<h3>'+esc(d.err)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerDecouverte()">Réessayer</button></div>';
  if(!d.res.length)
    return '<div class="empty">'+I.boussole+'<h3>Rien avec ces filtres</h3>'+
      '<p>'+(d.plates.length
        ? 'Rien de tel sur '+(d.plates.length>2 ? 'ces plateformes' : esc(d.plates.map(p=>p.nom).join(' ou ')))+
          '. Ajoute une plateforme, ou élargis la note et les genres.'
        : 'Élargis la note minimale ou retire un genre.')+'</p>'+
      '<button class="btn ghost" onclick="go(\'search\')">Aller dans Recherche</button></div>';
  return '<div class="grid">'+d.res.map(r=>carteTitre(r, discMedia())).join('')+'</div>'+
    (d.page < d.pages
      ? '<div class="plus"><button class="btn ghost" onclick="chargerDecouverte(true)"'+
        (d.loading?' disabled':'')+'>'+(d.loading?'<span class="spin"></span> Chargement…':'Voir plus')+'</button></div>'
      : '');
}

/* ---------- Vue : aperçu avant ajout (série ou film) ---------- */
/* E8 — DEPUIS DÉCOUVRIR, UN TITRE QU'ON A DÉJÀ OUVRE SA FICHE.
   `preview` et `show`/`movie` sont deux fiches du même titre. Toucher une série
   suivie ouvrait l'aperçu, qui proposait « Ouvrir ma fiche » : un tap de plus à
   chaque consultation, pour arriver au même endroit.
   L'aperçu reste atteignable — c'est lui qu'on ouvre pour tout ce qui n'est pas
   encore dans la bibliothèque, et son bouton « Ouvrir ma fiche » sert encore
   aux chemins qui y mènent (ajout depuis l'aperçu, lien partagé). */
function ouvrirTitre(id, media, from){
  /* SPEC-04 — l'anti-déjà-vu compte les jours où un titre est passé sous les
     yeux SANS être ouvert. L'ouvrir remet son compteur à zéro : la rangée a
     fait son travail, elle n'a pas à le reculer. C'est ici et nulle part
     ailleurs, parce que c'est le seul passage obligé vers une fiche depuis
     Découvrir. */
  if(typeof noterOuverture === 'function') noterOuverture(media, id);
  const chezSoi = media === 'tv' ? db.shows[id] : db.movies[id];
  if(chezSoi) return go(media === 'tv' ? 'show' : 'movie',
                        { id:id, from: from || 'discover' }, 'enter');
  openPreview(id, media, from);
}
function openPreview(id, type, from){
  ui.preview = { id:id, type:type, loading:true, data:null };
  /* Toujours un mouvement vers l'avant : depuis une fiche d'acteur aussi, où la
     profondeur nominale de l'écran d'arrivée est pourtant plus faible. */
  go('preview', {id:id, type:type, from:from||'discover'}, 'enter');
  loadPreview(id, type);
}
/* Les cibles se passent en argument. Elles étaient lues au moment du tir, ce
   qui suffisait tant que l'appel suivait immédiatement le `go` — mais l'entrée
   directe depuis une notification tire dans un `setTimeout`, et chargeait alors
   l'aperçu de l'écran ARRIVÉ. Les appels sans argument restent valides.
   Revue de stabilité du 02/08, constat A3-9. */
async function loadPreview(id0, type0){
  const id = id0 != null ? id0 : params.id, type = type0 || params.type;
  try{
    const d = await tmdb('/'+type+'/'+id, { append_to_response:'credits,videos' });
    if(ui.preview.id===id) ui.preview = { id:id, type:type, loading:false, data:d };
    /* La fiche porte déjà casting et vidéos : on remplit les caches communs
       pour que la zone bande-annonce n'aille pas redemander la même chose. */
    castings[type+':'+id] = ((d.credits||{}).cast||[]).slice(0, 16);
    if(d.original_language) langueDe[type+':'+id] = d.original_language;
    semerBande(type, id, d);
  }catch(e){
    if(ui.preview.id===id) ui.preview = { id:id, type:type, loading:false, error:
      (e.message==='BADKEY' ? 'Clé TMDB invalide' : 'Impossible de charger la fiche') };
  }
  if(view==='preview') render();
}
