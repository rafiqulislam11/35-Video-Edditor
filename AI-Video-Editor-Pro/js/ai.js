/**
 * AI assistant (local command mapping + optional API).
 * Silence / scene heuristics run in-browser (Class A).
 * Speech-to-text, translation, highlight ranking: Class C.
 */
(function (global) {
  "use strict";

  const AIStudio = {
    pendingCuts: [],

    init() {
      document.querySelectorAll("[data-ai-cmd]").forEach((b) => {
        b.addEventListener("click", () => {
          document.getElementById("ai-prompt").value = b.dataset.aiCmd;
          this.runPrompt();
        });
      });
    },

    log(msg) {
      const el = document.getElementById("ai-log");
      el.textContent += msg + "\n";
      el.scrollTop = el.scrollHeight;
    },

    needApi(kind) {
      const url = AIVE_CONFIG.ai[kind];
      if (url) return url;
      UI.toast(UI.t("aiMissing"), "err");
      this.log("Integration required (" + kind + "). Set the URL in Settings. Files are not uploaded unless you confirm an API call.");
      return null;
    },

    async post(url, payload) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("AI HTTP " + res.status);
      return res.json();
    },

    runPrompt() {
      const q = (document.getElementById("ai-prompt").value || "").trim().toLowerCase();
      this.log("> " + q);
      if (/silent|silence/.test(q)) return this.detectSilence();
      if (/subtitle|caption/.test(q) && /translat|bangla|bengali/.test(q)) {
        document.getElementById("tr-to").value = "bn";
        return this.translate();
      }
      if (/subtitle|caption/.test(q)) return this.autoSubtitles();
      if (/bright/.test(q)) {
        const c = Editor.selected() || Editor.project.clips.find((x) => x.type === "video");
        if (c) {
          c.adjustments = c.adjustments || EffectsStudio.defaultAdjust();
          c.adjustments.brightness = 130;
          Player.sync();
          this.log("Raised brightness on the selected/first video clip (local).");
        }
        return;
      }
      if (/cinematic/.test(q)) {
        const c = Editor.project.clips.find((x) => x.type === "video");
        if (c) {
          c.filter = "cinematic";
          Player.sync();
          this.log("Applied cinematic filter (local).");
        }
        return;
      }
      if (/short|tiktok|reel|vertical/.test(q)) {
        document.getElementById("custom-w").value = 1080;
        document.getElementById("custom-h").value = 1920;
        VideoEditor.applyResize();
        this.log("Set vertical 1080×1920 canvas. Smart crop is preview-only until export.");
        return;
      }
      if (/highlight|30/.test(q)) return this.highlight();
      if (/noise/.test(q)) {
        this.log("Background-noise removal is Class C/D (audio enhancement model or FFmpeg afftdn). Not applied locally.");
        return this.needApi("assistantUrl");
      }
      if (/promo|promotional/.test(q)) {
        EffectsStudio.useTemplate("Promotional");
        this.log("Applied promotional template locally.");
        return;
      }
      this.log("No local mapping. Connect assistantUrl for free-form LLM editing plans.");
      this.needApi("assistantUrl");
    },

    async autoSubtitles() {
      const url = this.needApi("speechToTextUrl");
      if (!url) return;
      const clip = Editor.project.clips.find((c) => c.type === "video");
      if (!clip) {
        UI.toast("Upload a video first", "err");
        return;
      }
      UI.loading(true, "Sending audio to speech-to-text (external)…", 30);
      try {
        const media = Editor.media.get(clip.sourceId);
        const dataUrl = await this.blobToDataUrl(media.blob.slice(0, 1024 * 1024));
        const lang = document.getElementById("stt-lang").value;
        const json = await this.post(url, {
          language: lang,
          filename: media.info.name,
          note: "Replace this stub with audio upload on your backend. Do not put API secrets in the frontend."
        });
        if (json.cues) {
          json.cues.forEach((c) => Subtitles.add(c.text, c.start, c.end));
        } else {
          this.log("API responded without cues. Expected { cues: [{start,end,text}] }");
        }
      } catch (e) {
        UI.toast("Speech-to-text failed. Check the endpoint.", "err");
      }
      UI.loading(false);
    },

    async translate() {
      const url = this.needApi("translateUrl");
      if (!url) return;
      const from = document.getElementById("tr-from").value;
      const to = document.getElementById("tr-to").value;
      UI.loading(true, "Translating subtitles (external)…", 40);
      try {
        const cues = Editor.project.subtitles.map((s) => ({ id: s.id, text: s.text, start: s.start, end: s.end }));
        const json = await this.post(url, { from, to, cues });
        if (json.cues) {
          json.cues.forEach((c) => {
            const s = Editor.project.subtitles.find((x) => x.id === c.id);
            if (s) s.text = c.text;
          });
          Subtitles.renderList();
          UI.toast("Translated (timestamps unchanged)");
        }
      } catch (e) {
        UI.toast("Translation API failed", "err");
      }
      UI.loading(false);
    },

    async detectSilence() {
      const clip = Editor.project.clips.find((c) => c.type === "video");
      if (!clip) {
        UI.toast("Need a video clip", "err");
        return;
      }
      UI.loading(true, "Analyzing audio locally…", 20);
      try {
        const media = Editor.media.get(clip.sourceId);
        const ranges = await this.silenceRanges(media.url);
        this.pendingCuts = ranges;
        this.showDetectModal("Silent sections (local energy analysis)", ranges, () => this.applyRemoves(clip, ranges));
      } catch (e) {
        UI.toast("Could not decode audio in this browser.", "err");
      }
      UI.loading(false);
    },

    async silenceRanges(url) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const audio = await ctx.decodeAudioData(buf.slice(0));
      const ch = audio.getChannelData(0);
      const sr = audio.sampleRate;
      const win = Math.floor(sr * 0.2);
      const ranges = [];
      let silentStart = null;
      for (let i = 0; i < ch.length; i += win) {
        let sum = 0;
        const end = Math.min(ch.length, i + win);
        for (let j = i; j < end; j++) sum += Math.abs(ch[j]);
        const rms = sum / (end - i);
        const t = i / sr;
        if (rms < 0.01) {
          if (silentStart == null) silentStart = t;
        } else if (silentStart != null) {
          if (t - silentStart > 0.35) ranges.push({ start: silentStart, end: t });
          silentStart = null;
        }
      }
      ctx.close();
      return ranges;
    },

    async detectScenes() {
      const clip = Editor.project.clips.find((c) => c.type === "video");
      if (!clip) return;
      UI.loading(true, "Scanning frames locally…", 20);
      const media = Editor.media.get(clip.sourceId);
      const v = document.createElement("video");
      v.src = media.url;
      v.muted = true;
      await new Promise((r) => {
        v.onloadeddata = r;
      });
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 36;
      const ctx = c.getContext("2d");
      const cuts = [];
      let prev = null;
      for (let t = 0; t < v.duration; t += 0.5) {
        v.currentTime = t;
        await new Promise((r) => {
          v.onseeked = r;
        });
        ctx.drawImage(v, 0, 0, 64, 36);
        const data = ctx.getImageData(0, 0, 64, 36).data;
        let mean = 0;
        for (let i = 0; i < data.length; i += 4) mean += data[i] + data[i + 1] + data[i + 2];
        mean /= data.length / 4 * 3;
        if (prev != null && Math.abs(mean - prev) > 28) cuts.push({ start: t, end: Math.min(v.duration, t + 0.5) });
        prev = mean;
      }
      this.showDetectModal("Scene change markers (histogram heuristic)", cuts, () => {
        cuts.forEach((s) => {
          Editor.addClip({
            id: uid("clip"),
            type: "fx",
            track: "fx",
            start: s.start,
            duration: 0.2,
            effect: "flash",
            intensity: 40
          });
        });
      });
      UI.loading(false);
    },

    autoCut() {
      this.detectSilence();
    },

    applyRemoves(clip, ranges) {
      if (!ranges.length) {
        UI.toast("Nothing to remove");
        return;
      }
      History.push();
      const in0 = clip.inPoint || 0;
      const out0 = clip.outPoint || in0 + clip.duration;
      const sil = ranges
        .map((r) => ({ start: Math.max(in0, r.start), end: Math.min(out0, r.end) }))
        .filter((r) => r.end - r.start > 0.2)
        .sort((a, b) => a.start - b.start);
      const pieces = [];
      let cursor = in0;
      sil.forEach((r) => {
        if (r.start > cursor + 0.05) pieces.push({ in: cursor, out: r.start });
        cursor = Math.max(cursor, r.end);
      });
      if (out0 - cursor > 0.05) pieces.push({ in: cursor, out: out0 });
      if (!pieces.length) {
        UI.toast("Silence covers the whole clip — cancelled to protect media", "err");
        return;
      }
      clip.inPoint = pieces[0].in;
      clip.outPoint = pieces[0].out;
      clip.duration = (clip.outPoint - clip.inPoint) / (clip.speed || 1);
      let start = clip.start;
      pieces.slice(1).forEach((p) => {
        start += clip.duration;
        const n = {
          ...clip,
          id: uid("clip"),
          inPoint: p.in,
          outPoint: p.out,
          start,
          duration: (p.out - p.in) / (clip.speed || 1)
        };
        Editor.project.clips.push(n);
        clip = n;
      });
      Timeline.render();
      UI.toast("Silence removed on the timeline. Original file kept.");
    },

    showDetectModal(title, ranges, onApply) {
      const body = document.createElement("div");
      if (!ranges.length) body.innerHTML = "<p>No sections detected.</p>";
      else {
        body.innerHTML =
          "<p class='hint'>Original media is not modified until you Apply.</p><ul>" +
          ranges
            .slice(0, 20)
            .map((r) => `<li>${formatTime(r.start)} – ${formatTime(r.end)}</li>`)
            .join("") +
          "</ul>";
      }
      UI.modal({
        title,
        body,
        actions: [
          { label: "Cancel" },
          {
            label: "Preview first",
            onClick: () => {
              if (ranges[0]) Player.seekTimeline(ranges[0].start);
            }
          },
          { label: "Apply", className: "primary", onClick: onApply }
        ]
      });
    },

    highlight() {
      const len = Number(document.getElementById("highlight-len").value) || 30;
      const url = AIVE_CONFIG.ai.highlightUrl;
      if (!url) {
        const clip = Editor.project.clips.find((c) => c.type === "video");
        if (!clip) return;
        History.push();
        const dur = Math.min(len, clip.duration);
        clip.inPoint = clip.inPoint || 0;
        clip.outPoint = (clip.inPoint || 0) + dur;
        clip.duration = dur / (clip.speed || 1);
        Timeline.render();
        this.log("Local heuristic: kept the first " + len + "s. Cloud ranking requires highlightUrl.");
        UI.toast("Highlight length applied locally (first " + len + "s)");
        return;
      }
      this.needApi("highlightUrl");
    },

    captureThumb() {
      const v = document.getElementById("preview-video");
      const c = document.getElementById("thumb-canvas");
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, c.width, c.height);
      try {
        ctx.drawImage(v, 0, 0, c.width, c.height);
      } catch (e) {
        UI.toast("Cannot capture this frame (CORS / empty).", "err");
      }
      ctx.fillStyle = "#fff";
      ctx.font = "bold 28px Inter";
      ctx.fillText(Editor.project.name, 24, 40);
      UI.toast("Frame captured");
    },

    downloadThumb() {
      const c = document.getElementById("thumb-canvas");
      c.toBlob((b) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "thumbnail.png";
        a.click();
      });
    },

    thumbAI() {
      this.needApi("thumbnailUrl");
    },

    blobToDataUrl(blob) {
      return new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(blob);
      });
    }
  };

  global.AIStudio = AIStudio;
})(window);
