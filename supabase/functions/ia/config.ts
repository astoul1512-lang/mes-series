// Relais IA — LA CONFIGURATION, ET RIEN QUE LA CONFIGURATION (SPEC-04 §4.2).
//
// Tout ce qui se règle sans réécrire de logique est ici : l'échelle des
// fournisseurs, les tâches autorisées, l'étage de départ de chacune, les
// budgets. Le §4.2 le demande mot pour mot — « l'ordre, les limites et les
// étages de départ sont des DONNÉES, pas du code ».
//
// CE FICHIER EST UN REPLI, PAS LA SOURCE. La source vivante est la table
// `ia_fournisseurs` (migration 014) : on la lit à chaud, et changer de
// fournisseur ou relever une limite se fait alors en une ligne de SQL, sans
// redéploiement. Les valeurs ci-dessous servent quand la table est vide ou
// injoignable — parce qu'un relais qui tombe en panne de configuration est un
// relais en panne, et que le mode dégradé doit rester silencieux.

export type Fournisseur = {
  nom: string;
  rang: number;
  modele: string;
  /* LE SECRET OÙ LIRE LA CLÉ — neuf le 01/09/2026, et c'est le champ qui rend
     les deux comptes Gemini possibles. Il valait la peine d'être ajouté plutôt
     que déduit : `relais.ts` devinait la clé à partir du NOM du fournisseur
     (`gemini…` → `GEMINI_API_KEY`), donc deux étages Gemini ne pouvaient
     matériellement pas porter deux clés différentes.
     Le NOM continue, lui, de décider du DIALECTE (Gemini ou OpenAI) : c'est le
     protocole qu'on parle, pas le compte qu'on débite. Les deux informations
     étaient confondues dans une seule ligne ; elles sont maintenant séparées. */
  cle_env: string;
  // `null` VEUT DIRE « INCONNUE », PAS « ILLIMITÉE ». Voir le pavé ci-dessous.
  limite_minute: number | null;
  limite_jour: number | null;
  actif: boolean;
};

