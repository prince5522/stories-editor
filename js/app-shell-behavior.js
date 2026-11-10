
/* =====================================================
   CHANNEL STUDIO — APP SHELL BEHAVIOUR
   Android safe area + global wallpaper restoration
   Reliable notification routing + WhatsApp hand-off
   Preserves existing wallpaper data.
===================================================== */

(function () {
  'use strict';

  const DB_NAME = 'channelStudioAppearanceDB';
  const STORE_NAME = 'wallpapers';
  const WALLPAPER_KEY = 'custom-wallpaper';
  const BRIGHTNESS_KEY = 'studio_wallpaper_brightness';
  const PLANNER_KEY = 'storySlotPlannerV1';

  const SLOT_NAMES = ['morning', 'lunch', 'evening'];

  let notificationListenerRegistered = false;
  let notificationRegistrationPromise = null;
  let notificationRetryCount = 0;

  const MAX_NOTIFICATION_RETRIES = 20;
  const NOTIFICATION_RETRY_DELAY = 500;

  /* ---------- ANDROID SAFE AREA ---------- */

  function applyAndroidSafeArea() {
    if (
      !window.Capacitor?.isNativePlatform?.() ||
      window.Capacitor?.getPlatform?.() !== 'android'
    ) {
      return;
    }

    document.documentElement.classList.add(
      'native-android-shell'
    );

    if (
      !document.getElementById(
        'android-status-bar-background'
      )
    ) {
      const statusBackground =
        document.createElement('div');

      statusBackground.id =
        'android-status-bar-background';

      Object.assign(statusBackground.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        height: 'max(28px, env(safe-area-inset-top, 28px))',
        background: '#36594f',
        zIndex: '99999',
        pointerEvents: 'none'
      });

      document.body.appendChild(statusBackground);
    }

    if (
      document.getElementById('android-safe-area-fix')
    ) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'android-safe-area-fix';

    style.textContent = `
      html.native-android-shell body {
        padding-top: max(28px, env(safe-area-inset-top, 0px));
      }

      html.native-android-shell .topbar {
        top: max(28px, env(safe-area-inset-top, 0px));
      }
    `;

    document.head.appendChild(style);
  }

  /* ---------- PLANNER NOTIFICATION ROUTING ---------- */

  function revealPlannerSlot(slotName) {
    if (!SLOT_NAMES.includes(slotName)) return;

    const folder = document.getElementById(
      'dailyPostingFolder'
    );

    if (folder) {
      folder.open = true;
    }

    const panel = document.querySelector(
      `[data-slot="${slotName}"]`
    );

    if (!panel) return;

    const parentFolder = panel.closest('details');

    if (parentFolder) {
      parentFolder.open = true;
    }

    window.setTimeout(() => {
      try {
        panel.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

        const action = panel.querySelector(
          '[data-prepare-episode], [data-start-advert]'
        );

        action?.focus({
          preventScroll: true
        });
      } catch (error) {
        console.warn(
          'Could not focus the selected Planner queue:',
          error
        );
      }
    }, 250);
  }

  function handlePlannerNotificationOpened(event) {
    const slotName = event?.detail?.slot || '';

    revealPlannerSlot(slotName);
  }

  function handlePlannerNotificationQuery() {
    const currentPage =
      window.location.pathname.split('/').pop();

    if (currentPage !== 'planner.html') return;

    const params = new URLSearchParams(
      window.location.search
    );

    const slotName = params.get('slot');

    if (!SLOT_NAMES.includes(slotName)) return;

    window.setTimeout(() => {
      revealPlannerSlot(slotName);
    }, 350);
  }

  /* ---------- NOTIFICATION DESTINATION ---------- */

  function getNotificationExtra(event) {
    const notification = event?.notification || {};

    return (
      notification.extra ||
      notification.data ||
      event?.extra ||
      {}
    );
  }

  function openPlannerFromNotification(event) {
    try {
      const extra = getNotificationExtra(event);

      const requestedPage = String(
        extra.page || 'planner.html'
      );

      const targetPage = requestedPage
        .split('?')[0]
        .split('#')[0];

      if (targetPage !== 'planner.html') {
        window.location.assign('planner.html');
        return;
      }

      const targetURL = new URL(
        'planner.html',
        window.location.href
      );

      const slot = String(extra.slot || '');

      if (SLOT_NAMES.includes(slot)) {
        targetURL.searchParams.set('slot', slot);
      }

      const currentPage =
        window.location.pathname.split('/').pop();

      if (
        currentPage === 'planner.html' &&
        window.location.search === targetURL.search
      ) {
        window.dispatchEvent(
          new CustomEvent(
            'planner:notification-opened',
            {
              detail: { slot }
            }
          )
        );

        return;
      }

      window.location.assign(
        targetURL.pathname + targetURL.search
      );

    } catch (error) {
      console.warn(
        'Could not open Planner from notification:',
        error
      );

      window.location.assign('planner.html');
    }
  }

  /* ---------- ANDROID NOTIFICATION LISTENER ---------- */

  function isAndroidApp() {
    return (
      window.Capacitor?.isNativePlatform?.() === true &&
      window.Capacitor?.getPlatform?.() === 'android'
    );
  }

  function registerAndroidNotificationClicks() {
    if (
      !isAndroidApp() ||
      notificationListenerRegistered ||
      notificationRegistrationPromise
    ) {
      return;
    }

    const notifications =
      window.Capacitor?.Plugins?.LocalNotifications;

    if (!notifications?.addListener) {
      scheduleNotificationRetry();
      return;
    }

    try {
      notificationRegistrationPromise = Promise.resolve(
        notifications.addListener(
          'localNotificationActionPerformed',
          openPlannerFromNotification
        )
      );

      notificationRegistrationPromise
        .then(() => {
          notificationListenerRegistered = true;
          notificationRetryCount = 0;

          console.info(
            'Story Studio: Android notification clicks are ready.'
          );
        })
        .catch(error => {
          console.warn(
            'Android notification listener registration failed:',
            error
          );

          notificationRegistrationPromise = null;
          scheduleNotificationRetry();
        });

    } catch (error) {
      notificationRegistrationPromise = null;

      console.warn(
        'Could not register Android notification clicks:',
        error
      );

      scheduleNotificationRetry();
    }
  }

  function scheduleNotificationRetry() {
    if (
      !isAndroidApp() ||
      notificationListenerRegistered ||
      notificationRegistrationPromise ||
      notificationRetryCount >= MAX_NOTIFICATION_RETRIES
    ) {
      return;
    }

    notificationRetryCount++;

    window.setTimeout(() => {
      registerAndroidNotificationClicks();
    }, NOTIFICATION_RETRY_DELAY);
  }

  /* ---------- PLANNER CLIPBOARD HELPERS ---------- */

  function readPlannerSettings() {
    try {
      return window.StudioStore?.get(
        PLANNER_KEY,
        {}
      ) || {};
    } catch (error) {
      console.warn(
        'Could not read Planner settings:',
        error
      );

      return {};
    }
  }

  function findPendingEpisode(settings, slot) {
    const pending = settings.pending;

    if (!pending || !slot) return null;

    const collection = slot.type === 'ready'
      ? window.StudioStore?.get('readyMadeEpisodes', [])
      : window.StudioStore?.get('episodes', []);

    if (!Array.isArray(collection)) return null;

    return collection.find(episode =>
      String(episode.id) === String(pending.episodeId)
    ) || null;
  }

  function makeEpisodeText(episode, type) {
    if (!episode) return '';

    if (type === 'ready') {
      return [
        episode.story_title ||
          episode.storyName ||
          'Untitled story',

        `🌿 SEASON ${String(
          episode.season_number || 1
        ).padStart(2, '0')} 🌿`,

        `🎬 EPISODE ${String(
          episode.episode_number || 1
        ).padStart(2, '0')} ✨`,

        episode.episode_name || episode.title || '',
        episode.episode_subtitle || '',
        episode.episode_text || episode.content || '',
        '🔔 TO BE CONTINUED…',
        '❤️ React for more stories! 🔥'
      ].filter(Boolean).join('\n\n');
    }

    if (typeof window.buildEpisodeShareText === 'function') {
      return window.buildEpisodeShareText(episode);
    }

    return [
      episode.storyTitle ||
        episode.seasonTitle ||
        'Untitled story',

      `🌿 SEASON ${String(
        episode.seasonNumber || 1
      ).padStart(2, '0')} 🌿`,

      `🎬 EPISODE ${String(
        episode.episodeNumber || 1
      ).padStart(2, '0')} ✨`,

      episode.content || '',
      '🔔 TO BE CONTINUED…',
      '❤️ React for more stories! 🔥'
    ].join('\n\n');
  }

  function copyImmediately(value) {
    const text = String(value || '');

    if (!text.trim()) return false;

    const area = document.createElement('textarea');

    area.value = text;
    area.setAttribute('readonly', '');

    Object.assign(area.style, {
      position: 'fixed',
      left: '-9999px',
      top: '0',
      width: '2px',
      height: '2px',
      opacity: '0.01',
      fontSize: '16px',
      zIndex: '999999'
    });

    document.body.appendChild(area);

    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);

    let copied = false;

    try {
      copied = document.execCommand('copy');
    } catch (error) {
      console.warn(
        'Immediate clipboard copy failed:',
        error
      );
    }

    area.remove();

    if (!copied && navigator.clipboard?.writeText) {
      try {
        navigator.clipboard.writeText(text)
          .catch(error => {
            console.warn(
              'Clipboard API fallback failed:',
              error
            );
          });
      } catch (error) {
        console.warn(
          'Could not start clipboard fallback:',
          error
        );
      }
    }

    return copied;
  }

  /* ---------- WHATSAPP POPUP HAND-OFF ---------- */

  function prepareWhatsAppPopup(channelUrl) {
    if (!channelUrl) return;

    let popup = null;

    try {
      // Open during the original button tap, before async work.
      popup = window.open('about:blank', '_blank');
    } catch (error) {
      console.warn(
        'Could not pre-open WhatsApp window:',
        error
      );
    }

    if (!popup) return;

    const originalOpen = window.open;
    let completed = false;

    function bridgedOpen(url, target, features) {
      if (
        !completed &&
        String(url || '') === String(channelUrl)
      ) {
        completed = true;

        if (window.open === bridgedOpen) {
          window.open = originalOpen;
        }

        try {
          popup.location.href = String(channelUrl);
        } catch (error) {
          console.warn(
            'Could not redirect the prepared WhatsApp window:',
            error
          );
        }

        return popup;
      }

      return originalOpen.call(
        window,
        url,
        target,
        features
      );
    }

    window.open = bridgedOpen;

    window.setTimeout(() => {
      if (completed) return;

      if (window.open === bridgedOpen) {
        window.open = originalOpen;
      }

      try {
        popup.close();
      } catch (error) {
        // Ignore an already closed window.
      }
    }, 15000);
  }

  function handlePlannerPublishTap(event) {
    if (!event.isTrusted) return;

    const button = event.target.closest(
      '[data-start-advert], [data-prepare-episode]'
    );

    if (!button) return;

    const settings = readPlannerSettings();

    const isAdvertisement =
      button.hasAttribute('data-start-advert');

    const slotName = isAdvertisement
      ? button.dataset.startAdvert
      : button.dataset.prepareEpisode;

    if (!SLOT_NAMES.includes(slotName)) return;

    const slot = settings.slots?.[slotName];

    if (!slot?.channelUrl) return;

    let textToCopy = '';

    if (isAdvertisement) {
      if (settings.pending) return;

      textToCopy = String(
        settings.adText || ''
      ).trim();

      if (!textToCopy) return;

    } else {
      const pending = settings.pending;

      if (
        !pending ||
        pending.slot !== slotName ||
        pending.stage !== 'advert-confirmed'
      ) {
        return;
      }

      const episode = findPendingEpisode(
        settings,
        slot
      );

      if (!episode) return;

      textToCopy = makeEpisodeText(
        episode,
        slot.type
      );
    }

    // Make the clipboard attempt while the button tap is active.
    copyImmediately(textToCopy);

    // Keep the WhatsApp window available for the existing
    // Planner publishing function after its copy Promise resolves.
    prepareWhatsAppPopup(slot.channelUrl);
  }

  /* ---------- GLOBAL WALLPAPER ---------- */

  function applyGlobalWallpaper(blob) {
    if (!blob || !(blob instanceof Blob)) return;

    let layer = document.getElementById(
      'studioGlobalWallpaper'
    );

    if (!layer) {
      layer = document.createElement('div');

      layer.id = 'studioGlobalWallpaper';

      Object.assign(layer.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '-1',
        pointerEvents: 'none',
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat'
      });

      document.body.prepend(layer);
    }

    const oldUrl = layer.dataset.objectUrl;

    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }

    const imageUrl = URL.createObjectURL(blob);

    layer.dataset.objectUrl = imageUrl;

    let brightness = 75;

    try {
      const savedBrightness = Number(
        localStorage.getItem(BRIGHTNESS_KEY)
      );

      if (
        Number.isFinite(savedBrightness) &&
        savedBrightness >= 20 &&
        savedBrightness <= 100
      ) {
        brightness = savedBrightness;
      }
    } catch (error) {
      // Continue with default brightness.
    }

    const darkness =
      ((100 - brightness) / 100) * 0.65;

    layer.style.backgroundImage =
      `linear-gradient(rgba(0,0,0,${darkness}), rgba(0,0,0,${darkness})), url("${imageUrl}")`;

    document.documentElement.style.backgroundColor =
      'transparent';

    document.body.style.backgroundColor =
      'transparent';
  }

  function loadGlobalWallpaper() {
    if (!window.indexedDB) return;

    let request;

    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      console.warn(
        'Wallpaper database could not open:',
        error
      );
      return;
    }

    request.onupgradeneeded = function (event) {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = function () {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        return;
      }

      try {
        const transaction = db.transaction(
          STORE_NAME,
          'readonly'
        );

        const getRequest = transaction
          .objectStore(STORE_NAME)
          .get(WALLPAPER_KEY);

        getRequest.onsuccess = function () {
          applyGlobalWallpaper(getRequest.result);
        };

        getRequest.onerror = function () {
          console.warn(
            'Could not restore saved wallpaper.'
          );
        };

        transaction.oncomplete = function () {
          db.close();
        };

        transaction.onerror = function () {
          db.close();
        };

      } catch (error) {
        console.warn(
          'Wallpaper restoration failed:',
          error
        );

        db.close();
      }
    };

    request.onerror = function () {
      console.warn(
        'Wallpaper database could not be opened.'
      );
    };
  }

  /* ---------- STARTUP ---------- */

  function start() {
    applyAndroidSafeArea();
    registerAndroidNotificationClicks();
    loadGlobalWallpaper();
    handlePlannerNotificationQuery();
  }

  document.addEventListener(
    'click',
    handlePlannerPublishTap,
    true
  );

  document.addEventListener(
    'planner:notification-opened',
    handlePlannerNotificationOpened
  );

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      start,
      { once: true }
    );
  } else {
    start();
  }

  document.addEventListener(
    'deviceready',
    registerAndroidNotificationClicks
  );

  document.addEventListener(
    'visibilitychange',
    function () {
      if (!document.hidden) {
        registerAndroidNotificationClicks();
      }
    }
  );

  window.addEventListener(
    'focus',
    registerAndroidNotificationClicks
  );

})();
