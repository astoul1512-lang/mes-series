/* ---------------------------------------------------------------------------
   SPEC-09 LOT 1 — L'IA RANGE LES RANGÉES LOCALES, ET EN ÉCARTE.

       cd <depot> && python3 -m http.server 8099 &
       node tests/spec09-ordonner.js

   Décision d'Adrien du 31/08 : « L'IA compose une partie des rangées, les
   autres restent locales (Bientôt, Nouveautés, Vu par tes proches), mais
   vérifié sur TMDB » — puis « j'aimerais quand même que l'IA check ça pour être
   sûr de la cohérence avec le profil : Acclamés, Pépites, Week-end, Classiques,
   Incontournables. »

   CE QUI EST FACILE À CASSER ET QUE CES CAS TIENNENT :

   · L'IA N'AJOUTE RIEN. Elle ne peut que ranger et retirer dans la liste qu'on
     lui donne. Une clé mémorisée qui ne correspond à aucun titre du jour ne
     doit RIEN faire apparaître — sans quoi « Acclamés par la critique »
     cesserait d'être vrai, ce qui est toute la raison de garder ces rangées
     locales.
   · « BIENTÔT » N'EST JAMAIS TOUCHÉ. C'est un calendrier : l'ordre EST
     l'information, et un titre retiré est une sortie qu'on ne verra pas venir.
   · LA RÈGLE DES 10 PRIME SUR LE CONTRÔLE. Une rangée n'est jamais maigre, et
     jamais supprimée : sous le plancher, les écartés reviennent.
   · IA COUPÉE = L'ÉCRAN D'AUJOURD'HUI, À L'IDENTIQUE. Le socle ne meurt jamais.
   · RIEN NE BOUGE SOUS LE DOIGT : la lecture est SYNCHRONE et ne parle jamais
     au réseau. Ce qui s'affiche a été décidé au lot précédent.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';

let soucis = 0;
function ok(cond, msg){
  console.log((cond ? '   ✓ ' : '   ✗ ') + msg);
  if(!cond) soucis++;
}
function titre(t){ console.log('\n' + t); }

/* Une rangée de N titres, tous valides et distincts. */
function faux(n){
  const l = [];
  for(let i = 0; i < n; i++)
    l.push({ id: 100 + i, media:'movie', nom:'Titre ' + i, affiche:'/a.jpg',
             date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
  return l;
}

async function decor(page){
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
  await page.evaluate(()=>{
    window.tmdb = async ()=> ({ results:[], total_pages:1, total_results:0 });
    window.sbFetch = async ()=> ([]);
    db.auth = { token:'x', uid:'moi' };
    db.gouts = db.gouts || {};
    db.gouts.ia = { decouvrir:true, recherche:true };
    /* On écrit le cache du jour à la main : c'est exactement ce que le lot du
       jour écrirait, et ça permet d'éprouver la LECTURE sans réseau. */
    window.__poserOrdres = (ordres)=>{
      const o = lireCacheIA();
      o.jour = todayISO();
      o.ordres = ordres;
      ecrireCacheIA(o);
    };
  });
}

(async ()=>{
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
  await decor(page);

  titre('1. L\'ordre de l\'IA est appliqué, et rien de plus');
  const range = await page.evaluate(()=>{
    const l = [];
    for(let i = 0; i < 12; i++)
      l.push({ id:100 + i, media:'movie', nom:'Titre ' + i, affiche:'/a.jpg',
               date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
    __poserOrdres({ acclames:{ ids:['movie:103','movie:101','movie:100'], hors:[] } });
    const out = ordreIARangee('acclames', l);
    return { noms:out.map(x=> x.id), n:out.length };
  });
  ok(range.n === 12, 'aucun titre n\'a disparu (' + range.n + ' sur 12)');
  ok(range.noms.slice(0, 3).join(',') === '103,101,100',
     'les trois titres rangés passent en tête (' + range.noms.slice(0, 3).join(',') + ')');
  ok(range.noms.slice(3).join(',') === '102,104,105,106,107,108,109,110,111',
     'le reste garde son ordre local derrière');

  titre('2. Un écarté sort de la rangée');
  const ecarte = await page.evaluate(()=>{
    const l = [];
    for(let i = 0; i < 12; i++)
      l.push({ id:100 + i, media:'movie', nom:'Titre ' + i, affiche:'/a.jpg',
               date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
    __poserOrdres({ acclames:{ ids:['movie:100','movie:101'], hors:['movie:105','movie:106'] } });
    const out = ordreIARangee('acclames', l);
    return out.map(x=> x.id);
  });
  ok(ecarte.indexOf(105) < 0 && ecarte.indexOf(106) < 0,
     'les deux écartés ne sont plus dans la rangée');
  ok(ecarte.length === 10, 'la rangée en garde dix (' + ecarte.length + ')');

  titre('3. L\'IA N\'AJOUTE RIEN — une clé inconnue ne fait rien apparaître');
  const rien = await page.evaluate(()=>{
    const l = [];
    for(let i = 0; i < 12; i++)
      l.push({ id:100 + i, media:'movie', nom:'Titre ' + i, affiche:'/a.jpg',
               date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
    __poserOrdres({ acclames:{ ids:['movie:999','tv:42','movie:101'], hors:[] } });
    const out = ordreIARangee('acclames', l);
    return { n:out.length, tete:out[0].id, ids:out.map(x=> x.id) };
  });
  ok(rien.n === 12, 'la rangée fait toujours douze titres (' + rien.n + ')');
  ok(rien.ids.indexOf(999) < 0 && rien.ids.indexOf(42) < 0,
     'aucun titre inventé n\'est entré dans la rangée');
  ok(rien.tete === 101, 'seul le titre réellement présent a été remonté');

  titre('4. La règle des 10 prime : sous le plancher, les écartés reviennent');
  const plancher = await page.evaluate(()=>{
    const l = [];
    for(let i = 0; i < 12; i++)
      l.push({ id:100 + i, media:'movie', nom:'Titre ' + i, affiche:'/a.jpg',
               date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
    /* Cinq écartés sur douze : la rangée tomberait à sept, donc sous
       RANGEE_MINI. Trois doivent revenir, et ce sont les DERNIERS écartés. */
    __poserOrdres({ acclames:{ ids:['movie:100'],
                               hors:['movie:105','movie:106','movie:107','movie:108','movie:109'] } });
    const out = ordreIARangee('acclames', l);
    return { n:out.length, ids:out.map(x=> x.id), mini:RANGEE_MINI };
  });
  ok(plancher.n >= plancher.mini,
     'la rangée repasse le plancher de ' + plancher.mini + ' (' + plancher.n + ' titres)');
  ok(plancher.ids.indexOf(105) < 0,
     'le PREMIER écarté, lui, reste écarté — on ne défait pas tout le contrôle');
  ok(plancher.ids.indexOf(109) >= 0, 'les derniers écartés sont ceux qui reviennent');

  titre('5. « Bientôt » n\'est jamais touché — c\'est un calendrier');
  const avenir = await page.evaluate(()=>{
    const l = [];
    for(let i = 0; i < 12; i++)
      l.push({ id:100 + i, media:'movie', nom:'Titre ' + i, affiche:'/a.jpg',
               date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
    /* Un cache FORGÉ qui prétend ranger et écarter « Bientôt ». La garde doit
       tenir même là : c'est la phrase la plus catégorique de la spec. */
    __poserOrdres({ avenir:{ ids:['movie:111','movie:110'], hors:['movie:100'] } });
    const out = ordreIARangee('avenir', l);
    return { ids:out.map(x=> x.id),
             eligible: (typeof IA_RANGEES_CONTROLE !== 'undefined')
               && IA_RANGEES_CONTROLE.indexOf('avenir') < 0
               && IA_RANGEES_ORDRE_SEUL.indexOf('avenir') < 0 };
  });
  ok(avenir.ids[0] === 100 && avenir.ids.length === 12,
     'l\'ordre chronologique est intact et rien n\'est retiré');
  ok(avenir.eligible, '`avenir` n\'est dans aucune des deux listes éligibles');

  titre('6. « Vu par tes proches » et « Nouveautés » sont rangées, jamais écartées');
  const social = await page.evaluate(()=>
    ({ controle: IA_RANGEES_CONTROLE.slice(),
       ordreSeul: IA_RANGEES_ORDRE_SEUL.slice() }));
  ok(social.ordreSeul.indexOf('cercle') >= 0 && social.controle.indexOf('cercle') < 0,
     '`cercle` est rangée mais jamais contrôlée (un fait social ne se cache pas)');
  ok(social.ordreSeul.indexOf('nouv') >= 0 && social.controle.indexOf('nouv') < 0,
     '`nouv` de même — une nouveauté écartée serait une nouveauté cachée');
  ok(social.controle.join(',') === 'acclames,weekend,pepites,classiques,incont',
     'les cinq rangées contrôlées sont celles qu\'Adrien a nommées ('
       + social.controle.join(', ') + ')');

  titre('7. IA coupée : la liste ressort telle quelle');
  const eteinte = await page.evaluate(()=>{
    const l = [];
    for(let i = 0; i < 12; i++)
      l.push({ id:100 + i, media:'movie', nom:'Titre ' + i, affiche:'/a.jpg',
               date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
    __poserOrdres({ acclames:{ ids:['movie:111'], hors:['movie:100','movie:101'] } });
    db.gouts.ia = { decouvrir:false, recherche:false };
    const out = ordreIARangee('acclames', l);
    db.gouts.ia = { decouvrir:true, recherche:true };
    return out.map(x=> x.id);
  });
  ok(eteinte.join(',') === faux(12).map(x=> x.id).join(','),
     'ordre local intégral, aucun écarté — comportement d\'avant le lot');

  titre('8. Un ordre d\'HIER ne s\'applique pas');
  const hier = await page.evaluate(()=>{
    const l = [];
    for(let i = 0; i < 12; i++)
      l.push({ id:100 + i, media:'movie', nom:'Titre ' + i, affiche:'/a.jpg',
               date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
    const o = lireCacheIA();
    o.jour = '2020-01-01';
    o.ordres = { acclames:{ ids:['movie:111'], hors:['movie:100'] } };
    ecrireCacheIA(o);
    const out = ordreIARangee('acclames', l);
    return out.map(x=> x.id);
  });
  ok(hier.join(',') === faux(12).map(x=> x.id).join(','),
     'un ordre périmé est ignoré, la rangée reste locale');

  titre('9. Le plafond de 40 % d\'écartés, à l\'écriture');
  const plafond = await page.evaluate(async ()=>{
    const l = [];
    for(let i = 0; i < 20; i++)
      l.push({ id:200 + i, media:'movie', nom:'Film ' + i, affiche:'/a.jpg',
               date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
    /* Le modèle en écarte DOUZE sur vingt — 60 %. La spec plafonne à 40 %,
       donc huit au plus : au-delà, il ne contrôle plus, il recompose. */
    window.appelIA = async ()=> ({
      ordre:[0,1,2,3,4,5,6,7],
      ecartes:[8,9,10,11,12,13,14,15,16,17,18,19].map(i => ({ i:i, motif:'horreur' }))
    });
    const o = await ordonnerRangeeIA({ cle:'acclames', titre:'Acclamés', l:l }, true);
    return { hors:o ? o.hors.length : -1, ids:o ? o.ids.length : -1 };
  });
  ok(plafond.hors === 8,
     'huit écartés au plus sur vingt soumis, soit 40 % (' + plafond.hors + ')');
  ok(plafond.ids === 8, 'l\'ordre proposé, lui, est gardé entier');

  titre('10. Une rangée seulement RANGÉE ignore les écartés du modèle');
  const sansEcart = await page.evaluate(async ()=>{
    const l = [];
    for(let i = 0; i < 20; i++)
      l.push({ id:300 + i, media:'movie', nom:'Film ' + i, affiche:'/a.jpg',
               date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
    window.appelIA = async ()=> ({ ordre:[3,2,1,0],
                                   ecartes:[{ i:5, motif:'peu importe' }] });
    const o = await ordonnerRangeeIA({ cle:'cercle', titre:'Vu par tes proches', l:l }, false);
    return o ? o.hors.length : -1;
  });
  ok(sansEcart === 0,
     'aucun titre écarté sur « Vu par tes proches » — c\'est un fait, pas une suggestion');

  titre('11. Relais muet : aucune trace, la rangée reste locale');
  const muet = await page.evaluate(async ()=>{
    const l = [];
    for(let i = 0; i < 20; i++)
      l.push({ id:400 + i, media:'movie', nom:'Film ' + i, affiche:'/a.jpg',
               date:'2014-01-01', note:8, votes:900, genre_ids:[], langue:'en' });
    window.appelIA = async ()=> null;                    // relais injoignable
    const a = await ordonnerRangeeIA({ cle:'acclames', titre:'Acclamés', l:l }, true);
    window.appelIA = async ()=> ({ ordre:'pas une liste' });  // réponse illisible
    const b = await ordonnerRangeeIA({ cle:'acclames', titre:'Acclamés', l:l }, true);
    return { a:a, b:b };
  });
  ok(muet.a === null && muet.b === null,
     'les deux échecs rendent `null` : le client garde son ordre local');

  titre('12. La cible TMDB ne s\'élargit que si l\'IA est allumée');
  const cible = await page.evaluate(()=>{
    db.gouts.ia = { decouvrir:true, recherche:true };
    const avec = cibleEdito();
    db.gouts.ia = { decouvrir:false, recherche:false };
    const sans = cibleEdito();
    db.gouts.ia = { decouvrir:true, recherche:true };
    return { avec:avec, sans:sans, base:SUGG_CIBLE };
  });
  ok(cible.avec === 20, 'IA allumée : on vise vingt titres pour en afficher dix');
  ok(cible.sans === cible.base,
     'IA éteinte : la cible d\'avant le lot, donc zéro requête TMDB de plus');

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
