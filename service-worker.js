
/* =========================================
   CHANNEL STUDIO v16
   Instant offline startup + background updates
========================================= */

const CACHE = 'channel-studio-shell-v16';

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
  'js/planner-stage3.js',
  'js/planner-stage4.js',
  'js/planner-publish.js',
  'js/ready-made.js',
  'js/supabase-cloud.js',

  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

/* =========================================
   INSTALL
   Download the latest available app shell.
========================================= */

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    await Promise.all(
      CORE.map(async path => {
        try {
          const request = new Request(path, {
            cache: 'reload'
          });

          const response = await fetch(request);

          if (response.ok) {
            await cache.put(request, response);
          } else {
            console.warn(
              '[Channel Studio] Precache failed:',
              path,
              response.status
            );
          }
        } catch (error) {
          console.warn(
            '[Channel Studio] Could not precache:',
            path,
            error
          );
        }
      })
    );

    await self.skipWaiting();
  })());
});

/* =========================================
   ACTIVATE
   Remove old shell caches.
========================================= */

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('channel-studio-shell-') &&
          key !== CACHE
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();

    console.log('[Channel Studio] v16 activated');
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
   BACKGROUND CACHE REFRESH
========================================= */

async function refreshCache(request) {
  try {
    const response = await fetch(request, {
      cache: 'no-cache'
    });

    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
  } catch (error) {
    // Offline or connection unavailable.
    // Keep the existing cached version.
  }
}

/* =========================================
   FETCH
   Return cached content immediately.
   Refresh it in the background when online.
========================================= */

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // 1. Look for an instant cached response.
    const cached = await cache.match(request, {
      ignoreSearch: true
    });

    if (cached) {
      // 2. Refresh in the background.
      event.waitUntil(refreshCache(request));

      // 3. Return the cached response immediately.
      return cached;
    }

    // 4. If not cached, try the network.
    try {
      const response = await fetch(request);

      if (response && response.ok) {
        await cache.put(request, response.clone());
      }

      return response;
    } catch (error) {
      // 5. Offline navigation fallback.
      if (request.mode === 'navigate') {
        const fallback =
          await cache.match('index.html') ||
          await cache.match('./');

        if (fallback) return fallback;
      }

      return new Response(
        'You are offline. This item has not been saved for offline use yet.',
        {
          status: 503,
          statusText: 'Offline',
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        }
      );
    }
  })());
});

/* =========================================
   NOTIFICATION CLICK
========================================= */

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target =
    event.notification.data &&
    event.notification.data.url ||
    'notifications.html';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();

        if ('navigate' in client) {
          await client.navigate(target);
        }

        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(target);
    }
  })());
});
