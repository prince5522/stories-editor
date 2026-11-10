
/* =====================================================
   STORY STUDIO — SERVICE WORKER
   Version: 29

   Features:
   - Offline page support
   - Automatic application updates
   - Cache migration
   - Network-first page loading
   - Network-first JavaScript and CSS
   - Offline fallback
   - Notification click navigation
   - Safe cache cleanup
===================================================== */

'use strict';

/* =====================================================
   CACHE CONFIGURATION
===================================================== */

const CACHE_VERSION = 'channel-studio-shell-v29';
const CACHE_PREFIX = 'channel-studio-shell-';

const FETCH_TIMEOUT = 8000;

const PAGES = [
  './',
  'index.html',
  'login.html',
  'home.html',
  'stories.html',
  'episodes.html',
  'ready-made.html',
  'planner.html',
  'publish.html',
  'hype.html',
  'media.html',
  'channels.html',
  'docs.html',
  'complaints.html',
  'reviews.html',
  'notifications.html',
  'backup.html',
  'settings.html',
  'accounts.html'
];

const STYLES = [
  'css/styles.css',
  'css/animations.css',
  'css/themes.css',
  'css/whatsapp-shell.css',
  'css/ready-made.css'
];

const SCRIPTS = [
  'js/app-shell-behavior.js',
  'js/storage.js',
  'js/themes.js',
  'js/transitions.js',
  'js/effects.js',
  'js/notifications.js',
  'js/native-notifications.js',
  'js/feedback.js',
  'js/app.js',
  'js/story-engine.js',
  'js/story-split-post.js',
  'js/documents.js',
  'js/creator-lab.js',
  'js/media.js',
  'js/media-attach.js',
  'js/android-import.js',
  'js/planner-media.js',
  'js/planner-story-slots.js',
  'js/planner-publish.js',
  'js/planner-progress.js',
  'js/planner-stage3.js',
  'js/planner-stage4.js',
  'js/ready-made.js',
  'js/supabase-cloud.js',
  'js/auth.js',
  'js/whatsapp-shell.js',
  'js/wallpaper.js',
  'js/story-runway-alerts.js'
];

const OTHER_FILES = [
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

const CORE_FILES = [
  ...PAGES,
  ...STYLES,
  ...SCRIPTS,
  ...OTHER_FILES
];

/* =====================================================
   HELPERS
===================================================== */

function makeURL(path) {
  return new URL(path, self.registration.scope).href;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT);

  try {
    return await fetch(url, {
      cache: 'no-store',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function saveResponse(cache, request, response) {
  if (!response || !response.ok) return;

  try {
    await cache.put(request, response.clone());
  } catch (error) {
    console.warn(
      '[Story Studio] Could not cache resource:',
      request.url,
      error
    );
  }
}

function isCodeAsset(request, url) {
  const destination = request.destination || '';

  if (
    destination === 'script' ||
    destination === 'style'
  ) {
    return true;
  }

  return /\.(js|css)$/i.test(url.pathname);
}

/* =====================================================
   INSTALL
===================================================== */

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);

    console.log(
      '[Story Studio] Installing version 29...'
    );

    /* ---------------------------------------------
       MIGRATE PREVIOUS CACHE CONTENT
    --------------------------------------------- */

    const oldCaches = (await caches.keys()).filter(name =>
      name.startsWith(CACHE_PREFIX) &&
      name !== CACHE_VERSION
    );

    for (const oldName of oldCaches) {
      try {
        const oldCache = await caches.open(oldName);
        const requests = await oldCache.keys();

        for (const request of requests) {
          try {
            if (await cache.match(request)) continue;

            const response = await oldCache.match(request);

            if (response) {
              await cache.put(request, response);
            }

          } catch (error) {
            console.warn(
              '[Story Studio] Migration item skipped:',
              request.url
            );
          }
        }

      } catch (error) {
        console.warn(
          '[Story Studio] Previous cache migration failed:',
          oldName,
          error
        );
      }
    }

    /* ---------------------------------------------
       DOWNLOAD CORE APPLICATION FILES
    --------------------------------------------- */

    const results = await Promise.allSettled(
      CORE_FILES.map(async path => {
        const url = makeURL(path);

        try {
          const response = await fetchWithTimeout(url);

          if (response && response.ok) {
            await saveResponse(cache, url, response);
          } else {
            console.warn(
              '[Story Studio] File unavailable:',
              path
            );
          }

        } catch (error) {
          console.warn(
            '[Story Studio] Using previous cached copy:',
            path
          );
        }
      })
    );

    const successful = results.filter(
      result => result.status === 'fulfilled'
    ).length;

    console.log(
      `[Story Studio] Core cache processed: ${successful}/${CORE_FILES.length}`
    );

    await self.skipWaiting();

  })());
});

