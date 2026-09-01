/* ---------------------------------------------------------------------------
   RETOUR-11 — FILTRER LA BIBLIOTHÈQUE D'UN PROCHE.

       cd <depot> && python3 -m http.server 8099 &
       node tests/retour-11.js

   Demande d'Adrien (31/08) : « quand je vais voir la bibliothèque de quelqu'un,
   j'aimerais pouvoir filtrer comme sur mon profil. »

   CE QUE CETTE SUITE EXISTE POUR ATTRAPER, et qui ne se voit pas à l'écran :
   `pf12` était un objet GLOBAL unique. Le réutiliser tel quel aurait fait que
   les filtres posés chez Marie s'appliquaient à MA bibliothèque au retour — un
   bug sans message d'erreur, où des titres manquent simplement. C'est le §1 des
   « quatre pièges » de la spec, et le seul qu'aucun œil ne rattrape.

   Les cas 4 à 6 sont donc les plus importants du fichier : ils font le
   VA-ET-VIENT, dans les deux sens, et vérifient l'état des DEUX côtés.

   Rien n'est bouchonné sauf le réseau : `viewBiblio`, `viewProfile`,
   `pucesPf12`, `barreProfil`, `cartesProfil` et `ouvrirFiltresPf12` sont le
   vrai code.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';

let soucis = 0;
function ok(cond, msg){
  console.log((cond ? '   ✓ ' : '   ✗ ') + msg);
  if(!cond) soucis++;
}
function titre(t){ console.log('\n' + t); }

async function decor(page){
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
  await page.evaluate(()=>{
    window.tmdb = async ()=> ({ results:[], total_pages:1, total_results:0 });
    window.sbFetch = async ()=> ([]);
    /* `chargerBiblio` écraserait le décor avec la réponse (vide) du réseau. */
    window.chargerBiblio = async ()=> {};
    db.auth = { token:'x', uid:'moi' };
    partage.suivis = [{ id:'u2', pseudo:'Marie Dupont' },
                      { id:'u3', pseudo:'Camille' }];
    partage.abonnes = []; partage.charge = true;
    conseils = { recues:[], envoyees:[], charge:true };

    const serie = (id, nom, genre, an, chaine)=> ({
      id:id, name:nom, poster:'/p'+id+'.jpg', genres:[genre], first:an+'-01-01',
      network:chaine, seasons:{ 1:[{e:1,n:'A',d:an+'-01-01',r:42}] },
      watched:{ '1x1':1 }, addedAt:1, updated:1 });
    const film = (id, nom, genre, an)=> ({
      id:id, title:nom, poster:'/f'+id+'.jpg', genres:[genre], date:an+'-01-01',
      runtime:100, seen:true, watchedAt:1, addedAt:1 });

    /* MA bibliothèque : deux séries, deux genres distincts. */
    db.shows[1]  = serie(1, 'Ma Comedie', 'Comédie', '2010', 'Netflix');
    db.shows[2]  = serie(2, 'Mon Drame',  'Drame',   '2020', 'Max');
    db.movies[9] = film(9, 'Mon Film', 'Action', '2015');

    /* La bibliothèque de Marie : d'autres genres, pour que la confusion se
       voie. Plus une série EN PAUSE et un film À VOIR — deux choses que les
       quatre blocs figés d'avant ne montraient PAS. */
    const marie = { shows:{}, movies:{} };
    marie.shows[11] = serie(11, 'Son Horreur', 'Horreur', '2018', 'Prime');
    marie.shows[12] = serie(12, 'Son Western', 'Western', '1995', 'Arte');
    marie.shows[13] = Object.assign(serie(13, 'Sa Pause', 'Drame', '2021', 'Max'),
                                    { pause:1, pauseLe:2 });
    marie.movies[21] = Object.assign(film(21, 'Son Film Vu', 'Action', '2001'),
                                     { seen:true });
    marie.movies[22] = Object.assign(film(22, 'Son Film A Voir', 'Action', '2002'),
                                     { seen:false });
    /* DONNÉES D'AUTRUI = NON SÛRES (§3 de la spec). Un identifiant qui n'est pas
       une suite de chiffres, et un genre fantaisiste porteur de balises. */
    marie.shows['pasunid'] = serie('pasunid', 'Titre Douteux',
                                   '<img src=x onerror=alert(1)>', '2019', 'X');

    const camille = { shows:{}, movies:{} };
    camille.shows[31] = serie(31, 'Chez Camille', 'Comédie', '2012', 'Netflix');

    biblios['u2'] = marie;
    biblios['u3'] = camille;
  });
}

const lire = page => page.evaluate(()=>({
  vue:      view,
  cle:      pf12Cle,
  onglet:   ongletPf12(),
  genres:   pf12.filtres.genre.slice(),
  tri:      pf12.tri,
  puces:    [...document.querySelectorAll('#pfchips .chip')].map(b=> b.textContent.trim()),
  barre:    !!document.querySelector('.pf12barre'),
  cartes:   document.querySelectorAll('#pfcards .pgrid > *').length,
  texte:    (document.getElementById('app')||{}).textContent || '',
  html:     (document.getElementById('app')||{}).innerHTML || ''
}));

