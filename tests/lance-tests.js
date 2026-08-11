/* ---------------------------------------------------------------------------
   Lanceur des tests — à exécuter avec Node et Playwright.

       cd <depot> && python3 -m http.server 8099 &
       node tests/lance-tests.js

   Il fait NEUF choses. Chacune a été ajoutée après s'être fait avoir une fois :
   aucune n'est là par principe, toutes portent la trace d'un accident réel.

   1. Il ouvre `test.html` et lit son bilan. Ce sont les tests des fonctions
      pures — fusion, statuts, échappement, migrations, routes. Il attend
      `window.__testsFinis` : le bilan que la page écrit d'abord est PROVISOIRE,
      les cas asynchrones n'ont pas encore commencé.

   2. Il ouvre `index.html`, l'app RÉELLE, et échoue à la moindre erreur de
      page. C'est ce qui attrape ce que `node --check` ne peut pas voir : le
      30/07, une fonction `chargerRecos` ajoutée dans app-01 est entrée en
      collision avec celle qui existait déjà dans app-05, dont le `const recos`
      a cessé de s'évaluer. Chaque fichier passait `node --check` séparément ;
      l'app, elle, ne démarrait plus.

   3. Il relit les déclarations de premier niveau des douze fichiers et refuse
      qu'un nom soit déclaré deux fois. Les scripts partagent une seule portée
      globale : c'est la contrainte structurante du projet, et rien ne la
      surveillait. Contrôle statique, donc il attrape aussi les collisions
      dans du code qui ne s'exécute pas au démarrage.

   4. Il refuse qu'un même nom de classe CSS NU soit repris d'une section à
      l'autre d'`app.css` (lot R1).

   5. Il refuse qu'un fichier écrive une variable d'état partagée qui ne lui a
      pas été ouverte. Le contrôle n° 3 surveille la DÉCLARATION ; celui-ci
      surveille l'ÉCRITURE, qui est l'autre moitié du même accident.

   6. Il refuse que deux fichiers émettent le même identifiant DOM. Ce sont les
      cibles des repeints ciblés : un doublon casse un écran à distance, très
      exactement comme `.dinfo` en CSS.

   7. Il dessine l'écran Découvrir pour de bon, contre un faux catalogue, et
      vérifie l'ordre de dépouillement des rangées (lot D).

   8. Il refuse qu'une migration ouvre une policy d'écriture sur `abonnements`
      (cycle 3, point 6). Ce contrôle existait déjà ; il n'était pas compté.

   9. Il refuse `esc(` à l'intérieur d'un gestionnaire d'événement
      (`onclick="…"`, `ontouchstart="…"`) — SPEC-02, S3. La règle est écrite
      depuis longtemps en tête d'app-02 ; rien ne la surveillait, et trois
      endroits d'app-07 l'enfreignaient encore le 09/08, dont deux sur des
      données écrites par un AUTRE utilisateur. Une règle qu'aucun contrôle ne
      tient se défait toute seule, un lot à la fois.

   Quatre contrôles sont arrivés APRÈS cette liste et n'y portent pas de numéro :
   l'accord des trois numéros de version, la complétude du SHELL du worker, la
   frontière de publication (S6, 09/08/2026 — tout ce qui traîne à la racine est
   servi en HTTPS public, sauf ce que `_config.yml` retire) et la règle « un
   abandon volontaire n'est pas une panne » (B5). Ils s'affichent sous les noms
   « versions », « shell du SW », « publication » et « abandon ».

   Les contrôles 3, 5, 6, 8 et 9 sont STATIQUES : lus sur le disque, sans
   navigateur. Les trois premiers portent la même règle sur trois espaces de
   noms différents — la portée globale, l'état, le DOM ; il n'y a pas de raison
   qu'ils divergent. Les deux derniers tiennent chacun une règle écrite ailleurs
   dans le dépôt et que rien ne relisait.

   Ce fichier est VERSIONNÉ, à la différence des suites d'une session
   précédente qui ont disparu avec leur machine.
--------------------------------------------------------------------------- */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8099';

/* Les erreurs de console attendues : un test vérifie exprès qu'une migration
   qui échoue ne bloque pas le démarrage, et elle journalise. */
const CONSOLE_ATTENDUE = [
  /migration \d+ en échec/,
  /* C5 — un cas fait volontairement lever une vue pour vérifier que `render`
     affiche l'écran de panne au lieu de figer l'écran précédent. Il journalise,
     et c'est exactement ce qu'on lui demande de faire. */
  /^\[render\]/
];

/* ATTENTION — cette liste doit contenir TOUS les fichiers chargés par
   `index.html`, sinon ce contrôle regarde à côté sans jamais le dire.
   `app-12-recherche.js` y manquait depuis la v83 : le lot 0 l'a signalé sans
   pouvoir le corriger (hors de son périmètre), c'est réparé ici en même temps
   qu'on inscrit `app-13-inscription.js`. Le fichier a été ajouté à la liste
   AVANT d'écrire une ligne du lot C, pour que le contrôle serve à quelque
   chose pendant l'écriture et pas seulement après. */
const FICHIERS = [
  'app-01-noyau.js','app-02-outils.js','app-03-vues.js','app-04-decouvrir.js',
  'app-05-plateformes.js','app-06-serie.js','app-07-partage.js',
  'app-08-reglages.js','app-09-notifications.js','app-10-sorties.js','app-11-gouts.js',
  'app-12-recherche.js','app-13-inscription.js','app-14-ia.js','app-15-filtres.js','app-16-duel-plus.js'
];

/* ---------------------------------------------------------------------------
   BLANCHIR — commentaires, chaînes, gabarits et littéraux d'expression
   rationnelle deviennent des espaces, à longueur ET à nombre de lignes
   constants. Tout ce qui suit compte des accolades ou cherche un motif : sans
   ce passage, un `{` dans une chaîne (`'{"a":1}'`) ou un `//` dans une URL
   fausse le comptage sans jamais le dire.
--------------------------------------------------------------------------- */
function blanchir(src){
  const out = src.split('');
  const eff = (a, b) => { for(let k = a; k < b; k++) if(out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  const n = src.length;
  while(i < n){
    const c = src[i];
    if(c === '/' && src[i+1] === '/'){ let j = src.indexOf('\n', i); if(j < 0) j = n; eff(i, j); i = j; continue; }
    if(c === '/' && src[i+1] === '*'){ let j = src.indexOf('*/', i+2); j = j < 0 ? n : j+2; eff(i, j); i = j; continue; }
    if(c === '"' || c === "'" || c === '`'){
      let j = i+1;
      while(j < n){ if(src[j] === '\\'){ j += 2; continue; } if(src[j] === c) break; j++; }
      eff(i+1, j); i = j+1; continue;
    }
    if(c === '/'){
      /* Division ou expression rationnelle ? Le dernier caractère significatif
         tranche : après une valeur (`x`, `)`, `]`) c'est une division. */
      let k = i-1;
      while(k >= 0 && /\s/.test(out[k])) k--;
      if(!/[\w)\]]/.test(k >= 0 ? out[k] : '')){
        let j = i+1, classe = false, ferme = false;
        while(j < n){
          const d = src[j];
          if(d === '\\'){ j += 2; continue; }
          if(d === '\n') break;
          if(d === '[') classe = true;
          else if(d === ']') classe = false;
          else if(d === '/' && !classe){ ferme = true; break; }
          j++;
        }
        if(ferme){ eff(i+1, j); i = j+1; continue; }
      }
    }
    i++;
  }
  return out.join('');
}

/* Déclarations de PREMIER NIVEAU. Deux corrections par rapport à la première
   version, qui n'ancrait qu'en COLONNE 0 :

   1. UNE SEULE ESPACE DEVANT SUFFISAIT À DEVENIR INVISIBLE. Un nom global
      déclaré ` function x(){}` ne se voyait pas, et c'est exactement le genre
      d'indentation qu'un lot pressé laisse derrière lui. L'ancre accepte donc
      jusqu'à deux espaces — au-delà, on est dans un corps de fonction.

   2. LES CORPS D'IIFE, EUX, NE SONT PAS GLOBAUX. `glisseRetour` (app-02) est
      une fonction immédiatement appelée, et ses huit fonctions internes
      (`preparer`, `peindre`, `suivre`, `poser`, `remettre`, `terminer`,
      `jouer`, `enCours`) tombent pile à deux espaces. Les compter serait
      SIGNALER DES COLLISIONS QUI N'EXISTENT PAS : `poser` et `terminer` sont
      des noms courants, ils vivent aussi ailleurs, mais chacun dans sa
      fermeture. On filtre donc sur la PROFONDEUR RÉELLE : seule une
      déclaration hors de toute accolade, parenthèse ou crochet partage la
      portée globale. L'ancre d'indentation reste comme second garde-fou, et
      parce qu'elle rend le motif lisible.

   Mesuré le 02/08 : les deux lectures rendent exactement les mêmes 1027 noms.
   L'ancre ne change donc rien AUJOURD'HUI — elle ferme un trou pour demain. */
