(function(){
'use strict';

const $=id=>document.getElementById(id);
const db=()=>window.StudioStore;
const get=(k,d=[])=>db().get(k,d);
const set=(k,v)=>db().set(k,v);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const toast=m=>window.studioToast?window.studioToast(m):alert(m);
// FIX: safer uid with crypto fallback
const uid=()=>{
  try{
    if(window.crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
  }catch(_){}
  return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
};

// FIX: safe set that never throws
function safeSet(key,value){
  try{
    set(key,value);
    return true;
  }catch(err){
    console.error('Storage write failed:',err);
    return false;
  }
}

let readerStoryId=null,readerEpisodeId=null,episodeDraft=[];

// FIX: guard against undefined/null ids
function storyById(id){
  if(id===undefined||id===null||id==='')return undefined;
  return get('stories').find(s=>String(s.id)===String(id));
}

function normalTitle(value){
  return String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
}

/* Finds the latest saved episode position for a story. */
function getStoryProgress(title){
  const key=normalTitle(title);
  const episodes=get('episodes').filter(ep=>
    normalTitle(ep.storyTitle||ep.seasonTitle)===key
  );
  let season=0,episode=0;

  episodes.forEach(ep=>{
    const s=Math.max(1,Number(ep.seasonNumber)||1);
    const e=Math.max(0,Number(ep.episodeNumber)||0);
    if(s>season||(s===season&&e>episode)){
      season=s;
      episode=e;
    }
  });

  const stories=get('stories').filter(s=>normalTitle(s.title)===key);
  const highestStorySeason=stories.reduce((max,s)=>
    Math.max(max,Number(s.seasonNumber)||1),0);

  if(highestStorySeason>season){
    season=highestStorySeason;
    episode=0;
  }

  return {season:Math.max(1,season),episode};
}

function getNextEpisodePosition(title,minimumSeason){
  const progress=getStoryProgress(title);
  let season=progress.season;
  let episode=progress.episode;

  if(Number(minimumSeason)>season){
    season=Number(minimumSeason);
    episode=0;
  }

  // FIX: clamp broken data (>13) back to a valid slot
  if(episode>13){
    season+=Math.floor(episode/13);
    episode=episode%13;
  }

  if(episode>=13){
    season++;
    episode=0;
  }

  return {season,episode:episode+1};
}

function renderStorySelect(){
  const sel=$('splitStory');
  if(!sel)return;
  const old=sel.value;
  sel.innerHTML='<option value="">Select a saved season…</option>'+
    get('stories').map(s=>
      `<option value="${esc(s.id)}">${esc(s.title)} · Season ${esc(s.seasonNumber||1)}</option>`
    ).join('');
  if([...sel.options].some(o=>o.value===old))sel.value=old;
}

function openStory(story){
  readerStoryId=story.id;
  $('storyReaderTitle').textContent=story.title;
  const wordCount=(story.content||'').trim().split(/\s+/).filter(Boolean).length;
  $('storyReaderMeta').textContent=
    `Season ${story.seasonNumber||1} · ${story.genre||'General'} · ${wordCount.toLocaleString()} words · Saved ${story.date||'locally'}`;
  $('storyReaderText').textContent=story.content||'';
  $('storyReaderPanel').hidden=false;
  $('storyReaderPanel').scrollIntoView({behavior:'smooth',block:'start'});
}

function renderStories(){
  const el=$('storyList');
  if(!el)return;

  const q=($('storySearch')?.value||'').trim().toLowerCase();
  const stories=get('stories').map((s,i)=>({...s,_index:i}))
    .filter(s=>!q||[s.title,s.genre,s.description,s.content]
      .some(v=>String(v||'').toLowerCase().includes(q)));

  $('storyLibraryCount').textContent=
    `${stories.length} season${stories.length===1?'':'s'}`;

  if(!stories.length){
    el.innerHTML='<p>No matching seasons yet. Import a PDF or paste your story above.</p>';
    renderStorySelect();
    return;
  }

  const groups=new Map();

  stories.forEach(s=>{
    const title=String(s.title||'Untitled story').trim()||'Untitled story';
    if(!groups.has(title))groups.set(title,[]);
    groups.get(title).push(s);
  });

  el.innerHTML=[...groups.entries()].map(([title,seasons])=>{
    const cards=seasons.slice()
      .sort((a,b)=>(Number(a.seasonNumber)||1)-(Number(b.seasonNumber)||1))
      .map(s=>{
        const content=s.content||'';
        const wordCount=content.trim()?(content.trim().match(/\S+/g)||[]).length:0;
        const pct=s.readingProgress||0;

        return `
          <div class="story-card">
            <div class="story-card-header">
              <span class="story-season-badge">Season ${esc(s.seasonNumber||1)}</span>
              <span class="story-genre">${esc(s.genre||'General')}</span>
            </div>
            <h3 class="story-card-title">${esc(s.title)} · Season ${esc(s.seasonNumber||1)}</h3>
            ${s.description?`<p class="story-description">${esc(s.description)}</p>`:''}
            <p class="story-excerpt">${esc(content.slice(0,220))}${content.length>220?'…':''}</p>
            <p class="story-meta">${content.length.toLocaleString()} characters · ${wordCount.toLocaleString()} words · ${esc(s.date||'Saved locally')}</p>
            <div class="reading-progress"><div class="reading-progress-bar" style="width:${Math.round(pct)}%"></div></div>
            <p class="reading-progress-label">${pct>=100?'Read':'Reading progress '+Math.round(pct)+'%'}</p>
            <div class="story-actions">
              <button type="button" class="btn btn-primary" data-story-open="${esc(s.id)}">Read season</button>
              <button type="button" class="btn" data-story-split="${esc(s.id)}">Split into episodes</button>
              <button type="button" class="btn" data-story-continue="${esc(s.id)}">➕ Continue story</button>
              <button type="button" class="btn" data-story-edit="${esc(s.id)}">Edit details</button>
              <button type="button" class="btn btn-danger" data-story-delete="${esc(s.id)}">Delete</button>
            </div>
          </div>
        `;
      }).join('');

    return `
      <section class="story-group">
        <h2 class="story-group-title">📁 ${esc(title)} · ${seasons.length} season${seasons.length===1?'':'s'}</h2>
        ${cards}
      </section>
    `;
  }).join('');

  renderStorySelect();
}

async function extractFile(file){
  const name=file.name.toLowerCase();

  // FIX: reject binary text-masqueraders explicitly
  if(name.endsWith('.docx')){
    throw new Error('DOCX is not supported directly. Export as PDF or plain text and try again.');
  }

  if(name.endsWith('.pdf')||file.type==='application/pdf'){
    if(!window.pdfjsLib)
      throw new Error('PDF reading library did not load. Connect to the internet and reload, or paste the text.');

    pdfjsLib.GlobalWorkerOptions.workerSrc=
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    let out='';

    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n);
      const text=await page.getTextContent();
      out+=text.items.map(x=>x.str).join(' ')+'\n\n';
    }

    if(!out.trim())throw new Error('This PDF has no selectable text. Scanned PDFs need OCR.');
    return out.trim();
  }

  return (await file.text()).trim();
}

function resetStoryForm(form){
  form.reset();
  delete form.dataset.editingId;
  // FIX: clear continuation flag so a subsequent edit doesn't inherit it
  delete form.dataset.continuationTitle;
  $('storySeason').value='1';
  const button=form.querySelector('button[type="submit"]');
  if(button)button.textContent='Save season';
}

function initStories(){
  const form=$('storyForm');
  if(!form)return;

  const oldStories=get('stories');
  const legacyStories=oldStories.map(s=>({
    ...s,
    id:s.id||uid(),
    seasonNumber:s.seasonNumber||1,
    genre:s.genre||'General',
    description:s.description||'',
    readingProgress:Number(s.readingProgress)||0
  }));

  if(legacyStories.some((s,i)=>
    s.id!==oldStories[i]?.id||
    !oldStories[i]?.seasonNumber||
    !oldStories[i]?.genre
  ))safeSet('stories',legacyStories);

  const file=$('storyFile');

  file?.addEventListener('change',async()=>{
    const f=file.files?.[0];
    if(!f)return;

    try{
      $('storyText').value=await extractFile(f);
      if(!$('storyTitle').value.trim())
        $('storyTitle').value=f.name.replace(/\.[^.]+$/,'');
      toast('File text extracted. Review it before saving.');
    }catch(e){
      console.error(e);
      toast(e.message||'Could not read this file.');
    }
  });

  form.addEventListener('submit',e=>{
    e.preventDefault();

    const title=$('storyTitle').value.trim();
    const content=$('storyText').value.trim();

    if(!title||!content){
      toast('Add a season title and story text first.');
      return;
    }

    const all=get('stories');
    const editingId=form.dataset.editingId;
    const continuationTitle=form.dataset.continuationTitle||'';
    const isContinuation=!!continuationTitle;
    const old=editingId?all.find(x=>String(x.id)===editingId):null;

    if(isContinuation&&normalTitle(title)!==normalTitle(continuationTitle)){
      toast('Keep the original story title when saving a continuation.');
      return;
    }

    const record={
      ...(old||{}),
      id:old?.id||uid(),
      title,
      seasonNumber:Math.max(1,Number($('storySeason').value)||1),
      genre:$('storyGenre').value||'General',
      description:$('storyDescription').value.trim(),
      content,
      date:new Date().toLocaleString(),
      sourceFileName:file?.files?.[0]?.name||old?.sourceFileName||'',
      readingProgress:old?.readingProgress||0,
      isContinuation:isContinuation||old?.isContinuation||false
    };

    const index=old?all.findIndex(x=>String(x.id)===String(old.id)):-1;

    if(index>=0)all[index]=record;
    else all.push(record);

    // FIX: safe write
    if(!safeSet('stories',all)){
      toast('Storage is full. Export a backup or shorten this story.');
      return;
    }

    /* Refresh generated episodes only when an existing season is edited.
       A separately saved continuation must not overwrite previous episodes. */
    let refreshResult=null;

    if(old&&!isContinuation){
      // FIX: guard against a missing (or unexported) helper
      if(typeof syncEditedStoryEpisodes==='function'){
        try{
          refreshResult=syncEditedStoryEpisodes(record);
        }catch(err){
          console.error('syncEditedStoryEpisodes failed',err);
          refreshResult={error:err.message||String(err)};
        }
      }
    }

    resetStoryForm(form);
    renderStories();

    if(isContinuation){
      // FIX: offer a direct next step instead of a dead-end toast
      toast('Continuation text saved. Use "Split into episodes" to number it after your last episode.');
    }else if(old){
      if(refreshResult?.error){
        toast('Season updated, but episode refresh failed: '+refreshResult.error);
      }else if(refreshResult?.updated){
        toast(
          'Season updated! '+refreshResult.updated+
          ' episodes refreshed.'+
          (refreshResult.archived?' '+refreshResult.archived+' old episodes archived.':'')
        );
      }else{
        toast('Season updated. No previously generated episodes needed refreshing.');
      }
    }else{
      toast('Season saved on this device.');
    }
  });

  $('clearStoryForm')?.addEventListener('click',()=>{
    resetStoryForm(form);
  });

  $('storySearch')?.addEventListener('input',renderStories);

  $('storyList')?.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(!b)return;

    const id=b.dataset.storyOpen||
      b.dataset.storySplit||
      b.dataset.storyContinue||
      b.dataset.storyEdit||
      b.dataset.storyDelete;

    if(!id)return;

    const story=storyById(id);
    if(!story)return;

    if(b.dataset.storyOpen){
      openStory(story);
      return;
    }

    if(b.dataset.storySplit){
      location.href=`episodes.html?story=${encodeURIComponent(story.id)}`;
      return;
    }

    /* Start a separate continuation manuscript without overwriting old text. */
    if(b.dataset.storyContinue){
      const progress=getStoryProgress(story.title);
      const season=Math.max(progress.season,Number(story.seasonNumber)||1);

      resetStoryForm(form);
      $('storyTitle').value=story.title;
      $('storySeason').value=String(season);
      $('storyGenre').value=story.genre||'General';
      $('storyDescription').value=story.description||'';
      $('storyText').value='';
      form.dataset.continuationTitle=story.title;

      const submit=form.querySelector('button[type="submit"]');
      if(submit)submit.textContent='Save continuation';

      form.scrollIntoView({behavior:'smooth'});
      $('storyText').focus();

      toast(`Add only the new continuation text. It will continue from Season ${season}.`);
      return;
    }

    if(b.dataset.storyEdit){
      // FIX: ensure we're not accidentally leaving continuation mode on
      delete form.dataset.continuationTitle;
      $('storyTitle').value=story.title;
      $('storySeason').value=story.seasonNumber||1;
      $('storyGenre').value=story.genre||'General';
      $('storyDescription').value=story.description||'';
      $('storyText').value=story.content||'';
      form.dataset.editingId=String(story.id);

      const submit=form.querySelector('button[type="submit"]');
      if(submit)submit.textContent='Update season';

      form.scrollIntoView({behavior:'smooth'});
      return;
    }

    if(b.dataset.storyDelete&&confirm(
      `Delete “${story.title}”? This also removes its saved season text from this browser.`
    )){
      safeSet('stories',get('stories').filter(s=>String(s.id)!==String(id)));
      renderStories();
      toast('Season deleted. Existing saved episodes are kept.');
    }
  });

  $('markStoryRead')?.addEventListener('click',()=>{
    const all=get('stories');
    const idx=all.findIndex(x=>String(x.id)===String(readerStoryId));

    if(idx>=0){
      all[idx].readingProgress=100;
      if(!safeSet('stories',all)){
        toast('Storage is full. Could not save reading progress.');
        return;
      }
      renderStories();
      toast('Season marked as read.');
    }
  });

  $('closeStoryReader')?.addEventListener('click',()=>{
    $('storyReaderPanel').hidden=true;
  });

  $('storyFontUp')?.addEventListener('click',()=>{
    const t=$('storyReaderText');
    // FIX: read computed size so CSS-defined font-size is respected
    const current=parseFloat(getComputedStyle(t).fontSize)||18;
    t.style.fontSize=`${Math.min(30,current+2)}px`;
  });

  $('storyFontDown')?.addEventListener('click',()=>{
    const t=$('storyReaderText');
    const current=parseFloat(getComputedStyle(t).fontSize)||18;
    t.style.fontSize=`${Math.max(12,current-2)}px`;
  });

  renderStories();
}

