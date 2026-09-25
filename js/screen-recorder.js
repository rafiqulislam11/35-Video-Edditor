/**
 * AI Video Editor Pro — Screen & Webcam Capture Studio
 * Class A: Browser-native getDisplayMedia & getUserMedia recording.
 * Supports: Screen, Camera, Combined Screen + Webcam (PiP), Mic & System audio.
 */
(function (global) {
  "use strict";

  const ScreenRecorder = {
    screenStream: null,
    cameraStream: null,
    micStream: null,
    combinedStream: null,
    recorder: null,
    chunks: [],
    timerInterval: null,
    startTime: 0,
    elapsedSeconds: 0,
    isPaused: false,
    canvas: null,
    ctx: null,
    animFrame: null,
    screenVideo: null,
    cameraVideo: null,
    audioCtx: null,

    init() {
      const startBtn = document.getElementById("sr-start");
      const pauseBtn = document.getElementById("sr-pause");
      const resumeBtn = document.getElementById("sr-resume");
      const stopBtn = document.getElementById("sr-stop");
      const layoutSelect = document.getElementById("sr-preview");
      const webcamCheck = document.getElementById("sr-webcam");

      if (startBtn) startBtn.addEventListener("click", () => this.start());
      if (pauseBtn) pauseBtn.addEventListener("click", () => this.pause());
      if (resumeBtn) resumeBtn.addEventListener("click", () => this.resume());
      if (stopBtn) stopBtn.addEventListener("click", () => this.stopAndAdd());

      if (layoutSelect) {
        layoutSelect.addEventListener("change", (e) => {
          const lbl = document.getElementById("sr-preview-label");
          if (lbl) {
            const map = {
              screen: "Screen Only",
              camera: "Webcam Only",
              "screen-camera": "Screen + Webcam PiP"
            };
            lbl.textContent = map[e.target.value] || e.target.value;
          }
          if (webcamCheck) {
            webcamCheck.checked = e.target.value !== "screen";
          }
        });
      }

      if (webcamCheck) {
        webcamCheck.addEventListener("change", (e) => {
          if (layoutSelect) {
            if (!e.target.checked && layoutSelect.value === "screen-camera") {
              layoutSelect.value = "screen";
            } else if (e.target.checked && layoutSelect.value === "screen") {
              layoutSelect.value = "screen-camera";
            }
          }
        });
      }
    },

    updateStatus(text, kind = "ready") {
      const pill = document.getElementById("sr-status");
      if (!pill) return;
      pill.textContent = text;
      pill.className = "status-pill " + kind;
      if (kind === "recording") {
        pill.style.background = "var(--danger)";
        pill.style.color = "#fff";
      } else if (kind === "paused") {
        pill.style.background = "var(--warn)";
        pill.style.color = "#000";
      } else {
        pill.style.background = "";
        pill.style.color = "";
      }
    },

    updateTimer() {
      const timerEl = document.getElementById("sr-timer");
      if (!timerEl) return;
      const m = Math.floor(this.elapsedSeconds / 60);
      const s = this.elapsedSeconds % 60;
      timerEl.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    },

    setControlsState(state) {
      const startBtn = document.getElementById("sr-start");
      const pauseBtn = document.getElementById("sr-pause");
      const resumeBtn = document.getElementById("sr-resume");
      const stopBtn = document.getElementById("sr-stop");

      if (state === "recording") {
        if (startBtn) startBtn.disabled = true;
        if (pauseBtn) { pauseBtn.disabled = false; pauseBtn.hidden = false; }
        if (resumeBtn) { resumeBtn.disabled = true; resumeBtn.hidden = true; }
        if (stopBtn) stopBtn.disabled = false;
      } else if (state === "paused") {
        if (startBtn) startBtn.disabled = true;
        if (pauseBtn) { pauseBtn.disabled = true; pauseBtn.hidden = true; }
        if (resumeBtn) { resumeBtn.disabled = false; resumeBtn.hidden = false; }
        if (stopBtn) stopBtn.disabled = false;
      } else {
        // idle
        if (startBtn) startBtn.disabled = false;
        if (pauseBtn) { pauseBtn.disabled = true; pauseBtn.hidden = false; }
        if (resumeBtn) { resumeBtn.disabled = true; resumeBtn.hidden = true; }
        if (stopBtn) stopBtn.disabled = true;
      }
    },

    async start() {
      const layout = document.getElementById("sr-preview") ? document.getElementById("sr-preview").value : "screen-camera";
      const wantMic = document.getElementById("sr-mic") ? document.getElementById("sr-mic").checked : true;
      const wantSystem = document.getElementById("sr-system") ? document.getElementById("sr-system").checked : true;

      this.chunks = [];
      this.elapsedSeconds = 0;
      this.updateTimer();

      try {
        // Audio capture
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioDest = this.audioCtx.createMediaStreamDestination();

        if (wantMic) {
          try {
            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const micSource = this.audioCtx.createMediaStreamSource(this.micStream);
            micSource.connect(audioDest);
          } catch (err) {
            console.warn("Microphone not available or denied:", err);
            UI.toast("Microphone denied or not connected", "err");
          }
        }

        // Screen capture
        if (layout === "screen" || layout === "screen-camera") {
          try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
              video: { frameRate: { ideal: 30, max: 60 } },
              audio: wantSystem
            });
            if (wantSystem && this.screenStream.getAudioTracks().length) {
              const sysSource = this.audioCtx.createMediaStreamSource(this.screenStream);
              sysSource.connect(audioDest);
            }
            // Listen for user stopping sharing via browser toolbar
            this.screenStream.getVideoTracks()[0].addEventListener("ended", () => {
              if (this.recorder && this.recorder.state !== "inactive") {
                this.stopAndAdd();
              }
            });
          } catch (err) {
            console.warn("Screen share cancelled or failed:", err);
            UI.toast("Screen capture cancelled", "err");
            this.cleanup();
            return;
          }
        }

        // Camera capture
        if (layout === "camera" || layout === "screen-camera") {
          try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
              audio: false
            });
          } catch (err) {
            console.warn("Camera not available:", err);
            if (layout === "camera") {
              UI.toast("Webcam permission denied or camera not found", "err");
              this.cleanup();
              return;
            }
          }
        }

        // Setup output stream
        let finalStream;
        if (layout === "screen" && this.screenStream && !this.cameraStream) {
          finalStream = new MediaStream([
            ...this.screenStream.getVideoTracks(),
            ...audioDest.stream.getAudioTracks()
          ]);
        } else if (layout === "camera" && this.cameraStream && !this.screenStream) {
          finalStream = new MediaStream([
            ...this.cameraStream.getVideoTracks(),
            ...audioDest.stream.getAudioTracks()
          ]);
        } else {
          // Combined Screen + Webcam (PiP compositor)
          finalStream = this.createPipStream(audioDest.stream);
        }

        let mimeType = "video/webm;codecs=vp9,opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "video/webm;codecs=vp8,opus";
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "video/webm";
        }

        this.recorder = new MediaRecorder(finalStream, {
          mimeType,
          videoBitsPerSecond: 4000000
        });

        this.recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            this.chunks.push(e.data);
          }
        };

        this.recorder.onstop = () => {
          this.finishRecording();
        };

        this.recorder.start(1000); // 1s slices
        this.startTime = Date.now();
        this.isPaused = false;
        this.setControlsState("recording");
        this.updateStatus("Recording…", "recording");

        this.timerInterval = setInterval(() => {
          if (!this.isPaused) {
            this.elapsedSeconds++;
            this.updateTimer();
          }
        }, 1000);

        UI.toast("Recording started!");
      } catch (err) {
        console.error("Recording start error:", err);
        UI.toast("Failed to start recording: " + err.message, "err");
        this.cleanup();
      }
    },

    createPipStream(audioStream) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = 1920;
      this.canvas.height = 1080;
      this.ctx = this.canvas.getContext("2d");

      if (this.screenStream) {
        this.screenVideo = document.createElement("video");
        this.screenVideo.srcObject = this.screenStream;
        this.screenVideo.muted = true;
        this.screenVideo.play().catch(() => {});
      }

      if (this.cameraStream) {
        this.cameraVideo = document.createElement("video");
        this.cameraVideo.srcObject = this.cameraStream;
        this.cameraVideo.muted = true;
        this.cameraVideo.play().catch(() => {});
      }

      const drawLoop = () => {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = "#0a0d14";
        ctx.fillRect(0, 0, w, h);

        // Draw Screen Background
        if (this.screenVideo && this.screenVideo.readyState >= 2) {
          ctx.drawImage(this.screenVideo, 0, 0, w, h);
        }

        // Draw Camera PiP in Bottom-Right
        if (this.cameraVideo && this.cameraVideo.readyState >= 2) {
          const pipW = 420;
          const pipH = 260;
          const pad = 36;
          const pipX = w - pipW - pad;
          const pipY = h - pipH - pad;
          const radius = 16;

          ctx.save();
          // PiP Shadow
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = 24;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 10;

          // Rounded PiP clipping
          ctx.beginPath();
          ctx.roundRect(pipX, pipY, pipW, pipH, radius);
          ctx.fillStyle = "#000";
          ctx.fill();
          ctx.clip();

          ctx.shadowColor = "transparent";
          ctx.drawImage(this.cameraVideo, pipX, pipY, pipW, pipH);

          // Border
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(108,140,255,0.85)";
          ctx.stroke();
          ctx.restore();
        }

        this.animFrame = requestAnimationFrame(drawLoop);
      };

      drawLoop();

      const canvasStream = this.canvas.captureStream(30);
      audioStream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
      return canvasStream;
    },

    pause() {
      if (this.recorder && this.recorder.state === "recording") {
        this.recorder.pause();
        this.isPaused = true;
        this.setControlsState("paused");
        this.updateStatus("Paused", "paused");
        UI.toast("Recording paused");
      }
    },

    resume() {
      if (this.recorder && this.recorder.state === "paused") {
        this.recorder.resume();
        this.isPaused = false;
        this.setControlsState("recording");
        this.updateStatus("Recording…", "recording");
        UI.toast("Recording resumed");
      }
    },

    stopAndAdd() {
      if (!this.recorder || this.recorder.state === "inactive") return;
      UI.loading(true, "Finalizing capture…", 50);
      this.recorder.stop();
      this.setControlsState("idle");
      this.updateStatus("Processing…", "ready");
    },

    async finishRecording() {
      clearInterval(this.timerInterval);
      cancelAnimationFrame(this.animFrame);

      const blob = new Blob(this.chunks, { type: "video/webm" });
      const filename = `recording_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`;
      const file = new File([blob], filename, { type: "video/webm" });

      this.cleanup();

      try {
        await VideoEditor.addFile(file);
        this.updateStatus("Ready", "ready");
        UI.toast("Capture added to Media and Timeline! 🎉");
      } catch (err) {
        console.error("Failed to add recorded video:", err);
        UI.toast("Error adding capture to editor", "err");
      }
      UI.loading(false);
    },

    cleanup() {
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((t) => t.stop());
        this.screenStream = null;
      }
      if (this.cameraStream) {
        this.cameraStream.getTracks().forEach((t) => t.stop());
        this.cameraStream = null;
      }
      if (this.micStream) {
        this.micStream.getTracks().forEach((t) => t.stop());
        this.micStream = null;
      }
      if (this.screenVideo) {
        this.screenVideo.srcObject = null;
        this.screenVideo = null;
      }
      if (this.cameraVideo) {
        this.cameraVideo.srcObject = null;
        this.cameraVideo = null;
      }
      if (this.audioCtx && this.audioCtx.state !== "closed") {
        this.audioCtx.close().catch(() => {});
        this.audioCtx = null;
      }
      clearInterval(this.timerInterval);
      cancelAnimationFrame(this.animFrame);
      this.setControlsState("idle");
      this.updateStatus("Ready", "ready");
    }
  };

  global.ScreenRecorder = ScreenRecorder;
})(window);
