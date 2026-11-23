import axios from 'axios';
import type {
  AllianceDTO,
  AllianceMessageDTO,
  AllianceStateDTO,
  ApiSuccessResponse,
  BattleAction,
  CityDTO,
  FriendsStateDTO,
  LeaderboardEntryDTO,
  NotificationDTO,
  Paged,
  PvpBattleDTO,
  PvpMatchDTO,
  PvpRoomDTO,
  PvpStateDTO,
  UserSummaryDTO,
  WorldVisibility,
} from '@cityverse/shared';
import { httpClient } from './httpClient';

const d = <T>(p: Promise<{ data: ApiSuccessResponse<T> }>) => p.then((r) => r.data.data);
const q = (cursor?: string | null) => (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');

export const socialApi = {
  search: (term: string, cursor?: string | null) => d<Paged<UserSummaryDTO>>(httpClient.get(`/users/search?q=${encodeURIComponent(term)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)),
  friends: () => d<FriendsStateDTO>(httpClient.get('/friends')),
  request: (userId: string) => d<FriendsStateDTO>(httpClient.post('/friends/requests', { userId })),
  respond: (id: string, accept: boolean) => d<FriendsStateDTO>(httpClient.post(`/friends/requests/${id}/respond`, { accept })),
  cancel: (id: string) => d<FriendsStateDTO>(httpClient.delete(`/friends/requests/${id}`)),
  unfriend: (userId: string) => d<FriendsStateDTO>(httpClient.delete(`/friends/${userId}`)),
  inviteVisit: (userId: string) => d<{ sent: true }>(httpClient.post(`/friends/${userId}/visit-invite`)),
  notifications: (cursor?: string | null) => d<Paged<NotificationDTO>>(httpClient.get(`/notifications${q(cursor)}`)),
  markRead: (id: string) => d<{ ok: true }>(httpClient.post(`/notifications/${id}/read`)),
  setVisibility: (cityId: string, visibility: WorldVisibility) => d<CityDTO>(httpClient.patch(`/cities/${cityId}/visibility`, { visibility })),
};

export const pvpApi = {
  state: () => d<PvpStateDTO>(httpClient.get('/pvp')),
  leaderboard: (cursor?: string | null) => d<Paged<LeaderboardEntryDTO>>(httpClient.get(`/pvp/leaderboard${q(cursor)}`)),
  history: (cursor?: string | null) => d<Paged<PvpMatchDTO>>(httpClient.get(`/pvp/history${q(cursor)}`)),
  enqueue: (unitIds: string[]) => d<PvpStateDTO>(httpClient.post('/pvp/queue', { unitIds })),
  leaveQueue: () => d<PvpStateDTO>(httpClient.delete('/pvp/queue')),
  createRoom: (inviteUserId?: string) => d<PvpRoomDTO>(httpClient.post('/pvp/rooms', inviteUserId ? { inviteUserId } : {})),
  joinRoom: (id: string) => d<PvpRoomDTO>(httpClient.post(`/pvp/rooms/${id}/join`)),
  roster: (id: string, unitIds: string[]) => d<PvpRoomDTO>(httpClient.post(`/pvp/rooms/${id}/roster`, { unitIds })),
  cancelRoom: (id: string) => d<PvpRoomDTO>(httpClient.post(`/pvp/rooms/${id}/cancel`)),
  get: (battleId: string) => d<PvpBattleDTO>(httpClient.get(`/pvp/battles/${battleId}`)),
  act: (battleId: string, clientActionId: string, expectedVersion: number, action: BattleAction) =>
    d<PvpBattleDTO>(httpClient.post(`/pvp/battles/${battleId}/actions`, { clientActionId, expectedVersion, action })),
};

export const allianceApi = {
  state: () => d<AllianceStateDTO>(httpClient.get('/alliance')),
  list: (cursor?: string | null) => d<Paged<AllianceDTO>>(httpClient.get(`/alliances${q(cursor)}`)),
  create: (name: string, tag: string, description: string) => d<AllianceStateDTO>(httpClient.post('/alliances', { name, tag, description })),
  invite: (userId: string) => d<{ ok: true }>(httpClient.post('/alliance/invites', { userId })),
  respond: (id: string, accept: boolean) => d<AllianceStateDTO>(httpClient.post(`/alliance/invites/${id}/respond`, { accept })),
  setRole: (userId: string, role: 'officer' | 'member') => d<AllianceStateDTO>(httpClient.patch(`/alliance/members/${userId}/role`, { role })),
  kick: (userId: string) => d<AllianceStateDTO>(httpClient.delete(`/alliance/members/${userId}`)),
  transfer: (userId: string) => d<AllianceStateDTO>(httpClient.post(`/alliance/members/${userId}/transfer`)),
  leave: () => d<AllianceStateDTO>(httpClient.post('/alliance/leave')),
  disband: () => d<AllianceStateDTO>(httpClient.delete('/alliance')),
  messages: (cursor?: string | null) => d<Paged<AllianceMessageDTO>>(httpClient.get(`/alliance/messages${q(cursor)}`)),
  post: (body: string) => d<AllianceMessageDTO>(httpClient.post('/alliance/messages', { body })),
  donate: (questId: string, amount: number) => d<AllianceStateDTO>(httpClient.post(`/alliance/quests/${questId}/donate`, { amount })),
};

const MESSAGES: Record<string, string> = {
  SELF_REQUEST: 'Không thể kết bạn với chính mình.',
  ALREADY_FRIENDS: 'Hai bạn đã là bạn bè.',
  REQUEST_PENDING: 'Đã gửi lời mời, hãy chờ trả lời.',
  RECENTLY_DECLINED: 'Người chơi vừa từ chối — thử lại sau 24 giờ.',
  RATE_LIMITED: 'Bạn gửi quá nhiều lời mời, hãy thử lại sau.',
  TOO_MANY_PENDING: 'Quá nhiều lời mời đang chờ.',
  FRIEND_LIMIT: 'Danh sách bạn bè đã đầy.',
  NOT_FRIENDS: 'Chỉ dành cho bạn bè.',
  WORLD_PRIVATE: 'Thế giới của bạn đang để riêng tư.',
  CITY_ACCESS_DENIED: 'Thế giới này không mở cho bạn.',
  PVP_BATTLE_ACTIVE: 'Bạn đang có trận PvP chưa kết thúc.',
  UNIT_UNAVAILABLE: 'Có binh sĩ chưa thể xuất quân.',
  INVALID_ROSTER: 'Đấu trường cần 3–6 binh sĩ.',
  ROOM_CLOSED: 'Phòng đã đủ người hoặc đã đóng.',
  ROOM_EXPIRED: 'Phòng đã hết hạn.',
  ROOM_FORBIDDEN: 'Phòng này không dành cho bạn.',
  TOO_MANY_ROOMS: 'Tối đa 3 phòng đang mở.',
  NOT_YOUR_TURN: 'Chưa đến lượt của bạn.',
  ALLIANCE_TAKEN: 'Tên hoặc tag liên minh đã có người dùng.',
  ALREADY_IN_ALLIANCE: 'Đã ở trong một liên minh.',
  ALLIANCE_FULL: 'Liên minh đã đầy.',
  ALLIANCE_PERMISSION: 'Vai trò của bạn không có quyền này.',
  NOT_IN_ALLIANCE: 'Bạn chưa thuộc liên minh nào.',
  LEADER_MUST_TRANSFER: 'Thủ lĩnh phải chuyển giao trước khi rời.',
  CHAT_RATE_LIMIT: 'Bạn gửi quá nhanh, chờ một chút.',
  INVITE_RATE_LIMIT: 'Bạn mời quá nhiều, thử lại sau.',
  QUEST_CLOSED: 'Nhiệm vụ đã kết thúc.',
  INSUFFICIENT_RESOURCES: 'Không đủ tài nguyên.',
  RATE_LIMIT_EXCEEDED: 'Thao tác quá nhanh.',
};

export function socialErrorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    if (!e.response) return 'Mất kết nối tới server.';
    const code = (e.response.data as { error?: { code?: string; message?: string } })?.error?.code ?? '';
    return MESSAGES[code] ?? (e.response.data as { error?: { message?: string } })?.error?.message ?? 'Có lỗi xảy ra.';
  }
  return e instanceof Error ? e.message : 'Có lỗi xảy ra.';
}
