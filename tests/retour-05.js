/* ---------------------------------------------------------------------------
   RETOUR-05 — ACTIVER LES NOTIFICATIONS SANS CHASSE AU TRÉSOR.

       cd <depot> && python3 -m http.server 8099 &
       node tests/retour-05.js

   Écrit sur le modèle de `tests/nav-centre-spec10.js` : mêmes vrais gestes,
   même lanceur, même sortie. Une suite à part plutôt que des cas dans
   `test.html`, et pour la raison qui vaut ici : le défaut que ce lot corrige
   ÉTAIT un défaut d'écran. L'écran annonçait « Pas encore autorisées » et ne
   proposait rien ; aucune fonction ne mentait, c'est le rendu qui ne portait
   pas de bouton. Un cas qui appelle `etatNotif()` ne l'aurait jamais vu.
   On rend donc les écrans pour de bon, et on lit ce qu'ils portent.

   Le seul décor truqué, ce sont les QUATRE fonctions qui interrogent le monde
   extérieur — le navigateur, iOS, la permission de notification. Chromium sans
   iPhone ne peut pas les fournir, et les éprouver ne dirait rien. Tout le
   reste — `etatNotif`, `viewNotifications`, `invitPushEtat`, `carteInvitPush`,
   `viewCentre`, la synchro — est le vrai code du dépôt.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';

let soucis = 0;
function ok(cond, msg){
  console.log((cond ? '   ✓ ' : '   ✗ ') + msg);
  if(!cond) soucis++;
}
function titre(t){ console.log('\n' + t); }

/* Une session ouverte, un cercle, aucune écriture réseau. `monde()` est posée
   côté page : elle remplace les quatre interrogations du monde, et rend de quoi
   les remettre — un cas ne doit pas hériter du décor du précédent. */
async function decor(page){
  await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
  await page.evaluate(()=>{
    window.tmdb = async ()=> ({ results:[], total_pages:1, total_results:0 });
    window.sbFetch = async ()=> ([]);
    db.auth = { token:'x', uid:'moi' };
    db.notifLus = {};
    partage.suivis = [{ id:'u2', pseudo:'Camille' }];
    partage.abonnes = []; partage.charge = true;
    conseils = { recues:[], envoyees:[], charge:true };
    migrerNotif();
    db.notif.abo = null; db.notif.erreur = null; db.notif.titres = {};
    db.notif.invitPush = 0;
    window.monde = (o)=>{
      const v = { p:notifPossibles, q:permissionNotif, i:estIOS, a:surEcranAccueil };
      notifPossibles  = ()=> o.possible !== false;
      permissionNotif = ()=> o.permission || 'default';
      estIOS          = ()=> !!o.ios;
      surEcranAccueil = ()=> o.accueil !== false;
      return ()=>{ notifPossibles = v.p; permissionNotif = v.q;
                   estIOS = v.i; surEcranAccueil = v.a; };
    };
    /* Aucun cas de cette suite ne veut voir partir une vraie inscription : on
       compte les appels au lieu de les jouer. Les deux fonctions remplacées
       sont éprouvées ailleurs (app-09, depuis I6) — ce qu'on éprouve ICI, c'est
       qu'un seul chemin les enchaîne, et dans le bon ordre. */
    window.__appels = [];
    demanderPermissionNotif = async ()=>{ window.__appels.push('permission');
                                          return window.__accorde !== false; };
    reinscrire = async ()=>{ window.__appels.push('inscription');
                             db.notif.abo = 'https://push.example/abc'; };
    window.__accorde = true;
  });
}

