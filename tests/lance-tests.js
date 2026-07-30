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

   3. Il relit les déclarations de premier niveau des onze fichiers et refuse
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

const FICHIERS = [
  'app-01-noyau.js','app-02-outils.js','app-03-vues.js','app-04-decouvrir.js',
  'app-05-plateformes.js','app-06-serie.js','app-07-partage.js',
  'app-08-reglages.js','app-09-notifications.js','app-10-sorties.js','app-11-gouts.js'
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

  await nav.close();
  console.log(souci ? '\nÉCHEC — ' + souci + ' problème(s)' : '\nTout est vert.');
  process.exit(souci ? 1 : 0);
})();
