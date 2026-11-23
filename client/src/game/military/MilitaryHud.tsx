import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import {
  EQUIPMENT_DEFINITIONS,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  FORMATION_LABELS,
  MAX_SQUAD_SIZE,
  RANKS,
  SQUAD_STATUS_LABELS,
  UNIT_STATUS_LABELS,
  UNIT_TYPE_DEFINITIONS,
  canEquip,
  getBuildingDefinition,
  getBuildingLevel,
  getUnitType,
  isMilitaryBuilding,
  trainingSlots,
  type BarracksDTO,
  type BuildingTypeCode,
  type EquipmentCode,
  type Formation,
  type MilitaryStateDTO,
  type MilitaryUnitDTO,
  type UnitStats,
  type UnitTypeCode,
} from '@cityverse/shared';
import { useBuildingStore } from '../buildings/buildingStore';
import { jobProgress, useMilitaryStore } from './militaryStore';

const CLASS_ICON: Record<UnitTypeCode, string> = { swordsman: '🗡️', spearman: '🔱', archer: '🏹', crossbowman: '🎯' };
const RANK_ICON = ['', '▫️', '🎗️', '🪶', '🛡️', '👑'];
const EQ_NAME = new Map(EQUIPMENT_DEFINITIONS.map((e) => [e.code as string, e.name]));
const small: CSSProperties = { padding: '0 7px', fontSize: 11 };
const card: CSSProperties = { padding: '6px 8px', margin: '4px 0', background: 'rgba(255,255,255,0.6)', borderRadius: 8, fontSize: 11 };

function Pill({ children, style, testId }: { children: ReactNode; style?: CSSProperties; testId?: string }) {
  return (
    <div className="cv-cozy-hud-pill" data-testid={testId} style={{ position: 'absolute', zIndex: 23, ...style }}>
      {children}
    </div>
  );
}

const Bar = ({ value, color }: { value: number; color: string }) => (
  <div style={{ height: 6, background: '#eadfca', borderRadius: 4, overflow: 'hidden' }}>
    <div style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%`, height: '100%', background: color, transition: 'width 0.3s linear' }} />
  </div>
);

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}p ${String(Math.round(s % 60)).padStart(2, '0')}s` : `${Math.max(0, Math.round(s))}s`);

function useTick(ms = 500): number {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return Date.now();
}

/** Mounted once on the world page: summary pill, barracks panel (selected building), army panel [K]. */
export function MilitaryHud() {
  const state = useMilitaryStore((s) => s.state);
  const open = useMilitaryStore((s) => s.armyOpen);
  const sound = useMilitaryStore((s) => s.sound);
  const selectedId = useBuildingStore((s) => s.selectedId);
  const buildings = useBuildingStore((s) => s.buildings);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.code === 'KeyK') useMilitaryStore.getState().setArmyOpen(!useMilitaryStore.getState().armyOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!state) return null;
  const selected = buildings.find((b) => b.id === selectedId);
  const barracks = selected && isMilitaryBuilding(selected.typeCode) ? state.barracks.find((b) => b.buildingId === selected.id) ?? null : null;
  const training = state.units.filter((u) => u.status === 'training' || u.status === 'drilling').length;
  const store = useMilitaryStore.getState();

  return (
    <>
      <Pill testId="military-bar" style={{ top: 50, left: '50%', transform: 'translateX(-50%)', padding: '3px 10px', display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: '#463726' }}>
        <span title="Binh sĩ / đang tập">⚔️ {state.units.length} lính{training ? ` · ${training} đang tập` : ''}</span>
        <button type="button" data-testid="open-army" className={`cv-cozy-hud-btn ${open ? 'cv-cozy-hud-btn--active' : ''}`} style={small} onClick={() => store.setArmyOpen(!open)}>
          Quân đội [K]
        </button>
        <button type="button" className={`cv-cozy-hud-btn ${sound ? 'cv-cozy-hud-btn--active' : ''}`} style={small} title="Âm thanh luyện tập" onClick={() => store.setSound(!sound)}>
          {sound ? '🔊' : '🔈'}
        </button>
      </Pill>
      {barracks && <BarracksPanel barracks={barracks} state={state} />}
      {open && <ArmyPanel state={state} />}
    </>
  );
}

