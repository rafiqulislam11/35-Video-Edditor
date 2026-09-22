FFmpeg.wasm local files (optional)
=================================

The app loads FFmpeg.wasm from a CDN by default (see js/export.js).

To run fully offline, download and place these files here:

- ffmpeg.min.js          (@ffmpeg/ffmpeg 0.11.x UMD build)
- ffmpeg-core.js
- ffmpeg-core.wasm
- ffmpeg-core.worker.js

Then set window.AIVE_CONFIG.ffmpeg.corePath in index.html to "./lib/ffmpeg/".

SharedArrayBuffer (required by FFmpeg.wasm) needs HTTP headers:

  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

See the project README for a local server example.
