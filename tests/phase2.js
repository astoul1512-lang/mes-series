/* ---------------------------------------------------------------------------
   Phase 2 de la revue du 07/08 — les correctifs C1 à C9, verrouillés.

       cd <depot> && python3 -m http.server 8099 &
       node tests/phase2.js

   Chaque vérification rejoue LE GESTE du constat, dans l'app réelle, avec de
   vrais événements tactiles quand le constat en vient. Ce fichier a servi deux
   fois, comme `tests/nav-cycle3.js` : exécuté contre `main` (v87 avant
   correctifs), il échoue sur C1 (6 écouteurs posés, 0 retirés ; couche
   d'arrivée retirée pendant que l'écran quitté est encore affiché), C2 (retour
   de fiche en haut), C4 (l'écran ouvert disparaît), C6 (onglet « Découvrir »
   depuis Mes goûts), C7 (casting contaminé) et C3 (aucune entrée derrière la
   feuille) ; exécuté contre cette livraison, il passe entièrement.
   C8 et C9 sont des changements de coût (écriture différée, décodage,
   taille d'image) : la partie observable — l'attribut `decoding`, la taille
   demandée, l'absence d'écriture forcée sur `blur` — est vérifiée ici aussi.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';

let soucis = 0;
function ok(cond, msg){
  console.log((cond ? '   ✓ ' : '   ✗ ') + msg);
  if(!cond) soucis++;
}

/* Le décor : une session, un faux TMDB, une bibliothèque assez grande pour
   qu'une fiche soit longue (une saison de 60 épisodes). */