function declarationsDetail(src){
  const net = blanchir(src);
  const prof = new Array(net.length);
  let d = 0;
  for(let i = 0; i < net.length; i++){
    prof[i] = d;
    const c = net[i];
    if(c === '{' || c === '(' || c === '[') d++;
    else if(c === '}' || c === ')' || c === ']') d--;
  }
  const noms = [];
  const re = /^[ \t]{0,2}(?:async\s+)?(function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while((m = re.exec(net))) if(prof[m.index] === 0) noms.push({ nom:m[2], sorte:m[1] });
  return noms;
}
function declarations(src){ return declarationsDetail(src).map(d => d.nom); }

/* ---------------------------------------------------------------------------
   L'ÉTAT PARTAGÉ — le troisième accident de la même famille

   Le contrôle n° 3 refuse qu'un nom soit DÉCLARÉ deux fois. Il ne dit rien de
   ce qui arrive après : douze objets d'état sont déclarés une seule fois et
   ÉCRITS depuis plusieurs fichiers (`db` depuis dix, `ui` depuis neuf). C'est
   voulu — c'est l'état de l'app — mais c'est aussi le chemin par lequel un lot
   s'approprie en silence une variable qui ne lui appartient pas, et le
   symptôme sort dans un écran qu'il n'a jamais ouvert. Exactement `.dinfo`,
   mais en JavaScript.

   LA LISTE BLANCHE ci-dessous est relevée sur l'état RÉEL du dépôt au 02/08,
   nom par nom ET fichier par fichier. Elle ne dit pas « c'est bien » : elle
   dit « c'est connu ». Y ajouter une ligne est une décision d'une ligne, que
   la revue voit passer ; l'oublier fait tomber la suite.

   Ce qui compte comme écriture : `nom = …`, `nom.champ = …`, `nom[clé] = …`,
   `nom.champ++`. Une simple lecture ne compte pas — c'est le partage de
   l'ÉCRITURE qui fait les dégâts. */
const ETAT_PARTAGE = {
  /* Les deux gros : la base et l'état d'écran. Tout le monde y écrit, c'est
     leur raison d'être. */
  db:   ['app-01-noyau.js','app-03-vues.js','app-04-decouvrir.js','app-06-serie.js',
         'app-07-partage.js','app-08-reglages.js','app-09-notifications.js',
         'app-11-gouts.js','app-12-recherche.js','app-13-inscription.js',
         /* SPEC-04 lot C : `app-14-ia.js` n'écrit qu'UNE chose dans la base —
            `db.gouts.ia`, les deux interrupteurs, depuis `basculerIA`. Tout le
            reste de son état (les textes générés) vit en localStorage, hors
            synchro, comme le §4.3 l'exige. */
         'app-14-ia.js','app-15-filtres.js','app-16-duel-plus.js'],
  ui:   ['app-02-outils.js','app-03-vues.js','app-04-decouvrir.js','app-05-plateformes.js',
         'app-06-serie.js','app-07-partage.js','app-10-sorties.js','app-11-gouts.js',
         'app-12-recherche.js','app-15-filtres.js'],
  /* La navigation. `app-08-reglages.js` y écrit parce qu'il pose lui-même la
     destination après une déconnexion. */
  view:   ['app-02-outils.js','app-03-vues.js','app-08-reglages.js'],
  params: ['app-02-outils.js','app-03-vues.js','app-08-reglages.js'],
  navDir:  ['app-02-outils.js','app-03-vues.js'],
  sansAnim:['app-02-outils.js','app-03-vues.js'],
  destinationEnAttente: ['app-02-outils.js','app-07-partage.js','app-08-reglages.js'],
  /* Les caches de TMDB, remplis par l'écran qui en a besoin le premier. */
  castings: ['app-04-decouvrir.js','app-05-plateformes.js'],
  langueDe: ['app-04-decouvrir.js','app-05-plateformes.js'],
  /* Le partage, et la question « seulement mes plateformes » que l'inscription
     pose avant que Découvrir n'existe. */
  partage: ['app-01-noyau.js','app-07-partage.js'],
  platesEcranDemande: ['app-04-decouvrir.js','app-13-inscription.js'],
  /* Déclaré vide dans app-02, rempli par les écrans qui ont quelque chose à
     refermer — la recherche, et depuis C2 la feuille de confirmation générique
     d'app-02 elle-même (`confirmerDansFeuille`), qui s'en sert pour traiter
     « refermée sans qu'on ait répondu » comme un NON. */
  FERMETURES: ['app-02-outils.js','app-12-recherche.js'],
  /* SPEC-05 — le brouillon d'ambiance en cours d'écriture. Il est DÉCLARÉ dans
     app-15 (la feuille qui le dessine) et complété par app-14 quand l'IA
     traduit une description en réglages : c'est le même objet, à deux moments
     de sa vie. Il meurt avec la feuille, il n'entre jamais dans `db`. */
  brouillonAmb: ['app-14-ia.js','app-15-filtres.js'],
  /* SPEC-06 §2.3 — la session de duel. app-16 y écrit UNE fois, dans
     `jouerDuelJour`, et selon le même protocole qu'`ouvrirDuel` : `oublierDuel()`
     d'abord (qui règle le vote en vol et tue le minuteur), puis la session de
     taille un. Le §0.3 interdit un second moteur, pas une seconde porte. */
  duel: ['app-11-gouts.js','app-16-duel-plus.js']
};

function ecrituresEtat(fichiers, lire){
  /* Les noms déclarés au premier niveau : seuls eux peuvent être de l'état
     partagé. Une fonction ne compte pas — la réaffecter est déjà attrapé par
     le contrôle n° 3. */
  const declare = {};
  fichiers.forEach(f=>{
    declarationsDetail(lire(f)).forEach(d=>{
      if(!declare[d.nom]) declare[d.nom] = { f:f, sorte:d.sorte };
    });
  });
  const ecrit = {};
  fichiers.forEach(f=>{
    const net = blanchir(lire(f));
    const re = /(^|[^.\w$])([A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]*\])*\s*(?:=[^=>]|\+\+|--|\+=|-=|\|\|=|\?\?=)/g;
    let m;
    while((m = re.exec(net))){
      const n = m[2];
      if(!declare[n] || declare[n].sorte === 'function') continue;
      /* `let x = 1` est une déclaration, pas une prise de possession. */
      if(/\b(const|let|var|function)\s*$/.test(net.slice(Math.max(0, m.index-12), m.index + m[1].length))) continue;
      (ecrit[n] = ecrit[n] || new Set()).add(f);
    }
  });
  const soucis = [];
  let partages = 0;
  Object.keys(ecrit).sort().forEach(n=>{
    const qui = [...ecrit[n]].sort();
    /* Partagé = écrit par plus d'un fichier, ou écrit par un autre que celui
       qui l'a déclaré. Les deux formes se valent : dans les deux cas le nom a
       cessé d'appartenir à un seul endroit. */
    if(qui.length < 2 && qui[0] === declare[n].f) return;
    partages++;
    const permis = ETAT_PARTAGE[n];
    if(!permis){
      soucis.push(n + ' : état partagé non déclaré — écrit par ' + qui.join(', '));
      return;
    }
    qui.filter(f => permis.indexOf(f) < 0).forEach(f=>{
      soucis.push(n + ' : ' + f + ' écrit un état qui ne lui a jamais été ouvert');
    });
  });
  /* Le contrôle marche dans les deux sens : une ligne de liste blanche qui ne
     correspond plus à rien est une permission qui traîne. */
  Object.keys(ETAT_PARTAGE).forEach(n=>{
    if(!ecrit[n]) soucis.push(n + ' : inscrit sur la liste blanche mais plus écrit nulle part');
  });
  return { soucis: soucis, partages: partages };
}

/* ---------------------------------------------------------------------------
   LES IDENTIFIANTS DOM — la même règle que le CSS, sur l'autre moitié

   `#plats`, `#dres`, `#rres`, `#rjeu`, `#jmeta`, `#jsyn`, `#addbtn`,
   `#barreavis` ne sont pas décoratifs : ce sont les cibles des REPEINTS
   CIBLÉS. Chacun est cherché par `getElementById` depuis un fichier, et repeint
   sans toucher au reste de l'écran — c'est ce qui empêche la jaquette du jeu de
   se détruire et de se recréer à chaque réponse de TMDB (point 7).

   Deux fichiers qui émettent le même identifiant, c'est le même accident que
   `.dinfo` : le repeint de l'un frappe l'écran de l'autre, à distance, et
   `getElementById` ne rend de toute façon que le premier. On refuse.

   Les deux formes d'émission sont lues, parce que les deux existent :
   l'attribut dans une chaîne de gabarit (`id="rjeu"`) et la propriété posée à
   la main (`el.id = 'barreavis'`, app-11). Un préfixe construit
   (`id="cast-'+id+'"`) est retenu tel quel, préfixe compris : deux fichiers qui
   se partagent le même préfixe se marchent dessus tout autant. */
