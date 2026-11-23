/**
 * Alliances (Phase 12): create, invite, roles, chat, shared quests.
 *  - one alliance per player (UNIQUE user in alliance_members); size capped (ALLIANCE_LIMITS)
 *  - permissions per role; officers can't touch officers or the leader (canManage)
 *  - creating costs coins from the founder's own city (charged inside that city's lock)
 *  - chat is members-only, flood-guarded and paginated by cursor; new messages are pushed live
 *  - quests: donations come from the donor's own city (never more than the quest still needs);
 *    PvE victories count through the BattleService hook; completion flips active → completed
 *    with a conditional UPDATE, so every member's city is paid exactly once (atomic increment)
 */
import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import {
  ALLIANCE_LIMITS,
  ALLIANCE_QUESTS,
  ALLIANCE_QUEST_DAYS,
  ALLIANCE_ROLE_DEFAULTS,
  canManage,
  getAllianceQuest,
  type AllianceDTO,
  type AllianceMemberDTO,
  type AllianceMessageDTO,
  type AlliancePermission,
  type AllianceQuestDTO,
  type AllianceRoleCode,
  type AllianceStateDTO,
  type CreateAllianceInput,
  type Paged,
} from '@cityverse/shared';
import type { DatabaseModels } from '../../database/models/index.js';
import type { Alliance, AllianceMember, AllianceQuest } from '../../database/models/Social.js';
import type { RealtimeBus } from '../../realtime/bus.js';
import { AppError, BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import type { BuildingContext } from '../buildings/building.service.js';
import type { SocialService } from '../social/social.service.js';

const HOUR = 3600_000;
const iso = (d: Date | string): string => new Date(d).toISOString();

export class AllianceService {
  constructor(
    private readonly ctx: BuildingContext,
    private readonly social: SocialService,
    private readonly bus: RealtimeBus
  ) {}

  private get m(): DatabaseModels {
    return this.ctx.models;
  }

  private now(): Date {
    return this.ctx.now();
  }

  private locked<T>(key: string, fn: (t: Transaction) => Promise<T>): Promise<T> {
    return this.ctx.mutex.run(`alliance:${key}`, () => this.m.sequelize.transaction(fn));
  }

  // ── Read ───────────────────────────────────────────────────────────────────
  async state(userId: string): Promise<AllianceStateDTO> {
    const me = await this.m.AllianceMember.findOne({ where: { userId } });
    const invites = await this.m.AllianceInvite.findAll({ where: { userId, status: 'pending' }, order: [['createdAt', 'DESC']], limit: 20 });
    const invAlliances = invites.length ? await this.m.Alliance.findAll({ where: { id: invites.map((i) => i.allianceId) } }) : [];
    const inviters = invites.length ? await this.m.User.findAll({ where: { id: invites.map((i) => i.invitedByUserId) } }) : [];
    const inviteDtos = [];
    for (const i of invites) {
      const a = invAlliances.find((x) => x.id === i.allianceId);
      if (a) inviteDtos.push({ id: i.id, alliance: await this.dto(a), invitedBy: inviters.find((u) => u.id === i.invitedByUserId)?.username ?? '?', createdAt: iso(i.createdAt) });
    }
    if (!me) return { alliance: null, me: null, members: [], quests: [], invites: inviteDtos };
    const alliance = (await this.m.Alliance.findByPk(me.allianceId))!;
    await this.m.sequelize.transaction((t) => this.ensureQuests(alliance.id, t));
    return {
      alliance: await this.dto(alliance),
      me: { role: me.roleCode, permissions: await this.permissions(alliance.id, me.roleCode) },
      members: await this.members(userId, alliance.id),
      quests: (await this.m.AllianceQuest.findAll({ where: { allianceId: alliance.id, status: ['active', 'completed'], endsAt: { [Op.gt]: this.now() } }, order: [['createdAt', 'ASC']] })).map((q) => this.questDto(q)),
      invites: inviteDtos,
    };
  }

  async list(cursor?: string): Promise<Paged<AllianceDTO>> {
    const where: Record<string, unknown> = {};
    if (cursor) where.name = { [Op.gt]: cursor };
    const rows = await this.m.Alliance.findAll({ where, order: [['name', 'ASC']], limit: ALLIANCE_LIMITS.pageSize + 1 });
    const page = rows.slice(0, ALLIANCE_LIMITS.pageSize);
    return { items: await Promise.all(page.map((a) => this.dto(a))), nextCursor: rows.length > ALLIANCE_LIMITS.pageSize ? page[page.length - 1].name : null };
  }

  private async members(viewerId: string, allianceId: string): Promise<AllianceMemberDTO[]> {
    const rows = await this.m.AllianceMember.findAll({ where: { allianceId }, order: [['joinedAt', 'ASC']] });
    const users = await this.m.User.findAll({ where: { id: rows.map((r) => r.userId) } });
    const sums = await this.social.summaries(viewerId, users);
    return rows
      .map((r) => ({ user: sums.find((s) => s.id === r.userId)!, role: r.roleCode, roleName: ALLIANCE_ROLE_DEFAULTS[r.roleCode].name, joinedAt: iso(r.joinedAt), contribution: r.contribution }))
      .filter((x) => x.user)
      .sort((a, b) => ALLIANCE_ROLE_DEFAULTS[b.role].rank - ALLIANCE_ROLE_DEFAULTS[a.role].rank);
  }

  private async permissions(allianceId: string, role: AllianceRoleCode, t?: Transaction): Promise<AlliancePermission[]> {
    const row = await this.m.AllianceRole.findOne({ where: { allianceId, code: role }, transaction: t });
    return row?.permissions ?? ALLIANCE_ROLE_DEFAULTS[role].permissions;
  }

  private async dto(a: Alliance): Promise<AllianceDTO> {
    return { id: a.id, name: a.name, tag: a.tag, description: a.description, leaderId: a.leaderUserId, memberCount: await this.m.AllianceMember.count({ where: { allianceId: a.id } }), createdAt: iso(a.createdAt) };
  }

  private questDto(q: AllianceQuest): AllianceQuestDTO {
    const def = getAllianceQuest(q.code);
    return { id: q.id, code: q.code, name: def.name, description: def.description, target: q.target, progress: q.progress, status: q.status, rewardCoins: def.rewardCoins, endsAt: iso(q.endsAt) };
  }

  /** Member row or 403. */
  private async member(userId: string, t?: Transaction): Promise<AllianceMember> {
    const me = await this.m.AllianceMember.findOne({ where: { userId }, transaction: t });
    if (!me) throw new ForbiddenError('Ban chua thuoc lien minh nao', 'NOT_IN_ALLIANCE');
    return me;
  }

  private async require(me: AllianceMember, permission: AlliancePermission, t?: Transaction): Promise<void> {
    if (!(await this.permissions(me.allianceId, me.roleCode, t)).includes(permission)) throw new ForbiddenError('Vai tro cua ban khong co quyen nay', 'ALLIANCE_PERMISSION');
  }

  // ── Create / disband ───────────────────────────────────────────────────────
  async create(userId: string, input: CreateAllianceInput): Promise<AllianceStateDTO> {
    const city = await this.m.City.findOne({ where: { ownerId: userId }, order: [['createdAt', 'ASC']] });
    if (!city) throw new NotFoundError('Ban chua co thanh pho', 'CITY_NOT_FOUND');
    await this.ctx.mutate(city.id, userId, true, async (_c, t) => {
      if (await this.m.AllianceMember.count({ where: { userId }, transaction: t })) throw new ConflictError('Ban da o trong mot lien minh', 'ALREADY_IN_ALLIANCE');
      await this.ctx.resources.charge(city.id, { coins: ALLIANCE_LIMITS.createCost, wood: 0, stone: 0 }, t);
      let alliance: Alliance;
      try {
        alliance = await this.m.Alliance.create({ name: input.name, tag: input.tag, description: input.description ?? '', leaderUserId: userId }, { transaction: t });
      } catch (err) {
        if (err instanceof UniqueConstraintError) throw new ConflictError('Ten hoac tag lien minh da ton tai', 'ALLIANCE_TAKEN');
        throw err;
      }
      await this.m.AllianceRole.bulkCreate(
        (Object.keys(ALLIANCE_ROLE_DEFAULTS) as AllianceRoleCode[]).map((code) => ({ allianceId: alliance.id, code, ...ALLIANCE_ROLE_DEFAULTS[code] })),
        { transaction: t }
      );
      await this.m.AllianceMember.create({ allianceId: alliance.id, userId, roleCode: 'leader', joinedAt: this.now() }, { transaction: t });
      await this.ensureQuests(alliance.id, t);
    });
    return this.state(userId);
  }

  async disband(userId: string): Promise<AllianceStateDTO> {
    const me = await this.member(userId);
    await this.locked(me.allianceId, async (t) => {
      const fresh = await this.member(userId, t);
      await this.require(fresh, 'disband', t);
      const id = fresh.allianceId;
      for (const model of [this.m.AllianceMessage, this.m.AllianceInvite, this.m.AllianceQuest, this.m.AllianceMember, this.m.AllianceRole] as const) {
        await (model as typeof this.m.AllianceMessage).destroy({ where: { allianceId: id }, transaction: t });
      }
      await this.m.Alliance.destroy({ where: { id }, transaction: t });
      t.afterCommit(() => this.bus.emitToRoom(`alliance:${id}`, 'alliance:disbanded', { allianceId: id }));
    });
    return this.state(userId);
  }

  // ── Invites ────────────────────────────────────────────────────────────────
  async invite(userId: string, targetId: string): Promise<{ ok: true }> {
    const me = await this.member(userId);
    await this.locked(me.allianceId, async (t) => {
      const fresh = await this.member(userId, t);
      await this.require(fresh, 'invite', t);
      if (targetId === userId) throw new BadRequestError('Khong the moi chinh minh', 'INVALID_INVITE');
      const target = await this.m.User.findByPk(targetId, { transaction: t });
      if (!target) throw new NotFoundError('Nguoi choi khong ton tai', 'USER_NOT_FOUND');
      if (await this.m.AllianceMember.count({ where: { userId: targetId }, transaction: t })) throw new ConflictError('Nguoi choi da o lien minh khac', 'ALREADY_IN_ALLIANCE');
      if ((await this.m.AllianceMember.count({ where: { allianceId: fresh.allianceId }, transaction: t })) >= ALLIANCE_LIMITS.maxMembers) throw new ConflictError('Lien minh da day', 'ALLIANCE_FULL');
      const recent = await this.m.AllianceInvite.count({ where: { allianceId: fresh.allianceId, invitedByUserId: userId, createdAt: { [Op.gt]: new Date(this.now().getTime() - HOUR) } }, transaction: t });
      if (recent >= ALLIANCE_LIMITS.invitesPerHour) throw new AppError(429, 'INVITE_RATE_LIMIT', 'Ban moi qua nhieu, thu lai sau');
      const pending = await this.m.AllianceInvite.findOne({ where: { allianceId: fresh.allianceId, userId: targetId, status: 'pending' }, transaction: t });
      if (pending) return; // idempotent
      const inv = await this.m.AllianceInvite.create({ allianceId: fresh.allianceId, userId: targetId, invitedByUserId: userId, status: 'pending' }, { transaction: t });
      const a = (await this.m.Alliance.findByPk(fresh.allianceId, { transaction: t }))!;
      await this.social.notify(targetId, userId, 'alliance_invite', { inviteId: inv.id, allianceId: a.id, allianceName: a.name }, t);
    });
    return { ok: true };
  }

  async respondInvite(userId: string, inviteId: string, accept: boolean): Promise<AllianceStateDTO> {
    const inv = await this.m.AllianceInvite.findByPk(inviteId);
    if (!inv || inv.userId !== userId) throw new NotFoundError('Loi moi khong ton tai', 'INVITE_NOT_FOUND');
    await this.locked(inv.allianceId, async (t) => {
      const [n] = await this.m.AllianceInvite.update({ status: accept ? 'accepted' : 'declined' }, { where: { id: inviteId, userId, status: 'pending' }, transaction: t });
      if (n !== 1) throw new ConflictError('Loi moi da duoc xu ly', 'INVITE_HANDLED');
      if (!accept) return;
      if (!(await this.m.Alliance.count({ where: { id: inv.allianceId }, transaction: t }))) throw new NotFoundError('Lien minh khong con ton tai', 'ALLIANCE_NOT_FOUND');
      if ((await this.m.AllianceMember.count({ where: { allianceId: inv.allianceId }, transaction: t })) >= ALLIANCE_LIMITS.maxMembers) throw new ConflictError('Lien minh da day', 'ALLIANCE_FULL');
      try {
        await this.m.AllianceMember.create({ allianceId: inv.allianceId, userId, roleCode: 'member', joinedAt: this.now() }, { transaction: t });
      } catch (err) {
        if (err instanceof UniqueConstraintError) throw new ConflictError('Ban da o trong mot lien minh', 'ALREADY_IN_ALLIANCE');
        throw err;
      }
      // Other pending invites are void now.
      await this.m.AllianceInvite.update({ status: 'revoked' }, { where: { userId, status: 'pending' }, transaction: t });
      t.afterCommit(() => this.bus.emitToRoom(`alliance:${inv.allianceId}`, 'alliance:members', { allianceId: inv.allianceId }));
    });
    return this.state(userId);
  }

  // ── Roles & membership ─────────────────────────────────────────────────────
  private async target(me: AllianceMember, targetId: string, t: Transaction): Promise<AllianceMember> {
    const other = await this.m.AllianceMember.findOne({ where: { userId: targetId, allianceId: me.allianceId }, transaction: t });
    if (!other) throw new NotFoundError('Thanh vien khong ton tai', 'MEMBER_NOT_FOUND');
    return other;
  }

  async setRole(userId: string, targetId: string, role: 'officer' | 'member'): Promise<AllianceStateDTO> {
    const me = await this.member(userId);
    await this.locked(me.allianceId, async (t) => {
      const fresh = await this.member(userId, t);
      const other = await this.target(fresh, targetId, t);
      if (!canManage(fresh.roleCode, other.roleCode, 'promote') || !canManage(fresh.roleCode, role, 'promote')) throw new ForbiddenError('Khong du quyen doi vai tro', 'ALLIANCE_PERMISSION');
      await other.update({ roleCode: role }, { transaction: t });
      t.afterCommit(() => this.bus.emitToRoom(`alliance:${fresh.allianceId}`, 'alliance:members', { allianceId: fresh.allianceId }));
    });
    return this.state(userId);
  }

  async kick(userId: string, targetId: string): Promise<AllianceStateDTO> {
    const me = await this.member(userId);
    await this.locked(me.allianceId, async (t) => {
      const fresh = await this.member(userId, t);
      const other = await this.target(fresh, targetId, t);
      if (!canManage(fresh.roleCode, other.roleCode, 'kick')) throw new ForbiddenError('Khong du quyen moi thanh vien ra', 'ALLIANCE_PERMISSION');
      await other.destroy({ transaction: t });
      t.afterCommit(() => {
        this.bus.emitToUser(targetId, 'alliance:kicked', { allianceId: fresh.allianceId });
        this.bus.emitToRoom(`alliance:${fresh.allianceId}`, 'alliance:members', { allianceId: fresh.allianceId });
      });
    });
    return this.state(userId);
  }

  async transfer(userId: string, targetId: string): Promise<AllianceStateDTO> {
    const me = await this.member(userId);
    await this.locked(me.allianceId, async (t) => {
      const fresh = await this.member(userId, t);
      if (fresh.roleCode !== 'leader') throw new ForbiddenError('Chi thu linh moi chuyen giao duoc', 'ALLIANCE_PERMISSION');
      const other = await this.target(fresh, targetId, t);
      if (other.userId === userId) throw new BadRequestError('Ban da la thu linh', 'INVALID_TARGET');
      await other.update({ roleCode: 'leader' }, { transaction: t });
      await fresh.update({ roleCode: 'officer' }, { transaction: t });
      await this.m.Alliance.update({ leaderUserId: targetId }, { where: { id: fresh.allianceId }, transaction: t });
    });
    return this.state(userId);
  }

  async leave(userId: string): Promise<AllianceStateDTO> {
    const me = await this.member(userId);
    if (me.roleCode === 'leader') {
      const others = await this.m.AllianceMember.count({ where: { allianceId: me.allianceId, userId: { [Op.ne]: userId } } });
      if (others) throw new ConflictError('Thu linh phai chuyen giao truoc khi roi lien minh', 'LEADER_MUST_TRANSFER');
      return this.disband(userId);
    }
    await this.locked(me.allianceId, async (t) => {
      await this.m.AllianceMember.destroy({ where: { userId, allianceId: me.allianceId }, transaction: t });
      t.afterCommit(() => this.bus.emitToUser(userId, 'alliance:left', { allianceId: me.allianceId }));
    });
    return this.state(userId);
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  async messages(userId: string, cursor?: string): Promise<Paged<AllianceMessageDTO>> {
    const me = await this.member(userId);
    const where: Record<string, unknown> = { allianceId: me.allianceId };
    if (cursor) where.createdAt = { [Op.lt]: new Date(cursor) };
    const rows = await this.m.AllianceMessage.findAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: ALLIANCE_LIMITS.pageSize + 1 });
    const page = rows.slice(0, ALLIANCE_LIMITS.pageSize);
    const users = await this.m.User.findAll({ where: { id: [...new Set(page.map((r) => r.userId))] } });
    return {
      items: page.map((r) => ({ id: r.id, userId: r.userId, username: users.find((u) => u.id === r.userId)?.username ?? '?', body: r.body, createdAt: iso(r.createdAt) })),
      nextCursor: rows.length > ALLIANCE_LIMITS.pageSize ? iso(page[page.length - 1].createdAt) : null,
    };
  }

  async post(userId: string, body: string): Promise<AllianceMessageDTO> {
    const text = body.trim().slice(0, ALLIANCE_LIMITS.messageMax);
    if (!text) throw new BadRequestError('Tin nhan trong', 'EMPTY_MESSAGE');
    const me = await this.member(userId);
    return this.ctx.mutex.run(`alliance:chat:${userId}`, async () => {
      const since = new Date(this.now().getTime() - ALLIANCE_LIMITS.messageWindowSeconds * 1000);
      if ((await this.m.AllianceMessage.count({ where: { userId, createdAt: { [Op.gt]: since } } })) >= ALLIANCE_LIMITS.messagesPerWindow) {
        throw new AppError(429, 'CHAT_RATE_LIMIT', 'Ban gui qua nhanh, cho mot chut');
      }
      const user = await this.m.User.findByPk(userId);
      const row = await this.m.AllianceMessage.create({ allianceId: me.allianceId, userId, body: text, createdAt: this.now() });
      const dto: AllianceMessageDTO = { id: row.id, userId, username: user?.username ?? '?', body: row.body, createdAt: iso(row.createdAt) };
      this.bus.emitToRoom(`alliance:${me.allianceId}`, 'alliance:message', dto);
      return dto;
    });
  }

  /** May this user join the alliance's live room? */
  async allianceOf(userId: string): Promise<string | null> {
    return (await this.m.AllianceMember.findOne({ where: { userId } }))?.allianceId ?? null;
  }

  // ── Quests ─────────────────────────────────────────────────────────────────
  /** One running quest per kind; expired ones are closed and a fresh week starts. */
  private async ensureQuests(allianceId: string, t: Transaction): Promise<void> {
    const now = this.now();
    await this.m.AllianceQuest.update({ status: 'expired' }, { where: { allianceId, status: 'active', endsAt: { [Op.lte]: now } }, transaction: t });
    for (const def of ALLIANCE_QUESTS) {
      const running = await this.m.AllianceQuest.count({ where: { allianceId, code: def.code, endsAt: { [Op.gt]: now } }, transaction: t });
      if (!running) await this.m.AllianceQuest.create({ allianceId, code: def.code, target: def.target, status: 'active', endsAt: new Date(now.getTime() + ALLIANCE_QUEST_DAYS * 86400_000) }, { transaction: t });
    }
  }

  async donate(userId: string, questId: string, amount: number): Promise<AllianceStateDTO> {
    const me = await this.member(userId);
    const city = await this.m.City.findOne({ where: { ownerId: userId }, order: [['createdAt', 'ASC']] });
    if (!city) throw new NotFoundError('Ban chua co thanh pho', 'CITY_NOT_FOUND');
    await this.ctx.mutex.run(`alliance:${me.allianceId}`, () =>
      this.ctx.mutate(city.id, userId, true, async (_c, t) => {
        const quest = await this.m.AllianceQuest.findOne({ where: { id: questId, allianceId: me.allianceId }, transaction: t });
        if (!quest) throw new NotFoundError('Nhiem vu khong ton tai', 'QUEST_NOT_FOUND');
        const def = getAllianceQuest(quest.code);
        if (!def.resource) throw new BadRequestError('Nhiem vu nay khong nhan dong gop', 'QUEST_NOT_DONATABLE');
        if (quest.status !== 'active' || new Date(quest.endsAt).getTime() <= this.now().getTime()) throw new ConflictError('Nhiem vu da ket thuc', 'QUEST_CLOSED');
        // Never take more than the quest still needs.
        const take = Math.min(amount, quest.target - quest.progress);
        await this.ctx.resources.charge(city.id, { coins: 0, wood: def.resource === 'wood' ? take : 0, stone: def.resource === 'stone' ? take : 0 }, t);
        await this.m.AllianceMember.increment('contribution', { by: take, where: { userId, allianceId: me.allianceId }, transaction: t });
        await this.advance(quest, take, t);
      })
    );
    return this.state(userId);
  }

  /** BattleService hook: a member won a PvE battle. */
  async recordPveWin(_cityId: string, userId: string, t: Transaction): Promise<void> {
    const me = await this.m.AllianceMember.findOne({ where: { userId }, transaction: t });
    if (!me) return;
    const quest = await this.m.AllianceQuest.findOne({ where: { allianceId: me.allianceId, code: 'pve_wins', status: 'active', endsAt: { [Op.gt]: this.now() } }, transaction: t });
    if (quest) await this.advance(quest, 1, t);
  }

  private async advance(quest: AllianceQuest, by: number, t: Transaction): Promise<void> {
    if (by <= 0) return;
    await this.m.AllianceQuest.increment('progress', { by, where: { id: quest.id, status: 'active' }, transaction: t });
    await quest.reload({ transaction: t });
    if (quest.progress < quest.target) return;
    // Exactly once: only the update that flips active → completed pays.
    const [done] = await this.m.AllianceQuest.update({ status: 'completed', progress: quest.target }, { where: { id: quest.id, status: 'active' }, transaction: t });
    if (done !== 1) return;
    const def = getAllianceQuest(quest.code);
    const members = await this.m.AllianceMember.findAll({ where: { allianceId: quest.allianceId }, transaction: t });
    const cities = await this.m.City.findAll({ where: { ownerId: members.map((x) => x.userId) }, transaction: t });
    for (const c of cities) await this.m.CityEconomy.increment('cityCoins', { by: def.rewardCoins, where: { cityId: c.id }, transaction: t });
    for (const x of members) await this.social.notify(x.userId, null, 'alliance_quest', { questId: quest.id, code: quest.code, rewardCoins: def.rewardCoins }, t);
  }
}
