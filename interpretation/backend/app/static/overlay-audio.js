// Streaming MP3 player.
//
// We prefer MediaSource Extensions with audio/mpeg so chunks can be
// appended as they arrive, giving real streaming playback. vMix's
// Chromium ships with MSE + MP3 support. If MSE is unavailable, we fall
// back to the legacy decodeAudioData path which buffers a full segment
// before playing.
//
// Frames consumed:
//   {type: "audio_chunk", seq, chunk_seq, is_first, mp3_b64}
//   {type: "audio_end",   seq, chunk_seq}

const MIME = 'audio/mpeg';

export class AudioPlayer {
  constructor() {
    this._unlocked = false;
    this._mse = null;
    this._fallback = null;
  }

  async unlock() {
    if (this._unlocked) return;
    if ("MediaSource" in window && MediaSource.isTypeSupported(MIME)) {
      this._mse = new MseMp3Player();
      await this._mse.start();
    } else {
      this._fallback = new FallbackMp3Player();
      await this._fallback.unlock();
    }
    this._unlocked = true;
  }

  enqueueBase64Mp3(b64) {
    if (!this._unlocked) {
      this.unlock().catch(() => {});
      return;
    }
    if (this._mse) this._mse.append(base64ToUint8(b64));
    else if (this._fallback) this._fallback.enqueueBase64Mp3(b64);
  }

  segmentEnded() {
    // No-op for MSE — we keep the source open across segments. The
    // fallback path doesn't need this either since each enqueue is
    // independently scheduled.
  }
}

// ---- MSE-backed player ----

class MseMp3Player {
  constructor() {
    this._audio = new Audio();
    this._audio.autoplay = true;
    this._audio.crossOrigin = "anonymous";
    this._media = new MediaSource();
    this._sourceBuffer = null;
    this._queue = [];
    this._appending = false;
  }

  start() {
    this._audio.src = URL.createObjectURL(this._media);
    return new Promise((resolve, reject) => {
      this._media.addEventListener("sourceopen", () => {
        try {
          this._sourceBuffer = this._media.addSourceBuffer(MIME);
          this._sourceBuffer.mode = "sequence";
          this._sourceBuffer.addEventListener("updateend", () => this._drain());
          this._audio.play().catch(() => {});
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      this._media.addEventListener("error", reject);
    });
  }

  append(bytes) {
    this._queue.push(bytes);
    this._drain();
  }

  _drain() {
    if (
      this._appending ||
      !this._sourceBuffer ||
      this._sourceBuffer.updating ||
      this._queue.length === 0
    ) {
      return;
    }
    const next = this._queue.shift();
    this._appending = true;
    try {
      this._sourceBuffer.appendBuffer(next);
    } catch {
      this._appending = false;
      return;
    }
    this._sourceBuffer.addEventListener(
      "updateend",
      () => {
        this._appending = false;
        this._drain();
      },
      { once: true },
    );
  }
}

// ---- decodeAudioData fallback ----

class FallbackMp3Player {
  constructor() {
    this._ctx = null;
    this._nextStartTime = 0;
  }

  async unlock() {
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this._ctx.state === "suspended") await this._ctx.resume();
    this._nextStartTime = this._ctx.currentTime;
  }

  async enqueueBase64Mp3(b64) {
    if (!this._ctx) return;
    let buffer;
    try {
      buffer = await this._ctx.decodeAudioData(base64ToUint8(b64).buffer.slice(0));
    } catch {
      return;
    }
    const src = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this._ctx.destination);
    const startAt = Math.max(this._nextStartTime, this._ctx.currentTime);
    src.start(startAt);
    this._nextStartTime = startAt + buffer.duration;
  }
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}
