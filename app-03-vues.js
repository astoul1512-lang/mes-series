"use strict";
/* ============================ Rendu ============================ */
/* ---------- Plus de mise en route ----------
   Les deux écrans d'accueil demandaient un prénom déjà redemandé au compte,
   puis vendaient des arguments répétés sur l'écran suivant. Soit on a un
   compte, soit on n'en a pas : l'app ouvre directement sur la porte d'entrée.
   `demarrerAccueil` reste, appelée par le démarrage, et se contente d'y aller
   en choisissant l'onglet le plus probable. */
function demarrerAccueil(){
  ui.acMode = premiereFois() ? 'creer' : 'connexion';
  /* D1 — avant le formulaire, un écran qui dit ce que fait l'app et pourquoi
     elle demande un compte. Le premier écran était quatre champs et une phrase :
     neuf gestes et trois écrans séparaient l'ouverture du premier contenu, sans
     qu'une seule affiche soit montrée. Une fois par appareil, pas plus. */
  if(!db.vuPresentation) return go('bienvenue');
  go('account');
}
/* Cet appareil n'a jamais vu de session : on propose la création plutôt que
   la connexion. Ailleurs, c'est l'inverse — on se connecte bien plus souvent
   qu'on ne crée un compte. */
function premiereFois(){
  return !db.proprio && !(db.auth && db.auth.email);
}

/* Le HTML de l'écran courant. Isolé du reste pour pouvoir aussi fabriquer
   l'écran d'arrivée pendant le geste de retour, sans toucher à l'état. */
/* Les bornes du mémo de rendu (F3). `corpsDeVue` est le passage obligé des
   deux chemins — le rendu réel et `htmlDeLaVue` — donc le seul endroit où les
   poser. Le `finally` n'est pas décoratif : une vue qui lèverait laisserait
   sinon le mémo ouvert pour toujours, et l'app servirait des compteurs figés
   sans que rien ne le signale. */
function corpsDeVue(){
  entrerRendu();
  try{ return corpsDeVueBrut(); } finally { sortirRendu(); }
}
function corpsDeVueBrut(){
  if(view==='follow')   return viewFollow();
  if(view==='discover') return viewDiscover();
  if(view==='search')   return viewRecherche();
  if(view==='profile')  return viewProfile();
  if(view==='settings') return viewSettings();
  if(view==='show')     return viewShow();
  if(view==='preview')  return viewPreview();
  if(view==='movie')    return viewMovie();
  if(view==='account')  return viewAccount();
  if(view==='abos')     return viewAbos();
  if(view==='biblio')   return viewBiblio();
  if(view==='moi')      return viewMoi();
  if(view==='acteur')   return viewActeur();
  if(view==='rangee')   return viewRangee();
  if(view==='motdepasse') return viewMotDePasse();
  if(view==='notifs')   return viewNotifications();
  if(view==='clochettes') return viewClochettes();
  if(view==='avatar')   return viewAvatar();
  if(view==='bienvenue') return viewBienvenue();
  if(view==='gouts')    return viewGouts();
  if(view==='plates')   return viewPlates();
  /* Lot C — les quatre écrans du parcours d'inscription. Ils vivent dans
     app-13 et ne s'atteignent que par `finirAvatar`, ou par la reprise d'une
     inscription abandonnée (`reprendreInscription`, appelée par `boot`). */
  if(view==='inscTitres') return viewInscTitres();
  if(view==='inscStyle')  return viewInscStyle();
  if(view==='inscPlates') return viewInscPlates();
  if(view==='inscFin')    return viewInscFin();
  return '';
}
/* Fabrique le HTML d'un autre écran que celui affiché, puis remet tout en place. */
function htmlDeLaVue(v, p){
  const vSauve = view, pSauve = params;
  view = v; params = p || {};
  let h = '';
  try{ h = corpsDeVue(); } finally { view = vSauve; params = pSauve; }
  return h;
}

/* Le compte est obligatoire. Sans session, l'app ne montre que l'écran de
   connexion et la réinitialisation de mot de passe — rien d'autre.
   Le contrôle est posé ici, dans le seul passage obligé du rendu : un `go()`
   oublié quelque part ne peut pas ouvrir une porte dérobée. */
const VUES_SANS_COMPTE = { bienvenue:1, account:1, motdepasse:1, avatar:1 };
/* `db.onboarde` ne veut plus rien dire depuis que la mise en route a disparu :
   la seule question est d'avoir une session ou non. Le champ reste dans la base
   pour ne pas casser la lecture d'une vieille sauvegarde, mais plus personne
   ne le lit. */
function porteFermee(){
  return !signedIn() && !VUES_SANS_COMPTE[view];
}

/* C5 (09/08) — l'écran affiché quand une vue lève.
   Deux sorties, et pas une de plus : revenir à un écran qui, lui, marche
   sûrement, ou recharger. Volontairement bâti sans rien lire de `db` — c'est
   probablement `db` qui vient de faire tomber la vue, et un écran de secours
   qui plante à son tour ne secourt personne. */
function ecranPanne(){
  return '<div class="wrap" style="padding-top:64px;text-align:center">'+
    '<h2 style="margin:0 0 10px">Cet écran n\'a pas pu s\'afficher</h2>'+
    '<p class="small muted" style="margin:0 0 20px">Rien n\'est perdu : tes séries et tes films '+
      'sont toujours là. C\'est l\'affichage de cet écran-ci qui a échoué.</p>'+
    '<button class="btn block" style="margin-bottom:10px" onclick="go(\'discover\')">Revenir à l\'accueil</button>'+
    '<button class="btn ghost block" onclick="location.reload()">Recharger l\'application</button>'+
  '</div>';
}

