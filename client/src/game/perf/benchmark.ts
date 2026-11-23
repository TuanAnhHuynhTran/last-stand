/**
 * In-game benchmark (Phase 12). Measures REAL frame times with requestAnimationFrame while the
 * camera tours fixed viewpoints, then reports average FPS, 1 % low, p95 frame time, worst
 * frame and the renderer counters seen. Nothing here estimates or invents numbers: a report
 * only exists after a run on the player's own machine.
 */
import type { WorldPerfStats } from '../world/worldViewStore';

export interface BenchmarkSummary {
  frames: number;
  seconds: number;
  avgFps: number;
  /** FPS of the slowest 1 % of frames */
  low1Fps: number;
  p95FrameMs: number;
  worstFrameMs: number;
}

export interface BenchmarkReport extends BenchmarkSummary {
  quality: string;
  weather: string;
  startedAt: string;
  userAgent: string;
  screen: string;
  devicePixelRatio: number;
  maxDrawCalls: number;
  maxTriangles: number;
  textures: number;
  geometries: number;
  loadMs: number | null;
  scene: { chunks: number; buildings: number; villagers: number; animals: number; soldiers: number; vegetation: number };
}

/** Pure: frame durations (ms) → summary. */
export function summarizeFrames(frameMs: readonly number[]): BenchmarkSummary {
  const n = frameMs.length;
  if (!n) return { frames: 0, seconds: 0, avgFps: 0, low1Fps: 0, p95FrameMs: 0, worstFrameMs: 0 };
  const total = frameMs.reduce((a, b) => a + b, 0);
  const sorted = [...frameMs].sort((a, b) => a - b);
  const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
  const slow = sorted.slice(Math.floor(n * 0.99));
  const slowAvg = slow.reduce((a, b) => a + b, 0) / Math.max(1, slow.length);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { frames: n, seconds: r1(total / 1000), avgFps: r1((n * 1000) / total), low1Fps: r1(1000 / slowAvg), p95FrameMs: r1(p95), worstFrameMs: r1(sorted[n - 1]) };
}

export interface BenchmarkHooks {
  /** Moves the camera to viewpoint i (0..stops-1). */
  goTo: (stop: number) => void;
  stats: () => WorldPerfStats;
  quality: string;
}

/** Runs the tour; resolves with the report. `seconds` total, split over `stops` viewpoints. */
export function runBenchmark(hooks: BenchmarkHooks, seconds = 20, stops = 5, onProgress?: (p: number) => void): Promise<BenchmarkReport> {
  return new Promise((resolve) => {
    const frames: number[] = [];
    const startedAt = new Date().toISOString();
    let maxDraw = 0;
    let maxTri = 0;
    let last = performance.now();
    const t0 = last;
    let stop = -1;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const elapsed = now - t0;
      const s = Math.min(stops - 1, Math.floor((elapsed / (seconds * 1000)) * stops));
      if (s !== stop) {
        stop = s;
        hooks.goTo(s);
      } else frames.push(dt);
      const st = hooks.stats();
      maxDraw = Math.max(maxDraw, st.drawCalls);
      maxTri = Math.max(maxTri, st.triangles);
      onProgress?.(Math.min(1, elapsed / (seconds * 1000)));
      if (elapsed < seconds * 1000) requestAnimationFrame(tick);
      else {
        const st2 = hooks.stats();
        resolve({
          ...summarizeFrames(frames),
          quality: hooks.quality,
          weather: st2.weather ?? 'clear',
          startedAt,
          userAgent: navigator.userAgent,
          screen: `${window.innerWidth}×${window.innerHeight}`,
          devicePixelRatio: window.devicePixelRatio,
          maxDrawCalls: maxDraw,
          maxTriangles: maxTri,
          textures: st2.textures ?? 0,
          geometries: st2.geometries,
          loadMs: st2.loadMs ?? null,
          scene: { chunks: st2.loadedChunks, buildings: st2.buildings ?? 0, villagers: st2.villagers ?? 0, animals: st2.animals ?? 0, soldiers: st2.soldiers ?? 0, vegetation: st2.vegetationInstances },
        });
      }
    };
    requestAnimationFrame((now) => {
      last = now;
      tick(now);
    });
  });
}
