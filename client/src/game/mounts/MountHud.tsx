import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ANIMAL_EQUIPMENT_DEFINITIONS,
  ANIMAL_EQUIPMENT_SLOT_LABELS,
  ANIMAL_TASK_LABELS,
  CARE_LABELS,
  GROOM_COST,
  RIDER_CLASSES,
  TAME_THRESHOLD,
  VET_COST,
  canEquipAnimal,
  getAnimalBreed,
  getTrainingProgram,
  isMountFarmType,
  programsFor,
  trainingBlock,
  trainingDuration,
  type AnimalEquipmentCode,
  type AnimalEquipmentSlot,
  type MountAnimalDTO,
  type MountStateDTO,
  type TrainingProgramCode,
} from '@cityverse/shared';
import { useBuildingStore } from '../buildings/buildingStore';
import { useLivestockStore } from '../livestock/livestockStore';
import { useMilitaryStore } from '../military/militaryStore';
import { useMountStore } from './mountStore';

const small: CSSProperties = { padding: '0 7px', fontSize: 11 };
const card: CSSProperties = { padding: '6px 8px', margin: '4px 0', background: 'rgba(255,255,255,0.65)', borderRadius: 8, fontSize: 11 };
const ICON = { horse: '🐴', elephant: '🐘' } as const;
const EQ_NAME = new Map(ANIMAL_EQUIPMENT_DEFINITIONS.map((e) => [e.code as string, e.name]));
const BLOCK_TEXT: Record<string, string> = {
  ANIMAL_YOUNG: 'con non',
  ANIMAL_TOO_WEAK: 'quá yếu',
  ANIMAL_HUNGRY: 'đang đói',
  NOT_TAME: 'chưa thuần',
  STABLE_LEVEL_TOO_LOW: 'cần trại cấp 2',
  MAX_TRAINED: 'đã tối đa',
  ANIMAL_IN_USE: 'đang được dùng',
  WRONG_SPECIES: 'không hợp',
};

function Pill({ children, style, testId }: { children: ReactNode; style?: CSSProperties; testId?: string }) {
  return (
    <div className="cv-cozy-hud-pill" data-testid={testId} style={{ position: 'absolute', zIndex: 23, ...style }}>
      {children}
    </div>
  );
}

