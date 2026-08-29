/* ---------------------------------------------------------------------------
   RETOUR-08 — LE RETOUR RAMÈNE TOUJOURS SUR L'ÉCRAN PRÉCÉDENT.

       cd <depot> && python3 -m http.server 8099 &
       node tests/nav-retour-08.js

   Le constat d'Adrien (29/08) : « dans plusieurs cas le slide ne renvoie pas à
   l'écran précédent — c'est très frustrant ». Pas de parcours reproducteur :
   c'est un AUDIT, et cette suite en est le procès-verbal exécutable.

   LA RÈGLE, UNE SEULE : le retour — balayage gauche→droite (`popstate`) COMME
   flèche ← — ramène sur l'écran PRÉCÉDEMMENT AFFICHÉ. Les deux gestes racontent
   la même histoire : CHAQUE cas ci-dessous est donc joué DEUX FOIS, une fois
   par `goBack()` (flèche et balayage passent par lui) et une fois par
   `history.back()` (bouton d'Android et geste système d'iOS). Un cas qui passe
   d'un côté et pas de l'autre est un bug, même si chaque moitié semble
   défendable.

   Deux exceptions, et elles sont dans l'ordre de mission :
     · une feuille ouverte se ferme au premier retour ;
     · un écran devenu impossible (titre supprimé) se replie proprement vers son
       onglet — jamais d'écran blanc, jamais de cul-de-sac.

   Et deux substitutions assumées, écrites dans la carte de tête d'app-03 :
   onglet du bas → onglet du bas, et aperçu → fiche DU MÊME TITRE.

   Chaque écart trouvé pendant l'audit a son § ici, avec le parcours exact.
   Les §7 et §8 sont les parcours profonds de non-régression : ils étaient déjà
   verts avant le lot et doivent le rester.
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
    let n = 0;
    window.tmdb = async (chemin)=>{
      if(/\/genre\//.test(chemin)) return { genres:[{id:18,name:'Drame'},{id:35,name:'Comédie'},
                                                     {id:28,name:'Action'},{id:16,name:'Animation'}] };
      if(/\/person\/\d+$/.test(chemin)) return { id:1, name:'Acteur Test', profile_path:'/a.jpg' };
      if(/credits/.test(chemin)) return { cast:[
        { id:1399, name:'Dark', media_type:'tv', poster_path:'/p.jpg', first_air_date:'2017-01-01',
          vote_average:8, vote_count:900 } ] };
      if(/^\/tv\/2000$/.test(chemin)) return { id:2000, name:'Apercu A', poster_path:'/p.jpg',
        overview:'.', seasons:[], genres:[{id:18,name:'Drame'}], vote_average:8, vote_count:900,
        first_air_date:'2017-01-01', credits:{cast:[]} };
      const tv = /\/tv\b/.test(chemin);
      const lot = Array.from({length:20}, ()=>{ n++;
        const o = { id:5000+n, poster_path:'/p.jpg', backdrop_path:'/b.jpg', vote_average:7.2,
                    vote_count:900, genre_ids:[18,35], original_language:'en', overview:'.' };
        if(tv){ o.name='Serie '+n; o.first_air_date='2020-01-01'; }
        else  { o.title='Film '+n; o.release_date='2020-01-01'; }
        return o;
      });
      return { results: lot, total_pages: 3, total_results: 60 };
    };
    window.sbFetch = async ()=> ([]);
    db.auth = { token:'x', uid:'moi' };
    db.notifLus = {};
    partage.suivis = [{ id:'u2', pseudo:'Camille' }];
    partage.abonnes = []; partage.charge = true;
    conseils = { recues:[], envoyees:[], charge:true };
    db.shows[1399] = { id:1399, name:'Dark', poster:'/p.jpg', seasons:{}, watched:{},
                       genres:['Drame'], addedAt:1, updated:1 };
    db.movies[550] = { id:550, title:'Fight Club', poster:'/p.jpg', seen:true,
                       genres:['Drame'], addedAt:1, updated:1 };
    /* Quatorze films vus : le duel « film » devient disponible. */
    for(let i = 1; i <= 14; i++)
      db.movies[i] = { id:i, title:'Film '+i, poster:'/p.jpg', seen:true,
                       genres:['Drame'], addedAt:i, updated:i };
    window.__pause = ms => new Promise(r=>setTimeout(r, ms));
    /* Le nom court d'un écran, identité comprise : c'est lui qu'on compare. */
    window.__ou = ()=> view + (params && params.id != null ? ':' + params.id : '');
    /* UN retour, dans le mode demandé. `goBack()` porte la flèche ET le
       balayage (il joue l'animation puis recule) ; `history.back()` porte le
       bouton d'Android et le geste système d'iOS. */
    window.__retour = async (mode)=>{
      if(mode === 'fleche') goBack(); else history.back();
      await window.__pause(950);
      return window.__ou();
    };
    window.__retours = async (n, mode)=>{
      const l = [];
      for(let i = 0; i < n; i++) l.push(await window.__retour(mode));
      return l;
    };
  });
}

