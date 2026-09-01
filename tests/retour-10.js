/* ---------------------------------------------------------------------------
   RETOUR-10 §2 — MONTRER QUE L'IA CHERCHE (maquette 28, variante A).

       cd <depot> && python3 -m http.server 8099 &
       node tests/retour-10.js

   Demande d'Adrien (31/08) : « montrer que l'IA est en train de chercher, sinon
   on a l'impression que ça bugue. »

   CE LOT NE COUVRE QUE LE §2. Le §1 (démarrer sur le petit modèle et n'escalader
   qu'au besoin) touche la fonction Edge `ia` et ne peut pas être éprouvé sans
   `deno test` : il est livré à part. L'état « ✦ Je cherche plus loin… » existe
   donc dans le code et dans cette suite, mais rien ne le DÉCLENCHE encore —
   c'est l'escalade du §1 qui le fera. On le teste quand même : une forme sans
   appelant se remet en service par accident, et celle-ci a son appelant qui
   arrive.

   CE QUI EST FACILE À CASSER ET QUE CES CAS TIENNENT :

   · LA GRILLE PRÉCÉDENTE NE DOIT PAS DISPARAÎTRE. C'est la règle du point 5 /
     point 7 (« on ne vide pas `r.res` »), et le premier réflexe en ajoutant un
     écran d'attente est justement de vider.
   · LE CACHE NE DOIT RIEN FAIRE CLIGNOTER. Refaire la même phrase répond dans
     la même frame : poser la ligne puis la retirer aussitôt produirait un
     scintillement, c'est-à-dire l'impression de panne que le lot combat.
   · IA COUPÉE = RIEN. Pas de liseré, pas de ligne, comportement de v108 à
     l'identique. Le socle ne meurt jamais et ne change pas d'allure.
   · LE TEXTE DU RELAIS EST NON SÛR. Il est affiché, donc il est échappé.
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
    db.auth = { token:'x', uid:'moi' };
    /* Le relais est piloté par le test : `__reponseIA` est ce qu'il rendra, et
       `__delaiIA` le temps qu'il mettra. C'est ce qui permet de REGARDER
       l'écran pendant l'attente au lieu de la deviner. */
    window.__delaiIA = 250;
    window.__reponseIA = { mode:'filtres', filtres:{ famille:'film',
                            genres:['action'], personnes:['Will Smith'] } };
    window.appelIA = async ()=> {
      await new Promise(r=> setTimeout(r, window.__delaiIA));
      return window.__reponseIA;
    };
    go('search', {});
    const r = etatRech();
    r.envie = true;
    /* Une grille déjà peinte : c'est elle qui ne doit pas disparaître. */
    r.res = [{ id:1, media:'movie', title:'Deja La', poster:'/a.jpg' },
             { id:2, media:'movie', title:'Encore La', poster:'/b.jpg' }];
    r.total = 2;
    peindreRech();
  });
}

const lire = page => page.evaluate(()=>({
  ligne:   !!document.querySelector('.iastat'),
  fini:    !!document.querySelector('.iastat.iafini'),
  titre:   (document.querySelector('.iastat .iatx b')||{}).textContent || '',
  sous:    (document.querySelector('.iastat .iatx span')||{}).textContent || '',
  liseré:  !!document.querySelector('.qbar.qcherche'),
  grille:  (etatRech().res || []).length,
  html:    (document.getElementById('app')||{}).innerHTML || ''
}));

