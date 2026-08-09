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
// B14/B15 — la logique pure vit à côté, pour être testable sans démarrer le
// facteur : `deno test supabase/functions/notifier/logique.test.ts`.
import { genresVoulus, parPaquets, memesEpisodesLeJour, titreSerie } from './logique.ts';

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

// B9 (09/08) — ATTENTION, à lire avant de toucher à la fenêtre de deux jours.
// Ici la journée est en UTC, alors que les dates TMDB sont des journées de
// calendrier local. Le décalage vaut donc jusqu'à deux heures dans le mauvais
// sens : entre minuit et 2 h, heure de Paris, `jour()` rend encore la veille.
// Ce biais est ABSORBÉ par la tolérance de deux jours de `sortiesSerie` et
// `sortiesFilm` — rien ne se perd aujourd'hui. Mais resserrer cette tolérance
// (à un jour, ou à « aujourd'hui seulement ») SANS passer d'abord ces deux
// fonctions en heure locale ferait disparaître des sorties en silence, une
// nuit sur deux. Le front, lui, est passé en heure locale (app-02 `isoLocal`).
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

// --- B14 — les bornes du balayage -------------------------------------------
// Chiffres choisis, pas devinés :
//   · LOT_PERSONNES — une page de lecture. Assez petit pour qu'un lot se traite
//     largement dans le budget, assez grand pour ne pas multiplier les allers
//     -retours en base sur une petite table.
//   · PERSONNES_EN_PARALLELE × CLOCHES_EN_PARALLELE — le plafond d'appels TMDB
//     simultanés (4 × 5 = 20 au pire). Au-delà, on cherche le 429 ; en dessous,
//     on retombe sur le strictement séquentiel qui a fait le dépassement.
//   · BUDGET_MS — la marge sous le délai de `pg_net` (5 s), qui est ce qui a
//     réellement coupé le tour de 16 h. On garde 1,5 s pour la ré-invocation et
//     la réponse.
const LOT_PERSONNES = 20;
const PERSONNES_EN_PARALLELE = 4;
const CLOCHES_EN_PARALLELE = 5;
const BUDGET_MS = 3500;

// La ré-invocation : la fonction s'appelle elle-même, avec le même secret et le
// décalage atteint. Sans `await` sur la réponse — on ne veut pas attendre le
// reste du balayage, c'est tout l'objet de la manœuvre — mais confiée à
// `waitUntil` quand la plateforme le propose, sinon le runtime peut couper la
// requête en vol dès que la réponse ci-dessus est rendue.
function relancer(req: Request, apres: string) {
  // On REPASSE les en-têtes d'entrée : `x-cron-secret` bien sûr, mais aussi
  // `apikey` et `Authorization`, que la passerelle Supabase exige avant même
  // que la fonction soit atteinte. Sans eux, la suite du balayage se ferait
  // refuser à la porte — et le tour s'arrêterait là, silencieusement.
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const nom of ['x-cron-secret', 'apikey', 'authorization']) {
    const v = req.headers.get(nom);
    if (v) h[nom] = v;
  }
  const p = fetch(req.url, { method: 'POST', headers: h, body: JSON.stringify({ apres }) })
    .catch((e) => { console.log('notifier: relance impossible → ' + (e?.message || e)); });
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(p);
}

const img = (p: string | null, taille: string) =>
  p ? `https://image.tmdb.org/t/p/${taille}${p}` : undefined;