function render(){
  const app = document.getElementById('app');
  if(porteFermee()){ view = 'account'; params = {}; navDir = 'none'; }
  /* F1 — le classement de « À rattraper » ne vaut que pour le temps où l'on
     reste sur l'écran. Dès qu'on en dessine un autre, il est oublié et sera
     recalculé au retour. C'est ici et pas dans `go()` : la plupart des
     redessins ne changent pas d'écran, et ce sont eux qu'il faut ignorer. */
  if(view !== 'follow') oublierOrdreRattrapage();
  /* POINT 12 — la recherche plein écran appartient à « Mon profil » et à lui
     seul. Sans cette ligne, quitter l'écran pendant qu'elle est ouverte (geste
     de retour, onglet du bas, notification) la laissait armée : on revenait
     plus tard sur son profil et c'est le champ de recherche qui s'affichait,
     sans qu'on ait rien demandé. Elle est ici plutôt que dans `go()` parce que
     `render()` est le seul passage obligé — un `go()` oublié quelque part ne
     peut pas contourner ce rangement. */
  /* RETOUR-02 point 8 — même garde anti-fuite pour la recherche d'acteurs :
     elle appartient à Mes goûts, et à lui seul. Sans cette ligne, quitter
     l'écran pendant qu'elle est ouverte la laisserait armée, et y revenir
     tomberait sur un champ de recherche au lieu de la page.

     CORRECTION DE RELECTURE (11/08/2026) — ON REMET L'ÉTAT À PLAT ICI, ON
     N'APPELLE PAS `fermerRechActeur`. Elle appelle `retirerGarde('acteurs')`,
     donc `history.back()` — EN PLEIN `render()`. C'est structurellement le même
     mécanisme que celui qui détruisait la session de duel (point 6), et le
     relecteur a eu raison de le signaler même sans avoir réussi à le faire
     mordre. La branche `pf12` juste en dessous, qui est le modèle, remet les
     champs à plat sans toucher à l'historique : on fait pareil. La garde
     d'historique, elle, sera consommée par le `popstate` du geste qui nous a
     fait changer d'écran. */
  if(view !== 'gouts' && typeof rechActeur !== 'undefined' && rechActeur.ouvert
     && typeof oublierRechActeur === 'function') oublierRechActeur();
  if(view !== 'profile' && typeof pf12 !== 'undefined' && pf12.ouvert){
    rangerRecentPf12(); avorterPf12(); pf12.ouvert = false; pf12.q = '';
    pf12.pers = null; pf12.persEtat = ''; pf12.persErr = '';
  }
  /* C4.3 — la position horizontale des rails est relevée avant d'écraser le
     DOM, et remise juste après. Ici plutôt que dans `go()` seul : la plupart
     des redessins ne changent pas d'écran (cocher un épisode, ajouter un film)
     et ce sont eux qui remettaient les rangées à zéro. */
  if(typeof memoriserRails === 'function') memoriserRails();
  /* C5 (09/08) — UNE VUE QUI LÈVE NE FIGE PLUS L'ÉCRAN.
     `app.innerHTML = corpsDeVue()` n'avait aucune garde. Une exception dans la
     construction d'un écran — une donnée abîmée, un champ absent, une date
     invalide — laissait le DOM tel quel : l'écran PRÉCÉDENT restait affiché,
     figé, et chaque `go()` suivant relevait la même exception au même endroit.
     Aucune issue que le rechargement, et rien à l'écran pour le dire.
     Désormais l'écran de panne prend la place, il dit quoi faire, et
     `renderNav()` plus bas continue de tourner : la barre du bas reste
     utilisable, ce qui suffit le plus souvent à s'en sortir seul. */
  let html;
  try{ html = corpsDeVue(); }
  catch(e){ console.error('[render]', view, e); html = ecranPanne(); }
  app.innerHTML = html;
  /* Même raison : ce qui suit le dessin ne doit pas pouvoir l'annuler.
     `restaurerRails` remet des positions mémorisées qui ne correspondent à
     rien sur l'écran de panne. */
  try{ if(typeof restaurerRails === 'function') restaurerRails(); }
  catch(e){ console.error('[render/rails]', e); }
  /* Porte d'entrée, mot de passe et choix de l'avatar occupent tout l'écran :
     la barre du bas n'a rien à y faire, il n'y a qu'une chose à faire. */
  document.body.classList.toggle('accueil',
    view === 'bienvenue' || view === 'motdepasse' || view === 'avatar' || (view === 'account' && !signedIn())
    /* D3 — `from === 'compte'` n'existe plus : ces deux écrans ne font plus
       partie de l'inscription. La condition est retirée plutôt que laissée à
       tourner à vide. */
    /* Lot C — les quatre étapes de l'inscription sont dans le même cas que
       l'avatar : il n'y a qu'une chose à faire, et une barre du bas y
       proposerait de quitter le parcours au milieu d'une question. */
    || (typeof INSC_VUES === 'object' && !!INSC_VUES[view])
    /* POINT 12 — la recherche de « Mon profil » s'ouvre en PLEIN écran, et
       plein écran veut dire sans la barre du bas : mesuré clavier levé (300 px),
       elle laisse voir 1 résultat sur 7 en place contre 4 sur 7 ici. Les 64 px
       de la barre sont la dernière chose à rendre aux résultats. */
    || (view === 'profile' && typeof pf12 !== 'undefined' && pf12.ouvert)
    /* RETOUR-02 POINT 8 (11/08/2026) — la recherche d'acteurs de Mes goûts
       suit le même chemin, et pour la même mesure : clavier levé, les résultats
       passaient sous « Terminé » et sous la barre du bas. Une ligne ici, la
       même qu'au point 12 — c'est le motif qui est réutilisé, pas une seconde
       version de la règle. */
    || (view === 'gouts' && typeof rechActeur !== 'undefined' && rechActeur.ouvert));
  app.classList.remove('enter','back');
  /* Le retour à deux couches gère lui-même son mouvement : pas d'animation par-dessus. */
  if(sansAnim){ sansAnim = false; navDir = 'none'; }
  if(navDir==='enter' || navDir==='back'){
    void app.offsetWidth;
    const sens = navDir;
    app.classList.add(sens);
    /* On retire la classe dès la fin de l'animation : la laisser en place
       maintenait une couche graphique qui déréglait les barres fixes.

       B10 — avec « Réduire les animations » (réglage iOS courant), la règle
       CSS met `animation:none` et `animationend` NE SE DÉCLENCHE JAMAIS :
       l'écouteur restait posé à chaque navigation, sur un `#app` qui, lui, ne
       disparaît pas. Cent navigations, cent closures retenues. La minuterie de
       secours est le même garde-fou que dans le geste de retour. */
    const fini = ()=>{
      app.classList.remove(sens);
      app.removeEventListener('animationend', fini);
    };
    app.addEventListener('animationend', fini);
    setTimeout(fini, 400);
  }
  navDir = 'none';
  renderNav();
  /* C8 · point 4 — le bandeau « session expirée », posé après le dessin comme
     celui de la mise à jour. Il se pose et s'enlève tout seul selon
     `db.sessionExpiree` ; l'appeler à chaque rendu est ce qui garantit qu'il
     revient après une navigation et disparaît dès la reconnexion. */
  if(typeof montrerBandeauSession === 'function' && db.sessionExpiree) montrerBandeauSession();
  /* Une seule fois : l'étiquette qui apprend à quoi sert la cloche. */
  if((view==='show' || view==='movie') && typeof montrerAstuceCloche === 'function')
    montrerAstuceCloche();
  /* Une seule fois : la démonstration du glissement sur une ligne d'abonnement. */
  if(view==='abos' && typeof montrerAstuceGlis === 'function') montrerAstuceGlis();
  /* L'onglet Recherche ne charge rien tout seul : au repos il n'a aucune
     requête à faire, et c'est justement ce qui le distingue de Découvrir. */
  if(view==='search' && typeof centrerCritereActif === 'function') centrerCritereActif();
  if(view==='discover'){
    /* E2 — plus de focus automatique : le champ est là dès l'ouverture, et
       ouvrir Découvrir n'est pas vouloir taper. Le clavier ne se lève que si
       on touche le champ, ou depuis un bouton « Chercher un titre ». */
    if(typeof centrerTypeActif === 'function') centrerTypeActif();
    /* La vitrine et la grille filtrée ont chacune leur chargement : on ne
       dépense des requêtes que pour l'état réellement affiché. */
    /* La garde manquait ici, et elle existait juste en dessous pour la grille :
       un ajout depuis Découvrir déclenchait DEUX calculs de vitrine — l'un par
       `veilleBiblio` dans `saveDB`, l'autre par ce `render()` — soit une
       vingtaine de requêtes TMDB dont la moitié était jetée sans être peinte.
       `chargerSuggestions` sait déjà se relancer si la bibliothèque bouge
       pendant un calcul (`c.perime`) : rien n'est perdu.
       Revue de stabilité du 02/08, constat A1-2. */
    /* B2 (09/08) — ON NE CALCULE PAS UNE VITRINE QUE PERSONNE NE REGARDE. Tant
       que l'amorçage est nécessaire, `vitrineBody` (app-04) affiche la grille
       des trois affiches à choisir, et RIEN de la vitrine. Or chaque jaquette
       touchée appelle `poserGraine` → `oublierSuggestions()` → `render()`, et ce
       `render()` relançait le moteur complet : douze à vingt requêtes TMDB par
       affiche touchée, cent vingt à deux cents pour dix. Le calcul part
       maintenant à la SORTIE de l'amorçage (`finirAmorcage`), quand la vitrine
       s'affiche vraiment. */
    if(typeof vitrineVisible === 'function' && vitrineVisible()){
      const amorce = (typeof besoinAmorcage === 'function') && besoinAmorcage();
      if(!amorce && (typeof suggEnCours !== 'function' || !suggEnCours())) chargerSuggestions();
    }
    else if(!ui.disc.charge && !ui.disc.loading) chargerDecouverte();
  }
}
function renderNav(){
  /* L'onglet Sorties a vécu quelques heures ici, puis Adrien l'a retiré :
     « pas terrible ». Son code dort dans app-10 — seule la section « Bientôt »
     d'À suivre en est restée, elle avait fait ses preuves. */
  const tabs = [
    ['discover','Découvrir',I.boussole],
    ['search','Recherche',I.search],
    ['follow','En cours',I.cal],
    ['profile','Mon profil',I.user]
  ];
  /* L'onglet à allumer. Chaque écran appartient à une des trois sections, et
     ceux qui s'ouvrent depuis plusieurs endroits suivent leur origine — sans
     quoi la barre s'éteignait : une fiche ouverte depuis la grille « Tout
     voir » arrivait avec from:'rangee', que personne ne savait rattacher, et
     plus aucun onglet n'était allumé. Une barre éteinte se lit comme une
     panne, pas comme une nuance. */
  /* Les écrans d'inscription n'appartiennent à aucun onglet : la barre du bas
     n'y est pas affichée (classe `accueil`). Ils ne figurent donc pas dans la
     table ci-dessous, et la valeur de repli ne coûte rien. */
  /* POINT 4A DU CYCLE 3 — `preview` n'est plus associé à Découvrir
     INCONDITIONNELLEMENT : comme `show` et `movie`, il suit `params.from`,
     avec Découvrir en repli. Un aperçu ouvert depuis la grille de Recherche
     arrivait avec `from:'search'` et la barre allumait quand même Découvrir —
     et l'utilisateur, croyant y être, touchait « Recherche » pour revenir :
     un chemin de retour que personne n'avait prévu. */
  const TAB_DIRECT = { discover:'discover', search:'search', follow:'follow', profile:'profile',
    rangee:'discover',
    account:'profile', abos:'profile', biblio:'profile', moi:'profile',
    notifs:'profile', clochettes:'profile',
    /* C6 — REVUE DU 07/08 : Réglages, Mes goûts et Mes plateformes vivent sous
       Mon profil. Absents de la table, un aperçu ouvert depuis Mes goûts
       tombait dans le repli aveugle et allumait Découvrir (reproduit). */
    settings:'profile', gouts:'profile', plates:'profile' };
  /* C6 — la provenance se remonte DE PROCHE EN PROCHE : un film ouvert depuis
     la filmographie d'un acteur, lui-même ouvert depuis une fiche « En cours »,
     allume En cours — pas un onglet au hasard. `memParams` (app-02) garde les
     paramètres de chaque écran traversé ; borné à six sauts par prudence. */
  let cur = TAB_DIRECT[view];
  let de = params && params.from, saut = 0;
  while(!cur && de && saut < 6){
    cur = TAB_DIRECT[de];
    de = (memParams[de] || {}).from;
    saut++;
  }
  if(!cur){
    /* Repli, si la chaîne de provenance ne mène nulle part. */
    cur = (view==='show'||view==='movie') ? 'follow'
        : (view==='preview'||view==='acteur') ? 'discover' : 'profile';
  }

  /* La barre n'est construite qu'une fois, puis seul son état change : c'est
     ce qui permet à la pastille de GLISSER d'un onglet à l'autre. Reconstruire
     le HTML à chaque rendu la téléportait au lieu de la faire voyager. */
  const nav = document.getElementById('nav');
  if(nav.childElementCount !== tabs.length + 1){
    nav.style.gridTemplateColumns = 'repeat('+tabs.length+',1fr)';
    nav.innerHTML = '<i id="navpip" class="cache"></i>' + tabs.map(([id,label,icon])=>
      '<button class="tab" onclick="go(\''+id+'\')">'+icon+'<span>'+label+'</span></button>'
    ).join('');
  }
  const boutons = nav.querySelectorAll('.tab');
  tabs.forEach(([id], i)=> boutons[i].classList.toggle('on', id === cur));
  /* SPEC-06 §4.4 — LA PASTILLE DE « MON PROFIL ». Elle est posée ICI et pas
     dans le gabarit du dessus pour une raison de forme du code : la barre n'est
     construite QU'UNE FOIS (la garde `childElementCount`), alors que son état
     se remet à jour à chaque rendu — exactement comme la classe `.on` juste
     au-dessus. Un compte écrit dans le gabarit ne changerait plus jamais.
     `nouveauxADepartager` est recalculé aux mêmes moments que le bloc Duel
     (entrée d'onglet, fin de session, 👍) et jamais en continu. */
  const iProfil = tabs.findIndex(([id])=> id === 'profile');
  if(iProfil >= 0 && boutons[iProfil]){
    const n = (typeof texteDuelPastille === 'function') ? texteDuelPastille() : '';
    let p = boutons[iProfil].querySelector('.tabpip');
    if(n){
      if(!p){ p = document.createElement('i'); p.className = 'tabpip'; boutons[iProfil].appendChild(p); }
      p.textContent = n;
    }else if(p) p.remove();
  }
  const pip = document.getElementById('navpip');
  const idx = tabs.findIndex(([id])=> id === cur);
  pip.classList.toggle('cache', idx < 0);
  pip.style.width = (100 / tabs.length) + '%';
  if(idx >= 0) pip.style.left = (idx * (100 / tabs.length)) + '%';
}

function header(title, opts){
  opts = opts||{};
  return '<header><div class="hbar">'+
    (opts.back ? '<button class="iconbtn" onclick="'+opts.back+'">'+I.back+'</button>' : '')+
    '<div class="htitle">'+esc(title)+'</div>'+
    (opts.right||'')+
  '</div>'+(opts.sub||'')+'</header>';
}

/* Plus rien à réclamer à l'ouverture : la clé est fournie par le relais.
   La fonction reste, elle est appelée par les vues. */
function needKeyBanner(){ return ''; }

/* ---------- Vue : À suivre ----------

   Deux blocs, deux formes franchement différentes — c'était le reproche
   d'Adrien sur l'ancienne version : trois listes de lignes qui se
   ressemblaient toutes.

   1. « À rattraper » : de grandes cartes image que l'on fait défiler du
      pouce, une par série en retard, avec le nombre d'épisodes en attente.
   2. « Calendrier » : UNE seule liste chronologique où les épisodes à venir
      et les sorties de tes films se mêlent, jour par jour. Deux sections
      d'avant (« À venir » et « Bientôt ») n'en font plus qu'une : c'est la
      même question — qu'est-ce qui arrive ? — donc une seule réponse.
--------------------------------------------------------------------------- */

/* Combien d'épisodes diffusés attendent d'être vus. */
function retardSerie(s){
  return memo('r'+s.id, ()=>{
    const t = todayISO();
    return allEpisodes(s, false)
      .filter(ep => ep.d && ep.d <= t && !s.watched[key(ep.s, ep.e)]).length;
  });
}

/* F1 — l'ordre de « À rattraper », figé le temps qu'on reste sur l'écran.

   Le tri portait sur la date du PROCHAIN épisode. Cocher S1E1 faisait passer
   la clé de tri à la date de S1E2, plus récente : la carte remontait dans le
   classement, sur le geste le plus fréquent de l'app. On défile jusqu'à la
   sixième carte, on coche, et elle n'est plus là.

   Trier sur le retard plutôt que sur la date corrige le pire, mais pas tout :
   le retard baisse d'une unité au cochage, et la carte double alors celle qui
   la suivait à égalité. La spec anticipe le cas et tranche : ordre ÉTABLI À
   L'ENTRÉE sur l'écran, et plus rien ne bouge tant qu'on y reste.

   Le repère est donc l'entrée sur l'écran, pas le rendu — cocher redessine
   sans changer d'écran, et c'est exactement ce qu'on veut ignorer. `render()`
   remet ce classement à zéro dès qu'il dessine autre chose que « En cours ».

   Une série qui devient en retard pendant qu'on est sur l'écran (on décoche,
   on ajoute) n'est pas dans le classement mémorisé : elle passe en fin de
   liste plutôt que de tout réordonner sous le doigt. Elle reprendra sa vraie
   place au prochain passage sur l'écran. */
let ordreRattrapage = null;
function oublierOrdreRattrapage(){ ordreRattrapage = null; }

