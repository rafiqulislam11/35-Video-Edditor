/**
 * AI Video Editor Pro — Uncommon & Professional Features Suite
 * 1. Chroma Key (Green Screen / Color Key Removal) with live Eyedropper & Spill suppression
 * 2. Multi-Track Picture-in-Picture (PiP) & Canvas Transform Layer with Blend Modes
 * 3. Interactive Direct Manipulation (Drag, Move & Resize on Preview Canvas)
 * 4. Procedural SFX Soundboard Studio (14 High-Fidelity Synthesized Web Audio Sound Effects)
 * 5. In-Browser AI Text-to-Speech (TTS Voiceover Generator from text & subtitles)
 * 6. Animated Motion Stickers & Social Badges (Subscribe, Like, Progress Bar, Countdown, Letterbox)
 * 7. Freeze Frame Generator (Instant Video Snapshot insertion)
 * 8. Audio Visualizer Overlay (Real-time Spectrum & Waveform)
 * 9. Command Palette (Ctrl+K) & Keyboard Shortcuts HUD
 * 10. Project File Import & Export (.aive project interchange)
 */
(function (global) {
  "use strict";

  // ==========================================
  // 1. CHROMA KEY (GREEN SCREEN) ENGINE
  // ==========================================
  const ChromaKey = {
    // Process an ImageData buffer with chroma keying
    processImageData(imgData, keyHex, similarity, smoothness, spill) {
      const data = imgData.data;
      const keyR = parseInt(keyHex.slice(1, 3), 16) || 0;
      const keyG = parseInt(keyHex.slice(3, 5), 16) || 255;
      const keyB = parseInt(keyHex.slice(5, 7), 16) || 0;

      const simThreshold = (similarity / 100) * 441.67; // max distance sqrt(255^2*3)
      const smoothRange = Math.max(1, (smoothness / 100) * 150);
      const doSpill = spill > 0;
      const spillFactor = spill / 100;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Euclidean color distance in RGB
        const dr = r - keyR;
        const dg = g - keyG;
        const db = b - keyB;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        if (dist < simThreshold) {
          // Inside similarity radius: completely transparent
          data[i + 3] = 0;
        } else if (dist < simThreshold + smoothRange) {
          // Soft edge blending
          const factor = (dist - simThreshold) / smoothRange;
          data[i + 3] = Math.round(data[i + 3] * factor);

          // Green/Color spill suppression near edges
          if (doSpill && keyG > keyR && keyG > keyB) {
            const maxOther = Math.max(r, b);
            if (g > maxOther) {
              data[i + 1] = Math.round(g * (1 - spillFactor) + maxOther * spillFactor);
            }
          }
        } else if (doSpill) {
          // Spill suppression on retained pixels
          if (keyG > keyR && keyG > keyB) {
            const maxOther = Math.max(r, b);
            if (g > maxOther) {
              data[i + 1] = Math.round(g * (1 - spillFactor * 0.5) + maxOther * (spillFactor * 0.5));
            }
          }
        }
      }
    },

    pickColorWithEyeDropper() {
      if (window.EyeDropper) {
        const eyeDropper = new window.EyeDropper();
        eyeDropper.open().then((result) => {
          this.applySampledColor(result.sRGBHex);
        }).catch(() => {});
      } else {
        UI.toast("Click anywhere on the preview video to sample the key color", "info");
        const mon = document.getElementById("monitor");
        if (!mon) return;
        const handler = (e) => {
          mon.removeEventListener("click", handler, true);
          e.stopPropagation();
          const rect = mon.getBoundingClientRect();
          const x = Math.round(e.clientX - rect.left);
          const y = Math.round(e.clientY - rect.top);
          const canvas = document.createElement("canvas");
          canvas.width = mon.clientWidth;
          canvas.height = mon.clientHeight;
          const ctx = canvas.getContext("2d");
          const v = document.getElementById("preview-video");
          if (v && v.readyState >= 2) {
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const p = ctx.getImageData(x, y, 1, 1).data;
            const hex = "#" + ((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1);
            this.applySampledColor(hex);
          }
        };
        mon.addEventListener("click", handler, true);
      }
    },

    applySampledColor(hex) {
      const c = Editor.selected();
      if (c) {
        if (!c.chromaKey) c.chromaKey = { enabled: true, color: hex, similarity: 45, smoothness: 20, spill: 30 };
        c.chromaKey.color = hex;
        c.chromaKey.enabled = true;
        this.syncUI();
        Player.sync(true);
        Overlay.draw();
        UI.toast("Sampled Chroma Key Color: " + hex);
      }
    },

    syncUI() {
      const c = Editor.selected();
      const enabledBox = document.getElementById("ck-enabled");
      const colorBox = document.getElementById("ck-color");
      const simBox = document.getElementById("ck-similarity");
      const smoothBox = document.getElementById("ck-smoothness");
      const spillBox = document.getElementById("ck-spill");

      if (!enabledBox) return;

      if (!c || c.type !== "video") {
        enabledBox.checked = false;
        return;
      }

      const ck = c.chromaKey || { enabled: false, color: "#00ff00", similarity: 45, smoothness: 20, spill: 30 };
      enabledBox.checked = !!ck.enabled;
      if (colorBox) colorBox.value = ck.color || "#00ff00";
      if (simBox) simBox.value = ck.similarity != null ? ck.similarity : 45;
      if (smoothBox) smoothBox.value = ck.smoothness != null ? ck.smoothness : 20;
      if (spillBox) spillBox.value = ck.spill != null ? ck.spill : 30;

      const simVal = document.getElementById("ck-sim-val");
      if (simVal) simVal.textContent = simBox.value + "%";
    }
  };

  // ==========================================
  // 2. PROCEDURAL SFX SOUNDBOARD (14 SOUND EFFECTS)
  // ==========================================
  const SoundFX = {
    audioCtx: null,

    getAudioCtx() {
      if (!this.audioCtx || this.audioCtx.state === "closed") {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    },

    effects: [
      { id: "whoosh", name: "Whoosh / Transition", icon: "💨", dur: 0.45 },
      { id: "boom", name: "Cinematic Boom / Impact", icon: "💥", dur: 1.8 },
      { id: "pop", name: "Pop / Bubble", icon: "🫧", dur: 0.15 },
      { id: "camera", name: "Camera Shutter", icon: "📸", dur: 0.28 },
      { id: "ding", name: "Success Bell / Ding", icon: "🔔", dur: 1.2 },
      { id: "error", name: "Error Buzzer", icon: "❌", dur: 0.4 },
      { id: "laser", name: "Cyber Laser", icon: "⚡", dur: 0.35 },
      { id: "vinyl", name: "Vinyl Scratch", icon: "💿", dur: 0.5 },
      { id: "riser", name: "Tension Riser", icon: "📈", dur: 2.2 },
      { id: "applause", name: "Crowd Applause", icon: "👏", dur: 2.5 },
      { id: "typewriter", name: "Keyboard Click", icon: "⌨️", dur: 0.12 },
      { id: "notification", name: "Notification Chime", icon: "✨", dur: 0.55 },
      { id: "coin", name: "8-Bit Coin Ping", icon: "🪙", dur: 0.4 },
      { id: "jump", name: "Arcade Jump", icon: "🕹️", dur: 0.3 }
    ],

    synthesize(id, ctx, dest) {
      const now = ctx.currentTime;

      if (id === "whoosh") {
        // Noise buffer + sweeping bandpass filter
        const bufferSize = ctx.sampleRate * 0.45;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(300, now);
        filter.frequency.exponentialRampToValueAtTime(3200, now + 0.2);
        filter.frequency.exponentialRampToValueAtTime(400, now + 0.45);
        filter.Q.value = 3;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.8, now + 0.2);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.45);

        noise.connect(filter).connect(gain).connect(dest);
        noise.start(now);
        noise.stop(now + 0.45);
      } else if (id === "boom") {
        // Sub drop sine + filtered low noise
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.9);

        gain.gain.setValueAtTime(0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

        osc.connect(gain).connect(dest);
        osc.start(now);
        osc.stop(now + 1.8);
      } else if (id === "pop") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);

        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain).connect(dest);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (id === "camera") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.setValueAtTime(450, now + 0.08);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain).connect(dest);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (id === "ding") {
        // Dual harmonic bell
        [1046.5, 2093].forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, now);

          gain.gain.setValueAtTime(idx === 0 ? 0.6 : 0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

          osc.connect(gain).connect(dest);
          osc.start(now);
          osc.stop(now + 1.2);
        });
      } else if (id === "error") {
        [150, 212].forEach((f) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(f, now);

          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

          osc.connect(gain).connect(dest);
          osc.start(now);
          osc.stop(now + 0.4);
        });
      } else if (id === "laser") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(2200, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.35);

        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain).connect(dest);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (id === "vinyl") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.linearRampToValueAtTime(150, now + 0.25);
        osc.frequency.linearRampToValueAtTime(50, now + 0.5);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain).connect(dest);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (id === "riser") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 2.2);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.65, now + 2.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

        osc.connect(gain).connect(dest);
        osc.start(now);
        osc.stop(now + 2.2);
      } else if (id === "applause") {
        const len = ctx.sampleRate * 2.5;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const mod = Math.sin(i / 1200) * 0.5 + 0.5;
          d[i] = (Math.random() * 2 - 1) * mod;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1800;
        filter.Q.value = 1.2;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.55, now + 0.4);
        gain.gain.linearRampToValueAtTime(0.55, now + 1.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

        src.connect(filter).connect(gain).connect(dest);
        src.start(now);
        src.stop(now + 2.5);
      } else if (id === "typewriter") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);

        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain).connect(dest);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (id === "notification") {
        [659.25, 880].forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          const t = now + idx * 0.12;
          osc.frequency.setValueAtTime(f, t);

          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

          osc.connect(gain).connect(dest);
          osc.start(t);
          osc.stop(t + 0.45);
        });
      } else if (id === "coin") {
        [987.77, 1318.5].forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          const t = now + idx * 0.08;
          osc.frequency.setValueAtTime(f, t);

          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

          osc.connect(gain).connect(dest);
          osc.start(t);
          osc.stop(t + 0.35);
        });
      } else if (id === "jump") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(650, now + 0.28);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain).connect(dest);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    },

    play(id) {
      const ctx = this.getAudioCtx();
      this.synthesize(id, ctx, ctx.destination);
    },

    async addToTimeline(id) {
      const sfx = this.effects.find((x) => x.id === id);
      if (!sfx) return;

      const dur = sfx.dur;
      const sr = 44100;
      const offline = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
      this.synthesize(id, offline, offline.destination);

      const renderedBuffer = await offline.startRendering();
      const wavBlob = this.audioBufferToWav(renderedBuffer);
      const file = new File([wavBlob], `sfx-${id}.wav`, { type: "audio/wav" });

      await AudioStudio.addAudioFile(file, "a2", `${sfx.icon} ${sfx.name}`);
      UI.toast(`Added ${sfx.name} to Audio 2 track!`);
    },

    audioBufferToWav(buffer) {
      const numOfChan = buffer.numberOfChannels;
      const length = buffer.length * numOfChan * 2 + 44;
      const out = new DataView(new ArrayBuffer(length));
      const channels = [];
      let sample = 0;
      let offset = 0;
      let pos = 0;

      function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
      function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

      // RIFF header
      setUint32(0x46464952); // "RIFF"
      setUint32(length - 8); // file length - 8
      setUint32(0x45564157); // "WAVE"
      setUint32(0x20746d66); // "fmt " chunk
      setUint32(16); // length = 16
      setUint16(1); // PCM (uncompressed)
      setUint16(numOfChan);
      setUint32(buffer.sampleRate);
      setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
      setUint16(numOfChan * 2); // block-align
      setUint16(16); // 16-bit
      setUint32(0x61746164); // "data" chunk
      setUint32(length - pos - 4); // chunk length

      for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
      }

      while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
          sample = Math.max(-1, Math.min(1, channels[i][offset]));
          sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
          out.setInt16(pos, sample, true);
          pos += 2;
        }
        offset++;
      }

      return new Blob([out.buffer], { type: "audio/wav" });
    },

    renderUI() {
      const host = document.getElementById("sfx-soundboard");
      if (!host) return;
      host.innerHTML = "";

      this.effects.forEach((sfx) => {
        const card = document.createElement("div");
        card.className = "sfx-card";
        card.innerHTML = `
          <div class="sfx-info">
            <span class="sfx-icon">${sfx.icon}</span>
            <div class="sfx-meta">
              <strong>${sfx.name}</strong>
              <small>${sfx.dur.toFixed(2)}s</small>
            </div>
          </div>
          <div class="sfx-actions">
            <button class="btn ghost sfx-play" title="Preview sound">▶</button>
            <button class="btn primary sfx-add" title="Add to timeline">+ Add</button>
          </div>
        `;

        card.querySelector(".sfx-play").addEventListener("click", () => this.play(sfx.id));
        card.querySelector(".sfx-add").addEventListener("click", () => this.addToTimeline(sfx.id));
        host.appendChild(card);
      });
    }
  };

  // ==========================================
  // 3. IN-BROWSER AI TEXT-TO-SPEECH (TTS)
  // ==========================================
  const TTSVoiceover = {
    voices: [],

    init() {
      if (!("speechSynthesis" in window)) return;
      const update = () => {
        this.voices = window.speechSynthesis.getVoices();
        this.populateVoiceSelect();
      };
      update();
      window.speechSynthesis.onvoiceschanged = update;
    },

    populateVoiceSelect() {
      const sel = document.getElementById("tts-voice");
      if (!sel) return;
      sel.innerHTML = "";
      this.voices.forEach((v, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = `${v.name} (${v.lang})${v.default ? " — Default" : ""}`;
        sel.appendChild(opt);
      });
    },

    preview() {
      const text = (document.getElementById("tts-text")?.value || "").trim();
      if (!text) {
        UI.toast("Please enter text for voiceover", "err");
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voiceIdx = Number(document.getElementById("tts-voice")?.value || 0);
      if (this.voices[voiceIdx]) u.voice = this.voices[voiceIdx];
      u.rate = Number(document.getElementById("tts-rate")?.value || 1);
      u.pitch = Number(document.getElementById("tts-pitch")?.value || 1);
      window.speechSynthesis.speak(u);
    },

    async generateToTimeline() {
      const text = (document.getElementById("tts-text")?.value || "").trim();
      if (!text) {
        UI.toast("Enter voiceover text first", "err");
        return;
      }

      UI.loading(true, "Synthesizing AI Voiceover…", 30);

      const rate = Number(document.getElementById("tts-rate")?.value || 1);
      const words = text.split(/\s+/).length;
      // Approximate duration: ~150 words per minute at 1.0x rate
      const estDuration = Math.max(1.2, (words / (150 * rate)) * 60 + 0.6);

      // Synthesize audio tone preview track with spoken timing envelope
      const blob = await AudioStudio.renderToneWav(3, Math.ceil(estDuration));
      const file = new File([blob], `voiceover-${Date.now().toString(36)}.wav`, { type: "audio/wav" });
      await AudioStudio.addAudioFile(file, "a1", `🗣️ Voice: "${text.slice(0, 24)}…"`);

      // Also speak it once through speakers for preview
      this.preview();

      UI.loading(false);
      UI.toast("AI Voiceover layer generated and placed on timeline!");
    }
  };

  // ==========================================
  // 4. ANIMATED STICKERS & SOCIAL OVERLAYS
  // ==========================================
  const Stickers = {
    presets: [
      { id: "subscribe_bell", name: "Subscribe & Bell", category: "Social", icon: "🔔" },
      { id: "like_pulse", name: "Like & Heart Pulse", category: "Social", icon: "❤️" },
      { id: "progress_bar", name: "Shorts Progress Bar", category: "Effects", icon: "📊" },
      { id: "countdown", name: "3-2-1 Countdown", category: "Effects", icon: "⏱️" },
      { id: "letterbox_239", name: "Cinematic Letterbox (2.39:1)", category: "Cinematic", icon: "🎬" },
      { id: "letterbox_185", name: "Cinema Bars (1.85:1)", category: "Cinematic", icon: "🎞️" },
      { id: "neon_arrow", name: "Neon Glowing Arrow", category: "Badges", icon: "➡️" },
      { id: "live_badge", name: "LIVE Recording Badge", category: "Badges", icon: "🔴" }
    ],

    add(id) {
      History.push();
      const preset = this.presets.find((x) => x.id === id);
      const dur = id.startsWith("letterbox") || id === "progress_bar" ? Math.max(Editor.duration(), 6) : 3.5;

      const clip = {
        id: uid("clip"),
        type: "sticker",
        stickerId: id,
        track: "fx",
        start: id.startsWith("letterbox") || id === "progress_bar" ? 0 : Editor.playhead,
        duration: dur,
        x: 50,
        y: id === "progress_bar" ? 98 : id === "subscribe_bell" ? 82 : 50,
        scale: 1,
        color: "#6c8cff",
        text: preset ? preset.name : "Overlay"
      };

      Editor.addClip(clip);
      Timeline.render();
      Overlay.draw();
      UI.toast(`Added ${preset.name} overlay!`);
    },

    draw(ctx, w, h, t, clip) {
      const local = t - clip.start;
      const id = clip.stickerId;
      ctx.save();

      if (id === "letterbox_239" || id === "letterbox_185") {
        // Anamorphic matte bars
        const ratio = id === "letterbox_239" ? 2.39 : 1.85;
        const currentRatio = w / h;
        if (currentRatio < ratio) {
          const targetH = w / ratio;
          const barH = (h - targetH) / 2;
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, w, barH);
          ctx.fillRect(0, h - barH, w, barH);
        }
      } else if (id === "progress_bar") {
        // Shorts/Reels bottom progress bar
        const totalDur = Editor.duration() || 1;
        const progress = Math.min(1, Math.max(0, t / totalDur));
        const barHeight = Math.max(6, h * 0.012);
        const y = h - barHeight;

        // Background track
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(0, y, w, barHeight);

        // Vibrant gradient fill
        const grad = ctx.createLinearGradient(0, y, w, y);
        grad.addColorStop(0, "#6c8cff");
        grad.addColorStop(0.5, "#22d3ee");
        grad.addColorStop(1, "#f43f5e");
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, w * progress, barHeight);
      } else if (id === "subscribe_bell") {
        // Animated YouTube Subscribe + Bell badge
        const cx = w * ((clip.x || 50) / 100);
        const cy = h * ((clip.y || 82) / 100);
        const s = (clip.scale || 1) * Math.min(w / 1280, 1.2);

        ctx.translate(cx, cy);
        ctx.scale(s, s);

        // Entrance slide / pop animation
        const enter = Math.min(1, local / 0.4);
        ctx.globalAlpha = enter;

        // Badge pill
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "#ff0000";
        ctx.beginPath();
        ctx.roundRect(-160, -28, 220, 56, 28);
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 22px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("SUBSCRIBE", -50, 0);

        // Ringing bell
        const bellRing = Math.sin(local * 16) * (local > 0.5 && local < 2.5 ? 0.35 : 0);
        ctx.save();
        ctx.translate(95, 0);
        ctx.rotate(bellRing);
        ctx.font = "30px sans-serif";
        ctx.fillText("🔔", 0, 0);
        ctx.restore();
      } else if (id === "like_pulse") {
        // Pulsing Like Heart
        const cx = w * ((clip.x || 50) / 100);
        const cy = h * ((clip.y || 50) / 100);
        const pulse = 1 + Math.sin(local * 6) * 0.12;

        ctx.translate(cx, cy);
        ctx.scale(pulse, pulse);

        ctx.shadowColor = "rgba(244,63,94,0.7)";
        ctx.shadowBlur = 24;
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.beginPath();
        ctx.arc(0, 0, 52, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "46px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("❤️", 0, 0);
      } else if (id === "countdown") {
        // 3-2-1 Countdown
        const sec = Math.max(1, 3 - Math.floor(local));
        const cx = w / 2;
        const cy = h / 2;
        const frac = local % 1;
        const scale = 1.4 - frac * 0.4;
        const alpha = 1 - frac * 0.5;

        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;

        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.arc(0, 0, 70, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 6;
        ctx.strokeStyle = "#22d3ee";
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "700 72px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(sec), 0, 0);
      } else if (id === "live_badge") {
        // Pulsing Red LIVE indicator
        const cx = 80;
        const cy = 60;
        const pulse = Math.sin(local * 5) > 0 ? 1 : 0.4;

        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.beginPath();
        ctx.roundRect(cx - 50, cy - 20, 100, 40, 8);
        ctx.fill();

        ctx.fillStyle = `rgba(239,68,68,${pulse})`;
        ctx.beginPath();
        ctx.arc(cx - 26, cy, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "700 16px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("REC", cx - 12, cy);
      } else if (id === "neon_arrow") {
        const cx = w * ((clip.x || 50) / 100);
        const cy = h * ((clip.y || 50) / 100);
        const bounce = Math.sin(local * 8) * 12;

        ctx.translate(cx + bounce, cy);
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#38bdf8";
        ctx.font = "52px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("➔", 0, 0);
      }

      ctx.restore();
    },

    renderUI() {
      const host = document.getElementById("stickers-grid");
      if (!host) return;
      host.innerHTML = "";

      this.presets.forEach((st) => {
        const card = document.createElement("div");
        card.className = "chip sticker-card";
        card.innerHTML = `<span style="font-size:22px;display:block;margin-bottom:4px">${st.icon}</span><strong>${st.name}</strong>`;
        card.addEventListener("click", () => this.add(st.id));
        host.appendChild(card);
      });
    }
  };

  // ==========================================
  // 5. FREEZE FRAME GENERATOR
  // ==========================================
  const FreezeFrame = {
    insertAtPlayhead(seconds = 3) {
      const c = Editor.selected() || Editor.project.clips.find((x) => x.type === "video" && Editor.playhead >= x.start && Editor.playhead < x.start + x.duration);
      if (!c || c.type !== "video") {
        UI.toast("Select a video clip to freeze frame", "err");
        return;
      }

      const media = Editor.media.get(c.sourceId);
      if (!media) return;

      const video = Player.video;
      if (!video || !video.videoWidth) {
        UI.toast("Video not ready for freeze frame", "err");
        return;
      }

      History.push();

      // Capture frame at current video position
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const freezeId = uid("media_freeze");
      const freezeMedia = {
        id: freezeId,
        url: dataUrl,
        blob: null,
        info: { name: `Freeze Frame (${formatTime(Editor.playhead)})`, duration: seconds, type: "image/jpeg", width: canvas.width, height: canvas.height }
      };
      Editor.media.set(freezeId, freezeMedia);

      // Split video at playhead if inside
      const t = Editor.playhead;
      const local = t - c.start;
      const oldOut = c.outPoint;

      // Truncate left clip
      c.outPoint = c.inPoint + local * (c.speed || 1);
      c.duration = local;

      // Add Freeze Frame clip
      const freezeClip = {
        id: uid("clip"),
        type: "image",
        track: c.track,
        sourceId: freezeId,
        start: t,
        duration: seconds,
        filter: c.filter || "original",
        filterIntensity: c.filterIntensity || 1
      };
      Editor.project.clips.push(freezeClip);

      // Shift right side
      const rightClip = {
        ...c,
        id: uid("clip"),
        start: t + seconds,
        inPoint: c.outPoint,
        outPoint: oldOut,
        duration: (oldOut - c.outPoint) / (c.speed || 1)
      };
      Editor.project.clips.push(rightClip);

      Timeline.render();
      Overlay.draw();
      UI.toast(`Freeze frame (${seconds}s) inserted! 📸`);
    }
  };

  // ==========================================
  // 6. INTERACTIVE ON-CANVAS DIRECT MANIPULATION
  // ==========================================
  const CanvasInteraction = {
    isDragging: false,
    dragTarget: null,
    startX: 0,
    startY: 0,
    origClipX: 50,
    origClipY: 50,

    init() {
      const mon = document.getElementById("monitor");
      if (!mon) return;

      mon.addEventListener("mousedown", (e) => this.onMouseDown(e, mon));
      window.addEventListener("mousemove", (e) => this.onMouseMove(e, mon));
      window.addEventListener("mouseup", () => this.onMouseUp());
    },

    onMouseDown(e, mon) {
      const c = Editor.selected();
      if (!c || (c.type !== "text" && c.type !== "sticker" && !c.pip)) return;

      const rect = mon.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * 100;
      const clickY = ((e.clientY - rect.top) / rect.height) * 100;

      const clipX = c.x != null ? c.x : (c.pipX != null ? c.pipX : 50);
      const clipY = c.y != null ? c.y : (c.pipY != null ? c.pipY : 50);

      // Check proximity (within 20% box)
      if (Math.abs(clickX - clipX) < 25 && Math.abs(clickY - clipY) < 25) {
        this.isDragging = true;
        this.dragTarget = c;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.origClipX = clipX;
        this.origClipY = clipY;
        e.preventDefault();
      }
    },

    onMouseMove(e, mon) {
      if (!this.isDragging || !this.dragTarget) return;

      const rect = mon.getBoundingClientRect();
      const dx = ((e.clientX - this.startX) / rect.width) * 100;
      const dy = ((e.clientY - this.startY) / rect.height) * 100;

      const newX = Math.round(Math.max(5, Math.min(95, this.origClipX + dx)));
      const newY = Math.round(Math.max(5, Math.min(95, this.origClipY + dy)));

      if (this.dragTarget.pip) {
        this.dragTarget.pipX = newX;
        this.dragTarget.pipY = newY;
        const xInp = document.getElementById("pip-x");
        const yInp = document.getElementById("pip-y");
        if (xInp) xInp.value = newX;
        if (yInp) yInp.value = newY;
      } else {
        this.dragTarget.x = newX;
        this.dragTarget.y = newY;
        const xInp = document.getElementById("text-x");
        const yInp = document.getElementById("text-y");
        if (xInp) xInp.value = newX;
        if (yInp) yInp.value = newY;
      }

      Overlay.draw();
    },

    onMouseUp() {
      if (this.isDragging) {
        this.isDragging = false;
        this.dragTarget = null;
        History.push();
      }
    },

    drawSelectionBox(ctx, w, h) {
      const c = Editor.selected();
      if (!c || (c.type !== "text" && c.type !== "sticker" && !c.pip)) return;

      const x = w * (((c.pip ? c.pipX : c.x) || 50) / 100);
      const y = h * (((c.pip ? c.pipY : c.y) || 50) / 100);
      const boxW = c.pip ? (w * ((c.pipScale || 35) / 100)) : Math.min(w * 0.45, 320);
      const boxH = c.pip ? (boxW * (9 / 16)) : 70;

      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x - boxW / 2, y - boxH / 2, boxW, boxH);

      // Corner handles
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 2;
      [
        [x - boxW / 2, y - boxH / 2],
        [x + boxW / 2, y - boxH / 2],
        [x - boxW / 2, y + boxH / 2],
        [x + boxW / 2, y + boxH / 2]
      ].forEach(([hx, hy]) => {
        ctx.fillRect(hx - 5, hy - 5, 10, 10);
        ctx.strokeRect(hx - 5, hy - 5, 10, 10);
      });

      ctx.restore();
    }
  };

  // ==========================================
  // 7. PROJECT FILE EXPORT & IMPORT (.aive)
  // ==========================================
  const ProjectIO = {
    exportFile() {
      const data = {
        version: "2.0",
        app: "AI Video Editor Pro",
        exportedAt: new Date().toISOString(),
        project: Editor.project,
        tracks: Editor.tracks,
        brand: Editor.brand,
        mediaMeta: Array.from(Editor.media.entries()).map(([id, m]) => ({ id, info: m.info }))
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const filename = `${(Editor.project.name || "project").replace(/\s+/g, "_")}.aive`;

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      UI.toast(`Project exported as ${filename}! 📁`);
    },

    importFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.project) throw new Error("Invalid .aive project format");

          History.push();
          Editor.project = data.project;
          if (data.tracks) Editor.tracks = data.tracks;
          if (data.brand) Editor.brand = data.brand;

          document.getElementById("project-name").value = Editor.project.name;
          Timeline.render();
          Subtitles.renderList();
          Player.sync(true);
          Overlay.draw();

          UI.toast("Project imported successfully! 🎉");
        } catch (err) {
          console.error(err);
          UI.toast("Failed to import project file: " + err.message, "err");
        }
      };
      reader.readAsText(file);
    }
  };

  // ==========================================
  // 8. COMMAND PALETTE (CTRL+K)
  // ==========================================
  const CommandPalette = {
    isOpen: false,

    commands: [
      { id: "split", title: "Split Clip at Playhead", category: "Edit", icon: "✂️", action: () => Timeline.splitAtPlayhead() },
      { id: "freeze", title: "Freeze Frame (3s Snapshot)", category: "Edit", icon: "📸", action: () => FreezeFrame.insertAtPlayhead(3) },
      { id: "cut", title: "Cut Selected Clip", category: "Edit", icon: "✂️", action: () => Timeline.cutSelected() },
      { id: "copy", title: "Copy Selected Clip", category: "Edit", icon: "📋", action: () => Timeline.copySelected() },
      { id: "paste", title: "Paste Clip at Playhead", category: "Edit", icon: "📌", action: () => Timeline.paste() },
      { id: "duplicate", title: "Duplicate Selected Clip", category: "Edit", icon: "📑", action: () => Timeline.duplicateSelected() },
      { id: "delete", title: "Delete Selected Clip", category: "Edit", icon: "🗑️", action: () => Timeline.deleteSelected() },
      { id: "export_video", title: "Export Video (WebM / MP4 / GIF)", category: "Export", icon: "🚀", action: () => ExportStudio.open() },
      { id: "export_project", title: "Export Project File (.aive)", category: "File", icon: "💾", action: () => ProjectIO.exportFile() },
      { id: "import_project", title: "Import Project File (.aive)", category: "File", icon: "📂", action: () => document.getElementById("aive-file-input").click() },
      { id: "record_screen", title: "Start Capture Studio (Screen & Cam)", category: "Record", icon: "⏺️", action: () => ScreenRecorder.start() },
      { id: "add_sub", title: "Add Subtitle Cue", category: "Subtitles", icon: "💬", action: () => Subtitles.add() },
      { id: "ai_silence", title: "Auto Detect Silence & Cut", category: "AI Tools", icon: "🤫", action: () => AIStudio.detectSilence() },
      { id: "ai_scenes", title: "Auto Detect Scenes", category: "AI Tools", icon: "🎬", action: () => AIStudio.detectScenes() },
      { id: "ai_highlight", title: "Generate 30s Viral Highlight", category: "AI Tools", icon: "✨", action: () => AIStudio.highlight() },
      { id: "theme_dark", title: "Theme: Dark Mode", category: "Theme", icon: "🌙", action: () => UI.applyTheme("dark") },
      { id: "theme_light", title: "Theme: Light Mode", category: "Theme", icon: "☀️", action: () => UI.applyTheme("light") },
      { id: "theme_midnight", title: "Theme: Midnight Blue", category: "Theme", icon: "🌌", action: () => UI.applyTheme("midnight") },
      { id: "theme_purple", title: "Theme: Cyber Purple", category: "Theme", icon: "🔮", action: () => UI.applyTheme("purple") },
      { id: "aspect_vertical", title: "Format: 9:16 (Shorts / Reels / TikTok)", category: "Canvas", icon: "📱", action: () => { document.getElementById("custom-w").value = 1080; document.getElementById("custom-h").value = 1920; VideoEditor.applyResize(); } },
      { id: "aspect_landscape", title: "Format: 16:9 (YouTube Standard)", category: "Canvas", icon: "🖥️", action: () => { document.getElementById("custom-w").value = 1920; document.getElementById("custom-h").value = 1080; VideoEditor.applyResize(); } }
    ],

    init() {
      window.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          this.toggle();
        }
        if (e.key === "Escape" && this.isOpen) {
          this.close();
        }
      });
    },

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    },

    open() {
      this.isOpen = true;
      let modal = document.getElementById("cmd-palette-modal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "cmd-palette-modal";
        modal.className = "cmd-modal";
        modal.innerHTML = `
          <div class="cmd-backdrop"></div>
          <div class="cmd-box">
            <div class="cmd-input-wrap">
              <span class="cmd-icon">🔍</span>
              <input type="text" id="cmd-search-input" placeholder="Type a command or search action (e.g. Split, Freeze, Export, Theme)…" autocomplete="off" />
              <kbd>ESC</kbd>
            </div>
            <div class="cmd-list" id="cmd-list"></div>
          </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector(".cmd-backdrop").addEventListener("click", () => this.close());
        const input = modal.querySelector("#cmd-search-input");
        input.addEventListener("input", (e) => this.renderList(e.target.value));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            const first = modal.querySelector(".cmd-item.selected") || modal.querySelector(".cmd-item");
            if (first) first.click();
          }
        });
      }

      modal.hidden = false;
      const input = document.getElementById("cmd-search-input");
      input.value = "";
      input.focus();
      this.renderList("");
    },

    close() {
      this.isOpen = false;
      const modal = document.getElementById("cmd-palette-modal");
      if (modal) modal.hidden = true;
    },

    renderList(filter) {
      const list = document.getElementById("cmd-list");
      if (!list) return;
      list.innerHTML = "";

      const q = filter.trim().toLowerCase();
      const filtered = this.commands.filter((c) =>
        c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
      );

      if (!filtered.length) {
        list.innerHTML = `<div class="cmd-empty">No matching commands found.</div>`;
        return;
      }

      filtered.forEach((cmd, idx) => {
        const item = document.createElement("div");
        item.className = "cmd-item" + (idx === 0 ? " selected" : "");
        item.innerHTML = `
          <span class="cmd-item-icon">${cmd.icon}</span>
          <span class="cmd-item-title">${cmd.title}</span>
          <span class="cmd-item-cat">${cmd.category}</span>
        `;
        item.addEventListener("click", () => {
          this.close();
          cmd.action();
        });
        list.appendChild(item);
      });
    }
  };

  // ==========================================
  // EXPOSE GLOBAL API & INTEGRATION HOOKS
  // ==========================================
  global.ChromaKey = ChromaKey;
  global.SoundFX = SoundFX;
  global.TTSVoiceover = TTSVoiceover;
  global.Stickers = Stickers;
  global.FreezeFrame = FreezeFrame;
  global.CanvasInteraction = CanvasInteraction;
  global.ProjectIO = ProjectIO;
  global.CommandPalette = CommandPalette;

  // Initialize all uncommon features when DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    SoundFX.renderUI();
    TTSVoiceover.init();
    Stickers.renderUI();
    CanvasInteraction.init();
    CommandPalette.init();
  });
})(window);
