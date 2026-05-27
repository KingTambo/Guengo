const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const CAPTURE_BUFFER = 1024;
/** Software boost for quiet mics (browser AGC off — we control levels). */
const MIC_INPUT_GAIN = 3.5;

function softClip(sample: number): number {
  return Math.tanh(sample);
}

function floatToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

function resampleToRate(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) {
    return input;
  }

  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const source = i * ratio;
    const left = Math.floor(source);
    const right = Math.min(left + 1, input.length - 1);
    const weight = source - left;
    output[i] = input[left]! * (1 - weight) + input[right]! * weight;
  }

  return output;
}

function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export type PcmCaptureOptions = {
  onChunk: (base64Pcm: string) => void;
  onLevel?: (level: number) => void;
};

/** Stream microphone audio as 16 kHz PCM chunks for Gemini Live API. */
export class PcmCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private silentGain: GainNode | null = null;
  private levelData: Uint8Array | null = null;
  private sending = false;
  private handlers: PcmCaptureOptions | null = null;

  get isActive(): boolean {
    return this.stream !== null;
  }

  /** Open mic once — stays hot for the whole session (no re-permission each turn). */
  async ensureStarted(options: PcmCaptureOptions): Promise<void> {
    this.handlers = options;
    if (this.stream) {
      await this.context?.resume();
      return;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });

    this.context = new AudioContext({ sampleRate: INPUT_RATE });
    await this.context.resume();

    this.source = this.context.createMediaStreamSource(this.stream);
    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = MIC_INPUT_GAIN;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.levelData = new Uint8Array(this.analyser.frequencyBinCount);

    this.processor = this.context.createScriptProcessor(CAPTURE_BUFFER, 1, 1);
    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < input.length; i += 1) {
        sum += input[i]! * input[i]!;
      }
      this.handlers?.onLevel?.(Math.sqrt(sum / input.length));

      if (!this.sending) return;

      const resampled = resampleToRate(input, this.context!.sampleRate, INPUT_RATE);
      const pcm = new Int16Array(resampled.length);
      for (let i = 0; i < resampled.length; i += 1) {
        pcm[i] = floatToInt16(softClip(resampled[i]!));
      }
      this.handlers?.onChunk(int16ToBase64(pcm));
    };

    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;

    this.source.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.context.destination);
  }

  setSending(enabled: boolean): void {
    this.sending = enabled;
  }

  stop(): void {
    this.sending = false;
    this.handlers = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.gainNode?.disconnect();
    this.analyser?.disconnect();
    this.silentGain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();

    this.processor = null;
    this.source = null;
    this.gainNode = null;
    this.analyser = null;
    this.silentGain = null;
    this.stream = null;
    this.context = null;
    this.levelData = null;
  }
}

/** Play 24 kHz PCM chunks from Gemini Live API. */
export class PcmPlayer {
  private context: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private closed = false;

  private ensureAudioContextReady(): AudioContext {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext({ sampleRate: OUTPUT_RATE });
      this.nextStartTime = this.context.currentTime;
      this.closed = false;
    }
    return this.context;
  }

  /** Resume output after browser autoplay gate (usually unlocked on user gesture). */
  async resumeOutput(): Promise<AudioContext> {
    const ctx = this.ensureAudioContextReady();
    try {
      await ctx.resume();
    } catch {
      // still try to schedule chunks — playback may fail until gesture
    }
    return ctx;
  }

  /** Pre-create playback context and resume where allowed. */
  warm(): void {
    void this.resumeOutput();
  }

  enqueueBase64(base64: string): void {
    if (this.closed) return;
    void this.enqueueBase64Async(base64);
  }

  private async enqueueBase64Async(base64: string): Promise<void> {
    if (this.closed) return;

    const pcm = base64ToInt16(base64);
    if (pcm.length === 0) return;

    try {
      const ctx = await this.resumeOutput();
      const buffer = ctx.createBuffer(1, pcm.length, OUTPUT_RATE);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i += 1) {
        channel[i] = pcm[i]! / 0x8000;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const startAt = Math.max(ctx.currentTime, this.nextStartTime);
      source.start(startAt);
      this.nextStartTime = startAt + buffer.duration;
      this.activeSources.add(source);

      source.onended = () => {
        this.activeSources.delete(source);
      };
    } catch {
      /* decode or scheduling failure */
    }
  }

  isPlaying(): boolean {
    if (!this.context || this.closed) return false;
    return this.activeSources.size > 0 || this.context.currentTime < this.nextStartTime - 0.05;
  }

  /** Stop playback but keep player ready for the next reply. */
  stop(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();
    if (this.context) {
      this.nextStartTime = this.context.currentTime;
    }
  }

  close(): void {
    this.closed = true;
    this.stop();
    void this.context?.close();
    this.context = null;
  }
}

/** Play a single cached PCM clip (24 kHz); resolves when playback ends (`onended`, not `isPlaying()` rAF). */
export async function playPcmBase64Once(base64: string): Promise<void> {
  const pcm = base64ToInt16(base64);
  if (pcm.length === 0) {
    return;
  }

  const ctx = new AudioContext({ sampleRate: OUTPUT_RATE });
  try {
    await ctx.resume();
  } catch {
    // autoplay gates — callers should unlock on user gesture before this
  }

  const buffer = ctx.createBuffer(1, pcm.length, OUTPUT_RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) {
    channel[i] = pcm[i]! / 0x8000;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  await new Promise<void>((resolve, reject) => {
    source.onended = () => {
      void ctx.close();
      resolve();
    };
    try {
      source.start();
    } catch (err) {
      void ctx.close();
      reject(err);
    }
  });
}

/**
 * Play raw 24 kHz mono **little-endian signed int16** PCM (`ArrayBuffer`/view). Resolves when playback ends.
 * Used for bundled `/public/audio/openings/*.pcm`.
 */
export async function playRawPcm24kMonoLeOnce(pcmBytes: ArrayBufferLike): Promise<void> {
  const buf = pcmBytes.byteLength >= 2 ? new Int16Array(pcmBytes) : new Int16Array(0);
  if (buf.length === 0) {
    return;
  }

  const ctx = new AudioContext({ sampleRate: OUTPUT_RATE });
  try {
    await ctx.resume();
  } catch {
    // autoplay gates — callers should unlock before this
  }

  const floatBuf = ctx.createBuffer(1, buf.length, OUTPUT_RATE);
  const channel = floatBuf.getChannelData(0);
  for (let i = 0; i < buf.length; i++) {
    channel[i] = buf[i]! / 0x8000;
  }

  const source = ctx.createBufferSource();
  source.buffer = floatBuf;
  source.connect(ctx.destination);

  await new Promise<void>((resolve, reject) => {
    source.onended = () => {
      void ctx.close();
      resolve();
    };
    try {
      source.start();
    } catch (err) {
      void ctx.close();
      reject(err);
    }
  });
}
