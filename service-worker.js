
/* =========================================
   CHANNEL STUDIO v20
   OFFLINE-FIRST PERFORMANCE
========================================= */

const CACHE = 'channel-studio-shell-v20';
const CACHE_PREFIX = 'channel-studio-shell-';
const INSTALL_FETCH_TIMEOUT = 2500;

const CORE = [
  './', 'index.html', 'home.html', 'stories.html',
  'docs.html', 'episodes.html', 'ready-made.html',
  'planner.html', 'publish.html', 'hype.html',
  'media.html', 'channels.html', 'complaints.html',
  'reviews.html', 'notifications.html', 'backup.html',
  'settings.html', 'manifest.webmanifest',

  'css/styles.css', 'css/animations.css',
  'css/themes.css', 'css/whatsapp-shell.css',
  'css/ready-made.css',

  'js/app-shell-behavior.js', 'js/storage.js',
  'js/themes.js', 'js/transitions.js', 'js/effects.js',
  'js/notifications.js', 'js/feedback.js', 'js/app.js',
  'js/story-engine.js', 'js/story-split-post.js',
  'js/documents.js', 'js/creator-lab.js', 'js/media.js',
  'js/media-attach.js', 'js/planner-media.js',
  'js/planner-story-slots.js', 'js/planner-publish.js',
  'js/planner-progress.js', 'js/planner-stage3.js',
  'js/planner-stage4.js', 'js/ready-made.js',
  'js/supabase-cloud.js', 'js/whatsapp-shell.js',
  'js/wallpaper.js',

  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      cache: 'reload',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/* INSTALL */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    const oldCaches = (await caches.keys()).filter(name =>
      name.startsWith(CACHE_PREFIX) && name !== CACHE
    );

    // Preserve files already cached by earlier versions.
    for (const oldName of oldCaches) {
      try {
        const oldCache = await caches.open(oldName);
        const requests = await oldCache.keys();

        await Promise.all(requests.map(async request => {
          try {
            if (await cache.match(request)) return;

            const response = await oldCache.match(request);
            if (response) await cache.put(request, response);
          } catch (error) {
            console.warn('Cache migration item failed:', error);
          }
        }));
      } catch (error) {
        console.warn('Cache migration failed:', error);
      }
    }

    // Refresh core files with a strict timeout.
    await Promise.all(CORE.map(async path => {
      const url = new URL(path, self.registration.scope);

      try {
        const response = await fetchWithTimeout(
          url.href,
          INSTALL_FETCH_TIMEOUT
        );

        if (response && response.ok) {
          await cache.put(url.href, response);
        }
      } catch (error) {
        // Keep the migrated cache when offline.
      }
    }));

    await self.skipWaiting();
    console.log('[Channel Studio] v20 installed');
  })());
});

/* ACTIVATE */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(keys
      .filter(name =>
        name.startsWith(CACHE_PREFIX) && name !== CACHE
      )
      .map(name => caches.delete(name))
    );

    await self.clients.claim();
    console.log('[Channel Studio] v20 activated');
  })());
});

/* MANUAL UPDATE */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* OFFLINE FALLBACK */
async function offlineResponse(request) {
  if (request.mode === 'navigate') {
    const cache = await caches.open(CACHE);

    return (
      await cache.match(request, { ignoreSearch: true }) ||
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
  }

  return new Response('', {
    status: 504,
    statusText: 'Offline resource unavailable'
  });
}

/* CACHE-FIRST FETCH */
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Do not intercept external services.
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const cache = await caches.open(CACHE);

      const cached = await cache.match(request, {
        ignoreSearch: true
      });

      // Cached pages/files return immediately.
      if (cached) return cached;

      // Only missing files require the network.
      const response = await fetch(request);

      if (response && response.ok) {
        await cache.put(request, response.clone());
      }

      return response;
    } catch (error) {
      return offlineResponse(request);
    }
  })());
});

/* NOTIFICATION CLICK */
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
