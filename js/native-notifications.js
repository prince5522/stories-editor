/* =====================================================
   STORIES EDITOR — ANDROID NATIVE REMINDER BRIDGE
   Uses local Android notifications.
   Does not replace the existing web reminder system.
===================================================== */

(function () {
  'use strict';

  const SLOT_NAMES = ['morning', 'lunch', 'evening'];
  const PLANNER_KEY = 'storySlotPlannerV1';

  const ID_BASE = {
    morning: 41000,
    lunch: 42000,
    evening: 43000
  };

  let syncing = false;

  function getPlugin() {
    return window.Capacitor?.Plugins?.LocalNotifications || null;
  }

  function isAndroidApp() {
    return !!(
      window.Capacitor?.isNativePlatform?.() &&
      window.Capacitor?.getPlatform?.() === 'android'
    );
  }

  function readSettings() {
    try {
      return window.StudioStore?.get(PLANNER_KEY, {}) || {};
    } catch (error) {
      console.warn('Could not read planner settings:', error);
      return {};
    }
  }

  function dateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function isCompleted(settings, slotName, date) {
    const scheduledDay = dateKey(date);

    if (settings.slotRuns?.[slotName] === scheduledDay) {
      return true;
    }

    const records = settings.completed?.[slotName] || [];

    return Array.isArray(records) && records.some(record => {
      const value =
        record?.completedAt ||
        record?.posted_at ||
        record?.postedAt ||
        record?.date;

      if (!value) return false;

      const completedDate = new Date(value);

      return !Number.isNaN(completedDate.getTime()) &&
        dateKey(completedDate) === scheduledDay;
    });
  }

  function nextDate(time, offset) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
      String(time || '')
    );

    if (!match) return null;

    const date = new Date();

    date.setDate(date.getDate() + offset);
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);

    return date;
  }

  async function requestPermission(plugin) {
    let permission = await plugin.checkPermissions();

    if (permission.display !== 'granted') {
      permission = await plugin.requestPermissions();
    }

    return permission.display === 'granted';
  }

  async function sync() {
    if (!isAndroidApp() || syncing) return;

    const plugin = getPlugin();

    if (!plugin) {
      console.warn('Android Local Notifications plugin unavailable.');
      return;
    }

    syncing = true;

    try {
      const allowed = await requestPermission(plugin);

      if (!allowed) {
        console.warn('Notification permission was not granted.');
        return;
      }

      const settings = readSettings();
      const notifications = [];
      const cancelIds = [];

      SLOT_NAMES.forEach(slotName => {
        for (let day = 0; day < 30; day++) {
          cancelIds.push(ID_BASE[slotName] + day);
        }
      });

      for (const slotName of SLOT_NAMES) {
        const slot = settings.slots?.[slotName];

        if (
          !slot ||
          !slot.time ||
          !slot.storyName ||
          !slot.channelUrl
        ) {
          continue;
        }

        for (let day = 0; day < 30; day++) {
          const scheduledDate = nextDate(slot.time, day);

          if (!scheduledDate || scheduledDate <= new Date()) {
            continue;
          }

          if (isCompleted(settings, slotName, scheduledDate)) {
            continue;
          }

          const id = ID_BASE[slotName] + day;

          const labels = {
            morning: '🌅 Morning posting time',
            lunch: '☀️ Lunch posting time',
            evening: '🌙 Evening posting time'
          };

          notifications.push({
            id,
            title: labels[slotName],
            body: 'It is time to prepare ' +
              slot.storyName +
              ' in Stories Editor.',
            schedule: {
              at: scheduledDate,
              allowWhileIdle: true
            },
            extra: {
              slot: slotName,
              page: 'planner.html'
            }
          });
        }
      }

      await plugin.cancel({
        notifications: cancelIds.map(id => ({ id }))
      });

      if (notifications.length) {
        await plugin.schedule({ notifications });
      }

      console.log(
        'Android reminders synchronized:',
        notifications.length
      );

    } catch (error) {
      console.error('Android reminder sync failed:', error);
    } finally {
      syncing = false;
    }
  }

  function delayedSync() {
    window.setTimeout(sync, 700);
  }

  document.addEventListener('DOMContentLoaded', delayedSync);

  document.addEventListener(
    'planner:posts-updated',
    delayedSync
  );

  document.addEventListener('click', event => {
    const button = event.target.closest(
      '#saveAllPlannerSlots, #savePlannerSettings'
    );

    if (button) delayedSync();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) delayedSync();
  });

  window.addEventListener('focus', delayedSync);

  window.StoriesAndroidReminders = {
    sync
  };

})();
