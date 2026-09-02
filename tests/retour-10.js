/* ---------------------------------------------------------------------------
   RETOUR-10 §2 — MONTRER QUE L'IA CHERCHE (maquette 28, variante A).

       cd <depot> && python3 -m http.server 8099 &
       node tests/retour-10.js

   Demande d'Adrien (31/08) : « montrer que l'IA est en train de chercher, sinon
   on a l'impression que ça bugue. »

   LE §1 EST ARRIVÉ (01/09/2026), et il change ce que cette suite doit tenir.
   L'escalade — démarrer sur le petit modèle, ne remonter au fort qu'au besoin —
   vit ENTIÈREMENT dans la fonction Edge `ia` (éprouvée par `deno test`). Le
   serveur ne parle au téléphone qu'UNE fois, à la fin : l'écran ne peut donc pas
   APPRENDRE l'escalade pendant qu'elle a lieu, il la DÉDUIT de la durée. C'est
   un choix d'Adrien, pris en connaissance de cause. Les cas 10 à 12 tiennent les
   deux moitiés de ce choix : la ligne apparaît quand l'attente se prolonge, et
   elle n'apparaît JAMAIS quand la réponse arrive vite.

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

  titre('10. §1 — une attente qui se prolonge dit POURQUOI');
  const loin = await page.evaluate(async ()=>{
    oublierCachePhraseIA();
    /* Deux secondes : bien au-delà des 949 ms de médiane du petit modèle
       mesurées le 31/08, donc l'écran doit conclure à une escalade. */
    window.__delaiIA = 2000;
    window.appelIA = async ()=> { await new Promise(r=> setTimeout(r, 2000));
                                  return { mode:'filtres', filtres:{ famille:'film' } }; };
    const p = interpreterRechercheIA('le film ou DiCaprio est courtier et se drogue');
    const vu = [];
    for(let i = 0; i < 120; i++){
      const s = etatRech().iaStatut;
      if(s && vu.indexOf(s.etat) < 0) vu.push(s.etat);
      if(s && s.etat === 'loin'){
        vu.push('#' + ((document.querySelector('.iastat .iatx b')||{}).textContent || ''));
        vu.push('§' + ((document.querySelector('.iastat .iatx span')||{}).textContent || ''));
        vu.push('~' + (document.querySelector('.qbar.qcherche') ? 'liseré' : 'sans'));
        break;
      }
      await new Promise(x=> setTimeout(x, 20));
    }
    await p;
    return vu;
  });
  ok(loin[0] === 'lit', 'elle commence par « je lis ta phrase »');
  ok(loin.indexOf('loin') > 0, 'puis elle passe à l\'état « plus loin » ('+loin.join(' → ')+')');
  ok(loin.some(x => /^#.*plus loin/.test(x)), 'la ligne dit « ✦ Je cherche plus loin… »');
  ok(loin.some(x => /^§.*demande de la mémoire/.test(x)),
     'et elle JUSTIFIE l\'attente au lieu de la subir');
  ok(loin.indexOf('~liseré') >= 0, 'le liseré court toujours pendant le second essai');

  titre('11. §1 — une réponse rapide ne parle JAMAIS d\'escalade');
  const vite = await page.evaluate(async ()=>{
    oublierCachePhraseIA();
    /* 300 ms : le cas ordinaire, une phrase de critères que le petit modèle
       découpe tout seul. Dire « ta description demande de la mémoire » ici
       serait un mensonge, et un mensonge que personne ne pourrait démentir. */
    window.appelIA = async ()=> { await new Promise(r=> setTimeout(r, 300));
                                  return { mode:'filtres', filtres:{ famille:'film' } }; };
    const vus = {};
    const t = setInterval(()=>{ const s = etatRech().iaStatut; if(s) vus[s.etat] = true; }, 10);
    await interpreterRechercheIA('un film d\'action avec Will Smith');
    clearInterval(t);
    return Object.keys(vus);
  });
  ok(vite.indexOf('lit') >= 0, 'on a bien vu « je lis ta phrase »');
  ok(vite.indexOf('loin') < 0,
     'et JAMAIS « plus loin » sur une réponse rapide ('+vite.join(', ')+')');

  titre('12. §1 — la minuterie ne survit pas à la réponse');
  const apres = await page.evaluate(async ()=>{
    oublierCachePhraseIA();
    window.appelIA = async ()=> { await new Promise(r=> setTimeout(r, 100));
                                  return { mode:'filtres', filtres:{ famille:'film' } }; };
    await interpreterRechercheIA('une autre phrase courte');
    /* Bien au-delà des 1 400 ms : si la minuterie n'était pas désarmée, la
       ligne réapparaîtrait ICI — c'est-à-dire APRÈS les résultats, ce qui est
       pire que de ne rien montrer. */
    await new Promise(r=> setTimeout(r, 1800));
    return { ligne:!!document.querySelector('.iastat'),
             etat:(etatRech().iaStatut || {}).etat || null,
             liseré:!!document.querySelector('.qbar.qcherche') };
  });
  ok(!apres.ligne && !apres.etat, 'aucune ligne ne réapparaît après coup');
  ok(!apres.liseré, 'et la barre ne se remet pas à courir toute seule');

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