function viewFollow(){
  const shows = Object.values(db.shows);
  const t = todayISO();

  /* --- À rattraper : le prochain épisode non vu de chaque série --- */
  const todo = [];
  shows.forEach(s=>{
    if(statutSerie(s) !== 'asuivre') return;   // ni les non commencées, ni les terminées
    const nx = nextToWatch(s);
    /* Le retard est relevé ici et transporté dans l'entrée : `carteRattrapage`
       le redemandait juste après, ce qui refaisait tout le calcul une deuxième
       fois par série et par rendu. */
    if(nx) todo.push({s:s, ep:nx, retard: retardSerie(s)});
  });
  /* L'ordre de référence : les plus en retard d'abord, puis les plus
     anciennement ajoutées, puis l'identifiant. Les deux derniers critères ne
     changent JAMAIS — sans eux, deux séries à égalité de retard permutent d'un
     rendu à l'autre au gré de l'ordre des clés de `db.shows`. */
  todo.sort((a,b)=>
    (b.retard - a.retard) || ((a.s.addedAt||0) - (b.s.addedAt||0)) || (a.s.id - b.s.id));
  if(!ordreRattrapage) ordreRattrapage = todo.map(x=> x.s.id);
  else {
    const rang = {};
    ordreRattrapage.forEach((id,i)=>{ rang[id] = i; });
    /* Les inconnues du classement passent après toutes les connues, dans leur
       ordre naturel : `todo` est déjà trié, un tri stable les laisse entre
       elles dans cet ordre-là. */
    const apres = ordreRattrapage.length;
    todo.sort((a,b)=> (rang[a.s.id] === undefined ? apres : rang[a.s.id])
                    - (rang[b.s.id] === undefined ? apres : rang[b.s.id]));
  }

  /* --- Le calendrier : épisodes futurs ET sorties de films, mêlés --- */
  /* D7, RESTREINT PAR LE POINT 2 DU CYCLE 3 — une série ajoutée mais pas
     commencée a quand même des dates, et les cacher faisait croire que l'ajout
     n'avait rien fait. Le raisonnement TIENT pour une série qui n'a pas encore
     commencé à être diffusée : on annonce sa première. IL NE TIENT PLUS pour
     une série qui tourne depuis quatre saisons : on n'annonce pas une sortie,
     on déverse un feuilleton — la capture d'Adrien du 03/08 (IMG_3129) montrait
     *Grand Blue Dreaming* S3E5 « Pas commencé » dans son calendrier.
     La règle devient donc : une série au statut `avoir` n'entre dans le
     calendrier que si ELLE-MÊME n'est pas encore sortie (`s.first`, alimenté
     depuis `first_air_date` par app-01, est aujourd'hui ou dans le futur).
     Les séries COMMENCÉES (`asuivre`) gardent leurs prochains épisodes — c'est
     l'essentiel de ce qu'Adrien voit ici (« et il y a aussi les séries en
     cours bien sûr ») — et n'ont aucune étiquette.
     Elle n'entre PAS dans « À rattraper » pour autant — on ne rattrape pas ce
     qu'on n'a pas commencé, et `statutSerie` garde son sens (P4).
     « En pause » reste absente des deux : c'est le but de la pause.
     Le côté films est déjà correct (`chargerBientotPerso` ne retient que des
     dates à venir) : rien n'y change. */
  const cal = [];
  shows.forEach(s=>{
    const st = statutSerie(s);
    if(st === 'pause') return;
    const pasCommence = st === 'avoir';
    /* POINT 2 DU CYCLE 3 — le correctif : une série à voir DÉJÀ DIFFUSÉE ne
       remplit plus le calendrier. Sans date de première connue, on la traite
       comme déjà diffusée : mieux vaut une ligne de moins qu'un feuilleton
       déversé — c'était exactement le défaut. */
    if(pasCommence && !(s.first && s.first >= t)) return;
    /* CORRECTION C2 (relecture du cycle 3, tranchée le 06/08 : « seulement la
       première ») — UNE SÉRIE JAMAIS DIFFUSÉE N'ANNONCE QU'UNE LIGNE.
       Elle posait jusqu'ici TOUS ses épisodes déjà annoncés : sur une série qui
       publie son calendrier complet avant diffusion, c'était le déversement du
       point 2 qui revenait par une autre porte, sur une série qu'on n'a même
       pas commencée. On ne garde donc que sa date de première, étiquetée
       « Premier épisode ». Ses épisodes suivants apparaîtront quand elle sera
       commencée — c'est-à-dire quand elle passera au statut `asuivre`, où la
       boucle complète ci-dessous s'applique de nouveau. */
    if(pasCommence){
      /* L'épisode de la première : celui qui porte la date, à défaut S1E1, à
         défaut le premier annoncé. On ne fabrique pas de ligne sans épisode. */
      const futurs = allEpisodes(s,false).filter(ep => ep.d && ep.d >= t);
      const prem = futurs.find(ep => ep.d === s.first)
                || futurs.find(ep => ep.s === 1 && ep.e === 1)
                || futurs[0];
      if(prem) cal.push({d:prem.d, show:s, ep:prem, neuf:true});
      else if(s.next && s.next.d && s.next.d >= t)
        cal.push({d:s.next.d, show:s,
                  ep:{s:s.next.s, e:s.next.e, n:s.next.n, d:s.next.d}, neuf:true});
      return;
    }
    allEpisodes(s,false).forEach(ep=>{ if(ep.d && ep.d >= t) cal.push({d:ep.d, show:s, ep:ep, neuf:false}); });
    if(s.next && s.next.d && s.next.d >= t && !(s.seasons[s.next.s]||[]).some(e=>e.e===s.next.e))
      cal.push({d:s.next.d, show:s, ep:{s:s.next.s, e:s.next.e, n:s.next.n, d:s.next.d}, neuf:false});
  });
  if(typeof filmsBientot === 'function')
    filmsBientot().forEach(f=> cal.push({d:f.dfr, film:f}));
  /* Le tri passe AVANT la troncature : avec les séries « À voir » incluses, le
     calendrier s'allonge, et tronquer une liste non triée pourrait faire
     disparaître les sept prochains jours au profit de dates lointaines. */
  cal.sort((a,b)=>a.d.localeCompare(b.d));
  const agenda = cal.slice(0,80);

  let html = header('En cours', {right:'<button class="iconbtn" onclick="go(\'discover\')">'+I.plus+'</button>'});
  html += needKeyBanner();

  /* L'écran vide n'a de sens que si rien n'est suivi du tout : quelqu'un qui
     n'a que des films doit quand même voir son calendrier. */
  const desFilms = (typeof filmsSuivisIds === 'function') && filmsSuivisIds().length;
  if(!shows.length && !desFilms){
    return html + '<div class="empty">'+I.tv+'<h3>Rien en cours pour l\'instant</h3>'+
      '<p>Ajoute une série ou un film depuis la recherche : tu retrouveras ici tes prochains épisodes et les dates de diffusion.</p>'+
      '<button class="btn" onclick="go(\'discover\')">Chercher une série</button></div>';
  }

  /* Section 1 : les cartes du retard */
  html += '<div class="sectitle">À rattraper'+
    (todo.length?'<span class="cnt">'+todo.length+'</span>':'')+'</div>';
  if(!todo.length){
    /* D7 — « Rien de commencé » ne se justifie que si le calendrier est vide
       lui aussi. Depuis que les séries « À voir » y figurent, l'écran n'est
       plus muet : renvoyer vers l'onglet « À voir » n'a plus lieu d'être quand
       leurs dates sont déjà affichées juste en dessous. */
    const enAttente = agenda.length ? 0 : shows.filter(x=>statutSerie(x)==='avoir').length;
    html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:18px;text-align:center">'+
      (enAttente
        ? '<div style="font-size:15px;font-weight:650">Rien de commencé</div>'+
          '<div class="small muted" style="margin-top:3px">'+enAttente+' série'+(enAttente>1?'s':'')+
          ' t\'attend'+(enAttente>1?'ent':'')+' dans « À voir ».</div>'+
          '<button class="btn ghost" style="margin-top:12px" onclick="ui.profTab=\'avoir\';go(\'profile\')">Ouvrir À voir</button>'
        : '<div style="font-size:15px;font-weight:650">Tu es à jour partout 🎉</div>'+
          '<div class="small muted" style="margin-top:3px">Plus aucun épisode diffusé en attente.</div>')+
      '</div></div>';
  } else {
    html += '<div class="rattrap" data-rail="rattrap">'+todo.map(x=>carteRattrapage(x.s,x.ep,x.retard)).join('')+'</div>';
  }

  /* Section 2 : le calendrier unique */
  html += '<div class="sectitle">Bientôt</div>';
  if(!agenda.length){
    html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:18px;text-align:center">'+
      '<div class="small muted">Aucune date annoncée pour tes séries et tes films.</div></div></div>';
  } else {
    let cur = '', out = '<div class="day">';
    agenda.forEach(i=>{
      if(i.d !== cur){ cur = i.d; out += '<div class="daylbl">'+fmtDayLabel(i.d)+'</div>'; }
      out += i.film ? ligneFilmCal(i.film) : ligneEpisodeCal(i.show, i.ep, i.neuf);
    });
    out += '</div>';
    html += out;
  }
  return html + '<div style="height:24px"></div>';
}

/* Une ligne d'épisode dans le calendrier. */
function ligneEpisodeCal(s, ep, pasCommence){
  /* `srcImage` : le chemin peut venir de la bibliothèque d'un proche, donc
     d'ailleurs que de TMDB. Voir la frontière de confiance dans app-02. */
  const thumb = srcImage(ep.st,'w300') || srcImage(s.backdrop,'w300') || srcImage(s.poster,'w154');
  return '<div class="crow" onclick="go(\'show\',{id:'+s.id+',from:\'follow\'})">'+
    (thumb ? '<img class="cthumb" loading="lazy" src="'+thumb+'" alt="">' : '<div class="cthumb"></div>')+
    '<div class="epinfo">'+
      '<div class="epname">'+esc(s.name)+'</div>'+
      '<div class="epsub">'+codeEp(ep.s,ep.e)+' · '+esc(ep.n||'')+
        /* POINT 2 DU CYCLE 3 — l'étiquette ne marque plus que des séries
           JAMAIS diffusées (tranché le 03/08) : « Pas commencé » deviendrait
           absurde — évidemment qu'elle n'est pas commencée, elle n'existe pas
           encore. Elle annonce donc ce qu'elle est : la première. */
        (pasCommence ? '<span class="pasdeb">Premier épisode</span>' : '')+'</div>'+
    '</div></div>';
}

/* Une ligne de film dans le même calendrier : même forme, autre sous-titre. */
function ligneFilmCal(f){
  return '<div class="crow" onclick="go(\'movie\',{id:'+f.id+',from:\'follow\'})">'+
    (srcImage(f.image,'w300')
       ? '<img class="cthumb" loading="lazy" src="'+srcImage(f.image,'w300')+'" alt="">'
       : '<div class="cthumb"></div>')+
    '<div class="epinfo">'+
      '<div class="epname">'+esc(f.titre)+'</div>'+
      '<div class="epsub film">'+esc(f.mot)+'</div>'+
    '</div></div>';
}

/* Appui long sur une ligne « À rattraper » : c'est là qu'on se dit qu'on ne
   suit plus la série. On propose de la mettre de côté sans quitter l'écran. */
let pressTimer = null, pressLong = false, pressX = 0, pressY = 0;
function pressStart(id, ev){
  pressLong = false;
  const t = ev && ev.touches && ev.touches[0];
  pressX = t ? t.clientX : 0; pressY = t ? t.clientY : 0;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(()=>{ pressLong = true; menuPause(id); }, 500);
}
/* Un doigt posé bouge toujours de quelques pixels : on ne renonce qu'au-delà
   de 12 px, sinon le geste est annulé avant même d'avoir commencé. */
