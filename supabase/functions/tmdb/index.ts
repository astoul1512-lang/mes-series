// Relais TMDB pour « Mes Séries ».
//
// Raison d'être : la clé TMDB est commune à tous les utilisateurs de l'app, mais
// elle ne doit jamais se retrouver dans le code envoyé au navigateur — un dépôt
// GitHub public la rendrait lisible par n'importe qui. Elle vit donc ici, dans un
// secret côté serveur (TMDB_KEY), et l'app appelle cette fonction à la place.
//
// Aucune authentification : un nouvel utilisateur n'a pas encore de compte, et le
// but est justement qu'il n'ait rien à créer. La protection est ailleurs : seuls
// les chemins réellement utilisés par l'app sont relayés, le reste est refusé.

const BASE = "https://api.themoviedb.org/3";

// Liste blanche : tout ce que l'app demande, et rien d'autre.
const AUTORISES: RegExp[] = [
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(corps: unknown, statut = 200, entetes: Record<string, string> = {}) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, "Content-Type": "application/json", ...entetes },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const cle = Deno.env.get("TMDB_KEY");
  if (!cle) {
    return json({ status_message: "Clé TMDB absente côté serveur", status_code: 7 }, 503);
  }

  const entrant = new URL(req.url);
  const chemin = entrant.searchParams.get("path") || "";
  if (!AUTORISES.some((r) => r.test(chemin))) {
    return json({ status_message: "Chemin non autorisé", status_code: 34 }, 404);
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
        ...CORS,
        "Content-Type": "application/json",
        // Les fiches et les listes changent peu : on laisse respirer le quota.
        "Cache-Control": rep.ok ? "public, max-age=600" : "no-store",
      },
    });
  } catch (_e) {
    return json({ status_message: "TMDB injoignable", status_code: 0 }, 502);
  }
});
