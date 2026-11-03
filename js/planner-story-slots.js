
/* =========================================
   STORY STUDIO — SHARED REMINDER MONITOR
   App-wide local posting reminders.
   Works while a non-Planner Story Studio
   page is open, including offline.
========================================= */

(function () {
  'use strict';

  const KEY = 'storySlotPlannerV1';
  const LOCK_KEY = 'storyReminderMonitorLockV1';
  const LOCK_DURATION = 12000;
  const CHECK_INTERVAL = 15000;

  let timer = null;
  let checking = false;

  const owner =
    Date.now().toString(36) +
    Math.random().toString(36).slice(2);

  const store = () => window.StudioStore;

  // Do not run a second scheduler on Planner.
  function isPlannerPage() {
    return /\/planner\.html$/i.test(
      window.location.pathname
    );
  }

  function read() {
    if (!store()) return null;

    const saved = store().get(KEY, {}) || {};

    return {
      ...saved,
      slots: {
        morning: {
          time: '07:00',
          type: 'serial',
          storyId: '',
          channelUrl: '',
          ...(saved.slots?.morning || {})
        },
        lunch: {
          time: '13:00',
          type: 'ready',
          storyId: '',
          channelUrl: '',
          ...(saved.slots?.lunch || {})
        },
        evening: {
          time: '21:00',
          type: 'serial',
          storyId: '',
          channelUrl: '',
          ...(saved.slots?.evening || {})
        }
      },
      completed: saved.completed || {},
      lastRun: saved.lastRun || {},
      pending: saved.pending || null
    };
  }

  function save(data) {
    try {
      return store().set(KEY, data) !== false;
    } catch (error) {
      console.error(
        '[Story Reminders] Save failed:',
        error
      );
      return false;
    }
  }

  // SHARED TAB LOCK

  function claimLock() {
    try {
      const now = Date.now();
      const current = JSON.parse(
        localStorage.getItem(LOCK_KEY) || 'null'
      );

      if (
        current &&
        current.expires > now &&
        current.owner !== owner
      ) {
        return false;
      }

      localStorage.setItem(
        LOCK_KEY,
        JSON.stringify({
          owner,
          expires: now + LOCK_DURATION
        })
      );

      const confirmed = JSON.parse(
        localStorage.getItem(LOCK_KEY) || 'null'
      );

      return confirmed?.owner === owner;
    } catch (error) {
      // If browser storage is unavailable,
      // the pending-post check still protects
      // against most duplicate reminders.
      return true;
    }
  }

  function releaseLock() {
    try {
      const current = JSON.parse(
        localStorage.getItem(LOCK_KEY) || 'null'
      );

      if (current?.owner === owner) {
        localStorage.removeItem(LOCK_KEY);
      }
    } catch (error) {
      // The lock expires automatically.
    }
  }

  // EPISODE DATA

  function serialEpisodes() {
    return store().get('episodes', []) || [];
  }

  function readyEpisodes() {
    return store().get('readyMadeEpisodes', []) || [];
  }

  function serialStories() {
    return store().get('stories', []) || [];
  }

  function episodeId(ep) {
    return String(ep.id || '');
  }

  function sortEpisodes(a, b) {
    return (
      Number(a.seasonNumber ?? a.season_number ?? 0) -
      Number(b.seasonNumber ?? b.season_number ?? 0)
    ) || (
      Number(a.episodeNumber ?? a.episode_number ?? 0) -
      Number(b.episodeNumber ?? b.episode_number ?? 0)
    );
  }

  function nextEpisode(slot, data) {
    if (!slot.storyId) return null;

    if (slot.type === 'ready') {
      return readyEpisodes()
        .filter(ep =>
          String(
            ep.story_title || ep.storyName || ''
          ).trim() === String(slot.storyId).trim() &&
          ep.id &&
          ep.status !== 'posted' &&
          !data.completed[episodeId(ep)]
        )
        .sort(sortEpisodes)[0] || null;
    }

    return serialEpisodes()
      .filter(ep =>
        String(ep.storyId || '') ===
          String(slot.storyId) &&
        ep.id &&
        !data.completed[episodeId(ep)]
      )
      .sort(sortEpisodes)[0] || null;
  }

  // SCHEDULE

  function dateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function findDue(data) {
    const now = new Date();
    const today = dateKey(now);

    const definitions = [
      { id: 'morning' },
      { id: 'lunch' },
      { id: 'evening' }
    ];

    for (const definition of definitions) {
      const slot = data.slots[definition.id];

      if (
        !slot?.storyId ||
        !slot?.channelUrl ||
        !slot?.time
      ) {
        continue;
      }

      const parts = String(slot.time)
        .split(':')
        .map(Number);

      const hour = parts[0];
      const minute = parts[1];

      if (
        !Number.isInteger(hour) ||
        !Number.isInteger(minute) ||
        hour < 0 || hour > 23 ||
        minute < 0 || minute > 59
      ) {
        continue;
      }

      const due = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hour,
        minute
      );

      const key = `${today}_${definition.id}`;

      if (now < due || data.lastRun[key]) {
        continue;
      }

      const episode = nextEpisode(slot, data);

      if (!episode) continue;

      return {
        id: definition.id,
        slot,
        episode,
        dateKey: today,
        key
      };
    }

    return null;
  }

  // STORY NAME

  function storyName(due) {
    if (due.slot.type === 'ready') {
      return (
        due.episode.story_title ||
        due.episode.storyName ||
        due.slot.storyId
      );
    }

    const story = serialStories().find(item =>
      String(item.id) === String(due.slot.storyId)
    );

    return (
      due.episode.storyTitle ||
      due.episode.seasonTitle ||
      story?.title ||
      story?.storyTitle ||
      'Your story'
    );
  }

  // NOTIFICATION

  function notify(due) {
    const ep = due.episode;

    const episodeName = due.slot.type === 'ready'
      ? (
          ep.episode_name ||
          `Episode ${ep.episode_number || ''}`
        )
      : (
          ep.title ||
          `Episode ${ep.episodeNumber || ''}`
        );

    const story = storyName(due);

    const message =
      `It's time to post ${episodeName} from ${story}. ` +
      'Open Story Studio to publish your advertisement and episode.';

    if (
      window.StudioNotify &&
      typeof window.StudioNotify.send === 'function'
    ) {
      window.StudioNotify.send(
        '⏰ Story posting time!',
        message,
        {
          tag: `story-post-${due.dateKey}-${due.id}`,
          url: 'planner.html'
        }
      );
    } else {
      console.warn(
        '[Story Reminders] Notification helper unavailable.'
      );
    }

    if (typeof window.studioToast === 'function') {
      window.studioToast(
        '🔔 Posting time! ' + message
      );
    }
  }

  // MAIN CHECK

  function check() {
    if (
      checking ||
      !store() ||
      isPlannerPage()
    ) {
      return;
    }

    checking = true;

    let lockClaimed = false;

    try {
      lockClaimed = claimLock();

      if (!lockClaimed) return;

      const data = read();

      if (!data || data.pending) return;

      const due = findDue(data);

      if (!due) return;

      const ep = due.episode;

      // Save before notifying.
      // Planner uses this same pending record.
      data.pending = {
        slotId: due.id,
        dateKey: due.dateKey,
        episodeId: episodeId(ep),
        episodeType: due.slot.type,
        channelUrl: due.slot.channelUrl,
        stage: 'advert',
        leftApp: false,
        startedAt: new Date().toISOString()
      };

      if (!save(data)) return;

      notify(due);

      console.log(
        '[Story Reminders] Reminder created:',
        due.id,
        episodeId(ep)
      );

    } catch (error) {
      console.error(
        '[Story Reminders] Check failed:',
        error
      );
    } finally {
      if (lockClaimed) releaseLock();
      checking = false;
    }
  }

  // START

  function start() {
    if (
      !store() ||
      timer ||
      isPlannerPage()
    ) {
      return;
    }

    check();

    timer = setInterval(
      check,
      CHECK_INTERVAL
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) check();
      }
    );

    window.addEventListener('focus', check);
    window.addEventListener('online', check);

    console.log(
      '[Story Reminders] Shared monitor started.'
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      start
    );
  } else {
    start();
  }

})();
