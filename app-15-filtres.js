"use strict";
/* ================= LA RECHERCHE NOUVELLE GÉNÉRATION — SPEC-05 =================

   Écrit le 10/08/2026, lot A (le socle sans IA).

   CE FICHIER NE CONTIENT AUCUN MOTEUR. Le §7 de la spec est catégorique : « la
   MÉCANIQUE (état des critères, compteur vivant, flux multi-étages) est
   CONSERVÉE ; seul le RENDU change. Ne pas réécrire le moteur de flux
   d'app-12. » Tout ce qui suit lit `ui.rech` par les accesseurs d'app-12
   (`etatRech`, `listeRech`, `poserMotRech`, `relancerRech`, `critereRech`) et
   dessine par-dessus. Une seule requête TMDB n'est déclenchée d'ici, et encore :
   par `relancerRech`, celle qui existait déjà.

   Ce qu'il apporte, dans l'ordre de la spec :
     §1  la feuille « ⚙ Filtres » en accordéon — SUR-ENSEMBLE STRICT de ce que
         « + préciser » savait faire, plus trois critères neufs ;
     §2  les ambiances : des filtres nommés, enregistrés dans les goûts,
         réactivables d'un appui, synchronisés comme un sous-bloc de SPEC-01 C4 ;
     §5  les pilules compactes qui remplacent la grande phrase, la carte du
         meilleur match, le tri « mes goûts » local avec ses raisons ;
     §4  le mode duo — « avec {proche} » — 100 % local, zéro requête.

   L'onglet « ✦ Décris-la » de la création d'ambiance et la carte « Pourquoi il
   te correspond » appartiennent au lot B (les tâches IA). Ce fichier les
   prévoit (`iaRechDispo`) sans les contenir. */

/* =========================== LES AMBIANCES (§2) =========================== */

/* Plafond de la spec. Douze, c'est déjà beaucoup pour une rangée qu'on
   parcourt d'un pouce ; au-delà, ce n'est plus un raccourci. */
const AMB_MAX = 12;
const AMB_EMOJIS = ['✨','🌙','🍜','🔥','🧊','🎬','☕','🛋','⚡','🌧','🎯','🧠'];

/* La forme d'une ambiance :
     { id, emoji, nom, regles, creeLe }
   `regles` REPREND LES IDENTIFIANTS DES TABLES DU §1 — pas un format
   parallèle, c'est écrit noir sur blanc dans la spec. Concrètement, les mêmes
   clés que `ui.rech` : fam, genre[], origine[], epoque[], duree[], plate[],
   note, pasvu, statut, gore, avec, amb (une tuile d'envie mesurée), tri.
   Conséquence heureuse : `critereRech` sait les lire sans traduction. */
function ambianceRegles(o){
  const g = (o && typeof o === 'object') ? o : {};
  const l = c => Array.isArray(g[c]) ? g[c].slice() : [];
  return { fam: g.fam || 'tout', genre: l('genre'), origine: l('origine'),
           epoque: l('epoque'), duree: l('duree'), plate: l('plate'),
           note: g.note || null, pasvu: g.pasvu || null, statut: g.statut || null,
           gore: g.gore || null, avec: g.avec || null, amb: g.amb || null,
           tri: g.tri === 'gouts' ? 'gouts' : 'note' };
}

function idAmbianceNeuve(){
  /* Un identifiant qui ne dépend pas de l'horloge seule : deux ambiances créées
     dans la même milliseconde sur deux appareils se fusionneraient en une. */
  return 'a' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
}

function enregistrerAmbiance(a){
  if(!db.gouts) return null;
  if(!Array.isArray(db.gouts.ambiances)) db.gouts.ambiances = [];
  const l = db.gouts.ambiances;
  const i = l.findIndex(x => x && x.id === a.id);
  if(i >= 0) l[i] = a;
  else{
    if(l.length >= AMB_MAX){ toast('12 ambiances au maximum — supprime-en une'); return null; }
    l.push(a);
  }
  toucheGouts('ambiances');
  return a;
}

function supprimerAmbiance(id){
  if(!db.gouts || !Array.isArray(db.gouts.ambiances)) return;
  const r = etatRech();
  db.gouts.ambiances = db.gouts.ambiances.filter(x => x && x.id !== id);
  if(r.ambiance === id) r.ambiance = null;
  toucheGouts('ambiances');
  relancerRech();
}

/* Un appui active, un second désactive (§2). Rien d'autre ne bouge : les
   filtres ponctuels posés à la main restent posés, ils se CUMULENT avec elle. */
function basculerAmbiance(id){
  const r = etatRech();
  const a = ambianceEnregistree(id);
  if(!a) return;
  const avant = r.ambiance;
  r.ambiance = (avant === id) ? null : id;
  r.touche = true;
  /* La famille fait partie de l'ambiance : la poser fait partie de l'activer.
     La retirer ne remet PAS l'ancienne famille — on ne devine pas d'où on
     vient, et changer de famille sous le doigt serait la pire des surprises. */
  if(r.ambiance && a.regles && a.regles.fam) r.fam = a.regles.fam;
  /* RÉSERVE DE RELECTURE — activer une ambiance n'écrase PLUS durablement le
     tri mémorisé. `poserTriRech` écrit en localStorage, et `ambianceRegles(null)`
     met `tri:'note'` par défaut : une ambiance créée sans y penser remettait
     donc le tri de tout le monde à « note », pour toujours. Le §7 promet que
     « le dernier choix est mémorisé » — le dernier choix de la PERSONNE. */
  relancerRech();
  if(r.ambiance) toast(a.emoji + ' ' + a.nom);
}

/* La rangée sous la barre. Elle n'apparaît QUE s'il y a quelque chose à
   montrer : une rangée avec un seul « ＋ » serait une invitation, et l'app n'en
   fait pas. */
function rangeeAmbiancesRech(){
  const r = etatRech();
  const l = ambiancesEnregistrees();
  /* CORRECTION DE RELECTURE — sans aucune ambiance enregistrée, dès qu'un filtre
     était posé la rangée tombait sur un « ＋ » seul : exactement le « ＋
     orphelin » que le commentaire disait vouloir éviter. Tant qu'il n'y a rien
     à ranger, c'est l'invitation nommée qui reste. */
  if(!l.length) return blocAmorceAmbianceRech();
  return '<div class="ambr" data-rail="amb-perso">'+
    l.map(a=>
      '<button class="preset'+(r.ambiance === a.id ? ' on' : '')+'" '+
        'onclick="basculerAmbiance(\''+escJs(a.id)+'\')" '+
        'oncontextmenu="return gererAmbiance(\''+escJs(a.id)+'\')">'+
        esc(a.emoji + ' ' + a.nom) + (r.ambiance === a.id ? ' ✕' : '') +
      '</button>').join('')+
    '<button class="preset plus" onclick="ouvrirCreaAmbiance(null)" aria-label="Nouvelle ambiance">＋</button>'+
    (l.length ? '<button class="preset plus" onclick="ouvrirGestionAmbiances()" '+
                'aria-label="Gérer mes ambiances">⋮</button>' : '')+
  '</div>';
}

/* Le premier jour, la rangée serait vide. Plutôt qu'un « ＋ » orphelin, une
   ligne qui dit ce que c'est — une fois, et elle disparaît dès qu'on compose
   quelque chose ou qu'une ambiance existe. */
function blocAmorceAmbianceRech(){
  return '<div class="ambr" data-rail="amb-perso">'+
    '<button class="preset plus" onclick="ouvrirCreaAmbiance(null)">＋ Créer une ambiance</button>'+
  '</div>';
}

