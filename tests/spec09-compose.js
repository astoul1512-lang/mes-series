/* ---------------------------------------------------------------------------
   SPEC-09 LOT 1 (2/2) — L'IA COMPOSE LES RANGÉES PERSONNELLES DE DÉCOUVRIR.

       cd <depot> && python3 -m http.server 8099 &
       node tests/spec09-compose.js

   Décision d'Adrien du 31/08 : « L'IA compose une partie des rangées, les
   autres restent locales (Bientôt, Nouveautés, Vu par tes proches), mais
   vérifié sur TMDB. »

   CE QUI EST FACILE À CASSER ET QUE CES CAS TIENNENT :

   · AUCUN TITRE SANS IDENTIFIANT TMDB RÉEL. Le modèle propose des NOMS ; TMDB
     décide s'ils existent. Un nom introuvable ou ambigu est JETÉ, en silence,
     et compté.
   · LES RANGÉES LOCALES GARDENT LEUR SOURCE. « Bientôt » reste chronologique et
     intouché ; « Vu par tes proches » et « Nouveautés » restent locales.
   · LA RÈGLE DES 10 TIENT. Une rangée composée qui retombe sous dix titres
     n'est pas affichée maigre : ses titres partent dans « Aussi pour toi »,
     comme n'importe quelle rangée locale trop courte.
   · IA COUPÉE OU RELAIS INJOIGNABLE = L'ÉCRAN D'AUJOURD'HUI, À L'IDENTIQUE.
     C'est la règle qui prime sur toutes les autres.
   · RIEN NE BOUGE SOUS LE DOIGT. La composition ne repeint JAMAIS l'écran :
     elle s'affiche à la prochaine entrée.
   · PAS DE RAFALE. Une composition qui échoue ne repart pas au rendu suivant,
     et six par jour au plus.
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
  await page.evaluate(async ()=>{
    db.auth = { token:'x', uid:'moi' };
    db.sync = { url:'https://x.test', key:'k' };
    db.gouts = db.gouts || {};
    db.gouts.ia = { decouvrir:true, recherche:true };
    window.sbFetch = async ()=> ([]);

    /* UN FAUX TMDB QUI SAIT DIRE NON. « Vrai N » existe ; tout autre nom est
       introuvable. C'est ce qui permet d'éprouver la chaîne de vérification —
       le cœur du lot — sans réseau. */
    window.__tmdbAppels = 0;
    let n = 0;
    window.tmdb = async (chemin, p)=>{
      window.__tmdbAppels++;
      if(chemin.indexOf('/search/') === 0){
        const q = String((p && p.query) || '');
        if(q.indexOf('Vrai ') !== 0) return { results:[] };
        const id = 5000 + Number(q.slice(5) || 0);
        const media = chemin.indexOf('movie') >= 0 ? 'movie' : 'tv';
        return { results:[{ id:id, title:q, name:q, original_title:q, original_name:q,
                            poster_path:'/a.jpg', release_date:'2015-01-01',
                            first_air_date:'2015-01-01', vote_average:8, vote_count:900,
                            genre_ids:[18], original_language:'en' }] };
      }
      const res = [];
      for(let i = 0; i < 20; i++){
        n++;
        res.push({ id:n, title:'Local ' + n, name:'Local ' + n, poster_path:'/a.jpg',
                   release_date:'2015-01-01', first_air_date:'2015-01-01',
                   vote_average:8, vote_count:900, genre_ids:[18],
                   original_language:'en' });
      }
      return { results:res, total_pages:5, total_results:100 };
    };
    oublierSuggestions();
    await chargerSuggestions(true);
  });
}

/* La réponse du modèle : `bons` titres qui existent, `faux` qui n'existent pas. */
function reponse(bons, faux){
  return { rangees:[{ titre:'Parce que tu aimes les procès',
                      titres: [].concat(
                        Array.from({length:bons}, (_,i)=> ({ nom:'Vrai ' + i, media:'film', annee:2015 })),
                        Array.from({length:faux}, (_,i)=> ({ nom:'Inventé ' + i, media:'film', annee:2015 }))) }] };
}