/* =====================================================
   ACTIVATE
===================================================== */

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();

    await Promise.all(
      cacheNames
        .filter(name =>
          name.startsWith(CACHE_PREFIX) &&
          name !== CACHE_VERSION
        )
        .map(name => caches.delete(name))
    );

    await self.clients.claim();

    console.log(
      '[Story Studio] Version 29 activated.'
    );

    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    clients.forEach(client => {
      client.postMessage({
        type: 'STORY_STUDIO_UPDATED',
        version: CACHE_VERSION
      });
    });

  })());
});

/* =====================================================
   UPDATE MESSAGES
===================================================== */

self.addEventListener('message', event => {
  const message = event.data;

  if (message === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (message && message.type === 'GET_VERSION') {
    event.source?.postMessage({
      type: 'SERVICE_WORKER_VERSION',
      version: CACHE_VERSION
    });
  }
});

/* =====================================================
   OFFLINE FALLBACK
===================================================== */

async function offlineResponse(request) {
  const cache = await caches.open(CACHE_VERSION);

  if (request.mode === 'navigate') {
    const cachedPage = await cache.match(
      request,
      { ignoreSearch: true }
    );

    if (cachedPage) return cachedPage;

    const home = await cache.match(makeURL('home.html'));

    if (home) return home;

    const welcome = await cache.match(makeURL('index.html'));

    if (welcome) return welcome;

    return new Response(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head><body><h1>Story Studio is offline</h1><p>This page has not been saved for offline use yet. Reconnect to the internet and try again.</p></body></html>',
      {
        status: 503,
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      }
    );
  }

  const cachedResource = await cache.match(
    request,
    { ignoreSearch: true }
  );

  if (cachedResource) return cachedResource;

  return new Response(
    'This resource is not available offline.',
    {
      status: 504,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    }
  );
}

/* =====================================================
   FETCH HANDLER
===================================================== */

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.headers.has('range')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    /* ---------------------------------------------
       HTML PAGES — NETWORK FIRST
    --------------------------------------------- */

    if (request.mode === 'navigate') {
      try {
        const response = await fetchWithTimeout(request);

        if (response && response.ok) {
          await saveResponse(cache, request, response);
          return response;
        }

      } catch (error) {
        console.warn(
          '[Story Studio] Page loaded from offline cache:',
          url.pathname
        );
      }

      return offlineResponse(request);
    }

    /* ---------------------------------------------
       JAVASCRIPT AND CSS — NETWORK FIRST
       Prevents old cached code from being served
       when a newer version is available.
    --------------------------------------------- */

    if (isCodeAsset(request, url)) {
      try {
        const response = await fetchWithTimeout(request);

        if (response && response.ok) {
          await saveResponse(cache, request, response);
          return response;
        }

      } catch (error) {
        console.warn(
          '[Story Studio] Code asset using offline cache:',
          url.pathname
        );
      }

      return offlineResponse(request);
    }

    /* ---------------------------------------------
       OTHER FILES — CACHE FIRST
       Refresh cache in the background.
    --------------------------------------------- */

    const cached = await cache.match(
      request,
      { ignoreSearch: true }
    );

    if (cached) {
      event.waitUntil(
        fetchWithTimeout(request)
          .then(response => {
            return saveResponse(cache, request, response);
          })
          .catch(() => {
            // Keep the existing offline copy.
          })
      );

      return cached;
    }

    /* ---------------------------------------------
       RESOURCE NOT CACHED — NETWORK
    --------------------------------------------- */

    try {
      const response = await fetchWithTimeout(request);

      if (response && response.ok) {
        await saveResponse(cache, request, response);
      }

      return response;

    } catch (error) {
      return offlineResponse(request);
    }

  })());
});

/* =====================================================
   NOTIFICATION CLICK
===================================================== */

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const requestedTarget =
    event.notification.data?.url || 'planner.html';

  event.waitUntil((async () => {
    let targetURL;

    try {
      targetURL = new URL(
        requestedTarget,
        self.registration.scope
      );

      if (
        targetURL.origin !== self.location.origin ||
        !targetURL.href.startsWith(self.registration.scope)
      ) {
        targetURL = new URL(
          'planner.html',
          self.registration.scope
        );
      }

    } catch (error) {
      targetURL = new URL(
        'planner.html',
        self.registration.scope
      );
    }

    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if (
        client.url.startsWith(self.registration.scope) &&
        'focus' in client
      ) {
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
