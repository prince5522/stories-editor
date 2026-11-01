
(function () {
  'use strict';

  const KEY = 'storySlotPlannerV1';
  const MEDIA_DB = 'channelStudioMediaDB';
  const MEDIA_STORE = 'media';

  const $ = id => document.getElementById(id);
  const store = () => window.StudioStore;

  const defaults = {
    adText: '',
    mediaId: '',
    slots: {
      morning: { time: '07:00', type: 'serial', storyId: '', channelUrl: '' },
      lunch: { time: '13:00', type: 'ready', storyId: '', channelUrl: '' },
      evening: { time: '21:00', type: 'serial', storyId: '', channelUrl: '' }
    },
    completed: {},
    pending: null,
    lastRun: {}
  };

  let mediaUrl = '';
  let scheduleTimer = null;

  // STORAGE

  function read() {
    try {
      const saved = store().get(KEY, {}) || {};

      return {
        ...defaults,
        ...saved,
        slots: {
          morning: { ...defaults.slots.morning, ...(saved.slots?.morning || {}) },
          lunch: { ...defaults.slots.lunch, ...(saved.slots?.lunch || {}) },
          evening: { ...defaults.slots.evening, ...(saved.slots?.evening || {}) }
        },
        completed: saved.completed || {},
        lastRun: saved.lastRun || {},
        pending: saved.pending || null
      };
    } catch (error) {
      console.error('Story planner storage error:', error);

      return {
        ...defaults,
        slots: {
          morning: { ...defaults.slots.morning },
          lunch: { ...defaults.slots.lunch },
          evening: { ...defaults.slots.evening }
        },
        completed: {},
        lastRun: {},
        pending: null
      };
    }
  }

  function write(data) {
    try {
      const result = store().set(KEY, data);
      if (result === false) {
        toast('Could not save planner settings. Device storage may be full.');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Could not save story planner:', error);
      toast('Could not save planner settings.');
      return false;
    }
  }

  // GENERAL HELPERS

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function toast(message) {
    if (window.studioToast) {
      window.studioToast(message);
    } else {
      console.log(message);
    }
  }

  function serialStories() {
    return store().get('stories', []) || [];
  }

  function serialEpisodes() {
    return store().get('episodes', []) || [];
  }

  function readyEpisodes() {
    return store().get('readyMadeEpisodes', []) || [];
  }

  // Matches the actual Channels page structure:
  // { name, role, url, date }

  function channels() {
    const saved = store().get('channels', []);
    return Array.isArray(saved)
      ? saved.filter(channel =>
          channel &&
          typeof channel === 'object' &&
          String(channel.url || '').trim()
        )
      : [];
  }

  function storyLabel(story) {
    return story.title || story.storyTitle || 'Untitled story';
  }

  function serialChoices() {
    return serialStories()
      .filter(story => story.id)
      .map(story => ({
        id: String(story.id),
        title: storyLabel(story)
      }));
  }

  function readyChoices() {
    const names = [...new Set(
      readyEpisodes()
        .filter(ep => ep.status !== 'posted')
        .map(ep => String(ep.story_title || ep.storyName || '').trim())
        .filter(Boolean)
    )];

    return names.map(name => ({
      id: name,
      title: name
    }));
  }

  function slotDefinitions() {
    return [
      { id: 'morning', title: '🌅 Morning slot', type: 'serial' },
      { id: 'lunch', title: '☀️ Lunchtime slot', type: 'ready' },
      { id: 'evening', title: '🌙 Evening slot', type: 'serial' }
    ];
  }

  function episodeSort(a, b) {
    return (
      Number(a.seasonNumber ?? a.season_number ?? 0) -
      Number(b.seasonNumber ?? b.season_number ?? 0)
    ) || (
      Number(a.episodeNumber ?? a.episode_number ?? 0) -
      Number(b.episodeNumber ?? b.episode_number ?? 0)
    );
  }

  function episodeId(ep) {
    return String(ep.id || '');
  }

  function isCompleted(ep, data) {
    return !!data.completed[episodeId(ep)];
  }

  // EPISODE QUEUES

  function nextSerial(slot, data) {
    const storyId = String(slot.storyId || '');
    if (!storyId) return null;

    return serialEpisodes()
      .filter(ep =>
        String(ep.storyId || '') === storyId &&
        ep.id &&
        !isCompleted(ep, data)
      )
      .sort(episodeSort)[0] || null;
  }

  function nextReady(slot, data) {
    const storyName = String(slot.storyId || '').trim();
    if (!storyName) return null;

    return readyEpisodes()
      .filter(ep =>
        String(ep.story_title || ep.storyName || '').trim() === storyName &&
        ep.id &&
        ep.status !== 'posted' &&
        !isCompleted(ep, data)
      )
      .sort(episodeSort)[0] || null;
  }

  function nextEpisode(slot, data) {
    if (!slot) return null;

    return slot.type === 'ready'
      ? nextReady(slot, data)
      : nextSerial(slot, data);
  }

  function episodeText(ep, type) {
    if (type === 'ready') {
      const title = ep.episode_name || `Episode ${ep.episode_number || ''}`;

      return [
        title,
        ep.episode_subtitle || '',
        ep.episode_text || ''
      ].filter(Boolean).join('\n\n');
    }

    const story = ep.storyTitle || ep.seasonTitle || 'Story';
    const season = Number(ep.seasonNumber) || 1;
    const number = String(ep.episodeNumber || 1).padStart(2, '0');

    return [
      `📖 ${story}`,
      `🎬 SEASON ${season} — EPISODE ${number}`,
      '',
      ep.content || '',
      '',
      '...To be continued...'
    ].join('\n');
  }

  // CHANNELS

  function channelName(url) {
    const item = channels().find(channel =>
      String(channel.url || '').trim() === String(url || '').trim()
    );

    return item?.name || url || 'No channel selected';
  }

  function options(items, selected, emptyLabel) {
    const selectedValue = String(selected || '');

    return `
      <option value="" ${selectedValue ? '' : 'selected'}>
        ${esc(emptyLabel)}
      </option>
    ` + items.map(item => {
      const value = String(item.id || '');

      return `
        <option value="${esc(value)}" ${value === selectedValue ? 'selected' : ''}>
          ${esc(item.title)}
        </option>
      `;
    }).join('');
  }

  // STYLES

  function injectStyles() {
    if ($('storySlotStyles')) return;

    const style = document.createElement('style');
    style.id = 'storySlotStyles';

    style.textContent = `
      #storySlotPlanner { margin:18px 0; }

      #storySlotPlanner .ssp-card {
        border:1px solid var(--border, #8885);
        border-radius:16px;
        padding:15px;
        margin:12px 0;
        background:var(--card, transparent);
      }

      #storySlotPlanner label {
        display:block;
        font-size:13px;
        margin:10px 0;
      }

      #storySlotPlanner input,
      #storySlotPlanner select,
      #storySlotPlanner textarea {
        display:block;
        width:100%;
        box-sizing:border-box;
        margin-top:5px;
        padding:11px;
        border:1px solid var(--border, #8886);
        border-radius:9px;
        background:var(--input-bg, transparent);
        color:inherit;
      }

      #storySlotPlanner select {
        min-height:44px;
        cursor:pointer;
      }

      #storySlotPlanner button {
        margin:5px 5px 5px 0;
        padding:11px 14px;
        border-radius:9px;
        cursor:pointer;
      }

      #storySlotPlanner .ssp-muted {
        opacity:.72;
        font-size:13px;
      }

      #storySlotPlanner .ssp-poster {
        max-width:100%;
        max-height:260px;
        object-fit:contain;
        border-radius:12px;
        display:block;
        margin:10px 0;
      }

      #storySlotPlanner .ssp-status {
        padding:10px;
        border-radius:9px;
        background:var(--surface, #8882);
        margin:10px 0;
      }

      #storySlotPlanner .ssp-channel-selected {
        overflow-wrap:anywhere;
      }
    `;

    document.head.appendChild(style);
  }

  // PANEL

  function insertPanel() {
    if ($('storySlotPlanner')) return;

    const panel = document.createElement('section');
    panel.id = 'storySlotPlanner';
    panel.className = 'panel';

    const form = $('taskForm');
    const parent = form?.closest('section') || form?.parentElement;

    if (parent) {
      parent.insertAdjacentElement('afterend', panel);
    } else {
      document.body.appendChild(panel);
    }
  }

  // RENDER

  function render() {
    const panel = $('storySlotPlanner');
    if (!panel) return;

    const data = read();

    const savedChannels = channels().map(channel => ({
      id: String(channel.url).trim(),
      title: String(channel.name || channel.url).trim()
    }));

    const slotsHtml = slotDefinitions().map(def => {
      const slot = data.slots[def.id];

      const choices = def.type === 'ready'
        ? readyChoices()
        : serialChoices();

      const selectedStory = choices.find(choice =>
        String(choice.id) === String(slot.storyId)
      );

      const slotChannelOptions = options(
        savedChannels,
        slot.channelUrl,
        savedChannels.length
          ? 'Choose a saved WhatsApp Channel'
          : 'No saved channels — add one in Channels'
      );

      return `
        <div class="ssp-card" data-slot="${def.id}">
          <h3>${def.title}</h3>

          <label>
            Posting time
            <input type="time" data-setting="time" value="${esc(slot.time)}">
          </label>

          <label>
            Choose story
            <select data-setting="storyId">
              ${options(choices, slot.storyId, 'Choose a story')}
            </select>
          </label>

          <label>
            WhatsApp Channel
            <select data-setting="channelUrl">
              ${slotChannelOptions}
            </select>
          </label>

          <p class="ssp-muted">
            ${
              selectedStory
                ? `Assigned to: ${esc(selectedStory.title)}`
                : 'Choose a story to activate this slot.'
            }
          </p>

          <p class="ssp-muted ssp-channel-selected">
            Selected channel: ${esc(channelName(slot.channelUrl))}
          </p>

          <div class="ssp-status">
            ${slotStatus(def.id, slot, data)}
          </div>
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="section-heading">
        <div>
          <p class="eyebrow">AUTOMATED STORY QUEUES</p>
          <h2>📚 Daily Story Planner</h2>
        </div>
      </div>

      <p class="ssp-muted">
        Three daily slots. Advertisement first, then the episode.
        Your existing task planner remains separate.
      </p>

      ${slotsHtml}

      <div class="ssp-card">
        <h3>📢 Advertisement before every episode</h3>

        <label>
          Advertisement text
          <textarea id="sspAdText" placeholder="Enter the text to accompany your advertisement poster...">${esc(data.adText)}</textarea>
        </label>

        <label>
          Poster image from Media Library
          <select id="sspMedia">
            <option value="">Choose poster image</option>
          </select>
        </label>

        <div id="sspPosterPreview"></div>

        <p class="ssp-muted">
          The poster is prepared here for you to attach manually in WhatsApp.
          Channel Studio cannot send images or messages automatically.
        </p>

        <button type="button" id="sspSave">
          Save story planner settings
        </button>
      </div>

      <div class="ssp-card" id="sspCurrent">
        <h3>⏰ Current story posting</h3>
        <div id="sspCurrentContent">
          No story is currently due.
        </div>
      </div>
    `;

    // IMPORTANT:
    // Save the changed setting without rebuilding the panel.
    // Rebuilding the panel while a select is changing can make
    // mobile browsers lose the user's selection.

    panel.querySelectorAll('[data-slot]').forEach(card => {
      card.querySelectorAll('[data-setting]').forEach(input => {
        input.addEventListener('change', () => {
          const updated = read();
          const slotId = card.dataset.slot;
          const key = input.dataset.setting;
          const value = input.value;

          updated.slots[slotId][key] = value;

          if (!write(updated)) return;

          if (key === 'channelUrl') {
            const selected = channels().find(channel =>
              String(channel.url || '').trim() === String(value).trim()
            );

            const label = card.querySelector('.ssp-channel-selected');

            if (label) {
              label.textContent = selected
                ? `Selected channel: ${selected.name || selected.url}`
                : 'No channel selected';
            }

            const status = card.querySelector('.ssp-status');

            if (status) {
              status.textContent = slotStatus(slotId, updated.slots[slotId], updated);
            }

            return;
          }

          if (key === 'storyId') {
            const status = card.querySelector('.ssp-status');

            if (status) {
              status.textContent = slotStatus(slotId, updated.slots[slotId], updated);
            }

            const storyLabelElement = card.querySelector('.ssp-muted');

            if (storyLabelElement) {
              const definition = slotDefinitions().find(item => item.id === slotId);
              const choices = definition.type === 'ready'
                ? readyChoices()
                : serialChoices();

              const selectedStory = choices.find(choice =>
                String(choice.id) === String(value)
              );

              storyLabelElement.textContent = selectedStory
                ? `Assigned to: ${selectedStory.title}`
                : 'Choose a story to activate this slot.';
            }

            return;
          }

          if (key === 'time') {
            toast('Posting time saved.');
          }
        });
      });
    });

    $('sspAdText').addEventListener('input', event => {
      const updated = read();
      updated.adText = event.target.value;
      write(updated);
    });

    $('sspSave').addEventListener('click', () => {
      const updated = read();

      updated.adText = $('sspAdText').value;
      updated.mediaId = $('sspMedia').value;

      if (write(updated)) {
        toast('Story planner settings saved.');
      }
    });

    loadMediaOptions();
    renderPending();
  }

  function slotStatus(id, slot, data) {
    if (!slot.storyId) return 'Waiting for a story assignment.';
    if (!slot.channelUrl) return 'Choose a WhatsApp channel for this slot.';

    const ep = nextEpisode(slot, data);

    if (!ep) {
      return 'No unpublished episode is currently available. This slot will keep checking.';
    }

    const name = slot.type === 'ready'
      ? (ep.episode_name || `Episode ${ep.episode_number || ''}`)
      : (ep.title || `Episode ${ep.episodeNumber || ''}`);

    return `Next episode: ${name} · Ready for its scheduled slot.`;
  }

  // MEDIA LIBRARY

  function openMediaDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MEDIA_DB, 1);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(MEDIA_STORE)) {
          request.result.createObjectStore(MEDIA_STORE, {
            keyPath: 'id',
            autoIncrement: true
          });
        }
      };
    });
  }

  async function loadMediaOptions() {
    const select = $('sspMedia');
    if (!select) return;

    try {
      const db = await openMediaDB();

      const request = db
        .transaction(MEDIA_STORE, 'readonly')
        .objectStore(MEDIA_STORE)
        .getAll();

      request.onsuccess = () => {
        if (!$('sspMedia')) return;

        const images = (request.result || [])
          .filter(item => item.kind === 'image');

        select.innerHTML =
          '<option value="">Choose poster image</option>' +
          images.map(item => `
            <option value="${esc(item.id)}">
              ${esc(item.name || 'Untitled image')}
            </option>
          `).join('');

        select.value = String(read().mediaId || '');

        select.addEventListener('change', () => {
          const updated = read();
          updated.mediaId = select.value;
          write(updated);
          previewPoster();
        });

        previewPoster();
      };
    } catch (error) {
      console.warn('Could not load poster images:', error);
      select.innerHTML = '<option value="">Media Library unavailable</option>';
    }
  }

  async function previewPoster() {
    const box = $('sspPosterPreview');
    const select = $('sspMedia');

    if (!box || !select) return;

    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
      mediaUrl = '';
    }

    box.innerHTML = '';

    const id = select.value;
    if (!id) return;

    try {
      const db = await openMediaDB();

      const request = db
        .transaction(MEDIA_STORE, 'readonly')
        .objectStore(MEDIA_STORE)
        .get(Number(id));

      request.onsuccess = () => {
        const item = request.result;
        if (!item?.blob) return;

        mediaUrl = URL.createObjectURL(item.blob);

        box.innerHTML = `
          <img
            class="ssp-poster"
            src="${mediaUrl}"
            alt="Advertisement poster preview"
          >
        `;
      };
    } catch (error) {
      console.warn('Poster preview failed:', error);
    }
  }

  // SCHEDULE

  function localDateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function findDueSlot(data) {
    const now = new Date();
    const today = localDateKey(now);

    for (const def of slotDefinitions()) {
      const slot = data.slots[def.id];

      if (!slot.storyId || !slot.channelUrl || !slot.time) {
        continue;
      }

      const [hour, minute] = slot.time.split(':').map(Number);

      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        continue;
      }

      const due = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hour,
        minute
      );

      const key = `${today}_${def.id}`;

      if (now < due || data.lastRun[key]) continue;

      const ep = nextEpisode(slot, data);
      if (!ep) continue;

      return {
        id: def.id,
        slot,
        episode: ep,
        dateKey: today,
        key
      };
    }

    return null;
  }

  function checkSchedule() {
    const data = read();

    if (data.pending) return;

    const due = findDueSlot(data);
    if (!due) return;

    data.pending = {
      slotId: due.id,
      dateKey: due.dateKey,
      episodeId: episodeId(due.episode),
      episodeType: due.slot.type,
      channelUrl: due.slot.channelUrl,
      stage: 'advert',
      leftApp: false,
      startedAt: new Date().toISOString()
    };

    write(data);
    renderPending();

    toast('A story slot is ready. Open the Daily Story Planner to continue.');
  }

  // COPY AND WHATSAPP

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

  async function openAdvertisement() {
    const data = read();
    const pending = data.pending;

    if (!pending || pending.stage !== 'advert') return;

    const adText = String(data.adText || '').trim();

    if (!adText) {
      toast('Add your advertisement text before continuing.');
      return;
    }

    if (!pending.channelUrl) {
      toast('Choose a WhatsApp channel for this slot first.');
      return;
    }

    const win = window.open('about:blank', '_blank');
    const copied = await copyText(adText);

    if (!copied) {
      try { win?.close(); } catch (_) {}
      toast('Could not copy advertisement text. Please try again.');
      return;
    }

    pending.stage = 'advert_open';
    pending.leftApp = false;
    pending.adOpenedAt = new Date().toISOString();

    data.pending = pending;
    write(data);

    if (win) {
      win.location.href = pending.channelUrl;
    } else {
      window.location.href = pending.channelUrl;
    }

    renderPending();

    toast('Advertisement text copied. Attach your poster and publish it in WhatsApp.');
  }

  async function openEpisode() {
    const data = read();
    const pending = data.pending;

    if (!pending || pending.stage !== 'episode') return;

    const slot = data.slots[pending.slotId];
    const ep = nextEpisode(slot, data);

    if (!ep || episodeId(ep) !== pending.episodeId) {
      toast('The selected episode is no longer available. Queue unchanged.');
      return;
    }

    const win = window.open('about:blank', '_blank');
    const copied = await copyText(episodeText(ep, pending.episodeType));

    if (!copied) {
      try { win?.close(); } catch (_) {}
      toast('Could not copy the episode. Please try again.');
      return;
    }

    pending.stage = 'episode_open';
    pending.leftApp = false;
    pending.openedAt = new Date().toISOString();

    data.pending = pending;
    write(data);

    if (win) {
      win.location.href = pending.channelUrl;
    } else {
      window.location.href = pending.channelUrl;
    }

    renderPending();

    toast('Episode copied. Publish it in WhatsApp, then return to Channel Studio.');
  }

  // CURRENT POST

  function renderPending() {
    const box = $('sspCurrentContent');
    if (!box) return;

    const data = read();
    const pending = data.pending;

    if (!pending) {
      box.textContent = 'No story is currently being published.';
      return;
    }

    const slot = data.slots[pending.slotId];

    if (!slot) {
      box.textContent = 'The pending slot could not be found.';
      return;
    }

    const ep = nextEpisode(slot, data);

    if (!ep || episodeId(ep) !== pending.episodeId) {
      box.textContent = 'The pending episode could not be found. Your queue has not advanced.';
      return;
    }

    const name = pending.episodeType === 'ready'
      ? (ep.episode_name || `Episode ${ep.episode_number || ''}`)
      : (ep.title || `Episode ${ep.episodeNumber || ''}`);

    if (pending.stage === 'advert') {
      box.innerHTML = `
        <p><b>Step 1 of 2 — Advertisement</b></p>
        <p>${esc(name)}</p>
        <p class="ssp-muted">First publish your advertisement poster and text.</p>
        <p class="ssp-muted">Channel: ${esc(channelName(pending.channelUrl))}</p>
        <button type="button" id="sspOpenAdvert">
          📢 Copy advertisement & open WhatsApp
        </button>
      `;

      $('sspOpenAdvert').addEventListener('click', openAdvertisement);
      return;
    }

    if (pending.stage === 'advert_open') {
      box.innerHTML = `
        <p><b>Step 1 of 2 — Advertisement opened</b></p>
        <p>${esc(name)}</p>
        <p class="ssp-muted">Publish your advertisement in WhatsApp, then return here.</p>
        <p class="ssp-status">Waiting for your return from WhatsApp.</p>
      `;
      return;
    }

    if (pending.stage === 'episode') {
      box.innerHTML = `
        <p><b>Step 2 of 2 — Story episode</b></p>
        <p>${esc(name)}</p>
        <p class="ssp-muted">Your advertisement step is complete. The episode is ready to copy.</p>
        <button type="button" id="sspOpenEpisode">
          📖 Copy episode & open WhatsApp
        </button>
      `;

      $('sspOpenEpisode').addEventListener('click', openEpisode);
      return;
    }

    if (pending.stage === 'episode_open') {
      box.innerHTML = `
        <p><b>Episode opened in WhatsApp</b></p>
        <p>${esc(name)}</p>
        <p class="ssp-muted">
          Return to this app after publishing. The app will then advance the queue.
        </p>
        <p class="ssp-status">Waiting for your return from WhatsApp.</p>
      `;
    }
  }

  // RETURN FROM WHATSAPP

  function handleReturn() {
    const data = read();
    const pending = data.pending;

    if (!pending || !pending.leftApp) return;

    pending.leftApp = false;

    if (pending.stage === 'advert_open') {
      pending.stage = 'episode';
      pending.adReturnedAt = new Date().toISOString();

      data.pending = pending;
      write(data);

      toast('Welcome back. Your advertisement step is complete. The episode is ready.');
      renderPending();
      return;
    }

    if (pending.stage === 'episode_open') {
      const completedAt = new Date().toISOString();

      data.completed[pending.episodeId] = {
        slotId: pending.slotId,
        dateKey: pending.dateKey,
        completedAt,
        completionMethod: 'returned_from_whatsapp'
      };

      if (pending.episodeType === 'ready') {
        const all = readyEpisodes();

        const index = all.findIndex(ep =>
          episodeId(ep) === pending.episodeId
        );

        if (index >= 0) {
          all[index] = {
            ...all[index],
            status: 'posted',
            posted_at: completedAt
          };

          store().set('readyMadeEpisodes', all);
        }
      }

      data.lastRun[`${pending.dateKey}_${pending.slotId}`] = 'completed';
      data.pending = null;

      write(data);

      toast('Returned to Channel Studio. The episode queue has advanced. ✅');
      render();
      return;
    }

    data.pending = pending;
    write(data);
  }

  function checkAppVisibility() {
    const data = read();
    const pending = data.pending;

    if (!pending) return;

    if (
      pending.stage !== 'advert_open' &&
      pending.stage !== 'episode_open'
    ) {
      return;
    }

    if (document.hidden) {
      if (!pending.leftApp) {
        pending.leftApp = true;
        pending.leftAt = new Date().toISOString();

        data.pending = pending;
        write(data);
      }
      return;
    }

    handleReturn();
  }

  // INITIALIZATION

  function init() {
    if (!store() || !$('taskForm')) return;

    injectStyles();
    insertPanel();
    render();

    document.addEventListener('visibilitychange', checkAppVisibility);

    window.addEventListener('focus', () => {
      checkAppVisibility();
      renderPending();
    });

    $('taskForm')?.addEventListener('submit', () => {
      setTimeout(render, 150);
    });

    if (scheduleTimer) clearInterval(scheduleTimer);
    scheduleTimer = setInterval(checkSchedule, 15000);

    checkSchedule();

    window.addEventListener('pagehide', () => {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
        mediaUrl = '';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
