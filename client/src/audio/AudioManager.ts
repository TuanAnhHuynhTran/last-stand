/**
 * Audio manager (Phase 12). Every sound is synthesised with WebAudio at runtime — there are no
 * audio asset files, so nothing needs a licence. Channels (each with its own volume / mute,
 * saved in localStorage) feed one master gain:
 *   music · birds · wind · water · footsteps · construction · farming · animals · forge ·
 *   weapons · ui
 * Ambient beds (music, birds, wind, water) follow `setAmbience` (time of day, weather, camera
 * near water). One-shots are rate limited per channel. The AudioContext is created on the
 * first user gesture (browser autoplay rules); before that every call is a no-op.
 */
export const AUDIO_CHANNELS = ['music', 'birds', 'wind', 'water', 'footsteps', 'construction', 'farming', 'animals', 'forge', 'weapons', 'ui'] as const;
export type AudioChannel = (typeof AUDIO_CHANNELS)[number];

export const AUDIO_CHANNEL_LABELS: Record<AudioChannel, string> = {
  music: 'Nhạc nền',
  birds: 'Chim chóc',
  wind: 'Gió',
  water: 'Nước / mưa',
  footsteps: 'Bước chân',
  construction: 'Xây dựng',
  farming: 'Nông trại',
  animals: 'Vật nuôi',
  forge: 'Lò rèn',
  weapons: 'Vũ khí',
  ui: 'Giao diện',
};

export type OneShot =
  | 'click'
  | 'confirm'
  | 'error'
  | 'notify'
  | 'hammer'
  | 'saw'
  | 'hoe'
  | 'moo'
  | 'cluck'
  | 'baa'
  | 'anvil'
  | 'step'
  | 'swing'
  | 'thud'
  | 'twang'
  | 'clack'
  | 'thunk'
  | 'stomp'
  | 'block';

export interface AudioSettings {
  master: number;
  muted: boolean;
  channels: Record<AudioChannel, { volume: number; muted: boolean }>;
}

export interface Ambience {
  /** 0 night … 1 day */
  daylight: number;
  /** 0 … 1 */
  wind: number;
  /** 0 … 1 */
  rain: number;
  /** 0 … 1 — how close the camera is to water */
  water: number;
  /** music on (world / battle) */
  music: 'world' | 'battle' | 'off';
}

const STORAGE_KEY = 'lasthaven.audio.v1';
const DEFAULT_VOLUME: Record<AudioChannel, number> = { music: 0.45, birds: 0.5, wind: 0.45, water: 0.5, footsteps: 0.4, construction: 0.55, farming: 0.5, animals: 0.5, forge: 0.55, weapons: 0.7, ui: 0.5 };

export function defaultAudioSettings(): AudioSettings {
  return {
    master: 0.8,
    muted: false,
    channels: Object.fromEntries(AUDIO_CHANNELS.map((c) => [c, { volume: DEFAULT_VOLUME[c], muted: false }])) as AudioSettings['channels'],
  };
}

export function loadAudioSettings(): AudioSettings {
  const base = defaultAudioSettings();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<AudioSettings> | null;
    if (!raw) return base;
    const clamp = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
    base.master = clamp(raw.master, base.master);
    base.muted = Boolean(raw.muted);
    for (const c of AUDIO_CHANNELS) {
      const ch = raw.channels?.[c];
      if (ch) base.channels[c] = { volume: clamp(ch.volume, base.channels[c].volume), muted: Boolean(ch.muted) };
    }
  } catch {
    /* defaults */
  }
  return base;
}

/** Effective gain of a channel (0 when muted). */
export function channelGain(s: AudioSettings, c: AudioChannel): number {
  if (s.muted || s.channels[c].muted) return 0;
  return s.master * s.channels[c].volume;
}

const CHANNEL_OF: Record<OneShot, AudioChannel> = {
  click: 'ui', confirm: 'ui', error: 'ui', notify: 'ui',
  hammer: 'construction', saw: 'construction',
  hoe: 'farming',
  moo: 'animals', cluck: 'animals', baa: 'animals',
  anvil: 'forge',
  step: 'footsteps',
  swing: 'weapons', thud: 'weapons', twang: 'weapons', clack: 'weapons', thunk: 'weapons', stomp: 'weapons', block: 'weapons',
};

