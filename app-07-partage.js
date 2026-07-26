"use strict";
/* ---------- Vue : Mes abonnements ---------- */
function viewAbos(){
  let html = header('Mes abonnements', {back:"goBack()"});

  if(!signedIn()){
    return html + '<div class="empty">'+I.user+'<h3>Compte requis</h3>'+
      '<p>Le partage passe par ton compte : il faut être connecté pour suivre quelqu\'un.</p>'+
      '<button class="btn" onclick="go(\'account\',{from:\'profile\'})">Ouvrir Compte & synchro</button></div>';
  }

  /* --- rejoindre quelqu'un --- */
  html += '<div class="wrap">'+
    '<div class="card" style="padding:16px">'+
      '<div style="font-weight:680;margin-bottom:6px">Suivre quelqu\'un</div>'+
      '<div class="small muted" style="margin-bottom:12px">Demande-lui son code, puis saisis-le ici. '+
      'Tu verras alors sa bibliothèque, en lecture seule.</div>'+
      '<input type="text" id="codein" placeholder="ABC123" autocapitalize="characters" '+
      'autocorrect="off" spellcheck="false" maxlength="8" style="text-transform:uppercase;letter-spacing:.12em;text-align:center;font-weight:700">'+
      '<button class="btn block" style="margin-top:10px" onclick="utiliserCode(document.getElementById(\'codein\').value)">Valider le code</button>'+
    '</div>'+
  '</div>';

  /* --- partager sa propre bibliothèque --- */
  html += '<div class="wrap" style="padding-top:0">'+
    '<div class="card" style="padding:16px">'+
      '<div style="font-weight:680;margin-bottom:6px">Me faire suivre</div>'+
      (partage.code
        ? '<div class="codebox">'+esc(partage.code)+'</div>'+
          '<div class="small muted" style="text-align:center">Valable 24 h, une seule utilisation. '+
          'Transmets-le à la personne de ton choix.</div>'+
          '<button class="btn ghost block" style="margin-top:12px" onclick="genererCode()">Générer un autre code</button>'
        : '<div class="small muted" style="margin-bottom:12px">Génère un code et donne-le à qui tu veux. '+
          'Tant que tu n\'en donnes pas, personne ne voit ta bibliothèque.</div>'+
          '<button class="btn block" onclick="genererCode()">Générer mon code</button>')+
    '</div>'+
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

  html += '<div class="sectitle">Je suis'+(partage.suivis.length?'<span class="cnt">'+partage.suivis.length+'</span>':'')+'</div>';
  html += partage.suivis.length
    ? '<div class="list">'+partage.suivis.map(p=>ligneAbo(p,'suiveur')).join('')+'</div>'
    : '<div class="wrap" style="padding-top:0"><div class="card" style="padding:15px;text-align:center">'+
      '<span class="small muted">Tu ne suis personne pour l\'instant.</span></div></div>';

  html += '<div class="sectitle">Me suivent'+(partage.abonnes.length?'<span class="cnt">'+partage.abonnes.length+'</span>':'')+'</div>';
  html += partage.abonnes.length
    ? '<div class="list">'+partage.abonnes.map(p=>ligneAbo(p,'suivi')).join('')+'</div>'
    : '<div class="wrap" style="padding-top:0"><div class="card" style="padding:15px;text-align:center">'+
      '<span class="small muted">Personne ne te suit.</span></div></div>';

  return html + '<div style="height:26px"></div>';
}

