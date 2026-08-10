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
  BUDGET_GLOBAL_JOUR, BUDGET_UTILISATEUR_JOUR, FOURNISSEURS, ORIGINES,
  TACHES, TIMEOUT_MS, type Fournisseur,
} from "./config.ts";
import { construire, valider } from "./gabarits.ts";

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

function minuteur(ms: number): { signal?: AbortSignal; fini: () => void } {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(ms), fini: () => {} };
  }
  if (typeof AbortController === "undefined") return { fini: () => {} };
  const c = new AbortController();
  const t = setTimeout(() => { try { c.abort(); } catch (_e) { /* déjà fini */ } }, ms);
  return { signal: c.signal, fini: () => clearTimeout(t) };
}

async function avecDelai(f: (s?: AbortSignal) => Promise<Response>, ms: number): Promise<Response> {
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
  const r = await avecDelai((signal) => fetch(URL_SB() + "/rest/v1/rpc/" + nom, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CLE_ADMIN(),
      Authorization: "Bearer " + CLE_ADMIN(),
    },
    body: JSON.stringify(args),
    signal,
  }), TIMEOUT_BASE_MS);
  if (!r.ok) throw new Error("rpc " + nom + " : " + r.status);
  /* UNE FONCTION SQL QUI REND `void` FAIT RÉPONDRE 204 SANS CORPS, et
     `r.json()` lève alors sur une réponse parfaitement réussie. Relevé à la
     relecture du 10/08 : l'appel avait bien eu lieu, mais il PARAISSAIT échouer,
     et le `catch` de l'appelant avalait la fausse erreur. Un appel qui réussit
     ne doit pas ressembler à un appel qui rate. */
  const texte = await r.text();
  if (!texte) return null;
  try { return JSON.parse(texte); } catch (_e) { return null; }
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
   la main, et une ligne qu'on ne comprend pas ne doit pas décider d'un appel. */
function fournisseurValide(x: unknown): Fournisseur | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const nom = typeof o.nom === "string" ? o.nom.trim() : "";
  const modele = typeof o.modele === "string" ? o.modele.trim() : "";
  const rang = Number(o.rang);
  if (!nom || !modele || !isFinite(rang) || rang < 1) return null;
  const limite = (v: unknown) => {
    const n = Number(v);
    return (v === null || v === undefined || !isFinite(n) || n < 0) ? null : Math.floor(n);
  };
  return {
    nom, modele, rang,
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
    const r = await avecDelai((signal) =>
      fetch(
        URL_SB() + "/rest/v1/ia_fournisseurs?select=*&actif=is.true&order=rang.asc",
        { headers: { apikey: CLE_ADMIN(), Authorization: "Bearer " + CLE_ADMIN() }, signal },
      ), TIMEOUT_BASE_MS);
    if (r.ok) {
      const d = await r.json();
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

async function appeler(f: Fournisseur, consigne: string, schema: Record<string, unknown>): Promise<Reponse> {
  const m = minuteur(TIMEOUT_MS);
  const gemini = f.nom.indexOf("gemini") === 0;
  const cle = Deno.env.get(gemini ? "GEMINI_API_KEY" : "OPENROUTER_API_KEY") || "";
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
        maxOutputTokens: 400,
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
      max_tokens: 400,
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
    return { ok: true, statut: 200, brut: extraire(gemini, d), attente: 0 };
  } catch (_e) {
    // Délai dépassé ou réseau coupé : traité comme une panne du fournisseur,
    // pas comme une saturation. On passe au suivant.
    return { ok: false, statut: 599, brut: null, attente: 0 };
  } finally { m.fini(); }
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
   (aucun appel) · 3 budget refusé · 599 délai ou réseau. */
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
    await avecDelai((signal) => fetch(URL_SB() + "/rest/v1/ia_journal", {
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
    const r = await avecDelai((signal) => fetch(URL_SB() + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + jeton, apikey: CLE_ADMIN() },
      signal,
    }), TIMEOUT_BASE_MS);
    if (!r.ok) return null;
    const d = await r.json();
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
  const etage = TACHES[tache].etage_depart;
  const echelle = (await lireFournisseurs()).filter((f) => f.rang >= etage);

  /* R3 (relecture du 10/08) — LE BUDGET SE REND QUAND RIEN N'ABOUTIT. Il était
     réservé avant la boucle et jamais rendu : une journée où toute la chaîne
     est en panne consommait les trente unités de chaque personne pour zéro
     texte, et le lendemain quelqu'un pouvait se retrouver à court sans avoir
     jamais rien reçu. */
  const rendreBudget = async () => {
    try { await rpc("ia_rendre_budget", { p_uid: uid }); } catch (_e) { /* tant pis */ }
  };

  for (const f of echelle) {
    /* L'HORLOGE REPART À CHAQUE ÉTAGE. Voir `journaliser` : `duree_ms` mesure
       l'étage, pas la requête. */
    const departEtage = Date.now();

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
      // RÉPONSE MALFORMÉE : DÉGRADÉ, SANS RÉESSAI (§4.4). On ne descend pas
      // l'échelle non plus — le fournisseur a répondu, il a juste mal répondu,
      // et payer un second étage pour la même phrase serait payer deux fois.
      if (propre) return json(propre, 200, cors);
      await rendreBudget();
      return indisponible(cors);
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
    } else {
      /* 5xx, délai dépassé, clé absente : l'appel n'a jamais abouti chez le
         fournisseur, donc il n'a rien à nous coûter. Sans ce remboursement, un
         étage qui bat de l'aile mangeait son quota en refus — sur les cinquante
         requêtes quotidiennes d'OpenRouter, quelques 5xx suffisaient à fermer
         la journée sans qu'une phrase ait été écrite. */
      try { await rpc("ia_rendre_fournisseur", { p_fournisseur: f.nom }); } catch (_e) { /* tant pis */ }
    }
  }

  // Tous épuisés. `{indisponible:true}`, HTTP 200, et le client ne montre rien.
  await rendreBudget();
  return indisponible(cors);
}
