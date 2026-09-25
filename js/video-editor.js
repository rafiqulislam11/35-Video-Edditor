/**
 * Upload, preview player, trim, crop, rotate, resize, playback engine.
 * Class A: HTML5 video + canvas overlay.
 */
(function (global) {
  "use strict";

  const ACCEPT = /\.(mp4|webm|mov|avi|mkv|m4v|ogv|png|jpe?g|webp|gif|bmp|svg)$/i;
  const MIME_OK = /^(video|image)\//;
  const ACCEPT_IMG = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;
  const MIME_IMG = /^image\//;

  const Player = {
    video: null,
    raf: 0,
    rate: 1,

    init() {
      this.video = document.getElementById("preview-video");
      this.video.addEventListener("timeupdate", () => this.onTime());
      this.video.addEventListener("ended", () => this.onEnded());
      this.video.addEventListener("loadedmetadata", () => Overlay.resize());
      this.video.volume = 1;

      document.querySelectorAll("[data-player]").forEach((b) => {
        b.addEventListener("click", () => this.cmd(b.dataset.player));
      });
      document.getElementById("seek").addEventListener("input", (e) => {
        const dur = Editor.duration() || this.video.duration || 0;
        Editor.playhead = (Number(e.target.value) / 1000) * dur;
        this.seekTimeline(Editor.playhead);
      });
      document.getElementById("player-volume").addEventListener("input", (e) => {
        this.video.volume = Number(e.target.value);
      });
      document.getElementById("playback-rate").addEventListener("change", (e) => {
        this.rate = Number(e.target.value);
        this.video.playbackRate = this.rate;
      });
      const wrap = document.getElementById("preview-wrap");
      wrap.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      wrap.addEventListener("drop", (e) => {
        e.preventDefault();
        VideoEditor.ingestFiles(e.dataTransfer.files);
      });

      // Stage Toolbar — Aspect Ratio Buttons
      document.querySelectorAll("[data-aspect]").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll("[data-aspect]").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const asp = btn.dataset.aspect;
          let w = 1920, h = 1080;
          if (asp === "9:16") { w = 1080; h = 1920; }
          else if (asp === "1:1") { w = 1080; h = 1080; }
          else if (asp === "4:5") { w = 1080; h = 1350; }
          else if (asp === "21:9") { w = 2560; h = 1080; }
          else { w = 1920; h = 1080; }

          const cw = document.getElementById("custom-w");
          const ch = document.getElementById("custom-h");
          if (cw) cw.value = w;
          if (ch) ch.value = h;
          VideoEditor.applyResize();
        });
      });

      // Stage Toolbar — Safe Grid Toggle
      const gridBtn = document.getElementById("toggle-grid-btn");
      if (gridBtn) {
        gridBtn.addEventListener("click", () => {
          Overlay.showGrid = !Overlay.showGrid;
          gridBtn.classList.toggle("active", Overlay.showGrid);
          Overlay.draw();
          UI.toast(Overlay.showGrid ? "📐 Rule of Thirds & Safe Grid: ON" : "📐 Safe Grid: OFF");
        });
      }

      // Stage Toolbar — Fit Canvas
      const fitBtn = document.getElementById("canvas-fit-btn");
      if (fitBtn) {
        fitBtn.addEventListener("click", () => {
          const mon = document.getElementById("monitor");
          if (mon) {
            mon.style.maxWidth = "min(100%, 960px)";
            Overlay.resize();
            UI.toast("Monitor: Fit View");
          }
        });
      }
    },

    cmd(name) {
      const fps = Editor.project.fps || 30;
      const step = 1 / fps;
      if (name === "toggle") this.toggle();
      if (name === "stop") {
        this.pause();
        Editor.playhead = 0;
        this.seekTimeline(0);
      }
      if (name === "skip-back") this.seekTimeline(Math.max(0, Editor.playhead - 5));
      if (name === "skip-fwd") this.seekTimeline(Editor.playhead + 5);
      if (name === "prev-frame") {
        this.pause();
        this.seekTimeline(Math.max(0, Editor.playhead - step));
      }
      if (name === "next-frame") {
        this.pause();
        this.seekTimeline(Editor.playhead + step);
      }
      if (name === "mute") {
        this.video.muted = !this.video.muted;
      }
      if (name === "fullscreen") {
        const mon = document.getElementById("monitor");
        if (!document.fullscreenElement) mon.requestFullscreen().catch(() => {});
        else document.exitFullscreen();
      }
    },

    toggle() {
      if (Editor.playing) this.pause();
      else this.play();
    },

    play() {
      Editor.playing = true;
      this._lastTick = performance.now();
      document.getElementById("btn-play").textContent = "⏸";
      this.tick();
      const clip = this.activeVideoClip();
      if (clip && clip.type === "video") {
        this.video.play().catch(() => {});
      }
    },

    pause() {
      Editor.playing = false;
      this._lastTick = null;
      document.getElementById("btn-play").textContent = "▶";
      this.video.pause();
      if (this._audioPool) {
        this._audioPool.forEach((a) => { if (!a.paused) a.pause(); });
      }
      cancelAnimationFrame(this.raf);
    },

    tick() {
      if (!Editor.playing) return;
      const now = performance.now();
      if (!this._lastTick) this._lastTick = now;
      const dt = (now - this._lastTick) / 1000;
      this._lastTick = now;

      const clip = this.activeVideoClip();
      if (clip && clip.type === "image") {
        Editor.playhead += dt * this.rate;
        const totalDur = Editor.duration() || 1;
        if (Editor.playhead >= totalDur) {
          Editor.playhead = 0;
          this.pause();
        }
        this.updateChrome();
        Timeline.updatePlayhead();
      }

      this.sync();
      Overlay.draw();
      this.raf = requestAnimationFrame(() => this.tick());
    },

    onTime() {
      const clip = this.activeVideoClip();
      if (clip && clip.type === "video" && this.video === document.getElementById("preview-video")) {
        const local = this.video.currentTime;
        Editor.playhead = clip.start + (local - clip.inPoint) / (clip.speed || 1);
      }
      this.updateChrome();
      Overlay.draw();
      Timeline.updatePlayhead();
      if (Editor.previewTrim) {
        const t0 = Number(document.getElementById("trim-start").value) || 0;
        const t1 = Number(document.getElementById("trim-end").value) || 0;
        if (this.video.currentTime >= t1) {
          this.video.currentTime = t0;
        }
      }
    },

    onEnded() {
      const next = this.clipAt(Editor.playhead + 0.05);
      if (!next) this.pause();
    },

    activeVideoClip() {
      return Editor.project.clips.find(
        (c) =>
          (c.type === "video" || c.type === "image") &&
          !this.trackMuted(c.track) &&
          Editor.playhead >= c.start &&
          Editor.playhead < c.start + c.duration
      );
    },

    clipAt(t) {
      return Editor.project.clips
        .filter((c) => (c.type === "video" || c.type === "image") && t >= c.start && t < c.start + c.duration)
        .sort((a, b) => (a.track === "v2" ? 1 : 0) - (b.track === "v2" ? 1 : 0))
        .pop();
    },

    trackMuted(id) {
      const tr = Editor.tracks.find((t) => t.id === id);
      return tr && (tr.muted || tr.hidden);
    },

    seekTimeline(t) {
      Editor.playhead = Math.max(0, t);
      this.sync(true);
      this.updateChrome();
      Overlay.draw();
      Timeline.updatePlayhead();
    },

    sync(forceSeek) {
      const clip = this.activeVideoClip();
      const empty = document.getElementById("empty-preview");
      if (!clip) {
        if (!this.video.src) empty.classList.remove("hidden");
        this.updateChrome();
        return;
      }
      empty.classList.add("hidden");
      if (clip.type === "image") {
        if (!this.video.paused) this.video.pause();
        this.video.style.opacity = "0";
        this.syncAudio(forceSeek);
        this.updateChrome();
        return;
      }
      this.video.style.opacity = "1";
      const media = Editor.media.get(clip.sourceId);
      if (!media) return;
      const url = media.url;
      const local = clip.inPoint + (Editor.playhead - clip.start) * (clip.speed || 1);
      if (this.video.dataset.srcId !== clip.sourceId) {
        this.video.src = url;
        this.video.dataset.srcId = clip.sourceId;
        this.video.currentTime = local;
      } else if (forceSeek || Math.abs(this.video.currentTime - local) > 0.25) {
        this.video.currentTime = local;
      }
      this.video.playbackRate = this.rate * (clip.speed || 1);
      this.video.muted = clip.muted || this.trackMuted(clip.track);
      const vol = (clip.volume == null ? 1 : clip.volume) * (document.getElementById("audio-mute").checked ? 0 : Number(document.getElementById("audio-volume").value) / 100);
      this.video.volume = Math.min(1, Math.max(0, vol));
      EffectsStudio.applyToVideo(this.video, clip);
      this.applyTransform(clip);
      this.syncAudio(forceSeek);
      this.updateChrome();
    },

    syncAudio(forceSeek) {
      if (!this._audioPool) this._audioPool = new Map();
      const t = Editor.playhead;
      const masterMute = document.getElementById("audio-mute") ? document.getElementById("audio-mute").checked : false;
      const masterVol = document.getElementById("audio-volume") ? Number(document.getElementById("audio-volume").value) / 100 : 1;

      const activeAudioClips = Editor.project.clips.filter((c) =>
        c.type === "audio" &&
        c.sourceId &&
        !this.trackMuted(c.track)
      );

      const activeIds = new Set();
      activeAudioClips.forEach((c) => {
        const on = t >= c.start && t < c.start + c.duration;
        if (!on) return;
        activeIds.add(c.id);

        const m = Editor.media.get(c.sourceId);
        if (!m || !m.url) return;

        let a = this._audioPool.get(c.id);
        if (!a) {
          a = new Audio(m.url);
          a.preload = "auto";
          this._audioPool.set(c.id, a);
        }

        const local = (c.inPoint || 0) + (t - c.start) * (c.speed || 1);
        if (forceSeek || Math.abs(a.currentTime - local) > 0.25) {
          a.currentTime = local;
        }

        let vol = c.volume == null ? 1 : c.volume;
        const rel = t - c.start;
        if (c.fadeIn && rel < c.fadeIn) vol *= (rel / c.fadeIn);
        const rem = (c.start + c.duration) - t;
        if (c.fadeOut && rem < c.fadeOut) vol *= (rem / c.fadeOut);
        a.volume = masterMute ? 0 : Math.max(0, Math.min(1, vol * masterVol));

        if (Editor.playing && a.paused) a.play().catch(() => {});
        else if (!Editor.playing && !a.paused) a.pause();
      });

      for (const [id, a] of this._audioPool) {
        if (!activeIds.has(id)) {
          if (!a.paused) a.pause();
        }
      }
    },

    applyTransform(clip) {
      const rot = clip.rotate || 0;
      const fx = clip.flipH ? -1 : 1;
      const fy = clip.flipV ? -1 : 1;
      this.video.style.transform = `rotate(${rot}deg) scale(${fx}, ${fy})`;
    },

    load(media) {
      if (!media) {
        this.video.removeAttribute("src");
        this.video.load();
        this.video.dataset.srcId = "";
        document.getElementById("empty-preview").classList.remove("hidden");
        this.updateChrome();
        return;
      }
      if (media.isImage || (media.info && media.info.type === "image")) {
        this.video.style.opacity = "0";
        this.video.dataset.srcId = media.id;
        document.getElementById("empty-preview").classList.add("hidden");
        Overlay.draw();
        this.updateChrome();
        return;
      }
      this.video.style.opacity = "1";
      this.video.src = media.url;
      this.video.dataset.srcId = media.id;
      document.getElementById("empty-preview").classList.add("hidden");
    },

    updateChrome() {
      const dur = Editor.duration() || this.video.duration || 0;
      document.getElementById("cur-time").textContent = formatTime(Editor.playhead);
      document.getElementById("dur-time").textContent = formatTime(dur);
      document.getElementById("seek").value = dur ? Math.round((Editor.playhead / dur) * 1000) : 0;
      document.getElementById("project-meta").textContent =
        Editor.project.width + "×" + Editor.project.height + " · " + Editor.project.fps + "fps";

      const resBadge = document.getElementById("canvas-res-badge");
      if (resBadge) {
        resBadge.textContent = Editor.project.width + " × " + Editor.project.height;
      }
      // Sync aspect ratio button active state
      const ratio = Editor.project.width / Editor.project.height;
      document.querySelectorAll("[data-aspect]").forEach((b) => {
        const a = b.dataset.aspect;
        let match = false;
        if (a === "16:9" && Math.abs(ratio - 16/9) < 0.05) match = true;
        else if (a === "9:16" && Math.abs(ratio - 9/16) < 0.05) match = true;
        else if (a === "1:1" && Math.abs(ratio - 1) < 0.05) match = true;
        else if (a === "4:5" && Math.abs(ratio - 4/5) < 0.05) match = true;
        else if (a === "21:9" && Math.abs(ratio - 21/9) < 0.05) match = true;
        b.classList.toggle("active", match);
      });
    }
  };

  const Overlay = {
    canvas: null,
    ctx: null,
    showGrid: false,
    init() {
      this.canvas = document.getElementById("overlay-canvas");
      this.ctx = this.canvas.getContext("2d");
      window.addEventListener("resize", () => this.resize());
      this.resize();
    },
    resize() {
      const mon = document.getElementById("monitor");
      this.canvas.width = mon.clientWidth;
      this.canvas.height = mon.clientHeight;
      this.draw();
    },
    draw() {
      const ctx = this.ctx;
      if (!ctx) return;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);
      const t = Editor.playhead;

      // 1. Render Image clips (Freeze Frames / Photos)
      Editor.project.clips.forEach((c) => {
        if (t < c.start || t >= c.start + c.duration) return;
        const tr = Editor.tracks.find((x) => x.id === c.track);
        if (tr && tr.hidden) return;
        if (c.type === "image") this.drawImageClip(c);
      });

      // 2. Render PiP / Track v2 Video Overlays with Chroma Key
      this.drawPipClips(ctx, w, h, t);

      // 3. Render Text, Elements, Stickers, FX
      Editor.project.clips.forEach((c) => {
        if (t < c.start || t >= c.start + c.duration) return;
        const tr = Editor.tracks.find((x) => x.id === c.track);
        if (tr && tr.hidden) return;
        if (c.type === "text") this.drawText(c, t);
        if (c.type === "element") this.drawElement(c);
        if (c.type === "sticker" && global.Stickers) global.Stickers.draw(ctx, w, h, t, c);
        if (c.type === "fx") this.drawFx(c);
      });

      // 4. Subtitles
      Subtitles.draw(ctx, w, h, t);

      // 5. Watermark
      if (Editor.brand && Editor.brand.watermark) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = Editor.brand.primary || "#6c8cff";
        ctx.font = "14px Inter";
        ctx.fillText(Editor.project.name || "AI Video Editor", w - 160, h - 16);
        ctx.globalAlpha = 1;
      }

      // 6. Direct Manipulation Bounding Box on Canvas
      if (global.CanvasInteraction) {
        global.CanvasInteraction.drawSelectionBox(ctx, w, h);
      }

      // 7. Rule of Thirds & Title/Action Safe Grid
      if (this.showGrid) {
        ctx.save();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        // Rule of Thirds lines
        ctx.beginPath();
        ctx.moveTo(w / 3, 0); ctx.lineTo(w / 3, h);
        ctx.moveTo((w * 2) / 3, 0); ctx.lineTo((w * 2) / 3, h);
        ctx.moveTo(0, h / 3); ctx.lineTo(w, h / 3);
        ctx.moveTo(0, (h * 2) / 3); ctx.lineTo(w, (h * 2) / 3);
        ctx.stroke();

        // 90% Action Safe Zone
        ctx.strokeStyle = "rgba(251, 191, 36, 0.35)";
        ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);

        // 80% Title Safe Zone
        ctx.strokeStyle = "rgba(168, 85, 247, 0.35)";
        ctx.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);

        // Center Crosshair
        ctx.strokeStyle = "rgba(244, 63, 94, 0.75)";
        ctx.setLineDash([]);
        const cx = w / 2, cy = h / 2;
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy);
        ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14);
        ctx.stroke();

        ctx.restore();
      }
    },

    drawImageClip(c) {
      const m = Editor.media.get(c.sourceId);
      if (!m || !m.url) return;
      if (!this._imgCache) this._imgCache = new Map();
      let img = this._imgCache.get(c.sourceId);
      if (!img) {
        img = new Image();
        img.src = m.url;
        this._imgCache.set(c.sourceId, img);
      }
      if (!img.complete || !img.naturalWidth) return;

      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const t = Editor.playhead;
      const progress = Math.min(1, Math.max(0, (t - c.start) / (c.duration || 1)));

      ctx.save();

      // Filters
      ctx.filter = EffectsStudio.filterCss(c);

      // Transitions & Fades
      let alpha = 1;
      const transDur = c.transDur || 0.6;
      if (c.transition && c.transition !== "none") {
        if (t - c.start < transDur) {
          alpha = Math.min(1, Math.max(0, (t - c.start) / transDur));
        }
      }
      if (c.fadeIn && t - c.start < c.fadeIn) {
        alpha = Math.min(alpha, (t - c.start) / c.fadeIn);
      }
      const timeLeft = (c.start + c.duration) - t;
      if (c.fadeOut && timeLeft < c.fadeOut) {
        alpha = Math.min(alpha, timeLeft / c.fadeOut);
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

      // Ken Burns Motion Effect
      const ken = c.kenBurns || "zoomIn";
      let scale = 1.0;
      let offsetX = 0;
      let offsetY = 0;
      if (ken === "zoomIn") {
        scale = 1.0 + (0.16 * progress);
      } else if (ken === "zoomOut") {
        scale = 1.16 - (0.16 * progress);
      } else if (ken === "panLeft") {
        scale = 1.12;
        offsetX = (0.05 - 0.1 * progress) * cw;
      } else if (ken === "panRight") {
        scale = 1.12;
        offsetX = (-0.05 + 0.1 * progress) * cw;
      }

      // Center & transform
      ctx.translate(cw / 2 + offsetX, ch / 2 + offsetY);
      if (c.rotate) ctx.rotate((c.rotate * Math.PI) / 180);
      ctx.scale(c.flipH ? -scale : scale, c.flipV ? -scale : scale);

      // Aspect cover calculation
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = cw / ch;
      let drawW, drawH;
      if (imgAspect > canvasAspect) {
        drawH = ch;
        drawW = ch * imgAspect;
      } else {
        drawW = cw;
        drawH = cw / imgAspect;
      }
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

      ctx.restore();
    },

    drawPipClips(ctx, w, h, t) {
      const pipClips = Editor.project.clips.filter((c) =>
        c.type === "video" &&
        (c.track === "v2" || c.pip) &&
        t >= c.start &&
        t < c.start + c.duration &&
        !Editor.tracks.find((tr) => tr.id === c.track)?.hidden
      );

      pipClips.forEach((c) => {
        const m = Editor.media.get(c.sourceId);
        if (!m || !m.url) return;
        if (!this._pipVideos) this._pipVideos = new Map();
        let pipVid = this._pipVideos.get(c.id);
        if (!pipVid) {
          pipVid = document.createElement("video");
          pipVid.src = m.url;
          pipVid.muted = true;
          pipVid.playsInline = true;
          this._pipVideos.set(c.id, pipVid);
        }

        const local = c.inPoint + (t - c.start) * (c.speed || 1);
        if (Math.abs(pipVid.currentTime - local) > 0.2) {
          pipVid.currentTime = local;
        }
        if (Editor.playing && pipVid.paused) pipVid.play().catch(() => {});
        else if (!Editor.playing && !pipVid.paused) pipVid.pause();

        if (pipVid.readyState < 2) return;

        const scale = (c.pipScale || (c.pip ? 35 : 40)) / 100;
        const pw = w * scale;
        const ph = pw * ((pipVid.videoHeight / (pipVid.videoWidth || 1)) || (9 / 16));
        const px = w * ((c.pipX != null ? c.pipX : 80) / 100) - pw / 2;
        const py = h * ((c.pipY != null ? c.pipY : 75) / 100) - ph / 2;

        ctx.save();
        ctx.globalCompositeOperation = c.pipBlend || "source-over";

        if (c.chromaKey && c.chromaKey.enabled && global.ChromaKey) {
          if (!this._ckCanvas) {
            this._ckCanvas = document.createElement("canvas");
            this._ckCtx = this._ckCanvas.getContext("2d");
          }
          this._ckCanvas.width = Math.min(640, pipVid.videoWidth || 640);
          this._ckCanvas.height = Math.min(360, pipVid.videoHeight || 360);
          this._ckCtx.drawImage(pipVid, 0, 0, this._ckCanvas.width, this._ckCanvas.height);
          const imgData = this._ckCtx.getImageData(0, 0, this._ckCanvas.width, this._ckCanvas.height);
          global.ChromaKey.processImageData(
            imgData,
            c.chromaKey.color || "#00ff00",
            c.chromaKey.similarity != null ? c.chromaKey.similarity : 45,
            c.chromaKey.smoothness != null ? c.chromaKey.smoothness : 20,
            c.chromaKey.spill != null ? c.chromaKey.spill : 30
          );
          this._ckCtx.putImageData(imgData, 0, 0);

          ctx.drawImage(this._ckCanvas, px, py, pw, ph);
        } else {
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.roundRect(px, py, pw, ph, 12);
          ctx.fillStyle = "#000";
          ctx.fill();
          ctx.clip();
          ctx.drawImage(pipVid, px, py, pw, ph);

          ctx.shadowColor = "transparent";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(108,140,255,0.85)";
          ctx.stroke();
        }

        ctx.restore();
      });
    },
    drawText(c, t) {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const local = t - c.start;
      const anim = c.anim || "none";
      const ad = c.animDur || 0.6;
      let alpha = (c.opacity == null ? 1 : c.opacity);
      let ox = 0, oy = 0, scale = 1, trackingExtra = 0;
      const k = Math.min(1, Math.max(0, local / ad));

      // In/Out Animations
      if (anim === "fadeIn") alpha *= k;
      if (anim === "fadeOut") alpha *= 1 - Math.min(1, Math.max(0, (c.duration - local) / ad));
      if (anim === "slideLeft") ox = (1 - k) * 60;
      if (anim === "slideRight") ox = (k - 1) * 60;
      if (anim === "slideUp") oy = (1 - k) * 50;
      if (anim === "slideDown") oy = (k - 1) * 50;
      if (anim === "zoomIn" || anim === "pop") scale = k < 1 ? 0.4 + 0.6 * Math.sin(k * Math.PI / 2) : 1;
      if (anim === "zoomOut") scale = 1.3 - 0.3 * k;
      if (anim === "bounce") {
        scale = k < 1 ? Math.sin(k * Math.PI * 2) * (1 - k) * 0.35 + 1 : 1;
      }
      if (anim === "tracking") trackingExtra = (1 - k) * 16;

      let rawText = c.text || "";
      if (c.uppercase) rawText = rawText.toUpperCase();

      // Typewriter with blinking cursor
      if (anim === "typewriter") {
        const totalChars = rawText.length;
        const n = Math.floor(k * totalChars);
        rawText = rawText.slice(0, n);
        if (local < ad && Math.floor(local * 5) % 2 === 0) {
          rawText += "|";
        }
      }

      const lines = String(rawText).split("\n");
      const fontSize = c.size || 48;
      const lineHeight = fontSize * (c.leading || 1.25);
      const totalH = lines.length * lineHeight;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

      const posX = w * ((c.x || 50) / 100) + ox;
      const posY = h * ((c.y || 50) / 100) + oy;
      ctx.translate(posX, posY);

      if (c.rotate) {
        ctx.rotate((c.rotate * Math.PI) / 180);
      }
      // Multilingual & script direction (Arabic RTL & Bangla conjuncts)
      const isArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(rawText);
      if ("direction" in ctx) {
        ctx.direction = isArabic ? "rtl" : "ltr";
      }

      ctx.font = `${c.italic ? "italic " : ""}${c.bold ? "700 " : "600 "}${fontSize}px "${c.font || "Hind Siliguri"}", "Hind Siliguri", "Noto Sans Bengali", "Cairo", "Amiri", "Noto Sans Arabic", "Inter", sans-serif`;
      ctx.textAlign = c.align || "center";
      ctx.textBaseline = "middle";

      // Letter spacing support
      const tracking = (c.tracking || 0) + trackingExtra;
      if ("letterSpacing" in ctx) {
        ctx.letterSpacing = tracking + "px";
      }

      // Measure max line width for background box
      let maxLineWidth = 0;
      lines.forEach((l) => {
        const m = ctx.measureText(l);
        if (m.width > maxLineWidth) maxLineWidth = m.width;
      });

      // Background Box / Pill
      if (c.bgOn) {
        ctx.save();
        const padX = c.bgPadX != null ? c.bgPadX : (c.bgPad != null ? c.bgPad : 16);
        const padY = c.bgPadY != null ? c.bgPadY : 8;
        const rad = c.bgRadius != null ? c.bgRadius : 8;
        const boxW = maxLineWidth + padX * 2;
        const boxH = totalH + padY * 2;
        let boxX = -boxW / 2;
        if (c.align === "left") boxX = -padX;
        else if (c.align === "right") boxX = -maxLineWidth - padX;
        const boxY = -totalH / 2 - padY;

        ctx.fillStyle = c.bg || "rgba(0,0,0,0.75)";
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(boxX, boxY, boxW, boxH, rad);
        } else {
          ctx.rect(boxX, boxY, boxW, boxH);
        }
        ctx.fill();
        ctx.restore();
      }

      // Prepare fill style (Solid or Gradient)
      let fillStyle = c.color || "#ffffff";
      if (c.fillType === "gradient" && c.color2) {
        const grad = ctx.createLinearGradient(-maxLineWidth / 2, -totalH / 2, maxLineWidth / 2, totalH / 2);
        grad.addColorStop(0, c.color || "#ffffff");
        grad.addColorStop(1, c.color2 || "#38bdf8");
        fillStyle = grad;
      }

      // Glitch RGB split effect
      const isGlitch = anim === "glitch" && (Math.sin(local * 25) > 0.4);

      // Render each line
      lines.forEach((line, idx) => {
        const lineY = -totalH / 2 + (idx + 0.5) * lineHeight;

        if (isGlitch) {
          ctx.save();
          ctx.fillStyle = "rgba(0, 255, 255, 0.7)";
          ctx.fillText(line, -3, lineY - 2);
          ctx.fillStyle = "rgba(255, 0, 80, 0.7)";
          ctx.fillText(line, 3, lineY + 2);
          ctx.restore();
        }

        // Stroke / Outline
        if (c.strokeOn || c.strokeWidth || c.border) {
          ctx.save();
          ctx.lineWidth = c.strokeWidth != null ? c.strokeWidth : (c.border ? 3 : 0);
          ctx.strokeStyle = c.strokeColor || c.border || "#000000";
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.strokeText(line, 0, lineY);
          ctx.restore();
        }

        // Shadow / Glow
        if (c.shadowOn !== false && (c.shadow || c.shadowColor)) {
          ctx.shadowColor = c.shadowColor || c.shadow || "rgba(0,0,0,0.8)";
          ctx.shadowBlur = c.shadowBlur != null ? c.shadowBlur : 8;
          ctx.shadowOffsetX = c.shadowX != null ? c.shadowX : 2;
          ctx.shadowOffsetY = c.shadowY != null ? c.shadowY : 3;
        } else {
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }

        ctx.fillStyle = fillStyle;
        ctx.fillText(line, 0, lineY);

        // Underline
        if (c.underline) {
          const m = ctx.measureText(line);
          let ulX = -m.width / 2;
          if (c.align === "left") ulX = 0;
          else if (c.align === "right") ulX = -m.width;
          ctx.fillRect(ulX, lineY + fontSize * 0.45, m.width, Math.max(2, fontSize * 0.06));
        }
      });

      ctx.restore();
    },
    drawElement(c) {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.save();
      ctx.strokeStyle = Editor.brand.primary;
      ctx.fillStyle = "rgba(108,140,255,.25)";
      ctx.lineWidth = 2;
      const x = w * 0.2, y = h * 0.2, rw = w * 0.6, rh = h * 0.2;
      if (c.shape === "rect" || c.shape === "watermark") ctx.strokeRect(x, y, rw, rh);
      if (c.shape === "circle") {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (c.shape === "line" || c.shape === "arrow") {
        ctx.beginPath();
        ctx.moveTo(w * 0.2, h * 0.5);
        ctx.lineTo(w * 0.8, h * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    },
    drawFx(c) {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const i = (c.intensity == null ? 50 : c.intensity) / 100;
      if (c.effect === "vignette" || c.effect === "film") {
        const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0," + (0.55 * i) + ")");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      if (c.effect === "flash") {
        const phase = (Editor.playhead * 8) % 1;
        if (phase < 0.08) {
          ctx.fillStyle = "rgba(255,255,255," + (0.4 * i) + ")";
          ctx.fillRect(0, 0, w, h);
        }
      }
      if (c.effect === "noise" || c.effect === "vhs") {
        const img = ctx.getImageData(0, 0, Math.min(w, 80), 40);
        for (let p = 0; p < img.data.length; p += 4) {
          const n = (Math.random() - 0.5) * 80 * i;
          img.data[p] = img.data[p + 1] = img.data[p + 2] = 128 + n;
          img.data[p + 3] = 40;
        }
        ctx.putImageData(img, 0, 0);
      }
    }
  };

  const VideoEditor = {
    init() {
      Player.init();
      Overlay.init();
      const dz = document.getElementById("media-dropzone");
      const input = document.getElementById("file-input");
      dz.addEventListener("click", (e) => {
        if (e.target.id === "browse-files" || e.target.closest("#browse-files")) input.click();
        else if (e.target === dz || e.target.parentElement === dz) input.click();
      });
      document.getElementById("browse-files").addEventListener("click", (e) => {
        e.stopPropagation();
        input.click();
      });
      input.addEventListener("change", () => this.ingestFiles(input.files));
      ["dragenter", "dragover"].forEach((ev) =>
        dz.addEventListener(ev, (e) => {
          e.preventDefault();
          dz.classList.add("dragover");
        })
      );
      ["dragleave", "drop"].forEach((ev) =>
        dz.addEventListener(ev, (e) => {
          e.preventDefault();
          dz.classList.remove("dragover");
        })
      );
      dz.addEventListener("drop", (e) => this.ingestFiles(e.dataTransfer.files));
      dz.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.click();
        }
      });

      ["trim-start", "trim-end"].forEach((id) => {
        document.getElementById(id).addEventListener("change", () => this.syncTrimInputs());
      });
      document.getElementById("trim-start-range").addEventListener("input", (e) => {
        const v = document.getElementById("preview-video");
        const d = v.duration || Editor.duration() || 1;
        document.getElementById("trim-start").value = ((Number(e.target.value) / 1000) * d).toFixed(2);
      });
      document.getElementById("trim-end-range").addEventListener("input", (e) => {
        const v = document.getElementById("preview-video");
        const d = v.duration || Editor.duration() || 1;
        document.getElementById("trim-end").value = ((Number(e.target.value) / 1000) * d).toFixed(2);
      });
      document.getElementById("preview-trim").addEventListener("change", (e) => {
        Editor.previewTrim = e.target.checked;
        if (e.target.checked) {
          Player.video.currentTime = Number(document.getElementById("trim-start").value) || 0;
        }
      });
      document.getElementById("clip-speed").addEventListener("change", (e) => {
        const c = Editor.selected();
        if (!c || c.type !== "video") return;
        History.push();
        const speed = Number(e.target.value);
        const srcLen = c.outPoint - c.inPoint;
        c.speed = speed;
        c.duration = srcLen / speed;
        Timeline.render();
      });
    },

    async ingestFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const max = (AIVE_CONFIG.maxUploadMB || 512) * 1048576;
      for (const file of files) {
        const okType = MIME_OK.test(file.type) || ACCEPT.test(file.name);
        if (!okType) {
          UI.toast(UI.t("fileBad") + " " + file.name, "err");
          continue;
        }
        if (file.size > max) {
          UI.toast(UI.t("fileBig") + " Limit " + AIVE_CONFIG.maxUploadMB + " MB.", "err");
          continue;
        }
        UI.loading(true, "Reading " + file.name, 20);
        try {
          await this.addFile(file);
          UI.toast(UI.t("uploaded"));
        } catch (err) {
          console.error(err);
          UI.toast(UI.t("decodeFail"), "err");
        }
      }
      UI.loading(false);
      document.getElementById("file-input").value = "";
    },

    addFile(file) {
      if (MIME_IMG.test(file.type) || ACCEPT_IMG.test(file.name)) {
        return this.addImageFile(file);
      }
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement("video");
        v.preload = "metadata";
        v.src = url;
        const timer = setTimeout(() => {
          cleanupFail(new Error("timeout"));
        }, 20000);
        const cleanupFail = (err) => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          reject(err);
        };
        v.onerror = () => cleanupFail(new Error("decode"));
        v.onloadedmetadata = () => {
          clearTimeout(timer);
          const id = uid("media");
          const info = {
            name: file.name,
            size: file.size,
            type: file.type || "video",
            duration: v.duration || 0,
            width: v.videoWidth || 0,
            height: v.videoHeight || 0
          };
          const rec = { id, file, blob: file, url, info };
          Editor.media.set(id, rec);
          this.renderMediaCard(rec);
          document.getElementById("media-empty").hidden = true;
          const last = Editor.project.clips.filter((c) => c.type === "video" || c.type === "image").reduce((m, c) => Math.max(m, c.start + c.duration), 0);
          const clip = {
            id: uid("clip"),
            type: "video",
            track: "v1",
            sourceId: id,
            start: last,
            inPoint: 0,
            outPoint: info.duration,
            duration: info.duration,
            speed: 1,
            volume: 1,
            rotate: 0,
            flipH: false,
            flipV: false,
            filter: "original",
            filterIntensity: 1,
            adjustments: EffectsStudio.defaultAdjust(),
            effect: "none",
            intensity: 50,
            transition: "none",
            transDur: 0.5,
            fadeIn: 0,
            fadeOut: 0
          };
          if (!Editor.project.clips.some((c) => c.type === "video" || c.type === "image")) {
            if (info.width) {
              Editor.project.width = info.width;
              Editor.project.height = info.height;
            }
          }
          Editor.addClip(clip);
          Player.load(rec);
          this.setTrimRange(0, info.duration);
          resolve(rec);
        };
      });
    },

    addImageFile(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const id = uid("media");
          const defaultDuration = 4.0;
          const info = {
            name: file.name,
            size: file.size,
            type: "image",
            duration: defaultDuration,
            width: img.naturalWidth || 1920,
            height: img.naturalHeight || 1080
          };
          const rec = { id, file, blob: file, url, info, isImage: true };
          Editor.media.set(id, rec);
          this.renderMediaCard(rec);
          document.getElementById("media-empty").hidden = true;

          const last = Editor.project.clips
            .filter((c) => c.type === "video" || c.type === "image")
            .reduce((m, c) => Math.max(m, c.start + c.duration), 0);

          const clip = {
            id: uid("clip"),
            type: "image",
            track: "v1",
            sourceId: id,
            start: last,
            inPoint: 0,
            outPoint: defaultDuration,
            duration: defaultDuration,
            speed: 1,
            rotate: 0,
            flipH: false,
            flipV: false,
            filter: "original",
            filterIntensity: 1,
            adjustments: EffectsStudio.defaultAdjust(),
            effect: "none",
            intensity: 50,
            transition: "fade",
            transDur: 0.6,
            fadeIn: 0.3,
            fadeOut: 0.3,
            kenBurns: "zoomIn"
          };

          if (!Editor.project.clips.some((c) => c.type === "video" || c.type === "image")) {
            if (info.width && info.height) {
              Editor.project.width = info.width;
              Editor.project.height = info.height;
            }
          }
          Editor.addClip(clip);
          Player.load(rec);
          Overlay.draw();
          Timeline.render();
          resolve(rec);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Image decode failed"));
        };
        img.src = url;
      });
    },

    renderMediaCard(rec) {
      const list = document.getElementById("media-list");
      const card = document.createElement("article");
      card.className = "media-card";
      card.tabIndex = 0;
      card.draggable = true;
      card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-aive-media", rec.id); e.dataTransfer.effectAllowed = "copy"; });
      
      let thumb;
      const isImg = rec.isImage || (rec.info && rec.info.type === "image");
      if (isImg) {
        thumb = document.createElement("img");
        thumb.src = rec.url;
        thumb.style.objectFit = "cover";
      } else {
        thumb = document.createElement("video");
        thumb.src = rec.url;
        thumb.muted = true;
        thumb.preload = "metadata";
      }

      const meta = document.createElement("div");
      meta.className = "meta";
      const i = rec.info;
      meta.innerHTML = `<strong title="${i.name}">${isImg ? "🖼️ " : "🎬 "}${i.name}</strong>
        ${formatTime(i.duration)} · ${i.width}×${i.height}<br/>
        ${formatBytes(i.size)} · ${isImg ? "PHOTO" : (i.type.split("/")[1] || "video").toUpperCase()}`;

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn primary mini media-quick-add";
      addBtn.innerHTML = "➕ টাইমলাইনে যোগ";
      addBtn.title = "প্লে-হেডে এই ক্লিপটি যোগ করুন (Add to Timeline)";
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (global.EasyUX && global.EasyUX.insertMediaToTimeline) {
          global.EasyUX.insertMediaToTimeline(rec);
        }
      });
      meta.appendChild(addBtn);

      card.append(thumb, meta);
      card.addEventListener("click", () => {
        Player.load(rec);
        const clip = Editor.project.clips.find((c) => c.sourceId === rec.id);
        if (clip) {
          Editor.selectedId = clip.id;
          Timeline.render();
        }
      });
      list.appendChild(card);
    },

    setTrimRange(a, b) {
      document.getElementById("trim-start").value = a.toFixed(2);
      document.getElementById("trim-end").value = b.toFixed(2);
      const d = b || 1;
      document.getElementById("trim-start-range").value = Math.round((a / d) * 1000);
      document.getElementById("trim-end-range").value = 1000;
    },

    syncTrimInputs() {
      const a = Number(document.getElementById("trim-start").value) || 0;
      const b = Number(document.getElementById("trim-end").value) || 0;
      const d = Player.video.duration || b || 1;
      document.getElementById("trim-start-range").value = Math.round((a / d) * 1000);
      document.getElementById("trim-end-range").value = Math.round((b / d) * 1000);
    },

    resetTrim() {
      const c = Editor.selected();
      const media = c && Editor.media.get(c.sourceId);
      const d = media ? media.info.duration : Player.video.duration || 0;
      this.setTrimRange(0, d);
    },

    applyTrim() {
      const c = Editor.selected();
      if (!c || c.type !== "video") {
        UI.toast("Select a video clip first", "err");
        return;
      }
      History.push();
      const a = Math.max(0, Number(document.getElementById("trim-start").value) || 0);
      let b = Number(document.getElementById("trim-end").value) || 0;
      const media = Editor.media.get(c.sourceId);
      const max = media ? media.info.duration : b;
      b = Math.min(max, Math.max(a + 0.05, b));
      c.inPoint = a;
      c.outPoint = b;
      c.duration = (b - a) / (c.speed || 1);
      Timeline.render();
      UI.toast("Trim applied");
    },

    rotate(deg) {
      const c = Editor.selected();
      if (!c) return;
      History.push();
      c.rotate = ((c.rotate || 0) + deg) % 360;
      Player.sync(true);
    },

    flip(axis) {
      const c = Editor.selected();
      if (!c) return;
      History.push();
      if (axis === "h") c.flipH = !c.flipH;
      else c.flipV = !c.flipV;
      Player.sync(true);
    },

    applyResize() {
      History.push();
      Editor.project.width = Number(document.getElementById("custom-w").value) || 1920;
      Editor.project.height = Number(document.getElementById("custom-h").value) || 1080;
      Player.updateChrome();
      const mon = document.getElementById("monitor");
      mon.style.aspectRatio = Editor.project.width + "/" + Editor.project.height;
      Overlay.resize();
      UI.toast("Preview canvas set to " + Editor.project.width + "×" + Editor.project.height);
    },

    resetCrop() {
      Editor.crop = { enabled: false, mode: "free", x: 0, y: 0, w: 1, h: 1 };
      document.getElementById("crop-overlay").classList.add("hidden");
    },

    setCrop(mode) {
      Editor.crop.enabled = mode !== "none";
      Editor.crop.mode = mode;
      const ov = document.getElementById("crop-overlay");
      const ratios = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5, "4:3": 4 / 3, free: null };
      const mon = document.getElementById("monitor");
      const mw = mon.clientWidth, mh = mon.clientHeight;
      let w = mw * 0.8, h = mh * 0.8;
      const r = ratios[mode];
      if (r) {
        if (w / h > r) w = h * r;
        else h = w / r;
      }
      ov.style.width = w + "px";
      ov.style.height = h + "px";
      ov.style.left = (mw - w) / 2 + "px";
      ov.style.top = (mh - h) / 2 + "px";
      ov.classList.toggle("hidden", !Editor.crop.enabled);
      this.bindCropDrag(ov);
    },

    bindCropDrag(ov) {
      let sx, sy, sl, st;
      ov.onmousedown = (e) => {
        sx = e.clientX;
        sy = e.clientY;
        sl = ov.offsetLeft;
        st = ov.offsetTop;
        const move = (ev) => {
          ov.style.left = sl + (ev.clientX - sx) + "px";
          ov.style.top = st + (ev.clientY - sy) + "px";
        };
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      };
    }
  };

  const Props = {
    refresh() {
      const c = Editor.selected();
      document.getElementById("prop-sel").textContent = c ? c.type + " · " + c.id.slice(-6) : "None";
      document.getElementById("prop-dur").textContent = c ? formatTime(c.duration) : "—";
      document.getElementById("prop-res").textContent = Editor.project.width + "×" + Editor.project.height;
      if (c && c.volume != null) {
        document.getElementById("clip-volume").value = Math.round(c.volume * 100);
        document.getElementById("clip-vol-label").textContent = Math.round(c.volume * 100) + "%";
      }
      document.getElementById("fx-summary").textContent = c && c.effect && c.effect !== "none" ? c.effect : "No effect on selected clip.";
      if (global.ChromaKey) global.ChromaKey.syncUI();
      if (global.TextStudio) global.TextStudio.syncUIFromClip(c);

      // Auto-switch Inspector tab according to clip type for seamless, effortless UX
      if (c && global.UI && global.UI.switchRightTab) {
        if (c.type === "text" || c.type === "sub") {
          global.UI.switchRightTab("text");
        } else if (c.type === "video" || c.type === "image") {
          global.UI.switchRightTab("video");
        } else if (c.type === "audio") {
          global.UI.switchRightTab("audio");
        } else if (c.type === "fx" || c.type === "sticker") {
          global.UI.switchRightTab("effects");
        }
      } else if (!c && global.UI && global.UI.switchRightTab) {
        global.UI.switchRightTab("props");
      }

      if (global.EasyUX && global.EasyUX.updateContextBar) {
        global.EasyUX.updateContextBar(c);
      }
    }
  };

  const Demo = {
    async load() {
      UI.loading(true, "Building demo project", 10);
      try {
        const blob = await this.makeDemoVideo();
        const file = new File([blob], "DEMO-color-bars.webm", { type: blob.type || "video/webm" });
        await VideoEditor.addFile(file);
        const vclip = Editor.project.clips.find((c) => c.type === "video");
        Editor.project.name = "Demo Project";
        Editor.project.demo = true;
        document.getElementById("project-name").value = "Demo Project";
        Editor.addClip({
          id: uid("clip"),
          type: "text",
          track: "text",
          start: 0.4,
          duration: 3.5,
          text: "AI Video Editor Pro — Demo",
          font: "Inter",
          size: 42,
          color: "#ffffff",
          x: 50,
          y: 22,
          anim: "fadeIn",
          animDur: 0.5,
          demo: true
        });
        Editor.project.subtitles.push({
          id: uid("sub"),
          trackId: "st0",
          start: 0.5,
          end: 4,
          text: "Demo subtitle — local generated video",
          demo: true
        });
        Editor.addClip({
          id: uid("clip"),
          type: "sub",
          track: "sub",
          start: 0.5,
          duration: 3.5,
          text: "Demo subtitle — local generated video",
          demo: true
        });
        if (vclip) {
          vclip.transition = "fade";
          vclip.filter = "cinematic";
        }
        Subtitles.renderList();
        Timeline.render();
        UI.toast("Demo project loaded (generated locally)");
      } catch (e) {
        console.warn("Demo skipped", e);
      }
      UI.loading(false);
    },

    makeDemoVideo() {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d");
        const fps = 30;
        const seconds = 6;
        let frame = 0;
        const stream = canvas.captureStream(fps);
        let rec;
        try {
          rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
        } catch (_) {
          try {
            rec = new MediaRecorder(stream, { mimeType: "video/webm" });
          } catch (e) {
            reject(e);
            return;
          }
        }
        const chunks = [];
        rec.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        rec.onerror = () => reject(new Error("recorder"));
        rec.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
        rec.start();
        const colors = ["#6c8cff", "#22d3ee", "#a78bfa", "#34d399", "#f59e0b"];
        const draw = () => {
          const t = frame / fps;
          ctx.fillStyle = "#0b1020";
          ctx.fillRect(0, 0, 1280, 720);
          colors.forEach((col, i) => {
            ctx.fillStyle = col;
            ctx.fillRect(i * 256, 0, 256, 720);
          });
          ctx.fillStyle = "rgba(0,0,0,.35)";
          ctx.fillRect(0, 280, 1280, 160);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 48px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("DEMO  ·  AI Video Editor Pro", 640, 360);
          ctx.font = "22px Inter, sans-serif";
          ctx.fillText("Generated in your browser  ·  " + t.toFixed(2) + "s", 640, 400);
          frame++;
          if (frame <= seconds * fps) requestAnimationFrame(draw);
          else setTimeout(() => rec.stop(), 80);
        };
        draw();
      });
    }
  };

  global.Player = Player;
  global.Overlay = Overlay;
  global.VideoEditor = VideoEditor;
  global.Props = Props;
  global.Demo = Demo;
})(window);
