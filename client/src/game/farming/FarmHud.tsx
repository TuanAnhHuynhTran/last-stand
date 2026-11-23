import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowUpOutlined,
  CheckOutlined,
  ClearOutlined,
  CloseOutlined,
  DeleteOutlined,
  ExpandOutlined,
  ScissorOutlined,
} from '@ant-design/icons';
import { Popconfirm } from 'antd';
import {
  DEMOLISH_REFUND_RATE,
  FARM_ZONE_DEFINITIONS,
  FARM_ZONE_ISSUE_LABELS,
  IRRIGATION_LABELS,
  MIN_FARM_ZONE_HEXES,
  PRODUCE_ICONS,
  PRODUCE_LABELS,
  RESOURCE_CODES,
  RESOURCE_LABELS,
  WATER_SOURCE_LABELS,
  addResources,
  computeCropOutcome,
  cropStageAt,
  emptyResources,
  farmCreateCost,
  farmExpandCost,
  farmUpgradeCost,
  getCropDefinition,
  getFarmZoneDefinition,
  getFarmZoneLevel,
  missingResources,
  type CropTypeCode,
  type FarmZoneDTO,
  type ResourceBag,
} from '@cityverse/shared';
import { useBuildingStore } from '../buildings/buildingStore';
import { LivestockProductBadges } from '../livestock/LivestockHud';
import { FishStockBadges } from '../aquaculture/AquaHud';
import { isZoneRipe, useFarmStore, zoneCropProgress, zoneUpgradeProgress } from './farmStore';

const RES_ICON: Record<string, string> = { coins: '🪙', wood: '🪵', stone: '🪨' };
const ZONE_ICON: Record<string, string> = {
  rice_paddy: '🌾',
  corn_field: '🌽',
  vegetable_garden: '🥬',
  orchard: '🍊',
  pasture: '🌿',
};

function Pill({ children, style, testId }: { children: ReactNode; style?: CSSProperties; testId?: string }) {
  return (
    <div className="cv-cozy-hud-pill" data-testid={testId} style={{ position: 'absolute', zIndex: 22, ...style }}>
      {children}
    </div>
  );
}

function Cost({ cost, have }: { cost: ResourceBag; have: ResourceBag | null }) {
  const items = RESOURCE_CODES.filter((c) => cost[c] > 0);
  if (!items.length) return <span>Miễn phí</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((c) => {
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
  const offset = useFarmStore((s) => s.serverOffsetMs);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(Date.now() + offset), 500);
    return () => window.clearInterval(id);
  }, [active, offset]);
  return active ? now : Date.now() + offset;
}

const fmt = (s: number): string => {
  const v = Math.max(0, Math.ceil(s));
  return v >= 60 ? `${Math.floor(v / 60)}p ${v % 60}s` : `${v}s`;
};

const Bar = ({ value, color }: { value: number; color: string }) => (
  <div style={{ height: 9, background: '#eadfca', borderRadius: 6, overflow: 'hidden', marginTop: 4 }}>
    <div style={{ width: `${value * 100}%`, height: '100%', background: color, transition: 'width 0.4s linear' }} />
  </div>
);

/** Harvested produce, shown just under the resource bar. */
export function ProduceBadges() {
  const produce = useFarmStore((s) => s.produce);
  if (!produce) return null;
  return (
    <Pill
      testId="produce-bar"
      style={{ top: 56, left: '50%', transform: 'translateX(-50%)', padding: '4px 12px', display: 'flex', gap: 12, fontSize: 12, fontWeight: 600, color: '#463726' }}
    >
      {(Object.keys(PRODUCE_LABELS) as (keyof typeof PRODUCE_LABELS)[]).map((c) => (
        <span key={c} title={PRODUCE_LABELS[c]} data-testid={`produce-${c}`}>
          {PRODUCE_ICONS[c]} {produce[c].toLocaleString('vi-VN')}
        </span>
      ))}
      <LivestockProductBadges />
      <FishStockBadges />
    </Pill>
  );
}

