
/* =========================================
   CHANNEL STUDIO v19
   OFFLINE-FIRST PERFORMANCE
   - Cached pages load immediately
   - Background updates when online
   - Migrates v18 cache before removing it
   - Preserves Planner and notification support
========================================= */

const CACHE = 'channel-studio-shell-v19';

const CORE = [
  './',
  'index.html',
  'home.html',
  'stories.html',
  'docs.html',
  'episodes.html',
  'ready-made.html',
  'planner.html',
  'publish.html',
  'hype.html',
  'media.html',
  'channels.html',
  'complaints.html',
  'reviews.html',
  'notifications.html',
  'backup.html',
  'settings.html',
  'manifest.webmanifest',

  'css/styles.css',
  'css/animations.css',
  'css/themes.css',
  'css/whatsapp-shell.css',
  'css/ready-made.css',

  'js/app-shell-behavior.js',
  'js/storage.js',
  'js/themes.js',
  'js/transitions.js',
  'js/effects.js',
  'js/notifications.js',
  'js/feedback.js',
  'js/app.js',
  'js/story-engine.js',
  'js/story-split-post.js',
  'js/documents.js',
  'js/creator-lab.js',
  'js/media.js',
  'js/media-attach.js',
  'js/planner-media.js',
  'js/planner-story-slots.js',
  'js/planner-publish.js',
  'js/planner-progress.js',
  'js/planner-stage3.js',
  'js/planner-stage4.js',
  'js/ready-made.js',
  'js/supabase-cloud.js',
  'js/whatsapp-shell.js',
  'js/wallpaper.js',

  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

/* =========================================
   INSTALL
   Migrate old cache first, then update files.
========================================= */

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const oldCaches = (await caches.keys()).filter(name =>
      name.startsWith('channel-studio-shell-') &&
      name !== CACHE
    );

    // Preserve previously cached files.
    for (const oldName of oldCaches) {
      try {
        const oldCache = await caches.open(oldName);
        const requests = await oldCache.keys();

        await Promise.all(requests.map(async request => {
          try {
            const existing = await cache.match(request);

            if (existing) return;

            const response = await oldCache.match(request);

            if (response) {
              await cache.put(request, response);
            }
          } catch (error) {
            console.warn('[Channel Studio] Cache migration item failed:', error);
          }
        }));
      } catch (error) {
        console.warn('[Channel Studio] Old cache migration failed:', error);
      }
    }

    // Refresh core files when internet is available.
    // If offline, migrated cached copies remain available.
    await Promise.all(CORE.map(async path => {
      try {
        const request = new Request(path, {
          cache: 'reload'
        });

        const response = await fetch(request);

        if (response && response.ok) {
          await cache.put(request, response);
        }
      } catch (error) {
        // Offline installation: keep the migrated copy.
      }
    }));

    await self.skipWaiting();

    console.log('[Channel Studio] v19 installed');
  })());
});

/* =========================================
   ACTIVATE
========================================= */

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(name =>
          name.startsWith('channel-studio-shell-') &&
          name !== CACHE
        )
        .map(name => caches.delete(name))
    );

    await self.clients.claim();

    console.log('[Channel Studio] v19 activated');
  })());
});

/* =========================================
   MANUAL UPDATE MESSAGE
========================================= */

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* =========================================
   OFFLINE FALLBACK
========================================= */

function offlineResponse(request) {
  if (request.mode === 'navigate') {
    return caches.open(CACHE).then(async cache => {
      return (
        await cache.match('index.html') ||
        await cache.match('./') ||
        new Response(
          'Channel Studio is offline and this page has not been cached yet.',
          {
            status: 503,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8'
            }
          }
        )
      );
    });
  }

  return new Response('', {
    status: 504,
    statusText: 'Offline resource unavailable'
  });
}

/* =========================================
   CACHE-FIRST + BACKGROUND REFRESH
========================================= */

function handleRequest(request) {
  const cachePromise = caches.open(CACHE);

  const cachedPromise = cachePromise.then(cache =>
    cache.match(request, {
      ignoreSearch: true
    })
  );

  // Start refreshing in the background.
  const networkPromise = cachePromise.then(async cache => {
    const response = await fetch(request);

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  });

  return {
    response: cachedPromise.then(cached => {
      if (cached) {
        return cached;
      }

      return networkPromise.catch(() =>
        offlineResponse(request)
      );
    }).catch(() =>
      offlineResponse(request)
    ),

    update: networkPromise.catch(() => undefined)
  };
}

/* =========================================
   FETCH
========================================= */

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Do not intercept external services.
  if (url.origin !== self.location.origin) return;

  const result = handleRequest(request);

  // Register background work immediately.
  event.waitUntil(result.update);

  // Return cached content without waiting for internet.
  event.respondWith(result.response);
});

/* =========================================
   NOTIFICATION CLICK
========================================= */

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target =
    event.notification.data &&
    event.notification.data.url ||
    'planner.html';

  event.waitUntil((async () => {
    const targetURL = new URL(
      target,
      self.registration.scope
    );

    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();

        if ('navigate' in client) {
          await client.navigate(targetURL.href);
        }

        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetURL.href);
    }
  })());
});
