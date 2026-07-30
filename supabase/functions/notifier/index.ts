// ---------------------------------------------------------------------------
// notifier — le facteur.
//
// Appelé par le planificateur, plusieurs fois par jour. Pour chaque personne
// qui a des cloches allumées et au moins un appareil abonné :
//   1. demander à TMDB ce qui est sorti,
//   2. écarter ce qui a déjà été annoncé,
//   3. écrire le texte et l'envoyer.
//
// Trois règles que le code respecte partout :
//   — on n'invente jamais une sortie : sans date confirmée par TMDB, rien ne part ;
//   — on n'annonce jamais deux fois la même chose (table push_envois) ;
//   — un appareil qui refuse trois fois de suite est oublié, il a expiré.
//
// La clé TMDB et la clé VAPID privée ne quittent jamais ce fichier côté serveur.
//
// SÉCURITÉ — le balayage complet tourne en droits `service_role`. Il n'est donc
// déclenchable que par le planificateur, qui présente un secret partagé (voir
// plus bas, et la table `cron_secrets`). Le mode essai, lui, s'authentifie par
// le jeton de la personne : il n'est pas concerné.
//
// Les deux autres fonctions du projet ont été relues le 30/07 et sont saines :
// `supprimer-compte` prend l'uid de /auth/v1/user avec le jeton présenté et
// jamais du corps de la requête ; `tmdb` a une liste blanche d'expressions
// ancrées et retire `api_key` des paramètres entrants. Ne pas recommencer
// cette vérification sans raison.
// ---------------------------------------------------------------------------
import webPush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TMDB_KEY     = Deno.env.get('TMDB_KEY')!;
const VAPID_PRIVEE = Deno.env.get('VAPID_PRIVEE')!;
const VAPID_PUBLIQUE =
  'BBpSgSNcQugozdir_hxAIXaDlWvZfNofUFbJzQPeAPHt_24mVWFGcEv4wNWk9x-CIU8JcAfIYvCgaYc1OyRZySI';
const APP = 'https://astoul1512-lang.github.io/mes-series/';

webPush.setVapidDetails('mailto:notifications@mes-series.app', VAPID_PUBLIQUE, VAPID_PRIVEE);

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

// Une clé TMDB v4 est un JETON PORTEUR ; une clé v3 passe en paramètre d'URL.
// Le relais `tmdb` faisait déjà ce test, pas cette fonction : avec la clé v4
// en place, chaque appel partait en `?api_key=` et TMDB répondait 401 sur
// CHAQUE cloche. Les notifications étaient mortes en silence (bilan
// `annonces: 0`, une erreur par cloche) pendant que les affiches de l'app,
// servies par le relais, s'affichaient parfaitement. Constaté le 30/07.
// Les deux fonctions doivent rester d'accord sur ce test.
const tmdb = async (chemin: string, params = '') => {
  const sep = chemin.includes('?') ? '&' : '?';
  const entetes: Record<string, string> = { accept: 'application/json' };
  let url = `https://api.themoviedb.org/3${chemin}${sep}language=fr-FR${params}`;
  if (TMDB_KEY.startsWith('eyJ') || TMDB_KEY.length > 60) {
    entetes.Authorization = 'Bearer ' + TMDB_KEY;
  } else {
    url += `&api_key=${TMDB_KEY}`;
  }
  const r = await fetch(url, { headers: entetes });
  if (!r.ok) throw new Error(`TMDB ${r.status} sur ${chemin}`);
  return await r.json();
};

const jour = (d = new Date()) => d.toISOString().slice(0, 10);
const ilYa = (n: number) => jour(new Date(Date.now() - n * 86400000));

// --- Sur quelle plateforme ? ------------------------------------------------
// « Disponible en streaming » sans dire où ne sert à rien. La plateforme est
// connue une fois le titre en ligne — ce qui est le cas au moment où l'on
// notifie, puisqu'on notifie la sortie. Si elle manque quand même, on n'invente
// rien : la notification part sans. Formules à publicité et revendeurs sont
// repliés sur la plateforme mère, comme dans l'app.
const PUB = /\bwith ads\b|avec (de la )?pub|\b(amazon|apple tv) channel\b/i;
const platesConnues = new Map<string, string[]>();
async function plateformesFR(media: string, id: number): Promise<string[]> {
  const cle = `${media}:${id}`;
  if (platesConnues.has(cle)) return platesConnues.get(cle)!;
  let noms: string[] = [];
  try {
    const rep = await tmdb(`/${media}/${id}/watch/providers`);
    const fr = (rep.results || {}).FR || {};
    for (const p of fr.flatrate || []) {
      const nom = (p.provider_name || '').trim();
      if (nom && !PUB.test(nom) && !noms.includes(nom)) noms.push(nom);
    }
  } catch (_e) { noms = []; }
  platesConnues.set(cle, noms);
  return noms;
}
const avecPlateforme = (corps: string, noms: string[]) =>
  noms.length ? (corps ? corps + ' · Sur ' + noms.join(', ') : 'Sur ' + noms.join(', ')) : corps;

