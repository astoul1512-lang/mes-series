/* ---------------------------------------------------------------------------
   RETOUR-09 — LA JAQUETTE DANS LE CENTRE DE NOTIFICATIONS.

       cd <depot> && python3 -m http.server 8099 &
       node tests/retour-09.js

   Demande d'Adrien (31/08) : « dans les notifications je veux la jaquette quand
   un nouvel épisode est disponible. » Une ligne de texte à côté d'un émoji ne
   dit pas DE QUOI on parle — l'affiche, si.

   Une suite d'ÉCRAN, comme retour-08, et pour la même raison : ce n'est pas une
   fonction qui ment, c'est un rendu. Un cas qui appellerait `posterEl()` serait
   vert du premier jour sans rien prouver — c'est le piège que la maison appelle
   « un test qui vérifie qu'on APPELLE n'éprouve pas ce que l'appel FAIT ».

   QUATRE PIÈGES SONT ÉPROUVÉS ICI, et chacun a sa raison d'être :

   1. LE FILM DOIT PRENDRE SON `poster`, PAS SON `image`. L'entrée que rend
      `filmsBientot` porte `image: m.backdrop || m.poster` (app-10:400) : c'est
      un BANDEAU paysage en priorité. Le lire donnerait une image couchée dans
      un cadre 2/3. Le décor pose donc un `backdrop` DIFFÉRENT du `poster`, et
      le test refuse de voir le backdrop.

   2. PAS DE BOUTON DANS UN BOUTON. `ligneCentre` produit déjà un `<button>`
      racine — contrairement à `carteRecoCentre`, dont la racine est un `<div>`
      et qui peut donc, elle, envelopper sa jaquette. Recopier son geste ici
      produirait du HTML invalide.

   3. LE REPLI EST CELUI DE `posterEl`, PAS L'ÉMOJI. La spec demandait les deux
      à la fois — « réutilise `posterEl`, pas de second chemin » ET « repli sur
      le pictogramme » — ce qui se contredit. Arbitré avec Adrien le 01/09 : on
      garde le repli natif, et la ligne ne doit PAS changer de hauteur.

   4. ZÉRO APPEL D'API. Ces entrées portent déjà `type` et `id`, et une sortie
      ne concerne qu'un titre suivi : l'affiche est déjà en base. Le décor
      compte les appels à `tmdb()` et exige zéro.

   Les recos et les retours ne sont PAS concernés : les premières ont déjà leur
   affiche, les seconds parlent d'une personne autant que d'un titre. Deux cas
   le vérifient, parce qu'un lot qui déborde de son périmètre est un lot raté.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';

let soucis = 0;
function ok(cond, msg){
  console.log((cond ? '   ✓ ' : '   ✗ ') + msg);
  if(!cond) soucis++;
}
function titre(t){ console.log('\n' + t); }

/* Le décor : une session ouverte, trois sorties du jour — une série avec
   affiche, une série SANS affiche, un film dont le backdrop et le poster
   diffèrent — plus une reco reçue et un retour, pour éprouver la portée. */
