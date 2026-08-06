/* ---------------------------------------------------------------------------
   Cycle 3, point 4 — la navigation. Quatre constats (A, B, C, D), une méthode :
   REPRODUIRE D'ABORD, dans l'app réelle, avec les vrais gestes.

       cd <depot> && python3 -m http.server 8099 &
       node tests/nav-cycle3.js

   Ce fichier a servi deux fois :
   1. AVANT le correctif, il a reproduit les constats A et B/C-mécanisme
      (voir RAPPORT.md — les échecs relevés sont la preuve de reproduction) ;
   2. APRÈS, il verrouille le comportement corrigé. Il doit rester vert.

   Le balayage de retour est joué avec de VRAIS événements tactiles
   (TouchEvent), pas en appelant les fonctions internes : les trois chemins de
   retour ne partagent pas le même code, chacun a son cas.

   LE SCÉNARIO-CLÉ (constats B, C et D) : le pari du compteur. L'ancien code
   rendait l'écran à la main au relâchement du geste, reculait ensuite pour de
   vrai dans l'historique, et armait un compteur pour avaler le `popstate` à
   venir — borné par un garde-fou d'UNE SECONDE. Un navigateur qui diffère
   `history.back()` au-delà de la seconde faisait perdre le pari : le popstate
   tardif était rejoué comme un vrai retour, et `go()` — même vue, mêmes
   paramètres — renvoyait l'écran EN HAUT DE PAGE (constat B), après un rendu
   de trop (constat D). On simule le report en remplaçant `history.back` le
   temps du geste, puis en laissant partir le retour différé.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';

let soucis = 0;
function ok(cond, msg){
  console.log((cond ? '   ✓ ' : '   ✗ ') + msg);
  if(!cond) soucis++;
}

/* Le décor : une session ouverte, un faux TMDB qui répond à tout, une grille
   de Recherche assez haute pour pouvoir défiler. */
async function decor(page){
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
  await page.evaluate(()=>{
    let n = 0;
    window.tmdb = async (chemin)=>{
      if(/\/genre\//.test(chemin))
        return { genres:[{id:16,name:'Animation'},{id:35,name:'Comédie'}] };
      const tv = /\/tv\b|\/tv\//.test(chemin);
      const lot = Array.from({length:20}, ()=>{ n++;
        const o = { id:5000+n, poster_path:'/p'+n+'.jpg', vote_average:7,
                    vote_count:500, genre_ids:[35], original_language:'en' };
        if(tv){ o.name = 'Serie '+n; o.first_air_date = '2020-01-01'; }
        else  { o.title = 'Film '+n; o.release_date = '2020-01-01'; }
        return o;
      });
      return { results: lot, total_pages: 2, total_results: 40 };
    };
    db.auth = { token:'x', uid:'u' };
    ui.rech = null;
  });
}

/* Un vrai doigt : touchstart au bord gauche, glissement, relâchement. */
async function balayerRetour(page){
  await page.evaluate(async ()=>{
    const doigt = (type, x, y) => {
      const t = new Touch({ identifier:1, target:document.body,
                            clientX:x, clientY:y, pageX:x, pageY:y });
      document.body.dispatchEvent(new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t],
        changedTouches: [t], bubbles:true, cancelable:true }));
    };
    doigt('touchstart', 10, 300);
    doigt('touchmove', 18, 300);
    doigt('touchmove', 90, 302);
    doigt('touchmove', 200, 303);
    await new Promise(r=>setTimeout(r, 30));
    doigt('touchmove', 300, 304);
    doigt('touchend', 310, 304);
  });
}

