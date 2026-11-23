import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUpOutlined, CheckOutlined, ClearOutlined, CloseOutlined, DeleteOutlined, ExpandAltOutlined } from '@ant-design/icons';
import { Popconfirm } from 'antd';
import {
  ANIMAL_STATUS_LABELS,
  CARETAKER_HIRE_COST,
  DEMOLISH_REFUND_RATE,
  FARM_ZONE_ISSUE_LABELS,
  LIVESTOCK_FARM_DEFINITIONS,
  LIVESTOCK_PRODUCT_ICONS,
  LIVESTOCK_PRODUCT_LABELS,
  PRODUCE_ICONS,
  PRODUCE_LABELS,
  RANCH_WATER_SOURCE_LABELS,
  RESOURCE_CODES,
  RESOURCE_LABELS,
  addResources,
  animalGrowth,
  animalPrice,
  animalProductivity,
  cropProgress,
  emptyResources,
  getAnimalBreed,
  getAnimalDefinition,
  getLivestockFarmDefinition,
  getLivestockLevel,
  laborFactor,
  livestockCreateCost,
  livestockExpandCost,
  livestockUpgradeCost,
  missingResources,
  recipesForFarm,
  simulateLivestock,
  suppliesLeft,
  type AnimalStatus,
  type AnimalTypeCode,
  type FeedRecipeDefinition,
  type LivestockFarmDTO,
  type LivestockProductCode,
  type LivestockSimState,
  type ProduceBag,
  type ProduceCode,
  type ProductAmounts,
  type ResourceBag,
} from '@cityverse/shared';
import { useBuildingStore } from '../buildings/buildingStore';
import { useFarmStore } from '../farming/farmStore';
import { useLivestockStore } from './livestockStore';

const RES_ICON: Record<string, string> = { coins: '🪙', wood: '🪵', stone: '🪨' };
const FARM_ICON: Record<string, string> = { chicken_farm: '🐔', pig_farm: '🐷', cattle_farm: '🐮', sheep_farm: '🐑', horse_stable: '🐴', elephant_camp: '🐘' };
const ANIMAL_ICON: Record<AnimalTypeCode, string> = { chicken: '🐔', pig: '🐷', cow: '🐮', sheep: '🐑', goat: '🐐', horse: '🐴', elephant: '🐘' };
const STATUS_ICON: Record<AnimalStatus, string> = { healthy: '💚', hungry: '🍽️', thirsty: '💧', sick: '🤒', young: '🍼' };
const STATUS_COLOR: Record<AnimalStatus, string> = { healthy: '#1f6b34', hungry: '#b4641c', thirsty: '#2f6fa8', sick: '#a8322a', young: '#7a5aa8' };

function Pill({ children, style, testId }: { children: ReactNode; style?: CSSProperties; testId?: string }) {
  return (
    <div className="cv-cozy-hud-pill" data-testid={testId} style={{ position: 'absolute', zIndex: 22, ...style }}>
      {children}
    </div>
  );
}