// ---------------------------------------------------------------------------
// LES CHIFFRES, ET CE QU'ON N'A PAS PU RELEVER — 10/08/2026
//
// La spec demande de relever les limites officielles avant de les figer. Fait,
// et le résultat est en partie négatif ; il vaut mieux l'écrire ici que le
// laisser deviner à celui qui lira ce fichier dans six mois.
//
// GOOGLE NE PUBLIE PLUS SES LIMITES DE PALIER GRATUIT. La page officielle
// (ai.google.dev/gemini-api/docs/rate-limits) ne porte plus aucun tableau de
// RPM / RPD / TPM : elle renvoie au tableau de bord AI Studio, derrière
// authentification, en précisant que « specified rate limits are not
// guaranteed ». Les seuls chiffres qui circulent viennent de fils de forum, et
// on ne fige pas un compteur de production sur un fil de forum.
//
// CONSÉQUENCE, ASSUMÉE : les deux étages Gemini partent avec des limites à
// `null`. Le mécanisme du §4.2 est écrit en entier et il fonctionne — il
// n'a simplement pas encore de chiffre à appliquer sur ces deux étages-là.
// D'ici qu'Adrien lise ses vraies limites dans AI Studio et les pose en base
// (une ligne de SQL, voir INSTALL.md §8), c'est le 429 qui fait le travail :
// un fournisseur qui refuse est marqué saturé jusqu'à la fin de sa fenêtre et
// n'est plus rappelé. On DÉCOUVRE donc le 429 sur ces deux étages au lieu de
// l'éviter, une fois par fenêtre, ce que le §4.2 voulait précisément éviter.
//
// CETTE PHRASE A ÉTÉ FAUSSE PENDANT UN COMMIT, et il faut le dire ici parce que
// c'est ici qu'elle était écrite. La première version de la migration
// court-circuitait le test quand la limite valait NULL : la sentinelle posée
// par `ia_saturer` n'était jamais lue, et le 429 était redécouvert à CHAQUE
// requête, pas une fois par fenêtre. Trouvé par la relecture du 10/08 en
// jouant le SQL sur un vrai PostgreSQL, corrigé (migration 014, §6 et §7), et
// désormais tenu par `supabase/tests/014_relais_ia.test.sql` — un test SQL, pas
// un test qui vérifie qu'on appelle.
// C'est le moins mauvais des trois choix possibles :
//   · inventer un chiffre → on se croit protégé et on ne l'est pas ;
//   · refuser de livrer → le lot C attend une page web ;
//   · livrer le mécanisme sans les chiffres, et le dire → ici.
//
// OPENROUTER, LUI, PUBLIE : 20 requêtes/minute, et 50 requêtes/jour tant que le
// compte n'a pas acheté 10 $ de crédits cumulés (1 000/jour au-delà — le palier
// est acquis à vie, même si le solde retombe). Le compteur est au niveau du
// COMPTE, pas du modèle. Source : openrouter.ai/docs/api-reference/limits.
// On part sur 50 : c'est le palier d'un compte qui n'a jamais payé, donc le
// nôtre jusqu'à preuve du contraire. Se relève en une ligne, comme le reste.
//
// LES IDENTIFIANTS DE MODÈLES sont ceux du catalogue au 10/08/2026. Ils
// bougent : c'est encore une raison pour que la table l'emporte sur ce fichier.
//
// C2 (contrôle de bout en bout du 10/08) — LE PREMIER MODÈLE OPENROUTER CHOISI
// NE SAVAIT PAS FAIRE DE SORTIE STRUCTURÉE, ET L'ÉTAGE 3 REFUSAIT DONC TOUTES
// LES REQUÊTES. Appel réel : HTTP 400, « model features structured outputs not
// support ». Le catalogue le disait d'avance — `supported_parameters` de
// `inclusionai/ling-3.0-tiny:free` ne contient ni `structured_outputs` ni
// `response_format`. Il n'avait pas été lu.
//
// RÈGLE QUI EN SORT, et elle vaut pour tout modèle qu'on posera ici un jour :
// avant de choisir un modèle OpenRouter, lire son `supported_parameters` —
//     curl -s https://openrouter.ai/api/v1/models | \
//       jq '.data[] | select(.id=="<modele>") | .supported_parameters'
// — et vérifier qu'il contient `structured_outputs`. Un modèle qui ne l'a pas
// ne dégrade pas : il REFUSE, et l'étage est mort en silence.
// `nvidia/nemotron-nano-9b-v2:free` a été essayé pour de vrai le 10/08 : 200,
// JSON valide, champ `texte` présent.
// ---------------------------------------------------------------------------
/* ---------------------------------------------------------------------------
   DEUX CLÉS GEMINI, ET CE N'EST PAS UN DOUBLON — 01/09/2026

   L'échelle passe de trois à CINQ étages. Le même modèle y apparaît deux fois,
   sur deux comptes différents, et c'est tout l'objet du lot.

   POURQUOI ÇA MARCHE, ET LA CONDITION QUI LE REND VRAI. Le quota gratuit de
   Gemini se compte PAR PROJET GOOGLE CLOUD, pas par clé : deux clés du MÊME
   projet auraient partagé le même compteur, donc la bascule n'aurait rien
   apporté et aurait juste ajouté un étage qui échoue. Adrien a confirmé le
   01/09 que `GEMINI_API_KEY` et `GEMINI_API_KEY2` viennent de DEUX projets ET
   DE DEUX COMPTES distincts. C'est cette phrase-là qui justifie le lot ; si
   elle cessait d'être vraie un jour, les étages 2 et 4 deviendraient des
   allers-retours perdus. À revérifier avant d'ajouter une troisième clé.

   LES COMPTEURS SUIVENT TOUT SEULS. `ia_compteurs` est indexé par (fournisseur,
   fenêtre) et le fournisseur est un NOM : deux noms distincts, donc deux
   compteurs séparés, sans une ligne de SQL de plus. C'est la raison pour
   laquelle les nouveaux étages s'appellent `gemini-flash-2` et
   `gemini-flash-lite-2` plutôt que de partager le nom de leur jumeau.

   LES LIMITES SONT RECOPIÉES TELLES QUELLES sur le jumeau, et c'est voulu :
   ce sont les mêmes modèles chez le même fournisseur, sur un palier gratuit
   identique. Ce ne sont toujours pas les vrais chiffres de Google — personne
   ne les connaît (voir le pavé plus haut) — ce sont des bornes prudentes.

   L'ORDRE : on épuise un modèle SUR LES DEUX COMPTES avant de descendre en
   qualité. Un second compte de Flash vaut mieux qu'un premier compte de
   Flash-Lite : on ne descend que contraint, c'est la ligne de RETOUR-01
   point 4 et elle ne bouge pas.
--------------------------------------------------------------------------- */
export const FOURNISSEURS: Fournisseur[] = [
  /* Étage 1 — la qualité. Le Flash courant du catalogue Gemini.
     RETOUR-01 POINT 4 (11/08/2026) — LES LIMITES NE SONT PLUS NULLES. Elles
     l'étaient parce que Google ne les publie plus (le pavé ci-dessus le
     raconte) et que « NULL veut dire inconnue ». La conséquence mesurée en
     prod : `ia_plafond_inconnu()` vaut un million, donc le garde-fou anti-429
     était DÉSARMÉ — on découvrait la limite en la dépassant. Une limite
     prudente et fausse protège ; une limite absente ne protège rien. Ce sont
     les valeurs qu'Adrien a posées à la main le 10/08, et elles font foi. */
  { nom: "gemini-flash", rang: 1, modele: "gemini-3.6-flash",
    cle_env: "GEMINI_API_KEY", limite_minute: 10, limite_jour: 1000, actif: true },
  // Étage 2 — le MÊME modèle, le second compte. Voir le pavé ci-dessus.
  { nom: "gemini-flash-2", rang: 2, modele: "gemini-3.6-flash",
    cle_env: "GEMINI_API_KEY2", limite_minute: 10, limite_jour: 1000, actif: true },
  // Étage 3 — le volume. Limites plus hautes, réponses plus courtes.
  { nom: "gemini-flash-lite", rang: 3, modele: "gemini-3.5-flash-lite",
    cle_env: "GEMINI_API_KEY", limite_minute: 15, limite_jour: 1500, actif: true },
  // Étage 4 — le volume, second compte.
  { nom: "gemini-flash-lite-2", rang: 4, modele: "gemini-3.5-flash-lite",
    cle_env: "GEMINI_API_KEY2", limite_minute: 15, limite_jour: 1500, actif: true },
  /* Étage 5 — le secours, chez quelqu'un d'autre. Un modèle du palier gratuit
     QUI DÉCLARE `structured_outputs`, et ce mot compte : voir le pavé ci-dessous. */
  { nom: "openrouter", rang: 5, modele: "nvidia/nemotron-nano-9b-v2:free",
    cle_env: "OPENROUTER_API_KEY", limite_minute: 20, limite_jour: 50, actif: true },
];