function gererAmbiance(id){
  ouvrirCreaAmbiance(id);
  return false;      // on remplace le menu contextuel du navigateur
}

function ouvrirGestionAmbiances(){
  const l = ambiancesEnregistrees();
  if(!l.length) return;
  openSheet('<h3>Mes ambiances</h3>'+
    '<div class="choix">'+ l.map(a=>
      '<button onclick="closeSheet();ouvrirCreaAmbiance(\''+escJs(a.id)+'\')">'+
        esc(a.emoji+' '+a.nom)+'</button>').join('')+'</div>'+
    '<div class="wrap tiny muted" style="padding:10px 0 0">'+
      'Touche une ambiance pour la renommer, la modifier ou la supprimer.</div>', 'amb-gest');
}

/* ------------------------- La feuille de création ------------------------- */

/* Le brouillon vit hors de `ui.rech` : ce n'est pas une recherche, c'est un
   objet en cours d'écriture. Il meurt avec la feuille. */
let brouillonAmb = null;

function ouvrirCreaAmbiance(id, depuisFiltres){
  const a = id ? ambianceEnregistree(id) : null;
  const r = etatRech();
  brouillonAmb = a
    ? { id:a.id, emoji:a.emoji, nom:a.nom, regles:ambianceRegles(a.regles),
        source:'existante', neuve:false }
    : { id:idAmbianceNeuve(),
        emoji:AMB_EMOJIS[ambiancesEnregistrees().length % AMB_EMOJIS.length],
        nom:'Mon ambiance',
        /* « Depuis mes filtres » et « à partir de ma recherche » sont le même
           geste vu de deux endroits (§2) : on recopie la sélection COURANTE,
           celle que la personne vient de composer. */
        regles: depuisFiltres ? reglesDepuisSelectionRech() : ambianceRegles(null),
        source: depuisFiltres ? 'filtres' : 'main', neuve:true };
  peindreCreaAmbiance();
}

function reglesDepuisSelectionRech(){
  const r = etatRech();
  return ambianceRegles({ fam:r.fam, genre:listeRech('genre'), origine:listeRech('origine'),
                          epoque:listeRech('epoque'), duree:listeRech('duree'),
                          plate:listeRech('plate'), note:r.note, pasvu:r.pasvu,
                          statut:r.statut, gore:r.gore, avec:r.avec, amb:r.amb,
                          tri:triRech() });
}

const AMB_SOURCES = { main:'réglé à la main', filtres:'repris de tes filtres',
                      existante:'', ia:'✦ déduit de ta description',
                      modifie:'modifié par toi' };

function peindreCreaAmbiance(){
  const b = brouillonAmb;
  if(!b) return;
  const src = AMB_SOURCES[b.source] || '';
  /* Le §2 réclame DEUX onglets. Au lot A, celui de l'IA n'a rien derrière lui :
     plutôt qu'un onglet mort ou un mensonge, on ne l'affiche pas tant que
     l'interrupteur « IA de la Recherche » est éteint ou que le lot B n'est pas
     là. Le socle sans IA « est le produit, pas un mode dégradé » (§6). */
  const ia = iaRechDispo();
  let h = '<h3>'+(b.neuve ? 'Nouvelle ambiance' : 'Modifier l\'ambiance')+'</h3>';
  if(ia)
    h += '<div class="ongl">'+
      '<button class="'+(b.onglet === 'ia' ? 'on' : '')+'" onclick="ongletCreaAmb(\'ia\')">✦ Décris-la</button>'+
      '<button class="'+(b.onglet === 'ia' ? '' : 'on')+'" onclick="ongletCreaAmb(\'man\')">Régler à la main</button>'+
    '</div>';
  if(ia && b.onglet === 'ia') h += corpsCreaAmbianceIA(b);
  else h += corpsCreaAmbianceReglages(b, src);
  h += '<div class="choix" style="margin-top:10px">'+
      '<button onclick="closeSheet()">Annuler</button>'+
    '</div>';
  openSheet(h, 'amb-crea');
}

function corpsCreaAmbianceReglages(b, src){
  const lignes = LIGNES_AMB.map(l=>
    '<button class="ligamb" onclick="cyclerAmb(\''+l.cle+'\')">'+
      '<span>'+esc(l.titre)+'</span>'+
      '<span class="val">'+esc(l.lire(b.regles))+'</span>'+
    '</button>').join('');
  return '<div class="ambtete">'+
      '<button class="ambemo" onclick="cyclerAmb(\'emoji\')" aria-label="Changer l\'emblème">'+
        esc(b.emoji)+'</button>'+
      '<input class="ambnom" id="ambnom" value="'+esc(b.nom)+'" maxlength="28" '+
        'oninput="nommerAmb(this.value)" aria-label="Nom de l\'ambiance">'+
      (src ? '<span class="ambsrc">'+esc(src)+'</span>' : '')+
    '</div>'+
    '<div class="tiny muted" style="margin:2px 0 6px">'+
      'Touche une ligne pour la changer — tout reste ta décision.</div>'+
    '<div class="ligambs">'+lignes+'</div>'+
    '<button class="btn block" style="margin-top:12px" onclick="validerAmbiance()">'+
      (b.neuve ? 'Enregistrer l\'ambiance' : 'Enregistrer')+'</button>'+
    (b.neuve ? '' :
      '<button class="btn ghost block" style="margin-top:8px" '+
        'onclick="closeSheet();supprimerAmbiance(\''+escJs(b.id)+'\')">Supprimer</button>');
}

/* Les lignes de réglage, et leurs cycles. Un cycle plutôt qu'une sous-feuille :
   sept lignes qui ouvrent chacune un écran, c'est six écrans de trop pour un
   objet qu'on règle en dix secondes. Ce qui demande vraiment un choix riche
   (les genres, les plateformes) se règle dans la feuille Filtres puis
   s'enregistre en ambiance — c'est la passerelle du §4. */
const AMB_CYCLE_FAM = ['tout','film','serie','anime'];
const AMB_CYCLE_GENRE = [[], ['Comédie'], ['Drame'], ['Thriller'], ['Horreur'],
                         ['Science-Fiction'], ['Documentaire']];
const AMB_CYCLE_DUREE = [[], ['court'], ['moyen'], ['ep25'], ['ep50']];
const AMB_CYCLE_NOTE = [null, '7', '8', 'exc'];
const AMB_CYCLE_STATUT = [null, 'finie', 'encours'];

const LIGNES_AMB = [
  { cle:'fam', titre:'Famille',
    lire: g => ({ tout:'Toutes', film:'Films', serie:'Séries', anime:'Animés' })[g.fam] || 'Toutes' },
  { cle:'genre', titre:'Genre',
    lire: g => g.genre.length ? g.genre.join(', ') : 'tous' },
  { cle:'duree', titre:'Durée / format',
    lire: g => { const d = g.duree.map(id => { const x = dureeRech(id); return x ? x.mot : null; })
                            .filter(Boolean); return d.length ? d.join(', ') : 'peu importe'; } },
  { cle:'note', titre:'Note minimale',
    lire: g => { const n = RECH_NOTES.find(x => x.id === g.note); return n ? n.mot : 'peu importe'; } },
  { cle:'statut', titre:'Série / animé',
    lire: g => { const s = statutRech(g.statut); return s ? s.mot : 'peu importe'; } },
  { cle:'gore', titre:'Gore',
    lire: g => g.gore === 'non' ? 'jamais' : 'autorisé' },
  { cle:'pasvu', titre:'Déjà vu',
    lire: g => g.pasvu === 'non' ? 'seulement ce que je n\'ai pas vu' : 'peu importe' },
  { cle:'avec', titre:'Avec qui',
    lire: g => g.avec ? nomProcheRech(g.avec) : 'seul' },
  { cle:'tri', titre:'Classement',
    lire: g => g.tri === 'gouts' ? '✦ mes goûts' : 'note' }
];