function pressMove(ev){
  const t = ev && ev.touches && ev.touches[0];
  if(!t) return;
  if(Math.abs(t.clientX - pressX) > 12 || Math.abs(t.clientY - pressY) > 12) pressEnd();
}
function pressEnd(){ clearTimeout(pressTimer); }
function pressClic(id, ev){
  if(pressLong){ pressLong = false; if(ev) ev.stopPropagation(); return; }
  go('show', {id:id, from:'follow'});
}
function menuPause(id){
  const s = db.shows[id];
  if(!s) return;
  if(navigator.vibrate) try{ navigator.vibrate(8); }catch(e){}
  openSheet('<h3>'+esc(s.name)+'</h3>'+
    '<p class="small muted" style="margin:0 0 8px">Elle disparaîtra d\'« À rattraper » et du calendrier. '+
    'Tes épisodes cochés sont conservés.</p>'+
    '<button class="opt" onclick="basculerPause('+id+')">Mettre en pause</button>'+
    '<button class="opt" onclick="closeSheet();go(\'show\',{id:'+id+',from:\'follow\'})">Ouvrir la fiche</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

/* La carte d'une série en retard. L'image passe au premier plan, le texte se
   pose dessus dans un dégradé — c'est la même grammaire que le héros d'une
   fiche. Le badge dit combien d'épisodes attendent, le rond bleu en coche un
   d'un seul geste, l'appui long ouvre la mise en pause (comme avant). */
/* `retard` est passé par l'appelant, qui vient de le calculer pour trier :
   le redemander ici doublait le coût. Il reste facultatif pour que la fonction
   survive à un appel isolé. */
function carteRattrapage(s, nx, retard){
  const n = (retard === undefined) ? retardSerie(s) : retard;
  /* C9 — REVUE DU 07/08 : la carte fait 252 px de large (`.rcarte`, app.css) ;
     un `w780` y décodait ~1,4 Mo de mémoire d'image PAR CARTE, multiplié par
     des dizaines de cartes « À rattraper ». `w500` couvre encore un écran
     Retina ×2 (504 px) sans perte visible. */
  const img = srcImage(s.backdrop,'w500') || srcImage(s.poster,'w342');
  return '<div class="rcarte">'+
    '<div class="rfond" onclick="pressClic('+s.id+',event)"'+
      ' ontouchstart="pressStart('+s.id+',event)" ontouchend="pressEnd()" ontouchmove="pressMove(event)"'+
      ' ontouchcancel="pressEnd()">'+
      (img ? '<img loading="lazy" src="'+img+'" alt="">' : '')+
      (n > 1 ? '<span class="rbadge">'+n+' ép.</span>' : '')+
      '<div class="rtexte">'+
        '<b>'+esc(s.name)+'</b>'+
        '<i>'+codeEp(nx.s,nx.e)+' · '+esc(nx.n||'')+'</i>'+
      '</div>'+
    '</div>'+
    /* Les deux actions restent VISIBLES : mettre en pause ne doit pas
       dépendre d'un appui long que personne ne devine. */
    '<div class="ract">'+
      '<button class="rond" title="Options" onclick="menuPause('+s.id+')">'+I.dots+'</button>'+
      '<button class="rond vu" title="Marquer '+codeEp(nx.s,nx.e)+' comme vu" '+
        'onclick="quickWatch('+s.id+',event)">'+I.check+'</button>'+
    '</div>'+
  '</div>';
}

/* ===========================================================================
   POINT 12 — MON PROFIL

   Trois défauts corrigés d'un coup, plus un correctif de fluidité. Les
   décisions et leurs mesures sont écrites ici parce que c'est le seul endroit
   où quelqu'un les relira avant de « simplifier » ce fichier.

   A. LE GRAND NOMBRE EST RETIRÉ (02/08). L'écran affichait « 118 séries » —
      `Object.keys(db.shows).length`, TOUT, y compris ce qu'on n'a jamais
      commencé et ce qu'on a mis en pause — à cinq centimètres d'une puce
      « Séries 88 » qui, elle, écarte `avoir` et `pause`. Trente d'écart sur le
      même écran : pour qui lit les deux, l'un des deux ment. Le grand nombre ne
      servait nulle part ailleurs, il part. Les chiffres de la ligne du dessous
      RESTENT : épisodes, jours de visionnage, séries finies ne se contredisent
      pas, ne se lisent nulle part ailleurs, et ils sont la seule récompense de
      l'écran.

   B. ON POUVAIT AVOIR 383 FILMS ET AUCUN MOYEN D'EN RETROUVER UN. Des jaquettes
      rangées par date de visionnage, rien d'autre : ni recherche, ni tri, ni
      filtre. D'où la « barre sobre » (squelette A, variante A2) : une seule
      ligne, trois boutons qui DISENT LEUR ÉTAT — « Trier · A→Z », « Filtrer · 2 ».
      A2 a été retenue parce que c'est la seule variante mesurée dont la grille
      NE BOUGE PAS quand on pose un filtre : 369 px dans les deux cas, contre
      412 → 453 px pour A1.

   C. LE CERCLE NE PASSAIT PAS L'ÉCHELLE. Une bulle de 62 px par personne en
      rangée horizontale : à dix, c'est un défilement latéral qui masque la
      moitié des gens sans le dire. Remplacé par UNE ligne — les avatars en
      pile, « et 8 autres », un appui qui mène à l'écran du cercle existant.

   D. LA FLUIDITÉ. Toucher une puce appelait `render()`, qui rejouait tout
      l'écran, dont la boucle sur les ~7 000 épisodes de la bibliothèque
      (18 ms sur un poste de bureau, ~55 ms sur iPhone) — pour un changement qui
      ne concerne QUE la grille du bas. `peindreProfil` ne réécrit que la zone
      des cartes et l'état `on` des puces, sur le modèle de `peindreDisc` et
      `peindreRech`.

   CE QUI N'EST PAS FAIT, ET POURQUOI :
     · La grille « Films » pose 382 `<img>` en une seule écriture (154 Ko de
       HTML). Une pagination réglerait ça mais ajouterait un bouton visible :
       c'est un changement de parcours, il n'est pas validé. Non implémenté.
     · « Quand la recherche trouve nettement une personne et presque aucun
       titre, la section Titres se réduit à une ligne » : piste non tranchée,
       délibérément NON implémentée. La section Titres garde sa place pleine.
=========================================================================== */

/* ---------- Vue : Mon profil ---------- */
function lastWatchedAt(s){
  return memo('l'+s.id, ()=>{
    let m = 0;
    for(const k in s.watched){ if(s.watched[k] > m) m = s.watched[k]; }
    return m;
  });
}

/* L'état de l'écran, hors de `ui` : il est entièrement local au point 12 et
   n'a aucune raison d'être relu par un autre écran. `ouvert` est la recherche
   plein écran, `yAvant` la position de lecture à laquelle « Annuler » ramène. */
let pf12 = { ouvert:false, yAvant:0, q:'', tri:'recent',
             filtres:{ genre:[], epoque:[], plate:[], nonnotes:false },
             pers:null, persEtat:'', persErr:'', recents:null };
let pf12Timer = null, pf12Seq = 0, pf12Abort = null;

const PF12_TRIS = [['recent','Récents'], ['ancien','Anciens'], ['az','A→Z'], ['za','Z→A']];
/* Le champ DOIT dire où il cherche : sans ça, la recherche de la bibliothèque
   et celle de l'onglet Recherche (qui, elle, fouille tout le catalogue TMDB)
   deviennent indistinguables une fois le reste de l'écran effacé. */
const PF12_OU = { series:'mes séries', animes:'mes animés', films:'mes films',
                  avoir:'ce que je veux voir', pause:'mes séries en pause' };

/* ---------------------------------------------------------------------------
   LES LISTES DE L'ÉCRAN

   Un seul format pour tout ce qui suit — { m:'tv'|'movie', o:objet } — parce
   que trier, filtrer et chercher doivent traiter une série et un film de la
   même manière. C'est ce qui évite de réécrire quatre fois la même règle.
--------------------------------------------------------------------------- */
/* RETOUR-02 POINT 4 (11/08/2026) — LA BIBLIOTHÈQUE A UNE PUCE ANIMÉS.

   CE QUI N'ALLAIT PAS. Le profil proposait Séries / Films / À voir / En pause.
   Les animés vus étaient noyés dans « Séries » — alors que TOUT le reste de
   l'app les sépare : le duel a sa famille `anime`, Découvrir a sa puce, la
   Recherche a la sienne. La seule vue où l'on regarde SA bibliothèque était
   aussi la seule à ne pas faire la différence.

   LA FRONTIÈRE EST CELLE QUI EXISTE DÉJÀ, et c'est le point important : on
   n'en invente pas une troisième. `familleDe(o, 'tv')` (app-11) est la
   frontière de la BIBLIOTHÈQUE — genre « Animation » présent, sans condition de
   langue. C'est elle qui alimente `titresVus`, donc le duel, donc le podium.
   L'autre frontière du dépôt, `estAnimeRech` (app-12), ajoute la langue
   d'origine japonaise : elle sert au CATALOGUE TMDB, où il faut distinguer un
   dessin animé américain d'un animé. Ici on range ce qu'on a déjà chez soi, et
   la règle doit être celle du duel — sans quoi une série serait un animé dans
   son podium et une série dans sa bibliothèque, sur le même écran.

   LES COMPTES S'AJUSTENT SANS SE PERDRE : ce qui quitte « Séries » entre dans
   « Animés », et la somme ne bouge pas (84 + 15 dans l'exemple du RETOUR).
   L'ORDRE DES PUCES NE CHANGE PAS — Séries reste en premier, c'est l'usage
   principal ; la puce s'AJOUTE, juste après. */
function estAnimeProfil(s){
  if(typeof familleDe !== 'function') return false;
  return familleDe(s, 'tv') === 'anime';
}
function listesProfil(){
  const S = Object.values(db.shows), F = Object.values(db.movies);
  const sr = s => ({ m:'tv', o:s });
  const fm = f => ({ m:'movie', o:f });
  /* « Commencée » au sens de la bibliothèque : ni à voir, ni en pause. C'est
     exactement le filtre d'avant, sorti pour être appliqué deux fois. */
  const commencees = S.filter(s=>{ const st = statutSerie(s); return st!=='avoir' && st!=='pause'; });
  return {
    series: commencees.filter(s => !estAnimeProfil(s)).map(sr),
    animes: commencees.filter(estAnimeProfil).map(sr),
    films:  F.filter(f=> statutFilm(f)==='vu').map(fm),
    avoir:  S.filter(s=> statutSerie(s)==='avoir').map(sr)
             .concat(F.filter(f=> statutFilm(f)==='avoir').map(fm)),
    pause:  S.filter(s=> statutSerie(s)==='pause').map(sr)
  };
}
const titrePf12 = x => (x.m === 'tv' ? x.o.name : x.o.title) || '';
const datePf12  = x => (x.m === 'tv' ? x.o.first : x.o.date) || '';
const cartePf12 = x => x.m === 'tv' ? showCard(x.o) : movieCard(x.o);
/* « Récents » ne veut pas dire la même chose d'un onglet à l'autre, et c'est
   voulu : une série en pause n'a pas de dernier épisode pertinent, elle a une
   date de mise de côté. Chaque onglet garde donc EXACTEMENT l'ordre qu'il avait
   avant le point 12 — le tri par défaut ne change rien à ce qu'on voyait. */
function quandPf12(x, onglet){
  if(onglet === 'pause') return x.o.pauseLe || 0;
  if(onglet === 'avoir') return x.o.addedAt || 0;
  return x.m === 'tv' ? lastWatchedAt(x.o) : (x.o.watchedAt || 0);
}
function trierPf12(l, onglet){
  const c = l.slice();
  if(pf12.tri === 'az' || pf12.tri === 'za'){
    c.sort((a,b)=> titrePf12(a).localeCompare(titrePf12(b), 'fr', { sensitivity:'base' }));
    if(pf12.tri === 'za') c.reverse();
    return c;
  }
  c.sort((a,b)=> quandPf12(b, onglet) - quandPf12(a, onglet));
  if(pf12.tri === 'ancien') c.reverse();
  return c;
}

/* ---------------------------------------------------------------------------
   LES FILTRES — QUATRE AXES, ET LEUR CONTENU N'EST PAS VALIDÉ

   La feuille « Filtrer » n'a jamais été dessinée. Les quatre axes ci-dessous
   sont ceux qui étaient PRESSENTIS — genre, époque, plateforme, jamais notés —
   et rien de plus : pas un cinquième, pas de sous-rubrique. Tant que le dessin
   n'est pas arbitré, ce code tient la place sans l'occuper.

   Une limite honnête : la bibliothèque ne stocke une plateforme QUE pour les
   séries (`show.network`, posé par `chargerSerie`). Un film enregistré porte
   `id, title, poster, backdrop, date, runtime, overview, genres, note, seen…`
   et aucune chaîne. L'axe « plateforme » ne mord donc que sur les séries, et la
   feuille ne propose que ce qui existe réellement dans l'onglet ouvert plutôt
   que d'afficher une rubrique vide.
--------------------------------------------------------------------------- */
function genresPf12(x){
  return Array.isArray(x.o.genres) ? x.o.genres.filter(g => typeof g === 'string' && g) : [];
}
function decenniePf12(x){
  const a = parseInt(String(datePf12(x)).slice(0,4), 10);
  return a ? Math.floor(a/10)*10 : 0;
}
function platePf12(x){
  return (x.m === 'tv' && typeof x.o.network === 'string') ? x.o.network : '';
}
/* « Jamais notés » lit les pouces de Mes goûts (`db.avis`), pas la note TMDB :
   c'est CE QUE TU N'AS PAS ENCORE DIT qu'on cherche, pas ce que le monde pense. */
function notePf12(x){
  return (typeof avisDe === 'function') ? avisDe(x.m, x.o.id) !== 0 : false;
}
function passeFiltresPf12(x){
  const f = pf12.filtres;
  if(f.genre.length  && !genresPf12(x).some(g => f.genre.indexOf(g) >= 0)) return false;
  if(f.epoque.length && f.epoque.indexOf(decenniePf12(x)) < 0) return false;
  if(f.plate.length  && f.plate.indexOf(platePf12(x)) < 0) return false;
  if(f.nonnotes && notePf12(x)) return false;
  return true;
}
/* Le bouton compte des AXES, pas des cases : « Filtrer · 2 » se lit « deux
   critères », ce qui reste vrai qu'on ait coché un genre ou trois. */
function nbFiltresPf12(){
  const f = pf12.filtres;
  return (f.genre.length?1:0) + (f.epoque.length?1:0) + (f.plate.length?1:0) + (f.nonnotes?1:0);
}
/* Les choix proposés sortent des titres réellement présents dans l'onglet
   ouvert : une feuille qui propose « Western » à quelqu'un qui n'en a aucun
   fabrique des culs-de-sac. */
function optionsPf12(l){
  const g = {}, e = {}, p = {};
  l.forEach(x=>{
    genresPf12(x).forEach(n=>{ g[n] = (g[n]||0) + 1; });
    const d = decenniePf12(x); if(d) e[d] = (e[d]||0) + 1;
    const n = platePf12(x);    if(n) p[n] = (p[n]||0) + 1;
  });
  const parNombre = (t) => (a,b)=> (t[b] - t[a]) || a.localeCompare(b, 'fr');
  return {
    genres:  Object.keys(g).sort(parNombre(g)).slice(0, 14).map(n => [n, g[n]]),
    epoques: Object.keys(e).map(Number).sort((a,b)=> b - a).map(n => [n, e[n]]),
    plates:  Object.keys(p).sort(parNombre(p)).slice(0, 12).map(n => [n, p[n]])
  };
}

function ouvrirFiltresPf12(){
  const brut = listesProfil()[ui.profTab] || [];
  const o = optionsPf12(brut);
  const f = pf12.filtres;
  const n = brut.filter(passeFiltresPf12).length;
  const bouton = (axe, val, libelle, cnt, actif) =>
    '<button class="ch'+(actif?' on':'')+'" onclick="basculerFiltrePf12(\''+escJs(axe)+'\',\''+
      escJs(String(val))+'\')">'+esc(libelle)+
      (cnt ? ' <span class="pf12cnt">'+cnt+'</span>' : '')+'</button>';
  const bloc = (titre, corps) => corps
    ? '<div class="pf12fbloc"><h4>'+esc(titre)+'</h4><div class="choix">'+corps+'</div></div>' : '';

  let h = '<h3>Filtrer</h3>';
  h += bloc('Genre', o.genres.map(([nom, c]) =>
        bouton('genre', nom, nom, c, f.genre.indexOf(nom) >= 0)).join(''));
  h += bloc('Époque', o.epoques.map(([an, c]) =>
        bouton('epoque', an, 'Années '+String(an).slice(2), c, f.epoque.indexOf(an) >= 0)).join(''));
  h += bloc('Plateforme', o.plates.map(([nom, c]) =>
        bouton('plate', nom, nom, c, f.plate.indexOf(nom) >= 0)).join(''));
  h += bloc('Ce que je n’ai pas jugé',
        bouton('nonnotes', 1, 'Jamais notés', 0, f.nonnotes));
  /* Une feuille de filtres qui ne propose rien est un piège : on dit pourquoi
     plutôt que d'ouvrir un panneau vide. */
  if(!o.genres.length && !o.epoques.length && !o.plates.length)
    h += '<p class="small muted">Rien à filtrer ici : ces titres ne portent ni genre, '+
         'ni date, ni chaîne.</p>';
  h += '<div class="choix pf12fpied">'+
       '<button class="ch raz" onclick="viderFiltresPf12()">Tout effacer</button></div>'+
       '<button class="btn pf12fok" onclick="closeSheet()">Voir '+
         (n ? 'les '+n+' titre'+(n>1?'s':'') : 'la grille')+'</button>';
  openSheet(h, 'filtres-profil');
}
function basculerFiltrePf12(axe, val){
  const f = pf12.filtres;
  if(axe === 'nonnotes') f.nonnotes = !f.nonnotes;
  else {
    const v = (axe === 'epoque') ? Number(val) : String(val);
    const i = f[axe].indexOf(v);
    if(i >= 0) f[axe].splice(i, 1); else f[axe].push(v);
  }
  /* La feuille se redessine à sa position de lecture : `openSheet` garde le
     défilement d'un panneau déjà ouvert, c'est exactement le cas prévu. */
  ouvrirFiltresPf12();
  peindreProfil();
}
function viderFiltresPf12(depuisGrille){
  pf12.filtres = { genre:[], epoque:[], plate:[], nonnotes:false };
  if(depuisGrille) closeSheet(); else ouvrirFiltresPf12();
  peindreProfil();
}
function ouvrirTriPf12(){
  openSheet('<h3>Trier</h3><div class="choix">'+PF12_TRIS.map(([id, l])=>
    '<button class="ch'+(pf12.tri === id ? ' on' : '')+'" onclick="poserTriPf12(\''+
      escJs(id)+'\')">'+esc(l)+'</button>').join('')+'</div>', 'tri-profil');
}
function poserTriPf12(t){ pf12.tri = t; closeSheet(); peindreProfil(); }

/* ---------------------------------------------------------------------------
   LA BARRE SOBRE

   `white-space:nowrap` sur les trois boutons n'est PAS cosmétique et la mesure
   est faite : sans lui, « Trier · Récents » passe à la ligne à 113 px de large
   et la barre CHANGE DE HAUTEUR selon l'ordre choisi — l'écran bougeait pour un
   simple changement de tri. La règle est dans `.css-point12.css`, elle ne se
   retire pas.
--------------------------------------------------------------------------- */
function barreProfil(){
  const nf = nbFiltresPf12();
  const tri = (PF12_TRIS.find(t => t[0] === pf12.tri) || PF12_TRIS[0])[1];
  return '<div class="pf12barre">'+
    '<button class="pf12b" onclick="ouvrirRechPf12()">'+I.search+'<span>Chercher</span></button>'+
    '<button class="pf12b" onclick="ouvrirTriPf12()">Trier · <em>'+esc(tri)+'</em></button>'+
    '<button class="pf12b'+(nf?' on':'')+'" onclick="ouvrirFiltresPf12()">Filtrer'+
      (nf ? ' · <em>'+nf+'</em>' : '')+'</button>'+
  '</div>';
}

/* ---------------------------------------------------------------------------
   LA LIGNE « MON CERCLE »

   Ce qui était là : une bulle de 62 px par personne, en rangée qui défile. À
   dix abonnements, la moitié des gens est hors de l'écran et rien ne le dit.
   Ce qui est là maintenant : une ligne, les avatars en pile, deux prénoms et
   « et N autres ». L'écran du cercle, lui, existait déjà — on y mène.
--------------------------------------------------------------------------- */
function ligneCerclePf12(){
  if(!signedIn() || !partage.suivis || !partage.suivis.length) return '';
  const l = partage.suivis;
  const noms = l.slice(0, 2).map(p => String(p.pseudo || '').trim()).filter(Boolean);
  const reste = l.length - noms.length;
  const sous = noms.join(', ') + (reste > 0 ? ' et '+reste+' autre'+(reste>1?'s':'') : '');
  return '<button class="pf12cercle" onclick="ouvrirAbos()">'+
    '<span class="pf12pile">'+l.slice(0, 4).map(p => avatarDe(p)).join('')+'</span>'+
    '<span class="pf12ct"><b>Mon cercle</b><span>'+esc(sous || (l.length+' personne'+(l.length>1?'s':'')))+
      '</span></span>'+
    '<span class="pf12fl">'+I.caret+'</span>'+
  '</button>';
}

/* ---------------------------------------------------------------------------
   LA RECHERCHE — ELLE S'OUVRE EN PLEIN ÉCRAN, PAS EN PLACE

   Mesuré, clavier à sa hauteur réelle (300 px) : en place — l'en-tête, le
   cercle et les puces gardent le haut, le clavier prend le bas — il reste UN
   résultat visible sur sept. En plein écran, quatre sur sept. Le champ monte en
   haut, tout le reste s'efface, et la barre du bas se retire (voir `render`).

   Deux sections, dans cet ordre et jamais fondues :
     · « Titres » lit `db.shows` / `db.movies` et RIEN D'AUTRE. Instantanée,
       elle marche en avion.
     · « Avec [personne] » demande le réseau. Elle le MONTRE — un rond qui
       tourne sur son titre de section — parce qu'une section qui apparaît une
       seconde plus tard sans prévenir se lit comme un bug.

   POURQUOI LE RÉSEAU EST INÉVITABLE ICI : la bibliothèque NE STOCKE PAS le
   casting (vérifié — un film enregistré porte `id, title, poster, backdrop,
   date, runtime, overview, genres, note, seen…`, aucun acteur). Chercher un
   acteur localement est donc impossible. Le chemin est celui que les rangées
   « Avec X » de Découvrir empruntent déjà, et c'est le même code qu'on
   réutilise : `/search/multi` pour résoudre le nom (le relais accepte aussi
   `/search/person`, mais `/search/multi` rend les titres ET les personnes en
   UNE requête — voir `chercherTitre`), puis `/person/{id}/combined_credits`,
   puis `rangerFilmographie` (app-05) pour dédoublonner et écarter les passages
   où la personne joue son propre rôle, puis croisement avec la bibliothèque.
   Deux requêtes, films et séries d'un coup.
--------------------------------------------------------------------------- */
const PF12_CLE_RECENTS = 'ms.pf12.recents';
function lireRecentsPf12(){
  if(pf12.recents) return pf12.recents;
  let l = [];
  try{ l = JSON.parse(localStorage.getItem(PF12_CLE_RECENTS) || '[]'); }catch(e){}
  pf12.recents = Array.isArray(l) ? l.filter(x => typeof x === 'string' && x).slice(0, 6) : [];
  return pf12.recents;
}
function poserRecentPf12(q){
  const l = lireRecentsPf12().filter(x => x.toLowerCase() !== q.toLowerCase());
  l.unshift(q);
  pf12.recents = l.slice(0, 6);
  try{ localStorage.setItem(PF12_CLE_RECENTS, JSON.stringify(pf12.recents)); }catch(e){}
}
/* On ne retient QUE les recherches qui ont trouvé quelque chose : une frappe
   restée bredouille n'a rien à réapprendre à personne, et la liste des
   dernières recherches se remplirait de fautes de frappe. */
function rangerRecentPf12(){
  const q = String(pf12.q || '').trim();
  if(q.length < 2) return;
  if(!pf12.pers && !titresPf12(q).length) return;
  poserRecentPf12(q);
}

/* Les accents ne doivent pas décider : « Amelie » trouve « Amélie ». */
function normPf12(s){
  s = String(s == null ? '' : s).toLowerCase();
  try{ s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }catch(e){}
  return s;
}
/* La recherche par titre est bornée à l'onglet ouvert — c'est ce que le
   placeholder promet (« Chercher dans mes films »), et une promesse d'écran se
   tient. Elle IGNORE en revanche le tri et les filtres de la barre : chercher
   un titre qu'on ne retrouve plus ne doit pas se heurter à un filtre posé dix
   minutes plus tôt et oublié depuis. */
function titresPf12(q){
  const n = normPf12(q);
  if(n.length < 2) return [];
  return (listesProfil()[ui.profTab] || [])
    .filter(x => normPf12(titrePf12(x)).indexOf(n) >= 0)
    .sort((a,b)=>{
      const pa = normPf12(titrePf12(a)).indexOf(n), pb = normPf12(titrePf12(b)).indexOf(n);
      return (pa - pb) || titrePf12(a).localeCompare(titrePf12(b), 'fr');
    })
    .slice(0, 18);
}

function avorterPf12(){
  clearTimeout(pf12Timer);
  pf12Seq++;
  if(pf12Abort){ try{ pf12Abort.abort(); }catch(e){} pf12Abort = null; }
}
function saisiePf12(v){
  pf12.q = v;
  clearTimeout(pf12Timer);
  const q = String(v == null ? '' : v).trim();
  if(q.length < 2){
    avorterPf12();
    pf12.pers = null; pf12.persEtat = ''; pf12.persErr = '';
    peindreProfil();
    return;
  }
  /* La section Titres est repeinte TOUT DE SUITE : elle n'a rien à attendre du
     réseau, et la faire patienter avec l'autre serait mentir sur son coût. */
  pf12.pers = null; pf12.persEtat = 'attente'; pf12.persErr = '';
  peindreProfil();
  pf12Timer = setTimeout(()=> chercherPersonnePf12(q), 320);
}
async function chercherPersonnePf12(q){
  const seq = ++pf12Seq;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  pf12Abort = ctrl;
  const sig = ctrl ? { signal:ctrl.signal } : null;
  try{
    const d = await tmdb('/search/multi', { query:q, include_adult:'false' }, sig);
    if(seq !== pf12Seq) return;
    const p = (d.results || [])
      .filter(x => x && x.media_type === 'person' && x.name)
      .sort((a,b)=> (b.popularity||0) - (a.popularity||0))[0];
    if(!p){ pf12.pers = null; pf12.persEtat = 'rien'; peindreProfil(); return; }
    /* La personne est nommée avant que sa filmographie soit là : le titre de
       section peut déjà dire QUI on a reconnu, et le rond continue de tourner. */
    pf12.pers = { id:p.id, nom:p.name, photo:p.profile_path || null,
                  charge:false, total:0, chez:[] };
    peindreProfil();
    const c = await tmdb('/person/'+p.id+'/combined_credits', null, sig);
    if(seq !== pf12Seq) return;
    const roles = rangerFilmographie(c);
    const chez = [];
    roles.forEach(r=>{
      const o = (r.media === 'tv') ? db.shows[r.id] : db.movies[r.id];
      if(o) chez.push({ m:r.media, o:o });
    });
    pf12.pers.charge = true;
    pf12.pers.total = roles.length;
    pf12.pers.chez = chez;
    pf12.persEtat = 'ok';
    peindreProfil();
  }catch(e){
    if((e && e.name === 'AbortError') || seq !== pf12Seq) return;
    pf12.pers = null; pf12.persEtat = 'err';
    pf12.persErr = (e && e.message === 'BADKEY') ? 'Service indisponible' : 'Pas de connexion';
    peindreProfil();
  }
}
function relancerPersonnePf12(){
  const q = String(pf12.q || '').trim();
  if(q.length < 2) return;
  pf12.persEtat = 'attente'; pf12.persErr = '';
  peindreProfil();
  chercherPersonnePf12(q);
}
/* Le compte du bouton est CALCULÉ, jamais approximé : ce que la personne a
   tourné moins ce qu'on en possède. */
function ouvrirActeurPf12(id){
  rangerRecentPf12();
  fermerRechPf12(true);
  if(typeof ouvrirActeur === 'function') ouvrirActeur(id);
}
function reprendreRecentPf12(q){
  saisiePf12(q);
  render();                                   // le champ doit porter le texte repris
  const i = document.getElementById('pf12q');
  if(i){ i.focus(); try{ i.setSelectionRange(q.length, q.length); }catch(e){} }
}

function ouvrirRechPf12(){
  pf12.ouvert = true;
  /* C3 — REVUE DU 07/08 : même entrée-garde que la feuille et le jeu (app-02) :
     le bouton retour du téléphone ferme la recherche au lieu de quitter l'app. */
  if(typeof poserGarde === 'function') poserGarde('pf12');
  pf12.yAvant = window.scrollY || 0;
  pf12.q = ''; pf12.pers = null; pf12.persEtat = ''; pf12.persErr = '';
  render();
  window.scrollTo(0, 0);
  const i = document.getElementById('pf12q');
  if(i) i.focus();
}
function fermerRechPf12(sansRendu){
  rangerRecentPf12();
  avorterPf12();
  pf12.ouvert = false;
  if(typeof retirerGarde === 'function') retirerGarde('pf12');   // C3
  pf12.q = ''; pf12.pers = null; pf12.persEtat = ''; pf12.persErr = '';
  if(sansRendu) return;
  render();
  window.scrollTo(0, pf12.yAvant || 0);
}

/* L'écran vide n'est pas blanc : il montre les dernières recherches, et il dit
   ce que chacune des deux sections coûte. */
function videRechPf12(){
  const r = lireRecentsPf12();
  let h = '';
  if(r.length)
    h += '<div class="sectitle">Tes dernières recherches</div>'+
      r.map(q => '<button class="pf12rec" onclick="reprendreRecentPf12(\''+escJs(q)+'\')">'+
        I.search+'<span>'+esc(q)+'</span>'+I.caret+'</button>').join('');
  h += '<div class="pf12note">La recherche par titre est instantanée : elle lit ta '+
       'bibliothèque, sans réseau. La recherche par personne, elle, doit demander sa '+
       'filmographie — elle arrive une seconde après.</div>';
  return h;
}
function sectionPersonnePf12(){
  const p = pf12.pers;
  if(!p){
    if(pf12.persEtat === 'attente')
      return '<div class="sectitle pf12sec">Personnes<span class="spin pf12spin"></span></div>';
    if(pf12.persEtat === 'err')
      return '<div class="sectitle pf12sec">Personnes</div>'+
        '<div class="pf12vide">'+esc(pf12.persErr)+'. Chercher une personne demande le '+
        'réseau — les titres ci-dessus, non. '+
        '<button class="lienplus" onclick="relancerPersonnePf12()">Réessayer</button></div>';
    return '';
  }
  if(!p.charge)
    return '<div class="sectitle pf12sec">Avec '+esc(p.nom)+'<span class="spin pf12spin"></span></div>'+
      '<div class="pf12qui"><span class="pf12rond">'+
        (p.photo ? posterEl(p.photo, 'w185', '', p.nom) : esc((p.nom||'?').charAt(0)))+'</span>'+
      '<span><b>'+esc(p.nom)+'</b><span>on cherche ce que tu as de lui…</span></span></div>';
  const reste = Math.max(0, p.total - p.chez.length);
  /* Les DEUX comptes dans le titre : ce que tu en as, et sur combien. Sans le
     second, « 6 » ne veut rien dire. */
  return '<div class="sectitle pf12sec pf12deux">'+
      '<span>Avec '+esc(p.nom)+'<span class="cnt">'+p.chez.length+'</span></span>'+
      '<span class="pq">sur '+p.total+' au total</span></div>'+
    (p.chez.length
      ? '<div class="pgrid pf12trois">'+p.chez.map(cartePf12).join('')+'</div>'
      : '<div class="pf12vide">Rien de cette personne dans ta bibliothèque.</div>')+
    (reste
      ? '<button class="pf12filmo" onclick="ouvrirActeurPf12('+Number(p.id)+')">'+
        'Voir sa filmographie · '+reste+' titre'+(reste>1?'s':'')+' que tu n’as pas →</button>'
      : '');
}
function corpsRechPf12(){
  const q = String(pf12.q || '').trim();
  if(q.length < 2) return videRechPf12();
  const t = titresPf12(q);
  /* La section Titres garde sa place pleine même quand elle ne trouve presque
     rien. La réduire à une ligne dès qu'une personne se dessine est une piste
     NON TRANCHÉE : elle n'est délibérément pas implémentée ici. */
  let h = '<div class="sectitle pf12sec">Titres<span class="cnt">'+t.length+'</span></div>';
  h += t.length
    ? '<div class="pgrid pf12trois">'+t.map(cartePf12).join('')+'</div>'
    : '<div class="pf12vide">Aucun titre de '+esc(PF12_OU[ui.profTab] || 'ta bibliothèque')+
      ' ne s’appelle comme ça.</div>';
  return h + sectionPersonnePf12() + '<div style="height:26px"></div>';
}
function ecranRechPf12(){
  const ou = PF12_OU[ui.profTab] || 'ma bibliothèque';
  return '<div class="pf12plein">'+
    '<div class="pf12champ">'+
      '<div class="pf12z">'+I.search+
        '<input type="search" id="pf12q" enterkeyhint="search" autocomplete="off" '+
          'autocorrect="off" autocapitalize="off" spellcheck="false" '+
          'placeholder="Chercher dans '+esc(ou)+'" value="'+esc(pf12.q)+'" '+
          'oninput="saisiePf12(this.value)" '+
          'onkeydown="if(event.key===\'Enter\')this.blur()">'+
      '</div>'+
      '<button class="pf12an" onclick="fermerRechPf12()">Annuler</button>'+
    '</div>'+
    '<div id="pf12res">'+corpsRechPf12()+'</div>'+
  '</div>';
}

/* ---------------------------------------------------------------------------
   LE REPEINT PARTIEL — même modèle que `peindreDisc` et `peindreRech`

   Ce que ça évite : `render()` refait `viewProfile` en entier, donc la boucle
   sur ~7 000 épisodes qui calcule les trois chiffres de l'en-tête (18 ms poste
   de bureau, ~55 ms iPhone). Or changer de puce, d'ordre ou de filtre ne touche
   QUE la grille : ces trois chiffres ne bougent pas.
   `entrerRendu`/`sortirRendu` encadrent le repeint pour que `progress`,
   `isFinished` et `lastWatchedAt` gardent leur mémo — sans quoi on aurait
   déplacé le coût au lieu de le supprimer.
--------------------------------------------------------------------------- */
function peindreProfil(){
  if(view !== 'profile') return;
  if(pf12.ouvert){
    const r = document.getElementById('pf12res');
    if(!r) return render();
    entrerRendu();
    try{ r.innerHTML = corpsRechPf12(); } finally { sortirRendu(); }
    return;
  }
  const z = document.getElementById('pfcards');
  if(!z) return render();
  entrerRendu();
  try{ z.innerHTML = barreProfil() + cartesProfil(); } finally { sortirRendu(); }
  const ch = document.getElementById('pfchips');
  if(ch) ch.querySelectorAll('.chip').forEach(b =>
    b.classList.toggle('on', b.getAttribute('data-tab') === ui.profTab));
}
function setTabProfil(t){
  if(ui.profTab === t) return;
  ui.profTab = t;
  peindreProfil();
}
function setAvoirTriPf12(t){
  if(ui.avoirTri === t) return;
  ui.avoirTri = t;
  peindreProfil();
}

function cartesProfil(){
  const onglet = ui.profTab;
  let base = listesProfil()[onglet] || [];
  let h = '';
  if(onglet === 'avoir'){
    /* « À voir » mélange séries et films : un petit filtre permet de ne garder
       que l'un des deux. Il n'apparaît que s'il y a effectivement les deux. */
    const nbS = base.filter(x => x.m === 'tv').length;
    const nbF = base.length - nbS;
    const quoi = ui.avoirTri || 'tout';
    if(nbS && nbF)
      h += '<div class="souschips">'+
        [['tout','Tout',base.length],['series','Séries',nbS],['films','Films',nbF]].map(([id,l,n])=>
          '<button class="chip '+(quoi===id?'on':'')+'" onclick="setAvoirTriPf12(\''+escJs(id)+'\')">'+
          esc(l)+' <span style="opacity:.65">'+n+'</span></button>').join('')+'</div>';
    if(!base.length)
      return h + emptyProf('Rien en attente',
        'Les séries ajoutées mais pas commencées et les films « à voir » se rangent ici.');
    base = base.filter(x => quoi === 'tout' ? true
                          : quoi === 'series' ? x.m === 'tv' : x.m === 'movie');
    if(!base.length)
      return h + emptyProf(quoi === 'series' ? 'Aucune série en attente' : 'Aucun film en attente',
        'Change de filtre juste au-dessus.');
  } else if(!base.length){
    if(onglet === 'series')
      return emptyProf('Aucune série commencée', 'Coche un épisode et la série apparaîtra ici.');
    if(onglet === 'films')
      return emptyProf('Aucun film vu', 'Marque un film comme vu depuis la recherche.');
    return emptyProf('Aucune série en pause', 'Une série mise de côté se range ici, sans rien perdre.');
  }
  const l = trierPf12(base.filter(passeFiltresPf12), onglet);
  /* Un filtre qui vide la grille doit se DÉFAIRE depuis la grille : renvoyer
     chercher la feuille pour comprendre pourquoi l'écran est vide, c'est le
     genre de cul-de-sac que le point 12 corrige ailleurs. */
  if(!l.length)
    return h + '<div class="empty" style="padding:38px 24px">'+
      '<h3>Aucun titre ne passe tes filtres</h3>'+
      '<p>Deux critères se croisent rarement. Retires-en un, ou repars de zéro.</p>'+
      '<button class="btn ghost" onclick="viderFiltresPf12(1)">Tout afficher</button></div>';
  return h + '<div class="pgrid">'+l.map(cartePf12).join('')+'</div>';
}

function viewProfile(){
  /* La recherche prend tout l'écran : rien d'autre n'est peint. */
  if(pf12.ouvert) return ecranRechPf12();

  let epCount = 0, minutes = 0, doneShows = 0;
  Object.values(db.shows).forEach(s=>{
    allEpisodes(s,true).forEach(ep=>{
      if(s.watched[key(ep.s,ep.e)]){ epCount++; minutes += epRuntime(s,ep); }
    });
    if(isFinished(s)) doneShows++;
  });
  Object.values(db.movies).filter(m=>m.seen).forEach(m=> minutes += (m.runtime||100));

  const L = listesProfil();
  /* RETOUR-02 POINT 4 — la puce « Animés » s'AJOUTE, juste après « Séries ».
     L'ordre d'avant ne bouge pas : Séries en premier, c'est l'usage principal.
     Elle n'apparaît QUE s'il y a des animés — comme « En pause », et pour la
     même raison : une puce à zéro n'est pas une information, c'est une porte
     vers un écran vide. */
  const tabs = [['series','Séries',L.series.length]];
  if(L.animes.length) tabs.push(['animes','Animés',L.animes.length]);
  tabs.push(['films','Films',L.films.length],
            ['avoir','À voir',L.avoir.length]);
  if(L.pause.length) tabs.push(['pause','En pause',L.pause.length]);
  /* la puce « En pause » disparaît quand la dernière série reprend : on ne laisse pas
     l'onglet sélectionné pointer dans le vide */
  if(!tabs.some(t=>t[0]===ui.profTab)) ui.profTab = 'series';

  /* ---------------------------------------------------------------------
     L'en-tête façon Instagram, voulu par Adrien : photo à gauche, compteurs
     à droite, prénom, une ligne de stats, puis les puces et les jaquettes.

     Le fond est fait de TES affiches, floutées : le profil devient la fiche
     de ta bibliothèque, et il est différent chez chacun. Sans affiche, on
     retombe sur un dégradé sobre plutôt que sur un trou noir.

     LE COMPTEUR DE SÉRIES A ÉTÉ RETIRÉ le 02/08 (point 12, décision A) : il
     comptait `db.shows` en entier et contredisait de trente unités la puce
     « Séries » posée juste dessous, qui écarte `avoir` et `pause`.
  --------------------------------------------------------------------- */
  const qui = (db.pseudo||'').trim();
  const nbAbonnes = (partage.abonnes||[]).length;
  const nbAbos = (partage.suivis||[]).length;

  const affiches = Object.values(db.shows).map(x=>x.poster).filter(Boolean).slice(0,5);
  const fond = affiches.length
    ? '<div class="pfond">'+affiches.map(p=>
        /* Dans une url() de CSS : une apostrophe ou une parenthèse suffirait à
           sortir de la déclaration. On filtre AVANT de composer. */
        '<i style="background-image:url('+srcImage(p,'w154')+')"></i>').join('')+'</div>'
    : '<div class="pfond uni"></div>';

  const compteur = (n, mot, action)=>
    '<button class="pcompt"'+(action?' onclick="'+action+'"':'')+'>'+
      '<b>'+n+'</b><span>'+mot+'</span></button>';

  let html = header('Mon profil', {
    /* Un engrenage plutôt que trois points : il mène à un écran, pas à un menu
       flottant, et son sens est immédiat. */
    right:'<button class="iconbtn" onclick="go(\'settings\',{from:\'profile\'})" '+
      'aria-label="Réglages">'+I.cog+'</button>'
  });

  html += '<div class="phero">'+fond+'<div class="pdevant">'+
    '<div class="phaut">'+
      '<button class="panneau" onclick="go(\'moi\',{from:\'profile\'})" aria-label="Changer d\'avatar">'+
        avatarMoi('gros')+'</button>'+
      '<div class="pcompts">'+
        compteur(nbAbonnes, 'abonné'+(nbAbonnes>1?'s':''), 'ouvrirAbos()') +
        compteur(nbAbos, 'abonnement'+(nbAbos>1?'s':''), 'ouvrirAbos()') +
      '</div>'+
    '</div>'+
    '<div class="pnom">'+(qui ? esc(qui) : 'Ton profil')+'</div>'+
    '<div class="pstats">'+epCount+' épisode'+(epCount>1?'s':'')+' · '+
      fmtDurShort(minutes)+' de visionnage · '+doneShows+' série'+(doneShows>1?'s':'')+
      ' finie'+(doneShows>1?'s':'')+'</div>'+
  '</div></div>';

  /* SPEC-06 §4.1 — LA CARTE DU DUEL, EN TÊTE DE MON PROFIL. Elle vient juste
     après l'en-tête et le bloc d'identité, au-dessus des entrées existantes :
     c'est ce que la maquette 14 montre. `carteDuelProfil` rend '' quand aucune
     famille n'est jouable — l'écran est alors exactement celui d'avant.
     Le bloc Duel de Mes goûts, lui, reste où il est (§0.6). */
  if(typeof carteDuelProfil === 'function') html += carteDuelProfil();
  html += ligneCerclePf12();

  html += '<div class="chips" id="pfchips" style="padding-top:12px">'+tabs.map(([id,l,n])=>
    '<button class="chip '+(ui.profTab===id?'on':'')+'" data-tab="'+esc(id)+'" '+
    'onclick="setTabProfil(\''+escJs(id)+'\')">'+
    esc(l)+' <span style="opacity:.65">'+n+'</span></button>').join('')+'</div>';

  /* Le nœud identifié : la barre et la grille, et rien d'autre. C'est tout ce
     que `peindreProfil` réécrit. */
  return html + '<div id="pfcards">'+ barreProfil() + cartesProfil() +'</div>'+
    '<div style="height:26px"></div>';
}

function emptyProf(title, sub){
  return '<div class="empty" style="padding:38px 24px"><h3>'+esc(title)+'</h3><p>'+esc(sub)+'</p>'+
    '<button class="btn ghost" onclick="go(\'discover\')">Ouvrir la recherche</button></div>';
}

function showCard(s){
  const p = progress(s);
  const full = p.total>0 && p.watched===p.total;
  const st = statutSerie(s);
  const sub = st==='pause'
      ? 'En pause · '+p.watched+'/'+p.total
      : st==='avoir'
      ? (p.total ? p.total+' épisode'+(p.total>1?'s':'') : 'Pas encore diffusée')
      : (full ? (isFinished(s)?'Terminée':'À jour') : p.pct+'%');
  return '<div class="pcard">'+
    '<div class="ptap" onclick="go(\'show\',{id:'+s.id+',from:\'profile\'})">'+
      '<div class="wrapimg">'+posterEl(s.poster,'w342','',s.name)+
        (st!=='avoir' && p.total ? '<div class="pbadge '+(full?'done':'')+'">'+p.watched+'/'+p.total+'</div>' : '')+
        (st!=='avoir' ? '<div class="pbar"><i class="'+(full?'full':'')+'" style="width:'+p.pct+'%"></i></div>' : '')+
      '</div>'+
      '<div class="pname">'+esc(s.name)+'</div>'+
      '<div class="psub">'+sub+'</div>'+
    '</div>'+
  '</div>';
}

function movieCard(m){
  return '<div class="pcard">'+
    '<div class="ptap" onclick="go(\'movie\',{id:'+m.id+',from:\'profile\'})">'+
      '<div class="wrapimg">'+posterEl(m.poster,'w342','',m.title)+
        (statutFilm(m)==='vu' ? '<div class="pbadge done">vu</div>' : '')+
      '</div>'+
      '<div class="pname">'+esc(m.title)+'</div>'+
      '<div class="psub">'+esc(year(m.date))+'</div>'+
    '</div>'+
  '</div>';
}

function ouvrirAbos(){
  go('abos', {from:'profile'});
  if(signedIn()) chargerPartage();
}
/* L'ancien menu ⋮ a été supprimé le 28/07 : il doublait l'écran Réglages
   (mêmes actions, noms différents) et, en tant que panneau flottant, ne laissait
   nulle part où revenir après en avoir ouvert une entrée. Tout est passé dans
   `viewSettings`, atteignable par le bandeau du profil et par l'engrenage. */

/* Depuis quand cette bibliothèque existe : le plus ancien titre ajouté. */
function plusAnciennementAjoute(){
  let min = 0;
  [].concat(Object.values(db.shows), Object.values(db.movies)).forEach(o=>{
    const t = o && o.addedAt;
    if(t && t > 1000000000000 && (!min || t < min)) min = t;
  });
  if(!min) return '';
  const d = new Date(min);
  return MOIS[d.getMonth()]+' '+d.getFullYear();
}

/* ---------- Vue : mon profil, en modification ---------- */
/* ---------- L'avatar ----------
   Une photo OU une couleur et un emblème : jamais les deux superposés.
   Le même bloc sert dans « Mon profil » et dans l'étape qui suit la création
   du compte, pour que les deux ne divergent jamais. */
function ongletsAvatar(){
  const photo = !!(db.profil && db.profil.photo);
  return '<div class="fchips" style="justify-content:center;margin-bottom:20px">'+
    '<button class="chip'+(photo?'':' on')+'" onclick="modeAvatar(\'embleme\')">Couleur et emblème</button>'+
    '<button class="chip'+(photo?' on':'')+'" onclick="modeAvatar(\'photo\')">Une photo</button>'+
  '</div>';
}
function blocAvatar(){
  const p = db.profil || {};
  if(ui.avatarOnglet === 'photo' || (ui.avatarOnglet !== 'embleme' && p.photo)){
    return '<input type="file" id="avfic" accept="image/*" style="display:none" '+
             'onchange="choisirPhoto(this)">'+
           '<button class="btn ghost block" style="margin-bottom:10px" '+
             'onclick="document.getElementById(\'avfic\').click()">'+
             (p.photo ? 'Changer de photo' : 'Choisir une photo')+'</button>'+
           (p.photo
             ? '<button class="btn ghost block danger" onclick="retirerPhoto()">Retirer la photo</button>'
             : '')+
           '<div class="tiny muted center" style="padding:14px 6px 0">La photo est réduite à '+
           AVATAR_PX+' pixels et recadrée en carré avant d\'être enregistrée : elle pèse quelques '+
           'kilo-octets et part avec ta sauvegarde.</div>';
  }
  return '<div class="fgrp">Couleur</div>'+
    '<div class="pastilles">'+COULEURS_PROFIL.map(c=>
      '<button class="past '+(profilCouleur(p.couleur).id===c.id?'on':'')+'" title="'+esc(c.nom)+'" '+
        'aria-label="'+esc(c.nom)+'" onclick="choisirCouleur(\''+c.id+'\')" '+
        'style="background:linear-gradient(135deg,'+c.a+','+c.b+')"></button>').join('')+'</div>'+
    '<div class="fgrp">Emblème</div>'+
    '<div class="emblemes">'+EMBLEMES.map(e=>{
      const lettre = (db.pseudo||'?').trim().charAt(0).toUpperCase() || '?';
      const dedans = e.id === 'lettre' ? '<b>'+esc(lettre)+'</b>' : (I[e.id]||'');
      return '<button class="embl '+((p.embleme||'lettre')===e.id?'on':'')+'" title="'+esc(e.nom)+'" '+
        'aria-label="'+esc(e.nom)+'" onclick="choisirEmbleme(\''+e.id+'\')">'+dedans+'</button>';
    }).join('')+'</div>';
}
/* B12 (09/08) — TOUT CE QUI REDESSINE « MODIFIER MON PROFIL » MET D'ABORD LE
   PRÉNOM SAISI À L'ABRI. `viewMoi` reconstruit le champ `#mpseudo` depuis
   `db.pseudo` ; or la frappe n'écrit que dans le DOM (`apercuPseudo` ne touche
   pas la base, exprès, pour ne pas voler le focus). `choisirCouleur` et
   `choisirEmbleme` appelaient donc `gardePseudoSaisi()` avant leur `render()` —
   mais pas `modeAvatar`, `choisirPhoto` ni `retirerPhoto`. Taper « Adrien »
   puis toucher l'onglet « Une photo » effaçait la saisie, sans un mot.
   RÈGLE : toute fonction de cet écran qui appelle `render()` appelle
   `gardePseudoSaisi()` avant. Contrôle : les six fonctions listées ici. */
function modeAvatar(m){ gardePseudoSaisi(); ui.avatarOnglet = m; render(); }

async function choisirPhoto(input){
  gardePseudoSaisi();                     // B12 — avant tout `render()`
  const f = input && input.files && input.files[0];
  input.value = '';                       // pour pouvoir reprendre la même photo
  if(!f) return;
  try{
    const donnee = await photoVersAvatar(f);
    db.profil = Object.assign({}, db.profil, { photo: donnee });
    toucheProfil();
    ui.avatarOnglet = 'photo';
    saveDB(); render();
    if(signedIn()) majProfil();
  }catch(e){ toast('Cette image n\'a pas pu être lue'); }
}
function retirerPhoto(){
  gardePseudoSaisi();                     // B12
  db.profil = Object.assign({}, db.profil, { photo: null });
  toucheProfil();
  ui.avatarOnglet = 'embleme';
  saveDB(); render();
  if(signedIn()) majProfil();
}

/* L'étape qui suit la création d'un compte. On peut la passer : un avatar
   n'est pas une condition pour se servir de l'app. */
function viewAvatar(){
  return '<div class="wrap" style="padding-top:46px">'+
    '<div class="intro" style="margin-bottom:22px">'+
      '<div class="apercu">'+avatarMoi('geant')+'</div>'+
      '<h2 style="margin-top:14px">Ton avatar</h2>'+
      '<p>C\'est ce que verront les proches à qui tu partages ta bibliothèque. '+
      'Tu pourras le changer quand tu veux.</p>'+
    '</div>'+
    ongletsAvatar()+
    blocAvatar()+
    '<button class="btn block" style="margin-top:24px" onclick="finirAvatar()">Continuer</button>'+
    '<button class="tiny muted" style="display:block;width:100%;text-align:center;padding:14px 8px" '+
      'onclick="finirAvatar()">Passer cette étape</button>'+
  '</div>';
}
/* D2 — un écran vide comme premier écran ne donne rien à faire. Tant qu'il n'y
   a rien à suivre, on atterrit sur Découvrir, où il y a quelque chose à
   regarder et à ajouter. */
const ecranDArrivee = ()=>
  (Object.keys(db.shows).length + Object.keys(db.movies).length) ? 'follow' : 'discover';

function finirAvatar(){
  saveDB();
  if(signedIn()) majProfil();
  /* D3 — l'inscription s'arrête ici. Elle passait par « Mes goûts » (38 puces)
     puis par « Mes plateformes », soit deux questionnaires posés AVANT d'avoir
     montré le moindre titre. Le commentaire d'ouverture d'app-11 disait déjà
     vouloir éviter « un questionnaire à l'inscription [qui] exigerait un effort
     avant d'avoir rien rendu » : le code contredisait sa propre doctrine.
     Les deux écrans restent accessibles depuis les Réglages, et une carte les
     propose sur Découvrir une fois la bibliothèque garnie (`carteInvitGouts`). */
  /* LOT C — l'inscription ne s'arrête plus à l'avatar. D3 avait raison de
     supprimer les deux questionnaires qui suivaient : « Mes goûts » et « Mes
     plateformes » demandaient un effort AVANT d'avoir rien rendu. Ce qui les
     remplace n'est pas un questionnaire de plus — c'est une grille de
     jaquettes qui se répond à la reconnaissance, et dont les deux écrans
     suivants sont PRÉ-REMPLIS. On corrige, on ne compose pas. La doctrine
     d'app-11 est respectée, pas contournée.
     `demarrerInscription` vit dans app-13 ; s'il n'est pas là, on retombe
     exactement sur le comportement d'avant. */
  if(typeof demarrerInscription === 'function') return demarrerInscription();
  go(ecranDArrivee());
}

/* ===================== D1 — l'écran de présentation ===================== */
/* Trois lignes sur ce que fait l'app, une phrase sur le pourquoi du compte, et
   trois affiches. Pas de capture d'écran : montrer l'app dans l'app est une
   mise en abyme qui n'apprend rien. Sans réseau, l'écran tient sans elles. */
let presAffiches = { etat:'froid', l:[] };
async function chargerPresAffiches(){
  if(presAffiches.etat !== 'froid') return;
  presAffiches.etat = 'attente';
  try{
    /* PAS `/trending` : ce chemin n'est pas dans la liste blanche du relais et
       renvoie 404 — vérifié en production. Et de toute façon, trois affiches
       décoratives doivent être RECONNAISSABLES : on prend les films les plus
       votés de tous les temps, pas le buzz de la semaine. */
    const d = await tmdb('/discover/movie', { sort_by:'vote_count.desc', 'vote_count.gte':5000, page:1 });
    const l = ((d && d.results) || []).filter(r=>r.poster_path).slice(0,3)
                .map(r=>r.poster_path);
    presAffiches = { etat:'ok', l:l };
  }catch(e){
    /* Volontairement muet : l'écran doit rester utilisable sans image, et
       afficher une erreur pour trois affiches décoratives serait absurde. */
    presAffiches = { etat:'ok', l:[] };
  }
  if(view === 'bienvenue') render();
}

function viewBienvenue(){
  if(presAffiches.etat === 'froid') setTimeout(()=>chargerPresAffiches(), 0);
  const aff = presAffiches.l;
  return '<div class="wrap bienv">'+
    (aff.length
      ? '<div class="bvaff">'+aff.map((a,i)=>{
          const src = srcImage(a,'w342');
          return src ? '<img class="bva bva'+i+'" src="'+src+'" alt="">' : '';
        }).join('')+'</div>'
      : '<div class="bvlogo">'+I.tv+'</div>')+
    '<h1 class="bvtitre">Mes Séries</h1>'+
    '<ul class="bvlist">'+
      '<li>Sache où tu en es dans chaque série, épisode par épisode.</li>'+
      '<li>Vois ce qui sort, et quand.</li>'+
      '<li>Trouve quoi regarder ce soir, sur tes plateformes.</li>'+
    '</ul>'+
    '<p class="bvpourquoi">Le compte sert à retrouver ta bibliothèque sur ton '+
      'téléphone et ton iPad, et à la partager avec tes proches.</p>'+
    '<div class="bvbas">'+
      '<button class="btn block" onclick="commencerPresentation(\'creer\')">Commencer</button>'+
      '<button class="tiny muted" style="display:block;width:100%;text-align:center;padding:12px 8px 2px" '+
        'onclick="commencerPresentation(\'connexion\')">J\'ai déjà un compte</button>'+
    '</div>'+
  '</div>';
}

function commencerPresentation(mode){
  /* Une fois vu, jamais revu — y compris si la création est abandonnée en
     cours de route : la personne sait désormais ce qu'est l'app. */
  db.vuPresentation = true; saveDB();
  ui.acMode = mode;
  go('account', {}, 'enter', { remplacer:true });
}

function viewMoi(){
  let html = header('Mon profil', {back:"goBack()"});
  html += '<div class="wrap">'+
    '<div class="apercu">'+avatarMoi('geant')+
      '<div class="enom" style="margin-top:12px">'+
        ((db.pseudo||'').trim() ? esc(db.pseudo) : 'Sans prénom')+'</div>'+
    '</div>'+
    '<label class="fld"><span>Ton prénom</span>'+
      '<input type="text" id="mpseudo" value="'+esc(db.pseudo||'')+'" placeholder="Adrien" '+
      'autocomplete="given-name" oninput="apercuPseudo(this.value)">'+
      '<em>C\'est ce que voient les personnes qui te suivent. Tu peux laisser vide.</em></label>'+
    ongletsAvatar()+
    blocAvatar()+
    '<button class="btn block" style="margin-top:22px" onclick="enregistrerProfil()">Enregistrer</button>'+
  '</div>';
  return html + '<div style="height:30px"></div>';
}
/* L'aperçu suit la frappe, mais on ne réécrit pas l'écran : le champ perdrait le focus. */
function apercuPseudo(v){
  const nom = document.querySelector('.apercu .enom');
  if(nom) nom.textContent = v.trim() || 'Sans prénom';
  const p = db.profil || {};
  /* Une photo ne suit pas le prénom : seule l'initiale change en direct. */
  if(!p.photo && (p.embleme || 'lettre') === 'lettre'){
    const av = document.querySelector('.apercu .avatar');
    if(av) av.textContent = (v.trim().charAt(0) || '?').toUpperCase();
  }
}
/* B8 — l'avatar suit le compte, pas l'appareil : il est daté comme les goûts.
   Sans ça, changer de téléphone rendait la couleur par défaut à l'écran pendant
   que les proches continuaient de voir l'ancienne — elle vit dans la table
   `profils`, elle, et n'était donc pas revenue en arrière. */
function toucheProfil(){
  db.profil = Object.assign({}, db.profil, { maj: Date.now() });
  saveDB();
}

function choisirCouleur(id){
  db.profil = Object.assign({}, db.profil, { couleur:id });
  toucheProfil(); gardePseudoSaisi(); render();
}
function choisirEmbleme(id){
  db.profil = Object.assign({}, db.profil, { embleme:id });
  toucheProfil(); gardePseudoSaisi(); render();
}
/* Choisir une couleur redessine l'écran : on n'y perd pas le prénom en cours de saisie. */
function gardePseudoSaisi(){
  const el = document.getElementById('mpseudo');
  if(el) db.pseudo = el.value.trim();
}
function enregistrerProfil(){
  gardePseudoSaisi();
  saveDB();
  if(typeof majProfil === 'function' && signedIn()) majProfil();
  toast('Profil enregistré');
  goBack();
}