/* UNE CLÉ ABSENTE N'EST PAS UNE ERREUR DE CONFIGURATION — c'est l'état normal
   du dépôt tant qu'Adrien n'a pas posé le secret. Sans `GEMINI_API_KEY2`, les
   étages 2 et 4 sont simplement SAUTÉS (`relais.ts` les journalise en statut 0
   et passe au suivant) et l'échelle se comporte exactement comme avant ce lot.
   C'est ce qui permet de déployer la fonction et la migration dans n'importe
   quel ordre, et de vivre indéfiniment avec une seule clé. */

/* LA CLÉ PAR DÉFAUT, POUR UNE LIGNE DE TABLE QUI N'EN PORTE PAS.
   La migration 017 remplit `cle_env` sur toutes les lignes existantes. Mais
   l'ordre de déploiement n'est pas garanti : une fonction déployée AVANT que la
   migration ne passe lira des lignes sans `cle_env`. Cette règle est celle
   qu'appliquait `relais.ts` en dur jusqu'au 01/09 — la garder ici, nommée, fait
   que le pire cas de cet entre-deux est « comme avant », jamais « aucune clé ». */
export function cleParDefaut(nom: string): string {
  return nom.indexOf("gemini") === 0 ? "GEMINI_API_KEY" : "OPENROUTER_API_KEY";
}

// Les modèles Gemini Pro de dernière génération sont hors palier gratuit
// (`gemini-3.1-pro-preview` : « Not available » en Free Tier sur la page
// pricing). Ils n'ont donc rien à faire dans l'échelle, et la spec le dit.

