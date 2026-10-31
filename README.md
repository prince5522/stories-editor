# Channel Studio — starter project

A beginner-friendly, local-first PWA starter for managing written stories, episodes, posting reminders, channel links, promotions, themes, and downloadable backups.

## Run it
1. Extract this folder.
2. Upload the **contents** of this folder to a new GitHub repository, or open it with a local static server.
3. For PWA installation and service-worker/offline features, use HTTPS (GitHub Pages is suitable).
4. Open `index.html` / your GitHub Pages URL.

## Included
- Separate HTML pages for the main features.
- Local browser storage with guarded reads/writes and basic storage-error handling.
- Stage 2 Story Engine: season metadata (season number, genre, description), searchable season library, in-app reading room with adjustable text size, and reading-progress tracking.
- PDF selectable-text extraction through PDF.js CDN when online, plus text/Markdown import. Scanned PDFs require OCR, not included.
- Season-aware episode splitter with words, characters, characters without spaces, and paragraph methods; review/select episodes before saving, then read, rename, search, or delete saved episodes.
- Existing story and episode records are upgraded locally with missing Stage 2 metadata when possible.
- Tasks and basic in-app/browser notification attempts while the app is running.
- Channel links, hype drafts, theme settings, backup export/restore.
- Image/video Media Library with previews, downloads, deletion, and IndexedDB storage (35 MB per file limit).
- PWA manifest, generated 192/512 app icons, and offline app-shell cache.
- Complaint records and channel reviews saved locally on this device.

## Important limitations
- No Supabase credentials are included. Cloud sync/backup is not enabled yet. Media files stay in this browser/device and are not included in JSON backups. Complaints and reviews are local-only until a secure backend and moderation flow are connected.
- The starter cannot guarantee reminders while fully closed/offline. Reliable push needs a push service and server worker.
- It does not automatically publish to WhatsApp Channels. Regular WhatsApp account linking does not provide an official general Channel-posting API. Saved links and manual handoff are supported.
- Do not put service-role secrets in frontend files. Cloud integration needs proper server-side access control.

## Stage 2 notes
- Season text and episode text remain in this browser on this device. Export a backup before clearing browser data or changing devices.
- PDF extraction requires internet access to load PDF.js. Only selectable PDF text can be extracted; scanned/image-only PDFs need OCR.
- Season deletion intentionally keeps previously saved episodes; delete those separately from Episode Manager if no longer needed.

## Suggested next steps
1. Test each page and save a sample story/task/channel.
2. Export a backup and test restore.
3. Add IndexedDB for large stories and PDF originals.
4. Configure Supabase Auth/Storage/database with restrictive access policies.
5. Add a push-notification backend if supported by your hosting.
6. Verify WhatsApp publishing integration availability before promising automatic posting.


## Stage 4 — Daily Agenda, Priorities & Progress
- Planner tasks support low, normal and high priority, with alert lead-time choices for dated tasks.
- Daily Agenda shows tasks for the current weekday/date.
- Weekly Progress tracks completed tasks toward a configurable weekly goal.
- Reminder checks run while the planner page is open/active; browser notification permission and sound support vary by device. Browser timers do not guarantee delivery while the app is closed.
- All planner data remains local to this browser. Export a backup before clearing site data.

## Phase 2 — Ready-Made Episodes (System B)
- Separate `ready-made.html` page; System A remains on `episodes.html`.
- Paste finished episodes with optional title/subtitle; blank titles are not AI-generated.
- Imports `.txt`, `.md`, and `.docx` (DOCX requires internet for the Mammoth browser library).
- Bulk import previews episode markers like `EPISODE 1`, `EP 2`, and `# Episode 3` before saving.
- Tracks season/episode number, original text, word count, reading time, basic 18+ keyword tagging, status, schedule, and reminder preferences.
- Local-first storage in this prototype; data remains in this browser/device unless you export it.
- Manual posting handoff through the share sheet/copy, plus mark-posted tracking.
- Recurring cadence helper assigns schedule times to draft episodes.

IMPORTANT LIMITATIONS:
- This is the frontend Phase 2 prototype, not a deployed server backend.
- True push delivery while the app is closed requires a push service and backend job. Browser reminders here are best-effort and trigger when the page is running or next opened.
- WhatsApp Channels auto-posting is not enabled; this static app cannot truthfully promise it without an authorised supported publishing integration.
- Data is local to this browser. For shared database/authentication, configure a secure backend (e.g., Supabase/Postgres) and access policies before multi-device use.


## Supabase cloud connection update
- `ready-made.html` now attempts anonymous Supabase Auth and syncs System B episodes to the `public.episodes` table.
- Run `PHASE-2-SUPABASE-SCHEMA.sql` in Supabase SQL Editor before using cloud sync.
- Follow `PHASE-2-SUPABASE-CLOUD-SETUP.txt` for the exact setup and limitations.
- Cloud sync is only for Ready-Made Episodes in this update; other pages remain local.
