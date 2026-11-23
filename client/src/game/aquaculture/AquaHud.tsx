import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUpOutlined, CheckOutlined, ClearOutlined, CloseOutlined, DeleteOutlined, ExpandAltOutlined } from '@ant-design/icons';
import { Popconfirm } from 'antd';
import {
  DEMOLISH_REFUND_RATE,
  FISH_FEED_DEFINITIONS,
  FISH_SPECIES_DEFINITIONS,
  FISH_STAGE_LABELS,
  MIN_STOCKING_WATER,
  PRODUCE_ICONS,
  RESOURCE_CODES,
  RESOURCE_LABELS,
  WATER_BODY_DEFINITIONS,
  addResources,
  cropProgress,
  emptyResources,
  fishFeedPerMinute,
  fishStockCode,
  fryStockCode,
  getFishSpecies,
  getWaterBodyDefinition,
  getWaterBodyLevel,
  growthFactor,
  missingResources,
  simulateAquaculture,
  targetWeight,
  waterBodyCreateCost,
  waterBodyExpandCost,
  waterBodyUpgradeCost,
  waterFillCost,
  type AquaSimState,
  type FishFeedDefinition,
  type FishSpeciesCode,
  type ProduceBag,
  type ProduceCode,
  type ResourceBag,
  type WaterBodyDTO,
} from '@cityverse/shared';
import { waterIssueLabel } from '../../api/aquaculture.api';
import { useBuildingStore } from '../buildings/buildingStore';
import { useFarmStore } from '../farming/farmStore';
import { useLivestockStore } from '../livestock/livestockStore';
import { useAquaStore } from './aquaStore';

const RES_ICON: Record<string, string> = { coins: '🪙', wood: '🪵', stone: '🪨' };
const TYPE_ICON: Record<string, string> = { fish_pond: '🐟', fish_lake: '🌊', hatchery: '🐣', fish_cage: '🛶' };
const FISH_ICON: Record<FishSpeciesCode, string> = { carp: '🐠', tilapia: '🐟', catfish: '🐡', snakehead: '🐍' };
const small: CSSProperties = { padding: '0 7px', fontSize: 11 };

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

