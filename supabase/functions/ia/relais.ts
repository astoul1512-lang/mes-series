// Relais IA pour « Mes Séries » — la logique, séparée du point d'entrée.
// SPEC-04 §4, lot B. 10/08/2026.
//
// RAISON D'ÊTRE, en une phrase : les clés des fournisseurs d'IA ne doivent
// jamais quitter le serveur, et le client ne doit jamais pouvoir écrire un
// prompt. Tout le reste de ce fichier découle de ces deux règles.
//
// POURQUOI CE FICHIER EST SÉPARÉ D'`index.ts` — même raison que le relais TMDB
// (S1, 09/08) : `index.ts` appelle `Deno.serve`, donc l'importer depuis un test
// ouvrirait un vrai serveur sur un vrai port. La logique vit ici et n'ouvre
// rien. `supabase functions deploy` embarque les modules importés par l'entrée,
// le déploiement ne change pas de commande.
//
// CE QUI DIFFÈRE DU RELAIS TMDB, ET POURQUOI :
//   · JETON OBLIGATOIRE. TMDB répond à qui n'a pas encore de compte, parce que
//     c'est le but — voir l'app avant de s'inscrire. L'IA coûte de l'argent à
//     quelqu'un : elle est réservée aux comptes connectés (§4.1).
//   · DES COMPTEURS. TMDB a un quota large et une clé à nous. Ici on partage un
//     palier gratuit avec le monde entier : on compte avant d'appeler.
//   · JAMAIS D'ERREUR BRUTE. Un relais TMDB en panne, c'est un écran de
//     recherche vide, et il faut le dire. Une IA en panne, c'est un écran
//     NORMAL : on rend `{indisponible:true}` en HTTP 200 et le client retombe
//     sur ses textes d'origine, sans un mot (§4.4).

import {
  BUDGET_GLOBAL_JOUR, BUDGET_UTILISATEUR_JOUR, cleParDefaut, FOURNISSEURS,
  MAX_JETONS_SORTIE, ORIGINES, TACHES, TIMEOUT_MS, TIMEOUT_REQUETE_MS,
  type Fournisseur,
} from "./config.ts";
import { construire, meriteEscalade, valider } from "./gabarits.ts";

const URL_SB = () => Deno.env.get("SUPABASE_URL") || "";
const CLE_ADMIN = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ---------------------------------------------------------------------------
// QUI A LE DROIT D'APPELER — la même règle que le relais TMDB, au mot près.
//
// Copiée volontairement plutôt que partagée : les deux fonctions sont déployées
// séparément, et un import entre dossiers de fonctions ne survit pas au
// paquetage. La liste des origines, elle, est bien commune (`config.ts`).
// Trois cas, un seul refus : origine connue → on répond ; origine inconnue →
// 403 ; pas d'origine → on répond SAUF si le navigateur annonce lui-même une
// requête d'un autre site (`Sec-Fetch-Site: cross-site`).
// ---------------------------------------------------------------------------
export function appelAccepte(origine: string | null, site: string | null): boolean {
  if (origine) return ORIGINES.includes(origine);
  return site !== "cross-site";
}

export function entetesCors(origine: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin, Sec-Fetch-Site",
  };
  if (origine) h["Access-Control-Allow-Origin"] = origine;
  return h;
}

function json(corps: unknown, statut: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
// LA RÉPONSE DE REPLI, ET ELLE EST EN HTTP 200. Le §4.2 l'exige : « jamais une
// erreur brute au client ». Un 503 déclencherait les journaux d'erreur du
// navigateur et, pire, tenterait quelqu'un d'écrire un `retry` côté client —
// ce que le §4.4 interdit.
function indisponible(cors: Record<string, string>) {
  return json({ indisponible: true }, 200, cors);
}

// ---------------------------------------------------------------------------
// L'accès à la base, par PostgREST et avec la clé de service.
//
// Les quatre tables du lot sont en RLS SANS AUCUNE POLICY (migration 014) :
// personne ne les lit ni ne les écrit, sauf la clé de service, qui passe
// au-dessus. C'est la posture la plus fermée possible, et elle est la bonne :
// ces tables ne contiennent que de la comptabilité, aucun écran n'en a besoin.
// ---------------------------------------------------------------------------
/* ---------------------------------------------------------------------------
   UN DÉLAI SUR *TOUS* LES APPELS SORTANTS, PAS SEULEMENT SUR LES FOURNISSEURS.

   R-1 (relecture du 10/08, second tour). `config.ts` promettait « borné à 24 s
   dans le pire cas, trois étages compris ». Mesuré : une requête complète part
   en SEIZE appels sortants séquentiels, et TREIZE n'avaient aucun délai —
   l'authentification, la lecture de la table, les cinq RPC, les quatre écritures
   de journal. Une base qui pend, et la fonction pendait avec elle, jusqu'au
   plafond de la plateforme.

   Deux délais, parce que ce ne sont pas les mêmes attentes : huit secondes pour
   un fournisseur d'IA qui rédige, trois pour la base, qui doit répondre en
   millisecondes ou pas du tout.
--------------------------------------------------------------------------- */
export const TIMEOUT_BASE_MS = 3000;

/* LE BUDGET DE TEMPS DE LA REQUÊTE EST UNE VARIABLE, ET C'EST POUR LES TESTS.
   Sa valeur de production est `TIMEOUT_REQUETE_MS` (20 s) et rien ne la change
   jamais en service. Mais un cas qui vérifie que l'échelle s'arrête au bout du
   budget devrait sinon attendre vingt secondes pour le prouver — donc il ne
   serait pas écrit, donc la borne ne serait tenue par personne. Même raison
   que `CACHE_FOURNISSEURS_MS` : ce qu'un test ne peut pas figer, il ne le
   vérifie pas. Le nom dit à quoi ça sert, pour qu'on ne l'appelle pas ailleurs. */
let budgetTempsMs = TIMEOUT_REQUETE_MS;
export function bornerTempsRequetePourTest(ms: number) {
  budgetTempsMs = ms > 0 ? ms : TIMEOUT_REQUETE_MS;
}

function minuteur(ms: number): { signal?: AbortSignal; fini: () => void } {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(ms), fini: () => {} };
  }
  if (typeof AbortController === "undefined") return { fini: () => {} };
  const c = new AbortController();
  const t = setTimeout(() => { try { c.abort(); } catch (_e) { /* déjà fini */ } }, ms);
  return { signal: c.signal, fini: () => clearTimeout(t) };
}