// --- Une série : un épisode sorti dans les deux derniers jours ---------------
// Deux jours de tolérance, pas plus : si le planificateur a sauté un tour, on
// rattrape ; au-delà, la nouvelle n'en est plus une.
// B15 (09/08) — UN DROP DE SAISON N'EST PLUS ANNONCÉ COMME UN SEUL ÉPISODE.
// On ne lisait que `last_episode_to_air` : une saison Netflix entière sortie
// d'un coup, ou un double épisode, ne produisait qu'UNE notification, celle du
// DERNIER épisode. « S2E8 est sorti » sur une série dont on n'avait pas vu le
// premier épisode de la saison : ni faux, ni utile.
// On compte donc les épisodes de la saison qui portent LA MÊME DATE, et on le
// dit. UNE notification, avec le compte — surtout pas N notifications : huit
// vibrations d'affilée pour une seule nouvelle, c'est ce qui fait couper les
// notifications d'une app pour de bon.
//
// La clé anti-doublon reste CELLE DU DERNIER ÉPISODE, inchangée. C'est
// volontaire : elle garantit qu'une série déjà annoncée avant ce lot ne sera
// pas réannoncée sous une autre forme, et que deux tours successifs pendant la
// fenêtre de deux jours ne comptent que pour une.
//
// Le second appel (la saison) n'est fait QUE lorsqu'un épisode tombe vraiment
// dans la fenêtre — c'est-à-dire presque jamais. Le tour ordinaire reste à un
// seul appel TMDB par cloche série.
async function sortiesSerie(id: number): Promise<Annonce[]> {
  const s = await tmdb(`/tv/${id}`);
  const ep = s.last_episode_to_air;
  if (!ep || !ep.air_date) return [];
  if (ep.air_date < ilYa(2) || ep.air_date > jour()) return [];
  let combien = 1;
  try {
    const saison = await tmdb(`/tv/${id}/season/${ep.season_number}`);
    combien = memesEpisodesLeJour(saison, ep.air_date);
  } catch (_e) {
    // La saison n'a pas répondu : on annonce l'épisode, comme avant. Une
    // notification juste mais incomplète vaut mieux qu'aucune notification.
    combien = 1;
  }
  const titre = titreSerie(s.name, ep.season_number, ep.episode_number, combien);
  const corpsBase = combien > 1
    ? `Saison ${ep.season_number}`
    : (ep.name ? `« ${ep.name} »` : '');
  return [{
    cle: `tv:${id}:${ep.season_number}x${ep.episode_number}`,
    titre: titre,
    corps: avecPlateforme(corpsBase, await plateformesFR('tv', id)),
    // C1/C3 — nouvelle forme d'adresse. L'app lit AUSSI l'ancienne (`#show-<id>`)
    // pendant au moins un mois : les notifications déjà parties dorment
    // plusieurs jours dans le centre de notifications.
    url: `${APP}#/serie/${id}`,
    affiche: img(s.poster_path, 'w185'),
    bandeau: img(s.backdrop_path, 'w780')
  }];
}

// --- Un film : sortie salle, streaming ou VOD, en France --------------------
// TMDB distingue les types de sortie par pays : 3 = salle, 4 = numérique,
// 5 = physique. On ne garde que la France et que les types demandés.
// I8 — il y avait TROIS genres côté client (« cinéma », « streaming », « VOD »)
// pour DEUX événements réels : `stream` valait le type 4, `vod` les types 4 et
// 5, et le type 5 (le disque) est écarté partout ailleurs dans l'app. Deux
// réglages qui se déclenchent sur la même donnée annoncent une finesse qui
// n'existe pas — et un film sorti en numérique pouvait produire deux
// notifications. Il en reste deux, qui recouvrent bien deux choses distinctes.
//
// L'ancienne forme est encore acceptée en lecture : un téléphone resté en
// arrière peut continuer d'écrire `{stream, vod}` dans `push_reglages` pendant
// quelques jours. Elle est repliée à l'entrée, pas propagée — le pliage lui-même
// (`genresVoulus`) vit dans `logique.ts`, avec son test.
const TYPES: Record<string, number[]> = { cine: [2, 3], maison: [4, 5] };
const MOT:   Record<string, string>   = {
  cine:   'Sort au cinéma aujourd\'hui',
  maison: 'Disponible chez toi'
};