const Bar = ({ value, color, mark }: { value: number; color: string; mark?: number }) => (
  <div style={{ position: 'relative', height: 6, background: '#eadfca', borderRadius: 4, overflow: 'hidden' }}>
    <div style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%`, height: '100%', background: color, transition: 'width 0.3s linear' }} />
    {mark !== undefined && <div style={{ position: 'absolute', left: `${mark * 100}%`, top: 0, bottom: 0, width: 2, background: '#6b5842' }} />}
  </div>
);

function useTick(ms = 1000): number {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return Date.now();
}

/** Stable / camp panel: working-animal stats, training, care, tack, riders and duties. */
export function MountHud() {
  const state = useMountStore((s) => s.state);
  const farmId = useLivestockStore((s) => s.selectedFarmId);
  const farms = useLivestockStore((s) => s.farms);
  const farm = farms.find((f) => f.id === farmId);
  if (!state || !farm || !isMountFarmType(farm.farmType)) return null;
  const animals = state.animals.filter((a) => a.farmId === farm.id);
  const records = state.records.filter((r) => r.farmId === farm.id).slice(0, 6);
  const names = new Map(animals.map((a) => [a.id, a.name]));
  return (
    <Pill testId="mount-panel" style={{ top: 76, right: 378, width: 360, padding: '10px 12px', color: '#463726', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: '#2b2116' }}>
        {farm.farmType === 'horse_stable' ? '🐴 Ngựa trong trại' : '🐘 Voi trong trại'} · {animals.length}/{farm.capacity}
      </div>
      <div style={{ fontSize: 11, color: '#6b5842', margin: '2px 0 4px' }}>
        Kho: {Object.entries(state.equipment).map(([c, n]) => `${EQ_NAME.get(c)} ${Math.floor(n)}`).join(' · ')}
        {state.transportBonus > 0 && <> · 🚚 +{state.transportBonus} hàng/giờ</>}
      </div>
      {animals.length === 0 && <div style={card}>Chưa có con nào — tiếp nhận ở bảng trại bên phải.</div>}
      {animals.map((a) => (
        <AnimalCard key={a.id} a={a} state={state} />
      ))}
      {records.length > 0 && (
        <div style={{ marginTop: 6 }} data-testid="care-log">
          <strong style={{ fontSize: 12 }}>📒 Nhật ký chăm sóc</strong>
          {records.map((r) => (
            <div key={r.id} style={{ fontSize: 11, color: '#6b5842' }}>
              {new Date(r.at).toLocaleTimeString()} · {CARE_LABELS[r.kind]}
              {r.animalId && names.get(r.animalId) ? ` · ${names.get(r.animalId)}` : ''}
              {r.note ? ` · ${r.note}` : ''}
            </div>
          ))}
        </div>
      )}
    </Pill>
  );
}

function AnimalCard({ a, state }: { a: MountAnimalDTO; state: MountStateDTO }) {
  const now = useTick() + useMountStore((s) => s.serverOffsetMs);
  const handlers = useMountStore((s) => s.handlers);
  const busy = useMountStore((s) => s.busy);
  const canEdit = useBuildingStore((s) => s.canEdit);
  const army = useMilitaryStore((s) => s.state);
  const selectUnit = useMilitaryStore((s) => s.selectUnit);
  const species = a.animalCode as 'horse' | 'elephant';
  const programs = programsFor(species);
  const [program, setProgram] = useState<TrainingProgramCode>(programs[0].code);
  const [rider, setRider] = useState('');
  const t = a.traits;
  const adult = now >= new Date(a.growsUpAt).getTime();
  const job = t.training;
  const progress = job ? Math.min(1, (now - new Date(job.startedAt).getTime()) / Math.max(1, new Date(job.finishesAt).getTime() - new Date(job.startedAt).getTime())) : 0;
  const block = trainingBlock(
    getTrainingProgram(program),
    { species, adult, health: a.health, satiety: a.satiety, traits: { tameness: t.tameness, stamina: t.stamina, speedBonus: 0, carryBonus: 0, trainingLevel: t.trainingLevel }, inUse: t.use !== null },
    a.farmLevel
  );
  const riders = (army?.units ?? []).filter((u) => RIDER_CLASSES.includes(u.type) && !u.mount && u.status !== 'recruit');
  const slots = (['saddle', 'armor', 'harness', 'howdah'] as AnimalEquipmentSlot[]).filter((slot) => ANIMAL_EQUIPMENT_DEFINITIONS.some((e) => canEquipAnimal(species, slot, e.code)));
  const off = !canEdit || busy;
  return (
    <div style={card} data-testid="mount-animal">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span>
          {ICON[species]} <strong>{a.name}</strong> <span style={{ color: '#6b5842' }}>{getAnimalBreed(species, a.breed).name}</span>
          {!adult && <span style={{ color: '#b4641c' }}> · con non</span>}
        </span>
        <span title="Trình độ huấn luyện">🎖️ {t.trainingLevel} · {t.trainingLabel}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '2px 6px', alignItems: 'center', margin: '3px 0' }}>
        <span>❤️ Sức khỏe</span>
        <Bar value={a.health} color="#e05a6a" />
        <span>⚡ Thể lực</span>
        <Bar value={t.stamina} color="#f2c14e" />
        <span>🤝 Thuần hóa</span>
        <Bar value={t.tameness} color={t.tame ? '#7dd36f' : '#c9a43c'} mark={TAME_THRESHOLD} />
        <span>🍚 No</span>
        <Bar value={a.satiety} color="#9fd46a" />
      </div>
      <div style={{ color: '#6b5842' }}>
        🏃 {t.speed} m/s · 📦 {t.carry} kg · {t.tame ? 'đã thuần' : 'chưa thuần (không làm thú cưỡi chiến đấu)'}
      </div>
      <div style={{ color: t.use ? '#2f5d8a' : '#6b5842' }} data-testid="mount-use">
        {t.use?.kind === 'mount' ? (
          <>
            🪖 Kỵ binh: <strong>{t.use.unitName}</strong>{' '}
            <button type="button" className="cv-cozy-hud-btn" style={small} onClick={() => selectUnit(t.use?.kind === 'mount' ? t.use.unitId : null)} title="Theo dõi">
              📍
            </button>
          </>
        ) : t.use ? (
          <>📋 {ANIMAL_TASK_LABELS[t.use.kind]}</>
        ) : (
          'Đang rảnh'
        )}
      </div>
      {job && (
        <div data-testid="animal-training">
          🏇 {getTrainingProgram(job.program).name} · {Math.round(progress * 100)}% · còn {Math.max(0, Math.ceil((new Date(job.finishesAt).getTime() - now) / 1000))}s
          <Bar value={progress} color="#ffc94d" />
        </div>
      )}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3 }}>
        {(Object.keys(t.equipment) as AnimalEquipmentSlot[]).map((s) => (
          <span key={s} style={{ background: '#f4ead8', borderRadius: 6, padding: '0 5px' }}>
            {ANIMAL_EQUIPMENT_SLOT_LABELS[s]}: {EQ_NAME.get(t.equipment[s] as string)}
          </span>
        ))}
      </div>
      {canEdit && (
        <>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            <select value={program} onChange={(e) => setProgram(e.target.value as TrainingProgramCode)} aria-label="Bài tập">
              {programs.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} ({trainingDuration(p, a.farmLevel)}s, 🪙{p.coins})
                </option>
              ))}
            </select>
            <button type="button" data-testid="train-animal" className="cv-cozy-hud-btn" style={small} disabled={off || Boolean(job) || Boolean(block)} title={block ? BLOCK_TEXT[block] : ''} onClick={() => handlers?.train(a.id, program)}>
              🏇 Huấn luyện{block && !job ? ` (${BLOCK_TEXT[block] ?? block})` : ''}
            </button>
            <button type="button" className="cv-cozy-hud-btn" style={small} disabled={off} onClick={() => handlers?.care(a.id, 'groom')} title={`🪙 ${GROOM_COST}`}>
              🪮 Chải lông
            </button>
            <button type="button" className="cv-cozy-hud-btn" style={small} disabled={off || a.farmLevel < 2} onClick={() => handlers?.care(a.id, 'vet')} title={a.farmLevel < 2 ? 'Cần khu chăm sóc (cấp 2)' : `🪙 ${VET_COST}`}>
              🩺 Thú y
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 3, marginTop: 4 }}>
            {slots.map((slot) => (
              <TackSlot key={slot} a={a} slot={slot} state={state} disabled={off || Boolean(job)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {species === 'horse' && !t.use && (
              <>
                <select value={rider} onChange={(e) => setRider(e.target.value)} aria-label="Chọn kỵ binh" disabled={!t.tame}>
                  <option value="">{t.tame ? '+ kỵ binh…' : 'chưa thuần'}</option>
                  {riders.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.rankName})
                    </option>
                  ))}
                </select>
                <button type="button" data-testid="assign-rider" className="cv-cozy-hud-btn" style={small} disabled={off || !rider || !t.tame} onClick={() => handlers?.mount(a.id, rider)}>
                  🐎 Giao
                </button>
              </>
            )}
            {t.use?.kind === 'mount' && (
              <button type="button" className="cv-cozy-hud-btn" style={small} disabled={off} onClick={() => handlers?.dismount(a.id)}>
                ↩️ Hủy giao
              </button>
            )}
            {!t.use && (
              <button type="button" className="cv-cozy-hud-btn" style={small} disabled={off || !t.tame || !t.equipment.harness} onClick={() => handlers?.task(a.id, 'transport')} title={t.equipment.harness ? '' : 'Cần đai chở hàng'}>
                📦 Chở hàng
              </button>
            )}
            {!t.use && species === 'elephant' && (
              <button type="button" className="cv-cozy-hud-btn" style={small} disabled={off || t.trainingLevel < 2} onClick={() => handlers?.task(a.id, 'military')} title="Cần trình độ 2">
                🛡️ Dự bị quân sự
              </button>
            )}
            {t.use && t.use.kind !== 'mount' && (
              <button type="button" className="cv-cozy-hud-btn" style={small} disabled={off} onClick={() => handlers?.endTask(a.id)}>
                ⏹️ Kết thúc nhiệm vụ
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TackSlot({ a, slot, state, disabled }: { a: MountAnimalDTO; slot: AnimalEquipmentSlot; state: MountStateDTO; disabled: boolean }) {
  const handlers = useMountStore((s) => s.handlers);
  const options = ANIMAL_EQUIPMENT_DEFINITIONS.filter((e) => canEquipAnimal(a.animalCode, slot, e.code));
  const current = a.traits.equipment[slot] ?? '';
  return (
    <>
      <span>{ANIMAL_EQUIPMENT_SLOT_LABELS[slot]}</span>
      <select
        value={current}
        disabled={disabled}
        aria-label={ANIMAL_EQUIPMENT_SLOT_LABELS[slot]}
        onChange={(e) => handlers?.equip(a.id, { slot, equipmentCode: (e.target.value || null) as AnimalEquipmentCode | null })}
      >
        <option value="">— trống —</option>
        {options.map((o) => (
          <option key={o.code} value={o.code} disabled={o.code !== current && (state.equipment[o.code] ?? 0) < 1}>
            {o.name} (kho {Math.floor(state.equipment[o.code] ?? 0)})
          </option>
        ))}
      </select>
    </>
  );
}
