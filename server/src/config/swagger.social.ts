/** OpenAPI docs for Phase 12 — friends & visits, PvP, ranking, alliances, realtime. */
const auth = [{ BearerAuth: [] }];
const id = (name = 'id') => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }) as const;
const cursor = { name: 'cursor', in: 'query', required: false, schema: { type: 'string', maxLength: 80 }, description: 'nextCursor cua trang truoc' } as const;
const body = (ref: string) => ({ required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });
const ok = (d: string, extra: Record<string, { description: string }> = {}) => ({ '200': { description: d }, '401': { description: 'Chua dang nhap' }, ...extra });
const F = ['Friends'];
const P = ['PvP'];
const A = ['Alliances'];
const ids = { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 3, maxItems: 6 } as const;

export const socialSchemas = {
  UserIdRequest: { type: 'object', required: ['userId'], properties: { userId: { type: 'string', format: 'uuid' } } },
  RespondRequest: { type: 'object', required: ['accept'], properties: { accept: { type: 'boolean' } } },
  VisibilityRequest: { type: 'object', required: ['visibility'], properties: { visibility: { type: 'string', enum: ['public', 'friends', 'private'] } } },
  PvpSquadRequest: { type: 'object', required: ['unitIds'], properties: { unitIds: ids }, description: '3-6 binh si san sang cua thanh pho minh (kiem tra nhu PvE)' },
  PvpRoomRequest: { type: 'object', properties: { inviteUserId: { type: 'string', format: 'uuid', description: 'Chi ban be' } } },
  CreateAllianceRequest: {
    type: 'object',
    required: ['name', 'tag'],
    properties: { name: { type: 'string', minLength: 3, maxLength: 24 }, tag: { type: 'string', pattern: '^[A-Za-z0-9]{2,5}$' }, description: { type: 'string', maxLength: 300 } },
  },
  AllianceRoleRequest: { type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['officer', 'member'] } } },
  AllianceMessageRequest: { type: 'object', required: ['body'], properties: { body: { type: 'string', minLength: 1, maxLength: 500 } } },
  AllianceDonateRequest: { type: 'object', required: ['amount'], properties: { amount: { type: 'integer', minimum: 1, maximum: 5000 } } },
} as const;