(async ()=>{
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport:{width:390,height:844}, hasTouch:true });
  await decor(page);

  /* ===== §1 — le bouton, et le seul état qui en veut un ==================== */
  titre('§1 — le bouton « Activer les notifications », et lui seul');
  {
    const r = await page.evaluate(()=>{
      const lu = {};
      const cas = {
        jamais:     { permission:'default' },
        refus:      { permission:'denied' },
        accueil:    { possible:false, ios:true, accueil:false },
        noninscrit: { permission:'granted' }
      };
      Object.keys(cas).forEach(nom=>{
        const fin = monde(cas[nom]);
        db.notif.titres = (nom === 'noninscrit') ? { 'tv:1':Date.now() } : {};
        go('notifs', { from:'settings' });
        const h = document.getElementById('app').innerHTML;
        lu[nom] = { cle: etatNotif().cle,
                    bouton: /activerNotifications\(\)/.test(h),
                    inscrire: /reinscrire\(\)/.test(h),
                    sous: etatNotif().sous };
        fin();
      });
      return lu;
    });
    ok(r.jamais.cle === 'jamais' && r.jamais.bouton,
       'l\'écran « Pas encore autorisées » porte enfin un bouton pour autoriser');
    ok(!r.refus.bouton && r.refus.cle === 'refus',
       'refusées : aucun bouton — iOS ne repose jamais la question');
    ok(!r.accueil.bouton && r.accueil.cle === 'accueil',
       'onglet Safari : aucun bouton — il n\'y a rien à activer');
    ok(!r.noninscrit.bouton && r.noninscrit.inscrire,
       '« appareil non inscrit » garde son bouton à lui, et n\'en gagne pas un second');
    ok(/recommandations/.test(r.jamais.sous) && !/cloche/i.test(r.jamais.sous),
       'le sous-titre dit ce qu\'on y gagne au lieu d\'où chercher (obtenu : '+
       r.jamais.sous+')');
    ok(/Réglages/.test(r.refus.sous),
       'le sous-titre du refus n\'a pas bougé : il reste le seul chemin');
  }

  /* ===== §1 — un compte déjà inscrit ne voit rien de neuf ================== */
  titre('§1 — un compte déjà inscrit ne voit NI le bouton NI la carte');
  {
    const r = await page.evaluate(()=>{
      const fin = monde({ permission:'granted' });
      db.notif.titres = { 'tv:1':Date.now() };
      db.notif.abo = 'https://push.example/abc';
      go('notifs', { from:'settings' });
      const h = document.getElementById('app').innerHTML;
      const out = { cle:etatNotif().cle, bouton:/activerNotifications\(\)/.test(h),
                    inscrire:/reinscrire\(\)/.test(h), carte:carteInvitPush() };
      db.notif.abo = null; fin();
      return out;
    });
    ok(r.cle === 'ok' && !r.bouton && !r.inscrire,
       'l\'écran d\'un compte actif est inchangé');
    ok(r.carte === '', 'la carte du centre ne s\'affiche pas quand le push est actif');
  }

  /* ===== §2 — la carte du centre ========================================== */
  titre('§2 — la carte d\'invitation en tête du centre');
  {
    const r = await page.evaluate(async ()=>{
      const out = {};
      let fin = monde({ permission:'default' });
      go('centre', { from:'discover' });
      await new Promise(x=>setTimeout(x, 60));
      let h = document.getElementById('app').innerHTML;
      out.videAvecCarte = /data-invit="carte"/.test(h);
      out.videDitVide   = /Rien pour l/.test(h);
      out.avantGroupe   = h.indexOf('data-invit');
      /* Avec du contenu : la carte doit rester en TÊTE, avant le premier groupe. */
      conseils.recues = [{ id:'r1', de:'u2', vers:'moi', type:'tv', tmdb_id:1399,
                           titre:'Severance', cree:new Date().toISOString(), mot:'' }];
      render();
      await new Promise(x=>setTimeout(x, 60));
      h = document.getElementById('app').innerHTML;
      out.pleinAvecCarte = /data-invit="carte"/.test(h);
      out.enTete = h.indexOf('data-invit') > 0 && h.indexOf('sectitle') > 0 &&
                   h.indexOf('data-invit') < h.indexOf('sectitle');
      /* La pastille ne la compte JAMAIS : elle n'est pas une notification. */
      out.nonLus = nbNonLusCentre();
      db.notifLus['reco:r1'] = Date.now();
      out.nonLusToutLu = nbNonLusCentre();
      out.pastille = /cbadge/.test(clocheCentre());
      fin();
      /* Refusées : rien. Safari sur iPhone : la ligne sobre, sans bouton. */
      fin = monde({ permission:'denied' });
      out.refus = { etat:invitPushEtat(), html:carteInvitPush() };
      fin();
      fin = monde({ possible:false, ios:true, accueil:false });
      out.safari = { etat:invitPushEtat(), html:carteInvitPush() };
      fin();
      fin = monde({ possible:false });
      out.sansPush = invitPushEtat();
      fin();
      return out;
    });
    ok(r.videAvecCarte && r.videDitVide,
       'fil vide : la carte est là — celui qui n\'a rien reçu est celui dont le push est éteint');
    ok(r.pleinAvecCarte && r.enTete, 'avec du contenu, la carte reste en tête du fil');
    ok(r.nonLus === 1 && r.nonLusToutLu === 0,
       'la carte ne se compte pas elle-même dans les non-lus (obtenu : '+
       r.nonLus+' puis '+r.nonLusToutLu+')');
    ok(!r.pastille, 'la pastille ne s\'allume pas pour l\'invitation');
    ok(r.refus.etat === 'rien' && r.refus.html === '',
       'refusées : aucune carte — on ne propose pas ce qu\'iOS ne permettra pas');
    ok(r.safari.etat === 'accueil' && /écran d.accueil/.test(r.safari.html) &&
       !/activerNotifications\(\)/.test(r.safari.html) &&
       !/plusTardInvitPush\(\)/.test(r.safari.html),
       'onglet Safari : la ligne sobre, sans bouton — un constat ne se repousse pas');
    ok(r.sansPush === 'rien', 'un navigateur sans push ne voit ni carte ni ligne iOS');
  }

  /* ===== §2 — « Plus tard » : trente jours, datés, synchronisés ============ */
  titre('§2 — « Plus tard » : trente jours de silence, qui voyagent');
  {
    const r = await page.evaluate(()=>{
      const fin = monde({ permission:'default' });
      db.notif.invitPush = 0;
      const out = { avant:invitPushEtat() };
      plusTardInvitPush();
      out.date = db.notif.invitPush > 0;
      out.apres = invitPushEtat();
      db.notif.invitPush = Date.now() - 29*86400000; out.j29 = invitPushEtat();
      db.notif.invitPush = Date.now() - 31*86400000; out.j31 = invitPushEtat();
      /* La synchro : il monte par le bloc `notif`, il se fusionne au plus
         récent, et il ne recule pas. */
      const t = Date.now();
      db.notif.invitPush = t;
      out.monte = payload().notif.invitPush === t;
      fusionnerNotif({ invitPush: t + 1000 });
      out.avance = db.notif.invitPush === t + 1000;
      fusionnerNotif({ invitPush: t });
      fusionnerNotif({});
      out.reculePas = db.notif.invitPush === t + 1000;
      db.notif.invitPush = 0;
      fin();
      return out;
    });
    ok(r.avant === 'carte' && r.apres === 'rien' && r.date,
       '« Plus tard » date le silence et fait taire la carte');
    ok(r.j29 === 'rien' && r.j31 === 'carte',
       'le silence dure trente jours, pas moins, pas toujours');
    ok(r.monte, 'le « Plus tard » part bien à la synchro');
    ok(r.avance, 'la date la plus récente gagne entre deux appareils');
    ok(r.reculePas,
       'un pair plus ancien — ou resté en v98, sans la clé — ne ressuscite pas la carte');
  }

  /* ===== Un seul chemin d'activation ====================================== */
  titre('Le chemin d\'activation : la question d\'iOS PUIS l\'inscription');
  {
    const r = await page.evaluate(async ()=>{
      const fin = monde({ permission:'default' });
      const out = {};
      window.__appels = []; window.__accorde = true;
      await activerNotifications();
      out.accorde = window.__appels.slice();
      /* Refus : on n'inscrit RIEN. Une ligne dans `push_appareils` vers un
         appareil qui ne sonnera jamais est pire que pas de ligne. */
      db.notif.abo = null;
      window.__appels = []; window.__accorde = false;
      await activerNotifications();
      out.refuse = window.__appels.slice();
      /* Et le bouton de la carte appelle la MÊME fonction que celui de l'écran :
         un seul chemin, c'est la consigne du §1. */
      out.memeChemin = /activerNotifications\(\)/.test(carteInvitPush());
      fin();
      return out;
    });
    ok(JSON.stringify(r.accorde) === JSON.stringify(['permission','inscription']),
       'accordée : la question puis l\'inscription, dans cet ordre');
    ok(JSON.stringify(r.refuse) === JSON.stringify(['permission']),
       'refusée : aucune inscription n\'est tentée');
    ok(r.memeChemin,
       'la carte du centre et l\'écran Notifications appellent le même chemin');
  }

  await nav.close();
  console.log(soucis ? '\nÉCHEC — ' + soucis + ' problème(s)' : '\nTout est vert.');
  process.exit(soucis ? 1 : 0);
})();