// ---------------------------------------------------------------------------
// LA LISTE BLANCHE DES TÂCHES (§4.1)
//
// Un `tache` inconnu part en 400. C'est la moitié de la protection : l'autre
// est qu'AUCUN PROMPT NE VIENT DU CLIENT. Le client envoie `{tache, params}`,
// le gabarit est construit ici, côté serveur. Sans ça, ce relais serait une
// API de génération de texte gratuite ouverte à qui trouve son adresse.
//
// CES ENTRÉES SONT DU CODE, PAS DES DONNÉES, contrairement à l'échelle
// des fournisseurs — les changer demande un redéploiement. Le pavé d'en-tête de
// ce fichier dit que « l'ordre, les limites et les étages de départ sont des
// données » : c'est vrai de l'ordre et des limites (table `ia_fournisseurs`),
// faux des étages de départ et des deux budgets. Relevé au second tour de
// relecture ; on corrige la phrase plutôt que de déplacer la donnée, parce
// qu'une tâche qui apparaît demande de toute façon du code.
//
// `etage_depart` est un RANG, comparé au `rang` de la table : renuméroter la
// table (10, 20, 30) viderait l'échelle sans un mot. À savoir avant d'y toucher.
//
// `etage_depart` : RETOUR-01 POINT 4 (11/08/2026) — IL VAUT 1 POUR TOUTES LES
// TÂCHES, sur décision d'Adrien. « Plus d'étages de départ par tâche : TOUTES
// les tâches IA démarrent à l'étage 1 (pertinence d'abord). »
//
// CE QUE FAISAIT L'ANCIEN RÉGLAGE, et pourquoi il tombe. Trois tâches sur six
// partaient de l'étage 2 pour « ne pas dépenser le quota du Flash sur une
// phrase de quinze mots ». C'était une économie raisonnée — mais elle
// arbitrait un quota que PERSONNE NE CONNAÎT (les limites du palier gratuit
// Gemini ne sont plus publiées, voir le pavé plus haut), au prix d'une chose
// qui, elle, se mesure : la qualité de la phrase affichée. On paie d'abord la
// pertinence, et on ne descend que contraint.
//
// LE RETOUR À L'ÉTAGE 1 EST AUTOMATIQUE, ET IL L'EST PAR CONSTRUCTION : chaque
// requête reconstruit son échelle à partir du rang 1 (`servirAccepte`), et
// `ia_reserver_fournisseur` ne refuse un fournisseur que TANT QUE sa fenêtre
// — minute ou jour — est saturée. Dès que la fenêtre se rouvre, l'étage 1
// reprend la main sans qu'aucun état ait à être remis à zéro. La cascade
// 1→2→3 ne joue donc que sur saturation minute/jour ou sur erreur, jamais par
// choix a priori.
//
// LE CHAMP RESTE, VIDE DE VARIÉTÉ MAIS PAS DE SENS : il documente qu'un étage
// de départ EST un réglage possible, et il garde la porte ouverte pour une
// tâche future qu'on voudrait volontairement mettre en second. Le supprimer
// obligerait à réécrire `servirAccepte` pour le réintroduire un jour.
// ---------------------------------------------------------------------------
export type Tache = {
  etage_depart: number;
  /* L'ÉTAGE OÙ REPARTIR SI LA PREMIÈRE RÉPONSE NE VAUT RIEN — RETOUR-10 §1
     (01/09/2026). Absent : la tâche n'escalade jamais, ce qui reste le cas de
     huit tâches sur neuf. Ce champ dit le DROIT d'escalader ; la RÈGLE — sur
     quoi on juge qu'une réponse ne vaut rien — vit dans `gabarits.ts`
     (`meriteEscalade`), avec les formes de sortie. Un `escalade_vers` posé ici
     sans règle correspondante ne fait donc rien du tout : c'est voulu, les deux
     doivent être d'accord. */
  escalade_vers?: number;
  // Longueur maximale du texte rendu, en caractères. Au-delà : rejet.
  maxlong: number;
  // Combien de titres au plus le client a le droit de faire voyager.
  maxtitres: number;
};

