(function () {
'use strict';

const KEY = 'storySlotPlannerV1';
const $ = id => document.getElementById(id);
const store = () => window.StudioStore;

const SLOT_NAMES = ['morning', 'lunch', 'evening'];

const DEFAULTS = {
  adText: '',
  mediaId: '',
  slots: {
    morning: { time: '07:00', type: 'serial', storyId: '', storyName: '', channelUrl: '', season: 1, episode: 1 },
    lunch: { time: '13:00', type: 'ready', storyId: '', storyName: '', channelUrl: '', season: 1, episode: 1 },
    evening: { time: '21:00', type: 'serial', storyId: '', storyName: '', channelUrl: '', season: 1, episode: 1 }
  },
  completed: {},
  pending: null,
  lastRun: {}
};

let settings = null;
let serialStories = [];
let readyStories = [];
let channels = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function read(key, fallback) {
  try {
    return store().get(key, fallback);
  } catch (error) {
    console.warn('Planner could not read ' + key, error);
    return fallback;
  }
}

function save(key, value) {
  try {
    return store().set(key, value);
  } catch (error) {
    console.error('Planner could not save ' + key, error);
    return false;
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function cleanName(value) {
  return String(value || '').trim();
}

function normalName(value) {
  return cleanName(value).toLowerCase().replace(/\s+/g, ' ');
}

function getSettings() {
  const old = read(KEY, {});
  const result = clone(DEFAULTS);

  if (old && typeof old === 'object') {
    result.adText = old.adText || '';
    result.mediaId = old.mediaId || '';
    result.completed = old.completed || {};
    result.pending = old.pending || null;
    result.lastRun = old.lastRun || {};

    SLOT_NAMES.forEach(name => {
      const previous = old.slots && old.slots[name];
      if (!previous) return;

      result.slots[name] = {
        ...result.slots[name],
        ...previous,
        time: previous.time || result.slots[name].time,
        type: previous.type || result.slots[name].type,
        storyId: previous.storyId || '',
        storyName: previous.storyName || previous.title || '',
        channelUrl: previous.channelUrl || '',
        season: Number(previous.season || previous.seasonNumber || 1),
        episode: Number(previous.episode || previous.episodeNumber || 1)
      };
    });
  }

  return result;
}

function saveSettings() {
  return save(KEY, settings);
}

function getSerialEpisodes() {
  const episodes = read('episodes', []);
  return Array.isArray(episodes) ? episodes.filter(ep =>
    ep && !ep.archived && cleanName(ep.storyTitle || ep.seasonTitle)
  ) : [];
}

function getSerialStoryOptions() {
  const stories = read('stories', []);
  const episodes = getSerialEpisodes();
  const found = new Map();

  if (Array.isArray(stories)) {
    stories.forEach(story => {
      const name = cleanName(story.title || story.storyTitle || story.story_name);
      if (!name) return;
      const key = normalName(name);
      if (!found.has(key)) found.set(key, name);
    });
  }

  episodes.forEach(ep => {
    const name = cleanName(ep.storyTitle || ep.seasonTitle);
    if (!name) return;
    const key = normalName(name);
    if (!found.has(key)) found.set(key, name);
  });

  return [...found.values()].sort((a, b) => a.localeCompare(b));
}

function getReadyEpisodes() {
  const items = read('readyMadeEpisodes', []);
  return Array.isArray(items) ? items : [];
}

function getReadyStoryOptions() {
  const found = new Map();

  getReadyEpisodes().forEach(ep => {
    const name = cleanName(ep.story_title || ep.storyName || ep.title || 'Ready-made episodes');
    const key = normalName(name);
    if (!found.has(key)) found.set(key, name);
  });

  return [...found.values()].sort((a, b) => a.localeCompare(b));
}

function getChannels() {
  const items = read('channels', []);
  return Array.isArray(items) ? items.filter(channel =>
    channel && cleanName(channel.url)
  ) : [];
}

function getStoryOptions(type) {
  return type === 'ready' ? readyStories : serialStories;
}

function selectedSlot(name) {
  return settings.slots[name];
}

function buildStorySelect(name) {
  const slot = selectedSlot(name);
  const options = getStoryOptions(slot.type);
  const select = $(name + 'Story');
  if (!select) return;

  const previous = slot.storyName || '';
  const exists = options.some(item => normalName(item) === normalName(previous));

  select.innerHTML =
    '<option value="">Choose a story...</option>' +
    options.map(item =>
      `<option value="${esc(item)}">${esc(item)}</option>`
    ).join('');

  if (exists) {
    select.value = options.find(item => normalName(item) === normalName(previous));
  } else {
    select.value = '';
  }
}

function buildChannelSelect(name) {
  const slot = selectedSlot(name);
  const select = $(name + 'Channel');
  if (!select) return;

  select.innerHTML =
    '<option value="">Choose a saved channel...</option>' +
    channels.map(channel => {
      const label = channel.name || channel.title || channel.url;
      return `<option value="${esc(channel.url)}">${esc(label)}</option>`;
    }).join('');

  select.value = slot.channelUrl || '';

  if (!channels.length) {
    select.innerHTML = '<option value="">No saved channels found — add one in Channels</option>';
  }
}

function loadSlotIntoForm(name) {
  const slot = selectedSlot(name);

  $(name + 'Time').value = slot.time || DEFAULTS.slots[name].time;
  $(name + 'Type').value = slot.type === 'ready' ? 'ready' : 'serial';
  $(name + 'Season').value = Math.max(1, Number(slot.season) || 1);
  $(name + 'Episode').value = Math.max(1, Number(slot.episode) || 1);

  buildStorySelect(name);
  buildChannelSelect(name);

  if ($(name + 'Story')) {
    $(name + 'Story').value = slot.storyName || '';
  }

  updateSummary(name);
}

function loadAdvertisement() {
  const ad = $('plannerAdvertText');
  const media = $('taskMediaSelect');

  if (ad) ad.value = settings.adText || '';

  if (media && settings.mediaId) {
    media.value = String(settings.mediaId);
  }
}

function collectSlot(name) {
  const old = selectedSlot(name);

  return {
    ...old,
    time: $(name + 'Time').value || DEFAULTS.slots[name].time,
    type: $(name + 'Type').value === 'ready' ? 'ready' : 'serial',
    storyName: $(name + 'Story').value || '',
    channelUrl: $(name + 'Channel').value || '',
    season: Math.max(1, Number($(name + 'Season').value) || 1),
    episode: Math.max(1, Number($(name + 'Episode').value) || 1)
  };
}

function updateSummary(name) {
  const slot = collectSlot(name);
  const summary = $(name + 'Summary');
  if (!summary) return;

  const story = slot.storyName
    ? esc(slot.storyName)
    : 'No story selected';

  const channel = channels.find(item => item.url === slot.channelUrl);
  const channelName = channel
    ? esc(channel.name || channel.title || channel.url)
    : 'No channel selected';

  const type = slot.type === 'ready' ? 'Ready-Made' : 'Serial story';

  summary.innerHTML =
    `<strong>${type}</strong>` +
    `<p class="small muted">Story: ${story}</p>` +
    `<p class="small muted">Starting position: Season ${slot.season}, Episode ${slot.episode}</p>` +
    `<p class="small muted">Channel: ${channelName}</p>`;
}

function saveAdvertisement() {
  settings.adText = $('plannerAdvertText')?.value || '';
  settings.mediaId = $('taskMediaSelect')?.value || '';

  const ok = saveSettings();
  $('plannerSaveStatus').textContent = ok
    ? 'Advertisement settings saved.'
    : 'Could not save settings. Check available device storage.';
  window.studioToast?.(ok ? 'Advertisement settings saved.' : 'Could not save advertisement settings.');
}

function saveAllSlots() {
  SLOT_NAMES.forEach(name => {
    settings.slots[name] = collectSlot(name);
  });

  settings.adText = $('plannerAdvertText')?.value || '';
  settings.mediaId = $('taskMediaSelect')?.value || '';

  const ok = saveSettings();

  $('slotsSaveStatus').textContent = ok
    ? 'All three queues saved.'
    : 'Could not save queues. Check available device storage.';

  SLOT_NAMES.forEach(updateSummary);

  renderSetupStatus();

  window.studioToast?.(ok
    ? 'Your three posting queues have been saved. ✅'
    : 'Could not save your Planner settings.');
}

function renderSetupStatus() {
  const target = $('plannerSetupStatus');
  if (!target) return;

  target.innerHTML = SLOT_NAMES.map(name => {
    const slot = settings.slots[name];
    const storyReady = !!slot.storyName;
    const channelReady = !!slot.channelUrl;
    const ready = storyReady && channelReady;

    const label = name === 'morning'
      ? '🌅 Morning'
      : name === 'lunch'
        ? '☀️ Lunch'
        : '🌙 Evening';

    return `
      <article class="list-item">
        <div class="section-heading">
          <h3>${label}</h3>
          <span class="pill">${esc(slot.time || '--:--')}</span>
        </div>
        <p class="small muted">${esc(slot.storyName || 'No story selected')}</p>
        <p class="small muted">${esc(slot.channelUrl ? 'Channel selected' : 'Channel not selected')}</p>
        <p class="small">${ready ? '✅ Queue setup complete' : '⚠️ Queue setup incomplete'}</p>
      </article>
    `;
  }).join('');
}

function refreshStoryOptions(name) {
  const type = $(name + 'Type').value === 'ready' ? 'ready' : 'serial';
  settings.slots[name].type = type;
  settings.slots[name].storyName = '';

  buildStorySelect(name);
  updateSummary(name);
}

function bindEvents() {
  SLOT_NAMES.forEach(name => {
    $(name + 'Type')?.addEventListener('change', () => {
      refreshStoryOptions(name);
    });

    $(name + 'Story')?.addEventListener('change', () => {
      settings.slots[name].storyName = $(name + 'Story').value || '';
      updateSummary(name);
    });

    $(name + 'Channel')?.addEventListener('change', () => {
      settings.slots[name].channelUrl = $(name + 'Channel').value || '';
      updateSummary(name);
    });

    ['Time', 'Season', 'Episode'].forEach(part => {
      $(name + part)?.addEventListener('change', () => updateSummary(name));
    });
  });

  $('savePlannerSettings')?.addEventListener('click', saveAdvertisement);
  $('saveAllPlannerSlots')?.addEventListener('click', saveAllSlots);
}

function init() {
  if (!store()) {
    console.error('Planner could not start: StudioStore is unavailable.');
    const target = $('plannerSetupStatus');
    if (target) target.textContent = 'Storage is not ready. Refresh the page and try again.';
    return;
  }

  settings = getSettings();

  serialStories = getSerialStoryOptions();
  readyStories = getReadyStoryOptions();
  channels = getChannels();

  loadAdvertisement();

  SLOT_NAMES.forEach(loadSlotIntoForm);

  bindEvents();
  renderSetupStatus();

  console.log('Story Planner Batch 1 loaded.');
}

document.addEventListener('DOMContentLoaded', init);

})();