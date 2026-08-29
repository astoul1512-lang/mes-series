/* ---------------------------------------------------------------------------
   SPEC-09 LOT 0 — LE BANC D'ESSAI IA.

       cd <depot> && python3 -m http.server 8099 &
       node tests/spec09-banc.js

   Ce que ces cas tiennent, et c'est l'acceptation du lot mot pour mot :

     ① chaque titre AFFICHÉ au banc correspond à un id TMDB réel — le modèle
        propose des noms, TMDB décide s'ils existent ;
     ② les titres jetés sont COMPTÉS et VISIBLES, avec leur raison ;
     ③ les votes s'enregistrent (et se retirent) et s'exportent ;
     ④ l'écran Découvrir réel est IDENTIQUE — au caractère près, ce qui est plus
        exigeant qu'« au pixel » ;
     ⑤ la tâche appelée est bien `suggestions_famille`, une fois par famille,
        jamais deux ;
     ⑥ IA coupée : le banc le DIT, et rien d'autre ne bouge.

   Le relais IA et TMDB sont tous deux bouchonnés : le premier rend des rangées
   dont on connaît d'avance le sort (deux titres réels, un inventé, un ambigu),
   le second répond comme TMDB — c'est la seule façon d'éprouver la chaîne
   « proposé → vérifié → tamisé » sans dépendre d'un catalogue qui bouge.
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
    /* --- TMDB. Un catalogue de quatre titres connus, et rien d'autre. --- */
    window.__tmdb = [];
    let n = 0;
    /* `Dune` existe DEUX FOIS, exactement comme dans le vrai catalogue : c'est
       le cas « ambigu » que le banc doit jeter faute d'année pour trancher. */
    const CONNUS = {
      'heat':      [{ id:949,  title:'Heat', original_title:'Heat', release_date:'1995-12-15' }],
      'prisoners': [{ id:146233, title:'Prisoners', original_title:'Prisoners', release_date:'2013-09-19' }],
      'dune':      [{ id:438631, title:'Dune', original_title:'Dune', release_date:'2021-09-15' },
                    { id:841,    title:'Dune', original_title:'Dune', release_date:'1984-12-14' }],
      'severance': [{ id:95396, name:'Severance', original_name:'Severance', first_air_date:'2022-02-18' }],
      'arcane':    [{ id:94605, name:'Arcane', original_name:'Arcane', first_air_date:'2021-11-06' }]
    };
    window.tmdb = async (chemin, params)=>{
      window.__tmdb.push({ chemin:chemin, q:(params && params.query) || '' });
      if(/\/genre\//.test(chemin)) return { genres:[
        {id:28,name:'Action'},{id:12,name:'Aventure'},{id:35,name:'Comédie'},
        {id:18,name:'Drame'},{id:16,name:'Animation'},{id:80,name:'Crime'},
        {id:10759,name:'Action & Adventure'},{id:10765,name:'Sci-Fi & Fantasy'} ] };
      if(/^\/search\/(movie|tv)$/.test(chemin)){
        const cle = String((params && params.query) || '').toLowerCase().trim();
        const l = (CONNUS[cle] || []).map(x => Object.assign(
          { poster_path:'/p.jpg', backdrop_path:'/b.jpg', vote_average:7.5, vote_count:2000,
            genre_ids:[28,18], original_language:'en', overview:'.' }, x));
        return { results:l, total_pages:1, total_results:l.length };
      }
      /* Tout le reste — c'est ce qui nourrit la vitrine réelle. */
      const tv = /\/tv\b/.test(chemin);
      const lot = Array.from({length:20}, ()=>{ n++;
        const x = { id:700000+n, poster_path:'/p.jpg', backdrop_path:'/b.jpg',
                    vote_average:7.1, vote_count:900, genre_ids:[28,18],
                    original_language:'en', overview:'.' };
        if(tv){ x.name='Serie '+n; x.first_air_date='2021-01-01'; }
        else  { x.title='Film '+n; x.release_date='2021-01-01'; }
        return x;
      });
      return { results:lot, total_pages:5, total_results:100, page:1 };
    };
    /* --- Le relais. On observe CE QUI PART, et on rend des rangées connues. -- */
    window.__ia = [];
    window.sbFetch = async (chemin, opts)=>{
      if(chemin !== '/functions/v1/ia') return [];
      const corps = JSON.parse((opts && opts.body) || '{}');
      window.__ia.push(corps);
      if(o && o.iaMuette) return { indisponible:true };
      return { rangees:[
        { titre:'Des polars secs',
          titres:[ { nom:'Heat', annee:1995, media:'film' },
                   { nom:'Prisoners', annee:2013, media:'film' },
                   { nom:'Le Film Qui N Existe Pas', annee:2019, media:'film' },
                   { nom:'Dune', media:'film' } ] },
        { titre:'Des séries qui tiennent en une saison',
          titres:[ { nom:'Severance', annee:2022, media:'serie' },
                   { nom:'Arcane', annee:2021, media:'serie' } ] }
      ] };
    };
    db.auth = { token:'x', uid:'moi' };
    db.sync = { url:'https://exemple.supabase.co', key:'cle' };
    partage.suivis = []; partage.abonnes = []; partage.charge = true;
    conseils = { recues:[], envoyees:[], charge:true };
    db.notifLus = {};
    /* Une bibliothèque minimale : sans elle, les rangées « pour toi » de la
       vitrine réelle n'existent pas et la colonne de droite est vide. */
    db.shows[1399] = { id:1399, name:'Dark', poster:'/d.jpg', seasons:{}, watched:{'1x1':1},
                       genres:['Drame'], addedAt:1, updated:1 };
    db.movies[550] = { id:550, title:'Fight Club', poster:'/f.jpg', seen:true,
                       genres:['Drame'], addedAt:1, updated:1 };
    db.gouts.ia = { decouvrir: !(o && o.iaCoupee), recherche:true };
    try{ localStorage.removeItem('ms.banc.v1'); }catch(e){}
    try{ localStorage.setItem('ms.dev.v1', '1'); }catch(e){}
  }, opts || {});
}
const dors = ms => new Promise(r=>setTimeout(r, ms));

