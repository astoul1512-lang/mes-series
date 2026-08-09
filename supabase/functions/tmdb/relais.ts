// Relais TMDB pour « Mes Séries » — la logique, séparée du point d'entrée.
//
// Raison d'être : la clé TMDB est commune à tous les utilisateurs de l'app, mais
// elle ne doit jamais se retrouver dans le code envoyé au navigateur — un dépôt
// GitHub public la rendrait lisible par n'importe qui. Elle vit donc ici, dans un
// secret côté serveur (TMDB_KEY), et l'app appelle cette fonction à la place.
//
// Aucune authentification : un nouvel utilisateur n'a pas encore de compte, et le
// but est justement qu'il n'ait rien à créer.
//
// POURQUOI CE FICHIER EST SÉPARÉ D'`index.ts` (S1, 09/08) — `index.ts` appelle
// `Deno.serve`, donc l'importer depuis un test ouvrirait un vrai serveur sur un
// vrai port. La logique vit ici et n'ouvre rien ; `index.ts` ne fait plus que la
// brancher. `supabase functions deploy` embarque les modules importés par
// l'entrée : le déploiement ne change pas de commande.

const BASE = "https://api.themoviedb.org/3";

// ---------------------------------------------------------------------------
// S1 (09/08) — QUI A LE DROIT D'APPELER CE RELAIS
//
// `Access-Control-Allow-Origin: "*"` faisait de cette fonction un relais TMDB
// gratuit, ouvert au monde entier : n'importe quel site pouvait s'en servir
// comme de sa propre API, sur NOTRE clé TMDB et NOTRE quota d'invocations
// (500 000 par mois en offre gratuite). Ce n'est pas un vol de données, c'est
// une facture — et une coupure du service pour les vrais utilisateurs le jour
// où le quota tombe.
//
// La liste blanche des CHEMINS, elle, était déjà correcte et ne bouge pas :
// elle empêche d'atteindre `/account` ou n'importe quel point de TMDB que
// l'app n'utilise pas. Elle ne dit rien de QUI appelle — c'est l'autre moitié,
// et c'est celle qui manquait.
//
// TROIS CAS, ET UN SEUL EST UN REFUS :
//   · `Origin` connu    → on répond, en renvoyant CETTE origine (jamais `*`),
//                         plus `Vary: Origin` pour que les caches
//                         intermédiaires ne servent pas la réponse d'une
//                         origine à une autre ;
//   · `Origin` inconnu  → 403, sans en-tête d'autorisation : le navigateur du
//                         tiers ne pourra de toute façon rien lire ;
//   · pas d'`Origin`    → on répond, SAUF si le navigateur nous dit lui-même
//                         que la requête vient d'un autre site (voir juste en
//                         dessous). Une requête sans `Origin` ni en-tête
//                         `Sec-Fetch-*` ne vient pas d'une page : c'est un
//                         contexte hors navigateur, ou un cas particulier de
//                         service worker. Refuser ceux-là casserait l'app
//                         installée pour se protéger de rien.
//
// LE TROU QUE `Origin` SEUL NE BOUCHE PAS, et pourquoi `Sec-Fetch-Site` est là.
// « Un navigateur pose toujours `Origin` en cross-origine » est FAUX, et c'est
// le genre d'à-peu-près qui laisse une porte grande ouverte : `Origin` n'est
// posé qu'en mode `cors`. Une page tierce qui écrit
//     for (let i = 0; i < 5000; i++) new Image().src = RELAIS + '?path=/tv/' + i;
// (ou un `<script src>`, ou `fetch(url, {mode:'no-cors'})`) n'envoie AUCUN
// `Origin`. Elle ne lira rien — mais elle n'a rien à lire : le but est de nous
// coûter 5 000 appels TMDB et 5 000 invocations. Contrôler `Origin` seul
// laissait donc passer exactement l'attaque que S1 vise.
//
// `Sec-Fetch-Site`, lui, est posé par le navigateur sur CES requêtes-là aussi,
// et il est interdit au code de page de le fabriquer. `cross-site` sans
// `Origin` autorisé = une page tierce, quel que soit le mode : 403. Un client
// hors navigateur n'envoie pas cet en-tête du tout et reste accepté.
// ---------------------------------------------------------------------------
export const ORIGINES: string[] = [
  "https://astoul1512-lang.github.io",
  "http://localhost:8099",
  "http://127.0.0.1:8099",
];