async function decor(page){
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
  await page.evaluate(()=>{
    window.__tmdbAppels = 0;
    window.__tmdbChemins = [];
    window.tmdb = async (chemin)=>{ window.__tmdbAppels++;
                              window.__tmdbChemins.push(String(chemin));
                              return { results:[], total_pages:1, total_results:0 }; };
    window.sbFetch = async ()=> ([]);
    db.auth = { token:'x', uid:'moi' };
    db.notifLus = {};
    partage.suivis = [{ id:'u2', pseudo:'Camille' }];
    partage.abonnes = []; partage.charge = true;

    const auj = todayISO();

    /* Une série SUIVIE (un épisode déjà vu → statut « à suivre ») dont le
       prochain épisode sort aujourd'hui. Elle a une affiche. */
    db.shows[100] = { id:100, name:'Severance', poster:'/sev.jpg',
                      seasons:{ 1:[{e:1,n:'Innie',d:'2020-01-01',r:42},
                                   {e:2,n:'Outie',d:auj,r:42}] },
                      watched:{ '1x1':1 }, addedAt:1, updated:1,
                      first:'2020-01-01', genres:[] };

    /* La même chose, mais SANS affiche connue — une vieille entrée de base. */
    db.shows[200] = { id:200, name:'Sans Affiche', poster:null,
                      seasons:{ 1:[{e:1,n:'A',d:'2020-01-01',r:42},
                                   {e:2,n:'B',d:auj,r:42}] },
                      watched:{ '1x1':1 }, addedAt:1, updated:1,
                      first:'2020-01-01', genres:[] };

    /* Un film qui sort aujourd'hui. PIÈGE 1 : `backdrop` et `poster` sont
       volontairement différents — c'est le `poster` qu'on veut voir. */
    db.movies[300] = { id:300, title:'Dune', poster:'/dune-affiche.jpg',
                       backdrop:'/dune-bandeau.jpg', seen:false, addedAt:1 };
    window.filmsBientot = ()=> ([{ id:300, titre:'Dune', dfr:auj,
                                   mot:'Sort au cinéma',
                                   image: db.movies[300].backdrop }]);

    /* Une reco reçue (carte) et un retour (ligne) : la portée du lot. */
    conseils = { recues:[{ id:'r1', de:'u2', vers:'moi', type:'tv', tmdb_id:1399,
                           titre:'Dark', cree:new Date().toISOString(), mot:'Vas-y' }],
                 envoyees:[{ id:'e1', de:'moi', vers:'u2', type:'movie', tmdb_id:603,
                             titre:'Matrix', cree:new Date().toISOString(),
                             ajoute:new Date().toISOString() }],
                 charge:true };

    /* Le fil garde ses sorties une minute (app-07) : on force le recalcul. */
    sortiesCentreCache = { t:0, jour:'', l:[] };
  });
}

/* Relit les lignes du centre, une par une, avec ce qui nous intéresse. */
async function lignes(page){
  return await page.evaluate(()=>{
    go('centre', { from:'discover' });
    const app = document.getElementById('app');
    return [...app.querySelectorAll('.notifl')].map(n=>{
      const img = n.querySelector('img');
      const ph  = n.querySelector('.poster.ph');
      const ico = n.querySelector('.notifi');
      return {
        texte:   n.textContent,
        /* `outerHTML` et pas `innerHTML` : l'`onclick` est porté par le bouton
           LUI-MÊME, il n'est pas dans ses enfants. */
        html:    n.outerHTML,
        img:     img ? img.getAttribute('src') : '',
        classes: img ? img.className : (ph ? ph.className : ''),
        repli:   !!ph,
        replitxt: ph ? ph.textContent : '',
        /* Le repli déborde-t-il de son cadre ? `.poster.ph` est dessiné pour
           64 px de large ; à 40 px son texte bavait sur le titre de la ligne. */
        deborde: ph ? (ph.scrollWidth > ph.clientWidth + 1 ||
                       ph.scrollHeight > ph.clientHeight + 1) : false,
        alt:     img ? (img.getAttribute('alt') || '') : '',
        icone:   ico ? ico.textContent : '',
        boutons: n.querySelectorAll('button').length,
        haut:    Math.round(n.getBoundingClientRect().height),
        nonlu:   n.classList.contains('nonlu')
      };
    });
  });
}

