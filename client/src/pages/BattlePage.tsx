import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BATTLE_SKILLS,
  BATTLE_STATUS_LABELS,
  ENEMY_DEFINITIONS,
  ECONOMY_LABELS,
  UNIT_TYPE_DEFINITIONS,
  getMission,
  getUnit,
  hexDistance,
  isActive,
  previewAttack,
  unitAt,
  type BattleAction,
  type BattleDTO,
  type BattleRewards,
  type BattleUnit,
  type EconomyCode,
} from '@cityverse/shared';
import { battleApi, battleErrorMessage, errorCode, isNetworkError } from '../api/battle.api';
import { pvpApi } from '../api/social.api';
import { audio } from '../audio/AudioManager';
import { isMyTurn, viewFor } from '../game/pvp/perspective';
import { emitRealtime, onRealtime } from '../realtime/socket';
import type { PvpBattleDTO } from '@cityverse/shared';
import { BattleCamera } from '../game/battle/BattleCamera';
import { BattleCanvas } from '../game/battle/BattleCanvas';
import { BattleRenderer } from '../game/battle/BattleRenderer';
import { clickIntent, computeHighlights } from '../game/battle/battleInput';
import { hexCenter } from '../game/battle/battleLayout';
import { describeEvents } from '../game/battle/battleLog';
import { useBattleStore } from '../game/battle/battleStore';
import '../game/battle/battle.css';

const KIND_LABEL = (u: BattleUnit) =>
  UNIT_TYPE_DEFINITIONS.find((x) => x.code === u.kind)?.name ?? (u.kind in ENEMY_DEFINITIONS ? ENEMY_DEFINITIONS[u.kind as keyof typeof ENEMY_DEFINITIONS].name : 'Người sống sót');
const uuid = () => globalThis.crypto.randomUUID();

/** A refusal that came back over the socket (same codes as REST). */
class ActionRefused extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
const PVP_ERRORS: Record<string, string> = { NOT_YOUR_TURN: 'Chưa đến lượt của bạn.', STALE_BATTLE: 'Trận đã thay đổi — đang tải lại.', BATTLE_FINISHED: 'Trận đã kết thúc.', RATE_LIMIT_EXCEEDED: 'Thao tác quá nhanh.' };