function suivantDansCycle(l, v, egal){
  const i = l.findIndex(x => egal(x, v));
  return l[(i + 1) % l.length];
}

function cyclerAmb(cle){
  const b = brouillonAmb;
  if(!b) return;
  const g = b.regles;
  const memeListe = (a2, v) => JSON.stringify(a2) === JSON.stringify(v);
  const memeVal = (a2, v) => a2 === v;
  if(cle === 'emoji') b.emoji = suivantDansCycle(AMB_EMOJIS, b.emoji, memeVal);
  if(cle === 'fam') g.fam = suivantDansCycle(AMB_CYCLE_FAM, g.fam, memeVal);
  if(cle === 'genre') g.genre = suivantDansCycle(AMB_CYCLE_GENRE, g.genre, memeListe).slice();
  if(cle === 'duree') g.duree = suivantDansCycle(AMB_CYCLE_DUREE, g.duree, memeListe).slice();
  if(cle === 'note') g.note = suivantDansCycle(AMB_CYCLE_NOTE, g.note, memeVal);
  if(cle === 'statut') g.statut = suivantDansCycle(AMB_CYCLE_STATUT, g.statut, memeVal);
  if(cle === 'gore') g.gore = g.gore === 'non' ? null : 'non';
  if(cle === 'pasvu') g.pasvu = g.pasvu === 'non' ? null : 'non';
  if(cle === 'avec') g.avec = suivantDansCycle(cycleProchesRech(), g.avec, memeVal);
  if(cle === 'tri') g.tri = g.tri === 'gouts' ? 'note' : 'gouts';
  /* « L'IA propose, l'utilisateur décide » (§2) : dès qu'une ligne est touchée,
     le badge cesse de dire que tout vient de la description. */
  if(b.source === 'ia' || b.source === 'filtres') b.source = 'modifie';
  peindreCreaAmbiance();
}

function nommerAmb(v){
  if(!brouillonAmb) return;
  brouillonAmb.nom = String(v || '').slice(0, 28);
  /* Pas de repeinture : on écrit dans un champ, le redessiner replacerait le
     curseur au début à chaque frappe. La valeur suffit. */
}

function validerAmbiance(){
  const b = brouillonAmb;
  if(!b) return;
  const nom = (b.nom || '').trim() || 'Mon ambiance';
  const a = { id:b.id, emoji:b.emoji, nom:nom, regles:ambianceRegles(b.regles),
              creeLe: Date.now() };
  if(!enregistrerAmbiance(a)) return;
  closeSheet();
  const r = etatRech();
  r.ambiance = a.id;
  r.fam = a.regles.fam || r.fam;
  relancerRech();
  toast(a.emoji + ' « ' + nom + ' » enregistrée et activée');
}

/* Le lot B remplira ceci. Au lot A, l'onglet n'est jamais affiché. */
function iaRechDispo(){
  return typeof iaActive === 'function' && iaActive('recherche') &&
         typeof traduireAmbianceIA === 'function';
}
function ongletCreaAmb(v){
  if(!brouillonAmb) return;
  brouillonAmb.onglet = v;
  peindreCreaAmbiance();
}
function corpsCreaAmbianceIA(b){
  return (typeof corpsCreaAmbianceIALotB === 'function') ? corpsCreaAmbianceIALotB(b) : '';
}

/* ======================= LES PILULES (§5) ======================= */

/* La couleur dit la NATURE du critère, pas son importance :
     violet  — ce qui vient de l'IA ou d'une envie écrite (lot B) ;
     neutre  — les filtres ordinaires ;
     vert    — le contexte : la durée et l'époque, ce qui situe une soirée ;
     orange  — « avec {proche} », parce qu'il change la question elle-même.
   La classe reste `.rmot`, celle de la phrase d'hier : c'est le même objet —
   un mot retirable — dans un format compact. SPEC-07 §2.4 s'appuie dessus. */
const PILULE_TON = { epoque:'ctx', duree:'ctx', avec:'duo', sousg:'ia' };

function pilulesRech(){
  const r = etatRech();
  let h = '<div class="rpils">';
  /* 1. L'ambiance, en tête et NON retirable ligne à ligne (§2) : on retire
        l'ambiance entière en re-touchant sa puce, pas ses règles une à une. */
  const a = ambianceEnregistree(r.ambiance);
  if(a) h += '<span class="rmot ia fixe">'+esc(a.emoji+' '+a.nom)+'</span>';
  /* 2. Les mots de la sélection, dans l'ordre de lecture d'app-12. Chacun
        retirable — et « retirer » veut dire la même chose qu'avant :
        `peuImporteRech` sait déjà distinguer un ingrédient d'ambiance mesurée
        d'un mot posé à la main. */
  motsPhraseRech().forEach(m=>{
    const ton = PILULE_TON[m.cle] ? ' ' + PILULE_TON[m.cle] : '';
    h += '<button class="rmot'+ton+'" onclick="peuImporteRech(\''+escJs(m.cle)+'\')">'+
      esc(m.mot)+'<span class="rpx">✕</span></button>';
  });
  /* 3. La porte vers la feuille. Elle ne dit plus « + préciser » (une question
        après l'autre) mais « ＋ affiner » (tout d'un coup) — c'est le
        changement de forme du §4. */
  h += '<button class="rmot vide" onclick="ouvrirFiltresRech()">＋ affiner</button>';
  h += '</div>';
  return h;
}

/* Y a-t-il quelque chose à filtrer ? Sert à décider si la carte du meilleur
   match a lieu d'être (§5 : « dès qu'une sélection est active »). */
function selectionActiveRech(){
  const r = etatRech();
  if(r.ambiance) return true;
  if(r.amb || r.note || r.pasvu || r.statut || r.gore || r.avec) return true;
  return ['genre','origine','epoque','duree','plate'].some(c => listeRech(c).length > 0);
}

/* ==================== LA FEUILLE « ⚙ FILTRES » (§1, §4) ==================== */

/* Une section ouverte à la fois. L'état vit ici et pas dans `ui.rech` : c'est
   de l'état de feuille, il meurt avec elle. */
let sectionFiltreOuverte = 'genre';

function ouvrirFiltresRech(){
  sectionFiltreOuverte = premiereSectionFiltre();
  peindreFiltresRech();
}

function premiereSectionFiltre(){
  const s = sectionsFiltresRech();
  return s.length ? s[0].id : 'genre';
}

/* LES SECTIONS, DANS L'ORDRE DU §1. Chacune rend ses options à la demande :
   les listes sont PILOTÉES PAR LA FAMILLE, comme aujourd'hui. Rien n'est
   retapé — chaque section lit la table mesurée qui existe déjà dans app-12.
   C'est la règle d'or du §1 : « rien de ce que + préciser sait faire
   aujourd'hui ne disparaît ». */
function sectionsFiltresRech(){
  const fam = etatRech().fam;
  const s = [
    { id:'genre',   titre:'Genre' },
    { id:'epoque',  titre:'Époque' },
    { id:'duree',   titre:'Durée / format' },
    { id:'origine', titre:'Origine' },
    { id:'plate',   titre:'Plateforme' },
    { id:'note',    titre:'Note minimale' }
  ];
  /* « Série / animé » n'a aucun sens sur les films, et TMDB refuserait le
     paramètre : la section n'existe pas dans cette famille. */
  if(fam !== 'film') s.push({ id:'statut', titre:'Série / animé' });
  s.push({ id:'divers', titre:'Divers' });
  return s;
}