function Cost({ cost, have }: { cost: ResourceBag; have: ResourceBag | null }) {
  const items = RESOURCE_CODES.filter((c) => cost[c] > 0);
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

const products = (p: ProductAmounts): string =>
  (Object.entries(p) as [LivestockProductCode, number][])
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${LIVESTOCK_PRODUCT_ICONS[c]} ${Math.floor(n)}`)
    .join(' ');

const fmt = (s: number): string => {
  const v = Math.max(0, Math.ceil(s));
  if (v >= 3600) return `${Math.floor(v / 3600)}g ${Math.floor((v % 3600) / 60)}p`;
  return v >= 60 ? `${Math.floor(v / 60)}p ${v % 60}s` : `${v}s`;
};

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

const small: CSSProperties = { padding: '0 7px', fontSize: 11 };

function useServerNow(active: boolean): number {
  const offset = useLivestockStore((s) => s.serverOffsetMs);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(Date.now() + offset), 500);
    return () => window.clearInterval(id);
  }, [active, offset]);
  return active ? now : Date.now() + offset;
}

/** Same simulation as the server, run from the farm's last sync to now (live bars between syncs). */
function predictFarm(f: LivestockFarmDTO, nowMs: number): LivestockSimState {
  const ms = (d: string) => new Date(d).getTime();
  const batch = f.jobs.find((j) => j.jobType === 'produce' && j.status === 'in_progress');
  const state: LivestockSimState = {
    farmType: f.farmType,
    level: f.level,
    hexCount: f.hexes.length,
    caretakers: f.caretakers,
    waterSource: f.waterSource,
    feedStock: f.feedStock,
    feedQuality: f.feedQuality,
    waterStock: f.waterStock,
    animals: f.animals.map((a) => ({
      id: a.id,
      species: a.animalCode,
      breed: a.breed,
      bornAtMs: ms(a.bornAt),
      growsUpAtMs: ms(a.growsUpAt),
      health: a.health,
      satiety: a.satiety,
      thirst: a.thirst,
    })),
    batch: batch ? { id: batch.id, startedAtMs: ms(batch.startedAt), finishesAtMs: ms(batch.finishesAt), progress: { ...batch.progress }, work: 0, exposure: 0 } : null,
    readyBatches: f.jobs.filter((j) => j.jobType === 'produce' && j.status === 'ready').length,
    breeding: [],
  };
  const from = ms(f.simulatedAt);
  return nowMs > from ? simulateLivestock(state, from, nowMs).state : state;
}

/** Livestock products for the shared produce bar. */
export function LivestockProductBadges() {
  const stock = useLivestockStore((s) => s.products);
  if (!stock) return null;
  return (
    <>
      {(Object.keys(LIVESTOCK_PRODUCT_LABELS) as LivestockProductCode[]).map((c) => (
        <span key={c} title={LIVESTOCK_PRODUCT_LABELS[c]} data-testid={`product-${c}`}>
          {LIVESTOCK_PRODUCT_ICONS[c]} {stock[c].toLocaleString('vi-VN')}
        </span>
      ))}
    </>
  );
}

export function LivestockHud() {
  const [menuOpen, setMenuOpen] = useState(false);
  const farms = useLivestockStore((s) => s.farms);
  const draft = useLivestockStore((s) => s.draft);
  const check = useLivestockStore((s) => s.draftCheck);
  const selectedId = useLivestockStore((s) => s.selectedFarmId);
  const busy = useLivestockStore((s) => s.busy);
  const handlers = useLivestockStore((s) => s.handlers);
  const resources = useBuildingStore((s) => s.resources);
  const canEdit = useBuildingStore((s) => s.canEdit);
  const placing = useBuildingStore((s) => s.placing);
  const produce = useFarmStore((s) => s.produce);
  const store = useLivestockStore.getState;
  const selected = farms.find((f) => f.id === selectedId) ?? null;
  const serverNow = useServerNow(farms.length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const s = useLivestockStore.getState();
      if (e.code === 'Escape') {
        if (s.draft) s.cancelDraft();
        else s.selectFarm(null);
      } else if (e.code === 'Enter' && s.draft) s.handlers?.commitDraft();
      else if (e.code === 'KeyL' && useBuildingStore.getState().canEdit) setMenuOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // One selection at a time: building, field or livestock farm.
  useEffect(() => {
    const offB = useBuildingStore.subscribe((s, p) => {
      if (s.selectedId && s.selectedId !== p.selectedId) useLivestockStore.getState().selectFarm(null);
    });
    const offF = useFarmStore.subscribe((s, p) => {
      if (s.selectedZoneId && s.selectedZoneId !== p.selectedZoneId) useLivestockStore.getState().selectFarm(null);
    });
    return () => {
      offB();
      offF();
    };
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    useBuildingStore.getState().select(null);
    useFarmStore.getState().selectZone(null);
  }, [selectedId]);

  const def = draft ? getLivestockFarmDefinition(draft.farmType) : null;
  const expanding = draft?.expandFarmId ? farms.find((f) => f.id === draft.expandFarmId) ?? null : null;
  const draftCost = draft && draft.hexes.length
    ? expanding
      ? livestockExpandCost(expanding.farmType, expanding.level, draft.hexes.length)
      : livestockCreateCost(draft.farmType, draft.hexes.length)
    : null;

  return (
    <>
      {canEdit && (
        <button
          type="button"
          data-testid="open-livestock-menu"
          className={`cv-cozy-hud-btn ${menuOpen || draft ? 'cv-cozy-hud-btn--active' : ''}`}
          style={{ position: 'absolute', zIndex: 22, top: 76, left: 358 }}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span>🐮</span>
          <span>Chăn nuôi [L]</span>
        </button>
      )}

      {menuOpen && canEdit && (
        <Pill testId="livestock-menu" style={{ top: 118, left: 358, width: 310, padding: 10, maxHeight: 'calc(100vh - 230px)', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: '#6b5842', marginBottom: 6 }}>
            Chọn trang trại, rồi <strong>kéo chuột trái</strong> để tô vùng (liền nhau, trong lãnh địa).
          </div>
          {LIVESTOCK_FARM_DEFINITIONS.map((d) => (
            <button
              key={d.code}
              type="button"
              data-testid={`livestock-${d.code}`}
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
                background: draft?.farmType === d.code ? '#fff3d6' : 'rgba(255,255,255,0.7)',
                padding: '7px 10px',
                marginBottom: 6,
                cursor: 'pointer',
                color: '#2b2116',
              }}
            >
              <div style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {FARM_ICON[d.code]} {d.name}
                </span>
                <span style={{ fontSize: 11, color: '#6b5842' }}>≥ {d.minHexes} ô</span>
              </div>
              <div style={{ fontSize: 11, color: '#6b5842', margin: '2px 0 4px' }}>{d.description}</div>
              <div style={{ fontSize: 11 }}>
                Sản phẩm: {d.products.map((p) => `${LIVESTOCK_PRODUCT_ICONS[p]} ${LIVESTOCK_PRODUCT_LABELS[p].toLowerCase()}`).join(' · ')}
              </div>
              <div style={{ fontSize: 11 }}>Thức ăn: {recipesForFarm(d.code).map((r) => r.name.toLowerCase()).join(', ')}</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>
                {d.minHexes} ô: <Cost cost={livestockCreateCost(d.code, d.minHexes)} have={resources} />
              </div>
            </button>
          ))}
        </Pill>
      )}

      {draft && def && !placing && (
        <Pill
          testId="livestock-draft-bar"
          style={{ bottom: 74, left: '50%', transform: 'translateX(-50%)', padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 'calc(100vw - 32px)' }}
        >
          <strong style={{ color: '#2b2116' }}>
            {expanding ? 'Mở rộng' : 'Vẽ'}: {FARM_ICON[draft.farmType]} {def.name}
          </strong>
          <span style={{ fontSize: 12 }} data-testid="livestock-draft-count">
            {expanding ? `${expanding.hexes.length} + ${draft.hexes.length} ô` : `${draft.hexes.length}/${def.minHexes}+ ô`}
          </span>
          {draftCost && <Cost cost={draftCost} have={resources} />}
          <span
            data-testid="livestock-draft-validity"
            className="cv-cozy-badge"
            style={{
              background: !check ? '#eee6d8' : check.valid ? 'rgba(94, 224, 122, 0.3)' : 'rgba(255, 90, 74, 0.25)',
              color: !check ? '#6b5842' : check.valid ? '#1f6b34' : '#a8322a',
            }}
          >
            {!check
              ? expanding
                ? 'Tô thêm ô liền kề trại (tô lại để xóa)'
                : 'Kéo chuột trái để tô ô (tô lại để xóa)'
              : check.valid
                ? 'Vùng hợp lệ'
                : check.issues.map((i) => (i === 'TOO_SMALL' ? `Cần tối thiểu ${def.minHexes} ô` : FARM_ZONE_ISSUE_LABELS[i])).join(' · ')}
          </span>
          <button
            type="button"
            data-testid="livestock-draft-confirm"
            className={`cv-cozy-hud-btn ${check?.valid && !busy ? 'cv-cozy-hud-btn--active' : ''}`}
            disabled={!check?.valid || busy}
            onClick={() => handlers?.commitDraft()}
          >
            <CheckOutlined />
            <span>{expanding ? 'Mở rộng [Enter]' : 'Xây trại [Enter]'}</span>
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
        <RanchPanel
          farm={selected}
          farms={farms}
          resources={resources}
          produce={produce}
          serverNow={serverNow}
          busy={busy}
          canEdit={canEdit}
          onClose={() => store().selectFarm(null)}
        />
      )}
    </>
  );
}

type Tab = 'herd' | 'care' | 'produce';

function RanchPanel(props: {
  farm: LivestockFarmDTO;
  farms: LivestockFarmDTO[];
  resources: ResourceBag | null;
  produce: ProduceBag | null;
  serverNow: number;
  busy: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { farm: f, farms, resources, produce, serverNow, busy, canEdit } = props;
  const [tab, setTab] = useState<Tab>('herd');
  const h = useLivestockStore.getState().handlers;
  const herd = useLivestockStore((s) => s.herd);
  const def = getLivestockFarmDefinition(f.farmType);
  const lvl = getLivestockLevel(f.farmType, f.level)!;
  const next = getLivestockLevel(f.farmType, f.level + 1);
  const upCost = next ? livestockUpgradeCost(f.farmType, next.level, f.hexes.length) : null;
  const upMissing = upCost && resources ? missingResources(resources, upCost) : [];
  // Live extrapolation (re-run at most every half second via serverNow).
  const live = useMemo(() => predictFarm(f, serverNow), [f, serverNow]);
  const liveById = useMemo(() => new Map(live.animals.map((a) => [a.id, a])), [live]);

  const breedJob = f.jobs.find((j) => j.jobType === 'breed' && j.status === 'in_progress');
  const full = f.animals.length + (breedJob ? 1 : 0) >= f.capacity;
  const jobProgress = (j: { startedAt: string; finishesAt: string }) => cropProgress(new Date(j.startedAt).getTime(), new Date(j.finishesAt).getTime(), serverNow);
  const upProgress = f.status === 'upgrading' && f.upgradeStartedAt && f.upgradeFinishesAt ? jobProgress({ startedAt: f.upgradeStartedAt, finishesAt: f.upgradeFinishesAt }) : null;
  const refund = addResources(emptyResources(), f.invested, DEMOLISH_REFUND_RATE);

  let upgradeBlock: string | null = null;
  if (!next) upgradeBlock = 'Đã đạt cấp tối đa';
  else if (f.status === 'upgrading') upgradeBlock = 'Đang nâng cấp';
  else if (upMissing.length) upgradeBlock = `Thiếu ${upMissing.map((m) => RESOURCE_LABELS[m]).join(', ')}`;

  const adults = live.animals.filter((a) => serverNow >= a.growsUpAtMs);
  const labor = laborFactor(f.caretakers, f.caretakersNeeded);
  const avg = (fn: (a: (typeof live.animals)[number]) => number, list = live.animals) => (list.length ? list.reduce((s, a) => s + fn(a), 0) / list.length : 0);
  const productivity = avg((a) => animalProductivity(a, serverNow, labor, live.feedQuality), adults);
  const left = suppliesLeft(live, serverNow);

  return (
    <Pill testId="ranch-panel" style={{ top: 76, right: 14, width: 350, padding: '12px 14px', color: '#463726', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#2b2116' }}>
            {FARM_ICON[f.farmType]} {def.name}
          </div>
          <div style={{ fontSize: 12 }} data-testid="ranch-level">
            Cấp {f.level}/3 · {lvl.name} · {f.hexes.length} ô
          </div>
        </div>
        <button type="button" className="cv-cozy-hud-btn" onClick={props.onClose} aria-label="Đóng">
          <CloseOutlined />
        </button>
      </div>
      <div style={{ fontSize: 12, margin: '4px 0', color: '#6b5842' }}>{lvl.description}</div>
      <div style={{ fontSize: 12 }} data-testid="ranch-capacity">
        🏠 {f.animals.length}/{f.capacity} con · năng suất ×{lvl.yieldMultiplier} · tốc độ ×{lvl.productionSpeed}
      </div>
      {upProgress !== null && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            Đang nâng cấp lên cấp {f.level + 1} — {Math.round(upProgress * 100)}%
          </div>
          <Bar value={upProgress} color="#7ad0ff" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {(
          [
            ['herd', '🐾 Đàn'],
            ['care', '🌾 Chăm sóc'],
            ['produce', '🧺 Sản xuất'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" data-testid={`ranch-tab-${k}`} className={`cv-cozy-hud-btn ${tab === k ? 'cv-cozy-hud-btn--active' : ''}`} onClick={() => setTab(k)} style={{ flex: 1, justifyContent: 'center' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'herd' && (
        <>
          <Section title="Tình trạng đàn" testId="ranch-herd-summary">
            {f.animals.length === 0 ? (
              <div style={{ fontSize: 11, color: '#6b5842' }}>Chưa có con nào — hãy mua con giống.</div>
            ) : (
              <>
                <div style={{ fontSize: 11 }}>
                  Trưởng thành {adults.length} · con non {f.animals.length - adults.length} · năng suất {Math.round(productivity * 100)}%
                  {herd ? ` · nhân công ×${herd.laborFactor}` : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: '2px 6px', alignItems: 'center', fontSize: 11, marginTop: 4 }}>
                  <span>❤️ Sức khỏe</span>
                  <Bar value={avg((a) => a.health)} color="#e05a6a" testId="herd-health" />
                  <span>🍽️ Mức no</span>
                  <Bar value={avg((a) => a.satiety)} color="#e0a93a" testId="herd-satiety" />
                  <span>💧 Mức khát</span>
                  <Bar value={avg((a) => a.thirst)} color="#4a9ee0" testId="herd-thirst" />
                </div>
              </>
            )}
          </Section>

          <Section title={`Vật nuôi (${f.animals.length})`} testId="ranch-herd">
            <div style={{ maxHeight: 170, overflowY: 'auto' }}>
              {f.animals.map((a) => {
                const g = animalGrowth(new Date(a.bornAt).getTime(), new Date(a.growsUpAt).getTime(), serverNow);
                const sim = liveById.get(a.id);
                const status = a.status;
                const targets = farms.filter((x) => x.id !== f.id && getLivestockFarmDefinition(x.farmType).animals.includes(a.animalCode));
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, margin: '3px 0' }} data-testid="ranch-animal">
                    <span style={{ width: 18 }}>{ANIMAL_ICON[a.animalCode]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{a.name}</span>{' '}
                      <span style={{ color: '#6b5842' }}>
                        {getAnimalBreed(a.animalCode, a.breed).name} · {g >= 1 ? 'trưởng thành' : `con non ${Math.round(g * 100)}%`}
                      </span>
                      <Bar value={sim?.health ?? a.health} color="#e05a6a" />
                    </span>
                    <span title={ANIMAL_STATUS_LABELS[status]} style={{ color: STATUS_COLOR[status] }}>
                      {STATUS_ICON[status]}
                    </span>
                    {canEdit && (
                      <>
                        <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy} onClick={() => h?.sell(f.id, a.id)} title="Bán">
                          Bán
                        </button>
                        <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy || g < 1} onClick={() => h?.harvest(f.id, a.id)} title="Xuất chuồng lấy thịt">
                          🥩
                        </button>
                        {targets.length > 0 && (
                          <select
                            aria-label="Điều chuyển"
                            disabled={busy}
                            value=""
                            onChange={(e) => e.target.value && h?.transfer(f.id, a.id, e.target.value)}
                            style={{ fontSize: 11, maxWidth: 62 }}
                          >
                            <option value="">➜</option>
                            {targets.map((t) => (
                              <option key={t.id} value={t.id} disabled={t.animals.length >= t.capacity}>
                                {getLivestockFarmDefinition(t.farmType).name} ({t.animals.length}/{t.capacity})
                              </option>
                            ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {canEdit && <BuyRow farm={f} resources={resources} busy={busy} full={full} />}
          </Section>

          <Section title="Sinh sản" testId="ranch-breeding">
            {breedJob ? (
              <>
                <div style={{ fontSize: 11 }}>
                  Sắp có {ANIMAL_ICON[breedJob.animalCode ?? 'chicken']} con — còn {fmt((new Date(breedJob.finishesAt).getTime() - serverNow) / 1000)}
                </div>
                <Bar value={jobProgress(breedJob)} color="#ff8fb1" />
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: '#6b5842' }}>
                  Cần 2 con trưởng thành khỏe (≥ 60%) và no (≥ 50%), trại còn chỗ.
                  {lvl.nursery ? ' Khu chăm sóc con non: sinh nhanh hơn, con non lớn nhanh hơn.' : ' Cấp 3 có khu chăm sóc con non.'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {def.animals.map((code) => {
                    const fit = adults.filter((a) => a.species === code && a.health >= 0.6 && a.satiety >= 0.5).length;
                    return (
                      <button key={code} type="button" data-testid={`breed-${code}`} className="cv-cozy-hud-btn" disabled={busy || !canEdit || fit < 2 || full} onClick={() => h?.breed(f.id, code)}>
                        💕 {ANIMAL_ICON[code]} Ghép đôi ({fit})
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </Section>
        </>
      )}

      {tab === 'care' && (
        <>
          <Section title="Kho thức ăn" testId="ranch-feed">
            <div style={{ fontSize: 11 }}>
              {Math.round(live.feedStock)}/{f.feedCapacity} dinh dưỡng · chất lượng +{Math.round(live.feedQuality * 100)}% ·{' '}
              {Number.isFinite(left.feedMinutes) ? `đủ ~${fmt(left.feedMinutes * 60)}` : 'chưa có vật nuôi'}
            </div>
            <Bar value={live.feedStock / f.feedCapacity} color={live.feedStock > 0 ? '#e0a93a' : '#c0392b'} testId="feed-bar" />
            {live.feedStock < 1 && f.animals.length > 0 && <div style={{ fontSize: 11, color: '#a8322a', marginTop: 3 }}>Máng ăn trống — vật nuôi đang đói, năng suất giảm!</div>}
            <div style={{ marginTop: 6 }}>
              {recipesForFarm(f.farmType).map((r) => (
                <RecipeRow key={r.code} recipe={r} farm={f} feedStock={live.feedStock} produce={produce} busy={busy || !canEdit} />
              ))}
            </div>
          </Section>

          <Section title="Nước uống" testId="ranch-water">
            <div style={{ fontSize: 11 }}>
              {Math.round(live.waterStock)}/{f.waterCapacity} · nguồn: {RANCH_WATER_SOURCE_LABELS[f.effectiveWaterSource]}
              {Number.isFinite(left.waterMinutes) && f.effectiveWaterSource === 'well' ? ` · đủ ~${fmt(left.waterMinutes * 60)}` : ''}
            </div>
            <Bar value={live.waterStock / f.waterCapacity} color={live.waterStock > 0 ? '#4a9ee0' : '#c0392b'} testId="water-bar" />
            {f.effectiveWaterSource === 'well' && f.caretakers === 0 && <div style={{ fontSize: 11, color: '#a8322a', marginTop: 3 }}>Không có người kéo nước giếng — hãy cho uống hoặc thuê người chăm sóc.</div>}
            {canEdit && (
              <button type="button" data-testid="ranch-water-btn" className="cv-cozy-hud-btn" disabled={busy || live.waterStock >= f.waterCapacity - 0.5} onClick={() => h?.water(f.id)} style={{ marginTop: 6 }}>
                <span>🪣</span>
                <span>Cho uống (đổ đầy máng)</span>
              </button>
            )}
          </Section>

          <Section title="Người chăm sóc" testId="ranch-caretakers">
            <div style={{ fontSize: 11 }}>
              {f.caretakers}/{f.maxCaretakers} người · đàn cần {f.caretakersNeeded} · hệ số nhân công ×{labor.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: '#6b5842' }}>Đủ người: vật nuôi khỏe nhanh hơn, năng suất cao hơn, giếng được kéo nước tự động.</div>
            {canEdit && (
              <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy || f.caretakers <= 0} onClick={() => h?.setCaretakers(f.id, f.caretakers - 1)}>
                  −
                </button>
                <button
                  type="button"
                  data-testid="ranch-hire"
                  className="cv-cozy-hud-btn"
                  style={small}
                  disabled={busy || f.caretakers >= f.maxCaretakers || (resources?.coins ?? 0) < CARETAKER_HIRE_COST}
                  onClick={() => h?.setCaretakers(f.id, f.caretakers + 1)}
                >
                  + Thuê (🪙{CARETAKER_HIRE_COST})
                </button>
              </div>
            )}
          </Section>
        </>
      )}

      {tab === 'produce' && <ProductionTab farm={f} serverNow={serverNow} busy={busy} canEdit={canEdit} productivity={productivity} />}

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
          <button type="button" data-testid="ranch-upgrade" className={`cv-cozy-hud-btn ${upgradeBlock === null && !busy ? 'cv-cozy-hud-btn--active' : ''}`} disabled={busy || upgradeBlock !== null} onClick={() => h?.upgrade(f.id)}>
            <ArrowUpOutlined />
            <span>{upgradeBlock && next ? upgradeBlock : next ? 'Nâng cấp' : 'Cấp tối đa'}</span>
          </button>
          <button type="button" data-testid="ranch-expand" className="cv-cozy-hud-btn" disabled={busy || f.status !== 'active'} onClick={() => useLivestockStore.getState().startExpand(f.id)}>
            <ExpandAltOutlined />
            <span>Mở rộng</span>
          </button>
          <Popconfirm
            title="Dỡ trang trại?"
            description={
              <span>
                Hoàn trả: <Cost cost={refund} have={null} />
                {f.animals.length ? <div>{f.animals.length} vật nuôi sẽ được thả về tự nhiên.</div> : null}
              </span>
            }
            okText="Dỡ trại"
            cancelText="Giữ lại"
            onConfirm={() => h?.remove(f.id)}
          >
            <button type="button" className="cv-cozy-hud-btn" disabled={busy}>
              <DeleteOutlined />
              <span>Dỡ trại</span>
            </button>
          </Popconfirm>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#6b5842', marginTop: 6 }}>Tổng đã sản xuất: {f.totalProduced}</div>
    </Pill>
  );
}

function BuyRow({ farm: f, resources, busy, full }: { farm: LivestockFarmDTO; resources: ResourceBag | null; busy: boolean; full: boolean }) {
  const def = getLivestockFarmDefinition(f.farmType);
  const [breeds, setBreeds] = useState<Partial<Record<AnimalTypeCode, string>>>({});
  const h = useLivestockStore.getState().handlers;
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {def.animals.map((code) => {
        const a = getAnimalDefinition(code);
        const breed = breeds[code] ?? a.breeds[0].code;
        const price = animalPrice(code, breed);
        const afford = (n: number) => (resources?.coins ?? 0) >= price * n;
        return (
          <div key={code} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, flexWrap: 'wrap' }}>
            <span>
              {ANIMAL_ICON[code]} {a.name}
            </span>
            <select aria-label={`Giống ${a.name}`} value={breed} onChange={(e) => setBreeds((b) => ({ ...b, [code]: e.target.value }))} style={{ fontSize: 11 }}>
              {a.breeds.map((b) => (
                <option key={b.code} value={b.code} title={b.description}>
                  {b.name}
                </option>
              ))}
            </select>
            <span>🪙{price}</span>
            {[1, 5].map((n) => (
              <button
                key={n}
                type="button"
                data-testid={`buy-${code}-${n}`}
                className="cv-cozy-hud-btn"
                style={small}
                disabled={busy || full || !afford(n) || f.animals.length + n > f.capacity}
                onClick={() => h?.buy(f.id, code, n, breed)}
              >
                +{n}
              </button>
            ))}
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: '#6b5842' }}>{getAnimalBreed(def.animals[0], breeds[def.animals[0]]).description}</div>
    </div>
  );
}

function RecipeRow({ recipe: r, farm: f, feedStock, produce, busy }: { recipe: FeedRecipeDefinition; farm: LivestockFarmDTO; feedStock: number; produce: ProduceBag | null; busy: boolean }) {
  const h = useLivestockStore.getState().handlers;
  const space = Math.max(0, Math.floor((f.feedCapacity - feedStock) / r.nutrition));
  const byStock = Math.min(
    ...(Object.entries(r.ingredients) as [ProduceCode, number][]).map(([c, n]) => Math.floor((produce?.[c] ?? 0) / n))
  );
  const max = Math.max(0, Math.min(space, byStock));
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, margin: '3px 0', flexWrap: 'wrap' }} data-testid={`recipe-${r.code}`}>
      <span style={{ flex: 1, minWidth: 120 }} title={r.description}>
        <strong>{r.name}</strong>{' '}
        <span style={{ color: '#6b5842' }}>
          {(Object.entries(r.ingredients) as [ProduceCode, number][]).map(([c, n]) => `${PRODUCE_ICONS[c]}${n}(${produce?.[c] ?? 0})`).join(' ')} → {r.nutrition}
          {r.quality >= 0.2 ? ' ⭐' : ''}
        </span>
      </span>
      {[1, 5].map((n) => (
        <button key={n} type="button" data-testid={`feed-${r.code}-${n}`} className="cv-cozy-hud-btn" style={small} disabled={busy || max < n} onClick={() => h?.feed(f.id, r.code, n)} title={`${n} mẻ ${r.name}`}>
          ×{n}
        </button>
      ))}
      <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy || max < 1} onClick={() => h?.feed(f.id, r.code, max)} title={`Đổ đầy: ${max} mẻ`}>
        Đầy
      </button>
      {byStock < 1 && <span style={{ color: '#a8322a', fontSize: 10 }}>thiếu {Object.keys(r.ingredients).map((c) => PRODUCE_LABELS[c as ProduceCode].toLowerCase()).join('/')}</span>}
    </div>
  );
}

function ProductionTab({ farm: f, serverNow, busy, canEdit, productivity }: { farm: LivestockFarmDTO; serverNow: number; busy: boolean; canEdit: boolean; productivity: number }) {
  const h = useLivestockStore.getState().handlers;
  const lvl = getLivestockLevel(f.farmType, f.level)!;
  const running = f.jobs.find((j) => j.jobType === 'produce' && j.status === 'in_progress');
  const ready = f.jobs.filter((j) => j.jobType === 'produce' && j.status === 'ready');
  const readyOut: ProductAmounts = {};
  for (const j of ready) for (const [c, n] of Object.entries(j.output) as [LivestockProductCode, number][]) readyOut[c] = (readyOut[c] ?? 0) + n;
  const progress = running ? cropProgress(new Date(running.startedAt).getTime(), new Date(running.finishesAt).getTime(), serverNow) : 0;
  return (
    <>
      <Section title="Đợt sản xuất" testId="ranch-production">
        {running ? (
          <>
            <div style={{ fontSize: 11 }}>
              Đang sản xuất — còn {fmt((new Date(running.finishesAt).getTime() - serverNow) / 1000)} · đã có {products(running.progress) || '—'} · hiệu suất {Math.round(running.efficiency * 100)}%
            </div>
            <Bar value={progress} color="#7dd36f" />
          </>
        ) : (
          <div style={{ fontSize: 11, color: '#6b5842' }}>
            {ready.length >= lvl.readyBatches
              ? 'Kho sản phẩm của trại đã đầy — thu hoạch để sản xuất tiếp.'
              : f.animals.length === 0
                ? 'Cần vật nuôi trưởng thành để sản xuất.'
                : 'Chưa sản xuất: vật nuôi cần trưởng thành, được ăn và uống đủ.'}
          </div>
        )}
        <div style={{ fontSize: 11, marginTop: 4, color: '#6b5842' }}>
          Sản lượng phụ thuộc: thức ăn, nước, sức khỏe, cấp trại (×{lvl.yieldMultiplier}), nhân công và tuổi vật nuôi. Hiện tại: {Math.round(productivity * 100)}%.
        </div>
      </Section>
      <Section title={`Sẵn sàng thu (${ready.length}/${lvl.readyBatches} đợt)`} testId="ranch-ready">
        <div style={{ fontSize: 12 }}>{products(readyOut) || <span style={{ fontSize: 11, color: '#6b5842' }}>Chưa có sản phẩm.</span>}</div>
        {canEdit && (
          <button type="button" data-testid="ranch-collect" className={`cv-cozy-hud-btn ${ready.length && !busy ? 'cv-cozy-hud-btn--active' : ''}`} disabled={!ready.length || busy} onClick={() => h?.collect(f.id)} style={{ marginTop: 6 }}>
            <span>🧺</span>
            <span>{ready.length ? 'Thu sản phẩm' : 'Chưa có gì để thu'}</span>
          </button>
        )}
      </Section>
    </>
  );
}