export const TACHES: Record<string, Tache> = {
  // Le pitch du hero. Jusqu'à trente par jour depuis RETOUR-01 point 5 (il
  // suit chaque changement de hero, plus seulement le premier du matin).
  pitch_jour:        { etage_depart: 1, maxlong: 220, maxtitres: 8 },
  // Le pitch d'une humeur : quelques mots, à la demande, plusieurs fois par
  // soirée. Étage 1 comme tout le reste depuis RETOUR-01 point 4.
  pitch_humeur:      { etage_depart: 1, maxlong: 220, maxtitres: 8 },
  // Des variantes de titres de rangées : court, une fois par jour.
  intitules_rangees: { etage_depart: 1, maxlong: 60,  maxtitres: 12 },
  //
  // ---- `profil_humeur` A ÉTÉ RETIRÉE — décision d'Adrien du 10/08/2026 ----
  //
  // Elle existait depuis le lot B et n'a JAMAIS EU D'APPELANT. La raison est
  // dans SPEC-04 §2 : le paragraphe demande à l'IA (a) d'affiner la recette
  // d'une humeur selon le profil et (b) d'écrire le pitch du hero, mais il
  // n'accorde qu'UNE requête par humeur touchée. Or `profil_humeur` rendait une
  // PHRASE de 120 caractères, pas des critères `/discover` : elle ne pouvait
  // pas affiner une requête TMDB sans qu'on se mette à deviner des mots-clés
  // dans du texte libre — exactement l'à-peu-près que le §0.4 proscrit ailleurs.
  //
  // Le lot C a donc donné la requête unique au PITCH (la seule des deux moitiés
  // qui se voit) et fait l'affinage LOCALEMENT, à partir des 👍/👎 — voir
  // `recetteAffineeHumeur` (app-14) et `requeteHumeur` (app-11).
  //
  // POURQUOI LA RETIRER PLUTÔT QUE DE LA LAISSER DORMIR : parce que cette liste
  // est une LISTE BLANCHE FERMÉE, et qu'une liste fermée qui contient une porte
  // dont personne ne se sert n'est plus fermée, elle est juste plus grande. Une
  // tâche déclarée est une tâche appelable par quiconque connaît l'adresse du
  // relais et détient un jeton : elle consomme du budget, elle consomme du
  // quota fournisseur, et elle n'apporte rien en échange.
  //
  // LA RÈGLE QUI EN DÉCOULE, et le contrôle qui la tient : cette liste doit
  // correspondre EXACTEMENT aux tâches réellement appelées par le front. Le cas
  // « la liste blanche ne contient QUE des tâches qui ont un appelant » de
  // `index.test.ts` échouera le jour où l'une des deux listes bougera sans
  // l'autre. Une tâche qu'on ajoute « pour plus tard » fera tomber ce test :
  // c'est voulu, on l'ajoutera le jour où elle sera branchée.
  //
  // Si `profil_humeur` revient un jour, ce sera avec un schéma de CRITÈRES —
  // comme `envie_phrase` — et elle remplacera alors l'affinage local.

  // ---- SPEC-05 lot B (10/08) — LES TROIS TÂCHES DE LA RECHERCHE ----
  //
  // La liste blanche s'ouvre de trois entrées et referme derrière elle : le §6
  // de SPEC-05 les nomme, et il n'en nomme pas une quatrième.
  //
  // `envie_phrase` et `ambiance_desc` ne rendent PAS du texte libre : elles
  // rendent des IDENTIFIANTS de critères, choisis dans les tables que le
  // gabarit énumère. C'est ce qui les rend sûres — un critère inventé ne
  // s'applique pas, il tombe. Elles partent de l'étage 1 : traduire une envie
  // en critères demande de la compréhension, pas de la fluidité, et une erreur
  // s'y voit tout de suite (des pilules fausses à l'écran).
  envie_phrase:      { etage_depart: 1, maxlong: 60,  maxtitres: 8  },
  ambiance_desc:     { etage_depart: 1, maxlong: 60,  maxtitres: 8  },
  // « Pourquoi il te correspond » : deux lignes, à l'ouverture d'un aperçu.
  // Étage 1 depuis RETOUR-01 point 4.
  pourquoi_lui:      { etage_depart: 1, maxlong: 220, maxtitres: 8  },
  // ---- SPEC-05 / RETOUR-01 point 8 — LE TRI « ✦ MES GOÛTS » ----
  //
  // `classer_grille` reçoit le profil agrégé et les ~100 premiers candidats
  // d'une grille de Recherche (nom, année, genres, note) et rend L'ORDRE
  // AFFINÉ — une liste d'indices, pas des titres. C'est ce qui la rend sûre :
  // un indice hors bornes tombe, un indice répété tombe, et ce qui manque
  // garde sa place locale. Le modèle ne peut donc RIEN ajouter à la grille,
  // seulement la réordonner.
  //
  // `maxtitres` vaut 100 ici, et c'est la seule tâche qui dépasse 12. Le §8 du
  // RETOUR l'impose : classer 24 478 titres par IA est impossible, classer les
  // 100 premiers d'un pré-classement local ne l'est pas. Une requête par
  // grille, cache par signature côté client.
  classer_grille:    { etage_depart: 1, maxlong: 60,  maxtitres: 100 },

  // ---- SPEC-09 LOT 0 (29/08/2026) — L'IA COMPOSE DES RANGÉES, POUR LE BANC ----
  //
  // `suggestions_famille` reçoit une FAMILLE (tout / film / serie / anime) et un
  // profil de goûts AGRÉGÉ — genres aimés, genres écartés, quelques titres 👍,
  // le podium des duels, les plateformes. Elle rend des RANGÉES : un intitulé et
  // une liste de titres, choisis de tête.
  //
  // CE QU'ELLE N'EST PAS : une source de vérité. Aucun titre rendu ici n'est
  // affiché sans avoir été retrouvé sur TMDB par le client, puis passé au tamis
  // habituel (déjà vu, écarté, « pas pour moi », genres exclus). Le modèle
  // PROPOSE des noms ; TMDB décide s'ils existent. C'est ce qui rend la tâche
  // sûre malgré une sortie beaucoup plus libre que les autres.
  //
  // `maxtitres` vaut 12 et borne ce que le CLIENT fait voyager (les titres
  // aimés). Le nombre de rangées et de titres RENDUS est borné séparément par
  // le schéma et par `valider` — les deux bornes ne parlent pas de la même
  // chose, et les confondre laisserait passer une réponse de mille lignes.
  //
  // `maxlong` = 60 : c'est la longueur d'un intitulé de rangée, la même que
  // `intitules_rangees`. Le nom d'un titre a sa propre borne dans `valider`.
  //
  // BORNE DURE DU LOT : cette tâche ne sert QUE l'écran caché « Banc d'essai
  // IA ». Rien de ce qu'elle rend n'atteint l'écran Découvrir réel tant
  // qu'Adrien n'a pas tranché sur les votes du banc.
  suggestions_famille: { etage_depart: 1, maxlong: 60, maxtitres: 12 },

  // ---- SPEC-09 LOT 1 (01/09/2026) — L'IA CONTRÔLE LES RANGÉES LOCALES ----
  //
  // `ordonner_rangee` reçoit une rangée COMPOSÉE LOCALEMENT — les vraies
  // requêtes TMDB d'« Acclamés par la critique », « Des pépites que tu as
  // ratées », « À finir en un week-end », « Les classiques à rattraper », les
  // incontournables d'une décennie — et rend deux choses : l'ORDRE affiné, et
  // les titres à ÉCARTER parce qu'ils jurent franchement avec le profil.
  //
  // CE QU'ELLE NE FAIT PAS, ET C'EST L'ÉQUILIBRE DU LOT : elle ne compose pas.
  // La source reste la requête TMDB, ce qui garantit qu'« Acclamés par la
  // critique » reste VRAI. Le schéma ne porte que des NUMÉROS : le modèle n'a
  // aucun champ pour ajouter un titre, donc la borne 1 de la spec (« le
  // contrôle n'invente rien ») est tenue par construction et non par vigilance.
  //
  // `maxtitres` vaut 40, et c'est la taille maximale d'une liste de rangée côté
  // client (`SUGG_MAX`). C'est aussi la borne des indices acceptés au retour :
  // un numéro au-delà ne désigne rien et tombe.
  //
  // `maxlong` = 60 : la longueur d'un MOTIF d'écart. Il n'est jamais affiché
  // (la spec le dit), il sert au journal — raison de plus pour qu'il soit court.
  ordonner_rangee: { etage_depart: 1, maxlong: 60, maxtitres: 40 },

  // ---- SPEC-11 (29/08/2026) — LA BARRE ✦ DEVIENT UN VRAI INTERPRÈTE ----
  //
  // « Je veux pouvoir taper "je cherche un film d'action avec Will Smith" comme
  // "je cherche le film où Leonardo DiCaprio est courtier et se drogue" » —
  // Adrien, 29/08. `envie_phrase` ne savait traduire une envie que vers les
  // dimensions de filtres existantes : ni personnes, ni description d'intrigue,
  // ni « et » entre deux genres.
  //
  // `interpreter_recherche` prend la phrase TELLE QUELLE et rend UN SEUL des
  // deux modes :
  //   · `filtres` — la phrase décrit des CRITÈRES. Même vocabulaire fermé que
  //     `envie_phrase` (`CRITERES_PERMIS`), plus trois choses neuves : des NOMS
  //     de personnes (résolus par le client sur `/search/person`), un booléen
  //     `genres_et`, et des noms de plateformes.
  //   · `titre` — la phrase DÉCRIT UN FILM PRÉCIS. Le modèle nomme 1 à 5
  //     candidats de tête, du plus probable au moins probable ; le client les
  //     vérifie sur `/search/multi` et jette ce qui n'existe pas.
  //
  // POURQUOI `envie_phrase` RESTE. Les deux tâches ne partent pas au même
  // moment : `envie_phrase` sert le routeur AUTOMATIQUE du mode ⌕ (heuristique
  // « plus de trois mots et aucun titre trouvé »), `interpreter_recherche` sert
  // la VALIDATION EXPLICITE en mode ✦. Une seule requête part par validation,
  // jamais les deux.
  //
  // `maxtitres` vaut 5 : c'est le plafond de candidats du mode `titre`, et
  // `maxlong` 80, la longueur d'un nom d'œuvre.
  //
  // ---- RETOUR-10 §1 (01/09/2026) — LA SEULE TÂCHE QUI NE PART PAS DE L'ÉTAGE 1
  //
  // Elle démarre au FLASH-LITE (rang 3) et ne remonte au modèle fort que si la
  // réponse ne vaut rien. C'est une EXCEPTION ASSUMÉE à RETOUR-01 point 4
  // (« toutes les tâches démarrent à l'étage 1, pertinence d'abord »), et elle
  // s'appuie sur des chiffres, pas sur une intuition — relevés dans
  // `ia_journal` le 31/08 sur cette tâche précisément :
  //
  //     gemini-flash        7 succès       MÉDIANE 3 983 ms  (2 910 → 7 895)
  //     gemini-flash        2 délais       8 096 ms perdus, puis bascule
  //     gemini-flash-lite   2 succès       MÉDIANE   949 ms  (945 → 953)
  //
  // Pire cas d'alors : NEUF SECONDES pour une phrase simple. Le point 4 disait
  // « on paie d'abord la pertinence » — l'argument tenait parce qu'on ne
  // pouvait pas RATTRAPER un petit modèle qui se trompe. Maintenant on le peut :
  // une réponse qui ne vaut rien fait repartir la requête sur le rang 1. On ne
  // renonce donc à aucune qualité, on renonce à la PAYER quand elle ne sert pas.
  //
  // ET POURQUOI ELLE SEULE. Découper « un film d'action avec Will Smith » en
  // critères est de l'ANALYSE DE TEXTE : le petit modèle la fait en une seconde
  // avec une régularité parfaite. Écrire le pitch du jour ou expliquer
  // « pourquoi il te correspond », non — c'est de la rédaction, elle se voit, et
  // il n'existe aucun test automatique pour dire qu'une phrase est moins bonne.
  // Les huit autres tâches gardent l'échelle d'origine, et un cas de test le
  // vérifie : la spec l'exige noir sur blanc.
  interpreter_recherche: { etage_depart: 3, escalade_vers: 1, maxlong: 80, maxtitres: 5 },
};

