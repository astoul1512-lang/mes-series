/* ---------------------------------------------------------------------------
   RETOUR-07 §1 — COUPER LES NOTIFICATIONS, ET LES RALLUMER.

       cd <depot> && python3 -m http.server 8099 &
       node tests/retour-07.js

   Le manque, dit par Adrien le 29/08 : « je veux un bouton qui nous permet de
   couper les notifs ou de les activer ». RETOUR-05 avait posé un bouton
   d'activation qui ne s'affichait que sur UN état, et rien pour couper — quand
   tout marchait, l'écran ne proposait aucun réglage.

   Ce qui est éprouvé ici n'est PAS « l'interrupteur est à l'écran » (c'est
   `tests/retour-05.js`, §1, retourné pour ce lot). C'est ce que la coupure
   FAIT, et surtout CE QU'ELLE TIENT : une coupure que la première synchro
   défait est un interrupteur décoratif, et c'est le défaut qu'on peut écrire
   sans le voir.

   Même décor que RETOUR-05 : seules les quatre interrogations du monde sont
   truquées, plus le réseau. `oublierAppareil`, `couperNotifications`,
   `inscrireSiBesoin`, `etatNotif`, `invitPushEtat`, `fusionnerNotif` sont le
   vrai code du dépôt.
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
    window.__reseau = [];
    window.sbFetch = async (chemin, opts)=>{
      window.__reseau.push(((opts && opts.method) || 'GET') + ' ' + chemin);
      return [];
    };
    db.auth = { token:'x', uid:'moi' };
    db.notifLus = {};
    partage.suivis = []; partage.abonnes = []; partage.charge = true;
    conseils = { recues:[], envoyees:[], charge:true };
    migrerNotif();
    window.monde = (o)=>{
      const v = { p:notifPossibles, q:permissionNotif, i:estIOS, a:surEcranAccueil };
      notifPossibles  = ()=> o.possible !== false;
      permissionNotif = ()=> o.permission || 'default';
      estIOS          = ()=> !!o.ios;
      surEcranAccueil = ()=> o.accueil !== false;
      return ()=>{ notifPossibles = v.p; permissionNotif = v.q;
                   estIOS = v.i; surEcranAccueil = v.a; };
    };
    /* « Inscrit et qui reçoit » : l'état de départ de tous les cas de coupure. */
    window.actif = ()=>{
      db.notif.coupe = 0;
      db.notif.abo = 'https://push.example/abc';
      db.notif.erreur = null;
      db.notif.titres = { 'tv:1399':Date.now(), 'movie:27205':Date.now() };
      db.notif.aPurger = [];
      window.__reseau = [];
    };
  });
}

