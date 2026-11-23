import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowUpOutlined,
  CloseOutlined,
  DeleteOutlined,
  DragOutlined,
  HomeOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { Popconfirm } from 'antd';
import {
  BUILDING_DEFINITIONS,
  BUILDING_STAT_LABELS,
  DEMOLISH_REFUND_RATE,
  PLACEMENT_ISSUE_LABELS,
  RESOURCE_CODES,
  RESOURCE_LABELS,
  addResources,
  emptyResources,
  getBuildingDefinition,
  getBuildingLevel,
  getMaxLevel,
  missingResources,
  type BuildingStatKey,
  type ResourceBag,
  type WorldBuildingDTO,
} from '@cityverse/shared';
import { ProduceBadges } from '../farming/FarmHud';
import { jobProgress, useBuildingStore } from './buildingStore';

const RES_ICON: Record<string, string> = { coins: '🪙', wood: '🪵', stone: '🪨' };

function Pill({ children, style, testId }: { children: ReactNode; style?: CSSProperties; testId?: string }) {
  return (
    <div className="cv-cozy-hud-pill" data-testid={testId} style={{ position: 'absolute', zIndex: 22, ...style }}>
      {children}
    </div>
  );
}

function Cost({ cost, have }: { cost: ResourceBag; have: ResourceBag | null }) {
  return (
    <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      {RESOURCE_CODES.filter((c) => cost[c] > 0).map((c) => {
        const short = have ? have[c] < cost[c] : false;
        return (
          <span key={c} style={{ color: short ? '#c0392b' : '#463726', fontWeight: short ? 700 : 500 }} title={RESOURCE_LABELS[c]}>
            {RES_ICON[c]} {cost[c].toLocaleString('vi-VN')}
          </span>
        );
      })}
    </span>
  );
}

function useServerNow(active: boolean): number {
  const offset = useBuildingStore((s) => s.serverOffsetMs);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(Date.now() + offset), 250);
    return () => window.clearInterval(id);
  }, [active, offset]);
  return active ? now : Date.now() + offset;
}

function formatSeconds(s: number): string {
  const v = Math.max(0, Math.ceil(s));
  return v >= 60 ? `${Math.floor(v / 60)}p ${v % 60}s` : `${v}s`;
}

function Stats({ stats, next }: { stats: Partial<Record<BuildingStatKey, number>>; next?: Partial<Record<BuildingStatKey, number>> }) {
  return (
    <>
      {(Object.keys(stats) as BuildingStatKey[]).map((k) => (
        <div key={k} style={{ fontSize: 12 }}>
          {BUILDING_STAT_LABELS[k]}: <strong>{stats[k]}</strong>
          {next?.[k] !== undefined && next[k] !== stats[k] && <span style={{ color: '#2f7d4f' }}> → {next[k]}</span>}
        </div>
      ))}
    </>
  );
}

