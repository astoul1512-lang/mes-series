/* ---------------------------------------------------------------------------
   RETOUR-14 — L'ENVIE FLOUE QUI S'AFFINE PAR LE DIALOGUE

       cd <depot> && python3 -m http.server 8099 &
       node tests/retour-14.js

   L'acceptation du lot, c'est DEUX PHRASES d'Adrien, écrites exactement comme
   il les a écrites, et un parcours : on tape, des titres s'affichent, PUIS une
   question arrive ; on répond trois fois ; les titres ne sont plus les mêmes.

     ① « je sais pas trop, un truc qui me fasse du bien »
     ② « un petit film cool sans prise de tête »

   LE RELAIS EST BOUCHONNÉ, pas le raisonnement. Il rend ce qu'un modèle
   correct rendrait à chaque étape, et tout ce qui suit — la résolution sur
   TMDB, le tamis, les plafonds, les deux caches, le rendu — est le vrai code du
   dépôt. TMDB est bouchonné aussi, avec DEUX TITRES QUI N'EXISTENT PAS : c'est
   là que se joue « introuvable → jeté, silencieusement, et compté ».

   CE QUE CETTE SUITE NE PEUT PAS PROUVER, ET IL FAUT LE LIRE AVANT DE LA CROIRE
   VERTE. Elle prouve que les titres CHANGENT quand le bouchon les change — donc
   que la plomberie repeint, que le cache ne sert pas une étape périmée, et que
   `deja` part bien au relais. Elle ne prouve PAS qu'un vrai modèle déplacera
   ses titres au lieu de rendre un sous-ensemble : ça ne se lit que sur l'écran
   réel, après déploiement. Le cas ③ vérifie donc la seule chose vérifiable
   ici — que la CONSIGNE de renouvellement part — et le reste est un parcours de
   PR, pas une assertion.
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
    /* ---- LE CATALOGUE TMDB. Un titre absent d'ici est INTROUVABLE, et c'est
       la moitié de ce qu'on éprouve : le modèle a le droit de se tromper, l'app
       n'a pas le droit d'afficher ce que TMDB ne connaît pas. ---- */
    const CAT = {};
    const poser = (nom, id, media, extra) => {
      CAT[nom.toLowerCase()] = Object.assign({ id:id, media:media, nom:nom }, extra || {});
    };
    /* Étape 0 */
    poser('CODA', 776503, 'movie');
    poser('Paddington 2', 346648, 'movie');
    poser('Little Miss Sunshine', 773, 'movie');
    poser('Le Grand Bain', 489999, 'movie');
    poser('Intouchables', 77338, 'movie');
    poser('Chef', 212778, 'movie');
    /* Étape 1 — des titres NEUFS, c'est tout l'intérêt de répondre */
    poser('Billy Elliot', 423, 'movie');
    poser('Green Book', 490132, 'movie');
    poser('Ted Lasso', 97546, 'tv');
    /* Étape 2 */
    poser('Marcel the Shell with Shoes On', 758330, 'movie');
    poser('La Famille Bélier', 244534, 'movie');
    poser('Past Lives', 666277, 'movie');
    /* Étape 3 */
    poser('Brooklyn', 167073, 'movie');
    poser('Nos années', 300001, 'movie');
    /* ② des registres VARIÉS : un casse, un espionnage drôle, une comédie
       néo-zélandaise. Aucun n'est « une comédie », tous sont la demande. */
    poser('Ocean’s Eleven', 161, 'movie');
    poser('Kingsman : Services secrets', 207703, 'movie');
    poser('Hunt for the Wilderpeople', 324670, 'movie');
    poser('Les Goonies', 9340, 'movie');
    /* Le tamis : celui-ci est DÉJÀ VU, celui-là est « pas pour moi ». Les deux
       sont nommés par le modèle et ne doivent JAMAIS atteindre l'écran. */
    poser('Le Fabuleux Destin d’Amélie Poulain', 194, 'movie');
    poser('Forrest Gump', 13, 'movie');
    /* Un animé, pour que le cadre de la famille ait quelque chose à écarter. */
    poser('Your Name', 372058, 'movie', { langue:'ja', genre_ids:[16] });

    window.__tmdb = [];
    window.tmdb = async (chemin, params)=>{
      window.__tmdb.push({ chemin:chemin, params:Object.assign({}, params || {}) });
      if(/\/genre\/movie/.test(chemin)) return { genres:[
        {id:28,name:'Action'},{id:12,name:'Aventure'},{id:35,name:'Comédie'},
        {id:18,name:'Drame'},{id:16,name:'Animation'},{id:27,name:'Horreur'}] };
      if(/\/genre\/tv/.test(chemin)) return { genres:[
        {id:10759,name:'Action & Adventure'},{id:18,name:'Drame'},{id:16,name:'Animation'},
        {id:35,name:'Comédie'}] };
      const m = /^\/search\/(movie|tv)$/.exec(chemin);
      if(m){
        const media = m[1];
        const q = String((params && params.query) || '').toLowerCase();
        const x = CAT[q];
        /* Le média demandé doit correspondre : un film cherché sur `/search/tv`
           ne se trouve pas, et c'est le comportement réel de TMDB. */
        if(!x || x.media !== media) return { results:[] };
        const o = { id:x.id, poster_path:'/p'+x.id+'.jpg', backdrop_path:'/b.jpg',
                    vote_average:7.6, vote_count:1800,
                    genre_ids:x.genre_ids || [18], original_language:x.langue || 'en' };
        if(media === 'tv'){ o.name = x.nom; o.original_name = x.nom;
                            o.first_air_date = '2020-01-01'; }
        else { o.title = x.nom; o.original_title = x.nom; o.release_date = '2015-01-01'; }
        return { results:[o] };
      }
      if(/^\/search\/multi$/.test(chemin))
        return { results:[ { id:5551, media_type:'movie', title:'Résultat texte',
                             poster_path:'/t.jpg', release_date:'2010-01-01',
                             vote_average:7, vote_count:800 } ] };
      if(/^\/search\/person$/.test(chemin)) return { results:[] };
      /* La grille de fouille, si jamais quelque chose la réveille. */
      let n = 0;
      const lot = Array.from({length:20}, ()=>{ n++;
        return { id:900000+n, title:'Film '+n, name:'Serie '+n, poster_path:'/p.jpg',
                 release_date:'2020-01-01', first_air_date:'2020-01-01',
                 vote_average:7.3, vote_count:1500, genre_ids:[18],
                 original_language:'en' }; });
      return { results:lot, total_pages:5, total_results:100, page:1 };
    };

    /* ---- LE RELAIS. Les étapes sont servies PAR LE NOMBRE DE RÉPONSES reçues :
       c'est ainsi qu'un modèle se comporte, et ça permet au test de vérifier
       que `reponses` part vraiment (sinon toutes les étapes seraient la 0). ---- */
    const T = (nom, media) => ({ nom:nom, annee:2015, media: media || 'film' });
    const ETAPES = [
      { titres:['CODA','Paddington 2','Little Miss Sunshine','Le Grand Bain',
                'Intouchables','Chef',
                /* Les deux que TMDB ne connaît pas : jetés, silencieusement. */
                'Un Film Qui N Existe Pas','Une Serie Inventee',
                /* Les deux que le TAMIS doit retirer. */
                'Le Fabuleux Destin d’Amélie Poulain','Forrest Gump'],
        q:{ texte:'Du bien comment ?',
            options:['Qui réchauffe','Qui fait rire','Qui épate','Qui apaise'] } },
      { titres:['CODA','Intouchables','Billy Elliot','Green Book','Ted Lasso','Chef'],
        q:{ texte:'Tu veux rester léger, ou être un peu remué ?',
            options:['Rester léger','Un peu remué','Carrément remué'] } },
      { titres:['Billy Elliot','Green Book','Marcel the Shell with Shoes On',
                'La Famille Bélier','Past Lives','CODA'],
        q:{ texte:'Tu regardes seul ou accompagné ?',
            options:['Seul','À deux','En famille'] } },
      { titres:['Green Book','Past Lives','Brooklyn','Nos années','CODA','Billy Elliot'],
        /* Le modèle s'arrête de lui-même : « Je crois t'avoir cerné ». */
        q:null, fini:true }
    ];
    /* ② Registres variés, et PAS UNE SEULE fois le mot « comédie ». */
    const COOL = {
      titres:['Ocean’s Eleven','Kingsman : Services secrets',
              'Hunt for the Wilderpeople','Les Goonies','Chef','Paddington 2'],
      q:{ texte:'Plutôt malin, ou plutôt bête et joyeux ?',
          options:['Malin','Bête et joyeux','Les deux'] }
    };

    window.__ia = [];
    window.sbFetch = async (chemin, o2)=>{
      if(chemin !== '/functions/v1/ia') return [];
      const corps = JSON.parse((o2 && o2.body) || '{}');
      window.__ia.push(corps);
      if(corps.tache !== 'envie_dialogue') return { indisponible:true };
      const p = corps.params || {};
      const n = (p.reponses || []).length;
      /* Le bouchon « questions sans fin » : il en propose TOUJOURS une, pour que
         les plafonds du client soient les seuls à pouvoir arrêter le dialogue.
         Sans ça on vérifierait la politesse du modèle, pas la borne du code. */
      if(o.sansFin) return {
        titres:[T('CODA'), T('Chef'), T('Green Book')],
        question:{ texte:'Encore une question numéro ' + (n + 1) + ' ?',
                   options:['Oui ' + n, 'Non ' + n] } };
      if(/prise de t/i.test(String(p.phrase || '')))
        return { titres:COOL.titres.map(x => T(x)), question:COOL.q };
      const e = ETAPES[Math.min(n, ETAPES.length - 1)];
      const out = { titres:e.titres.map(x => T(x, /Ted Lasso/.test(x) ? 'serie' : 'film')) };
      if(e.q) out.question = e.q; else out.fini = true;
      return out;
    };

    db.auth = { token:'x', uid:'moi' };
    db.sync = { url:'https://exemple.supabase.co', key:'cle' };
    partage.suivis = []; partage.abonnes = []; partage.charge = true;
    conseils = { recues:[], envoyees:[], charge:true };
    db.notifLus = {};
    db.gouts.ia = { decouvrir:true, recherche: !o.iaCoupee };
    db.gouts.exclus = [];
    /* LE TAMIS A DE QUOI MORDRE. Sans ces deux lignes, le cas ⑥ passerait sans
       rien prouver : un tamis qui n'a rien à retirer ne dit pas qu'il tamise. */
    db.movies = db.movies || {};
    db.movies[194] = { id:194, title:'Le Fabuleux Destin d’Amélie Poulain',
                       seen:true, watchedAt:1, addedAt:1, poster:'/a.jpg',
                       genres:['Drame'], date:'2001-01-01' };
    db.gouts.pasPourMoi = { 'movie:13': Date.now() };

    window.__pause = ms => new Promise(r=>setTimeout(r, ms));
    /* Taper une phrase en mode ✦ puis valider — le geste exact de la maquette.

       LE `render()` N'EST PAS DÉCORATIF, et c'est une capture d'écran qui l'a
       appris. Sans lui, l'en-tête gardait la barre peinte à l'arrivée sur
       l'écran — grise, vide, bouton ✦ éteint — pendant qu'un dialogue tournait
       dessous. Tous les cas passaient : ils lisaient `#rres`, et la barre vit
       dans le `sub` du `<header>`, que `peindreRech` ne réécrit jamais.
       On reproduit donc ce que `basculerEnvieRech` fait vraiment : poser le
       mode, REPEINDRE L'ÉCRAN ENTIER (c'est la peau du champ qui change), puis
       valider. Un décor qui ne reproduit pas le geste ne prouve rien du geste. */
    window.__taper = async (phrase)=>{
      go('search', {});
      await window.__pause(250);
      const r = etatRech();
      r.envie = !!(typeof iaActive === 'function' && iaActive('recherche'));
      r.q = phrase; r.touche = true;
      render();
      await validerRech();
      await window.__pause(400);
    };
    /* L'état RÉEL de la barre, lu sur le DOM. */
    window.__barre = ()=>{
      const b = document.querySelector('.qbar');
      const i = document.getElementById('q');
      return { violette:!!(b && b.classList.contains('qiaon')),
               allume:!!document.querySelector('.qia.on'),
               valeur:i ? i.value : null,
               cherche:!!(b && b.classList.contains('qcherche')) };
    };
    /* Les titres RÉELLEMENT À L'ÉCRAN, lus sur le DOM peint et pas en mémoire :
       c'est l'acceptation « vérifié titre par titre », et le moteur peut avoir
       raison pendant que la vue se trompe (c'est déjà arrivé, lot D). */
    window.__titresEcran = ()=> [...document.querySelectorAll('#rres .rang3 .jqnom')]
      .map(e => e.textContent.trim());
    window.__question = ()=>{
      const q = document.querySelector('#rres .nvqt');
      return q ? q.textContent.trim() : null;
    };
    window.__options = ()=> [...document.querySelectorAll('#rres .nvopts .nvopt')]
      .map(e => e.textContent.trim());
    window.__fil = ()=> [...document.querySelectorAll('#rres .nvfil .nvrep')]
      .map(e => ({ q:e.querySelector('.nvrepq').textContent.trim(),
                   r:e.querySelector('.nvrepv').textContent.trim() }));
  }, opts || {});
}

