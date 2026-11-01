
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
      lunch:   { time: '13:00', type: 'ready', storyId: '', channelUrl: '' },
      evening: { time: '21:00', type: 'serial', storyId: '', channelUrl: '' }
    },
    completed: {},
    pending: null,
    lastRun: {}
  };

  function read() {
    try {
      const saved = store().get(KEY, {});
      return {
        ...defaults,
        ...saved,
        slots: {
          morning: { ...defaults.slots.morning, ...(saved.slots?.morning || {}) },
          lunch: { ...defaults.slots.lunch, ...(saved.slots?.lunch || {}) },
          evening: { ...defaults.slots.evening, ...(saved.slots?.evening || {}) }
        },
        completed: saved.completed || {},
        lastRun: saved.lastRun || {}
      };
    } catch (e) {
      return structuredClone(defaults);
    }
  }

  function write(data) {
    store().set(KEY, data);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;',
      '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function toast(message) {
    if (window.studioToast) window.studioToast(message);
    else alert(message);
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

  function channels() {
    return store().get('channels', []) || [];
  }

  function storyLabel(story) {
    return story.title || story.storyTitle || 'Untitled story';
  }

  function serialChoices() {
    return serialStories()
      .filter(s => s.id)
      .map(s => ({
        id: String(s.id),
        title: storyLabel(s)
      }));
  }

  function readyChoices() {
    const names = [...new Set(
      readyEpisodes()
        .filter(e => e.status !== 'posted')
        .map(e => String(e.story_title || e.storyName || '').trim())
        .filter(Boolean)
    )];

    return names.map(name => ({ id: name, title: name }));
  }

  function slotDefinitions() {
    return [
      { id: 'morning', title: '🌅 Morning slot', type: 'serial' },
      { id: 'lunch', title: '☀️ Lunchtime slot', type: 'ready' },
      { id: 'evening', title: '🌙 Evening slot', type: 'serial' }
    ];
  }

  function episodeSort(a, b) {
    return (Number(a.seasonNumber ?? a.season_number) -
            Number(b.seasonNumber ?? b.season_number)) ||
           (Number(a.episodeNumber ?? a.episode_number) -
            Number(b.episodeNumber ?? b.episode_number));
  }

  function episodeId(ep) {
    return String(ep.id || '');
  }

  function isCompleted(ep, data) {
    return !!data.completed[episodeId(ep)];
  }

  function nextSerial(slot, data) {
    const storyId = String(slot.storyId || '');
    if (!storyId) return null;

    return serialEpisodes()
      .filter(ep => {
        const matches = ep.storyId
          ? String(ep.storyId) === storyId
          : false;
        return matches && ep.id && !isCompleted(ep, data);
      })
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
    return slot.type === 'ready'
      ? nextReady(slot, data)
      : nextSerial(slot, data);
  }

  function episodeText(ep, type) {
    if (type === 'ready') {
      const title = ep.episode_name || `Episode ${ep.episode_number}`;
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

  function channelName(url) {
    const item = channels().find(c => c.url === url);
    return item?.name || url || 'No channel selected';
  }

  function options(items, selected, emptyLabel) {
    return `<option value="">${esc(emptyLabel)}</option>` +
      items.map(item =>
        `<option value="${esc(item.id)}" ${String(item.id) === String(selected) ? 'selected' : ''}>${esc(item.title)}</option>`
      ).join('');
  }

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
      #storySlotPlanner textarea { min-height:85px; }
      #storySlotPlanner button {
        margin:5px 5px 5px 0;
        padding:11px 14px;
        border-radius:9px;
        cursor:pointer;
      }
      #storySlotPlanner .ssp-muted { opacity:.72; font-size:13px; }
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
    `;
    document.head.appendChild(style);
  }

  function insertPanel() {
    if ($('storySlotPlanner')) return;

    const panel = document.createElement('section');
    panel.id = 'storySlotPlanner';
    panel.className = 'panel';

    const form = $('taskForm');
    const parent = form?.closest('section') || form?.parentElement;

    if (parent) parent.insertAdjacentElement('afterend', panel);
    else document.body.appendChild(panel);
  }

  function render() {
    const panel = $('storySlotPlanner');
    if (!panel) return;

    const data = read();
    const savedChannels = channels().filter(c => c.url);
    const channelOptions = options(
      savedChannels.map(c => ({ id: c.url, title: c.name || c.url })),
      '',
      'Choose a saved WhatsApp Channel'
    );

    const slotsHtml = slotDefinitions().map(def => {
      const slot = data.slots[def.id];
      const choices = def.type === 'ready' ? readyChoices() : serialChoices();
      const selectedStory = choices.find(x => String(x.id) === String(slot.storyId));

      return `
        <div class="ssp-card" data-slot="${def.id}">
          <h3>${def.title}</h3>
          <label>Posting time
            <input type="time" data-setting="time" value="${esc(slot.time)}">
          </label>
          <label>Choose story
            <select data-setting="storyId">
              ${options(choices, slot.storyId, 'Choose a story')}
            </select>
          </label>
          <label>WhatsApp Channel
            <select data-setting="channelUrl">
              ${channelOptions.replace('value="">', `value="${esc(slot.channelUrl)}">`)}
            </select>
          </label>
          <p class="ssp-muted">
            ${selectedStory
              ? `Assigned to: ${esc(selectedStory.title)}`
              : 'Choose a story to activate this slot.'}
          </p>
          <div class="ssp-status" data-slot-status>
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
        <label>Advertisement text
          <textarea id="sspAdText" placeholder="Enter the text to accompany your advertisement poster...">${esc(data.adText)}</textarea>
        </label>
        <label>Poster image from Media Library
          <select id="sspMedia">
            <option value="">Choose poster image</option>
          </select>
        </label>
        <div id="sspPosterPreview"></div>
        <p class="ssp-muted">
          The poster is prepared here for you to attach manually in WhatsApp.
          Channel Studio cannot send images or messages automatically.
        </p>
        <button type="button" id="sspSave">Save story planner settings</button>
      </div>

      <div class="ssp-card" id="sspCurrent">
        <h3>⏰ Current story posting</h3>
        <div id="sspCurrentContent">No story is currently due.</div>
      </div>
    `;

    panel.querySelectorAll('[data-slot]').forEach(card => {
      card.querySelectorAll('[data-setting]').forEach(input => {
        input.addEventListener('change', () => {
          const data = read();
          const id = card.dataset.slot;
          const key = input.dataset.setting;
          data.slots[id][key] = input.value;
          write(data);
          render();
        });
      });
    });

    $('sspAdText').addEventListener('input', e => {
      const data = read();
      data.adText = e.target.value;
      write(data);
    });

    loadMediaOptions();
    $('sspSave').addEventListener('click', () => {
      const data = read();
      data.adText = $('sspAdText').value;
      data.mediaId = $('sspMedia').value;
      write(data);
      toast('Story planner settings saved.');
      render();
    });

    renderPending();
  }

  function slotStatus(id, slot, data) {
    if (!slot.storyId) return 'Waiting for a story assignment.';
    const ep = nextEpisode(slot, data);
    if (!ep) return 'No unpublished episode is currently available. This slot will wait.';
    const name = slot.type === 'ready'
      ? (ep.episode_name || `Episode ${ep.episode_number}`)
      : (ep.title || `Episode ${ep.episodeNumber}`);
    return `Next episode: ${esc(name)} · Ready for its scheduled slot.`;
  }

  let mediaUrl = '';

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
      const request = db.transaction(MEDIA_STORE, 'readonly')
        .objectStore(MEDIA_STORE).getAll();

      request.onsuccess = () => {
        const images = (request.result || []).filter(x => x.kind === 'image');
        select.innerHTML = '<option value="">Choose poster image</option>' +
          images.map(x =>
            `<option value="${esc(x.id)}">${esc(x.name)}</option>`
          ).join('');

        select.value = read().mediaId || '';
        select.addEventListener('change', previewPoster);
        previewPoster();
      };
    } catch (e) {
      console.warn('Could not load poster images:', e);
      select.innerHTML = '<option value="">Media Library unavailable</option>';
    }
  }

  async function previewPoster() {
    const box = $('sspPosterPreview');
    const select = $('sspMedia');
    if (!box || !select) return;

    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaUrl = '';
    box.innerHTML = '';

    const id = select.value;
    if (!id) return;

    try {
      const db = await openMediaDB();
      const request = db.transaction(MEDIA_STORE, 'readonly')
        .objectStore(MEDIA_STORE).get(Number(id));

      request.onsuccess = () => {
        const item = request.result;
        if (!item?.blob) return;
        mediaUrl = URL.createObjectURL(item.blob);
        box.innerHTML = `<img class="ssp-poster" src="${mediaUrl}" alt="Advertisement poster preview">`;
      };
    } catch (e) {
      console.warn('Poster preview failed:', e);
    }
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function findDueSlot(data) {
    const now = new Date();
    const today = localDateKey(now);

    for (const def of slotDefinitions()) {
      const slot = data.slots[def.id];
      if (!slot.storyId || !slot.channelUrl || !slot.time) continue;

      const [hour, minute] = slot.time.split(':').map(Number);
      const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
      const key = `${today}_${def.id}`;

      if (now < due || data.lastRun[key]) continue;

      const ep = nextEpisode(slot, data);
      if (!ep) {
        data.lastRun[key] = 'empty';
        write(data);
        toast(`${def.title}: no episode is ready. The slot is waiting.`);
        continue;
      }

      return { id: def.id, slot, episode: ep, dateKey: today, key };
    }
    return null;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      area.remove();
      return ok;
    }
  }

  function openWhatsApp(url) {
    const win = window.open(url, '_blank');
    if (!win) window.location.href = url;
  }

  async function startDueSlot(due) {
    const data = read();
    const type = due.slot.type;
    const adText = data.adText.trim();

    if (!adText) {
      toast('Add your advertisement text before using the story planner.');
      return;
    }

    const pending = {
      slotId: due.id,
      dateKey: due.dateKey,
      episodeId: episodeId(due.episode),
      episodeType: type,
      channelUrl: due.slot.channelUrl,
      stage: 'advert',
      leftApp: false,
      startedAt: new Date().toISOString()
    };

    data.pending = pending;
    write(data);

    await copyText(adText);
    renderPending();
    toast('Advertisement text copied. Open WhatsApp, attach your poster and publish it.');
    openWhatsApp(due.slot.channelUrl);
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

    const text = episodeText(ep, pending.episodeType);
    await copyText(text);

    pending.stage = 'episode_open';
    pending.leftApp = false;
    pending.openedAt = new Date().toISOString();
    data.pending = pending;
    write(data);

    renderPending();
    toast('Episode copied. Publish it in WhatsApp, then return here.');
    openWhatsApp(pending.channelUrl);
  }

  function renderPending() {
    const box = $('sspCurrentContent');
    if (!box) return;

    const data = read();
    const p = data.pending;

    if (!p) {
      box.textContent = 'No story is currently being published.';
      return;
    }

    const slot = data.slots[p.slotId];
    const ep = nextEpisode(slot, data);

    if (!ep || episodeId(ep) !== p.episodeId) {
      box.textContent = 'The pending episode could not be found. Your queue has not advanced.';
      return;
    }

    const name = p.episodeType === 'ready'
      ? (ep.episode_name || `Episode ${ep.episode_number}`)
      : (ep.title || `Episode ${ep.episodeNumber}`);

    if (p.stage === 'advert') {
      box.innerHTML = `
        <p><b>Step 1 of 2 — Advertisement</b></p>
        <p>${esc(name)}</p>
        <p class="ssp-muted">Publish the advertisement and return to Channel Studio.</p>
        <p class="ssp-status">Waiting for you to return from WhatsApp.</p>
      `;
    } else if (p.stage === 'episode') {
      box.innerHTML = `
        <p><b>Step 2 of 2 — Story episode</b></p>
        <p>${esc(name)}</p>
        <button type="button" id="sspOpenEpisode">📖 Copy episode & open WhatsApp</button>
      `;
      $('sspOpenEpisode').addEventListener('click', openEpisode);
    } else {
      box.innerHTML = `
        <p><b>Episode opened in WhatsApp</b></p>
        <p>${esc(name)}</p>
        <p class="ssp-muted">Return to this app after publishing. The app will then mark it as posted automatically.</p>
      `;
    }
  }

  function handleReturn() {
    const data = read();
    const p = data.pending;
    if (!p || !p.leftApp) return;

    p.leftApp = false;

    if (p.stage === 'advert') {
      p.stage = 'episode';
      p.adReturnedAt = new Date().toISOString();
      data.pending = p;
      write(data);
      toast('Welcome back. Advertisement stage complete. Your episode is ready.');
      renderPending();
      return;
    }

    if (p.stage === 'episode_open') {
      data.completed[p.episodeId] = {
        slotId: p.slotId,
        dateKey: p.dateKey,
        completedAt: new Date().toISOString(),
        completionMethod: 'returned_from_whatsapp'
      };

      if (p.episodeType === 'ready') {
        const all = readyEpisodes();
        const index = all.findIndex(ep => episodeId(ep) === p.episodeId);
        if (index >= 0) {
          all[index] = {
            ...all[index],
            status: 'posted',
            posted_at: new Date().toISOString()
          };
          store().set('readyMadeEpisodes', all);
        }
      }

      data.lastRun[`${p.dateKey}_${p.slotId}`] = 'completed';
      data.pending = null;
      write(data);

      toast('Episode automatically marked as posted. Queue advanced. ✅');
      render();
      return;
    }
  }

  function checkAppVisibility() {
    const data = read();
    const p = data.pending;
    if (!p) return;

    if (document.hidden) {
      p.leftApp = true;
      p.leftAt = new Date().toISOString();
      data.pending = p;
      write(data);
      return;
    }

    handleReturn();
  }

  function checkSchedule() {
    const data = read();
    if (data.pending) return;

    const due = findDueSlot(data);
    if (due) startDueSlot(due);
  }

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

    $('taskForm')?.addEventListener('submit', () => setTimeout(render, 150));

    setInterval(checkSchedule, 15000);
    checkSchedule();

    window.addEventListener('pagehide', () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
