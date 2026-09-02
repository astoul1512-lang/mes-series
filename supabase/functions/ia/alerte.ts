// L'alerte « l'IA est tombée » — décision d'Adrien du 01/09/2026.
//
// RAISON D'ÊTRE, en une phrase : depuis que le plafond par utilisateur est
// supprimé, plus rien ne PRÉVIENT qu'une panne ou une boucle a vidé le quota
// partagé. Ce fichier est le signal qui reste.
//
// CE QU'IL N'EST PAS : un mécanisme de reprise. L'app marche déjà sans IA —
// c'est une règle non négociable du dépôt — donc une alerte qui ne part pas ne
// casse rien, elle laisse seulement Adrien dans le noir. Tout ici est donc
// « au mieux » : jamais bloquant, jamais une exception qui remonte, jamais un
// appel qui ralentit une requête réussie.
//
// POURQUOI L'ENVOI EST RECOPIÉ ICI PLUTÔT QUE PARTAGÉ AVEC `notifier`. Même
// raison que la liste blanche d'origines du relais (S1, 09/08) : les fonctions
// Edge sont déployées SÉPARÉMENT, et un import entre deux dossiers de fonctions
// ne survit pas au paquetage. Ce qui est recopié tient en quinze lignes ; ce
// qui ne doit PAS diverger — la forme du message que le service worker lit — a
// son cas de test dans `index.test.ts`.

/* L'adresse de l'app, pour le clic sur la notification. Recopiée de `notifier`
   (`APP`), et volontairement la RACINE : une alerte de quota ne parle d'aucun
   titre, donc il n'y a aucun écran plus juste que l'accueil. */
const APP = "https://astoul1512-lang.github.io/mes-series/";

/* UN SEUL TAG POUR TOUTES LES ALERTES, ET C'EST VOULU. Le service worker passe
   `renotify: true` : deux notifications du même tag se REMPLACENT sur le
   téléphone tout en se signalant. Si l'IA retombait une seconde fois dans la
   journée, Adrien verrait donc une notification à jour, pas une pile de deux.
   « Je veux juste une notif » — c'est aussi ça, le tenir jusqu'au bout. */
export const ALERTE_TAG = "ia:incident";

export type MotifPanne = "quota" | "injoignable";

/* ---------------------------------------------------------------------------
   LE TEXTE — deux pannes, deux vérités.

   Adrien a demandé « juste une notif ⚠️ le quota IA a été atteint ». Il y a
   pourtant DEUX pannes derrière le même symptôme, et elles ne disent pas la
   même chose : le quota atteint, c'est NOUS qui avons trop consommé, et ça
   repart demain ; l'IA injoignable, c'est Google ou OpenRouter qui ne répond
   pas, et ça peut repartir dans cinq minutes. Annoncer un quota atteint pendant
   une panne de fournisseur serait faux une fois sur deux — et une alerte fausse
   ne se croit plus, ce qui est exactement ce qu'on ne peut pas se permettre du
   SEUL signal qui reste.

   LA SECONDE PHRASE N'EST PAS DU REMPLISSAGE. Une notification « ⚠️ » à 23 h
   laisse croire que l'app est morte. Elle ne l'est pas : le repli local existe
   partout, c'est une règle du dépôt. La ligne le dit, en quatre mots.
--------------------------------------------------------------------------- */
export function texteAlerte(motif: MotifPanne): { titre: string; corps: string } {
  if (motif === "quota") {
    return {
      titre: "⚠️ Quota IA atteint",
      corps: "Plus de requêtes jusqu'à demain — l'app continue sans l'IA.",
    };
  }
  return {
    titre: "⚠️ IA injoignable",
    corps: "Aucun fournisseur ne répond — l'app continue sans l'IA.",
  };
}

/* La charge utile, exactement dans la forme que `sw.js` sait lire (`titre`,
   `corps`, `url`, `tag`). Aucune affiche, aucun bandeau : il n'y a pas d'œuvre
   dont parler ici, et une image ferait ressembler une alerte technique à une
   notification de sortie. */
