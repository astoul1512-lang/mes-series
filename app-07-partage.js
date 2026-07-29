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
    ligneAction('code', 'Me faire suivre', 'Générer un code à donner', I.user,
      (partage.code
        ? '<div class="codebox">'+esc(partage.code)+'</div>'+
          '<div class="small muted" style="text-align:center">Valable 24 h, une seule utilisation. '+
          'Transmets-le à la personne de ton choix.</div>'+
          '<button class="btn ghost block" style="margin-top:12px" onclick="genererCode()">Générer un autre code</button>'
        : '<div class="small muted" style="margin-bottom:10px">Génère un code et donne-le à qui tu veux. '+
          'Tant que tu n\'en donnes pas, personne ne voit ta bibliothèque.</div>'+
          '<button class="btn block" onclick="genererCode()">Générer mon code</button>'))+
  '</div>';

  /* --- le serveur n'est pas encore préparé --- */
  if(partage.erreur && !partage.charge){
    html += '<div class="wrap" style="padding-top:0"><div class="banner" style="margin:0">'+
      '<b>Le partage n\'est pas encore activé sur ton serveur.</b><br>'+
      'Il reste à exécuter le fichier <code>supabase-partage.sql</code> dans Supabase '+
      '(SQL Editor → New query → Run). Le reste de l\'app fonctionne normalement.</div></div>';
    return html + '<div style="height:26px"></div>';
  }

  /* --- listes --- */
  if(partage.occupe && !partage.charge){
    html += '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Chargement…</p></div>';
    return html + '<div style="height:26px"></div>';
  }

  const vide = t => '<div class="wrap" style="padding-top:0"><div class="card" style="padding:15px;text-align:center">'+
    '<span class="small muted">'+t+'</span></div></div>';

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

function ligneAbo(p, role){
  const cle = role+':'+p.id;
  const suit = role === 'suiveur';
  const mot  = suit ? 'Ne plus<br>suivre' : 'Retirer<br>l\'accès';
  /* Le pictogramme seul serait ambigu — les deux actions se ressemblent trop.
     Le mot reste donc, en petit, sous l'icône. */
  const act = (suit ? I.usermoins : I.oeilbarre) + '<span>'+mot+'</span>';
  return '<div class="glis" data-cle="'+esc(cle)+'">'+
    '<div class="glisfond">'+
      '<button class="glisact" aria-label="'+(suit?'Ne plus suivre':'Retirer l\'accès')+'" '+
        'onclick="confirmerRupture(\''+p.id+'\',\''+role+'\')">'+act+'</button>'+
    '</div>'+
    '<div class="srow glisrow" style="align-items:center"'+
      ' ontouchstart="glisAboStart(event,\''+esc(cle)+'\')"'+
      ' ontouchmove="glisAboMove(event)" ontouchend="glisAboEnd(event)"'+
      ' ontouchcancel="glisAboEnd(event)"'+
      ' onclick="glisAboClic(event,\''+p.id+'\',\''+role+'\')">'+
      avatarDe(p, 'moyen')+
      '<div class="sinfo" style="justify-content:center">'+
        '<div class="sname">'+esc(p.pseudo)+'</div>'+
        '<div class="tiny muted">'+(role==='suiveur' ? 'Tu vois sa bibliothèque' : 'Voit ta bibliothèque')+'</div>'+
      '</div>'+
      (role==='suiveur' ? '<span class="ecaret">'+I.caret+'</span>' : '')+
    '</div>'+
  '</div>';
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
  openSheet('<h3>'+esc(nom)+'</h3>'+
    '<p class="small muted" style="margin:0 0 8px">'+
      (role==='suiveur' ? 'Tu ne verras plus sa bibliothèque.' : 'Cette personne ne verra plus la tienne.')+'</p>'+
    '<button class="opt danger" onclick="closeSheet();rompre(\''+id+'\',\''+role+'\')">'+
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
    '<button class="btn ghost" onclick="chargerBiblio(\''+id+'\')">Réessayer</button></div>';

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

  html += bloc('En cours', enCours, carteLecture);
  html += bloc('Séries vues', vues, carteLecture);
  html += bloc('Films vus', filmsVus, carteFilmLecture);
  html += bloc('Sa liste à voir', aVoir, carteLecture);
  return html + '<div style="height:26px"></div>';
}

function carteLecture(sh){
  const p = progress(sh);
  const full = p.total>0 && p.watched===p.total;
  const st = statutSerie(sh);
  return '<div class="pcard">'+
    '<div class="wrapimg">'+posterEl(sh.poster,'w342','',sh.name)+
      (st!=='avoir' && p.total ? '<div class="pbadge '+(full?'done':'')+'">'+p.watched+'/'+p.total+'</div>' : '')+
      (st!=='avoir' ? '<div class="pbar"><i class="'+(full?'full':'')+'" style="width:'+p.pct+'%"></i></div>' : '')+
    '</div>'+
    '<div class="pname">'+esc(sh.name)+'</div>'+
    '<div class="psub">'+(st==='avoir' ? 'Pas commencée' : full ? (isFinished(sh)?'Terminée':'À jour') : p.pct+'%')+'</div>'+
  '</div>';
}
function carteFilmLecture(m){
  return '<div class="pcard">'+
    '<div class="wrapimg">'+posterEl(m.poster,'w342','',m.title)+'<div class="pbadge done">vu</div></div>'+
    '<div class="pname">'+esc(m.title)+'</div>'+
    '<div class="psub">'+esc(year(m.date))+'</div>'+
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
      '<div class="card" style="padding:16px">'+
        '<div style="font-weight:680;margin-bottom:6px">Connecter une sauvegarde en ligne</div>'+
        '<div class="small muted">Tes séries sont stockées sur ton propre espace Supabase (gratuit). '+
        'Elles deviennent impossibles à perdre et identiques sur tous tes appareils.</div>'+
      '</div>'+
      '<div style="height:16px"></div>'+
      '<label class="fld"><span>URL du projet Supabase</span>'+
        '<input type="text" id="sburl" placeholder="https://xxxx.supabase.co" autocapitalize="off" autocorrect="off" spellcheck="false" value="'+esc(db.sync.url)+'"></label>'+
      '<label class="fld"><span>Clé publique (anon)</span>'+
        '<input type="text" id="sbkey" placeholder="eyJhbGciOi..." autocapitalize="off" autocorrect="off" spellcheck="false" value="'+esc(db.sync.key)+'">'+
        '<em>Dans Supabase : Project Settings → API. Cette clé est prévue pour être publique.</em></label>'+
      '<button class="btn block" onclick="saveSync()">Enregistrer</button>'+
      (syncReady() ? '<button class="btn ghost block" style="margin-top:10px" onclick="ui.editServer=false;render()">Annuler</button>' : '')+
    '</div>';
    return html + '<div style="height:30px"></div>';
  }

  /* --- Pas encore de compte : la porte d'entrée --- */
  if(!signedIn()){
    /* Les trois arguments de vente et les deux écrans de mise en route ont
       disparu : soit on a un compte, soit on n'en a pas. Il n'y a rien à
       expliquer avant, et le prénom est déjà demandé juste en dessous. */
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
      '<button class="btn block" style="margin-bottom:'+(creer?'14px':'4px')+'" onclick="'+(creer?'doSignUp()':'doSignIn()')+'">'+
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
  const etat = syncState==='busy' ? 'Synchronisation en cours…'
             : syncState==='err'  ? 'Dernière tentative en échec : '+esc(syncError)
             : db.syncedAt ? 'À jour · '+fmtQuand(db.syncedAt)
             : 'Jamais synchronisé';
  const col = syncState==='err' ? 'var(--warn)' : syncState==='ok' ? 'var(--ok)' : 'var(--muted)';
  const mail = (db.auth.email||'—');
  const nb = Object.keys(db.shows).length, nf = Object.keys(db.movies).length;

  html += '<div class="wrap">'+
    '<div class="carte-compte">'+
      avatarMoi('gros')+
      '<div class="cmail">'+esc(mail)+'</div>'+
      '<div class="cetat" style="color:'+col+'">'+
        (syncState==='busy' ? '<span class="spin"></span> ' : '<i class="pastille" style="background:'+col+'"></i>')+
        etat+'</div>'+
      '<div class="cchiffres">'+
        '<div><b>'+nb+'</b><span>série'+(nb>1?'s':'')+'</span></div>'+
        '<div><b>'+nf+'</b><span>film'+(nf>1?'s':'')+'</span></div>'+
        '<div><b>'+((partage.suivis||[]).length + (partage.abonnes||[]).length)+'</b><span>partage'+
          (((partage.suivis||[]).length + (partage.abonnes||[]).length)>1?'s':'')+'</span></div>'+
      '</div>'+
    '</div>'+
    '<button class="btn block" style="margin-bottom:10px" onclick="syncNow()">Synchroniser maintenant</button>'+
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
  if(lireLienReinit()) go('motdepasse');
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
    db.auth = null; db.syncedAt = null; syncState = 'off';
    partage.suivis = []; partage.abonnes = []; partage.code = null;
    saveDB(); closeSheet(); go('profile');
    toast('Compte supprimé.');
  }catch(e){
    if(b){ b.disabled = false; b.textContent = 'Supprimer définitivement'; }
    toast('Échec : '+e.message);
  }
}

