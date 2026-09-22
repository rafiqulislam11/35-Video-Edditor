/**
 * Upload, preview player, trim, crop, rotate, resize, playback engine.
 * Class A: HTML5 video + canvas overlay.
 */
(function (global) {
  "use strict";

  const ACCEPT = /\.(mp4|webm|mov|avi|mkv|m4v|ogv)$/i;
  const MIME_OK = /^video\//;

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
      document.getElementById("btn-play").textContent = "⏸";
      this.tick();
      this.video.play().catch(() => {});
    },

    pause() {
      Editor.playing = false;
      document.getElementById("btn-play").textContent = "▶";
      this.video.pause();
      cancelAnimationFrame(this.raf);
    },

    tick() {
      if (!Editor.playing) return;
      this.sync();
      Overlay.draw();
      this.raf = requestAnimationFrame(() => this.tick());
    },

    onTime() {
      const clip = this.activeVideoClip();
      if (clip && this.video === document.getElementById("preview-video")) {
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
          c.type === "video" &&
          !this.trackMuted(c.track) &&
          Editor.playhead >= c.start &&
          Editor.playhead < c.start + c.duration
      );
    },

    clipAt(t) {
      return Editor.project.clips
        .filter((c) => c.type === "video" && t >= c.start && t < c.start + c.duration)
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
      this.updateChrome();
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
    }
  };

  const Overlay = {
    canvas: null,
    ctx: null,
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
      Editor.project.clips.forEach((c) => {
        if (t < c.start || t >= c.start + c.duration) return;
        const tr = Editor.tracks.find((x) => x.id === c.track);
        if (tr && tr.hidden) return;
        if (c.type === "text") this.drawText(c, t);
        if (c.type === "element") this.drawElement(c);
        if (c.type === "fx") this.drawFx(c);
      });
      Subtitles.draw(ctx, w, h, t);
      if (Editor.brand.watermark) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = Editor.brand.primary;
        ctx.font = "12px Inter";
        ctx.fillText(Editor.project.name, w - 160, h - 16);
        ctx.globalAlpha = 1;
      }
    },
    drawText(c, t) {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const local = t - c.start;
      const anim = c.anim || "none";
      const ad = c.animDur || 0.6;
      let alpha = (c.opacity == null ? 1 : c.opacity);
      let ox = 0, oy = 0, scale = 1;
      const k = Math.min(1, local / ad);
      if (anim === "fadeIn") alpha *= k;
      if (anim === "fadeOut") alpha *= 1 - Math.min(1, Math.max(0, (c.duration - local) / ad));
      if (anim === "slideLeft") ox = (1 - k) * 40;
      if (anim === "slideRight") ox = (k - 1) * 40;
      if (anim === "slideUp") oy = (1 - k) * 30;
      if (anim === "slideDown") oy = (k - 1) * 30;
      if (anim === "zoomIn") scale = 0.7 + 0.3 * k;
      if (anim === "zoomOut") scale = 1.2 - 0.2 * k;
      if (anim === "pop") scale = k < 1 ? 0.6 + 0.4 * k : 1;
      let text = c.text || "";
      if (anim === "typewriter") {
        const n = Math.floor(k * text.length);
        text = text.slice(0, n);
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(w * ((c.x || 50) / 100) + ox, h * ((c.y || 80) / 100) + oy);
      ctx.scale(scale, scale);
      ctx.font = `${c.italic ? "italic " : ""}${c.bold ? "700 " : "600 "}${c.size || 48}px ${c.font || "Inter"}`;
      ctx.textAlign = c.align || "center";
      ctx.textBaseline = "middle";
      if (c.bgOn) {
        const m = ctx.measureText(text);
        ctx.fillStyle = c.bg || "#000";
        ctx.fillRect(-m.width / 2 - 8, -(c.size || 48) / 2 - 4, m.width + 16, (c.size || 48) + 8);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = c.border || "#000";
      ctx.shadowColor = c.shadow || "#000";
      ctx.shadowBlur = 8;
      ctx.fillStyle = c.color || "#fff";
      if (c.underline) {
        const m = ctx.measureText(text);
        ctx.fillText(text, 0, 0);
        ctx.fillRect(-m.width / 2, (c.size || 48) / 2, m.width, 2);
      } else {
        ctx.strokeText(text, 0, 0);
        ctx.fillText(text, 0, 0);
      }
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
          const last = Editor.project.clips.filter((c) => c.type === "video").reduce((m, c) => Math.max(m, c.start + c.duration), 0);
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
          if (!Editor.project.clips.some((c) => c.type === "video")) {
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

    renderMediaCard(rec) {
      const list = document.getElementById("media-list");
      const card = document.createElement("article");
      card.className = "media-card";
      card.tabIndex = 0;
      card.draggable = true;
      card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-aive-media", rec.id); e.dataTransfer.effectAllowed = "copy"; });
      const thumb = document.createElement("video");
      thumb.src = rec.url;
      thumb.muted = true;
      thumb.preload = "metadata";
      const meta = document.createElement("div");
      meta.className = "meta";
      const i = rec.info;
      meta.innerHTML = `<strong title="${i.name}">${i.name}</strong>
        ${formatTime(i.duration)} · ${i.width}×${i.height}<br/>
        ${formatBytes(i.size)} · ${(i.type.split("/")[1] || "video").toUpperCase()}`;
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
