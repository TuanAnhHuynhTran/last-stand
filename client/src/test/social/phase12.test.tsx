import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPvpBattleState, type FriendsStateDTO, type PvpBattleDTO, type RosterEntry, type UserSummaryDTO } from '@cityverse/shared';
import { AudioManager, channelGain, defaultAudioSettings, loadAudioSettings } from '../../audio/AudioManager';
import { summarizeFrames } from '../../game/perf/benchmark';
import { isMyTurn, mirrorState, viewFor } from '../../game/pvp/perspective';
import { WeatherSystem } from '../../game/world/WeatherSystem';
import { dayPhase, kindFor, weatherAt, WEATHER_BLOCK_MINUTES } from '../../game/world/weather';

vi.mock('../../realtime/socket', () => ({
  onRealtime: () => () => undefined,
  emitRealtime: () => Promise.reject(new Error('offline')),
  connectRealtime: () => undefined,
}));

const roster = (n: number, prefix: string): RosterEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    sourceId: `${prefix}-${i}`,
    name: `${prefix} ${i}`,
    type: 'swordsman',
    rank: 1,
    stats: { hp: 100, attack: 20, defense: 8, speed: 3, range: 1, accuracy: 0.85 } as never,
    health: 1,
    mounted: false,
  }));

function duelDto(mySide: 'player' | 'enemy'): PvpBattleDTO {
  const state = createPvpBattleState(1234, roster(3, 'host'), roster(3, 'guest'));
  state.itemsB = { bandage: 7 };
  return {
    id: 'b1', cityId: 'c1', mission: 'pvp_duel', phase: 'player', state, events: [{ type: 'turn', side: 'player', turn: 1 }], version: state.version,
    rewards: null, claimed: false, poiId: null, lastActionAt: '', expiresAt: '', serverTime: new Date().toISOString(),
    mySide, opponent: { id: 'o', username: 'rival', online: true }, turnDeadline: null,
  };
}

describe('Phase 12 – PvP perspective', () => {
  it('host sees the server view unchanged; the guest sees their own soldiers as "player"', () => {
    const host = duelDto('player');
    expect(viewFor(host)).toBe(host);
    expect(isMyTurn(host)).toBe(true);
    const guest = viewFor(duelDto('enemy'));
    const mine = guest.state.units.filter((u) => u.side === 'player');
    expect(mine.map((u) => u.id).every((id) => id.startsWith('q'))).toBe(true);
    expect(guest.state.items.bandage).toBe(7); // the guest's own bandages
    expect(guest.state.activeSide).toBe('enemy'); // host's turn → not mine
    expect(isMyTurn(guest)).toBe(false);
    expect(guest.events[0]).toEqual({ type: 'turn', side: 'enemy', turn: 1 });
  });

  it('outcome is read from each side; a draw stays a draw', () => {
    const d = duelDto('enemy');
    d.state.outcome = { result: 'victory', reason: 'all_enemies', turn: 3, stars: 0, winner: 'player' };
    d.phase = 'victory';
    const g = viewFor(d);
    expect(g.state.outcome?.result).toBe('defeat');
    expect(g.phase).toBe('defeat');
    d.state.outcome = { result: 'defeat', reason: 'time', turn: 20, stars: 0, winner: null };
    expect(mirrorState(d.state).outcome?.winner).toBeNull();
  });
});

