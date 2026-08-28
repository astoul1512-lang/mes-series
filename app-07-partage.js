"use strict";
/* ---------- Vue : Mes abonnements ---------- */
/* ---------------------------------------------------------------------------
   Vue : mes abonnements

   Refonte demandée par Adrien : « la partie abonnement il faut la retravailler ».
   Trois défauts pointés, et corrigés ici.

   1. Les deux formulaires (saisir un code, générer le sien) occupaient tout
      l'écran AVANT les personnes, alors que l'écran existe pour elles. Ils sont
      devenus deux lignes qui ne se déplient qu'à la demande.
   2. « Je suis » est ambigu en français — être ou suivre. Le vocabulaire suit
      désormais les compteurs du profil : mes abonnements, mes abonnés.
   3. La même croix faisait deux choses opposées selon la liste : se désabonner
      d'un côté, couper l'accès de l'autre. L'action se découvre maintenant en
      glissant la ligne vers la gauche, et porte son nom.
--------------------------------------------------------------------------- */
function viewAbos(){
  let html = header('Mes abonnements', {back:"goBack()"});

  if(!signedIn()){
    return html + '<div class="empty">'+I.user+'<h3>Compte requis</h3>'+
      '<p>Le partage passe par ton compte : il faut être connecté pour suivre quelqu\'un.</p>'+
      '<button class="btn" onclick="go(\'account\',{from:\'profile\'})">Ouvrir Compte & synchro</button></div>';
  }

  /* --- les deux actions, repliées --- */
  const ouvert = ui.aboPanneau;
  const ligneAction = (cle, titre, sous, icone, corps)=>
    '<button class="reg" onclick="basculerPanneauAbo(\''+cle+'\')">'+
      '<i>'+icone+'</i>'+
      '<span class="rtxt"><b>'+titre+'</b><em>'+sous+'</em></span>'+
      '<span class="ecaret'+(ouvert===cle?' ouvert':'')+'">'+I.caret+'</span>'+
    '</button>'+
    (ouvert===cle ? '<div class="volet">'+corps+'</div>' : '');

  html += '<div class="wrap" style="padding-bottom:2px">'+
    ligneAction('suivre', 'Suivre quelqu\'un', 'Saisir le code qu\'on t\'a donné', I.plus,
      '<div class="small muted" style="margin-bottom:10px">Demande-lui son code, puis saisis-le ici. '+
      'Tu verras alors sa bibliothèque, en lecture seule.</div>'+
      '<input type="text" id="codein" placeholder="ABC123" autocapitalize="characters" '+
      'autocorrect="off" spellcheck="false" maxlength="8" '+
      'style="text-transform:uppercase;letter-spacing:.12em;text-align:center;font-weight:700">'+
      '<button class="btn block" style="margin-top:10px" '+
        'onclick="utiliserCode(document.getElementById(\'codein\').value)">Valider le code</button>')+
    ligneAction('code', 'Me faire suivre',
      partage.code ? 'Un code actif · '+resteCode() : 'Générer un code à donner', I.user,
      voletCode())+
  '</div>';

  /* --- le partage ne répond pas --- */
  /* I4 — cet écran affichait des instructions SQL à quiconque tombait sur une
     coupure réseau ou un jeton expiré. L'app est livrée avec un serveur
     préconfiguré : PERSONNE n'a de fichier à exécuter. Pire, depuis A3, jouer
     ce fichier-là dégraderait la sécurité — la policy de lecture des profils y
     était en `using(true)` sous un ancien nom. Le détail part en console. */
  if(partage.erreur && !partage.charge){
    console.warn('partage indisponible : ' + partage.erreur);
    html += '<div class="wrap" style="padding-top:0"><div class="banner" style="margin:0;'+
      'display:flex;align-items:center;gap:12px">'+
      '<div style="flex:1"><b>Le partage est momentanément indisponible.</b><br>'+
      '<span class="small">Tes abonnements et ta bibliothèque ne sont pas touchés.</span></div>'+
      '<button class="btn" style="flex:0 0 auto;padding:9px 16px"'+
        (partage.occupe ? ' disabled' : '')+' onclick="chargerPartage()">'+
        (partage.occupe ? '…' : 'Réessayer')+'</button>'+
      '</div></div>';
    return html + '<div style="height:26px"></div>';
  }

  /* --- listes --- */
  if(partage.occupe && !partage.charge){
    html += '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Chargement…</p></div>';
    return html + '<div style="height:26px"></div>';
  }

  const vide = t => '<div class="wrap" style="padding-top:0"><div class="card" style="padding:15px;text-align:center">'+
    '<span class="small muted">'+t+'</span></div></div>';

  /* CYCLE 3, POINT 6 — « X t'a ajouté », en tête : la notification peut être
     refusée, et sur iPhone elle n'existe pas tant que l'app n'est pas sur
     l'écran d'accueil. Ce bloc est le chemin qui marche toujours. */
  html += blocAnnonceAbo();

  /* SPEC-10 §1 — « ON TE CONSEILLE » A QUITTÉ CET ÉCRAN. Le bloc était marqué
     provisoire dans son propre commentaire dès I6 : les recos reçues vivent
     désormais dans le centre de notifications, avec les sorties et les retours.
     « Mes abonnements » redevient ce qu'il est, l'écran des personnes. */

  html += '<div class="sectitle">Mes abonnements'+
    (partage.suivis.length?'<span class="cnt">'+partage.suivis.length+'</span>':'')+'</div>';
  html += partage.suivis.length
    ? '<div class="list">'+partage.suivis.map(p=>ligneAbo(p,'suiveur')).join('')+'</div>'
    : vide('Tu ne suis personne pour l\'instant.');

  html += '<div class="sectitle">Mes abonnés'+
    (partage.abonnes.length?'<span class="cnt">'+partage.abonnes.length+'</span>':'')+'</div>';
  html += partage.abonnes.length
    ? '<div class="list">'+partage.abonnes.map(p=>ligneAbo(p,'suivi')).join('')+'</div>'
    : vide('Personne ne te suit.');

  /* Le geste ne s'annonce pas tout seul : c'est la faiblesse connue de cette
     maquette. Adrien a tranché pour la démonstration jouée une fois plutôt
     qu'une phrase permanente — voir `montrerAstuceGlis`. */

  return html + '<div style="height:26px"></div>';
}

/* ---------------------------------------------------------------------------
   I1 + I2 — le code de partage : le transmettre, et savoir lequel est vivant.

   I1. Le code s'affichait dans une boîte en `user-select:all`, ce qui est la
   bonne intention — mais `body` porte `-webkit-touch-callout:none`, donc iOS
   ne propose pas son menu « Copier » au long appui. Sur l'appareil que l'app
   vise en premier, le seul moyen de transmettre son code était de le dicter.
   Deux boutons, donc. « Envoyer » n'apparaît que si le navigateur sait
   partager : un bouton qui ne fait rien serait pire que pas de bouton.

   I2. « Générer un autre code » ne remplaçait rien : il ajoutait. L'action
   s'appelle maintenant ce qu'elle est, et demande confirmation, parce qu'elle
   invalide un code peut-être déjà donné à quelqu'un.
--------------------------------------------------------------------------- */
function partagePossible(){
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/* Le temps qui reste, en clair. Recalculé à chaque rendu et non rafraîchi par
   une minuterie : l'écran n'est pas fait pour être regardé une heure, et une
   minuterie de plus est une fuite d'écouteur de plus (§B10). */
/* B13 (09/08) — QUAND ON NE SAIT PAS, ON NE DIT RIEN. Sans `partage.expire`,
   la ligne affichait « valable 24 h » : une hypothèse — la durée par défaut du
   serveur — présentée comme un fait, sur le seul élément de l'écran qui engage
   quelqu'un d'autre. Elle rend maintenant une chaîne vide, et `voletCode`
   n'affiche la mention que lorsqu'elle est connue. */
function resteCode(){
  const t = partage.expire ? partage.expire - Date.now() : 0;
  if(!partage.expire) return '';
  if(t <= 0) return 'expiré';
  const h = Math.floor(t / 3600000), m = Math.floor((t % 3600000) / 60000);
  if(h >= 1) return 'expire dans ' + h + ' h ' + (m < 10 ? '0' : '') + m;
  if(m >= 1) return 'expire dans ' + m + ' min';
  return 'expire dans moins d\'une minute';
}

function voletCode(){
  if(!partage.code){
    return '<div class="small muted" style="margin-bottom:10px">Génère un code et donne-le à qui tu veux. '+
      'Tant que tu n\'en donnes pas, personne ne voit ta bibliothèque.</div>'+
      '<button class="btn block" onclick="genererCode()">Générer mon code</button>';
  }
  /* B13 (09/08) — UN CODE MORT NE SE PARTAGE PLUS. « Copier » et « Envoyer »
     restaient actifs alors que la ligne du dessus disait « expiré » : une PWA
     laissée ouverte, un code chargé la veille, et on envoyait à quelqu'un un
     code qui ne marchera pas — la personne d'en face voit un refus sans
     comprendre, et personne ne sait lequel des deux s'est trompé.
     Les deux boutons cèdent la place à celui qui répare. Le calcul est local
     (`resteCode`) : il se refait à chaque rendu, donc au retour sur l'écran,
     sans minuterie permanente — voir le commentaire de `resteCode`. */
  const reste = resteCode();
  const mort = reste === 'expiré';
  return '<div class="codebox"'+(mort?' style="opacity:.45"':'')+'>'+esc(partage.code)+'</div>'+
    (reste
      ? '<div class="small muted" style="text-align:center;margin-bottom:12px">'+
          'Une seule utilisation · <b>'+esc(reste)+'</b></div>'
      : '<div class="small muted" style="text-align:center;margin-bottom:12px">'+
          'Une seule utilisation</div>')+
    /* `.actions` porte un `padding:16px 16px 0` prévu pour une fiche pleine
       largeur ; ici le volet a déjà le sien, d'où la remise à zéro. */
    (mort
      ? '<div class="small muted" style="text-align:center;margin-bottom:12px">'+
          'Ce code ne fonctionne plus. Génères-en un nouveau pour partager.</div>'+
        /* Pas de confirmation ici, contrairement au remplacement : la feuille
           prévient qu'on va rendre le code inutilisable, or il l'est déjà. */
        '<button class="btn block" onclick="genererCode()">'+
          'Générer un nouveau code</button>'
      : '<div class="actions" style="padding:0">'+
          '<button class="btn" onclick="copierCode()">Copier</button>'+
          (partagePossible() ? '<button class="btn ghost" onclick="envoyerCode()">Envoyer</button>' : '')+
        '</div>')+
    '<button class="lienplus" style="display:block;width:100%;text-align:center" '+
      'onclick="confirmerAnnulationCode()">Annuler ce code</button>'+
    /* Remplacer reste possible, mais ce n'est plus une action anodine posée en
       bas d'un panneau : elle porte son vrai nom et passe par une confirmation.
       B13 — sur un code expiré, l'action principale ci-dessus fait déjà
       exactement cela : la répéter en bas de panneau n'ajouterait qu'un doute. */
    (mort ? ''
      : '<button class="lienplus" style="display:block;width:100%;text-align:center;color:var(--muted)" '+
        'onclick="confirmerRemplacementCode()">Remplacer par un nouveau code</button>');
}

const messageCode = c => 'Mon code Mes Séries : ' + c;

async function copierCode(){
  const c = partage.code;
  if(!c) return;
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(c);
    }else if(!copiePapierDeSecours(c)){
      throw new Error('presse-papiers indisponible');
    }
    toast('Code copié');
  }catch(e){
    /* P2 — on ne fait pas semblant d'avoir réussi. Le code reste lisible à
       l'écran : on dit quoi faire plutôt que de laisser croire. */
    console.warn('copie impossible', e);
    toast('Copie impossible — note le code affiché');
  }
}

/* Repli pour les contextes où `navigator.clipboard` n'existe pas (page servie
   en http, vieux navigateur). `execCommand` est déprécié mais reste le seul
   recours ; il exige que la sélection soit visible, d'où le champ posé hors
   écran plutôt que `display:none`, qui empêcherait la sélection. */