/* R-δ (relecture du 10/08, troisième tour) — LE MINUTEUR DOIT COUVRIR LA LECTURE
   DU CORPS, PAS SEULEMENT L'EN-TÊTE.
   La version d'origine rendait la `Response` et désarmait dans son `finally` :
   le `await r.text()` de l'appelant se faisait donc HORS minuteur. Sur Deno,
   `AbortSignal.timeout` court tout seul et l'oubli est inoffensif ; sur le repli
   `AbortController`, la lecture d'un corps qui n'arrive jamais était sans
   limite. Un repli qui ne replie qu'à moitié est un piège pour plus tard.
   D'où la forme générique : l'appelant fait TOUT son travail dans le rappel. */
async function avecDelai<T>(f: (s?: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const m = minuteur(ms);
  try { return await f(m.signal); } finally { m.fini(); }
}

/* EXPORTÉE POUR ÊTRE ÉPROUVÉE, et c'est la relecture du 10/08 qui l'a rendue
   nécessaire. Le défaut du 204 ci-dessous n'est visible NULLE PART depuis
   `servir` : les trois appels concernés (`ia_saturer`, `ia_rendre_budget`,
   `ia_rendre_fournisseur`) sont tous sous `try/catch`, donc une fausse erreur y
   ressemble trait pour trait à un succès. Un défaut qu'aucun test ne peut voir
   par l'extérieur se teste par l'intérieur, ou ne se teste pas. */
export async function rpc(nom: string, args: Record<string, unknown>): Promise<unknown> {
  return await avecDelai(async (signal) => {
    const r = await fetch(URL_SB() + "/rest/v1/rpc/" + nom, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: CLE_ADMIN(),
        Authorization: "Bearer " + CLE_ADMIN(),
      },
      body: JSON.stringify(args),
      signal,
    });
    if (!r.ok) throw new Error("rpc " + nom + " : " + r.status);
    /* UNE FONCTION SQL QUI REND `void` FAIT RÉPONDRE 204 SANS CORPS, et
       `r.json()` lève alors sur une réponse parfaitement réussie. Relevé à la
       relecture du 10/08 : l'appel avait bien eu lieu, mais il PARAISSAIT
       échouer, et le `catch` de l'appelant avalait la fausse erreur. Un appel
       qui réussit ne doit pas ressembler à un appel qui rate.
       ÉPROUVÉ EN PRODUCTION au troisième tour : `ia_rendre_fournisseur` répond
       bien 204 sans corps à travers PostgREST. */
    const texte = await r.text();
    if (!texte) return null;
    try { return JSON.parse(texte); } catch (_e) { return null; }
  }, TIMEOUT_BASE_MS);
}

// ---------------------------------------------------------------------------
// L'échelle des fournisseurs : la table d'abord, le fichier en repli.
//
// Mise en cache une minute dans l'instance. Sans ce cache, chaque requête IA
// paierait un aller-retour en base juste pour relire trois lignes qui ne
// changent jamais. Une minute, c'est aussi le délai au bout duquel un
// changement de configuration se voit — assez court pour qu'on n'attende pas,
// assez long pour que ça ne coûte rien.
// ---------------------------------------------------------------------------
/* La durée de vie du cache est une CONSTANTE EXPORTÉE, pas un nombre au milieu
   d'une condition : c'est la seule façon qu'un test la fige. Mutation survivante
   au 10/08 — la porter à 24 h ne faisait broncher personne. */
export const CACHE_FOURNISSEURS_MS = 60000;

let cacheFournisseurs: { quand: number; l: Fournisseur[] } | null = null;
export function oublierFournisseurs() { cacheFournisseurs = null; }