function peindreFiltresRech(){
  const corps = sectionsFiltresRech().map(s=> accordeonFiltreRech(s)).join('');
  const h = '<h3>Filtres</h3>'+
    '<div class="tiny muted" style="margin:-2px 0 8px">'+
      'Pour cette recherche seulement — rien n\'est enregistré.</div>'+
    '<div class="faccs">'+corps+'</div>'+
    '<div style="text-align:center;margin-top:12px">'+
      '<button class="fopt" onclick="toutEffacerFiltresRech()">Tout effacer</button></div>'+
    '<button class="btn block" style="margin-top:14px" id="rfvoir" onclick="closeSheet()">'+
      texteVoirFiltresRech()+'</button>'+
    '<button class="btn ghost block" style="margin-top:8px" onclick="filtresVersAmbianceRech()">'+
      '💾 Enregistrer ces filtres en ambiance</button>';
  openSheet(h, 'filtres-rech');
}

/* Le compteur vivant du bouton. Il lit le MÊME total que la barre de l'écran —
   même moteur, même convention « moins de » sur les unions. Deux compteurs qui
   ne diraient pas la même chose, c'est un compteur qui ment. */
function texteVoirFiltresRech(){
  const r = etatRech();
  if(r.total == null) return 'Voir les résultats';
  if(typeof amorceEnCoursRech === 'function' && amorceEnCoursRech()) return 'Voir les titres…';
  return 'Voir les ' + prefixeCompteurRech() + r.total.toLocaleString('fr-FR') + ' titres';
}

/* Le bouton se remet à jour tout seul quand le compteur bouge, SANS redessiner
   la feuille : redessiner refermerait l'accordéon sous le doigt. Appelé depuis
   `peindreCompteurRech` (app-12). */
function rafraichirBoutonFiltres(){
  const el = document.getElementById('rfvoir');
  if(el) el.textContent = texteVoirFiltresRech();
}

function ouvrirSectionFiltre(id){
  sectionFiltreOuverte = (sectionFiltreOuverte === id) ? null : id;
  peindreFiltresRech();
}

function accordeonFiltreRech(s){
  const ouvert = sectionFiltreOuverte === s.id;
  const resume = resumeSectionFiltre(s.id);
  return '<div class="facc'+(ouvert ? ' on' : '')+'">'+
    '<button class="fhead" onclick="ouvrirSectionFiltre(\''+s.id+'\')">'+
      '<span class="fchev">'+I.caret+'</span>'+
      '<b>'+esc(s.titre)+'</b>'+
      '<span class="fsum'+(resume ? '' : ' vide')+'">'+esc(resume || 'tous')+'</span>'+
    '</button>'+
    (ouvert ? '<div class="fbody">'+optionsSectionFiltre(s.id)+'</div>' : '')+
  '</div>';
}

/* Le résumé lu à droite d'une section repliée. Il dit ce qui est POSÉ à la
   main : les règles de l'ambiance, elles, se lisent sur sa pilule. Mélanger
   les deux ferait croire qu'on peut les décocher ici. */
function resumeSectionFiltre(id){
  const r = etatRech();
  const j = l => l.filter(Boolean).join(', ');
  if(id === 'genre'){
    const g = listeRech('genre').map(n => String(libelleGenre(n)).toLowerCase());
    const t = ambianceRech(r.amb);
    const resume = j((t ? [String(t.t || t.mot).toLowerCase()] : []).concat(g));
    /* RETOUR-04 point 1 — section repliée, le résumé dit AUSSI le mode : sans
       ça, « action, aventure » se lit pareil dans les deux réglages alors que
       la grille, elle, n'est pas la même. */
    return (resume && genreEtRech())
      ? resume + ' (les '+nombreEnLettresRech(listeRech('genre').length)+' ensemble)'
      : resume;
  }
  if(id === 'epoque')  return j(listeRech('epoque').map(id2 => { const e = RECH_EPOQUES.find(x=>x.id===id2); return e ? e.mot : null; }));
  if(id === 'duree')   return j(listeRech('duree').map(id2 => { const d = dureeRech(id2); return d ? d.mot : null; }));
  if(id === 'origine') return j(listeRech('origine').map(id2 => { const o = origineRech(id2); return o ? o.mot : null; }));
  if(id === 'plate')   return listeRech('plate').length ? libellePlateRech() : '';
  if(id === 'note'){ const n = RECH_NOTES.find(x => x.id === r.note); return n ? n.mot : ''; }
  if(id === 'statut'){ const s = statutRech(r.statut); return s ? s.mot : ''; }
  if(id === 'divers') return j([ r.pasvu === 'non' ? 'pas encore vu' : null,
                                 r.gore === 'non' ? 'sans gore' : null,
                                 r.avec ? 'avec ' + nomProcheRech(r.avec) : null ]);
  return '';
}

/* Une option : le même bouton partout, et l'état « posé » se lit sur la classe.
   `poserMotRech` fait tout le reste — bascule, exclusivité, relance de la
   requête — exactement comme depuis la feuille « + préciser » d'hier. */
function optFiltreRech(lab, action, on){
  return '<button class="fopt'+(on ? ' on' : '')+'" onclick="'+action+'">'+esc(lab)+'</button>';
}

/* RA-1 (relecture du 10/08) — LA FEUILLE SE REDESSINE ELLE-MÊME, ET C'EST TOUT.

   Chaque option appelait `poserMotRech`, dont la queue ouvrait une AUTRE feuille
   par-dessus : au premier clic sur un genre, l'accordéon disparaissait et le
   titre devenait « Genre ou ambiance ». La feuille du §4 était inutilisable
   au-delà d'un clic — le défaut le plus visible de tout le lot, et aucun cas ne
   le voyait parce qu'aucun ne cliquait deux fois.

   La queue de `poserMotRech` a été retirée (voir app-12) ; il reste à faire ici
   ce que la feuille doit faire elle-même : se repeindre pour montrer le nouvel
   état des options et le résumé de section. `sectionFiltreOuverte` n'est pas
   touchée, donc la section ouverte le reste — c'est ce que le §4 demande. */
function poserFiltreRech(cle, val){
  poserMotRech(cle, val);
  peindreFiltresRech();
}
function poserTuileFiltreRech(id){
  poserAmbianceRech(id);
  peindreFiltresRech();
}
/* RETOUR-04 point 1 — même protocole que `poserFiltreRech` : on pose l'état
   dans app-12, on redessine la feuille ici. La section ouverte le reste, le
   compteur suit tout seul (c'est `relancerRech` qui le nourrit). */
function poserGenreEtFiltreRech(v){
  basculerGenreEtRech(v);
  peindreFiltresRech();
}

