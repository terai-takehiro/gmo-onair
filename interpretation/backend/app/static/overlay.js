// vMix transparent overlay client.
//
// Frames over WS (JSON):
//   { type: "translation", lang: "en", text: "...", seq: N, t_ms: ... }
//   { type: "audio_chunk",  lang: "en", seq: N, mp3_b64: "..." }
//   { type: "heartbeat" }
//   { type: "session_end" }

import { SubtitleStage } from "/static/overlay-subtitle.js";
import { AudioPlayer } from "/static/overlay-audio.js";

(function init() {
  const stage = document.getElementById("stage");
  const linesEl = document.getElementById("lines");
  const statusEl = document.getElementById("status");
  const statusText = document.getElementById("status-text");
  const audioUnlock = document.getElementById("audio-unlock");

  const sessionId = stage.dataset.session;
  const lang = stage.dataset.lang;
  const mode = stage.dataset.mode || "both";
  const wsUrl = stage.dataset.wsUrl;
  const fadeMs = parseInt(stage.dataset.fadeMs || "4500", 10);

  const showText = mode !== "audio";
  const showAudio = mode !== "text";

  const subtitle = new SubtitleStage(linesEl, { maxLines: 2, holdMs: fadeMs });
  const player = showAudio ? new AudioPlayer() : null;

  // vMix Chromium needs a user gesture to unlock AudioContext.
  if (audioUnlock && player) {
    audioUnlock.addEventListener("click", async () => {
      await player.unlock();
      audioUnlock.classList.add("hidden");
    });
  }

  function setStatus(state, text) {
    statusEl.dataset.state = state;
    statusText.textContent = text;
  }

  let socket = null;
  let backoffMs = 500;
  const maxBackoffMs = 10_000;
  let stopped = false;

  function connect() {
    setStatus("connecting", "connecting...");
    socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";

    socket.addEventListener("open", () => {
      backoffMs = 500;
      setStatus("open", "live");
    });

    socket.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      handleFrame(msg);
    });

    socket.addEventListener("error", () => {
      setStatus("error", "error");
    });

    socket.addEventListener("close", () => {
      setStatus("closed", "closed");
      if (stopped) return;
      setTimeout(connect, backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
    });
  }

  function handleFrame(msg) {
    switch (msg.type) {
      case "translation":
        if (showText && typeof msg.text === "string") {
          subtitle.push(msg.text, { isFinal: !!msg.is_final });
        }
        break;
      case "audio_chunk":
        if (showAudio && player && typeof msg.mp3_b64 === "string") {
          player.enqueueBase64Mp3(msg.mp3_b64);
        }
        break;
      case "heartbeat":
        break;
      case "session_end":
        stopped = true;
        try {
          socket?.close(1000, "session ended");
        } catch {}
        break;
      default:
        break;
    }
  }

  // Hide stage entirely if mode=audio.
  if (!showText) {
    stage.style.visibility = "hidden";
  }

  connect();

  window.addEventListener("beforeunload", () => {
    stopped = true;
    try {
      socket?.close(1000, "page unload");
    } catch {}
  });
})();
