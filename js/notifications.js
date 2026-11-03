
/* Channel Studio notifications and daily Planner reminders */
(function () {
'use strict';

const PLANNER_KEY = 'storySlotPlannerV1';
const REMINDER_KEY = 'channelStudioPlannerReminderLog';

function store() {
  return window.StudioStore;
}

function enabled() {
  return store() ? store().get('notificationToneEnabled', true) : true;
}

function tone() {
  return store() ? store().get('notificationTone', 'chime') : 'chime';
}

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

    let start = ctx.currentTime + .02;

    notes.forEach(hz => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = kind === 'bell' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(hz, start);

      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.10, start + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + .24);

      start += kind === 'bell' ? .17 : .13;
    });

    setTimeout(() => {
      try { ctx.close(); } catch (e) {}
    }, 1200);

    return true;
  } catch (e) {
    try { ctx?.close(); } catch (_) {}
    return false;
  }
}

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

async function send(title, body, options = {}) {
  playTone(false);

  if (!('Notification' in window) ||
      Notification.permission !== 'granted') {
    return null;
  }

  const opts = {
    body: String(body || ''),
    tag: options.tag || 'channel-studio-' + Date.now(),
    data: {
      url: options.url || 'planner.html'
    },
    renotify: false,
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
  } catch (e) {}

  try {
    const notification = new Notification(
      String(title || 'Channel Studio'),
      opts
    );

    notification.onclick = () => {
      try {
        window.focus();
        if (options.url) window.location.href = options.url;
      } catch (e) {}
      notification.close();
    };

    return true;
  } catch (e) {
    return null;
  }
}

function getReminderLog() {
  try {
    return JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveReminderLog(log) {
  try {
    localStorage.setItem(REMINDER_KEY, JSON.stringify(log));
  } catch (e) {}
}

function checkPlannerReminders() {
  if (!store()) return;

  const settings = store().get(PLANNER_KEY, {});
  if (!settings.slots) return;

  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');

  const currentTime = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0')
  ].join(':');

  const log = getReminderLog();

  ['morning', 'lunch', 'evening'].forEach(slotName => {
    const slot = settings.slots[slotName];

    if (!slot || !slot.time || !slot.storyName || !slot.channelUrl) {
      return;
    }

    if (slot.time !== currentTime) return;

    const reminderId = today + '-' + slotName;

    if (log[reminderId]) return;

    log[reminderId] = true;
    saveReminderLog(log);

    const names = {
      morning: '🌅 Morning queue',
      lunch: '☀️ Lunch queue',
      evening: '🌙 Evening queue'
    };

    send(
      names[slotName] + ' — Story Planner',
      'It is time to prepare ' + slot.storyName +
      '. Open Story Planner to prepare your advertisement and episode.',
      {
        tag: 'planner-' + reminderId,
        url: 'planner.html'
      }
    );
  });
}

let reminderTimer = null;

function startPlannerReminders() {
  if (reminderTimer) return;

  checkPlannerReminders();
  reminderTimer = setInterval(checkPlannerReminders, 15000);
}

window.StudioNotify = {
  request,
  send,
  playTone,
  startPlannerReminders,
  checkPlannerReminders
};

document.addEventListener('DOMContentLoaded', () => {
  startPlannerReminders();
});

})();
