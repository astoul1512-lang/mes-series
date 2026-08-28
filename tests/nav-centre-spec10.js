/* ---------------------------------------------------------------------------
   SPEC-10 §7 — LE CENTRE S'INSÈRE DANS LA PILE RÉELLE.

       cd <depot> && python3 -m http.server 8099 &
       node tests/nav-centre-spec10.js

   Le §7 est BLOQUANT et il demande exactement ce parcours :

       fil → fiche → retour → fil → retour → onglet d'origine

   avec un `from:` EXACT et jamais codé en dur — le fil s'ouvre depuis trois
   onglets, et revenir sur Découvrir après l'avoir ouvert depuis Mon profil
   serait le défaut que ce fichier existe pour interdire.

   Il vérifie AUSSI les deux règles d'emplacement du §0, parce qu'elles ne se
   voient que sur l'écran rendu : la cloche est sur les trois onglets et nulle
   part ailleurs, et le ＋ d'« En cours » a disparu.

   Écrit sur le modèle de `tests/nav-cycle3.js` : mêmes vrais gestes, même
   lanceur, même sortie. Si un lot RETOUR-03 arrive avec sa propre suite de
   navigation, celle-ci reste valable à côté — elles ne se recouvrent pas.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';

let soucis = 0;
function ok(cond, msg){
  console.log((cond ? '   ✓ ' : '   ✗ ') + msg);
  if(!cond) soucis++;
}

/* Le décor : une session ouverte, un cercle, une reco reçue avec son mot, et un
   faux TMDB qui répond à tout. Rien ne part au réseau. */