// Pentatonic scale for the generative music (C major pentatonic, two octaves).
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly gains = new Map<AudioChannel, GainNode>();
  private noise: AudioBuffer | null = null;
  private settings: AudioSettings = loadAudioSettings();
  private readonly listeners = new Set<(s: AudioSettings) => void>();
  private readonly recent = new Map<AudioChannel, number[]>();
  private ambience: Ambience = { daylight: 1, wind: 0.2, rain: 0, water: 0, music: 'off' };
  private beds: { wind?: { gain: GainNode; filter: BiquadFilterNode }; water?: { gain: GainNode; filter: BiquadFilterNode } } = {};
  private timers: number[] = [];
  /** Sounds started (for tests / the perf overlay) */
  played = 0;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get current(): AudioSettings {
    return this.settings;
  }

  subscribe(fn: (s: AudioSettings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Creates / resumes the context — call from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const c of AUDIO_CHANNELS) {
        const g = this.ctx.createGain();
        g.connect(this.master);
        this.gains.set(c, g);
      }
      const len = Math.floor(this.ctx.sampleRate * 2);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
      this.applyGains();
      this.startBeds();
    }
    void this.ctx.resume();
  }

  /** Output node of a channel (other synths, e.g. the training yard, play into it). */
  channel(c: AudioChannel): GainNode | null {
    return this.gains.get(c) ?? null;
  }

  update(patch: (s: AudioSettings) => void): void {
    const next: AudioSettings = JSON.parse(JSON.stringify(this.settings));
    patch(next);
    this.settings = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    this.applyGains();
    for (const fn of this.listeners) fn(next);
  }

  private applyGains(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.05);
    for (const c of AUDIO_CHANNELS) this.gains.get(c)!.gain.setTargetAtTime(channelGain({ ...this.settings, muted: false }, c), t, 0.05);
  }

  setAmbience(a: Partial<Ambience>): void {
    this.ambience = { ...this.ambience, ...a };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { wind, rain, water } = this.ambience;
    if (this.beds.wind) {
      this.beds.wind.gain.gain.setTargetAtTime(0.04 + 0.5 * wind, t, 0.8);
      this.beds.wind.filter.frequency.setTargetAtTime(300 + 900 * wind, t, 0.8);
    }
    if (this.beds.water) {
      this.beds.water.gain.gain.setTargetAtTime(Math.min(0.8, 0.35 * water + 0.6 * rain), t, 0.8);
      this.beds.water.filter.frequency.setTargetAtTime(rain > 0.1 ? 2600 : 900, t, 0.8);
    }
  }

  private startBeds(): void {
    const ctx = this.ctx!;
    const loop = (channel: AudioChannel, type: BiquadFilterType, freq: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.gains.get(channel)!);
      src.start();
      return { gain, filter };
    };
    this.beds.wind = loop('wind', 'lowpass', 500);
    this.beds.water = loop('water', 'bandpass', 900);
    this.setAmbience({});
    // Birds by day, a soft generative tune when music is on.
    this.timers.push(window.setInterval(() => this.birdTick(), 900));
    this.timers.push(window.setInterval(() => this.musicTick(), 650));
  }

  private birdTick(): void {
    const { daylight, rain } = this.ambience;
    if (!this.ctx || daylight < 0.4 || rain > 0.5 || Math.random() > 0.35 * daylight) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const base = 2200 + Math.random() * 1800;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i += 1) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + i * (0.09 + Math.random() * 0.05);
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), t);
      o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g).connect(this.gains.get('birds')!);
      o.start(t);
      o.stop(t + 0.1);
    }
    this.played += 1;
  }

  private step = 0;
  private musicTick(): void {
    const mode = this.ambience.music;
    if (!this.ctx || mode === 'off') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.step += 1;
    // Calm world: sparse plucks; battle: steadier pulse in a lower register.
    const battle = mode === 'battle';
    if (!battle && Math.random() < 0.45) return;
    const idx = battle ? [0, 2, 4, 2, 0, 3, 1, 4][this.step % 8] : Math.floor(Math.random() * SCALE.length);
    const f = SCALE[idx] * (battle ? 0.5 : 1);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = battle ? 'triangle' : 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(battle ? 0.12 : 0.09, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (battle ? 0.5 : 1.6));
    o.connect(g).connect(this.gains.get('music')!);
    o.start(now);
    o.stop(now + 1.7);
    if (this.step % 4 === 0) {
      // Soft root under it.
      const r = ctx.createOscillator();
      const rg = ctx.createGain();
      r.type = 'sine';
      r.frequency.value = SCALE[battle ? 0 : idx % 3] / 2;
      rg.gain.setValueAtTime(0.0001, now);
      rg.gain.exponentialRampToValueAtTime(0.06, now + 0.2);
      rg.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
      r.connect(rg).connect(this.gains.get('music')!);
      r.start(now);
      r.stop(now + 2.5);
    }
  }

  /** One-shot on its channel. volume 0..1 (distance attenuation done by the caller). */
  play(kind: OneShot, volume = 1): boolean {
    const ctx = this.ctx;
    const channel = CHANNEL_OF[kind];
    if (!ctx || volume < 0.03 || channelGain(this.settings, channel) === 0) return false;
    const now = ctx.currentTime;
    const list = (this.recent.get(channel) ?? []).filter((t) => now - t < 1);
    if (list.length >= (channel === 'ui' ? 12 : 8)) return false;
    list.push(now);
    this.recent.set(channel, list);
    const out = ctx.createGain();
    out.connect(this.gains.get(channel)!);
    const v = Math.min(1, volume) * (0.85 + Math.random() * 0.3);
    const env = (attack: number, decay: number, peak = v) => {
      out.gain.setValueAtTime(0.0001, now);
      out.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
      out.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    };
    const noise = (type: BiquadFilterType, freq: number, q: number, dur: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, now);
      f.Q.value = q;
      src.connect(f).connect(out);
      src.start(now, Math.random());
      src.stop(now + dur);
      return f;
    };
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, at = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, now + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + at + dur);
      o.connect(out);
      o.start(now + at);
      o.stop(now + at + dur + 0.02);
      return o;
    };
    switch (kind) {
      case 'click':
        env(0.002, 0.05, v * 0.5);
        tone('triangle', 1400, 900, 0.05);
        break;
      case 'confirm':
        env(0.004, 0.25, v * 0.5);
        tone('sine', 660, 660, 0.1);
        tone('sine', 990, 990, 0.14, 0.08);
        break;
      case 'error':
        env(0.004, 0.25, v * 0.5);
        tone('square', 220, 160, 0.22);
        break;
      case 'notify':
        env(0.005, 0.5, v * 0.45);
        tone('sine', 880, 880, 0.12);
        tone('sine', 1320, 1320, 0.3, 0.12);
        break;
      case 'hammer':
        env(0.002, 0.12);
        tone('square', 520, 300, 0.05);
        noise('bandpass', 1800, 3, 0.06);
        break;
      case 'saw':
        env(0.05, 0.3, v * 0.5);
        noise('bandpass', 3200, 4, 0.35);
        break;
      case 'hoe':
        env(0.004, 0.14, v * 0.7);
        noise('lowpass', 700, 0.8, 0.14);
        break;
      case 'moo': {
        env(0.15, 0.7, v * 0.6);
        const o = tone('sawtooth', 160, 120, 0.85);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 700;
        o.disconnect();
        o.connect(lp).connect(out);
        break;
      }
      case 'cluck':
        env(0.003, 0.08, v * 0.6);
        tone('square', 900, 500, 0.06);
        break;
      case 'baa':
        env(0.06, 0.45, v * 0.5);
        tone('sawtooth', 420, 380, 0.5);
        break;
      case 'anvil':
        env(0.001, 0.9, v * 0.6);
        tone('sine', 1250, 1240, 0.9);
        tone('sine', 2730, 2700, 0.5);
        noise('highpass', 4000, 1, 0.03);
        break;
      case 'step':
        env(0.003, 0.08, v * 0.5);
        noise('lowpass', 400 + Math.random() * 300, 0.7, 0.08);
        break;
      case 'swing': {
        env(0.05, 0.18, v * 0.5);
        const f = noise('bandpass', 600, 1.2, 0.25);
        f.frequency.exponentialRampToValueAtTime(2400, now + 0.18);
        break;
      }
      case 'thud':
        env(0.005, 0.16);
        tone('sine', 180, 60, 0.16);
        noise('lowpass', 900, 0.7, 0.08);
        break;
      case 'twang':
        env(0.003, 0.3, v * 0.6);
        tone('triangle', 330, 290, 0.3);
        break;
      case 'clack':
        env(0.002, 0.07, v * 0.8);
        noise('highpass', 2500, 1, 0.07);
        tone('square', 900, 400, 0.05);
        break;
      case 'thunk':
        env(0.003, 0.12);
        tone('sine', 260, 110, 0.12);
        noise('bandpass', 1500, 2, 0.05);
        break;
      case 'stomp':
        env(0.005, 0.2, v * 0.7);
        tone('sine', 90, 45, 0.2);
        break;
      case 'block':
        env(0.001, 0.25, v * 0.7);
        tone('triangle', 1800, 1500, 0.2);
        noise('highpass', 3000, 1, 0.04);
        break;
    }
    this.played += 1;
    return true;
  }

  dispose(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.gains.clear();
    this.beds = {};
  }
}

/** The app-wide instance. */
export const audio = new AudioManager();

/** Unlocks audio on the first gesture and clicks every button through the UI channel. */
export function installAudioUnlock(): () => void {
  const unlock = () => audio.unlock();
  const click = (e: Event) => {
    const el = (e.target as HTMLElement | null)?.closest?.('button, a[href], [role="tab"]');
    if (el && !(el as HTMLButtonElement).disabled) audio.play('click', 0.7);
  };
  window.addEventListener('pointerdown', unlock, { once: false, passive: true });
  window.addEventListener('keydown', unlock, { once: false });
  window.addEventListener('click', click, true);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('click', click, true);
  };
}
