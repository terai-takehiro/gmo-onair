// WebAudio MP3 chunk player. Decodes each chunk and schedules it back-to-back
// so playback is gapless. vMix Chromium requires a user gesture to start
// AudioContext; call `unlock()` after the operator clicks.

export class AudioPlayer {
  constructor() {
    this._ctx = null;
    /** @type {AudioBufferSourceNode | null} */
    this._lastSource = null;
    this._nextStartTime = 0;
    this._unlocked = false;
  }

  async unlock() {
    if (this._unlocked) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this._ctx.state === "suspended") {
      await this._ctx.resume();
    }
    this._nextStartTime = this._ctx.currentTime;
    this._unlocked = true;
  }

  /**
   * @param {string} b64
   */
  async enqueueBase64Mp3(b64) {
    if (!this._unlocked || !this._ctx) {
      // Try silent unlock attempt; will work if the autoplay policy allows.
      try {
        await this.unlock();
      } catch {
        return;
      }
    }
    const ctx = this._ctx;
    if (!ctx) return;

    let bytes;
    try {
      bytes = base64ToUint8(b64);
    } catch {
      return;
    }

    let buffer;
    try {
      buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
    } catch {
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const startAt = Math.max(this._nextStartTime, ctx.currentTime);
    src.start(startAt);
    this._nextStartTime = startAt + buffer.duration;
    this._lastSource = src;
  }
}

/**
 * @param {string} b64
 * @returns {Uint8Array}
 */
function base64ToUint8(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}
