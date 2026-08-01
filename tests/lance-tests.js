/* ---------------------------------------------------------------------------
   Lanceur des tests — à exécuter avec Node et Playwright.

       cd <depot> && python3 -m http.server 8099 &
       node tests/lance-tests.js

   Il fait TROIS choses, et la deuxième a été ajoutée après s'être fait avoir :

   1. Il ouvre `test.html` et lit son bilan. Ce sont les tests des fonctions
      pures — fusion, statuts, échappement, migrations, routes.

   2. Il ouvre `index.html`, l'app RÉELLE, et échoue à la moindre erreur de
      page. C'est ce qui attrape ce que `node --check` ne peut pas voir : le
      30/07, une fonction `chargerRecos` ajoutée dans app-01 est entrée en
      collision avec celle qui existait déjà dans app-05, dont le `const recos`
      a cessé de s'évaluer. Chaque fichier passait `node --check` séparément ;
      l'app, elle, ne démarrait plus.

   3. Il relit les déclarations de premier niveau des douze fichiers et refuse
      qu'un nom soit déclaré deux fois. Les scripts partagent une seule portée
      globale : c'est la contrainte structurante du projet, et rien ne la
      surveillait. Contrôle statique, donc il attrape aussi les collisions
      dans du code qui ne s'exécute pas au démarrage.

   Ce fichier est VERSIONNÉ, à la différence des suites d'une session
   précédente qui ont disparu avec leur machine.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8099';

/* Les erreurs de console attendues : un test vérifie exprès qu'une migration
   qui échoue ne bloque pas le démarrage, et elle journalise. */
const CONSOLE_ATTENDUE = [/migration \d+ en échec/];

/* ATTENTION — cette liste doit contenir TOUS les fichiers chargés par
   `index.html`, sinon ce contrôle regarde à côté sans jamais le dire.
   `app-12-recherche.js` y manquait depuis la v83 : le lot 0 l'a signalé sans
   pouvoir le corriger (hors de son périmètre), c'est réparé ici en même temps
   qu'on inscrit `app-13-inscription.js`. Le fichier a été ajouté à la liste
   AVANT d'écrire une ligne du lot C, pour que le contrôle serve à quelque
   chose pendant l'écriture et pas seulement après. */
const FICHIERS = [
  'app-01-noyau.js','app-02-outils.js','app-03-vues.js','app-04-decouvrir.js',
  'app-05-plateformes.js','app-06-serie.js','app-07-partage.js',
  'app-08-reglages.js','app-09-notifications.js','app-10-sorties.js','app-11-gouts.js',
  'app-12-recherche.js','app-13-inscription.js'
];

/* Déclarations de PREMIER NIVEAU seulement : une colonne 0 pour `function`,
   `const`, `let`, `var`. Volontairement grossier — il vaut mieux rater une
   déclaration exotique que crier au loup sur une variable locale. */
