// Les tests du relais TMDB — SPEC-02, S1 (09/08).
//
//     deno test --allow-env supabase/functions/tmdb/index.test.ts
//
// POURQUOI CE FICHIER EXISTE. Ce relais est la SEULE barrière entre le monde et
// la clé TMDB du projet, et rien ne la gardait : ni test, ni contrôle statique.
// La liste blanche des chemins tenait depuis des mois par la seule relecture, et
// l'autorisation d'origine — la moitié qui manquait — vient d'être écrite. Une
// règle qu'aucun test ne tient se défait toute seule, un lot à la fois : c'est
// exactement ce qui est arrivé à `escJs` dans app-07.
//
// AUCUN APPEL RÉSEAU : `fetch` est remplacé le temps de chaque cas. Les tests
// vérifient donc aussi CE QUI SERAIT DEMANDÉ à TMDB, ce qu'un vrai appel ne
// permettrait pas d'observer.

// AUCUNE DÉPENDANCE EXTERNE, volontairement : `jsr:@std/assert` obligerait
// `deno test` à sortir sur le réseau, et ces quatre lignes suffisent. Un test de
// sécurité qui ne peut pas tourner hors ligne finit par ne plus tourner du tout.
function assert(c: unknown, msg = "faux"): void {
  if (!c) throw new Error(msg);
}
function assertEquals(a: unknown, b: unknown, msg = ""): void {
  if (a !== b) throw new Error((msg ? msg + " : " : "") + "attendu " + JSON.stringify(b) + ", obtenu " + JSON.stringify(a));
}

import { servir } from "./relais.ts";

Deno.env.set("TMDB_KEY", "cle-de-test");

const APP = "https://astoul1512-lang.github.io";