function optionsSectionFiltre(id){
  const r = etatRech(), fam = r.fam;
  const poses = c => listeRech(c).map(String);
  let h = '';

  if(id === 'genre'){
    /* Les tuiles d'envie MESURÉES d'abord (§7 : « conservées comme données »),
       puis les genres TMDB complets de la famille. Une tuile est exclusive
       entre elles — c'est une recette entière, pas un ingrédient, et
       `poserAmbianceRech` sait déjà le faire valoir. */
    const tuiles = (typeof ambiancesRech === 'function') ? ambiancesRech() : [];
    if(tuiles.length){
      h += '<div class="fsstitre">'+(familleRech().anime ? 'Sous-genres animés' : 'Les ambiances')+'</div>'+
        '<div class="fopts">'+ tuiles.map(t=>
          optFiltreRech(t.t || t.mot, 'poserTuileFiltreRech(\''+escJs(t.id)+'\')', r.amb === t.id)
        ).join('')+'</div>';
    }
    const g = (typeof genresRech === 'function') ? genresRech() : [];
    if(g.length){
      h += '<div class="fsstitre">Les genres</div>'+
        /* On affiche le libellé français, on POSE le nom TMDB — le point 16
           d'app-12 dit pourquoi, et cette feuille ne déroge pas. */
        '<div class="fopts">'+ g.map(x=>
          optFiltreRech(libelleGenre(x.nom), 'poserFiltreRech(\'genre\',\''+escJs(x.nom)+'\')',
                        poses('genre').indexOf(String(x.nom)) >= 0)
        ).join('')+'</div>';
    }
    /* RETOUR-04 POINT 1 — LA QUESTION N'EXISTE QU'À PARTIR DE DEUX GENRES.
       Avec un seul genre coché, « au moins un des un » ne veut rien dire et
       l'écran ne montre rien de plus qu'en v96 : c'est le premier critère
       d'acceptation du point. Le libellé s'accorde au nombre, et le segment
       part sur « au moins un » — le comportement d'aujourd'hui reste le
       défaut, on ne le change pas, on l'explicite. */
    const nGen = listeRech('genre').length;
    if(nGen >= 2){
      const mot = nombreEnLettresRech(nGen);
      const et = genreEtRech();
      h += '<div class="fcombi">'+
        '<div class="fcombiq">Avec <b>'+nGen+' genres</b> cochés, montrer les titres qui ont…</div>'+
        '<div class="fseg">'+
          '<button class="fsegb'+(et ? '' : ' on')+'" onclick="poserGenreEtFiltreRech(false)">'+
            esc('Au moins un des '+mot)+'</button>'+
          '<button class="fsegb'+(et ? ' on' : '')+'" onclick="poserGenreEtFiltreRech(true)">'+
            esc('Les '+mot)+'</button>'+
        '</div></div>';
    }
    /* SPEC-05 §9 — les sous-genres animés n'apparaissent que sur Animés et sur
       Tout. Sur Animés, `ambiancesRech` les a DÉJÀ rendus ci-dessus (c'est sa
       table pour cette famille) : les remettre ici les afficherait deux fois. */
    if(fam === 'tout' && typeof RECH_ANIMES !== 'undefined'){
      h += '<div class="fsstitre">Sous-genres animés (s\'appliquent aux animés)</div>'+
        '<div class="fopts">'+ RECH_ANIMES.map(a=>
          optFiltreRech(a.mot, 'poserTuileFiltreRech(\''+escJs(a.id)+'\')', r.amb === a.id)
        ).join('')+'</div>';
    }
    return h;
  }

  if(id === 'epoque')
    return '<div class="fopts">'+ RECH_EPOQUES.map(e=>
      optFiltreRech(e.mot, 'poserFiltreRech(\'epoque\',\''+escJs(e.id)+'\')',
                    poses('epoque').indexOf(e.id) >= 0)).join('')+'</div>';

  if(id === 'duree')
    return '<div class="fopts">'+ dureesRech().map(d=>
      optFiltreRech(d.mot, 'poserFiltreRech(\'duree\',\''+escJs(d.id)+'\')',
                    poses('duree').indexOf(d.id) >= 0)).join('')+'</div>';

  if(id === 'origine'){
    /* « Animés = 3 origines, pas une de plus » — la règle est dans la spec et
       dans `originesRech`, qui la porte déjà. On l'appelle, on ne la refait pas. */
    const l = (typeof originesRech === 'function') ? originesRech() : [];
    return '<div class="fopts">'+ l.map(o=>
      optFiltreRech(o.mot, 'poserFiltreRech(\'origine\',\''+escJs(o.id)+'\')',
                    poses('origine').indexOf(o.id) >= 0)).join('')+'</div>';
  }

  if(id === 'plate'){
    const mes = (typeof mesPlates === 'function') ? mesPlates() : [];
    if(!mes.length)
      return '<div class="tiny muted" style="padding:4px 2px 8px">'+
        'Déclare tes abonnements dans Réglages pour filtrer par plateforme.</div>';
    h = '<div class="fopts">'+
      optFiltreRech('mes plateformes', 'poserFiltreRech(\'plate\',\'mes\')',
                    poses('plate').indexOf('mes') >= 0);
    h += mes.map(p=> optFiltreRech(p.nom, 'poserFiltreRech(\'plate\',\''+escJs(String(p.id))+'\')',
                                   poses('plate').indexOf(String(p.id)) >= 0)).join('');
    return h + '</div>';
  }

  if(id === 'note')
    return '<div class="fopts">'+ RECH_NOTES.map(n=>
      optFiltreRech(n.mot+' · '+String(n.v).replace('.', ',')+'+',
                    'poserFiltreRech(\'note\',\''+escJs(n.id)+'\')', r.note === n.id)).join('')+'</div>';

  if(id === 'statut')
    return '<div class="fopts">'+ RECH_STATUTS.map(s=>
      optFiltreRech(s.mot, 'poserFiltreRech(\'statut\',\''+escJs(s.id)+'\')',
                    r.statut === s.id)).join('')+'</div>';

  if(id === 'divers'){
    h = '<div class="fopts">'+
      optFiltreRech('que je n\'ai pas vu', 'poserFiltreRech(\'pasvu\',\'non\')', r.pasvu === 'non')+
      optFiltreRech('sans gore', 'poserFiltreRech(\'gore\',\'non\')', r.gore === 'non')+
    '</div>';
    const proches = prochesRech();
    if(proches.length){
      h += '<div class="fsstitre">Avec un proche</div><div class="fopts">'+
        proches.map(p=> optFiltreRech('avec '+p.pseudo,
          'poserFiltreRech(\'avec\',\''+escJs(String(p.id))+'\')',
          String(r.avec) === String(p.id))).join('')+'</div>';
    }
    return h;
  }
  return '';
}

/* « Tout effacer » vide les filtres et LAISSE l'ambiance (§9). La feuille reste
   ouverte : on efface pour recomposer, pas pour partir. */
function toutEffacerFiltresRech(){
  viderRech();
  peindreFiltresRech();
}

function filtresVersAmbianceRech(){
  closeSheet();
  ouvrirCreaAmbiance(null, true);
}

/* ==================== LE MEILLEUR MATCH (§5) ==================== */

/* Le n° 1 du classement COURANT — donc du tri courant. En tri « note », c'est
   le mieux noté ; en tri « mes goûts », c'est celui qui te ressemble le plus.
   Une seule règle : la carte n'existe que s'il y a une sélection. Sans
   sélection, « le meilleur » ne veut rien dire. */
/* RA-5 (relecture du 10/08) — EN TRI « NOTE », LA CARTE MONTRAIT UN TITRE
   QUELCONQUE. Elle lisait `r.res[matchI]`, et `r.res` sort de
   `espacerGenresRech(melangerRech(fournee))` : il est MÉLANGÉ. Le §5 dit « en
   tri note, la carte affiche le mieux noté ».

   La grille, elle, ne bouge pas : son ordre est celui d'arrivée, qui est « le
   comportement d'aujourd'hui » du §9. Ce n'est pas une incohérence — la grille
   répond à « qu'est-ce qu'il y a ? », la carte à « lequel d'abord ? ». */