describe('Phase 12 – weather, benchmark, audio', () => {
  it('weather is deterministic per seed, blends between spells, and can be forced', () => {
    const t = Date.UTC(2026, 10, 22, 10, 0, 0);
    expect(weatherAt(42, t)).toEqual(weatherAt(42, t));
    const kinds = new Set(Array.from({ length: 200 }, (_, i) => kindFor(7, i)));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    for (let m = 0; m < WEATHER_BLOCK_MINUTES * 3; m += 1) {
      const w = weatherAt(9, t + m * 60_000);
      for (const v of [w.rain, w.wind, w.fog, w.cloud]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of [w.rain, w.wind, w.fog, w.cloud]) expect(v).toBeLessThanOrEqual(1);
    }
    expect(weatherAt(1, t, 'light_rain').rain).toBeGreaterThan(0.5);
    expect(dayPhase(6)).toBe('dawn');
    expect(dayPhase(12)).toBe('day');
    expect(dayPhase(19)).toBe('dusk');
    expect(dayPhase(2)).toBe('night');
  });

  it('WeatherSystem: rain only when raining, lamps glow at night, lights by quality', () => {
    const w = new WeatherSystem(1, 'medium');
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 40, 40);
    w.setLamps([new THREE.Vector3(0, 2, 0), new THREE.Vector3(10, 2, 0)]);
    w.mode = 'clear';
    w.update(0.016, 0, 1, new THREE.Vector3(), cam);
    expect(w.rainDrops).toBe(0);
    expect(w.night).toBeLessThan(0.05);
    w.mode = 'light_rain';
    w.update(0.016, 0, 0, new THREE.Vector3(), cam);
    expect(w.rainDrops).toBeGreaterThan(0);
    expect(w.night).toBeGreaterThan(0.9);
    expect(w.lampCount).toBe(2);
    expect(w.group.children.filter((c) => c instanceof THREE.PointLight)).toHaveLength(3);
    w.setQuality('low');
    expect(w.group.children.filter((c) => c instanceof THREE.PointLight)).toHaveLength(0);
    w.dispose();
  });

  it('benchmark summary is computed from measured frames only', () => {
    expect(summarizeFrames([]).avgFps).toBe(0);
    const frames = [...Array(99).fill(16), 100];
    const s = summarizeFrames(frames);
    expect(s.frames).toBe(100);
    expect(s.avgFps).toBeCloseTo(1000 / ((99 * 16 + 100) / 100), 0);
    expect(s.worstFrameMs).toBe(100);
    expect(s.low1Fps).toBe(10);
    expect(s.p95FrameMs).toBe(16);
  });

  it('audio settings: per-channel volume / mute, persisted and clamped; silent before unlock', () => {
    localStorage.clear();
    const m = new AudioManager();
    expect(m.play('click')).toBe(false); // no AudioContext until a user gesture
    m.update((s) => {
      s.channels.music.volume = 0.2;
      s.channels.weapons.muted = true;
    });
    const loaded = loadAudioSettings();
    expect(loaded.channels.music.volume).toBe(0.2);
    expect(channelGain(loaded, 'weapons')).toBe(0);
    expect(channelGain(loaded, 'ui')).toBeGreaterThan(0);
    localStorage.setItem('lasthaven.audio.v1', JSON.stringify({ master: 7, channels: { ui: { volume: -1 } } }));
    expect(loadAudioSettings().master).toBe(defaultAudioSettings().master);
    expect(loadAudioSettings().channels.ui.volume).toBe(defaultAudioSettings().channels.ui.volume);
    expect(channelGain({ ...loaded, muted: true }, 'ui')).toBe(0);
  });
});

describe('Phase 12 – social page', () => {
  const user = (id: string, name: string, extra: Partial<UserSummaryDTO> = {}): UserSummaryDTO => ({
    id, username: name, displayName: name, online: false, friendship: 'friends', cityId: `city-${id}`, cityName: `Haven ${name}`, visibility: 'friends', canVisit: true, ...extra,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists friends with online state and visit links; accepting a request calls the server', async () => {
    const { socialApi } = await import('../../api/social.api');
    const state: FriendsStateDTO = {
      friends: [{ user: user('1', 'bob', { online: true }), since: new Date().toISOString() }, { user: user('2', 'eve', { canVisit: false, visibility: 'private' }), since: new Date().toISOString() }],
      incoming: [{ id: 'req1', from: user('3', 'carol', { friendship: 'pending_in' }), to: user('me', 'me', { friendship: 'self' }), status: 'pending', createdAt: new Date().toISOString() }],
      outgoing: [],
    };
    vi.spyOn(socialApi, 'friends').mockResolvedValue(state);
    vi.spyOn(socialApi, 'notifications').mockResolvedValue({ items: [], nextCursor: null });
    const respond = vi.spyOn(socialApi, 'respond').mockResolvedValue({ ...state, incoming: [] });
    const { SocialPage } = await import('../../pages/SocialPage');
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/social?tab=friends']}>
          <SocialPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getAllByTestId('friend-row')).toHaveLength(2));
    expect(screen.getByText('Trực tuyến')).toBeInTheDocument();
    expect(screen.getByText('Riêng tư')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ghé thăm/ })).toHaveLength(1);
    fireEvent.click(screen.getByTestId('accept-friend'));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('req1', true));
  }, 30_000);
});