(async ()=>{
  const nav = await chromium.launch();

  /* ===== ①②④⑤ — la chaîne complète ==================================== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page);

    titre('§0 — l\'écran est CACHÉ tant qu\'on ne l\'a pas déverrouillé');
    const r0 = await page.evaluate(async ()=>{
      try{ localStorage.removeItem('ms.dev.v1'); }catch(e){}
      go('settings', { from:'profile' });
      const avant = document.getElementById('app').innerHTML;
      const cache = avant.indexOf('Banc d\'essai IA') < 0;
      /* Sept appuis sur le pied de page, comme un doigt le ferait. */
      for(let i = 0; i < 7; i++) toucherPiedReglages();
      const apres = document.getElementById('app').innerHTML;
      return { cache: cache, visible: apres.indexOf('Banc d\'essai IA') >= 0,
               ouvert: bancDevOuvert() };
    });
    ok(r0.cache, 'les Réglages ne parlent pas du banc au départ');
    ok(r0.visible && r0.ouvert, 'sept appuis sur le pied de page ouvrent la section Développeur');

    titre('§1 — Découvrir avant : on fige l\'écran réel, au caractère près');
    const avantDisc = await page.evaluate(async ()=>{
      go('discover', {});
      await chargerSuggestions();
      for(let i=0; i<100 && suggCourantes().etat !== 'ok'; i++) await new Promise(r=>setTimeout(r,20));
      render();
      return document.getElementById('app').innerHTML;
    });
    ok(avantDisc.length > 500, 'la vitrine réelle est bien peinte (' + avantDisc.length + ' caractères)');

    titre('§2 — le banc génère : quatre requêtes IA, une par famille');
    const r1 = await page.evaluate(async ()=>{
      go('banc', { from:'settings' });
      window.__ia = [];
      await bancGenererIA();
      return { taches: window.__ia.map(x => x.tache),
               familles: window.__ia.map(x => x.params && x.params.famille),
               profil: (window.__ia[0] || {}).params || {},
               mesures: bancEtat.mesures,
               fams: Object.keys(bancEtat.fams) };
    });
    ok(r1.taches.length === 4 && r1.taches.every(t => t === 'suggestions_famille'),
       'quatre appels, tous sur `suggestions_famille` (' + r1.taches.join(', ') + ')');
    ok(r1.familles.join(',') === 'tout,film,serie,anime',
       'une requête par famille, dans l\'ordre : ' + r1.familles.join(', '));
    ok(!JSON.stringify(r1.profil).match(/moi|token/),
       'ce qui part ne contient ni identifiant ni jeton');
    ok(Array.isArray(r1.profil.aimes), 'le profil agrégé part bien (titres aimés, podium, genres)');

    titre('§3 ① — chaque titre affiché correspond à un id TMDB réel');
    const r2 = await page.evaluate(()=>{
      const e = bancEtat.fams.tout;
      const noms = [];
      const ids = [];
      (e.ia.rangees || []).forEach(r => r.l.forEach(x=>{ noms.push(x.nom); ids.push(x.id); }));
      return { noms: noms, ids: ids,
               rangees: (e.ia.rangees || []).map(r => r.titre),
               jetes: e.ia.jetes };
    });
    ok(r2.ids.length > 0 && r2.ids.every(i => typeof i === 'number' && i > 0),
       'tous les titres retenus portent un id TMDB : ' + r2.ids.join(', '));
    ok(r2.noms.indexOf('Heat') >= 0 && r2.noms.indexOf('Prisoners') >= 0,
       'les titres réels sont passés : ' + r2.noms.join(', '));
    ok(r2.noms.indexOf('Le Film Qui N Existe Pas') < 0, 'le titre inventé n\'est PAS affiché');
    ok(r2.noms.indexOf('Dune') < 0, 'le titre ambigu (deux Dune, aucune année) n\'est PAS affiché');

    titre('§3 ② — les jetés sont comptés, avec leur raison, et VISIBLES à l\'écran');
    const r3 = await page.evaluate(()=>{
      const html = document.getElementById('app').innerHTML;
      const e = bancEtat.fams.tout;
      return { jetes: e.ia.jetes,
               dansLEcran: html.indexOf('jeté') >= 0,
               nomJete: html.indexOf('Le Film Qui N Existe Pas') >= 0,
               raisons: html.indexOf('introuvable') >= 0 && html.indexOf('ambigu') >= 0,
               mesuresAffichees: html.indexOf('requêtes TMDB de vérification') >= 0 &&
                                 html.indexOf('titres jetés') >= 0,
               tmdbCompte: bancEtat.mesures.tmdb, duree: bancEtat.mesures.ms };
    });
    ok(r3.jetes.length >= 2, r3.jetes.length + ' titres jetés, comptés : ' +
       r3.jetes.map(j => j.nom + ' (' + j.raison + ')').join(' · '));
    ok(r3.dansLEcran && r3.nomJete && r3.raisons, 'ils sont listés à l\'écran, avec leur raison');
    ok(r3.mesuresAffichees, 'le banc affiche le taux de jetés, les requêtes TMDB et la durée');
    ok(r3.tmdbCompte > 0 && typeof r3.duree === 'number',
       r3.tmdbCompte + ' requêtes TMDB de vérification, ' + r3.duree + ' ms');

    titre('§4 ④ — l\'écran Découvrir réel n\'a pas bougé d\'un caractère');
    const apresDisc = await page.evaluate(()=>{
      go('discover', {});
      render();
      return document.getElementById('app').innerHTML;
    });
    ok(apresDisc === avantDisc, 'Découvrir est identique avant / après le banc');
    const r4 = await page.evaluate(()=> (ui.disc && ui.disc.type) || 'tout');
    ok(r4 === 'tout', 'la puce de Découvrir a été remise là où le banc l\'avait trouvée');

    titre('§5 ③ — les votes s\'enregistrent, se retirent, et s\'exportent');
    const r5 = await page.evaluate(async ()=>{
      go('banc', { from:'settings' });
      const t = bancEtat.fams.tout.ia.rangees[0].titre;
      bancVoter('tout', t, 1);
      const un = bancVoteDe('tout', t);
      const dansEcran = /bncp on/.test(document.getElementById('app').innerHTML);
      bancVoter('tout', t, 1);                 // même pouce → on retire
      const zero = bancVoteDe('tout', t);
      bancVoter('tout', t, -1);
      const moins = bancVoteDe('tout', t);
      /* La persistance : c'est localStorage, on relit à froid. */
      const brut = JSON.parse(localStorage.getItem('ms.banc.v1') || '{}');
      /* L'export : on intercepte le clic plutôt que d'écrire un fichier. */
      let nomFichier = '', contenu = null;
      const vraiClic = HTMLAnchorElement.prototype.click;
      const vraiBlob = URL.createObjectURL;
      HTMLAnchorElement.prototype.click = function(){ nomFichier = this.download; };
      URL.createObjectURL = function(b){ contenu = b; return 'blob:faux'; };
      bancExporterVotes();
      HTMLAnchorElement.prototype.click = vraiClic;
      URL.createObjectURL = vraiBlob;
      const texte = contenu ? await contenu.text() : '';
      return { un:un, zero:zero, moins:moins, dansEcran:dansEcran,
               garde: Object.keys(brut).length, nomFichier:nomFichier,
               json: texte ? JSON.parse(texte) : null, nb: bancNbVotes() };
    });
    ok(r5.un === 1 && r5.zero === 0 && r5.moins === -1,
       'un pouce se pose, se retire en le retouchant, et bascule');
    ok(r5.dansEcran, 'le vote se voit à l\'écran');
    ok(r5.garde === 1 && r5.nb === 1, 'il est enregistré en local');
    ok(/^banc-ia-\d{4}-\d{2}-\d{2}\.json$/.test(r5.nomFichier),
       'l\'export produit un fichier daté : ' + r5.nomFichier);
    ok(r5.json && r5.json.quoi === 'banc-essai-ia' && r5.json.familles &&
       r5.json.familles.tout && r5.json.familles.tout.rangees.length,
       'il contient les votes, les mesures ET les rangées jugées');

    await page.close();
  }

  /* ===== ⑥ — IA coupée ================================================== */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
    await decor(page, { iaCoupee:true });

    titre('§6 ⑥ — IA coupée : le banc le dit, et rien d\'autre ne bouge');
    const avantDisc = await page.evaluate(async ()=>{
      go('discover', {});
      await chargerSuggestions();
      for(let i=0; i<100 && suggCourantes().etat !== 'ok'; i++) await new Promise(r=>setTimeout(r,20));
      render();
      return document.getElementById('app').innerHTML;
    });
    const r6 = await page.evaluate(async ()=>{
      go('banc', { from:'settings' });
      window.__ia = [];
      const tmdbAvant = window.__tmdb.length;
      await bancGenererIA();
      const html = document.getElementById('app').innerHTML;
      return { requetesIA: window.__ia.length,
               ledit: html.indexOf('coupée') >= 0,
               rangees: (bancEtat.fams.tout.ia.rangees || []).length,
               tmdbVerif: bancEtat.mesures.tmdb,
               tmdbTotal: window.__tmdb.length - tmdbAvant };
    });
    ok(r6.requetesIA === 0, 'aucune requête IA n\'est partie');
    ok(r6.ledit, 'le banc écrit que l\'IA est coupée');
    ok(r6.rangees === 0 && r6.tmdbVerif === 0, 'aucune rangée, aucune vérification');
    const apresDisc = await page.evaluate(()=>{ go('discover', {}); render();
                                                return document.getElementById('app').innerHTML; });
    ok(apresDisc === avantDisc, 'Découvrir est identique, au caractère près');

    await page.close();
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