function classementMatchRech(){
  const r = etatRech();
  if(triRech() === 'gouts') return r.res;    // déjà trié par score
  const note = x => Number(x.vote_average) || 0;
  return r.res.map((x, i)=> ({ x:x, i:i }))
    .sort((a, b)=> (note(b.x) - note(a.x)) || (a.i - b.i))
    .map(o => o.x);
}
function titreMatchRech(){
  const r = etatRech();
  if(!selectionActiveRech() || !r.res.length) return null;
  const l = classementMatchRech();
  const i = ((r.matchI || 0) % l.length + l.length) % l.length;
  return l[i] || null;
}

/* Les raisons de la carte. En duo, LES DEUX CÔTÉS (§6 de la spec : « en mode
   duo, raisons DES DEUX côtés ») — et si le proche n'a rien à dire sur ce
   titre, on n'invente pas une phrase pour équilibrer la carte. */
function raisonsMatchRech(x, media){
  const duo = critereUnRech('avec');
  const mienne = raisonCoteRech(x, media, null);
  if(!duo) return mienne ? esc(mienne) : '';
  const sienne = raisonCoteRech(x, media, duo);
  const l = [];
  if(mienne) l.push('toi : '+mienne);
  if(sienne) l.push(nomProcheRech(duo)+' : '+sienne);
  return l.length ? esc(l.join(' · ')) : '';
}

function matchSuivantRech(){
  const r = etatRech();
  if(!r.res.length) return;
  r.matchI = ((r.matchI || 0) + 1) % r.res.length;
  peindreRech();
}

