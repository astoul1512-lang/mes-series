/* ---------------------------------------------------------------------------
   RETOUR-06 — la latence de la Recherche, et le centre qui ouvre ses fiches.

       cd <depot> && python3 -m http.server 8099 &
       node tests/retour-06.js

   Écrit sur le modèle de `tests/nav-centre-spec10.js` et de
   `tests/retour-05.js` : mêmes vrais gestes, même lanceur, même sortie.

   POURQUOI UNE SUITE À PART, ET PAS DES CAS DANS `test.html`. Les deux points
   de ce lot ne se prouvent qu'en RENDANT :

     · le point 1 est une histoire de TEMPS. « La grille s'affiche avant que
       tout soit revenu » ne veut rien dire pour un cas synchrone — il faut un
       relais qui met du temps à répondre, et regarder l'écran pendant ce
       temps-là. Le relais est donc bouchonné à latence FIXE : à latence
       constante, ce qu'on mesure ne dépend plus que du nombre de vagues
       séquentielles, qui est très exactement ce que le lot réduit.
     · le point 2 est une histoire de GESTE et de PILE. La jaquette doit être
       touchable, et le retour — flèche ET balayage, qui passe par `popstate` —
       doit revenir au centre. Aucune de ces deux choses ne se lit dans une
       fonction ; elles se lisent dans le DOM et dans l'historique.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';
const RTT = Number(process.env.RTT || 180);

let soucis = 0;
function ok(cond, msg){
  console.log((cond ? '   ✓ ' : '   ✗ ') + msg);
  if(!cond) soucis++;
}
function titre(t){ console.log('\n' + t); }

/* Le décor : un relais qui répond en RTT millisecondes et compte ses appels. */
async function decor(page, opts){
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
  await page.evaluate(([rtt, o])=>{
    window.__ap = []; let n = 0;
    window.tmdb = async (chemin, params)=>{
      window.__ap.push({ t: performance.now(), chemin:chemin,
                         page:(params && params.page) || '' });
      await new Promise(r=>setTimeout(r, rtt));
      if(/\/genre\//.test(chemin)) return { genres:[
        {id:28,name:'Action'},{id:12,name:'Aventure'},{id:35,name:'Comédie'},
        {id:18,name:'Drame'},{id:16,name:'Animation'},
        {id:10759,name:'Action & Adventure'},{id:10765,name:'Sci-Fi & Fantasy'} ] };
      const tv = /\/tv\b/.test(chemin);
      const lot = Array.from({length:20}, ()=>{ n++;
        const x = { id:200000+n, poster_path:'/p.jpg', backdrop_path:'/b.jpg',
                    vote_average:7.2, vote_count:900, genre_ids:[28,12],
                    original_language:'en', overview:'Texte.' };
        if(tv){ x.name='Serie '+n; x.first_air_date='2021-01-01'; }
        else  { x.title='Film '+n; x.release_date='2021-01-01'; }
        return x;
      });
      return { results: lot, total_pages: 20, total_results: 400, page: 1 };
    };
    window.sbFetch = async ()=> ([]);
    db.auth = { token:'x', uid:'moi' };
    partage.suivis = [{ id:'u2', pseudo:'Camille' }];
    partage.abonnes = []; partage.charge = true;
    conseils = { recues:[], envoyees:[], charge:true };
    db.notifLus = {};
    if(o && o.reco){
      /* Le titre est DANS la bibliothèque : `ficheReco` le lit sans réseau, la
         carte a donc son affiche tout de suite. */
      db.shows[1399] = { id:1399, name:'Severance', poster:'/sev.jpg', seasons:{},
                         watched:{}, addedAt:1, updated:1 };
      conseils.recues = [{ id:'r1', de:'u2', vers:'moi', type:'tv', tmdb_id:1399,
                           titre:'Severance', cree:new Date().toISOString(),
                           mot:'Regarde les trois premiers' }];
    }
  }, [RTT, opts || {}]);
}

const dors = ms => new Promise(r=>setTimeout(r, ms));

