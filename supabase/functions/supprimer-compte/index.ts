/* Suppression définitive du compte de l'appelant.

   Le jeton est vérifié dans le code plutôt que par la plateforme : on a besoin
   de répondre aux requêtes OPTIONS du navigateur (CORS), que `verify_jwt`
   rejetterait avant même d'arriver ici.

   L'utilisateur ne peut supprimer que LUI-MÊME : l'identifiant supprimé est
   celui que le serveur d'authentification associe au jeton présenté, jamais un
   identifiant fourni dans la requête. Rien à passer, rien à falsifier. */

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const CLE_ADMIN = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function repondre(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return repondre({ erreur: "methode" }, 405);

  const entete = req.headers.get("Authorization") || "";
  const jeton = entete.replace(/^Bearer\s+/i, "").trim();
  if (!jeton) return repondre({ erreur: "jeton absent" }, 401);

  /* Qui es-tu ? C'est le serveur d'authentification qui répond, pas le client. */
  const rUser = await fetch(`${URL_SB}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jeton}`, apikey: CLE_ADMIN },
  });
  if (!rUser.ok) return repondre({ erreur: "jeton invalide" }, 401);
  const user = await rUser.json();
  const uid: string = user?.id;
  if (!uid) return repondre({ erreur: "jeton invalide" }, 401);

  const admin = {
    apikey: CLE_ADMIN,
    Authorization: `Bearer ${CLE_ADMIN}`,
    "Content-Type": "application/json",
  };

  /* Les données d'abord, le compte en dernier : si quelque chose casse en
     route, il reste un compte capable de réessayer plutôt que des données
     orphelines que plus personne ne peut atteindre.

     Toutes ces tables sont en `on delete cascade` sur `auth.users` : en marche
     nominale, la suppression du compte les emporterait de toute façon. Mais
     c'est justement le chemin d'erreur que cette fonction documente elle-même
     — « données effacées mais compte conservé » — qui rend la liste
     nécessaire : si la suppression du compte échoue, tout ce qui n'a pas été
     effacé ici SURVIT, et la personne à qui on vient de répondre croit être
     partie. La liste doit donc rester complète.

     À jour des migrations 001 à 010. TOUTE nouvelle table portant un
     `user_id` doit être ajoutée ici en même temps qu'elle est créée. */
  const efface = async (chemin: string) => {
    const r = await fetch(`${URL_SB}/rest/v1/${chemin}`, { method: "DELETE", headers: admin });
    if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`);
  };

  try {
    await efface(`mes_series?user_id=eq.${uid}`);
    await efface(`abonnements?suiveur=eq.${uid}`);
    await efface(`abonnements?suivi=eq.${uid}`);
    await efface(`codes_partage?proprio=eq.${uid}`);

    /* Les notifications (migration 003). `push_appareils` porte l'abonnement
       du téléphone : oublié ici, il resterait dans le balayage de `notifier`
       et continuerait de recevoir des notifications pour un compte disparu. */
    await efface(`push_appareils?user_id=eq.${uid}`);
    await efface(`push_cloches?user_id=eq.${uid}`);
    await efface(`push_reglages?user_id=eq.${uid}`);
    await efface(`push_envois?user_id=eq.${uid}`);

    /* Les recommandations (migration 009), des DEUX côtés : celles que la
       personne a envoyées, et celles qu'elle a reçues. Les premières restent
       affichées chez le destinataire tant qu'elles existent. */
    await efface(`recommandations?de=eq.${uid}`);
    await efface(`recommandations?vers=eq.${uid}`);

    await efface(`profils?user_id=eq.${uid}`);

    const rDel = await fetch(`${URL_SB}/auth/v1/admin/users/${uid}`, {
      method: "DELETE",
      headers: { apikey: CLE_ADMIN, Authorization: `Bearer ${CLE_ADMIN}` },
    });
    if (!rDel.ok) {
      return repondre(
        { erreur: "donnees effacees mais compte conserve", detail: await rDel.text() },
        500,
      );
    }
  } catch (e) {
    return repondre({ erreur: String((e as Error).message || e) }, 500);
  }

  return repondre({ ok: true });
});