(async ()=>{
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
  await decor(page);

  /* ===== Couper ============================================================ */
  titre('Couper : le serveur oublie l\'appareil, les cloches restent');
  {
    const r = await page.evaluate(async ()=>{
      const fin = monde({ permission:'granted' });
      actif();
      go('notifs', { from:'settings' });
      await couperNotifications();
      const e = etatNotif();
      const it = document.querySelector('#app .reg .inter');
      const out = {
        cle:e.cle, ton:e.ton,
        allume: !!(it && it.classList.contains('on')),
        abo: db.notif.abo,
        coupe: db.notif.coupe > 0,
        cloches: Object.keys(db.notif.titres).length,
        supprime: window.__reseau.filter(x=>/^DELETE .*push_appareils/.test(x)).length,
        resume: resumeNotif()
      };
      fin();
      return out;
    });
    ok(r.cle === 'coupe' && r.coupe, 'l\'état devient « coupé », daté');
    ok(r.ton !== 'refus',
       'et il n\'est PAS peint en rouge : un choix délibéré n\'est pas une panne');
    ok(!r.allume, 'l\'interrupteur retombe');
    ok(r.abo === null && r.supprime === 1,
       'la ligne de `push_appareils` est réellement supprimée (1 DELETE), pas seulement ignorée');
    ok(r.cloches === 2, 'les deux cloches sont GARDÉES — couper n\'est pas oublier');
    ok(/[Cc]oup/.test(r.resume),
       'la ligne des Réglages le dit aussi (obtenu : ' + r.resume + ')');
  }

  /* ===== Ce qui pourrait défaire la coupure sans qu'on le voie ============== */
  titre('La coupure TIENT — c\'est le seul vrai risque de ce lot');
  {
    const r = await page.evaluate(async ()=>{
      const fin = monde({ permission:'granted' });
      actif();
      await couperNotifications();
      const out = {};
      /* ① LE CHEMIN DE DÉMARRAGE ET DE RETOUR DE COMPTE.
         Il faut d'abord que ce chemin soit RÉELLEMENT OUVERT, sinon le cas
         passe pour une raison qui n'a rien à voir : `inscrireSiBesoin` sort
         aussi quand il n'y a pas de serveur configuré, et une mutation du 29/08
         (retirer le garde `coupe`) a d'abord SURVÉCU pour cette raison exacte.
         On ouvre donc la porte — serveur, compte, permission — et on bouchonne
         l'abonnement pour compter les tentatives plutôt que les jouer. */
      db.sync = { url:'https://exemple.supabase.co', key:'anon' };
      const va = abonnerAppareil, vp2 = purgerAppareils;
      let tentatives = 0;
      purgerAppareils = async ()=>{};
      abonnerAppareil = async ()=>{ tentatives++;
                                    db.notif.abo = 'https://push.example/zzz';
                                    return true; };
      out.reinscrit = await inscrireSiBesoin();
      out.tentatives = tentatives;
      out.aboApres = db.notif.abo;
      abonnerAppareil = va; purgerAppareils = vp2;
      /* ② la carte d'invitation du fil */
      out.invit = invitPushEtat();
      out.carte = carteInvitPush();
      /* ③ la synchro : un autre appareil, lui, reçoit toujours */
      out.envoye = Object.keys(notifPourSynchro()).indexOf('coupe') >= 0;
      fusionnerNotif({ maj: Date.now() + 1000, coupe: 0, quandChoisi:true,
                       titres:{}, titresOff:{}, films:{ cine:true, maison:true } });
      out.coupeApres = db.notif.coupe > 0;
      /* ④ le changement de compte sur le MÊME téléphone */
      db.proprio = 'quelquun-dautre';
      adopterCompte('moi');
      out.coupeApresCompte = !!(db.notif && db.notif.coupe > 0);
      fin();
      return out;
    });
    ok(r.reinscrit === false && r.tentatives === 0 && r.aboApres === null,
       '`inscrireSiBesoin` n\'essaie MÊME PAS de réinscrire (0 tentative) — sinon l\'interrupteur ne ferait rien');
    ok(r.invit === 'rien' && r.carte === '',
       'le fil ne repropose pas la carte « Active les notifications »');
    ok(!r.envoye, '`coupe` ne part PAS à la synchro : c\'est ce téléphone-ci qu\'on a coupé');
    ok(r.coupeApres, 'un pair qui parle plus récemment ne rallume pas ce téléphone');
    ok(r.coupeApresCompte,
       'changer de compte sur ce téléphone ne le fait pas resonner (`adopterCompte` garde `coupe`)');
  }

  /* ===== Rallumer ========================================================== */
  titre('Rallumer : la question, puis l\'inscription, et l\'état revient');
  {
    const r = await page.evaluate(async ()=>{
      const fin = monde({ permission:'granted' });
      actif();
      await couperNotifications();
      const appels = [];
      const vp = demanderPermissionNotif, vr = reinscrire;
      demanderPermissionNotif = async ()=>{ appels.push('permission');
        /* La coupure doit être levée AVANT qu'on parle au téléphone : sinon
           `inscrireSiBesoin`, appelé plus loin sur les chemins de démarrage,
           retomberait sur un drapeau encore posé. */
        appels.push('coupe=' + (db.notif.coupe > 0 ? 'encore' : 'levee'));
        return true; };
      reinscrire = async ()=>{ appels.push('inscription');
                               db.notif.abo = 'https://push.example/abc'; };
      await basculerNotifications();
      go('notifs', { from:'settings' });   // `reinscrire` est bouchonnée : c'est à nous de peindre
      const e = etatNotif();
      const it = document.querySelector('#app .reg .inter');
      const out = { appels:appels.join(' → '), cle:e.cle,
                    allume:!!(it && it.classList.contains('on')),
                    cloches:Object.keys(db.notif.titres).length };
      demanderPermissionNotif = vp; reinscrire = vr;
      fin();
      return out;
    });
    ok(r.appels === 'permission → coupe=levee → inscription',
       'la coupure est levée avant la question, puis l\'inscription suit (obtenu : ' + r.appels + ')');
    ok(r.cle === 'ok' && r.allume, 'l\'écran redit « autorisées » et l\'interrupteur se rallume');
    ok(r.cloches === 2, 'et les cloches d\'avant la coupure sont toujours là');
  }

  /* ===== L'interrupteur bascule dans les DEUX sens ========================= */
  titre('Un seul geste, deux sens — `basculerNotifications` lit l\'état réel');
  {
    const r = await page.evaluate(async ()=>{
      const fin = monde({ permission:'granted' });
      actif();
      const vp = demanderPermissionNotif, vr = reinscrire;
      demanderPermissionNotif = async ()=> true;
      reinscrire = async ()=>{ db.notif.abo = 'https://push.example/abc'; };
      const suite = [];
      await basculerNotifications(); suite.push(pushActifIci() ? 'on' : 'off');
      await basculerNotifications(); suite.push(pushActifIci() ? 'on' : 'off');
      await basculerNotifications(); suite.push(pushActifIci() ? 'on' : 'off');
      demanderPermissionNotif = vp; reinscrire = vr;
      fin();
      return suite.join(',');
    });
    ok(r === 'off,on,off', 'trois appuis : coupé, rallumé, coupé (obtenu : ' + r + ')');
  }

  /* ===== Le double appui, et le verrou =====================================
     CE CAS A CORRIGÉ LE COMMENTAIRE DU CODE, pas le code. Il était écrit que le
     verrou protégeait du double appui ; il a été mesuré ici qu'il ne PEUT pas —
     le corps de `couperNotifications` est synchrone, le verrou est pris et
     rendu avant que le second appel commence. La vraie protection est le `abo`
     vidé tout de suite. Le verrou, lui, sert au cas CROISÉ, qui est plus bas.
     Un test qui vérifie qu'on APPELLE `prendre` n'aurait rien vu de tout ça. */
  titre('Double appui sur « couper » : un seul DELETE');
  {
    const r = await page.evaluate(async ()=>{
      const fin = monde({ permission:'granted' });
      actif();
      const deux = await Promise.all([couperNotifications(), couperNotifications()]);
      const out = { rendus: deux.filter(Boolean).length,
                    supprime: window.__reseau.filter(x=>/^DELETE .*push_appareils/.test(x)).length,
                    aPurger: (db.notif.aPurger || []).length };
      fin();
      return out;
    });
    ok(r.supprime === 1, 'un seul DELETE — le second appel trouve `abo` déjà nul');
    ok(r.aPurger === 0, 'et rien ne tombe dans la file à purger, qui décrirait une perte imaginaire');
  }

  titre('Le verrou, pour ce qu\'il fait vraiment : couper pendant une activation');
  {
    const r = await page.evaluate(async ()=>{
      const fin = monde({ permission:'granted' });
      actif();
      db.notif.coupe = Date.now(); db.notif.abo = null;   // coupé, on rallume
      const vp = demanderPermissionNotif, vr = reinscrire;
      let debloque;
      const enVol = new Promise(r2=>{ debloque = r2; });
      /* On bloque DANS la question d'iOS : c'est la fenêtre que le défaut du
         29/08 laissait ouverte, entre la permission et l'inscription. */
      demanderPermissionNotif = async ()=>{ await enVol; return true; };
      reinscrire = async ()=>{ db.notif.abo = 'https://push.example/abc'; };
      const activation = activerNotifications();
      /* L'activation attend le réseau. On tente de couper pendant ce temps. */
      const coupePendant = await couperNotifications();
      const griseP = /class="reg" disabled|disabled /.test(
        (function(){ go('notifs', { from:'settings' });
                     return document.getElementById('app').innerHTML; })());
      debloque(); await activation;
      const out = { coupePendant: coupePendant, grise: griseP, abo: db.notif.abo };
      demanderPermissionNotif = vp; reinscrire = vr;
      rendre('cloches'); fin();
      return out;
    });
    ok(r.coupePendant === false,
       'la coupure est REFUSÉE tant que l\'inscription est en vol — sinon elle effacerait une ligne qui n\'existe pas encore');
    ok(r.grise, 'et l\'interrupteur est grisé pendant ce temps-là, au lieu de mentir');
    ok(r.abo === 'https://push.example/abc', 'l\'activation, elle, va jusqu\'au bout');
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
