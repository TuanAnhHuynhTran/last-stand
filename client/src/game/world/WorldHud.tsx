import { useExplorationStore } from './explorationStore';
import { MusicToggle } from '../../audio/MusicToggle';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AimOutlined,
  BuildOutlined,
  CloseOutlined,
  DashboardOutlined,
  EyeOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { HEX_TERRAIN_LABELS } from '@cityverse/shared';
import { QUALITY_LABELS, type QualityLevel } from './qualitySettings';
import { useWorldViewStore, type CameraPreset, type HexInfo } from './worldViewStore';
import { runBenchmark, type BenchmarkReport } from '../perf/benchmark';
import { WEATHER_LABELS, type WeatherKind, type WeatherMode } from './weather';

const PRESET_LABELS: Record<CameraPreset, string> = { near: 'Gần', default: 'Vừa', far: 'Xa' };
const PRESET_ORDER: CameraPreset[] = ['near', 'default', 'far'];

function Pill({ children, style, testId }: { children: ReactNode; style?: React.CSSProperties; testId?: string }) {
  return (
    <div className="cv-cozy-hud-pill" data-testid={testId} style={{ position: 'absolute', zIndex: 20, ...style }}>
      {children}
    </div>
  );
}

function HexDetails({ hex }: { hex: HexInfo }) {
  const active = useExplorationStore(s => s.active);
  const state = useExplorationStore(s => s.state);
  const tile = state?.tiles.find(t => t.q === hex.q && t.r === hex.r);
  if (active && !tile) return <span>({hex.q}, {hex.r}) ? Ch?a kh?m ph?</span>;
  if (active && tile?.status !== 'claimed') return <span>({hex.q}, {hex.r}) ? {tile?.terrain ? HEX_TERRAIN_LABELS[tile.terrain] : ''} ? Ch?a s? h?u ? Kh?ng th? x?y {tile?.reason}</span>;

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cv-cozy-badge cv-cozy-badge--gold" data-testid="hovered-hex-coord">
          ⬡ q {hex.q} · r {hex.r}
        </span>
        <span className="cv-cozy-badge cv-cozy-badge--grass">{HEX_TERRAIN_LABELS[hex.type]}</span>
      </div>
      <div style={{ fontSize: 11, color: '#63503c', marginTop: 4 }}>
        Cao {hex.height.toFixed(1)} m · dốc {hex.slope.toFixed(1)} m · chunk ({hex.chunkX},{hex.chunkZ})
      </div>
      <div style={{ fontSize: 11, marginTop: 2, color: hex.owned ? '#2f7d4f' : '#8a6a3a', fontWeight: 600 }}>
        {hex.owned ? 'Đất đã sở hữu' : 'Chưa sở hữu'} · {hex.buildable ? 'Xây được' : 'Không xây được'}
      </div>
    </>
  );
}

