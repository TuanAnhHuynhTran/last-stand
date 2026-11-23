import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ECONOMY_LABELS, ENEMY_DEFINITIONS, ENEMY_GROUP_LABELS, UNIT_TYPE_DEFINITIONS, type EconomyCode, type MissionCode } from '@cityverse/shared';
import { battleApi, battleErrorMessage } from '../api/battle.api';
import '../game/battle/battle.css';

const CLASS_ICON: Record<string, string> = { swordsman: '🗡️', spearman: '🔱', archer: '🏹', crossbowman: '🎯' };

/** Mission board: separate PvE battlefields — your buildings and land are never at risk. */
export function BattleLobbyPage() {
  const { cityId = '' } = useParams();
  const navigate = useNavigate();
  const [mission, setMission] = useState<MissionCode>('rescue_survivors');
  const [roster, setRoster] = useState<string[]>([]);
  const [poiId, setPoiId] = useState('');
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const lobby = useQuery({ queryKey: ['battle-lobby', cityId], queryFn: () => battleApi.lobby(cityId), refetchInterval: 15000 });
  const create = useMutation({
    mutationFn: async () => {
      // The same click retried keeps its idempotency key → never two battles.
      const signature = JSON.stringify({ mission, roster, poiId });
      if (retry.current?.signature !== signature) retry.current = { signature, key: globalThis.crypto.randomUUID() };
      return battleApi.create(cityId, { mission: mission as Exclude<typeof mission, 'pvp_duel'>, unitIds: roster, poiId: poiId || undefined, idempotencyKey: retry.current.key });
    },
    onSuccess: (b) => navigate(`/battle/${b.id}`),
  });
  const data = lobby.data;
  const entry = data?.missions.find((m) => m.mission.code === mission);
  const def = entry?.mission;
  const toggle = (id: string) => setRoster((r) => (r.includes(id) ? r.filter((x) => x !== id) : r.length >= (def?.maxUnits ?? 6) ? r : [...r, id]));

  return (
    <main className="battle-lobby" data-testid="battle-lobby">
      <Link to={`/game/${cityId}`}>← Trở về lãnh địa</Link>
      <h1>⚔️ Bảng nhiệm vụ PvE</h1>
      <p>Chiến trường hex riêng — nhà cửa, ruộng vườn và lãnh thổ của bạn không bị ảnh hưởng.</p>
      {lobby.isLoading && <p>Đang kiểm tra đội quân…</p>}
      {(lobby.error || create.error) && <p role="alert">{battleErrorMessage(lobby.error ?? create.error)}</p>}
      {data?.active && (
        <div className="battle-card">
          <strong>Đội quân đang ngoài chiến trường</strong> — {data.missions.find((m) => m.mission.code === data.active!.mission)?.mission.name} · lượt {data.active.turn}
          <p className="battle-note">Trận được lưu trên server; mất kết nối không làm mất lượt. Bỏ dở quá 24 giờ sẽ tính là rút lui.</p>
          <button className="primary" onClick={() => navigate(`/battle/${data.active!.id}`)}>
            ▶ Tiếp tục trận
          </button>
        </div>
      )}

      <div className="mission-grid">
        {data?.missions.map((m) => (
          <button key={m.mission.code} className={`battle-card ${mission === m.mission.code ? 'chosen' : ''}`} onClick={() => { setMission(m.mission.code); setPoiId(''); }} data-testid={`mission-${m.mission.code}`}>
            <strong>{m.mission.name}</strong>
            <p className="battle-note">{m.mission.description}</p>
            <p className="battle-note">🎯 {m.mission.objectiveText}</p>
            <p className="battle-note">
              👥 {m.mission.minUnits}–{m.mission.maxUnits} lính · ⏳ {m.mission.turnLimit} lượt · thắng {m.victories} lần
            </p>
            <p className="battle-note">
              Kẻ địch: {[...new Set(m.mission.enemies.map((e) => ENEMY_GROUP_LABELS[ENEMY_DEFINITIONS[e].group]))].join(', ')}
            </p>
            <p className="battle-note">
              Thưởng: {m.mission.reward.resources.coins} xu
              {m.mission.reward.resources.wood ? ` · ${m.mission.reward.resources.wood} gỗ` : ''}
              {m.mission.reward.resources.stone ? ` · ${m.mission.reward.resources.stone} đá` : ''}
              {Object.entries(m.mission.reward.goods).map(([c, n]) => ` · ${n} ${ECONOMY_LABELS[c as EconomyCode] ?? c}`).join('')}
              {m.mission.reward.survivors ? ` · ${m.mission.reward.survivors} người sống sót` : ''}
            </p>
            {!m.available && <p style={{ color: '#a8322a' }}>🔒 {m.reasons.join(' · ')}</p>}
          </button>
        ))}
      </div>

      {def && (
        <section className="battle-card">
          <h2>
            Chọn đội ({roster.length}/{def.maxUnits}, tối thiểu {def.minUnits})
          </h2>
          {data!.squads.length > 0 && (
            <p>
              Lấy theo đội hình:{' '}
              {data!.squads.map((sq) => (
                <button key={sq.id} onClick={() => setRoster(sq.members.filter((id) => data!.candidates.find((c) => c.id === id)?.available).slice(0, def.maxUnits))}>
                  🚩 {sq.name}
                </button>
              ))}
            </p>
          )}
          {!data!.candidates.length && <p>Chưa có binh sĩ — tuyển quân và huấn luyện ở doanh trại.</p>}
          <div className="mission-grid">
            {data!.candidates.map((c) => (
              <label key={c.id} className="roster-row" style={{ opacity: c.available ? 1 : 0.55 }}>
                <input type="checkbox" checked={roster.includes(c.id)} disabled={!c.available || Boolean(data!.active)} onChange={() => toggle(c.id)} />
                <span>
                  {CLASS_ICON[c.type]} <strong>{c.name}</strong> · {UNIT_TYPE_DEFINITIONS.find((u) => u.code === c.type)?.name} · {c.rankName}
                  {c.mounted ? ' · 🐎' : ''}
                  <br />
                  <small>
                    ⚡{c.power} · ❤️ {Math.round(c.health * 100)}%{c.reason ? ` · ${c.reason}` : ''}
                  </small>
                </span>
              </label>
            ))}
          </div>
          {entry!.pois.length > 0 && (
            <p>
              Địa điểm khám phá:{' '}
              <select value={poiId} onChange={(e) => setPoiId(e.target.value)}>
                <option value="">Viễn chinh độc lập</option>
                {entry!.pois.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.kind} ({p.q}, {p.r}) — thắng sẽ mở khóa vùng này
                  </option>
                ))}
              </select>
            </p>
          )}
          <p className="battle-note">Lính bị hạ sẽ bị thương và về lãnh địa hồi phục. Bỏ dở quá 24 giờ tính là thua. Server tính mọi sát thương và phần thưởng.</p>
          <button className="primary" disabled={!entry!.available || create.isPending || roster.length < def.minUnits} onClick={() => create.mutate()} data-testid="start-battle">
            🚩 Xuất quân
          </button>
        </section>
      )}

      <section className="battle-card">
        <h2>Nhật ký chiến trường</h2>
        {!data?.history.length && <p className="battle-note">Chưa có trận nào.</p>}
        {data?.history.map((h) => (
          <p key={h.id}>
            <Link to={`/battle/${h.id}`}>
              {data.missions.find((m) => m.mission.code === h.mission)?.mission.name} · {h.phase === 'victory' ? `🏆 ${'★'.repeat(h.stars)}` : '💀 thua'}
              {h.phase === 'victory' && !h.claimed ? ' · 🎁 chưa nhận thưởng' : ''}
            </Link>
          </p>
        ))}
      </section>
    </main>
  );
}