function initEpisodes(){
  const form=$('splitForm');
  if(!form)return;

  const existingEpisodes=get('episodes');
  let migrated=false;

  const fixedEpisodes=existingEpisodes.map((ep,i)=>{
    const story=ep.storyId?storyById(ep.storyId):null;

    const out={
      ...ep,
      id:ep.id||uid(),
      seasonTitle:ep.seasonTitle||story?.title||'Imported season',
      storyTitle:ep.storyTitle||ep.seasonTitle||story?.title||'Imported season',
      seasonNumber:ep.seasonNumber||story?.seasonNumber||1,
      episodeNumber:ep.episodeNumber||i+1
    };

    if(!ep.id||!ep.episodeNumber||!ep.seasonTitle||!ep.storyTitle)migrated=true;
    return out;
  });

  if(migrated)safeSet('episodes',fixedEpisodes);

  const select=$('splitStory');
  renderStorySelect();

  const params=new URLSearchParams(location.search);
  if(params.get('story')&&select)select.value=params.get('story');

  form.addEventListener('submit',e=>{
    e.preventDefault();

    const story=storyById(select.value);
    if(!story){
      toast('Save or select a season first.');
      return;
    }

    const original=String(story.content||'');
    if(!original.trim()){
      toast('This season has no readable text.');
      return;
    }

    const split=splitSeasonComplete(original);

    if(!split.complete||!split.firstWordMatch||!split.lastWordMatch){
      console.error('Season split coverage failed',{
        storyId:story.id,
        totalWords:split.totalWords,
        episodeWordTotal:split.episodeWordTotal
      });
      toast('Coverage check failed. No episodes were created. Please reopen and save the complete season text.');
      return;
    }

    /* Continue from the last episode saved for this story title. */
    const start=getNextEpisodePosition(story.title,story.seasonNumber);

    episodeDraft=split.chunks.map((content,i)=>{
      const meta=episodeMetadata(content);
      const absoluteEpisode=(start.episode-1)+i;
      const seasonNumber=start.season+Math.floor(absoluteEpisode/13);
      const episodeNumber=(absoluteEpisode%13)+1;

      return {
        id:uid(),
        storyId:story.id,
        seasonTitle:story.title,
        storyTitle:story.title,
        seasonNumber,
        episodeNumber,
        title:`📖 ${story.title||'Story'} — S${String(seasonNumber).padStart(2,'0')}E${String(episodeNumber).padStart(2,'0')} 🎬`,
        content,
        method:'whole-season-250-300',
        wordCount:meta.words,
        readTime:meta.minutes,
        firstEight:meta.first,
        lastEight:meta.last,
        folderName:`${story.title||'Story'}/Season ${String(seasonNumber).padStart(2,'0')}`
      };
    });

    const joined=episodeDraft.map(ep=>ep.content).join('');
    const sumWords=episodeDraft.reduce((sum,ep)=>sum+ep.wordCount,0);

    if(joined!==original||sumWords!==split.totalWords||episodeDraft.length===0){
      // FIX: log first mismatch offset for debugging
      if(joined!==original){
        let mismatch=0;
        const len=Math.min(joined.length,original.length);
        while(mismatch<len&&joined[mismatch]===original[mismatch])mismatch++;
        console.error('Split mismatch at offset',mismatch,
          'expected:',JSON.stringify(original.slice(Math.max(0,mismatch-20),mismatch+20)),
          'got:',JSON.stringify(joined.slice(Math.max(0,mismatch-20),mismatch+20)));
      }
      episodeDraft=[];
      toast('The whole-season check failed. Nothing was saved. Try again.');
      return;
    }

    const firstDraft=episodeDraft[0];
    const lastDraft=episodeDraft[episodeDraft.length-1];

    $('episodePreview').innerHTML=
      '<div class="preview-coverage">'+
      '<h3>Season coverage: PASS ✓</h3>'+
      '<p>Total manuscript words: '+split.totalWords.toLocaleString()+
      ' · Episodes created: '+episodeDraft.length+
      ' · Episode word total: '+sumWords.toLocaleString()+'</p>'+
      '<p>Numbering: Starts at Season '+firstDraft.seasonNumber+
      ' Episode '+firstDraft.episodeNumber+
      ' and ends at Season '+lastDraft.seasonNumber+
      ' Episode '+lastDraft.episodeNumber+'.</p>'+
      '<p class="preview-note">Target 250–300 words per episode when the source length allows. Each season holds up to 13 episodes. New continuation text is appended after the latest saved episode. Previous episodes are not changed. Reading time uses 220 words per minute. Full text is preserved exactly.</p>'+
      '<p class="preview-checks">First word: '+esc((wordMatches(original)[0]||[])[0]||'')+
      ' · Last word: '+esc((wordMatches(original).slice(-1)[0]||[])[0]||'')+
      ' · complete: true</p>'+
      '</div>'+
      episodeDraft.map(ep=>{
        const meta=episodeMetadata(ep.content);

        return `
          <details class="episode-preview-item">
            <summary>
              <span class="episode-preview-folder">📁 Season ${ep.seasonNumber} · Episode ${ep.episodeNumber} of 13</span>
              <span class="episode-preview-title">${esc(ep.title)}</span>
            </summary>
            <p class="episode-preview-meta">${meta.words.toLocaleString()} words · ${meta.minutes} min read · ${ep.content.length.toLocaleString()} characters</p>
            <p class="episode-preview-words"><strong>First 8 words:</strong> ${esc(meta.first||'—')}</p>
            <p class="episode-preview-words"><strong>Last 8 words:</strong> ${esc(meta.last||'—')}</p>
            <pre class="episode-preview-text">${esc(ep.content)}</pre>
          </details>
        `;
      }).join('')+
      '<div class="preview-actions">'+
      '<button type="button" class="btn btn-primary" id="saveEpisodes">Save all '+episodeDraft.length+' episodes</button>'+
      '<button type="button" class="btn" id="clearEpisodePreview">Clear preview</button>'+
      '</div>';
  });

  $('episodePreview')?.addEventListener('click',e=>{
    if(e.target.id==='clearEpisodePreview'){
      $('episodePreview').innerHTML='<p>Choose a season to create a preview.</p>';
      episodeDraft=[];
      return;
    }

    if(e.target.id!=='saveEpisodes')return;

    const chosen=episodeDraft.slice();
    if(!chosen.length){
      toast('There are no episodes to save.');
      return;
    }

    const all=get('episodes');
    all.push(...chosen.map(x=>({...x,date:new Date().toLocaleString()})));

    // FIX: safe write
    if(!safeSet('episodes',all)){
      toast('Storage is full. Export a backup and try fewer episodes.');
      return;
    }

    toast(`All ${chosen.length} episodes saved locally.`);
    renderSavedEpisodes();

    $('episodePreview').innerHTML=
      '<p>All episodes saved. Coverage was checked before saving.</p>';

    episodeDraft=[];
  });

  $('episodeSearch')?.addEventListener('input',renderSavedEpisodes);

  $('savedEpisodeList')?.addEventListener('click',async e=>{
    const b=e.target.closest('button');
    if(!b)return;

    const id=b.dataset.episodeOpen||
      b.dataset.episodeEdit||
      b.dataset.episodeDelete||
      b.dataset.episodeCopy||
      b.dataset.episodePost;

    if(!id)return;

    const all=get('episodes');
    const ep=all.find(x=>String(x.id)===String(id));
    if(!ep)return;

    const episodeText=String(ep.content||'');

    /* COPY */
    if(b.dataset.episodeCopy){
      if(!episodeText.trim()){
        toast('This episode has no text.');
        return;
      }

      const shareText=buildEpisodeShareText(ep);

      try{
        await navigator.clipboard.writeText(shareText);
        toast('Story name, season, episode and text copied! Ready for WhatsApp.');
      }catch(err){
        const area=document.createElement('textarea');
        area.value=shareText;
        area.style.position='fixed';
        area.style.opacity='0';
        document.body.appendChild(area);
        area.select();
        const copied=document.execCommand('copy');
        area.remove();

        toast(copied?
          'Complete episode details copied! Paste into WhatsApp.':
          'Copy failed. Open Read and copy the text manually.');
      }
      return;
    }

    /* SHARE */
    if(b.dataset.episodePost){
      if(!episodeText.trim()){
        toast('This episode has no text.');
        return;
      }

      const shareText=buildEpisodeShareText(ep);

      if(navigator.share){
        try{
          await navigator.share({
            title:`${ep.storyTitle||ep.seasonTitle||'Story'} — Season ${ep.seasonNumber||1}, Episode ${ep.episodeNumber||1}`,
            text:shareText
          });
          return;
        }catch(err){
          if(err&&err.name==='AbortError')return;
        }
      }

      try{
        await navigator.clipboard.writeText(shareText);
        toast('Complete episode copied. Open WhatsApp and paste it into your Channel.');
      }catch(err){
        toast('Sharing failed. Try the Copy text option.');
      }
      return;
    }

    /* READ */
    if(b.dataset.episodeOpen){
      readerEpisodeId=ep.id;
      $('episodeReaderTitle').textContent=ep.title;
      $('episodeReaderMeta').textContent=
        `${ep.seasonTitle||'Season'} · Episode ${ep.episodeNumber||'—'} · ${(ep.content||'').length.toLocaleString()} characters`;
      $('episodeReaderText').textContent=ep.content||'';
      $('episodeReaderPanel').hidden=false;
      $('episodeReaderPanel').scrollIntoView({behavior:'smooth'});
      return;
    }

    /* RENAME */
    if(b.dataset.episodeEdit){
      const title=prompt('Enter a new episode title:',ep.title);
      if(title===null)return;

      if(!title.trim()){
        toast('Episode title cannot be empty.');
        return;
      }

      ep.title=title.trim();
      if(!safeSet('episodes',all)){
        toast('Storage is full. Rename was not saved.');
        return;
      }
      renderSavedEpisodes();
      toast('Episode renamed.');
      return;
    }

    /* DELETE */
    if(b.dataset.episodeDelete&&confirm(`Delete “${ep.title}”?`)){
      if(!safeSet('episodes',all.filter(x=>String(x.id)!==String(id)))){
        toast('Storage is full. Delete was not saved.');
        return;
      }
      renderSavedEpisodes();
      toast('Episode deleted.');
    }
  });

  $('closeEpisodeReader')?.addEventListener('click',()=>{
    $('episodeReaderPanel').hidden=true;
  });

  renderSavedEpisodes();
}

window.initStage2Stories=initStories;
window.initStage2Episodes=initEpisodes;

})();
