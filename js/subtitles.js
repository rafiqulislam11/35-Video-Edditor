/**
 * Subtitle editor, SRT import/export, overlay rendering.
 */
(function (global) {
  "use strict";

  const Subtitles = {
    init() {
      this.refreshTracks();
      document.getElementById("srt-input").addEventListener("change", (e) => {
        const f = e.target.files[0];
        if (f) this.importSrt(f);
      });
      document.getElementById("sub-track").addEventListener("change", (e) => {
        Editor.project.activeSubTrack = e.target.value;
        this.renderList();
      });
    },

    refreshTracks() {
      const sel = document.getElementById("sub-track");
      sel.innerHTML = "";
      Editor.project.subTracks.forEach((t) => {
        const o = document.createElement("option");
        o.value = t.id;
        o.textContent = t.name;
        sel.appendChild(o);
      });
      sel.value = Editor.project.activeSubTrack;
    },

    addTrack() {
      const t = { id: uid("st"), name: "Track " + (Editor.project.subTracks.length + 1) };
      Editor.project.subTracks.push(t);
      Editor.project.activeSubTrack = t.id;
      this.refreshTracks();
    },

    add(text, start, end) {
      History.push();
      const cue = {
        id: uid("sub"),
        trackId: Editor.project.activeSubTrack,
        start: start != null ? start : Editor.playhead,
        end: end != null ? end : Editor.playhead + 2,
        text: text || "New subtitle",
        font: "Inter",
        size: 28,
        color: "#ffffff",
        bg: "#000000",
        align: "center",
        position: 88,
        outline: "#000000",
        shadow: true
      };
      Editor.project.subtitles.push(cue);
      Editor.addClip({
        id: uid("clip"),
        type: "sub",
        track: "sub",
        start: cue.start,
        duration: cue.end - cue.start,
        text: cue.text,
        cueId: cue.id
      });
      this.renderList();
      UI.toast(UI.t("subAdded"));
    },

    renderList() {
      const host = document.getElementById("subtitle-list");
      host.innerHTML = "";
      Editor.project.subtitles
        .filter((s) => s.trackId === Editor.project.activeSubTrack)
        .sort((a, b) => a.start - b.start)
        .forEach((s) => {
          const el = document.createElement("div");
          el.className = "sub-item";
          el.innerHTML = `
            <div class="row-2">
              <label>Start <input type="number" step="0.01" value="${s.start.toFixed(2)}" data-k="start"/></label>
              <label>End <input type="number" step="0.01" value="${s.end.toFixed(2)}" data-k="end"/></label>
            </div>
            <textarea rows="2">${s.text}</textarea>
            <div class="btn-row"><button class="btn danger" type="button">Delete</button></div>`;
          el.querySelector("textarea").addEventListener("input", (e) => {
            s.text = e.target.value;
            const clip = Editor.project.clips.find((c) => c.cueId === s.id);
            if (clip) clip.text = s.text;
            Timeline.render();
          });
          el.querySelectorAll("input").forEach((inp) => {
            inp.addEventListener("change", () => {
              s[inp.dataset.k] = Number(inp.value);
              const clip = Editor.project.clips.find((c) => c.cueId === s.id);
              if (clip) {
                clip.start = s.start;
                clip.duration = Math.max(0.1, s.end - s.start);
              }
              Timeline.render();
            });
          });
          el.querySelector(".danger").addEventListener("click", () => {
            History.push();
            Editor.project.subtitles = Editor.project.subtitles.filter((x) => x.id !== s.id);
            Editor.project.clips = Editor.project.clips.filter((c) => c.cueId !== s.id);
            this.renderList();
            Timeline.render();
          });
          host.appendChild(el);
        });
    },

    draw(ctx, w, h, t) {
      Editor.project.subtitles.forEach((s) => {
        if (t < s.start || t >= s.end) return;
        ctx.save();
        const isArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s.text);
        if ("direction" in ctx) {
          ctx.direction = isArabic ? "rtl" : "ltr";
        }
        ctx.font = `600 ${s.size || 28}px "${s.font || "Hind Siliguri"}", "Hind Siliguri", "Noto Sans Bengali", "Cairo", "Amiri", "Noto Sans Arabic", "Inter", sans-serif`;
        ctx.textAlign = s.align || "center";
        ctx.textBaseline = "middle";
        const x = w / 2;
        const y = h * ((s.position || 88) / 100);
        const m = ctx.measureText(s.text);
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(x - m.width / 2 - 10, y - 18, m.width + 20, 36);
        ctx.strokeStyle = s.outline || "#000";
        ctx.lineWidth = 3;
        ctx.fillStyle = s.color || "#fff";
        ctx.strokeText(s.text, x, y);
        ctx.fillText(s.text, x, y);
        ctx.restore();
      });
    },

    async importSrt(file) {
      const text = await file.text();
      const blocks = text.replace(/\r/g, "").split(/\n\n+/);
      History.push();
      blocks.forEach((b) => {
        const lines = b.trim().split("\n");
        if (lines.length < 2) return;
        const time = lines.find((l) => l.includes("-->"));
        if (!time) return;
        const [a, c] = time.split("-->");
        const body = lines.filter((l) => l !== time && !/^\d+$/.test(l)).join(" ");
        this.add(body, this.parseTs(a), this.parseTs(c));
      });
      UI.toast("SRT imported");
    },

    parseTs(s) {
      const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
      if (!m) return 0;
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    },

    fmtTs(t) {
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const s = Math.floor(t % 60);
      const ms = Math.floor((t % 1) * 1000);
      const p = (n, z) => String(n).padStart(z, "0");
      return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)},${p(ms, 3)}`;
    },

    exportSrt() {
      const cues = Editor.project.subtitles
        .filter((s) => s.trackId === Editor.project.activeSubTrack)
        .sort((a, b) => a.start - b.start);
      const srt = cues
        .map((s, i) => `${i + 1}\n${this.fmtTs(s.start)} --> ${this.fmtTs(s.end)}\n${s.text}\n`)
        .join("\n");
      const blob = new Blob([srt], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (Editor.project.name || "subtitles") + ".srt";
      a.click();
    }
  };

  global.Subtitles = Subtitles;
})(window);