export function FarmHud() {
  const [menuOpen, setMenuOpen] = useState(false);
  const zones = useFarmStore((s) => s.zones);
  const draft = useFarmStore((s) => s.draft);
  const check = useFarmStore((s) => s.draftCheck);
  const selectedId = useFarmStore((s) => s.selectedZoneId);
  const busy = useFarmStore((s) => s.busy);
  const handlers = useFarmStore((s) => s.handlers);
  const resources = useBuildingStore((s) => s.resources);
  const canEdit = useBuildingStore((s) => s.canEdit);
  const placing = useBuildingStore((s) => s.placing);
  const store = useFarmStore.getState;

  const selected = zones.find((z) => z.id === selectedId) ?? null;
  const active = zones.some((z) => z.crop || z.status === 'upgrading');
  const serverNow = useServerNow(active);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const s = useFarmStore.getState();
      if (e.code === 'Escape') {
        if (s.draft) s.cancelDraft();
        else s.selectZone(null);
      } else if (e.code === 'Enter' && s.draft) s.handlers?.commitDraft();
      else if (e.code === 'KeyG' && useBuildingStore.getState().canEdit) setMenuOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A building selection replaces the farm panel and vice versa.
  useEffect(
    () =>
      useBuildingStore.subscribe((s, prev) => {
        if (s.selectedId && s.selectedId !== prev.selectedId) useFarmStore.getState().selectZone(null);
      }),
    []
  );
  useEffect(() => {
    if (selectedId) useBuildingStore.getState().select(null);
  }, [selectedId]);

  const draftZone = draft?.zoneId ? zones.find((z) => z.id === draft.zoneId) : undefined;
  const draftCost = draft
    ? draft.mode === 'expand' && draftZone
      ? farmExpandCost(draft.zoneType, draftZone.level, draft.hexes.length)
      : farmCreateCost(draft.zoneType, draft.hexes.length)
    : null;
  const total = check?.totalHexes ?? (draftZone?.hexes.length ?? 0) + (draft?.hexes.length ?? 0);

  return (
    <>
      {canEdit && (
        <button
          type="button"
          data-testid="open-farm-menu"
          className={`cv-cozy-hud-btn ${menuOpen || draft ? 'cv-cozy-hud-btn--active' : ''}`}
          style={{ position: 'absolute', zIndex: 22, top: 76, left: 206 }}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span>🌾</span>
          <span>Trồng trọt [G]</span>
        </button>
      )}

      {menuOpen && canEdit && (
        <Pill testId="farm-menu" style={{ top: 118, left: 206, width: 300, padding: 10, maxHeight: 'calc(100vh - 230px)', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: '#6b5842', marginBottom: 6 }}>
            Chọn loại khu, rồi <strong>kéo chuột trái</strong> để tô từ {MIN_FARM_ZONE_HEXES} ô hex liền nhau trở lên.
          </div>
          {FARM_ZONE_DEFINITIONS.map((def) => {
            const crops = def.crops.map((c) => getCropDefinition(c));
            return (
              <button
                key={def.code}
                type="button"
                data-testid={`farm-${def.code}`}
                onClick={() => {
                  store().startDraft(def.code);
                  setMenuOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid rgba(124, 92, 56, 0.2)',
                  borderRadius: 10,
                  background: draft?.zoneType === def.code ? '#fff3d6' : 'rgba(255,255,255,0.7)',
                  padding: '7px 10px',
                  marginBottom: 6,
                  cursor: 'pointer',
                  color: '#2b2116',
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {ZONE_ICON[def.code]} {def.name}
                </div>
                <div style={{ fontSize: 11, color: '#6b5842', margin: '2px 0 4px' }}>{def.description}</div>
                <div style={{ fontSize: 11 }}>
                  {crops.map((c) => `${c.name} · ${c.growSeconds}s · 💧${Math.round(c.waterNeed * 100)}%`).join(' | ')}
                </div>
                <div style={{ fontSize: 12, marginTop: 2 }}>
                  {MIN_FARM_ZONE_HEXES} ô: <Cost cost={farmCreateCost(def.code, MIN_FARM_ZONE_HEXES)} have={resources} />
                </div>
              </button>
            );
          })}
        </Pill>
      )}

      {draft && !placing && (
        <Pill
          testId="farm-draft-bar"
          style={{ bottom: 74, left: '50%', transform: 'translateX(-50%)', padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 'calc(100vw - 32px)' }}
        >
          <strong style={{ color: '#2b2116' }}>
            {draft.mode === 'expand' ? 'Mở rộng' : 'Vẽ'}: {ZONE_ICON[draft.zoneType]} {getFarmZoneDefinition(draft.zoneType).name}
          </strong>
          <span data-testid="farm-draft-count" style={{ fontSize: 12 }}>
            {draft.mode === 'expand' ? `+${draft.hexes.length} ô → ${total} ô` : `${draft.hexes.length}/${MIN_FARM_ZONE_HEXES}+ ô`}
          </span>
          {draftCost && draft.hexes.length > 0 && <Cost cost={draftCost} have={resources} />}
          <span
            data-testid="farm-draft-validity"
            className="cv-cozy-badge"
            style={{
              background: !check ? '#eee6d8' : check.valid ? 'rgba(94, 224, 122, 0.3)' : 'rgba(255, 90, 74, 0.25)',
              color: !check ? '#6b5842' : check.valid ? '#1f6b34' : '#a8322a',
            }}
          >
            {!check ? 'Kéo chuột trái để tô ô (tô lại để xóa)' : check.valid ? 'Vùng hợp lệ' : check.issues.map((i) => FARM_ZONE_ISSUE_LABELS[i]).join(' · ')}
          </span>
          <button
            type="button"
            data-testid="farm-draft-confirm"
            className={`cv-cozy-hud-btn ${check?.valid && !busy ? 'cv-cozy-hud-btn--active' : ''}`}
            disabled={!check?.valid || busy}
            onClick={() => handlers?.commitDraft()}
          >
            <CheckOutlined />
            <span>Xác nhận [Enter]</span>
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
        <FarmPanel
          zone={selected}
          resources={resources}
          serverNow={serverNow}
          busy={busy}
          canEdit={canEdit}
          onClose={() => store().selectZone(null)}
          onPlant={(c) => handlers?.plant(selected.id, c)}
          onHarvest={() => handlers?.harvest(selected.id)}
          onUpgrade={() => handlers?.upgrade(selected.id)}
          onExpand={() => store().startExpand(selected)}
          onRemove={() => handlers?.remove(selected.id)}
        />
      )}
    </>
  );
}

function FarmPanel(props: {
  zone: FarmZoneDTO;
  resources: ResourceBag | null;
  serverNow: number;
  busy: boolean;
  canEdit: boolean;
  onClose: () => void;
  onPlant: (crop: CropTypeCode) => void;
  onHarvest: () => void;
  onUpgrade: () => void;
  onExpand: () => void;
  onRemove: () => void;
}) {
  const { zone: z, resources, serverNow, busy, canEdit } = props;
  const def = getFarmZoneDefinition(z.zoneType);
  const lvl = getFarmZoneLevel(z.zoneType, z.level)!;
  const next = getFarmZoneLevel(z.zoneType, z.level + 1);
  const n = z.hexes.length;
  const upCost = next ? farmUpgradeCost(z.zoneType, next.level, n) : null;
  const upMissing = upCost && resources ? missingResources(resources, upCost) : [];
  const upProgress = zoneUpgradeProgress(z, serverNow);
  const [crop, setCrop] = useState<CropTypeCode>(def.crops[0]);
  const progress = zoneCropProgress(z, serverNow);
  const ripe = isZoneRipe(z, serverNow);
  const cropDef = z.crop ? getCropDefinition(z.crop.cropCode) : null;
  const stage = cropDef && progress !== null ? cropStageAt(cropDef, progress) : null;
  const remaining = z.crop ? (new Date(z.crop.readyAt).getTime() - serverNow) / 1000 : 0;
  const preview = computeCropOutcome(getCropDefinition(crop), z.zoneType, z.level, n, z.irrigation);
  const seedMissing = resources ? missingResources(resources, preview.seedCost) : [];
  // Same rule as the server: DEMOLISH_REFUND_RATE of everything invested in the zone.
  const refund = addResources(emptyResources(), z.invested, DEMOLISH_REFUND_RATE);

  let upgradeBlock: string | null = null;
  if (!next) upgradeBlock = 'Đã đạt cấp tối đa';
  else if (z.status === 'upgrading') upgradeBlock = 'Đang nâng cấp';
  else if (upMissing.length) upgradeBlock = `Thiếu ${upMissing.map((m) => RESOURCE_LABELS[m]).join(', ')}`;

  return (
    <Pill testId="farm-panel" style={{ top: 76, right: 14, width: 320, padding: '12px 14px', color: '#463726', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#2b2116' }}>
            {ZONE_ICON[z.zoneType]} {def.name}
          </div>
          <div style={{ fontSize: 12 }} data-testid="farm-level">
            Cấp {z.level}/3 · {lvl.name} · {n} ô hex
          </div>
        </div>
        <button type="button" className="cv-cozy-hud-btn" onClick={props.onClose} aria-label="Đóng">
          <CloseOutlined />
        </button>
      </div>
      <div style={{ fontSize: 12, margin: '6px 0', color: '#6b5842' }}>{lvl.description}</div>
      <div style={{ fontSize: 12 }}>
        Năng suất ×{lvl.yieldMultiplier} · Tốc độ ×{lvl.growthSpeed} · 👨‍🌾 {lvl.farmers} nông dân
      </div>
      <div style={{ fontSize: 12, marginTop: 4 }} data-testid="farm-irrigation">
        💧 {z.irrigation.kind === 'pump' && (z.zoneType === 'corn_field' || z.zoneType === 'pasture') ? 'Cối xay gió bơm nước' : IRRIGATION_LABELS[z.irrigation.kind]} · nguồn: {WATER_SOURCE_LABELS[z.irrigation.sourceType]}
        {z.irrigation.sourceDistance !== null ? ` (${z.irrigation.sourceDistance} ô)` : ''}
        <div style={{ fontSize: 11, color: '#6b5842' }}>
          Cấp nước {Math.round(z.irrigation.supply * 100)}% (tự nhiên {Math.round(z.irrigation.naturalSupply * 100)}%) · độ màu mỡ ×{z.irrigation.fertility}
        </div>
      </div>

      {upProgress !== null && (
        <div style={{ marginTop: 8 }} data-testid="farm-upgrade-progress">
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            Đang nâng cấp lên cấp {z.level + 1} — {Math.round(upProgress * 100)}%
          </div>
          <Bar value={upProgress} color="#7ad0ff" />
        </div>
      )}

      {/* Crop */}
      <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.6)', borderRadius: 10 }} data-testid="farm-crop">
        {z.crop && cropDef && stage && progress !== null ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 700 }}>
              {cropDef.name} — {stage.name} ({stage.index + 1}/{cropDef.stages.length})
            </div>
            <Bar value={progress} color={ripe ? '#f2c84b' : '#7dd36f'} />
            <div style={{ fontSize: 11, marginTop: 3 }}>
              {ripe ? 'Đã chín — thu hoạch ngay!' : `Còn ${fmt(remaining)}`} · Dự kiến {z.crop.expectedYield} {PRODUCE_ICONS[cropDef.produce]}
              {z.crop.waterFactor < 1 ? ` · thiếu nước khi gieo (×${z.crop.waterFactor})` : ''}
            </div>
            {canEdit && (
              <button
                type="button"
                data-testid="farm-harvest"
                className={`cv-cozy-hud-btn ${ripe && !busy ? 'cv-cozy-hud-btn--active' : ''}`}
                disabled={!ripe || busy}
                onClick={props.onHarvest}
                style={{ marginTop: 6 }}
              >
                <ScissorOutlined />
                <span>{ripe ? 'Thu hoạch' : 'Chưa chín'}</span>
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Đất trống — sẵn sàng gieo trồng</div>
            {def.crops.length > 1 && (
              <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
                {def.crops.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`cv-cozy-hud-btn ${crop === c ? 'cv-cozy-hud-btn--active' : ''}`}
                    onClick={() => setCrop(c)}
                  >
                    {getCropDefinition(c).name}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#6b5842' }}>
              {getCropDefinition(crop).name}: {fmt(preview.growSeconds)} · thu {preview.expectedYield}{' '}
              {PRODUCE_ICONS[getCropDefinition(crop).produce]} · nước ×{preview.waterFactor}
            </div>
            <div style={{ fontSize: 12 }}>
              Hạt giống: <Cost cost={preview.seedCost} have={resources} />
            </div>
            {canEdit && (
              <button
                type="button"
                data-testid="farm-plant"
                className={`cv-cozy-hud-btn ${!busy && !seedMissing.length ? 'cv-cozy-hud-btn--active' : ''}`}
                disabled={busy || seedMissing.length > 0}
                onClick={() => props.onPlant(crop)}
                style={{ marginTop: 6 }}
              >
                <span>🌱</span>
                <span>Gieo trồng</span>
              </button>
            )}
          </>
        )}
      </div>

      {next && (
        <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.6)', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Cấp tiếp theo: {next.name}</div>
          <div style={{ fontSize: 11, color: '#6b5842', margin: '2px 0 4px' }}>{next.features.join(' · ')}</div>
          <div style={{ fontSize: 12 }}>
            Chi phí: {upCost && <Cost cost={upCost} have={resources} />} · {fmt(next.upgradeSeconds)}
          </div>
        </div>
      )}

      {canEdit && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="farm-upgrade"
            className={`cv-cozy-hud-btn ${upgradeBlock === null && !busy ? 'cv-cozy-hud-btn--active' : ''}`}
            disabled={busy || upgradeBlock !== null}
            title={upgradeBlock ?? 'Nâng cấp'}
            onClick={props.onUpgrade}
          >
            <ArrowUpOutlined />
            <span>{upgradeBlock && next ? upgradeBlock : next ? 'Nâng cấp' : 'Cấp tối đa'}</span>
          </button>
          <button
            type="button"
            data-testid="farm-expand"
            className="cv-cozy-hud-btn"
            disabled={busy || z.status !== 'active' || z.crop !== null}
            title={z.crop ? 'Thu hoạch trước khi mở rộng' : z.status !== 'active' ? 'Đang nâng cấp' : 'Mở rộng khu'}
            onClick={props.onExpand}
          >
            <ExpandOutlined />
            <span>Mở rộng</span>
          </button>
          <Popconfirm
            title="Xóa khu canh tác?"
            description={
              <span>
                Hoàn trả: <Cost cost={refund} have={null} />
                {z.crop ? <div>Vụ mùa đang trồng sẽ mất.</div> : null}
              </span>
            }
            okText="Xóa khu"
            cancelText="Giữ lại"
            onConfirm={props.onRemove}
          >
            <button type="button" className="cv-cozy-hud-btn" disabled={busy}>
              <DeleteOutlined />
              <span>Xóa khu</span>
            </button>
          </Popconfirm>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#6b5842', marginTop: 6 }}>Tổng đã thu hoạch: {z.totalHarvested}</div>
    </Pill>
  );
}
