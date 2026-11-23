/**
 * Multiplayer rules (Phase 12) shared by server and client: friends & visits, PvP rating and
 * matchmaking, alliances. All limits live here.
 */

// ── World visibility & visits ────────────────────────────────────────────────
export type WorldVisibility = 'public' | 'friends' | 'private';
export const WORLD_VISIBILITY_LABELS: Record<WorldVisibility, string> = {
  public: 'Công khai — ai cũng có thể tham quan',
  friends: 'Chỉ bạn bè',
  private: 'Riêng tư',
};

// ── Friends (anti-spam) ──────────────────────────────────────────────────────
export const FRIEND_LIMITS = {
  requestsPerHour: 10,
  maxPendingOutgoing: 30,
  maxFriends: 100,
  /** After a decline the same person can't be asked again for this long */
  declineCooldownHours: 24,
  visitInvitesPerHour: 10,
  searchMinChars: 2,
  pageSize: 20,
} as const;

// ── PvP rating & seasons ─────────────────────────────────────────────────────
export const PVP_START_RATING = 1000;
export const PVP_SEASON_DAYS = 28;
export const PVP_PROVISIONAL_GAMES = 10;

/** Elo expected score of A against B. */
export function eloExpected(ra: number, rb: number): number {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

/** Rating change for A (score 1 win, 0.5 draw, 0 loss); provisional players move faster. */
export function eloDelta(ra: number, rb: number, score: number, gamesA: number): number {
  const k = gamesA < PVP_PROVISIONAL_GAMES ? 40 : 24;
  return Math.round(k * (score - eloExpected(ra, rb)));
}

export type PvpTier = 'Đồng' | 'Bạc' | 'Vàng' | 'Bạch kim' | 'Kim cương';
export function pvpTier(rating: number): PvpTier {
  if (rating >= 1600) return 'Kim cương';
  if (rating >= 1400) return 'Bạch kim';
  if (rating >= 1200) return 'Vàng';
  if (rating >= 1000) return 'Bạc';
  return 'Đồng';
}

export interface QueueEntry {
  userId: string;
  rating: number;
  games: number;
  /** Squad power (sum of the chosen soldiers' power) */
  power: number;
  enqueuedAtMs: number;
}

/** Windows widen the longer the pair has waited (never unlimited). */
export function matchWindows(waitSeconds: number): { rating: number; powerRatio: number } {
  return { rating: Math.min(600, 150 + 10 * waitSeconds), powerRatio: Math.min(2, 1.3 + 0.01 * waitSeconds) };
}

/**
 * Best opponent for `me` in the queue, or null. Players are matched by rating AND squad power;
 * a newcomer (few games) is never put against a much stronger squad while a closer match exists
 * — and not at all before waiting two minutes.
 */
export function pickOpponent(me: QueueEntry, queue: readonly QueueEntry[], nowMs: number): QueueEntry | null {
  let best: { e: QueueEntry; score: number } | null = null;
  for (const e of queue) {
    if (e.userId === me.userId) continue;
    const wait = (nowMs - Math.min(me.enqueuedAtMs, e.enqueuedAtMs)) / 1000;
    const w = matchWindows(wait);
    const dr = Math.abs(me.rating - e.rating);
    const ratio = Math.max(me.power, e.power) / Math.max(1, Math.min(me.power, e.power));
    if (dr > w.rating || ratio > w.powerRatio) continue;
    const newbie = Math.min(me.games, e.games) < 5 && Math.max(me.games, e.games) >= 5;
    if (newbie && ratio > 1.3 && wait < 120) continue;
    const score = dr / 100 + Math.abs(Math.log(ratio)) * 3 + (newbie ? 1 : 0);
    if (!best || score < best.score || (score === best.score && e.enqueuedAtMs < best.e.enqueuedAtMs)) best = { e, score };
  }
  return best?.e ?? null;
}

/** Seconds a room waits for both players to pick their squads. */
export const PVP_ROOM_SECONDS = 300;

// ── Alliances ────────────────────────────────────────────────────────────────
export type AlliancePermission = 'invite' | 'kick' | 'promote' | 'edit' | 'disband' | 'quests' | 'moderate';
export type AllianceRoleCode = 'leader' | 'officer' | 'member';

export const ALLIANCE_ROLE_DEFAULTS: Record<AllianceRoleCode, { name: string; rank: number; permissions: AlliancePermission[] }> = {
  leader: { name: 'Thủ lĩnh', rank: 3, permissions: ['invite', 'kick', 'promote', 'edit', 'disband', 'quests', 'moderate'] },
  officer: { name: 'Sĩ quan', rank: 2, permissions: ['invite', 'kick', 'quests', 'moderate'] },
  member: { name: 'Thành viên', rank: 1, permissions: [] },
};

export const ALLIANCE_LIMITS = {
  maxMembers: 30,
  createCost: 500,
  nameMin: 3,
  nameMax: 24,
  tagPattern: /^[A-Z0-9]{2,5}$/,
  messageMax: 500,
  /** Chat flood guard: at most N messages per window */
  messagesPerWindow: 5,
  messageWindowSeconds: 10,
  pageSize: 30,
  invitesPerHour: 20,
} as const;

export type AllianceQuestCode = 'donate_wood' | 'donate_stone' | 'pve_wins';
export interface AllianceQuestDefinition {
  code: AllianceQuestCode;
  name: string;
  description: string;
  target: number;
  /** Coins every member's city receives when the alliance completes it */
  rewardCoins: number;
  /** Members donate this resource from their own city */
  resource: 'wood' | 'stone' | null;
}

export const ALLIANCE_QUESTS: readonly AllianceQuestDefinition[] = [
  { code: 'donate_wood', name: 'Kho gỗ chung', description: 'Cả liên minh góp 5.000 gỗ cho kho chung.', target: 5000, rewardCoins: 200, resource: 'wood' },
  { code: 'donate_stone', name: 'Tường đá liên minh', description: 'Cả liên minh góp 3.000 đá.', target: 3000, rewardCoins: 300, resource: 'stone' },
  { code: 'pve_wins', name: 'Dẹp loạn vùng hoang', description: 'Thành viên thắng tổng cộng 10 trận PvE.', target: 10, rewardCoins: 400, resource: null },
];
export const ALLIANCE_QUEST_DAYS = 7;

export function getAllianceQuest(code: AllianceQuestCode): AllianceQuestDefinition {
  const q = ALLIANCE_QUESTS.find((x) => x.code === code);
  if (!q) throw new Error(`Unknown alliance quest: ${code}`);
  return q;
}

/** Can `actor` (role) act on `target` (role) for a permission? Officers can't touch officers / leader. */
export function canManage(actor: AllianceRoleCode, target: AllianceRoleCode, permission: AlliancePermission): boolean {
  const a = ALLIANCE_ROLE_DEFAULTS[actor];
  if (!a.permissions.includes(permission)) return false;
  return a.rank > ALLIANCE_ROLE_DEFAULTS[target].rank;
}