(async ()=>{
  const nav = await chromium.launch();

  /* ===== POINT 1 — la latence ============================================= */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);

    titre('§1 ① — la grille s\'affiche AVANT que tout soit revenu');
    const r1 = await page.evaluate(async ()=>{
      go('search', {});
      const r = etatRech();
      r.fam = 'film'; r.genre = ['Action','Aventure']; r.origine = ['us','fr'];
      r.touche = true;
      await new Promise(x=>setTimeout(x, 1200));      // l'écran se pose
      /* On efface l'écran, ET LE CACHE : pendant que l'écran se posait, cette
         recherche exacte a eu le temps de partir et d'être gardée — le ③ marche
         trop bien pour qu'on puisse mesurer le ① par-dessus. Ces deux cas-ci
         éprouvent l'affichage progressif et le parallélisme ; le cache a ses
         propres cas, juste en dessous. */
      rechCache.length = 0;
      r.res = []; r.charge = false; render();
      window.__ap = [];
      const t0 = performance.now();
      const jalons = [];
      /* On regarde l'écran toutes les 16 ms pendant que ça charge. */
      const oeil = setInterval(()=>{
        const n = document.querySelectorAll('#rres .pcard, #rres .poster').length;
        /* `loading` DIT LA VÉRITÉ, pas le nombre de requêtes parties : la
           deuxième vague est LANCÉE avant que la grille se peigne, donc compter
           les départs ferait croire que tout était revenu. Ce qu'on veut
           prouver, c'est qu'on affiche PENDANT que ça charge encore. */
        if(n) jalons.push({ t: performance.now() - t0, n: n,
                            charge: etatRech().loading });
      }, 16);
      relancerRech();
      await new Promise(x=>setTimeout(x, 2500));
      clearInterval(oeil);
      return { premier: jalons[0] || null, total: window.__ap.length,
               fin: etatRech().res.length,
               pages: window.__ap.map(a=>a.page) };
    });
    ok(!!r1.premier, 'la grille finit par s\'afficher');
    ok(r1.premier && r1.premier.charge === true,
       'les premières jaquettes s\'affichent PENDANT que le reste charge encore');
    ok(r1.premier && r1.premier.t < 300,
       'la première jaquette arrive en moins de 300 ms (obtenu : '+
       (r1.premier ? Math.round(r1.premier.t) : '?')+' ms)');
    ok(r1.fin === 42,
       'la fournée fait toujours 42 titres (obtenu : '+r1.fin+') — le premier '+
       'service ne s\'ajoute pas à une fournée entière');

    titre('§1 ② — les pages qui manquent partent ENSEMBLE');
    const r2 = await page.evaluate(()=>{
      const t = window.__ap.map(a=>a.t).sort((a,b)=>a-b);
      let vagues = t.length ? 1 : 0;
      for(let i=1;i<t.length;i++) if(t[i]-t[i-1] > 90) vagues++;
      return { req:t.length, vagues:vagues };
    });
    ok(r2.req > 0 && r2.vagues <= 2,
       'les requêtes partent en deux vagues au plus, pas en file indienne '+
       '(obtenu : '+r2.vagues+' vague(s) pour '+r2.req+' requêtes)');

    titre('§1 ③ — la même recherche ne redemande RIEN');
    const r3 = await page.evaluate(async ()=>{
      window.__ap = [];
      relancerRech();
      await new Promise(x=>setTimeout(x, 900));
      return { req: window.__ap.length, res: etatRech().res.length };
    });
    ok(r3.req === 0, 'la même recherche ne refait aucune requête (obtenu : '+r3.req+')');
    ok(r3.res === 42, 'la grille reprise de mémoire est complète (obtenu : '+r3.res+')');

    const r4 = await page.evaluate(async ()=>{
      /* Un critère de plus : la signature change, le cache ne doit PAS servir. */
      window.__ap = [];
      poserMotRech('genre', 'Comédie');
      await new Promise(x=>setTimeout(x, 1500));
      return window.__ap.length;
    });
    ok(r4 > 0, 'une recherche DIFFÉRENTE repart bien au réseau (obtenu : '+r4+' requêtes)');

    /* CE CAS EXISTE PARCE QU'UNE MUTATION Y A SURVÉCU (29/08). En retirant la
       taille de la bibliothèque de la clé du cache, toute la suite restait
       verte — or c'est le défaut le plus vicieux que ce cache puisse avoir :
       « pas déjà vu » se juge CONTRE la bibliothèque. Ajouter un titre puis
       refaire la même recherche resservirait alors la grille d'avant, qui
       contient encore ce qu'on vient d'ajouter. */
    const r5 = await page.evaluate(async ()=>{
      const r = etatRech();
      r.fam = 'film'; r.genre = ['Action']; r.origine = []; r.pasvu = 'oui';
      const avant = signatureRech();
      db.movies[999001] = { id:999001, title:'Ajouté à l\'instant', seen:true, addedAt:1 };
      const apres = signatureRech();
      delete db.movies[999001];
      return { avant, apres };
    });
    ok(r5.avant !== r5.apres,
       'ajouter un titre à la bibliothèque change la clé du cache — sans quoi '+
       '« pas déjà vu » resservirait une grille périmée');
    await page.close();
  }

  /* ===== POINT 2 — le centre ouvre ses fiches, et le retour revient ======= */
  for(const onglet of ['discover', 'follow', 'profile']){
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, { reco:true });
    titre('§2 — jaquette → fiche → retour, depuis « '+onglet+' »');

    const pose = await page.evaluate(async (o)=>{
      go(o, {});
      await new Promise(x=>setTimeout(x, 200));
      ouvrirCentre();
      await new Promise(x=>setTimeout(x, 250));
      const j = document.querySelector('.recocj');
      const t = document.querySelector('.recocn.recocnb');
      return { vue:view, from:params.from, jaquette:!!j, titre:!!t };
    }, onglet);
    ok(pose.vue === 'centre' && pose.from === onglet,
       'le centre s\'ouvre avec le bon from (obtenu : '+pose.vue+', from:'+pose.from+')');
    ok(pose.jaquette, 'la jaquette de la carte reco est touchable');
    ok(pose.titre, 'le titre de la carte reco est touchable');

    /* Le vrai geste : on CLIQUE la jaquette. */
    await page.click('.recocj');
    await dors(300);
    const surFiche = await page.evaluate(()=> ({ vue:view, from:params.from,
                                                 id:String(params.id||'') }));
    ok(surFiche.vue === 'show' && surFiche.from === 'centre',
       'la jaquette ouvre la fiche, et la fiche sait qu\'elle vient du centre '+
       '(obtenu : '+surFiche.vue+', from:'+surFiche.from+')');

    /* Retour n° 1 — la flèche. NEUF CENTS MILLISECONDES, et pas trois cents :
       le retour de cette app joue son animation puis recule dans l'historique
       (`glisseRetour.jouer`). C'est la même attente que
       `tests/nav-centre-spec10.js`, pour la même raison. */
    await page.evaluate(()=> goBack());
    await dors(900);
    const retour1 = await page.evaluate(()=> view);
    ok(retour1 === 'centre', 'la flèche ramène au centre (obtenu : '+retour1+')');

    /* Retour n° 2 — l'onglet d'origine. */
    await page.evaluate(()=> goBack());
    await dors(900);
    const retour2 = await page.evaluate(()=> view);
    ok(retour2 === onglet,
       'le second retour ramène à l\'onglet d\'origine (attendu : '+
       onglet+', obtenu : '+retour2+')');
    await page.close();
  }

  /* ===== POINT 2 — le balayage iOS (popstate), et le lu/non-lu ============ */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, { reco:true });
    titre('§2 — le balayage (popstate) ramène AUSSI au centre');
    await page.evaluate(async ()=>{
      go('discover', {});
      await new Promise(x=>setTimeout(x, 200));
      ouvrirCentre();
      await new Promise(x=>setTimeout(x, 250));
    });
    await page.click('.recocn.recocnb');           // cette fois par le TITRE
    await dors(300);
    const av = await page.evaluate(()=> view);
    ok(av === 'show', 'le titre ouvre la fiche (obtenu : '+av+')');
    /* Le balayage iOS passe par l'historique du navigateur, pas par `goBack`. */
    await page.goBack();
    await dors(400);
    const ap = await page.evaluate(()=> view);
    ok(ap === 'centre', 'le balayage ramène au centre (obtenu : '+ap+')');

    titre('§2 — le lu/non-lu survit à l\'aller-retour');
    const lu = await page.evaluate(()=>{
      /* `ouvrirConseil` marque la reco VUE, pas LUE : la pastille du centre ne
         doit pas s'éteindre toute seule parce qu'on a ouvert une fiche. */
      return { lu: estLuNotif('reco:r1'), nonlus: nbNonLusCentre() };
    });
    ok(lu.nonlus >= 1 && !lu.lu,
       'ouvrir la fiche ne marque pas la reco lue toute seule (non-lus : '+lu.nonlus+')');
    await page.close();
  }

  /* ===== POINT 2 — l'enchaînement profond ================================= */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, { reco:true });
    titre('§2 — centre → fiche → acteur → fiche → retours jusqu\'à l\'onglet');
    const parcours = await page.evaluate(async ()=>{
      const vues = [];
      go('follow', {});
      await new Promise(x=>setTimeout(x, 150));
      ouvrirCentre();
      await new Promise(x=>setTimeout(x, 200));
      ouvrirConseil('r1', 1399, 'tv', 'centre');
      await new Promise(x=>setTimeout(x, 200));
      vues.push(view);
      go('acteur', { id:500, from:'show' });
      await new Promise(x=>setTimeout(x, 200));
      vues.push(view);
      go('show', { id:1399, from:'acteur' });
      await new Promise(x=>setTimeout(x, 200));
      vues.push(view);
      /* Neuf cents millisecondes par retour : l'animation, puis l'historique. */
      for(let i=0;i<4;i++){ goBack(); await new Promise(x=>setTimeout(x, 900)); vues.push(view); }
      return vues;
    });
    ok(parcours[0] === 'show' && parcours[1] === 'acteur' && parcours[2] === 'show',
       'l\'aller se déroule comme prévu : '+parcours.slice(0,3).join(' → '));
    ok(parcours.indexOf('centre') > 2,
       'les retours successifs repassent par le centre : '+parcours.join(' → '));
    ok(parcours[parcours.length-1] === 'follow',
       'le dernier retour rend l\'onglet d\'origine : '+parcours.join(' → '));
    await page.close();
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
