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
// ---------------------------------------------------------------------------
export const FOURNISSEURS: Fournisseur[] = [
  // Étage 1 — la qualité. Le Flash courant du catalogue Gemini.
  { nom: "gemini-flash", rang: 1, modele: "gemini-3.6-flash",
    limite_minute: null, limite_jour: null, actif: true },
  // Étage 2 — le volume. Même clé, limites plus hautes, réponses plus courtes.
  { nom: "gemini-flash-lite", rang: 2, modele: "gemini-3.5-flash-lite",
    limite_minute: null, limite_jour: null, actif: true },
  // Étage 3 — le secours, chez quelqu'un d'autre. Un modèle du palier gratuit.
  { nom: "openrouter", rang: 3, modele: "inclusionai/ling-3.0-tiny:free",
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
// `etage_depart` : le §4.2 le demande par tâche. On ne dépense pas le quota du
// Flash pour une phrase de quinze mots — les tâches courtes et fréquentes
// partent directement de l'étage 2. Le repli vers l'étage suivant reste piloté
// par les compteurs, quel que soit l'étage de départ.
// ---------------------------------------------------------------------------
export type Tache = {
  etage_depart: number;
  // Longueur maximale du texte rendu, en caractères. Au-delà : rejet.
  maxlong: number;
  // Combien de titres au plus le client a le droit de faire voyager.
  maxtitres: number;
};

export const TACHES: Record<string, Tache> = {
  // Le pitch du jour : une fois par jour et par personne, il mérite l'étage 1.
  pitch_jour:        { etage_depart: 1, maxlong: 220, maxtitres: 8 },
  // Le pitch d'une humeur : quelques mots, à la demande, plusieurs fois par
  // soirée. Étage 2 d'emblée.
  pitch_humeur:      { etage_depart: 2, maxlong: 220, maxtitres: 8 },
  // L'affinage d'une recette selon le profil : c'est de la sélection
  // éditoriale, elle part de l'étage 1.
  profil_humeur:     { etage_depart: 1, maxlong: 120, maxtitres: 12 },
  // Des variantes de titres de rangées : court et fréquent, étage 2.
  intitules_rangees: { etage_depart: 2, maxlong: 60,  maxtitres: 12 },
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

// Une seule tentative par fournisseur, huit secondes chacune (§4.2). Le total
// est donc borné à 24 s dans le pire cas, trois étages compris — au-delà, le
// client a de toute façon abandonné.
export const TIMEOUT_MS = 8000;

// Les origines autorisées. MÊME LISTE que le relais TMDB, et c'est voulu : deux
// listes qui décrivent la même chose divergent le jour où l'une est mise à jour
// sans l'autre.
export const ORIGINES: string[] = [
  "https://astoul1512-lang.github.io",
  "http://localhost:8099",
  "http://127.0.0.1:8099",
];
