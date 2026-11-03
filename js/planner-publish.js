(function () {
'use strict';

const KEY = 'storySlotPlannerV1';
const $ = id => document.getElementById(id);
const store = () => window.StudioStore;

const SLOT_NAMES = ['morning', 'lunch', 'evening'];
let settings = null;
let activeSlot = null;
let mediaDB = null;

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
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[c]);
}

function storyEpisodes(slot) {
  if (slot.type === 'ready') {
    return (get('readyMadeEpisodes', []) || [])
      .filter(ep => {
        const name = ep.story_title || ep.storyName || ep.title || 'Ready-made episodes';
        const posted = String(ep.status || '').toLowerCase() === 'posted';
        return name.toLowerCase() === String(slot.storyName || '').toLowerCase() && !posted;
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
  return storyEpisodes(slot).find(ep =>
    Number(slot.type === 'ready' ? ep.season_number || 1 : ep.seasonNumber || 1) > position.season ||
    (
      Number(slot.type === 'ready' ? ep.season_number || 1 : ep.seasonNumber || 1) === position.season &&
      Number(slot.type === 'ready' ? ep.episode_number || 1 : ep.episodeNumber || 1) >= position.episode
    )
  ) || null;
}

function episodeText(ep, type) {
  if (type === 'ready') {
    return [
      ep.story_title || ep.storyName || '',
      ep.episode_name || ep.title || '',
      ep.episode_subtitle || '',
      ep.episode_text || ep.content || ''
    ].filter(Boolean).join('\n\n');
  }

  return [
    ep.storyTitle || ep.seasonTitle || '',
    ep.title || `Episode ${ep.episodeNumber || ''}`,
    ep.content || ''
  ].filter(Boolean).join('\n\n');
}

function episodeLabel(ep, type) {
  const season = type === 'ready' ? ep.season_number || 1 : ep.seasonNumber || 1;
  const number = type === 'ready' ? ep.episode_number || 1 : ep.episodeNumber || 1;
  return `Season ${season} • Episode ${number}`;
}

function openChannel(url) {
  if (!url) {
    window.studioToast?.('Choose a WhatsApp Channel first.');
    return false;
  }

  window.open(url, '_blank');
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

function addPending(slotName, stage, ep) {
  settings.pending = {
    slot: slotName,
    stage,
    episodeId: ep.id,
    startedAt: new Date().toISOString()
  };

  saveSettings();
}

function getPendingEpisode(slotName) {
  const pending = settings.pending;
  if (!pending || pending.slot !== slotName) return null;

  const slot = settings.slots[slotName];
  return storyEpisodes(slot).find(ep => String(ep.id) === String(pending.episodeId));
}

async function startAdvertisement(slotName) {
  const slot = settings.slots[slotName];
  const ep = findNextEpisode(slot);

  if (!ep) {
    window.studioToast?.('No unpublished episode remains in this queue.');
    return;
  }

  if (!settings.adText.trim()) {
    window.studioToast?.('Add your advertisement text first.');
    return;
  }

  if (!slot.channelUrl) {
    window.studioToast?.('Select a WhatsApp Channel for this queue.');
    return;
  }

  const copied = await copyText(settings.adText);

  if (!copied) {
    window.prompt('Copy your advertisement text:', settings.adText);
  }

  addPending(slotName, 'advert', ep);
  openChannel(slot.channelUrl);

  renderPostingControls();
  window.studioToast?.('Advertisement copied. Attach your poster and publish it in WhatsApp. Return here afterwards.');
}

async function prepareEpisode(slotName) {
  const pending = settings.pending;

  if (!pending || pending.slot !== slotName || pending.stage !== 'advert') {
    window.studioToast?.('Prepare the advertisement first.');
    return;
  }

  const slot = settings.slots[slotName];
  const ep = getPendingEpisode(slotName);

  if (!ep) {
    window.studioToast?.('The selected episode could not be found.');
    return;
  }

  const text = episodeText(ep, slot.type);
  const copied = await copyText(text);

  if (!copied) {
    window.prompt('Copy your episode text:', text);
  }

  settings.pending.stage = 'episode';
  settings.pending.episodeLabel = episodeLabel(ep, slot.type);
  saveSettings();

  openChannel(slot.channelUrl);
  renderPostingControls();

  window.studioToast?.('Episode copied. Publish it in WhatsApp, then return and confirm.');
}

function advancePosition(slot, ep) {
  const season = Number(slot.type === 'ready'
    ? ep.season_number || 1
    : ep.seasonNumber || 1);

  const episode = Number(slot.type === 'ready'
    ? ep.episode_number || 1
    : ep.episodeNumber || 1);

  slot.season = season;
  slot.episode = episode + 1;
}

function confirmEpisode(slotName) {
  const pending = settings.pending;

  if (!pending || pending.slot !== slotName || pending.stage !== 'episode') {
    window.studioToast?.('There is no episode awaiting confirmation.');
    return;
  }

  if (!confirm('Have you successfully published this episode in WhatsApp?')) return;

  const slot = settings.slots[slotName];
  const ep = getPendingEpisode(slotName);

  if (!ep) {
    window.studioToast?.('Episode not found. Nothing was marked complete.');
    return;
  }

  const completed = settings.completed || {};
  completed[slotName] = completed[slotName] || [];

  if (!completed[slotName].some(item => String(item.episodeId) === String(ep.id))) {
    completed[slotName].push({
      episodeId: ep.id,
      label: episodeLabel(ep, slot.type),
      title: slot.storyName,
      completedAt: new Date().toISOString()
    });
  }

  settings.completed = completed;
  advancePosition(slot, ep);
  settings.pending = null;

  saveSettings();

  window.studioToast?.('Episode marked as posted. Queue advanced! ✅');
  renderPostingControls();
  document.dispatchEvent(new Event('planner:posts-updated'));
}

function cancelPending(slotName) {
  if (!settings.pending || settings.pending.slot !== slotName) return;

  if (!confirm('Cancel this pending posting sequence? The episode will remain unpublished.')) return;

  settings.pending = null;
  saveSettings();
  renderPostingControls();
}

function renderPostingControls() {
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
    const pending = settings.pending;
    const isPending = pending && pending.slot === slotName;
    const ep = isPending ? getPendingEpisode(slotName) : findNextEpisode(slot);

    if (!slot.storyName || !slot.channelUrl) {
      controls.innerHTML = '<p class="small muted">Save a story and WhatsApp Channel to enable posting.</p>';
      return;
    }

    if (!ep && !isPending) {
      controls.innerHTML = '<p>🎉 No more unpublished episodes found for this queue.</p>';
      return;
    }

    if (isPending && pending.stage === 'advert') {
      controls.innerHTML = `
        <p><strong>📢 Advertisement stage</strong></p>
        <p class="small muted">Publish the advertisement in WhatsApp, return here, then prepare the episode.</p>
        <button type="button" class="button primary" data-prepare-episode="${slotName}">📖 Prepare episode</button>
        <button type="button" class="button ghost" data-cancel-sequence="${slotName}">Cancel sequence</button>
      `;
      return;
    }

    if (isPending && pending.stage === 'episode') {
      controls.innerHTML = `
        <p><strong>📖 Episode ready for confirmation</strong></p>
        <p class="small muted">${esc(pending.episodeLabel || 'Episode')}</p>
        <p class="small muted">Confirm only after publishing the episode in WhatsApp.</p>
        <button type="button" class="button primary" data-confirm-episode="${slotName}">✅ I published this episode</button>
        <button type="button" class="button ghost" data-cancel-sequence="${slotName}">Cancel sequence</button>
      `;
      return;
    }

    controls.innerHTML = `
      <p><strong>Next episode: ${esc(episodeLabel(ep, slot.type))}</strong></p>
      <button type="button" class="button primary" data-start-advert="${slotName}">📢 Prepare advertisement & open WhatsApp</button>
    `;
  });
}

function openPoster() {
  const id = settings.mediaId;
  if (!id) return null;

  return new Promise(resolve => {
    const request = indexedDB.open('channelStudioMediaDB', 1);

    request.onerror = () => resolve(null);

    request.onsuccess = () => {
      mediaDB = request.result;

      try {
        const transaction = mediaDB.transaction('media', 'readonly');
        const requestItem = transaction.objectStore('media').get(Number(id));

        requestItem.onsuccess = () => {
          const item = requestItem.result;
          if (!item || !item.blob) {
            resolve(null);
            return;
          }

          const url = URL.createObjectURL(item.blob);
          window.open(url, '_blank');
          resolve(url);
        };

        requestItem.onerror = () => resolve(null);
      } catch (error) {
        resolve(null);
      }
    };
  });
}

function bindEvents() {
  document.addEventListener('click', event => {
    const start = event.target.closest('[data-start-advert]');
    if (start) {
      startAdvertisement(start.dataset.startAdvert);
      return;
    }

    const prepare = event.target.closest('[data-prepare-episode]');
    if (prepare) {
      prepareEpisode(prepare.dataset.prepareEpisode);
      return;
    }

    const confirmButton = event.target.closest('[data-confirm-episode]');
    if (confirmButton) {
      confirmEpisode(confirmButton.dataset.confirmEpisode);
      return;
    }

    const cancel = event.target.closest('[data-cancel-sequence]');
    if (cancel) {
      cancelPending(cancel.dataset.cancelSequence);
    }
  });

  window.addEventListener('focus', renderPostingControls);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderPostingControls();
  });

  $('saveAllPlannerSlots')?.addEventListener('click', () => {
    setTimeout(() => {
      settings = readSettings();
      renderPostingControls();
    }, 100);
  });
}

function init() {
  if (!store()) return;

  settings = readSettings();

  if (!settings.slots) return;

  SLOT_NAMES.forEach(name => {
    if (!settings.slots[name]) return;

    const slot = settings.slots[name];

    if (slot.type !== 'ready') slot.type = 'serial';
    slot.season = Math.max(1, Number(slot.season || 1));
    slot.episode = Math.max(1, Number(slot.episode || 1));
  });

  bindEvents();
  renderPostingControls();

  console.log('Planner posting workflow loaded.');
}

document.addEventListener('DOMContentLoaded', init);

})();