(async ()=>{
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
  await decor(page);

  titre('1. La bibliothèque d\'un proche porte les mêmes commandes');
  await page.evaluate(()=> go('biblio', { id:'u2', from:'abos' }));
  let b = await lire(page);
  ok(b.vue === 'biblio', 'on est bien sur la bibliothèque de Marie');
  ok(b.barre, 'la barre Chercher · Trier · Filtrer est là');
  ok(b.puces.length >= 3, 'les puces de famille sont là ('+b.puces.join(' | ')+')');
  ok(/Lecture seule/.test(b.texte), 'le bandeau « Lecture seule » est toujours là');

  titre('2. Elle est bien SA bibliothèque, pas la mienne');
  ok(/Son Horreur|Son Western/.test(b.texte), 'ses titres à elle sont affichés');
  ok(!/Ma Comedie|Mon Drame/.test(b.texte), 'et aucun des miens ne s\'y est glissé');

  titre('3. Lecture seule — aucun geste de MA bibliothèque sur ses titres');
  ok(!/quickWatch\(/.test(b.html), 'pas de « marquer vu » sur les cartes du proche');
  ok(!/basculerPause\(/.test(b.html), 'pas de mise en pause non plus');

  titre('4. Les données d\'autrui sont traitées comme non sûres');
  ok(!/onerror=alert/.test(b.html), 'le genre fantaisiste n\'est pas injecté brut');
  ok(!/ouvrirTitre\(pasunid/.test(b.html) && !/ouvrirTitre\('pasunid/.test(b.html),
     'un identifiant non numérique n\'est pas rendu cliquable');

  titre('5. LE VA-ET-VIENT — mes filtres ne suivent pas, et les siens non plus');
  /* On pose « Horreur » chez Marie. */
  await page.evaluate(()=> basculerFiltrePf12('genre', 'Horreur'));
  const chezElle = await lire(page);
  ok(chezElle.genres.join() === 'Horreur', 'le filtre est bien posé chez Marie');

  /* Puis on rentre chez soi. */
  await page.evaluate(()=> go('profile', {}));
  const chezMoi = await lire(page);
  ok(chezMoi.cle === 'moi', 'la portée est revenue sur « moi »');
  ok(chezMoi.genres.length === 0,
     'MON profil n\'a hérité d\'AUCUN filtre de Marie (le piège n° 1 de la spec)');
  ok(/Ma Comedie/.test(chezMoi.texte), 'et mes titres sont bien tous là');

  /* On pose un filtre chez soi, et on repart chez elle. */
  await page.evaluate(()=> basculerFiltrePf12('genre', 'Comédie'));
  await page.evaluate(()=> go('biblio', { id:'u2', from:'abos' }));
  const retourElle = await lire(page);
  ok(retourElle.genres.join() === 'Horreur',
     'en revenant chez Marie, SON filtre est retrouvé intact');

  await page.evaluate(()=> go('profile', {}));
  const retourMoi = await lire(page);
  ok(retourMoi.genres.join() === 'Comédie',
     'et le mien n\'a pas bougé non plus');

  titre('6. Ouvrir la bibliothèque d\'un AUTRE proche repart d\'un état propre');
  await page.evaluate(()=> go('biblio', { id:'u3', from:'abos' }));
  const camille = await lire(page);
  ok(camille.cle === 'proche:u3', 'la portée est celle de Camille');
  ok(camille.genres.length === 0, 'aucun filtre hérité de Marie');
  ok(/Chez Camille/.test(camille.texte), 'et ce sont bien ses titres');

  titre('7. « Jamais notés » : chez moi oui, chez un proche non');
  const feuilles = await page.evaluate(()=>{
    const lu = {};
    go('profile', {}); ouvrirFiltresPf12();
    lu.moi = document.getElementById('sheetin').textContent;
    closeSheet();
    go('biblio', { id:'u2', from:'abos' }); ouvrirFiltresPf12();
    lu.proche = document.getElementById('sheetin').textContent;
    closeSheet();
    return lu;
  });
  ok(/Jamais notés/.test(feuilles.moi), 'l\'axe est proposé sur MON profil');
  ok(!/Jamais notés/.test(feuilles.proche),
     'il ne l\'est PAS chez un proche — il lirait MES avis et répondrait à côté');

  titre('8. La recherche plein écran dit chez qui elle cherche');
  const ou = await page.evaluate(()=>{
    go('biblio', { id:'u2', from:'abos' });
    ouvrirRechPf12();
    const p = (document.getElementById('pf12q')||{}).placeholder || '';
    fermerRechPf12();
    return p;
  });
  ok(/Marie/.test(ou), 'le champ nomme le proche : « '+ou+' »');
  ok(!/^Chercher dans mes /.test(ou), 'et ne dit plus « mes séries »');

  titre('9. Les puces exposent ce que les quatre blocs figés cachaient');
  const expose = await page.evaluate(()=>{
    go('biblio', { id:'u2', from:'abos' });
    /* Le cas 5 a laissé « Horreur » posé chez Marie — c'est justement ce qu'il
       prouvait. On l'efface avant de regarder ce que les puces exposent, sinon
       on mesurerait le filtre et pas les puces. */
    viderFiltresPf12();
    const p = [...document.querySelectorAll('#pfchips .chip')].map(b=> b.textContent.trim());
    setTabProfil('pause');
    const pause = (document.getElementById('app')||{}).textContent || '';
    setTabProfil('avoir');
    const avoir = (document.getElementById('app')||{}).textContent || '';
    return { p, pause, avoir };
  });
  ok(expose.p.some(x=> /En pause/.test(x)), 'la puce « En pause » existe chez le proche');
  ok(/Sa Pause/.test(expose.pause), 'sa série en pause est enfin visible');
  ok(/Son Film A Voir/.test(expose.avoir), 'et son film à voir aussi');

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
