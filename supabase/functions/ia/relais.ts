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
async function rpc(nom: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await fetch(URL_SB() + "/rest/v1/rpc/" + nom, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CLE_ADMIN(),
      Authorization: "Bearer " + CLE_ADMIN(),
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error("rpc " + nom + " : " + r.status);
  return await r.json();
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
let cacheFournisseurs: { quand: number; l: Fournisseur[] } | null = null;
export function oublierFournisseurs() { cacheFournisseurs = null; }

export async function lireFournisseurs(): Promise<Fournisseur[]> {
  const maintenant = Date.now();
  if (cacheFournisseurs && maintenant - cacheFournisseurs.quand < 60000) return cacheFournisseurs.l;
  let l: Fournisseur[] = [];
  try {
    const r = await fetch(
      URL_SB() + "/rest/v1/ia_fournisseurs?select=*&actif=is.true&order=rang.asc",
      { headers: { apikey: CLE_ADMIN(), Authorization: "Bearer " + CLE_ADMIN() } },
    );
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d)) l = d as Fournisseur[];
    }
  } catch (_e) { /* base injoignable : on prend le repli, sans bruit */ }
  if (!l.length) l = FOURNISSEURS.filter((f) => f.actif);
  l = l.slice().sort((a, b) => a.rang - b.rang);
  cacheFournisseurs = { quand: maintenant, l };
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
type Reponse = { ok: boolean; statut: number; brut: unknown };

async function appeler(f: Fournisseur, consigne: string, schema: Record<string, unknown>): Promise<Reponse> {
  const minuteur = AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  const gemini = f.nom.indexOf("gemini") === 0;
  const cle = Deno.env.get(gemini ? "GEMINI_API_KEY" : "OPENROUTER_API_KEY") || "";
  if (!cle) return { ok: false, statut: 0, brut: null };

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
      method: "POST", headers: entetes, body: JSON.stringify(corps), signal: minuteur,
    });
    if (!r.ok) return { ok: false, statut: r.status, brut: null };
    const d = await r.json();
    return { ok: true, statut: 200, brut: extraire(gemini, d) };
  } catch (_e) {
    // Délai dépassé ou réseau coupé : traité comme une panne du fournisseur,
    // pas comme une saturation. On passe au suivant.
    return { ok: false, statut: 599, brut: null };
  }
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
async function journaliser(tache: string, fournisseur: string | null, ok: boolean, duree: number) {
  try {
    await fetch(URL_SB() + "/rest/v1/ia_journal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: CLE_ADMIN(),
        Authorization: "Bearer " + CLE_ADMIN(),
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ tache, fournisseur, ok, duree_ms: Math.round(duree) }),
    });
  } catch (_e) { /* le journal n'a jamais le droit de casser l'appel */ }
}

// ---------------------------------------------------------------------------
// Qui appelle ? Le serveur d'authentification répond, jamais le client.
// Même principe que `supprimer-compte` : on ne fait confiance à aucun
// identifiant qui viendrait du corps de la requête.
// ---------------------------------------------------------------------------
async function qui(jeton: string): Promise<string | null> {
  try {
    const r = await fetch(URL_SB() + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + jeton, apikey: CLE_ADMIN() },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d && typeof d.id === "string") ? d.id : null;
  } catch (_e) { return null; }
}

export async function servir(req: Request): Promise<Response> {
  const debut = Date.now();
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
  try { corps = await req.json(); } catch (_e) { /* corps illisible = tâche absente */ }
  const tache = typeof corps.tache === "string" ? corps.tache : "";
  if (!TACHES[tache]) return json({ erreur: "tâche inconnue" }, 400, cors);

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
    await journaliser(tache, null, false, Date.now() - debut);
    return indisponible(cors);
  }

  // --- L'échelle, à partir de l'étage de départ de la tâche (§4.2). ---
  const etage = TACHES[tache].etage_depart;
  const echelle = (await lireFournisseurs()).filter((f) => f.rang >= etage);

  for (const f of echelle) {
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
    if (!place) continue;

    const r = await appeler(f, gabarit.consigne, gabarit.schema);

    if (r.ok) {
      const propre = valider(tache, r.brut);
      await journaliser(tache, f.nom, !!propre, Date.now() - debut);
      // RÉPONSE MALFORMÉE : DÉGRADÉ, SANS RÉESSAI (§4.4). On ne descend pas
      // l'échelle non plus — le fournisseur a répondu, il a juste mal répondu,
      // et payer un second étage pour la même phrase serait payer deux fois.
      return propre ? json(propre, 200, cors) : indisponible(cors);
    }

    // 429 : ce fournisseur est plein pour de bon. On le marque saturé jusqu'à
    // la fin de sa fenêtre, pour ne pas le rappeler à chaque requête d'ici là.
    if (r.statut === 429) {
      try { await rpc("ia_saturer", { p_fournisseur: f.nom }); } catch (_e) { /* tant pis */ }
    }
    // 5xx, timeout, clé absente : on passe simplement au suivant.
  }

  // Tous épuisés. `{indisponible:true}`, HTTP 200, et le client ne montre rien.
  await journaliser(tache, null, false, Date.now() - debut);
  return indisponible(cors);
}