/* UNE LIGNE DE TABLE N'EST PAS UN `Fournisseur` PARCE QU'ON L'A DÉCLARÉ.
   B-b et R-10 (relecture du 10/08, second tour). La version d'origine faisait
   `d as Fournisseur[]` — une promesse au compilateur, aucune vérification à
   l'exécution. Quatre façons de tomber, toutes jouées par le relecteur :
     · `nom` absent, `null` ou numérique → `f.nom.indexOf(…)` lève, HORS du
       `try` d'`appeler`, donc HTTP 500 brut ;
     · `rang` absent → `undefined >= etage` est faux, l'étage DISPARAÎT en
       silence, sans même une ligne de journal ;
     · `rang` en texte ou négatif → l'échelle s'inverse sans un mot ;
     · deux lignes du même `nom` → le même fournisseur est appelé deux ou trois
       fois dans une requête, contre le « une seule tentative chacun » du §4.2,
       et les compteurs sont tenus sur ce `nom`.
   Une ligne mal formée est donc ÉCARTÉE, pas rafistolée : la table est éditée à
   la main, et une ligne qu'on ne comprend pas ne doit pas décider d'un appel.

   `cle_env` (01/09/2026) EST LA SEULE COLONNE QUI A LE DROIT DE MANQUER, et
   c'est réfléchi : une fonction déployée avant que la migration 017 ne passe
   lit des lignes qui ne la portent pas encore. Écarter ces lignes-là viderait
   l'échelle entière au pire moment — c'est-à-dire pendant un déploiement. Elle
   retombe donc sur `cleParDefaut`, qui est exactement la règle qu'appliquait ce
   fichier en dur jusqu'à ce lot. Une colonne PRÉSENTE mais vide, en revanche,
   est une ligne qu'on ne comprend pas : elle est écartée comme les autres. */
function fournisseurValide(x: unknown): Fournisseur | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const nom = typeof o.nom === "string" ? o.nom.trim() : "";
  const modele = typeof o.modele === "string" ? o.modele.trim() : "";
  const rang = Number(o.rang);
  if (!nom || !modele || !isFinite(rang) || rang < 1) return null;
  const aCle = o.cle_env !== null && o.cle_env !== undefined;
  const cle_env = typeof o.cle_env === "string" ? o.cle_env.trim() : "";
  if (aCle && !cle_env) return null;
  const limite = (v: unknown) => {
    const n = Number(v);
    return (v === null || v === undefined || !isFinite(n) || n < 0) ? null : Math.floor(n);
  };
  return {
    nom, modele, rang,
    cle_env: cle_env || cleParDefaut(nom),
    limite_minute: limite(o.limite_minute),
    limite_jour: limite(o.limite_jour),
    actif: o.actif !== false,
  };
}

export async function lireFournisseurs(): Promise<Fournisseur[]> {
  if (cacheFournisseurs && Date.now() - cacheFournisseurs.quand < CACHE_FOURNISSEURS_MS) {
    return cacheFournisseurs.l;
  }
  let l: Fournisseur[] = [];
  try {
    const d = await avecDelai(async (signal) => {
      const r = await fetch(
        URL_SB() + "/rest/v1/ia_fournisseurs?select=*&actif=is.true&order=rang.asc",
        { headers: { apikey: CLE_ADMIN(), Authorization: "Bearer " + CLE_ADMIN() }, signal },
      );
      return r.ok ? await r.json() : null;
    }, TIMEOUT_BASE_MS);
    {
      if (Array.isArray(d)) {
        const vus: Record<string, true> = {};
        for (const ligne of d) {
          const f = fournisseurValide(ligne);
          // Le premier `nom` gagne : la table est triée par rang, donc c'est
          // l'étage le plus haut qui l'emporte sur son doublon.
          if (f && f.actif && !Object.prototype.hasOwnProperty.call(vus, f.nom)) {
            vus[f.nom] = true;
            l.push(f);
          }
        }
      }
    }
  } catch (_e) { /* base injoignable : on prend le repli, sans bruit */ }
  if (!l.length) l = FOURNISSEURS.filter((f) => f.actif);
  l = l.slice().sort((a, b) => a.rang - b.rang);
  /* L'HORODATAGE SE PREND APRÈS LA LECTURE, pas avant : une lecture lente
     vieillissait le cache de sa propre durée. */
  cacheFournisseurs = { quand: Date.now(), l };
  return l;
}

// ---------------------------------------------------------------------------
// APPELER UN FOURNISSEUR — une tentative, huit secondes, jamais deux.
//
// Deux dialectes, une seule forme de retour. Gemini parle `generateContent` et
// impose son schéma par `responseMimeType` + `responseSchema` ; OpenRouter parle
// le dialecte OpenAI et impose le sien par `response_format`. Les deux savent
// rendre du JSON structuré, et c'est la seule chose qui compte ici : une
// réponse en prose libre serait invalidée à la porte de toute façon.
//
// LE STATUT REMONTE AVEC LA RÉPONSE, et ce n'est pas cosmétique : c'est lui qui
// distingue « ce fournisseur est plein » (429, on le marque saturé pour la
// fenêtre) de « ce fournisseur a hoqueté » (5xx, on passe au suivant sans rien
// conclure).
// ---------------------------------------------------------------------------
type Reponse = { ok: boolean; statut: number; brut: unknown; attente: number };

/* `Retry-After` a DEUX formes légales (RFC 7231) : un nombre de secondes, ou une
   date HTTP. R-3 (relecture du 10/08, second tour) : on ne lisait que la
   première, donc une date rendait `NaN`, `attente` retombait à 0, et on murait
   la minute. Or la date est justement la forme employée pour un reset de quota
   JOURNALIER — le seul cas pour lequel la branche « jour » a été écrite. Elle ne
   pouvait donc jamais s'exécuter. */
export function attenteDe(entete: string | null): number {
  if (!entete) return 0;
  const secondes = Number(entete.trim());
  if (isFinite(secondes) && entete.trim() !== "") return Math.max(0, secondes);
  const date = Date.parse(entete);
  if (!isNaN(date)) return Math.max(0, Math.round((date - Date.now()) / 1000));
  return 0;
}

