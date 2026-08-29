/* ---------------------------------------------------------------------------
   RETOUR-07 §2 — LE COMPTEUR NE MENT PLUS DEPUIS LE CACHE.

       cd <depot> && python3 -m http.server 8099 &
       node tests/retour-07-compteur.js

   LE BUG, constaté en prod sur v101 (vidéo d'Adrien, 29/08) : sur Tout, Films
   et Séries, « 0 titres » — ou « moins de 0 séries » — s'affichait au-dessus
   d'une grille PLEINE. Les animés comptaient juste.

   POURQUOI CETTE SUITE ET PAS DES CAS DANS `test.html` : le défaut est une
   histoire de TEMPS. Il n'apparaît que si la recherche est mise en cache
   PENDANT que l'amorçage de fond tourne encore — c'est-à-dire dans la fenêtre
   entre le service de la première fournée et la fin de la lecture des étages
   suivants. Pour la tenir ouverte à volonté, le relais est bouchonné avec deux
   vitesses : l'étage « occident » (celui qui NE COMPTE PAS, et qui est amorcé
   en premier) répond tout de suite, l'étage « monde » (celui qui compte) est
   RETENU tant qu'on ne le libère pas. C'est exactement la situation de la
   vidéo, reproduite à la milliseconde près.

   Rejoué sur `main` (v102), le §1 ci-dessous échoue : le cache y garde 0 et le
   resservice affiche « moins de 0 ». C'est la reproduction demandée.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';

let soucis = 0;
function ok(cond, msg){
  console.log((cond ? '   ✓ ' : '   ✗ ') + msg);
  if(!cond) soucis++;
}
function titre(t){ console.log('\n' + t); }
const dors = ms => new Promise(r=>setTimeout(r, ms));

/* Le décor. `window.__retenir` à vrai = l'étage « monde » ne répond pas ; on le
   libère avec `window.__liberer()`. Les totaux sont volontairement différents
   d'un étage à l'autre pour qu'un total partiel se voie tout de suite. */
async function decor(page){
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
  await page.evaluate(()=>{
    window.__retenir = true;
    window.__attente = [];
    window.__liberer = ()=>{ window.__retenir = false;
                             const l = window.__attente.slice();
                             window.__attente.length = 0; l.forEach(f => f()); };
    window.__appels = 0;
    let n = 0;
    window.tmdb = async (chemin, params)=>{
      if(/\/genre\//.test(chemin)) return { genres:[
        {id:28,name:'Action'},{id:12,name:'Aventure'},{id:35,name:'Comédie'},
        {id:18,name:'Drame'},{id:16,name:'Animation'},
        {id:10759,name:'Action & Adventure'},{id:10765,name:'Sci-Fi & Fantasy'} ] };
      window.__appels++;
      /* L'étage « occident » se reconnaît à SA LISTE DE TREIZE LANGUES EN OU :
         c'est le seul flux qui porte un `with_original_language` à séparateurs.
         (Les animés en portent un aussi — « ja » — mais seul, et eux comptent.)
         Lui répond tout de suite ; tous les autres sont retenus. */
      const lang = String((params && params.with_original_language) || '');
      /* L'anglais n'est QUE dans la liste des treize langues occidentales ;
         celle des animés est « ja|zh|ko ». C'est le seul signe sûr. */
      const occ = /(^|\|)en(\||$)/.test(lang);
      if(!occ && window.__retenir){
        await new Promise(r=>window.__attente.push(r));
      }
      const tv = /\/tv\b/.test(chemin);
      /* Les titres rendus RESSEMBLENT à ce qu'on a demandé : sans quoi le tamis
         des animés jette tout et la grille de la famille « Animés » reste
         vide, ce qui n'éprouve plus rien. */
      const wg = String((params && params.with_genres) || '');
      const genres = /(^|[^0-9])16([^0-9]|$)/.test(wg) ? [16, 28, 12] : [28, 12];
      const ol = occ ? 'en' : (lang ? lang.split('|')[0] : 'ja');
      const lot = Array.from({length:20}, ()=>{ n++;
        const x = { id:300000+n, poster_path:'/p.jpg', backdrop_path:'/b.jpg',
                    vote_average:7.4, vote_count:1200, genre_ids:genres.slice(),
                    original_language: ol, overview:'Texte.' };
        if(tv){ x.name='Serie '+n; x.first_air_date='2021-01-01'; }
        else  { x.title='Film '+n; x.release_date='2021-01-01'; }
        return x;
      });
      return { results: lot, total_pages: 20,
               total_results: occ ? 5000 : 1234, page: 1 };
    };
    window.sbFetch = async ()=> ([]);
    db.auth = { token:'x', uid:'moi' };
    partage.suivis = []; partage.abonnes = []; partage.charge = true;
    conseils = { recues:[], envoyees:[], charge:true };
    db.notifLus = {};
    go('search', {});
    const r = etatRech();
    r.fam = 'serie'; r.touche = true;
  });
  await dors(300);
}