// ---------------------------------------------------------------------------
// LES BUDGETS DE PROTECTION (§4.2)
//
// Il y en avait DEUX, avec deux rôles différents : celui par utilisateur
// protégeait le quota contre un appareil qui s'emballe, celui global protège le
// palier gratuit et signale un abus. Dépassement → `{indisponible:true}`,
// jamais un message anxiogène côté client.
// ---------------------------------------------------------------------------
export const BUDGET_GLOBAL_JOUR = 1000;

// ---------------------------------------------------------------------------
// LE PLAFOND PAR UTILISATEUR EST SUPPRIMÉ — décision d'Adrien du 01/09/2026.
//
// SA RAISON, ET ELLE TIENT : le repli local existe partout — le relais rend
// `{indisponible:true}`, `appelIA` le mue en `null`, chaque appelant retombe
// sur le moteur local, et `CLAUDE.md` en fait une règle non négociable. Une
// panne de quota DÉGRADE donc sans casser, et un plafond individuel n'achetait
// rien qu'on ne puisse perdre.
//
// MON OBJECTION, POUR MÉMOIRE, PARCE QU'ELLE RESTE VRAIE : l'échelle des
// fournisseurs protège contre un fournisseur EN PANNE, pas contre l'app qui
// APPELLE TROP. Les quotas amont sont PARTAGÉS : une boucle sur un seul
// appareil épuise le palier gratuit et fait tomber TOUS les comptes en dégradé,
// pas seulement le fautif. Le plafond individuel bornait l'incident à un
// compte. Adrien a tranché en connaissance de cause, et la contrepartie est le
// lot de l'alerte (migration 018) : c'est maintenant le SEUL signal.
//
// COMMENT « SUPPRIMÉ » EST ÉCRIT ICI, ET POURQUOI PAS AUTREMENT. La fonction
// SQL `ia_reserver_budget` (014) refuse dès que `p_max_utilisateur <= 0`, et
// un NULL y ferait échouer la comparaison — donc refuserait TOUT. Passer le
// plafond GLOBAL comme plafond individuel est la seule écriture qui :
//   · ne peut jamais mordre avant le plafond global, donc n'existe plus ;
//   · ne touche à AUCUNE fonction SQL, donc reste sûre quel que soit l'ordre de
//     déploiement de la fonction et de la migration ;
//   · garde `ia_budget_jour` en train de COMPTER par personne — le seul endroit
//     où l'on pourra lire, après un incident, quel compte a tout consommé ;
//   · laisse intact le levier d'urgence documenté en 014 : poser 0 ici coupe
//     l'IA pour tout le monde, tout de suite.
export const BUDGET_UTILISATEUR_JOUR = BUDGET_GLOBAL_JOUR;