/* LE NOM DIT LE DIALECTE, `cle_env` DIT LE COMPTE — et il a fallu séparer les
   deux (01/09/2026). Cette ligne lisait `GEMINI_API_KEY` dès que le nom
   commençait par `gemini`, ce qui rendait deux comptes Gemini impossibles :
   c'était LE point en dur du lot des deux clés. Le nom garde son autre rôle,
   celui-là légitime — savoir si on parle `generateContent` ou le dialecte
   OpenAI. Un fournisseur qui parlerait un troisième dialecte demanderait une
   colonne de plus, pas un nom bien choisi. */
async function appeler(f: Fournisseur, consigne: string, schema: Record<string, unknown>): Promise<Reponse> {
  const m = minuteur(TIMEOUT_MS);
  const gemini = f.nom.indexOf("gemini") === 0;
  const cle = Deno.env.get(f.cle_env) || "";
  if (!cle) { m.fini(); return { ok: false, statut: 0, brut: null, attente: 0 }; }

  let url: string, entetes: Record<string, string>, corps: unknown;
  if (gemini) {
    url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(f.modele) + ":generateContent";
    entetes = { "Content-Type": "application/json", "x-goog-api-key": cle };
    corps = {
      contents: [{ role: "user", parts: [{ text: consigne }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.7,
        maxOutputTokens: MAX_JETONS_SORTIE,
      },
    };
  } else {
    url = "https://openrouter.ai/api/v1/chat/completions";
    entetes = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + cle,
      // Identifient l'app auprès d'OpenRouter. Facultatifs, et sans donnée
      // personnelle : c'est le SITE qu'on nomme, pas la personne.
      "HTTP-Referer": ORIGINES[0],
      "X-Title": "Mes Series",
    };
    corps = {
      model: f.modele,
      messages: [{ role: "user", content: consigne }],
      temperature: 0.7,
      max_tokens: MAX_JETONS_SORTIE,
      response_format: {
        type: "json_schema",
        json_schema: { name: "sortie", strict: true, schema: { ...schema, additionalProperties: false } },
      },
    };
  }

  try {
    const r = await fetch(url, {
      method: "POST", headers: entetes, body: JSON.stringify(corps), signal: m.signal,
    });
    if (!r.ok) {
      /* `Retry-After` DÉCIDE DE LA FENÊTRE À MURER, et c'est le seul signal
         honnête dont on dispose : un 429 ne dit pas de lui-même s'il vient du
         rythme ou du quota du jour. Plus de deux minutes d'attente demandée,
         c'est un quota journalier ; en dessous, c'est du rythme. Sans en-tête,
         on mure la minute — se tromper d'une minute coûte une minute, se
         tromper d'un jour coûte un jour. */
      return { ok: false, statut: r.status, brut: null,
               attente: attenteDe(r.headers.get("Retry-After")) };
    }
    const d = await r.json();
    /* STATUT 4 — LE FOURNISSEUR N'A PAS FINI. Traité comme un échec d'étage, donc
       on descend l'échelle. Voir `tronquee` ci-dessus : c'est C1. */
    if (tronquee(gemini, d)) return { ok: false, statut: 4, brut: null, attente: 0 };
    return { ok: true, statut: 200, brut: extraire(gemini, d), attente: 0 };
  } catch (_e) {
    // Délai dépassé ou réseau coupé : traité comme une panne du fournisseur,
    // pas comme une saturation. On passe au suivant.
    return { ok: false, statut: 599, brut: null, attente: 0 };
  } finally { m.fini(); }
}

/* ---------------------------------------------------------------------------
   TRONQUÉE N'EST PAS INVALIDE, ET LA DIFFÉRENCE COÛTE DEUX TÂCHES SUR QUATRE.

   C1 (contrôle de bout en bout du 10/08). Une réponse coupée au plafond de
   jetons arrive en HTTP 200 avec un JSON incomplet. L'ancienne lecture la
   traitait comme « le fournisseur a mal répondu » — donc dégradé silencieux,
   SANS descendre l'échelle, ce qui est le bon choix pour une vraie mauvaise
   réponse. Mais un fournisseur qui n'a pas FINI n'a pas mal répondu : il n'a pas
   répondu. Le distinguer, c'est ce qui permet de passer à l'étage suivant au
   lieu de rendre `{indisponible:true}` à tout le monde tous les jours.

   Les deux dialectes le disent, chacun à sa façon : `finishReason` chez Gemini
   (`STOP` = fini, `MAX_TOKENS` = coupé), `finish_reason` chez OpenRouter
   (`stop` = fini, `length` = coupé).
--------------------------------------------------------------------------- */
function tronquee(gemini: boolean, d: unknown): boolean {
  const o = d as Record<string, any>;
  const raison = gemini
    ? o?.candidates?.[0]?.finishReason
    : o?.choices?.[0]?.finish_reason;
  if (typeof raison !== "string") return false;   // absent : on ne suppose rien
  const r = raison.toUpperCase();
  return r === "MAX_TOKENS" || r === "LENGTH";
}

// Le JSON utile, quel que soit l'emballage. Un fournisseur qui rend du texte
// non analysable rend `null`, ce que la validation traduira en dégradé.
function extraire(gemini: boolean, d: unknown): unknown {
  try {
    const o = d as Record<string, any>;
    const t = gemini
      ? o?.candidates?.[0]?.content?.parts?.[0]?.text
      : o?.choices?.[0]?.message?.content;
    if (typeof t !== "string") return null;
    return JSON.parse(t);
  } catch (_e) { return null; }
}

// ---------------------------------------------------------------------------
// LE JOURNAL (§4.2) — jour, tâche, fournisseur, résultat, durée. RIEN D'AUTRE.
//
// Pas de prompt, pas de réponse, pas d'identifiant d'utilisateur. Deux raisons
// et elles se valent : la vie privée, et le poids d'une table qui grossirait de
// plusieurs kilo-octets par appel. Ce qu'on veut savoir de ce journal, c'est
// « qu'est-ce qui se consomme, et est-ce que ça tient ? » — quatre colonnes y
// répondent.
//
// Il n'est jamais bloquant : un journal qui tombe ne doit pas emporter la
// réponse qu'il journalise.
// ---------------------------------------------------------------------------
/* R2 (relecture du 10/08) — UNE LIGNE PAR ÉTAGE TENTÉ, ET UN STATUT.
   Avant : une seule ligne par requête, et un booléen. Un 429 sur l'étage 1
   suivi d'un succès sur l'étage 2 ne laissait qu'une trace, « flash-lite, ok » —
   le 429 était invisible. Et « échec » ne distinguait pas un quota plein, un
   délai dépassé, un schéma refusé et une clé absente.
   Pour régler les budgets, ça suffisait. Pour le contrôle de bout en bout — le
   SEUL moyen d'éprouver ce que personne n'a pu tester, l'API Gemini et la
   sortie structurée d'OpenRouter — c'était aveugle : un échec silencieux y
   ressemble trait pour trait à un dégradé qui fonctionne.
   Les codes hors HTTP : 0 clé absente · 1 réponse invalide · 2 quota local plein
   (aucun appel) · 3 budget refusé · 4 réponse TRONQUÉE (le fournisseur n'a pas
   fini — C1) · 5 étage non tenté, temps de requête épuisé (01/09) · 599 délai
   ou réseau. */
/* R-5 (relecture du 10/08, second tour) — `duree_ms` EST LA DURÉE DE L'ÉTAGE,
   plus celle de la requête entière. On passait `Date.now() - debut`, l'écoulé
   depuis l'entrée dans `servir` : mesuré, trois étages à 300 ms rendaient 306,
   609 et 911 ms. La requête d'exploitation d'INSTALL.md
   (`avg(duree_ms) group by fournisseur`) surévaluait donc systématiquement les
   étages du bas de l'échelle — c'est-à-dire le chiffre même sur lequel le §4.2
   demande de régler les budgets.

   LES CINQ CLÉS DU CORPS SONT ÉNUMÉRÉES ICI ET NULLE PART AILLEURS. Le §4.2 les
   fixe : ni prompt, ni réponse, ni identifiant de personne. Un test vérifie la
   liste exacte — sans lui, ajouter `uid` un jour de fatigue ne casserait rien. */
async function journaliser(
  tache: string, fournisseur: string | null, ok: boolean, statut: number, duree: number,
) {
  try {
    await avecDelai((signal) => fetch(URL_SB() + "/rest/v1/ia_journal", {  // corps ignoré
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: CLE_ADMIN(),
        Authorization: "Bearer " + CLE_ADMIN(),
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ tache, fournisseur, ok, statut, duree_ms: Math.round(duree) }),
      signal,
    }), TIMEOUT_BASE_MS);
  } catch (_e) { /* le journal n'a jamais le droit de casser l'appel */ }
}