function saveSync(){
  const url = document.getElementById('sburl').value.trim();
  const k   = document.getElementById('sbkey').value.trim();
  if(!/^https?:\/\/.+/.test(url)) return toast('URL invalide');
  if(k.length < 20) return toast('Clé invalide');
  db.sync = {url:url.replace(/\/+$/,''), key:k}; ui.editServer=false; saveDB(); render();
  toast('Serveur enregistré');
}
function resetSync(){ db.sync=Object.assign({},DEFAULT_SYNC); db.auth=null; saveDB(); render(); }

async function doSignIn(){
  const email = document.getElementById('acmail').value.trim();
  const pass  = document.getElementById('acpass').value;
  if(!email || !pass) return toast('Renseigne e-mail et mot de passe');
  if(!FORME_MAIL.test(email)) return toast('Cette adresse e-mail n\'a pas l\'air valide');
  toast('Connexion…');
  try{
    await sbSignIn(email, pass);
    /* Venu de la porte d'entrée : on ouvre l'app plutôt que de laisser la
       personne sur l'écran de compte qu'elle vient de remplir. */
    if(!params.from) go('follow'); else render();
    toast('Connecté');
    await syncNow();
    await majProfil(); await chargerPartage();
    /* Nouveau téléphone, ou retour après une déconnexion : si iOS a déjà donné
       son accord, l'appareil se réinscrit sans qu'on ait à le demander. */
    inscrireSiBesoin();
  }catch(e){ toast(/Invalid/i.test(e.message) ? 'E-mail ou mot de passe incorrect' : 'Échec : '+e.message); }
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
    if(e.message === 'CONFIRM') toast('Compte créé : confirme l\'e-mail reçu, puis connecte-toi');
    else toast('Échec : '+(/already regist|User already/i.test(e.message)
      ? 'un compte existe déjà avec cette adresse' : e.message));
  }
}
