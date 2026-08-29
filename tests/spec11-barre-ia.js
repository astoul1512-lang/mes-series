/* ---------------------------------------------------------------------------
   SPEC-11 — LA BARRE ✦ COMPREND LES PERSONNES, LES DESCRIPTIONS ET LE « ET ».

       cd <depot> && python3 -m http.server 8099 &
       node tests/spec11-barre-ia.js

   L'acceptation du lot, c'est TROIS PHRASES d'Adrien, écrites exactement comme
   il les a écrites. Cette suite les tape dans la barre, en mode ✦, et regarde
   l'écran — pas les fonctions.

     ① « je cherche un film d'action avec Will Smith »
     ② « je cherche le film où leonardo dicaprio est courtier et se drogue »
     ③ « je veux un film d'action et d'aventure »

   Plus la quatrième, qui n'est pas une phrase mais une promesse : IA coupée,
   les trois mêmes phrases retombent sur le comportement d'aujourd'hui, sans
   erreur visible, et une requête IA au maximum part par validation.

   LE RELAIS EST BOUCHONNÉ, pas le raisonnement : il rend ce qu'un modèle
   correct rendrait, et tout ce qui suit — la résolution des personnes, la
   vérification des candidats, la pose des filtres — est le vrai code du dépôt.
   TMDB est bouchonné aussi, avec des homonymes et un titre inexistant : c'est
   là que se joue « ambigu ou introuvable → ignoré, on ne devine pas ».
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';

let soucis = 0;
function ok(cond, msg){
  console.log((cond ? '   ✓ ' : '   ✗ ') + msg);
  if(!cond) soucis++;
}
function titre(t){ console.log('\n' + t); }

async function decor(page, opts){
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
  await page.evaluate((o)=>{
    let n = 0;
    window.__tmdb = [];
    window.tmdb = async (chemin, params)=>{
      window.__tmdb.push({ chemin:chemin, params: Object.assign({}, params || {}) });
      if(/\/genre\/movie/.test(chemin)) return { genres:[
        {id:28,name:'Action'},{id:12,name:'Aventure'},{id:35,name:'Comédie'},
        {id:18,name:'Drame'},{id:16,name:'Animation'},{id:80,name:'Crime'}] };
      if(/\/genre\/tv/.test(chemin)) return { genres:[
        {id:10759,name:'Action & Adventure'},{id:18,name:'Drame'},{id:16,name:'Animation'},
        {id:35,name:'Comédie'},{id:80,name:'Crime'}] };
      if(/^\/search\/person$/.test(chemin)){
        const q = String((params && params.query) || '').toLowerCase();
        /* Deux homonymes pour « John Smith » : c'est le cas ambigu. Un seul
           « Will Smith » net, avec un homonyme bien moins connu. */
        if(q === 'will smith') return { results:[
          { id:2888, name:'Will Smith', profile_path:'/w.jpg', popularity:90 },
          { id:99991, name:'Will Smith', profile_path:null, popularity:1.2 } ] };
        if(q === 'john smith') return { results:[
          { id:70001, name:'John Smith', profile_path:'/j.jpg', popularity:5 },
          { id:70002, name:'John Smith', profile_path:'/j2.jpg', popularity:4.6 } ] };
        return { results:[] };
      }
      if(/^\/search\/multi$/.test(chemin)){
        const q = String((params && params.query) || '').toLowerCase();
        if(q === 'le loup de wall street') return { results:[
          { id:106646, media_type:'movie', title:'Le Loup de Wall Street',
            original_title:'The Wolf of Wall Street', poster_path:'/l.jpg',
            release_date:'2013-12-25', vote_average:8, vote_count:2000 } ] };
        if(q === 'blow') return { results:[
          { id:4133, media_type:'movie', title:'Blow', original_title:'Blow',
            poster_path:'/b.jpg', release_date:'2001-04-06', vote_average:7,
            vote_count:900 } ] };
        if(q === 'un film qui n existe pas') return { results:[] };
        /* Le mode ⌕ normal : la barre cherche un titre. On rend quelque chose,
           sinon la bascule silencieuse ne se voit pas. */
        return { results:[ { id:5551, media_type:'movie', title:'Résultat texte',
                             poster_path:'/t.jpg', release_date:'2010-01-01',
                             vote_average:7, vote_count:800 } ] };
      }
      const tv = /\/tv\b/.test(chemin);
      const lot = Array.from({length:20}, ()=>{ n++;
        const x = { id:900000+n, poster_path:'/p.jpg', backdrop_path:'/b.jpg',
                    vote_average:7.3, vote_count:1500, genre_ids:[28,12],
                    original_language:'en', overview:'.' };
        if(tv){ x.name='Serie '+n; x.first_air_date='2020-01-01'; }
        else  { x.title='Film '+n; x.release_date='2020-01-01'; }
        return x;
      });
      return { results:lot, total_pages:5, total_results:100, page:1 };
    };
    /* Le relais : on observe ce qui part, et on rend ce qu'un modèle correct
       rendrait pour chacune des trois phrases. */
    window.__ia = [];
    window.sbFetch = async (chemin, o2)=>{
      if(chemin !== '/functions/v1/ia') return [];
      const corps = JSON.parse((o2 && o2.body) || '{}');
      window.__ia.push(corps);
      const p = String((corps.params && corps.params.phrase) || '').toLowerCase();
      /* B3 — la phrase qui manquait à l'acceptation : une personne demandée sur
         une famille que TMDB ne sait pas filtrer par personne. */
      if(/s\u00e9rie.*will smith|will smith.*s\u00e9rie/.test(p)) return { mode:'filtres', filtres:{
        famille:'serie', personnes:['Will Smith'] } };
      if(/tout.*will smith/.test(p)) return { mode:'filtres', filtres:{
        personnes:['Will Smith'] } };
      if(/will smith/.test(p)) return { mode:'filtres', filtres:{
        famille:'film', genres:['action'], personnes:['Will Smith'] } };
      if(/john smith/.test(p)) return { mode:'filtres', filtres:{
        famille:'film', personnes:['John Smith'] } };
      if(/courtier/.test(p)) return { mode:'titre', titres:[
        { nom:'Le Loup de Wall Street', annee:2013, media:'film' },
        { nom:'Un Film Qui N Existe Pas', annee:2019, media:'film' },
        { nom:'Blow', annee:2001, media:'film' } ] };
      if(/action et d'aventure|action et daventure|action et d aventure/.test(p))
        return { mode:'filtres', filtres:{
          famille:'film', genres:['action','aventure'], genres_et:true } };
      if(/introuvable/.test(p)) return { mode:'titre', titres:[
        { nom:'Un Film Qui N Existe Pas', annee:2019, media:'film' } ] };
      return { mode:'filtres', filtres:{} };      // rien compris
    };
    db.auth = { token:'x', uid:'moi' };
    db.sync = { url:'https://exemple.supabase.co', key:'cle' };
    partage.suivis = []; partage.abonnes = []; partage.charge = true;
    conseils = { recues:[], envoyees:[], charge:true };
    db.notifLus = {};
    db.gouts.ia = { decouvrir:true, recherche: !(o && o.iaCoupee) };
    window.__pause = ms => new Promise(r=>setTimeout(r, ms));
    /* Taper une phrase en mode ✦ puis valider — le geste exact. */
    window.__taper = async (phrase)=>{
      go('search', {});
      await window.__pause(250);
      const r = etatRech();
      r.envie = !!(typeof iaActive === 'function' && iaActive('recherche'));
      r.q = phrase; r.touche = true;
      await validerRech();
      await window.__pause(900);
    };
  }, opts || {});
}