function ligneAbo(p, role){
  const ini = (p.pseudo||'?').trim().charAt(0).toUpperCase();
  return '<div class="srow" style="align-items:center">'+
    (role==='suiveur'
      ? '<div style="display:flex;gap:12px;align-items:center;flex:1;min-width:0" onclick="ouvrirBiblio(\''+p.id+'\')">'
      : '<div style="display:flex;gap:12px;align-items:center;flex:1;min-width:0">')+
      '<div class="avatar" style="width:44px;height:44px;font-size:17px">'+esc(ini)+'</div>'+
      '<div class="sinfo" style="justify-content:center">'+
        '<div class="sname">'+esc(p.pseudo)+'</div>'+
        '<div class="tiny muted">'+(role==='suiveur' ? 'Voir sa bibliothèque' : 'Voit ta bibliothèque')+'</div>'+
      '</div>'+
    '</div>'+
    '<button class="iconbtn" title="'+(role==='suiveur'?'Se désabonner':'Retirer')+'" '+
      'onclick="confirmerRupture(\''+p.id+'\',\''+role+'\',\''+esc(p.pseudo).replace(/'/g,"")+'\')">'+I.close+'</button>'+
  '</div>';
}

function confirmerRupture(id, role, nom){
  openSheet('<h3>'+esc(nom)+'</h3>'+
    '<p class="small muted" style="margin:0 0 8px">'+
      (role==='suiveur' ? 'Tu ne verras plus sa bibliothèque.' : 'Cette personne ne verra plus la tienne.')+'</p>'+
    '<button class="opt danger" onclick="closeSheet();rompre(\''+id+'\',\''+role+'\')">'+
      (role==='suiveur' ? 'Me désabonner' : 'Retirer cet abonné')+'</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

function ouvrirBiblio(id){
  go('biblio', {id:id});
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
  let html = header('Compte & synchro', {back:"goBack()"});

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

  if(!signedIn()){
    html += '<div class="wrap">'+
      '<div class="card" style="padding:14px;margin-bottom:16px">'+
        '<div style="font-weight:660;margin-bottom:4px">Sauvegarde en ligne prête</div>'+
        '<div class="small muted">Crée ton compte la première fois. Sur tes autres appareils, connecte-toi avec les mêmes identifiants : tout se retrouve automatiquement.</div>'+
      '</div>'+
      '<label class="fld"><span>Adresse e-mail</span>'+
        '<input type="text" id="acmail" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="toi@exemple.fr" value="'+esc((db.auth&&db.auth.email)||'')+'"></label>'+
      '<label class="fld"><span>Mot de passe</span>'+
        '<input type="password" id="acpass" placeholder="au moins 6 caractères">'+
        '<em>Choisis un mot de passe dédié à cette app. Il n\'est jamais stocké sur l\'appareil.</em></label>'+
      '<button class="btn block" style="margin-bottom:10px" onclick="doSignIn()">Se connecter</button>'+
      '<button class="btn ghost block" style="margin-bottom:14px" onclick="doSignUp()">Créer un compte</button>'+
      '<button class="tiny muted" style="display:block;width:100%;text-align:center;padding:8px" onclick="ui.editServer=true;render()">Modifier le serveur</button>'+
    '</div>';
    return html + '<div style="height:30px"></div>';
  }

  const etat = syncState==='busy' ? 'Synchronisation en cours…'
             : syncState==='err'  ? 'Dernière tentative en échec : '+esc(syncError)
             : db.syncedAt ? 'Dernière synchro : '+fmtDate(new Date(db.syncedAt).toISOString().slice(0,10))
             : 'Jamais synchronisé';
  const col = syncState==='err' ? 'var(--warn)' : syncState==='ok' ? 'var(--ok)' : 'var(--muted)';

  html += '<div class="wrap">'+
    '<div class="card" style="padding:16px;margin-bottom:16px">'+
      '<div class="small muted">Connecté en tant que</div>'+
      '<div style="font-weight:680;margin-top:2px">'+esc(db.auth.email||'—')+'</div>'+
      '<div class="small" style="color:'+col+';margin-top:8px">'+
        (syncState==='busy'?'<span class="spin"></span> ':'')+etat+'</div>'+
    '</div>'+
    '<button class="btn block" style="margin-bottom:10px" onclick="syncNow()">Synchroniser maintenant</button>'+
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="ui.editServer=true;render()">Modifier le serveur</button>'+
    '<button class="btn ghost block" style="color:#ff5a5a" onclick="sbSignOut()">Se déconnecter</button>'+
    '<div class="tiny muted" style="margin-top:14px">La synchro part automatiquement quelques secondes après chaque changement, et à chaque ouverture de l\'app.</div>'+
  '</div>';
  return html + '<div style="height:30px"></div>';
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
  toast('Connexion…');
  try{
    await sbSignIn(email, pass);
    render(); toast('Connecté');
    await syncNow();
    await majProfil(); await chargerPartage();
  }catch(e){ toast(/Invalid/i.test(e.message) ? 'E-mail ou mot de passe incorrect' : 'Échec : '+e.message); }
}
async function doSignUp(){
  const email = document.getElementById('acmail').value.trim();
  const pass  = document.getElementById('acpass').value;
  if(!email || pass.length < 6) return toast('E-mail requis, mot de passe de 6 caractères minimum');
  toast('Création du compte…');
  try{
    await sbSignUp(email, pass);
    render(); toast('Compte créé');
    await syncNow();
  }catch(e){
    if(e.message === 'CONFIRM') toast('Compte créé : confirme l\'e-mail reçu, puis connecte-toi');
    else toast('Échec : '+e.message);
  }
}