// ---------------------------------------------------------------------------
// Qui appelle ? Le serveur d'authentification répond, jamais le client.
// Même principe que `supprimer-compte` : on ne fait confiance à aucun
// identifiant qui viendrait du corps de la requête.
// ---------------------------------------------------------------------------
async function qui(jeton: string): Promise<string | null> {
  try {
    const d = await avecDelai(async (signal) => {
      const r = await fetch(URL_SB() + "/auth/v1/user", {
        headers: { Authorization: "Bearer " + jeton, apikey: CLE_ADMIN() },
        signal,
      });
      return r.ok ? await r.json() : null;
    }, TIMEOUT_BASE_MS);
    return (d && typeof d.id === "string") ? d.id : null;
  } catch (_e) { return null; }
}

/* ---------------------------------------------------------------------------
   LE FILET DE DERNIER RECOURS, ET IL MANQUAIT.

   B-a et B-b (relecture du 10/08, second tour). Le fichier explique en tête, sur
   dix lignes, qu'une IA en panne doit être un écran NORMAL et jamais une erreur
   brute (§4.4). Il manquait précisément la ligne qui le garantit : aucun
   `try/catch` n'entourait `servir`, donc toute exception non prévue remontait
   jusqu'à `Deno.serve` et sortait en HTTP 500 — sans en-tête CORS, donc doublée
   d'une erreur CORS dans la console du navigateur.

   Deux entrées banales y suffisaient, les deux trouvées à la relecture :
     · un corps valant littéralement `null` — `req.json()` RÉUSSIT et rend
       `null`, donc le `catch` ne se déclenchait pas, et la ligne suivante
       déréférençait `null.tache` ;
     · une ligne d'`ia_fournisseurs` sans `nom` exploitable — `f.nom.indexOf`
       levait hors du `try` d'`appeler`.

   Les deux causes sont corrigées à la source (plus bas). Ce filet est là pour la
   TROISIÈME, celle qu'on n'a pas encore trouvée : un invariant censé être vrai
   ne doit pas pouvoir transformer un écran normal en erreur rouge.
--------------------------------------------------------------------------- */
export async function servir(req: Request): Promise<Response> {
  const origine = req.headers.get("Origin");
  const site = req.headers.get("Sec-Fetch-Site");

  // Le refus d'origine est prononcé AVANT tout le reste — avant les clés, avant
  // la base, avant le moindre appel sortant. Un tiers ne déclenche rien.
  if (!appelAccepte(origine, site)) {
    return new Response(
      JSON.stringify({ erreur: "origine non autorisée" }),
      { status: 403, headers: { "Content-Type": "application/json", "Vary": "Origin, Sec-Fetch-Site" } },
    );
  }
  const cors = entetesCors(origine);
  try {
    return await servirAccepte(req, cors);
  } catch (_e) {
    // On ne dit RIEN de plus au client : ni le message, ni la pile. Le mode
    // dégradé du §4.4 est indistinguable d'une IA simplement éteinte, et c'est
    // volontaire.
    return indisponible(cors);
  }
}

