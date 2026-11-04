
/* Channel Studio — Notifications & Daily Planner Reminders */
(function () {
'use strict';

const PLANNER_KEY = 'storySlotPlannerV1';
const REMINDER_KEY = 'channelStudioPlannerReminderLog';

const SLOT_NAMES = ['morning', 'lunch', 'evening'];

const SLOT_LABELS = {
  morning: '🌅 Morning queue',
  lunch: '☀️ Lunch queue',
  evening: '🌙 Evening queue'
};

let reminderTimer = null;
let checking = false;
const inFlight = new Set();

function store() {
  return window.StudioStore;
}

function enabled() {
  return store()
    ? store().get('notificationToneEnabled', true)
    : true;
}

function tone() {
  return store()
    ? store().get('notificationTone', 'chime')
    : 'chime';
}

/* ---------- SOUND ---------- */

function playTone(force) {
  if (!force && !enabled()) return false;

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;

  let ctx;

  try {
    ctx = new AC();

    const kind = tone();

    const notes = kind === 'bell'
      ? [740, 980, 740]
      : kind === 'ping'
        ? [1046]
        : [660, 880, 1046];

    let start = ctx.currentTime + 0.02;

    notes.forEach(hz => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = kind === 'bell' ? 'sine' : 'triangle';

      osc.frequency.setValueAtTime(hz, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.10, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.24);

      start += kind === 'bell' ? 0.17 : 0.13;
    });

    setTimeout(() => {
      try { ctx.close(); } catch (_) {}
    }, 1200);

    return true;
  } catch (e) {
    try { ctx?.close(); } catch (_) {}
    return false;
  }
}

/* ---------- PERMISSION ---------- */

async function request() {
  if (!('Notification' in window)) {
    return 'This browser does not support notifications.';
  }

  try {
    return await Notification.requestPermission();
  } catch (e) {
    return 'Permission request failed.';
  }
}

/* ---------- SEND NOTIFICATION ---------- */

async function send(title, body, options = {}) {
  if (!('Notification' in window)) return null;

  if (Notification.permission !== 'granted') {
    return null;
  }

  playTone(false);

  const opts = {
    body: String(body || ''),
    tag: options.tag || 'channel-studio-' + Date.now(),
    renotify: false,
    data: {
      url: options.url || 'planner.html'
    },
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/icon-192.png'
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;

      if (registration?.showNotification) {
        await registration.showNotification(
          String(title || 'Channel Studio'),
          opts
        );

        return true;
      }
    }
  } catch (e) {
    console.warn('Service worker notification failed:', e);
  }

  try {
    const notification = new Notification(
      String(title || 'Channel Studio'),
      opts
    );

    notification.onclick = () => {
      try {
        window.focus();

        window.location.href =
          options.url || 'planner.html';
      } catch (_) {}

      notification.close();
    };

    return true;
  } catch (e) {
    console.warn('Notification failed:', e);
    return null;
  }
}

/* ---------- DATE HELPERS ---------- */

function todayKey() {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function currentMinutes() {
  const d = new Date();

  return d.getHours() * 60 + d.getMinutes();
}

function timeToMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
    String(value || '')
  );

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

/* ---------- REMINDER STORAGE ---------- */

function getReminderLog() {
  try {
    return JSON.parse(
      localStorage.getItem(REMINDER_KEY) || '{}'
    );
  } catch (_) {
    return {};
  }
}

function saveReminderLog(log) {
  try {
    localStorage.setItem(
      REMINDER_KEY,
      JSON.stringify(log)
    );
  } catch (_) {}
}

/* ---------- COMPLETION CHECK ---------- */

function completedToday(settings, slotName) {
  if (settings.slotRuns?.[slotName] === todayKey()) {
    return true;
  }

  const records = settings.completed?.[slotName] || [];

  return records.some(item => {
    if (!item.completedAt) return false;

    const date = new Date(item.completedAt);

    if (Number.isNaN(date.getTime())) return false;

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-') === todayKey();
  });
}

/* ---------- PLANNER REMINDERS ---------- */

async function checkPlannerReminders() {
  if (checking || !store()) return;

  checking = true;

  try {
    const settings = store().get(PLANNER_KEY, {});

    if (!settings.slots) return;

    const now = currentMinutes();
    const today = todayKey();

    const log = getReminderLog();

    for (const slotName of SLOT_NAMES) {
      const slot = settings.slots[slotName];

      if (!slot ||
          !slot.time ||
          !slot.storyName ||
          !slot.channelUrl) {
        continue;
      }

      const scheduled = timeToMinutes(slot.time);

      if (scheduled === null) continue;

      // Do not notify before the scheduled time.
      if (now < scheduled) continue;

      // Do not remind about a queue already completed today.
      if (completedToday(settings, slotName)) continue;

      const reminderId = today + '-' + slotName;

      // Already notified today.
      if (log[reminderId]) continue;

      // Prevent overlapping notification attempts.
      if (inFlight.has(reminderId)) continue;

      inFlight.add(reminderId);

      try {
        const late = now > scheduled;

        const body = late
          ? 'Your scheduled posting time (' + slot.time +
            ') has passed. Prepare ' + slot.storyName +
            ' in Story Planner.'
          : 'It is time to prepare ' + slot.storyName +
            '. Open Story Planner to prepare your advertisement and episode.';

        const result = await send(
          SLOT_LABELS[slotName] + ' — Story Planner',
          body,
          {
            tag: 'planner-' + reminderId,
            url: 'planner.html'
          }
        );

        // Only record successful notification delivery.
        if (result === true) {
          log[reminderId] = {
            sent: true,
            date: today,
            time: slot.time,
            sentAt: new Date().toISOString()
          };

          saveReminderLog(log);
        }
      } finally {
        inFlight.delete(reminderId);
      }
    }

    // Keep the reminder log reasonably small.
    const keys = Object.keys(log);

    if (keys.length > 100) {
      const trimmed = {};

      keys.slice(-60).forEach(key => {
        trimmed[key] = log[key];
      });

      saveReminderLog(trimmed);
    }

  } catch (error) {
    console.error('Planner reminder error:', error);
  } finally {
    checking = false;
  }
}

/* ---------- REMINDER ENGINE ---------- */

function startPlannerReminders() {
  if (reminderTimer) return;

  // Check immediately when Planner starts.
  checkPlannerReminders();

  // Check regularly while the app is active.
  reminderTimer = window.setInterval(() => {
    checkPlannerReminders();
  }, 15000);
}

/* ---------- APP RETURN ---------- */

function handleAppReturn() {
  checkPlannerReminders();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    handleAppReturn();
  }
});

window.addEventListener('focus', handleAppReturn);
window.addEventListener('pageshow', handleAppReturn);

/* ---------- PUBLIC API ---------- */

window.StudioNotify = {
  request,
  send,
  playTone,
  startPlannerReminders,
  checkPlannerReminders
};

/* ---------- INITIALIZATION ---------- */

function init() {
  startPlannerReminders();

  console.log(
    'Channel Studio notification engine loaded successfully.'
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, {
    once: true
  });
} else {
  init();
}

})();
