/**
 * Microphone capture → 16-bit PCM @ 16 kHz mono.
 *
 * Uses an AudioWorklet that downsamples whatever the device sample rate is
 * (typically 48 kHz) to 16 kHz and emits 16-bit signed PCM frames. The
 * worklet code is registered as an inline data: URL so we don't need a
 * separate static file.
 */

const TARGET_SAMPLE_RATE = 16000;

const WORKLET_SOURCE = /* js */ `
class PCM16kWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._inSampleRate = sampleRate; // global from worklet scope
    this._outSampleRate = ${TARGET_SAMPLE_RATE};
    this._ratio = this._inSampleRate / this._outSampleRate;
    this._buffer = [];
    this._buffered = 0;
    // ~100ms of 16k mono = 1600 samples = 3200 bytes
    this._chunkSamples = ${TARGET_SAMPLE_RATE / 10};
    this._phase = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    if (!ch) return true;

    // Naive linear-interp downsampler (good enough for speech).
    while (this._phase < ch.length) {
      const i = Math.floor(this._phase);
      const frac = this._phase - i;
      const s = ch[i] * (1 - frac) + (ch[i + 1] ?? ch[i]) * frac;
      this._buffer.push(s);
      this._buffered++;
      this._phase += this._ratio;
      if (this._buffered >= this._chunkSamples) {
        this._flush();
      }
    }
    this._phase -= ch.length;
    return true;
  }

  _flush() {
    const out = new Int16Array(this._buffered);
    for (let i = 0; i < this._buffered; i++) {
      const s = Math.max(-1, Math.min(1, this._buffer[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(out.buffer, [out.buffer]);
    this._buffer = [];
    this._buffered = 0;
  }
}
registerProcessor("pcm16k-worklet", PCM16kWorklet);
`;

export type MicCapture = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  worklet: AudioWorkletNode;
  stream: MediaStream;
  stop: () => Promise<void>;
};

export async function startMicCapture(
  deviceId: string | undefined,
  onPcm: (chunk: ArrayBuffer) => void,
): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    },
  });

  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);

  const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  await context.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const worklet = new AudioWorkletNode(context, "pcm16k-worklet");
  worklet.port.onmessage = (e) => onPcm(e.data as ArrayBuffer);

  source.connect(worklet);
  // Worklet must reach destination on some browsers for the graph to run.
  worklet.connect(context.destination);

  return {
    context,
    source,
    worklet,
    stream,
    stop: async () => {
      try {
        worklet.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        await context.close();
      } catch {
        /* ignore */
      }
    },
  };
}

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput");
}