// B15 (09/08) — ON TESTE LES RÉGLAGES AVANT DE PARLER À TMDB, pas après. Les
// deux appels partaient en `Promise.all` DÈS L'ENTRÉE, et le test `veut[genre]`
// venait ensuite : une cloche film dont les deux interrupteurs sont éteints
// coûtait donc deux appels TMDB à chaque tour, toutes les deux heures, pour
// jeter le résultat six lignes plus bas. Rien de visible, juste du quota brûlé
// en permanence.
// Deux ordres changés, aucun comportement :
//   1. aucun genre voulu → on sort AVANT le premier appel ;
//   2. la fiche du film (`/movie/{id}`, qui ne sert qu'au titre et aux images)
//      n'est demandée QUE si une date de sortie correspond vraiment.
// Le tour ordinaire d'une cloche film passe ainsi de deux appels à un.
async function sortiesFilm(id: number, veut: Record<string, boolean>): Promise<Annonce[]> {
  const genres = ['cine', 'maison'].filter(g => veut[g]);
  if (!genres.length) return [];
  const rel = await tmdb(`/movie/${id}/release_dates`);
  const fr = (rel.results || []).find((r: any) => r.iso_3166_1 === 'FR');
  if (!fr) return [];
  const retenus = genres.filter(genre => (fr.release_dates || []).some((d: any) =>
    TYPES[genre].includes(d.type) &&
    d.release_date && d.release_date.slice(0, 10) >= ilYa(2) &&
    d.release_date.slice(0, 10) <= jour()));
  if (!retenus.length) return [];
  const m = await tmdb(`/movie/${id}`);
  const out: Annonce[] = [];
  for (const genre of retenus) {
    /* Salle : la plateforme n'a pas de sens. Streaming et VOD : elle est
       l'information principale, quand elle est connue. */
    const noms = genre === 'cine' ? [] : await plateformesFR('movie', id);
    out.push({
      cle: `movie:${id}:${genre}`,
      titre: m.title,
      corps: noms.length ? `Disponible sur ${noms.join(', ')}` : MOT[genre],
      url: `${APP}#/film/${id}`,
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

  // --- Mode « un utilisateur, un message » (cycle 3, point 6) ----------------
  // Appelé par le déclencheur `abonnement_notifie` (migration 011), avec le
  // MÊME secret que le planificateur — la vérification vient d'avoir lieu
  // ci-dessus. Il envoie UN message aux appareils d'UNE personne, et rend la
  // main : le balayage complet, en dessous, n'est pas touché — même format
  // `Annonce`, même `envoyer`, même gestion des appareils expirés.
  if (demande.direct && typeof demande.direct === 'object') {
    const d = demande.direct;
    if (!d.user_id || !d.titre) {
      return new Response(JSON.stringify({ erreur: 'direct: user_id et titre requis' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const { data: app } = await sb.from('push_appareils')
      .select('id, endpoint, p256dh, auth, echecs').eq('user_id', d.user_id);
    if (!app?.length) {
      // Personne d'abonné côté push : ce n'est pas une erreur, le bloc dans
      // l'app est le chemin qui marche toujours.
      return new Response(JSON.stringify({ direct: true, appareils: 0, envoye: false }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const ok = await envoyer(app, {
      cle: String(d.cle || 'direct-' + d.user_id),
      titre: String(d.titre).slice(0, 120),
      corps: String(d.corps || '').slice(0, 240),
      // `url` est un fragment de l'app (« #/abonnements ») : on n'ouvre jamais
      // une adresse dictée de l'extérieur, seulement l'app elle-même.
      url: APP + '#/' + String(d.url || 'abonnements').replace(/^[#/]+/, '')
    });
    return new Response(JSON.stringify({ direct: true, appareils: app.length, envoye: ok }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // ==========================================================================
  // B14 (09/08) — LE BALAYAGE EST PAGINÉ, BORNÉ DANS LE TEMPS, ET IL DIT OÙ IL
  // S'EST ARRÊTÉ.
  //
  // Trois défauts tenaient dans une seule ligne (`select` sans `range`) et une
  // seule boucle (strictement séquentielle) :
  //
  //   1. PLAFOND SILENCIEUX. PostgREST coupe à `max-rows` (1000 par défaut) :
  //      au-delà, les personnes suivantes n'étaient JAMAIS notifiées, sans une
  //      ligne de journal pour le dire. Le bilan affichait un compte plausible.
  //   2. DÉLAI. Un à deux appels TMDB par cloche, l'un après l'autre : le tour
  //      de 16 h du 02/08 s'est terminé en dépassement de délai (5 s côté
  //      `pg_net`) avec UN utilisateur — c'est écrit dans RAPPORT-CORRECTIONS.
  //   3. AUCUNE REPRISE. Rien n'enregistrait où le balayage s'était arrêté :
  //      un tour coupé recommençait au début au tour suivant, donc repassait
  //      indéfiniment sur les mêmes premières personnes.
  //
  // Le remède, dans cet ordre :
  //   · on lit par lots de `LOT_PERSONNES`, ordonnés par `user_id` et repris à
  //     la CLÉ (`user_id > le dernier traité`) plutôt qu'au rang : une
  //     inscription qui arrive entre deux lots décalerait toute la fenêtre d'un
  //     `range()`, et ferait sauter une personne sans que rien ne le dise ;
  //   · à l'intérieur d'un lot, les personnes sont traitées par paquets, et les
  //     cloches d'une personne par paquets aussi : le parallélisme est BORNÉ,
  //     jamais un `Promise.all` plat sur tout — c'est la façon la plus rapide
  //     de se faire jeter par TMDB (429), et le cache HTTP du relais absorbe
  //     déjà les doublons ;
  //   · quand le budget de temps est dépassé — testé à CHAQUE paquet, parce
  //     qu'une seule personne peut porter cent cloches — la fonction SE
  //     RÉ-INVOQUE (`{apres:<dernier user_id>}`) et rend la main tout de suite.
  //     Chaque invocation reste donc sous la limite, et le balayage se termine
  //     quand même.
  //
  // Le bilan porte `depuis`, `jusqu`, `complet` et `suite` : un tour incomplet
  // SE VOIT, dans la réponse comme dans le journal — y compris quand c'est la
  // LECTURE qui a échoué.
  // ==========================================================================
  const debut = Date.now();
  const bilan = { personnes: 0, annonces: 0, envois: 0, erreurs: [] as string[],
                  depuis: String(demande.apres || ''), jusqu: String(demande.apres || ''),
                  complet: true, suite: null as string | null };

  // Une cloche d'une personne, du bout en bout. Elle ne rend rien : elle
  // renseigne le bilan, comme la boucle qu'elle remplace.
  async function traiterCloche(r: any, appareils: any[], c: any) {
    let annonces: Annonce[] = [];
    try {
      annonces = c.type === 'tv'
        ? await sortiesSerie(Number(c.tmdb_id))
        : await sortiesFilm(Number(c.tmdb_id), genresVoulus((r.films ?? {}) as Record<string, boolean>));
    } catch (e: any) {
      bilan.erreurs.push(`${c.type}:${c.tmdb_id} → ${e.message}`);
      return;
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

  async function traiterPersonne(r: any) {
    // I9 — il y avait ici `if (r.quand !== 'sortie') continue;`. L'app proposait
    // trois fréquences, cette fonction n'en servait qu'une, et les deux autres
    // ne différaient donc pas la notification : elles la supprimaient. Quelqu'un
    // qui choisissait « un résumé le soir » ne recevait plus rien, pendant que
    // son écran affichait « Activées · 3 séries, 1 film ».
    //
    // Le choix a été retiré de l'app, et le filtre avec lui : une ligne restée
    // en `soir` ou `samedi` — un téléphone pas encore mis à jour — est traitée
    // comme les autres plutôt que laissée muette. `quand` reste en base pour le
    // jour où un vrai résumé existera ; il ne pilote plus rien.
    const { data: appareils } = await sb.from('push_appareils')
      .select('id, endpoint, p256dh, auth, echecs').eq('user_id', r.user_id);
    if (!appareils?.length) return;

    const { data: cloches } = await sb.from('push_cloches')
      .select('type, tmdb_id').eq('user_id', r.user_id);
    if (!cloches?.length) return;

    bilan.personnes++;
    for (const paquet of parPaquets(cloches, CLOCHES_EN_PARALLELE)) {
      await Promise.all(paquet.map((c: any) => traiterCloche(r, appareils, c)));
    }
  }

  // PAGINATION PAR CLÉ, PAS PAR DÉCALAGE. `.range(offset, …)` compte des rangs :
  // une inscription qui arrive entre deux invocations, avec un `user_id`
  // inférieur au curseur, décale toute la fenêtre — et fait SAUTER une personne
  // (une désinscription en traite une deux fois). On avance donc sur la clé
  // elle-même, qui ne bouge pas : `user_id > le dernier traité`, dans l'ordre.
  // C'est aussi ce qui rend la reprise exacte après une ré-invocation.
  let apres = String(demande.apres || '');
  let coupe = false;
  while (!coupe) {
    let q = sb.from('push_reglages').select('user_id, quand, films')
              .order('user_id').limit(LOT_PERSONNES);
    if (apres) q = q.gt('user_id', apres);
    const { data: reglages, error } = await q;
    if (error) {
      // Une lecture qui échoue n'est PAS un tour complet : le dire, et laisser
      // la reprise au tour suivant plutôt que d'annoncer un travail fini.
      bilan.erreurs.push('lecture push_reglages → ' + error.message);
      bilan.complet = false;
      break;
    }
    const lot = reglages ?? [];
    if (!lot.length) break;

    // Le budget se teste à CHAQUE paquet, pas seulement entre deux lots : une
    // seule personne peut porter cent cloches, et le lot de vingt dépasserait
    // le délai avant d'avoir été mesuré une seule fois.
    const paquets = parPaquets(lot, PERSONNES_EN_PARALLELE);
    for (let k = 0; k < paquets.length; k++) {
      const paquet = paquets[k];
      await Promise.all(paquet.map((r: any) => traiterPersonne(r)));
      apres = String(paquet[paquet.length - 1].user_id);
      bilan.jusqu = apres;
      // On ne coupe QUE s'il reste vraiment quelque chose derrière : un lot
      // incomplet dont on vient de traiter le dernier paquet est la fin du
      // balayage. Sans ce test, un tour terminé se ré-invoquerait pour lire
      // zéro ligne, et le journal crierait « SUITE » sur un travail fini.
      const resteDerriere = k < paquets.length - 1 || lot.length === LOT_PERSONNES;
      if (resteDerriere && Date.now() - debut > BUDGET_MS) { coupe = true; break; }
    }
    if (coupe) { bilan.complet = false; bilan.suite = apres; break; }
    if (lot.length < LOT_PERSONNES) break;          // c'était le dernier lot
  }

  // TRAÇABILITÉ — un tour incomplet doit se voir, y compris quand personne ne
  // lit la réponse (le planificateur, lui, ne la lit pas).
  console.log(`notifier: ${bilan.personnes} personne(s) après « ${bilan.depuis || '(début)'} », ` +
              `${bilan.annonces} annonce(s), ${bilan.envois} envoi(s), ` +
              `${bilan.erreurs.length} erreur(s), ${Date.now() - debut} ms, ` +
              (bilan.complet ? 'tour complet' : `SUITE après « ${bilan.suite || bilan.jusqu} »`));

  if (!bilan.complet && bilan.suite) relancer(req, bilan.suite);

  return new Response(JSON.stringify(bilan), {
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
});