const Bar = ({ value, color, testId }: { value: number; color: string; testId?: string }) => (
  <div data-testid={testId} style={{ height: 8, background: '#eadfca', borderRadius: 6, overflow: 'hidden', marginTop: 3 }}>
    <div style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%`, height: '100%', background: color, transition: 'width 0.4s linear' }} />
  </div>
);

const Section = ({ title, children, testId }: { title: ReactNode; children: ReactNode; testId?: string }) => (
  <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.6)', borderRadius: 10 }} data-testid={testId}>
    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{title}</div>
    {children}
  </div>
);

const fmt = (s: number): string => {
  const v = Math.max(0, Math.ceil(s));
  return v >= 60 ? `${Math.floor(v / 60)}p ${v % 60}s` : `${v}s`;
};

function useServerNow(active: boolean): number {
  const offset = useAquaStore((s) => s.serverOffsetMs);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(Date.now() + offset), 500);
    return () => window.clearInterval(id);
  }, [active, offset]);
  return active ? now : Date.now() + offset;
}

/** Same simulation as the server, from the last sync to now (live bars between syncs). */
function predict(b: WaterBodyDTO, nowMs: number): AquaSimState {
  const state: AquaSimState = {
    type: b.type,
    level: b.level,
    hexCount: b.hexes.length,
    waterLevel: b.waterLevel,
    quality: b.waterQuality,
    feedStock: b.feedStock,
    feedQuality: b.feedQuality,
    fill: b.fillStartedAt && b.fillFinishesAt ? { startedAtMs: new Date(b.fillStartedAt).getTime(), finishesAtMs: new Date(b.fillFinishesAt).getTime() } : null,
    batches: b.batches.map((x) => ({ id: x.id, species: x.species, alive: x.alive, weight: x.weight, health: x.health, satiety: x.satiety })),
  };
  const from = new Date(b.simulatedAt).getTime();
  return nowMs > from ? simulateAquaculture(state, from, nowMs).state : state;
}

/** Harvested fish (kg) and fry for the shared produce bar. */
export function FishStockBadges() {
  const fish = useAquaStore((s) => s.fish);
  return (
    <>
      {FISH_SPECIES_DEFINITIONS.map((f) => {
        const kg = fish[fishStockCode(f.code)] ?? 0;
        const fry = fish[fryStockCode(f.code)] ?? 0;
        if (!kg && !fry) return null;
        return (
          <span key={f.code} title={`${f.name}: ${kg} kg${fry ? ` · ${fry} cá giống` : ''}`} data-testid={`fish-${f.code}`}>
            {FISH_ICON[f.code]} {kg}kg{fry ? ` +${fry}🐣` : ''}
          </span>
        );
      })}
    </>
  );
}

export function AquaHud() {
  const [menuOpen, setMenuOpen] = useState(false);
  const bodies = useAquaStore((s) => s.bodies);
  const draft = useAquaStore((s) => s.draft);
  const check = useAquaStore((s) => s.draftCheck);
  const selectedId = useAquaStore((s) => s.selectedId);
  const busy = useAquaStore((s) => s.busy);
  const handlers = useAquaStore((s) => s.handlers);
  const resources = useBuildingStore((s) => s.resources);
  const canEdit = useBuildingStore((s) => s.canEdit);
  const placing = useBuildingStore((s) => s.placing);
  const produce = useFarmStore((s) => s.produce);
  const fish = useAquaStore((s) => s.fish);
  const selected = bodies.find((b) => b.id === selectedId) ?? null;
  const serverNow = useServerNow(bodies.length > 0);
  const store = useAquaStore.getState;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const s = useAquaStore.getState();
      if (e.code === 'Escape') {
        if (s.draft) s.cancelDraft();
        else s.select(null);
      } else if (e.code === 'Enter' && s.draft) s.handlers?.commitDraft();
      else if (e.code === 'KeyO' && useBuildingStore.getState().canEdit) setMenuOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // One selection at a time across buildings, fields, livestock farms and ponds.
  useEffect(() => {
    const offs = [
      useBuildingStore.subscribe((s, p) => {
        if (s.selectedId && s.selectedId !== p.selectedId) useAquaStore.getState().select(null);
      }),
      useFarmStore.subscribe((s, p) => {
        if (s.selectedZoneId && s.selectedZoneId !== p.selectedZoneId) useAquaStore.getState().select(null);
      }),
      useLivestockStore.subscribe((s, p) => {
        if (s.selectedFarmId && s.selectedFarmId !== p.selectedFarmId) useAquaStore.getState().select(null);
      }),
    ];
    return () => offs.forEach((o) => o());
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    useBuildingStore.getState().select(null);
    useFarmStore.getState().selectZone(null);
    useLivestockStore.getState().selectFarm(null);
  }, [selectedId]);

  const def = draft ? getWaterBodyDefinition(draft.type) : null;
  const expanding = draft?.expandId ? bodies.find((b) => b.id === draft.expandId) ?? null : null;
  const draftCost =
    draft && draft.hexes.length ? (expanding ? waterBodyExpandCost(expanding.type, expanding.level, draft.hexes.length) : waterBodyCreateCost(draft.type, draft.hexes.length)) : null;

  return (
    <>
      {canEdit && (
        <button
          type="button"
          data-testid="open-aqua-menu"
          className={`cv-cozy-hud-btn ${menuOpen || draft ? 'cv-cozy-hud-btn--active' : ''}`}
          style={{ position: 'absolute', zIndex: 22, top: 76, left: 516 }}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span>🐟</span>
          <span>Thủy sản [O]</span>
        </button>
      )}

      {menuOpen && canEdit && (
        <Pill testId="aqua-menu" style={{ top: 118, left: 516, width: 310, padding: 10, maxHeight: 'calc(100vh - 230px)', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: '#6b5842', marginBottom: 6 }}>
            <strong>Đào ao:</strong> chọn loại, rồi <strong>kéo chuột trái</strong> trên lưới hex để tô hình dạng ao bạn muốn (liền nhau, trong lãnh địa).
          </div>
          {WATER_BODY_DEFINITIONS.map((d) => (
            <button
              key={d.code}
              type="button"
              data-testid={`aqua-${d.code}`}
              onClick={() => {
                store().startDraft(d.code);
                setMenuOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: '1px solid rgba(124, 92, 56, 0.2)',
                borderRadius: 10,
                background: draft?.type === d.code ? '#e6f7ff' : 'rgba(255,255,255,0.7)',
                padding: '7px 10px',
                marginBottom: 6,
                cursor: 'pointer',
                color: '#2b2116',
              }}
            >
              <div style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {TYPE_ICON[d.code]} {d.name}
                </span>
                <span style={{ fontSize: 11, color: '#6b5842' }}>≥ {d.minHexes} ô{d.dug ? '' : ' mặt nước'}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6b5842', margin: '2px 0 4px' }}>{d.description}</div>
              <div style={{ fontSize: 12 }}>
                {d.minHexes} ô: <Cost cost={waterBodyCreateCost(d.code, d.minHexes)} have={resources} />
              </div>
            </button>
          ))}
        </Pill>
      )}

      {draft && def && !placing && (
        <Pill
          testId="aqua-draft-bar"
          style={{ bottom: 74, left: '50%', transform: 'translateX(-50%)', padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 'calc(100vw - 32px)' }}
        >
          <strong style={{ color: '#2b2116' }}>
            {expanding ? 'Mở rộng' : def.dug ? 'Đào' : 'Đặt'}: {TYPE_ICON[draft.type]} {def.name}
          </strong>
          <span style={{ fontSize: 12 }} data-testid="aqua-draft-count">
            {expanding ? `${expanding.hexes.length} + ${draft.hexes.length} ô` : `${draft.hexes.length}/${def.minHexes}+ ô`}
          </span>
          {draftCost && <Cost cost={draftCost} have={resources} />}
          {check?.levels && def.dug && (
            <span style={{ fontSize: 11, color: '#2f6fa8' }} title="Mặt nước ngay dưới mép bờ thấp nhất">
              sâu {(check.levels.surface - check.levels.bottom).toFixed(1)} m
            </span>
          )}
          <span
            data-testid="aqua-draft-validity"
            className="cv-cozy-badge"
            style={{
              background: !check ? '#eee6d8' : check.valid ? 'rgba(94, 224, 122, 0.3)' : 'rgba(255, 90, 74, 0.25)',
              color: !check ? '#6b5842' : check.valid ? '#1f6b34' : '#a8322a',
            }}
          >
            {!check
              ? def.dug
                ? 'Kéo chuột trái để chọn ô đất cần đào (tô lại để bỏ)'
                : 'Chọn ô mặt nước sông / hồ cạnh lãnh địa'
              : check.valid
                ? 'Vùng hợp lệ'
                : check.issues.map((i) => (i === 'TOO_SMALL' ? `Cần tối thiểu ${def.minHexes} ô` : waterIssueLabel(i))).join(' · ')}
          </span>
          <button
            type="button"
            data-testid="aqua-draft-confirm"
            className={`cv-cozy-hud-btn ${check?.valid && !busy ? 'cv-cozy-hud-btn--active' : ''}`}
            disabled={!check?.valid || busy}
            onClick={() => handlers?.commitDraft()}
          >
            <CheckOutlined />
            <span>{expanding ? 'Mở rộng [Enter]' : def.dug ? 'Đào ao [Enter]' : 'Đặt lồng [Enter]'}</span>
          </button>
          <button type="button" className="cv-cozy-hud-btn" onClick={() => store().clearDraft()} disabled={!draft.hexes.length}>
            <ClearOutlined />
            <span>Xóa chọn</span>
          </button>
          <button type="button" className="cv-cozy-hud-btn" onClick={() => store().cancelDraft()}>
            <CloseOutlined />
            <span>Hủy [Esc]</span>
          </button>
        </Pill>
      )}

      {selected && !draft && !placing && (
        <PondPanel body={selected} resources={resources} produce={produce} fish={fish} serverNow={serverNow} busy={busy} canEdit={canEdit} onClose={() => store().select(null)} />
      )}
    </>
  );
}

function PondPanel(props: {
  body: WaterBodyDTO;
  resources: ResourceBag | null;
  produce: ProduceBag | null;
  fish: Record<string, number>;
  serverNow: number;
  busy: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { body: b, resources, produce, fish, serverNow, busy, canEdit } = props;
  const h = useAquaStore.getState().handlers;
  const def = getWaterBodyDefinition(b.type);
  const lvl = getWaterBodyLevel(b.type, b.level)!;
  const next = getWaterBodyLevel(b.type, b.level + 1);
  const upCost = next ? waterBodyUpgradeCost(b.type, next.level, b.hexes.length) : null;
  const upMissing = upCost && resources ? missingResources(resources, upCost) : [];
  const live = useMemo(() => predict(b, serverNow), [b, serverNow]);
  const [species, setSpecies] = useState<FishSpeciesCode>('tilapia');
  const [source, setSource] = useState<'market' | 'hatchery'>('market');
  const room = Math.max(0, b.capacity - b.fishCount);
  const fry = fish[fryStockCode(species)] ?? 0;
  const price = getFishSpecies(species).fryPrice;
  const prepLeft = b.readyAt ? (new Date(b.readyAt).getTime() - serverNow) / 1000 : 0;
  const fillProgress = b.fillStartedAt && b.fillFinishesAt ? cropProgress(new Date(b.fillStartedAt).getTime(), new Date(b.fillFinishesAt).getTime(), serverNow) : null;
  const upProgress = b.status === 'upgrading' && b.upgradeStartedAt && b.upgradeFinishesAt ? cropProgress(new Date(b.upgradeStartedAt).getTime(), new Date(b.upgradeFinishesAt).getTime(), serverNow) : null;
  const harvestable = live.batches.filter((x) => x.weight >= targetWeight(b.type, x.species) - 1e-6).length;
  const feedPerMin = fishFeedPerMinute(live.batches);
  const refund = addResources(emptyResources(), b.invested, DEMOLISH_REFUND_RATE);
  const quality = live.quality;
  const qColor = quality > 0.65 ? '#3fb07f' : quality > 0.4 ? '#e0a93a' : '#c0392b';
  const canStock = live.waterLevel >= MIN_STOCKING_WATER && prepLeft <= 0;

  let upgradeBlock: string | null = null;
  if (!next) upgradeBlock = 'Đã đạt cấp tối đa';
  else if (b.status === 'upgrading') upgradeBlock = 'Đang nâng cấp';
  else if (upMissing.length) upgradeBlock = `Thiếu ${upMissing.map((m) => RESOURCE_LABELS[m]).join(', ')}`;

  const stockOptions = [10, 50, 100].filter((n) => n <= room);
  if (room > 0 && !stockOptions.includes(room)) stockOptions.push(room);

  return (
    <Pill testId="pond-panel" style={{ top: 76, right: 14, width: 350, padding: '12px 14px', color: '#463726', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#2b2116' }}>
            {TYPE_ICON[b.type]} {def.name}
          </div>
          <div style={{ fontSize: 12 }} data-testid="pond-level">
            Cấp {b.level}/3 · {lvl.name} · {b.hexes.length} ô
          </div>
        </div>
        <button type="button" className="cv-cozy-hud-btn" onClick={props.onClose} aria-label="Đóng">
          <CloseOutlined />
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#6b5842', margin: '4px 0' }}>{lvl.description}</div>
      <div style={{ fontSize: 12 }} data-testid="pond-size">
        {def.dug ? `💧 ${b.area.toLocaleString('vi-VN')} m² · ${b.volume.toLocaleString('vi-VN')} m³ · bờ ${b.shoreline} m · sâu ${(b.surfaceHeight - b.bottomHeight).toFixed(1)} m` : `🛶 ${b.hexes.length} lồng trên mặt nước tự nhiên`}
      </div>
      {upProgress !== null && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Đang nâng cấp lên cấp {b.level + 1} — {Math.round(upProgress * 100)}% (giữ nguyên hình dạng ao)</div>
          <Bar value={upProgress} color="#7ad0ff" />
        </div>
      )}

      <Section title="Nước" testId="pond-water">
        <div style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: '2px 6px', alignItems: 'center', fontSize: 11 }}>
          <span>🌊 Mực nước</span>
          <Bar value={live.waterLevel} color="#4a9ee0" testId="pond-water-level" />
          <span>✨ Chất lượng</span>
          <Bar value={quality} color={qColor} testId="pond-quality" />
          <span>🐟 Mật độ</span>
          <Bar value={b.density} color={b.density > 0.8 ? '#c0392b' : '#7dd36f'} />
        </div>
        <div style={{ fontSize: 11, marginTop: 4 }}>
          {Math.round(live.waterLevel * 100)}% · chất lượng {Math.round(quality * 100)}% · {b.fishCount}/{b.capacity} cá
          {lvl.autoRefill && def.dug ? ' · cống tự cấp nước' : def.dug ? ' · ao đất bốc hơi dần' : ''}
          {lvl.aerators ? ' · máy sục khí' : ''}
        </div>
        {b.records.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 22, marginTop: 4 }} title="Lịch sử chất lượng nước" data-testid="pond-history">
            {b.records.map((r) => (
              <div key={r.recordedAt} style={{ flex: 1, height: `${Math.max(8, r.quality * 100)}%`, background: r.quality > 0.65 ? '#7fd0b0' : r.quality > 0.4 ? '#f0c86a' : '#e88a7a', borderRadius: 2 }} />
            ))}
          </div>
        )}
        {fillProgress !== null && <div style={{ fontSize: 11, marginTop: 4 }}>Đang cấp nước… {Math.round(fillProgress * 100)}%</div>}
        {canEdit && def.dug && (
          <button
            type="button"
            data-testid="pond-fill"
            className={`cv-cozy-hud-btn ${live.waterLevel < 0.5 && !busy ? 'cv-cozy-hud-btn--active' : ''}`}
            disabled={busy || live.waterLevel >= 0.99 || fillProgress !== null}
            onClick={() => h?.fill(b.id)}
            style={{ marginTop: 6 }}
          >
            <span>🚰</span>
            <span>Cấp nước (🪙{Math.ceil(waterFillCost(b.type, b.hexes.length) * (1 - b.waterLevel))})</span>
          </button>
        )}
      </Section>

      <Section title={`Đàn cá ${b.cycle ? `· vụ từ ${new Date(b.cycle.startedAt).toLocaleTimeString('vi-VN')}` : ''}`} testId="pond-fish">
        {live.batches.length === 0 && <div style={{ fontSize: 11, color: '#6b5842' }}>{prepLeft > 0 ? `Đang vệ sinh ao cho vụ mới — còn ${fmt(prepLeft)}.` : 'Chưa có cá — thả cá giống để bắt đầu vụ nuôi.'}</div>}
        {live.batches.map((x) => {
          const f = getFishSpecies(x.species);
          const target = targetWeight(b.type, x.species);
          const g = growthFactor(live, x);
          const dto = b.batches.find((y) => y.id === x.id);
          return (
            <div key={x.id} style={{ fontSize: 11, margin: '4px 0' }} data-testid="pond-batch">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {FISH_ICON[x.species]} <strong>{f.name}</strong> × {Math.floor(x.alive)}
                  {dto && dto.stocked > Math.floor(x.alive) ? <span style={{ color: '#a8322a' }}> (hao {dto.stocked - Math.floor(x.alive)})</span> : null}
                </span>
                <span>{FISH_STAGE_LABELS[x.weight >= target - 1e-6 ? 'harvestable' : x.weight < target * 0.3 ? 'fry' : 'growing']}</span>
              </div>
              <div style={{ color: '#6b5842' }}>
                {(x.weight * 1000).toFixed(0)} g / {(target * 1000).toFixed(0)} g · sức khỏe {Math.round(x.health * 100)}% · no {Math.round(x.satiety * 100)}% · lớn ×{g.toFixed(2)}
              </div>
              <Bar value={x.weight / target} color={x.weight >= target ? '#f2c84b' : '#7dd36f'} />
            </div>
          );
        })}
        {canEdit && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, flexWrap: 'wrap' }}>
              <select aria-label="Loài cá" value={species} onChange={(e) => setSpecies(e.target.value as FishSpeciesCode)} style={{ fontSize: 11 }}>
                {FISH_SPECIES_DEFINITIONS.map((f) => (
                  <option key={f.code} value={f.code} title={f.description}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select aria-label="Nguồn giống" value={source} onChange={(e) => setSource(e.target.value as 'market' | 'hatchery')} style={{ fontSize: 11 }}>
                <option value="market">Mua (🪙{price}/con)</option>
                <option value="hatchery">Khu ươm ({fry} con)</option>
              </select>
              {stockOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  data-testid={`stock-${n}`}
                  className="cv-cozy-hud-btn"
                  style={small}
                  disabled={busy || !canStock || (source === 'market' ? (resources?.coins ?? 0) < price * n : fry < n)}
                  onClick={() => h?.stock(b.id, species, n, source)}
                >
                  +{n}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#6b5842' }}>
              {!canStock ? (live.waterLevel < MIN_STOCKING_WATER ? 'Cần cấp nước ≥ 80% trước khi thả cá.' : 'Ao đang chuẩn bị vụ mới.') : getFishSpecies(species).description}
            </div>
          </div>
        )}
      </Section>

      <Section title="Cho ăn" testId="pond-feed">
        <div style={{ fontSize: 11 }}>
          {live.feedStock.toFixed(1)}/{b.feedCapacity} kg · {feedPerMin > 0 ? `ăn ${feedPerMin.toFixed(2)} kg/phút · đủ ~${fmt((live.feedStock / feedPerMin) * 60)}` : 'chưa có cá ăn'}
        </div>
        <Bar value={live.feedStock / b.feedCapacity} color={live.feedStock > 0 ? '#e0a93a' : '#c0392b'} testId="pond-feed-bar" />
        {live.feedStock < 0.5 && live.batches.length > 0 && <div style={{ fontSize: 11, color: '#a8322a', marginTop: 3 }}>Hết thức ăn — cá đói, lớn chậm và yếu dần!</div>}
        {FISH_FEED_DEFINITIONS.map((f) => (
          <FeedRow key={f.code} feed={f} body={b} stock={live.feedStock} produce={produce} busy={busy || !canEdit} />
        ))}
      </Section>

      <Section title={`Thu hoạch (${harvestable}/${live.batches.length} đợt đủ lớn)`} testId="pond-harvest">
        <div style={{ fontSize: 11, color: '#6b5842' }}>
          {def.hatchery ? 'Khu ươm: cá giống thu được dùng để thả các ao khác.' : `Năng suất ×${lvl.yieldMultiplier}, tăng theo chất lượng nước.`} Tổng đã thu: {b.totalHarvested}
        </div>
        {canEdit && (
          <button type="button" data-testid="pond-harvest-btn" className={`cv-cozy-hud-btn ${harvestable && !busy ? 'cv-cozy-hud-btn--active' : ''}`} disabled={!harvestable || busy} onClick={() => h?.harvest(b.id)} style={{ marginTop: 6 }}>
            <span>🎣</span>
            <span>{harvestable ? 'Thu hoạch & nhập kho' : 'Chưa có cá đủ lớn'}</span>
          </button>
        )}
      </Section>

      {next && (
        <Section title={`Cấp tiếp theo: ${next.name}`}>
          <div style={{ fontSize: 11, color: '#6b5842', margin: '2px 0 4px' }}>{next.features.join(' · ')}</div>
          <div style={{ fontSize: 12 }}>
            Chi phí: {upCost && <Cost cost={upCost} have={resources} />} · {fmt(next.upgradeSeconds)}
          </div>
        </Section>
      )}

      {canEdit && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" data-testid="pond-upgrade" className={`cv-cozy-hud-btn ${upgradeBlock === null && !busy ? 'cv-cozy-hud-btn--active' : ''}`} disabled={busy || upgradeBlock !== null} onClick={() => h?.upgrade(b.id)}>
            <ArrowUpOutlined />
            <span>{upgradeBlock && next ? upgradeBlock : next ? 'Nâng cấp' : 'Cấp tối đa'}</span>
          </button>
          <button type="button" data-testid="pond-expand" className="cv-cozy-hud-btn" disabled={busy || b.status === 'upgrading'} onClick={() => useAquaStore.getState().startExpand(b.id)}>
            <ExpandAltOutlined />
            <span>Mở rộng</span>
          </button>
          <Popconfirm
            title={def.dug ? 'Lấp ao?' : 'Tháo khu lồng?'}
            description={
              <span>
                Hoàn trả: <Cost cost={refund} have={null} />
                {b.fishCount ? <div>{b.fishCount} con cá sẽ được thả về tự nhiên.</div> : null}
              </span>
            }
            okText="Đồng ý"
            cancelText="Giữ lại"
            onConfirm={() => h?.remove(b.id)}
          >
            <button type="button" className="cv-cozy-hud-btn" disabled={busy}>
              <DeleteOutlined />
              <span>{def.dug ? 'Lấp ao' : 'Tháo lồng'}</span>
            </button>
          </Popconfirm>
        </div>
      )}
    </Pill>
  );
}

function FeedRow({ feed: f, body: b, stock, produce, busy }: { feed: FishFeedDefinition; body: WaterBodyDTO; stock: number; produce: ProduceBag | null; busy: boolean }) {
  const h = useAquaStore.getState().handlers;
  const space = Math.max(0, Math.floor((b.feedCapacity - stock) / f.kg));
  const byStock = Math.min(...(Object.entries(f.ingredients) as [ProduceCode, number][]).map(([c, n]) => Math.floor((produce?.[c] ?? 0) / n)));
  const max = Math.max(0, Math.min(space, byStock));
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, margin: '3px 0', flexWrap: 'wrap' }} data-testid={`fishfeed-${f.code}`}>
      <span style={{ flex: 1, minWidth: 130 }} title={f.description}>
        <strong>{f.name}</strong>{' '}
        <span style={{ color: '#6b5842' }}>
          {(Object.entries(f.ingredients) as [ProduceCode, number][]).map(([c, n]) => `${PRODUCE_ICONS[c]}${n}(${produce?.[c] ?? 0})`).join(' ')} → {f.kg} kg{f.quality >= 0.2 ? ' ⭐' : ''}
        </span>
      </span>
      {[1, 5].map((n) => (
        <button key={n} type="button" data-testid={`fishfeed-${f.code}-${n}`} className="cv-cozy-hud-btn" style={small} disabled={busy || max < n} onClick={() => h?.feed(b.id, f.code, n)}>
          ×{n}
        </button>
      ))}
      <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy || max < 1} onClick={() => h?.feed(b.id, f.code, max)} title={`Đầy: ${max} mẻ`}>
        Đầy
      </button>
    </div>
  );
}
