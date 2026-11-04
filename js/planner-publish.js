
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSlotDue(slot) {
  if (!slot || !slot.time) return false;

  const parts = String(slot.time).split(':');
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

  const scheduled = new Date();
  scheduled.setHours(hour, minute, 0, 0);

  return new Date() >= scheduled;
}

function alreadyCompletedToday(slotName) {
  return settings.slotRuns?.[slotName] === todayKey();
}

function storyEpisodes(slot) {
  if (slot.type === 'ready') {
    return (get('readyMadeEpisodes', []) || [])
      .filter(ep => {
        const name = ep.story_title || ep.storyName || ep.title || 'Ready-made episodes';

        return name.toLowerCase() === String(slot.storyName || '').toLowerCase() &&
          String(ep.status || '').toLowerCase() !== 'posted';
      })
      .sort((a, b) =>
        Number(a.season_number || 1) - Number(b.season_number || 1) ||
        Number(a.episode_number || 1) - Number(b.episode_number || 1)
      );
  }

  return (get('episodes', []) || [])
    .filter(ep => {
      const name = ep.storyTitle || ep.seasonTitle || '';

      return !ep.archived &&
        name.toLowerCase() === String(slot.storyName || '').toLowerCase();
    })
    .sort((a, b) =>
      Number(a.seasonNumber || 1) - Number(b.seasonNumber || 1) ||
      Number(a.episodeNumber || 1) - Number(b.episodeNumber || 1)
    );
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
    const season = Number(slot.type === 'ready'
      ? ep.season_number || 1
      : ep.seasonNumber || 1);

    const episode = Number(slot.type === 'ready'
      ? ep.episode_number || 1
      : ep.episodeNumber || 1);

    return season > position.season ||
      (season === position.season && episode >= position.episode);
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

function episodeText(ep, type) {
  if (type === 'ready') {
    const storyName = ep.story_title || ep.storyName || 'Untitled story';

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

function openChannel(url) {
  if (!url) {
    window.studioToast?.('Choose a WhatsApp Channel first.');
    return false;
  }

  const opened = window.open(url, '_blank');

  if (!opened) {
    window.studioToast?.('If WhatsApp did not open, use your channel link manually.');
  }

  return true;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';

    document.body.appendChild(area);
    area.select();

    let copied = false;

    try {
      copied = document.execCommand('copy');
    } catch (_) {}

    area.remove();
    return copied;
  }
}

function getPendingEpisode(slotName) {
  const pending = settings.pending;

  if (!pending || pending.slot !== slotName) return null;

  const slot = settings.slots[slotName];

  if (!slot) return null;

  return storyEpisodes(slot).find(ep =>
    String(ep.id) === String(pending.episodeId)
  );
}

function setPending(slotName, stage, ep) {
  settings.pending = {
    slot: slotName,
    stage,
    episodeId: ep.id,
    episodeLabel: episodeLabel(ep, settings.slots[slotName].type),
    startedAt: new Date().toISOString(),
    leftAppAt: null,
    returnPrompted: false
  };

  saveSettings();
}

async function startAdvertisement(slotName) {
  const slot = settings.slots[slotName];

  if (!isSlotDue(slot)) {
    window.studioToast?.(`This slot becomes available at ${slot.time}.`);
    return;
  }

  if (alreadyCompletedToday(slotName)) {
    window.studioToast?.('This slot has already been completed today.');
    return;
  }

  if (settings.pending) {
    window.studioToast?.('Finish or cancel the current posting sequence first.');
    renderPostingControls();
    return;
  }

  const ep = findNextEpisode(slot);

  if (!ep) {
    window.studioToast?.('No unpublished episode remains in this queue.');
    return;
  }

  const advert = String(settings.adText || '').trim();

  if (!advert) {
    window.studioToast?.('Add your advertisement text first.');
    return;
  }

  if (!slot.channelUrl) {
    window.studioToast?.('Select a WhatsApp Channel for this queue.');
    return;
  }

  setPending(slotName, 'advert-opened', ep);

  openChannel(slot.channelUrl);

  const copied = await copyText(advert);

  if (!copied) {
    window.prompt('Copy your advertisement text:', advert);
  }

  renderPostingControls();

  window.studioToast?.('Advertisement copied. Publish it in WhatsApp, then return here.');
}

function confirmAdvertisement(slotName) {
  const pending = settings.pending;

  if (!pending ||
      pending.slot !== slotName ||
      pending.stage !== 'advert-opened') {
    return;
  }

  if (!confirm('Have you published the advertisement in your WhatsApp Channel?')) {
    pending.returnPrompted = false;
    saveSettings();
    renderPostingControls();
    return;
  }

  pending.stage = 'advert-confirmed';
  pending.returnPrompted = false;
  pending.leftAppAt = null;

  saveSettings();
  renderPostingControls();

  window.studioToast?.('Advertisement confirmed. You can now prepare the episode.');
}

async function prepareEpisode(slotName) {
  const pending = settings.pending;

  if (!pending ||
      pending.slot !== slotName ||
      pending.stage !== 'advert-confirmed') {
    window.studioToast?.('Publish and confirm the advertisement first.');
    return;
  }

  const slot = settings.slots[slotName];
  const ep = getPendingEpisode(slotName);

  if (!ep) {
    window.studioToast?.('The selected episode could not be found.');
    return;
  }

  const text = episodeText(ep, slot.type);

  pending.stage = 'episode-opened';
  pending.episodeLabel = episodeLabel(ep, slot.type);
  pending.leftAppAt = null;
  pending.returnPrompted = false;

  saveSettings();

  openChannel(slot.channelUrl);

  const copied = await copyText(text);

  if (!copied) {
    window.prompt('Copy your episode text:', text);
  }

  renderPostingControls();

  window.studioToast?.('Episode copied. Publish it in WhatsApp, then return here and confirm.');
}

function advancePosition(slot, ep) {
  const season = Number(slot.type === 'ready'
    ? ep.season_number || 1
    : ep.seasonNumber || 1);

  const episode = Number(slot.type === 'ready'
    ? ep.episode_number || 1
    : ep.episodeNumber || 1);

  if (episode >= 13) {
    slot.season = season + 1;
    slot.episode = 1;
  } else {
    slot.season = season;
    slot.episode = episode + 1;
  }
}

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

function confirmEpisode(slotName) {
  const pending = settings.pending;

  if (!pending ||
      pending.slot !== slotName ||
      pending.stage !== 'episode-opened') {
    window.studioToast?.('There is no episode awaiting confirmation.');
    return;
  }

  if (!confirm('Have you successfully published this episode in WhatsApp?')) {
    return;
  }

  const slot = settings.slots[slotName];
  const ep = getPendingEpisode(slotName);

  if (!ep) {
    window.studioToast?.('Episode not found. Nothing was marked complete.');
    return;
  }

  const completed = settings.completed || {};

  completed[slotName] = completed[slotName] || [];

  if (!completed[slotName].some(item =>
    String(item.episodeId) === String(ep.id))) {
    completed[slotName].push({
      episodeId: ep.id,
      label: episodeLabel(ep, slot.type),
      title: slot.storyName,
      completedAt: new Date().toISOString()
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

  window.studioToast?.('Episode marked as posted. Queue advanced! ✅');

  renderPostingControls();

  document.dispatchEvent(new Event('planner:posts-updated'));
}

/* ---------- SAFE PENDING-SEQUENCE RECOVERY ---------- */

function ensureRecoveryPanel() {
  let panel = $('plannerPendingRecovery');

  if (panel) return panel;

  panel = document.createElement('section');
  panel.id = 'plannerPendingRecovery';
  panel.className = 'planner-slot-status';
  panel.style.margin = '12px 0';
  panel.style.padding = '14px';
  panel.style.borderRadius = '14px';
  panel.style.border = '1px solid var(--border, rgba(128,128,128,.35))';
  panel.style.display = 'none';

  const firstSlot = document.querySelector('[data-slot]');

  if (firstSlot && firstSlot.parentElement) {
    firstSlot.parentElement.insertBefore(panel, firstSlot);
  } else {
    const target = document.querySelector('main') ||
      document.querySelector('.app-content') ||
      document.body;

    target.prepend(panel);
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
    'advert-opened': 'Advertisement awaiting confirmation',
    'advert-confirmed': 'Advertisement confirmed — episode is ready',
    'episode-opened': 'Episode awaiting confirmation'
  };

  const stageText = stageNames[pending.stage] || 'Interrupted posting sequence';

  panel.style.display = 'block';
  panel.innerHTML = `
    <p><strong>⚠️ A posting sequence is still active</strong></p>
    <p class="small muted">
      Slot: ${esc(slotName)}<br>
      Stage: ${esc(stageText)}<br>
      Episode: ${esc(pending.episodeLabel || 'Not available')}
    </p>
    <p class="small muted">
      Resume the sequence in its slot, or cancel it if you no longer need it.
      Cancelling does not delete your story or episode.
    </p>
    <button type="button" class="button ghost" data-cancel-any-sequence>
      ✖ Cancel stuck sequence
    </button>
  `;
}

function cancelAnyPending() {
  if (!settings.pending) {
    window.studioToast?.('There is no active posting sequence to cancel.');
    renderPostingControls();
    return;
  }

  const pending = settings.pending;
  const slotName = pending.slot || 'unknown';

  if (!confirm(
    `Cancel the pending posting sequence for the ${slotName} slot?\n\nYour story, episode, and saved planner settings will NOT be deleted. The episode will remain available to post.`
  )) {
    return;
  }

  // Only clear the unfinished sequence.
  settings.pending = null;

  saveSettings();

  renderPostingControls();

  window.studioToast?.('Pending sequence cancelled. Your episode is still saved.');
}

function handleReturnFromWhatsApp() {
  if (returnCheckLock || document.hidden) return;

  const pending = settings?.pending;

  if (!pending ||
      !pending.leftAppAt ||
      pending.returnPrompted) {
    renderPostingControls();
    return;
  }

  returnCheckLock = true;

  pending.returnPrompted = true;
  saveSettings();

  setTimeout(() => {
    const current = settings.pending;

    if (current && current.leftAppAt) {
      if (current.stage === 'advert-opened') {
        confirmAdvertisement(current.slot);
      } else if (current.stage === 'episode-opened') {
        confirmEpisode(current.slot);
      }
    }

    returnCheckLock = false;
    renderPostingControls();
  }, 350);
}

function cancelPending(slotName) {
  if (!settings.pending || settings.pending.slot !== slotName) return;
  cancelAnyPending();
}

function renderPostingControls() {
  if (!settings?.slots) return;

  renderRecoveryPanel();

  SLOT_NAMES.forEach(slotName => {
    const panel = document.querySelector(`[data-slot="${slotName}"]`);

    if (!panel) return;

    let controls = panel.querySelector('.planner-posting-controls');

    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'planner-posting-controls planner-slot-status';
      panel.appendChild(controls);
    }

    const slot = settings.slots[slotName];

    if (!slot) return;

    const pending = settings.pending;
    const isPending = pending && pending.slot === slotName;

    const ep = isPending
      ? getPendingEpisode(slotName)
      : findNextEpisode(slot);

    if (!slot.storyName || !slot.channelUrl) {
      controls.innerHTML =
        '<p class="small muted">Save a story and WhatsApp Channel to enable posting.</p>';
      return;
    }

    if (isPending && pending.stage === 'advert-opened') {
      controls.innerHTML = `
        <p><strong>📢 Advertisement stage</strong></p>
        <p class="small muted">Publish the advert in WhatsApp. Return here to confirm it.</p>
        <button type="button" class="button primary" data-confirm-advert="${slotName}">✅ I’m back — confirm advert</button>
        <button type="button" class="button ghost" data-cancel-sequence="${slotName}">Cancel sequence</button>
      `;
      return;
    }

    if (isPending && pending.stage === 'advert-confirmed') {
      controls.innerHTML = `
        <p><strong>✅ Advertisement confirmed</strong></p>
        <p class="small muted">The episode is now unlocked: ${esc(pending.episodeLabel || '')}</p>
        <button type="button" class="button primary" data-prepare-episode="${slotName}">📖 Prepare episode & open WhatsApp</button>
        <button type="button" class="button ghost" data-cancel-sequence="${slotName}">Cancel sequence</button>
      `;
      return;
    }

    if (isPending && pending.stage === 'episode-opened') {
      controls.innerHTML = `
        <p><strong>📖 Episode awaiting confirmation</strong></p>
        <p class="small muted">${esc(pending.episodeLabel || 'Episode')}</p>
        <p class="small muted">Confirm after publishing the episode in WhatsApp.</p>
        <button type="button" class="button primary" data-confirm-episode="${slotName}">✅ I published this episode</button>
        <button type="button" class="button ghost" data-cancel-sequence="${slotName}">Cancel sequence</button>
      `;
      return;
    }

    if (settings.pending && !isPending) {
      controls.innerHTML =
        '<p class="small muted">Another slot currently has an unfinished posting sequence. Use the recovery panel above to resume or cancel it.</p>';
      return;
    }

    if (!ep) {
      controls.innerHTML =
        '<p>🎉 No more unpublished episodes found for this queue.</p>';
      return;
    }

    if (alreadyCompletedToday(slotName)) {
      controls.innerHTML = `
        <p><strong>✅ Today’s slot is complete</strong></p>
        <p class="small muted">The next episode will be available tomorrow at ${esc(slot.time || 'the scheduled time')}.</p>
      `;
      return;
    }

    if (!isSlotDue(slot)) {
      controls.innerHTML = `
        <p><strong>Next episode: ${esc(episodeLabel(ep, slot.type))}</strong></p>
        <p class="small muted">Posting unlocks at ${esc(slot.time || 'the scheduled time')}.</p>
      `;
      return;
    }

    controls.innerHTML = `
      <p><strong>Next episode: ${esc(episodeLabel(ep, slot.type))}</p>
      <button type="button" class="button primary" data-start-advert="${slotName}">📢 Prepare advertisement & open WhatsApp</button>
    `;
  });
}

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

    const advert = target.closest('[data-confirm-advert]');

    if (advert) {
      confirmAdvertisement(advert.dataset.confirmAdvert);
      return;
    }

    const prepare = target.closest('[data-prepare-episode]');

    if (prepare) {
      prepareEpisode(prepare.dataset.prepareEpisode);
      return;
    }

    const confirmButton = target.closest('[data-confirm-episode]');

    if (confirmButton) {
      confirmEpisode(confirmButton.dataset.confirmEpisode);
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

      if (pending &&
          ['advert-opened', 'episode-opened'].includes(pending.stage)) {
        pending.leftAppAt = Date.now();
        pending.returnPrompted = false;
        saveSettings();
      }
    } else {
      handleReturnFromWhatsApp();
    }
  });

  window.addEventListener('focus', handleReturnFromWhatsApp);

  $('saveAllPlannerSlots')?.addEventListener('click', () => {
    setTimeout(() => {
      settings = readSettings();
      renderPostingControls();
    }, 150);
  });

  window.addEventListener('pageshow', () => {
    settings = readSettings();
    renderPostingControls();
  });
}

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

    slot.season = Math.max(1, Number(slot.season || 1));
    slot.episode = Math.max(1, Number(slot.episode || 1));
  });

  saveSettings();

  bindEvents();
  renderPostingControls();

  window.setInterval(() => {
    settings = readSettings();
    renderPostingControls();
  }, 15000);

  console.log('Timed Planner posting workflow loaded.');
}

document.addEventListener('DOMContentLoaded', init);

})();