async function decor(page){
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
  await page.evaluate(()=>{
    let n = 0;
    window.tmdb = async (chemin)=>{
      if(/\/genre\//.test(chemin)) return { genres:[{id:35,name:'Comédie'}] };
      const tv = /\/tv\//.test(chemin);
      const lot = Array.from({length:20}, ()=>{ n++;
        const o = { id:5000+n, poster_path:'/p'+n+'.jpg', vote_average:7,
                    vote_count:500, genre_ids:[35], original_language:'en' };
        if(tv){ o.name = 'Serie '+n; o.first_air_date = '2020-01-01'; }
        else  { o.title = 'Film '+n; o.release_date = '2020-01-01'; }
        return o;
      });
      return { results: lot, total_pages: 2, total_results: 40 };
    };
    db.auth = { token:'x', uid:'moi' };
    db.notifLus = {};
    partage.suivis  = [{ id:'u2', pseudo:'Camille' }];
    partage.abonnes = [];
    partage.charge = true;
    conseils = { recues:[{ id:'r1', de:'u2', vers:'moi', type:'tv', tmdb_id:1399,
                           titre:'Severance', cree:new Date().toISOString(),
                           mot:'Regarde les trois premiers épisodes' }],
                 envoyees:[], charge:true };
    /* Aucune écriture réseau pendant le parcours. */
    window.sbFetch = async ()=> ([]);
  });
}

(async ()=>{
  const nav = await chromium.launch();

  /* ===== 1. La cloche : trois onglets, et pas un de plus ==================== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    const r = await page.evaluate(async ()=>{
      const lu = {};
      for(const v of ['discover','follow','profile','search']){
        go(v, {});
        await new Promise(x=>setTimeout(x, 120));
        lu[v] = {
          cloche: !!document.querySelector('header .iconbtn.clochec'),
          plus:   !!document.querySelector('header .iconbtn[onclick*="discover"]'),
          badge:  (document.querySelector('header .cbadge')||{}).textContent || ''
        };
      }
      return lu;
    });
    console.log('§0.2 / §0.3 / §0.4 — où vit la cloche');
    ok(r.discover.cloche, 'Découvrir porte la cloche');
    ok(r.follow.cloche,   'En cours porte la cloche');
    ok(r.profile.cloche,  'Mon profil porte la cloche');
    ok(!r.search.cloche,  'Recherche NE porte PAS la cloche (§7, bloquant)');
    ok(!r.follow.plus,    'le ＋ d\'En cours a bien disparu');
    ok(r.discover.badge === '1' && r.follow.badge === '1' && r.profile.badge === '1',
       'même pastille, même compte sur les trois (obtenu : '+
       [r.discover.badge, r.follow.badge, r.profile.badge].join('/')+')');
    await page.close();
  }

  /* ===== 2. Le parcours du §7, depuis CHACUN des trois onglets ============== */
  for(const depart of ['discover','follow','profile']){
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    const r = await page.evaluate(async (dep)=>{
      const pause = ()=> new Promise(x=>setTimeout(x, 150));
      go(dep, {}); await pause();
      /* fil */
      document.querySelector('header .iconbtn.clochec').click(); await pause();
      const surFil = { vue:view, from:params.from };
      /* → fiche, par « Voir la fiche » de la carte reco */
      const voir = [...document.querySelectorAll('[onclick*="ouvrirConseil"]')][0];
      voir.click(); await pause();
      const surFiche = { vue:view, from:params.from };
      /* → retour : on doit revenir au FIL. On laisse le temps de l'animation
         ET du `popstate` — le retour de cette app n'est pas synchrone, c'est
         tout l'objet de `nav-cycle3.js`. */
      goBack(); await new Promise(x=>setTimeout(x, 900));
      const retourFil = { vue:view, from:params.from };
      /* → retour : on doit revenir à l'onglet de DÉPART */
      goBack(); await new Promise(x=>setTimeout(x, 900));
      return { surFil, surFiche, retourFil, fin:view };
    }, depart);
    console.log('§7 — fil → fiche → retour → fil → retour → « '+depart+' »');
    ok(r.surFil.vue === 'centre' && r.surFil.from === depart,
       'le fil s\'ouvre avec le bon from (obtenu : '+r.surFil.vue+', from:'+r.surFil.from+')');
    ok(r.surFiche.from === 'centre',
       'la fiche sait qu\'elle vient du fil (obtenu : from:'+r.surFiche.from+')');
    ok(r.retourFil.vue === 'centre', 'le retour ramène au fil (obtenu : '+r.retourFil.vue+')');
    ok(r.fin === depart,
       'le second retour ramène à l\'onglet d\'origine (attendu : '+depart+', obtenu : '+r.fin+')');
    await page.close();
  }

  /* ===== 3. Lu / non-lu : la pastille suit, et « Plus tard » ne supprime rien */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    const r = await page.evaluate(async ()=>{
      const pause = ()=> new Promise(x=>setTimeout(x, 150));
      go('discover', {}); await pause();
      const avant = nbNonLusCentre();
      go('centre', { from:'discover' }); await pause();
      document.querySelector('[onclick*="plusTardReco"]').click(); await pause();
      const apres = nbNonLusCentre();
      const encoreLa = /Severance/.test(document.getElementById('app').textContent);
      const bouton = !!document.querySelector('[onclick*="plusTardReco"]');
      go('profile', {}); await pause();
      const pastilleAilleurs = !!document.querySelector('header .cbadge');
      return { avant, apres, encoreLa, bouton, pastilleAilleurs };
    });
    console.log('§0.6 / §4 — lu, non lu, et ce qui reste');
    ok(r.avant === 1, 'la pastille comptait bien l\'entrée non lue (obtenu : '+r.avant+')');
    ok(r.apres === 0, '« Plus tard » n\'a pas marqué lu (obtenu : '+r.apres+')');
    ok(r.encoreLa, '« Plus tard » a FAIT DISPARAÎTRE la reco : le §0.6 l\'interdit');
    ok(!r.bouton, 'le bouton « Plus tard » est resté après avoir servi');
    ok(!r.pastilleAilleurs, 'la pastille d\'un autre onglet n\'a pas suivi la lecture');
    await page.close();
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — '+soucis+' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