(async ()=>{
  const nav = await chromium.launch();

  /* ===== Constat A — la barre du bas depuis un aperçu ouvert en Recherche ==== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    const r = await page.evaluate(async ()=>{
      go('search', {});
      openPreview(603, 'movie', 'search');
      await new Promise(r2=>setTimeout(r2, 80));
      const tabs = [...document.querySelectorAll('#nav .tab')];
      const allume = tabs.findIndex(t => t.classList.contains('on'));
      return { vue: view, from: params.from, allume:
               allume >= 0 ? tabs[allume].textContent.trim() : '(aucun)' };
    });
    console.log('constat A — aperçu ouvert depuis la grille de Recherche');
    ok(r.vue === 'preview' && r.from === 'search', 'le décor est en place (aperçu, from:search)');
    ok(r.allume === 'Recherche',
       'la barre allume « Recherche » (obtenu : « '+r.allume+' »)');
    await page.close();
  }

  /* ===== Constat B — la position de la grille survit au BALAYAGE ============ */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    await page.evaluate(async ()=>{
      go('search', {});
      await new Promise(r=>setTimeout(r, 200));       // la grille se charge
      window.scrollTo(0, 600);
      openPreview(603, 'movie', 'search');            // la position est mémorisée là
      await new Promise(r=>setTimeout(r, 80));
    });
    await balayerRetour(page);
    await page.waitForTimeout(700);                    // l'animation puis le popstate
    const r = await page.evaluate(()=>({ vue:view, y:window.scrollY,
      puce:(document.querySelector('#rpuces .chip.on')||{}).textContent }));
    console.log('constat B — le balayage de retour vers la grille');
    ok(r.vue === 'search', 'le balayage ramène bien sur Recherche (obtenu : '+r.vue+')');
    ok(Math.abs(r.y - 600) < 60,
       'la position de la grille est restaurée (attendu ≈600, obtenu '+r.y+')');
    await page.close();
  }

  /* ===== Constats B/C/D — le pari du compteur, perdu exprès ================= */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    await page.evaluate(async ()=>{
      go('search', {});
      await new Promise(r=>setTimeout(r, 200));
      window.scrollTo(0, 600);
      openPreview(603, 'movie', 'search');
      await new Promise(r=>setTimeout(r, 80));
      /* Le navigateur « diffère » le retour : history.back ne fait rien tout
         de suite, le vrai recul partira plus tard. C'est le cas réel — page
         masquée au moment du geste — ramené à une commande. */
      window.__backsDifferes = 0;
      window.__vraiBack = history.back.bind(history);
      history.back = ()=>{ window.__backsDifferes++; };
      /* On compte les rendus pour voir un éventuel rendu de trop (constat D). */
      window.__rendus = 0;
      const vraiRender = window.render;
      window.render = function(){ window.__rendus++; return vraiRender.apply(this, arguments); };
    });
    await balayerRetour(page);
    await page.waitForTimeout(1300);                   // au-delà du garde-fou d'1 s
    const avant = await page.evaluate(()=>({ vue:view, y:window.scrollY, rendus:window.__rendus }));
    /* Le retour différé finit par s'exécuter. */
    await page.evaluate(()=>{ history.back = window.__vraiBack; if(window.__backsDifferes) history.back(); });
    await page.waitForTimeout(400);
    const apres = await page.evaluate(()=>({ vue:view, y:window.scrollY, rendus:window.__rendus }));
    console.log('constats B/C/D — un history.back différé au-delà d\'une seconde');
    ok(avant.vue === 'search', 'l\'écran d\'arrivée est rendu même sans popstate (obtenu : '+avant.vue+')');
    ok(apres.vue === 'search', 'le popstate tardif ne renavigue pas (obtenu : '+apres.vue+')');
    ok(Math.abs(apres.y - 600) < 60,
       'le popstate tardif ne renvoie pas en haut de page (attendu ≈600, obtenu '+apres.y+')');
    ok(apres.rendus === avant.rendus,
       'le popstate tardif ne rejoue aucun rendu par-dessus ('+(apres.rendus - avant.rendus)+' rendu(s) de trop)');
    /* Et le retour SUIVANT recule d'exactement un écran : le miroir de la pile
       est resté juste — c'est l'invariant dont la perte faisait sauter un
       écran (constat C). On compare à ce que la pile ANNONCE comme cible,
       pas à une valeur devinée : c'est l'accord des deux qui est l'invariant.
       (Sur l'ancien code, la pile désaccordée annonçait déjà la mauvaise
       cible : l'échec se lisait sur l'écran obtenu.) */
    const attendu2 = await page.evaluate(()=>({ cible: cibleRetour(), miroir: miroirJuste() }));
    ok(attendu2.miroir, 'le miroir de la pile est resté juste après le popstate tardif');
    await page.evaluate(()=>{ goBack(); });
    await page.waitForTimeout(700);
    const fin = await page.evaluate(()=>view);
    ok(fin === attendu2.cible,
       'le retour suivant recule d\'un seul écran, vers la cible que la pile annonce '+
       '(annoncé : '+attendu2.cible+', obtenu : '+fin+')');
    await page.close();
  }

  /* ===== La flèche et le bouton matériel : mêmes invariants ================= */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    await page.evaluate(async ()=>{
      go('search', {});
      await new Promise(r=>setTimeout(r, 200));
      window.scrollTo(0, 500);
      openPreview(603, 'movie', 'search');
      await new Promise(r=>setTimeout(r, 80));
      goBack();                                        // la flèche de l'app
    });
    await page.waitForTimeout(800);
    const r1 = await page.evaluate(()=>({ vue:view, y:window.scrollY }));
    console.log('la flèche de l\'app');
    ok(r1.vue === 'search' && Math.abs(r1.y - 500) < 60,
       'flèche : écran et position restaurés (obtenu : '+r1.vue+', y='+r1.y+')');

    await page.evaluate(async ()=>{
      openPreview(604, 'movie', 'search');
      await new Promise(r=>setTimeout(r, 80));
      history.back();                                  // le bouton matériel
    });
    await page.waitForTimeout(500);
    const r2 = await page.evaluate(()=>({ vue:view, y:window.scrollY }));
    console.log('le bouton matériel (popstate nu)');
    ok(r2.vue === 'search' && Math.abs(r2.y - 500) < 60,
       'bouton matériel : écran et position restaurés (obtenu : '+r2.vue+', y='+r2.y+')');
    await page.close();
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — '+soucis+' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
