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

  await nav.close();
  console.log(souci ? '\nÉCHEC — ' + souci + ' problème(s)' : '\nTout est vert.');
  process.exit(souci ? 1 : 0);
})();
