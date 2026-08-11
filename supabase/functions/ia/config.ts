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
    limite_minute: 10, limite_jour: 1000, actif: true },
  // Étage 2 — le volume. Même clé, limites plus hautes, réponses plus courtes.
  { nom: "gemini-flash-lite", rang: 2, modele: "gemini-3.5-flash-lite",
    limite_minute: 15, limite_jour: 1500, actif: true },
  /* Étage 3 — le secours, chez quelqu'un d'autre. Un modèle du palier gratuit
     QUI DÉCLARE `structured_outputs`, et ce mot compte : voir le pavé ci-dessous. */
  { nom: "openrouter", rang: 3, modele: "nvidia/nemotron-nano-9b-v2:free",
    limite_minute: 20, limite_jour: 50, actif: true },
];

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
};

// ---------------------------------------------------------------------------
// LES BUDGETS DE PROTECTION (§4.2)
//
// Deux plafonds, deux rôles différents. Celui par utilisateur protège le quota
// contre un appareil qui s'emballe ; celui global protège le palier gratuit ET
// signale un abus. Dépassement → `{indisponible:true}`, jamais un message
// anxiogène côté client.
// ---------------------------------------------------------------------------
export const BUDGET_UTILISATEUR_JOUR = 30;   // l'usage nominal est de 5 à 6
export const BUDGET_GLOBAL_JOUR = 1000;

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
