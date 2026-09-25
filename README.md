# AI Video Editor Pro

Browser-based video editor (HTML5, CSS3, vanilla JavaScript). Media stays on this device unless you export a file or you explicitly call a configured AI endpoint.

## Setup

1. Use a local HTTP server (file:// will block some APIs).
2. Open `index.html` via that server.
3. A **demo project** (generated color-bar video, text, subtitle, filter) loads automatically. It is labeled `[Demo]`.

### Windows PowerShell

```powershell
cd AI-Video-Editor-Pro
python -m http.server 8080
```

Then open `http://localhost:8080`.

### FFmpeg.wasm headers (Class B)

SharedArrayBuffer requires:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Example (Python 3):

```python
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        super().end_headers()

ThreadingHTTPServer(("127.0.0.1", 8080), H).serve_forever()
```

Without these headers, **WebM export still works** (MediaRecorder). MP4/MOV conversion and FFmpeg extract/merge will show a clear error.

### Browser compatibility

| Feature | Chrome 110+ | Edge 110+ | Firefox 115+ | Safari 16.4+ |
|---|---|---|---|---|
| Upload, preview, timeline, text, SRT | Yes | Yes | Yes | Yes |
| Voice-over (MediaRecorder) | Yes | Yes | Yes | Yes (codec varies) |
| Demo video generation | Yes | Yes | Yes | Limited |
| WebM export | Yes | Yes | Yes | Limited |
| FFmpeg.wasm MP4 | Yes* | Yes* | Limited | No / limited |
| IndexedDB projects | Yes | Yes | Yes | Yes |

\*Needs COOP/COEP as above. Large files may hit memory limits — keep sessions under the configured `maxUploadMB` (default 512).

Safari often cannot decode MOV/AVI/MKV in `<video>`. MKV is accepted for upload when the processing library can read it; preview may still fail.

## Feature classes

**A — Fully browser-functional**  
Upload, drag-and-drop, preview, play/pause/stop, frame step, skip, volume, mute, speed, trim + preview range, split/cut/copy/paste/duplicate/reorder, multi-track timeline, magnetic snapping to clip boundaries/playhead, media-to-track drag/drop, zoom, lock/hide/mute tracks, video thumbnails, decoded audio waveform strips, text layers + animations, subtitle editor, SRT import/export, CSS filters & adjustments, overlay effects, transitions, crop overlay, resize canvas, rotate/flip, generated demo music tones, voice-over, **Screen + Webcam + Mic recorder**, automatic recording import to Media/Timeline, undo/redo, IndexedDB save, WebM export with mixed video + timeline audio via MediaRecorder, themes, i18n (EN/BN/AR), templates, brand kit, local silence/scene heuristics, keyboard shortcuts.

**Uncommon & Pro Features (Newly Completed):**
- 🟩 **Chroma Key (Green Screen / Color Keying)**: Real-time background color removal with eyedropper color sampling, similarity, smoothness, and green spill suppression.
- 🪟 **Picture-in-Picture (PiP) Multi-Track Overlay**: Concurrently display overlay tracks (v2) on top of background video with corner presets (Bottom-Right, Top-Right, etc.), scale, border, and blend modes (Normal, Screen, Multiply, Overlay).
- 🖱️ **Interactive Direct Manipulation on Canvas**: Click and drag text, stickers, elements, and PiP videos directly on the monitor stage with interactive transform bounding boxes and resize handles.
- 🔊 **Procedural SFX Soundboard Studio**: 14 high-fidelity synthesized sound effects (Whoosh, Cinematic Boom, Pop, Camera Shutter, Ding, Error, Laser, Vinyl Scratch, Riser, Applause, Typewriter, Notification, Coin, 8-Bit Jump) generated via Web Audio API offline with one-click timeline insert.
- 🗣️ **In-Browser AI Text-to-Speech (TTS Voiceover)**: Generate spoken voiceover tracks from text or subtitles using the browser's speech synthesis engine with voice selection, pitch, and speed controls.
- 🎨 **Animated Social Stickers & Motion Overlays**: Dynamic animated YouTube Subscribe + Bell badge, Like pulse, Shorts bottom progress bar, 3-2-1 countdown overlay, neon arrows, and 2.39:1 / 1.85:1 cinematic letterbox black bars.
- 📸 **Freeze Frame Generator**: Instantly grab the frame at the playhead and insert a freeze-frame snapshot clip with clean timeline splitting.
- ⚡ **Ripple Delete**: Delete any selected clip and automatically shift all subsequent clips on the track to close the gap seamlessly.
- ⚡ **Command Palette (Ctrl+K)**: Instant spotlight search palette to execute any tool, edit, or filter in one keystroke.
- 💾 **Project Backup & Restore (.aive file)**: Save and restore entire multi-track projects, edits, and metadata across any device.
- 🚀 **Multi-Format Export Suite**: Export to WebM Video, MP4 (FFmpeg), Animated GIF (for memes and social sharing), and Studio-Quality Audio-only (.wav mixdown).
- 🌐 **100% Offline & Online Mode (PWA Support)**:
  - **Service Worker (`sw.js`)**: Instant offline boot, Stale-While-Revalidate caching for app shell, icons, and assets.
  - **Web App Manifest (`manifest.json`)**: Installable as a native standalone app on Windows, macOS, Android, iPhone, and Chromebooks.
  - **Zero-Internet Editing**: Multi-track video slicing, audio mixing, procedural SFX, canvas processing, screen recording, Bijoy/Unicode Bangla typing, and WebM/WAV exports run 100% client-side with zero internet required.
  - **Network Status Indicator**: Real-time 🟢 Online / ⚡ Offline status badge in the header with automatic online/offline toasts.

**B — FFmpeg / WebAssembly**  
MP4/MOV transcode, robust audio extract, frame-accurate merge/encode, subtitle mux into a container. Config: `window.AIVE_CONFIG.ffmpeg` in `index.html`. Optional local files in `lib/ffmpeg/` (see that folder’s README).

**C — AI API**  
Speech-to-text subtitles, subtitle translation, free-form assistant, ranked highlights, AI thumbnails, noise removal models. No fake spinners. If URLs are empty, the UI explains how to connect. **Never put secret API keys in frontend code.** Proxy through a backend.

**D — Backend / cloud**  
Auth, cloud projects, cloud render, storage, payments, subscriptions, usage limits, admin dashboard (users, AI usage, logs). Reserved architecture only — see below.

## AI API integration

In **Settings → AI** or `AIVE_CONFIG.ai`:

| Key | Expected JSON |
|---|---|
| `speechToTextUrl` | `{ "cues": [{ "start": 0, "end": 2, "text": "..." }] }` |
| `translateUrl` | `{ "cues": [{ "id": "...", "text": "..." }] }` timestamps unchanged |
| `assistantUrl` | Free-form plan; local commands still run first |
| `highlightUrl` | Important ranges |
| `thumbnailUrl` | Image URL or blob |

The client sends JSON only. Implement file upload (multipart) on your server if you need full audio. Show users that data leaves the device when they click Generate.

Supported STT language selectors: English, Bangla, Hindi, Arabic, Spanish, French, German.

## Backend integration (optional)

Set `AIVE_CONFIG.backend.baseUrl`. Suggested routes for a future API:

```
POST /auth/login
GET  /projects
PUT  /projects/:id
POST /ai/stt
POST /ai/translate
POST /render
GET  /billing/subscription
```

Secrets live in server environment variables (`STT_API_KEY`, `S3_SECRET`, …), never in `js/`.

### Admin panel (future)

Planned modules: Dashboard, Users, Projects, AI usage, Storage, Exports, Subscriptions, Payments, API settings, System settings, Logs. Not shipped in this frontend build.

## Privacy

- Videos are `blob:` URLs in memory and optional IndexedDB records.
- `localStorage` holds theme, language, and non-secret AI endpoint URLs only.
- Nothing is uploaded until you export (download) or invoke a configured endpoint.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Space | Play / pause |
| Ctrl+K | Quick Command Palette |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+S | Save project |
| Ctrl+C / V / X | Copy / paste / cut clip |
| Delete | Delete selected clip |

## Project structure

```
AI-Video-Editor-Pro/
  index.html
  css/style.css
  js/app.js               Shell, i18n, IndexedDB, history
  js/video-editor.js      Upload, player, trim, crop, demo, PiP
  js/timeline.js          Tracks, split, ripple delete, drag
  js/audio.js             Music tones, VO, volume
  js/screen-recorder.js   Screen + webcam + microphone capture and auto-import
  js/uncommon-features.js Chroma key, SFX, TTS voiceover, stickers, freeze frame, cmd palette, .aive IO
  js/subtitles.js         SRT + overlay
  js/effects.js           Filters, text, templates, brand
  js/export.js            MediaRecorder + FFmpeg + GIF + Audio mixdown
  js/ai.js                Assistant + local analysis
  lib/ffmpeg/             Optional WASM binaries
  assets/
```

## Testing checklist

- [ ] Video upload + drag and drop  
- [ ] Preview play/pause, volume, playback speed  
- [ ] Trim, split, cut, timeline zoom  
- [ ] Text, subtitles, SRT import/export  
- [ ] Audio volume, demo music, voice-over (mic permission)  
- [ ] Filters / effects / transitions  
- [ ] Undo / redo, project save  
- [ ] Export WebM  
- [ ] Theme + language switch (no reload)  
- [ ] Mobile layout (no horizontal page scroll)  
- [ ] Errors: bad type, oversized file, decode failure, mic denied, missing AI URL  

## License

Application code: use and modify for your product.  
Demo music: original generated tones, not a commercial catalog.  
Replace with your licensed tracks in `assets/sounds/` if needed.
