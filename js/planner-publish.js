
/* =====================================================
   STORY STUDIO — PLANNER PUBLISHING ENGINE
   Complete publishing workflow
   Advertisement → WhatsApp → Episode → WhatsApp
   Includes clipboard-first publishing and queue tracking.
===================================================== */

(function () {
'use strict';

const KEY = 'storySlotPlannerV1';
const $ = id => document.getElementById(id);
const store = () => window.StudioStore;
const SLOT_NAMES = ['morning', 'lunch', 'evening'];

let settings = null;
let returnCheckLock = false;

function get(key, fallback) {
  return store().get(key, fallback);
}

function save(key, value) {
  return store().set(key, value);
}

function readSettings() {
  return get(KEY, {});
}

function saveSettings() {
  save(KEY, settings);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function todayKey() {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function dateKey(value) {
  if (!value) return '';

  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function isCompletedToday(item) {
  if (!item) return false;

  const possibleDates = [
    item.completedAt,
    item.posted_at,
    item.postedAt,
    item.completedDate,
    item.date,
    item.timestamp
  ];

  return possibleDates.some(value =>
    dateKey(value) === todayKey()
  );
}

/* ---------- DAILY QUEUE COMPLETION ---------- */

function alreadyCompletedToday(slotName) {
  const fresh = readSettings();

  settings = {
    ...fresh,
    slots: fresh.slots || {},
    completed: fresh.completed || {},
    slotRuns: fresh.slotRuns || {}
  };

  if (settings.slotRuns[slotName] === todayKey()) {
    return true;
  }

  const records = settings.completed[slotName];

  if (
    Array.isArray(records) &&
    records.some(isCompletedToday)
  ) {
    return true;
  }

  return false;
}

function isSlotDue(slot) {
  if (!slot || !slot.time) return false;

  const parts = String(slot.time).split(':');
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59
  ) {
    return false;
  }

  const scheduled = new Date();
  scheduled.setHours(hour, minute, 0, 0);

  return new Date() >= scheduled;
}

/* ---------- EPISODE COLLECTIONS ---------- */

function allStoryEpisodes(slot) {
  if (slot.type === 'ready') {
    return (get('readyMadeEpisodes', []) || [])
      .filter(ep => {
        const name =
          ep.story_title ||
          ep.storyName ||
          ep.title ||
          'Ready-made episodes';

        return String(name).toLowerCase() ===
          String(slot.storyName || '').toLowerCase();
      })
      .sort((a, b) =>
        Number(a.season_number || 1) -
          Number(b.season_number || 1) ||
        Number(a.episode_number || 1) -
          Number(b.episode_number || 1)
      );
  }

  return (get('episodes', []) || [])
    .filter(ep => {
      const name = ep.storyTitle || ep.seasonTitle || '';

      return !ep.archived &&
        String(name).toLowerCase() ===
          String(slot.storyName || '').toLowerCase();
    })
    .sort((a, b) =>
      Number(a.seasonNumber || 1) -
        Number(b.seasonNumber || 1) ||
      Number(a.episodeNumber || 1) -
        Number(b.episodeNumber || 1)
    );
}

function storyEpisodes(slot) {
  const episodes = allStoryEpisodes(slot);

  if (slot.type === 'ready') {
    return episodes.filter(ep =>
      String(ep.status || '').toLowerCase() !== 'posted'
    );
  }

  return episodes;
}

function getPosition(slot) {
  return {
    season: Number(slot.season || 1),
    episode: Number(slot.episode || 1)
  };
}

function findNextEpisode(slot) {
  const position = getPosition(slot);

  return storyEpisodes(slot).find(ep => {
    const season = Number(
      slot.type === 'ready'
        ? ep.season_number || 1
        : ep.seasonNumber || 1
    );

    const episode = Number(
      slot.type === 'ready'
        ? ep.episode_number || 1
        : ep.episodeNumber || 1
    );

    return season > position.season ||
      (
        season === position.season &&
        episode >= position.episode
      );
  }) || null;
}

function episodeLabel(ep, type) {
  const season = type === 'ready'
    ? ep.season_number || 1
    : ep.seasonNumber || 1;

  const number = type === 'ready'
    ? ep.episode_number || 1
    : ep.episodeNumber || 1;

  return `Season ${season} • Episode ${number}`;
}

/* ---------- EPISODE TEXT ---------- */

function episodeText(ep, type) {
  if (type === 'ready') {
    const storyName =
      ep.story_title ||
      ep.storyName ||
      'Untitled story';

    return [
      storyName,
      `🌿 SEASON ${String(ep.season_number || 1).padStart(2, '0')} 🌿`,
      `🎬 EPISODE ${String(ep.episode_number || 1).padStart(2, '0')} ✨`,
      ep.episode_name || ep.title || '',
      ep.episode_subtitle || '',
      ep.episode_text || ep.content || '',
      '🔔 TO BE CONTINUED…',
      '❤️ React for more stories! 🔥'
    ].filter(Boolean).join('\n\n');
  }

  if (window.buildEpisodeShareText) {
    return window.buildEpisodeShareText(ep);
  }

  return [
    ep.storyTitle || ep.seasonTitle || 'Untitled story',
    `🌿 SEASON ${String(ep.seasonNumber || 1).padStart(2, '0')} 🌿`,
    `🎬 EPISODE ${String(ep.episodeNumber || 1).padStart(2, '0')} ✨`,
    ep.content || '',
    '🔔 TO BE CONTINUED…',
    '❤️ React for more stories! 🔥'
  ].join('\n\n');
}

/* ---------- WHATSAPP AND CLIPBOARD ---------- */

function openChannel(url) {
  if (!url) {
    window.studioToast?.('Choose a WhatsApp Channel first.');
    return false;
  }

  const opened = window.open(url, '_blank');

  if (!opened) {
    window.studioToast?.(
      'If WhatsApp did not open, use your channel link manually.'
    );
  }

  return true;
}

/*
  IMPORTANT:
  Try document.execCommand('copy') synchronously
  during the original button click.

  This avoids losing the browser's user-gesture
  permission before WhatsApp is opened.
*/

function copyText(text) {
  const value = String(text || '');

  if (!value.trim()) {
    console.warn('Nothing was available to copy.');
    return false;
  }

  const area = document.createElement('textarea');

  area.value = value;
  area.setAttribute('readonly', '');

  Object.assign(area.style, {
    position: 'fixed',
    left: '0',
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
  area.setSelectionRange(0, area.value.length);

  let copied = false;

  try {
    copied = document.execCommand('copy');
  } catch (error) {
    console.warn('Synchronous clipboard copy failed:', error);
  }

  area.remove();

  if (copied) return true;

  // Fallback for browsers where execCommand is unavailable.
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value)
      .then(() => true)
      .catch(error => {
        console.warn('Clipboard API failed:', error);
        return false;
      });
  }

  return false;
}

async function finishCopy(text) {
  let result = copyText(text);

  if (result && typeof result.then === 'function') {
    result = await result;
  }

  return result === true;
}

/* ---------- PENDING POST ---------- */

function getPendingEpisode(slotName) {
  const pending = settings.pending;

  if (!pending || pending.slot !== slotName) return null;

  const slot = settings.slots[slotName];

  if (!slot) return null;

  return allStoryEpisodes(slot).find(ep =>
    String(ep.id) === String(pending.episodeId)
  ) || null;
}

function setPending(slotName, stage, ep) {
  settings.pending = {
    slot: slotName,
    stage,
    episodeId: ep.id,
    episodeLabel: episodeLabel(
      ep,
      settings.slots[slotName].type
    ),
    startedAt: new Date().toISOString(),
    leftAppAt: null,
    returnPrompted: false
  };

  saveSettings();
}

/* ---------- ADVERTISEMENT STAGE ---------- */

async function startAdvertisement(slotName) {
  settings = readSettings();

  const slot = settings.slots?.[slotName];

  if (!slot) return;

  if (alreadyCompletedToday(slotName)) {
    window.studioToast?.(
      'This queue has already been completed today.'
    );

    renderPostingControls();
    return;
  }

  if (!isSlotDue(slot)) {
    window.studioToast?.(
      `This slot becomes available at ${slot.time}.`
    );
    return;
  }

  if (settings.pending) {
    window.studioToast?.(
      'Finish or cancel the current posting sequence first.'
    );

    renderPostingControls();
    return;
  }

  const ep = findNextEpisode(slot);

  if (!ep) {
    window.studioToast?.(
      'No unpublished episode remains in this queue.'
    );
    return;
  }

  const advert = String(settings.adText || '').trim();

  if (!advert) {
    window.studioToast?.('Add your advertisement text first.');
    return;
  }

  if (!slot.channelUrl) {
    window.studioToast?.(
      'Select a WhatsApp Channel for this queue.'
    );
    return;
  }

  setPending(slotName, 'advert-opened', ep);

  // Copy first, before leaving Story Studio.
  const copied = await finishCopy(advert);

  if (!copied) {
    window.prompt(
      'Automatic copying was unsuccessful. Copy your advertisement here:',
      advert
    );
  }

  // Open WhatsApp only after the clipboard attempt.
  openChannel(slot.channelUrl);

  renderPostingControls();

  window.studioToast?.(
    copied
      ? '✅ Advertisement copied. Paste it in WhatsApp!'
      : 'Please copy the advertisement manually.'
  );
}

/* ---------- EPISODE STAGE ---------- */

async function prepareEpisode(slotName) {
  settings = readSettings();

  const pending = settings.pending;

  if (
    !pending ||
    pending.slot !== slotName ||
    pending.stage !== 'advert-confirmed'
  ) {
    window.studioToast?.(
      'The advertisement stage is not complete.'
    );
    return;
  }

  const slot = settings.slots[slotName];
  const ep = getPendingEpisode(slotName);

  if (!ep) {
    window.studioToast?.(
      'The selected episode could not be found.'
    );
    return;
  }

  const text = episodeText(ep, slot.type);

  if (!text || !String(text).trim()) {
    window.studioToast?.(
      'The episode has no text to copy.'
    );
    return;
  }

  pending.stage = 'episode-opened';
  pending.episodeLabel = episodeLabel(ep, slot.type);
  pending.leftAppAt = null;
  pending.returnPrompted = false;

  saveSettings();

  // Copy the complete episode before opening WhatsApp.
  const copied = await finishCopy(text);

  if (!copied) {
    window.prompt(
      'Automatic copying was unsuccessful. Copy your episode here:',
      text
    );
  }

  openChannel(slot.channelUrl);

  renderPostingControls();

  window.studioToast?.(
    copied
      ? '✅ Full episode copied. Paste it in WhatsApp!'
      : 'Please copy the episode manually.'
  );
}

/* ---------- QUEUE POSITION ---------- */

function advancePosition(slot, ep) {
  const season = Number(
    slot.type === 'ready'
      ? ep.season_number || 1
      : ep.seasonNumber || 1
  );

  const episode = Number(
    slot.type === 'ready'
      ? ep.episode_number || 1
      : ep.episodeNumber || 1
  );

  if (slot.type === 'ready') {
    const all = allStoryEpisodes(slot);

    const currentIndex = all.findIndex(item =>
      String(item.id) === String(ep.id)
    );

    const next = currentIndex >= 0
      ? all.slice(currentIndex + 1).find(item =>
          String(item.status || '').toLowerCase() !== 'posted'
        )
      : null;

    if (next) {
      slot.season = Number(next.season_number || 1);
      slot.episode = Number(next.episode_number || 1);
    } else {
      slot.season = season;
      slot.episode = episode + 1;
    }

    return;
  }

  if (episode >= 13) {
    slot.season = season + 1;
    slot.episode = 1;
  } else {
    slot.season = season;
    slot.episode = episode + 1;
  }
}

/* ---------- READY-MADE POSTING STATUS ---------- */

function markReadyMadePosted(ep) {
  const all = get('readyMadeEpisodes', []);

  const index = all.findIndex(item =>
    String(item.id) === String(ep.id)
  );

  if (index < 0) return;

  all[index].status = 'posted';
  all[index].posted_at = new Date().toISOString();

  save('readyMadeEpisodes', all);
}

/* ---------- COMPLETE POSTING ---------- */

function completeEpisodeOnReturn(slotName) {
  const pending = settings.pending;

  if (
    !pending ||
    pending.slot !== slotName ||
    pending.stage !== 'episode-opened'
  ) {
    return false;
  }

  const slot = settings.slots[slotName];
  const ep = getPendingEpisode(slotName);

  if (!ep) {
    window.studioToast?.(
      'Episode not found. The queue was not advanced.'
    );
    return false;
  }

  const completed = settings.completed || {};

  completed[slotName] = Array.isArray(completed[slotName])
    ? completed[slotName]
    : [];

  const alreadyRecorded = completed[slotName].some(item =>
    String(item.episodeId) === String(ep.id) &&
    isCompletedToday(item)
  );

  const completedAt = new Date().toISOString();

  if (!alreadyRecorded) {
    completed[slotName].push({
      episodeId: ep.id,
      label: episodeLabel(ep, slot.type),
      title: slot.storyName,
      completedAt,
      tracking: 'returned-from-whatsapp'
    });
  }

  settings.completed = completed;

  settings.slotRuns = settings.slotRuns || {};
  settings.slotRuns[slotName] = todayKey();

  if (slot.type === 'ready') {
    markReadyMadePosted(ep);
  }

  advancePosition(slot, ep);

  settings.pending = null;

  saveSettings();

  window.studioToast?.(
    'You returned from WhatsApp. Queue advanced automatically. ✅'
  );

  document.dispatchEvent(
    new Event('planner:posts-updated')
  );

  return true;
}

/* ---------- RETURN FLOW ---------- */

function advanceAfterReturn() {
  const pending = settings.pending;

  if (!pending) return;

  if (pending.stage === 'advert-opened') {
    pending.stage = 'advert-confirmed';
    pending.leftAppAt = null;
    pending.returnPrompted = false;

    saveSettings();

    window.studioToast?.(
      'Welcome back! Your episode is ready to prepare. 📖'
    );

    renderPostingControls();
    return;
  }

  if (pending.stage === 'episode-opened') {
    completeEpisodeOnReturn(pending.slot);
    renderPostingControls();
  }
}

/* ---------- RECOVERY PANEL ---------- */

function ensureRecoveryPanel() {
  let panel = $('plannerPendingRecovery');

  if (panel) return panel;

  panel = document.createElement('section');
  panel.id = 'plannerPendingRecovery';
  panel.className = 'planner-slot-status';
  panel.style.margin = '12px 0';
  panel.style.padding = '14px';
  panel.style.borderRadius = '14px';
  panel.style.border =
    '1px solid var(--border, rgba(128,128,128,.35))';
  panel.style.display = 'none';

  const firstSlot = document.querySelector('[data-slot]');

  if (firstSlot?.parentElement) {
    firstSlot.parentElement.insertBefore(panel, firstSlot);
  } else {
    (document.querySelector('main') || document.body)
      .prepend(panel);
  }

  return panel;
}

function renderRecoveryPanel() {
  const panel = ensureRecoveryPanel();
  const pending = settings?.pending;

  if (!pending) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  const slotName = SLOT_NAMES.includes(pending.slot)
    ? pending.slot
    : 'unknown';

  const stageNames = {
    'advert-opened':
      'Advertisement stage — return to continue',
    'advert-confirmed':
      'Advertisement returned — episode ready',
    'episode-opened':
      'Episode stage — return to advance'
  };

  panel.style.display = 'block';

  panel.innerHTML = `
    <p><strong>📌 Active posting sequence</strong></p>
    <p class="small muted">
      Slot: ${esc(slotName)}<br>
      Stage: ${esc(
        stageNames[pending.stage] ||
        'Interrupted posting sequence'
      )}<br>
      Episode: ${esc(
        pending.episodeLabel || 'Not available'
      )}
    </p>
    <p class="small muted">
      Continue this sequence in its queue, or cancel it.
      Cancelling does not delete your story or episode.
    </p>
    <button type="button"
      class="button ghost"
      data-cancel-any-sequence>
      ✖ Cancel stuck sequence
    </button>
  `;
}

function cancelAnyPending() {
  if (!settings.pending) {
    window.studioToast?.(
      'There is no active posting sequence to cancel.'
    );

    renderPostingControls();
    return;
  }

  const slotName = settings.pending.slot || 'unknown';

  if (!confirm(
    `Cancel the posting sequence for the ${slotName} slot?\n\nYour story, episode, and saved planner settings will NOT be deleted.`
  )) return;

  settings.pending = null;

  saveSettings();
  renderPostingControls();

  window.studioToast?.(
    'Posting sequence cancelled. Your episode is still saved.'
  );
}

function cancelPending(slotName) {
  if (
    !settings.pending ||
    settings.pending.slot !== slotName
  ) return;

  cancelAnyPending();
}

/* ---------- WHATSAPP RETURN DETECTION ---------- */

function handleReturnFromWhatsApp() {
  if (returnCheckLock || document.hidden) return;

  settings = readSettings();

  const pending = settings.pending;

  if (!pending || !pending.leftAppAt) {
    renderPostingControls();
    return;
  }

  returnCheckLock = true;

  const elapsed = Date.now() -
    Number(pending.leftAppAt);

  if (elapsed < 1000) {
    returnCheckLock = false;
    return;
  }

  pending.leftAppAt = null;
  pending.returnPrompted = true;

  saveSettings();

  window.setTimeout(() => {
    settings = readSettings();
    advanceAfterReturn();
    returnCheckLock = false;
    renderPostingControls();
  }, 500);
}

/* ---------- POSTING CONTROLS ---------- */

function renderCompletedSlot(controls, slotName, slot) {
  const labels = {
    morning: 'Morning',
    lunch: 'Lunch',
    evening: 'Evening'
  };

  controls.innerHTML = `
    <p>
      <strong>✅ ${labels[slotName]} queue completed today</strong>
    </p>
    <p class="small muted">
      Your next episode will be available tomorrow at
      ${esc(slot.time || 'your scheduled time')}.
    </p>
  `;
}

function renderPostingControls() {
  if (!settings?.slots) return;

  renderRecoveryPanel();

  SLOT_NAMES.forEach(slotName => {
    const panel = document.querySelector(
      `[data-slot="${slotName}"]`
    );

    if (!panel) return;

    let controls = panel.querySelector(
      '.planner-posting-controls'
    );

    if (!controls) {
      controls = document.createElement('div');
      controls.className =
        'planner-posting-controls planner-slot-status';

      panel.appendChild(controls);
    }

    const slot = settings.slots[slotName];

    if (!slot) return;

    const pending = settings.pending;
    const isPending =
      pending && pending.slot === slotName;

    if (!isPending && alreadyCompletedToday(slotName)) {
      renderCompletedSlot(
        controls,
        slotName,
        settings.slots[slotName] || slot
      );
      return;
    }

    const ep = isPending
      ? getPendingEpisode(slotName)
      : findNextEpisode(slot);

    if (!slot.storyName || !slot.channelUrl) {
      controls.innerHTML =
        '<p class="small muted">Save a story and WhatsApp Channel to enable posting.</p>';
      return;
    }

    if (
      isPending &&
      pending.stage === 'advert-opened'
    ) {
      controls.innerHTML = `
        <p><strong>📢 Advertisement stage</strong></p>
        <p class="small muted">
          Publish the advert in WhatsApp, then return here.
          The episode will unlock automatically.
        </p>
        <button type="button"
          class="button ghost"
          data-cancel-sequence="${slotName}">
          Cancel sequence
        </button>
      `;
      return;
    }

    if (
      isPending &&
      pending.stage === 'advert-confirmed'
    ) {
      controls.innerHTML = `
        <p><strong>✅ Advertisement stage complete</strong></p>
        <p class="small muted">
          Next: ${esc(pending.episodeLabel || '')}
        </p>
        <button type="button"
          class="button primary"
          data-prepare-episode="${slotName}">
          📖 Prepare episode & open WhatsApp
        </button>
        <button type="button"
          class="button ghost"
          data-cancel-sequence="${slotName}">
          Cancel sequence
        </button>
      `;
      return;
    }

    if (
      isPending &&
      pending.stage === 'episode-opened'
    ) {
      controls.innerHTML = `
        <p><strong>📖 Episode stage</strong></p>
        <p class="small muted">
          ${esc(pending.episodeLabel || 'Episode')}
        </p>
        <p class="small muted">
          Return to Story Studio after WhatsApp.
          The queue will advance automatically.
        </p>
        <button type="button"
          class="button ghost"
          data-cancel-sequence="${slotName}">
          Cancel sequence
        </button>
      `;
      return;
    }

    if (settings.pending && !isPending) {
      controls.innerHTML =
        '<p class="small muted">Another queue has an active posting sequence. Finish or cancel it before starting this queue.</p>';
      return;
    }

    if (!ep) {
      controls.innerHTML =
        '<p>🎉 No more unpublished episodes found for this queue.</p>';
      return;
    }

    if (!isSlotDue(slot)) {
      controls.innerHTML = `
        <p>
          <strong>Next episode:
            ${esc(episodeLabel(ep, slot.type))}
          </strong>
        </p>
        <p class="small muted">
          Posting unlocks at ${esc(slot.time || 'the scheduled time')}.
        </p>
      `;
      return;
    }

    controls.innerHTML = `
      <p>
        <strong>Next episode:
          ${esc(episodeLabel(ep, slot.type))}
        </strong>
      </p>
      <button type="button"
        class="button primary"
        data-start-advert="${slotName}">
        📢 Prepare advertisement & open WhatsApp
      </button>
    `;
  });
}

/* ---------- EVENTS ---------- */

function bindEvents() {
  document.addEventListener('click', event => {
    const target = event.target.closest('button');

    if (!target) return;

    if (target.hasAttribute('data-cancel-any-sequence')) {
      cancelAnyPending();
      return;
    }

    const start = target.closest('[data-start-advert]');

    if (start) {
      startAdvertisement(start.dataset.startAdvert);
      return;
    }

    const prepare = target.closest('[data-prepare-episode]');

    if (prepare) {
      prepareEpisode(prepare.dataset.prepareEpisode);
      return;
    }

    const cancel = target.closest('[data-cancel-sequence]');

    if (cancel) {
      cancelPending(cancel.dataset.cancelSequence);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const pending = settings?.pending;

      if (
        pending &&
        ['advert-opened', 'episode-opened'].includes(
          pending.stage
        )
      ) {
        pending.leftAppAt = Date.now();
        pending.returnPrompted = false;
        saveSettings();
      }
    } else {
      handleReturnFromWhatsApp();
    }
  });

  window.addEventListener(
    'focus',
    handleReturnFromWhatsApp
  );

  $('saveAllPlannerSlots')?.addEventListener('click', () => {
    setTimeout(() => {
      settings = readSettings();
      renderPostingControls();
    }, 150);
  });

  window.addEventListener('pageshow', () => {
    settings = readSettings();

    handleReturnFromWhatsApp();
    renderPostingControls();
  });

  window.addEventListener('storage', () => {
    settings = readSettings();
    renderPostingControls();
  });

  document.addEventListener('planner:posts-updated', () => {
    settings = readSettings();
    renderPostingControls();
  });
}

/* ---------- START ---------- */

function init() {
  if (!store()) return;

  settings = readSettings();

  if (!settings.slots) return;

  settings.completed = settings.completed || {};
  settings.slotRuns = settings.slotRuns || {};

  SLOT_NAMES.forEach(name => {
    if (!settings.slots[name]) return;

    const slot = settings.slots[name];

    if (slot.type !== 'ready') {
      slot.type = 'serial';
    }

    slot.season = Math.max(
      1,
      Number(slot.season || 1)
    );

    slot.episode = Math.max(
      1,
      Number(slot.episode || 1)
    );
  });

  saveSettings();

  bindEvents();
  renderPostingControls();

  window.setInterval(() => {
    settings = readSettings();
    renderPostingControls();
  }, 15000);

  console.log(
    'Story Studio: all three daily queues and clipboard publishing loaded.'
  );
}

document.addEventListener('DOMContentLoaded', init);

})();