// ── Barracks panel ───────────────────────────────────────────────────────────
function BarracksPanel({ barracks: b, state }: { barracks: BarracksDTO; state: MilitaryStateDTO }) {
  const now = useTick() + useMilitaryStore((s) => s.serverOffsetMs);
  const busy = useMilitaryStore((s) => s.busy);
  const handlers = useMilitaryStore((s) => s.handlers);
  const canEdit = useBuildingStore((s) => s.canEdit);
  const buildingHandlers = useBuildingStore((s) => s.handlers);
  const [count, setCount] = useState(1);
  const code = b.typeCode as BuildingTypeCode;
  const def = getBuildingDefinition(code);
  const level = getBuildingLevel(code, b.level)!;
  const next = getBuildingLevel(code, b.level + 1);
  const type = b.unitType ? getUnitType(b.unitType) : null;
  const jobs = state.jobs.filter((j) => j.buildingId === b.buildingId);
  const soldiers = state.units.filter((u) => u.buildingId === b.buildingId || jobs.some((j) => j.unitIds.includes(u.id)));
  const waiting = soldiers.filter((u) => u.status === 'recruit' && u.buildingId === b.buildingId);
  const drillable = state.units.filter((u) => u.status === 'ready' && (code === 'training_ground' || u.buildingId === b.buildingId));
  const n = Math.max(1, Math.min(count, Math.max(1, b.free)));

  let block: string | null = null;
  if (type) {
    const short = Object.values(type.required).filter((c) => (state.equipment[c as string] ?? 0) < n);
    if (!b.ready) block = 'Doanh trại đang xây';
    else if (b.free <= 0) block = 'Hết chỗ huấn luyện';
    else if (state.recruitable < n) block = `Chỉ còn ${state.recruitable} cư dân có thể tuyển`;
    else if (short.length) block = `Thiếu ${short.map((c) => EQ_NAME.get(c as string)).join(', ')}`;
    else if (state.food < type.food * n) block = 'Thiếu lương thực';
    else if ((state.resources?.coins ?? 0) < type.coins * n) block = 'Thiếu xu';
  }

  return (
    <Pill testId="barracks-panel" style={{ top: 76, right: 334, width: 330, padding: '10px 12px', color: '#463726', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#2b2116' }}>
            {type ? CLASS_ICON[type.code] : '🏟️'} {def.name}
          </div>
          <div style={{ fontSize: 12 }} data-testid="barracks-level">
            Cấp {b.level}/3 · {level.name}
          </div>
        </div>
        <button type="button" className="cv-cozy-hud-btn" onClick={() => useBuildingStore.getState().select(null)} aria-label="Đóng">
          <CloseOutlined />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12, margin: '6px 0' }} data-testid="barracks-stats">
        <span>🎯 Đang tập: <strong>{b.training}</strong>/{b.slots}</span>
        <span>🪑 Chỗ trống: <strong>{b.free}</strong></span>
        <span>⏱️ Mỗi khóa: {fmt(b.trainSeconds ?? 0)}</span>
        <span>👥 Lính: {soldiers.length}</span>
      </div>
      {type && (
        <div style={card}>
          <strong>{type.name}</strong> — {type.role}
          <div style={{ color: '#6b5842' }}>
            Mỗi tân binh: {Object.values(type.required).map((c) => `${EQ_NAME.get(c as string)} (kho ${state.equipment[c as string] ?? 0})`).join(', ')} · 🍚 {type.food} · 🪙 {type.coins}
          </div>
        </div>
      )}
      {jobs.map((j) => {
        const p = jobProgress(j, now);
        return (
          <div key={j.id} style={card} data-testid="training-job">
            {j.kind === 'recruit' ? 'Huấn luyện tân binh' : 'Thao luyện'} · {j.unitIds.length} người · {Math.round(p * 100)}% · còn {fmt((new Date(j.finishesAt).getTime() - now) / 1000)}
            <Bar value={p} color={j.kind === 'recruit' ? '#7dd36f' : '#ffc94d'} />
          </div>
        );
      })}
      {canEdit && type && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '6px 0' }}>
          <input type="number" min={1} max={Math.max(1, b.free)} value={n} onChange={(e) => setCount(Number(e.target.value) || 1)} style={{ width: 46 }} aria-label="Số tân binh" />
          <button type="button" data-testid="recruit-btn" className="cv-cozy-hud-btn" disabled={busy || Boolean(block)} title={block ?? ''} onClick={() => handlers?.recruit(b.buildingId, type.code, n)}>
            ➕ Tuyển & huấn luyện
          </button>
        </div>
      )}
      {canEdit && block && type && <div style={{ fontSize: 11, color: '#a8322a' }} data-testid="recruit-block">{block}</div>}
      {canEdit && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
          {waiting.length > 0 && (
            <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy || b.free <= 0} onClick={() => handlers?.train(b.buildingId, 'recruit')}>
              🎓 Huấn luyện {waiting.length} tân binh chờ
            </button>
          )}
          <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy || b.free <= 0 || !drillable.length} onClick={() => handlers?.train(b.buildingId, 'drill')}>
            🥋 Thao luyện (+XP)
          </button>
          {next && (
            <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy} title={`Cấp ${b.level + 1}: ${trainingSlots(code, b.level + 1)} chỗ`} onClick={() => buildingHandlers?.upgrade(b.buildingId)}>
              ⬆️ Nâng cấp ({trainingSlots(code, b.level + 1)} chỗ)
            </button>
          )}
        </div>
      )}
      <div data-testid="barracks-soldiers">
        {soldiers.length === 0 && <div style={{ fontSize: 11, color: '#6b5842' }}>Chưa có binh sĩ.</div>}
        {soldiers.map((u) => (
          <SoldierRow key={u.id} u={u} />
        ))}
      </div>
    </Pill>
  );
}

