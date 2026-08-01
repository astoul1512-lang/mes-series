/* ==========================================================================
   Sonde du lot A — mode d'emploi
   --------------------------------------------------------------------------
   Elle n'est PAS lancée par `tests/lance-tests.js` : elle demande Playwright
   et un vrai navigateur, que le lanceur n'exige pas. On l'appelle à la main,
   quand on veut voir l'app se COMPORTER et pas seulement ses fonctions
   répondre.

       python3 -m http.server 8099        # depuis la racine du dépôt
       node tests/sonde-lot-a.js          # dans un autre terminal

   Elle imprime un objet JSON — une clé par observation — puis la liste des
   erreurs de page. Elle sort en code 1 s'il y en a eu une.

   Versionnée parce que les sondes des lots précédents ont disparu avec la
   machine qui les avait écrites.
   ========================================================================== */

/* Sonde manuelle du lot A — elle pilote l'app RÉELLE dans un navigateur.
   `tests/lance-tests.js` ne teste que des fonctions pures ; ici on vérifie que
   les écrans se peignent, que les gestes aboutissent, et que rien n'explose. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:8099';

(async ()=>{
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport:{width:390,height:844} });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('PAGE: '+e.message));
  page.on('console', m => { if(m.type()==='error') erreurs.push('CONSOLE: '+m.text()); });
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });

  const r = await page.evaluate(async ()=>{
    const out = {};
    const jour = n => new Date(Date.now()-n*86400000).toISOString().slice(0,10);
    // --- une base d'essai : 12 films vus, 2 séries ---
    db.auth = { token:'t', uid:'u1', email:'a@b.c' }; db.proprio = 'u1';
    db.shows = {}; db.movies = {}; db.avis = { tv:{}, movie:{} };
    db.avisRetires = { tv:{}, movie:{} };
    db.podium = { film:[], serie:[], anime:[], maj:0 };
    migrerGouts();
    for(let i=1;i<=12;i++)
      db.movies[100+i] = { id:100+i, title:'Film '+i, seen:true, watchedAt:Date.now(),
                           genres: i%2 ? ['Drame'] : ['Action'], date:'201'+(i%10)+'-01-01' };
    const eps = n => Array.from({length:n},(_,k)=>({e:k+1,n:'E'+(k+1),d:jour(30),r:42}));
    db.shows[1] = { id:1, name:'Serie A', status:'Ended', genres:['Drame'],
                    seasons:{1:eps(3), 2:eps(3)}, watched:{'1x1':1,'1x2':1}, addedAt:1, updated:1 };
    db.shows[2] = { id:2, name:'Serie B', status:'Returning', genres:['Action'],
                    seasons:{1:eps(2)}, watched:{'1x1':1}, addedAt:1, updated:1 };

    // --- 1. le poids et le taux ---
    poserAvis('movie', 101, 1);
    poserAvis('movie', 103, -1);
    out.poids = [poidsTitre('movie',101), poidsTitre('movie',102), poidsTitre('movie',103)];
    out.taux = tauxParGenre('film').map(e=>[e.genre, e.vus, e.aimes, Math.round(e.taux*100)]);
    out.ecartes = titresEcartes().map(t=>t.nom);
    out.niveau = niveauProfil();

    // --- 2. la barre « tu as aimé ? » sur une fin de saison ---
    go('show', { id:1 });
    tapEp(1, 1, 3);                       // dernier épisode de la saison 1
    await new Promise(r=>setTimeout(r,60));
    const ba = document.getElementById('barreavis');
    out.barreVisible = !!(ba && ba.classList.contains('show'));
    out.barreTexte = ba ? ba.textContent.replace(/\s+/g,' ').trim() : '';
    out.undoVisible = document.getElementById('undo').classList.contains('show');
    ba.querySelector('.bapouce.oui').click();
    out.avisApresPouce = avisDe('tv', 1);
    out.barreApres = ba.classList.contains('show');

    // --- 3. geste groupé : la barre Annuler reste, la question prend la file ---
    db.avis.tv = {}; db.avisRetires.tv = {};
    toggleWholeSeason(1, 2);
    await new Promise(r=>setTimeout(r,60));
    out.groupeUndo = document.getElementById('undo').classList.contains('show');
    out.groupeAvisDiffere = !document.getElementById('barreavis').classList.contains('show');
    hideUndo();                           // la barre Annuler s'efface d'elle-même
    await new Promise(r=>setTimeout(r,20));
    out.groupeAvisEnsuite = document.getElementById('barreavis').classList.contains('show');
    fermerAvis();

    // --- 4. annuler retire la question ---
    db.avis.tv = {}; db.avisRetires.tv = {};
    db.shows[1].watched = {'1x1':1,'1x2':1,'1x3':1};
    toggleWholeSeason(1, 2);
    await new Promise(r=>setTimeout(r,40));
    doUndo();
    await new Promise(r=>setTimeout(r,40));
    out.apresAnnulerPasDeQuestion = !document.getElementById('barreavis').classList.contains('show');

    // --- 5. le duel ---
    out.famillesPretes = famillesDuel().map(f=>f.cle);
    go('gouts', { from:'settings' });
    out.carteInvit = document.getElementById('app').textContent.indexOf('Le duel') >= 0;
    ouvrirDuel('film');
    out.duelActif = duel.actif;
    out.duelPaire = (duel.paire||[]).map(t=>t.nom);
    out.duelEcran = document.querySelectorAll('.dcarte').length;
    // dix votes
    for(let i=0;i<12 && duel.ecran==='jeu';i++){
      const c = document.querySelectorAll('.dcarte');
      if(!c.length) break;
      c[0].click();
      await new Promise(r=>setTimeout(r,360));
    }
    out.duelFaits = duel.faits;
    out.duelEcranFin = duel.ecran;
    out.podium = (db.podium.film||[]).slice(0,3);
    out.podiumMaj = db.podium.maj > 0;
    out.resultatPeint = document.querySelectorAll('.dpod').length;
    // la liste de rattrapage
    ouvrirRattrapage();
    out.rattrapageLignes = document.querySelectorAll('.rlig').length;
    const pouce = document.querySelector('.rpb.oui');
    if(pouce) pouce.click();
    out.rattrapageAvis = document.querySelectorAll('.rpb.oui.on').length;
    fermerDuel();
    out.retourGouts = view === 'gouts' && !duel.actif;

    // --- 6. la synchro ---
    const p = payload();
    out.payloadCles = ['avis','avisRetires','podium'].filter(k=> p[k] !== undefined);
    // fusion : un avis distant plus récent gagne, un effacement local plus récent tient
    db.avis.movie['201'] = { v:1, quand:1000 };
    db.avisRetires.movie['202'] = 5000;
    mergeRemote({ avis:{ movie:{ '201':{v:-1,quand:2000}, '202':{v:1,quand:3000},
                                 '203':{v:1,quand:9} } },
                  avisRetires:{ movie:{} },
                  podium:{ film:['999'], serie:[], anime:[], maj: Date.now()+1000 } });
    out.fusion = { plusRecentGagne: avisDe('movie',201), effacementTient: avisDe('movie',202),
                   nouveau: avisDe('movie',203), podium: db.podium.film[0] };

    // --- 7. le duel se referme sur le geste de retour ---
    ouvrirDuel('film');
    goBack();
    out.goBackFermeLeDuel = !duel.actif && view === 'gouts';
    return out;
  });

  console.log(JSON.stringify(r, null, 1));
  console.log(erreurs.length ? '\nERREURS :\n' + erreurs.join('\n') : '\nAucune erreur de page.');
  await nav.close();
  process.exit(erreurs.length ? 1 : 0);
})();
