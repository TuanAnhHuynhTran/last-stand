/**
 * Weather schedule (Phase 12) — purely visual/audible. It is derived from the world seed and
 * real time, so every visitor of a world sees the same sky, and it never touches game data
 * (no crop, animal or building state depends on it).
 */
export type WeatherKind = 'clear' | 'cloudy' | 'windy' | 'light_rain' | 'fog';
export type WeatherMode = 'auto' | WeatherKind;

export interface WeatherState {
  kind: WeatherKind;
  /** 0 … 1 */
  rain: number;
  wind: number;
  fog: number;
  cloud: number;
}

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: 'Trời quang',
  cloudy: 'Nhiều mây',
  windy: 'Gió lộng',
  light_rain: 'Mưa nhẹ',
  fog: 'Sương mù',
};

const PROFILE: Record<WeatherKind, Omit<WeatherState, 'kind'>> = {
  clear: { rain: 0, wind: 0.15, fog: 0, cloud: 0.05 },
  cloudy: { rain: 0, wind: 0.3, fog: 0.1, cloud: 0.55 },
  windy: { rain: 0, wind: 0.85, fog: 0, cloud: 0.3 },
  light_rain: { rain: 0.7, wind: 0.45, fog: 0.25, cloud: 0.8 },
  fog: { rain: 0, wind: 0.05, fog: 0.85, cloud: 0.45 },
};

/** Real minutes per weather spell. */
export const WEATHER_BLOCK_MINUTES = 40;
/** Minutes of blending into the next spell. */
const BLEND_MINUTES = 6;

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function kindFor(seed: number, block: number): WeatherKind {
  const r = hash(seed * 7919 + block);
  if (r < 0.45) return 'clear';
  if (r < 0.65) return 'cloudy';
  if (r < 0.8) return 'windy';
  if (r < 0.92) return 'light_rain';
  return 'fog';
}

export function profileOf(kind: WeatherKind): WeatherState {
  return { kind, ...PROFILE[kind] };
}

/** Weather at a moment; the last minutes of a spell blend smoothly into the next one. */
export function weatherAt(seed: number, ms: number, mode: WeatherMode = 'auto'): WeatherState {
  if (mode !== 'auto') return profileOf(mode);
  const blockMs = WEATHER_BLOCK_MINUTES * 60_000;
  const block = Math.floor(ms / blockMs);
  const into = (ms - block * blockMs) / 60_000;
  const a = profileOf(kindFor(seed, block));
  const blendStart = WEATHER_BLOCK_MINUTES - BLEND_MINUTES;
  if (into < blendStart) return a;
  const b = profileOf(kindFor(seed, block + 1));
  const t = (into - blendStart) / BLEND_MINUTES;
  const k = t * t * (3 - 2 * t);
  const mix = (x: number, y: number) => x + (y - x) * k;
  return { kind: k < 0.5 ? a.kind : b.kind, rain: mix(a.rain, b.rain), wind: mix(a.wind, b.wind), fog: mix(a.fog, b.fog), cloud: mix(a.cloud, b.cloud) };
}

/** Day phase label for the HUD. */
export function dayPhase(hour: number): 'dawn' | 'day' | 'dusk' | 'night' {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 7.5) return 'dawn';
  if (h >= 7.5 && h < 18) return 'day';
  if (h >= 18 && h < 21) return 'dusk';
  return 'night';
}

export const DAY_PHASE_LABELS = { dawn: 'Bình minh', day: 'Ban ngày', dusk: 'Hoàng hôn', night: 'Ban đêm' } as const;
