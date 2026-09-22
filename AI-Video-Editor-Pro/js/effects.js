/**
 * Filters, color adjustments, effects, transitions, text, elements, templates, brand kit.
 * Preview: CSS filters + overlay canvas (Class A).
 */
(function (global) {
  "use strict";

  const FILTERS = [
    "original", "bright", "dark", "warm", "cool", "vintage",
    "cinematic", "bw", "sepia", "contrast", "soft", "dramatic"
  ];
  const EFFECTS = ["none", "blur", "glow", "noise", "vhs", "glitch", "film", "leak", "zoom", "shake", "flash"];
  const TRANSITIONS = ["none", "fade", "dissolve", "slide", "wipe", "zoom", "blur", "push", "circle", "crossfade"];
  const ADJUST_KEYS = [
    ["brightness", 100], ["contrast", 100], ["saturation", 100], ["exposure", 0],
    ["temperature", 0], ["tint", 0], ["sharpness", 0], ["highlights", 0],
    ["shadows", 0], ["fade", 0], ["vignette", 0]
  ];
  const CROP_MODES = ["free", "16:9", "9:16", "1:1", "4:5", "4:3"];
  const RESIZE = [
    ["YouTube 1920×1080", 1920, 1080],
    ["YouTube Shorts 1080×1920", 1080, 1920],
    ["Instagram 1080×1080", 1080, 1080],
    ["Instagram Reel 1080×1920", 1080, 1920],
    ["Facebook 1920×1080", 1920, 1080],
    ["TikTok 1080×1920", 1080, 1920],
    ["Custom", 0, 0]
  ];
  const SOCIAL = [
    ["YouTube", 1920, 1080],
    ["YouTube Shorts", 1080, 1920],
    ["TikTok", 1080, 1920],
    ["Instagram Reel", 1080, 1920],
    ["Instagram Story", 1080, 1920],
    ["Instagram Post", 1080, 1080],
    ["Facebook", 1920, 1080],
    ["LinkedIn", 1920, 1080]
  ];
  const TEMPLATES = [
    "YouTube", "TikTok", "Instagram", "Business", "Advertisement", "Product",
    "Education", "Portfolio", "Birthday", "Wedding", "News", "Promotional"
  ];
  const TEXT_PRESETS = {
    heading: { text: "Heading", size: 64, y: 30, bold: true },
    subheading: { text: "Subheading", size: 40, y: 42 },
    body: { text: "Body text", size: 28, y: 55 },
    caption: { text: "Caption", size: 22, y: 88 },
    custom: { text: "Custom text", size: 36, y: 50 }
  };

  const EffectsStudio = {
    init() {
      this.fillChips("filter-grid", FILTERS, (f) => this.setFilter(f), () => (Editor.selected() || {}).filter || "original");
      this.fillChips("effect-grid", EFFECTS, (f) => this.setEffect(f), () => (Editor.selected() || {}).effect || "none");
      this.fillChips("transition-grid", TRANSITIONS, (f) => this.setTransition(f), () => (Editor.selected() || {}).transition || "none");
      this.fillChips("crop-presets", CROP_MODES, (m) => VideoEditor.setCrop(m), () => Editor.crop.mode);
      const rs = document.getElementById("resize-preset");
      RESIZE.forEach(([n, w, h], i) => {
        const o = document.createElement("option");
        o.value = i;
        o.textContent = n;
        o.dataset.w = w;
        o.dataset.h = h;
        rs.appendChild(o);
      });
      rs.addEventListener("change", () => {
        const o = rs.selectedOptions[0];
        if (Number(o.dataset.w)) {
          document.getElementById("custom-w").value = o.dataset.w;
          document.getElementById("custom-h").value = o.dataset.h;
        }
      });
      const social = document.getElementById("social-presets");
      SOCIAL.forEach(([n, w, h]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = n;
        b.onclick = () => {
          document.getElementById("custom-w").value = w;
          document.getElementById("custom-h").value = h;
          VideoEditor.applyResize();
          UI.toast("Smart crop canvas: " + n);
        };
        social.appendChild(b);
      });
      const adj = document.getElementById("adjust-sliders");
      ADJUST_KEYS.forEach(([k, def]) => {
        const lab = document.createElement("label");
        lab.innerHTML = `${k} <span data-adj-lab="${k}">${def}</span>`;
        const inp = document.createElement("input");
        inp.type = "range";
        inp.min = k === "brightness" || k === "contrast" || k === "saturation" ? 0 : -100;
        inp.max = k === "brightness" || k === "contrast" || k === "saturation" ? 200 : 100;
        inp.value = def;
        inp.dataset.adj = k;
        inp.addEventListener("input", () => {
          lab.querySelector("span").textContent = inp.value;
          const c = Editor.selected();
          if (!c) return;
          if (!c.adjustments) c.adjustments = this.defaultAdjust();
          c.adjustments[k] = Number(inp.value);
          Player.sync();
        });
        lab.appendChild(inp);
        adj.appendChild(lab);
      });
      document.getElementById("filter-intensity").addEventListener("input", (e) => {
        document.getElementById("filter-int-label").textContent = e.target.value + "%";
        const c = Editor.selected();
        if (c) {
          c.filterIntensity = Number(e.target.value) / 100;
          Player.sync();
        }
      });
      document.getElementById("fx-intensity").addEventListener("input", (e) => {
        document.getElementById("fx-int-label").textContent = e.target.value + "%";
        const c = Editor.selected();
        if (c) {
          c.intensity = Number(e.target.value);
          Overlay.draw();
        }
      });
      document.getElementById("trans-dur").addEventListener("change", (e) => {
        const c = Editor.selected();
        if (c) c.transDur = Number(e.target.value);
      });
      document.querySelectorAll("[data-text-preset]").forEach((b) => {
        b.addEventListener("click", () => this.addText(b.dataset.textPreset));
      });
      document.querySelectorAll("[data-element]").forEach((b) => {
        b.addEventListener("click", () => this.addElement(b.dataset.element));
      });
      ["text-content", "text-font", "text-size", "text-color", "text-opacity", "text-tracking", "text-leading", "text-bg", "text-bg-on", "text-anim", "text-anim-dur", "text-x", "text-y", "text-shadow", "text-border"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", () => this.writeTextProps());
      });
      document.querySelectorAll("[data-text-style]").forEach((b) => {
        b.addEventListener("click", () => {
          const c = Editor.selected();
          if (!c || c.type !== "text") return;
          c[b.dataset.textStyle] = !c[b.dataset.textStyle];
          Overlay.draw();
        });
      });
      document.querySelectorAll("[data-text-align]").forEach((b) => {
        b.addEventListener("click", () => {
          const c = Editor.selected();
          if (!c || c.type !== "text") return;
          c.align = b.dataset.textAlign;
          Overlay.draw();
        });
      });
      document.getElementById("brand-logo").addEventListener("change", (e) => {
        const f = e.target.files[0];
        if (!f) return;
        Editor.brand.logoUrl = URL.createObjectURL(f);
      });
      this.renderTemplates();
    },

    fillChips(id, items, onClick) {
      const host = document.getElementById(id);
      host.innerHTML = "";
      items.forEach((item) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = item;
        b.addEventListener("click", () => {
          host.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          onClick(item);
        });
        host.appendChild(b);
      });
    },

    defaultAdjust() {
      const o = {};
      ADJUST_KEYS.forEach(([k, d]) => {
        o[k] = d;
      });
      return o;
    },

    resetAdjust() {
      const c = Editor.selected();
      if (c) c.adjustments = this.defaultAdjust();
      document.querySelectorAll("[data-adj]").forEach((inp) => {
        const def = ADJUST_KEYS.find((x) => x[0] === inp.dataset.adj)[1];
        inp.value = def;
      });
      Player.sync();
    },

    setFilter(name) {
      const c = Editor.selected();
      if (!c) {
        UI.toast("Select a clip", "err");
        return;
      }
      History.push();
      c.filter = name;
      Player.sync();
    },

    setEffect(name) {
      const c = Editor.selected();
      if (c && c.type === "video") {
        History.push();
        c.effect = name;
        if (name !== "none") {
          Editor.addClip({
            id: uid("clip"),
            type: "fx",
            track: "fx",
            start: c.start,
            duration: c.duration,
            effect: name,
            intensity: Number(document.getElementById("fx-intensity").value)
          });
        }
        Props.refresh();
        Overlay.draw();
      }
    },

    setTransition(name) {
      const c = Editor.selected();
      if (!c) return;
      History.push();
      c.transition = name;
      c.transDur = Number(document.getElementById("trans-dur").value) || 0.5;
    },

    filterCss(clip) {
      const a = clip.adjustments || this.defaultAdjust();
      const i = clip.filterIntensity == null ? 1 : clip.filterIntensity;
      let br = a.brightness / 100;
      let ct = a.contrast / 100;
      let sat = a.saturation / 100;
      let hue = a.temperature * 0.3;
      const map = {
        original: "",
        bright: "brightness(1.25)",
        dark: "brightness(.75)",
        warm: "sepia(.25) saturate(1.2)",
        cool: "hue-rotate(20deg) saturate(1.1)",
        vintage: "sepia(.45) contrast(1.05)",
        cinematic: "contrast(1.15) saturate(.85) brightness(.95)",
        bw: "grayscale(1)",
        sepia: "sepia(1)",
        contrast: "contrast(1.4)",
        soft: "contrast(.9) brightness(1.05)",
        dramatic: "contrast(1.35) saturate(1.25)"
      };
      const f = map[clip.filter] || "";
      const extra = `brightness(${br}) contrast(${ct}) saturate(${sat}) hue-rotate(${hue}deg)`;
      const blur = clip.effect === "blur" ? ` blur(${(clip.intensity || 50) / 25}px)` : "";
      return `${f} ${extra}${blur}`.trim();
    },

    applyToVideo(video, clip) {
      video.style.filter = this.filterCss(clip);
      if (clip.effect === "shake") {
        const s = ((clip.intensity || 50) / 50) * Math.sin(Editor.playhead * 40);
        video.style.translate = `${s}px ${-s}px`;
      } else video.style.translate = "0";
    },

    addText(preset) {
      const p = TEXT_PRESETS[preset] || TEXT_PRESETS.custom;
      const text = document.getElementById("text-content").value || p.text;
      History.push();
      const clip = {
        id: uid("clip"),
        type: "text",
        track: "text",
        start: Editor.playhead,
        duration: 4,
        text,
        font: document.getElementById("text-font").value,
        size: Number(document.getElementById("text-size").value) || p.size,
        color: document.getElementById("text-color").value,
        opacity: Number(document.getElementById("text-opacity").value) / 100,
        x: Number(document.getElementById("text-x").value) || 50,
        y: p.y,
        align: "center",
        anim: document.getElementById("text-anim").value,
        animDur: Number(document.getElementById("text-anim-dur").value) || 0.6,
        bg: document.getElementById("text-bg").value,
        bgOn: document.getElementById("text-bg-on").checked,
        tracking: Number(document.getElementById("text-tracking").value) || 0,
        leading: Number(document.getElementById("text-leading").value) || 1.2
      };
      if (p.bold) clip.bold = true;
      Editor.addClip(clip);
      document.getElementById("text-empty").hidden = true;
      Overlay.draw();
    },

    writeTextProps() {
      const c = Editor.selected();
      if (!c || c.type !== "text") return;
      c.text = document.getElementById("text-content").value || c.text;
      c.font = document.getElementById("text-font").value;
      c.size = Number(document.getElementById("text-size").value);
      c.color = document.getElementById("text-color").value;
      c.opacity = Number(document.getElementById("text-opacity").value) / 100;
      c.anim = document.getElementById("text-anim").value;
      c.animDur = Number(document.getElementById("text-anim-dur").value);
      c.x = Number(document.getElementById("text-x").value);
      c.y = Number(document.getElementById("text-y").value);
      c.shadow = document.getElementById("text-shadow").value;
      c.border = document.getElementById("text-border").value;
      c.bg = document.getElementById("text-bg").value;
      c.bgOn = document.getElementById("text-bg-on").checked;
      Overlay.draw();
      Timeline.render();
    },

    addElement(shape) {
      Editor.addClip({
        id: uid("clip"),
        type: "element",
        track: "fx",
        start: Editor.playhead,
        duration: 3,
        shape
      });
      Overlay.draw();
    },

    renderTemplates() {
      const host = document.getElementById("template-list");
      host.innerHTML = "";
      TEMPLATES.forEach((name) => {
        const el = document.createElement("div");
        el.className = "tpl-card";
        el.innerHTML = `<strong>${name}</strong><p class="hint">Layout preset</p>`;
        const use = document.createElement("button");
        use.className = "btn primary";
        use.textContent = "Use";
        use.onclick = () => this.useTemplate(name);
        el.appendChild(use);
        host.appendChild(el);
      });
    },

    useTemplate(name) {
      History.push();
      const vertical = /TikTok|Instagram|Short/.test(name);
      if (vertical) {
        document.getElementById("custom-w").value = 1080;
        document.getElementById("custom-h").value = 1920;
        VideoEditor.applyResize();
      }
      this.addText("heading");
      const last = Editor.project.clips[Editor.project.clips.length - 1];
      if (last) last.text = name + " template";
      Subtitles.add(name + " — edit this caption", 0.2, 3);
      UI.toast("Template applied: " + name);
    },

    saveBrand() {
      Editor.brand.primary = document.getElementById("brand-primary").value;
      Editor.brand.secondary = document.getElementById("brand-secondary").value;
      Editor.brand.font = document.getElementById("brand-font").value;
      Editor.brand.watermark = document.getElementById("brand-watermark").checked;
      localStorage.setItem("aive-brand", JSON.stringify({ ...Editor.brand, logoUrl: null }));
      UI.toast("Brand kit saved on this device");
    },

    applyBrand() {
      this.saveBrand();
      Editor.project.clips.filter((c) => c.type === "text").forEach((c) => {
        c.font = Editor.brand.font;
        c.color = Editor.brand.primary;
      });
      Overlay.draw();
      Timeline.render();
      UI.toast("Brand applied");
    }
  };

  global.EffectsStudio = EffectsStudio;
})(window);