/* Toucher une option et attendre que l'écran ait bougé. On attend la QUESTION
   suivante (ou la fin), jamais un délai fixe : un `pause(500)` qui suffit sur
   cette machine ne suffira pas sur une autre, et le test deviendrait un
   générateur d'échecs intermittents (leçon du 01/09 sur le lot D). */
async function repondre(page, libelle){
  const avant = await page.evaluate(()=> __question());
  await page.click('#rres .nvopts .nvopt' +
    (libelle ? ':text-is("' + libelle + '")' : ':first-child'));
  await page.waitForFunction((a)=>{
    const q = __question();
    return q !== a || !!document.querySelector('#rres .nvfini');
  }, avant, { timeout:9000 });
  await page.evaluate(()=> __pause(120));
}

(async ()=>{
  const nav = await chromium.launch();

  /* ===== ① LES TITRES D'ABORD, LA QUESTION ENSUITE ======================= */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, {});
    titre('① « je sais pas trop, un truc qui me fasse du bien »');
    const r0 = await page.evaluate(async ()=>{
      await __taper('je sais pas trop, un truc qui me fasse du bien');
      return { titres:__titresEcran(), question:__question(), options:__options(),
               requetes:window.__ia.length, tache:(window.__ia[0] || {}).tache,
               barre:__barre(),
               compteur:(document.querySelector('#rgenvie') || {}).textContent || '' };
    });
    ok(r0.requetes === 1 && r0.tache === 'envie_dialogue',
       'UNE requête IA, sur `envie_dialogue` (' + r0.requetes + ', ' + r0.tache + ')');
    /* LA PROMESSE DU LOT : des titres AVANT toute question. */
    ok(r0.titres.length > 0,
       'des titres sont affichés dès la première réponse (' + r0.titres.length + ')');
    ok(!!r0.question, 'une question est posée : « ' + r0.question + ' »');
    ok(r0.options.length === 5,
       'quatre réponses d\'un toucher, plus la réponse libre (' + r0.options.length + ')');
    ok(r0.options[r0.options.length - 1] === 'Autre chose…',
       'la dernière option est la réponse libre (' + r0.options.slice(-1) + ')');
    ok(/d’après ton envie/.test(r0.compteur),
       'le compteur dit d\'où viennent les titres : « ' + r0.compteur.trim() + ' »');
    /* LA BARRE PENDANT LE DIALOGUE — ajouté après avoir REGARDÉ la capture.
       Vingt cas passaient au vert au-dessus d'une barre grise et vide, parce
       qu'ils lisaient tous `#rres` et que la barre vit dans l'en-tête. « La
       COULEUR est le mode » (RETOUR-01 point 6) : une barre grise au-dessus
       d'un dialogue dit que le ✦ est éteint, c'est-à-dire l'inverse du vrai. */
    ok(r0.barre.violette && r0.barre.allume,
       'la barre reste en mode ✦ pendant le dialogue');
    ok(r0.barre.valeur === 'je sais pas trop, un truc qui me fasse du bien',
       'la phrase reste visible dans le champ : « ' + r0.barre.valeur + ' »');
    ok(!r0.barre.cherche, 'le liseré d\'attente s\'éteint quand la réponse est arrivée');

    /* La capture de l'ÉTAPE 1 — c'est celle qui montre le lot : le fil, la
       question en cours, et la grille sous elle. La capture finale ne montre
       que l'arrivée. */
    await page.screenshot({ path:'tests/retour-14-etape1.png' });

    /* --- TROIS RÉPONSES PLUS TARD, LES TITRES NE SONT PLUS LES MÊMES --- */
    await repondre(page, 'Qui réchauffe');
    const r1 = await page.evaluate(()=> ({ titres:__titresEcran(), q:__question() }));
    await page.screenshot({ path:'tests/retour-14-etape2.png' });
    await repondre(page, 'Rester léger');
    await repondre(page, 'À deux');
    const r3 = await page.evaluate(()=> ({
      titres:__titresEcran(), q:__question(), fil:__fil(),
      fini:(document.querySelector('#rres .nvfini') || {}).textContent || '',
      requetes:window.__ia.length,
      /* Ce qui est VRAIMENT parti au relais à la dernière étape. */
      dernier:window.__ia[window.__ia.length - 1].params }));

    const communs = r3.titres.filter(t => r0.titres.indexOf(t) >= 0);
    ok(r3.titres.join('|') !== r0.titres.join('|'),
       'la grille a changé, titre par titre');
    /* ET SURTOUT : elle a changé en se DÉPLAÇANT, pas en se vidant. Un
       sous-ensemble du départ serait l'écran que le retour refuse. */
    ok(r3.titres.some(t => r0.titres.indexOf(t) < 0),
       'des titres NEUFS sont apparus : ' +
       r3.titres.filter(t => r0.titres.indexOf(t) < 0).join(', '));
    ok(communs.length < r0.titres.length,
       'la grille ne s\'est pas contentée de rétrécir (' + communs.length +
       ' communs sur ' + r0.titres.length + ')');
    ok(r1.titres.join('|') !== r0.titres.join('|') &&
       r1.titres.join('|') !== r3.titres.join('|'),
       'chaque étape a sa propre grille, pas seulement la première et la dernière');

    /* Le fil est à l'écran, avec les trois questions ET les trois réponses. */
    ok(r3.fil.length === 3,
       'le fil des trois réponses reste à l\'écran (' + r3.fil.length + ')');
    ok(r3.fil[0].r === 'Qui réchauffe' && r3.fil[2].r === 'À deux',
       'le fil garde les réponses dans l\'ordre (' + r3.fil.map(x=>x.r).join(' / ') + ')');
    ok(/Du bien comment/.test(r3.fil[0].q),
       'chaque réponse garde SA question : « Seul » ne veut rien dire sans elle');
    ok(/cerné/.test(r3.fini),
       'le modèle s\'arrête de lui-même et le dit : « ' + r3.fini.trim() + ' »');
    ok(!r3.q, 'plus de question une fois le dialogue fini');
    ok(r3.requetes === 4,
       'quatre appels pour quatre étapes, pas un de plus (' + r3.requetes + ')');

    /* ③ LA CONSIGNE DE RENOUVELLEMENT EST VRAIMENT PARTIE. C'est la seule chose
       que ce harnais peut prouver du « les titres changent » : que le modèle a
       reçu de quoi le faire. */
    ok(Array.isArray(r3.dernier.deja) && r3.dernier.deja.length > 0,
       'les titres déjà à l\'écran repartent au relais (' +
       (r3.dernier.deja || []).length + ')');
    ok((r3.dernier.reponses || []).length === 3,
       'le fil des réponses repart au relais (' + (r3.dernier.reponses || []).length + ')');
    ok(r3.dernier.phrase === 'je sais pas trop, un truc qui me fasse du bien',
       'la phrase repart TELLE QU\'ELLE A ÉTÉ ÉCRITE : « ' + r3.dernier.phrase + ' »');

    await page.screenshot({ path:'tests/retour-14-dialogue.png' });
    await page.close();
  }

  /* ===== ② PAS UNE SEULE CATÉGORIE À L'ÉCRAN ============================= */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, {});
    titre('② « un petit film cool sans prise de tête » — aucune catégorie nulle part');
    const r = await page.evaluate(async ()=>{
      await __taper('un petit film cool sans prise de tête');
      return { texte:document.getElementById('app').textContent,
               titres:__titresEcran(), question:__question(), options:__options(),
               champ:etatRech().q };
    });
    /* LE CONSTAT D'ADRIEN, RETOURNÉ EN ASSERTION : sa phrase devenait
       « comédie ». Le mot ne doit apparaître NULLE PART — ni dans un intitulé,
       ni dans une pilule, ni dans la question. */
    ok(!/comédie/i.test(r.texte), 'le mot « comédie » n\'est nulle part à l\'écran');
    ok(!/genre/i.test(r.question || ''), 'la question ne parle pas de genre');
    ok(!/comédie|drame|action|aventure/i.test((r.options || []).join(' ')),
       'aucune réponse proposée n\'est un genre (' + (r.options || []).join(', ') + ')');
    ok(r.champ === 'un petit film cool sans prise de tête',
       'la phrase reste SA phrase, dans la barre : « ' + r.champ + ' »');
    /* Des registres variés : un casse, un espionnage, une comédie
       néo-zélandaise, un film d'aventure pour enfants. Aucun n'est « une
       comédie », tous sont exactement la demande. */
    ok(r.titres.length >= 4, 'plusieurs titres de registres variés (' +
       r.titres.join(', ') + ')');
    ok(r.titres.some(t => /Ocean/.test(t)) && r.titres.some(t => /Kingsman/.test(t)),
       'les titres que citait le retour sont bien proposables');
    await page.close();
  }

  /* ===== ③ « ÇA ME VA » COUPE COURT, À CHAQUE ÉTAPE ====================== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, {});
    titre('③ « Ça me va, montre-moi » coupe court — et sans appel de plus');
    const avant = await page.evaluate(async ()=>{
      await __taper('je sais pas trop, un truc qui me fasse du bien');
      return { bouton:!!document.querySelector('#rres .nvassez'),
               titres:__titresEcran(), requetes:window.__ia.length };
    });
    ok(avant.bouton, '« Ça me va » est présent dès la première étape');
    await page.click('#rres .nvassez');
    await page.waitForFunction(()=> !!document.querySelector('#rres .nvfini'),
                               null, { timeout:9000 });
    const apres = await page.evaluate(()=> ({
      question:__question(), titres:__titresEcran(), requetes:window.__ia.length,
      fini:(document.querySelector('#rres .nvfini') || {}).textContent || '' }));
    ok(!apres.question, 'la question disparaît immédiatement');
    ok(apres.requetes === avant.requetes,
       'couper court ne coûte AUCUN appel (' + avant.requetes + ' → ' + apres.requetes + ')');
    ok(apres.titres.join('|') === avant.titres.join('|'),
       'la grille reste celle qu\'on venait d\'accepter');
    ok(/noté/.test(apres.fini) && !/cerné/.test(apres.fini),
       'l\'écran dit « c\'est noté » et NON « je t\'ai cerné » : ' +
       'on vient de refuser de répondre (' + apres.fini.trim() + ')');
    /* Et il reste présent à chaque étape, pas seulement à la première. */
    const r2 = await page.evaluate(async ()=>{
      await __taper('je sais pas trop, un truc qui me fasse du bien');
      return 1;
    });
    await repondre(page, 'Qui réchauffe');
    ok(await page.evaluate(()=> !!document.querySelector('#rres .nvassez')),
       '« Ça me va » est encore là à la deuxième étape');
    await page.close();
  }

  /* ===== ③bis LA RÉPONSE LIBRE — « si aucune proposition ne parle, on écrit » */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, {});
    titre('③bis « Autre chose… » ouvre le clavier, et n\'appelle rien avant la validation');
    await page.evaluate(async ()=>
      await __taper('je sais pas trop, un truc qui me fasse du bien'));
    const avant = await page.evaluate(()=> window.__ia.length);
    await page.click('#rres .nvopt.nvlibre');
    await page.waitForSelector('#nvlibre', { timeout:9000 });
    const ouvert = await page.evaluate(()=> ({
      champ:!!document.getElementById('nvlibre'),
      focus:document.activeElement && document.activeElement.id === 'nvlibre',
      options:__options().length, assez:!!document.querySelector('#rres .nvassez'),
      question:__question(), requetes:window.__ia.length }));
    ok(ouvert.champ && ouvert.focus, 'le champ libre s\'ouvre et prend le curseur');
    ok(ouvert.question === 'Du bien comment ?',
       'la question reste lisible au-dessus du champ');
    ok(ouvert.options === 0,
       'le champ REMPLACE les options, il ne s\'y ajoute pas (' + ouvert.options + ')');
    ok(ouvert.assez, '« Ça me va » reste accessible depuis le champ libre');
    ok(ouvert.requetes === avant,
       'ouvrir le clavier n\'appelle rien (' + avant + ' → ' + ouvert.requetes + ')');

    /* RB-1 — JAMAIS D'APPEL IA PENDANT LA FRAPPE. On tape vraiment, touche par
       touche, et on regarde le relais : c'est le même invariant que la barre
       principale, sur un champ qui n'existait pas quand il a été écrit. */
    await page.fill('#nvlibre', '');
    await page.type('#nvlibre', 'quelque chose de doux', { delay:12 });
    const pendant = await page.evaluate(()=> window.__ia.length);
    ok(pendant === avant,
       'la frappe n\'a réveillé aucun appel : la règle RB-1 tient (' + pendant + ')');

    await page.press('#nvlibre', 'Enter');
    await page.waitForFunction(()=> __fil().length === 1, null, { timeout:9000 });
    const apres = await page.evaluate(()=> ({
      fil:__fil(), requetes:window.__ia.length,
      /* Ce que le relais a VRAIMENT reçu comme réponse libre. */
      recu:(window.__ia[window.__ia.length - 1].params.reponses || []).slice(-1)[0],
      champ:!!document.getElementById('nvlibre') }));
    ok(apres.requetes === avant + 1,
       'la validation part UNE fois (' + avant + ' → ' + apres.requetes + ')');
    ok(apres.fil.length === 1 && apres.fil[0].r === 'quelque chose de doux',
       'la réponse écrite entre dans le fil : « ' + apres.fil[0].r + ' »');
    ok(apres.fil[0].q === 'Du bien comment ?',
       'elle y garde SA question (' + apres.fil[0].q + ')');
    ok(apres.recu && apres.recu.r === 'quelque chose de doux',
       'et elle part au relais telle quelle');
    ok(!apres.champ, 'le champ libre se referme une fois répondu');
    await page.close();
  }

  /* ===== ③ter LE TEXTE DU MODÈLE EST NON SÛR (règle S3 du 09/08) ========= */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, {});
    titre('③ter Une question et des options hostiles ne cassent ni l\'écran ni l\'appel');
    const r = await page.evaluate(async ()=>{
      /* Une apostrophe (le bug des acteurs du 09/08, au même endroit), un
         chevron, et un guillemet : les trois formes qui cassent soit le HTML,
         soit le `onclick`, soit les deux. */
      const PIEGE = 'L’option d\'Adrien <b>x</b> "y"';
      window.sbFetch = async (chemin, o2)=>{
        const corps = JSON.parse((o2 && o2.body) || '{}');
        window.__ia.push(corps);
        return { titres:[{ nom:'CODA', annee:2015, media:'film' }],
                 question:{ texte:'Une <i>question</i> d\'Adrien ?',
                            options:[PIEGE, 'Sage'] } };
      };
      await __taper('une envie piégée');
      return { options:__options(), question:__question(),
               gras:document.querySelectorAll('#rres .nvopts b, #rres .nvqt i').length,
               piege:PIEGE };
    });
    ok(r.gras === 0, 'aucune balise du modèle n\'a été interprétée (' + r.gras + ')');
    ok(r.options[0] === r.piege,
       'le texte hostile s\'affiche tel quel, échappé : « ' + r.options[0] + ' »');
    ok(/<i>question<\/i>/.test(r.question || ''),
       'la question aussi est échappée : « ' + r.question + ' »');
    /* ET LE GESTE MARCHE ENCORE : `escJs` est la moitié qui compte. Une option
       qu'on ne peut pas toucher serait un écran mort, pas un écran sûr. */
    await page.click('#rres .nvopts .nvopt:first-child');
    await page.waitForFunction(()=> __fil().length === 1, null, { timeout:9000 });
    const apres = await page.evaluate(()=> ({ fil:__fil(),
      recu:(window.__ia[window.__ia.length - 1].params.reponses || []).slice(-1)[0] }));
    ok(apres.fil.length === 1 && apres.fil[0].r === r.piege,
       'toucher l\'option piégée répond la bonne valeur, apostrophe comprise');
    ok(apres.recu && apres.recu.r === r.piege, 'et c\'est bien elle qui part au relais');
    await page.close();
  }

  /* ===== ④ ROUVRIR UNE RÉPONSE — ET LE CACHE ============================= */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, {});
    titre('④ Rouvrir une réponse oublie les suivantes, et l\'aller-retour est gratuit');
    await page.evaluate(async ()=>
      await __taper('je sais pas trop, un truc qui me fasse du bien'));
    await repondre(page, 'Qui réchauffe');
    const etape1 = await page.evaluate(()=> ({ titres:__titresEcran(), q:__question() }));
    await repondre(page, 'Rester léger');
    await repondre(page, 'À deux');
    const avant = await page.evaluate(()=> ({ fil:__fil().length,
                                              requetes:window.__ia.length }));
    ok(avant.fil === 3, 'trois réponses dans le fil avant de rouvrir');

    /* On rouvre la DEUXIÈME réponse (index 1) : la troisième doit être oubliée,
       et on doit se retrouver devant la question n° 2. */
    await page.click('#rres .nvfil .nvrep:nth-child(2)');
    await page.waitForFunction(()=> __fil().length === 1, null, { timeout:9000 });
    await page.evaluate(()=> __pause(150));
    const apres = await page.evaluate(()=> ({
      fil:__fil(), q:__question(), titres:__titresEcran(),
      requetes:window.__ia.length }));
    ok(apres.fil.length === 1,
       'les réponses suivantes sont oubliées (' + apres.fil.length + ' reste)');
    ok(apres.fil[0].r === 'Qui réchauffe',
       'la première réponse, elle, est conservée (' + apres.fil[0].r + ')');
    ok(apres.q === etape1.q,
       'on est revenu devant CETTE question-là : « ' + apres.q + ' »');
    /* LE CACHE PAR SIGNATURE, et c'est le cas que la spec demande de vérifier :
       « revenir en arrière puis refaire le même choix ne redemande rien ». */
    ok(apres.requetes === avant.requetes,
       'rouvrir ne coûte AUCUN appel — le cache a servi (' +
       avant.requetes + ' → ' + apres.requetes + ')');
    ok(apres.titres.join('|') === etape1.titres.join('|'),
       'la grille recalculée est EXACTEMENT celle de cette étape');
    /* Et refaire le même choix ne redemande rien non plus. */
    await repondre(page, 'Rester léger');
    const refait = await page.evaluate(()=> ({ requetes:window.__ia.length,
                                               fil:__fil().length }));
    ok(refait.requetes === avant.requetes,
       'refaire le même choix ne redemande rien (' + refait.requetes + ')');
    ok(refait.fil === 2, 'et le fil repart de deux réponses (' + refait.fil + ')');
    await page.close();
  }

  /* ===== ⑤ LES DEUX PLAFONDS, ÉPROUVÉS PAR UN BOUCHON QUI LES DÉPASSE ==== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    /* `sansFin` : le relais propose TOUJOURS une question de plus. Si les
       plafonds n'étaient pas tenus CHEZ NOUS, ce dialogue ne s'arrêterait
       jamais — et c'est exactement la forme du défaut du 13/09, où la borne
       était écrite mais qu'aucun cas ne pouvait atteindre. */
    await decor(page, { sansFin:true });
    titre('⑤ Jamais plus de 5 questions ni 6 appels, même si le modèle en propose sans fin');
    await page.evaluate(async ()=> await __taper('une envie sans fin'));
    let tours = 0;
    while(await page.evaluate(()=> !!__question()) && tours < 12){
      await repondre(page, null);
      tours++;
    }
    const r = await page.evaluate(()=> ({
      fil:__fil().length, requetes:window.__ia.length, q:__question(),
      taches:window.__ia.map(x => x.tache).filter(t => t !== 'envie_dialogue'),
      titres:__titresEcran().length,
      fini:(document.querySelector('#rres .nvfini') || {}).textContent || '' }));
    ok(r.requetes <= 6, 'six appels IA au maximum (obtenu : ' + r.requetes + ')');
    ok(r.fil <= 5, 'cinq questions au maximum (obtenu : ' + r.fil + ')');
    ok(!r.q, 'le dialogue s\'est bien arrêté — aucune question en cul-de-sac');
    ok(r.titres > 0, 'et on SERT CE QU\'ON A : la grille est toujours là');
    ok(!r.taches.length, 'aucune autre tâche IA n\'a été appelée');
    ok(tours < 12, 'la boucle s\'est arrêtée d\'elle-même (' + tours + ' réponses)');
    await page.close();
  }

  /* ===== ⑥ CHAQUE TITRE EXISTE, ET LE TAMIS A MORDU ====================== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, {});
    titre('⑥ Chaque titre existe sur TMDB ; aucun déjà vu, écarté ou « pas pour moi »');
    const r = await page.evaluate(async ()=>{
      await __taper('je sais pas trop, un truc qui me fasse du bien');
      const D = etatRech().envieD;
      return { titres:__titresEcran(),
               ids:D.titres.map(x => x.__media + ':' + x.id),
               mesures:D.mesures, jetes:(D.jetes || []).map(x => x.nom),
               recherches:window.__tmdb.filter(a => /^\/search\/(movie|tv)$/.test(a.chemin)).length };
    });
    ok(r.titres.indexOf('Un Film Qui N Existe Pas') < 0 &&
       !r.titres.some(t => /Inventee/.test(t)),
       'les titres que TMDB ne connaît pas ne sont PAS à l\'écran');
    ok(r.jetes.length === 2,
       'et ils sont COMPTÉS, pas seulement jetés (' + r.jetes.join(', ') + ')');
    ok(!r.titres.some(t => /Amélie Poulain/.test(t)),
       'un titre DÉJÀ VU n\'atteint pas l\'écran');
    ok(!r.titres.some(t => /Forrest Gump/.test(t)),
       'un titre « pas pour moi » n\'atteint pas l\'écran');
    ok(r.mesures && r.mesures.tamises === 2,
       'le tamis compte ce qu\'il retire, à part des jetés de TMDB (tamisés : ' +
       ((r.mesures || {}).tamises) + ')');
    ok(r.mesures && r.mesures.proposes === 10,
       'tout ce que le modèle a proposé est compté (' + ((r.mesures || {}).proposes) + ')');
    ok(r.mesures && r.mesures.tmdb > 0 && r.mesures.ms >= 0,
       'les requêtes TMDB et la durée de l\'étape sont relevées (' +
       ((r.mesures || {}).tmdb) + ' requêtes, ' + ((r.mesures || {}).ms) + ' ms)');
    ok(new Set(r.ids).size === r.ids.length,
       'aucun doublon dans la grille (' + r.ids.length + ' titres)');

    /* LE CACHE DE RÉSOLUTION — le coût que la spec n'avait pas cadré. Les
       étapes suivantes reproposent les mêmes titres : sans ce cache, chacun
       serait revérifié à chaque fois. */
    await repondre(page, 'Qui réchauffe');
    const r2 = await page.evaluate(()=> ({
      recherches:window.__tmdb.filter(a => /^\/search\/(movie|tv)$/.test(a.chemin)).length,
      titres:__titresEcran() }));
    const neufs = r2.titres.filter(t => r.titres.indexOf(t) < 0).length;
    ok(r2.recherches - r.recherches <= neufs + 1,
       'seuls les titres NEUFS coûtent une requête TMDB (' +
       (r2.recherches - r.recherches) + ' requêtes pour ' + neufs + ' titres neufs)');
    await page.close();
  }

  /* ===== ⑦ IA COUPÉE : L'ÉCRAN DE LA v118, SANS UNE TRACE ================ */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, { iaCoupee:true });
    titre('⑦ IA de la Recherche coupée : comportement de v118, aucune trace du dialogue');
    const r = await page.evaluate(async ()=>{
      await __taper('je sais pas trop, un truc qui me fasse du bien');
      const html = document.getElementById('app').innerHTML;
      return { requetes:window.__ia.length, dialogue:!!etatRech().envieD,
               envie:etatRech().envie, bouton:/class="qia/.test(html),
               nv:/class="nv/.test(html), titres:etatRech().qtitres.length,
               erreur:/Erreur|erreur technique|indisponible/i.test(html) };
    });
    ok(r.requetes === 0, 'aucune requête IA');
    ok(!r.dialogue && !r.nv, 'aucune trace du dialogue à l\'écran');
    ok(!r.envie && !r.bouton, 'le ✦ n\'est même pas proposé — la barre est celle d\'aujourd\'hui');
    ok(r.titres > 0 && !r.erreur, 'la recherche de titre répond, sans message d\'erreur');
    await page.close();
  }

  /* ===== ⑧ L'IA RÉPOND null À LA PREMIÈRE ÉTAPE ========================== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, {});
    titre('⑧ Le relais ne rend rien à la première étape : on retombe sur la v118');
    const r = await page.evaluate(async ()=>{
      window.sbFetch = async ()=> ({ indisponible:true });
      await __taper('je sais pas trop, un truc qui me fasse du bien');
      await __pause(500);
      const html = document.getElementById('app').innerHTML;
      return { dialogue:!!etatRech().envieD, nv:/class="nv/.test(html),
               statut:!!etatRech().iaStatut, envie:etatRech().envie,
               titres:etatRech().qtitres.length,
               erreur:/Erreur|erreur technique|indisponible/i.test(html) };
    });
    ok(!r.dialogue && !r.nv, 'le dialogue est abandonné, rien ne reste à l\'écran');
    ok(!r.statut, 'la ligne de statut ne reste pas allumée sur un échec');
    ok(!r.erreur, 'aucun message d\'erreur — le socle ne meurt jamais');
    ok(r.titres > 0, 'et la recherche de texte prend le relais sur ce qui a été tapé');
    await page.close();
  }

  /* ===== ⑨ L'IA TOMBE EN COURS DE ROUTE : ON GARDE CE QU'ON A ============ */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, {});
    titre('⑨ Le relais tombe APRÈS la première étape : la grille reste, les questions s\'arrêtent');
    await page.evaluate(async ()=>
      await __taper('je sais pas trop, un truc qui me fasse du bien'));
    const avant = await page.evaluate(()=> ({ titres:__titresEcran() }));
    await page.evaluate(()=>{ window.sbFetch = async ()=> ({ indisponible:true }); });
    await page.click('#rres .nvopts .nvopt:first-child');
    await page.waitForFunction(()=> !!document.querySelector('#rres .nvfini'),
                               null, { timeout:9000 });
    const apres = await page.evaluate(()=> ({
      titres:__titresEcran(), dialogue:!!etatRech().envieD, q:__question(),
      fil:__fil().length,
      erreur:/Erreur|erreur technique|indisponible/i.test(
        document.getElementById('app').innerHTML) }));
    ok(apres.dialogue, 'le dialogue reste ouvert : il y a une grille à montrer');
    ok(apres.titres.join('|') === avant.titres.join('|'),
       'la grille précédente est CONSERVÉE — on ne punit pas d\'avoir répondu');
    ok(!apres.q, 'on arrête de poser des questions');
    ok(apres.fil === 1, 'la réponse touchée reste dans le fil (' + apres.fil + ')');
    ok(!apres.erreur, 'aucun message d\'erreur');
    await page.close();
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