/** PvE mission, or (pvp) a duel against another player — same scene, HUD and rules. */
export function BattlePage({ pvp = false }: { pvp?: boolean } = {}) {
  const { battleId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const renderer = useMemo(() => new BattleRenderer(), []);
  const camera = useMemo(() => new BattleCamera(), []);
  const s = useBattleStore();
  const shown = s.shown;
  const battle = s.battle;
  const [confirmRetreat, setConfirmRetreat] = useState(false);
  const [granted, setGranted] = useState<BattleRewards | null>(null);
  const [sending, setSending] = useState(false);
  const [duel, setDuel] = useState<Pick<PvpBattleDTO, 'mySide' | 'opponent' | 'turnDeadline' | 'serverTime'> | null>(null);

  const focusOn = useCallback(
    (id: string | null) => {
      const p = id ? renderer.actorPosition(id) : null;
      if (p) camera.focus(p.x, p.z);
    },
    [renderer, camera]
  );

  /** A server DTO arrives: animate its events (if any) from the previous state, then show it. */
  const accept = useCallback(
    (dto: BattleDTO, animate: boolean) => {
      const st = useBattleStore.getState();
      const prev = st.battle?.id === dto.id ? st.battle.state : null;
      if (prev && dto.version <= (st.battle?.version ?? -1)) return; // already shown (socket + REST race)
      st.setBattle(dto);
      if ('mySide' in dto) {
        const p = dto as PvpBattleDTO;
        setDuel({ mySide: p.mySide, opponent: p.opponent, turnDeadline: p.turnDeadline, serverTime: p.serverTime });
      }
      if (animate && prev && dto.events.length) {
        st.setPlaying(true);
        st.addLog(describeEvents(dto.events, dto.state));
        renderer.play(dto.events, prev, dto.state, () => {
          useBattleStore.getState().setShown(dto.state);
          useBattleStore.getState().setPlaying(false);
        });
      } else {
        renderer.load(dto.id, dto.state);
        st.setShown(dto.state);
        if (!prev) {
          // First load / reconnect: frame the soldiers.
          const ps = dto.state.units.filter((u) => u.side === 'player' && isActive(u));
          const c = ps.reduce((a, u) => ({ x: a.x + hexCenter(u).x / ps.length, z: a.z + hexCenter(u).z / ps.length }), { x: 0, z: 0 });
          const guest = 'mySide' in dto && (dto as PvpBattleDTO).mySide === 'enemy';
          if (guest) camera.rotate(Math.PI); // the guest looks at the arena from the north
          camera.focus(c.x, c.z + (guest ? 8 : -8), 62);
          audio.setAmbience({ music: 'battle' });
          st.addLog(['Đã kết nối trận đấu (trạng thái lưu trên server).']);
        }
      }
    },
    [renderer, camera]
  );

  const load = useCallback(async () => {
    try {
      useBattleStore.getState().setError(null);
      if (pvp) {
        const first = !useBattleStore.getState().battle;
        accept(viewFor(await pvpApi.get(battleId)), !first);
      } else accept(await battleApi.get(battleId), false);
    } catch (e) {
      useBattleStore.getState().setError(battleErrorMessage(e));
    }
  }, [battleId, accept, pvp]);

  useEffect(() => {
    useBattleStore.getState().reset();
    renderer.onBanner = (text, tone) => useBattleStore.getState().showBanner(text, tone);
    renderer.onCinematic = (x, z) => camera.cinematic(x, z);
    renderer.onFocus = (x, z) => {
      if (!camera.inCinematic) camera.focus(x, z);
    };
    void load();
    const online = () => void load();
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
      useBattleStore.getState().reset();
    };
  }, [battleId, load, renderer, camera]);

  useEffect(() => () => renderer.dispose(), [renderer]);
  useEffect(() => () => audio.setAmbience({ music: 'world' }), []);

  // PvP: the opponent's moves arrive over Socket.IO; (re)join the duel room on every connect.
  useEffect(() => {
    if (!pvp) return undefined;
    const join = () =>
      void emitRealtime<PvpBattleDTO>('battle:join', { battleId })
        .then((r) => {
          if (r.ok) accept(viewFor(r.data), Boolean(useBattleStore.getState().battle));
        })
        .catch(() => undefined);
    const offConnect = onRealtime('connect', join);
    const offUpdate = onRealtime<{ battleId: string; version: number }>('battle:update', (u) => {
      const cur = useBattleStore.getState().battle;
      if (u.battleId === battleId && (!cur || u.version > cur.version)) void load();
    });
    join();
    return () => {
      offConnect();
      offUpdate();
    };
  }, [pvp, battleId, accept, load]);

  const send = useCallback(
    async (action: BattleAction, retry = false) => {
      const st = useBattleStore.getState();
      if (!st.battle || st.playing || sending) return;
      // A retry re-sends the SAME id + version: the server answers from its stored result.
      const req = retry && st.pending ? st.pending : { clientActionId: uuid(), version: st.battle.version, action };
      st.setPending(req);
      st.setError(null);
      setSending(true);
      try {
        let dto: BattleDTO;
        if (pvp) {
          // Socket first (instant for the opponent); REST when the socket is down. Same id = same result.
          const viaSocket = await emitRealtime<PvpBattleDTO>('battle:action', { battleId, clientActionId: req.clientActionId, expectedVersion: req.version, action: req.action }).catch(() => null);
          if (viaSocket && !viaSocket.ok) throw new ActionRefused(viaSocket.error.code, PVP_ERRORS[viaSocket.error.code] ?? viaSocket.error.message);
          dto = viewFor(viaSocket ? viaSocket.data : await pvpApi.act(battleId, req.clientActionId, req.version, req.action));
        } else dto = await battleApi.act(battleId, req.clientActionId, req.version, req.action);
        useBattleStore.getState().setPending(null);
        accept(dto, true);
      } catch (e) {
        if (e instanceof ActionRefused) {
          useBattleStore.getState().setPending(null);
          useBattleStore.getState().setError(e.message);
          audio.play('error');
          if (e.code === 'STALE_BATTLE' || e.code === 'BATTLE_FINISHED') void load();
        } else if (isNetworkError(e)) useBattleStore.getState().setError(battleErrorMessage(e));
        else {
          useBattleStore.getState().setPending(null);
          useBattleStore.getState().setError(battleErrorMessage(e));
          if (errorCode(e) === 'STALE_BATTLE') void load();
        }
      } finally {
        setSending(false);
      }
    },
    [battleId, accept, load, sending, pvp]
  );

  // Keep a living soldier selected.
  useEffect(() => {
    if (!shown) return;
    const sel = s.selectedId ? getUnit(shown, s.selectedId) : undefined;
    if (!sel || !isActive(sel) || sel.side !== 'player') {
      const next = shown.units.find((u) => u.side === 'player' && isActive(u) && (shown.phase === 'deployment' || u.ap > 0)) ?? shown.units.find((u) => u.side === 'player' && isActive(u));
      if (next) useBattleStore.getState().select(next.id);
    }
  }, [shown, s.selectedId]);

  useEffect(() => focusOn(s.selectedId), [s.selectedId, focusOn]);

  const busy = s.playing || sending;
  useEffect(() => {
    renderer.setHighlights(computeHighlights(shown, s.selectedId, s.mode, s.hover, busy));
  }, [renderer, shown, s.selectedId, s.mode, s.hover, busy]);

  const onClick = useCallback(
    (hex: { q: number; r: number }) => {
      const st = useBattleStore.getState();
      if (!st.shown || st.playing) return;
      const intent = clickIntent(st.shown, st.selectedId, st.mode, hex);
      if (!intent) return;
      if ('select' in intent) st.select(intent.select);
      else {
        if (intent.action.type === 'attack' || intent.action.type === 'skill') {
          const target = 'targetId' in intent.action && intent.action.targetId ? renderer.actorPosition(intent.action.targetId) : null;
          if (target) camera.focus(target.x, target.z); // focus the target when attacking
        }
        void send(intent.action);
        st.setMode({ kind: 'move' });
      }
    },
    [send, renderer, camera]
  );
  const onHover = useCallback((h: { q: number; r: number } | null) => useBattleStore.getState().setHover(h), []);

  const player = shown?.units.filter((u) => u.side === 'player') ?? [];
  const selected = shown && s.selectedId ? getUnit(shown, s.selectedId) : undefined;
  const hovered = shown && s.hover ? unitAt(shown, s.hover) : undefined;

  // Keyboard: Enter = end turn, Tab = next soldier, Esc = cancel, 1-3 = skills.
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const st = useBattleStore.getState();
      const state = st.shown;
      if (!state || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Enter' && state.phase === 'player') void send({ type: 'end_turn' });
      if (e.code === 'Escape') st.setMode({ kind: 'move' });
      if (e.code === 'Tab') {
        e.preventDefault();
        const list = state.units.filter((u) => u.side === 'player' && isActive(u));
        const i = list.findIndex((u) => u.id === st.selectedId);
        if (list.length) st.select(list[(i + 1) % list.length].id);
      }
      const n = Number(e.key);
      const u = st.selectedId ? getUnit(state, st.selectedId) : undefined;
      if (u && n >= 1 && n <= u.skills.length) {
        const code = u.skills[n - 1];
        if (BATTLE_SKILLS[code].target === 'self') void send({ type: 'skill', unitId: u.id, skill: code });
        else st.setMode({ kind: 'skill', skill: code });
      }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [send]);

  if (!shown || !battle) {
    return (
      <main className="battle-lobby">
        <h1>Đang tải chiến trường…</h1>
        {s.error && (
          <p role="alert">
            {s.error} <button onClick={() => void load()}>Thử lại</button>
          </p>
        )}
      </main>
    );
  }

  const def = getMission(shown.mission);
  const ended = Boolean(shown.outcome) && !s.playing;
  const myTurn = shown.phase === 'player' && !busy && (!pvp || isMyTurn({ state: shown, phase: shown.phase }));
  const draw = pvp && Boolean(shown.outcome) && shown.outcome!.winner === null;
  const banner = s.banner;

  const claim = async () => {
    try {
      const r = await battleApi.claim(battleId);
      setGranted(r.granted ?? r.battle.rewards);
      useBattleStore.getState().setBattle(r.battle);
    } catch (e) {
      useBattleStore.getState().setError(battleErrorMessage(e));
    }
  };
  const goHome = async () => {
    renderer.finish();
    await Promise.all(['military', 'population', 'mounts', 'buildings'].map((k) => queryClient.invalidateQueries({ queryKey: [k, battle.cityId] })));
    // A PvP guest fought on the host's record: go back to their own city.
    navigate(pvp ? '/dashboard' : `/game/${battle.cityId}`);
  };

  return (
    <main className="battle-shell" data-testid="battle-scene">
      <BattleCanvas renderer={renderer} camera={camera} onHover={onHover} onClick={onClick} />

      <header className="battle-top">
        <strong>⚔️ {def.name}</strong>
        <span>
          {shown.phase === 'deployment' ? 'Triển khai quân' : shown.outcome ? (shown.outcome.result === 'victory' ? 'Chiến thắng' : 'Thất bại') : `Lượt ${shown.turn}/${shown.turnLimit}`}
          {s.playing && ' · đang diễn hoạt…'}
        </span>
        <span className="battle-note" style={{ flex: 1 }}>
          {pvp && duel ? (
            <>
              Đối thủ: <strong>{duel.opponent.username}</strong> {duel.opponent.online ? '🟢' : '⚪'} ·{' '}
              {shown.outcome ? 'Đã kết thúc' : isMyTurn({ state: shown, phase: shown.phase }) ? '👉 Lượt của bạn' : '⏳ Lượt đối thủ'}
              {!shown.outcome && duel.turnDeadline && <TurnClock deadline={duel.turnDeadline} serverTime={duel.serverTime} />}
            </>
          ) : (
            def.objectiveText
          )}
        </span>
        <span title="Băng cứu thương">🩹 {shown.items.bandage}</span>
        {shown.objectives.kind === 'rescue' && (
          <span>
            🙌 {shown.objectives.freed}/{shown.objectives.captives.length} · mất {shown.objectives.lost}
          </span>
        )}
        {!shown.outcome && (
          <button disabled={busy} onClick={() => setConfirmRetreat(!confirmRetreat)}>
            🏳️ {pvp ? 'Đầu hàng' : 'Rút lui'}
          </button>
        )}
      </header>
      {confirmRetreat && !shown.outcome && (
        <div className="battle-confirm">
          {pvp ? 'Đầu hàng = đối thủ thắng (trận xếp hạng sẽ trừ điểm).' : 'Rút lui = thua trận, không có thưởng; lính bị thương vẫn chịu thương tích.'}
          <button className="primary" onClick={() => void send({ type: 'retreat' })}>
            {pvp ? 'Xác nhận đầu hàng' : 'Xác nhận rút lui'}
          </button>
          <button onClick={() => setConfirmRetreat(false)}>Ở lại</button>
        </div>
      )}

      {banner && (
        <div key={banner.id} className={`battle-banner tone-${banner.tone}`} data-testid="turn-banner">
          {banner.text}
        </div>
      )}

      <div className="battle-roster">
        {player.map((u) => (
          <button key={u.id} className={s.selectedId === u.id ? 'chosen' : ''} disabled={!isActive(u)} onClick={() => useBattleStore.getState().select(u.id)}>
            <strong>{u.name}</strong> · {KIND_LABEL(u)}
            <div className="battle-health">
              <span style={{ width: `${(u.hp / u.maxHp) * 100}%` }} />
            </div>
            <small>
              {u.ko ? 'Bị hạ' : `${u.hp}/${u.maxHp} HP · ${u.ap} AP`}
              {u.mounted ? ' · 🐎' : ''}
            </small>
          </button>
        ))}
      </div>

      <aside className="battle-panel">
        {selected && selected.side === 'player' && (
          <>
            <h3 style={{ margin: '0 0 4px' }}>
              {selected.name} <small>({KIND_LABEL(selected)})</small>
            </h3>
            <div className="battle-stats">
              <span>❤️ {selected.hp}/{selected.maxHp}</span>
              <span>🛡 {selected.armor}</span>
              <span>⚔️ {selected.attack}</span>
              <span>🎯 {selected.minRange === selected.maxRange ? selected.maxRange : `${selected.minRange}-${selected.maxRange}`} ô</span>
              <span>⚡ {selected.ap}/{selected.maxAp} AP</span>
              <span>👟 {selected.mpLeft}/{selected.move}</span>
            </div>
            {selected.statuses.length > 0 && <p className="battle-note">{selected.statuses.map((x) => BATTLE_STATUS_LABELS[x.code]).join(' · ')}</p>}
            {selected.needsReload && <p className="battle-note">{selected.loaded ? '🔩 Nỏ đã nạp' : '⚠️ Nỏ chưa nạp'}</p>}
            {shown.phase === 'player' && !selected.ko && (
              <div className="battle-actions">
                <button className={s.mode.kind === 'move' ? 'chosen' : ''} disabled={!myTurn} onClick={() => useBattleStore.getState().setMode({ kind: 'move' })}>
                  👟 Đi / Đánh
                </button>
                {selected.skills.map((code, i) => {
                  const sk = BATTLE_SKILLS[code];
                  const cd = selected.cooldowns[code] ?? 0;
                  const why = cd > 0 ? `hồi ${cd} lượt` : selected.ap < sk.ap ? `cần ${sk.ap} AP` : selected.needsReload && !selected.loaded && sk.target === 'enemy' ? 'chưa nạp' : null;
                  return (
                    <button
                      key={code}
                      title={sk.description}
                      className={s.mode.kind === 'skill' && s.mode.skill === code ? 'chosen' : ''}
                      disabled={!myTurn || Boolean(why)}
                      onClick={() => (sk.target === 'self' ? void send({ type: 'skill', unitId: selected.id, skill: code }) : useBattleStore.getState().setMode({ kind: 'skill', skill: code }))}
                    >
                      [{i + 1}] {sk.name} · {sk.ap}AP{why ? ` (${why})` : ''}
                    </button>
                  );
                })}
                <button disabled={!myTurn || selected.ap < 1} onClick={() => void send({ type: 'defend', unitId: selected.id })}>
                  🛡 Phòng thủ
                </button>
                <button
                  disabled={!myTurn || selected.ap < 1 || shown.items.bandage < 1}
                  className={s.mode.kind === 'item' ? 'chosen' : ''}
                  onClick={() => useBattleStore.getState().setMode({ kind: 'item' })}
                  title="Chọn mình hoặc đồng đội kề bên"
                >
                  🩹 Băng bó ({shown.items.bandage})
                </button>
                {selected.needsReload && !selected.loaded && (
                  <button disabled={!myTurn || selected.ap < 1} onClick={() => void send({ type: 'reload', unitId: selected.id })}>
                    🔩 Nạp tên
                  </button>
                )}
                {shown.units.some((c) => c.kind === 'captive' && isActive(c) && hexDistance(c, selected) <= 1) && (
                  <button disabled={!myTurn || selected.ap < 1} className={s.mode.kind === 'interact' ? 'chosen' : ''} onClick={() => useBattleStore.getState().setMode({ kind: 'interact' })}>
                    🙌 Giải cứu
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {hovered && hovered.id !== selected?.id && (
          <div className="battle-card" style={{ padding: 10, margin: '8px 0' }} data-testid="hover-card">
            <strong>{hovered.name}</strong> · {KIND_LABEL(hovered)}
            <div className="battle-note">
              ❤️ {hovered.hp}/{hovered.maxHp} · 🛡 {hovered.armor} · ⚔️ {hovered.attack}
              {hovered.statuses.length ? ` · ${hovered.statuses.map((x) => BATTLE_STATUS_LABELS[x.code]).join(', ')}` : ''}
            </div>
            {selected && selected.side === 'player' && hovered.side === 'enemy' && (() => {
              const p = previewAttack(shown, selected, hovered);
              return (
                <div className="battle-note">
                  Đòn đánh: {Math.round(p.hitChance * 100)}% trúng · ~{p.damage} sát thương{p.blockChance ? ` · ${Math.round(p.blockChance * 100)}% bị đỡ` : ''}
                </div>
              );
            })()}
          </div>
        )}
        {shown.phase === 'deployment' && (
          <>
            <p className="battle-note">Chọn lính rồi chọn ô xanh ngọc để đổi vị trí xuất phát.</p>
            <button className="primary" disabled={busy} onClick={() => void send({ type: 'start' })}>
              ▶ Bắt đầu trận
            </button>
          </>
        )}
        {shown.phase === 'player' && (
          <button className="primary" disabled={!myTurn} onClick={() => void send({ type: 'end_turn' })} data-testid="end-turn">
            ⏭ Kết thúc lượt [Enter]
          </button>
        )}
        {s.error && (
          <p role="alert" className="battle-error">
            {s.error}{' '}
            {s.pending && (
              <button onClick={() => void send(s.pending!.action, true)} disabled={sending}>
                ↻ Gửi lại
              </button>
            )}
            {!s.pending && <button onClick={() => void load()}>↻ Đồng bộ</button>}
          </p>
        )}
        <div className="battle-log" data-testid="battle-log">
          {s.log.slice(0, 8).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <p className="battle-note">Chuột trái: chọn / đi / đánh · Kéo: di chuyển camera · Chuột phải kéo / Q E: xoay · Cuộn: zoom · Tab: lính kế · 1–3: kỹ năng</p>
      </aside>

      {ended && (
        <div className="battle-result" data-testid="battle-result">
          <h2>{draw ? '🤝 Hòa' : shown.outcome!.result === 'victory' ? '🏆 Chiến thắng!' : '💀 Thất bại'}</h2>
          {!pvp && shown.outcome!.result === 'victory' && <p className="stars">{'★'.repeat(shown.outcome!.stars)}{'☆'.repeat(3 - shown.outcome!.stars)}</p>}
          <p className="battle-note">
            {{
              objective: 'Hoàn thành mục tiêu nhiệm vụ.',
              all_enemies: 'Hạ toàn bộ kẻ địch.',
              wiped: 'Cả đội đã gục.',
              captives_lost: 'Quá nhiều người sống sót bị hạ.',
              time: 'Hết số lượt cho phép.',
              retreat: 'Đội quân đã rút lui.',
              abandoned: 'Trận bị bỏ dở quá lâu.',
              forfeit: 'Một bên rời trận quá lâu — xử thua.',
            }[shown.outcome!.reason]}
          </p>
          {pvp && <p className="battle-note">Cả hai đội nhận XP. Trận xếp hạng cập nhật điểm Elo — xem ở mục Đấu trường.</p>}
          {!pvp && battle.rewards && (
            <ul>
              {battle.rewards.resources.coins > 0 && <li>🪙 {battle.rewards.resources.coins} xu</li>}
              {battle.rewards.resources.wood > 0 && <li>🪵 {battle.rewards.resources.wood} gỗ</li>}
              {battle.rewards.resources.stone > 0 && <li>🪨 {battle.rewards.resources.stone} đá</li>}
              {Object.entries(battle.rewards.goods).map(([c, n]) => (
                <li key={c}>
                  📦 {n} {ECONOMY_LABELS[c as EconomyCode] ?? c}
                </li>
              ))}
              {battle.rewards.survivors > 0 && <li>🙌 {battle.rewards.survivors} người sống sót gia nhập lãnh địa</li>}
            </ul>
          )}
          <p className="battle-note">Lính bị hạ sẽ bị thương và cần hồi phục trước khi xuất quân lại. XP đã được cộng.</p>
          {!pvp && shown.outcome!.result === 'victory' && !battle.claimed && (
            <button className="primary" onClick={() => void claim()} data-testid="claim">
              🎁 Nhận thưởng
            </button>
          )}
          {(battle.claimed || granted) && <p>✅ Đã nhận thưởng vào kho.</p>}
          {pvp && (
            <button onClick={() => navigate('/social?tab=pvp')} data-testid="go-arena">
              🏟 Về đấu trường
            </button>
          )}
          <button onClick={() => void goHome()} data-testid="go-home">
            🏡 Về lãnh địa
          </button>
          <p>
            <Link to={`/game/${battle.cityId}/battles`}>Bảng nhiệm vụ</Link>
          </p>
        </div>
      )}
    </main>
  );
}

/** Server-driven turn clock (display only; the server ends the turn itself). */
function TurnClock({ deadline, serverTime }: { deadline: string; serverTime: string }) {
  const [now, setNow] = useState(() => Date.now());
  const [skew] = useState(() => new Date(serverTime).getTime() - Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((new Date(deadline).getTime() - (now + skew)) / 1000));
  return <span data-testid="turn-clock" style={{ marginLeft: 8, color: left <= 15 ? '#c0392b' : undefined }}>⏱ {left}s</span>;
}
