/* ---------------------------------------------------------------------------
   RETOUR-08 §1 — LE 💌 SUR CHAQUE FICHE, QUEL QUE SOIT L'ÉTAT.

       cd <depot> && python3 -m http.server 8099 &
       node tests/retour-08.js

   Le défaut, relevé par Adrien le 29/08 sur Blacklist (218/218) : le bouton
   « recommander » et le bandeau d'état vivaient DANS la branche « il reste un
   épisode à voir » de `viewShow`. Trois états les perdaient — terminée, en
   pause, pas encore commencée — dont celui où l'on recommande le plus.

   Une suite d'ÉCRAN, comme retour-05 et retour-07, et pour la même raison : ce
   n'est pas une fonction qui mentait, c'est un rendu qui ne portait pas le
   bouton. Un cas qui appelle `boutonRecoFiche()` aurait été vert du premier
   jour — c'est le piège que la maison appelle « un test qui vérifie qu'on
   APPELLE n'éprouve pas ce que l'appel FAIT ».

   Rien n'est bouchonné ici sauf le réseau : `viewShow`, `viewMovie`,
   `viewPreview`, `boutonRecoFiche` et `bandeauRecoFiche` sont le vrai code.
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
    partage.suivis = [{ id:'u2', pseudo:'Maria' }];
    partage.abonnes = []; partage.charge = true;
    conseils = { recues:[], envoyees:[], charge:true };

    const hier = new Date(Date.now() - 5*86400000).toISOString().slice(0,10);
    const demain = new Date(Date.now() + 5*86400000).toISOString().slice(0,10);
    const eps = n => Array.from({length:n},(_,k)=>({ e:k+1, n:'Épisode '+(k+1), d:hier, r:42 }));
    const tousVus = n => { const o = {}; for(let i=1;i<=n;i++) o['1x'+i] = 1; return o; };

    /* Les quatre états d'une série, et rien d'autre ne les distingue. */
    window.poserSeries = ()=>{
      db.shows = {};
      /* ① en cours : des épisodes sortis restent à voir */
      db.shows[1] = { id:1, name:'En cours', status:'Returning', genres:['Drame'],
                      seasons:{ 1:eps(6) }, watched:{ '1x1':1, '1x2':1 },
                      addedAt:1, updated:1 };
      /* ② terminée : tout vu, série finie — le cas Blacklist */
      db.shows[2] = { id:2, name:'Terminée', status:'Ended', genres:['Crime'],
                      seasons:{ 1:eps(4) }, watched:tousVus(4), addedAt:1, updated:1 };
      /* ③ en pause : commencée, mise de côté */
      db.shows[3] = { id:3, name:'En pause', status:'Returning', genres:['Drame'],
                      seasons:{ 1:eps(6) }, watched:{ '1x1':1 }, pause:1,
                      addedAt:1, updated:1 };
      /* ④ pas commencée : rien de sorti, un prochain épisode annoncé */
      db.shows[4] = { id:4, name:'Pas commencée', status:'Returning', genres:['SF'],
                      seasons:{ 1:[{ e:1, n:'Pilote', d:demain, r:42 }] }, watched:{},
                      next:{ s:1, e:1, n:'Pilote', d:demain }, addedAt:1, updated:1 };
      db.movies = {};
      db.movies[500] = { id:500, title:'Un film', seen:true, watchedAt:Date.now(),
                         genres:['Action'], addedAt:1, updated:1 };
      if(typeof viderMemo === 'function') viderMemo();
    };
    /* Ce que l'écran porte, lu sur le DOM et pas sur une chaîne de HTML : c'est
       la présence RÉELLE d'un bouton actionnable qu'on veut, pas une sous-chaîne
       qui pourrait vivre dans un commentaire ou un attribut mort. */
    window.lireFiche = ()=>{
      const app = document.getElementById('app');
      const b = [...app.querySelectorAll('button.reco')];
      const band = app.querySelector('.recoband');
      return {
        combien: b.length,
        carre: b.some(x => x.classList.contains('carre')),
        bloc:  b.some(x => x.classList.contains('block')),
        agit:  b.every(x => /menuRecommander\(/.test(x.getAttribute('onclick') || '')),
        bandeau: band ? band.textContent.trim() : ''
      };
    };
  });
}