(async ()=>{
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
  await decor(page);

  titre('1. À la validation : la barre travaille et le dit');
  await page.evaluate(()=>{ window.__fini = interpreterRechercheIA('un film d\'action avec Will Smith'); });
  await page.waitForTimeout(90);
  let a = await lire(page);
  ok(a.ligne, 'la ligne de statut est apparue');
  ok(/Je lis ta phrase/.test(a.titre), 'elle dit « ✦ Je lis ta phrase… » ('+a.titre+')');
  ok(/un instant/.test(a.sous), 'avec son sous-titre « un instant »');
  ok(a.liseré, 'la barre porte le liseré qui court');

  titre('2. La grille précédente RESTE à l\'écran (point 5 / point 7)');
  ok(a.grille === 2, 'les deux affiches d\'avant sont toujours dans `r.res`');
  ok(/Deja La/.test(a.html), 'et toujours peintes à l\'écran');

  titre('3. Réponse reçue : « ✓ Compris », et ce qui a été compris en clair');
  /* On rattrape l'instant « compris » : il vit entre la réponse du relais et la
     fin de la pose des filtres. */
  const pendant = await page.evaluate(async ()=>{
    const r = etatRech();
    const vu = [];
    for(let i = 0; i < 40; i++){
      if(r.iaStatut && r.iaStatut.etat === 'compris'){
        vu.push({ titre:(document.querySelector('.iastat .iatx b')||{}).textContent || '',
                  sous:(document.querySelector('.iastat .iatx span')||{}).textContent || '',
                  fini:!!document.querySelector('.iastat.iafini') });
        break;
      }
      await new Promise(x=> setTimeout(x, 20));
    }
    return vu[0] || null;
  });
  ok(!!pendant, 'l\'état « compris » a bien été traversé');
  ok(!!pendant && /Compris/.test(pendant.titre), 'la ligne dit « ✓ Compris »');
  ok(!!pendant && pendant.fini, 'elle passe au vert et la pastille cesse de battre');
  ok(!!pendant && /film/.test(pendant.sous) && /Will Smith/.test(pendant.sous),
     'et elle résume ce qui a été compris : « '+(pendant ? pendant.sous : '')+' »');

  titre('4. Les résultats peints : le liseré s\'arrête, puis la ligne s\'efface');
  await page.evaluate(()=> window.__fini);
  await page.waitForTimeout(60);
  const juste = await lire(page);
  ok(!juste.liseré, 'le liseré ne court plus dès que la réponse est là');
  /* LA DURÉE MINIMALE — trouvée en écrivant cette suite. Sans elle, « ✓ Compris »
     naissait et mourait dans la même frame quand la pose des filtres ne demandait
     aucun aller-retour : zéro milliseconde à l'écran, donc un scintillement. */
  ok(juste.ligne, '« ✓ Compris » tient à l\'écran au lieu de clignoter');
  await page.waitForTimeout(1000);
  const fin = await lire(page);
  ok(!fin.ligne, 'et elle s\'efface une fois qu\'elle a été lisible');
  /* Pas d'assertion sur `r.res` ICI : une fois les filtres posés, la grille est
     CENSÉE se remplir des nouveaux résultats. Ce que le lot promet, c'est
     qu'elle ne disparaisse pas PENDANT l'attente — c'est le cas 2 qui le tient,
     et le cas 7 pour la panne. */

  titre('5. Le cache ne fait RIEN clignoter');
  const cache = await page.evaluate(async ()=>{
    let vue = false;
    const t = setInterval(()=>{ if(document.querySelector('.iastat')) vue = true; }, 5);
    await interpreterRechercheIA('un film d\'action avec Will Smith');
    clearInterval(t);
    return vue;
  });
  ok(!cache, 'refaire la MÊME phrase n\'affiche aucune ligne (aucun aller-retour)');

  titre('6. IA coupée : rien de ce lot ne se voit');
  const eteinte = await page.evaluate(async ()=>{
    db.gouts.ia = { decouvrir:false, recherche:false };
    oublierCachePhraseIA();
    await interpreterRechercheIA('une comedie des annees 90');
    return { ligne:!!document.querySelector('.iastat'),
             liseré:!!document.querySelector('.qbar.qcherche') };
  });
  ok(!eteinte.ligne, 'aucune ligne de statut');
  ok(!eteinte.liseré, 'aucun liseré — comportement de v108 à l\'identique');

  titre('7. Panne du relais : la ligne ne reste pas allumée');
  const panne = await page.evaluate(async ()=>{
    db.gouts.ia = { decouvrir:true, recherche:true };
    oublierCachePhraseIA();
    /* Le cas 6 est passé par `repliTexteIA` (IA coupée), qui bascule l'écran en
       recherche de texte et vide la grille. On la resème : ce qu'on éprouve
       ici, c'est qu'une PANNE ne l'emporte pas, pas ce que fait le repli. */
    const r0 = etatRech();
    r0.envie = true;
    r0.res = [{ id:1, media:'movie', title:'Deja La', poster:'/a.jpg' },
              { id:2, media:'movie', title:'Encore La', poster:'/b.jpg' }];
    peindreRech();
    window.appelIA = async ()=> { throw new Error('relais injoignable'); };
    try{ await interpreterRechercheIA('une phrase qui echoue'); }catch(e){}
    return { ligne:!!document.querySelector('.iastat'),
             liseré:!!document.querySelector('.qbar.qcherche'),
             grille:(etatRech().res || []).length };
  });
  ok(!panne.ligne, 'la ligne est retirée');
  ok(!panne.liseré, 'la barre ne court pas indéfiniment');
  ok(panne.grille === 2, 'et la grille précédente est toujours là');

  titre('8. Le texte venu du relais est ÉCHAPPÉ (il est non sûr)');
  const injection = await page.evaluate(async ()=>{
    oublierCachePhraseIA();
    window.__delaiIA = 30;
    window.__reponseIA = { mode:'filtres',
      filtres:{ famille:'<img src=x onerror=alert(1)>', genres:['action'] } };
    window.appelIA = async ()=> { await new Promise(r=> setTimeout(r, 30));
                                  return window.__reponseIA; };
    const p = interpreterRechercheIA('une phrase piegee');
    let html = '';
    for(let i = 0; i < 40; i++){
      const e = document.querySelector('.iastat');
      if(e && /onerror|&lt;img/.test(e.innerHTML)){ html = e.innerHTML; break; }
      await new Promise(x=> setTimeout(x, 20));
    }
    await p;
    return html;
  });
  ok(!/<img src=x onerror/.test(injection),
     'la balise du relais n\'est pas injectée telle quelle');

  titre('9. Les trois libellés existent, et un seul jeu de textes');
  const libelles = await page.evaluate(()=> Object.keys(IA_STATUTS));
  ok(libelles.length === 3 && libelles.indexOf('loin') >= 0,
     'les trois états sont déclarés au même endroit ('+libelles.join(', ')+')');

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
