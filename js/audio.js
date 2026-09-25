/**
 * Audio: volume, fade, waveform, music library (generated tones), voice-over.
 * Extract audio is Class B (FFmpeg) with a WebM fallback via capture.
 */
(function (global) {
  "use strict";

  const GENRES = [
    "Corporate", "Cinematic", "Happy", "Emotional", "Motivational",
    "Travel", "Technology", "Fashion", "Business", "Ambient"
  ];

  const AudioStudio = {
    vo: { rec: null, chunks: [], blob: null, url: null, paused: false, stream: null },
    buffers: new Map(),

    init() {
      this.renderLibrary();
      document.getElementById("audio-volume").addEventListener("input", (e) => {
        document.getElementById("vol-label").textContent = e.target.value + "%";
        const c = Editor.selected();
        if (c && (c.type === "video" || c.type === "audio")) c.volume = Number(e.target.value) / 100;
        Player.sync();
      });
      document.getElementById("audio-mute").addEventListener("change", () => Player.sync());
      document.getElementById("clip-volume").addEventListener("input", (e) => {
        const c = Editor.selected();
        if (!c) return;
        c.volume = Number(e.target.value) / 100;
        document.getElementById("clip-vol-label").textContent = e.target.value + "%";
      });
      document.getElementById("fade-in").addEventListener("change", (e) => {
        const c = Editor.selected();
        if (c) c.fadeIn = Number(e.target.value) || 0;
      });
      document.getElementById("fade-out").addEventListener("change", (e) => {
        const c = Editor.selected();
        if (c) c.fadeOut = Number(e.target.value) || 0;
      });
      document.getElementById("replace-audio-input").addEventListener("change", (e) => {
        const f = e.target.files[0];
        if (f) this.addAudioFile(f, "a1");
      });
      this.drawWave();
    },

    renderLibrary() {
      const host = document.getElementById("music-library");
      host.innerHTML = "";
      GENRES.forEach((g, i) => {
        const el = document.createElement("div");
        el.className = "music-card";
        el.innerHTML = `<strong>${g}</strong><div class="hint">Demo tone</div>`;
        const row = document.createElement("div");
        row.className = "btn-row wrap";
        const prev = document.createElement("button");
        prev.className = "btn";
        prev.textContent = "Preview";
        prev.onclick = () => this.previewTone(i);
        const add = document.createElement("button");
        add.className = "btn primary";
        add.textContent = "Add";
        add.onclick = () => this.addTone(g, i);
        row.append(prev, add);
        el.appendChild(row);
        host.appendChild(el);
      });
    },

    toneSpec(i) {
      const roots = [196, 220, 262, 294, 330, 349, 392, 440, 494, 523];
      return { freq: roots[i % roots.length], wave: i % 2 ? "triangle" : "sine" };
    },

    previewTone(i) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const spec = this.toneSpec(i);
      osc.type = spec.wave;
      osc.frequency.value = spec.freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.5);
      setTimeout(() => { try { ctx.close(); } catch (_) {} }, 1600);
    },

    async addTone(genre, i) {
      const blob = await this.renderToneWav(i, 8);
      const file = new File([blob], genre.toLowerCase() + "-demo.wav", { type: "audio/wav" });
      await this.addAudioFile(file, "a2", genre + " (demo tone)");
    },

    renderToneWav(i, seconds) {
      const sr = 22050;
      const len = sr * seconds;
      const spec = this.toneSpec(i);
      const buf = new ArrayBuffer(44 + len * 2);
      const v = new DataView(buf);
      const w = (o, s) => {
        for (let n = 0; n < s.length; n++) v.setUint8(o + n, s.charCodeAt(n));
      };
      w(0, "RIFF");
      v.setUint32(4, 36 + len * 2, true);
      w(8, "WAVE");
      w(12, "fmt ");
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, sr, true);
      v.setUint32(28, sr * 2, true);
      v.setUint16(32, 2, true);
      v.setUint16(34, 16, true);
      w(36, "data");
      v.setUint32(40, len * 2, true);
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        const env = Math.min(1, t * 4) * Math.min(1, (seconds - t) * 4);
        const s = Math.sin(2 * Math.PI * spec.freq * t) * 0.2 * env;
        v.setInt16(44 + n * 2, s * 32767, true);
      }
      return new Blob([buf], { type: "audio/wav" });
    },

    async addAudioFile(file, track, label) {
      const id = uid("media");
      const url = URL.createObjectURL(file);
      const dur = await this.probeDuration(url);
      Editor.media.set(id, {
        id,
        blob: file,
        url,
        info: { name: label || file.name, size: file.size, type: file.type, duration: dur, width: 0, height: 0 }
      });
      Editor.addClip({
        id: uid("clip"),
        type: "audio",
        track: track || "a1",
        sourceId: id,
        start: Editor.playhead,
        inPoint: 0,
        outPoint: dur,
        duration: dur,
        volume: 0.8,
        fadeIn: Number(document.getElementById("fade-in").value) || 0,
        fadeOut: Number(document.getElementById("fade-out").value) || 0
      });
      this.drawWave();
      UI.toast("Audio added to timeline");
    },

    probeDuration(url) {
      return new Promise((resolve) => {
        const a = new Audio();
        a.src = url;
        a.onloadedmetadata = () => resolve(a.duration || 1);
        a.onerror = () => resolve(1);
      });
    },

    drawWave() {
      const canvas = document.getElementById("waveform");
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--panel") || "#1b1f2b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#6c8cff";
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const y = canvas.height / 2 + Math.sin(x / 8) * 12 * Math.sin(x / 40);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },

    async extract() {
      const c = Editor.project.clips.find((x) => x.type === "video");
      if (!c) {
        UI.toast("Upload a video first", "err");
        return;
      }
      const done = await ExportStudio.extractAudioFfmpeg(c);
      if (done) return;
      UI.toast("Class B: FFmpeg not loaded. Use Export → WebM, or load FFmpeg.wasm (see README).", "err");
    },

    async voStart() {
      try {
        this.vo.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.vo.chunks = [];
        this.vo.rec = new MediaRecorder(this.vo.stream);
        this.vo.rec.ondataavailable = (e) => {
          if (e.data.size) this.vo.chunks.push(e.data);
        };
        this.vo.rec.start();
        this.vo.paused = false;
        document.getElementById("vo-status").textContent = "Recording…";
      } catch (e) {
        UI.toast(UI.t("micDenied") + " Allow microphone in the browser site settings.", "err");
      }
    },
    voPause() {
      if (this.vo.rec && this.vo.rec.state === "recording") {
        this.vo.rec.pause();
        this.vo.paused = true;
        document.getElementById("vo-status").textContent = "Paused";
      }
    },
    voResume() {
      if (this.vo.rec && this.vo.rec.state === "paused") {
        this.vo.rec.resume();
        document.getElementById("vo-status").textContent = "Recording…";
      }
    },
    voStop() {
      if (!this.vo.rec) return;
      this.vo.rec.onstop = () => {
        this.vo.blob = new Blob(this.vo.chunks, { type: "audio/webm" });
        if (this.vo.url) URL.revokeObjectURL(this.vo.url);
        this.vo.url = URL.createObjectURL(this.vo.blob);
        document.getElementById("vo-status").textContent = "Recorded " + formatBytes(this.vo.blob.size);
        this.vo.stream.getTracks().forEach((t) => t.stop());
      };
      if (this.vo.rec.state !== "inactive") this.vo.rec.stop();
    },
    voPreview() {
      if (!this.vo.url) {
        UI.toast("Record first", "err");
        return;
      }
      new Audio(this.vo.url).play();
    },
    async voAdd() {
      if (!this.vo.blob) {
        UI.toast("Record first", "err");
        return;
      }
      const file = new File([this.vo.blob], "voiceover.webm", { type: "audio/webm" });
      await this.addAudioFile(file, "a1", "Voice-over");
    },
    voDelete() {
      this.vo.blob = null;
      if (this.vo.url) URL.revokeObjectURL(this.vo.url);
      this.vo.url = null;
      document.getElementById("vo-status").textContent = "Microphone idle";
    }
  };

  global.AudioStudio = AudioStudio;
})(window);
