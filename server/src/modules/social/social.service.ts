/**
 * Friends, visits and notifications (Phase 12).
 *  - friend requests are rate limited (per hour, pending cap, decline cool-down) and a request
 *    in the other direction is accepted instead of duplicated
 *  - accepting is a conditional UPDATE (pending → accepted) + a UNIQUE pair row, so two clicks
 *    never create two friendships
 *  - visiting reuses the normal read APIs through the shared access rule (social/access.ts);
 *    visitors never gain write rights
 */
import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import {
  FRIEND_LIMITS,
  type FriendRequestDTO,
  type FriendsStateDTO,
  type NotificationDTO,
  type NotificationKind,
  type Paged,
  type UserSummaryDTO,
  type WorldVisibility,
} from '@cityverse/shared';
import type { DatabaseModels } from '../../database/models/index.js';
import type { User } from '../../database/models/User.js';
import type { RealtimeBus } from '../../realtime/bus.js';
import { AppError, BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { KeyedMutex } from '../buildings/buildingSupport.js';
import { areFriends, cityRole, pairKey, visibilityOf } from './access.js';

const HOUR = 3600_000;

export class SocialService {
  private readonly lock = new KeyedMutex();

  constructor(
    private readonly models: DatabaseModels,
    private readonly bus: RealtimeBus,
    private readonly now: () => Date = () => new Date()
  ) {}

  // ── Users ──────────────────────────────────────────────────────────────────
  /** Summaries of users as seen by `viewerId` (friendship, online, visit rights). */
  async summaries(viewerId: string, users: readonly User[]): Promise<UserSummaryDTO[]> {
    if (!users.length) return [];
    const ids = users.map((u) => u.id);
    const [characters, cities, friendships, pending] = await Promise.all([
      this.models.Character.findAll({ where: { userId: ids } }),
      this.models.City.findAll({ where: { ownerId: ids } }),
      this.models.Friendship.findAll({ where: { [Op.or]: [{ userAId: viewerId, userBId: ids }, { userBId: viewerId, userAId: ids }] } }),
      this.models.FriendRequest.findAll({ where: { status: 'pending', [Op.or]: [{ fromUserId: viewerId, toUserId: ids }, { toUserId: viewerId, fromUserId: ids }] } }),
    ]);
    const out: UserSummaryDTO[] = [];
    for (const u of users) {
      const city = cities.find((c) => c.ownerId === u.id) ?? null;
      const friends = friendships.some((f) => f.userAId === u.id || f.userBId === u.id);
      const friendship = u.id === viewerId ? 'self' : friends ? 'friends' : pending.some((p) => p.fromUserId === viewerId && p.toUserId === u.id) ? 'pending_out' : pending.some((p) => p.toUserId === viewerId && p.fromUserId === u.id) ? 'pending_in' : 'none';
      const vis = city ? visibilityOf(city) : null;
      out.push({
        id: u.id,
        username: u.username,
        displayName: characters.find((c) => c.userId === u.id)?.name ?? u.username,
        online: this.bus.isOnline(u.id),
        friendship,
        cityId: city?.id ?? null,
        cityName: city?.name ?? null,
        visibility: vis,
        canVisit: Boolean(city) && (u.id === viewerId || vis === 'public' || (vis === 'friends' && friends)),
      });
    }
    return out;
  }

  async search(viewerId: string, q: string, cursor?: string): Promise<Paged<UserSummaryDTO>> {
    const term = q.trim().replace(/[%_\\]/g, '');
    if (term.length < FRIEND_LIMITS.searchMinChars) throw new BadRequestError('Nhap it nhat 2 ky tu', 'SEARCH_TOO_SHORT');
    const where: Record<string, unknown> = { username: { [Op.like]: `${term}%` }, status: 'active' };
    if (cursor) (where.username as Record<symbol, string>)[Op.gt] = cursor;
    const users = await this.models.User.findAll({ where, order: [['username', 'ASC']], limit: FRIEND_LIMITS.pageSize + 1 });
    const page = users.slice(0, FRIEND_LIMITS.pageSize);
    return { items: await this.summaries(viewerId, page), nextCursor: users.length > FRIEND_LIMITS.pageSize ? page[page.length - 1].username : null };
  }

  // ── Friends ────────────────────────────────────────────────────────────────
  async state(viewerId: string): Promise<FriendsStateDTO> {
    const [friendships, incoming, outgoing] = await Promise.all([
      this.models.Friendship.findAll({ where: { [Op.or]: [{ userAId: viewerId }, { userBId: viewerId }] }, order: [['createdAt', 'DESC']] }),
      this.models.FriendRequest.findAll({ where: { toUserId: viewerId, status: 'pending' }, order: [['createdAt', 'DESC']] }),
      this.models.FriendRequest.findAll({ where: { fromUserId: viewerId, status: 'pending' }, order: [['createdAt', 'DESC']] }),
    ]);
    const otherIds = [...new Set([...friendships.map((f) => (f.userAId === viewerId ? f.userBId : f.userAId)), ...incoming.map((r) => r.fromUserId), ...outgoing.map((r) => r.toUserId), viewerId])];
    const users = await this.models.User.findAll({ where: { id: otherIds } });
    const sums = await this.summaries(viewerId, users);
    const by = new Map(sums.map((s) => [s.id, s]));
    const req = (r: (typeof incoming)[number]): FriendRequestDTO => ({ id: r.id, from: by.get(r.fromUserId)!, to: by.get(r.toUserId)!, status: r.status, createdAt: new Date(r.createdAt).toISOString() });
    return {
      friends: friendships
        .map((f) => ({ user: by.get(f.userAId === viewerId ? f.userBId : f.userAId)!, since: new Date(f.createdAt).toISOString() }))
        .filter((x) => x.user)
        .sort((a, b) => Number(b.user.online) - Number(a.user.online) || a.user.username.localeCompare(b.user.username)),
      incoming: incoming.map(req),
      outgoing: outgoing.map(req),
    };
  }

  async request(viewerId: string, toUserId: string): Promise<FriendsStateDTO> {
    if (viewerId === toUserId) throw new BadRequestError('Khong the ket ban voi chinh minh', 'SELF_REQUEST');
    const [a, b] = pairKey(viewerId, toUserId);
    return this.lock.run(`friend:${a}:${b}`, async () => {
      const target = await this.models.User.findByPk(toUserId);
      if (!target || target.status !== 'active') throw new NotFoundError('Nguoi choi khong ton tai', 'USER_NOT_FOUND');
      if (await areFriends(this.models, viewerId, toUserId)) throw new ConflictError('Hai ban da la ban be', 'ALREADY_FRIENDS');
      // They already asked us → accept instead of a second request.
      const reverse = await this.models.FriendRequest.findOne({ where: { fromUserId: toUserId, toUserId: viewerId, status: 'pending' } });
      if (reverse) {
        await this.accept(reverse.id, viewerId);
        return this.state(viewerId);
      }
      if (await this.models.FriendRequest.count({ where: { fromUserId: viewerId, toUserId, status: 'pending' } })) throw new ConflictError('Da gui loi moi', 'REQUEST_PENDING');
      const now = this.now();
      const hourly = await this.models.FriendRequest.count({ where: { fromUserId: viewerId, createdAt: { [Op.gte]: new Date(now.getTime() - HOUR) } } });
      if (hourly >= FRIEND_LIMITS.requestsPerHour) throw new AppError(429, 'RATE_LIMITED', 'Ban gui qua nhieu loi moi, hay thu lai sau');
      if ((await this.models.FriendRequest.count({ where: { fromUserId: viewerId, status: 'pending' } })) >= FRIEND_LIMITS.maxPendingOutgoing) {
        throw new ConflictError('Qua nhieu loi moi dang cho', 'TOO_MANY_PENDING');
      }
      if ((await this.friendCount(viewerId)) >= FRIEND_LIMITS.maxFriends) throw new ConflictError('Danh sach ban be da day', 'FRIEND_LIMIT');
      const declined = await this.models.FriendRequest.findOne({
        where: { fromUserId: viewerId, toUserId, status: 'declined', respondedAt: { [Op.gte]: new Date(now.getTime() - FRIEND_LIMITS.declineCooldownHours * HOUR) } },
      });
      if (declined) throw new ConflictError('Nguoi choi vua tu choi, hay thu lai sau', 'RECENTLY_DECLINED');
      const r = await this.models.FriendRequest.create({ fromUserId: viewerId, toUserId, status: 'pending' });
      await this.notify(toUserId, viewerId, 'friend_request', { requestId: r.id, fromUserId: viewerId });
      return this.state(viewerId);
    });
  }

  async respond(viewerId: string, requestId: string, accept: boolean): Promise<FriendsStateDTO> {
    const r = await this.models.FriendRequest.findByPk(requestId);
    if (!r || r.toUserId !== viewerId) throw new NotFoundError('Loi moi khong ton tai', 'REQUEST_NOT_FOUND');
    if (accept) await this.accept(r.id, viewerId);
    else {
      const [n] = await this.models.FriendRequest.update({ status: 'declined', respondedAt: this.now() }, { where: { id: r.id, status: 'pending' } });
      if (n !== 1) throw new ConflictError('Loi moi da duoc xu ly', 'REQUEST_HANDLED');
    }
    return this.state(viewerId);
  }

  private async accept(requestId: string, viewerId: string): Promise<void> {
    await this.models.sequelize.transaction(async (t) => {
      const r = (await this.models.FriendRequest.findByPk(requestId, { transaction: t }))!;
      const [n] = await this.models.FriendRequest.update({ status: 'accepted', respondedAt: this.now() }, { where: { id: r.id, status: 'pending' }, transaction: t });
      if (n !== 1) throw new ConflictError('Loi moi da duoc xu ly', 'REQUEST_HANDLED');
      const [userAId, userBId] = pairKey(r.fromUserId, r.toUserId);
      try {
        await this.models.Friendship.create({ userAId, userBId }, { transaction: t });
      } catch (err) {
        if (!(err instanceof UniqueConstraintError)) throw err;
      }
    });
    const r = (await this.models.FriendRequest.findByPk(requestId))!;
    await this.notify(r.fromUserId, viewerId, 'friend_accepted', { userId: viewerId });
  }

  async cancel(viewerId: string, requestId: string): Promise<FriendsStateDTO> {
    const [n] = await this.models.FriendRequest.update({ status: 'cancelled', respondedAt: this.now() }, { where: { id: requestId, fromUserId: viewerId, status: 'pending' } });
    if (n !== 1) throw new NotFoundError('Loi moi khong ton tai', 'REQUEST_NOT_FOUND');
    return this.state(viewerId);
  }

  async unfriend(viewerId: string, friendId: string): Promise<FriendsStateDTO> {
    const [userAId, userBId] = pairKey(viewerId, friendId);
    const n = await this.models.Friendship.destroy({ where: { userAId, userBId } });
    if (!n) throw new NotFoundError('Khong phai ban be', 'NOT_FRIENDS');
    return this.state(viewerId);
  }

  private friendCount(userId: string): Promise<number> {
    return this.models.Friendship.count({ where: { [Op.or]: [{ userAId: userId }, { userBId: userId }] } });
  }

  /** Invite a friend to visit my city (notification + live ping). */
  async inviteVisit(viewerId: string, friendId: string): Promise<{ sent: true }> {
    if (!(await areFriends(this.models, viewerId, friendId))) throw new ForbiddenError('Chi moi duoc ban be', 'NOT_FRIENDS');
    const city = await this.models.City.findOne({ where: { ownerId: viewerId } });
    if (!city) throw new NotFoundError('Ban chua co lanh dia', 'CITY_NOT_FOUND');
    if (visibilityOf(city) === 'private') throw new ConflictError('Lanh dia dang de rieng tu — hay doi che do hien thi', 'CITY_PRIVATE');
    const recent = await this.models.Notification.count({ where: { actorUserId: viewerId, kind: 'visit_invite', createdAt: { [Op.gte]: new Date(this.now().getTime() - HOUR) } } });
    if (recent >= FRIEND_LIMITS.visitInvitesPerHour) throw new AppError(429, 'RATE_LIMITED', 'Ban moi qua nhieu lan, hay thu lai sau');
    await this.notify(friendId, viewerId, 'visit_invite', { cityId: city.id, cityName: city.name, fromUserId: viewerId });
    return { sent: true };
  }

  /** Owner sets who may visit (public / friends / private). */
  async setVisibility(userId: string, cityId: string, visibility: WorldVisibility) {
    const city = await this.models.City.findByPk(cityId);
    if (!city) throw new NotFoundError('Thanh pho khong ton tai', 'CITY_NOT_FOUND');
    if ((await cityRole(this.models, city, userId)) !== 'owner') throw new ForbiddenError('Chi chu lanh dia moi doi duoc', 'NOT_OWNER');
    await city.update({ visibility, isPublic: visibility === 'public' });
    return { cityId, visibility };
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  /** Stores a notification and pushes it live (after commit when inside a transaction). */
  async notify(userId: string, actorUserId: string | null, kind: NotificationKind, payload: Record<string, string | number | null>, t?: Transaction): Promise<void> {
    const n = await this.models.Notification.create({ userId, actorUserId, kind, payload }, { transaction: t });
    const push = () => this.bus.emitToUser(userId, 'notification', this.toNotification(n));
    if (t) t.afterCommit(push);
    else push();
  }

  async notifications(userId: string, cursor?: string): Promise<Paged<NotificationDTO>> {
    const where: Record<string, unknown> = { userId };
    if (cursor) where.createdAt = { [Op.lt]: new Date(cursor) };
    const rows = await this.models.Notification.findAll({ where, order: [['createdAt', 'DESC']], limit: FRIEND_LIMITS.pageSize + 1 });
    const page = rows.slice(0, FRIEND_LIMITS.pageSize);
    return { items: page.map((n) => this.toNotification(n)), nextCursor: rows.length > FRIEND_LIMITS.pageSize ? new Date(page[page.length - 1].createdAt).toISOString() : null };
  }

  async markRead(userId: string, id: string): Promise<{ ok: true }> {
    const [n] = await this.models.Notification.update({ readAt: this.now() }, { where: { id, userId } });
    if (!n) throw new NotFoundError('Thong bao khong ton tai', 'NOTIFICATION_NOT_FOUND');
    return { ok: true };
  }

  private toNotification(n: { id: string; kind: NotificationKind; payload: Record<string, string | number | null>; readAt: Date | null; createdAt: Date }): NotificationDTO {
    return { id: n.id, kind: n.kind, payload: n.payload, readAt: n.readAt ? new Date(n.readAt).toISOString() : null, createdAt: new Date(n.createdAt).toISOString() };
  }
}
