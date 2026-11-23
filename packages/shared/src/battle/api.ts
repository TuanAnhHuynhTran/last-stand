import { z } from 'zod';
import type { UnitTypeCode } from '../military/definitions.js';
import type { MissionCode, MissionDefinition } from './definitions.js';
import type { BattleEvent, BattlePhase, BattleRewards, BattleState } from './engine.js';

export interface BattleDTO {
  id: string;
  cityId: string;
  mission: MissionCode;
  phase: BattlePhase;
  state: BattleState;
  /** Events of the last accepted action (the client animates them, then shows `state`) */
  events: BattleEvent[];
  version: number;
  /** Rewards the server computed for the finished battle (null while it runs) */
  rewards: BattleRewards | null;
  claimed: boolean;
  poiId: string | null;
  lastActionAt: string;
  expiresAt: string;
  serverTime: string;
}

export interface MissionAvailabilityDTO {
  mission: MissionDefinition;
  available: boolean;
  reasons: string[];
  cooldownUntil: string | null;
  victories: number;
  /** Phase 10 point of interest the mission can clear (optional) */
  pois: { id: string; kind: string; q: number; r: number }[];
}

export interface BattleCandidateDTO {
  id: string;
  name: string;
  type: UnitTypeCode;
  rank: number;
  rankName: string;
  power: number;
  health: number;
  mounted: boolean;
  available: boolean;
  reason: string | null;
}

export interface BattleLobbyDTO {
  missions: MissionAvailabilityDTO[];
  active: { id: string; mission: MissionCode; phase: BattlePhase; turn: number } | null;
  history: { id: string; mission: MissionCode; phase: BattlePhase; stars: number; claimed: boolean; endedAt: string | null }[];
  candidates: BattleCandidateDTO[];
  squads: { id: string; name: string; members: string[] }[];
  serverTime: string;
}

export interface BattleClaimDTO {
  battle: BattleDTO;
  /** What was added to the city (only on the first, successful claim) */
  granted: BattleRewards | null;
}

const uuid = z.string().uuid('Ma khong hop le');
const coord = z.object({ q: z.number().int().min(-12).max(12), r: z.number().int().min(-12).max(12) }).strict();
const unitId = z.string().min(1).max(16);
const skill = z.enum(['shield_wall', 'brace', 'aimed_shot', 'volley', 'piercing_bolt', 'acid_spit', 'overcharge', 'ground_slam']);

export const createBattleSchema = z
  .object({
    mission: z.enum(['rescue_survivors', 'reclaim_ruins', 'mutant_boss']),
    unitIds: z.array(uuid).min(1).max(6),
    poiId: uuid.optional(),
    idempotencyKey: uuid,
  })
  .strict();

/** Intents only — the client never sends damage, hits or rewards. */
export const battleActionBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('deploy'), unitId, to: coord }).strict(),
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('move'), unitId, to: coord }).strict(),
  z.object({ type: z.literal('attack'), unitId, targetId: unitId }).strict(),
  z.object({ type: z.literal('skill'), unitId, skill, targetId: unitId.optional(), at: coord.optional() }).strict(),
  z.object({ type: z.literal('defend'), unitId }).strict(),
  z.object({ type: z.literal('item'), unitId, item: z.literal('bandage'), targetId: unitId.optional() }).strict(),
  z.object({ type: z.literal('reload'), unitId }).strict(),
  z.object({ type: z.literal('interact'), unitId, targetId: unitId }).strict(),
  z.object({ type: z.literal('end_turn') }).strict(),
  z.object({ type: z.literal('retreat') }).strict(),
]);

export const battleActionSchema = z
  .object({
    /** Retries of the same request (reconnects) are answered from the stored result */
    clientActionId: uuid,
    /** Must match the battle version the client saw (no acting on a stale board) */
    expectedVersion: z.number().int().min(0),
    action: battleActionBodySchema,
  })
  .strict();

export const endTurnSchema = z.object({ clientActionId: uuid, expectedVersion: z.number().int().min(0) }).strict();
export const battleParamsSchema = z.object({ battleId: uuid });

export type CreateBattleInput = z.infer<typeof createBattleSchema>;
export type BattleActionInput = z.infer<typeof battleActionSchema>;
export type EndTurnInput = z.infer<typeof endTurnSchema>;