/* Chaque cas est joué dans les deux modes. `f` reçoit le mode et rend un objet
   quelconque ; les assertions sont écrites une fois, dans `verif`. */
async function deuxGestes(nav, nom, corps, verif){
  for(const mode of ['fleche', 'popstate']){
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);
    let r;
    try{ r = await page.evaluate('(' + corps + ')(' + JSON.stringify(mode) + ')'); }
    catch(e){ r = { erreur: e.message.split('\n')[0] }; }
    console.log('   — ' + nom + ' · ' + (mode === 'fleche' ? 'flèche ←' : 'balayage / bouton'));
    if(r.erreur) ok(false, 'le parcours a échoué : ' + r.erreur);
    else verif(r, mode);
    await page.close();
  }
}

(async ()=>{
  const nav = await chromium.launch();

  /* ======================================================================
     §1 — LE DUEL OUVERT D'AILLEURS FAISAIT APPARAÎTRE MES GOÛTS AU RETOUR

     Parcours  : Découvrir → bandeau « Départager mes films » → arène → retour
     Obtenu    : Mes goûts (un écran que la personne n'a JAMAIS vu), puis
                 Découvrir au second retour
     Attendu   : Découvrir, du premier coup
     Cause     : `ouvrirDuel` navigue vers `gouts` pour poser son arène ; le
                 retour ne fermait que l'arène et laissait l'écran dessous.
     ====================================================================== */
  titre('§1 — le duel ouvert depuis un autre écran rend cet écran-là, pas Mes goûts');
  for(const dep of ['discover', 'profile']){
    await deuxGestes(nav, 'duel ouvert depuis ' + dep, `async (mode)=>{
      go(${JSON.stringify(dep)}, {}); await __pause(400);
      ouvrirDuel('film'); await __pause(500);
      const arene = { vue:view, actif:!!(duel && duel.actif) };
      const un = await __retour(mode);
      return { arene, un, duelEncore:!!(duel && duel.actif) };
    }`, (r)=>{
      ok(r.arene.vue === 'gouts' && r.arene.actif, 'l\'arène est bien ouverte');
      ok(!r.duelEncore, 'le retour a rangé la session de duel');
      ok(r.un === dep, 'et il rend « ' + dep + ' » du premier coup (obtenu : ' + r.un + ')');
    });
  }
  await deuxGestes(nav, 'duel ouvert DEPUIS Mes goûts (le cas où l\'écran dessous a été vu)', `async (mode)=>{
    go('profile', {}); await __pause(200);
    go('settings', { from:'profile' }); await __pause(200);
    go('gouts', { from:'settings' }); await __pause(400);
    ouvrirDuel('film'); await __pause(500);
    const un = await __retour(mode);
    const deux = await __retour(mode);
    return { un, deux };
  }`, (r)=>{
    ok(r.un === 'gouts', 'le premier retour ferme l\'arène et RESTE sur Mes goûts (obtenu : ' + r.un + ')');
    ok(r.deux === 'settings', 'le second ramène aux Réglages (obtenu : ' + r.deux + ')');
  });

  /* ======================================================================
     §2 — « DANS LE MÊME ESPRIT » ÉCRASAIT L'APERÇU D'OÙ L'ON VENAIT

     Parcours  : Découvrir → aperçu de A → « Dans le même esprit » → fiche de B
                 (B est déjà dans la bibliothèque) → retour
     Obtenu    : Découvrir — l'aperçu de A a disparu de la pile
     Attendu   : l'aperçu de A
     Cause     : `substitue()` remplaçait l'entrée pour TOUT aperçu → fiche,
                 alors que la carte de nav promet « du MÊME titre ».
     ====================================================================== */
  titre('§2 — l\'aperçu n\'est écrasé que par la fiche DU MÊME titre');
  await deuxGestes(nav, 'aperçu(A) → « dans le même esprit » → fiche(B)', `async (mode)=>{
    go('discover', {}); await __pause(400);
    openPreview(2000, 'tv', 'discover'); await __pause(500);
    const surA = __ou();
    ouvrirTitre(1399, 'tv', view); await __pause(500);
    const surB = __ou();
    const un = await __retour(mode);
    const deux = await __retour(mode);
    return { surA, surB, un, deux };
  }`, (r)=>{
    ok(r.surA === 'preview:2000' && r.surB === 'show:1399', 'le parcours est bien joué');
    ok(r.un === 'preview:2000', 'le retour rend l\'aperçu de A (obtenu : ' + r.un + ')');
    ok(r.deux === 'discover', 'et le suivant rend Découvrir (obtenu : ' + r.deux + ')');
  });
  await deuxGestes(nav, 'aperçu(A) → j\'ajoute A → fiche(A) : la substitution TIENT', `async (mode)=>{
    go('discover', {}); await __pause(400);
    openPreview(1399, 'tv', 'discover'); await __pause(500);
    /* La série est déjà dans la bibliothèque : addOrOpenShow ouvre sa fiche,
       et c'est exactement la substitution que la carte de nav défend. */
    addOrOpenShow(1399); await __pause(500);
    const surA = __ou();
    const un = await __retour(mode);
    return { surA, un };
  }`, (r)=>{
    ok(r.surA === 'show:1399', 'la fiche du même titre a bien remplacé l\'aperçu');
    ok(r.un === 'discover', 'le retour saute l\'aperçu, comme prévu (obtenu : ' + r.un + ')');
  });

  /* ======================================================================
     §3 — UNE FEUILLE SURVIVAIT À UN CHANGEMENT D'ÉCRAN

     Parcours  : Découvrir → ouvrir une feuille → onglet Mon profil
     Obtenu    : la feuille est TOUJOURS là, par-dessus Mon profil ; le premier
                 retour la ferme au lieu de revenir sur Découvrir.
     Attendu   : `go()` range la feuille comme il range déjà le duel (§6 de la
                 carte de navigation).
     ====================================================================== */
  titre('§3 — une feuille ne survit pas au changement d\'écran');
  await deuxGestes(nav, 'feuille ouverte puis onglet Mon profil', `async (mode)=>{
    go('discover', {}); await __pause(400);
    openSheet('<div>panneau</div>'); await __pause(300);
    const ouverteAvant = document.getElementById('sheet').classList.contains('show');
    go('profile', {}); await __pause(400);
    const ouverteApres = document.getElementById('sheet').classList.contains('show');
    const un = await __retour(mode);
    return { ouverteAvant, ouverteApres, un };
  }`, (r)=>{
    ok(r.ouverteAvant, 'la feuille était bien ouverte');
    ok(!r.ouverteApres, 'elle est refermée par le changement d\'écran');
    ok(r.un === 'discover', 'et le premier retour ramène sur Découvrir (obtenu : ' + r.un + ')');
  });
  await deuxGestes(nav, 'feuille ouverte, retour SANS changer d\'écran', `async (mode)=>{
    go('follow', {}); await __pause(300);
    go('show', { id:1399, from:'follow' }); await __pause(400);
    openSheet('<div>panneau</div>'); await __pause(300);
    const un = await __retour(mode);
    const feuille = document.getElementById('sheet').classList.contains('show');
    const deux = await __retour(mode);
    return { un, feuille, deux };
  }`, (r)=>{
    ok(r.un === 'show:1399' && !r.feuille,
       'le premier retour ferme la feuille et reste sur la fiche (obtenu : ' + r.un + ')');
    ok(r.deux === 'follow', 'le second quitte la fiche (obtenu : ' + r.deux + ')');
  });

  /* ======================================================================
     §4 — LE TITRE SUPPRIMÉ LAISSAIT UN CUL-DE-SAC QUI BOUCLE

     Parcours  : En cours → fiche → acteur → (la série disparaît : suppression
                 depuis un autre appareil, ou synchro) → retour
     Obtenu    : un écran « Introuvable » quasi vide, dont la flèche appelait
                 `go('follow')` — un EMPILEMENT : le retour suivant ramenait sur
                 « Introuvable ». Une boucle.
     Attendu   : l'écran impossible se replie tout seul vers l'écran précédent.
     ====================================================================== */
  titre('§4 — un écran devenu impossible se replie, il ne boucle pas');
  for(const quoi of ['show', 'movie']){
    await deuxGestes(nav, 'le ' + quoi + ' disparaît pendant qu\'on est sur l\'acteur', `async (mode)=>{
      const q = ${JSON.stringify(quoi)};
      go('follow', {}); await __pause(300);
      go(q, { id: q === 'show' ? 1399 : 550, from:'follow' }); await __pause(400);
      ouvrirActeur(1); await __pause(400);
      if(q === 'show') delete db.shows[1399]; else delete db.movies[550];
      const un = await __retour(mode);
      await __pause(400);
      const corps = document.getElementById('app').innerText.trim();
      return { un, ou:__ou(), corps: corps.slice(0, 40) };
    }`, (r)=>{
      ok(r.ou === 'follow',
         'le retour se replie sur l\'onglet, sans cul-de-sac (obtenu : ' + r.ou + ')');
      ok(r.corps.length > 30 || !/Introuvable/.test(r.corps),
         'et rien d\'à moitié vide ne reste à l\'écran (« ' + r.corps + ' »)');
    });
  }

  /* ======================================================================
     §5 — L'ÉCRAN CACHÉ DU BANC D'ESSAI (SPEC-09 lot 0)
     « Masquer les outils » repartait par un `go()` qui EMPILAIT les Réglages :
     le retour suivant ramenait sur un banc devenu inaccessible autrement.
     ====================================================================== */
  titre('§5 — « Masquer les outils » du banc revient en arrière, il n\'empile pas');
  await deuxGestes(nav, 'réglages → banc → masquer', `async (mode)=>{
    try{ localStorage.setItem('ms.dev.v1','1'); }catch(e){}
    go('profile', {}); await __pause(200);
    go('settings', { from:'profile' }); await __pause(200);
    go('banc', { from:'settings' }); await __pause(300);
    fermerDevBanc(); await __pause(950);
    const apres = __ou();
    const un = await __retour(mode);
    return { apres, un, ouvert: bancDevOuvert() };
  }`, (r)=>{
    ok(!r.ouvert, 'les outils sont masqués');
    ok(r.apres === 'settings', 'on est revenu sur les Réglages (obtenu : ' + r.apres + ')');
    ok(r.un === 'profile', 'et le retour suivant rend Mon profil, pas le banc (obtenu : ' + r.un + ')');
  });

  /* ======================================================================
     §6 — LES SURFACES PLEIN ÉCRAN QUI NE SONT PAS DES VUES
     Chacune se ferme au PREMIER retour, sans quitter l'écran, et sans en
     dépiler deux. C'est l'exception admise de l'ordre de mission.
     ====================================================================== */
  titre('§6 — feuille de filtres, jeu 🎲, recherche du profil, recherche d\'acteurs');
  const SURFACES = [
    { nom:'feuille de filtres (Recherche)', ecran:'search',
      ouvre:"ouvrirFiltresRech()", teste:"document.getElementById('sheet').classList.contains('show')" },
    { nom:'jeu 🎲 (Recherche)', ecran:'search',
      ouvre:"ouvrirJeuRech()", teste:"!!etatRech().jeu" },
    { nom:'recherche plein écran (Mon profil)', ecran:'profile',
      ouvre:"ouvrirRechPf12()", teste:"pf12.ouvert" }
  ];
  for(const s of SURFACES){
    await deuxGestes(nav, s.nom, `async (mode)=>{
      go(${JSON.stringify(s.ecran)}, {}); await __pause(400);
      ${s.ouvre}; await __pause(400);
      const avant = ${s.teste};
      const un = await __retour(mode);
      return { avant, un, encore: ${s.teste} };
    }`, (r)=>{
      ok(r.avant, 'la surface est bien ouverte');
      ok(!r.encore && r.un === s.ecran,
         'le retour la ferme et RESTE sur ' + s.ecran + ' (obtenu : ' + r.un + ')');
    });
  }
  await deuxGestes(nav, 'recherche d\'acteurs (Mes goûts)', `async (mode)=>{
    go('profile', {}); await __pause(200);
    go('settings', { from:'profile' }); await __pause(200);
    go('gouts', { from:'settings' }); await __pause(400);
    ouvrirRechActeur(); await __pause(400);
    const avant = rechActeur.ouvert;
    const un = await __retour(mode);
    const deux = await __retour(mode);
    return { avant, un, deux, encore: rechActeur.ouvert };
  }`, (r)=>{
    ok(r.avant, 'la recherche d\'acteurs est ouverte');
    ok(!r.encore && r.un === 'gouts', 'le retour la ferme et reste sur Mes goûts (obtenu : ' + r.un + ')');
    ok(r.deux === 'settings', 'le suivant quitte l\'écran (obtenu : ' + r.deux + ')');
  });

  /* ======================================================================
     §7 — LES PARCOURS PROFONDS, DEPUIS CHAQUE ONGLET
     Trois niveaux au moins, et CHAQUE étape du retour vérifiée jusqu'à
     l'onglet de départ. Ce sont les parcours de non-régression : ils étaient
     verts avant ce lot et doivent le rester.
     ====================================================================== */
  titre('§7 — parcours profonds : chaque étape du retour, jusqu\'à l\'onglet de départ');
  const PROFONDS = [
    { nom:'En cours → fiche → acteur → film',
      pas:["go('follow',{})", "pressClic(1399,{})", "ouvrirActeur(1)", "ouvrirTitre(550,'movie', view)"],
      attendu:['acteur:1', 'show:1399', 'follow'] },
    { nom:'Découvrir → rangée → titre → acteur',
      pas:["go('discover',{})", "ouvrirRangee('nouveautes')", "ouvrirTitre(1399,'tv','rangee')",
           "ouvrirActeur(1)"],
      attendu:['show:1399', 'rangee', 'discover'] },
    { nom:'Recherche → fiche → acteur → film',
      pas:["go('search',{})", "ouvrirTitre(1399,'tv','search')", "ouvrirActeur(1)",
           "ouvrirTitre(550,'movie', view)"],
      attendu:['acteur:1', 'show:1399', 'search'] },
    { nom:'Mon profil → cercle → bibliothèque d\'un proche → titre → acteur',
      pas:["go('profile',{})", "ouvrirAbos()", "ouvrirBiblio('u2')",
           "ouvrirTitre(1399,'tv','biblio')", "ouvrirActeur(1)"],
      attendu:['show:1399', 'biblio:u2', 'abos', 'profile'] },
    { nom:'Découvrir → centre 🔔 → fiche → « même esprit » → fiche',
      pas:["go('discover',{})", "ouvrirCentre()", "ouvrirTitre(1399,'tv','centre')",
           "ouvrirTitre(550,'movie', view)"],
      attendu:['show:1399', 'centre', 'discover'] },
    { nom:'Mon profil → Réglages → Notifications → Cloches',
      pas:["go('profile',{})", "go('settings',{from:'profile'})", "go('notifs',{from:'settings'})",
           "go('clochettes',{from:'notifs'})"],
      attendu:['notifs', 'settings', 'profile'] },
    { nom:'Mon profil → Réglages → banc d\'essai IA',
      pas:["go('profile',{})", "go('settings',{from:'profile'})", "go('banc',{from:'settings'})"],
      attendu:['settings', 'profile'] }
  ];
  for(const p of PROFONDS){
    await deuxGestes(nav, p.nom, `async (mode)=>{
      const pas = ${JSON.stringify(p.pas)};
      const aller = [];
      for(const src of pas){ eval(src); await __pause(420); aller.push(__ou()); }
      const retours = await __retours(${p.attendu.length}, mode);
      return { aller, retours };
    }`, (r)=>{
      ok(JSON.stringify(r.retours) === JSON.stringify(p.attendu),
         'aller : ' + r.aller.join(' → ') + '\n        retour : ' + r.retours.join(' → ') +
         (JSON.stringify(r.retours) === JSON.stringify(p.attendu) ? '' :
          '\n        attendu : ' + p.attendu.join(' → ')));
    });
  }

  /* ======================================================================
     §8 — LES DEUX GESTES RACONTENT LA MÊME HISTOIRE
     Le même parcours joué à la flèche et au balayage doit rendre la MÊME suite
     d'écrans. C'est la seule façon d'attraper une divergence qui, prise d'un
     seul côté, semble défendable.
     ====================================================================== */
  titre('§8 — flèche et balayage rendent la même suite, écran pour écran');
  {
    const suites = {};
    for(const mode of ['fleche', 'popstate']){
      const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
      await decor(page);
      suites[mode] = await page.evaluate(async (m)=>{
        go('discover', {}); await __pause(400);
        openPreview(2000, 'tv', 'discover'); await __pause(500);
        ouvrirTitre(1399, 'tv', view); await __pause(500);
        ouvrirActeur(1); await __pause(400);
        openSheet('<div>panneau</div>'); await __pause(300);
        return await __retours(4, m);
      }, mode);
      await page.close();
    }
    ok(JSON.stringify(suites.fleche) === JSON.stringify(suites.popstate),
       'flèche : ' + suites.fleche.join(' → ') + '\n        balayage : ' + suites.popstate.join(' → '));
    ok(JSON.stringify(suites.fleche) === JSON.stringify(['acteur:1', 'show:1399', 'preview:2000', 'discover']),
       'et cette suite est la bonne (obtenu : ' + suites.fleche.join(' → ') + ')');
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