// Une seule tentative par fournisseur, huit secondes chacune (§4.2).
//
// « BORNÉ À 24 S », DISAIT CETTE PHRASE, ET ELLE ÉTAIT FAUSSE. Le second tour de
// relecture a compté : une requête complète part en seize appels sortants
// séquentiels, et treize n'avaient aucun délai — l'authentification, la lecture
// de la table, les cinq RPC, les quatre écritures de journal. Une base qui pend,
// et la fonction pendait avec elle, jusqu'au plafond de la plateforme.
// Corrigé : `relais.ts` arme un délai sur TOUS ses appels, trois secondes pour
// la base (`TIMEOUT_BASE_MS`), huit pour un fournisseur qui rédige. Le pire cas
// est donc maintenant borné pour de bon, aux alentours de 3 × 8 s d'IA plus une
// douzaine d'appels de base à 3 s — et un test refuse désormais qu'un seul appel
// sortant parte sans minuteur.
export const TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// LE TEMPS DE LA REQUÊTE ENTIÈRE — 20 S, ET C'EST LE PRIX DES CINQ ÉTAGES
//
// 01/09/2026. L'échelle passait de trois étages à cinq, donc le pire cas passait
// mécaniquement de 24 s à QUARANTE (5 × 8 s de délai fournisseur), et personne
// ne l'avait demandé. Quarante secondes d'attente, ce n'est plus un mode
// dégradé, c'est une page qui a l'air cassée — et ce lot arrive justement en
// même temps que RETOUR-10, dont tout l'objet est de rendre la recherche plus
// RAPIDE. Ajouter des étages sans borner le total aurait défait l'autre lot.
//
// AVANT D'ATTAQUER UN NOUVEL ÉTAGE, on regarde l'heure : au-delà de ce budget,
// on s'arrête et on rend `{indisponible:true}`, c'est-à-dire l'écran normal.
// Le contrôle est posé AVANT l'étage et jamais pendant : couper un appel en
// cours ferait payer un travail qu'on jetterait.
//
// POURQUOI UN BUDGET DE TEMPS ET PAS UN NOMBRE D'ÉTAGES. Parce que les étages
// ne coûtent pas tous la même chose : un compteur saturé, une clé absente ou un
// 429 immédiat se traversent en quelques millisecondes. Compter les étages
// aurait fermé l'échelle après trois refus instantanés, alors qu'il restait
// tout le temps du monde pour essayer les deux suivants. On borne ce qui gêne
// — l'attente — pas ce qui est gratuit.
//
// 20 s : deux étages lents (16 s) plus la dizaine d'allers-retours de base qui
// les accompagnent. C'est DÉJÀ plus serré que les 24 s d'avant ce lot.
export const TIMEOUT_REQUETE_MS = 20000;