function declarations(src){
  const noms = [];
  const re = /^(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while((m = re.exec(src))) noms.push(m[1]);
  return noms;
}

/* ---------------------------------------------------------------------------
   LOT R1 — LE MÊME CONTRÔLE, MAIS EN CSS

   Les points 1 et 2 des retours de la v85 sont exactement le même accident que
   celui qui a motivé le contrôle n° 3, en CSS cette fois, et personne ne l'a
   vu : le lot A a nommé `.dinfo` la pastille « i » du duel, un nom que le socle
   employait déjà pour le bloc titre de l'aperçu de Recherche ; le lot C a
   déclaré `.itxt` sans le rattacher à son écran, alors que le bloc d'invitation
   portait déjà ce nom. Dans les deux cas la règle écrite le plus bas gagne, et
   un écran qu'on ne regardait pas se dessine de travers.

   LA RÈGLE : un lot ne s'approprie pas un nom de classe NU (`.x`, seul, sans
   conteneur ni modificateur) que le socle ou un autre lot emploie déjà. Les
   sections sont celles des en-têtes `===== … =====` du fichier.

   Ce qui n'est PAS signalé, et c'est délibéré :
     · les sélecteurs composés — `.invitg .itxt`, `.dact .btn`, `.dcarte.gagne`,
       `.dcarte:after`. Ils sont rattachés : c'est justement la bonne manière.
     · une même section qui redéclare sa propre classe quelques lignes plus bas
       pour ajouter une propriété (`.cperson`, `.rtexte`, `.ecaret`…). C'est le
       même propriétaire, c'est lisible, ça ne surprend personne.
   C'est la REDÉCLARATION NUE D'UN NOM QUI APPARTIENT À QUELQU'UN D'AUTRE qui
   est signalée — la seule qui casse un écran à distance. */
function collisionsCss(src){
  /* Les commentaires sont blanchis et non retirés : les numéros de ligne
     rapportés doivent être ceux du fichier réel. */
  const net = src.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  const ligneDe = pos => src.slice(0, pos).split('\n').length;

  /* Les sections, lues sur la source d'origine (les en-têtes sont dans des
     commentaires, donc effacés de `net`). */
  const sections = [];
  src.split('\n').forEach((l, i)=>{
    const m = /\/\*\s*=+\s*(.+?)\s*=+/.exec(l);
    if(m) sections.push({ ligne:i + 1, nom:m[1] });
  });
  const sectionDe = n =>{
    let s = 'socle';
    sections.forEach(x=>{ if(n >= x.ligne) s = x.nom; });
    return s;
  };

  const NUE  = /^\.[A-Za-z_-][A-Za-z0-9_-]*$/;      // `.x` et rien d'autre
  const NOMS = /\.[A-Za-z_-][A-Za-z0-9_-]*/g;
  const vus = {};                                   // classe → première ligne où le nom sert
  const soucis = [];
  let i = 0, prof = 0, tete = '', pileAt = [];

  while(i < net.length){
    const c = net[i];
    if(c === '{'){
      const sel = tete.trim().replace(/\s+/g, ' ');
      tete = '';
      const at = sel.charAt(0) === '@';
      if(!at){
        const premierNiveau = !pileAt.some(Boolean);   // hors @media / @supports
        const ligne = ligneDe(i);
        const sec = sectionDe(ligne);
        sel.split(',').map(s => s.trim()).filter(Boolean).forEach(s=>{
          if(premierNiveau && NUE.test(s) && vus[s] && sectionDe(vus[s]) !== sec)
            soucis.push(s + ' : déclaré nu l.' + ligne + ' (' + sec +
                        ') alors que le nom sert déjà l.' + vus[s] +
                        ' (' + sectionDe(vus[s]) + ')');
        });
        sel.split(',').forEach(s=>{
          (s.match(NOMS) || []).forEach(n=>{ if(!vus[n]) vus[n] = ligne; });
        });
      }
      pileAt.push(at); prof++; i++; continue;
    }
    if(c === '}'){ prof--; pileAt.pop(); tete = ''; i++; continue; }
    /* Une déclaration à la racine (`@import x;`) ou la fin d'une propriété :
       on repart d'une tête de règle vierge. */
    if(c === ';' && prof === 0){ tete = ''; i++; continue; }
    tete += c; i++;
  }
  return { soucis: soucis, classes: Object.keys(vus).length };
}

(async () => {
  let souci = 0;
  const nav = await chromium.launch();

  /* --- 1. les tests unitaires --- */
  {
    const page = await nav.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push('erreur de page : ' + e.message));
    page.on('console', m => {
      if(m.type() !== 'error') return;
      if(CONSOLE_ATTENDUE.some(r => r.test(m.text()))) return;
      erreurs.push('console : ' + m.text());
    });
    await page.goto(BASE + '/test.html', { waitUntil:'networkidle' });
    const bilan = await page.textContent('#bilan');
    const echecs = await page.$$eval('.t.ko', els => els.map(e => e.textContent.trim()));
    console.log('test.html  → ' + bilan);
    echecs.forEach(e => console.log('   ✗ ' + e));
    erreurs.forEach(e => console.log('   ! ' + e));
    souci += echecs.length + erreurs.length;
    await page.close();
  }

  /* --- 2. l'app réelle démarre-t-elle ? --- */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844} });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
    /* Un écran a bien été peint : sans ça, une app qui se charge sans erreur
       mais n'affiche rien passerait pour saine. */
    const peint = await page.evaluate(() => {
      const a = document.getElementById('app');
      return !!(a && a.innerHTML.trim().length > 50);
    });
    if(!peint) erreurs.push('aucun écran peint après le démarrage');
    console.log('index.html → ' + (erreurs.length ? erreurs.length + ' erreur(s)' : 'démarre proprement'));
    erreurs.forEach(e => console.log('   ! ' + e));
    souci += erreurs.length;
    await page.close();
  }

  /* --- 3. deux fois le même nom global ? ---
     Lu sur le disque et non par le serveur : ce contrôle est statique, il n'a
     besoin ni de navigateur ni d'app qui démarre. */
  {
    const fs = require('fs'), chemin = require('path');
    const racine = chemin.join(__dirname, '..');
    const vus = {};
    const doublons = [];
    for(const f of FICHIERS){
      const src = fs.readFileSync(chemin.join(racine, f), 'utf8');
      for(const n of declarations(src)){
        if(vus[n]) doublons.push(n + ' : ' + vus[n] + ' et ' + f);
        else vus[n] = f;
      }
    }
    console.log('portée globale → ' + (doublons.length
      ? doublons.length + ' collision(s)'
      : Object.keys(vus).length + ' déclarations, aucune collision'));
    doublons.forEach(d => console.log('   ! ' + d));
    souci += doublons.length;
  }

  /* --- 4. LOT R1 — deux fois le même nom de classe dans `app.css` ? --- */
  {
    const fs = require('fs'), chemin = require('path');
    const css = fs.readFileSync(chemin.join(__dirname, '..', 'app.css'), 'utf8');
    const r = collisionsCss(css);
    console.log('classes CSS   → ' + (r.soucis.length
      ? r.soucis.length + ' collision(s)'
      : r.classes + ' noms de classe, aucune redéclaration nue'));
    r.soucis.forEach(d => console.log('   ! ' + d));
    souci += r.soucis.length;
  }

  /* --- 5. LOT D — L'ÉCRAN DÉCOUVRIR SE DESSINE-T-IL VRAIMENT ? ---

     `test.html` éprouve les fonctions pures ; il ne peut pas éprouver
     `chargerSuggestions`, qui ne fait rien d'autre que parler à TMDB. Or c'est
     là que se joue la seule règle vraiment fragile du lot : L'ORDRE DE
     DÉPOUILLEMENT. Les rangées se servent dans un pot commun (`vus`), la
     première servie garde les titres — et une rangée peut donc en affamer une
     autre sans qu'aucun test unitaire ne s'en aperçoive.

     C'est arrivé pendant l'écriture, et c'est ce qui justifie ce contrôle :
     dépouillée après « Dans l'esprit de X », la rangée « Ce que tes favoris
     ont en commun » sortait TOUJOURS vide — ses titres, recommandés par le
     favori n°1, étaient déjà pris. L'écran était vert de partout et il
     manquait une rangée.

     On charge donc l'app réelle, on remplace `tmdb` par un faux catalogue, et
     on regarde ce qui est peint. Aucun réseau : le faux répond à tout. */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844} });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });

    /* Le faux catalogue. Deux détails comptent : chaque appel rend des titres
       NEUFS (sinon tout se télescope et l'ordre ne prouve rien), et toutes les
       recommandations partagent un titre commun — c'est lui, et lui seul, que
       le croisement des favoris doit isoler. */
    const dessine = async (riche) => page.evaluate((riche)=>{
      const G = { tv:[{id:18,nom:'Drame'},{id:10759,nom:'Action & Adventure'}],
                  movie:[{id:18,nom:'Drame'},{id:28,nom:'Action'}] };
      genresTMDB.tv = G.tv; genresTMDB.movie = G.movie;
      let n = 0;
      const lot = (media, tag) => Array.from({length:12}, ()=>{
        n++;
        const o = { id:1000+n, poster_path:'/p'+n+'.jpg', backdrop_path:'/b'+n+'.jpg',
                    vote_average:7.4, vote_count:900, genre_ids:[18], original_language:'en' };
        if(media === 'tv'){ o.name = tag+' '+n; o.first_air_date = '2016-04-02'; }
        else { o.title = tag+' '+n; o.release_date = '2016-04-02'; }
        return o;
      });
      window.tmdb = async (chemin)=>{
        if(/\/genre\//.test(chemin))
          return { genres:(/\/tv\//.test(chemin)?G.tv:G.movie).map(g=>({id:g.id,name:g.nom})) };
        if(/watch\/providers/.test(chemin))
          return { results:[{provider_id:8,provider_name:'Netflix',display_priorities:{FR:1}}] };
        if(/combined_credits/.test(chemin))
          return { cast: lot('movie','Acteur').map(x=>Object.assign({media_type:'movie'}, x)) };
        if(/recommendations/.test(chemin)){
          const l = lot(/\/tv\//.test(chemin) ? 'tv' : 'movie', 'Reco');
          l.push({ id:7777, poster_path:'/c.jpg', backdrop_path:'/c.jpg',
                   title:'Le Commun', name:'Le Commun', release_date:'2011-01-01',
                   first_air_date:'2011-01-01', vote_average:8, vote_count:4000,
                   genre_ids:[18], original_language:'en' });
          return { results:l, total_pages:3 };
        }
        return { results: lot(/\/discover\/tv/.test(chemin) ? 'tv' : 'movie', 'Disc'),
                 total_pages:5 };
      };
      db.auth = { token:'x', uid:'u' };
      db.shows = {}; db.movies = {};
      db.avis = { tv:{}, movie:{} };
      db.podium = { film:[], serie:[], anime:[], maj:0 };
      db.gouts.graines = []; db.gouts.amorcageFait = true; db.gouts.exclus = [];
      db.gouts.pasPourMoi = {};
      db.gouts.acteurs = [{ id:2037, nom:'Cillian Murphy' }];
      db.gouts.plates  = [{ id:8, nom:'Netflix' }];
      for(let i = 1; i <= 6; i++)
        db.movies[i] = { id:i, title:'Film '+i, genres:['Drame'], seen:true, watchedAt:1,
                         addedAt:1, date:'2014-01-01', poster:'/f.jpg' };
      db.shows[50] = { id:50, name:'Série 50', genres:['Drame'], status:'Ended', poster:'/s.jpg',
                       seasons:{1:[{e:1,n:'E1',d:'2020-01-01',r:42}]}, watched:{'1x1':1},
                       addedAt:1, updated:1 };
      if(riche) [1,2,3,4].forEach(i => poserAvis('movie', i, 1));
      partage.suivis = [{ id:'ami', pseudo:'Léa' }];
      biblios.ami = { movies:{ 900:{ id:900, title:'Chez Léa', poster:'/l.jpg',
                                     genres:['Drame'], date:'2018-01-01', watchedAt:5 } } };
      ui.disc.type = 'tout';
      oublierSuggestions();
      view = 'discover'; params = {};
      return chargerSuggestions(true).then(()=>{
        render();
        return { rangees: [...document.querySelectorAll('.sectitle')].map(e=>e.textContent),
                 hero: (document.querySelector('.d4nom')||{}).textContent || null,
                 raison: (document.querySelector('.d4pq')||{}).textContent || null,
                 lien: !!document.querySelector('.d4lien'),
                 appel: !!document.querySelector('.d4appel'),
                 texte: document.getElementById('app').textContent };
      });
    }, riche);

    const rate = m => erreurs.push('lot D : ' + m);

    const riche = await dessine(true);
    /* L'ordre du §3.4, et surtout la présence des DEUX rangées de cœur. */
    ['Dans l\'esprit de Film', 'Ce que tes favoris ont en commun', 'Avec Cillian Murphy',
     'Des drames pour toi', 'Vu par tes proches', 'Les incontournables des années',
     'Sur Netflix', 'Sorties récentes', 'Bientôt'].forEach((attendu, i)=>{
      if(!riche.rangees.some(t => t.indexOf(attendu) === 0)) rate('rangée manquante : ' + attendu);
    });
    const rang = t => riche.rangees.findIndex(x => x.indexOf(t) === 0);
    if(!(rang('Dans l\'esprit de Film') < rang('Ce que tes favoris ont en commun')
      && rang('Ce que tes favoris ont en commun') < rang('Avec Cillian Murphy')
      && rang('Avec Cillian Murphy') < rang('Des drames pour toi')
      && rang('Des drames pour toi') < rang('Vu par tes proches')
      && rang('Vu par tes proches') < rang('Les incontournables des années')
      && rang('Les incontournables des années') < rang('Sur Netflix')
      && rang('Sur Netflix') < rang('Sorties récentes')
      && rang('Sorties récentes') < rang('Bientôt')))
      rate('l\'ordre fixe du §3.4 n\'est pas respecté : ' + riche.rangees.join(' | '));
    if(!riche.hero) rate('aucune proposition du jour en tête d\'écran');
    if(!/Parce que tu as aimé/.test(riche.raison || '')) rate('la proposition n\'a pas de raison lisible');
    if(!riche.lien) rate('le lien « Ajuster mes goûts » a disparu');
    if(riche.appel) rate('la carte d\'appel au duel s\'affiche sur un profil nourri');
    if(/TMDB/.test(riche.texte)) rate('l\'aveu technique sur les plateformes est encore à l\'écran');
    if(/Je pars de tes/.test(riche.texte)) rate('le pavé de diagnostic est encore à l\'écran');

    /* « Pas pour moi » : la carte change tout de suite, et rien n'entre dans
       `db.avis` — c'est la ligne de partage du §3.8. */
    const avant = riche.hero;
    await page.click('.d4act .btn.ghost');
    const apres = await page.evaluate(()=>({
      hero: (document.querySelector('.d4nom')||{}).textContent || null,
      avis: Object.keys(db.avis.movie).filter(id => db.avis.movie[id].v === -1).length }));
    if(apres.hero === avant) rate('« Pas pour moi » ne remplace pas la carte');
    if(apres.avis) rate('« Pas pour moi » a écrit un 👎 : c\'est un rejet ferme, pas un report');

    /* Le profil qui démarre : pas de rangée de cœur, mais un appel au duel. */
    const pauvre = await dessine(false);
    if(pauvre.rangees.some(t => /^Dans l'esprit de/.test(t)))
      rate('une rangée de cœur s\'ouvre sans le moindre 👍');
    if(!pauvre.appel) rate('aucun appel au duel sur un profil qui n\'a rien déclaré');
    if(!/incontournable/.test(pauvre.raison || ''))
      rate('sans signal, la proposition doit s\'annoncer comme un incontournable');

    console.log('lot D        → ' + (erreurs.length
      ? erreurs.length + ' problème(s)'
      : riche.rangees.length + ' rangées nourries, ' + pauvre.rangees.length + ' au démarrage'));
    erreurs.forEach(e => console.log('   ! ' + e));
    souci += erreurs.length;
    await page.close();
  }

  await nav.close();
  console.log(souci ? '\nÉCHEC — ' + souci + ' problème(s)' : '\nTout est vert.');
  process.exit(souci ? 1 : 0);
})();
