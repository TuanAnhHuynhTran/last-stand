import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { CloseOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  ACTIVITY_LABELS,
  DAY_PHASE_LABELS,
  ECONOMY_LABELS,
  MOOD_ICONS,
  MOOD_LABELS,
  PROFESSION_CODES,
  RESCUE_COST,
  RESOURCE_GROUP_LABELS,
  getBuildingDefinition,
  getProfession,
  getRecipe,
  recipesFor,
  supplyDays,
  type BuildingTypeCode,
  type EconomyCode,
  type PopulationStateDTO,
  type SurvivorDTO,
  type WorkplaceDTO,
} from '@cityverse/shared';
import { populationApi } from '../../api/population.api';
import { useBuildingStore } from '../buildings/buildingStore';
import { currentClock, usePopulationStore } from './populationStore';
import { workplaceLabel } from './populationLabels';

const PROF_ICON: Record<string, string> = { farmer: '👨‍🌾', herder: '🐄', fisher: '🎣', carpenter: '🪚', mason: '🧱', blacksmith: '⚒️', transporter: '🛒', warehouse: '📦' };
const small: CSSProperties = { padding: '0 7px', fontSize: 11 };

function Pill({ children, style, testId }: { children: ReactNode; style?: CSSProperties; testId?: string }) {
  return (
    <div className="cv-cozy-hud-pill" data-testid={testId} style={{ position: 'absolute', zIndex: 22, ...style }}>
      {children}
    </div>
  );
}