function carteMatchRech(){
  const x = titreMatchRech();
  if(!x) return '';
  const media = x.__media || mediaRech();
  const nom = media === 'tv' ? x.name : x.title;
  const n = x.vote_average ? Math.round(x.vote_average*10)/10 : null;
  const duo = !!critereUnRech('avec');
  const bouts = [ esc(year(media === 'tv' ? x.first_air_date : x.release_date)) ];
  if(n) bouts.push('★ '+String(n.toFixed(1)).replace('.', ','));
  const raisons = raisonsMatchRech(x, media);
  return '<div class="rmatch">'+
    '<button class="rmaff" onclick="ouvrirTitre('+Number(x.id)+',\''+media+'\',\'search\')" '+
      'aria-label="'+esc(nom)+'">'+ posterEl(x.poster_path,'w342','',nom) +'</button>'+
    '<div class="rmtxt">'+
      '<div class="rmkick">✦ '+(duo ? 'Votre meilleur match' : 'Ton meilleur match')+'</div>'+
      '<b class="rmnom">'+esc(nom)+'</b>'+
      '<div class="rmmeta">'+bouts.join(' · ')+'</div>'+
      (raisons ? '<div class="rmraison">'+raisons+'</div>' : '')+
      '<div class="rmact">'+
        '<button class="btn mini" onclick="ouvrirTitre('+Number(x.id)+',\''+media+'\',\'search\')">Voir</button>'+
        '<button class="btn mini ghost" onclick="matchSuivantRech()">Suivant →</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}

/* ==================== LE TRI « MES GOÛTS » (§5, §7) ====================

   POURQUOI CELUI-CI N'EST PAS `trierParGout`, ET POURQUOI IL A LE DROIT
   D'EXISTER. Le commentaire du « point 13 » (app-12) interdit de rebrancher
   l'ancien, et il a raison : ce tri-là était INVISIBLE, IRRÉVERSIBLE et MUET.
   Il s'appliquait tout seul, on ne pouvait pas l'éteindre, et rien à l'écran ne
   disait pourquoi un titre passait devant un autre — c'est la définition d'une
   bulle de goûts, et c'est ce que le point 13 a crevé.

   Les trois raisons tombent une par une ici, et c'est le §7 de SPEC-05 qui
   l'exige explicitement :
     · VISIBLE   — un contrôle « Classés par : ✦ mes goûts / note » à l'écran ;
     · RÉVERSIBLE— la bascule est instantanée, et le défaut à la livraison reste
                   « note », c'est-à-dire le comportement d'aujourd'hui ;
     · EXPLIQUÉ  — une raison sous chaque affiche, en toutes lettres.
   Un tri qu'on choisit, qu'on peut défaire et qui se justifie n'est plus une
   bulle : c'est un outil. Si quelqu'un lit ce commentaire dans six mois en se
   demandant si le point 13 a été trahi — non : il a été satisfait. */
const TRI_CLE = 'ms.rechtri.v1';

function triRech(){
  try{ return localStorage.getItem(TRI_CLE) === 'gouts' ? 'gouts' : 'note'; }
  catch(e){ return 'note'; }
}
function poserTriRech(v, silencieux){
  try{ localStorage.setItem(TRI_CLE, v === 'gouts' ? 'gouts' : 'note'); }catch(e){}
  if(!silencieux) peindreRech();
}
/* Basculer est un geste EXPLICITE : il a le droit de réordonner ce qui est
   déjà à l'écran, contrairement à l'arrivée d'une page (voir le commentaire
   dans `chargerGrilleRech`). */
function basculerTriRech(v){
  const r = etatRech();
  poserTriRech(v, true);
  r.res = ordonnerParGoutRech(r.res);
  r.matchI = 0;
  peindreRech();
  /* RETOUR-01 POINT 8 — passer sur « ✦ mes goûts » est le second moment où le
     classement IA se demande. C'est un geste EXPLICITE : la personne vient de
     réclamer ce tri-là, et l'écran est déjà repeint avec l'ordre local. Sur
     « note », `toucherClassementIA` sort tout de suite — on ne prépare pas un
     classement pour un tri qui ne l'utilise pas. */
  if(typeof toucherClassementIA === 'function') toucherClassementIA();
}

function barreTriRech(){
  if(!etatRech().res.length) return '';
  const t = triRech();
  return '<div class="rtri">Classés par :'+
    '<button class="rtb'+(t === 'gouts' ? ' on' : '')+'" onclick="basculerTriRech(\'gouts\')">✦ mes goûts</button>'+
    '<button class="rtb'+(t === 'note' ? ' on' : '')+'" onclick="basculerTriRech(\'note\')">note</button>'+
  '</div>';
}

/* Le score, local et exhaustif (§7). Il lit ce que l'app sait déjà de la
   personne — le podium des duels, les 👍, les genres qu'elle regarde, les
   acteurs qu'elle suit — et rien d'autre. AUCUNE requête, aucune IA.
   TRIE, NE FILTRE JAMAIS : la liste rendue a exactement la même longueur que
   celle reçue. C'est la règle que l'ancien tri respectait déjà, et c'est un cas
   de test. */
/* RA-4 (relecture du 10/08) — LE TRI N'ÉTAIT PAS RÉVERSIBLE, ET LE COMMENTAIRE
   JUSTE AU-DESSUS PRÉTENDAIT LE CONTRAIRE.

   `basculerTriRech` MUTE `r.res`. Au retour vers « note », cette fonction
   rendait `l` tel quel — donc la grille restait dans l'ordre des goûts, et
   seules les raisons disparaissaient. La bascule était à sens unique, et le
   pavé du point 13 promettait « RÉVERSIBLE » trois lignes plus haut. C'est le
   défaut le plus gênant du lot : la justification écrite était fausse dans le
   code même qui la portait.

   La cause est qu'aucun ordre d'arrivée n'était mémorisé. Il l'est maintenant :
   chaque titre porte son rang d'arrivée (`__rang`, posé par `chargerGrilleRech`
   au moment du `concat`), et « note » le restitue. Cet ordre-là est celui qui
   porte la pertinence TMDB et l'anti-monotonie d'`espacerGenresRech` — c'est
   très exactement « le comportement d'aujourd'hui » que le §9 exige par défaut. */
function ordonnerParGoutRech(l){
  if(!Array.isArray(l) || l.length < 2) return l;
  const rang = x => (typeof x.__rang === 'number') ? x.__rang : 0;
  if(triRech() !== 'gouts'){
    /* Retour à « note » : on RESTITUE l'ordre d'arrivée. Sans `__rang` — une
       liste posée à la main, un cas de test — on ne touche à rien. */
    if(!l.some(x => typeof x.__rang === 'number')) return l;
    return l.slice().sort((a, b)=> rang(a) - rang(b));
  }
  const score = {};
  l.forEach(x=>{ score[x.__media+':'+x.id] = scoreGoutRech(x); });
  /* RETOUR-01 POINT 8 (11/08/2026) — L'ORDRE IA PASSE DEVANT, QUAND IL EXISTE.
     ① le score local ci-dessus ne change pas d'une ligne : c'est lui qui
     pré-classe, et c'est lui qui reste quand l'IA est éteinte, indisponible ou
     pas encore arrivée (⑥). ⑤ un titre absent du classement IA — au-delà des
     cent premiers, ou écarté par la validation — vaut `Infinity` et se range
     donc APRÈS les cent classés, dans son ordre local : la grille ne présente
     aucune rupture, elle a seulement une tête mieux rangée.
     `app-14-ia.js` peut être absent (vieux cache de service worker) : on ne
     suppose rien, ici comme ailleurs. */
  const ia = (typeof ordreIAGrilleRech === 'function') ? ordreIAGrilleRech() : null;
  const rangIA = k => (ia && (k in ia)) ? ia[k] : Infinity;
  /* Tri STABLE : à score égal, l'ordre d'arrivée est conservé. */
  return l.map((x, i)=> ({ x:x, i:i }))
    .sort((a, b)=>{
      const ka = a.x.__media+':'+a.x.id, kb = b.x.__media+':'+b.x.id;
      if(ia){
        const ra = rangIA(ka), rb = rangIA(kb);
        if(ra !== rb) return ra - rb;
      }
      return (score[kb] - score[ka]) || (a.i - b.i);
    })
    .map(o => o.x);
}

/* Les genres aimés, par famille, avec leur poids. Calculé une fois par fournée
   et mémorisé sur la signature des goûts : le refaire par titre sur 42 titres
   × 3 pages serait du gaspillage pur. */
let profilRechCache = { sig:null, genres:null, duo:null, duoSig:null };

function profilGoutsRech(){
  const sig = (typeof signatureGouts === 'function') ? signatureGouts() : 0;
  if(profilRechCache.sig === sig && profilRechCache.genres) return profilRechCache.genres;
  const poids = {};
  const ajouter = (genres, n)=>{
    (genres || []).forEach(g=>{ const k = String(g).toLowerCase(); poids[k] = (poids[k] || 0) + n; });
  };
  try{
    Object.values(db.shows || {}).forEach(o=>{ if(o) ajouter(o.genres, 1); });
    Object.values(db.movies || {}).forEach(o=>{ if(o && o.seen) ajouter(o.genres, 1); });
    const avis = db.avis || {};
    Object.keys(avis.tv || {}).forEach(id=>{
      const o = db.shows[id]; if(o) ajouter(o.genres, (avis.tv[id].v || 0) * 2);
    });
    Object.keys(avis.movie || {}).forEach(id=>{
      const o = db.movies[id]; if(o) ajouter(o.genres, (avis.movie[id].v || 0) * 2);
    });
  }catch(e){}
  profilRechCache.sig = sig; profilRechCache.genres = poids;
  return poids;
}

/* Le profil du proche, pour le mode duo (§4). Il ne lit QUE ce que le partage
   expose déjà — la bibliothèque visible du cercle, déjà en mémoire. Aucune
   donnée nouvelle ne transite, aucune requête n'est déclenchée : si la
   bibliothèque n'est pas chargée, le duo n'ajoute rien et le dit. */
function profilProcheRech(id){
  if(!id) return null;
  if(profilRechCache.duoSig === String(id) && profilRechCache.duo) return profilRechCache.duo;
  const b = (typeof biblios === 'object' && biblios) ? biblios[id] : null;
  if(!b || b.erreur) return null;
  const poids = {}, titres = {};
  [['shows','tv'], ['movies','movie']].forEach(([cle, media])=>{
    Object.values(b[cle] || {}).forEach(o=>{
      if(!o || o.id == null) return;
      titres[media+':'+o.id] = 1;
      (o.genres || []).forEach(g=>{ const k = String(g).toLowerCase(); poids[k] = (poids[k] || 0) + 1; });
    });
  });
  profilRechCache.duoSig = String(id);
  profilRechCache.duo = { genres:poids, titres:titres };
  return profilRechCache.duo;
}

function genresTitreRech(x, media){
  const m = media || x.__media || mediaRech();
  const ids = Array.isArray(x.genre_ids) ? x.genre_ids : [];
  return ids.map(id => nomGenreRech(m, id)).filter(Boolean).map(n => String(n).toLowerCase());
}

/* Le nom d'un genre à partir de son identifiant, via le catalogue déjà chargé
   par la Recherche (`genresTMDB`, app-04). Sans catalogue, on ne rend rien
   plutôt que de deviner : un score approximatif serait pire qu'un score neutre,
   parce qu'il aurait l'air juste. */
function nomGenreRech(media, id){
  try{
    const l = (typeof genresTMDB === 'object' && genresTMDB) ? (genresTMDB[media] || []) : [];
    const g = (l || []).find(x => String(x.id) === String(id));
    return g ? g.nom : null;
  }catch(e){ return null; }
}

const SCORE_PODIUM = 60, SCORE_AIME = 25, SCORE_ACTEUR = 15, SCORE_DUO = 20;

function scoreGoutRech(x){
  const media = x.__media || mediaRech();
  let s = 0;
  const g = profilGoutsRech();
  const genres = genresTitreRech(x, media);
  genres.forEach(n=>{ s += Math.min(30, (g[n] || 0) * 3); });
  /* Un titre proche d'un podium de duel pèse lourd : c'est la déclaration la
     plus coûteuse que la personne ait faite sur son goût. */
  try{
    const fams = ['film','serie','anime'];
    fams.forEach(f=>{
      const pod = ((db.podium || {})[f] || []).map(String);
      if(pod.indexOf(String(x.id)) >= 0) s += SCORE_PODIUM;
    });
    const a = (db.avis || {})[media] || {};
    if(a[x.id] && a[x.id].v === 1) s += SCORE_AIME;
    if(a[x.id] && a[x.id].v === -1) s -= SCORE_AIME;
  }catch(e){}
  /* La note reste dans le score, avec un petit poids : à goût égal, un bon
     titre passe devant. Elle ne le domine jamais — sinon ce serait le tri
     « note » sous un autre nom. */
  if(x.vote_average) s += Number(x.vote_average) || 0;
  /* Le duo : l'INTERSECTION des deux profils (§4). Ce qui plaît aux deux monte,
     ce qui ne plaît qu'à un reste où il est. */
  const p = profilProcheRech(critereUnRech('avec'));
  if(p){
    let commun = 0;
    genres.forEach(n=>{ if(p.genres[n]) commun++; });
    s += Math.min(SCORE_DUO, commun * 7);
    if(p.titres[media+':'+x.id]) s += SCORE_DUO;
  }
  return s;
}

/* LA RAISON, en toutes lettres et en règles LOCALES — jamais d'IA ici (§5).
   Elle ne s'affiche qu'en tri « mes goûts » : en tri « note », la note est la
   raison, et elle est déjà écrite au-dessus. */
function raisonGoutRech(x, media){
  if(triRech() !== 'gouts') return '';
  const m = media || x.__media || mediaRech();
  const duo = critereUnRech('avec');
  const mienne = raisonCoteRech(x, m, null);
  if(!duo) return mienne ? '<div class="rraison">✦ '+esc(mienne)+'</div>' : '';
  const sienne = raisonCoteRech(x, m, duo);
  const l = [];
  if(mienne) l.push('toi : '+mienne);
  if(sienne) l.push(nomProcheRech(duo)+' : '+sienne);
  return l.length ? '<div class="rraison">✦ '+esc(l.join(' · '))+'</div>' : '';
}

/* ---- RETOUR-01 POINT 7 (11/08/2026) — « DU ACTION » N'EXISTE PLUS ----

   Le gabarit local écrivait `'du '+genre` en dur. Sur les seize genres du
   vocabulaire, ça donnait « du action », « du animation », « du science-
   fiction », « du histoire », « du aventure »… — cinq fautes visibles à
   l'écran, sous une affiche, dans une phrase censée expliquer un choix.

   LA RÈGLE, DANS L'ORDRE, ET ELLE TIENT EN TROIS LIGNES :
     · le nom commence par une voyelle ou un h muet → « de l' » ;
     · le nom est féminin → « de la » ;
     · sinon → « du ».

   Le genre grammatical ne se devine pas d'une terminaison (« la romance » et
   « le documentaire » finissent tous deux par une voyelle) : il se déclare.
   D'où la table ci-dessous, qui ne porte QUE les féminins — le masculin est le
   défaut, et un genre inconnu tombe donc sur « du », qui est le cas le plus
   fréquent. Un genre qu'on aurait oublié fait une faute mineure, jamais un
   plantage.

   ELLE COUVRE LES DEUX TAXONOMIES, ET L'ORDRE COMPTE : on CANONISE d'abord
   (`genreCanon` : « sci-fi & fantasy » → « Science-Fiction »), on FRANCISE
   ensuite ce qui reste (`libelleGenre` : « kids » → « Jeunesse »). Sans ça,
   « du sci-fi & fantasy » resterait possible.
   (La première rédaction annonçait l'ordre inverse à la phrase précédente et le
   bon à la suivante : le code était juste, le commentaire se contredisait.
   Relevé en relecture.) */
const GENRES_FEMININS_RECH = {
  'action':1, 'animation':1, 'aventure':1, 'comédie':1, 'guerre':1, 'histoire':1,
  'horreur':1, 'musique':1, 'romance':1, 'science-fiction':1, 'fantasy':1,
  'information':1, 'téléréalité':1, 'jeunesse':1, 'guerre et politique':1,
  'action et aventure':1
};
/* Voyelle ou h muet en tête. Le seul h aspiré de la liste des genres serait
   « hongrois » ou « hollandais », qui n'en sont pas : sur ce vocabulaire-là,
   tout h est muet (« l'horreur », « l'histoire »). On ne modélise donc pas une
   exception qui n'a aucun représentant. */
const VOYELLE_RECH = /^[aeiouyàâäéèêëîïôöùûüh]/i;

function nomGenreLisibleRech(nom){
  const brut = String(nom == null ? '' : nom);
  const canon = (typeof genreCanon === 'function') ? genreCanon(brut) : brut;
  const fr = (typeof libelleGenre === 'function') ? libelleGenre(canon) : canon;
  return String(fr).toLowerCase();
}
/* « de l'action », « de la comédie », « du thriller ». Rendue seule pour
   qu'un test puisse la passer sur les seize genres sans monter un écran. */
function duGenreRech(nom){
  const n = nomGenreLisibleRech(nom);
  if(!n) return '';
  if(VOYELLE_RECH.test(n)) return 'de l\'' + n;
  return (GENRES_FEMININS_RECH[n] ? 'de la ' : 'du ') + n;
}

/* Une raison, d'un côté ou de l'autre. `qui` vaut null pour soi, l'identifiant
   d'un proche sinon. On rend la PREMIÈRE raison vraie, pas une liste : deux
   lignes sous une affiche, c'est une notice. */
function raisonCoteRech(x, media, qui){
  const genres = genresTitreRech(x, media);
  if(qui){
    const p = profilProcheRech(qui);
    if(!p) return '';
    if(p.titres[media+':'+x.id]) return 'déjà dans sa bibliothèque';
    const commun = genres.filter(n => p.genres[n]);
    /* RETOUR-01 point 7 — même francisation ici : « sci-fi & fantasy aussi de
       son côté » était le second endroit où la taxonomie brute passait à
       l'écran. Pas d'article à poser, seulement un nom lisible. */
    if(commun.length) return nomGenreLisibleRech(commun[0])+' aussi de son côté';
    return '';
  }
  try{
    const a = (db.avis || {})[media] || {};
    if(a[x.id] && a[x.id].v === 1) return 'tu as mis un 👍 dessus';
  }catch(e){}
  const g = profilGoutsRech();
  const fort = genres.filter(n => (g[n] || 0) > 0).sort((n1, n2)=> (g[n2]||0) - (g[n1]||0))[0];
  if(fort) return duGenreRech(fort)+', comme ce que tu regardes';
  if(x.vote_average >= 7.5)
    return 'très bien noté · '+String((Math.round(x.vote_average*10)/10).toFixed(1)).replace('.', ',');
  if(genres.length) return 'un genre que tu explores';
  return '';
}

/* ==================== LES PROCHES, POUR LE MODE DUO ==================== */

/* Le cercle EXISTANT — les abonnements du partage — et rien d'autre.

   CORRECTION DE COMMENTAIRE (relecture du 10/08) : la version précédente
   affirmait « on ne propose que les proches dont la bibliothèque est déjà en
   mémoire ». C'était faux, cette fonction ne filtre rien. Et le filtre serait
   d'ailleurs le mauvais choix : `amorcerDuoRech` va CHERCHER la bibliothèque
   manquante en arrière-plan, donc un proche encore inconnu finit par répondre.
   Ce qu'on garde : la liste des suivis, plafonnée. */
function prochesRech(){
  const l = ((typeof partage === 'object' && partage && partage.suivis) || [])
    .filter(p => p && p.id && p.pseudo);
  return l.slice(0, 8);
}
function nomProcheRech(id){
  const p = prochesRech().find(x => String(x.id) === String(id));
  return p ? p.pseudo : 'un proche';
}
function cycleProchesRech(){
  return [null].concat(prochesRech().map(p => String(p.id)));
}
/* Les raisons du duo ont besoin de la bibliothèque du proche. Elle est déjà
   chargée si Découvrir a bâti sa rangée « Vu par tes proches » ; sinon on la
   demande UNE fois, en arrière-plan, et on repeint à l'arrivée. C'est la seule
   lecture réseau de tout ce fichier, elle ne va pas à TMDB, et le §4 la
   couvre : « les deux bibliothèques du cercle sont déjà synchronisées ». */
let duoEnCoursRech = null;
function amorcerDuoRech(){
  const id = critereUnRech('avec');
  if(!id || duoEnCoursRech === String(id)) return;
  if(typeof biblios === 'object' && biblios && biblios[id]) return;
  if(typeof chargerBiblio !== 'function') return;
  duoEnCoursRech = String(id);
  Promise.resolve(chargerBiblio(id)).then(()=>{
    profilRechCache.duoSig = null;
    if(view === 'search') peindreRech();
  }).catch(()=>{}).then(()=>{ duoEnCoursRech = null; });
}