(async ()=>{
  const nav = await chromium.launch();

  /* ===== §1 — LE CACHE NE RETIENT PAS UN TOTAL PROVISOIRE ================= */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);

    titre('§1 — mis en cache PENDANT l\'amorçage : la grille est pleine, le total ne l\'est pas');
    const r1 = await page.evaluate(async ()=>{
      rechCache.length = 0;
      /* L'ouverture de l'écran a déjà chargé une grille : on l'efface, sans
         quoi « des jaquettes à l'écran » serait vrai avant même qu'on demande
         quoi que ce soit. */
      etatRech().res = [];
      relancerRech();
      /* On attend que la première fournée soit SERVIE (des jaquettes à
         l'écran), pendant que l'étage qui compte est encore retenu. */
      for(let i=0; i<200 && !etatRech().res.length; i++) await new Promise(x=>setTimeout(x,20));
      const F = etatRech().flux;
      const e = rechCache[rechCache.length-1] || null;
      return { affiches: etatRech().res.length,
               amorce: !!(F && F.amorce),
               totalEtat: etatRech().total,
               enCache: e ? e.total : 'PAS D\'ENTRÉE',
               nbCache: rechCache.length };
    });
    ok(r1.affiches > 0, 'la grille est pleine — ' + r1.affiches + ' affiches servies');
    ok(r1.amorce === true, 'et l\'amorçage de fond tourne encore (c\'est la fenêtre du bug)');
    ok(r1.nbCache === 1, 'la recherche est bien entrée en cache');
    ok(r1.enCache === null,
       'MAIS SON TOTAL EST `null`, pas le chiffre provisoire (obtenu : ' + JSON.stringify(r1.enCache) + ')');

    titre('§1 bis — on revient dessus : jamais « 0 », jamais « moins de 0 »');
    const r2 = await page.evaluate(async ()=>{
      /* Le geste exact de la vidéo : on quitte la Recherche, on y revient, on
         redemande la même chose. `relancerRech` retrouve l'entrée en cache. */
      relancerRech();
      await new Promise(x=>setTimeout(x, 120));
      return { duCache: etatRech().flux === null,
               total: etatRech().total,
               grille: texteCompteurGrilleRech(),
               /* Balises retirées : « moins de <b>0</b> séries » ne se lit pas
                  à l'œil nu dans une expression régulière. */
               barre: texteCompteurBarreRech().replace(/<[^>]+>/g,''),
               bouton: (typeof texteVoirFiltresRech === 'function') ? texteVoirFiltresRech() : '',
               affiches: etatRech().res.length };
    });
    ok(r2.duCache, 'la grille est bien resservie de mémoire (aucun moteur)');
    ok(r2.affiches > 0, 'et elle est pleine — ' + r2.affiches + ' affiches');
    ok(r2.total === null, 'le total resservi est `null` et non 0');
    ok(!/\b0\b/.test(r2.grille), 'le titre de grille ne dit pas « 0 » : « ' + r2.grille + ' »');
    ok(r2.grille === 'Résultats', 'il dit « Résultats », sans chiffre');
    ok(!/\b0\b/.test(r2.barre), 'la barre ne dit pas « moins de 0 » : « ' + r2.barre + ' »');
    ok(!/\b0\b/.test(r2.bouton), 'le bouton de la feuille Filtres non plus : « ' + r2.bouton + ' »');

    await page.close();
  }

  /* ===== §2 — L'AMORÇAGE FINI RECOLLE LE TOTAL DÉFINITIF SUR SON ENTRÉE === */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);

    titre('§2 — l\'amorçage va au bout : le cache apprend le chiffre exact');
    const r3 = await page.evaluate(async ()=>{
      rechCache.length = 0;
      etatRech().res = [];
      relancerRech();
      for(let i=0; i<200 && !etatRech().res.length; i++) await new Promise(x=>setTimeout(x,20));
      window.__liberer();
      /* On attend la fin de l'amorçage de fond. */
      for(let i=0; i<400; i++){
        const F = etatRech().flux;
        if(F && !F.amorce) break;
        await new Promise(x=>setTimeout(x,20));
      }
      await new Promise(x=>setTimeout(x, 80));
      const e = rechCache[rechCache.length-1] || null;
      return { total: etatRech().total, exact: etatRech().flux.exact,
               grille: texteCompteurGrilleRech(),
               enCache: e ? e.total : null, exactCache: e ? e.exact : null };
    });
    ok(r3.total > 0, 'le compteur affiche un vrai chiffre — ' + r3.total);
    ok(r3.enCache === r3.total,
       'et le cache porte EXACTEMENT le même (' + r3.enCache + ')');
    ok(r3.exactCache === r3.exact,
       'ainsi que la nuance « moins de » (exact = ' + r3.exactCache + ')');

    titre('§2 bis — resservi, il dit mot pour mot la même chose');
    const r4 = await page.evaluate(async ()=>{
      const avant = { grille: texteCompteurGrilleRech(),
                      barre: texteCompteurBarreRech(),
                      total: etatRech().total };
      const appelsAvant = window.__appels;
      relancerRech();
      await new Promise(x=>setTimeout(x, 150));
      return { avant: avant, apres: { grille: texteCompteurGrilleRech(),
                                      barre: texteCompteurBarreRech(),
                                      total: etatRech().total },
               duCache: etatRech().flux === null,
               requetes: window.__appels - appelsAvant };
    });
    ok(r4.duCache && r4.requetes === 0, 'aucune requête : c\'est bien le cache qui a servi');
    ok(r4.avant.total === r4.apres.total,
       'le total est identique première exécution / resservice (' + r4.apres.total + ')');
    ok(r4.avant.grille === r4.apres.grille,
       'le titre de grille est identique : « ' + r4.apres.grille + ' »');
    ok(r4.avant.barre === r4.apres.barre,
       'la barre aussi, « moins de » compris');

    await page.close();
  }

  /* ===== §3 — LES QUATRE FAMILLES ======================================== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);

    titre('§3 — Tout, Films, Séries, Animés : même chiffre avec et sans cache, jamais 0 sur une grille pleine');
    const r5 = await page.evaluate(async ()=>{
      const out = [];
      const familles = RECH_FAMILLES.map(f => f.id);
      for(const fam of familles){
        rechCache.length = 0;
        window.__retenir = true; window.__attente.length = 0;
        const r = etatRech();
        r.fam = fam; r.touche = true; r.res = [];
        relancerRech();
        for(let i=0; i<200 && !etatRech().res.length; i++) await new Promise(x=>setTimeout(x,20));
        window.__liberer();
        for(let i=0; i<400; i++){
          const F = etatRech().flux;
          if(F && !F.amorce) break;
          await new Promise(x=>setTimeout(x,20));
        }
        await new Promise(x=>setTimeout(x,80));
        const t1 = etatRech().total, g1 = texteCompteurGrilleRech();
        const n1 = etatRech().res.length;
        relancerRech();
        await new Promise(x=>setTimeout(x,150));
        out.push({ fam: fam, n: n1, t1: t1, t2: etatRech().total,
                   g1: g1, g2: texteCompteurGrilleRech(),
                   duCache: etatRech().flux === null });
      }
      return out;
    });
    r5.forEach(c => {
      ok(c.duCache, c.fam + ' — resservie de mémoire');
      ok(c.n > 0 && c.t1 > 0, c.fam + ' — grille pleine (' + c.n + ') et total non nul (' + c.t1 + ')');
      ok(c.t1 === c.t2 && c.g1 === c.g2,
         c.fam + ' — même compte avant/après cache : « ' + c.g2 + ' »');
    });

    await page.close();
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