// Remplace `fetch` par un menteur qui note l'adresse demandée. Rend une
// fonction de restitution — à appeler dans un `finally`, sinon les cas suivants
// héritent du faux.
function faireSemblant() {
  const vrai = globalThis.fetch;
  const vues: string[] = [];
  globalThis.fetch = ((url: string | URL | Request) => {
    vues.push(String(url));
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return { vues, rendre: () => { globalThis.fetch = vrai; } };
}

function requete(
  chemin: string,
  origine: string | null,
  methode = "GET",
  site: string | null = null,
) {
  const entetes: Record<string, string> = {};
  if (origine !== null) entetes["Origin"] = origine;
  if (site !== null) entetes["Sec-Fetch-Site"] = site;
  return new Request(
    "https://projet.supabase.co/functions/v1/tmdb?path=" + encodeURIComponent(chemin),
    { method: methode, headers: entetes },
  );
}

/* ======================= L'ORIGINE ======================= */

Deno.test("l'origine de l'app en production est servie", async () => {
  const f = faireSemblant();
  try {
    const r = await servir(requete("/tv/1399", APP));
    assertEquals(r.status, 200);
    // L'origine demandée est RENVOYÉE telle quelle, jamais `*` : c'est ce qui
    // distingue une autorisation d'une porte ouverte.
    assertEquals(r.headers.get("Access-Control-Allow-Origin"), APP);
    // Deux en-têtes décident de la réponse : un cache intermédiaire qui les
    // ignore servirait la réponse de l'app à un tiers.
    assertEquals(r.headers.get("Vary"), "Origin, Sec-Fetch-Site");
    assertEquals(f.vues.length, 1);
  } finally { f.rendre(); }
});

Deno.test("les deux origines de test locales sont servies", async () => {
  for (const o of ["http://localhost:8099", "http://127.0.0.1:8099"]) {
    const f = faireSemblant();
    try {
      const r = await servir(requete("/tv/1399", o));
      assertEquals(r.status, 200, o);
      assertEquals(r.headers.get("Access-Control-Allow-Origin"), o);
    } finally { f.rendre(); }
  }
});

Deno.test("une origine inconnue est refusée, et rien n'est demandé à TMDB", async () => {
  for (
    const o of [
      "https://exemple.fr",
      "https://astoul1512-lang.github.io.exemple.fr",   // suffixe trompeur
      "http://astoul1512-lang.github.io",               // en clair, pas la nôtre
      "null",                                           // page locale ou bac à sable
    ]
  ) {
    const f = faireSemblant();
    try {
      const r = await servir(requete("/tv/1399", o));
      await r.body?.cancel();
      assertEquals(r.status, 403, o);
      // Pas d'en-tête d'autorisation sur un refus : rien à lire, pour personne.
      assertEquals(r.headers.get("Access-Control-Allow-Origin"), null, o);
      // ET SURTOUT : aucun appel sortant. Le quota TMDB n'est pas entamé.
      assertEquals(f.vues.length, 0, o);
    } finally { f.rendre(); }
  }
});

Deno.test("une requête SANS Origin passe — l'app installée n'est pas cassée", async () => {
  const f = faireSemblant();
  try {
    const r = await servir(requete("/tv/1399", null));
    assertEquals(r.status, 200);
    // Rien à autoriser, donc rien n'est ouvert.
    assertEquals(r.headers.get("Access-Control-Allow-Origin"), null);
  } finally { f.rendre(); }
});

Deno.test("le préflight suit la même règle que le reste", async () => {
  const bon = await servir(requete("/tv/1399", APP, "OPTIONS"));
  await bon.body?.cancel();
  assertEquals(bon.status, 200);
  assertEquals(bon.headers.get("Access-Control-Allow-Origin"), APP);
  assert((bon.headers.get("Access-Control-Allow-Methods") || "").includes("GET"));

  const mauvais = await servir(requete("/tv/1399", "https://exemple.fr", "OPTIONS"));
  await mauvais.body?.cancel();
  assertEquals(mauvais.status, 403);
  assertEquals(mauvais.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("une page tierce SANS Origin est refusée — <img>, <script>, no-cors", async () => {
  // LE CAS QUE `Origin` SEUL NE VOYAIT PAS. `new Image().src = …` et
  // `<script src=…>` ne posent pas d'`Origin` : contrôler `Origin` seul les
  // laissait passer, et c'est précisément par là qu'on brûle un quota. Le
  // navigateur, lui, dit d'où vient la requête dans `Sec-Fetch-Site`.
  const f = faireSemblant();
  try {
    const r = await servir(requete("/tv/1399", null, "GET", "cross-site"));
    await r.body?.cancel();
    assertEquals(r.status, 403);
    assertEquals(f.vues.length, 0, "une balise tierce a tout de même appelé TMDB");
  } finally { f.rendre(); }
});

Deno.test("les autres valeurs de Sec-Fetch-Site restent servies", async () => {
  // `none` = barre d'adresse ou favori ; `same-origin` / `same-site` = chez
  // nous. Aucune n'est le cas d'abus, et refuser casserait sans rien fermer.
  for (const site of ["none", "same-origin", "same-site"]) {
    const f = faireSemblant();
    try {
      const r = await servir(requete("/tv/1399", null, "GET", site));
      await r.body?.cancel();
      assertEquals(r.status, 200, site);
    } finally { f.rendre(); }
  }
});

Deno.test("l'app garde son droit de passage : cross-site AVEC une origine connue", async () => {
  // C'est le cas NORMAL de l'app : github.io appelle supabase.co, donc
  // `Sec-Fetch-Site: cross-site` — avec un `Origin` de la liste. Une règle qui
  // refuserait tout `cross-site` couperait l'app elle-même.
  const f = faireSemblant();
  try {
    const r = await servir(requete("/tv/1399", APP, "GET", "cross-site"));
    await r.body?.cancel();
    assertEquals(r.status, 200);
    assertEquals(r.headers.get("Access-Control-Allow-Origin"), APP);
  } finally { f.rendre(); }
});

/* ======================= LES CHEMINS ======================= */

Deno.test("les chemins de l'app sont relayés", async () => {
  const f = faireSemblant();
  try {
    for (
      const c of [
        "/configuration", "/tv/1399", "/movie/550", "/search/multi",
        "/discover/tv", "/tv/1399/season/1", "/person/2037/combined_credits",
        "/movie/550/release_dates", "/search/keyword",
      ]
    ) {
      const r = await servir(requete(c, APP));
      await r.body?.cancel();
      assertEquals(r.status, 200, c);
    }
  } finally { f.rendre(); }
});

Deno.test("un chemin hors liste blanche est refusé", async () => {
  const f = faireSemblant();
  try {
    for (
      const c of [
        "/account",
        "/tv/1399/../../account",        // remontée par segments
        "/authentication/token/new",
        "/tv/abc",                       // pas un identifiant
        "/tv/1399/videos",               // vrai chemin TMDB, mais l'app ne s'en sert pas
        "",
      ]
    ) {
      const r = await servir(requete(c, APP));
      await r.body?.cancel();
      assertEquals(r.status, 404, c);
      assertEquals(f.vues.length, 0, "un chemin refusé a tout de même appelé TMDB : " + c);
    }
  } finally { f.rendre(); }
});

Deno.test("une clé api_key entrante est ignorée, la nôtre est posée", async () => {
  const f = faireSemblant();
  try {
    const req = new Request(
      "https://projet.supabase.co/functions/v1/tmdb" +
        "?path=%2Ftv%2F1399&api_key=cle-du-tiers&language=fr-FR",
      { headers: { Origin: APP } },
    );
    const r = await servir(req);
    await r.body?.cancel();
    assertEquals(r.status, 200);
    const sortie = f.vues[0];
    assert(!sortie.includes("cle-du-tiers"), "la clé du tiers est partie chez TMDB : " + sortie);
    assert(sortie.includes("api_key=cle-de-test"), "notre clé n'a pas été posée : " + sortie);
    assert(sortie.includes("language=fr-FR"), "les paramètres légitimes sont perdus");
  } finally { f.rendre(); }
});