function SoldierRow({ u, children }: { u: MilitaryUnitDTO; children?: ReactNode }) {
  const select = useMilitaryStore.getState().selectUnit;
  const prev = RANKS.find((r) => r.rank === u.rank)?.xp ?? 0;
  const p = u.nextRankXp ? (u.xp - prev) / (u.nextRankXp - prev) : 1;
  return (
    <div style={card} data-testid="soldier-row">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span>
          {CLASS_ICON[u.type]} <strong>{u.name}</strong> {RANK_ICON[u.rank]} {u.rankName}
          <span style={{ color: u.ready ? '#1f6b34' : '#b4641c' }}> · {UNIT_STATUS_LABELS[u.status]}</span>
        </span>
        <button type="button" className="cv-cozy-hud-btn" style={small} onClick={() => select(u.id)} title="Xem trên bản đồ">
          📍
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ minWidth: 72 }}>XP {u.xp}{u.nextRankXp ? `/${u.nextRankXp}` : ''}</span>
        <div style={{ flex: 1 }}>
          <Bar value={p} color="#8fb8ff" />
        </div>
        <span>⚡{u.power}</span>
      </div>
      {u.mount && (
        <div style={{ color: '#2f5d8a' }} data-testid="soldier-mount">
          🐎 Cưỡi {u.mount.name} · {u.mount.speed} m/s{u.mount.armored ? ' · giáp ngựa' : ''} · tốc độ ×{u.stats.speed.toFixed(2)}
        </div>
      )}
      {u.missing.length > 0 && <div style={{ color: '#a8322a' }}>Thiếu: {u.missing.map((s) => EQUIPMENT_SLOT_LABELS[s]).join(', ')}</div>}
      {children}
    </div>
  );
}