export function corpsAlerte(motif: MotifPanne): string {
  const t = texteAlerte(motif);
  return JSON.stringify({ titre: t.titre, corps: t.corps, url: APP, tag: ALERTE_TAG });
}

/* ---------------------------------------------------------------------------
   L'ENVOI.

   Trois conditions, et chacune peut manquer sans que ce soit une erreur :
     · `IA_ALERTE_UID` — le compte à prévenir. Absent : l'alerte est éteinte,
       silencieusement. C'est l'état du dépôt tant qu'Adrien n'a pas posé le
       secret, et ça ne doit surtout pas empêcher le relais de fonctionner.
     · `VAPID_PRIVEE` — la clé de signature des notifications. Même chose.
     · un appareil abonné — s'il n'y en a aucun, il n'y a rien à faire.

   `npm:web-push` EST IMPORTÉ EN DYNAMIQUE, ET C'EST UNE DÉCISION DE PERFORMANCE.
   Un import en tête de fichier serait résolu au DÉMARRAGE de l'instance, donc
   sur le chemin de la première requête IA — c'est-à-dire sur le chemin critique
   que RETOUR-10 vient précisément d'accélérer. Ici il n'est chargé que le jour
   où une alerte part : quelques fois par an, au lieu de chaque démarrage à
   froid.
--------------------------------------------------------------------------- */
export async function envoyerAlerte(motif: MotifPanne): Promise<boolean> {
  const uid = Deno.env.get("IA_ALERTE_UID") || "";
  const vapidPrivee = Deno.env.get("VAPID_PRIVEE") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!uid || !vapidPrivee || !url || !cle) return false;

  try {
    const r = await fetch(
      url + "/rest/v1/push_appareils?select=endpoint,p256dh,auth&user_id=eq." +
        encodeURIComponent(uid),
      { headers: { apikey: cle, Authorization: "Bearer " + cle },
        signal: AbortSignal.timeout(3000) },
    );
    if (!r.ok) return false;
    const appareils = await r.json();
    if (!Array.isArray(appareils) || !appareils.length) return false;

    const mod = await import("npm:web-push@3.6.7");
    const webPush = (mod as { default: Record<string, any> }).default;
    /* La clé PUBLIQUE est écrite en dur dans `notifier/index.ts` et dans
       `app-09` côté client. Un troisième exemplaire ici serait un troisième
       endroit à tenir d'accord : elle est donc lue depuis l'environnement si
       elle y est, et retombe sur la même valeur que les deux autres. Un
       désaccord ne casserait que cette alerte, pas les notifications de sortie
       — mais il la casserait en silence, ce qu'on ne verrait jamais. */
    const vapidPublique = Deno.env.get("VAPID_PUBLIQUE") ||
      "BBpSgSNcQugozdir_hxAIXaDlWvZfNofUFbJzQPeAPHt_24mVWFGcEv4wNWk9x-CIU8JcAfIYvCgaYc1OyRZySI";
    webPush.setVapidDetails(
      "mailto:notifications@mes-series.app", vapidPublique, vapidPrivee,
    );

    const charge = corpsAlerte(motif);
    let unSucces = false;
    for (const a of appareils) {
      try {
        await webPush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, charge,
        );
        unSucces = true;
      } catch (_e) {
        /* ON NE TOUCHE PAS À `push_appareils` ICI, contrairement à `notifier`.
           Lui compte les échecs et finit par oublier un abonnement expiré, et
           il a raison : il envoie tous les jours. Cette fonction-ci envoie
           quelques fois par an — elle n'a aucune légitimité pour supprimer un
           appareil sur la foi d'un seul essai, et le ferait justement un jour
           de panne, quand tout est déjà de travers. */
      }
    }
    return unSucces;
  } catch (_e) {
    // Une alerte qui échoue ne doit jamais emporter la requête qu'elle signale.
    return false;
  }
}