(async ()=>{
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
  await decor(page);

  titre('1. Aucun titre sans identifiant TMDB réel — les inventés sont JETÉS');
  const chaine = await page.evaluate(async (rep)=>{
    window.appelIA = async ()=> rep;
    const mesures = { tmdb:0, proposes:0, tamises:0, ms:0 };
    const r = await bancFamilleIA({ cle:'tout', puce:'tout', nom:'Tout' }, mesures);
    return { rangees:r.rangees.length,
             titres:r.rangees[0] ? r.rangees[0].l.length : 0,
             jetes:r.jetes.length,
             raisons:r.jetes.map(x => x.raison).join(','),
             ids:r.rangees[0] ? r.rangees[0].l.every(x => x.id > 0) : false,
             proposes:mesures.proposes };
  }, reponse(12, 4));
  ok(chaine.titres === 12, 'les douze titres réels sont gardés (' + chaine.titres + ')');
  ok(chaine.jetes === 4, 'les quatre inventés sont jetés (' + chaine.jetes + ')');
  ok(/introuvable/.test(chaine.raisons), 'et la raison est comptée : ' + chaine.raisons);
  ok(chaine.ids, 'chaque titre gardé porte un identifiant TMDB réel');
  ok(chaine.proposes === 16, 'les seize propositions sont comptées (' + chaine.proposes + ')');

  titre('2. La composition prend la place des rangées personnelles');
  const compo = await page.evaluate(async (rep)=>{
    window.appelIA = async ()=> rep;
    await composerFamilleIA('tout');
    const r = rangeesSuggerees();
    return { cles:r.map(x => x.cle),
             titres:r.filter(x => x.ia).map(x => x.titre),
             locales:r.filter(x => !x.ia).map(x => x.cle) };
  }, reponse(12, 0));
  ok(compo.cles.some(c => String(c).indexOf('ia:') === 0),
     'une rangée composée est à l\'écran (' + compo.cles.join(', ') + ')');
  ok(compo.titres[0] === 'Parce que tu aimes les procès',
     'elle porte l\'intitulé que l\'IA a écrit — c\'est elle qui nomme ce qu\'elle compose');
  ok(compo.cles.indexOf('top10') < 0 && compo.cles.indexOf('genre') < 0,
     'les rangées personnelles locales ont cédé la place');

  titre('3. Les rangées locales gardent leur source');
  ok(compo.locales.indexOf('avenir') >= 0, '« Bientôt » est toujours là');
  ok(compo.locales.indexOf('nouv') >= 0, '« Nouveautés » aussi');
  ok(compo.locales.indexOf('acclames') >= 0, 'les éditoriales aussi');

  titre('4. « Bientôt » reste chronologique et intact');
  const avenir = await page.evaluate(()=>{
    const r = rangeesSuggerees().find(x => x.cle === 'avenir');
    if(!r) return { absent:true };
    const dates = r.l.map(x => x.date || '');
    const trie = dates.slice().sort();
    return { ordre: dates.join('|') === trie.join('|'), n:r.l.length };
  });
  ok(!avenir.absent && avenir.ordre,
     'les dates sont dans l\'ordre — l\'IA n\'y a pas touché');

  titre('5. La règle des 10 : une rangée composée trop courte n\'est pas affichée maigre');
  const courte = await page.evaluate(async (rep)=>{
    window.appelIA = async ()=> rep;
    oublierCacheIA('decouvrir');
    await composerFamilleIA('tout');
    const r = rangeesSuggerees();
    const ia = r.filter(x => x.ia);
    return { ia:ia.length, tailles:ia.map(x => x.l.length),
             reste: !!r.find(x => x.cle === 'reste'),
             mini:RANGEE_MINI };
  }, reponse(5, 0));
  ok(courte.ia === 0 || courte.tailles.every(t => t >= courte.mini),
     'aucune rangée composée sous ' + courte.mini + ' titres (' + courte.tailles.join(',') + ')');

  titre('6. IA coupée : l\'écran d\'aujourd\'hui, à l\'identique');
  const eteinte = await page.evaluate(async (rep)=>{
    window.appelIA = async ()=> rep;
    oublierCacheIA('decouvrir');
    await composerFamilleIA('tout');
    const avec = rangeesSuggerees().map(x => x.cle);
    db.gouts.ia = { decouvrir:false, recherche:false };
    const sans = rangeesSuggerees().map(x => x.cle);
    db.gouts.ia = { decouvrir:true, recherche:true };
    return { avec:avec, sans:sans };
  }, reponse(12, 0));
  ok(eteinte.avec.some(c => String(c).indexOf('ia:') === 0),
     'IA allumée : la composition est à l\'écran');
  ok(!eteinte.sans.some(c => String(c).indexOf('ia:') === 0),
     'IA coupée : plus une seule rangée composée');
  ok(eteinte.sans.indexOf('top10') >= 0,
     'et les rangées locales reprennent leur place (' + eteinte.sans.join(', ') + ')');

  titre('7. Relais injoignable : même écran, et aucune trace');
  const panne = await page.evaluate(async ()=>{
    oublierCacheIA('decouvrir');
    window.appelIA = async ()=> null;              // relais muet
    const ecrit = await composerFamilleIA('tout');
    const cles = rangeesSuggerees().map(x => x.cle);
    return { ecrit:ecrit, ia:cles.filter(c => String(c).indexOf('ia:') === 0).length,
             local:cles.indexOf('top10') >= 0 };
  });
  ok(panne.ecrit === false, 'la composition dit franchement qu\'elle n\'a rien écrit');
  ok(panne.ia === 0 && panne.local, 'l\'écran est celui d\'aujourd\'hui, moteur local intégral');

  titre('8. Un échec ne repart PAS au rendu suivant (pas de rafale)');
  const rafale = await page.evaluate(()=>
    ({ aFaire: compoIAaFaire('tout'), compte: compoCompteIA() }));
  ok(rafale.aFaire === false,
     'la tentative ratée est inscrite : on ne redemandera pas à chaque repeint');
  ok(rafale.compte >= 1, 'et elle a bien été comptée (' + rafale.compte + ')');

  titre('9. L\'anti-boucle : six compositions par jour au plus');
  const boucle = await page.evaluate(async ()=>{
    const o = lireCacheIA();
    o.compo = { jour:todayISO(), n:IA_COMPO_MAX_JOUR, fams:{} };
    ecrireCacheIA(o);
    return { plafond:IA_COMPO_MAX_JOUR, aFaire:compoIAaFaire('tout') };
  });
  ok(boucle.plafond === 6, 'le plafond du §3 vaut six (' + boucle.plafond + ')');
  ok(boucle.aFaire === false, 'au plafond, plus aucune composition ne part');

  titre('10. Un signal fort relance la composition — mais pas l\'affichage');
  const signal = await page.evaluate(async (rep)=>{
    oublierCacheIA('decouvrir');
    /* Le cas 9 a laissé le compteur au plafond, et `oublierCacheIA` le GARDE
       volontairement (couper puis rallumer l'IA ne rend pas six compositions
       de plus). On le remet à zéro ici, sinon ce cas-ci mesurerait l'anti-boucle
       au lieu du signal fort. */
    { const z = lireCacheIA(); z.compo.n = 0; ecrireCacheIA(z); }
    window.appelIA = async ()=> rep;
    await composerFamilleIA('tout');
    const apres = compoIAaFaire('tout');
    /* Un 👍 de plus : la signature des goûts bouge, donc la composition est à
       refaire — c'est le signal fort du §3. */
    db.avis = db.avis || { tv:{}, movie:{} };
    db.avis.movie['424242'] = { v:1, quand:Date.now() };
    const apresSignal = compoIAaFaire('tout');
    /* … et pendant ce temps l'écran continue de servir la composition
       PRÉCÉDENTE : rien ne bouge sous le doigt. */
    const encore = rangeesSuggerees().filter(x => x.ia).length;
    return { avant:apres, apres:apresSignal, encore:encore };
  }, reponse(12, 0));
  ok(signal.avant === false, 'sans signal, rien à refaire');
  ok(signal.apres === true, 'un 👍 rend la composition à refaire');
  ok(signal.encore > 0,
     'et l\'ancienne composition reste à l\'écran en attendant la nouvelle');

  titre('11. La composition ne repeint JAMAIS l\'écran elle-même');
  const repeint = await page.evaluate(async (rep)=>{
    oublierCacheIA('decouvrir');
    window.appelIA = async ()=> rep;
    let peints = 0;
    const vrai = window.peindreDisc;
    window.peindreDisc = function(){ peints++; };
    await composerFamilleIA('tout');
    window.peindreDisc = vrai;
    return peints;
  }, reponse(12, 0));
  ok(repeint === 0,
     'aucun repeint : la nouvelle composition attend la prochaine entrée d\'écran');

  titre('12. Les mesures voyagent avec la composition (taux de jetés)');
  const mes = await page.evaluate(async (rep)=>{
    oublierCacheIA('decouvrir');
    window.appelIA = async ()=> rep;
    await composerFamilleIA('tout');
    const c = lireCacheIA().compo.fams['tout'];
    return { proposes:c.proposes, jetes:c.jetes, tamises:c.tamises, tmdb:c.tmdb };
  }, reponse(12, 8));
  ok(mes.proposes === 20, 'vingt titres proposés, comptés (' + mes.proposes + ')');
  ok(mes.jetes === 8, 'huit jetés, comptés (' + mes.jetes + ')');
  ok(typeof mes.tamises === 'number' && typeof mes.tmdb === 'number',
     'le tamis et les requêtes TMDB sont comptés à part — ce ne sont pas les mêmes reproches');

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