type Annonce = { cle: string; titre: string; corps: string; url: string;
                 affiche?: string; bandeau?: string };

const img = (p: string | null, taille: string) =>
  p ? `https://image.tmdb.org/t/p/${taille}${p}` : undefined;

// --- Une série : un épisode sorti dans les deux derniers jours ---------------
// Deux jours de tolérance, pas plus : si le planificateur a sauté un tour, on
// rattrape ; au-delà, la nouvelle n'en est plus une.
async function sortiesSerie(id: number): Promise<Annonce[]> {
  const s = await tmdb(`/tv/${id}`);
  const ep = s.last_episode_to_air;
  if (!ep || !ep.air_date) return [];
  if (ep.air_date < ilYa(2) || ep.air_date > jour()) return [];
  const code = `S${ep.season_number}E${ep.episode_number}`;
  return [{
    cle: `tv:${id}:${ep.season_number}x${ep.episode_number}`,
    titre: `${s.name} · ${code} est sorti`,
    corps: avecPlateforme(ep.name ? `« ${ep.name} »` : '', await plateformesFR('tv', id)),
    url: `${APP}#show-${id}`,
    affiche: img(s.poster_path, 'w185'),
    bandeau: img(s.backdrop_path, 'w780')
  }];
}

// --- Un film : sortie salle, streaming ou VOD, en France --------------------
// TMDB distingue les types de sortie par pays : 3 = salle, 4 = numérique,
// 5 = physique. On ne garde que la France et que les types demandés.
const TYPES: Record<string, number[]> = { cine: [2, 3], stream: [4], vod: [4, 5] };
const MOT:   Record<string, string>   = {
  cine:   'Sort au cinéma aujourd\'hui',
  stream: 'Disponible en streaming',
  vod:    'Disponible en VOD'
};

async function sortiesFilm(id: number, veut: Record<string, boolean>): Promise<Annonce[]> {
  const [m, rel] = await Promise.all([
    tmdb(`/movie/${id}`),
    tmdb(`/movie/${id}/release_dates`)
  ]);
  const fr = (rel.results || []).find((r: any) => r.iso_3166_1 === 'FR');
  if (!fr) return [];
  const out: Annonce[] = [];
  for (const genre of ['cine', 'stream', 'vod']) {
    if (!veut[genre]) continue;
    const trouve = (fr.release_dates || []).find((d: any) =>
      TYPES[genre].includes(d.type) &&
      d.release_date && d.release_date.slice(0, 10) >= ilYa(2) &&
      d.release_date.slice(0, 10) <= jour());
    if (!trouve) continue;
    /* Salle : la plateforme n'a pas de sens. Streaming et VOD : elle est
       l'information principale, quand elle est connue. */
    const noms = genre === 'cine' ? [] : await plateformesFR('movie', id);
    out.push({
      cle: `movie:${id}:${genre}`,
      titre: m.title,
      corps: noms.length ? `Disponible sur ${noms.join(', ')}` : MOT[genre],
      url: `${APP}#movie-${id}`,
      affiche: img(m.poster_path, 'w185'),
      bandeau: img(m.backdrop_path, 'w780')
    });
  }
  return out;
}

// --- L'envoi ----------------------------------------------------------------
async function envoyer(appareils: any[], corps: Annonce) {
  let unSucces = false;
  for (const a of appareils) {
    try {
      await webPush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        JSON.stringify({ titre: corps.titre, corps: corps.corps, url: corps.url,
                         tag: corps.cle, affiche: corps.affiche, bandeau: corps.bandeau })
      );
      unSucces = true;
      await sb.from('push_appareils').update({ vu: new Date().toISOString(), echecs: 0 })
              .eq('id', a.id);
    } catch (e: any) {
      // 404 et 410 : l'abonnement n'existe plus, inutile d'insister.
      const code = e?.statusCode ?? 0;
      if (code === 404 || code === 410) {
        await sb.from('push_appareils').delete().eq('id', a.id);
      } else {
        const n = (a.echecs ?? 0) + 1;
        if (n >= 3) await sb.from('push_appareils').delete().eq('id', a.id);
        else await sb.from('push_appareils').update({ echecs: n }).eq('id', a.id);
      }
    }
  }
  return unSucces;
}