function copiePapierDeSecours(txt){
  try{
    const z = document.createElement('textarea');
    z.value = txt;
    z.setAttribute('readonly','');
    z.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(z);
    z.select(); z.setSelectionRange(0, txt.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(z);
    return ok;
  }catch(e){ return false; }
}

async function envoyerCode(){
  const c = partage.code;
  if(!c) return;
  try{
    await navigator.share({ text: messageCode(c) });
  }catch(e){
    /* Fermer la feuille de partage iOS rejette la promesse avec `AbortError` :
       ce n'est pas une panne, c'est un changement d'avis. Rien à dire. */
    if(e && e.name === 'AbortError') return;
    console.warn('partage impossible', e);
    copierCode();
  }
}

function confirmerRemplacementCode(){
  const c = partage.code;
  openSheet('<h3>Remplacer le code ?</h3>'+
    '<p class="small muted" style="margin:0 0 8px"><b>'+esc(c)+'</b> cessera immédiatement de '+
    'fonctionner. Si tu l\'as déjà donné à quelqu\'un, il ne pourra plus s\'en servir.</p>'+
    '<button class="opt danger" onclick="closeSheet();genererCode()">Remplacer par un nouveau code</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}
function confirmerAnnulationCode(){
  const c = partage.code;
  openSheet('<h3>Annuler ce code ?</h3>'+
    '<p class="small muted" style="margin:0 0 8px"><b>'+esc(c)+'</b> ne fonctionnera plus. '+
    'Personne de nouveau ne pourra voir ta bibliothèque tant que tu n\'auras pas généré '+
    'un autre code. Tes abonnés actuels ne sont pas touchés.</p>'+
    '<button class="opt danger" onclick="closeSheet();annulerCode()">Annuler ce code</button>'+
    '<button class="opt" onclick="closeSheet()">Revenir</button>');
}

/* ---------------------------------------------------------------------------
   I6 — recommander un titre à quelqu'un de son cercle.

   Le cercle, c'est l'union des deux listes : les gens que je suis et ceux qui
   me suivent. C'est exactement ce que `dans_mon_cercle()` accepte côté base ;
   les deux définitions doivent rester d'accord, sinon l'interface proposerait
   des gens que le serveur refusera.

   OÙ S'AFFICHE CE QU'ON REÇOIT. La bonne place est l'onglet « À suivre », dans
   une section « On te conseille » — c'est là qu'on regarde ce qu'on va
   regarder. Cet écran vit dans app-03, tenu par un autre chantier : la liste
   est donc posée ici, en tête de « Mes abonnements », qui est l'écran du
   partage. À déplacer quand app-03 se libère ; le rendu ci-dessous est écrit
   pour être déplaçable tel quel.
--------------------------------------------------------------------------- */
function cercle(){
  const vus = {};
  return (partage.suivis || []).concat(partage.abonnes || [])
    .filter(p => p && p.id && !vus[p.id] && (vus[p.id] = 1));
}
function nomDuCercle(id){
  const p = cercle().find(x => String(x.id) === String(id));
  return (p && p.pseudo) || 'Quelqu\'un';
}

/* SPEC-10 §3 — L'ANCIENNE FEUILLE « Recommander » A ÉTÉ REMPLACÉE, PAS
   DOUBLÉE. Elle envoyait à UNE personne, sans mot, au premier appui : le §3
   demande une multi-sélection et un mot facultatif, et surtout « un seul code
   d'envoi » partagé avec le bouton 💌 de la fiche. La nouvelle feuille garde le
   nom `menuRecommander` — c'est celui que le menu ⋯ d'app-06 appelle déjà — et
   vit plus bas, avec le reste de SPEC-10. */

/* Ouvrir vaut « vu » : la marque part sans qu'on attende sa réponse, elle ne
   décide de rien à l'écran. */
/* SPEC-10 — `depuis` : la carte s'ouvre maintenant depuis le centre, et le
   retour doit y revenir. `'abos'` reste le défaut pour tout appel resté à
   l'ancienne forme — aucun n'existe, mais un paramètre optionnel se lit mieux
   qu'une valeur obligatoire ajoutée après coup. */
function ouvrirConseil(idReco, id, type, depuis){
  marquerConseilVu(idReco);
  ouvrirTitre(id, type, depuis || 'abos');
}
async function marquerConseilVu(idReco){
  const r = (conseils.recues || []).find(x => x.id === idReco);
  if(!r || r.vu) return;
  r.vu = new Date().toISOString();
  try{
    await sbFetch('/rest/v1/recommandations?id=eq.'+encodeURIComponent(idReco),
      { method:'PATCH', headers:{ Prefer:'return=minimal' },
        body: JSON.stringify({ vu: r.vu }) });
  }catch(e){ console.warn('marque « vu » non enregistrée', e); }
}

function basculerPanneauAbo(cle){
  ui.aboPanneau = (ui.aboPanneau === cle) ? null : cle;
  fermerGlisAbo();
  render();
  /* Le champ s'ouvre prêt à recevoir le code : une étape de moins. */
  if(ui.aboPanneau === 'suivre'){
    const i = document.getElementById('codein');
    if(i) i.focus();
  }
}

/* ---------------------------------------------------------------------------
   Le glissement d'une ligne

   Choisi par Adrien parmi trois maquettes. La ligne se pousse vers la gauche
   et découvre son action, nommée. Deux garde-fous : une seule ligne ouverte à
   la fois, et l'action ne s'exécute jamais au glissement — elle ouvre le
   panneau de confirmation existant, parce qu'elle est irréversible.
--------------------------------------------------------------------------- */
/* Maquette C2, choisie par Adrien : un bloc court, pictogramme et mot bref.
   Sur les 104 px de la version longue, l'avatar et la moitié du nom
   disparaissaient pendant le glissement — on ne voyait plus de qui il
   s'agissait au moment de décider. */
const GLIS_LARGEUR = 78;       // ce que découvre le glissement, en pixels
const GLIS_DECLIC = 34;        // au-delà, on ouvre ; en deçà, la ligne se referme
let glisAbo = { el:null, x0:0, y0:0, base:0, axe:null, ouvert:null };

/* ---------------------------------------------------------------------------
   CYCLE 3, POINT 6 — la réciprocité, lue en mémoire.

   `partage.suivis` et `partage.abonnes` sont déjà chargés tous les deux : la
   réciprocité est une simple intersection sur les identifiants, AUCUNE requête
   supplémentaire. C'est cette lecture qui décide du bouton « Suivre » (jamais
   sur une paire déjà réciproque) et de la mention « Vous vous suivez » (des
   deux côtés de l'écran — sans elle on ne sait pas qui est déjà réciproque, et
   le bouton reviendrait proposer une action déjà faite). */
function aboReciproque(id){
  return (partage.suivis  || []).some(x => x && String(x.id) === String(id)) &&
         (partage.abonnes || []).some(x => x && String(x.id) === String(id));
}

/* CORRECTION C3 — LA FRONTIÈRE ENTRE « ANCIEN » ET « NOUVEAU » ABONNÉ.

   Sans elle, la mise en service faisait surgir un bloc « X t'a ajouté » pour
   CHAQUE personne déjà abonnée depuis des mois : une pile d'annonces à traiter
   pour des liens qu'on connaît par cœur, alors que le bloc annonce un
   événement — quelqu'un vient de te suivre.

   Une date écrite en dur, et c'est délibéré : c'est la seule forme qui se
   relise sans rien exécuter. Elle vaut « jour de la correction » — la mise en
   production suit de peu, et tout ce qui est antérieur est, par construction,
   un abonnement d'avant ce lot.

   ATTENTION EN LA DÉPLAÇANT : la reculer ferait réapparaître d'anciens
   abonnements sous forme d'annonces. Elle n'a aucune raison de bouger. */
const ABO6_ANNONCE_DEPUIS = '2026-08-06';
function abo6Nouveau(p){
  /* `depuis` est un horodatage ISO rendu par la base (« 2026-08-06T19:14:… ») :
     les dix premiers caractères en donnent le jour, et deux jours ISO se
     comparent comme deux chaînes. Sans date connue — une fiche construite
     avant la correction C3, ou un lien lu d'une base plus ancienne — on ne
     montre PAS le bloc : un rappel muet vaut mieux qu'un rappel faux, et le
     bouton de la rangée reste, lui, le chemin permanent. */
  return !!(p && p.depuis && String(p.depuis).slice(0,10) >= ABO6_ANNONCE_DEPUIS);
}

/* Le bloc d'annonce « X t'a ajouté », calqué sur le motif de
   `blocConseilsRecus` : un rappel en tête d'écran, avec les deux réponses.
   « Ignorer » ferme LE BLOC, jamais le bouton de la rangée — le bloc est un
   rappel, la rangée est le chemin permanent. Le choix est retenu dans `db`,
   et depuis la correction C4 il suit le COMPTE et non l'appareil. */
function blocAnnonceAbo(){
  if(!partage.charge) return '';
  const ignores = db.abosIgnores || {};
  const l = (partage.abonnes || []).filter(p =>
    p && p.id && abo6Nouveau(p) && !aboReciproque(p.id) && !ignores[p.id]);
  if(!l.length) return '';
  return l.map(p =>
    '<div class="abo6bloc">'+
      '<div class="abo6l1">'+avatarDe(p, 'moyen')+
        '<div class="abo6t"><b>'+esc(p.pseudo)+' t\'a ajouté</b>'+
        '<em>Voit ta bibliothèque</em></div></div>'+
      '<div class="abo6act">'+
        '<button class="btn" onclick="suivreEnRetour(\''+escJs(p.id)+'\')">Suivre en retour</button>'+
        '<button class="btn ghost" onclick="ignorerAnnonceAbo(\''+escJs(p.id)+'\')">Ignorer</button>'+
      '</div>'+
    '</div>').join('');
}
function ignorerAnnonceAbo(id){
  if(!db.abosIgnores || typeof db.abosIgnores !== 'object') db.abosIgnores = {};
  /* La date, et pas un simple `true` : c'est elle qui permet à deux appareils
     de se départager à la synchronisation (correction C4, `fusionnerAbosIgnores`
     dans app-01). */
  db.abosIgnores[id] = Date.now();
  saveDB();
  render();
}

function ligneAbo(p, role){
  /* S3 (09/08) — l'identifiant du proche part dans SIX attributs de cette
     fonction, et il n'était passé par `escJs` que dans deux d'entre eux. Il
     vient de la table `profils`, donc d'une ligne écrite par quelqu'un d'autre.
     On le prépare UNE FOIS, ici, et on n'utilise plus que cette variable dans
     les attributs — c'est ce qui rend l'oubli visible à la lecture. */
  const idJs = escJs(String(p.id));
  const cle = role+':'+p.id;
  /* `cle` porte le même identifiant : elle traverse elle aussi un `onclick`
     (`ontouchstart`), donc `escJs` et non `esc`. */
  const cleJs = escJs(cle);
  const suit = role === 'suiveur';
  const mot  = suit ? 'Ne plus<br>suivre' : 'Retirer<br>l\'accès';
  /* Le pictogramme seul serait ambigu — les deux actions se ressemblent trop.
     Le mot reste donc, en petit, sous l'icône. */
  const act = (suit ? I.usermoins : I.oeilbarre) + '<span>'+mot+'</span>';
  return '<div class="glis" data-cle="'+esc(cle)+'">'+
    '<div class="glisfond">'+
      '<button class="glisact" aria-label="'+(suit?'Ne plus suivre':'Retirer l\'accès')+'" '+
        'onclick="confirmerRupture(\''+idJs+'\',\''+role+'\')">'+act+'</button>'+
    '</div>'+
    '<div class="srow glisrow" style="align-items:center"'+
      ' ontouchstart="glisAboStart(event,\''+cleJs+'\')"'+
      ' ontouchmove="glisAboMove(event)" ontouchend="glisAboEnd(event)"'+
      ' ontouchcancel="glisAboEnd(event)"'+
      ' onclick="glisAboClic(event,\''+idJs+'\',\''+role+'\')">'+
      avatarDe(p, 'moyen')+
      '<div class="sinfo" style="justify-content:center">'+
        '<div class="sname">'+esc(p.pseudo)+'</div>'+
        '<div class="tiny muted">'+(role==='suiveur' ? 'Tu vois sa bibliothèque' : 'Voit ta bibliothèque')+'</div>'+
      '</div>'+
      /* CYCLE 3, POINT 6 — sur une paire réciproque, la mention, DES DEUX
         CÔTÉS ; sur un abonné non réciproque, le bouton « Suivre ». Le libellé
         est « Suivre » tout court : « Le suivre » / « La suivre » ne se devine
         pas depuis un pseudo. Jamais les deux à la fois, et jamais le bouton
         sur une paire déjà réciproque. */
      (aboReciproque(p.id) ? '<span class="abo6recip">↔ Vous vous suivez</span>'
       : role==='suivi'
         ? '<button class="btn mini abo6btn" onclick="event.stopPropagation();suivreEnRetour(\''+idJs+'\')">Suivre</button>'
         : '')+
      (role==='suiveur' ? '<span class="ecaret">'+I.caret+'</span>' : '')+
      /* I3 — la seconde porte. L'action ne vivait que derrière un glissement,
         donc derrière `ontouchstart` : sur un ordinateur, se désabonner ou
         retirer un accès était tout bonnement IMPOSSIBLE, et l'était de même
         pour qui a du mal avec un geste précis. Le glissement reste, inchangé ;
         ce bouton ouvre exactement la même feuille.
         C'est la décision déjà prise pour la mise en pause : « ne doit pas
         dépendre d'un appui long que personne ne devine ». */
      '<button class="ecaret" aria-haspopup="menu" '+
        'aria-label="Actions pour '+esc(p.pseudo)+'" '+
        'style="flex:none;width:36px;height:36px;border-radius:9px;background:var(--surface2)" '+
        'onclick="menuAbo(event,\''+idJs+'\',\''+role+'\')">'+I.dots+'</button>'+
    '</div>'+
  '</div>';
}

/* Le bouton vit DANS la rangée, qui porte déjà un `onclick` : sans arrêt de la
   propagation, un appui ouvrirait la feuille puis la bibliothèque derrière. */
function menuAbo(e, id, role){
  if(e){ e.stopPropagation(); e.preventDefault(); }
  confirmerRupture(id, role);
}

function rangeeGlis(cle){
  const box = document.querySelector('.glis[data-cle="'+cle.replace(/"/g,'')+'"]');
  return box ? box.querySelector('.glisrow') : null;
}
function poserGlis(el, x, anime){
  if(!el) return;
  el.style.transition = anime ? 'transform .22s cubic-bezier(.22,.7,.3,1)' : 'none';
  el.style.transform = 'translate3d('+x+'px,0,0)';
}
function fermerGlisAbo(){
  if(glisAbo.ouvert){ poserGlis(rangeeGlis(glisAbo.ouvert), 0, true); glisAbo.ouvert = null; }
}

function glisAboStart(e, cle){
  const t = e.touches[0];
  /* Le geste de retour appartient au bord de l'écran : on ne le lui dispute pas. */
  if(t.clientX <= 28){ glisAbo.el = null; return; }
  glisAbo.el = e.currentTarget;
  glisAbo.cle = cle;
  glisAbo.x0 = t.clientX; glisAbo.y0 = t.clientY;
  glisAbo.base = (glisAbo.ouvert === cle) ? -GLIS_LARGEUR : 0;
  glisAbo.axe = null;
}
function glisAboMove(e){
  if(!glisAbo.el) return;
  const t = e.touches[0];
  const dx = t.clientX - glisAbo.x0, dy = t.clientY - glisAbo.y0;
  /* On tranche une fois pour toutes : ce geste défile la page, ou il glisse la
     ligne. Sans cet arbitrage, un défilement du pouce faisait trembler les
     lignes latéralement. */
  if(glisAbo.axe === null){
    if(Math.abs(dx) < 9 && Math.abs(dy) < 9) return;
    glisAbo.axe = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if(glisAbo.axe === 'x' && glisAbo.ouvert && glisAbo.ouvert !== glisAbo.cle) fermerGlisAbo();
  }
  if(glisAbo.axe !== 'x') return;
  e.preventDefault();                       // la page ne défile pas pendant qu'on glisse
  let x = glisAbo.base + dx;
  if(x > 0) x = 0;                          // rien à découvrir de ce côté
  if(x < -GLIS_LARGEUR) x = -GLIS_LARGEUR - (GLIS_LARGEUR + x) * 0.7;   // résistance au-delà
  if(x < -GLIS_LARGEUR - 22) x = -GLIS_LARGEUR - 22;
  poserGlis(glisAbo.el, x, false);
}
function glisAboEnd(){
  if(!glisAbo.el || glisAbo.axe !== 'x'){ glisAbo.el = null; return; }
  const m = /translate3d\((-?[\d.]+)px/.exec(glisAbo.el.style.transform || '');
  const x = m ? parseFloat(m[1]) : 0;
  const ouvrir = x < -GLIS_DECLIC;
  poserGlis(glisAbo.el, ouvrir ? -GLIS_LARGEUR : 0, true);
  glisAbo.ouvert = ouvrir ? glisAbo.cle : null;
  glisAbo.el = null;
}
/* Un appui sur une ligne ouverte la referme, et rien d'autre : on ne veut pas
   ouvrir une bibliothèque en voulant annuler son geste. */
function glisAboClic(e, id, role){
  if(glisAbo.axe === 'x'){ glisAbo.axe = null; return; }
  if(glisAbo.ouvert){ fermerGlisAbo(); return; }
  if(role === 'suiveur') ouvrirBiblio(id);
}

/* La démonstration, jouée une seule fois dans la vie du compte : la première
   ligne s'entrouvre puis se referme. C'est le seul remède connu à un geste
   qui ne s'annonce pas, et il ne coûte rien à qui l'a déjà compris. */
function montrerAstuceGlis(){
  if(db.astuceGlis) return;
  const el = document.querySelector('.glis .glisrow');
  if(!el) return;
  db.astuceGlis = true; saveDB();
  setTimeout(()=>{
    poserGlis(el, -58, true);
    setTimeout(()=> poserGlis(el, 0, true), 620);
  }, 480);
}

/* Le nom n'est jamais recopié dans l'attribut onclick : une apostrophe suffirait à
   casser le bouton. On le retrouve dans les listes au moment d'ouvrir le panneau. */
function confirmerRupture(id, role){
  /* La ligne se referme avant d'ouvrir le panneau : si l'on annule, on ne
     retrouve pas une rangée restée ouverte sur une action qu'on a refusée. */
  fermerGlisAbo();
  const liste = (role==='suiveur' ? partage.suivis : partage.abonnes) || [];
  const p = liste.find(x=>String(x.id) === String(id));
  const nom = (p && p.pseudo) || 'Cette personne';
  /* S3 (09/08) — même préparation qu'en tête de `ligneAbo` : l'identifiant
     repart dans deux `onclick`, il passe par `escJs`. */
  const idJs = escJs(String(id));
  openSheet('<h3>'+esc(nom)+'</h3>'+
    '<p class="small muted" style="margin:0 0 8px">'+
      (role==='suiveur' ? 'Tu ne verras plus sa bibliothèque.' : 'Cette personne ne verra plus la tienne.')+'</p>'+
    /* I3 — la feuille sert désormais les DEUX portes : le glissement, qui
       n'avait qu'une action à confirmer, et le bouton ⋮, qui a besoin d'une
       issue non destructrice. D'où cette première entrée, absente au clavier
       et à la souris jusqu'ici. */
    (role==='suiveur'
      ? '<button class="opt" onclick="closeSheet();ouvrirBiblio(\''+idJs+'\')">Voir sa bibliothèque</button>'
      : '')+
    '<button class="opt danger" onclick="closeSheet();rompre(\''+idJs+'\',\''+role+'\')">'+
      (role==='suiveur' ? 'Me désabonner' : 'Retirer cet abonné')+'</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

/* On retient d'où l'on ouvre : depuis le profil, la flèche doit ramener au
   profil, pas faire un détour par « Mes abonnements » où l'on n'était pas. */
function ouvrirBiblio(id){
  go('biblio', {id:id, from: (view === 'biblio' ? params.from : view) || 'abos'});
  chargerBiblio(id);            // toujours rafraîchir : l'autre a pu avancer entre-temps
}

/* ---------- Vue : bibliothèque d'une personne suivie (lecture seule) ---------- */
function viewBiblio(){
  const id = params.id;
  const qui = partage.suivis.find(p=>p.id===id);
  const nom = qui ? qui.pseudo : 'Bibliothèque';
  let html = header(nom, {back:"goBack()"});

  const d = biblios[id];
  if(!d) return html + '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Chargement…</p></div>';
  if(d.erreur) return html + '<div class="empty"><h3>Lecture impossible</h3><p>'+esc(d.erreur)+'</p>'+
    '<button class="btn ghost" onclick="chargerBiblio(\''+escJs(String(id))+'\')">Réessayer</button></div>';

  const shows  = Object.values(d.shows  || {});
  const movies = Object.values(d.movies || {});
  if(!shows.length && !movies.length)
    return html + '<div class="empty">'+I.tv+'<h3>Bibliothèque vide</h3>'+
      '<p>'+esc(nom)+' n\'a encore rien enregistré.</p></div>';

  let eps = 0, minutes = 0, finies = 0;
  shows.forEach(sh=>{
    allEpisodes(sh,true).forEach(ep=>{
      if(sh.watched && sh.watched[key(ep.s,ep.e)]){ eps++; minutes += epRuntime(sh,ep); }
    });
    if(isFinished(sh)) finies++;
  });
  movies.filter(m=>m.seen).forEach(m=> minutes += (m.runtime||100));

  const enCours = shows.filter(sh=>statutSerie(sh)==='asuivre').sort((a,b)=>lastWatchedAt(b)-lastWatchedAt(a));
  const vues    = shows.filter(sh=>statutSerie(sh)==='vu');
  const aVoir   = shows.filter(sh=>statutSerie(sh)==='avoir');
  const filmsVus= movies.filter(m=>m.seen).sort((a,b)=>(b.watchedAt||0)-(a.watchedAt||0));

  html += '<div class="stats">'+
    '<div class="stat"><b>'+eps+'</b><span>épisode'+(eps>1?'s':'')+' vu'+(eps>1?'s':'')+'</span></div>'+
    '<div class="stat"><b>'+fmtDurShort(minutes)+'</b><span>de visionnage</span></div>'+
    '<div class="stat"><b>'+finies+'</b><span>série'+(finies>1?'s':'')+' finie'+(finies>1?'s':'')+'</span></div>'+
  '</div>';
  html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:12px;text-align:center">'+
    '<span class="small muted ro">'+I.eye+' Lecture seule — tu ne peux rien modifier ici</span></div></div>';

  const bloc = (titre, liste, rendu)=> liste.length
    ? '<div class="sectitle">'+titre+'<span class="cnt">'+liste.length+'</span></div>'+
      '<div class="pgrid">'+liste.map(rendu).join('')+'</div>'
    : '';

  /* Le prénom accompagne chaque avancement : sur un titre que j'ai aussi, «
     63 % » sans dire de qui est confondu avec le mien en une seconde. */
  const prenom = (nom || '').split(' ')[0].slice(0, 12);

  html += bloc('En cours', enCours, sh=>carteLecture(sh, prenom));
  html += bloc('Séries vues', vues, sh=>carteLecture(sh, prenom));
  html += bloc('Films vus', filmsVus, carteFilmLecture);
  html += bloc('Sa liste à voir', aVoir, sh=>carteLecture(sh, prenom));
  return html + '<div style="height:26px"></div>';
}

/* ---------------------------------------------------------------------------
   I5 — la bibliothèque d'un proche devient une porte, pas une vitrine.

   Ces deux cartes n'avaient AUCUN `onclick` : on regardait ce que quelqu'un
   regarde sans pouvoir ouvrir une fiche ni ajouter un titre chez soi. La seule
   question que cet écran existe pour servir — « qu'est-ce que je regarde ce
   soir ? » — n'y trouvait pas de réponse actionnable.

   Le document propose de fusionner ces fonctions avec `showCard` / `movieCard`
   d'app-03. C'est la bonne cible, mais app-03 est tenu par un autre chantier :
   on ajoute donc le geste ici, et la fusion viendra quand le fichier se
   libérera. La duplication est assumée et datée.

   FRONTIÈRE DE CONFIANCE. Ces objets viennent de la colonne `data` d'une AUTRE
   personne, qu'elle peut écrire par appel direct à l'API. §A4 a durci les
   chemins d'affiche ; l'identifiant, lui, part maintenant dans un `onclick`,
   ce qui est un chemin d'injection tout neuf. D'où `estIdTmdb` : un
   identifiant qui n'est pas une suite de chiffres n'est pas rendu cliquable du
   tout. Pas d'échappement à la place — un `escJs` laisserait passer un
   identifiant absurde jusqu'à `/tv/<n'importe quoi>` côté relais TMDB.
--------------------------------------------------------------------------- */
const estIdTmdb = id => /^\d{1,12}$/.test(String(id));

/* Le badge « chez moi » : repérer d'un coup d'œil ce qui est nouveau pour moi.
   Il se pose EN BAS de l'affiche, le haut étant déjà pris par le compteur
   d'épisodes ; et il porte la couleur d'accent, pas le vert, qui veut dire
   « vu » partout ailleurs et serait un contresens ici. */
function badgeChezMoi(media, id){
  if(!dejaChezMoi(media, id)) return '';
  return '<div class="pbadge" style="top:auto;bottom:10px;right:6px;'+
    'background:var(--accent);color:#fff">chez moi</div>';
}

function carteLecture(sh, prenom){
  const p = progress(sh);
  const full = p.total>0 && p.watched===p.total;
  const st = statutSerie(sh);
  const etat = st==='avoir' ? 'Pas commencée'
             : full ? (isFinished(sh)?'Terminée':'À jour')
             : p.pct+'%';
  /* Même structure que `showCard` (app-03) — `.pcard` enveloppe, `.ptap` porte
     le geste — pour que la fusion des deux fonctions, le jour où app-03 se
     libère, soit un simple retrait et non une réécriture. */
  const dedans =
    '<div class="wrapimg">'+posterEl(sh.poster,'w342','',sh.name)+
      (st!=='avoir' && p.total ? '<div class="pbadge '+(full?'done':'')+'">'+p.watched+'/'+p.total+'</div>' : '')+
      badgeChezMoi('tv', sh.id)+
      (st!=='avoir' ? '<div class="pbar"><i class="'+(full?'full':'')+'" style="width:'+p.pct+'%"></i></div>' : '')+
    '</div>'+
    '<div class="pname">'+esc(sh.name)+'</div>'+
    '<div class="psub">'+(prenom ? esc(prenom)+' : ' : '')+esc(etat)+'</div>';
  return '<div class="pcard">'+
    (estIdTmdb(sh.id)
      ? '<div class="ptap" onclick="ouvrirTitre('+Number(sh.id)+',\'tv\',\'biblio\')">'+dedans+'</div>'
      : dedans)+
  '</div>';
}
function carteFilmLecture(m){
  const dedans =
    '<div class="wrapimg">'+posterEl(m.poster,'w342','',m.title)+
      '<div class="pbadge done">vu</div>'+badgeChezMoi('movie', m.id)+'</div>'+
    '<div class="pname">'+esc(m.title)+'</div>'+
    '<div class="psub">'+esc(year(m.date))+'</div>';
  return '<div class="pcard">'+
    (estIdTmdb(m.id)
      ? '<div class="ptap" onclick="ouvrirTitre('+Number(m.id)+',\'movie\',\'biblio\')">'+dedans+'</div>'
      : dedans)+
  '</div>';
}

/* ---------- Vue : Compte & synchronisation ---------- */
function viewAccount(){
  /* Porte d'entrée : sans session, il n'y a nulle part où revenir en arrière.
     Pas de flèche, pas de barre du bas — une seule chose à faire. */
  const porte = !signedIn();
  let html = header(porte ? 'Bienvenue' : 'Compte & synchro',
                    porte ? {} : {back:"goBack()"});

  if(!syncReady() || ui.editServer){
    html += '<div class="wrap">'+
      /* I4 — cet écran promettait une installation en deux réglages. C'est faux :
         un espace neuf n'a ni les tables, ni les règles d'accès, ni le relais
         d'affiches — on obtient une app vide et muette. Il vit derrière sept
         appuis sur le logo, donc il s'adresse à quelqu'un qui sait ce qu'il
         fait : on le lui dit, plutôt que de lui laisser découvrir. */
      '<div class="card" style="padding:16px">'+
        '<div style="font-weight:680;margin-bottom:6px">Changer de serveur</div>'+
        '<div class="small muted">L\'app est déjà reliée à un serveur : tu n\'as normalement '+
        'rien à faire ici. Ce réglage sert à en brancher un autre.</div>'+
        '<div class="small muted" style="margin-top:8px">Un espace neuf ne suffit pas : il faut '+
        'd\'abord y installer la base et les fonctions, sinon l\'app s\'ouvre sans affiches et '+
        /* S5 (SPEC-02) et B13 (SPEC-03) — LE MÊME DÉFAUT, TROUVÉ DEUX FOIS.
           Le fichier n'a JAMAIS été à la racine du dépôt : il est dans
           `supabase/`. Un chemin faux dans une consigne d'installation coûte
           exactement le même temps qu'une consigne absente. La version retenue
           est celle de S5, qui corrige le chemin ET dit ce qu'on s'apprête à
           faire — B13 ne demandait que la première moitié. */
        'sans partage. La marche à suivre est dans <b>supabase/INSTALL.md</b>, dans le dépôt.</div>'+
        /* S5 (09/08) — ce qu'on s'apprête à faire, dit AVANT de le faire. */
        '<div class="small muted" style="margin-top:8px">Ton compte et tes données passeront par '+
        'ce serveur : <b>ne fais ça que si c\'est TON serveur</b>. Tu devras te reconnecter.</div>'+
      '</div>'+
      '<div style="height:16px"></div>'+
      '<label class="fld"><span>URL du projet Supabase</span>'+
        '<input type="text" id="sburl" placeholder="https://xxxx.supabase.co" autocapitalize="off" autocorrect="off" spellcheck="false" value="'+esc(db.sync.url)+'"></label>'+
      '<label class="fld"><span>Clé publique (anon)</span>'+
        '<input type="text" id="sbkey" placeholder="eyJhbGciOi..." autocapitalize="off" autocorrect="off" spellcheck="false" value="'+esc(db.sync.key)+'">'+
        '<em>Dans Supabase : Project Settings → API. Cette clé est prévue pour être publique.</em></label>'+
      '<button class="btn block" onclick="saveSync()">Enregistrer</button>'+
      /* S5 (09/08) — `resetSync` existait sans aucun appelant : du code mort
         qui SEMBLAIT être la porte de sortie. Elle l'est maintenant pour de
         bon, et seulement quand il y a quelque chose à défaire. */
      (serveurPersonnalise()
        ? '<button class="btn ghost block" style="margin-top:10px" onclick="resetSync()">Revenir au serveur d\'origine</button>'
        : '')+
      (syncReady() ? '<button class="btn ghost block" style="margin-top:10px" onclick="ui.editServer=false;render()">Annuler</button>' : '')+
    '</div>';
    return html + '<div style="height:30px"></div>';
  }

  /* --- Pas encore de compte : la porte d'entrée --- */
  if(!signedIn()){
    /* Les trois arguments de vente et les deux écrans de mise en route ont
       disparu : soit on a un compte, soit on n'en a pas. Il n'y a rien à
       expliquer avant, et le prénom est déjà demandé juste en dessous. */
    /* D4 — après une création qui exige une confirmation par e-mail, on ne
       montre pas le formulaire mais l'explication de ce qui se passe. */
    if(ui.acMode === 'confirme') return html + ecranConfirmation();
    const creer = ui.acMode !== 'connexion';
    const nb = Object.keys(db.shows).length + Object.keys(db.movies).length;
    html += '<div class="wrap" style="padding-top:34px">'+
      '<div class="intro" style="margin-bottom:22px">'+
        '<div class="acclogo" onclick="reglerServeur()">'+I.tv+'</div>'+
        '<h2>Mes Séries</h2>'+
        /* Le décompte rassure celui qui a déjà des titres sur cet appareil :
           sans lui, la porte donne l'impression d'avoir tout effacé. */
        '<p>'+(nb
          ? (nb > 1 ? 'Les '+nb+' titres posés ici t\'attendent. ' : 'Le titre posé ici t\'attend. ')+
            'Connecte-toi pour les retrouver, ou crée ton compte : tout sera rattaché.'
          : 'Ta bibliothèque, à l\'abri et identique sur tous tes appareils.')+
        '</p>'+
      '</div>'+
      '<div class="bascule">'+
        '<button class="'+(creer?'on':'')+'" onclick="setAcMode(\'creer\')">Créer un compte</button>'+
        '<button class="'+(creer?'':'on')+'" onclick="setAcMode(\'connexion\')">J\'ai déjà un compte</button>'+
      '</div>'+
      /* Le prénom n'était demandé qu'à l'écran d'accueil : celui qui l'avait
         sauté se retrouvait affiché aux gens qui le suivent sous le début de
         son adresse e-mail. On le demande donc ici aussi. */
      (creer
        ? '<label class="fld"><span>Ton prénom</span>'+
          '<input type="text" id="acnom" autocomplete="given-name" placeholder="Adrien" '+
          'value="'+esc(db.pseudo||'')+'">'+
          '<em>C\'est ce que verront les proches à qui tu partages ta bibliothèque.</em></label>'
        : '')+
      '<label class="fld"><span>Adresse e-mail</span>'+
        '<input type="text" id="acmail" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="toi@exemple.fr" value="'+esc((db.auth&&db.auth.email)||'')+'"'+
        (creer ? '' : ' onkeydown="if(event.key===\'Enter\'){this.blur();doSignIn()}"')+'></label>'+
      '<label class="fld"><span>Mot de passe</span>'+
        '<input type="password" id="acpass" placeholder="au moins 6 caractères" '+
        'autocomplete="'+(creer?'new-password':'current-password')+'" '+
        'onkeydown="if(event.key===\'Enter\'){this.blur();'+(creer?'doSignUp()':'doSignIn()')+'}">'+
        '<em>'+(creer
          ? 'Choisis un mot de passe dédié à cette app.'
          : 'Le même que sur ton autre appareil.')+'</em></label>'+
      /* Saisi deux fois : une faute de frappe sur un mot de passe qu'on ne
         relit jamais bloquerait l'accès au compte dès le prochain appareil. */
      (creer
        ? '<label class="fld"><span>Confirme le mot de passe</span>'+
          '<input type="password" id="acpass2" placeholder="le même, pour être sûr" '+
          'autocomplete="new-password" '+
          'onkeydown="if(event.key===\'Enter\'){this.blur();doSignUp()}"></label>'
        : '')+
      /* B10 (09/08) — le bouton s'éteint pendant l'appel. Avec `SB_TIMEOUT` à
         45 s, un double appui envoyait DEUX créations de compte : la seconde
         répondait « un compte existe déjà avec cette adresse » — sur le compte
         qui venait d'être créé, une seconde plus tôt, par le premier appui. Le
         verrou d'action (`prendre('auth')`) est la vraie garde ; ceci en est la
         traduction visible, sans quoi rien ne dirait qu'il se passe quelque
         chose pendant quarante-cinq secondes. */
      /* Le LIBELLÉ NE CHANGE PAS, seul le bouton s'éteint. Un libellé
         « Création… » posé par un rendu se figerait là : `verrouAuth` ne rend
         que l'état actif du bouton, sans repasser par un rendu — lequel
         effacerait le mot de passe déjà tapé si l'appel échoue. Le toast, lui,
         dit déjà que c'est parti. */
      '<button class="btn block" id="acgo" style="margin-bottom:'+(creer?'14px':'4px')+'"'+
        (occupe('auth')?' disabled':'')+' onclick="'+(creer?'doSignUp()':'doSignIn()')+'">'+
        (creer ? 'Créer mon compte' : 'Me connecter')+'</button>'+
      (creer ? ''
        : '<button class="tiny muted" style="display:block;width:100%;text-align:center;padding:10px 8px 14px" '+
          'onclick="demanderReinit()">Mot de passe oublié ?</button>')+
      /* « Modifier le serveur » n'a rien à faire sur un écran de connexion :
         il ne sert qu'une fois dans la vie du projet. Il reste accessible en
         appuyant longuement sur le logo, pour ne rien perdre. */
      '</div>';
    return html + '<div style="height:30px"></div>';
  }

  /* --- Connecté : l'état d'abord, les actions ensuite --- */
  /* B3 — trois états, et un seul qui peut durer. « Synchronisation en cours… »
     restait affiché POUR TOUJOURS quand la requête pendait ; elle est désormais
     abandonnée au bout de 45 s et l'écran bascule ici.

     Deux lignes, pas quatre : l'état dit qu'on a échoué et quand ça marchait
     encore, la ligne grise dit la cause ET que rien n'est perdu. Le motif est
     retenu en base, donc il survit à un rechargement. */
  const echec = db.syncDernierEchec || null;
  const enEchec = syncState === 'err' || (!!echec && syncState !== 'busy' && syncState !== 'ok');
  const etat = syncState==='busy' ? 'Synchronisation en cours…'
             : enEchec ? ('Échec' + (db.syncedAt ? ' · dernière synchro '+fmtQuand(db.syncedAt) : ''))
             : db.syncedAt ? 'À jour · '+fmtQuand(db.syncedAt)
             : 'Jamais synchronisé';
  const motif = enEchec ? (syncError || (echec && echec.motif) || '') : '';
  const col = enEchec ? 'var(--warn)' : syncState === 'ok' ? 'var(--ok)' : 'var(--muted)';
  const mail = (db.auth.email||'—');
  const nb = Object.keys(db.shows).length, nf = Object.keys(db.movies).length;

  html += '<div class="wrap">'+
    '<div class="carte-compte">'+
      avatarMoi('gros')+
      '<div class="cmail">'+esc(mail)+'</div>'+
      '<div class="cetat" style="color:'+col+'">'+
        (syncState==='busy' ? '<span class="spin"></span> ' : '<i class="pastille" style="background:'+col+'"></i>')+
        etat+'</div>'+
      (motif ? '<div class="tiny muted" style="margin-top:4px">'+esc(motif)+'</div>' : '')+
      '<div class="cchiffres">'+
        '<div><b>'+nb+'</b><span>série'+(nb>1?'s':'')+'</span></div>'+
        '<div><b>'+nf+'</b><span>film'+(nf>1?'s':'')+'</span></div>'+
        '<div><b>'+((partage.suivis||[]).length + (partage.abonnes||[]).length)+'</b><span>partage'+
          (((partage.suivis||[]).length + (partage.abonnes||[]).length)>1?'s':'')+'</span></div>'+
      '</div>'+
    '</div>'+
    '<button class="btn block" style="margin-bottom:10px" onclick="syncNow()">'+
      (enEchec ? 'Réessayer maintenant' : 'Synchroniser maintenant')+'</button>'+
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="go(\'abos\',{from:\'account\'})">'+
      I.user+' Partage et abonnements</button>'+
    '<div class="tiny muted" style="margin:14px 0 18px">La synchro part toute seule quelques secondes après '+
      'chaque changement, et à chaque ouverture de l\'app. Tu n\'as normalement jamais besoin du bouton.</div>'+
    '<button class="tiny muted" style="display:block;width:100%;text-align:center;padding:8px" onclick="ui.editServer=true;render()">Modifier le serveur</button>'+
    '<button class="btn ghost block" style="color:#ff5a5a;margin-top:8px" onclick="confirmerDeconnexion()">Se déconnecter</button>'+
    '<button class="tiny" style="display:block;width:100%;text-align:center;padding:14px 8px 4px;color:#ff5a5a" '+
      'onclick="confirmerSuppression()">Supprimer mon compte</button>'+
  '</div>';
  return html + '<div style="height:30px"></div>';
}

function setAcMode(m){ ui.acMode = m; render(); }

/* D4 — l'écran d'attente de confirmation. Il dit trois choses : à quelle
   adresse le message est parti, quoi faire, et comment revenir. */
function ecranConfirmation(){
  const reste = Math.max(0, Math.ceil(((ui.renvoiAt || 0) + 60000 - Date.now()) / 1000));
  return '<div class="wrap" style="padding-top:34px">'+
    '<div class="intro" style="margin-bottom:22px">'+
      '<div class="acclogo">'+I.mail+'</div>'+
      '<h2>Vérifie tes e-mails</h2>'+
      '<p>On vient d\'écrire à <b>'+esc(ui.acMail||'')+'</b>. Ouvre le message et touche '+
        'le lien qu\'il contient, puis reviens ici te connecter.</p>'+
    '</div>'+
    '<button class="btn" style="width:100%" onclick="allerConnexion()">Me connecter</button>'+
    '<button class="btn ghost" id="btnrenvoi" style="width:100%;margin-top:10px" '+
      (reste ? 'disabled' : '')+' onclick="renvoyerConfirmation()">'+
      (reste ? 'Renvoyer l\'e-mail ('+reste+' s)' : 'Renvoyer l\'e-mail')+'</button>'+
    '<p class="tiny muted center" style="margin-top:16px">Rien reçu ? Regarde dans les '+
      'indésirables — c\'est là que ces messages atterrissent le plus souvent.</p>'+
  '</div>';
}

/* Le formulaire de connexion, adresse déjà remplie : personne ne devrait avoir
   à la retaper alors qu'on vient de la lui demander. */
function allerConnexion(){
  ui.acMode = 'connexion';
  render();
  const el = document.getElementById('acmail');
  if(el && ui.acMail) el.value = ui.acMail;
}

async function renvoyerConfirmation(){
  /* Une limite côté client, avec le décompte affiché : Supabase refuse les
     envois rapprochés, et un bouton qui échoue sans rien dire vaut moins qu'un
     bouton qui dit d'attendre. */
  if(ui.renvoiAt && Date.now() - ui.renvoiAt < 60000) return;
  if(!ui.acMail) return;
  ui.renvoiAt = Date.now(); render();
  /* Le décompte se rafraîchit tant qu'on reste sur l'écran. */
  const tic = setInterval(()=>{
    if(ui.acMode !== 'confirme' || Date.now() - ui.renvoiAt >= 60000){ clearInterval(tic); }
    if(ui.acMode === 'confirme') render();
  }, 1000);
  try{
    await sbFetch('/auth/v1/resend', { method:'POST',
      body: JSON.stringify({ type:'signup', email: ui.acMail }) });
    toast('E-mail renvoyé');
  }catch(e){
    /* On ne remet pas le compteur à zéro : réessayer tout de suite échouerait
       pareil, et le message dit déjà ce qu'il faut faire. */
    toast('Envoi impossible pour le moment');
  }
}

/* Sept appuis sur le logo : le réglage du serveur, rangé hors de vue mais
   jamais perdu. Un tap accidentel ne déclenche rien. */
let tapsLogo = 0, tapsLogoT = null;
function reglerServeur(){
  clearTimeout(tapsLogoT);
  tapsLogo++;
  tapsLogoT = setTimeout(()=>{ tapsLogo = 0; }, 1200);
  if(tapsLogo < 7) return;
  tapsLogo = 0; ui.editServer = true; render();
}

/* ===================== Mot de passe oublié =====================
   Trois moments : demander l'envoi, revenir par le lien reçu, choisir le
   nouveau mot de passe. Le jeton arrive dans le fragment de l'URL — la partie
   que le navigateur n'envoie jamais au serveur qui héberge la page. */
let reinit = { jeton:null, erreur:'', occupe:false };

function lireLienReinit(){
  const brut = (location.hash || '').replace(/^#/, '');
  if(!brut) return false;
  const p = new URLSearchParams(brut);
  const jeton = p.get('access_token'), type = p.get('type');
  const err = p.get('error_description') || p.get('error');
  if(!(type === 'recovery' && jeton) && !err) return false;   // pas pour nous
  reinit.jeton = (type === 'recovery') ? jeton : null;
  reinit.erreur = err ? err.replace(/\+/g, ' ') : '';
  /* On nettoie la barre d'adresse : un jeton n'a pas à rester dans l'historique
     ni à repartir dans un partage de lien. */
  try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  return true;
}

/* Le lien peut aussi tomber sur une app déjà ouverte : le navigateur change
   alors le fragment sans recharger la page, et le démarrage n'a plus lieu. */
window.addEventListener('hashchange', ()=>{
  /* MÊME ORDRE QU'AU DÉMARRAGE : le lien de réinitialisation d'abord, la route
     ensuite. Les deux occupent le fragment, et le lien doit être consommé puis
     effacé avant que quoi que ce soit d'autre le lise. */
  if(lireLienReinit()) return go('motdepasse');
  /* C3 — le service worker fait naviguer un onglet DÉJÀ OUVERT vers un nouveau
     fragment (`c.navigate`) quand on touche une notification alors que l'app
     tourne en arrière-plan. Sans cet écouteur, l'onglet revenait au premier
     plan sur l'écran où il était resté. */
  if(typeof fragmentVersRoute !== 'function') return;
  const r = fragmentVersRoute(location.hash);
  if(!r) return;
  if(r.view === view && String(r.params.id||'') === String(params.id||'')) return;
  if(!signedIn() && !VUES_SANS_COMPTE[r.view]){ destinationEnAttente = r; return; }
  const c = preparerEntreeDirecte(r.view, r.params);
  go(c.view, c.params, 'enter');
});

function demanderReinit(){
  const saisi = (document.getElementById('acmail')||{value:''}).value.trim();
  openSheet('<h3>Mot de passe oublié</h3>'+
    '<p class="small muted" style="margin:0 0 10px">On t\'envoie un lien pour en choisir '+
      'un nouveau. Il est valable une heure et ne sert qu\'une fois.</p>'+
    '<label class="fld"><span>Ton adresse e-mail</span>'+
      '<input type="text" id="rzmail" inputmode="email" autocapitalize="off" autocorrect="off" '+
      'spellcheck="false" placeholder="toi@exemple.fr" value="'+esc(saisi)+'" '+
      'onkeydown="if(event.key===\'Enter\'){this.blur();envoyerReinit()}"></label>'+
    '<button class="btn block" onclick="envoyerReinit()">Envoyer le lien</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

async function envoyerReinit(){
  const email = (document.getElementById('rzmail')||{value:''}).value.trim();
  if(!FORME_MAIL.test(email)) return toast('Cette adresse e-mail n\'a pas l\'air valide');
  toast('Envoi…');
  try{
    await sbDemanderReinit(email);
    closeSheet();
    /* On ne dit jamais si l'adresse existe : ce serait donner la liste des
       comptes à qui la demande. Le message vaut dans les deux cas. */
    openSheet('<h3>C\'est envoyé</h3>'+
      '<p class="small muted" style="margin:0 0 10px">Si un compte existe avec '+
        '<b>'+esc(email)+'</b>, un lien vient de partir. Regarde aussi tes courriers '+
        'indésirables — l\'expéditeur est une adresse technique.</p>'+
      '<p class="small muted" style="margin:0 0 10px">Le lien s\'ouvre dans ton navigateur, '+
        'pas dans l\'app. Tu y choisis ton nouveau mot de passe, puis tu reviens ici pour '+
        'te connecter.</p>'+
      '<button class="opt" onclick="closeSheet()">J\'ai compris</button>');
  }catch(e){
    toast(/rate|limit|seconds/i.test(e.message)
      ? 'Trop de demandes d\'affilée. Réessaie dans quelques minutes.'
      : 'Échec de l\'envoi : '+e.message);
  }
}

function viewMotDePasse(){
  if(reinit.erreur){
    return header('Lien expiré')+
      '<div class="wrap"><div class="intro">'+
        '<div class="acclogo">'+I.refresh+'</div>'+
        '<h2>Ce lien n\'est plus valable</h2>'+
        '<p>Les liens de réinitialisation ne durent qu\'une heure et ne servent qu\'une '+
          'fois. Demandes-en un nouveau, il arrivera tout de suite.</p>'+
      '</div>'+
      '<button class="btn block" style="margin-bottom:10px" onclick="quitterReinit(true)">'+
        'Demander un nouveau lien</button>'+
      '<button class="btn ghost block" onclick="quitterReinit(false)">Revenir à l\'app</button>'+
      '</div><div style="height:30px"></div>';
  }
  return header('Nouveau mot de passe')+
    '<div class="wrap">'+
      '<div class="intro">'+
        '<div class="acclogo">'+I.user+'</div>'+
        '<h2>Choisis ton nouveau mot de passe</h2>'+
        '<p>Il remplacera l\'ancien sur tous tes appareils. Tu devras te reconnecter '+
          'avec, là où tu es déjà connecté rien ne change.</p>'+
      '</div>'+
      '<label class="fld"><span>Nouveau mot de passe</span>'+
        '<input type="password" id="rzp1" autocomplete="new-password" '+
        'placeholder="au moins 6 caractères"></label>'+
      '<label class="fld"><span>Confirme-le</span>'+
        '<input type="password" id="rzp2" autocomplete="new-password" '+
        'placeholder="le même, pour être sûr" '+
        'onkeydown="if(event.key===\'Enter\'){this.blur();validerNouveauMdp()}"></label>'+
      '<button class="btn block" '+(reinit.occupe?'disabled ':'')+'onclick="validerNouveauMdp()">'+
        (reinit.occupe ? 'Enregistrement…' : 'Enregistrer')+'</button>'+
      '<button class="tiny muted" style="display:block;width:100%;text-align:center;padding:14px 8px" '+
        'onclick="quitterReinit(false)">Annuler</button>'+
    '</div><div style="height:30px"></div>';
}

function quitterReinit(redemander){
  reinit = { jeton:null, erreur:'', occupe:false };
  if(redemander){ go('account', {from:'profile'}); ui.acMode = 'connexion'; render(); demanderReinit(); }
  else go(signedIn() ? 'follow' : 'account');
}

async function validerNouveauMdp(){
  const a = (document.getElementById('rzp1')||{value:''}).value;
  const b = (document.getElementById('rzp2')||{value:''}).value;
  if(a.length < 6) return toast('Mot de passe de 6 caractères minimum');
  if(a !== b)      return toast('Les deux mots de passe ne sont pas identiques');
  if(!reinit.jeton) return toast('Lien invalide, demande-en un nouveau');
  reinit.occupe = true; render();
  try{
    await sbPoserMotDePasse(reinit.jeton, a);
    reinit = { jeton:null, erreur:'', occupe:false };
    /* On ne connecte pas d'office : le mot de passe qu'on vient de choisir doit
       servir au moins une fois, sinon on ne saura jamais s'il a bien été retenu. */
    ui.acMode = 'connexion';
    go('account', {from:'profile'});
    toast('Mot de passe changé. Connecte-toi avec.');
  }catch(e){
    reinit.occupe = false; render();
    toast(/expired|invalid/i.test(e.message)
      ? 'Ce lien a expiré, demande-en un nouveau'
      : 'Échec : '+e.message);
  }
}

/* Se déconnecter n'efface rien, mais mieux vaut le dire que le laisser deviner. */
function confirmerDeconnexion(){
  openSheet('<h3>Se déconnecter ?</h3>'+
    '<p class="small muted" style="margin:0 0 8px">L\'app se refermera sur l\'écran de connexion : '+
    'tes séries ne seront plus accessibles tant que tu ne t\'es pas reconnecté. Rien n\'est effacé — '+
    'avec le même compte, tout revient tel quel, et tout de suite.</p>'+
    '<button class="opt danger" onclick="closeSheet();sbSignOut()">Se déconnecter</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

/* Supprimer son compte est sans retour : on dit exactement ce qui part, ce qui
   reste, et on demande de recopier son adresse. Un bouton rouge de plus ne
   protège de rien ; recopier son adresse oblige à lire. */
function confirmerSuppression(){
  const mail = (db.auth && db.auth.email) || '';
  const nb = Object.keys(db.shows).length, nf = Object.keys(db.movies).length;
  const liens = (partage.suivis||[]).length + (partage.abonnes||[]).length;
  openSheet('<h3>Supprimer ton compte ?</h3>'+
    '<p class="small muted" style="margin:0 0 10px">Sont effacés du serveur, définitivement : '+
      '<b>'+nb+' série'+(nb>1?'s':'')+'</b>, <b>'+nf+' film'+(nf>1?'s':'')+'</b>, '+
      'ton profil, tes '+liens+' lien'+(liens>1?'s':'')+' de partage, et ton identifiant de '+
      'connexion. Personne ne peut les récupérer, moi non plus.</p>'+
    '<p class="small muted" style="margin:0 0 10px">Sans compte, l\'app ne s\'ouvre plus : tu reviendras '+
      'à l\'écran de création. <b>Fais un export d\'abord</b> si tu veux garder une copie de ta '+
      'bibliothèque quelque part.</p>'+
    '<label class="fld"><span>Recopie ton adresse pour confirmer</span>'+
      '<input type="text" id="supmail" inputmode="email" autocapitalize="off" autocorrect="off" '+
      'spellcheck="false" placeholder="'+esc(mail)+'" oninput="majBoutonSuppression()"></label>'+
    '<button class="opt danger" id="supbtn" disabled style="opacity:.4" onclick="doSupprimerCompte()">'+
      'Supprimer définitivement</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}
function majBoutonSuppression(){
  const el = document.getElementById('supmail'), b = document.getElementById('supbtn');
  if(!el || !b) return;
  const ok = el.value.trim().toLowerCase() === ((db.auth && db.auth.email)||'').toLowerCase();
  b.disabled = !ok;
  b.style.opacity = ok ? '1' : '.4';
}
async function doSupprimerCompte(){
  /* Le panneau fermé laisse ses champs dans la page : sans ce garde-fou, un
     appel tardif partirait sans session et échouerait de façon obscure. */
  if(!signedIn()) return closeSheet();
  const b = document.getElementById('supbtn');
  if(b){ b.disabled = true; b.textContent = 'Suppression…'; }
  try{
    await sbSupprimerCompte();
    /* Le compte n'existe plus : on oublie la session et tout ce qui décrivait
       les échanges avec les autres. Les titres, eux, restent sur l'appareil. */
    if(typeof oublierAppareil === 'function') oublierAppareil();
    db.auth = null;
    /* C2 (09/08) — LE PROPRIÉTAIRE PART AVEC LE COMPTE.
       `db.proprio` restait sur l'identifiant d'un compte qui n'existe plus.
       L'écran promet que les titres restent sur l'appareil — et ils restaient,
       jusqu'à la création du compte SUIVANT : `adopterCompte` voyait alors un
       propriétaire différent et vidait la bibliothèque. Quelqu'un qui refait un
       compte pour repartir du bon pied perdait tout, sans un mot, à l'instant
       exact où il croyait récupérer ses séries. Et rien ne pouvait le rattraper :
       le compte d'origine était détruit, la copie serveur avec.
       À `null`, la bibliothèque est de nouveau SANS propriétaire : le prochain
       compte l'adopte en silence, comme au premier jour. */
    db.proprio = null;
    db.syncedAt = null; syncState = 'off';
    partage.suivis = []; partage.abonnes = []; partage.code = null;
    saveDB(); closeSheet(); go('profile');
    toast('Compte supprimé.');
  }catch(e){
    if(b){ b.disabled = false; b.textContent = 'Supprimer définitivement'; }
    toast('Échec : '+e.message);
  }
}

/* ---------------------------------------------------------------------------
   S5 (09/08) — CHANGER DE SERVEUR EST UNE DÉCISION, PAS UN RÉGLAGE

   Cet écran vit derrière sept appuis sur le logo, donc on ne l'atteint pas par
   hasard — mais on peut très bien y être GUIDÉ par quelqu'un. « Tape cette
   adresse pour débloquer ton compte » est une phrase qui marche, et l'écran
   faisait alors trois choses de travers, chacune suffisante :

     1. IL ACCEPTAIT `http://`. Le mot de passe, le jeton et toute la
        bibliothèque partaient en clair sur le réseau du café d'à côté.
     2. IL NE TOUCHAIT PAS À LA SESSION. `db.auth` restait en place, si bien que
        le PROCHAIN appel (`sbFetch`, app-01) envoyait le jeton porteur du
        projet PRÉCÉDENT au serveur qu'on venait de désigner. Le jeton de
        rafraîchissement survit à un changement de mot de passe : le donner,
        c'est donner le compte.
     3. IL NE DEMANDAIT RIEN. Un champ, un bouton, aucun avertissement.

   Les trois sont fermés ici : forme imposée, session jetée, confirmation
   explicite qui NOMME la conséquence.

   `http://localhost` et `http://127.0.0.1` restent acceptés — un serveur local
   ne traverse aucun réseau, et les tests en ont besoin. */
const SERVEUR_LOCAL = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/;
const urlServeurValide = u =>
  typeof u === 'string' && (/^https:\/\/[^\s/]+/.test(u) || SERVEUR_LOCAL.test(u));

/* Sommes-nous ailleurs que sur le serveur d'origine ? Sert au bouton de retour :
   il n'a rien à proposer tant qu'on n'a rien changé. */
function serveurPersonnalise(){
  return !!(db.sync && db.sync.url && db.sync.url !== DEFAULT_SYNC.url);
}

/* Ce qui attend la confirmation. `null` le reste du temps. */
let syncEnAttente = null;

function saveSync(){
  const url = document.getElementById('sburl').value.trim();
  const k   = document.getElementById('sbkey').value.trim();
  if(!urlServeurValide(url))
    return toast('Adresse refusée : il faut une adresse en https://');
  if(k.length < 20) return toast('Clé invalide');
  const propre = url.replace(/\/+$/,'');
  /* Rien n'a bougé : pas de confirmation, pas de déconnexion. Faire payer une
     reconnexion à qui a seulement rouvert l'écran serait absurde. */
  if(propre === db.sync.url && k === db.sync.key){
    ui.editServer = false; render();
    return toast('Serveur inchangé');
  }
  syncEnAttente = { url:propre, key:k };
  openSheet('<h3>Changer de serveur ?</h3>'+
    '<p class="small muted" style="margin:0 0 8px">Ton compte et tes données passeront par '+
    '<b>'+esc(propre)+'</b>. Ne fais ça que si c\'est <b>TON</b> serveur : celui qui le tient '+
    'voit ce que tu y déposes.</p>'+
    '<p class="small muted" style="margin:0 0 8px">Ta session actuelle sera fermée — '+
    'tu devras te reconnecter. Les titres enregistrés sur cet appareil restent en place.</p>'+
    '<button class="opt danger" onclick="closeSheet();appliquerSync()">Changer de serveur</button>'+
    '<button class="opt" onclick="closeSheet();syncEnAttente=null">Annuler</button>');
}

/* Le seul endroit qui écrit `db.sync`. La session est jetée AVANT le premier
   appel au nouveau serveur — c'est tout l'objet de S5. */
function appliquerSync(){
  const s = syncEnAttente; if(!s) return;
  syncEnAttente = null;
  if(typeof oublierAppareil === 'function') oublierAppareil();
  db.sync = { url:s.url, key:s.key };
  db.auth = null; db.syncedAt = null; syncState = 'off';
  partage.suivis = []; partage.abonnes = []; partage.code = null; partage.charge = false;
  ui.editServer = false;
  saveDB(); render();
  toast('Serveur enregistré — reconnecte-toi');
}

/* Revenir au serveur d'origine. Même conséquence, donc même confirmation : on
   quitte un serveur pour un autre, la session ne suit pas. */
function resetSync(){
  if(!serveurPersonnalise()) return toast('Tu es déjà sur le serveur d\'origine');
  syncEnAttente = Object.assign({}, DEFAULT_SYNC);
  openSheet('<h3>Revenir au serveur d\'origine ?</h3>'+
    '<p class="small muted" style="margin:0 0 8px">L\'app repassera par '+
    '<b>'+esc(DEFAULT_SYNC.url)+'</b>. Ta session sur le serveur actuel sera fermée — '+
    'tu devras te reconnecter. Les titres enregistrés sur cet appareil restent en place.</p>'+
    '<button class="opt danger" onclick="closeSheet();appliquerSync()">Revenir au serveur d\'origine</button>'+
    '<button class="opt" onclick="closeSheet();syncEnAttente=null">Annuler</button>');
}

/* B10 (09/08) — LE VERROU ET LE BOUTON ÉTEINT, pour les deux portes du compte.
   Ni `doSignIn` ni `doSignUp` n'étaient protégés : pas de `prendre()`, pas de
   `disabled`. Avec un délai serveur pouvant aller à 45 s (`SB_TIMEOUT`), un
   double appui — le geste le plus naturel du monde quand rien ne bouge —
   envoyait deux requêtes. Sur la création, la seconde revenait avec « un compte
   existe déjà avec cette adresse », un message FAUX au sens où il désigne le
   compte que le premier appui venait de créer.
   Le bouton est éteint dans la foulée sans repasser par `render()` : redessiner
   l'écran effacerait le mot de passe déjà tapé si l'appel échoue. */
function verrouAuth(actif){
  const b = document.getElementById('acgo');
  if(b) b.disabled = !!actif;
}
async function doSignIn(){
  const email = document.getElementById('acmail').value.trim();
  const pass  = document.getElementById('acpass').value;
  if(!email || !pass) return toast('Renseigne e-mail et mot de passe');
  if(!FORME_MAIL.test(email)) return toast('Cette adresse e-mail n\'a pas l\'air valide');
  if(!prendre('auth')) return;
  verrouAuth(true);
  toast('Connexion…');
  try{
    await sbSignIn(email, pass);
    /* C3 — une notification touchée alors qu'on était déconnecté a mis sa
       destination de côté : on la rejoue maintenant plutôt que de la perdre.
       Elle passe avant l'atterrissage par défaut, sinon on ouvrirait « À
       suivre » sur le dos de la fiche que la personne venait chercher. */
    if(typeof rejouerDestination === 'function' && rejouerDestination()){ /* rien de plus */ }
    /* Venu de la porte d'entrée : on ouvre l'app plutôt que de laisser la
       personne sur l'écran de compte qu'elle vient de remplir. */
    else if(!params.from) go('follow'); else render();
    toast('Connecté');
    await syncNow();
    await majProfil(); await chargerPartage();
    /* Nouveau téléphone, ou retour après une déconnexion : si iOS a déjà donné
       son accord, l'appareil se réinscrit sans qu'on ait à le demander. */
    inscrireSiBesoin();
  }catch(e){
    /* C2 (SPEC-01) — la personne a refusé de laisser retirer la bibliothèque
       posée sur cet appareil. Ce n'est pas un échec de connexion, et surtout
       pas « mot de passe incorrect » : rien n'a été touché, ni la session, ni
       la base. Traité ici plutôt que dans `messageAuth`, exactement comme dans
       `doSignUp` juste en dessous — les deux portes se lisent pareil.
       Le `return` ne saute pas le `finally` : le verrou de B10 est rendu. */
    if(e && e.annule) return toast('Connexion annulée — la bibliothèque de cet appareil n\'a pas été touchée');
    toast(messageAuth(e));                             // B10 — plus de texte brut
  }
  finally{ rendre('auth'); verrouAuth(false); }
}
/* B10 (09/08) — LES MESSAGES DU SERVEUR SONT EN ANGLAIS, ET ON LES AFFICHAIT
   TELS QUELS. Seul « Invalid… » était traduit ; « Email not confirmed »,
   « Password should be at least 6 characters » et « For security purposes, you
   can only request this after N seconds » arrivaient bruts sous les yeux de
   quelqu'un qui essaie simplement de créer un compte.
   Une seule table, pour les deux portes, et un repli générique : on n'affiche
   PLUS le texte brut du serveur, jamais — il ne dit rien à personne et il fait
   peur. Un message doit dire quoi FAIRE, pas seulement ce qui a raté. */
function messageAuth(e){
  const m = String((e && e.message) || '');
  if(/CONFIRM/.test(m) || /email not confirmed/i.test(m))
    return 'Ton adresse n\'est pas confirmée — ouvre le message qu\'on t\'a '+
           'envoyé (pense aux spams).';
  if(/already regist|user already/i.test(m))
    return 'Un compte existe déjà avec cette adresse.';
  if(/password should be at least/i.test(m))
    return 'Mot de passe de 6 caractères minimum.';
  const s = m.match(/after (\d+) seconds?/i);
  if(s) return 'Trop d\'essais d\'affilée — réessaie dans '+s[1]+' secondes.';
  if(/for security purposes/i.test(m)) return 'Trop d\'essais d\'affilée — réessaie dans un instant.';
  if(/invalid/i.test(m)) return 'E-mail ou mot de passe incorrect';
  /* `DELAI` est le nom que `sbFetch` (app-01) donne au dépassement des 45 s :
     c'est un problème de réseau, pas un refus du serveur, et il doit se lire
     comme tel plutôt que de tomber dans le repli générique. */
  if(/DELAI|RESEAU|network|failed to fetch|timeout|abort/i.test(m))
    return 'Pas de connexion — réessaie dans un instant.';
  return 'Échec : réessaie dans un instant';
}
/* Contrôle minimal de forme : une adresse sans arobase ou sans point après
   n'est pas une adresse. On ne cherche pas à valider plus loin — seul un envoi
   réel prouverait qu'elle existe, et l'inscription reste instantanée. */
const FORME_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function doSignUp(){
  const nom   = (document.getElementById('acnom')||{value:''}).value.trim();
  const email = document.getElementById('acmail').value.trim();
  const pass  = document.getElementById('acpass').value;
  const pass2 = (document.getElementById('acpass2')||{value:''}).value;
  if(!nom)                    return toast('Indique ton prénom');
  if(!FORME_MAIL.test(email)) return toast('Cette adresse e-mail n\'a pas l\'air valide');
  if(pass.length < 6)         return toast('Mot de passe de 6 caractères minimum');
  if(pass !== pass2)          return toast('Les deux mots de passe ne sont pas identiques');
  if(!prendre('auth')) return;                       // B10 — un seul appui compte
  verrouAuth(true);
  toast('Création du compte…');
  try{
    await sbSignUp(email, pass);
    /* Le prénom est enregistré avant la synchro : sans ça, le profil partait
       avec le début de l'adresse e-mail en guise de nom. */
    db.pseudo = nom; saveDB();
    /* Le compte est fait : on propose l'avatar dans la foulée, sur son propre
       écran. C'est le bon moment — dans le formulaire, il aurait allongé une
       page déjà longue. Depuis les réglages, on ne déroute pas la personne. */
    if(!params.from){ ui.avatarOnglet = null; go('avatar'); }
    else render();
    toast('Compte créé');
    await syncNow();
    await majProfil(); await chargerPartage();
    /* Rare mais réel : un téléphone où iOS avait déjà accordé l'autorisation
       pour un compte précédent. Autant inscrire tout de suite. */
    inscrireSiBesoin();
  }catch(e){
    /* C2 — refus de laisser retirer la bibliothèque de l'ancien propriétaire.
       Le compte, lui, VIENT D'ÊTRE CRÉÉ côté serveur : on le dit, sinon la
       personne réessaierait et se heurterait à « un compte existe déjà ». */
    if(e && e.annule) return toast('Compte créé, mais connexion annulée : la bibliothèque de cet appareil n\'a pas été touchée');
    if(e.message === 'CONFIRM'){
      /* D4 — l'étape la plus fragile du parcours n'avait qu'un toast de 2,2 s
         pour instruction, et l'écran restait sur le formulaire de création : il
         fallait deviner qu'on devait basculer sur « J'ai déjà un compte » après
         avoir cliqué dans son mail. On lui donne un écran à lui. */
      ui.acMail = email; ui.acNom = nom; ui.acMode = 'confirme';
      db.pseudo = nom; saveDB();
      /* B10 — le verrou est rendu AVANT le rendu de l'écran suivant, sinon
         celui-ci se dessinerait avec son bouton éteint. */
      rendre('auth');
      render();
    }
    else toast(messageAuth(e));                      // B10 — plus de texte brut
  }
  finally{ rendre('auth'); verrouAuth(false); }
}

/* ===========================================================================
   SPEC-10 — LES RECOS ENTRE AMIS ET LE CENTRE DE NOTIFICATIONS 🔔

   Décision d'Adrien (25/08) : les recos ne vont NI dans « Mon profil » NI dans
   « Mes abonnements ». Elles vivent dans un centre qui compile TOUT ce qui
   arrive — les recos reçues, les retours sur mes recos, les sorties — derrière
   une cloche posée sur trois onglets et pas un de plus.

   L'ÉCRAN S'APPELLE `centre` ET NON `notifs`, ET CE N'EST PAS UN CAPRICE.
   La spec écrit `go('notifs')` ; or `notifs` EXISTE DÉJÀ depuis app-09 — c'est
   l'écran « Notifications » des Réglages, celui des cloches par titre et des
   interrupteurs de push. Lui prendre son nom aurait remplacé un écran par un
   autre en silence, cassé `currentBack` (`clochettes` revient sur `notifs`) et
   l'adresse partageable `#/notifications`. Les deux écrans coexistent donc,
   sous deux noms : `notifs` = les RÉGLAGES de notification, `centre` = le fil.
   C'est signalé à Adrien dans le LIVRAISON.md.

   Ce fichier porte tout ce qui est NEUF côté écran ; ce qui touche à la base
   (`envoyerRecos`, `marquerRetourReco`, `notifLus`) vit dans app-01, avec le
   reste de `conseils` — un seul fichier écrit dans cet objet.
--------------------------------------------------------------------------- */

/* ---------- Lu / non-lu ----------

   Une clé stable par entrée, et elle ne doit JAMAIS dépendre de l'ordre du fil
   ni de la date du jour : `reco:<id>`, `retour:<id>:<champ>`,
   `sortie:<type>:<tmdbId>:<date>`. Les lues vivent dans `db.notifLus` et
   voyagent par la synchro existante — même compte, même état partout. */
function estLuNotif(cle){
  return !!((db.notifLus || {})[cle]);
}
function marquerLuNotif(cle){
  if(!cle || estLuNotif(cle)) return false;
  if(!db.notifLus || typeof db.notifLus !== 'object') db.notifLus = {};
  db.notifLus[cle] = Date.now();
  saveDB();
  return true;
}
/* Un ménage borné : au-delà de soixante jours, une clé lue ne peut plus
   correspondre à rien (le fil s'arrête à trente). Sans lui, `notifLus`
   grossirait indéfiniment et monterait au serveur à chaque synchro. */
const NOTIF_OUBLI = 60 * 86400000;
function nettoyerNotifLus(){
  const n = db.notifLus;
  if(!n || typeof n !== 'object') return;
  const t = Date.now();
  let bouge = false;
  Object.keys(n).forEach(cle=>{
    if(t - (Number(n[cle]) || 0) > NOTIF_OUBLI){ delete n[cle]; bouge = true; }
  });
  if(bouge) saveDB();
}

/* ---------- Le fil ----------

   Trois familles d'entrées, une seule liste, triée du plus récent au plus
   ancien et bornée à trente jours. Chaque entrée porte : sa clé, sa date, sa
   famille, et de quoi se dessiner. */
const CENTRE_JOURS = 30;          // au-delà, le fil ne montre plus rien
const CENTRE_FENETRE_SORTIES = 7; // les sorties : 7 jours en arrière, 7 en avant
/* En HEURE LOCALE, comme tout ce qui se compare à une date TMDB dans l'app
   (`isoLocal`, app-02) : `isoIlYA` d'app-04 travaille en UTC, et entre minuit
   et 2 h à Paris il rendrait la veille — une sortie du jour disparaîtrait du
   fil une nuit sur deux. Le pendant vers l'AVANT n'existait nulle part : « la
   semaine à venir » du §4 est la seule chose de l'app qui regarde devant elle
   en jours. Une fonction pour les deux sens, signe compris. */
function isoJoursCentre(n){
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

/* Le scan des épisodes coûte cher (la bibliothèque d'Adrien en porte plusieurs
   milliers) et la pastille se recalcule au rendu de CHAQUE écran qui en porte
   une. On garde donc le résultat une minute — au-delà, une sortie du jour
   arriverait de toute façon avec le prochain chargement. C'est le même
   arbitrage que le regroupement de `saveDB`, pour la même raison. */
let sortiesCentreCache = { t:0, jour:'', l:[] };
function sortiesCentre(){
  const j = todayISO();
  if(sortiesCentreCache.jour === j && Date.now() - sortiesCentreCache.t < 60000)
    return sortiesCentreCache.l;
  const debut = isoJoursCentre(-CENTRE_FENETRE_SORTIES);
  const fin = isoJoursCentre(CENTRE_FENETRE_SORTIES);
  const l = [];
  /* Les épisodes : MÊMES SOURCES QU'« EN COURS » — les séries suivies, hors
     pause. On ne recalcule rien de neuf, on relit ce qui existe.

     CORRECTION DE RELECTURE C-3 (28/08/2026) — MÊMES SOURCES NE VOULAIT PAS DIRE
     MÊMES RÈGLES, ET ÇA SE VOYAIT DANS LA PASTILLE.

     Le balayage retenait TOUT épisode daté dans la fenêtre, sans regarder ni
     `s.watched` ni le statut de la série. Deux conséquences, toutes deux
     reproduites par la relecture :

       · un épisode DÉJÀ COCHÉ VU était annoncé « est disponible », et comptait
         un non-lu de plus. Annoncer comme nouveau ce qui a déjà été regardé est
         exactement ce qui apprend à ignorer une pastille — l'argument que ce
         dépôt emploie déjà deux fois ailleurs ;
       · une série AJOUTÉE MAIS JAMAIS COMMENCÉE déversait tous ses épisodes de
         la semaine, alors qu'« En cours » n'en annonce que la première (le
         point 2 du cycle 3 avait déjà tranché ce cas-là, pour le calendrier).

     On aligne donc les DEUX règles sur `viewFollow`. La fenêtre, elle, reste
     différente — le centre regarde sept jours en arrière, ce que « En cours » ne
     fait pas : c'est le propre d'un fil, il dit aussi ce qui vient de sortir. */
  Object.values(db.shows || {}).forEach(s=>{
    if(!s) return;
    const st = (typeof statutSerie === 'function') ? statutSerie(s) : '';
    if(st === 'pause') return;
    /* Jamais commencée : sa PREMIÈRE, et rien d'autre — comme le calendrier. */
    const pasCommencee = st === 'avoir';
    (allEpisodes(s, false) || []).forEach(ep=>{
      if(!ep.d || ep.d < debut || ep.d > fin) return;
      /* Déjà vu : ce n'est plus une nouvelle. */
      if(s.watched && s.watched[key(ep.s, ep.e)]) return;
      if(pasCommencee && !(s.first && ep.d === s.first)) return;
      l.push({ cle:'sortie:tv:'+s.id+':'+ep.d, quand:ep.d, fam:'sortie', ic:'📅',
               titre: s.name + ' · S'+ep.s+'E'+ep.e+' est disponible',
               sous: ep.n ? '« '+ep.n+' »' : '',
               type:'tv', id:s.id });
    });
  });
  /* Les films : `filmsBientot` est déjà la source d'« En cours ». Elle ne rend
     que des dates à venir — c'est sa fenêtre, on ne la force pas. */
  ((typeof filmsBientot === 'function') ? filmsBientot() : []).forEach(f=>{
    if(!f || !f.dfr || f.dfr < debut || f.dfr > fin) return;
    l.push({ cle:'sortie:movie:'+f.id+':'+f.dfr, quand:f.dfr, fam:'sortie', ic:'🎬',
             titre: f.titre + ' — ' + (f.mot || 'sort bientôt'),
             sous: fmtDate(f.dfr), type:'movie', id:f.id });
  });
  sortiesCentreCache = { t:Date.now(), jour:j, l:l };
  return l;
}

function entreesCentre(){
  const borne = isoJoursCentre(-CENTRE_JOURS);
  const l = [];
  /* 1. LES RECOS REÇUES — la carte complète. */
  ((conseils && conseils.recues) || []).forEach(r=>{
    if(!r || !r.cree) return;
    const j = String(r.cree).slice(0,10);
    if(j < borne) return;
    l.push({ cle:'reco:'+r.id, quand:String(r.cree), fam:'reco', reco:r });
  });
  /* 2. LES RETOURS SUR MES RECOS — dérivés de `ajoute / termine / aime` lus sur
     ce que j'ai envoyé. Une ligne par champ posé : « il l'a ajoutée » et « il
     l'a terminée » sont deux nouvelles, à deux moments. */
  const RETOURS = [
    { champ:'ajoute',  ic:'✓',  mot:qui => qui+' a ajouté « TITRE » à sa liste' },
    { champ:'termine', ic:'👍', mot:qui => qui+' a terminé « TITRE »' },
    { champ:'aime',    ic:'👍', mot:qui => qui+' a aimé « TITRE »' }
  ];
  ((conseils && conseils.envoyees) || []).forEach(r=>{
    if(!r) return;
    RETOURS.forEach(t=>{
      const q = r[t.champ];
      if(!q) return;
      if(String(q).slice(0,10) < borne) return;
      l.push({ cle:'retour:'+r.id+':'+t.champ, quand:String(q), fam:'retour', ic:t.ic,
               titre: t.mot(nomDuCercle(r.vers)).replace('TITRE', r.titre || 'un titre'),
               sous: 'ta reco du '+fmtDate(String(r.cree).slice(0,10)),
               type: r.type, id: r.tmdb_id });
    });
  });
  /* 3. LES SORTIES. */
  sortiesCentre().forEach(x=>{ if(String(x.quand).slice(0,10) >= borne) l.push(x); });
  /* Du plus récent au plus ancien. Les sorties à venir passent donc en tête,
     ce qui est ce qu'on veut savoir : « qu'est-ce qui arrive ? » d'abord. */
  l.sort((a,b)=> String(b.quand).localeCompare(String(a.quand)));
  return l;
}

/* Les trois groupes du §4. Ils se lisent en distance au jour d'aujourd'hui, et
   pas « avant / après » : une sortie de vendredi et un épisode de mardi sont
   tous les deux « cette semaine ». */
function groupeCentre(quand){
  const j = String(quand).slice(0,10), auj = todayISO();
  if(j === auj) return "Aujourd'hui";
  return (j >= isoJoursCentre(-7) && j <= isoJoursCentre(7)) ? 'Cette semaine' : 'Plus ancien';
}

function nbNonLusCentre(){
  return entreesCentre().filter(e => !estLuNotif(e.cle)).length;
}

/* ---------- La cloche ----------

   Trois onglets, une seule fonction : Découvrir, En cours, Mon profil. PAS sur
   Recherche — l'écran reste tout entier à la barre et au ✦ (§7, bloquant), et
   pas non plus sur les fiches, où `boutonCloche` (app-09) occupe déjà le coin
   avec un tout autre sens : « préviens-moi pour CE titre ». Deux cloches
   côte à côte disant deux choses différentes, c'était le meilleur moyen de
   rendre les deux illisibles. */
function clocheCentre(){
  const n = nbNonLusCentre();
  return '<button class="iconbtn clochec" aria-label="Notifications'+
      (n ? ' ('+n+' non lues)' : '')+'" onclick="ouvrirCentre()">'+I.cloche+
    (n ? '<span class="cbadge">'+(n > 99 ? '99+' : n)+'</span>' : '')+'</button>';
}
function ouvrirCentre(){
  /* `from` EXACT, jamais codé en dur (§7) : on revient d'où l'on vient, et le
     fil s'ouvre depuis trois écrans différents. */
  go('centre', { from: view });
}

/* ---------- L'écran ---------- */
function viewCentre(){
  nettoyerNotifLus();
  const l = entreesCentre();
  const reste = l.some(e => !estLuNotif(e.cle));
  let html = header('Notifications', {
    back: 'goBack()',
    /* Un LIEN, pas un bouton plein : « Tout marquer lu » est une commodité, pas
       l'action de l'écran — la maquette 25 le pose en texte d'accent, et un
       gros bouton blanc à côté du titre volerait l'attention au fil. */
    right: reste ? '<button class="toutlu" onclick="toutMarquerLuCentre()">Tout marquer lu</button>' : ''
  });
  if(!l.length)
    return html + '<div class="empty"><h3>🔕 Rien pour l\'instant</h3>'+
      '<p>Les sorties et les recos de ton cercle arriveront ici.</p></div>'+
      '<div style="height:26px"></div>';
  /* CORRECTION DE RELECTURE C-1 (28/08/2026) — « CETTE SEMAINE » S'AFFICHAIT DEUX
     FOIS, DE PART ET D'AUTRE D'« AUJOURD'HUI ».

     Le fil est trié du plus récent au plus ancien, SORTIES À VENIR COMPRISES
     (jusqu'à J+7). L'en-tête n'était réémis que lorsqu'il CHANGEAIT du précédent.
     Or une sortie de vendredi est « Cette semaine », un épisode d'avant-hier
     aussi — et « Aujourd'hui » passe entre les deux :

         Cette semaine   ← les sorties à venir
         Aujourd'hui
         Cette semaine   ← la même section, une seconde fois
         Plus ancien

     Le §4 et la maquette 25 donnent TROIS groupes, dans un ordre fixe. On ne
     déduit donc plus le découpage de l'ordre d'arrivée : on RANGE les entrées
     dans les trois seaux, et on rend les seaux dans leur ordre à eux. Le tri
     à l'intérieur d'un groupe reste celui d'`entreesCentre` — du plus récent au
     plus ancien, donc « ce qui arrive » avant « ce qui vient de se passer ». */
  const SEAUX = ["Aujourd'hui", 'Cette semaine', 'Plus ancien'];
  const seaux = {};
  SEAUX.forEach(g => { seaux[g] = []; });
  l.forEach(e => { (seaux[groupeCentre(e.quand)] || seaux['Plus ancien']).push(e); });
  html += '<div class="wrap" style="padding-top:4px">';
  SEAUX.forEach(g=>{
    if(!seaux[g].length) return;
    html += '<div class="sectitle" style="margin-left:0">'+esc(g)+'</div>';
    seaux[g].forEach(e=>{
      html += (e.fam === 'reco') ? carteRecoCentre(e) : ligneCentre(e);
    });
  });
  html += '</div><div style="height:26px"></div>';
  return html;
}

/* Une ligne simple : un retour, une sortie. Toucher la ligne la marque lue et
   ouvre ce qu'elle désigne — c'est le geste attendu, il n'y en a pas d'autre. */
function ligneCentre(e){
  const lu = estLuNotif(e.cle);
  return '<button class="notifl'+(lu ? '' : ' nonlu')+'" onclick="toucherCentre(\''+
      escJs(e.cle)+'\',\''+escJs(String(e.type||''))+'\','+Number(e.id||0)+')">'+
    '<span class="notifi">'+esc(e.ic||'•')+'</span>'+
    '<span class="notift"><b>'+esc(e.titre)+'</b>'+
      (e.sous ? '<span>'+esc(e.sous)+'</span>' : '')+'</span>'+
  '</button>';
}
function toucherCentre(cle, type, id){
  marquerLuNotif(cle);
  if(id && (type === 'tv' || type === 'movie')) return ouvrirTitre(id, type, 'centre');
  render();
}
function toutMarquerLuCentre(){
  entreesCentre().forEach(e=>{
    if(!db.notifLus || typeof db.notifLus !== 'object') db.notifLus = {};
    if(!db.notifLus[e.cle]) db.notifLus[e.cle] = Date.now();
  });
  saveDB();
  render();
}

/* ---------- L'affiche et la méta d'une reco ----------

   La maquette 25 montre la carte COMPLÈTE : affiche, titre, méta
   (type · année · note · saisons). Or la ligne de `recommandations` ne porte
   que le titre — c'est délibéré (§1 : sans lui, afficher la liste demanderait
   un appel TMDB par ligne AVANT de savoir si ça intéresse). Les deux se
   concilient sans rien renier :

     · si le titre est DÉJÀ chez nous, on lit la bibliothèque, zéro requête ;
     · sinon on demande la fiche UNE fois, à l'ouverture du centre, et on la
       garde pour la session. C'est au plus une requête par reco des trente
       derniers jours, et seulement quand on ouvre le fil — jamais au démarrage,
       jamais pour la pastille.

   Une fiche qui n'arrive pas ne casse rien : la carte s'affiche sans affiche et
   sans méta, comme avant. On ne montre jamais un écran d'erreur pour une image. */
let fichesReco = {};
function ficheReco(type, id){
  const cle = type+':'+id;
  /* La bibliothèque d'abord : c'est gratuit et c'est à jour. */
  const chezMoi = type === 'tv' ? db.shows[id] : db.movies[id];
  if(chezMoi) return { poster: chezMoi.poster, nom: chezMoi.name || chezMoi.title,
                       annee: (chezMoi.first || chezMoi.date || '').slice(0,4),
                       note: chezMoi.note, saisons: chezMoi.seasons
                             ? Object.keys(chezMoi.seasons).length : 0 };
  const e = fichesReco[cle];
  if(e && e.d) return e.d;
  if(e) return null;                                  // demande en vol
  fichesReco[cle] = { d:null };
  tmdb('/'+type+'/'+id).then(x=>{
    fichesReco[cle] = { d: { poster:x.poster_path, nom:x.name || x.title,
                             annee: String(x.first_air_date || x.release_date || '').slice(0,4),
                             note: x.vote_average, saisons: x.number_of_seasons || 0 } };
    if(view === 'centre') render();
  }).catch(()=>{ fichesReco[cle] = { d:null, rate:true }; });
  return null;
}
/* « Série · 2017 · ★ 8,4 · 3 saisons ». On n'écrit que ce qu'on sait. */
function metaReco(type, d){
  const l = [ type === 'tv' ? 'Série' : 'Film' ];
  if(d.annee) l.push(d.annee);
  if(d.note) l.push('★ ' + String(Math.round(d.note*10)/10).replace('.', ','));
  if(d.saisons) l.push(d.saisons + ' saison' + (d.saisons > 1 ? 's' : ''));
  return l.join(' · ');
}

/* ---------- La carte reco ----------

   Trois boutons, et PAS de « Non merci » : le §0.6 est explicite, rien ne
   disparaît du fil sur un geste. « Plus tard » marque lu et retire son propre
   bouton ; la carte, elle, reste consultable. */
function carteRecoCentre(e){
  const r = e.reco;
  const lu = estLuNotif(e.cle);
  const de = nomDuCercle(r.de);
  const idOk = estIdTmdb(r.tmdb_id) && (r.type === 'tv' || r.type === 'movie');
  const chezMoi = idOk && dejaChezMoi(r.type === 'tv' ? 'tv' : 'movie', r.tmdb_id);
  /* L'affiche et la méta de la maquette 25 — nulles tant qu'on ne les a pas :
     la carte se dessine quand même, elle se complètera au rendu suivant. */
  const d = idOk ? ficheReco(r.type, r.tmdb_id) : null;
  let h = '<div class="recoc'+(lu ? '' : ' nonlu')+'">'+
    '<div class="recoct">'+
      (typeof avatarDe === 'function'
        ? avatarDe(cercle().find(p => String(p.id) === String(r.de)) || { pseudo:de }, 'moyen')
        : '')+
      '<div><b>'+esc(de)+' te recommande '+(r.type === 'tv' ? 'une série' : 'un film')+'</b>'+
        '<span>'+esc(fmtDate(String(r.cree).slice(0,10)))+'</span></div>'+
    '</div>'+
    '<div class="recocc">'+
      (d ? posterEl(d.poster, 'w185', 'recocp', r.titre || '') : '')+
      '<div class="recocx">'+
        /* C-2 — un titre vide arrivé d'une version antérieure se répare ici dès
         que la fiche TMDB est là : la carte lisait `r.titre` et rien d'autre,
         donc « Un titre » restait « Un titre » pour toujours. */
      '<div class="recocn">'+esc(r.titre || (d && d.nom) || 'Un titre')+'</div>'+
        (d ? '<div class="recocm">'+esc(metaReco(r.type, d))+'</div>' : '')+
        (r.mot ? '<div class="recocb">'+esc(r.mot)+'</div>' : '')+
      '</div>'+
    '</div>';
  /* Après « + À voir », la carte se replie : une seule ligne verte qui dit ce
     qui s'est passé ET que l'expéditeur le sait.

     CORRECTION DE RELECTURE C-4 (28/08/2026) — ELLE SE REPLIAIT AUSSI SUR
     `chezMoi`, c'est-à-dire sur un titre qu'on possédait DÉJÀ avant de recevoir
     la reco. On perdait alors « Voir la fiche » et « Plus tard » sur une carte
     à laquelle on n'avait pourtant pas répondu : l'action de LECTURE
     disparaissait sans que personne l'ait demandé. Le repli appartient au geste
     (`ajoute`), pas à l'état de la bibliothèque. Un titre déjà chez soi garde
     donc ses boutons — « + À voir » cède seulement la place à un témoin, parce
     que celui-là n'a effectivement plus rien à faire. */
  if(r.ajoute){
    h += '<div class="recook">✓ Dans ta liste — '+esc(de)+' est notifié</div>';
  }else{
    h += '<div class="recocb2">'+
      (idOk && chezMoi
        ? '<span class="btn mini ghost" aria-disabled="true">✓ Déjà dans ta liste</span>'
        : idOk ? '<button class="btn mini" onclick="ajouterDepuisReco(\''+escJs(r.id)+'\')">+ À voir</button>' : '')+
      (idOk ? '<button class="btn mini ghost" onclick="ouvrirConseil(\''+escJs(r.id)+'\','+
                Number(r.tmdb_id)+',\''+escJs(r.type)+'\',\'centre\')">Voir la fiche</button>' : '')+
      (lu ? '' : '<button class="btn mini ghost" onclick="plusTardReco(\''+escJs(e.cle)+'\')">Plus tard</button>')+
    '</div>';
  }
  return h + '</div>';
}
function plusTardReco(cle){
  marquerLuNotif(cle);
  render();
}
/* « + À voir » : on ajoute le titre à la liste ET on pose `ajoute` — dans cet
   ordre, et sans attendre le second. L'ajout est le geste, le retour n'est
   qu'une politesse envers l'expéditeur. */
function ajouterDepuisReco(idReco){
  const r = ((conseils && conseils.recues) || []).find(x => x.id === idReco);
  if(!r) return;
  marquerLuNotif('reco:'+r.id);
  marquerRetourReco(r, 'ajoute');
  if(r.type === 'tv'){
    /* `true` = « ajoute mais n'ouvre pas la fiche » : le §4 veut que la carte
       se replie SOUS LES YEUX, dans le fil. Sans ce drapeau, `addOrOpenShow`
       nous téléporterait sur la fiche et le repli ne se verrait jamais. */
    addOrOpenShow(Number(r.tmdb_id), true);
  }else{
    ajouterAVoir(Number(r.tmdb_id));
  }
  render();
}

/* ---------- L'envoi, depuis la fiche (§3) ---------- */

/* Le bouton 💌 de la rangée d'actions. Visible seulement si le cercle n'est pas
   vide : proposer « recommander » à qui ne suit personne, c'est ouvrir une
   feuille vide — c'est déjà la règle du menu ⋯ (I6), on ne l'invente pas. */
function boutonRecoFiche(type, id){
  if(typeof cercle !== 'function' || !cercle().length) return '';
  return '<button class="btn ghost carre reco" aria-label="Recommander à un ami" '+
    'title="Recommander à un ami" onclick="menuRecommander(\''+escJs(type)+'\','+Number(id)+')">💌</button>';
}
/* Le bandeau d'état, sous la rangée d'actions : « à qui », et « où ça en est ».
   Il ne se lit que sur ce que la base dit — pas sur un drapeau local qui
   survivrait à un envoi raté. */
function bandeauRecoFiche(type, id){
  const l = ((conseils && conseils.envoyees) || [])
    .filter(r => r.type === type && String(r.tmdb_id) === String(id));
  if(!l.length) return '';
  const noms = l.map(r => nomDuCercle(r.vers));
  const ajoutee = l.filter(r => r.ajoute);
  const etat = ajoutee.length === l.length
    ? (l.length > 1 ? ' · ils l\'ont ajoutée ✓' : ' · il l\'a ajoutée ✓')
    : ajoutee.length
      ? ' · '+ajoutee.length+' sur '+l.length+' l\'ont ajoutée ✓'
      : ' · pas encore vue';
  return '<div class="wrap" style="padding:10px 16px 0"><div class="recoband">'+
    '💌 Recommandée à '+esc(listeEtNoms(noms))+esc(etat)+'</div></div>';
}
/* « à Marie », « à Marie et Théo », « à Marie, Théo et Léa ». */
function listeEtNoms(l){
  if(!l.length) return '';
  if(l.length === 1) return l[0];
  return l.slice(0,-1).join(', ') + ' et ' + l[l.length-1];
}

/* LA FEUILLE D'ENVOI — UN SEUL CODE D'ENVOI (§3). Le bouton 💌 de la fiche et
   l'entrée « Recommander à… » du menu ⋯ ouvrent exactement celle-ci ; c'est
   pour ça qu'elle garde le nom `menuRecommander`, que le menu appelle déjà. */
/* CORRECTION DE RELECTURE C-2 (28/08/2026) — DEPUIS UN APERÇU, LA RECO PARTAIT
   SANS TITRE.

   `menuRecommander` ne lisait le titre que dans la BIBLIOTHÈQUE (`db.shows` /
   `db.movies`). Or le §3 met le 💌 sur la fiche d'un titre « suivi OU NON », et
   `boutonRecoFiche` est bien posé sur l'aperçu — l'écran d'un titre qu'on n'a
   pas encore ajouté. Sur ce chemin la bibliothèque est vide : la feuille
   s'ouvrait sur « Recommander ce titre » et la ligne partait avec `titre: ''`.

   Ce n'était pas rattrapable en aval : la carte du destinataire lit `r.titre`
   (« Un titre »), le push aussi (« X te recommande un titre »), et le bandeau de
   l'expéditeur, lui, était juste — le défaut ne se voyait donc pas du côté de
   celui qui l'avait causé. C'est exactement ce que la recopie du titre à l'envoi
   (§1) existe pour éviter.

   Trois sources, dans l'ordre du plus sûr au plus tardif — la bibliothèque, la
   fiche que l'aperçu a DÉJÀ en main, puis le cache des fiches de recos. On ne va
   pas au réseau : si le 💌 est à l'écran, c'est qu'une de ces trois sait déjà
   comment le titre s'appelle. */
function titrePourReco(type, id){
  const chezMoi = type === 'tv' ? db.shows[id] : db.movies[id];
  if(chezMoi) return chezMoi.name || chezMoi.title || '';
  /* L'aperçu : tout son rendu est bâti sur `ui.preview.data`, elle est là. */
  const p = (typeof ui === 'object' && ui.preview) ? ui.preview : null;
  if(p && p.data && String(p.id) === String(id) && p.type === type)
    return p.data.name || p.data.title || '';
  const f = fichesReco[type+':'+id];
  return (f && f.d && f.d.nom) ? f.d.nom : '';
}
function menuRecommander(type, id){
  const duCercle = cercle();
  if(!duCercle.length) return toast('Personne dans ton cercle pour l\'instant');
  ui.reco = { type:type, id:Number(id), titre: titrePourReco(type, id), sel:{}, mot:'' };
  peindreFeuilleReco();
}
/* Déjà conseillé à cette personne : on le dit AVANT, au lieu de laisser
   renvoyer dans le vide — la contrainte d'unicité de 009 ignore le doublon,
   donc sans cette mention le second envoi n'aurait aucun effet visible. */
function dejaConseilleA(type, id, pid){
  return ((conseils && conseils.envoyees) || []).some(r =>
    String(r.vers) === String(pid) && r.type === type && String(r.tmdb_id) === String(id));
}
function peindreFeuilleReco(){
  const e = ui.reco;
  if(!e) return;
  const duCercle = cercle();
  const choisis = duCercle.filter(p => e.sel[p.id]);
  const reste = 280 - String(e.mot || '').length;
  const h = '<h3>💌 Recommander '+esc(e.titre || 'ce titre')+'</h3>'+
    '<p class="small muted" style="margin:0 0 10px">À qui, dans ton cercle ? '+
      'La reco arrivera dans ses notifications.</p>'+
    '<div class="amis">'+ duCercle.map(p=>{
      const deja = dejaConseilleA(e.type, e.id, p.id);
      const on = !!e.sel[p.id];
      return '<button class="ami'+(on ? ' on' : '')+(deja ? ' deja' : '')+'"'+
        (deja ? ' disabled' : '')+
        ' onclick="basculerAmiReco(\''+escJs(String(p.id))+'\')">'+
        (on ? '<span class="amicoche">✓</span>' : '')+
        avatarDe(p, 'moyen')+
        '<b>'+esc(p.pseudo)+'</b>'+
        (deja ? '<em>Déjà conseillé</em>' : '')+
      '</button>';
    }).join('') + '</div>'+
    '<textarea id="recomot" class="recomot" maxlength="280" rows="2" '+
      'placeholder="Un mot pour aller avec (facultatif)" '+
      'oninput="motRecoSaisi(this.value)">'+esc(e.mot || '')+'</textarea>'+
    /* Le compteur n'apparaît qu'au-delà de 200 : avant, il ne dit rien
       d'utile et donne l'impression d'un formulaire. */
    (String(e.mot||'').length > 200
      ? '<div class="tiny muted" style="text-align:right">'+reste+' caractère'+
          (reste > 1 ? 's' : '')+' restant'+(reste > 1 ? 's' : '')+'</div>'
      : '')+
    '<button class="btn block" style="margin-top:12px"'+(choisis.length ? '' : ' disabled')+
      ' onclick="envoyerFeuilleReco()">'+
      (choisis.length ? 'Envoyer à '+esc(listeEtNoms(choisis.map(p=>p.pseudo)))
                      : 'Choisis au moins un ami')+'</button>'+
    '<button class="opt annuler" onclick="closeSheet()">Annuler</button>';
  openSheet(h, 'reco');
}
function basculerAmiReco(pid){
  if(!ui.reco) return;
  const s = ui.reco.sel;
  if(s[pid]) delete s[pid]; else s[pid] = true;
  peindreFeuilleReco();
}
/* La saisie ne redessine PAS la feuille — le champ perdrait le curseur à
   chaque lettre. On garde la valeur, et on ne repeint que le compteur quand il
   change d'état (au passage de 200). */
function motRecoSaisi(v){
  if(!ui.reco) return;
  const avant = String(ui.reco.mot || '').length > 200;
  ui.reco.mot = String(v || '').slice(0, 280);
  if((String(ui.reco.mot).length > 200) !== avant) peindreFeuilleReco();
}
async function envoyerFeuilleReco(){
  const e = ui.reco;
  if(!e) return;
  const dest = cercle().filter(p => e.sel[p.id]).map(p => p.id);
  if(!dest.length) return;
  const noms = cercle().filter(p => e.sel[p.id]).map(p => p.pseudo);
  closeSheet();
  const ok = await envoyerRecos(e.type, e.id, e.titre, dest, e.mot);
  ui.reco = null;
  if(ok) toast('💌 Envoyée à '+listeEtNoms(noms));
  render();
}