// `site` est la valeur de `Sec-Fetch-Site` : `same-origin`, `same-site`,
// `cross-site`, `none` (barre d'adresse, favori), ou `null` si l'en-tête est
// absent. Seul `cross-site` sans origine autorisée est refusé.
export function appelAccepte(origine: string | null, site: string | null): boolean {
  if (origine) return ORIGINES.includes(origine);
  return site !== "cross-site";
}

// Les en-têtes CORS d'une réponse acceptée. `Access-Control-Allow-Origin`
// n'est posé que s'il y a une origine à nommer : sans `Origin` entrant, il n'y
// a rien à autoriser, et surtout rien à ouvrir.
export function entetesCors(origine: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    // Deux en-têtes décident de la réponse : les caches intermédiaires doivent
    // le savoir, sinon la réponse servie à l'app repart chez un tiers.
    "Vary": "Origin, Sec-Fetch-Site",
  };
  if (origine) h["Access-Control-Allow-Origin"] = origine;
  return h;
}

// Liste blanche : tout ce que l'app demande, et rien d'autre.
export const AUTORISES: RegExp[] = [
  /^\/configuration$/,
  /^\/search\/(tv|movie|multi|person)$/,
  /^\/discover\/(tv|movie)$/,
  /^\/genre\/(tv|movie)\/list$/,
  /^\/watch\/providers\/(tv|movie)$/,
  /^\/(tv|movie)\/\d+$/,
  /^\/(tv|movie)\/\d+\/watch\/providers$/,
  /^\/(tv|movie)\/\d+\/recommendations$/,
  /^\/person\/\d+$/,
  /^\/person\/\d+\/combined_credits$/,
  // Les épisodes d'une saison, pour la fiche d'une série pas encore ajoutée.
  /^\/tv\/\d+\/season\/\d+$/,
  // Sorties et dates françaises.
  /^\/movie\/(now_playing|upcoming)$/,
  /^\/movie\/\d+\/release_dates$/,
  // Mots-clés : c'est par eux qu'une recherche devient précise — « braquage »,
  // « voyage dans le temps », « tiré d'une histoire vraie ». `with_keywords`
  // passe déjà par /discover ; seule la résolution nom → identifiant manquait.
  /^\/search\/keyword$/,
];

export function cheminAutorise(chemin: string): boolean {
  return AUTORISES.some((r) => r.test(chemin));
}

function json(
  corps: unknown,
  statut: number,
  cors: Record<string, string>,
  entetes: Record<string, string> = {},
) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, "Content-Type": "application/json", ...entetes },
  });
}

export async function servir(req: Request): Promise<Response> {
  const origine = req.headers.get("Origin");
  const site = req.headers.get("Sec-Fetch-Site");

  // Le refus est prononcé AVANT tout le reste — avant la clé, avant le chemin,
  // avant le moindre appel sortant. Un tiers ne doit rien pouvoir déclencher.
  if (!appelAccepte(origine, site)) {
    return new Response(
      JSON.stringify({ status_message: "Origine non autorisée", status_code: 7 }),
      { status: 403, headers: { "Content-Type": "application/json", "Vary": "Origin, Sec-Fetch-Site" } },
    );
  }

  const cors = entetesCors(origine);

  // Le préflight suit exactement la même règle : il est passé par le refus
  // ci-dessus comme les autres.
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const cle = Deno.env.get("TMDB_KEY");
  if (!cle) {
    return json({ status_message: "Clé TMDB absente côté serveur", status_code: 7 }, 503, cors);
  }

  const entrant = new URL(req.url);
  const chemin = entrant.searchParams.get("path") || "";
  if (!cheminAutorise(chemin)) {
    return json({ status_message: "Chemin non autorisé", status_code: 34 }, 404, cors);
  }

  const sortant = new URL(BASE + chemin);
  entrant.searchParams.forEach((v, k) => {
    if (k !== "path" && k !== "api_key") sortant.searchParams.set(k, v);
  });

  // Une clé v4 est un jeton porteur ; une clé v3 passe en paramètre.
  const entetes: Record<string, string> = { accept: "application/json" };
  if (cle.startsWith("eyJ") || cle.length > 60) entetes.Authorization = "Bearer " + cle;
  else sortant.searchParams.set("api_key", cle);

  try {
    const rep = await fetch(sortant.toString(), { headers: entetes });
    const texte = await rep.text();
    return new Response(texte, {
      status: rep.status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        // Les fiches et les listes changent peu : on laisse respirer le quota.
        "Cache-Control": rep.ok ? "public, max-age=600" : "no-store",
      },
    });
  } catch (_e) {
    return json({ status_message: "TMDB injoignable", status_code: 0 }, 502, cors);
  }
}