export function BuildingHud() {
  const [menuOpen, setMenuOpen] = useState(false);
  const buildings = useBuildingStore((s) => s.buildings);
  const resources = useBuildingStore((s) => s.resources);
  const placing = useBuildingStore((s) => s.placing);
  const preview = useBuildingStore((s) => s.preview);
  const selectedId = useBuildingStore((s) => s.selectedId);
  const busy = useBuildingStore((s) => s.busy);
  const error = useBuildingStore((s) => s.error);
  const notice = useBuildingStore((s) => s.notice);
  const canEdit = useBuildingStore((s) => s.canEdit);
  const maxJobs = useBuildingStore((s) => s.maxConcurrentJobs);
  const loaded = useBuildingStore((s) => s.loaded);
  const handlers = useBuildingStore((s) => s.handlers);
  const store = useBuildingStore.getState;

  const selected = buildings.find((b) => b.id === selectedId) ?? null;
  const jobs = buildings.filter((b) => b.activeJob).length;
  const serverNow = useServerNow(jobs > 0);
  const residents = buildings
    .filter((b) => b.status !== 'constructing')
    .reduce((sum, b) => sum + (getBuildingLevel(b.typeCode, b.level)?.stats.residents ?? 0), 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const s = useBuildingStore.getState();
      if (e.code === 'KeyT' && s.placing) s.rotatePlacing(e.shiftKey ? -1 : 1);
      else if (e.code === 'Escape') {
        if (s.placing) s.cancelPlacing();
        else s.select(null);
      } else if (e.code === 'KeyC' && s.canEdit) setMenuOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!notice && !error) return undefined;
    const id = window.setTimeout(() => {
      store().setNotice(null);
      store().setError(null);
    }, 4000);
    return () => window.clearTimeout(id);
  }, [notice, error, store]);

  return (
    <>
      {/* Resources (real values from the API) */}
      <Pill testId="resource-bar" style={{ top: 14, left: '50%', transform: 'translateX(-50%)', padding: '7px 14px', display: 'flex', gap: 14, alignItems: 'center', fontSize: 13, fontWeight: 600, color: '#463726' }}>
        {resources ? (
          RESOURCE_CODES.map((c) => (
            <span key={c} title={RESOURCE_LABELS[c]} data-testid={`resource-${c}`}>
              {RES_ICON[c]} {resources[c].toLocaleString('vi-VN')}
            </span>
          ))
        ) : (
          <span style={{ fontWeight: 500 }}>{loaded ? '—' : 'Đang tải tài nguyên…'}</span>
        )}
        <span title="Sức chứa cư dân">🏠 {residents}</span>
        <span title="Công trình đang thi công">🔨 {jobs}/{maxJobs}</span>
      </Pill>
      <ProduceBadges />

      {(notice || error) && (
        <Pill testId="building-toast" style={{ top: 100, left: '50%', transform: 'translateX(-50%)', padding: '7px 14px', fontSize: 13, fontWeight: 600, color: error ? '#a8322a' : '#2f6b3f', background: error ? 'rgba(255, 236, 232, 0.96)' : undefined, maxWidth: 460, textAlign: 'center' }}>
          {error ?? notice}
        </Pill>
      )}

      {/* Build menu */}
      {canEdit && (
        <button
          type="button"
          data-testid="open-build-menu"
          className={`cv-cozy-hud-btn ${menuOpen ? 'cv-cozy-hud-btn--active' : ''}`}
          style={{ position: 'absolute', zIndex: 22, top: 76, left: 14 }}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <HomeOutlined />
          <span>Xây công trình [C]</span>
        </button>
      )}
      {menuOpen && canEdit && (
        <Pill testId="build-menu" style={{ top: 118, left: 14, width: 290, padding: 10, maxHeight: 'calc(100vh - 230px)', overflowY: 'auto' }}>
          {BUILDING_DEFINITIONS.map((def) => {
            const l1 = def.levels[0];
            const count = buildings.filter((b) => b.typeCode === def.code).length;
            const limited = def.maxPerCity !== null && count >= def.maxPerCity;
            const short = resources ? missingResources(resources, l1.cost).length > 0 : true;
            return (
              <button
                key={def.code}
                type="button"
                data-testid={`build-${def.code}`}
                disabled={limited}
                onClick={() => {
                  store().startPlacing(def.code);
                  setMenuOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid rgba(124, 92, 56, 0.2)',
                  borderRadius: 10,
                  background: placing?.typeCode === def.code ? '#fff3d6' : 'rgba(255,255,255,0.7)',
                  padding: '7px 10px',
                  marginBottom: 6,
                  cursor: limited ? 'not-allowed' : 'pointer',
                  opacity: limited ? 0.55 : 1,
                  color: '#2b2116',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>{def.name}</span>
                  <span style={{ fontSize: 11, color: '#6b5842' }}>{def.code === 'road' ? 'Rộng 1,2 m · theo cạnh' : `${def.footprint.length} ô hex`}</span>
                </div>
                <div style={{ fontSize: 11, color: '#6b5842', margin: '2px 0 4px' }}>{l1.name} · {l1.buildSeconds}s</div>
                <div style={{ fontSize: 12 }}>
                  <Cost cost={l1.cost} have={resources} />
                </div>
                {limited && <div style={{ fontSize: 11, color: '#a8322a' }}>Đã đạt giới hạn ({def.maxPerCity})</div>}
                {!limited && short && <div style={{ fontSize: 11, color: '#a8322a' }}>Chưa đủ tài nguyên</div>}
              </button>
            );
          })}
        </Pill>
      )}

      {/* Placement bar */}
      {placing && (
        <Pill testId="placement-bar" style={{ bottom: 74, left: '50%', transform: 'translateX(-50%)', padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 'calc(100vw - 32px)' }}>
          <strong style={{ color: '#2b2116' }}>
            {placing.movingId ? 'Di chuyển' : 'Đặt'}: {getBuildingDefinition(placing.typeCode).name}
          </strong>
          {!placing.movingId && <Cost cost={getBuildingDefinition(placing.typeCode).levels[0].cost} have={resources} />}
          <span
            data-testid="placement-validity"
            className="cv-cozy-badge"
            style={{ background: !preview ? '#eee6d8' : preview.valid ? 'rgba(94, 224, 122, 0.3)' : 'rgba(255, 90, 74, 0.25)', color: !preview ? '#6b5842' : preview.valid ? '#1f6b34' : '#a8322a' }}
          >
            {!preview ? 'Rê chuột lên đất' : preview.valid ? 'Vị trí hợp lệ' : preview.issues.map((i) => PLACEMENT_ISSUE_LABELS[i]).join(' · ')}
          </span>
          <button type="button" className="cv-cozy-hud-btn" onClick={() => store().rotatePlacing(1)} title="Xoay 60° (T, Shift+T xoay ngược)">
            <RedoOutlined />
            <span>Xoay 60° [T]</span>
          </button>
          <button type="button" className="cv-cozy-hud-btn" onClick={() => store().cancelPlacing()}>
            <CloseOutlined />
            <span>Hủy [Esc]</span>
          </button>
          {placing.typeCode === 'road' && <span style={{ fontSize: 12 }}>Chọn ô sát công trình · T đổi cạnh · Click nối từng đoạn · Esc kết thúc</span>}
          {busy && <span style={{ fontSize: 12 }}>Đang gửi…</span>}
        </Pill>
      )}

      {/* Selected building panel */}
      {selected && !placing && (
        <BuildingPanel
          building={selected}
          resources={resources}
          serverNow={serverNow}
          busy={busy}
          canEdit={canEdit}
          jobsFull={jobs >= maxJobs}
          onClose={() => store().select(null)}
          onUpgrade={() => handlers?.upgrade(selected.id)}
          onMove={() => store().startMoving(selected)}
          onDemolish={() => handlers?.demolish(selected.id)}
        />
      )}
    </>
  );
}

function BuildingPanel(props: {
  building: WorldBuildingDTO;
  resources: ResourceBag | null;
  serverNow: number;
  busy: boolean;
  canEdit: boolean;
  jobsFull: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  onMove: () => void;
  onDemolish: () => void;
}) {
  const { building: b, resources, serverNow, busy, canEdit, jobsFull } = props;
  const def = getBuildingDefinition(b.typeCode);
  const current = getBuildingLevel(b.typeCode, b.level)!;
  const next = getBuildingLevel(b.typeCode, b.level + 1);
  const maxLevel = getMaxLevel(b.typeCode);
  const job = b.activeJob;
  const progress = jobProgress(b, serverNow);
  const remaining = job ? (new Date(job.finishesAt).getTime() - serverNow) / 1000 : 0;
  const missing = next && resources ? missingResources(resources, next.cost) : [];

  let upgradeBlock: string | null = null;
  if (!next) upgradeBlock = 'Đã đạt cấp tối đa';
  else if (b.status !== 'active') upgradeBlock = 'Đang thi công';
  else if (jobsFull) upgradeBlock = 'Đội thợ đang bận hết';
  else if (missing.length) upgradeBlock = `Thiếu ${missing.map((m) => RESOURCE_LABELS[m]).join(', ')}`;

  // Same rule as the server: unfinished job refunded in full + DEMOLISH_REFUND_RATE of built levels.
  const pending = job ? job.cost : emptyResources();
  const builtTotal = def.levels
    .filter((l) => l.level <= b.level && !(b.status === 'constructing' && l.level === 1))
    .reduce((acc, l) => addResources(acc, l.cost), emptyResources());
  const refundTotal = addResources(pending, builtTotal, DEMOLISH_REFUND_RATE);

  return (
    <Pill testId="building-panel" style={{ top: 76, right: 14, width: 310, padding: '12px 14px', color: '#463726' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#2b2116' }}>{def.name}</div>
          <div style={{ fontSize: 12 }} data-testid="building-level">
            Cấp {b.level}/{maxLevel} · {current.name}
          </div>
        </div>
        <button type="button" className="cv-cozy-hud-btn" onClick={props.onClose} aria-label="Đóng">
          <CloseOutlined />
        </button>
      </div>
      <div style={{ fontSize: 12, margin: '6px 0', color: '#6b5842' }}>{current.description}</div>
      <Stats stats={current.stats} next={next?.stats} />
      <div style={{ fontSize: 11, color: '#6b5842', marginTop: 4 }}>
        {def.footprint.length} ô hex · ô neo ({b.anchorQ}, {b.anchorR}) · hướng {b.rotation * 60}°
      </div>

      {job && (
        <div style={{ marginTop: 10 }} data-testid="construction-progress">
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            {job.jobType === 'build' ? 'Đang xây dựng' : `Đang nâng cấp lên cấp ${job.targetLevel}`} — {Math.round(progress * 100)}%
          </div>
          <div style={{ height: 9, background: '#eadfca', borderRadius: 6, overflow: 'hidden', marginTop: 4 }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', background: job.jobType === 'build' ? '#7dd36f' : '#ffc94d', transition: 'width 0.25s linear' }} />
          </div>
          <div style={{ fontSize: 11, marginTop: 3 }}>Còn lại {formatSeconds(remaining)}</div>
        </div>
      )}

      {next && (
        <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.6)', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Cấp tiếp theo: {next.name}</div>
          <div style={{ fontSize: 11, color: '#6b5842', margin: '2px 0 4px' }}>{next.description}</div>
          <div style={{ fontSize: 12 }}>
            Chi phí: <Cost cost={next.cost} have={resources} /> · {formatSeconds(next.buildSeconds)}
          </div>
        </div>
      )}

      {canEdit && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="upgrade-button"
            className={`cv-cozy-hud-btn ${upgradeBlock === null && !busy ? 'cv-cozy-hud-btn--active' : ''}`}
            disabled={busy || upgradeBlock !== null}
            title={upgradeBlock ?? 'Nâng cấp'}
            onClick={props.onUpgrade}
          >
            <ArrowUpOutlined />
            <span>{upgradeBlock && next ? upgradeBlock : next ? 'Nâng cấp' : 'Cấp tối đa'}</span>
          </button>
          {b.typeCode !== 'road' && <button type="button" className="cv-cozy-hud-btn" disabled={busy} onClick={() => {
            useBuildingStore.getState().startPlacing('road');
            useBuildingStore.getState().rotatePlacing(b.rotation + 1);
          }}>Xây lối đi</button>}
          <button type="button" className="cv-cozy-hud-btn" disabled={busy || b.status !== 'active'} onClick={props.onMove} title={b.status !== 'active' ? 'Đang thi công' : 'Di chuyển'}>
            <DragOutlined />
            <span>Di chuyển</span>
          </button>
          <Popconfirm
            title="Tháo dỡ công trình?"
            description={
              <span>
                Hoàn trả: <Cost cost={refundTotal} have={null} />
              </span>
            }
            okText="Tháo dỡ"
            cancelText="Giữ lại"
            onConfirm={props.onDemolish}
          >
            <button type="button" className="cv-cozy-hud-btn" disabled={busy} data-testid="demolish-button">
              <DeleteOutlined />
              <span>Tháo dỡ</span>
            </button>
          </Popconfirm>
        </div>
      )}
    </Pill>
  );
}