// Sans ces en-têtes, le navigateur refuse la réponse : la fonction est appelée
// par le planificateur, mais on veut pouvoir la déclencher à la main pour un
// essai depuis l'app.
//
// `x-cron-secret` n'est VOLONTAIREMENT pas dans la liste autorisée : le
// planificateur n'est pas un navigateur et n'envoie pas de requête préalable.
// L'ajouter suggérerait que l'en-tête est utilisable depuis le client.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });

  let demande: any = {};
  try { demande = await req.json(); } catch (_) { demande = {}; }

  // --- Mode essai -----------------------------------------------------------
  // Envoie une notification factice, uniquement aux appareils de la personne
  // qui la demande. L'identité vient du jeton présenté, jamais du corps de la
  // requête : impossible d'arroser quelqu'un d'autre.
  if (demande.essai === true) {
    const entete = req.headers.get('Authorization') || '';
    const jeton = entete.replace(/^Bearer /i, '');
    const { data: qui, error } = await sb.auth.getUser(jeton);
    if (error || !qui?.user) {
      return new Response(JSON.stringify({ erreur: 'essai reserve a une session ouverte' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const { data: app } = await sb.from('push_appareils')
      .select('id, endpoint, p256dh, auth, echecs').eq('user_id', qui.user.id);
    if (!app?.length) {
      return new Response(JSON.stringify({ erreur: 'aucun appareil abonne' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const ok = await envoyer(app, {
      cle: 'essai-' + Date.now(),
      titre: 'Severance · S2E5 est sorti',
      corps: '« Trojan\'s Horse »',
      url: APP
    });
    return new Response(JSON.stringify({ essai: true, appareils: app.length, envoye: ok }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // --- Le balayage complet est réservé au planificateur ----------------------
  // Tout ce qui suit lit et écrit les données de TOUT LE MONDE en droits
  // service_role. Sans ce garde-fou, un simple POST vide suffisait à faire
  // tourner le balayage : de quoi brûler le compteur d'échecs des appareils
  // (trois de suite et l'abonnement est supprimé), amplifier des appels TMDB à
  // volonté, et lire dans le bilan les identifiants des cloches d'autrui.
  //
  // Le secret est lu en base plutôt que dans une variable d'environnement :
  // `declencher_notifier()` le lit dans la même table, si bien qu'aucun humain
  // n'a besoin de le connaître ni de le recopier quelque part.
  //
  // La comparaison est faite en temps constant : une comparaison naïve fuit la
  // longueur du préfixe correct, et cette fonction est publiquement joignable.
  {
    const presente = req.headers.get('x-cron-secret') || '';
    const { data: ligne } = await sb.from('cron_secrets')
      .select('valeur').eq('nom', 'notifier').maybeSingle();
    const attendu = ligne?.valeur || '';
    let bon = attendu.length > 0 && presente.length === attendu.length;
    // Toujours parcourir toute la chaîne attendue, quel que soit le résultat.
    for (let i = 0; i < attendu.length; i++) {
      if (presente.charCodeAt(i) !== attendu.charCodeAt(i)) bon = false;
    }
    if (!bon) {
      return new Response(JSON.stringify({ erreur: 'reserve au planificateur' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  }

  const bilan = { personnes: 0, annonces: 0, envois: 0, erreurs: [] as string[] };

  const { data: reglages } = await sb.from('push_reglages').select('user_id, quand, films');
  for (const r of reglages ?? []) {
    // Le résumé du soir et celui du samedi viendront plus tard : pour l'instant
    // seul « dès la sortie » envoie, c'est le réglage choisi.
    if (r.quand !== 'sortie') continue;

    const { data: appareils } = await sb.from('push_appareils')
      .select('id, endpoint, p256dh, auth, echecs').eq('user_id', r.user_id);
    if (!appareils?.length) continue;

    const { data: cloches } = await sb.from('push_cloches')
      .select('type, tmdb_id').eq('user_id', r.user_id);
    if (!cloches?.length) continue;

    bilan.personnes++;
    const films = (r.films ?? {}) as Record<string, boolean>;

    for (const c of cloches) {
      let annonces: Annonce[] = [];
      try {
        annonces = c.type === 'tv'
          ? await sortiesSerie(Number(c.tmdb_id))
          : await sortiesFilm(Number(c.tmdb_id), films);
      } catch (e: any) {
        bilan.erreurs.push(`${c.type}:${c.tmdb_id} → ${e.message}`);
        continue;
      }

      for (const a of annonces) {
        // Déjà annoncé ? La clé primaire (user_id, cle) fait office de verrou :
        // on tente l'insertion, un conflit veut dire « on l'a déjà dit ».
        const { error } = await sb.from('push_envois')
          .insert({ user_id: r.user_id, cle: a.cle });
        if (error) continue;
        bilan.annonces++;
        const ok = await envoyer(appareils, a);
        if (ok) bilan.envois++;
        // Personne n'a reçu : on retire la trace pour retenter au prochain tour.
        else await sb.from('push_envois').delete()
                     .eq('user_id', r.user_id).eq('cle', a.cle);
      }
    }
  }

  return new Response(JSON.stringify(bilan), {
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
});
