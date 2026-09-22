/**
 * Export: canvas compositor + MediaRecorder (Class A WebM).
 * Optional FFmpeg.wasm for MP4 / trim / merge / extract (Class B).
 */
(function (global) {
  "use strict";

  const ExportStudio = {
    ffmpeg: null,
    ffmpegLoading: false,
    cancelled: false,

    init() {},

    open() {
      const dur = Editor.duration();
      const fmtGuess = "webm";
      const body = document.createElement("div");
      const est = this.estimateSize(dur, 5000000);
      body.innerHTML = `
        <div class="export-preview">
          <p><strong>Export preview</strong></p>
          <p>Duration: ${formatTime(dur)} · ${Editor.project.width}×${Editor.project.height} · ${Editor.project.fps} fps</p>
          <p>Trim range: ${document.getElementById("trim-start").value}s – ${document.getElementById("trim-end").value}s</p>
          <p>Audio: ${Editor.project.clips.some((c) => c.type === "audio" || c.type === "video") ? "Yes" : "None"} ·
             Subtitles: ${Editor.project.subtitles.length ? "Burned into canvas export" : "None"}</p>
          <p class="hint">Class A: WebM via MediaRecorder (always attempted). Class B: MP4 needs FFmpeg.wasm + COOP/COEP headers.</p>
        </div>
        <div class="form-grid">
          <label>Format
            <select id="ex-format">
              <option value="webm">WebM</option>
              <option value="mp4">MP4 (FFmpeg)</option>
              <option value="mov">MOV (FFmpeg, if supported)</option>
            </select>
          </label>
          <label>Resolution
            <select id="ex-res">
              <option value="854x480">480p</option>
              <option value="1280x720">720p</option>
              <option value="1920x1080" selected>1080p</option>
              <option value="2560x1440">1440p</option>
              <option value="3840x2160">4K</option>
            </select>
          </label>
          <label>FPS
            <select id="ex-fps">
              <option>24</option><option>25</option><option selected>30</option><option>50</option><option>60</option>
            </select>
          </label>
          <label>Quality
            <select id="ex-q">
              <option value="2500000">Low</option>
              <option value="5000000" selected>Medium</option>
              <option value="12000000">High</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>Bitrate (bps) <input id="ex-br" type="number" value="5000000" /></label>
          <label>Audio quality
            <select id="ex-aq"><option>96k</option><option selected>128k</option><option>192k</option><option>320k</option></select>
          </label>
        </div>
        <p id="ex-est">Estimated size ≈ ${est}</p>
      `;
      UI.modal({
        title: "Export video",
        body,
        actions: [
          { label: "Cancel" },
          { label: "Export Video", className: "primary", close: false, onClick: () => this.run() }
        ]
      });
      document.getElementById("ex-q").addEventListener("change", (e) => {
        if (e.target.value !== "custom") document.getElementById("ex-br").value = e.target.value;
      });
      const upd = () => {
        const d = Editor.duration();
        const br = Number(document.getElementById("ex-br").value) || 5000000;
        document.getElementById("ex-est").textContent = "Estimated size ≈ " + this.estimateSize(d, br);
      };
      document.getElementById("ex-br").addEventListener("input", upd);
    },

    estimateSize(dur, bitrate) {
      const bytes = (bitrate / 8) * (dur || 1);
      return formatBytes(bytes);
    },

    async run() {
      this.cancelled = false;
      const format = document.getElementById("ex-format").value;
      const [w, h] = document.getElementById("ex-res").value.split("x").map(Number);
      const fps = Number(document.getElementById("ex-fps").value);
      const br = Number(document.getElementById("ex-br").value) || 5000000;
      UI.closeModal();
      document.getElementById("loading-cancel").hidden = false;
      document.getElementById("loading-cancel").onclick = () => {
        this.cancelled = true;
      };
      UI.loading(true, "Exporting…", 5);
      try {
        const webm = await this.captureTimeline(w, h, fps, br);
        if (this.cancelled) throw new Error("cancelled");
        if (format === "webm") {
          this.download(webm, "webm");
          UI.toast(UI.t("exportOk"));
        } else {
          const out = await this.ffmpegTranscode(webm, format);
          if (out) {
            this.download(out, format);
            UI.toast(UI.t("exportOk"));
          } else {
            this.download(webm, "webm");
            UI.toast("MP4/MOV needs FFmpeg.wasm. Downloaded WebM instead.", "err");
          }
        }
      } catch (e) {
        console.error(e);
        UI.toast(UI.t("exportFail") + " " + (e.message || ""), "err");
      }
      UI.loading(false);
      document.getElementById("loading-cancel").hidden = true;
    },

    captureTimeline(w, h, fps, bitrate) {
      return new Promise(async (resolve, reject) => {
        const duration = Editor.duration();
        if (!duration) {
          reject(new Error("Empty timeline"));
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        const v = document.createElement("video");
        v.muted = false;
        v.playsInline = true;
        v.crossOrigin = "anonymous";
        const stream = canvas.captureStream(fps);
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioDest = audioCtx.createMediaStreamDestination();
        const audioNodes = [];
        const vSource = audioCtx.createMediaElementSource(v);
        const vGain = audioCtx.createGain(); vSource.connect(vGain).connect(audioDest);
        const audioEls = [];
        Editor.project.clips.filter(c => c.type === "audio" && c.sourceId).forEach(c => {
          const m = Editor.media.get(c.sourceId); if(!m) return;
          const a = document.createElement("audio"); a.src=m.url; a.preload="auto"; a.crossOrigin="anonymous";
          const src=audioCtx.createMediaElementSource(a), gain=audioCtx.createGain(); gain.gain.value=c.volume==null?1:c.volume; src.connect(gain).connect(audioDest);
          audioEls.push({el:a,clip:c});
        });
        audioDest.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
        const syncAudio = async (t) => {
          if(audioCtx.state === "suspended") await audioCtx.resume();
          const activeVideo = Editor.project.clips.find(c=>c.type==="video" && t>=c.start && t<c.start+c.duration);
          if(activeVideo){
            const m=Editor.media.get(activeVideo.sourceId);
            if(m && v.src!==m.url){v.src=m.url; await new Promise(r=>{v.onloadeddata=r;});}
            const local=(activeVideo.inPoint||0)+(t-activeVideo.start)*(activeVideo.speed||1);
            if(Math.abs(v.currentTime-local)>0.12) v.currentTime=local;
            if(v.paused) v.play().catch(()=>{});
            vGain.gain.value=activeVideo.volume==null?1:activeVideo.volume;
          } else { v.pause(); vGain.gain.value=0; }
          audioEls.forEach(({el,clip})=>{
            const on=t>=clip.start && t<clip.start+clip.duration && !Editor.tracks.find(tr=>tr.id===clip.track)?.muted;
            if(on){ const local=(clip.inPoint||0)+(t-clip.start)*(clip.speed||1); if(Math.abs(el.currentTime-local)>0.12) el.currentTime=local; if(el.paused) el.play().catch(()=>{}); el.volume=clip.volume==null?1:clip.volume; } else { el.pause(); }
          });
        };
        let rec;
        const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm";
        try {
          rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
        } catch (e) {
          rec = new MediaRecorder(stream);
        }
        const chunks = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = async () => { audioEls.forEach(x=>x.el.pause()); v.pause(); try{await audioCtx.close();}catch(_){} resolve(new Blob(chunks, { type: "video/webm" })); };
        rec.start(200);

        const start = performance.now();
        const step = async () => {
          if (this.cancelled) {
            rec.stop();
            reject(new Error("cancelled"));
            return;
          }
          const t = (performance.now() - start) / 1000;
          if (t >= duration) {
            rec.stop();
            return;
          }
          await syncAudio(t);
          await this.paintFrame(ctx, v, w, h, t);
          UI.loading(true, "Export " + Math.min(100, Math.round((t / duration) * 100)) + "%", (t / duration) * 100);
          requestAnimationFrame(step);
        };
        step();
      });
    },

    async paintFrame(ctx, v, w, h, t) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const clip = Editor.project.clips.find(
        (c) => c.type === "video" && t >= c.start && t < c.start + c.duration
      );
      if (clip) {
        const media = Editor.media.get(clip.sourceId);
        if (media) {
          if (v.src !== media.url) {
            v.src = media.url;
            await new Promise((r) => {
              v.onloadeddata = r;
            });
          }
          const local = clip.inPoint + (t - clip.start) * (clip.speed || 1);
          if (Math.abs(v.currentTime - local) > 0.08) {
            v.currentTime = local;
            await new Promise((r) => {
              const fn = () => {
                v.removeEventListener("seeked", fn);
                r();
              };
              v.addEventListener("seeked", fn);
            });
          }
          ctx.filter = EffectsStudio.filterCss(clip);
          ctx.drawImage(v, 0, 0, w, h);
          ctx.filter = "none";
          const fade = clip.transition === "fade" || clip.transition === "crossfade" || clip.transition === "dissolve";
          if (fade && t - clip.start < (clip.transDur || 0.5)) {
            ctx.fillStyle = `rgba(0,0,0,${1 - (t - clip.start) / (clip.transDur || 0.5)})`;
            ctx.fillRect(0, 0, w, h);
          }
        }
      }
      Editor.project.clips.forEach((c) => {
        if (t < c.start || t >= c.start + c.duration) return;
        if (c.type === "text") {
          const prev = Overlay.ctx;
          const prevC = Overlay.canvas;
          Overlay.ctx = ctx;
          Overlay.canvas = { width: w, height: h };
          Overlay.drawText(c, t);
          Overlay.ctx = prev;
          Overlay.canvas = prevC;
        }
      });
      Subtitles.draw(ctx, w, h, t);
    },

    download(blob, ext) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (Editor.project.name || "export").replace(/\s+/g, "_") + "." + ext;
      a.click();
    },

    async loadFfmpeg() {
      if (this.ffmpeg && this.ffmpeg.isLoaded && this.ffmpeg.isLoaded()) return this.ffmpeg;
      if (this.ffmpegLoading) return null;
      this.ffmpegLoading = true;
      UI.loading(true, "Loading FFmpeg.wasm…", 15);
      try {
        if (!global.FFmpeg) {
          await this.injectScript(AIVE_CONFIG.ffmpeg.cdn);
        }
        const { createFFmpeg, fetchFile } = global.FFmpeg;
        this.fetchFile = fetchFile;
        this.ffmpeg = createFFmpeg({
          log: true,
          corePath: AIVE_CONFIG.ffmpeg.corePath + "ffmpeg-core.js"
        });
        await this.ffmpeg.load();
        UI.toast("FFmpeg ready");
        return this.ffmpeg;
      } catch (e) {
        console.error(e);
        UI.toast(UI.t("ffmpegFail"), "err");
        this.ffmpeg = null;
        return null;
      } finally {
        this.ffmpegLoading = false;
      }
    },

    injectScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error("script"));
        document.head.appendChild(s);
      });
    },

    async ffmpegTranscode(blob, format) {
      const ff = await this.loadFfmpeg();
      if (!ff) return null;
      try {
        const data = await this.fetchFile(blob);
        ff.FS("writeFile", "in.webm", data);
        const out = "out." + (format === "mov" ? "mov" : "mp4");
        await ff.run("-i", "in.webm", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", out);
        const file = ff.FS("readFile", out);
        return new Blob([file.buffer], { type: format === "webm" ? "video/webm" : "video/mp4" });
      } catch (e) {
        console.error(e);
        return null;
      }
    },

    async extractAudioFfmpeg(clip) {
      const media = Editor.media.get(clip.sourceId);
      if (!media) return false;
      const ff = await this.loadFfmpeg();
      if (!ff) return false;
      try {
        UI.loading(true, "Extracting audio…", 40);
        const data = await this.fetchFile(media.blob);
        ff.FS("writeFile", "src.bin", data);
        await ff.run("-i", "src.bin", "-vn", "-acodec", "copy", "out.m4a");
        let file;
        try {
          file = ff.FS("readFile", "out.m4a");
        } catch (_) {
          await ff.run("-i", "src.bin", "-vn", "out.wav");
          file = ff.FS("readFile", "out.wav");
        }
        const blob = new Blob([file.buffer], { type: "audio/wav" });
        await AudioStudio.addAudioFile(new File([blob], "extracted.wav"), "a1", "Extracted audio");
        UI.loading(false);
        return true;
      } catch (e) {
        console.error(e);
        UI.loading(false);
        return false;
      }
    }
  };

  global.ExportStudio = ExportStudio;
})(window);
