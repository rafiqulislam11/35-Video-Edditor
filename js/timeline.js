/**
 * Multi-track timeline: split, cut, copy, paste, drag, resize, zoom, snap.
 */
(function (global) {
  "use strict";

  const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4];
  const PX_PER_SEC = 80;

  const Timeline = {
    zoom: 1,
    snapOn: true,
    dragging: null,

    init() {
      document.getElementById("tl-zoom").addEventListener("change", (e) => {
        this.zoom = Number(e.target.value);
        this.render();
      });
      document.getElementById("snap").addEventListener("change", (e) => {
        this.snapOn = e.target.checked;
      });
      const scroll = document.getElementById("timeline-scroll");
      const ruler = document.getElementById("time-ruler");
      const ph = document.getElementById("playhead");

      const scrubAt = (clientX) => {
        const scrollRect = scroll.getBoundingClientRect();
        const scrollLeft = scroll.scrollLeft;
        const relativeX = clientX - scrollRect.left + scrollLeft - 92;
        const t = Math.max(0, relativeX / this.pps());
        Player.seekTimeline(t);
      };

      const startScrub = (e) => {
        if (e.target.closest(".clip") || e.target.closest(".track-head")) return;
        const isTouch = !!e.touches;
        const getX = (ev) => ev.touches ? ev.touches[0].clientX : ev.clientX;
        scrubAt(getX(e));
        const move = (ev) => scrubAt(getX(ev));
        const stop = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", stop);
          window.removeEventListener("touchmove", move);
          window.removeEventListener("touchend", stop);
        };
        if (isTouch) {
          window.addEventListener("touchmove", move, { passive: true });
          window.addEventListener("touchend", stop);
        } else {
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", stop);
        }
      };

      if (ruler) {
        ruler.addEventListener("mousedown", startScrub);
        ruler.addEventListener("touchstart", startScrub, { passive: true });
      }
      if (ph) {
        ph.addEventListener("mousedown", startScrub);
        ph.addEventListener("touchstart", startScrub, { passive: true });
      }

      scroll.addEventListener("click", (e) => {
        if (e.target.closest(".clip") || e.target.closest(".track-head") || e.target.closest("#time-ruler")) return;
        scrubAt(e.clientX);
      });
      scroll.addEventListener("wheel", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        this.zoomBy(e.deltaY > 0 ? -1 : 1);
      }, { passive: false });
      this.render();
    },

    pps() {
      return PX_PER_SEC * this.zoom;
    },

    zoomBy(dir) {
      const i = ZOOM_STEPS.indexOf(this.zoom);
      const n = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (i < 0 ? 3 : i) + dir))];
      this.zoom = n;
      document.getElementById("tl-zoom").value = String(n);
      this.render();
    },

    fit() {
      const dur = Math.max(Editor.duration(), 4);
      const w = document.getElementById("timeline-scroll").clientWidth - 92;
      this.zoom = Math.max(0.25, Math.min(4, w / (dur * PX_PER_SEC)));
      document.getElementById("tl-zoom").value = ZOOM_STEPS.reduce((p, c) =>
        Math.abs(c - this.zoom) < Math.abs(p - this.zoom) ? c : p
      );
      this.zoom = Number(document.getElementById("tl-zoom").value);
      this.render();
    },

    render() {
      const host = document.getElementById("tracks");
      const ruler = document.getElementById("time-ruler");
      host.innerHTML = "";
      const dur = Math.max(Editor.duration() + 2, 8);
      const width = dur * this.pps();
      ruler.style.width = 92 + width + "px";
      ruler.innerHTML = "";
      const step = this.zoom < 0.75 ? 5 : this.zoom > 2 ? 0.5 : 1;
      for (let t = 0; t <= dur; t += step) {
        const s = document.createElement("span");
        s.style.position = "absolute";
        s.style.left = 92 + t * this.pps() + "px";
        s.textContent = formatTime(t).slice(0, 5);
        ruler.appendChild(s);
      }
      Editor.tracks.forEach((tr) => {
        const row = document.createElement("div");
        row.className = "track";
        row.dataset.track = tr.id;
        const head = document.createElement("div");
        head.className = "track-head";
        head.innerHTML = `<span>${tr.name}</span>`;
        const tools = document.createElement("span");
        const lock = this.iconBtn(tr.locked ? "🔒" : "🔓", "Lock track", () => {
          tr.locked = !tr.locked;
          this.render();
        });
        const hide = this.iconBtn(tr.hidden ? "👁‍🗨" : "👁", "Hide track", () => {
          tr.hidden = !tr.hidden;
          this.render();
          Overlay.draw();
        });
        const mute = this.iconBtn(tr.muted ? "🔇" : "🔊", "Mute track", () => {
          tr.muted = !tr.muted;
          this.render();
        });
        tools.append(lock, hide, mute);
        head.appendChild(tools);
        const lane = document.createElement("div");
        lane.className = "track-lane";
        lane.style.width = width + "px";
        lane.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("application/x-aive-media") || e.dataTransfer.types.includes("application/x-aive-clip")) { e.preventDefault(); e.dataTransfer.dropEffect = "copyMove"; lane.classList.add("drop-target"); } });
        lane.addEventListener("dragleave", () => lane.classList.remove("drop-target"));
        lane.addEventListener("drop", (e) => {
          e.preventDefault(); lane.classList.remove("drop-target");
          const mediaId = e.dataTransfer.getData("application/x-aive-media");
          const clipId = e.dataTransfer.getData("application/x-aive-clip");
          const rect = lane.getBoundingClientRect();
          let t = Math.max(0, (e.clientX - rect.left) / this.pps());
          if (this.snapOn) t = this.snapTime(t, tr.id);
          if (mediaId) {
            const m = Editor.media.get(mediaId);
            if (!m) return;
            const isImg = m.isImage || (m.info && (m.info.type === "image" || /^image\//.test(m.info.type)));
            const isAud = m.info && /^audio\//.test(m.info.type);
            const isVid = m.info && /^video\//.test(m.info.type);

            if (tr.type === "audio") {
              if (!isAud) return;
            } else {
              if (!isVid && !isImg) return;
            }

            const type = isAud ? "audio" : isImg ? "image" : "video";
            const duration = Math.max(0.1, m.info?.duration || (isImg ? 4.0 : 1));
            const c = {
              id: uid("clip"),
              type,
              track: tr.id,
              sourceId: mediaId,
              start: t,
              inPoint: 0,
              outPoint: duration,
              duration,
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
              fadeOut: 0,
              kenBurns: isImg ? "zoomIn" : "none"
            };
            Editor.addClip(c);
            if (type === "video" || type === "image") Player.load(m);
          } else if (clipId) {
            const c=Editor.clip(clipId); if(c && !tr.locked){ c.track=tr.id; c.start=t; Timeline.render(); }
          }
        });
        Editor.project.clips
          .filter((c) => c.track === tr.id)
          .forEach((c) => lane.appendChild(this.clipEl(c, tr)));
        row.append(head, lane);
        host.appendChild(row);
      });
      document.getElementById("timeline-empty").style.display = Editor.project.clips.length ? "none" : "block";
      this.updatePlayhead();
      Props.refresh();
    },

    iconBtn(label, title, fn) {
      const b = document.createElement("button");
      b.className = "btn icon";
      b.style.width = "22px";
      b.style.height = "22px";
      b.style.fontSize = "10px";
      b.title = title;
      b.setAttribute("aria-label", title);
      b.textContent = label;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        fn();
      });
      return b;
    },

    clipEl(c, tr) {
      const el = document.createElement("div");
      const typeClass = c.type === "video" ? "" :
                        c.type === "audio" ? "audio" :
                        c.type === "text" ? "text" :
                        c.type === "sub" ? "sub" :
                        c.type === "image" ? "image" :
                        c.type === "sticker" ? "sticker" : "fx";
      el.className = "clip " + typeClass;
      if (c.id === Editor.selectedId) el.classList.add("selected");
      el.style.left = c.start * this.pps() + "px";
      el.style.width = Math.max(16, c.duration * this.pps()) + "px";
      const title = c.text || (c.sourceId && Editor.media.get(c.sourceId)?.info.name) || c.type;
      el.textContent = (c.demo ? "[Demo] " : "") + title;
      el.title = title;
      if ((c.type === "video" || c.type === "image") && c.sourceId) this.decorateThumbnail(el, c);
      if (c.type === "audio" && c.sourceId) this.decorateWaveform(el, c);
      const hl = document.createElement("span");
      hl.className = "handle l";
      const hr = document.createElement("span");
      hr.className = "handle r";
      el.append(hl, hr);
      el.draggable = true;
      el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-aive-clip", c.id); e.dataTransfer.effectAllowed = "move"; });
      const handleDown = (e) => {
        if (tr.locked) return;
        Editor.selectedId = c.id;
        Props.refresh();
        document.querySelectorAll(".clip").forEach((x) => x.classList.remove("selected"));
        el.classList.add("selected");
        const target = e.target;
        if (target && target.classList && target.classList.contains("handle")) {
          this.beginResize(c, e, target.classList.contains("r"));
        } else {
          this.beginDrag(c, e);
        }
      };
      el.addEventListener("mousedown", handleDown);
      el.addEventListener("touchstart", handleDown, { passive: true });
      return el;
    },

    snapTime(t, trackId, ignoreId=null) {
      if (!this.snapOn) return Math.max(0,t);
      const points=[0, Editor.playhead];
      Editor.project.clips.forEach(x=>{ if(x.id!==ignoreId && x.track===trackId){points.push(x.start,x.start+x.duration);} });
      const threshold=Math.max(0.08, 8/this.pps());
      let best=t, dist=Infinity; points.forEach(p=>{const d=Math.abs(p-t); if(d<threshold && d<dist){dist=d;best=p;}});
      return Math.max(0,best);
    },

    decorateThumbnail(el,c){
      const m=Editor.media.get(c.sourceId); if(!m) return;
      if (c.type === "image" && m.url) {
        el.style.backgroundImage=`linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.55)),url(${m.url})`;
        el.style.backgroundSize="cover";
        el.style.backgroundPosition="center";
        return;
      }
      const v=document.createElement("video"); v.src=m.url; v.muted=true; v.preload="metadata"; v.currentTime=Math.max(0,c.inPoint||0);
      v.addEventListener("loadeddata",()=>{const cv=document.createElement("canvas");cv.width=160;cv.height=70;const x=cv.getContext("2d");x.drawImage(v,0,0,cv.width,cv.height);el.style.backgroundImage=`linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.55)),url(${cv.toDataURL("image/jpeg",.7)})`;el.style.backgroundSize="cover";el.style.backgroundPosition="center";},{once:true});
    },
    decorateWaveform(el,c){
      const m=Editor.media.get(c.sourceId); if(!m||!m.blob) return;
      if(!m.blob.type.startsWith("audio/")) return;
      const fr=new FileReader(); fr.onload=async()=>{try{const ac=new (window.AudioContext||window.webkitAudioContext)();const b=await ac.decodeAudioData(fr.result);const cv=document.createElement("canvas");cv.width=240;cv.height=52;const x=cv.getContext("2d");const d=b.getChannelData(0);x.strokeStyle="rgba(255,255,255,.65)";x.beginPath();for(let i=0;i<cv.width;i++){const idx=Math.floor(i*d.length/cv.width);let peak=0;for(let j=0;j<Math.max(1,Math.floor(d.length/cv.width));j++)peak=Math.max(peak,Math.abs(d[idx+j]||0));const y=(1-peak)*cv.height/2;x.moveTo(i,y);x.lineTo(i,cv.height-y);}x.stroke();el.style.backgroundImage=`linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.18)),url(${cv.toDataURL()})`;el.style.backgroundSize="100% 100%";await ac.close();}catch(_){}};fr.readAsArrayBuffer(m.blob);
    },

    beginDrag(c, e) {
      const isTouch = !!e.touches;
      const startX = isTouch ? e.touches[0].clientX : e.clientX;
      const orig = c.start;
      const move = (ev) => {
        const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
        let t = orig + (cx - startX) / this.pps();
        t = this.snapTime(Math.max(0,t), c.track, c.id);
        c.start = t;
        this.render();
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
      };
      History.push();
      if (isTouch) {
        window.addEventListener("touchmove", move, { passive: true });
        window.addEventListener("touchend", up);
      } else {
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      }
    },

    beginResize(c, e, right) {
      if (e.stopPropagation) e.stopPropagation();
      const isTouch = !!e.touches;
      const startX = isTouch ? e.touches[0].clientX : e.clientX;
      const origDur = c.duration;
      const origStart = c.start;
      const origIn = c.inPoint || 0;
      const origOut = c.outPoint || c.duration;
      const move = (ev) => {
        const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const dt = (cx - startX) / this.pps();
        if (right) {
          c.duration = Math.max(0.1, origDur + dt);
          if (c.outPoint != null) c.outPoint = origIn + c.duration * (c.speed || 1);
        } else {
          const ns = Math.max(0, origStart + dt);
          const delta = ns - origStart;
          c.start = ns;
          c.duration = Math.max(0.1, origDur - delta);
          if (c.inPoint != null) c.inPoint = origIn + delta * (c.speed || 1);
        }
        this.render();
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
      };
      History.push();
      if (isTouch) {
        window.addEventListener("touchmove", move, { passive: true });
        window.addEventListener("touchend", up);
      } else {
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      }
    },

    updatePlayhead() {
      const ph = document.getElementById("playhead");
      ph.style.left = 92 + Editor.playhead * this.pps() + "px";
      ph.style.height = document.getElementById("tracks").scrollHeight + 22 + "px";
    },

    splitAtPlayhead() {
      const c = Editor.selected();
      if (!c) {
        UI.toast("Select a clip to split", "err");
        return;
      }
      const t = Editor.playhead;
      if (t <= c.start + 0.05 || t >= c.start + c.duration - 0.05) {
        UI.toast("Move the playhead inside the clip", "err");
        return;
      }
      History.push();
      const local = t - c.start;
      const leftDur = local;
      const right = { ...c, id: uid("clip"), start: t, duration: c.duration - local };
      if (c.type === "video" || c.type === "audio") {
        const mid = (c.inPoint || 0) + leftDur * (c.speed || 1);
        const oldOut = c.outPoint;
        c.outPoint = mid;
        right.inPoint = mid;
        right.outPoint = oldOut;
      }
      c.duration = leftDur;
      Editor.project.clips.push(right);
      this.render();
      UI.toast(UI.t("splitOk"));
    },

    deleteSelected() {
      if (!Editor.selectedId) return;
      Editor.removeClip(Editor.selectedId);
    },

    rippleDeleteSelected() {
      if (!Editor.selectedId) return;
      const c = Editor.selected();
      if (!c) return;
      History.push();
      const deletedTrack = c.track;
      const deletedStart = c.start;
      const deletedDur = c.duration;
      Editor.removeClip(c.id);
      // Shift all clips following the deleted clip on the same track to close the gap
      Editor.project.clips.forEach((other) => {
        if (other.track === deletedTrack && other.start >= deletedStart + deletedDur - 0.05) {
          other.start = Math.max(0, other.start - deletedDur);
        }
      });
      this.render();
      UI.toast("Ripple delete: gap closed! ⚡");
    },

    copySelected() {
      const c = Editor.selected();
      if (c) Editor.clipboard = JSON.parse(JSON.stringify(c));
    },

    cutSelected() {
      this.copySelected();
      this.deleteSelected();
    },

    paste() {
      if (!Editor.clipboard) return;
      History.push();
      const c = { ...JSON.parse(JSON.stringify(Editor.clipboard)), id: uid("clip"), start: Editor.playhead };
      Editor.project.clips.push(c);
      Editor.selectedId = c.id;
      this.render();
    },

    duplicateSelected() {
      const c = Editor.selected();
      if (!c) return;
      History.push();
      const n = { ...JSON.parse(JSON.stringify(c)), id: uid("clip"), start: c.start + c.duration };
      Editor.project.clips.push(n);
      Editor.selectedId = n.id;
      this.render();
    }
  };

  global.Timeline = Timeline;
})(window);