(async ()=>{
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
  await decor(page);

  /* ===== Les quatre états d'une série ====================================== */
  titre('Les quatre états d\'une série portent tous le 💌');
  {
    const r = await page.evaluate(()=>{
      poserSeries();
      const lu = {};
      [1,2,3,4].forEach(id=>{
        go('show', { id:String(id), from:'follow' });
        lu[db.shows[id].name] = lireFiche();
      });
      return lu;
    });
    Object.keys(r).forEach(nom=>{
      ok(r[nom].combien === 1,
         nom + ' : exactement un bouton 💌 (obtenu : ' + r[nom].combien + ')');
    });
    ok(r['En cours'].carre && !r['En cours'].bloc,
       'en cours : le carré, à côté de « Marquer comme vu » — l\'écran d\'avant ne bouge pas');
    ok(r['Terminée'].bloc && !r['Terminée'].carre,
       'TERMINÉE : le bouton pleine largeur — le cas Blacklist, qui n\'avait rien du tout');
    ok(r['En pause'].bloc, 'en pause : le bouton pleine largeur');
    ok(r['Pas commencée'].bloc, 'pas commencée : le bouton pleine largeur');
    ok(Object.keys(r).every(n => r[n].agit),
       'les quatre ouvrent bien la feuille d\'envoi, et pas autre chose');
  }

  /* ===== Le bandeau, qui partait avec le bouton ============================ */
  titre('Le bandeau d\'état suit le bouton hors de la branche');
  {
    const r = await page.evaluate(()=>{
      poserSeries();
      conseils.envoyees = [{ id:'r1', de:'moi', vers:'u2', type:'tv', tmdb_id:2,
                             titre:'Terminée', cree:'2026-08-28', ajoute:'2026-08-29' }];
      const lu = {};
      [2,3].forEach(id=>{ go('show', { id:String(id) }); lu[id] = lireFiche().bandeau; });
      /* Et rien pour une série jamais recommandée : le bandeau ne s'invente pas. */
      go('show', { id:'1' });
      lu.jamais = lireFiche().bandeau;
      conseils.envoyees = [];
      return lu;
    });
    ok(/Maria/.test(r[2]) && /ajout/.test(r[2]),
       'série TERMINÉE déjà recommandée : le bandeau le dit (obtenu : ' + (r[2] || '—') + ')');
    ok(r[3] === '', 'une autre série ne porte pas le bandeau de celle-là');
    ok(r.jamais === '', 'et une série jamais recommandée n\'affiche rien');
  }

  /* ===== La règle I6 tient toujours ======================================= */
  titre('Cercle vide : aucun 💌 nulle part — la règle d\'I6 n\'est pas contournée');
  {
    const r = await page.evaluate(()=>{
      poserSeries();
      const s = partage.suivis, a = partage.abonnes;
      partage.suivis = []; partage.abonnes = [];
      const lu = {};
      [1,2,3,4].forEach(id=>{ go('show', { id:String(id) }); lu[id] = lireFiche().combien; });
      go('movie', { id:'500' }); lu.film = lireFiche().combien;
      partage.suivis = s; partage.abonnes = a;
      return lu;
    });
    ok([1,2,3,4].every(id => r[id] === 0) && r.film === 0,
       'proposer « recommander » à qui ne suit personne ouvrirait une feuille vide : rien n\'est posé');
  }

  /* ===== Ce qui marchait déjà ne doit pas bouger =========================== */
  titre('Aucune régression sur la fiche film ni sur l\'aperçu');
  {
    const r = await page.evaluate(()=>{
      poserSeries();
      const lu = {};
      go('movie', { id:'500' }); lu.film = lireFiche();
      ui.preview = { id:500, type:'movie', loading:false, error:'',
                     data:{ id:500, nom:'Un film', media:'movie', genres:[] } };
      go('preview', { id:'500', type:'movie' }); lu.apercuFilm = lireFiche();
      ui.preview = { id:2, type:'tv', loading:false, error:'',
                     data:{ id:2, nom:'Terminée', media:'tv', genres:[], saisons:[] } };
      go('preview', { id:'2', type:'tv' }); lu.apercuSerie = lireFiche();
      return lu;
    });
    ok(r.film.combien === 1 && r.film.carre,
       'la fiche film garde son carré à côté de « Vu le … » (inchangée)');
    ok(r.apercuFilm.combien === 1 && r.apercuFilm.carre, 'l\'aperçu d\'un film : inchangé');
    ok(r.apercuSerie.combien === 1 && r.apercuSerie.carre, 'l\'aperçu d\'une série : inchangé');
  }

  /* ===== Et l'action principale de la série n'a pas été perdue ============= */
  titre('L\'écran d\'une série en cours n\'a rien perdu au passage');
  {
    const r = await page.evaluate(()=>{
      poserSeries();
      go('show', { id:'1' });
      const h = document.getElementById('app').innerHTML;
      const app = document.getElementById('app');
      return { marquer: /quickWatch\(1\)/.test(h),
               pause: /basculerPause\(1\)/.test(h),
               prochain: (()=>{ go('show', { id:'4' });
                                return /Prochain épisode/.test(app.textContent); })() };
    });
    ok(r.marquer, '« Marquer comme vu » est toujours là');
    ok(r.pause, 'le bouton pause aussi');
    ok(r.prochain, 'et la carte « Prochain épisode » d\'une série pas commencée n\'a pas disparu');
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