function identifiantsDom(src){
  /* `blanchir` vide aussi les chaînes, donc les identifiants avec : ici on
     n'efface QUE les commentaires — les exemples qu'ils citent ne sont pas du
     code, et ils citent justement des identifiants. */
  const net = src.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '))
                 .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');
  const ids = [];
  let m;
  const attribut = /\bid=(?:\\?["'])([A-Za-z_][\w-]*)/g;
  while((m = attribut.exec(net))) ids.push(m[1]);
  const propriete = /\.id\s*=\s*(?:\\?["'])([A-Za-z_][\w-]*)/g;
  while((m = propriete.exec(net))) ids.push(m[1]);
  return ids;
}

/* ---------------------------------------------------------------------------
   SPEC-02, S3 — `esc` N'A RIEN À FAIRE DANS UN GESTIONNAIRE D'ÉVÉNEMENT

   La règle est posée en tête d'app-02 depuis le bug des acteurs à apostrophe :
   toute chaîne glissée dans un `onclick` traverse DEUX analyseurs et doit donc
   passer par `escJs`. Elle était écrite, expliquée, testée sur la fonction
   elle-même — et violée à trois endroits d'app-07, parce que rien ne relisait
   les APPELS. Deux de ces trois endroits portaient une valeur écrite par un
   autre utilisateur (`r.type`, venu de la table `recommandations`).

   Le contrôle lit chaque attribut `on…="…"` construit dans une chaîne, et
   refuse d'y trouver un appel à `esc(`. Il est volontairement grossier — il ne
   comprend pas le JavaScript, il regarde entre deux délimiteurs — et c'est
   suffisant : le motif fautif est toujours de cette forme.

   Ce qui n'est PAS signalé : `escJs(` (la bonne forme), `Number(x)` (déjà sûr),
   et `esc()` employé ailleurs dans la même chaîne, hors du gestionnaire —
   `aria-label="Actions pour '+esc(p.pseudo)+'"` est correct et le reste.

   SA LIMITE, ÉCRITE PLUTÔT QUE TUE : il ne voit que `esc(` posé À L'INTÉRIEUR
   de l'attribut. Un échappement passé par une variable —
   `const t = esc(r.type); … 'onclick="f(\''+t+'\')"'` — lui échappe, et c'est
   justement l'idiome que ce lot installe (`idJs`, `cleJs` dans `ligneAbo`).
   D'où la convention qui va avec, et qui est la vraie règle : une variable
   destinée à un gestionnaire se nomme `…Js` et se remplit avec `escJs`. Le
   contrôle attrape l'écriture directe ; la convention de nom attrape le reste
   à la relecture.
--------------------------------------------------------------------------- */
function escDansGestionnaire(src){
  /* Comme pour les identifiants DOM : on n'efface QUE les commentaires. Les
     chaînes sont précisément ce qu'on veut lire, et les commentaires du dépôt
     citent le motif fautif pour l'expliquer.

     Le `//` n'est effacé qu'EN DÉBUT DE LIGNE. Ailleurs, c'est une adresse
     relative au protocole (`'<img src="//cdn/p.png" onclick="…">'`) : la
     prendre pour un commentaire effacerait la fin de la ligne, gestionnaire
     compris, et le contrôle se tairait sur le cas le plus douteux qui soit. */
  const net = src.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '))
                 .replace(/^([ \t]*)\/\/[^\n]*/gm, '$1');
  const soucis = [];
  /* `on` + au moins trois lettres : `onclick`, `ontouchstart`, `onchange`…
     Le délimiteur peut être `"`, `'`, ou `\"` quand la chaîne portante est
     elle-même à guillemets doubles. */
  const ouvre = /\bon[a-z]{3,}\s*=\s*(\\?["'])/g;
  let m;
  while((m = ouvre.exec(net))){
    const delim = m[1];
    const debut = m.index + m[0].length;
    /* On cherche LE MÊME délimiteur, échappement compris : dans une chaîne
       portante à guillemets doubles, l'attribut se ferme sur `\"` et non sur
       le `"` qui termine la chaîne JavaScript. Chercher le premier `"` venu
       s'arrêtait AVANT le contenu de l'attribut et ne regardait rien. */
    const ferme = new RegExp(delim.length === 2 ? '\\\\' + delim[1]
                                                : '(?<!\\\\)' + delim, 'g');
    ferme.lastIndex = debut;
    const f = ferme.exec(net);
    /* Pas de délimiteur fermant en vue : on borne, plutôt que d'avaler la
       moitié du fichier et de signaler n'importe quoi. */
    const fin = f ? f.index : Math.min(net.length, debut + 600);
    const valeur = net.slice(debut, fin);
    /* `esc(` en position d'appel — y compris `window.esc(` — jamais `escJs(`. */
    if(/(^|[^\w$.])(?:(?:window|self|globalThis)\.)?esc\s*\(/.test(valeur))
      soucis.push('l.' + net.slice(0, m.index).split('\n').length + ' — ' +
                  m[0].trim() + ' … ' + valeur.replace(/\s+/g, ' ').slice(0, 70));
    ouvre.lastIndex = fin;
  }
  return soucis;
}

/* ---------------------------------------------------------------------------
   LOT R1 — LE MÊME CONTRÔLE, MAIS EN CSS

   Les points 1 et 2 des retours de la v85 sont exactement le même accident que
   celui qui a motivé le contrôle n° 3, en CSS cette fois, et personne ne l'a
   vu : le lot A a nommé `.dinfo` la pastille « i » du duel, un nom que le socle
   employait déjà pour le bloc titre de l'aperçu de Recherche ; le lot C a
   déclaré `.itxt` sans le rattacher à son écran, alors que le bloc d'invitation
   portait déjà ce nom. Dans les deux cas la règle écrite le plus bas gagne, et
   un écran qu'on ne regardait pas se dessine de travers.

   LA RÈGLE : un lot ne s'approprie pas un nom de classe NU (`.x`, seul, sans
   conteneur ni modificateur) que le socle ou un autre lot emploie déjà. Les
   sections sont celles des en-têtes `===== … =====` du fichier.

   Ce qui n'est PAS signalé, et c'est délibéré :
     · les sélecteurs composés — `.invitg .itxt`, `.dact .btn`, `.dcarte.gagne`,
       `.dcarte:after`. Ils sont rattachés : c'est justement la bonne manière.
     · une même section qui redéclare sa propre classe quelques lignes plus bas
       pour ajouter une propriété (`.cperson`, `.rtexte`, `.ecaret`…). C'est le
       même propriétaire, c'est lisible, ça ne surprend personne.
   C'est la REDÉCLARATION NUE D'UN NOM QUI APPARTIENT À QUELQU'UN D'AUTRE qui
   est signalée — la seule qui casse un écran à distance. */
function collisionsCss(src){
  /* Les commentaires sont blanchis et non retirés : les numéros de ligne
     rapportés doivent être ceux du fichier réel. */
  const net = src.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  const ligneDe = pos => src.slice(0, pos).split('\n').length;

  /* Les sections, lues sur la source d'origine (les en-têtes sont dans des
     commentaires, donc effacés de `net`).

     UN EN-TÊTE PEUT ÊTRE ANONYME, et il l'est déjà : `app.css` l.1571 ouvre le
     lot E par une barre d'`=` toute nue, son titre étant sur la ligne SUIVANTE.
     Le motif d'origine en tirait le nom « = ». Ça n'a l'air de rien tant qu'il
     n'y en a qu'un ; au deuxième, DEUX SECTIONS SANS RAPPORT PORTENT LE MÊME
     NOM, `sectionDe(a) !== sectionDe(b)` répond « non » et le contrôle se tait
     sur une vraie collision. On va donc chercher le titre sur les lignes
     suivantes du commentaire, et à défaut on numérote — deux anonymes ne se
     confondent plus. (`app.css` est hors du périmètre de ce lot : la barre
     nue reste, c'est le contrôle qui apprend à la lire.) */
  const lignes = src.split('\n');
  const sections = [];
  const VIDE = /^[\s=*_-]*$/;
  lignes.forEach((l, i)=>{
    if(!/\/\*\s*=+/.test(l)) return;
    /* On enlève l'ouverture, la fermeture éventuelle, puis les barres d'`=` des
       deux côtés : ce qui reste est le titre, vide s'il n'y en a pas. */
    const brut = l.replace(/^[^/]*\/\*/, '').replace(/\*\/.*$/, '')
                  .replace(/^[\s=]+/, '').replace(/[\s=]+$/, '');
    let nom = VIDE.test(brut) ? '' : brut;
    /* La suite ne se lit QUE si le commentaire est encore ouvert : sinon on
       ramasserait la première règle CSS venue et on la prendrait pour un titre. */
    if(!nom && !/\*\//.test(l)){
      for(let k = i + 1; !nom && k < lignes.length && k < i + 4; k++){
        const suite = lignes[k].replace(/^\s*\*?\s*/, '').replace(/\*\/.*$/, '');
        if(!VIDE.test(suite)) nom = suite.trim();
        if(/\*\//.test(lignes[k])) break;
      }
    }
    sections.push({ ligne:i + 1, nom: nom || ('sans titre l.' + (i + 1)) });
  });
  const sectionDe = n =>{
    let s = 'socle';
    sections.forEach(x=>{ if(n >= x.ligne) s = x.nom; });
    return s;
  };

  const NUE  = /^\.[A-Za-z_-][A-Za-z0-9_-]*$/;      // `.x` et rien d'autre
  const NOMS = /\.[A-Za-z_-][A-Za-z0-9_-]*/g;
  const vus = {};                                   // classe → première ligne où le nom sert
  const soucis = [];
  let i = 0, prof = 0, tete = '', pileAt = [];

  while(i < net.length){
    const c = net[i];
    if(c === '{'){
      const sel = tete.trim().replace(/\s+/g, ' ');
      tete = '';
      const at = sel.charAt(0) === '@';
      if(!at){
        const premierNiveau = !pileAt.some(Boolean);   // hors @media / @supports
        const ligne = ligneDe(i);
        const sec = sectionDe(ligne);
        sel.split(',').map(s => s.trim()).filter(Boolean).forEach(s=>{
          if(premierNiveau && NUE.test(s) && vus[s] && sectionDe(vus[s]) !== sec)
            soucis.push(s + ' : déclaré nu l.' + ligne + ' (' + sec +
                        ') alors que le nom sert déjà l.' + vus[s] +
                        ' (' + sectionDe(vus[s]) + ')');
        });
        sel.split(',').forEach(s=>{
          (s.match(NOMS) || []).forEach(n=>{ if(!vus[n]) vus[n] = ligne; });
        });
      }
      pileAt.push(at); prof++; i++; continue;
    }
    if(c === '}'){ prof--; pileAt.pop(); tete = ''; i++; continue; }
    /* Une déclaration à la racine (`@import x;`) ou la fin d'une propriété :
       on repart d'une tête de règle vierge. */
    if(c === ';' && prof === 0){ tete = ''; i++; continue; }
    tete += c; i++;
  }
  return { soucis: soucis, classes: Object.keys(vus).length };
}

(async () => {
  let souci = 0;
  const nav = await chromium.launch();

  /* --- 1. les tests unitaires --- */
  {
    /* B9 (SPEC-03, 09/08) — LA PAGE DE TESTS TOURNE À L'HEURE DE PARIS. Le
       défaut corrigé — la journée calculée en UTC — ne se voit QUE dans un
       fuseau décalé : sur une machine réglée en UTC, les cas de `todayISO` et
       de `fmtDayLabel` passeraient avant comme après sans rien prouver. On fixe
       donc le fuseau du navigateur de test au lieu d'espérer celui de la
       machine — c'est aussi ce qui rend la suite reproductible d'un atelier à
       l'autre. */
    const page = await nav.newPage({ timezoneId:'Europe/Paris' });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push('erreur de page : ' + e.message));
    page.on('console', m => {
      if(m.type() !== 'error') return;
      if(CONSOLE_ATTENDUE.some(r => r.test(m.text()))) return;
      erreurs.push('console : ' + m.text());
    });
    await page.goto(BASE + '/test.html', { waitUntil:'networkidle' });
    /* LE BILAN N'EST LU QU'UNE FOIS LA FILE ASYNCHRONE JOUÉE. `test.html`
       écrit un bilan PROVISOIRE dès la fin des cas synchrones : le lire là
       déclarait la suite verte alors que les cas `testAsync` (points 6, 10 et
       20) n'avaient pas encore commencé. Le fichier annonçait déjà
       `window.__testsFinis` comme le signal à attendre ; il n'était attendu
       nulle part. Borné, parce qu'un test qui bloque ne dit rien. */
    try{
      await page.waitForFunction(() => window.__testsFinis === true, null, { timeout:30000 });
    }catch(e){
      erreurs.push('la file asynchrone de test.html ne s\'est jamais terminée (30 s)');
    }
    const bilan = await page.textContent('#bilan');
    const echecs = await page.$$eval('.t.ko', els => els.map(e => e.textContent.trim()));
    console.log('test.html  → ' + bilan);
    echecs.forEach(e => console.log('   ✗ ' + e));
    erreurs.forEach(e => console.log('   ! ' + e));
    souci += echecs.length + erreurs.length;
    await page.close();
  }

  /* --- 2. l'app réelle démarre-t-elle ? --- */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844} });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });
    /* Un écran a bien été peint : sans ça, une app qui se charge sans erreur
       mais n'affiche rien passerait pour saine. */
    const peint = await page.evaluate(() => {
      const a = document.getElementById('app');
      return !!(a && a.innerHTML.trim().length > 50);
    });
    if(!peint) erreurs.push('aucun écran peint après le démarrage');
    console.log('index.html → ' + (erreurs.length ? erreurs.length + ' erreur(s)' : 'démarre proprement'));
    erreurs.forEach(e => console.log('   ! ' + e));
    souci += erreurs.length;
    await page.close();
  }

  /* --- 3. deux fois le même nom global ? ---
     Lu sur le disque et non par le serveur : ce contrôle est statique, il n'a
     besoin ni de navigateur ni d'app qui démarre. */
  {
    const fs = require('fs'), chemin = require('path');
    const racine = chemin.join(__dirname, '..');
    const vus = {};
    const doublons = [];
    for(const f of FICHIERS){
      const src = fs.readFileSync(chemin.join(racine, f), 'utf8');
      for(const n of declarations(src)){
        if(vus[n]) doublons.push(n + ' : ' + vus[n] + ' et ' + f);
        else vus[n] = f;
      }
    }
    console.log('portée globale → ' + (doublons.length
      ? doublons.length + ' collision(s)'
      : Object.keys(vus).length + ' déclarations, aucune collision'));
    doublons.forEach(d => console.log('   ! ' + d));
    souci += doublons.length;
  }

  /* --- 4. LOT R1 — deux fois le même nom de classe dans `app.css` ? --- */
  {
    const fs = require('fs'), chemin = require('path');
    const css = fs.readFileSync(chemin.join(__dirname, '..', 'app.css'), 'utf8');
    const r = collisionsCss(css);
    console.log('classes CSS   → ' + (r.soucis.length
      ? r.soucis.length + ' collision(s)'
      : r.classes + ' noms de classe, aucune redéclaration nue'));
    r.soucis.forEach(d => console.log('   ! ' + d));
    souci += r.soucis.length;
  }

  /* --- 5. LOT E — QUI ÉCRIT L'ÉTAT PARTAGÉ ? --- */
  {
    const fs = require('fs'), chemin = require('path');
    const racine = chemin.join(__dirname, '..');
    const r = ecrituresEtat(FICHIERS, f => fs.readFileSync(chemin.join(racine, f), 'utf8'));
    console.log('état partagé  → ' + (r.soucis.length
      ? r.soucis.length + ' écriture(s) non déclarée(s)'
      : r.partages + ' variables partagées, toutes déclarées'));
    r.soucis.forEach(d => console.log('   ! ' + d));
    souci += r.soucis.length;
  }

  /* --- 6. LOT E — deux fichiers pour le même identifiant DOM ? --- */
  {
    const fs = require('fs'), chemin = require('path');
    const racine = chemin.join(__dirname, '..');
    const vus = {};
    const doublons = [];
    for(const f of FICHIERS){
      const dedans = new Set(identifiantsDom(fs.readFileSync(chemin.join(racine, f), 'utf8')));
      for(const id of dedans){
        if(vus[id]) doublons.push('#' + id + ' : ' + vus[id] + ' et ' + f);
        else vus[id] = f;
      }
    }
    console.log('identifiants  → ' + (doublons.length
      ? doublons.length + ' identifiant(s) partagé(s)'
      : Object.keys(vus).length + ' identifiants DOM, chacun à un seul fichier'));
    doublons.forEach(d => console.log('   ! ' + d));
    souci += doublons.length;
  }

  /* --- 7. LOT D — L'ÉCRAN DÉCOUVRIR SE DESSINE-T-IL VRAIMENT ? ---

     `test.html` éprouve les fonctions pures ; il ne peut pas éprouver
     `chargerSuggestions`, qui ne fait rien d'autre que parler à TMDB. Or c'est
     là que se joue la seule règle vraiment fragile du lot : L'ORDRE DE
     DÉPOUILLEMENT. Les rangées se servent dans un pot commun (`vus`), la
     première servie garde les titres — et une rangée peut donc en affamer une
     autre sans qu'aucun test unitaire ne s'en aperçoive.

     C'est arrivé pendant l'écriture, et c'est ce qui justifie ce contrôle :
     dépouillée après « Dans l'esprit de X », la rangée « Ce que tes favoris
     ont en commun » sortait TOUJOURS vide — ses titres, recommandés par le
     favori n°1, étaient déjà pris. L'écran était vert de partout et il
     manquait une rangée.

     On charge donc l'app réelle, on remplace `tmdb` par un faux catalogue, et
     on regarde ce qui est peint. Aucun réseau : le faux répond à tout. */
  {
    const page = await nav.newPage({ viewport:{width:390,height:844} });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto(BASE + '/index.html', { waitUntil:'networkidle' });

    /* Le faux catalogue. Deux détails comptent : chaque appel rend des titres
       NEUFS (sinon tout se télescope et l'ordre ne prouve rien), et toutes les
       recommandations partagent un titre commun — c'est lui, et lui seul, que
       le croisement des favoris doit isoler. */
    const dessine = async (riche) => page.evaluate((riche)=>{
      const G = { tv:[{id:18,nom:'Drame'},{id:10759,nom:'Action & Adventure'}],
                  movie:[{id:18,nom:'Drame'},{id:28,nom:'Action'}] };
      genresTMDB.tv = G.tv; genresTMDB.movie = G.movie;
      let n = 0;
      const lot = (media, tag) => Array.from({length:12}, ()=>{
        n++;
        const o = { id:1000+n, poster_path:'/p'+n+'.jpg', backdrop_path:'/b'+n+'.jpg',
                    vote_average:7.4, vote_count:900, genre_ids:[18], original_language:'en' };
        if(media === 'tv'){ o.name = tag+' '+n; o.first_air_date = '2016-04-02'; }
        else { o.title = tag+' '+n; o.release_date = '2016-04-02'; }
        return o;
      });
      window.tmdb = async (chemin)=>{
        if(/\/genre\//.test(chemin))
          return { genres:(/\/tv\//.test(chemin)?G.tv:G.movie).map(g=>({id:g.id,name:g.nom})) };
        if(/watch\/providers/.test(chemin))
          return { results:[{provider_id:8,provider_name:'Netflix',display_priorities:{FR:1}}] };
        if(/combined_credits/.test(chemin))
          return { cast: lot('movie','Acteur').map(x=>Object.assign({media_type:'movie'}, x)) };
        if(/recommendations/.test(chemin)){
          const l = lot(/\/tv\//.test(chemin) ? 'tv' : 'movie', 'Reco');
          /* SPEC-04 — DIX titres communs et non plus un seul : depuis la règle
             des 10, une rangée de croisement à un titre n'existe plus, et le
             test ne prouverait donc plus rien de ce qu'il vient prouver. */
          for(let k = 0; k < 10; k++)
            l.push({ id:7770+k, poster_path:'/c'+k+'.jpg', backdrop_path:'/c'+k+'.jpg',
                     title:'Le Commun '+k, name:'Le Commun '+k, release_date:'2011-01-01',
                     first_air_date:'2011-01-01', vote_average:8, vote_count:4000,
                     genre_ids:[18], original_language:'en' });
          return { results:l, total_pages:3 };
        }
        return { results: lot(/\/discover\/tv/.test(chemin) ? 'tv' : 'movie', 'Disc'),
                 total_pages:5 };
      };
      db.auth = { token:'x', uid:'u' };
      db.shows = {}; db.movies = {};
      db.avis = { tv:{}, movie:{} };
      db.podium = { film:[], serie:[], anime:[], maj:0 };
      db.gouts.graines = []; db.gouts.amorcageFait = true; db.gouts.exclus = [];
      db.gouts.pasPourMoi = {};
      db.gouts.acteurs = [{ id:2037, nom:'Cillian Murphy' }];
      db.gouts.plates  = [{ id:8, nom:'Netflix' }];
      /* SPEC-04 — douze films vus et non plus six : c'est ce qui permet au
         « Top 10 pour toi » d'exister, et donc d'être éprouvé. */
      for(let i = 1; i <= 12; i++)
        db.movies[i] = { id:i, title:'Film '+i, genres:['Drame'], seen:true, watchedAt:1,
                         addedAt:1, date:'2014-01-01', poster:'/f.jpg', note:8 - i/100 };
      db.shows[50] = { id:50, name:'Série 50', genres:['Drame'], status:'Ended', poster:'/s.jpg',
                       seasons:{1:[{e:1,n:'E1',d:'2020-01-01',r:42}]}, watched:{'1x1':1},
                       addedAt:1, updated:1 };
      if(riche) [1,2,3,4].forEach(i => poserAvis('movie', i, 1));
      partage.suivis = [{ id:'ami', pseudo:'Léa' }];
      /* Douze titres chez Léa, pour la même raison : sous dix, « Vu par tes
         proches » n'est plus une rangée. */
      biblios.ami = { movies:{} };
      for(let i = 0; i < 12; i++)
        biblios.ami.movies[900+i] = { id:900+i, title:'Chez Léa '+i, poster:'/l.jpg',
                                      genres:['Drame'], date:'2018-01-01', watchedAt:5 };
      ui.disc.type = 'tout'; ui.disc.humeur = null;
      try{ localStorage.removeItem(MEMO_CLE); }catch(e){}
      memoRangees = null;
      oublierSuggestions();
      view = 'discover'; params = {};
      return chargerSuggestions(true).then(()=>{
        render();
        /* SPEC-04 — on relève AUSSI ce qui ne se lit que sur l'écran peint :
           les rangées trop courtes, les badges de famille et le compte de la
           tuile « Tout voir ». Le moteur peut avoir raison en mémoire et la
           vue se tromper — c'est déjà arrivé. */
        const rails = [...document.querySelectorAll('#dres .rangee')];
        const nomRail = r => (r.previousElementSibling||{}).textContent || '?';
        return { rangees: [...document.querySelectorAll('.sectitle')].map(e=>e.textContent),
                 courtes: rails
                   .filter(r => r.querySelectorAll('.vgn, .h4rangc').length < 10)
                   .map(nomRail),
                 badges: document.querySelectorAll('#dres .h4badge').length,
                 tuiles: [...document.querySelectorAll('#dres .vgtoutbox i')]
                   .map(e=>e.textContent).join(' '),
                 hero: (document.querySelector('.d4nom')||{}).textContent || null,
                 raison: (document.querySelector('.d4pq')||{}).textContent || null,
                 lien: !!document.querySelector('.d4lien'),
                 /* RETOUR-01 point 1 : les puces vivent maintenant AU-DESSUS du
                    hero, plus dessus. On relève les deux faces : la bande doit
                    être là, et plus rien ne doit être en surimpression. */
                 bande: !!document.querySelector('#dres .h4bande .chip'),
                 surhero: document.querySelectorAll('.h4surhero, .h4voile').length,
                 appel: !!document.querySelector('.d4appel'),
                 texte: document.getElementById('app').textContent };
      });
    }, riche);

    const rate = m => erreurs.push('lot D : ' + m);

    const riche = await dessine(true);
    /* L'ordre de SPEC-04 §1, et surtout la présence des DEUX rangées de cœur
       (que la spec conserve) ET des cinq rangées neuves. */
    ['Top 10 pour toi', 'Parce que tu as aimé Film', 'Ce que tes favoris ont en commun',
     'Avec Cillian Murphy', 'Des drames pour toi', 'Vu par tes proches', 'Nouveautés',
     'Acclamés par la critique', 'À finir en un week-end', 'Des pépites que tu as ratées',
     'Les classiques à rattraper', 'Les incontournables des années',
     'Sur Netflix', 'Bientôt'].forEach(attendu=>{
      if(!riche.rangees.some(t => t.indexOf(attendu) === 0)) rate('rangée manquante : ' + attendu);
    });
    const rang = t => riche.rangees.findIndex(x => x.indexOf(t) === 0);
    /* « À finir en un week-end » est volontairement hors de cette chaîne : du
       vendredi 17 h au dimanche elle remonte en 2ᵉ position, et un test d'ordre
       qui échoue trois jours sur sept n'est pas un test. Sa place a son propre
       contrôle, horloge simulée, dans `test.html`. */
    if(!(rang('Top 10 pour toi') < rang('Parce que tu as aimé Film')
      && rang('Parce que tu as aimé Film') < rang('Ce que tes favoris ont en commun')
      && rang('Ce que tes favoris ont en commun') < rang('Avec Cillian Murphy')
      && rang('Avec Cillian Murphy') < rang('Des drames pour toi')
      && rang('Des drames pour toi') < rang('Vu par tes proches')
      && rang('Vu par tes proches') < rang('Nouveautés')
      && rang('Nouveautés') < rang('Acclamés par la critique')
      && rang('Acclamés par la critique') < rang('Des pépites que tu as ratées')
      && rang('Des pépites que tu as ratées') < rang('Les classiques à rattraper')
      && rang('Les classiques à rattraper') < rang('Les incontournables des années')
      && rang('Les incontournables des années') < rang('Sur Netflix')
      && rang('Sur Netflix') < rang('Bientôt')))
      rate('l\'ordre fixe de SPEC-04 §1 n\'est pas respecté : ' + riche.rangees.join(' | '));
    /* SPEC-04 — la règle des 10 se vérifie SUR L'ÉCRAN PEINT, pas seulement en
       mémoire : aucune rangée de moins de dix affiches ne doit rester. */
    if(riche.courtes.length)
      rate('des rangées de moins de dix affiches sont à l\'écran : ' + riche.courtes.join(', '));
    if(!riche.badges) rate('aucun badge FILM/SÉRIE/ANIMÉ en famille « Tout »');
    if(!/les \d+/.test(riche.tuiles || ''))
      rate('la tuile « Tout voir » ne dit pas combien de titres il y a');
    if(!riche.hero) rate('aucune proposition du jour en tête d\'écran');
    if(!/Parce que tu as aimé/.test(riche.raison || '')) rate('la proposition n\'a pas de raison lisible');
    /* RETOUR-01 POINT 2 — le contrôle est RETOURNÉ : le lien « Ajuster mes
       goûts » ne doit plus jamais reparaître dans Découvrir. */
    if(riche.lien) rate('le lien « Ajuster mes goûts » est encore là (RETOUR-01 point 2)');
    if(/Ajuster mes goûts/.test(riche.texte))
      rate('le texte « Ajuster mes goûts » est encore à l\'écran (RETOUR-01 point 2)');
    /* RETOUR-01 POINT 1 — les puces sont dans le flux, au-dessus du hero. */
    if(!riche.bande) rate('la bande de puces a disparu de Découvrir (RETOUR-01 point 1)');
    if(riche.surhero) rate('des puces sont encore posées sur l\'affiche (RETOUR-01 point 1)');
    if(riche.appel) rate('la carte d\'appel au duel s\'affiche sur un profil nourri');
    if(/TMDB/.test(riche.texte)) rate('l\'aveu technique sur les plateformes est encore à l\'écran');
    if(/Je pars de tes/.test(riche.texte)) rate('le pavé de diagnostic est encore à l\'écran');

    /* « Pas pour moi » : la carte change tout de suite, et rien n'entre dans
       `db.avis` — c'est la ligne de partage du §3.8. */
    const avant = riche.hero;
    await page.click('.d4act .btn.ghost');
    const apres = await page.evaluate(()=>({
      hero: (document.querySelector('.d4nom')||{}).textContent || null,
      avis: Object.keys(db.avis.movie).filter(id => db.avis.movie[id].v === -1).length }));
    if(apres.hero === avant) rate('« Pas pour moi » ne remplace pas la carte');
    if(apres.avis) rate('« Pas pour moi » a écrit un 👎 : c\'est un rejet ferme, pas un report');

    /* SPEC-04 §0.2 — L'HUMEUR, DE BOUT EN BOUT ET SUR L'ÉCRAN RÉEL : on touche
       la puce, l'écran se recompose ; on la retouche, il revient EXACTEMENT
       comme avant. C'est la promesse la plus facile à casser du lot, parce
       qu'elle tient à une clé de cache. */
    const repos = await page.evaluate(()=>
      [...document.querySelectorAll('.sectitle')].map(e=>e.textContent).join('|'));
    await page.click('.h4chips .h4chip:nth-child(2)');           // 😱 Frissonner
    await page.waitForFunction(()=> !!document.querySelector('.h4chip.on'), null, {timeout:8000});
    await page.waitForFunction(()=> !!document.querySelector('.d4tag.h4on'), null, {timeout:8000});
    const humeur = await page.evaluate(()=>({
      cles: [...document.querySelectorAll('.sectitle')].map(e=>e.textContent),
      tag: (document.querySelector('.d4tag')||{}).textContent || '',
      violet: !!document.querySelector('.d4act .btn.h4btn'),
      famille: ui.disc.type, hum: ui.disc.humeur }));
    if(humeur.cles.indexOf('De la tension, pas du sang') < 0)
      rate('la rangée principale de l\'humeur n\'est pas à l\'écran : ' + humeur.cles.join(' | '));
    if(!/Pour frissonner ce soir/.test(humeur.tag))
      rate('le libellé du hero ne passe pas à l\'humeur : ' + humeur.tag);
    if(!humeur.violet) rate('le bouton principal ne prend pas la couleur de l\'humeur');
    if(humeur.famille !== 'tout') rate('poser une humeur a changé la famille : elles se cumulent');
    await page.click('.h4chips .h4chip:nth-child(2)');           // second appui
    await page.waitForFunction(()=> !document.querySelector('.h4chip.on'), null, {timeout:8000});
    const retour = await page.evaluate(()=>
      [...document.querySelectorAll('.sectitle')].map(e=>e.textContent).join('|'));
    if(retour !== repos)
      rate('un second appui ne rend pas EXACTEMENT l\'écran au repos :\n'+
           '        avant  ' + repos + '\n        après  ' + retour);

    /* Le profil qui démarre : pas de rangée de cœur, mais un appel au duel. */
    const pauvre = await dessine(false);
    if(pauvre.rangees.some(t => /^Parce que tu as aimé/.test(t)))
      rate('une rangée de cœur s\'ouvre sans le moindre 👍');
    if(!pauvre.appel) rate('aucun appel au duel sur un profil qui n\'a rien déclaré');
    if(!/incontournable/.test(pauvre.raison || ''))
      rate('sans signal, la proposition doit s\'annoncer comme un incontournable');

    console.log('lot D        → ' + (erreurs.length
      ? erreurs.length + ' problème(s)'
      : riche.rangees.length + ' rangées nourries, ' + pauvre.rangees.length + ' au démarrage'));
    erreurs.forEach(e => console.log('   ! ' + e));
    souci += erreurs.length;
    await page.close();
  }

  /* --- 8. CYCLE 3, POINT 6 — AUCUNE POLICY D'ÉCRITURE SUR `abonnements` ---
     La fermeture de 001 (« on ne s'abonne QUE par utiliser_code() ») est ce
     qui empêche de s'abonner à quelqu'un dont on connaîtrait l'uid. Le point 6
     ajoute une fonction serveur, PAS une policy : ce contrôle statique refuse
     qu'une migration en ouvre une, aujourd'hui ou plus tard. */
  {
    const fs = require('fs'), chemin = require('path');
    const dossier = chemin.join(__dirname, '..', 'supabase', 'migrations');
    const soucis = [];
    fs.readdirSync(dossier).filter(f => /\.sql$/.test(f)).forEach(f=>{
      const sql = fs.readFileSync(chemin.join(dossier, f), 'utf8')
        /* Les commentaires ne comptent pas : ils citent la règle. */
        .replace(/--[^\n]*/g, '').toLowerCase();
      /* Une policy sur `abonnements` portant `for insert` (ou `for all`, qui
         l'inclut) est exactement le trou que 001 ferme. */
      const re = /create\s+policy[\s\S]{0,200}?on\s+(?:public\.)?abonnements[\s\S]{0,200}?for\s+(insert|all)/g;
      let m;
      while((m = re.exec(sql))) soucis.push(f + ' : une policy « for ' + m[1] + ' » sur abonnements');
    });
    console.log('abonnements   → ' + (soucis.length
      ? soucis.length + ' policy d\'écriture interdite'
      : 'aucune policy d\'écriture — la porte reste fermée'));
    soucis.forEach(d => console.log('   ! ' + d));
    souci += soucis.length;
  }

  /* --- 9. SPEC-02, S3 — `esc` DANS UN GESTIONNAIRE D'ÉVÉNEMENT --- */
  {
    const fs = require('fs'), chemin = require('path');
    const racine = chemin.join(__dirname, '..');
    const soucis = [];
    let gestionnaires = 0;
    for(const f of FICHIERS){
      const src = fs.readFileSync(chemin.join(racine, f), 'utf8');
      gestionnaires += (src.match(/\bon[a-z]{3,}\s*=\s*\\?"/g) || []).length;
      escDansGestionnaire(src).forEach(d => soucis.push(f + ' ' + d));
    }
    console.log('onclick       → ' + (soucis.length
      ? soucis.length + ' esc( dans un gestionnaire — il faut escJs('
      : gestionnaires + ' gestionnaires, aucun esc( : la règle d\'app-02 tient'));
    soucis.forEach(d => console.log('   ! ' + d));
    souci += soucis.length;
  }

  /* --- 10. C6 — LES TROIS NUMÉROS DE VERSION DISENT-ILS LA MÊME CHOSE ? ---
     `sw.js`, `index.html` et `README.md` portent chacun le numéro de version, à
     la main, dans trois fichiers différents. Ils étaient DÉJÀ désynchronisés au
     moment d'écrire ce contrôle : les deux premiers disaient v88, le README
     v87. Ce n'est pas cosmétique — `CACHE` dans `sw.js` est la SEULE chose qui
     change dans ce fichier d'une livraison à l'autre. Une livraison qui modifie
     un `app-*.js` sans toucher `sw.js` ne change pas un octet du worker : le
     navigateur ne détecte aucun nouveau worker, n'installe rien, et les
     utilisateurs déjà installés ne reçoivent PLUS JAMAIS la mise à jour. Sans
     aucun signal, ni pour eux ni pour l'auteur.
     Ce contrôle ne peut pas attraper l'oubli lui-même — il faudrait comparer à
     la livraison précédente — mais il attrape sa trace la plus fréquente : les
     trois numéros qui divergent. */
  {
    const fs = require('fs'), chemin = require('path');
    const racine = chemin.join(__dirname, '..');
    const lire = f => fs.readFileSync(chemin.join(racine, f), 'utf8');
    const soucis = [];
    const trouve = (f, re, quoi) => {
      const m = re.exec(lire(f));
      if(!m){ soucis.push(f + ' : aucun numéro de version trouvé (' + quoi + ')'); return null; }
      return m[1];
    };
    const vSw     = trouve('sw.js',      /CACHE\s*=\s*'mes-series-(v\d+)'/,        'const CACHE');
    const vIndex  = trouve('index.html', /<meta\s+name="version"\s+content="(v\d+)"/, 'meta version');
    const vReadme = trouve('README.md',  /Version en production\s*:\s*(v\d+)/,     'ligne « Version en production »');
    if(vSw && vIndex && vReadme && !(vSw === vIndex && vIndex === vReadme))
      soucis.push('sw.js dit ' + vSw + ', index.html dit ' + vIndex + ', README.md dit ' + vReadme);
    console.log('versions      → ' + (soucis.length
      ? soucis.length + ' désaccord(s)'
      : 'sw.js, index.html et README.md disent tous ' + vSw));
    soucis.forEach(d => console.log('   ! ' + d));
    souci += soucis.length;
  }

  /* --- 11. C6 — LE SHELL DU SERVICE WORKER EST-IL COMPLET ? ---
     Un `app-*.js` ajouté à `index.html` mais oublié dans `SHELL` n'est pas mis
     en cache : l'app cesse de fonctionner hors-ligne, sur ce fichier-là
     seulement, donc en silence tant qu'on a du réseau. L'inverse — un fichier
     listé dans `SHELL` mais absent du dépôt — fait ÉCHOUER l'installation
     entière du worker (`addAll` est tout ou rien) : plus aucune mise à jour ne
     s'installe, pour personne. Le second est le plus grave, et le plus muet. */
  {
    const fs = require('fs'), chemin = require('path');
    const racine = chemin.join(__dirname, '..');
    const sw = fs.readFileSync(chemin.join(racine, 'sw.js'), 'utf8');
    const bloc = /const\s+SHELL\s*=\s*\[([\s\S]*?)\];/.exec(sw);
    const soucis = [];
    if(!bloc) soucis.push('sw.js : le tableau SHELL est introuvable');
    else{
      const dansShell = (bloc[1].match(/'\.\/(app-[^']+\.js)'/g) || [])
        .map(s => s.replace(/^'\.\//, '').replace(/'$/, ''));
      const surDisque = fs.readdirSync(racine).filter(f => /^app-.*\.js$/.test(f)).sort();
      surDisque.forEach(f=>{ if(dansShell.indexOf(f) < 0) soucis.push(f + ' : sur le disque, absent de SHELL (plus de hors-ligne)'); });
      dansShell.forEach(f=>{ if(surDisque.indexOf(f) < 0) soucis.push(f + ' : dans SHELL, absent du disque (l\'installation du worker échouera)'); });
      /* Le troisième espace de noms de la même règle : `index.html` charge-t-il
         exactement ces fichiers ? Le contrôle n° 3 a déjà été aveugle un an
         faute d'une liste tenue à jour. */
      const html = fs.readFileSync(chemin.join(racine, 'index.html'), 'utf8');
      const charges = (html.match(/<script\s+src="\.\/(app-[^"]+\.js)"/g) || [])
        .map(s => /\.\/(app-[^"]+\.js)/.exec(s)[1]);
      charges.forEach(f=>{ if(dansShell.indexOf(f) < 0) soucis.push(f + ' : chargé par index.html, absent de SHELL'); });
      console.log('shell du SW   → ' + (soucis.length
        ? soucis.length + ' écart(s)'
        : dansShell.length + ' fichiers, en accord avec le disque et index.html'));
    }
    soucis.forEach(d => console.log('   ! ' + d));
    souci += soucis.length;
  }

  /* --- 12. S6 — CE QUI EST PUBLIÉ, ET RIEN D'AUTRE ---
     GitHub Pages sert ce dépôt avec Jekyll, qui publie TOUT par défaut :
     `test.html` et ses invariants internes, les rapports, `supabase/INSTALL.md`
     et son architecture de sécurité, les fichiers SQL. `_config.yml` les retire
     de la publication — mais par une liste de ce qu'on CACHE, pas de ce qu'on
     montre. Un document interne posé demain à la racine serait donc publié en
     silence, et personne ne le verrait jamais.
     Ce contrôle renverse la liste : il exige que CHAQUE entrée de la racine soit
     ou bien un fichier dont l'app a besoin (donc légitimement public), ou bien
     exclue. C'est ce qui fait tenir une liste noire aussi bien qu'une liste
     blanche — à condition de tourner avant chaque mise en production, ce qui est
     le cas.
     Il regarde aussi l'autre sens : rien de ce que l'app charge ne doit être
     exclu. Un `app.css` ajouté à la liste par mégarde, et le site sort nu, sans
     que rien n'ait échoué. */
  {
    const fs = require('fs'), chemin = require('path');
    const racine = chemin.join(__dirname, '..');
    const soucis = [];
    let exclus = [];
    if(!fs.existsSync(chemin.join(racine, '_config.yml'))){
      soucis.push('_config.yml a disparu : tout le dépôt redevient public, y compris test.html');
    }else{
      /* Lecture volontairement bête — la seule clé attendue est `exclude`, et un
         analyseur YAML complet serait une dépendance de plus pour trois lignes. */
      const brut = fs.readFileSync(chemin.join(racine, '_config.yml'), 'utf8');
      let dedans = false;
      brut.split('\n').forEach(l => {
        if(/^exclude\s*:/.test(l)){ dedans = true; return; }
        if(dedans){
          const m = /^\s*-\s*(.+?)\s*$/.exec(l);
          if(m) exclus.push(m[1].replace(/^['"]|['"]$/g, '').replace(/\/$/, ''));
          else if(l.trim() && !/^\s*#/.test(l)) dedans = false;
        }
      });
      if(!exclus.length) soucis.push('_config.yml ne liste plus rien à exclure');
    }
    /* Ce que l'app sert, lu là où c'est déjà tenu à jour : le SHELL du worker,
       que le contrôle 11 vient de confronter au disque et à `index.html`. */
    const sw = fs.readFileSync(chemin.join(racine, 'sw.js'), 'utf8');
    const b = /const\s+SHELL\s*=\s*\[([\s\S]*?)\];/.exec(sw);
    const publie = new Set(['index.html', 'sw.js', '_config.yml']);
    if(b) (b[1].match(/'\.\/([^']*)'/g) || []).forEach(x => {
      const f = x.slice(3, -1);
      if(f) publie.add(f);
    });
    fs.readdirSync(racine).forEach(f => {
      if(f.charAt(0) === '.') return;                 // .git, .github : Jekyll ne les publie pas
      if(publie.has(f)) return;
      if(exclus.indexOf(f) < 0)
        soucis.push(f + ' : à la racine, ni servi par l\'app ni exclu — il est publié en HTTPS public');
    });
    exclus.forEach(f => {
      if(publie.has(f))
        soucis.push(f + ' : exclu de la publication alors que l\'app en a besoin — le site sortira amputé');
    });
    console.log('publication   → ' + (soucis.length
      ? soucis.length + ' écart(s)'
      : publie.size + ' fichiers publiés, ' + exclus.length + ' entrées retirées, rien qui traîne'));
    soucis.forEach(d => console.log('   ! ' + d));
    souci += soucis.length;
  }

  /* --- 13. SPEC-08, B5 — UN ABANDON VOLONTAIRE N'EST PAS UNE PANNE ---
     Depuis B3/B4, une lecture ratée devient un `echec`, et un `echec` sans
     fournée devient un bandeau « Pas de connexion ». Depuis B5, la grille coupe
     elle-même ses requêtes à chaque mot posé — et un `fetch` abandonné rejette
     exactement comme une coupure réseau. Si un seul `catch` oublie de faire la
     différence, poser un mot de plus fera clignoter une panne sur une grille en
     parfait état, de façon intermittente, donc introuvable. Le test rejouable
     tient le cas nominal ; ce contrôle tient la FORME, pour le prochain lot qui
     ajoutera un `catch` de plus sans y penser. */
  {
    const fs = require('fs'), chemin = require('path');
    const soucis = [];
    const src = fs.readFileSync(chemin.join(__dirname, '..', 'app-12-recherche.js'), 'utf8');
    let marques = 0;
    src.split('\n').forEach((ligne, i) => {
      if(ligne.indexOf('f.echec = true') < 0) return;
      marques++;
      if(ligne.indexOf('abandonneRech') < 0)
        soucis.push('app-12-recherche.js:' + (i+1) + ' — marque un échec sans demander si l\'abandon vient de nous');
    });
    if(!marques) soucis.push('app-12-recherche.js : plus aucun `f.echec = true` — ce contrôle regarde à côté');
    if(!/tmdb\('\/discover\/'\s*\+\s*f\.media[^;]*signal/.test(src))
      soucis.push('app-12-recherche.js : la requête de grille ne passe plus de signal d\'abandon a tmdb');
    console.log('abandon       → ' + (soucis.length
      ? soucis.length + ' écart(s)'
      : marques + ' marques d\'échec, toutes gardées ; la grille passe son signal'));
    soucis.forEach(d => console.log('   ! ' + d));
    souci += soucis.length;
  }

  /* --- 14. SPEC-04 §0.4 — LA COPIE CLIENT EST-ELLE ENCORE LA COPIE ? ---

     `app-14-ia.js` recopie mot pour mot les trois motifs de la règle §0.4
     depuis `functions/ia/gabarits.ts`, et le commentaire qui l'assume promet
     qu'« un test le fera remarquer » si le serveur bouge. Ce test n'existait
     pas — c'était la seule promesse fausse du lot C, relevée en relecture.

     Il ne pouvait pas vivre dans `test.html`, qui ne charge pas de TypeScript ;
     il vit donc ici, où le lanceur lit déjà des fichiers sur le disque. La
     duplication reste voulue (deux barrières qui partagent leur source n'en
     font qu'une) — ce contrôle ne la supprime pas, il la rend surveillée. */
  {
    const fs = require('fs'), chemin = require('path');
    const racine = chemin.join(__dirname, '..');
    const soucis = [];
    const js = fs.readFileSync(chemin.join(racine, 'app-14-ia.js'), 'utf8');
    const ts = fs.readFileSync(chemin.join(racine, 'supabase/functions/ia/gabarits.ts'), 'utf8');
    /* On compare les LITTÉRAUX, pas les expressions régulières construites :
       c'est la source qui doit rester identique, et c'est elle qu'on recopie. */
    const lit = (src, nom)=>{
      const m = new RegExp('const\\s+' + nom + '\\s*=\\s*([\\s\\S]*?);').exec(src);
      return m ? m[1].replace(/\s+/g, '') : null;
    };
    [['IA_AFFECT','AFFECT'], ['IA_POSSESSIF','POSSESSIF']].forEach(([cli, srv])=>{
      const a2 = lit(js, cli), b2 = lit(ts, srv);
      if(!a2 || !b2) soucis.push(cli + ' / ' + srv + ' : introuvable d\'un des deux côtés');
      else if(a2 !== b2)
        soucis.push(cli + ' ne correspond plus à ' + srv + ' de gabarits.ts — la barrière client '
                    + 'a divergé de la barrière serveur (SPEC-04 §0.4)');
    });
    /* Et les quatre motifs assemblés, dans le même ordre. On isole le tableau
       passé à `new RegExp`, on retire les commentaires (les deux fichiers n'en
       portent pas les mêmes) et les espaces, puis on compare. */
    const assemble = src=>{
      const i = src.indexOf('new RegExp(');
      if(i < 0) return null;
      const j = src.indexOf('].join(', i);
      if(j < 0) return null;
      return src.slice(i, j)
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\s+/g, '')
        /* Les deux seules différences LÉGITIMES : le préfixe `IA_` des noms
           côté client (le fichier vit dans la portée globale de l'app, où un
           `AFFECT` nu entrerait en collision), et la virgule finale. Tout le
           reste doit être identique caractère pour caractère. */
        .replace(/\bIA_/g, '')
        .replace(/,$/, '');
    };
    const mj = assemble(js), mt = assemble(ts);
    if(!mj || !mt) soucis.push('les motifs assemblés de la §0.4 sont introuvables d\'un des deux côtés');
    else if(mj !== mt)
      soucis.push('les motifs assemblés de la §0.4 ont divergé entre le client et le serveur');
    console.log('§0.4 recopiée → ' + (soucis.length
      ? soucis.length + ' divergence(s)'
      : 'client et serveur disent la même chose, motif pour motif'));
    soucis.forEach(d => console.log('   ! ' + d));
    souci += soucis.length;
  }

  /* --- 15. SPEC-04/05 — LA LISTE BLANCHE DU RELAIS N'A NI TROU NI SURPLUS ---

     Décision d'Adrien du 10/08/2026, prise en retirant `profil_humeur` : la
     liste blanche fermée de `functions/ia/config.ts` doit correspondre
     EXACTEMENT aux tâches que le front appelle. Une tâche déclarée sans
     appelant n'est pas inoffensive — elle est appelable par quiconque connaît
     l'adresse du relais et détient un jeton, elle consomme du budget et du
     quota fournisseur, et elle n'apporte rien.

     Le pendant côté serveur est un cas de `index.test.ts` qui fige la liste des
     six. Celui-ci regarde l'autre bout : tous les `appelIA('…')` du front. Les
     deux ensemble ferment la boucle — un seul des deux ne dit rien, puisque
     c'est justement leur DÉSACCORD qu'on cherche. */
  {
    const fs = require('fs'), chemin = require('path');
    const racine = chemin.join(__dirname, '..');
    const soucis = [];
    const cfg = fs.readFileSync(chemin.join(racine, 'supabase/functions/ia/config.ts'), 'utf8');
    const bloc = /export const TACHES[^{]*\{([\s\S]*?)\n\};/.exec(cfg);
    if(!bloc) soucis.push('config.ts : la table TACHES est introuvable');
    else{
      /* Les commentaires sont retirés : ils CITENT des noms de tâches (dont
         `profil_humeur`, dans le pavé qui explique son retrait), et les lire
         ferait croire à des entrées qui n'existent plus. */
      const net = bloc[1].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      const declarees = new Set((net.match(/^\s*([a-z_]+)\s*:/gm) || [])
        .map(x => x.replace(/[\s:]/g, '')));
      const appelees = new Set();
      for(const f of FICHIERS){
        const src = fs.readFileSync(chemin.join(racine, f), 'utf8');
        let m;
        const re = /appelIA\(\s*'([a-z_]+)'/g;
        while((m = re.exec(src))) appelees.add(m[1]);
      }
      [...declarees].forEach(t=>{
        if(!appelees.has(t))
          soucis.push(t + ' : déclarée dans la liste blanche, appelée par aucun écran');
      });
      [...appelees].forEach(t=>{
        if(!declarees.has(t))
          soucis.push(t + ' : appelée par le front, absente de la liste blanche — 400 garanti');
      });
      console.log('liste blanche → ' + (soucis.length
        ? soucis.length + ' écart(s)'
        : declarees.size + ' tâches déclarées, ' + appelees.size + ' appelées, aucune orpheline'));
    }
    soucis.forEach(d => console.log('   ! ' + d));
    souci += soucis.length;
  }

  /* --- 16. SPEC-07 — LA COUCHE DE PEINTURE RESTE UNE COUCHE DE PEINTURE ---

     Le §0.3 et le §1.2 de SPEC-07 sont des contraintes de DIFF, pas de
     comportement : « app.css est le seul fichier touché », « les jetons :root
     gardent leurs noms et leurs rôles », « --accent inchangé », « les nouveaux
     jetons portent tous le préfixe --px- ». Rien de tout ça ne se voit dans
     test.html, qui ne charge pas la feuille de style — mais tout se lit dans le
     fichier, et c'est ici que le dépôt lit ses fichiers.

     Ce que ce contrôle attrape, et qu'aucun autre n'attrape : le jour où
     quelqu'un « améliorera » l'accent en le passant en dégradé dans `:root`,
     des dizaines d'icônes et de textes qui le lisent deviendront illisibles,
     et rien ne le dira. */
  {
    const fs = require('fs'), chemin = require('path');
    const css = fs.readFileSync(chemin.join(__dirname, '..', 'app.css'), 'utf8');
    const soucis = [];

    const racine = /:root\{([\s\S]*?)\}/g;
    const jetons = {};
    let m;
    while((m = racine.exec(css))){
      (m[1].match(/--[a-z0-9-]+\s*:[^;]*/gi) || []).forEach(d=>{
        const i = d.indexOf(':');
        jetons[d.slice(0, i).trim()] = d.slice(i + 1).trim();
      });
    }
    /* Les jetons d'origine gardent leurs noms — tout le code des specs 04, 05
       et 06 les lit. */
    ['--bg','--surface','--surface2','--line','--text','--muted','--accent',
     '--accent-dim','--ok','--warn','--radius'].forEach(n=>{
      if(!jetons[n]) soucis.push('le jeton ' + n + ' a disparu de :root');
    });
    if(jetons['--accent'] !== '#3d8bff')
      soucis.push('--accent a changé (' + jetons['--accent'] + ') : il est lu en texte et en icône, '
                  + 'un dégradé n\'y a pas de sens — SPEC-07 §2.4');
    /* Tout jeton AJOUTÉ porte le préfixe `--px-`. */
    const connus = ['--bg','--surface','--surface2','--line','--text','--muted','--accent',
                    '--accent-dim','--ok','--warn','--radius','--safe-b','--safe-t'];
    Object.keys(jetons).forEach(n=>{
      if(connus.indexOf(n) < 0 && n.indexOf('--px-') !== 0)
        soucis.push(n + ' : un jeton ajouté sans le préfixe --px- (SPEC-07 §1.4)');
    });
    /* §0.2 — aucune salutation, nulle part. */
    if(/bonsoir|bonjour|salut\b/i.test(css))
      soucis.push('une salutation est apparue dans app.css : le §0.2 l\'écarte explicitement');
    /* §3 — SPEC-07 N'AJOUTE AUCUN PORTEUR DE `backdrop-filter` SAUF LE TOAST.
       La règle de la spec n'est pas « il n'y en a que quatre dans le dépôt » —
       il y en avait déjà plus, sur des puces et des badges posés sur une
       affiche, et ceux-là ne défilent pas et ne contiennent aucun défilement.
       La règle est : « aucun backdrop-filter NOUVEAU sur un élément qui défile
       ou contient le défilement ». On borne donc ce que la SECTION SPEC-07 a le
       droit d'ajouter, ce qui est vérifiable et suffisant : `body .toast`, et
       rien d'autre. */
    const iPremium = css.indexOf('SPEC-07 — DESIGN PREMIUM');
    if(iPremium < 0) soucis.push('la section SPEC-07 a disparu d\'app.css');
    else{
      const bloc = css.slice(iPremium).replace(/\/\*[\s\S]*?\*\//g, ' ');
      const re = /([^{}]+)\{[^{}]*backdrop-filter/g;
      let b2;
      while((b2 = re.exec(bloc))){
        const sel = b2[1].split('}').pop().trim().replace(/\s+/g, ' ');
        if(sel && sel !== 'body .toast')
          soucis.push('backdrop-filter ajouté par SPEC-07 sur « ' + sel +
                      ' » : le §3 ne l\'admet que sur le toast');
      }
    }
    /* P-1 (relecture du 10/08) — CE CONTRÔLE ÉTAIT AVEUGLE AUX SURCHARGES DE
       MISE EN PAGE, c'est-à-dire précisément là où étaient les régressions.

       `body .d4nom{font-size:31px}` (0,1,1) défaisait
       `@media (max-width:359px){ .d4nom{font-size:23px} }` (0,1,0) : une media
       query n'ajoute AUCUNE spécificité. Le piège est mécanique, donc il se
       vérifie mécaniquement : toute taille de police posée par la section
       SPEC-07 sur un sélecteur dont le socle borne la taille en petit écran
       doit être rejouée dans une media query de la section. */
    if(iPremium >= 0){
      /* Commentaires blanchis des DEUX côtés : ceux de cette section CITENT
         `.vgn` et `.filmrow` pour expliquer le repli, et les lire ferait
         accuser le code de ce que son commentaire raconte. */
      const sansCom = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ');
      const socle = sansCom(css.slice(0, iPremium));
      const bloc = sansCom(css.slice(iPremium));
      const bornes = new Set();
      const reMedia = /@media[^{]*max-width[^{]*\{([\s\S]*?)\n\s*\}/g;
      let m2;
      while((m2 = reMedia.exec(socle))){
        (m2[1].match(/\.[A-Za-z_-][A-Za-z0-9_-]*(?=[^{}]*\{[^{}]*font-size)/g) || [])
          .forEach(c => bornes.add(c));
      }
      const dansMedia = bloc.slice(bloc.search(/@media/) < 0 ? bloc.length : bloc.search(/@media/));
      /* Pas d'ancre sur le `}` précédent : elle serait CONSOMMÉE par la règle
         d'avant, et une règle sur deux passerait au travers. `[^{}@]` ne peut
         pas franchir une accolade, ce qui suffit à borner le sélecteur. */
      const reRegle = /(body\s[^{}@]*?)\{([^{}]*)\}/g;
      let m3;
      while((m3 = reRegle.exec(bloc))){
        if(!/font-size/.test(m3[2])) continue;
        (m3[1].match(/\.[A-Za-z_-][A-Za-z0-9_-]*/g) || []).forEach(c=>{
          if(!bornes.has(c)) return;
          if(dansMedia.indexOf(c) < 0)
            soucis.push(c + ' : SPEC-07 en change la taille sans rejouer la borne des petits '
                        + 'écrans — une media query n\'ajoute aucune spécificité (§1.5)');
        });
      }
      /* §3 — le repli doit pouvoir retirer quelque chose. Une ombre posée sur
         les rails par un sélecteur plus large que ceux qu'on dit retirer rend
         le repli décoratif : c'est le défaut P-2. */
      const ombres = bloc.match(/(^|\})\s*([^{}@]+?)\{[^{}]*box-shadow[^{}]*\}/g) || [];
      ombres.forEach(r=>{
        if(/\.vgn|\.filmrow/.test(r))
          soucis.push('une ombre est posée sur un rail (.vgn / .filmrow) : le repli du §3 '
                      + 'ne pourrait plus rien retirer');
      });
    }
    console.log('premium       → ' + (soucis.length
      ? soucis.length + ' écart(s)'
      : Object.keys(jetons).filter(n => n.indexOf('--px-') === 0).length +
        ' jetons --px-, --accent intact, verre borné'));
    soucis.forEach(d => console.log('   ! ' + d));
    souci += soucis.length;
  }

  await nav.close();
  console.log(souci ? '\nÉCHEC — ' + souci + ' problème(s)' : '\nTout est vert.');
  process.exit(souci ? 1 : 0);
})();
