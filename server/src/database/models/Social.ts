/**
 * Multiplayer models (Phase 12):
 *  friend_requests / friendships        friends (user_a_id < user_b_id, UNIQUE pair)
 *  notifications                        friend requests, visit / PvP / alliance invites …
 *  pvp_seasons / pvp_ratings            seasonal rating, wins / losses / draws (UNIQUE season + user)
 *  pvp_queue                            ranked matchmaking queue (UNIQUE user)
 *  pvp_rooms                            invite rooms: both sides pick squads, then a battle starts
 *  pvp_matches                          match history with rating changes (UNIQUE battle)
 *  alliances / alliance_roles / alliance_members / alliance_messages / alliance_invites /
 *  alliance_quests                      alliances, permissions, chat and shared quests
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type ModelAttributeColumnOptions,
  type Sequelize,
} from 'sequelize';
import type { AllianceQuestCode, AlliancePermission, AllianceRoleCode, NotificationKind, PvpRoomStatus } from '@cityverse/shared';

const ts = () => ({
  createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
});
const id = () => ({ type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true });
const ref = (field: string, allowNull = false) => ({ type: DataTypes.UUID, allowNull, field });

function json<T>(attr: string, field: string, fallback: T): ModelAttributeColumnOptions {
  return {
    type: DataTypes.JSON,
    allowNull: false,
    field,
    get(this: Model) {
      const raw = this.getDataValue(attr as never) as unknown;
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return fallback;
        }
      }
      return (raw ?? fallback) as T;
    },
  } as ModelAttributeColumnOptions;
}

type Attrs<M extends Model> = InferAttributes<M>;
type Create<M extends Model> = InferCreationAttributes<M>;

export class FriendRequest extends Model<Attrs<FriendRequest>, Create<FriendRequest>> {
  declare id: CreationOptional<string>;
  declare fromUserId: string;
  declare toUserId: string;
  declare status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  declare respondedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Friendship extends Model<Attrs<Friendship>, Create<Friendship>> {
  declare id: CreationOptional<string>;
  declare userAId: string;
  declare userBId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Notification extends Model<Attrs<Notification>, Create<Notification>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  /** Who caused it (sender) — used for anti-spam limits */
  declare actorUserId: string | null;
  declare kind: NotificationKind;
  declare payload: Record<string, string | number | null>;
  declare readAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class PvpSeason extends Model<Attrs<PvpSeason>, Create<PvpSeason>> {
  declare id: CreationOptional<string>;
  declare number: number;
  declare name: string;
  declare startsAt: Date;
  declare endsAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class PvpRating extends Model<Attrs<PvpRating>, Create<PvpRating>> {
  declare id: CreationOptional<string>;
  declare seasonId: string;
  declare userId: string;
  declare rating: number;
  declare wins: CreationOptional<number>;
  declare losses: CreationOptional<number>;
  declare draws: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class PvpQueueEntry extends Model<Attrs<PvpQueueEntry>, Create<PvpQueueEntry>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare cityId: string;
  declare unitIds: string[];
  declare rating: number;
  declare games: number;
  declare power: number;
  declare enqueuedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class PvpRoom extends Model<Attrs<PvpRoom>, Create<PvpRoom>> {
  declare id: CreationOptional<string>;
  declare hostUserId: string;
  declare guestUserId: string | null;
  declare invitedUserId: string | null;
  declare ranked: boolean;
  declare status: PvpRoomStatus;
  declare hostUnitIds: string[];
  declare guestUnitIds: string[];
  declare battleId: string | null;
  declare expiresAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class PvpMatch extends Model<Attrs<PvpMatch>, Create<PvpMatch>> {
  declare id: CreationOptional<string>;
  declare battleId: string;
  declare seasonId: string;
  declare hostUserId: string;
  declare guestUserId: string;
  declare winnerUserId: string | null;
  declare hostRatingBefore: number;
  declare hostRatingAfter: number;
  declare guestRatingBefore: number;
  declare guestRatingAfter: number;
  declare reason: string;
  declare endedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Alliance extends Model<Attrs<Alliance>, Create<Alliance>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare tag: string;
  declare description: string;
  declare leaderUserId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class AllianceRole extends Model<Attrs<AllianceRole>, Create<AllianceRole>> {
  declare id: CreationOptional<string>;
  declare allianceId: string;
  declare code: AllianceRoleCode;
  declare name: string;
  declare rank: number;
  declare permissions: AlliancePermission[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class AllianceMember extends Model<Attrs<AllianceMember>, Create<AllianceMember>> {
  declare id: CreationOptional<string>;
  declare allianceId: string;
  declare userId: string;
  declare roleCode: AllianceRoleCode;
  declare contribution: CreationOptional<number>;
  declare joinedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class AllianceMessage extends Model<Attrs<AllianceMessage>, Create<AllianceMessage>> {
  declare id: CreationOptional<string>;
  declare allianceId: string;
  declare userId: string;
  declare body: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class AllianceInvite extends Model<Attrs<AllianceInvite>, Create<AllianceInvite>> {
  declare id: CreationOptional<string>;
  declare allianceId: string;
  declare userId: string;
  declare invitedByUserId: string;
  declare status: 'pending' | 'accepted' | 'declined' | 'revoked';
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class AllianceQuest extends Model<Attrs<AllianceQuest>, Create<AllianceQuest>> {
  declare id: CreationOptional<string>;
  declare allianceId: string;
  declare code: AllianceQuestCode;
  declare target: number;
  declare progress: CreationOptional<number>;
  declare status: 'active' | 'completed' | 'expired';
  declare endsAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initSocialModels(sequelize: Sequelize) {
  FriendRequest.init(
    {
      id: id(),
      fromUserId: ref('from_user_id'),
      toUserId: ref('to_user_id'),
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending' },
      respondedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'responded_at' },
      ...ts(),
    },
    {
      sequelize,
      tableName: 'friend_requests',
      modelName: 'FriendRequest',
      underscored: true,
      indexes: [
        { fields: ['to_user_id', 'status'], name: 'idx_friend_requests_to' },
        { fields: ['from_user_id', 'status', 'created_at'], name: 'idx_friend_requests_from' },
      ],
    }
  );
  Friendship.init(
    { id: id(), userAId: ref('user_a_id'), userBId: ref('user_b_id'), ...ts() },
    {
      sequelize,
      tableName: 'friendships',
      modelName: 'Friendship',
      underscored: true,
      indexes: [
        { unique: true, fields: ['user_a_id', 'user_b_id'], name: 'uq_friendships_pair' },
        { fields: ['user_b_id'], name: 'idx_friendships_b' },
      ],
    }
  );
  Notification.init(
    {
      id: id(),
      userId: ref('user_id'),
      actorUserId: ref('actor_user_id', true),
      kind: { type: DataTypes.STRING(24), allowNull: false },
      payload: json('payload', 'payload', {}),
      readAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'read_at' },
      ...ts(),
    },
    { sequelize, tableName: 'notifications', modelName: 'Notification', underscored: true, indexes: [
        { fields: ['user_id', 'created_at'], name: 'idx_notifications_user' },
        { fields: ['actor_user_id', 'kind', 'created_at'], name: 'idx_notifications_actor' },
      ] }
  );
  PvpSeason.init(
    {
      id: id(),
      number: { type: DataTypes.INTEGER, allowNull: false, unique: 'uq_pvp_seasons_number' },
      name: { type: DataTypes.STRING(40), allowNull: false },
      startsAt: { type: DataTypes.DATE, allowNull: false, field: 'starts_at' },
      endsAt: { type: DataTypes.DATE, allowNull: false, field: 'ends_at' },
      ...ts(),
    },
    { sequelize, tableName: 'pvp_seasons', modelName: 'PvpSeason', underscored: true }
  );
  PvpRating.init(
    {
      id: id(),
      seasonId: ref('season_id'),
      userId: ref('user_id'),
      rating: { type: DataTypes.INTEGER, allowNull: false },
      wins: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      losses: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      draws: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts(),
    },
    {
      sequelize,
      tableName: 'pvp_ratings',
      modelName: 'PvpRating',
      underscored: true,
      indexes: [
        { unique: true, fields: ['season_id', 'user_id'], name: 'uq_pvp_ratings_season_user' },
        { fields: ['season_id', 'rating'], name: 'idx_pvp_ratings_leaderboard' },
      ],
    }
  );
  PvpQueueEntry.init(
    {
      id: id(),
      userId: { ...ref('user_id'), unique: 'uq_pvp_queue_user' },
      cityId: ref('city_id'),
      unitIds: json('unitIds', 'unit_ids', []),
      rating: { type: DataTypes.INTEGER, allowNull: false },
      games: { type: DataTypes.INTEGER, allowNull: false },
      power: { type: DataTypes.INTEGER, allowNull: false },
      enqueuedAt: { type: DataTypes.DATE, allowNull: false, field: 'enqueued_at' },
      ...ts(),
    },
    { sequelize, tableName: 'pvp_queue', modelName: 'PvpQueueEntry', underscored: true }
  );
  PvpRoom.init(
    {
      id: id(),
      hostUserId: ref('host_user_id'),
      guestUserId: ref('guest_user_id', true),
      invitedUserId: ref('invited_user_id', true),
      ranked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.STRING(16), allowNull: false },
      hostUnitIds: json('hostUnitIds', 'host_unit_ids', []),
      guestUnitIds: json('guestUnitIds', 'guest_unit_ids', []),
      battleId: ref('battle_id', true),
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
      ...ts(),
    },
    {
      sequelize,
      tableName: 'pvp_rooms',
      modelName: 'PvpRoom',
      underscored: true,
      indexes: [
        { fields: ['host_user_id', 'status'], name: 'idx_pvp_rooms_host' },
        { fields: ['guest_user_id', 'status'], name: 'idx_pvp_rooms_guest' },
        { fields: ['invited_user_id', 'status'], name: 'idx_pvp_rooms_invited' },
      ],
    }
  );
  PvpMatch.init(
    {
      id: id(),
      battleId: { ...ref('battle_id'), unique: 'uq_pvp_matches_battle' },
      seasonId: ref('season_id'),
      hostUserId: ref('host_user_id'),
      guestUserId: ref('guest_user_id'),
      winnerUserId: ref('winner_user_id', true),
      hostRatingBefore: { type: DataTypes.INTEGER, allowNull: false, field: 'host_rating_before' },
      hostRatingAfter: { type: DataTypes.INTEGER, allowNull: false, field: 'host_rating_after' },
      guestRatingBefore: { type: DataTypes.INTEGER, allowNull: false, field: 'guest_rating_before' },
      guestRatingAfter: { type: DataTypes.INTEGER, allowNull: false, field: 'guest_rating_after' },
      reason: { type: DataTypes.STRING(16), allowNull: false },
      endedAt: { type: DataTypes.DATE, allowNull: false, field: 'ended_at' },
      ...ts(),
    },
    {
      sequelize,
      tableName: 'pvp_matches',
      modelName: 'PvpMatch',
      underscored: true,
      indexes: [
        { fields: ['host_user_id', 'ended_at'], name: 'idx_pvp_matches_host' },
        { fields: ['guest_user_id', 'ended_at'], name: 'idx_pvp_matches_guest' },
      ],
    }
  );
  Alliance.init(
    {
      id: id(),
      name: { type: DataTypes.STRING(24), allowNull: false, unique: 'uq_alliances_name' },
      tag: { type: DataTypes.STRING(5), allowNull: false, unique: 'uq_alliances_tag' },
      description: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      leaderUserId: ref('leader_user_id'),
      ...ts(),
    },
    { sequelize, tableName: 'alliances', modelName: 'Alliance', underscored: true }
  );
  AllianceRole.init(
    {
      id: id(),
      allianceId: ref('alliance_id'),
      code: { type: DataTypes.STRING(16), allowNull: false },
      name: { type: DataTypes.STRING(32), allowNull: false },
      rank: { type: DataTypes.INTEGER, allowNull: false },
      permissions: json('permissions', 'permissions', []),
      ...ts(),
    },
    { sequelize, tableName: 'alliance_roles', modelName: 'AllianceRole', underscored: true, indexes: [{ unique: true, fields: ['alliance_id', 'code'], name: 'uq_alliance_roles_code' }] }
  );
  AllianceMember.init(
    {
      id: id(),
      allianceId: ref('alliance_id'),
      // One alliance per player.
      userId: { ...ref('user_id'), unique: 'uq_alliance_members_user' },
      roleCode: { type: DataTypes.STRING(16), allowNull: false, field: 'role_code' },
      contribution: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      joinedAt: { type: DataTypes.DATE, allowNull: false, field: 'joined_at' },
      ...ts(),
    },
    { sequelize, tableName: 'alliance_members', modelName: 'AllianceMember', underscored: true, indexes: [{ fields: ['alliance_id'], name: 'idx_alliance_members_alliance' }] }
  );
  AllianceMessage.init(
    { id: id(), allianceId: ref('alliance_id'), userId: ref('user_id'), body: { type: DataTypes.STRING(500), allowNull: false }, ...ts() },
    { sequelize, tableName: 'alliance_messages', modelName: 'AllianceMessage', underscored: true, indexes: [{ fields: ['alliance_id', 'created_at'], name: 'idx_alliance_messages_feed' }, { fields: ['user_id', 'created_at'], name: 'idx_alliance_messages_user' }] }
  );
  AllianceInvite.init(
    {
      id: id(),
      allianceId: ref('alliance_id'),
      userId: ref('user_id'),
      invitedByUserId: ref('invited_by_user_id'),
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending' },
      ...ts(),
    },
    { sequelize, tableName: 'alliance_invites', modelName: 'AllianceInvite', underscored: true, indexes: [{ fields: ['user_id', 'status'], name: 'idx_alliance_invites_user' }] }
  );
  AllianceQuest.init(
    {
      id: id(),
      allianceId: ref('alliance_id'),
      code: { type: DataTypes.STRING(24), allowNull: false },
      target: { type: DataTypes.INTEGER, allowNull: false },
      progress: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'active' },
      endsAt: { type: DataTypes.DATE, allowNull: false, field: 'ends_at' },
      ...ts(),
    },
    { sequelize, tableName: 'alliance_quests', modelName: 'AllianceQuest', underscored: true, indexes: [{ fields: ['alliance_id', 'status'], name: 'idx_alliance_quests_alliance' }] }
  );
  return { FriendRequest, Friendship, Notification, PvpSeason, PvpRating, PvpQueueEntry, PvpRoom, PvpMatch, Alliance, AllianceRole, AllianceMember, AllianceMessage, AllianceInvite, AllianceQuest };
}