(async ()=>{
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
  await decor(page);
  const l = await lignes(page);

  const serie = l.find(x=> /Severance/.test(x.texte));
  const sans  = l.find(x=> /Sans Affiche/.test(x.texte));
  const film  = l.find(x=> /Dune/.test(x.texte));
  const retour= l.find(x=> /Matrix/.test(x.texte));

  titre('1. La sortie d\'un ÉPISODE porte sa jaquette');
  ok(!!serie, 'la ligne de la sortie de Severance est bien dans le fil');
  ok(!!serie && /\/sev\.jpg/.test(serie.img), 'elle affiche l\'affiche de la série');
  ok(!!serie && !/📅/.test(serie.texte), 'le pictogramme 📅 a laissé la place');
  ok(!!serie && /poster/.test(serie.classes),
     'la jaquette passe par `posterEl` (classe `poster`), pas par un second chemin');

  titre('2. La sortie d\'un FILM aussi — et c\'est son POSTER, pas son bandeau');
  ok(!!film, 'la ligne de la sortie de Dune est bien dans le fil');
  ok(!!film && /dune-affiche/.test(film.img), 'elle affiche le POSTER du film');
  ok(!!film && !/dune-bandeau/.test(film.img),
     'et surtout PAS le backdrop que porte `filmsBientot` (piège app-10:400)');

  titre('3. Sans affiche connue : le repli natif, et la ligne ne saute pas');
  ok(!!sans, 'la ligne du titre sans affiche est bien dans le fil');
  ok(!!sans && sans.repli, 'elle rend le repli de `posterEl` (`.poster.ph`)');
  ok(!!sans && !/📅/.test(sans.texte), 'elle ne retombe pas sur le pictogramme');
  ok(!!serie && !!sans && serie.haut === sans.haut,
     'la ligne garde EXACTEMENT la même hauteur avec et sans affiche ('+
     (serie ? serie.haut : '?')+' px vs '+(sans ? sans.haut : '?')+' px)');
  /* VU EN CAPTURE LE 01/09, ET PAR AUCUN TEST : le repli de `posterEl` est
     dessiné pour un cadre de 64 px. Posé dans 40 px, son texte sortait de la
     boîte et chevauchait le titre de la ligne. La hauteur, elle, était juste —
     c'est pour ça que la première version de cette suite ne voyait rien. */
  ok(!!sans && !sans.deborde,
     'le texte du repli reste DANS son cadre et ne chevauche pas le titre');
  /* Et il doit dire le TITRE, pas la phrase de la notification : `e.titre` vaut
     « Sans Affiche · S1E2 est disponible », illisible en 40 px de large. */
  ok(!!sans && !/S1E2/.test(sans.replitxt),
     'le repli porte le nom du titre, pas la phrase entière de la ligne (« '+
     (sans ? sans.replitxt : '')+' »)');
  ok(!!serie && !/S1E2/.test(serie.alt),
     'et l\'`alt` de la jaquette ne répète pas le texte affiché à côté');

  titre('4. Le périmètre : les retours et les recos ne bougent pas');
  ok(!!retour, 'la ligne « Camille a ajouté Matrix » est bien dans le fil');
  ok(!!retour && /✓/.test(retour.icone),
     'elle garde son pictogramme ✓ dans `.notifi` — elle parle d\'une personne');
  ok(!!retour && !retour.img, 'et elle ne gagne pas de jaquette');
  const reco = await page.evaluate(()=> !!document.querySelector('.recoc .recocp'));
  ok(reco, 'la carte de reco garde son affiche `.recocp`, intacte');

  titre('5. Le HTML reste valide, et le geste inchangé');
  ok(!!serie && serie.boutons === 0,
     'aucun bouton imbriqué dans la ligne (elle EST déjà un bouton)');
  ok(!!serie && /toucherCentre/.test(serie.html), 'le toucher ouvre toujours la fiche');
  ok(!!serie && serie.nonlu, 'la pastille de non-lu est toujours posée');

  titre('6. Zéro appel d\'API — l\'affiche est déjà en base');
  /* MESURE HONNÊTE. Le fil fait UN appel `/tv/1399` : c'est la carte de reco qui
     va chercher l'affiche d'un titre absent de ma base — comportement d'avant ce
     lot, hors périmètre (une reco porte sur un titre qu'on ne suit pas encore,
     par définition). Ce qu'on doit prouver ici, c'est que les lignes de SORTIE,
     elles, n'en ajoutent aucun : leurs trois titres sont déjà en base. */
  const appels = await page.evaluate(()=> ({ n:window.__tmdbAppels, ch:window.__tmdbChemins }));
  const surSorties = appels.ch.filter(c=> /\/(tv\/100|tv\/200|movie\/300)\b/.test(c));
  ok(surSorties.length === 0,
     'aucun appel d\'API pour les trois sorties (total du fil : '+appels.n+
     (appels.ch.length ? ' — ' + appels.ch.join(', ') : '')+')');

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