const pvpBattle = { name: 'battleId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;

export const socialPaths = {
  '/users/search': { get: { tags: F, summary: 'Tim nguoi choi theo ten (tien to, >= 2 ky tu, phan trang)', security: auth, parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2, maxLength: 24 } }, cursor], responses: ok('Paged<UserSummaryDTO>') } },
  '/friends': { get: { tags: F, summary: 'Ban be (online), loi moi den / di', security: auth, responses: ok('FriendsStateDTO') } },
  '/friends/requests': {
    post: {
      tags: F,
      summary: 'Gui loi ket ban (10/gio, toi da 30 dang cho, 24h sau khi bi tu choi; neu ho da moi minh → tu dong chap nhan)',
      security: auth,
      requestBody: body('UserIdRequest'),
      responses: { '201': { description: 'FriendsStateDTO' }, '409': { description: 'REQUEST_PENDING / ALREADY_FRIENDS / RECENTLY_DECLINED / TOO_MANY_PENDING / FRIEND_LIMIT' }, '429': { description: 'RATE_LIMITED' } },
    },
  },
  '/friends/requests/{id}/respond': { post: { tags: F, summary: 'Chap nhan / tu choi (chi nguoi nhan)', security: auth, parameters: [id()], requestBody: body('RespondRequest'), responses: ok('FriendsStateDTO', { '404': { description: 'REQUEST_NOT_FOUND' } }) } },
  '/friends/requests/{id}': { delete: { tags: F, summary: 'Huy loi moi da gui', security: auth, parameters: [id()], responses: ok('FriendsStateDTO') } },
  '/friends/{id}': { delete: { tags: F, summary: 'Huy ket ban', security: auth, parameters: [id()], responses: ok('FriendsStateDTO') } },
  '/friends/{id}/visit-invite': { post: { tags: F, summary: 'Moi ban be ghe tham the gioi cua minh (chi ban be, the gioi khong rieng tu, 10/gio)', security: auth, parameters: [id()], responses: ok('{ sent: true }', { '403': { description: 'NOT_FRIENDS / WORLD_PRIVATE' } }) } },
  '/notifications': { get: { tags: F, summary: 'Thong bao (moi nhat truoc, cursor)', security: auth, parameters: [cursor], responses: ok('Paged<NotificationDTO>') } },
  '/notifications/{id}/read': { post: { tags: F, summary: 'Danh dau da doc', security: auth, parameters: [id()], responses: ok('{ ok: true }') } },
  '/cities/{cityId}/visibility': {
    patch: {
      tags: F,
      summary: 'Ai duoc ghe tham: public / friends / private (chi chu thanh pho). Khach ghe tham luon chi DOC.',
      security: auth,
      parameters: [id('cityId')],
      requestBody: body('VisibilityRequest'),
      responses: ok('CityDTO', { '403': { description: 'CITY_OWNER_ONLY' } }),
    },
  },

  '/pvp': { get: { tags: P, summary: 'Ho so mua giai (Elo, hang), hang cho, phong, tran dang mo, lich su', security: auth, responses: ok('PvpStateDTO') } },
  '/pvp/leaderboard': { get: { tags: P, summary: 'Bang xep hang mua hien tai (rating giam dan, cursor = offset)', security: auth, parameters: [cursor], responses: ok('Paged<LeaderboardEntryDTO>') } },
  '/pvp/history': { get: { tags: P, summary: 'Lich su tran PvP cua toi', security: auth, parameters: [cursor], responses: ok('Paged<PvpMatchDTO>') } },
  '/pvp/queue': {
    post: { tags: P, summary: 'Vao hang cho xep hang (ghep theo Elo + suc manh doi; bao ve tan thu)', security: auth, requestBody: body('PvpSquadRequest'), responses: ok('PvpStateDTO', { '409': { description: 'PVP_BATTLE_ACTIVE / UNIT_UNAVAILABLE' } }) },
    delete: { tags: P, summary: 'Roi hang cho', security: auth, responses: ok('PvpStateDTO') },
  },
  '/pvp/rooms': { post: { tags: P, summary: 'Tao phong dau giao huu (moi ban be, het han sau 5 phut, khong tinh Elo)', security: auth, requestBody: body('PvpRoomRequest'), responses: { '201': { description: 'PvpRoomDTO' }, '403': { description: 'NOT_FRIENDS' } } } },
  '/pvp/rooms/{id}/join': { post: { tags: P, summary: 'Vao phong (nguoi duoc moi / ban be cua chu phong)', security: auth, parameters: [id()], responses: ok('PvpRoomDTO', { '403': { description: 'ROOM_FORBIDDEN' }, '409': { description: 'ROOM_CLOSED / ROOM_EXPIRED' } }) } },
  '/pvp/rooms/{id}/roster': { post: { tags: P, summary: 'Chon doi hinh; ca hai san sang → tran bat dau', security: auth, parameters: [id()], requestBody: body('PvpSquadRequest'), responses: ok('PvpRoomDTO') } },
  '/pvp/rooms/{id}/cancel': { post: { tags: P, summary: 'Huy phong (truoc khi danh)', security: auth, parameters: [id()], responses: ok('PvpRoomDTO') } },
  '/pvp/battles/{battleId}': { get: { tags: P, summary: 'Trang thai tran (ket noi lai). Dong ho luot chay tren server: 90 s khi online, 180 s offline → xu thua.', security: auth, parameters: [pvpBattle], responses: ok('PvpBattleDTO (mySide, opponent, turnDeadline)', { '403': { description: 'BATTLE_FORBIDDEN' } }) } },
  '/pvp/battles/{battleId}/actions': {
    post: {
      tags: P,
      summary: 'Gui Y DINH cho luot cua minh. Server kiem tra phe, luot, version, idempotency roi moi luu va day cho ca hai (Socket.IO battle:update).',
      security: auth,
      parameters: [pvpBattle],
      requestBody: body('BattleActionRequest'),
      responses: ok('PvpBattleDTO', { '409': { description: 'NOT_YOUR_TURN / STALE_BATTLE / BATTLE_FINISHED / luat tran' } }),
    },
  },
  '/pvp/battles/{battleId}/end-turn': { post: { tags: P, summary: 'Ket thuc luot', security: auth, parameters: [pvpBattle], requestBody: body('EndTurnRequest'), responses: ok('PvpBattleDTO') } },

  '/alliances': {
    get: { tags: A, summary: 'Danh sach lien minh (theo ten, cursor)', security: auth, parameters: [cursor], responses: ok('Paged<AllianceDTO>') },
    post: { tags: A, summary: 'Lap lien minh (500 xu tu thanh pho minh; ten / tag duy nhat; 1 lien minh / nguoi)', security: auth, requestBody: body('CreateAllianceRequest'), responses: { '201': { description: 'AllianceStateDTO' }, '409': { description: 'ALLIANCE_TAKEN / ALREADY_IN_ALLIANCE' } } },
  },
  '/alliance': {
    get: { tags: A, summary: 'Lien minh cua toi: thanh vien, vai tro, quyen, nhiem vu chung, loi moi', security: auth, responses: ok('AllianceStateDTO') },
    delete: { tags: A, summary: 'Giai tan (thu linh)', security: auth, responses: ok('AllianceStateDTO', { '403': { description: 'ALLIANCE_PERMISSION' } }) },
  },
  '/alliance/invites': { post: { tags: A, summary: 'Moi nguoi choi (quyen invite, toi da 30 thanh vien, 20 loi moi/gio)', security: auth, requestBody: body('UserIdRequest'), responses: { '201': { description: '{ ok: true }' }, '403': { description: 'ALLIANCE_PERMISSION' }, '409': { description: 'ALLIANCE_FULL / ALREADY_IN_ALLIANCE' } } } },
  '/alliance/invites/{id}/respond': { post: { tags: A, summary: 'Nhan / tu choi loi moi', security: auth, parameters: [id()], requestBody: body('RespondRequest'), responses: ok('AllianceStateDTO') } },
  '/alliance/members/{userId}/role': { patch: { tags: A, summary: 'Doi vai tro (thu linh): officer / member', security: auth, parameters: [id('userId')], requestBody: body('AllianceRoleRequest'), responses: ok('AllianceStateDTO') } },
  '/alliance/members/{userId}': { delete: { tags: A, summary: 'Moi ra (khong the dong cap / cap tren)', security: auth, parameters: [id('userId')], responses: ok('AllianceStateDTO') } },
  '/alliance/members/{userId}/transfer': { post: { tags: A, summary: 'Chuyen giao thu linh', security: auth, parameters: [id('userId')], responses: ok('AllianceStateDTO') } },
  '/alliance/leave': { post: { tags: A, summary: 'Roi lien minh (thu linh phai chuyen giao truoc)', security: auth, responses: ok('AllianceStateDTO', { '409': { description: 'LEADER_MUST_TRANSFER' } }) } },
  '/alliance/messages': {
    get: { tags: A, summary: 'Kenh chat (thanh vien; moi nhat truoc; cursor)', security: auth, parameters: [cursor], responses: ok('Paged<AllianceMessageDTO>') },
    post: { tags: A, summary: 'Gui tin (5 tin / 10 s) — cung day qua Socket.IO alliance:message', security: auth, requestBody: body('AllianceMessageRequest'), responses: { '201': { description: 'AllianceMessageDTO' }, '429': { description: 'CHAT_RATE_LIMIT' } } },
  },
  '/alliance/quests/{id}/donate': { post: { tags: A, summary: 'Gop go / da tu thanh pho minh (khong vuot qua phan con thieu); hoan thanh → moi thanh vien nhan xu dung 1 lan', security: auth, parameters: [id()], requestBody: body('AllianceDonateRequest'), responses: ok('AllianceStateDTO', { '409': { description: 'QUEST_CLOSED' } }) } },
} as const;

/** Realtime (Socket.IO, path /socket.io, auth: { token: <access JWT> }) — documented here for reference. */
export const realtimeDescription = [
  'Socket.IO tai /socket.io, handshake auth.token = access JWT (sai / thieu → UNAUTHORIZED).',
  'Client → server (co ack { ok, data | error }): battle:join { battleId } · battle:action { battleId, clientActionId, expectedVersion, action } · alliance:join · alliance:message { body }.',
  'Server → client: notification · presence { userId, online } · battle:update { battleId, version, phase } · pvp:matched · pvp:room · pvp:queue · alliance:message · alliance:members · alliance:kicked · alliance:disbanded.',
  'Gioi han: 20 su kien, hoi 8/giay moi socket (RATE_LIMIT_EXCEEDED).',
].join('\n');