export function WorldHud({ onExit, title }: { onExit: () => void; title: ReactNode }) {
  const [showHelp, setShowHelp] = useState(false);
  const mode = useWorldViewStore((s) => s.mode);
  const toggleMode = useWorldViewStore((s) => s.toggleMode);
  const quality = useWorldViewStore((s) => s.quality);
  const setQuality = useWorldViewStore((s) => s.setQuality);
  const cameraPreset = useWorldViewStore((s) => s.cameraPreset);
  const setCameraPreset = useWorldViewStore((s) => s.setCameraPreset);
  const issueCameraCommand = useWorldViewStore((s) => s.issueCameraCommand);
  const showPerf = useWorldViewStore((s) => s.showPerf);
  const togglePerf = useWorldViewStore((s) => s.togglePerf);
  const hovered = useWorldViewStore((s) => s.hovered);
  const selected = useWorldViewStore((s) => s.selected);
  const clearSelection = useWorldViewStore((s) => s.clearSelection);
  const stats = useWorldViewStore((s) => s.stats);
  const ready = useWorldViewStore((s) => s.ready);
  const weatherMode = useWorldViewStore((s) => s.weatherMode);
  const [bench, setBench] = useState<{ progress: number; report: BenchmarkReport | null } | null>(null);

  const startBenchmark = (): void => {
    setBench({ progress: 0, report: null });
    const store = useWorldViewStore.getState();
    void runBenchmark(
      {
        goTo: (i) => {
          const s = useWorldViewStore.getState();
          if (i === 0) s.issueCameraCommand({ type: 'home' });
          else s.setCameraPreset(PRESET_ORDER[i % PRESET_ORDER.length]);
        },
        stats: () => useWorldViewStore.getState().stats,
        quality: store.quality,
      },
      20,
      5,
      (p) => setBench((b) => (b && !b.report && Math.abs(b.progress - p) > 0.04 ? { ...b, progress: p } : b))
    ).then((report) => setBench({ progress: 1, report }));
  };

  const cyclePreset = (): void => {
    const next = PRESET_ORDER[(PRESET_ORDER.indexOf(cameraPreset) + 1) % PRESET_ORDER.length];
    setCameraPreset(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const s = useWorldViewStore.getState();
      if (e.code === 'KeyB') s.toggleMode();
      else if (e.code === 'KeyH') s.issueCameraCommand({ type: 'home' });
      else if (e.code === 'KeyP') s.togglePerf();
      else if (e.code === 'KeyV') {
        const next = PRESET_ORDER[(PRESET_ORDER.indexOf(s.cameraPreset) + 1) % PRESET_ORDER.length];
        s.setCameraPreset(next);
      } else if (e.code === 'Escape') s.clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ownedSelected = selected.filter((h) => h.owned).length;

  return (
    <>
      {!ready && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(253, 240, 216, 0.85)',
            color: '#5b4630',
            fontWeight: 700,
          }}
        >
          Đang dựng thế giới chibi từ world seed…
        </div>
      )}

      <Pill style={{ top: 14, left: 14, padding: '9px 14px' }}>{title}</Pill>

      <Pill style={{ top: 14, right: 14, padding: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <MusicToggle />
        <button
          type="button"
          data-testid="toggle-build-mode"
          className={`cv-cozy-hud-btn ${mode === 'build' ? 'cv-cozy-hud-btn--active' : ''}`}
          onClick={toggleMode}
          title="Chế độ xây dựng hiện lưới hex (phím B)"
        >
          <BuildOutlined />
          <span>{mode === 'build' ? 'Xây dựng' : 'Thường'} [B]</span>
        </button>
        <button type="button" className="cv-cozy-hud-btn" onClick={cyclePreset} title="Đổi góc nhìn gần / xa (phím V)">
          <EyeOutlined />
          <span>Góc nhìn: {PRESET_LABELS[cameraPreset]} [V]</span>
        </button>
        <button
          type="button"
          className="cv-cozy-hud-btn"
          onClick={() => issueCameraCommand({ type: 'home' })}
          title="Đưa camera về nhà trung tâm lãnh địa (phím H)"
        >
          <AimOutlined />
          <span>Lãnh địa [H]</span>
        </button>
        <label className="cv-cozy-hud-btn" style={{ gap: 6 }} title="Chất lượng đồ họa">
          <SettingOutlined />
          <select
            aria-label="Chất lượng đồ họa"
            data-testid="quality-select"
            value={quality}
            onChange={(e) => setQuality(e.target.value as QualityLevel)}
            style={{ background: 'transparent', border: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
          >
            {(Object.keys(QUALITY_LABELS) as QualityLevel[]).map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABELS[q]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`cv-cozy-hud-btn ${showPerf ? 'cv-cozy-hud-btn--gold' : ''}`}
          onClick={togglePerf}
          title="Hiện FPS / draw calls (phím P)"
        >
          <DashboardOutlined />
          <span>FPS [P]</span>
        </button>
        <button type="button" className="cv-cozy-hud-btn" onClick={onExit}>
          <CloseOutlined />
          <span>Dashboard</span>
        </button>
      </Pill>

      {showPerf && (
        <Pill
          testId="perf-panel"
          style={{ bottom: 64, right: 16, padding: '8px 12px', fontSize: 12, lineHeight: 1.6, color: '#463726', minWidth: 190 }}
        >
          <div style={{ fontWeight: 700 }}>Hiệu năng ({QUALITY_LABELS[quality]})</div>
          <div>FPS: {stats.fps} · {stats.frameMs} ms</div>
          <div>Draw calls: {stats.drawCalls}</div>
          <div>Tam giác: {stats.triangles.toLocaleString('vi-VN')}</div>
          <div>
            Chunk: {stats.loadedChunks}/{stats.totalChunks}
            {stats.pendingChunks > 0 ? ` (đang tải ${stats.pendingChunks})` : ''}
          </div>
          <div>Cây/cỏ/đá hiển thị: {stats.vegetationInstances.toLocaleString('vi-VN')}</div>
          <div>Geometries: {stats.geometries} · Textures: {stats.textures ?? 0} · Shaders: {stats.programs ?? 0}</div>
          <div>
            Nhà: {stats.buildings ?? 0} · Dân: {stats.villagers ?? 0} · Thú: {stats.animals ?? 0} · Lính: {stats.soldiers ?? 0}
          </div>
          <div>
            Đèn: {stats.lamps ?? 0} · Mưa: {stats.rainDrops ?? 0} hạt · {WEATHER_LABELS[(stats.weather as WeatherKind) ?? 'clear'] ?? stats.weather}
          </div>
          <div>Tải vùng đầu: {stats.loadMs != null ? `${(stats.loadMs / 1000).toFixed(1)} s` : '…'}</div>
          <label style={{ display: 'block', marginTop: 4 }}>
            Thời tiết:{' '}
            <select value={weatherMode} onChange={(e) => useWorldViewStore.getState().setWeatherMode(e.target.value as WeatherMode)} data-testid="weather-mode">
              <option value="auto">Tự động</option>
              {(Object.keys(WEATHER_LABELS) as WeatherKind[]).map((k) => (
                <option key={k} value={k}>
                  {WEATHER_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" style={{ marginTop: 6 }} disabled={Boolean(bench && !bench.report)} onClick={startBenchmark} data-testid="run-benchmark">
            {bench && !bench.report ? `Đang đo… ${Math.round(bench.progress * 100)}%` : '⏱ Đo hiệu năng 20 s'}
          </button>
          {bench?.report && (
            <div data-testid="benchmark-report" style={{ marginTop: 6, borderTop: '1px solid #0002', paddingTop: 4 }}>
              <div style={{ fontWeight: 700 }}>Kết quả đo thật ({bench.report.quality})</div>
              <div>
                TB {bench.report.avgFps} FPS · 1% thấp {bench.report.low1Fps} FPS
              </div>
              <div>
                p95 {bench.report.p95FrameMs} ms · tệ nhất {bench.report.worstFrameMs} ms · {bench.report.frames} khung
              </div>
              <div>
                Draw calls tối đa {bench.report.maxDrawCalls} · {bench.report.maxTriangles.toLocaleString('vi-VN')} tam giác
              </div>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(bench.report, null, 2))}>
                📋 Sao chép báo cáo JSON
              </button>
            </div>
          )}
        </Pill>
      )}

      <Pill testId="hex-inspector" style={{ bottom: 16, left: 16, padding: '8px 13px', minWidth: 240 }}>
        {hovered ? (
          <HexDetails hex={hovered} />
        ) : (
          <span style={{ fontSize: 12, color: '#6b5842' }}>⬡ Rê chuột lên mặt đất để xem ô hex</span>
        )}
      </Pill>

      {mode === 'build' && (
        <Pill
          testId="build-panel"
          style={{
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 12px',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <Legend color="#7ef0b0" label="Đã sở hữu" />
          <Legend color="#ffc94d" label="Ranh giới" />
          <Legend color="#ffffff" label="Xây được" />
          <Legend color="#ff8f7a" label="Không xây được" />
          <Legend color="#bdefff" label="Mặt nước" />
          {selected.length > 0 ? (
            <>
              <span className="cv-cozy-badge cv-cozy-badge--water" data-testid="selection-count">
                Đã chọn {selected.length} ô ({ownedSelected} sở hữu)
              </span>
              <button type="button" className="cv-cozy-hud-btn" onClick={clearSelection}>
                <CloseOutlined />
                <span>Bỏ chọn [Esc]</span>
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: '#6b5842' }}>Click để chọn ô · Shift+Click chọn thêm</span>
          )}
        </Pill>
      )}

      <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {showHelp && (
          <div className="cv-cozy-hud-pill" style={{ padding: '10px 14px', width: 260, fontSize: 12, lineHeight: 1.6, color: '#463726' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Điều khiển</div>
            <div>• Kéo chuột trái / WASD: di chuyển</div>
            <div>• Kéo chuột phải / Q, E: xoay · R, F: nghiêng</div>
            <div>• Cuộn chuột / + −: phóng to, thu nhỏ</div>
            <div>• Nhấp đúp: đưa camera tới điểm đó</div>
            <div>• B: chế độ xây dựng · V: góc nhìn · H: về lãnh địa</div>
          </div>
        )}
        <button
          type="button"
          className={`cv-cozy-hud-btn ${showHelp ? 'cv-cozy-hud-btn--gold' : ''}`}
          style={{ borderRadius: 999, height: 38, paddingInline: 14 }}
          onClick={() => setShowHelp((v) => !v)}
        >
          <QuestionCircleOutlined />
          <span>Hướng dẫn</span>
        </button>
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#463726' }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, border: '1px solid rgba(70,55,38,0.35)' }} />
      {label}
    </span>
  );
}