async function servirAccepte(req: Request, cors: Record<string, string>): Promise<Response> {
  const debut = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erreur: "méthode" }, 405, cors);

  // --- Le jeton. Obligatoire, contrairement au relais TMDB (§4.1). ---
  const entete = req.headers.get("Authorization") || "";
  const jeton = entete.replace(/^Bearer\s+/i, "").trim();
  if (!jeton) return json({ erreur: "jeton requis" }, 401, cors);
  const uid = await qui(jeton);
  if (!uid) return json({ erreur: "jeton invalide" }, 401, cors);

  // --- La tâche. Liste blanche fermée : un `tache` inconnu part en 400. ---
  let corps: Record<string, unknown> = {};
  /* `req.json()` RÉUSSIT sur le corps `null`, sur `1` et sur `"x"` : le `catch`
     ne suffit pas, il faut vérifier ce qu'on a obtenu. B-a. */
  try {
    const brut = await req.json();
    if (brut && typeof brut === "object" && !Array.isArray(brut)) {
      corps = brut as Record<string, unknown>;
    }
  } catch (_e) { /* corps illisible = tâche absente */ }
  const tache = typeof corps.tache === "string" ? corps.tache : "";
  /* R4 (relecture du 10/08) — `TACHES[tache]` TROUVAIT LES MEMBRES HÉRITÉS.
     `constructor`, `toString`, `hasOwnProperty` et `valueOf` viennent
     d'`Object.prototype` : ils passaient le garde et repartaient en 200
     `{indisponible:true}` au lieu du 400 que le §6 exige. Sans conséquence —
     aucun fournisseur appelé, aucun budget consommé — mais une liste blanche
     qui laisse passer quatre noms n'est plus tout à fait fermée. */
  if (!Object.prototype.hasOwnProperty.call(TACHES, tache)) {
    return json({ erreur: "tâche inconnue" }, 400, cors);
  }

  const gabarit = construire(tache, corps.params);
  // Des paramètres inexploitables ne sont pas une erreur du client : ils
  // signifient qu'il n'y a rien à écrire. Dégradé, comme le reste.
  if (!gabarit) return indisponible(cors);

  // --- Les budgets (§4.2). Réservés AVANT d'appeler qui que ce soit. ---
  let budgetOk = true;
  try {
    budgetOk = await rpc("ia_reserver_budget", {
      p_uid: uid, p_max_utilisateur: BUDGET_UTILISATEUR_JOUR, p_max_global: BUDGET_GLOBAL_JOUR,
    }) === true;
  } catch (_e) {
    // La base ne répond pas. ON REFUSE, et c'est le sens de ce garde-fou :
    // sans compteur, on ne sait plus ce qu'on dépense. Un budget qu'on ne peut
    // pas lire vaut un budget atteint.
    budgetOk = false;
  }
  if (!budgetOk) {
    await journaliser(tache, null, false, 3, Date.now() - debut);
    return indisponible(cors);
  }

  // --- L'échelle, à partir de l'étage de départ de la tâche (§4.2). ---
  const conf = TACHES[tache];
  const tous = await lireFournisseurs();

  /* R3 (relecture du 10/08) — LE BUDGET SE REND QUAND RIEN N'ABOUTIT. Il était
     réservé avant la boucle et jamais rendu : une journée où toute la chaîne
     est en panne consommait les trente unités de chaque personne pour zéro
     texte, et le lendemain quelqu'un pouvait se retrouver à court sans avoir
     jamais rien reçu.
     RETOUR-10 §1 (01/09/2026) — IL PEUT Y AVOIR DEUX RÉSERVATIONS. Une escalade
     demande une seconde réponse d'IA pour la même phrase, et la spec veut que
     les budgets s'appliquent aux deux appels. On rend donc AUTANT qu'on a pris,
     pas « une fois » : rendre une seule unité sur deux prises laissait fuir un
     budget, et une fuite de compteur ne se voit qu'au bout de plusieurs jours. */
  let budgetsPris = 1;
  const rendreBudget = async () => {
    while (budgetsPris > 0) {
      budgetsPris--;
      try { await rpc("ia_rendre_budget", { p_uid: uid }); } catch (_e) { /* tant pis */ }
    }
  };

  /* ---------------------------------------------------------------------
     UN PASSAGE D'ÉCHELLE — extrait en fonction pour RETOUR-10 §1.

     La boucle était en ligne tant qu'il n'y avait qu'un seul parcours. Il y en
     a maintenant deux au plus : celui qui part de l'étage de la tâche, et, si
     la réponse ne vaut rien, celui qui repart du modèle fort.

     `tentes` retient les étages DÉJÀ VISITÉS — y compris ceux qu'on a sautés
     parce que leur compteur était plein ou leur clé absente. Rejouer un étage
     saturé dans la même requête ne pourrait rien donner (la fenêtre n'a pas eu
     le temps de se rouvrir) et écrirait une seconde ligne de journal
     identique : le taux d'escalade, qui est le chiffre que la spec demande de
     mesurer, deviendrait illisible.

     Trois issues, et elles ne veulent pas dire la même chose :
       · `{propre}`     — un fournisseur a répondu, et sa réponse est valide ;
       · `{malformee}`  — un fournisseur a répondu, sa réponse ne vaut rien.
                          On ne descend PAS l'échelle (§4.4) : il a répondu, il
                          a juste mal répondu, et payer un second étage pour la
                          même phrase serait payer deux fois. C'est le passage
                          appelant qui décide d'escalader ou non ;
       · `{}`           — personne n'a répondu : saturés, en panne, ou plus de
                          temps.
  --------------------------------------------------------------------- */
  const tentes: Record<string, true> = {};

  const parcourir = async (depuis: number): Promise<{ propre?: unknown; malformee?: boolean }> => {
  for (const f of tous.filter((x) => x.rang >= depuis && !tentes[x.nom])) {
    /* L'HORLOGE REPART À CHAQUE ÉTAGE. Voir `journaliser` : `duree_ms` mesure
       l'étage, pas la requête. */
    const departEtage = Date.now();

    /* LA BORNE DE TEMPS DE LA REQUÊTE (01/09/2026). Cinq étages à huit secondes
       feraient quarante secondes d'attente ; voir `TIMEOUT_REQUETE_MS`. On
       regarde l'heure AVANT d'engager un étage, jamais pendant : couper un
       appel en cours ferait payer un travail qu'on jetterait.
       La ligne de journal est là pour qu'on puisse compter ces arrêts — sans
       elle, une échelle tronquée ressemblerait à une échelle épuisée. */
    if (departEtage - debut > budgetTempsMs) {
      await journaliser(tache, f.nom, false, 5, 0);
      break;
    }
    /* L'étage est VISITÉ à partir d'ici — même s'il est sauté deux lignes plus
       bas. Voir le pavé de `parcourir` : un étage visité ne se rejoue pas. */
    tentes[f.nom] = true;

    /* UN ÉTAGE SANS CLÉ SE SAUTE AVANT DE RÉSERVER SA PLACE. `appeler` sait
       déjà rendre le statut 0 quand le secret manque — mais il le fait APRÈS
       que le compteur a été réservé, donc il faut ensuite le rembourser : deux
       allers-retours de base pour un étage dont on savait d'avance qu'il ne
       partirait pas. C'est le cas ORDINAIRE tant que `GEMINI_API_KEY2` n'est
       pas posée, et il tombe précisément sur le chemin déjà dégradé, celui
       qu'on n'a aucune envie de ralentir davantage. */
    if (!Deno.env.get(f.cle_env)) {
      await journaliser(tache, f.nom, false, 0, Date.now() - departEtage);
      continue;
    }

    // ON N'APPELLE PAS UN FOURNISSEUR DONT LE COMPTEUR DIT QU'IL EST PLEIN.
    // C'est la phrase du §4.2, et c'est cette ligne-là. Quand les limites sont
    // inconnues (`null`, cas des deux étages Gemini au 10/08), la réservation
    // passe toujours : c'est alors le 429 plus bas qui fait le travail.
    let place = true;
    try {
      place = await rpc("ia_reserver_fournisseur", {
        p_fournisseur: f.nom, p_limite_minute: f.limite_minute, p_limite_jour: f.limite_jour,
      }) === true;
    } catch (_e) { place = false; }
    if (!place) {
      // Le compteur a dit non : on le NOTE, sinon le journal ne saura pas
      // distinguer « étage sauté parce que plein » de « étage jamais atteint ».
      await journaliser(tache, f.nom, false, 2, Date.now() - departEtage);
      continue;
    }

    const r = await appeler(f, gabarit.consigne, gabarit.schema);

    if (r.ok) {
      const propre = valider(tache, r.brut);
      await journaliser(tache, f.nom, !!propre, propre ? 200 : 1, Date.now() - departEtage);
      // RÉPONSE MALFORMÉE : ON NE DESCEND PAS L'ÉCHELLE (§4.4). Le fournisseur
      // a répondu, il a juste mal répondu. Ce qu'on en fait — dégrader, ou
      // escalader une fois — se décide plus bas, pas ici.
      if (propre) return { propre };
      return { malformee: true };
    }

    await journaliser(tache, f.nom, false, r.statut, Date.now() - departEtage);

    if (r.statut === 429) {
      /* Ce fournisseur est plein. On le marque saturé jusqu'à la fin de la
         fenêtre CONCERNÉE — la minute par défaut, le jour si `Retry-After`
         demande plus de deux minutes. Murer les deux d'un coup, comme le
         faisait la version d'origine, condamnait un fournisseur jusqu'à minuit
         pour un simple 429 de rythme.
         On ne rend PAS la réservation : le fournisseur a bien vu la requête. */
      const fenetre = r.attente > 120 ? "jour" : "minute";
      try {
        await rpc("ia_saturer", { p_fournisseur: f.nom, p_fenetre: fenetre });
      } catch (_e) { /* tant pis */ }
    } else if (r.statut !== 4) {
      /* 5xx, délai dépassé, clé absente : l'appel n'a jamais abouti chez le
         fournisseur, donc il n'a rien à nous coûter. Sans ce remboursement, un
         étage qui bat de l'aile mangeait son quota en refus — sur les cinquante
         requêtes quotidiennes d'OpenRouter, quelques 5xx suffisaient à fermer
         la journée sans qu'une phrase ait été écrite.
         LE STATUT 4 EST EXCLU : une réponse tronquée a bel et bien consommé des
         jetons chez le fournisseur, exactement comme un 429 a consommé une
         requête. On ne se rembourse pas un travail qui a eu lieu. */
      try { await rpc("ia_rendre_fournisseur", { p_fournisseur: f.nom }); } catch (_e) { /* tant pis */ }
    }
  }
  return {};
  };

  let res = await parcourir(conf.etage_depart);

  /* =====================================================================
     RETOUR-10 §1 — DÉMARRER SUR LE PETIT MODÈLE, N'ESCALADER QU'AU BESOIN
     (01/09/2026)

     MESURÉ DANS `ia_journal` LE 31/08, sur `interpreter_recherche` :
       · gemini-flash      7 succès, MÉDIANE 3 983 ms (2 910 → 7 895)
       · gemini-flash      2 délais dépassés : 8 096 ms perdus, puis bascule
       · gemini-flash-lite 2 succès, MÉDIANE 949 ms (945 → 953)
     Pire cas mesuré : 8 s de délai + 1 s = NEUF SECONDES pour une phrase
     simple. Découper une phrase en critères ne demande pas de culture
     générale — c'est de l'analyse de texte, et le petit modèle la fait en une
     seconde avec une régularité parfaite.

     DEUX CHEMINS, ET ILS NE COÛTENT PAS LA MÊME CHOSE :

     · UN FOURNISSEUR A RÉPONDU, ET SA RÉPONSE NE VAUT RIEN (`malformee`).
       C'est l'escalade au sens de la spec : on redemande LA MÊME PHRASE à un
       autre modèle, plus fort. La spec veut que « les budgets s'appliquent aux
       deux » — donc une SECONDE réservation, et si elle est refusée on
       n'escalade pas. Deuxième réponse d'IA, deuxième unité.

     · PERSONNE N'A RÉPONDU (saturés, en panne, plus de temps). Là il n'y a pas
       eu de première réponse : on continue simplement l'échelle sur les étages
       que l'étage de départ avait mis hors de portée, SANS seconde unité. Sans
       ce chemin, faire partir la tâche du rang 3 lui aurait fait perdre pour de
       bon les deux meilleurs étages — un lot de VITESSE aurait coûté de la
       DISPONIBILITÉ, ce que personne n'a demandé.

     UNE SEULE FOIS, JAMAIS DEUX : `parcourir` ne rejoue aucun étage déjà
     visité, donc le second passage s'arrête tout seul quand il ne reste rien.
     Et les deux appels sont dans `ia_journal`, ce qui rend le taux d'escalade
     mesurable après coup — la spec le demande explicitement.

     INTERDIT PAR LA SPEC, et le code le respecte par construction : lancer les
     deux modèles EN PARALLÈLE. Il n'y a qu'un seul `await` à la fois.
  ===================================================================== */
  let escalade = false;
  if (!res.propre && conf.escalade_vers && conf.escalade_vers < conf.etage_depart) {
    let permis = true;
    if (res.malformee) {
      // Le cas « il a répondu, mal » : c'est une seconde réponse d'IA, donc une
      // seconde unité de budget. Refusée → on dégrade, comme avant ce lot.
      permis = meriteEscalade(tache, res.propre || null);
      if (permis) {
        let ok2 = false;
        try {
          ok2 = await rpc("ia_reserver_budget", {
            p_uid: uid, p_max_utilisateur: BUDGET_UTILISATEUR_JOUR, p_max_global: BUDGET_GLOBAL_JOUR,
          }) === true;
        } catch (_e) { ok2 = false; }
        if (ok2) budgetsPris++;
        else {
          await journaliser(tache, null, false, 3, Date.now() - debut);
          permis = false;
        }
      }
    }
    if (permis) {
      const suite = await parcourir(conf.escalade_vers);
      // Un second passage qui ne donne rien laisse le premier verdict tel quel.
      if (suite.propre) { res = suite; escalade = true; }
      else if (suite.malformee) res = suite;
    }
  }

  if (res.propre) {
    /* `escalade` VOYAGE AVEC LA RÉPONSE. Le client n'en a pas besoin pour
       fonctionner — il déduit l'attente longue de sa propre montre — mais sans
       ce champ, rien ne permettrait de vérifier après coup que ce qu'il a
       affiché correspondait à ce qui s'est vraiment passé. Un champ inconnu de
       plus est sans effet côté client : il ne lit que `mode`, `filtres` et
       `titres`. */
    const corpsRep = escalade
      ? { ...(res.propre as Record<string, unknown>), escalade: true }
      : res.propre;
    return json(corpsRep, 200, cors);
  }

  // Tous épuisés. `{indisponible:true}`, HTTP 200, et le client ne montre rien.
  await rendreBudget();
  return indisponible(cors);
}
