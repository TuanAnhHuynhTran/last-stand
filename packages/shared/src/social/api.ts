import { z } from 'zod';
import type { BattleDTO } from '../battle/api.js';
import type { AllianceQuestCode, AlliancePermission, AllianceRoleCode, PvpTier, WorldVisibility } from './definitions.js';

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

export type FriendshipStatus = 'self' | 'none' | 'friends' | 'pending_out' | 'pending_in';

export interface UserSummaryDTO {
  id: string;
  username: string;
  /** Character name when there is one */
  displayName: string;
  online: boolean;
  friendship: FriendshipStatus;
  /** Their city (if any) and who may visit it */
  cityId: string | null;
  cityName: string | null;
  visibility: WorldVisibility | null;
  /** Whether the requester may visit it right now */
  canVisit: boolean;
}

export interface FriendRequestDTO {
  id: string;
  from: UserSummaryDTO;
  to: UserSummaryDTO;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
}

export interface FriendsStateDTO {
  friends: { user: UserSummaryDTO; since: string }[];
  incoming: FriendRequestDTO[];
  outgoing: FriendRequestDTO[];
}

export type NotificationKind = 'friend_request' | 'friend_accepted' | 'visit_invite' | 'pvp_invite' | 'pvp_match' | 'alliance_invite' | 'alliance_quest';

export interface NotificationDTO {
  id: string;
  kind: NotificationKind;
  payload: Record<string, string | number | null>;
  readAt: string | null;
  createdAt: string;
}

// ── PvP ──────────────────────────────────────────────────────────────────────
export interface PvpProfileDTO {
  userId: string;
  username: string;
  seasonId: string;
  seasonName: string;
  seasonEndsAt: string;
  rating: number;
  tier: PvpTier;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  rank: number | null;
}

export type PvpRoomStatus = 'waiting' | 'selecting' | 'in_battle' | 'finished' | 'cancelled';

export interface PvpRoomDTO {
  id: string;
  status: PvpRoomStatus;
  ranked: boolean;
  host: UserSummaryDTO;
  guest: UserSummaryDTO | null;
  invitedUserId: string | null;
  hostReady: boolean;
  guestReady: boolean;
  battleId: string | null;
  expiresAt: string;
}

export interface PvpMatchDTO {
  id: string;
  battleId: string;
  opponent: { id: string; username: string };
  result: 'win' | 'loss' | 'draw';
  ratingBefore: number;
  ratingAfter: number;
  reason: string;
  endedAt: string;
}

export interface PvpStateDTO {
  profile: PvpProfileDTO;
  queue: { queued: boolean; since: string | null; power: number | null };
  rooms: PvpRoomDTO[];
  activeBattleId: string | null;
  history: PvpMatchDTO[];
  serverTime: string;
}

export interface LeaderboardEntryDTO {
  rank: number;
  userId: string;
  username: string;
  rating: number;
  tier: PvpTier;
  wins: number;
  losses: number;
}

export interface PvpBattleDTO extends BattleDTO {
  mySide: 'player' | 'enemy';
  opponent: { id: string; username: string; online: boolean };
  /** When the active player's turn is ended by the server */
  turnDeadline: string | null;
}

// ── Alliances ────────────────────────────────────────────────────────────────
export interface AllianceDTO {
  id: string;
  name: string;
  tag: string;
  description: string;
  leaderId: string;
  memberCount: number;
  createdAt: string;
}

export interface AllianceMemberDTO {
  user: UserSummaryDTO;
  role: AllianceRoleCode;
  roleName: string;
  joinedAt: string;
  contribution: number;
}

export interface AllianceMessageDTO {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
}

export interface AllianceQuestDTO {
  id: string;
  code: AllianceQuestCode;
  name: string;
  description: string;
  target: number;
  progress: number;
  status: 'active' | 'completed' | 'expired';
  rewardCoins: number;
  endsAt: string;
}

export interface AllianceInviteDTO {
  id: string;
  alliance: AllianceDTO;
  invitedBy: string;
  createdAt: string;
}

export interface AllianceStateDTO {
  alliance: AllianceDTO | null;
  me: { role: AllianceRoleCode; permissions: AlliancePermission[] } | null;
  members: AllianceMemberDTO[];
  quests: AllianceQuestDTO[];
  invites: AllianceInviteDTO[];
}

// ── Schemas ──────────────────────────────────────────────────────────────────
const uuid = z.string().uuid('Ma khong hop le');
const cursor = z.string().max(80).optional();

export const userSearchSchema = z.object({ q: z.string().trim().min(2).max(24), cursor });
export const friendRequestSchema = z.object({ userId: uuid }).strict();
export const respondFriendSchema = z.object({ accept: z.boolean() }).strict();
export const visibilitySchema = z.object({ visibility: z.enum(['public', 'friends', 'private']) }).strict();
export const idParamSchema = z.object({ id: uuid });
export const pagedQuerySchema = z.object({ cursor });

export const pvpQueueSchema = z.object({ unitIds: z.array(uuid).min(3).max(6) }).strict();
export const pvpRoomCreateSchema = z.object({ inviteUserId: uuid.optional() }).strict();
export const pvpRosterSchema = z.object({ unitIds: z.array(uuid).min(3).max(6) }).strict();

export const createAllianceSchema = z
  .object({
    name: z.string().trim().min(3).max(24),
    tag: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,5}$/, 'Tag 2-5 ky tu chu / so'),
    description: z.string().trim().max(300).default(''),
  })
  .strict();
export const allianceInviteSchema = z.object({ userId: uuid }).strict();
export const allianceRoleSchema = z.object({ role: z.enum(['officer', 'member']) }).strict();
export const allianceMessageSchema = z.object({ body: z.string().trim().min(1).max(500) }).strict();
export const allianceDonateSchema = z.object({ amount: z.number().int().min(1).max(5000) }).strict();
export const allianceMemberParamsSchema = z.object({ userId: uuid });

export type UserSearchInput = z.infer<typeof userSearchSchema>;
export type CreateAllianceInput = z.infer<typeof createAllianceSchema>;
