/* Service worker — démarrage instantané et fonctionnement hors-ligne.

   DÉCISION D'ADRIEN, 07/08/2026 (revue, constat S10) : CACHE D'ABORD.
   L'ancienne règle « réseau d'abord » redemandait les 14 fichiers au réseau à
   CHAQUE ouverture avant d'afficher quoi que ce soit : 1,2 s en 4G, 2,9 s en
   3G — à chaque fois, même quand rien n'avait changé. Désormais le cache est
   servi immédiatement, et la FRAÎCHEUR passe par la mise à jour du service
   worker lui-même : à chaque mise en production, ce fichier change (le numéro
   de CACHE est incrémenté), le navigateur détecte le nouveau worker, installe
   la nouvelle version d'un bloc (`addAll`, donc jamais de versions mélangées),
   et l'app affiche un bandeau « Recharger » (app-08). Le réseau ne reste le
   premier recours que pour un fichier ABSENT du cache.
   Les appels TMDB ne sont jamais mis en cache. */
const CACHE = 'mes-series-v93';

const SHELL = ['./', './index.html', './app.css', './manifest.json',
               './icon-192.png', './icon-512.png',
               /* Déclarée dans `manifest.json` mais absente d'ici : à la
                  première installation depuis un réseau coupé, Android n'avait
                  pas d'icône adaptative à découper. */
               './icon-512-maskable.png',
               './apple-touch-icon.png',
               './app-01-noyau.js',
               './app-02-outils.js',
               './app-03-vues.js',
               './app-04-decouvrir.js',
               './app-05-plateformes.js',
               './app-06-serie.js',
               './app-07-partage.js',
               './app-08-reglages.js',
               './app-09-notifications.js',
               './app-10-sorties.js',
               './app-11-gouts.js',
               './app-12-recherche.js',
               './app-13-inscription.js',
               './app-14-ia.js',
               './app-15-filtres.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* Pas de .catch() ici : si un fichier manque, l'installation doit échouer
         pour que l'ancienne version, elle, reste utilisable hors-ligne. */
      /* C6 (09/08) — `{cache:'reload'}` FORCE LE RÉSEAU, ET C'EST TOUT L'ENJEU.
         `addAll` sur des URL nues passe par le cache HTTP du navigateur (mode
         `default`). GitHub Pages sert ces fichiers avec un `max-age` : à
         l'installation d'une v89, `addAll` pouvait donc récupérer un
         `index.html` tout frais et un `app-11-gouts.js` encore en v88, sorti du
         cache HTTP. Le résultat — un cache de version MÉLANGÉE — était ensuite
         servi durablement, puisque la règle est « cache d'abord ». C'est
         exactement ce que le commentaire du haut de ce fichier promet
         d'empêcher (« installe la nouvelle version d'un bloc »), et ce qu'il
         n'empêchait pas. Le chemin de secours plus bas (ligne ~73) utilisait
         déjà `{cache:'reload'}` ; il manquait ici, là où ça compte le plus. */
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache:'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Ressources de l'app : CACHE D'ABORD (décision du 07/08), réseau pour ce qui manque
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      /* Le cache est servi tel quel, sans revalidation fichier par fichier :
         mettre à jour le cache EN COURS DE ROUTE mélangerait deux versions
         (un index v88 avec des scripts v87). La nouvelle version arrive d'un
         bloc, par l'installation du prochain service worker. */
      const enCache = await caches.match(req);
      if (enCache) return enCache;

      /* Fichier absent du cache (première visite, ou installation partielle) :
         réseau. {cache:'reload'} : sans ça, ce fetch repassait par le cache
         HTTP du navigateur, et GitHub Pages y pose un max-age. On garde la
         réponse pour la fois d'après — mais seulement une vraie réponse : une
         page d'erreur 404 gardée en secours rendrait l'app inutilisable
         hors-ligne. */
      try {
        const res = await fetch(req, { cache: 'reload' });
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      } catch (err) {
        /* Le repli sur `index.html` ne vaut que pour une NAVIGATION. Servi à
           la place d'un fichier .js absent du cache, il rendait du HTML au
           navigateur (« Unexpected token '<' ») et l'app ne démarrait pas.
           Un fichier manquant doit échouer franchement, c'est diagnosticable.
           Revue de stabilité du 02/08, constat A5-5. */
        if (req.mode === 'navigate') {
          const idx = await caches.match('./index.html');
          if (idx) return idx;
        }
        return Response.error();
      }
    })());
    return;
  }

  // Tout le reste (API et images TMDB) passe directement par le réseau et le cache HTTP du navigateur.
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

/* ---------------------------------------------------------------------------
   Notifications

   iOS coupe l'abonnement d'une app qui reçoit un push sans rien afficher :
   tout passe donc par `waitUntil` et se termine toujours par une notification,
   même si le message reçu est illisible.

   L'affiche est transmise quand le serveur en envoie une. iOS l'ignore et
   remet l'icône du manifeste ; Android l'afficherait. On la joint quand même :
   ça ne coûte rien, et le jour où Apple l'acceptera, elle apparaîtra sans
   qu'on ait une ligne à changer.
--------------------------------------------------------------------------- */
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
    const titre = d.titre || 'Mes séries';
    const opts = {
      body: d.corps || '',
      tag: d.tag || 'mes-series',
      /* Sans ça, deux notifications portant le même tag se remplacent en
         silence : on veut que la seconde se signale quand même. */
      renotify: true,
      data: { url: d.url || './' }
    };
    if (d.affiche) opts.icon = d.affiche;
    if (d.bandeau) opts.image = d.bandeau;
    await self.registration.showNotification(titre, opts);
  })());
});

/* Un appui ouvre l'app sur l'écran concerné, ou remet au premier plan
   l'onglet déjà ouvert plutôt que d'en empiler un deuxième. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const cible = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const dest = new URL(cible, self.location.href).href;
    const liste = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of liste) {
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
        if ('navigate' in c && c.url !== dest) { try { await c.navigate(dest); } catch (err) {} }
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(dest);
  })());
});