// ── Army panel ───────────────────────────────────────────────────────────────
type Tab = 'classes' | 'soldiers' | 'squads' | 'equipment';

function ArmyPanel({ state }: { state: MilitaryStateDTO }) {
  const [tab, setTab] = useState<Tab>('classes');
  const ready = state.units.filter((u) => u.ready).length;
  const power = state.units.reduce((a, u) => a + u.power, 0);
  return (
    <Pill testId="army-panel" style={{ top: 86, left: 14, width: 440, maxHeight: 'calc(100vh - 170px)', overflowY: 'auto', padding: '10px 12px', color: '#463726' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 15, color: '#2b2116' }}>⚔️ Quân đội</strong>
        <button type="button" className="cv-cozy-hud-btn" onClick={() => useMilitaryStore.getState().setArmyOpen(false)} aria-label="Đóng">
          <CloseOutlined />
        </button>
      </div>
      <div style={{ fontSize: 12, margin: '4px 0' }} data-testid="army-readiness">
        {state.units.length} binh sĩ · sẵn sàng {ready}/{state.units.length} ({state.units.length ? Math.round((ready / state.units.length) * 100) : 0}%) · sức mạnh ⚡{power} · có thể tuyển {state.recruitable}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '6px 0' }}>
        {(
          [
            ['classes', '🎖️ Binh chủng'],
            ['soldiers', `👥 Binh sĩ (${state.units.length})`],
            ['squads', `🚩 Đội hình (${state.squads.length})`],
            ['equipment', '🛡️ Trang bị'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" data-testid={`army-tab-${k}`} className={`cv-cozy-hud-btn ${tab === k ? 'cv-cozy-hud-btn--active' : ''}`} style={small} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'classes' && <Classes state={state} />}
      {tab === 'soldiers' && <Soldiers state={state} />}
      {tab === 'squads' && <Squads state={state} />}
      {tab === 'equipment' && <Equipment state={state} />}
    </Pill>
  );
}

const STAT_LABELS: [keyof UnitStats, string, (v: number) => string][] = [
  ['hp', '❤️ Máu', (v) => String(v)],
  ['attack', '⚔️ Công', (v) => String(v)],
  ['defense', '🛡️ Thủ', (v) => String(v)],
  ['range', '📏 Tầm', (v) => `${v} m`],
  ['speed', '👟 Tốc', (v) => `×${v.toFixed(2)}`],
  ['reload', '⏳ Nhịp', (v) => `${v}s`],
];

function Classes({ state }: { state: MilitaryStateDTO }) {
  return (
    <div data-testid="army-classes">
      {UNIT_TYPE_DEFINITIONS.map((t) => {
        const units = state.units.filter((u) => u.type === t.code);
        const special = [t.base.block ? `chặn ${Math.round(t.base.block * 100)}%` : '', t.base.antiCharge ? `chống kỵ ${Math.round(t.base.antiCharge * 100)}%` : '', t.base.armorPierce ? `xuyên giáp ${Math.round(t.base.armorPierce * 100)}%` : '']
          .filter(Boolean)
          .join(' · ');
        return (
          <div key={t.code} style={{ ...card, borderLeft: `4px solid ${t.look.tunic}` }} data-testid={`class-${t.code}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>
                {CLASS_ICON[t.code]} {t.name}
              </strong>
              <span>
                {units.length} lính · sẵn sàng {units.filter((u) => u.ready).length}
              </span>
            </div>
            <div style={{ color: '#6b5842' }}>{t.role}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, marginTop: 2 }}>
              {STAT_LABELS.map(([k, label, f]) => (
                <span key={k}>
                  {label}: <strong>{f(t.base[k])}</strong>
                </span>
              ))}
            </div>
            {special && <div style={{ color: '#2f5d8a' }}>✨ {special}</div>}
            <div style={{ color: '#6b5842' }}>Bài tập: {t.drills.join(' → ')}</div>
          </div>
        );
      })}
    </div>
  );
}

function Soldiers({ state }: { state: MilitaryStateDTO }) {
  const handlers = useMilitaryStore((s) => s.handlers);
  const busy = useMilitaryStore((s) => s.busy);
  const canEdit = useBuildingStore((s) => s.canEdit);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div data-testid="army-soldiers">
      {state.units.length === 0 && <div style={{ fontSize: 11, color: '#6b5842' }}>Chưa có binh sĩ — xây doanh trại và tuyển cư dân.</div>}
      {state.units.map((u) => (
        <SoldierRow key={u.id} u={u}>
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            <button type="button" className="cv-cozy-hud-btn" style={small} onClick={() => setOpen(open === u.id ? null : u.id)}>
              🎒 Trang bị
            </button>
            {canEdit && (
              <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy || u.status === 'training' || u.status === 'drilling'} onClick={() => handlers?.discharge(u.id)}>
                🏠 Giải ngũ
              </button>
            )}
          </div>
          {open === u.id && (
            <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 3, marginTop: 4 }} data-testid="equipment-editor">
              {EQUIPMENT_SLOTS.filter((slot) => EQUIPMENT_DEFINITIONS.some((e) => e.slot === slot && canEquip(u.type, slot, e.code))).map((slot) => (
                <EquipSlot key={slot} u={u} slot={slot} state={state} disabled={!canEdit || busy || u.status === 'training' || u.status === 'drilling'} />
              ))}
            </div>
          )}
        </SoldierRow>
      ))}
    </div>
  );
}

function EquipSlot({ u, slot, state, disabled }: { u: MilitaryUnitDTO; slot: (typeof EQUIPMENT_SLOTS)[number]; state: MilitaryStateDTO; disabled: boolean }) {
  const handlers = useMilitaryStore((s) => s.handlers);
  const options = EQUIPMENT_DEFINITIONS.filter((e) => e.slot === slot && canEquip(u.type, slot, e.code));
  const current = u.equipment[slot] ?? '';
  return (
    <>
      <span>{EQUIPMENT_SLOT_LABELS[slot]}</span>
      <select
        value={current}
        disabled={disabled}
        aria-label={EQUIPMENT_SLOT_LABELS[slot]}
        onChange={(e) => handlers?.equip(u.id, slot, (e.target.value || null) as EquipmentCode | null)}
      >
        <option value="">— trống —</option>
        {options.map((o) => (
          <option key={o.code} value={o.code} disabled={o.code !== current && (state.equipment[o.code] ?? 0) < 1}>
            {o.name} (kho {state.equipment[o.code] ?? 0})
          </option>
        ))}
      </select>
    </>
  );
}

function Squads({ state }: { state: MilitaryStateDTO }) {
  const handlers = useMilitaryStore((s) => s.handlers);
  const busy = useMilitaryStore((s) => s.busy);
  const canEdit = useBuildingStore((s) => s.canEdit);
  const [name, setName] = useState('');
  const [formation, setFormation] = useState<Formation>('line');
  const [pick, setPick] = useState<Record<string, string>>({});
  const unit = new Map(state.units.map((u) => [u.id, u]));
  return (
    <div data-testid="army-squads">
      {canEdit && (
        <div style={{ display: 'flex', gap: 4, margin: '4px 0' }}>
          <input value={name} maxLength={40} placeholder="Tên đội" onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} aria-label="Tên đội" />
          <select value={formation} onChange={(e) => setFormation(e.target.value as Formation)} aria-label="Đội hình">
            {(Object.keys(FORMATION_LABELS) as Formation[]).map((f) => (
              <option key={f} value={f}>
                {FORMATION_LABELS[f]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="cv-cozy-hud-btn"
            style={small}
            disabled={busy || !name.trim()}
            onClick={() => {
              handlers?.createSquad(name.trim(), formation);
              setName('');
            }}
          >
            ➕ Lập đội
          </button>
        </div>
      )}
      {state.squads.length === 0 && <div style={{ fontSize: 11, color: '#6b5842' }}>Chưa có đội nào.</div>}
      {state.squads.map((s) => {
        const free = state.units.filter((u) => !s.members.includes(u.id));
        return (
          <div key={s.id} style={card} data-testid="squad-row">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <strong>🚩 {s.name}</strong>
              <span style={{ color: s.status === 'deployed' ? '#b4641c' : '#1f6b34' }}>{SQUAD_STATUS_LABELS[s.status]}</span>
            </div>
            <div style={{ color: '#6b5842' }}>
              {FORMATION_LABELS[s.formation]} · {s.members.length}/{MAX_SQUAD_SIZE} lính · ⚡{s.power} · XP {s.xp} · sẵn sàng {Math.round(s.readiness * 100)}%
            </div>
            <Bar value={s.readiness} color="#7dd36f" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, margin: '3px 0' }}>
              {s.members.map((id) => {
                const u = unit.get(id);
                return (
                  <span key={id} style={{ background: '#f4ead8', borderRadius: 6, padding: '0 5px' }}>
                    {u ? `${CLASS_ICON[u.type]} ${u.name}` : '?'}
                    {canEdit && (
                      <button type="button" style={{ border: 0, background: 'none', cursor: 'pointer', padding: '0 0 0 3px' }} disabled={busy} onClick={() => handlers?.removeMember(s.id, id)} aria-label="Rút khỏi đội">
                        ✕
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <select value={pick[s.id] ?? ''} onChange={(e) => setPick({ ...pick, [s.id]: e.target.value })} aria-label="Chọn binh sĩ">
                  <option value="">+ binh sĩ…</option>
                  {free.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({getUnitType(u.type).name}, {u.rankName})
                    </option>
                  ))}
                </select>
                <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy || !pick[s.id]} onClick={() => handlers?.addMembers(s.id, [pick[s.id]])}>
                  Gán
                </button>
                <select value={s.formation} disabled={busy} onChange={(e) => handlers?.updateSquad(s.id, { formation: e.target.value as Formation })} aria-label="Đổi đội hình">
                  {(Object.keys(FORMATION_LABELS) as Formation[]).map((f) => (
                    <option key={f} value={f}>
                      {FORMATION_LABELS[f]}
                    </option>
                  ))}
                </select>
                <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy} onClick={() => handlers?.updateSquad(s.id, { status: s.status === 'deployed' ? 'standby' : 'deployed' })}>
                  {s.status === 'deployed' ? '↩️ Về doanh trại' : '🚀 Xuất quân'}
                </button>
                <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy || s.status === 'deployed'} onClick={() => handlers?.deleteSquad(s.id)}>
                  🗑️
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Equipment({ state }: { state: MilitaryStateDTO }) {
  return (
    <div data-testid="army-equipment">
      <div style={{ fontSize: 11, color: '#6b5842', margin: '2px 0 4px' }}>Trang bị được rèn ở Lò rèn quân sự (công thức trong bảng Sản xuất) và cất ở kho.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {EQUIPMENT_DEFINITIONS.map((e) => (
          <div key={e.code} style={{ ...card, margin: 0 }}>
            <strong>{e.name}</strong> · {EQUIPMENT_SLOT_LABELS[e.slot]}
            <div style={{ color: (state.equipment[e.code] ?? 0) > 0 ? '#1f6b34' : '#a8322a' }}>Kho: {Math.floor(state.equipment[e.code] ?? 0)}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, marginTop: 6 }}>🍚 Lương thực: {Math.floor(state.food)}</div>
    </div>
  );
}