// ---------------------------------------------------------------------------
// LE PLAFOND DE JETONS DE SORTIE — 2 000, ET CE N'EST PAS DU CONFORT
//
// C1 (contrôle de bout en bout du 10/08). Il valait 400, et l'étage 1 ne rendait
// JAMAIS un texte utilisable. Sur cette génération de modèles, `maxOutputTokens`
// est le plafond COMMUN aux jetons de réflexion et à la réponse. Appel réel :
//
//     finishReason        : MAX_TOKENS
//     thoughtsTokenCount  : 383      ← la réflexion
//     candidatesTokenCount: 2        ← ce qui restait pour écrire
//     texte reçu          : {"texte
//
// Sept caractères. `JSON.parse` échoue, la réponse est jugée invalide, le client
// reçoit `{indisponible:true}` — et comme une réponse malformée ne fait pas
// descendre l'échelle (§4.4, à raison), `pitch_jour` et `profil_humeur` étaient
// indisponibles À 100 %, tous les jours, sans jamais atteindre l'étage 2 qui
// marche pourtant.
//
// 549 jetons de réflexion pour une consigne de 47 : 400 n'était pas « un peu
// juste », c'était hors sujet d'un facteur cinq.
//
// ET NON, ON N'ÉTEINT PAS LA RÉFLEXION : `thinkingConfig: {thinkingBudget: 0}`
// a été essayé sur la vraie API, il rend HTTP 400 `INVALID_ARGUMENT`. Ce modèle
// refuse. La seule voie est de laisser la place.
export const MAX_JETONS_SORTIE = 2000;

// Les origines autorisées. MÊME LISTE que le relais TMDB, et c'est voulu : deux
// listes qui décrivent la même chose divergent le jour où l'une est mise à jour
// sans l'autre.
export const ORIGINES: string[] = [
  "https://astoul1512-lang.github.io",
  "http://localhost:8099",
  "http://127.0.0.1:8099",
];
