/**
 * AI Video Editor Pro — application shell
 * Themes, i18n, IndexedDB projects, history, UI chrome.
 * Video blobs are stored in IndexedDB, never in localStorage.
 */
(function (global) {
  "use strict";

  const I18N = {
    en: {
      newProject: "New Project",
      saveProject: "Save Project",
      uploaded: "Video uploaded successfully",
      splitOk: "Clip split successfully",
      subAdded: "Subtitle added",
      saved: "Project saved",
      exportOk: "Export completed",
      exportFail: "Export failed",
      emptyTimeline: "Your timeline is empty.",
      uploadStart: "Upload a video to start editing.",
      fileBad: "Unsupported file type.",
      fileBig: "File is too large for this browser session.",
      decodeFail: "This browser cannot decode the video.",
      micDenied: "Microphone permission denied.",
      ffmpegFail: "FFmpeg failed to load. Export still works as WebM via MediaRecorder.",
      aiMissing: "AI service is not configured. Add an endpoint in Settings → AI.",
      demo: "Demo content"
    },
    bn: {
      newProject: "নতুন প্রকল্প",
      saveProject: "প্রকল্প সংরক্ষণ",
      uploaded: "ভিডিও আপলোড হয়েছে",
      splitOk: "ক্লিপ সফলভাবে ভাগ হয়েছে",
      subAdded: "সাবটাইটেল যোগ হয়েছে",
      saved: "প্রকল্প সংরক্ষিত",
      exportOk: "এক্সপোর্ট সম্পন্ন",
      exportFail: "এক্সপোর্ট ব্যর্থ",
      emptyTimeline: "টাইমলাইন খালি।",
      uploadStart: "সম্পাদনা শুরু করতে ভিডিও আপলোড করুন।",
      fileBad: "ফাইল টাইপ সমর্থিত নয়।",
      fileBig: "ফাইল খুব বড়।",
      decodeFail: "ব্রাউজার এই ভিডিও ডিকোড করতে পারে না।",
      micDenied: "মাইক্রোফোন অনুমতি প্রত্যাখ্যাত।",
      ffmpegFail: "FFmpeg লোড হয়নি।",
      aiMissing: "AI সার্ভিস কনফিগার করা নেই।",
      demo: "ডেমো কন্টেন্ট"
    },
    ar: {
      newProject: "مشروع جديد",
      saveProject: "حفظ المشروع",
      uploaded: "تم رفع الفيديو",
      splitOk: "تم تقسيم المقطع",
      subAdded: "تمت إضافة الترجمة",
      saved: "تم حفظ المشروع",
      exportOk: "اكتمل التصدير",
      exportFail: "فشل التصدير",
      emptyTimeline: "الخط الزمني فارغ.",
      uploadStart: "ارفع فيديو لبدء التحرير.",
      fileBad: "نوع الملف غير مدعوم.",
      fileBig: "الملف كبير جداً.",
      decodeFail: "المتصفح لا يستطيع فك الفيديو.",
      micDenied: "تم رفض إذن الميكروفون.",
      ffmpegFail: "فشل تحميل FFmpeg.",
      aiMissing: "خدمة الذكاء الاصطناعي غير مهيأة.",
      demo: "محتوى تجريبي"
    }
  };

  const DB_NAME = "aive-pro";
  const DB_VER = 1;

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function formatTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return String(m).padStart(2, "0") + ":" + sec.toFixed(2).padStart(5, "0");
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
        if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "id" });
        if (!db.objectStoreNames.contains("prefs")) db.createObjectStore("prefs", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const Store = {
    db: null,
    async init() {
      this.db = await openDb();
    },
    tx(name, mode) {
      return this.db.transaction(name, mode).objectStore(name);
    },
    put(store, value) {
      return new Promise((res, rej) => {
        const r = this.tx(store, "readwrite").put(value);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    get(store, key) {
      return new Promise((res, rej) => {
        const r = this.tx(store, "readonly").get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    all(store) {
      return new Promise((res, rej) => {
        const r = this.tx(store, "readonly").getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    del(store, key) {
      return new Promise((res, rej) => {
        const r = this.tx(store, "readwrite").delete(key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    }
  };

  const History = {
    past: [],
    future: [],
    push() {
      const snap = JSON.stringify(Editor.serialize());
      this.past.push(snap);
      if (this.past.length > 80) this.past.shift();
      this.future.length = 0;
    },
    undo() {
      if (!this.past.length) return;
      this.future.push(JSON.stringify(Editor.serialize()));
      Editor.hydrate(JSON.parse(this.past.pop()));
    },
    redo() {
      if (!this.future.length) return;
      this.past.push(JSON.stringify(Editor.serialize()));
      Editor.hydrate(JSON.parse(this.future.pop()));
    }
  };

  const UI = {
    t(key) {
      const lang = App.prefs.language || "en";
      return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    },
    toast(msg, kind) {
      const host = document.getElementById("toasts");
      const el = document.createElement("div");
      el.className = "toast " + (kind || "ok");
      el.textContent = msg;
      host.appendChild(el);
      setTimeout(() => el.remove(), 3600);
    },
    modal({ title, body, actions }) {
      const modal = document.getElementById("modal");
      document.getElementById("modal-title").textContent = title;
      const bodyEl = document.getElementById("modal-body");
      bodyEl.innerHTML = "";
      if (typeof body === "string") bodyEl.innerHTML = body;
      else bodyEl.appendChild(body);
      const act = document.getElementById("modal-actions");
      act.innerHTML = "";
      (actions || []).forEach((a) => {
        const b = document.createElement("button");
        b.className = "btn " + (a.className || "");
        b.textContent = a.label;
        b.onclick = () => {
          if (a.close !== false) UI.closeModal();
          if (a.onClick) a.onClick();
        };
        act.appendChild(b);
      });
      modal.hidden = false;
      const first = modal.querySelector("button, input, select, textarea");
      if (first) first.focus();
    },
    closeModal() {
      document.getElementById("modal").hidden = true;
    },
    closeSidebars() {
      const left = document.getElementById("left-sidebar");
      const right = document.getElementById("right-sidebar");
      if (left) left.classList.remove("open");
      if (right) right.classList.remove("open");
      document.querySelectorAll(".mobile-nav-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.mobile === "monitor");
      });
      if (window.Overlay) window.Overlay.resize();
    },
    loading(show, text, progress) {
      const veil = document.getElementById("loading-veil");
      veil.hidden = !show;
      if (text) document.getElementById("loading-text").textContent = text;
      if (progress != null) document.getElementById("loading-progress").value = progress;
    },
    applyTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme === "high-contrast" ? "contrast" : theme);
      App.prefs.theme = theme;
      localStorage.setItem("aive-theme", theme);
    },
    applyLanguage(lang) {
      App.prefs.language = lang;
      document.documentElement.setAttribute("data-lang", lang);
      document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      localStorage.setItem("aive-lang", lang);
      document.querySelectorAll("[data-i18n-title]").forEach((el) => {
        el.title = UI.t(el.getAttribute("data-i18n-title"));
      });
    }
  };

  const Editor = {
    project: null,
    media: new Map(),
    selectedId: null,
    playhead: 0,
    playing: false,
    clipboard: null,
    previewTrim: false,
    crop: { enabled: false, mode: "free", x: 0, y: 0, w: 1, h: 1 },
    brand: { primary: "#6c8cff", secondary: "#22d3ee", font: "Inter", watermark: false, logoUrl: null },
    tracks: [
      { id: "v1", name: "Video 1", type: "video", locked: false, hidden: false, muted: false },
      { id: "v2", name: "Video 2", type: "video", locked: false, hidden: false, muted: false },
      { id: "a1", name: "Audio 1", type: "audio", locked: false, hidden: false, muted: false },
      { id: "a2", name: "Audio 2", type: "audio", locked: false, hidden: false, muted: false },
      { id: "text", name: "Text", type: "text", locked: false, hidden: false, muted: false },
      { id: "sub", name: "Subtitle", type: "sub", locked: false, hidden: false, muted: false },
      { id: "fx", name: "Effects", type: "fx", locked: false, hidden: false, muted: false }
    ],

    blank(name) {
      return {
        id: uid("prj"),
        name: name || "Untitled Project",
        width: 1920,
        height: 1080,
        fps: 30,
        created: Date.now(),
        modified: Date.now(),
        clips: [],
        subtitles: [],
        subTracks: [{ id: "st0", name: "Track 1" }],
        activeSubTrack: "st0",
        demo: false
      };
    },

    serialize() {
      return {
        project: this.project,
        selectedId: this.selectedId,
        playhead: this.playhead,
        crop: this.crop,
        brand: { ...this.brand, logoUrl: null },
        tracks: this.tracks
      };
    },

    hydrate(data) {
      this.project = data.project;
      this.selectedId = data.selectedId;
      this.playhead = data.playhead || 0;
      this.crop = data.crop || this.crop;
      if (data.brand) this.brand = { ...this.brand, ...data.brand };
      if (data.tracks) this.tracks = data.tracks;
      document.getElementById("project-name").value = this.project.name;
      Timeline.render();
      Player.sync();
      Overlay.draw();
    },

    duration() {
      let max = 0;
      (this.project.clips || []).forEach((c) => {
        max = Math.max(max, c.start + c.duration);
      });
      return max;
    },

    clip(id) {
      return this.project.clips.find((c) => c.id === id);
    },

    selected() {
      return this.clip(this.selectedId);
    },

    addClip(clip) {
      History.push();
      this.project.clips.push(clip);
      this.selectedId = clip.id;
      this.project.modified = Date.now();
      Timeline.render();
      Props.refresh();
    },

    removeClip(id) {
      History.push();
      this.project.clips = this.project.clips.filter((c) => c.id !== id);
      if (this.selectedId === id) this.selectedId = null;
      Timeline.render();
    }
  };

  const App = {
    prefs: {
      theme: "dark",
      language: "en",
      autoSave: true,
      defaultRes: "1920x1080",
      defaultFps: 30
    },
    autosaveTimer: null,

    async init() {
      try {
        await Store.init();
      } catch (e) {
        console.warn("IndexedDB unavailable", e);
      }
      const theme = localStorage.getItem("aive-theme") || "dark";
      const lang = localStorage.getItem("aive-lang") || "en";
      UI.applyTheme(theme);
      UI.applyLanguage(lang);
      Editor.project = Editor.blank();
      this.bindChrome();
      VideoEditor.init();
      Timeline.init();
      AudioStudio.init();
      ScreenRecorder.init();
      Subtitles.init();
      EffectsStudio.init();
      ExportStudio.init();
      AIStudio.init();
      this.bindKeys();
      if (this.prefs.autoSave) {
        this.autosaveTimer = setInterval(() => this.saveProject(true), 60000);
      }
      await Demo.load();
      UI.toast("AI Video Editor Pro ready");
    },

    bindChrome() {
      document.querySelectorAll(".left-sidebar .tool-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          document.querySelectorAll(".left-sidebar .tool-tab").forEach((t) => {
            t.classList.remove("active");
            t.setAttribute("aria-selected", "false");
          });
          tab.classList.add("active");
          tab.setAttribute("aria-selected", "true");
          document.querySelectorAll(".left-sidebar .tool-panel").forEach((p) => {
            p.classList.toggle("active", p.id === "panel-" + tab.dataset.panel);
            p.hidden = p.id !== "panel-" + tab.dataset.panel;
          });
        });
      });
      document.querySelectorAll(".right-sidebar .tool-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          document.querySelectorAll(".right-sidebar .tool-tab").forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          document.querySelectorAll(".right-sidebar .tool-panel").forEach((p) => {
            p.classList.toggle("active", p.id === "rpanel-" + tab.dataset.rpanel);
            p.hidden = p.id !== "rpanel-" + tab.dataset.rpanel;
          });
        });
      });

      document.getElementById("project-name").addEventListener("change", (e) => {
        Editor.project.name = e.target.value.trim() || "Untitled Project";
      });

      const aiveInput = document.getElementById("aive-file-input");
      if (aiveInput) {
        aiveInput.addEventListener("change", (e) => {
          if (e.target.files[0]) ProjectIO.importFile(e.target.files[0]);
          e.target.value = "";
        });
      }

      // Chroma Key Controls
      const ckEnabled = document.getElementById("ck-enabled");
      if (ckEnabled) {
        ckEnabled.addEventListener("change", (e) => {
          const c = Editor.selected();
          if (!c) return;
          if (!c.chromaKey) c.chromaKey = { enabled: false, color: "#00ff00", similarity: 45, smoothness: 20, spill: 30 };
          c.chromaKey.enabled = e.target.checked;
          Overlay.draw();
        });
      }
      const ckColor = document.getElementById("ck-color");
      if (ckColor) {
        ckColor.addEventListener("input", (e) => {
          const c = Editor.selected();
          if (!c) return;
          if (!c.chromaKey) c.chromaKey = { enabled: true, color: e.target.value, similarity: 45, smoothness: 20, spill: 30 };
          c.chromaKey.color = e.target.value;
          Overlay.draw();
        });
      }
      const ckEye = document.getElementById("ck-eyedropper");
      if (ckEye) {
        ckEye.addEventListener("click", () => ChromaKey.pickColorWithEyeDropper());
      }
      const ckSim = document.getElementById("ck-similarity");
      if (ckSim) {
        ckSim.addEventListener("input", (e) => {
          const c = Editor.selected();
          if (!c) return;
          if (!c.chromaKey) c.chromaKey = { enabled: true, color: "#00ff00", similarity: 45, smoothness: 20, spill: 30 };
          c.chromaKey.similarity = Number(e.target.value);
          const lab = document.getElementById("ck-sim-val");
          if (lab) lab.textContent = e.target.value + "%";
          Overlay.draw();
        });
      }
      const ckSmooth = document.getElementById("ck-smoothness");
      if (ckSmooth) {
        ckSmooth.addEventListener("input", (e) => {
          const c = Editor.selected();
          if (!c) return;
          if (!c.chromaKey) c.chromaKey = { enabled: true, color: "#00ff00", similarity: 45, smoothness: 20, spill: 30 };
          c.chromaKey.smoothness = Number(e.target.value);
          Overlay.draw();
        });
      }
      const ckSpill = document.getElementById("ck-spill");
      if (ckSpill) {
        ckSpill.addEventListener("input", (e) => {
          const c = Editor.selected();
          if (!c) return;
          if (!c.chromaKey) c.chromaKey = { enabled: true, color: "#00ff00", similarity: 45, smoothness: 20, spill: 30 };
          c.chromaKey.spill = Number(e.target.value);
          Overlay.draw();
        });
      }
      document.querySelectorAll("[data-ck-preset]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const c = Editor.selected();
          if (!c) return;
          if (!c.chromaKey) c.chromaKey = { enabled: true, color: btn.dataset.ckPreset, similarity: 45, smoothness: 20, spill: 30 };
          c.chromaKey.color = btn.dataset.ckPreset;
          c.chromaKey.enabled = true;
          ChromaKey.syncUI();
          Overlay.draw();
        });
      });

      // PiP Overlay Controls
      const pipEnabled = document.getElementById("pip-enabled");
      if (pipEnabled) {
        pipEnabled.addEventListener("change", (e) => {
          const c = Editor.selected();
          if (!c) return;
          c.pip = e.target.checked;
          Overlay.draw();
        });
      }
      const pipX = document.getElementById("pip-x");
      const pipY = document.getElementById("pip-y");
      const pipScale = document.getElementById("pip-scale");
      const pipBlend = document.getElementById("pip-blend");
      if (pipX) pipX.addEventListener("input", (e) => { const c = Editor.selected(); if (c) { c.pipX = Number(e.target.value); Overlay.draw(); } });
      if (pipY) pipY.addEventListener("input", (e) => { const c = Editor.selected(); if (c) { c.pipY = Number(e.target.value); Overlay.draw(); } });
      if (pipScale) pipScale.addEventListener("input", (e) => { const c = Editor.selected(); if (c) { c.pipScale = Number(e.target.value); Overlay.draw(); } });
      if (pipBlend) pipBlend.addEventListener("change", (e) => { const c = Editor.selected(); if (c) { c.pipBlend = e.target.value; Overlay.draw(); } });

      document.querySelectorAll("[data-pip-pos]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const c = Editor.selected();
          if (!c) return;
          const pos = btn.dataset.pipPos;
          const coords = {
            br: [80, 75],
            tr: [80, 25],
            bl: [20, 75],
            tl: [20, 25],
            center: [50, 50]
          }[pos] || [80, 75];
          c.pip = true;
          c.pipX = coords[0];
          c.pipY = coords[1];
          if (pipEnabled) pipEnabled.checked = true;
          if (pipX) pipX.value = coords[0];
          if (pipY) pipY.value = coords[1];
          Overlay.draw();
        });
      });

      // Audio EQ Control
      const clipEq = document.getElementById("clip-eq");
      if (clipEq) {
        clipEq.addEventListener("change", (e) => {
          const c = Editor.selected();
          if (c) {
            c.eq = e.target.value;
            UI.toast(`Applied EQ preset: ${e.target.value}`);
          }
        });
      }

      document.body.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        this.handleAction(btn.dataset.action);
      });

      document.querySelectorAll("[data-mobile]").forEach((b) => {
        b.addEventListener("click", () => this.mobileNav(b.dataset.mobile));
      });
    },

    mobileNav(which) {
      const left = document.getElementById("left-sidebar");
      const right = document.getElementById("right-sidebar");

      if (which === "export") {
        this.handleAction("open-export");
        return;
      }

      document.querySelectorAll(".mobile-nav-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.mobile === which);
      });

      if (which === "monitor") {
        if (left) left.classList.remove("open");
        if (right) right.classList.remove("open");
        document.body.classList.remove("mobile-hide-tl");
        if (window.Overlay) window.Overlay.resize();
        return;
      }
      if (which === "media") {
        if (right) right.classList.remove("open");
        if (left) {
          const isOpen = left.classList.toggle("open");
          if (!isOpen) {
            document.querySelectorAll(".mobile-nav-btn").forEach((b) => {
              b.classList.toggle("active", b.dataset.mobile === "monitor");
            });
          }
        }
        return;
      }
      if (which === "props") {
        if (left) left.classList.remove("open");
        if (right) {
          const isOpen = right.classList.toggle("open");
          if (!isOpen) {
            document.querySelectorAll(".mobile-nav-btn").forEach((b) => {
              b.classList.toggle("active", b.dataset.mobile === "monitor");
            });
          }
        }
        return;
      }
      if (which === "timeline") {
        if (left) left.classList.remove("open");
        if (right) right.classList.remove("open");
        document.body.classList.toggle("mobile-hide-tl");
        if (window.Timeline) window.Timeline.render();
        if (window.Overlay) window.Overlay.resize();
        return;
      }
    },

    handleAction(action) {
      const map = {
        "new-project": () => this.confirmNew(),
        "save-project": () => this.saveProject(false),
        "export-aive": () => ProjectIO.exportFile(),
        "import-aive": () => document.getElementById("aive-file-input").click(),
        "open-cmd": () => CommandPalette.toggle(),
        "freeze-frame": () => FreezeFrame.insertAtPlayhead(3),
        "ripple-delete": () => Timeline.rippleDeleteSelected(),
        undo: () => History.undo(),
        redo: () => History.redo(),
        "open-help": () => this.openHelp(),
        "open-settings": () => this.openSettings(),
        "open-export": () => ExportStudio.open(),
        "close-modal": () => UI.closeModal(),
        split: () => Timeline.splitAtPlayhead(),
        cut: () => Timeline.cutSelected(),
        "delete-clip": () => Timeline.deleteSelected(),
        duplicate: () => Timeline.duplicateSelected(),
        copy: () => Timeline.copySelected(),
        paste: () => Timeline.paste(),
        "zoom-in": () => Timeline.zoomBy(1),
        "zoom-out": () => Timeline.zoomBy(-1),
        "fit-timeline": () => Timeline.fit(),
        "reset-trim": () => VideoEditor.resetTrim(),
        "apply-trim": () => VideoEditor.applyTrim(),
        "reset-crop": () => VideoEditor.resetCrop(),
        "apply-resize": () => VideoEditor.applyResize(),
        "rot-left": () => VideoEditor.rotate(-90),
        "rot-right": () => VideoEditor.rotate(90),
        "rot-180": () => VideoEditor.rotate(180),
        "flip-h": () => VideoEditor.flip("h"),
        "flip-v": () => VideoEditor.flip("v"),
        "reset-adjust": () => EffectsStudio.resetAdjust(),
        "extract-audio": () => AudioStudio.extract(),
        "replace-audio": () => document.getElementById("replace-audio-input").click(),
        "vo-start": () => AudioStudio.voStart(),
        "vo-pause": () => AudioStudio.voPause(),
        "vo-resume": () => AudioStudio.voResume(),
        "vo-stop": () => AudioStudio.voStop(),
        "vo-preview": () => AudioStudio.voPreview(),
        "vo-add": () => AudioStudio.voAdd(),
        "vo-delete": () => AudioStudio.voDelete(),
        "sub-add": () => Subtitles.add(),
        "sub-srt-import": () => document.getElementById("srt-input").click(),
        "sub-srt-export": () => Subtitles.exportSrt(),
        "sub-add-track": () => Subtitles.addTrack(),
        "ai-subtitles": () => AIStudio.autoSubtitles(),
        "ai-translate": () => AIStudio.translate(),
        "ai-silence": () => AIStudio.detectSilence(),
        "ai-scenes": () => AIStudio.detectScenes(),
        "ai-autocut": () => AIStudio.autoCut(),
        "ai-highlight": () => AIStudio.highlight(),
        "ai-run": () => AIStudio.runPrompt(),
        "ai-thumb": () => AIStudio.thumbAI(),
        "thumb-capture": () => AIStudio.captureThumb(),
        "thumb-download": () => AIStudio.downloadThumb(),
        "brand-save": () => EffectsStudio.saveBrand(),
        "brand-apply": () => EffectsStudio.applyBrand()
      };
      if (map[action]) map[action]();
    },

    bindKeys() {
      document.addEventListener("keydown", (e) => {
        const tag = (e.target.tagName || "").toLowerCase();
        const typing = tag === "input" || tag === "textarea";
        if (e.code === "Space" && !typing) {
          e.preventDefault();
          Player.toggle();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          History.undo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
          e.preventDefault();
          History.redo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          this.saveProject(false);
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !typing) {
          e.preventDefault();
          Timeline.copySelected();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !typing) {
          e.preventDefault();
          Timeline.paste();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x" && !typing) {
          e.preventDefault();
          Timeline.cutSelected();
        }
        if (e.key === "Delete" && !typing) Timeline.deleteSelected();
      });
    },

    confirmNew() {
      UI.modal({
        title: "New project",
        body: "<p>Unsaved timeline changes live only in this session until you Save. Continue?</p>",
        actions: [
          { label: "Cancel" },
          {
            label: "Create",
            className: "primary",
            onClick: () => {
              Editor.media.forEach((m) => m.url && URL.revokeObjectURL(m.url));
              Editor.media.clear();
              Editor.project = Editor.blank();
              Editor.selectedId = null;
              Editor.playhead = 0;
              document.getElementById("project-name").value = Editor.project.name;
              Timeline.render();
              Player.load(null);
              document.getElementById("media-list").innerHTML = "";
              document.getElementById("media-empty").hidden = false;
            }
          }
        ]
      });
    },

    async saveProject(silent) {
      if (!Store.db) {
        if (!silent) UI.toast("IndexedDB is unavailable in this browser", "err");
        return;
      }
      Editor.project.modified = Date.now();
      Editor.project.name = document.getElementById("project-name").value.trim() || Editor.project.name;
      const record = {
        id: Editor.project.id,
        meta: Editor.serialize(),
        updated: Date.now()
      };
      await Store.put("projects", record);
      for (const [id, m] of Editor.media) {
        if (m.blob) await Store.put("media", { id, projectId: Editor.project.id, blob: m.blob, info: m.info });
      }
      if (!silent) UI.toast(UI.t("saved"));
    },

    openHelp() {
      UI.modal({
        title: "Help & shortcuts",
        body: `<table class="shortcut-table">
          <tr><td><kbd>Space</kbd></td><td>Play / Pause</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Undo</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Redo</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>V</kbd> / <kbd>X</kbd></td><td>Copy / Paste / Cut</td></tr>
          <tr><td><kbd>Delete</kbd></td><td>Delete selected clip</td></tr>
        </table>
        <p class="hint">Feature classes: A = browser-native, B = FFmpeg.wasm, C = AI API, D = backend/cloud. See README.</p>`,
        actions: [{ label: "Close", className: "primary" }]
      });
    },

    openSettings() {
      const body = document.createElement("div");
      body.innerHTML = `
        <div class="form-grid">
          <label>Theme
            <select id="set-theme">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="midnight">Midnight</option>
              <option value="blue">Blue</option>
              <option value="purple">Purple</option>
              <option value="high-contrast">High Contrast</option>
            </select>
          </label>
          <label>Language
            <select id="set-lang">
              <option value="en">English</option>
              <option value="bn">Bangla</option>
              <option value="ar">Arabic</option>
            </select>
          </label>
          <label>Default FPS <input id="set-fps" type="number" value="${App.prefs.defaultFps}" /></label>
          <label class="check"><input type="checkbox" id="set-autosave" ${App.prefs.autoSave ? "checked" : ""}/> Auto save</label>
        </div>
        <h3>AI Settings</h3>
        <p class="hint">Do not paste secret keys here in production. Use a backend proxy (Class D).</p>
        <label>Speech-to-text URL <input id="set-stt" type="url" placeholder="https://api.example.com/stt" value="${AIVE_CONFIG.ai.speechToTextUrl || ""}"/></label>
        <label>Translate URL <input id="set-tr" type="url" placeholder="https://api.example.com/translate" value="${AIVE_CONFIG.ai.translateUrl || ""}"/></label>
        <h3>About</h3>
        <p>AI Video Editor Pro — browser editor. Media stays in this device unless you export or call an API.</p>
        <p class="hint">Admin panel (users, billing, logs) is reserved for a future backend version. See README.</p>
      `;
      UI.modal({
        title: "Settings",
        body,
        actions: [
          { label: "Cancel" },
          {
            label: "Save",
            className: "primary",
            onClick: () => {
              UI.applyTheme(document.getElementById("set-theme").value);
              UI.applyLanguage(document.getElementById("set-lang").value);
              App.prefs.autoSave = document.getElementById("set-autosave").checked;
              App.prefs.defaultFps = Number(document.getElementById("set-fps").value) || 30;
              AIVE_CONFIG.ai.speechToTextUrl = document.getElementById("set-stt").value.trim();
              AIVE_CONFIG.ai.translateUrl = document.getElementById("set-tr").value.trim();
              localStorage.setItem("aive-ai", JSON.stringify(AIVE_CONFIG.ai));
            }
          }
        ]
      });
      document.getElementById("set-theme").value = App.prefs.theme;
      document.getElementById("set-lang").value = App.prefs.language;
    }
  };

  try {
    const savedAi = JSON.parse(localStorage.getItem("aive-ai") || "null");
    if (savedAi) Object.assign(AIVE_CONFIG.ai, savedAi);
  } catch (_) {}

  global.App = App;
  global.UI = UI;
  global.Editor = Editor;
  global.History = History;
  global.Store = Store;
  global.uid = uid;
  global.formatTime = formatTime;
  global.formatBytes = formatBytes;
  global.I18N = I18N;
})(window);
