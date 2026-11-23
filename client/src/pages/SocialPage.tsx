/**
 * Phase 12 social hub: friends & visits, notifications, PvP arena (queue, rooms, ranking,
 * history), alliance (members, roles, chat, quests) and settings (world visibility, audio
 * channels, graphics quality, weather). Every action goes to the server; this page only
 * shows what the server returns and listens to realtime pushes to refresh.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Checkbox, Empty, Input, InputNumber, List, Popconfirm, Segmented, Select, Slider, Space, Switch, Tabs, Tag, Typography, message } from 'antd';
import {
  ALLIANCE_LIMITS,
  WORLD_VISIBILITY_LABELS,
  type AllianceMessageDTO,
  type BattleCandidateDTO,
  type NotificationDTO,
  type UserSummaryDTO,
  type WorldVisibility,
} from '@cityverse/shared';
import { battleApi } from '../api/battle.api';
import { allianceApi, pvpApi, socialApi, socialErrorMessage } from '../api/social.api';
import { AUDIO_CHANNELS, AUDIO_CHANNEL_LABELS, audio, type AudioSettings } from '../audio/AudioManager';
import { AppLayout } from '../components/AppLayout';
import { QUALITY_LABELS, type QualityLevel } from '../game/world/qualitySettings';
import { WEATHER_LABELS, type WeatherKind, type WeatherMode } from '../game/world/weather';
import { useWorldViewStore } from '../game/world/worldViewStore';
import { onRealtime } from '../realtime/socket';
import { useGameStore } from '../stores/gameStore';

const { Text, Title } = Typography;

function useToast() {
  return (e: unknown) => message.error(socialErrorMessage(e));
}

function Online({ on }: { on: boolean }) {
  return <Badge status={on ? 'success' : 'default'} text={on ? 'Trực tuyến' : 'Ngoại tuyến'} />;
}

// ── Friends ──────────────────────────────────────────────────────────────────
function FriendsTab({ onDuel }: { onDuel: (u: UserSummaryDTO) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const friends = useQuery({ queryKey: ['friends'], queryFn: socialApi.friends });
  const [term, setTerm] = useState('');
  const search = useQuery({ queryKey: ['user-search', term], queryFn: () => socialApi.search(term), enabled: term.trim().length >= 2 });
  const set = (d: Awaited<ReturnType<typeof socialApi.friends>>) => qc.setQueryData(['friends'], d);
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: (d) => {
      if (d && typeof d === 'object' && 'friends' in d) set(d as Awaited<ReturnType<typeof socialApi.friends>>);
      void qc.invalidateQueries({ queryKey: ['user-search'] });
    },
    onError: toast,
  });
  useEffect(() => onRealtime('presence', () => void qc.invalidateQueries({ queryKey: ['friends'] })), [qc]);
  const f = friends.data;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title="Tìm người chơi" size="small">
        <Input.Search placeholder="Tên người chơi (ít nhất 2 ký tự)" allowClear onSearch={setTerm} data-testid="friend-search" maxLength={24} />
        {search.data && (
          <List
            size="small"
            dataSource={search.data.items}
            locale={{ emptyText: 'Không tìm thấy' }}
            renderItem={(u) => (
              <List.Item
                actions={[
                  u.friendship === 'none' && (
                    <Button key="add" size="small" type="primary" onClick={() => act.mutate(() => socialApi.request(u.id))}>
                      Kết bạn
                    </Button>
                  ),
                  u.friendship === 'pending_out' && <Tag key="p">Đã gửi lời mời</Tag>,
                  u.friendship === 'pending_in' && (
                    <Button key="acc" size="small" onClick={() => act.mutate(() => socialApi.request(u.id))}>
                      Chấp nhận
                    </Button>
                  ),
                  u.friendship === 'friends' && <Tag key="f" color="green">Bạn bè</Tag>,
                  u.canVisit && u.cityId && (
                    <Button key="v" size="small" onClick={() => navigate(`/game/${u.cityId}`)}>
                      Ghé thăm
                    </Button>
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta title={u.displayName} description={<>@{u.username} · <Online on={u.online} /></>} />
              </List.Item>
            )}
          />
        )}
      </Card>

      {f && f.incoming.length > 0 && (
        <Card title={`Lời mời kết bạn (${f.incoming.length})`} size="small">
          <List
            size="small"
            dataSource={f.incoming}
            renderItem={(r) => (
              <List.Item
                actions={[
                  <Button key="y" type="primary" size="small" onClick={() => act.mutate(() => socialApi.respond(r.id, true))} data-testid="accept-friend">
                    Đồng ý
                  </Button>,
                  <Button key="n" size="small" onClick={() => act.mutate(() => socialApi.respond(r.id, false))}>
                    Từ chối
                  </Button>,
                ]}
              >
                {r.from.displayName} (@{r.from.username})
              </List.Item>
            )}
          />
        </Card>
      )}

      <Card title={`Bạn bè (${f?.friends.length ?? 0})`} size="small" loading={friends.isLoading}>
        <List
          dataSource={f?.friends ?? []}
          locale={{ emptyText: <Empty description="Chưa có bạn bè — tìm người chơi ở trên" /> }}
          renderItem={({ user: u }) => (
            <List.Item
              data-testid="friend-row"
              actions={[
                u.canVisit && u.cityId ? (
                  <Button key="v" size="small" onClick={() => navigate(`/game/${u.cityId}`)}>
                    🏡 Ghé thăm
                  </Button>
                ) : (
                  <Tag key="nv">{u.visibility === 'private' ? 'Riêng tư' : 'Không thể ghé'}</Tag>
                ),
                <Button key="i" size="small" onClick={() => act.mutate(() => socialApi.inviteVisit(u.id).then(() => message.success('Đã gửi lời mời ghé thăm')))}>
                  Mời ghé thăm
                </Button>,
                <Button key="d" size="small" onClick={() => onDuel(u)}>
                  ⚔️ Thách đấu
                </Button>,
                <Popconfirm key="x" title="Hủy kết bạn?" onConfirm={() => act.mutate(() => socialApi.unfriend(u.id))}>
                  <Button size="small" danger>
                    Hủy
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta title={u.displayName} description={<>@{u.username} · <Online on={u.online} /> {u.cityName ? `· ${u.cityName}` : ''}</>} />
            </List.Item>
          )}
        />
        {f && f.outgoing.length > 0 && (
          <Text type="secondary">
            Đang chờ: {f.outgoing.map((r) => r.to.username).join(', ')}{' '}
            {f.outgoing.map((r) => (
              <Button key={r.id} size="small" type="link" onClick={() => act.mutate(() => socialApi.cancel(r.id))}>
                hủy {r.to.username}
              </Button>
            ))}
          </Text>
        )}
      </Card>
    </Space>
  );
}

// ── Notifications ────────────────────────────────────────────────────────────
const NOTE_TEXT: Record<NotificationDTO['kind'], (p: NotificationDTO['payload']) => string> = {
  friend_request: () => 'Có lời mời kết bạn mới',
  friend_accepted: () => 'Lời mời kết bạn đã được chấp nhận',
  visit_invite: (p) => `Bạn được mời ghé thăm ${p.cityName ?? 'một thế giới'}`,
  pvp_invite: () => 'Bạn được thách đấu PvP',
  pvp_match: () => 'Trận PvP đã bắt đầu',
  alliance_invite: (p) => `Lời mời gia nhập liên minh ${p.allianceName ?? ''}`,
  alliance_quest: (p) => `Liên minh hoàn thành nhiệm vụ: +${p.rewardCoins ?? 0} xu`,
};

function NotificationsTab() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const notes = useQuery({ queryKey: ['notifications'], queryFn: () => socialApi.notifications() });
  const [more, setMore] = useState<NotificationDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => setCursor(notes.data?.nextCursor ?? null), [notes.data]);
  const all = [...(notes.data?.items ?? []), ...more];
  const open = async (n: NotificationDTO) => {
    if (!n.readAt) await socialApi.markRead(n.id).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    const p = n.payload;
    if (n.kind === 'visit_invite' && p.cityId) navigate(`/game/${p.cityId}`);
    if (n.kind === 'pvp_match' && p.battleId) navigate(`/pvp/battle/${p.battleId}`);
  };
  return (
    <Card size="small" title="Thông báo">
      <List
        dataSource={all}
        locale={{ emptyText: 'Chưa có thông báo' }}
        renderItem={(n) => (
          <List.Item onClick={() => void open(n)} style={{ cursor: 'pointer', opacity: n.readAt ? 0.6 : 1 }}>
            <List.Item.Meta title={NOTE_TEXT[n.kind]?.(n.payload) ?? n.kind} description={new Date(n.createdAt).toLocaleString('vi-VN')} />
            {!n.readAt && <Badge status="processing" />}
          </List.Item>
        )}
      />
      {cursor && (
        <Button
          onClick={async () => {
            const page = await socialApi.notifications(cursor);
            setMore((m) => [...m, ...page.items]);
            setCursor(page.nextCursor);
          }}
        >
          Xem thêm
        </Button>
      )}
    </Card>
  );
}

// ── PvP arena ────────────────────────────────────────────────────────────────
function SquadPicker({ value, onChange, candidates }: { value: string[]; onChange: (v: string[]) => void; candidates: BattleCandidateDTO[] }) {
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {candidates.length === 0 && <Text type="secondary">Chưa có binh sĩ — tuyển và huấn luyện ở doanh trại.</Text>}
      {candidates.map((c) => (
        <Checkbox
          key={c.id}
          disabled={!c.available || (!value.includes(c.id) && value.length >= 6)}
          checked={value.includes(c.id)}
          onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((x) => x !== c.id))}
        >
          {c.name} · {c.rankName} · ⚡{c.power} {c.mounted ? '🐎' : ''} {!c.available && <Text type="secondary">({c.reason})</Text>}
        </Checkbox>
      ))}
      <Text type="secondary">Chọn 3–6 binh sĩ ({value.length} đã chọn). Lính bị thương / đang bận không thể vào đấu trường.</Text>
    </Space>
  );
}

function ArenaTab({ duelTarget, clearDuel }: { duelTarget: UserSummaryDTO | null; clearDuel: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const city = useGameStore((s) => s.city);
  const state = useQuery({ queryKey: ['pvp'], queryFn: pvpApi.state, refetchInterval: (q) => (q.state.data?.queue.queued ? 3000 : 15000) });
  const lobby = useQuery({ queryKey: ['battle-lobby', city?.id], queryFn: () => battleApi.lobby(city!.id), enabled: Boolean(city) });
  const board = useQuery({ queryKey: ['pvp-board'], queryFn: () => pvpApi.leaderboard() });
  const [squad, setSquad] = useState<string[]>([]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['pvp'] });
    void qc.invalidateQueries({ queryKey: ['battle-lobby'] });
  };
  const run = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: refresh, onError: toast });
  useEffect(() => {
    const offs = [onRealtime('pvp:matched', (d: { battleId: string }) => navigate(`/pvp/battle/${d.battleId}`)), onRealtime('pvp:room', refresh), onRealtime('pvp:queue', refresh)];
    return () => offs.forEach((o) => o());
  });
  const s = state.data;
  const cands = lobby.data?.candidates ?? [];
  const sq = squad.filter((id) => cands.some((c) => c.id === id && c.available));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {s && (
        <Card size="small" title={`🏟 ${s.profile.seasonName} · kết thúc ${new Date(s.profile.seasonEndsAt).toLocaleDateString('vi-VN')}`}>
          <Space size="large" wrap>
            <Title level={3} style={{ margin: 0 }} data-testid="pvp-rating">
              {s.profile.rating}
            </Title>
            <Tag color="gold">{s.profile.tier}</Tag>
            <span>
              {s.profile.wins} thắng · {s.profile.losses} thua · {s.profile.draws} hòa
            </span>
            {s.profile.rank && <span>Hạng #{s.profile.rank}</span>}
          </Space>
          {s.activeBattleId && (
            <p>
              <Button type="primary" onClick={() => navigate(`/pvp/battle/${s.activeBattleId}`)} data-testid="resume-pvp">
                ▶ Tiếp tục trận đang đấu
              </Button>
            </p>
          )}
        </Card>
      )}

      <Card size="small" title="Đội hình">
        <SquadPicker value={sq} onChange={setSquad} candidates={cands} />
        <Space style={{ marginTop: 12 }} wrap>
          {s?.queue.queued ? (
            <>
              <Tag color="processing">Đang tìm đối thủ… (từ {new Date(s.queue.since!).toLocaleTimeString('vi-VN')})</Tag>
              <Button onClick={() => run.mutate(pvpApi.leaveQueue)}>Rời hàng chờ</Button>
            </>
          ) : (
            <Button type="primary" disabled={sq.length < 3 || Boolean(s?.activeBattleId)} onClick={() => run.mutate(() => pvpApi.enqueue(sq))} data-testid="join-queue">
              🎯 Tìm trận xếp hạng
            </Button>
          )}
          {duelTarget && (
            <Button
              disabled={Boolean(s?.activeBattleId)}
              onClick={() =>
                run.mutate(async () => {
                  await pvpApi.createRoom(duelTarget.id);
                  clearDuel();
                  message.success(`Đã thách đấu ${duelTarget.username}`);
                })
              }
            >
              ⚔️ Thách đấu giao hữu {duelTarget.username}
            </Button>
          )}
        </Space>
        <p>
          <Text type="secondary">Ghép theo điểm Elo và sức mạnh đội hình; tân thủ không bị ghép với đội quá mạnh khi còn lựa chọn khác.</Text>
        </p>
      </Card>

      {s && s.rooms.length > 0 && (
        <Card size="small" title="Phòng đấu giao hữu">
          <List
            dataSource={s.rooms}
            renderItem={(r) => {
              const host = r.host.friendship === 'self';
              const invitedMe = !host && !r.guest;
              const mine = host ? r.hostReady : r.guestReady;
              return (
                <List.Item
                  actions={[
                    invitedMe && (
                      <Button key="j" type="primary" size="small" onClick={() => run.mutate(() => pvpApi.joinRoom(r.id))} data-testid="join-room">
                        Nhận lời
                      </Button>
                    ),
                    r.status === 'selecting' && !mine && (
                      <Button key="r" size="small" disabled={sq.length < 3} onClick={() => run.mutate(() => pvpApi.roster(r.id, sq))}>
                        Chốt đội hình
                      </Button>
                    ),
                    <Button key="c" size="small" onClick={() => run.mutate(() => pvpApi.cancelRoom(r.id))}>
                      Hủy
                    </Button>,
                  ].filter(Boolean)}
                >
                  {r.host.username} vs {r.guest?.username ?? '…'} · {r.status === 'waiting' ? 'chờ đối thủ' : `chọn đội (${r.hostReady ? '✔' : '…'} / ${r.guestReady ? '✔' : '…'})`} · hết hạn{' '}
                  {new Date(r.expiresAt).toLocaleTimeString('vi-VN')}
                </List.Item>
              );
            }}
          />
        </Card>
      )}

      <Card size="small" title="Bảng xếp hạng">
        <List
          size="small"
          dataSource={board.data?.items ?? []}
          locale={{ emptyText: 'Chưa có trận xếp hạng nào trong mùa' }}
          renderItem={(e) => (
            <List.Item>
              #{e.rank} <strong>{e.username}</strong> · {e.rating} ({e.tier}) · {e.wins}-{e.losses}
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title="Lịch sử">
        <List
          size="small"
          dataSource={s?.history ?? []}
          locale={{ emptyText: 'Chưa có trận' }}
          renderItem={(m) => (
            <List.Item>
              <Tag color={m.result === 'win' ? 'green' : m.result === 'loss' ? 'red' : 'default'}>{m.result === 'win' ? 'Thắng' : m.result === 'loss' ? 'Thua' : 'Hòa'}</Tag> vs {m.opponent.username} · {m.ratingBefore} → {m.ratingAfter} ·{' '}
              {m.reason.startsWith('friendly') ? 'giao hữu' : 'xếp hạng'} · {new Date(m.endedAt).toLocaleString('vi-VN')}
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}

// ── Alliance ─────────────────────────────────────────────────────────────────
function AllianceTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const st = useQuery({ queryKey: ['alliance'], queryFn: allianceApi.state });
  const msgs = useQuery({ queryKey: ['alliance-messages'], queryFn: () => allianceApi.messages(), enabled: Boolean(st.data?.alliance) });
  const [live, setLive] = useState<AllianceMessageDTO[]>([]);
  const [draft, setDraft] = useState('');
  const [form, setForm] = useState({ name: '', tag: '', description: '' });
  const [inviteName, setInviteName] = useState('');
  const [donate, setDonate] = useState<Record<string, number>>({});
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: (d) => {
      if (d && typeof d === 'object' && 'members' in d) qc.setQueryData(['alliance'], d);
      else void qc.invalidateQueries({ queryKey: ['alliance'] });
    },
    onError: toast,
  });
  useEffect(() => {
    const offs = [
      onRealtime<AllianceMessageDTO>('alliance:message', (m) => setLive((l) => (l.some((x) => x.id === m.id) ? l : [m, ...l]))),
      onRealtime('alliance:members', () => void qc.invalidateQueries({ queryKey: ['alliance'] })),
      onRealtime('alliance:kicked', () => void qc.invalidateQueries({ queryKey: ['alliance'] })),
      onRealtime('alliance:disbanded', () => void qc.invalidateQueries({ queryKey: ['alliance'] })),
    ];
    return () => offs.forEach((o) => o());
  }, [qc]);
  useEffect(() => {
    if (st.data?.alliance) void import('../realtime/socket').then((m) => m.emitRealtime('alliance:join', {}).catch(() => undefined));
  }, [st.data?.alliance]);
  const feed = useMemo(() => {
    const seen = new Set<string>();
    return [...live, ...(msgs.data?.items ?? [])].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [live, msgs.data]);
  const s = st.data;

  if (!s) return <Card loading />;
  if (!s.alliance) {
    return (
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {s.invites.length > 0 && (
          <Card size="small" title="Lời mời gia nhập">
            <List
              dataSource={s.invites}
              renderItem={(i) => (
                <List.Item
                  actions={[
                    <Button key="y" type="primary" size="small" onClick={() => run.mutate(() => allianceApi.respond(i.id, true))}>
                      Gia nhập
                    </Button>,
                    <Button key="n" size="small" onClick={() => run.mutate(() => allianceApi.respond(i.id, false))}>
                      Từ chối
                    </Button>,
                  ]}
                >
                  [{i.alliance.tag}] {i.alliance.name} · {i.alliance.memberCount} thành viên · mời bởi {i.invitedBy}
                </List.Item>
              )}
            />
          </Card>
        )}
        <Card size="small" title={`Lập liên minh (${ALLIANCE_LIMITS.createCost} xu)`}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input placeholder="Tên (3–24 ký tự)" maxLength={24} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Tag (2–5 chữ / số)" maxLength={5} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })} />
            <Input.TextArea placeholder="Giới thiệu" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Button type="primary" disabled={form.name.trim().length < 3 || !/^[A-Z0-9]{2,5}$/.test(form.tag)} onClick={() => run.mutate(() => allianceApi.create(form.name, form.tag, form.description))}>
              Lập liên minh
            </Button>
          </Space>
        </Card>
      </Space>
    );
  }

  const a = s.alliance;
  const can = (p: string) => s.me?.permissions.includes(p as never);
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card size="small" title={`[${a.tag}] ${a.name}`} extra={<Tag>{s.me?.role === 'leader' ? 'Thủ lĩnh' : s.me?.role === 'officer' ? 'Sĩ quan' : 'Thành viên'}</Tag>}>
        <p>{a.description || <Text type="secondary">Chưa có giới thiệu</Text>}</p>
        <Space wrap>
          {can('invite') && (
            <>
              <Input placeholder="Tên người chơi để mời" value={inviteName} onChange={(e) => setInviteName(e.target.value)} style={{ width: 220 }} maxLength={24} />
              <Button
                onClick={() =>
                  run.mutate(async () => {
                    const found = (await socialApi.search(inviteName)).items.find((u) => u.username.toLowerCase() === inviteName.trim().toLowerCase());
                    if (!found) throw new Error('Không tìm thấy người chơi');
                    await allianceApi.invite(found.id);
                    message.success(`Đã mời ${found.username}`);
                  })
                }
              >
                Mời
              </Button>
            </>
          )}
          {s.me?.role !== 'leader' && (
            <Popconfirm title="Rời liên minh?" onConfirm={() => run.mutate(allianceApi.leave)}>
              <Button>Rời liên minh</Button>
            </Popconfirm>
          )}
          {can('disband') && (
            <Popconfirm title="Giải tán liên minh? Không thể hoàn tác." onConfirm={() => run.mutate(allianceApi.disband)}>
              <Button danger>Giải tán</Button>
            </Popconfirm>
          )}
        </Space>
      </Card>

      <Card size="small" title="Nhiệm vụ chung (7 ngày)">
        <List
          dataSource={s.quests}
          renderItem={(q) => (
            <List.Item
              actions={
                q.status === 'active' && q.code !== 'pve_wins'
                  ? [
                      <InputNumber key="n" min={1} max={5000} value={donate[q.id] ?? 100} onChange={(v) => setDonate({ ...donate, [q.id]: Number(v) || 1 })} />,
                      <Button key="d" size="small" onClick={() => run.mutate(() => allianceApi.donate(q.id, donate[q.id] ?? 100))}>
                        Góp
                      </Button>,
                    ]
                  : []
              }
            >
              <List.Item.Meta
                title={
                  <>
                    {q.name} {q.status === 'completed' && <Tag color="green">Hoàn thành</Tag>}
                  </>
                }
                description={`${q.description} · ${q.progress}/${q.target} · thưởng ${q.rewardCoins} xu / người · hết hạn ${new Date(q.endsAt).toLocaleDateString('vi-VN')}`}
              />
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title={`Thành viên (${s.members.length}/${ALLIANCE_LIMITS.maxMembers})`}>
        <List
          dataSource={s.members}
          renderItem={(m) => (
            <List.Item
              actions={
                m.user.friendship === 'self'
                  ? []
                  : [
                      s.me?.role === 'leader' && m.role !== 'leader' && (
                        <Button key="r" size="small" onClick={() => run.mutate(() => allianceApi.setRole(m.user.id, m.role === 'officer' ? 'member' : 'officer'))}>
                          {m.role === 'officer' ? 'Giáng chức' : 'Thăng sĩ quan'}
                        </Button>
                      ),
                      s.me?.role === 'leader' && (
                        <Popconfirm key="t" title={`Chuyển thủ lĩnh cho ${m.user.username}?`} onConfirm={() => run.mutate(() => allianceApi.transfer(m.user.id))}>
                          <Button size="small">Chuyển giao</Button>
                        </Popconfirm>
                      ),
                      can('kick') && m.role !== 'leader' && !(s.me?.role === 'officer' && m.role === 'officer') && (
                        <Popconfirm key="k" title={`Mời ${m.user.username} ra?`} onConfirm={() => run.mutate(() => allianceApi.kick(m.user.id))}>
                          <Button size="small" danger>
                            Mời ra
                          </Button>
                        </Popconfirm>
                      ),
                    ].filter(Boolean)
              }
            >
              <List.Item.Meta title={`${m.user.displayName} · ${m.roleName}`} description={<>@{m.user.username} · <Online on={m.user.online} /> · góp {m.contribution}</>} />
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title="Kênh liên minh">
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={draft}
            maxLength={ALLIANCE_LIMITS.messageMax}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={() => draft.trim() && run.mutate(() => allianceApi.post(draft).then((m) => (setLive((l) => [m, ...l]), setDraft(''))))}
            placeholder="Nhắn cho liên minh…"
            data-testid="alliance-chat-input"
          />
          <Button type="primary" disabled={!draft.trim()} onClick={() => run.mutate(() => allianceApi.post(draft).then((m) => (setLive((l) => [m, ...l]), setDraft(''))))}>
            Gửi
          </Button>
        </Space.Compact>
        <List
          size="small"
          dataSource={feed}
          style={{ maxHeight: 320, overflow: 'auto', marginTop: 8 }}
          renderItem={(m) => (
            <List.Item>
              <Text strong>{m.username}</Text>: {m.body} <Text type="secondary" style={{ fontSize: 11 }}>{new Date(m.createdAt).toLocaleTimeString('vi-VN')}</Text>
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────
function SettingsTab() {
  const city = useGameStore((s) => s.city);
  const setCity = useGameStore((s) => s.setCity);
  const toast = useToast();
  const [a, setA] = useState<AudioSettings>(audio.current);
  useEffect(() => audio.subscribe(setA), []);
  const quality = useWorldViewStore((s) => s.quality);
  const weatherMode = useWorldViewStore((s) => s.weatherMode);
  const vis = useMutation({ mutationFn: (v: WorldVisibility) => socialApi.setVisibility(city!.id, v), onSuccess: (c) => (setCity(c), message.success('Đã lưu')), onError: toast });

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {city && (
        <Card size="small" title="Ai được ghé thăm thế giới của tôi?">
          <Segmented
            value={city.visibility}
            onChange={(v) => vis.mutate(v as WorldVisibility)}
            options={(['public', 'friends', 'private'] as WorldVisibility[]).map((v) => ({ value: v, label: WORLD_VISIBILITY_LABELS[v] }))}
            data-testid="visibility"
          />
          <p>
            <Text type="secondary">Khách ghé thăm chỉ được xem — không ai ngoài bạn sửa được thế giới.</Text>
          </p>
        </Card>
      )}
      <Card size="small" title="Âm thanh" extra={<Switch checked={!a.muted} onChange={(on) => audio.update((s) => (s.muted = !on))} checkedChildren="Bật" unCheckedChildren="Tắt" />}>
        <div>
          Tổng <Slider min={0} max={1} step={0.05} value={a.master} onChange={(v) => audio.update((s) => (s.master = v))} />
        </div>
        {AUDIO_CHANNELS.map((c) => (
          <div key={c} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', alignItems: 'center', gap: 8 }}>
            <span>{AUDIO_CHANNEL_LABELS[c]}</span>
            <Slider min={0} max={1} step={0.05} value={a.channels[c].volume} disabled={a.channels[c].muted} onChange={(v) => audio.update((s) => (s.channels[c].volume = v))} />
            <Checkbox checked={!a.channels[c].muted} onChange={(e) => audio.update((s) => (s.channels[c].muted = !e.target.checked))} />
          </div>
        ))}
        <Text type="secondary">Mọi âm thanh được tổng hợp trực tiếp bằng WebAudio (không dùng file âm thanh bên ngoài).</Text>
      </Card>
      <Card size="small" title="Đồ họa">
        <Space direction="vertical">
          <Segmented value={quality} onChange={(v) => useWorldViewStore.getState().setQuality(v as QualityLevel)} options={(['low', 'medium', 'high'] as QualityLevel[]).map((q) => ({ value: q, label: QUALITY_LABELS[q] }))} />
          <span>
            Thời tiết:{' '}
            <Select<WeatherMode>
              value={weatherMode}
              style={{ width: 160 }}
              onChange={(v) => useWorldViewStore.getState().setWeatherMode(v)}
              options={[{ value: 'auto', label: 'Tự động' }, ...(Object.keys(WEATHER_LABELS) as WeatherKind[]).map((k) => ({ value: k, label: WEATHER_LABELS[k] }))]}
            />
          </span>
          <Text type="secondary">Đo FPS thật: vào thế giới → phím P → “Đo hiệu năng 20 s”.</Text>
        </Space>
      </Card>
    </Space>
  );
}

export function SocialPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'friends';
  const [duel, setDuel] = useState<UserSummaryDTO | null>(null);
  const city = useGameStore((s) => s.city);
  const unread = useQuery({ queryKey: ['notifications'], queryFn: () => socialApi.notifications() });
  const qc = useQueryClient();
  const first = useRef(true);
  useEffect(
    () =>
      onRealtime('notification', () => {
        void qc.invalidateQueries({ queryKey: ['notifications'] });
        void qc.invalidateQueries({ queryKey: ['friends'] });
        void qc.invalidateQueries({ queryKey: ['alliance'] });
        void qc.invalidateQueries({ queryKey: ['pvp'] });
        if (!first.current) audio.play('notify');
        first.current = false;
      }),
    [qc]
  );
  const n = unread.data?.items.filter((x) => !x.readAt).length ?? 0;
  const go = (k: string) => setParams({ tab: k });

  return (
    <AppLayout>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: 16 }} data-testid="social-page">
        <Space style={{ marginBottom: 8 }}>
          {city && <Link to={`/game/${city.id}`}>← Về thế giới</Link>}
          <Link to="/dashboard">Bảng điều khiển</Link>
        </Space>
        <Tabs
          activeKey={tab}
          onChange={go}
          items={[
            { key: 'friends', label: '👥 Bạn bè', children: <FriendsTab onDuel={(u) => (setDuel(u), go('pvp'))} /> },
            { key: 'notifications', label: <Badge count={n} size="small" offset={[8, 0]}>🔔 Thông báo</Badge>, children: <NotificationsTab /> },
            { key: 'pvp', label: '⚔️ Đấu trường', children: <ArenaTab duelTarget={duel} clearDuel={() => setDuel(null)} /> },
            { key: 'alliance', label: '🛡 Liên minh', children: <AllianceTab /> },
            { key: 'settings', label: '⚙️ Cài đặt', children: <SettingsTab /> },
          ]}
        />
      </div>
    </AppLayout>
  );
}