(async ()=>{
  const nav = await chromium.launch();

  /* ===== ① « je cherche un film d'action avec Will Smith » ================ */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    titre('① « je cherche un film d\'action avec Will Smith »');
    const r = await page.evaluate(async ()=>{
      await __taper('je cherche un film d\'action avec Will Smith');
      const r2 = etatRech();
      const html = document.getElementById('app').innerHTML;
      const grille = window.__tmdb.filter(a => /^\/discover\//.test(a.chemin));
      return { fam:r2.fam, genres:listeRech('genre'), personnes:r2.personnes,
               requetesIA: window.__ia.length,
               tache: (window.__ia[0] || {}).tache,
               pilule: /avec Will Smith/.test(html),
               retirable: /retirerPersonneRech\(2888\)/.test(html),
               withPeople: grille.length ? grille[grille.length-1].params.with_people : null,
               resultats: r2.res.length, champ: r2.q };
    });
    ok(r.requetesIA === 1 && r.tache === 'interpreter_recherche',
       'UNE requête IA, sur `interpreter_recherche` (' + r.requetesIA + ')');
    ok(r.fam === 'film', 'la grille passe sur Films (obtenu : ' + r.fam + ')');
    ok(r.genres.indexOf('Action') >= 0, 'le genre Action est posé (' + r.genres.join(', ') + ')');
    ok(r.personnes.length === 1 && r.personnes[0].id === 2888,
       'Will Smith est résolu sur son id TMDB (' + JSON.stringify(r.personnes) + ')');
    ok(r.pilule && r.retirable, 'sa pilule est visible ET retirable');
    ok(r.withPeople === '2888', 'la requête de la grille porte with_people=2888 (obtenu : ' + r.withPeople + ')');
    ok(r.resultats > 0, 'la grille rend des résultats (' + r.resultats + ')');
    ok(r.champ === '', 'le champ s\'est vidé : l\'envie est devenue des pilules');

    titre('① bis — la pilule se retire, et la grille repart sans la personne');
    const r2 = await page.evaluate(async ()=>{
      retirerPersonneRech(2888);
      await __pause(700);
      const grille = window.__tmdb.filter(a => /^\/discover\//.test(a.chemin));
      return { personnes: etatRech().personnes.length,
               withPeople: grille[grille.length-1].params.with_people || null };
    });
    ok(r2.personnes === 0 && !r2.withPeople,
       'la personne est retirée et `with_people` a disparu de la requête');

    /* ==================================================================
       ① quater — B3 : `with_people` n'existe QUE sur /discover/movie.

       Mesuré par le relecteur du 29/08 : `/discover/tv` n'accepte ni
       `with_people`, ni `with_cast`, ni `with_crew` — TMDB ignore le
       paramètre EN SILENCE. La pilule s'affichait donc sur Tout, Séries et
       Animés sans rien filtrer. Ce cas-ci tient la correction : une personne
       impose la famille Films, et AUCUNE requête de séries ne porte
       `with_people`, quoi qu'ait dit le modèle.
       ================================================================== */
    titre('① quater — une personne impose les Films, et ne part jamais sur /discover/tv');
    for(const cas of [
      { phrase:'je veux une série avec Will Smith',   dit:'serie' },
      { phrase:'montre-moi tout avec Will Smith',       dit:'(rien)' }
    ]){
      const r4 = await page.evaluate(async (phrase)=>{
        window.__tmdb = [];
        /* Le cache de recherche est vidé : sans ça, une signature déjà servie
           plus haut rendrait la grille de mémoire et AUCUNE requête ne partirait
           — on ne mesurerait plus rien. Même précaution que `retour-06.js`. */
        rechCache.length = 0;
        etatRech().fam = 'serie';
        await __taper(phrase);
        const grille = window.__tmdb.filter(a => /^\/discover\//.test(a.chemin));
        return {
          fam: etatRech().fam,
          personnes: etatRech().personnes.length,
          tvAvecGens: grille.filter(a => /^\/discover\/tv/.test(a.chemin) &&
                                         a.params.with_people).length,
          tvTotal: grille.filter(a => /^\/discover\/tv/.test(a.chemin)).length,
          movieAvecGens: grille.filter(a => /^\/discover\/movie/.test(a.chemin) &&
                                            a.params.with_people).length,
          pilule: /avec Will Smith/.test(document.getElementById('app').innerHTML)
        };
      }, cas.phrase);
      ok(r4.fam === 'film',
         '« ' + cas.phrase + ' » (le modèle dit ' + cas.dit + ') → la grille passe sur Films (obtenu : ' + r4.fam + ')');
      ok(r4.tvAvecGens === 0,
         'aucune requête /discover/tv ne porte with_people (' + r4.tvAvecGens + ' sur ' + r4.tvTotal + ')');
      ok(r4.movieAvecGens > 0 && r4.personnes === 1 && r4.pilule,
         'la personne est bien posée, et l\'est sur les films (' + r4.movieAvecGens + ' requêtes)');
    }

    titre('① quinquies — changer de puce retire la personne, et le dit');
    const r5 = await page.evaluate(async ()=>{
      await __taper('je cherche un film d\'action avec Will Smith');
      const avant = etatRech().personnes.length;
      window.__tmdb = [];
      setFamRech('serie');
      await __pause(900);
      const grille = window.__tmdb.filter(a => /^\/discover\//.test(a.chemin));
      return { avant, apres: etatRech().personnes.length,
               pilule: /avec Will Smith/.test(document.getElementById('app').innerHTML),
               tvAvecGens: grille.filter(a => a.params.with_people).length };
    });
    ok(r5.avant === 1 && r5.apres === 0,
       'passer sur Séries retire la personne (' + r5.avant + ' → ' + r5.apres + ')');
    ok(!r5.pilule && r5.tvAvecGens === 0,
       'la pilule disparaît avec elle, et rien ne part avec with_people');

    titre('① sexies — la feuille Filtres montre la personne, et sait la retirer');
    const r6 = await page.evaluate(async ()=>{
      await __taper('je cherche un film d\'action avec Will Smith');
      ouvrirFiltresRech();
      await __pause(300);
      const feuille = document.getElementById('sheetin').innerHTML;
      const section = /Personnes/.test(feuille);
      /* La section est en tête : on l'ouvre et on retire depuis là. */
      ouvrirSectionFiltre('gens');
      await __pause(200);
      const dedans = /Will Smith/.test(document.getElementById('sheetin').innerHTML);
      retirerPersonneFiltreRech(2888);
      await __pause(700);
      return { section, dedans, reste: etatRech().personnes.length };
    });
    ok(r6.section && r6.dedans, 'la feuille Filtres porte une section Personnes qui nomme Will Smith');
    ok(r6.reste === 0, 'et son ✕ la retire (reste : ' + r6.reste + ')');

    titre('① ter — un homonyme ambigu n\'est PAS deviné');
    const r3 = await page.evaluate(async ()=>{
      await __taper('je cherche un film avec John Smith');
      return { personnes: etatRech().personnes.length };
    });
    ok(r3.personnes === 0,
       'deux « John Smith » de popularité voisine : aucun n\'est posé (' + r3.personnes + ')');
    await page.close();
  }

  /* ===== ② la description d'une œuvre ==================================== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    titre('② « je cherche le film où leonardo dicaprio est courtier et se drogue »');
    const r = await page.evaluate(async ()=>{
      await __taper('je cherche le film où leonardo dicaprio est courtier et se drogue');
      const html = document.getElementById('app').innerHTML;
      const c = etatRech().candIA;
      return { carte: /C&#39;est celui-là \?|C'est celui-là \?/.test(html),
               loup: /Le Loup de Wall Street/.test(html),
               liste: c ? c.liste.map(x => x.nom) : [],
               autres: /Sinon, peut-être/.test(html),
               inexistant: /Un Film Qui N Existe Pas/.test(html),
               requetesIA: window.__ia.length };
    });
    ok(r.requetesIA === 1, 'une seule requête IA');
    ok(r.carte && r.loup, 'la carte « C\'est celui-là ? » propose Le Loup de Wall Street');
    ok(r.liste[0] === 'Le Loup de Wall Street',
       'le plus probable est en tête (' + r.liste.join(' · ') + ')');
    ok(!r.inexistant, 'le candidat inventé est jeté, il n\'apparaît nulle part');
    ok(r.autres && r.liste.length === 2, 'les autres candidats sont proposés en petit');

    titre('② bis — un toucher sur la carte ouvre la fiche');
    const r2 = await page.evaluate(async ()=>{
      const b = document.querySelector('.rciac');
      if(!b) return { erreur:'pas de carte' };
      b.click();
      await __pause(500);
      return { vue:view, id:params.id, type:params.type };
    });
    ok(r2.vue === 'preview' && String(r2.id) === '106646',
       'la fiche du Loup de Wall Street s\'ouvre (obtenu : ' + r2.vue + ':' + r2.id + ')');

    titre('② ter — aucun candidat trouvé → bascule silencieuse sur la recherche texte');
    const r3 = await page.evaluate(async ()=>{
      await __taper('un titre introuvable décrit vaguement');
      await __pause(600);
      const html = document.getElementById('app').innerHTML;
      return { envie: etatRech().envie, q: etatRech().q,
               titres: etatRech().qtitres.length,
               erreur: /Pas compris|erreur|Erreur/.test(html) };
    });
    ok(!r3.envie && r3.q === 'un titre introuvable décrit vaguement',
       'le ✦ s\'éteint et la phrase repart en recherche de titre');
    ok(r3.titres > 0 && !r3.erreur, 'des titres sont proposés, et aucune erreur n\'est affichée');
    await page.close();
  }

  /* ===== ③ le ET de genres ============================================== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    titre('③ « je veux un film d\'action et d\'aventure »');
    const r = await page.evaluate(async ()=>{
      await __taper('je veux un film d\'action et d\'aventure');
      const r2 = etatRech();
      const grille = window.__tmdb.filter(a => /^\/discover\/movie/.test(a.chemin));
      const html = document.getElementById('app').innerHTML;
      return { genres:listeRech('genre'), et:!!r2.genreEt, fam:r2.fam,
               withGenres: grille.length ? grille[grille.length-1].params.with_genres : '',
               total:r2.total, compteur: texteCompteurGrilleRech(),
               /* La pilule écrit les genres en minuscules et affiche « ET » quand
                  le réglage « Les deux » est basculé : c'est le SIGNE VISIBLE
                  que le lot demande, « l'utilisateur le voit basculé ». */
               phrase: /action ET aventure/.test(html),
               requetesIA: window.__ia.length };
    });
    ok(r.requetesIA === 1, 'une seule requête IA');
    ok(r.fam === 'film' && r.genres.indexOf('Action') >= 0 && r.genres.indexOf('Aventure') >= 0,
       'Action ET Aventure sont posés (' + r.genres.join(', ') + ')');
    ok(r.et === true, 'le réglage « Les deux » est basculé');
    ok(/28/.test(r.withGenres) && /12/.test(r.withGenres) && r.withGenres.indexOf(',') >= 0,
       'la requête demande bien le ET (virgules) : with_genres=' + r.withGenres);
    ok(r.total > 0 && !/\b0 résultat/.test(r.compteur),
       'le compteur est cohérent : « ' + r.compteur + ' »');
    ok(r.phrase, 'la pilule dit « action ET aventure » — le réglage se VOIT basculé');

    titre('③ bis — la même phrase revalidée ne repaie pas la requête (cache de session)');
    const r2 = await page.evaluate(async ()=>{
      const avant = window.__ia.length;
      await __taper('je veux un film d\'action et d\'aventure');
      return { avant, apres: window.__ia.length };
    });
    ok(r2.apres === r2.avant, 'zéro requête IA de plus (' + r2.avant + ' → ' + r2.apres + ')');
    await page.close();
  }

  /* ===== ④ IA coupée ==================================================== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, { iaCoupee:true });
    titre('④ IA de la Recherche coupée : les trois phrases, sans erreur visible');
    const PHRASES = [
      'je cherche un film d\'action avec Will Smith',
      'je cherche le film où leonardo dicaprio est courtier et se drogue',
      'je veux un film d\'action et d\'aventure'
    ];
    for(const p of PHRASES){
      const r = await page.evaluate(async (phrase)=>{
        window.__ia = [];
        await __taper(phrase);
        const html = document.getElementById('app').innerHTML;
        return { requetesIA: window.__ia.length, envie: etatRech().envie,
                 titres: etatRech().qtitres.length,
                 bouton: /class="qia/.test(html),
                 erreur: /Erreur|erreur technique|indisponible/.test(html) };
      }, p);
      ok(r.requetesIA === 0, '« ' + p.slice(0, 28) + '… » : aucune requête IA');
      ok(!r.envie && !r.bouton, 'le ✦ n\'est même pas proposé — la barre est celle d\'aujourd\'hui');
      ok(r.titres > 0 && !r.erreur, 'la recherche de titre répond, sans erreur visible');
    }
    await page.close();
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