async function decor(page){
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
  await page.evaluate(()=>{
    window.tmdb = async (chemin, q)=>{
      if(q && q.append_to_response && /credits/.test(q.append_to_response)){
        return { credits: { cast: Array.from({length:16},(_,i)=>(
                 { id: 9000+i, name:'Acteur '+i, profile_path:'/a'+i+'.jpg', character:'Rôle '+i })) },
                 videos: { results: [] } };
      }
      if(/\/genre\//.test(chemin)) return { genres: [] };
      return { results: [], total_pages: 1 };
    };
    db.auth = { token:'t', uid:'u1', email:'a@b.c' }; db.proprio = 'u1';
    const jour = n => new Date(Date.now()-n*86400000).toISOString().slice(0,10);
    const eps = n => Array.from({length:n},(_,k)=>({e:k+1,n:'E'+(k+1),d:jour(400-k),r:42}));
    db.shows = {
      1: { id:1, name:'Serie A', status:'Returning', genres:['Drame'], poster:'/pa.jpg',
           seasons:{1:eps(60)}, watched:{'1x1':1}, addedAt:1, updated:1 },
      2: { id:2, name:'Serie B', status:'Returning', genres:['Action'], poster:'/pb.jpg',
           seasons:{1:eps(12)}, watched:{}, addedAt:1, updated:1 }
    };
    db.movies = { 101: { id:101, title:'Film A', poster:'/f.jpg', seen:true, watchedAt:1, addedAt:1 } };
    ui.rech = null;
  });
}

const doigtDef = `window.__doigt = (type,x,y)=>{
  const t = new Touch({ identifier:1, target:document.body, clientX:x, clientY:y, pageX:x, pageY:y });
  document.body.dispatchEvent(new TouchEvent(type,{ touches: type==='touchend'?[]:[t],
    changedTouches:[t], bubbles:true, cancelable:true }));
};`;

/* Le geste abandonné du constat C1 : on esquisse un retour, on ramène le doigt
   au bord, on attend qu'une image soit peinte (transformation revenue à zéro),
   on relâche. */
const gesteAbandonne = `async ()=>{
  __doigt('touchstart', 10, 300);
  __doigt('touchmove', 30, 300); __doigt('touchmove', 110, 302);
  await new Promise(r=>setTimeout(r,50));
  __doigt('touchmove', 40, 300); __doigt('touchmove', 6, 300);
  await new Promise(r=>setTimeout(r,50));
  __doigt('touchend', 4, 300);
}`;
const gesteAbouti = `async ()=>{
  __doigt('touchstart', 12, 300);
  __doigt('touchmove', 40, 300); __doigt('touchmove', 150, 302);
  await new Promise(r=>setTimeout(r,40));
  __doigt('touchmove', 280, 303); __doigt('touchend', 300, 303);
}`;

(async ()=>{
  const nav = await chromium.launch();

  /* ===== C1 — le guetteur du geste abandonné ============================= */
  {
    const ctx = await nav.newContext({ viewport:{width:390,height:844}, hasTouch:true, serviceWorkers:'block' });
    await ctx.addInitScript(()=>{
      window.__cnt = { add:0, del:0 };
      const vraiAdd = EventTarget.prototype.addEventListener;
      const vraiDel = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function(t,f,o){
        if(t==='transitionend' && this && this.id==='app') window.__cnt.add++;
        return vraiAdd.call(this,t,f,o);
      };
      EventTarget.prototype.removeEventListener = function(t,f,o){
        if(t==='transitionend' && this && this.id==='app') window.__cnt.del++;
        return vraiDel.call(this,t,f,o);
      };
    });
    const page = await ctx.newPage();
    await decor(page);
    const r = await page.evaluate(async ([dd, abandonne, abouti])=>{
      eval(dd);
      const journal = [];
      new MutationObserver(ms=>{
        for(const m of ms) for(const n of m.removedNodes){
          if(n.nodeType===1 && n.classList && n.classList.contains('souscran'))
            journal.push(view);
        }
      }).observe(document.body, { childList:true });
      /* l'app a démarré déconnectée : on se place d'abord sur l'onglet, pour
         que le retour du geste vise « En cours » et pas la porte d'entrée */
      go('follow', {}, 'none');
      amorcerHistorique();
      go('show', { id:1, from:'follow' }, 'enter');
      await new Promise(r2=>setTimeout(r2,250));
      for(let i=0;i<3;i++){ await eval(abandonne)(); await new Promise(r2=>setTimeout(r2,420)); }
      const bilanAbandons = { ...window.__cnt };
      await eval(abouti)();
      await new Promise(r2=>setTimeout(r2,1200));
      return { bilanAbandons, retraitsCouche: journal, vue: view };
    }, [doigtDef, gesteAbandonne, gesteAbouti]);
    console.log('C1 — le geste de retour abandonné ne laisse plus de guetteur');
    ok(r.bilanAbandons.add === 3 && r.bilanAbandons.del === 3,
       'chaque écouteur posé est retiré ('+r.bilanAbandons.add+' posés, '+r.bilanAbandons.del+' retirés — avant correctif : 3 posés, 0 retiré)');
    ok(r.vue === 'follow', 'le vrai retour suivant aboutit (obtenu : '+r.vue+')');
    const retraitPendantVrai = r.retraitsCouche[r.retraitsCouche.length-1];
    ok(retraitPendantVrai === 'follow',
       'la couche d’arrivée n’est retirée qu’une fois l’écran d’arrivée rendu (retirée sur : '+retraitPendantVrai+' — avant correctif : sur l’écran quitté)');
    await ctx.close();
  }

  /* ===== C2 — la position des fiches ===================================== */
  {
    const ctx = await nav.newContext({ viewport:{width:390,height:844}, hasTouch:true, serviceWorkers:'block' });
    const page = await ctx.newPage();
    await decor(page);
    const r = await page.evaluate(async ()=>{
      go('show', { id:1, from:'follow' }, 'enter');
      await new Promise(r2=>setTimeout(r2,250));
      const tete = document.querySelector('.shead'); if(tete) tete.click();
      await new Promise(r2=>setTimeout(r2,250));
      window.scrollTo(0, 1200);
      await new Promise(r2=>setTimeout(r2,80));
      const yPose = window.scrollY;
      go('acteur', { id:9001, from:'show' }, 'enter');
      await new Promise(r2=>setTimeout(r2,250));
      goBack();
      await new Promise(r2=>setTimeout(r2,900));
      const auRetour = { vue: view, y: window.scrollY };
      /* une ouverture NEUVE de la même fiche part du haut */
      go('follow', {}, 'none');
      await new Promise(r2=>setTimeout(r2,150));
      go('show', { id:1, from:'follow' }, 'enter');
      await new Promise(r2=>setTimeout(r2,250));
      return { yPose, auRetour, ouvertureNeuveY: window.scrollY };
    });
    console.log('C2 — la position de lecture des fiches');
    ok(r.auRetour.vue === 'show' && Math.abs(r.auRetour.y - r.yPose) < 40,
       'revenir sur la fiche rend la position (posée '+r.yPose+', obtenue '+r.auRetour.y+' — avant correctif : 0)');
    ok(r.ouvertureNeuveY === 0,
       'ouvrir la fiche À NEUF part du haut (obtenu : '+r.ouvertureNeuveY+')');
    await ctx.close();
  }

  /* ===== C7 — le casting d'une fiche ne déteint plus sur une autre ======= */
  {
    const ctx = await nav.newContext({ viewport:{width:390,height:844}, hasTouch:true, serviceWorkers:'block' });
    const page = await ctx.newPage();
    await decor(page);
    const r = await page.evaluate(async ()=>{
      go('show', { id:1, from:'follow' }, 'enter');
      await new Promise(r2=>setTimeout(r2,600));
      goBack(); await new Promise(r2=>setTimeout(r2,800));
      go('show', { id:2, from:'follow' }, 'enter');
      await new Promise(r2=>setTimeout(r2,600));
      const railB = document.querySelector('[data-rail="cast"]');
      if(!railB) return { erreur:'pas de rail casting' };
      railB.scrollLeft = 320;
      await new Promise(r2=>setTimeout(r2,100));
      goBack(); await new Promise(r2=>setTimeout(r2,800));
      go('show', { id:1, from:'follow' }, 'enter');
      await new Promise(r2=>setTimeout(r2,400));
      const railA = document.querySelector('[data-rail="cast"]');
      return { obtenuSurA: railA ? railA.scrollLeft : null };
    });
    console.log('C7 — les rangées de casting');
    ok(r.obtenuSurA === 0,
       'la fiche A s’ouvre avec SON casting au début (obtenu : '+r.obtenuSurA+' — avant correctif : 320, la position de la fiche B)');
    await ctx.close();
  }

  /* ===== C6 — l'onglet allumé ============================================ */
  {
    const ctx = await nav.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block' });
    const page = await ctx.newPage();
    await decor(page);
    const r = await page.evaluate(async ()=>{
      go('profile', {}, 'none');
      go('settings', { from:'profile' }, 'enter');
      go('gouts', { from:'settings' }, 'enter');
      await new Promise(r2=>setTimeout(r2,150));
      go('preview', { id:101, type:'movie', from:'gouts' });
      await new Promise(r2=>setTimeout(r2,200));
      const on = [...document.querySelectorAll('#nav .tab')].find(t=>t.classList.contains('on'));
      return { onglet: on ? on.textContent.trim() : '(aucun)' };
    });
    console.log('C6 — l’onglet allumé en bas');
    ok(r.onglet === 'Mon profil',
       'un aperçu ouvert depuis Mes goûts allume « Mon profil » (obtenu : « '+r.onglet+' » — avant correctif : « Découvrir »)');
    await ctx.close();
  }

  /* ===== C4 — le retour différé n'emporte plus l'écran ouvert ============ */
  {
    const ctx = await nav.newContext({ viewport:{width:390,height:844}, hasTouch:true, serviceWorkers:'block' });
    const page = await ctx.newPage();
    await decor(page);
    const r = await page.evaluate(async ([dd, abouti])=>{
      eval(dd);
      go('search', {}, 'none');
      await new Promise(r2=>setTimeout(r2,150));
      go('show', { id:1, from:'search' }, 'enter');
      await new Promise(r2=>setTimeout(r2,200));
      const vraiBack = history.back.bind(history);
      let differe = null;
      history.back = ()=>{ differe = vraiBack; };   // le navigateur diffère le retour
      await eval(abouti)();
      await new Promise(r2=>setTimeout(r2,350));
      history.back = vraiBack;
      go('show', { id:2, from:'search' }, 'enter');  // l'utilisateur enchaîne AVANT le secours
      await new Promise(r2=>setTimeout(r2,100));
      const ouverte = view+':'+params.id;
      await new Promise(r2=>setTimeout(r2,900));     // la fenêtre où le secours redessinait
      const apresFenetre = view+':'+params.id;
      if(differe) differe();                          // le retour différé part enfin
      await new Promise(r2=>setTimeout(r2,500));
      return { ouverte, apresFenetre, finale: view+':'+params.id };
    }, [doigtDef, gesteAbouti]);
    console.log('C4 — un retour différé par le navigateur');
    ok(r.apresFenetre === r.ouverte,
       'le secours de 900 ms ne redessine plus par-dessus l’écran ouvert (resté : '+r.apresFenetre+')');
    ok(r.finale === r.ouverte,
       'le popstate retardataire est neutralisé, l’écran ouvert reste (obtenu : '+r.finale+' — avant correctif : l’app naviguait deux fois toute seule)');
    await ctx.close();
  }

  /* ===== C3 — le bouton du téléphone et les états plein écran ============ */
  {
    const ctx = await nav.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block' });
    const page = await ctx.newPage();
    await decor(page);
    console.log('C3 — le bouton retour du téléphone');
    /* Contre l'ancienne version, ce scénario QUITTE réellement la page — le
       contexte du test est détruit : c'est très exactement le bug. On
       l'attrape pour que la preuve se lise en clair au lieu de planter. */
    let r1 = null;
    try{
      r1 = await page.evaluate(async ()=>{
        /* le cas critique du constat : on est ENTRÉ sur un onglet — les onglets
           se substituent, il n'y a aucune entrée interne derrière */
        go('search', {}, 'none');
        amorcerHistorique();
        await new Promise(r2=>setTimeout(r2,150));
        const b = [...document.querySelectorAll('#app button, #app .chip')].find(x=>/préciser|filtr|affiner/i.test(x.textContent));
        if(b) b.click();
        await new Promise(r2=>setTimeout(r2,250));
        const avant = { feuille: document.getElementById('sheet').classList.contains('show'),
                        derriere: historiqueInterne() };
        history.back();                                          // le bouton du téléphone
        await new Promise(r2=>setTimeout(r2,400));
        return { avant, feuilleApres: document.getElementById('sheet').classList.contains('show'), vue: view };
      });
    }catch(e){ r1 = null; }
    ok(!!r1 && r1.avant.feuille && r1.avant.derriere === 0,
       r1 ? 'le décor est le cas critique : feuille ouverte, aucune entrée interne derrière'
          : 'SORTIE DE L’APP : le bouton retour a quitté la page avec la feuille ouverte (le bug du constat C3)');
    ok(!!r1 && !r1.feuilleApres && r1.vue === 'search',
       'le bouton ferme la feuille et on RESTE dans l’app (avant correctif : sortie de l’app, recherche perdue)');
    if(!r1){ await decor(page); }   // la page est partie : on la remet en place pour la suite
    const r2 = await page.evaluate(async ()=>{
      const b = [...document.querySelectorAll('#app button, #app .chip')].find(x=>/préciser|filtr|affiner/i.test(x.textContent));
      if(b) b.click();
      await new Promise(r3=>setTimeout(r3,250));
      closeSheet();                                            // fermeture DANS l'app
      await new Promise(r3=>setTimeout(r3,400));
      return { vue: view, etat: history.state && history.state.view,
               feuille: document.getElementById('sheet').classList.contains('show') };
    });
    ok(!r2.feuille && r2.vue === 'search' && r2.etat === 'search',
       'une fermeture dans l’app retire aussi l’entrée-garde : l’historique retombe sur l’écran, sans appui fantôme');
    const r3 = await page.evaluate(async ()=>{
      ouvrirJeuRech();
      await new Promise(r4=>setTimeout(r4,300));
      const avant = !!etatRech().jeu;
      history.back();
      await new Promise(r4=>setTimeout(r4,400));
      return { avant, jeuApres: !!etatRech().jeu, vue: view };
    });
    ok(r3.avant && !r3.jeuApres && r3.vue === 'search',
       'le bouton ferme le JEU de Recherche au lieu de quitter l’écran (avant correctif : partie perdue)');
    const r4 = await page.evaluate(async ()=>{
      go('profile', {}, 'none');
      await new Promise(r5=>setTimeout(r5,150));
      ouvrirRechPf12();
      await new Promise(r5=>setTimeout(r5,200));
      const avant = pf12.ouvert;
      goBack();                                                // la flèche, désormais au courant
      await new Promise(r5=>setTimeout(r5,300));
      return { avant, ouvertApres: pf12.ouvert, vue: view };
    });
    ok(r4.avant && !r4.ouvertApres && r4.vue === 'profile',
       'la flèche ferme la recherche plein écran du profil au lieu de ne rien faire');
    await ctx.close();
  }

  /* ===== C5 — plus de redessin non sollicité en fin de synchro =========== */
  {
    const ctx = await nav.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block' });
    const page = await ctx.newPage();
    await decor(page);
    const r = await page.evaluate(async ()=>{
      /* une synchro qui échoue : le serveur ne répond pas */
      window.sbFetch = async ()=>{ throw new Error('coupé pour le test'); };
      db.sync = { url:'https://exemple.invalid', key:'k' };
      go('show', { id:1, from:'follow' }, 'enter');
      await new Promise(r2=>setTimeout(r2,200));
      let n = 0; const vrai = window.render;
      window.render = function(){ n++; return vrai.apply(this, arguments); };
      await syncNow(true);                       // silencieuse, en échec
      const silencieuseEchec = n;
      await syncNow(false);                      // visible : elle, doit rendre
      const visible = n;
      window.render = vrai;
      return { silencieuseEchec, visible };
    });
    console.log('C5 — la synchro et le redessin');
    ok(r.silencieuseEchec === 0,
       'une synchro silencieuse en échec ne redessine plus rien (avant correctif : un rendu complet à +15 s de chaque geste)');
    ok(r.visible > r.silencieuseEchec,
       'une synchro visible continue de rendre ('+(r.visible - r.silencieuseEchec)+' rendu(s))');
    await ctx.close();
  }

  /* ===== C8/C9 — la partie observable ==================================== */
  {
    const ctx = await nav.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block' });
    const page = await ctx.newPage();
    await decor(page);
    const r = await page.evaluate(async ()=>{
      const html = posterEl('/x.jpg', 'w342', '', 'Titre');
      go('follow', {}, 'none');
      await new Promise(r2=>setTimeout(r2,300));
      const rcarte = document.querySelector('.rcarte img');
      /* C8 : plus d'écriture forcée quand une bande-annonce prend le focus */
      const avant = performance.now();
      window.dispatchEvent(new Event('blur'));
      const dureeBlur = performance.now() - avant;
      return { decodingPartout: /decoding="async"/.test(html),
               srcRattrap: rcarte ? rcarte.getAttribute('src') : '(pas de carte)',
               dureeBlur: Math.round(dureeBlur * 10) / 10 };
    });
    console.log('C8/C9 — écritures et affiches');
    ok(r.decodingPartout,
       'toutes les affiches demandent le décodage en arrière-plan (avant correctif : 1 fabrique sur 18)');
    ok(!/w780/.test(r.srcRattrap || ''),
       'les cartes « À rattraper » ne demandent plus d’image w780 (obtenu : '+String(r.srcRattrap).slice(0,40)+'…)');
    ok(r.dureeBlur < 30,
       'perdre le focus ne bloque plus l’écran par une écriture forcée ('+r.dureeBlur+' ms — avant correctif : ~111 ms)');
    await ctx.close();
  }

  await nav.close();
  console.log('');
  console.log(soucis ? ('✗ ' + soucis + ' vérification(s) en échec.') : 'Tout est vert.');
  process.exit(soucis ? 1 : 0);
})();