const Bar = ({ value, color }: { value: number; color: string }) => (
  <div style={{ height: 6, background: '#eadfca', borderRadius: 4, overflow: 'hidden' }}>
    <div style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%`, height: '100%', background: color }} />
  </div>
);


const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

function useClockTick(): number {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return Date.now();
}

type Tab = 'people' | 'housing' | 'jobs' | 'production' | 'economy' | 'alerts';

export function PopulationHud({ cityId }: { cityId: string }) {
  const state = usePopulationStore((s) => s.state);
  const offset = usePopulationStore((s) => s.serverOffsetMs);
  const unreachable = usePopulationStore((s) => s.unreachable);
  const canEdit = useBuildingStore((s) => s.canEdit);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('people');
  const now = useClockTick();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.code === 'KeyU') setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!state) return null;
  const clock = currentClock(state, offset, now)!;
  const days = supplyDays(state.stock, state.survivors.length);
  const blockedWarnings = Object.entries(unreachable).map(([id, reason]) => ({
    code: 'UNREACHABLE',
    severity: 'warning' as const,
    message: `${state.survivors.find((s) => s.id === id)?.name ?? 'Cư dân'}: ${reason}.`,
  }));
  const alerts = [...state.warnings, ...blockedWarnings];
  const danger = alerts.some((w) => w.severity === 'danger');

  return (
    <>
      <Pill testId="population-bar" style={{ top: 14, left: '50%', transform: 'translateX(-50%)', padding: '5px 12px', display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#463726' }}>
        <span title="Dân số / sức chứa nhà ở" data-testid="population-count">
          👥 {state.survivors.length}/{state.housingCapacity}
        </span>
        <span title="Lương thực đủ bao nhiêu ngày" style={{ color: days.food < 1 ? '#c0392b' : undefined }}>
          🍚 {Number.isFinite(days.food) ? days.food.toFixed(1) : '∞'} ngày
        </span>
        <span title="Nước đủ bao nhiêu ngày" style={{ color: days.water < 1 ? '#c0392b' : undefined }}>
          💧 {Number.isFinite(days.water) ? days.water.toFixed(1) : '∞'} ngày
        </span>
        <span title={DAY_PHASE_LABELS[clock.phase]} data-testid="game-clock">
          {clock.phase === 'night' ? '🌙' : clock.phase === 'evening' ? '🌇' : '☀️'} Ngày {clock.day + 1} · {hhmm(clock.hour)}
        </span>
        <button type="button" data-testid="open-population" className={`cv-cozy-hud-btn ${open ? 'cv-cozy-hud-btn--active' : ''}`} style={small} onClick={() => setOpen((v) => !v)}>
          <TeamOutlined /> Dân cư [U]
        </button>
        {alerts.length > 0 && (
          <button type="button" className="cv-cozy-hud-btn" style={{ ...small, color: danger ? '#c0392b' : '#b4641c' }} onClick={() => { setOpen(true); setTab('alerts'); }} data-testid="population-alerts">
            ⚠️ {alerts.length}
          </button>
        )}
      </Pill>

      {open && (
        <Pill testId="population-panel" style={{ top: 56, left: 14, width: 430, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', padding: '10px 12px', color: '#463726' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 15, color: '#2b2116' }}>🏘️ Dân cư & kinh tế</strong>
            <button type="button" className="cv-cozy-hud-btn" onClick={() => setOpen(false)} aria-label="Đóng">
              <CloseOutlined />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '6px 0' }}>
            {(
              [
                ['people', '👥 Cư dân'],
                ['housing', '🏠 Nhà ở'],
                ['jobs', '🛠️ Phân công'],
                ['production', '🏭 Sản xuất'],
                ['economy', '📊 Thu chi'],
                ['alerts', `⚠️ Cảnh báo (${alerts.length})`],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" data-testid={`pop-tab-${k}`} className={`cv-cozy-hud-btn ${tab === k ? 'cv-cozy-hud-btn--active' : ''}`} style={small} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'people' && <People state={state} unreachable={unreachable} />}
          {tab === 'housing' && <Housing state={state} canEdit={canEdit} />}
          {tab === 'jobs' && <Jobs state={state} canEdit={canEdit} />}
          {tab === 'production' && <Production state={state} canEdit={canEdit} />}
          {tab === 'economy' && <Economy cityId={cityId} state={state} />}
          {tab === 'alerts' && (
            <div data-testid="population-alert-list">
              {alerts.length === 0 && <div style={{ fontSize: 12, color: '#1f6b34' }}>Mọi thứ ổn định. 🌿</div>}
              {alerts.map((w, i) => (
                <div key={i} style={{ fontSize: 12, padding: '4px 6px', margin: '3px 0', borderRadius: 6, background: w.severity === 'danger' ? 'rgba(255,90,74,0.18)' : w.severity === 'warning' ? 'rgba(242,193,78,0.25)' : 'rgba(127,203,92,0.18)' }}>
                  {w.severity === 'danger' ? '⛔' : w.severity === 'warning' ? '⚠️' : 'ℹ️'} {w.message}
                </div>
              ))}
            </div>
          )}
          <Settings state={state} canEdit={canEdit} hourNow={clock.totalHours} />
        </Pill>
      )}
    </>
  );
}

function People({ state, unreachable }: { state: PopulationStateDTO; unreachable: Record<string, string> }) {
  const select = usePopulationStore.getState().selectSurvivor;
  const wp = new Map(state.workplaces.map((w) => [w.id, w]));
  return (
    <div data-testid="population-people">
      {state.survivors.map((s) => (
        <SurvivorRow key={s.id} s={s} job={s.job ? wp.get(s.job.id) : undefined} blocked={unreachable[s.id]} onFocus={() => select(s.id)} />
      ))}
    </div>
  );
}

function SurvivorRow({ s, job, blocked, onFocus }: { s: SurvivorDTO; job?: WorkplaceDTO; blocked?: string; onFocus: () => void }) {
  const best = PROFESSION_CODES.reduce((a, p) => ((s.skills[p] ?? 0) > (s.skills[a] ?? 0) ? p : a), PROFESSION_CODES[0]);
  return (
    <div style={{ padding: '5px 6px', margin: '3px 0', background: 'rgba(255,255,255,0.6)', borderRadius: 8, fontSize: 11 }} data-testid="survivor-row">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span>
          <span title={MOOD_LABELS[s.mood]}>{MOOD_ICONS[s.mood]}</span> <strong>{s.name}</strong>{' '}
          <span style={{ color: '#6b5842' }}>
            {s.profession ? `${PROF_ICON[s.profession]} ${getProfession(s.profession).name}` : 'Chưa có nghề'} · {ACTIVITY_LABELS[s.activity]}
          </span>
        </span>
        <button type="button" className="cv-cozy-hud-btn" style={small} onClick={onFocus} title="Xem trên bản đồ">
          📍
        </button>
      </div>
      <div style={{ color: '#6b5842' }}>
        {job ? `Làm tại ${workplaceLabel(job)}` : 'Thất nghiệp'} · {s.homeId ? 'có nhà' : 'vô gia cư'} · giỏi nhất: {getProfession(best).name} ({Math.round((s.skills[best] ?? 0) * 100)})
        {blocked ? <span style={{ color: '#a8322a' }}> · {blocked}</span> : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 2 }}>
        <span title="Sức khỏe">❤️<Bar value={s.health} color="#e05a6a" /></span>
        <span title="Thể lực">⚡<Bar value={s.stamina} color="#f2c14e" /></span>
        <span title="Hài lòng">😊<Bar value={s.satisfaction} color="#7dd36f" /></span>
      </div>
    </div>
  );
}

function Housing({ state, canEdit }: { state: PopulationStateDTO; canEdit: boolean }) {
  const h = usePopulationStore((s) => s.handlers);
  const busy = usePopulationStore((s) => s.busy);
  const byId = new Map(state.survivors.map((s) => [s.id, s]));
  const homeless = state.survivors.filter((s) => !s.homeId);
  return (
    <div data-testid="population-housing">
      <div style={{ fontSize: 11, color: '#6b5842', marginBottom: 4 }}>Nhà cấp 1/2/3 chứa 4/6/10 người. Xây nhà tăng sức chứa — dân số chỉ tăng khi có người di cư, cứu hộ hoặc sinh nở.</div>
      {state.houses.length === 0 && <div style={{ fontSize: 12, color: '#a8322a' }}>Chưa có nhà nào — hãy xây Nhà dân.</div>}
      {state.houses.map((house, i) => (
        <div key={house.buildingId} style={{ padding: '5px 6px', margin: '3px 0', background: 'rgba(255,255,255,0.6)', borderRadius: 8, fontSize: 11 }}>
          <strong>
            🏠 Nhà {i + 1} · cấp {house.level}
          </strong>{' '}
          {house.ready ? `${house.residents.length}/${house.capacity} người` : 'đang xây'}
          <div style={{ color: '#6b5842' }}>{house.residents.map((id) => byId.get(id)?.name).join(', ') || '—'}</div>
          {canEdit && house.ready && house.residents.length < house.capacity && (
            <select aria-label="Chuyển vào" value="" disabled={busy} onChange={(e) => e.target.value && h?.moveHome(e.target.value, house.buildingId)} style={{ fontSize: 11, marginTop: 2 }}>
              <option value="">+ Chuyển người vào…</option>
              {state.survivors.filter((s) => s.homeId !== house.buildingId).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.homeId ? '' : '(vô gia cư)'}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
      {homeless.length > 0 && <div style={{ fontSize: 12, color: '#a8322a' }}>⚠️ {homeless.length} người chưa có nhà: {homeless.map((s) => s.name).join(', ')}</div>}
    </div>
  );
}

function Jobs({ state, canEdit }: { state: PopulationStateDTO; canEdit: boolean }) {
  const h = usePopulationStore((s) => s.handlers);
  const busy = usePopulationStore((s) => s.busy);
  const byId = new Map(state.survivors.map((s) => [s.id, s]));
  const free = state.survivors.filter((s) => !s.job);
  return (
    <div data-testid="population-jobs">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
        <span>
          {free.length} người rảnh · {state.workplaces.reduce((a, w) => a + Math.max(0, w.slots - w.workers.length), 0)} chỗ trống
        </span>
        {canEdit && (
          <button type="button" data-testid="auto-assign" className="cv-cozy-hud-btn" style={small} disabled={busy} onClick={() => h?.autoAssign()}>
            ⚙️ Phân công tự động
          </button>
        )}
      </div>
      {state.workplaces.length === 0 && <div style={{ fontSize: 12, color: '#6b5842' }}>Chưa có nơi làm việc — xây ruộng, trại, ao, xưởng mộc, mỏ đá, lò rèn, giếng, kho hoặc chợ.</div>}
      {state.workplaces.map((w) => (
        <div key={w.id} style={{ padding: '5px 6px', margin: '3px 0', background: 'rgba(255,255,255,0.6)', borderRadius: 8, fontSize: 11 }} data-testid="workplace-row">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>
              {PROF_ICON[w.profession]} {workplaceLabel(w)} · cấp {w.level}
            </strong>
            <span>
              {w.workers.length}/{w.slots} {getProfession(w.profession).name.toLowerCase()}
              {!w.ready ? ' · đang xây' : ''}
            </span>
          </div>
          {w.workers.map((id) => (
            <div key={id} style={{ display: 'flex', justifyContent: 'space-between', color: '#6b5842' }}>
              <span>
                {byId.get(id)?.name} (kỹ năng {Math.round((byId.get(id)?.skills[w.profession] ?? 0) * 100)})
              </span>
              {canEdit && (
                <button type="button" className="cv-cozy-hud-btn" style={small} disabled={busy} onClick={() => h?.unassign(id)}>
                  Cho nghỉ
                </button>
              )}
            </div>
          ))}
          {canEdit && w.ready && w.workers.length < w.slots && (
            <select aria-label="Phân công" value="" disabled={busy} onChange={(e) => e.target.value && h?.assign(e.target.value, w.kind, w.id)} style={{ fontSize: 11, marginTop: 2 }}>
              <option value="">+ Phân công…</option>
              {[...state.survivors]
                .filter((s) => s.job?.id !== w.id)
                .sort((a, b) => (b.skills[w.profession] ?? 0) - (a.skills[w.profession] ?? 0))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — kỹ năng {Math.round((s.skills[w.profession] ?? 0) * 100)}
                    {s.job ? ' (đang có việc khác)' : ''}
                  </option>
                ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}

function Production({ state, canEdit }: { state: PopulationStateDTO; canEdit: boolean }) {
  const h = usePopulationStore((s) => s.handlers);
  const busy = usePopulationStore((s) => s.busy);
  const label = (c: string) => ECONOMY_LABELS[c as EconomyCode] ?? c;
  return (
    <div data-testid="population-production">
      {state.production.length === 0 && <div style={{ fontSize: 12, color: '#6b5842' }}>Chưa có xưởng sản xuất (xưởng mộc, mỏ đá, lò rèn, giếng).</div>}
      {state.production.map((p) => {
        const recipe = p.recipe ? getRecipe(p.recipe) : null;
        const buffered = Object.values(p.buffer).reduce((a, b) => a + b, 0);
        return (
          <div key={p.buildingId} style={{ padding: '6px', margin: '4px 0', background: 'rgba(255,255,255,0.6)', borderRadius: 8, fontSize: 11 }} data-testid="production-row">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>
                {getBuildingDefinition(p.typeCode as BuildingTypeCode).name} · cấp {p.level}
              </strong>
              <span>
                👷 {p.workers} · {p.batchesPerDay} mẻ/ngày · {p.autoTransfer ? 'tự chuyển kho' : 'cần vận chuyển'}
              </span>
            </div>
            {canEdit ? (
              <select aria-label="Công thức" value={p.recipe ?? ''} disabled={busy} onChange={(e) => h?.setRecipe(p.buildingId, e.target.value)} style={{ fontSize: 11, margin: '3px 0' }}>
                {recipesFor(p.typeCode as BuildingTypeCode, 3).map((r) => (
                  <option key={r.code} value={r.code} disabled={r.minLevel > p.level}>
                    {r.name} {r.minLevel > p.level ? `(cấp ${r.minLevel})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div>{recipe?.name}</div>
            )}
            {recipe && (
              <div style={{ color: '#6b5842' }}>
                {Object.entries(recipe.inputs).map(([c, n]) => `${n} ${label(c)}`).join(' + ') || 'không cần nguyên liệu'} → {Object.entries(recipe.outputs).map(([c, n]) => `${n} ${label(c)}`).join(' + ')} · {recipe.seconds}s công
              </div>
            )}
            <div style={{ color: p.status === 'running' ? '#1f6b34' : p.status === 'idle' ? '#6b5842' : '#a8322a' }}>
              {{ running: 'Đang sản xuất', idle: 'Nghỉ (ngoài giờ làm)', no_workers: 'Chưa có người làm', no_recipe: 'Chưa chọn công thức', missing_input: 'Thiếu nguyên liệu', buffer_full: 'Kho xưởng đầy' }[p.status]} · {Math.round(p.progress * 100)}%
            </div>
            <Bar value={p.progress} color="#7dd36f" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              <span>
                Chờ chuyển: {buffered ? Object.entries(p.buffer).filter(([, n]) => n > 0).map(([c, n]) => `${Math.floor(n)} ${label(c)}`).join(', ') : '—'} ({Math.floor(buffered)}/{p.bufferCapacity})
              </span>
              {canEdit && (
                <button type="button" data-testid={`collect-${p.buildingId}`} className="cv-cozy-hud-btn" style={small} disabled={busy || buffered < 1} onClick={() => h?.collect(p.buildingId)}>
                  🧺 Nhận
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Economy({ cityId, state }: { cityId: string; state: PopulationStateDTO }) {
  const [days, setDays] = useState(3);
  const q = useQuery({ queryKey: ['population-economy', cityId, days], queryFn: () => populationApi.economy(cityId, days), refetchInterval: 15000 });
  const stockRows = useMemo(() => Object.entries(state.stock).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]), [state.stock]);
  return (
    <div data-testid="population-economy">
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
        Báo cáo {days} ngày game gần nhất:
        {[1, 3, 7].map((d) => (
          <button key={d} type="button" className={`cv-cozy-hud-btn ${d === days ? 'cv-cozy-hud-btn--active' : ''}`} style={small} onClick={() => setDays(d)}>
            {d}
          </button>
        ))}
      </div>
      {q.data && (
        <>
          <table style={{ width: '100%', fontSize: 11, marginTop: 4, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b5842' }}>
                <th>Nhóm</th>
                <th style={{ textAlign: 'right' }}>Thu</th>
                <th style={{ textAlign: 'right' }}>Chi</th>
                <th style={{ textAlign: 'right' }}>Cân đối</th>
              </tr>
            </thead>
            <tbody>
              {q.data.groups.map((g) => (
                <tr key={g.group}>
                  <td>{RESOURCE_GROUP_LABELS[g.group]}</td>
                  <td style={{ textAlign: 'right', color: '#1f6b34' }}>+{Math.round(g.income)}</td>
                  <td style={{ textAlign: 'right', color: '#a8322a' }}>-{Math.round(g.expense)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{Math.round(g.income - g.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: '#6b5842', marginTop: 4 }}>
            Kho tối đa {q.data.storageCapacity} / loại · lương thực {q.data.foodDays ?? '∞'} ngày · nước {q.data.waterDays ?? '∞'} ngày
          </div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            {Object.entries(q.data.byReason).map(([r, n]) => `${REASONS[r] ?? r}: ${n > 0 ? '+' : ''}${Math.round(n)}`).join(' · ')}
          </div>
        </>
      )}
      <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700 }}>Tồn kho</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 11 }}>
        {stockRows.map(([c, n]) => (
          <span key={c}>
            {ECONOMY_LABELS[c as EconomyCode] ?? c}: {Math.floor(n)}
          </span>
        ))}
      </div>
    </div>
  );
}

const REASONS: Record<string, string> = {
  production: 'Sản xuất',
  production_input: 'Nguyên liệu',
  consumption: 'Ăn uống',
  rain: 'Nước mưa',
  collect: 'Nhận tay',
  auto_harvest: 'Nông dân thu hoạch',
  auto_collect: 'Chăn nuôi tự thu',
  auto_fishing: 'Ngư dân thu cá',
  rescue: 'Cứu hộ',
};

function Settings({ state, canEdit, hourNow }: { state: PopulationStateDTO; canEdit: boolean; hourNow: number }) {
  const h = usePopulationStore((s) => s.handlers);
  const busy = usePopulationStore((s) => s.busy);
  if (!canEdit) return null;
  const s = state.settings;
  return (
    <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.5)', borderRadius: 8, fontSize: 11 }} data-testid="population-settings">
      <label style={{ marginRight: 10 }}>
        <input type="checkbox" checked={s.autoAssign} disabled={busy} onChange={(e) => h?.settings({ autoAssign: e.target.checked })} /> Phân công tự động
      </label>
      <label style={{ marginRight: 10 }}>
        <input type="checkbox" checked={s.naturalGrowth} disabled={busy} onChange={(e) => h?.settings({ naturalGrowth: e.target.checked })} /> Tăng trưởng tự nhiên
      </label>
      <label>
        1 ngày ={' '}
        <select value={s.daySeconds} disabled={busy} onChange={(e) => h?.settings({ daySeconds: Number(e.target.value) })} style={{ fontSize: 11 }}>
          {[240, 480, 720, 1440, 3600].map((v) => (
            <option key={v} value={v}>
              {v >= 3600 ? `${v / 3600} giờ` : `${v / 60} phút`}
            </option>
          ))}
        </select>
      </label>
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" data-testid="rescue" className="cv-cozy-hud-btn" style={small} disabled={busy || Boolean(state.rescue)} onClick={() => h?.rescue()}>
          🚑 Cứu hộ (🪙{RESCUE_COST.coins} + {RESCUE_COST.food} lương thực)
        </button>
        {state.rescue && <span>Đội cứu hộ về sau ~{Math.max(0, Math.round(state.rescue.arrivesAtHour - hourNow))} giờ game ({state.rescue.count} người)</span>}
      </div>
    </div>
  );
}
