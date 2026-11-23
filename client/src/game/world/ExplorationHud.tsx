import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axialToWorld, hexDistance, hexKey, hexNeighbors, isWithinWorldBounds, explorationCost, HEX_TERRAIN_LABELS, type ApiSuccessResponse, type AxialCoord, type ExplorationState } from '@cityverse/shared';
import { httpClient, getApiErrorMessage } from '../../api/httpClient';
import { useExplorationStore } from './explorationStore';
import { useWorldViewStore } from './worldViewStore';
import { useBuildingStore } from '../buildings/buildingStore';
import { useFarmStore } from '../farming/farmStore';
import { useLivestockStore } from '../livestock/livestockStore';
import { useAquaStore } from '../aquaculture/aquaStore';

const colors = { claimed: '#8bd7a3', scanned: '#d7c491', claiming: '#ffc65d', blocked: '#d48496', hidden: '#88869e' };
const labels = { claimed: 'Đã sở hữu', scanned: 'Đã quét', claiming: 'Đang khai phá', blocked: 'Bị khóa', hidden: 'Chưa khám phá' };
export function ExplorationHud({ cityId, canEdit }: { cityId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<'directional' | 'area' | 'drone' | 'rare'>('directional');
  const [confirm, setConfirm] = useState<'scan' | 'claim' | null>(null);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const state = useExplorationStore(s => s.state);
  const scanMode = useExplorationStore(s => s.scanMode);
  const radarId = useExplorationStore(s => s.radarId);
  const selected = useWorldViewStore(s => s.selected);
  const selectedBuilding = useBuildingStore(s => s.selectedId);
  const buildings = useBuildingStore(s => s.buildings);
  const base = `/cities/${cityId}/exploration`;
  const query = useQuery({ queryKey: ['exploration', cityId], enabled: canEdit, queryFn: async () => (await httpClient.get<ApiSuccessResponse<ExplorationState>>(`${base}/map`)).data.data, refetchInterval: 2000 });
  useEffect(() => {
    useExplorationStore.setState({ active: canEdit, state: null, radarId: null, scanMode: false });
    return () => { useExplorationStore.setState({ active: false, state: null, radarId: null, scanMode: false }); };
  }, [cityId, canEdit]);
  useEffect(() => { if (query.data) useExplorationStore.setState({ state: query.data }); }, [query.data]);
  useEffect(() => {
    if (state?.radars.some(r => r.id === selectedBuilding)) useExplorationStore.setState({ radarId: selectedBuilding });
  }, [selectedBuilding, state]);
  useEffect(() => { useExplorationStore.setState({ drone: mode === 'drone' }); }, [mode]);
  const selectedRadar = state?.radars.find(r => r.id === radarId);
  const radar = selectedRadar ? { ...selectedRadar, range: selectedRadar.range + (mode === 'drone' ? 8 : 0) } : undefined;
  const known = new Map(state?.tiles.map(t => [hexKey(t.q, t.r), t]));
  const selection = selected.map(h => ({ q: h.q, r: h.r }));
  const mutate = useMutation({ mutationFn: async (kind: 'scan' | 'claim') => {
    const body = { hexes: selection, radarId: kind === 'scan' ? radarId : undefined, mode };
    const signature = JSON.stringify({ kind, ...body });
    if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
    await httpClient.post(`${base}/${kind}s`, { ...body, idempotencyKey: retry.current.key });
  }, onSuccess: async () => {
    retry.current = null; setConfirm(null); useWorldViewStore.getState().clearSelection();
    await queryClient.invalidateQueries({ queryKey: ['exploration', cityId] });
    await queryClient.invalidateQueries({ queryKey: ['buildings', cityId] });
  } });
  if (!canEdit) return null;
  const targets = new Map<string, AxialCoord>();
  // Only draw known land and its frontier; never enumerate a world's hidden hexes.
  for (const t of state?.tiles ?? []) {
    targets.set(hexKey(t.q, t.r), t);
    for (const h of hexNeighbors(t)) if (isWithinWorldBounds(h.q, h.r)) targets.set(hexKey(h.q, h.r), h);
  }
  if (scanMode && radar) for (let q = radar.q - radar.range; q <= radar.q + radar.range; q++) for (let r = radar.r - radar.range; r <= radar.r + radar.range; r++) {
    const h = { q, r };
    if (hexDistance(radar, h) <= radar.range && isWithinWorldBounds(q, r)) targets.set(hexKey(q, r), h);
  }
  const points = [...targets.values()].map(h => ({ ...h, ...axialToWorld(h.q, h.r) }));
  const center = radar ? axialToWorld(radar.q, radar.r) : points[0] ?? { x: 0, z: 0 };
  const span = expanded ? 1000 : 310;
  const cost = explorationCost(confirm ?? 'scan', selection.length, mode);
  const activateScan = () => {
    useBuildingStore.getState().cancelPlacing(); useFarmStore.getState().cancelDraft(); useLivestockStore.getState().cancelDraft(); useAquaStore.getState().cancelDraft();
    useExplorationStore.setState({ scanMode: !scanMode }); useWorldViewStore.getState().setMode('build');
  };
  return <aside style={{ position: 'absolute', top: 75, right: 16, zIndex: 25, width: expanded && !collapsed ? 'min(620px, 85vw)' : 290, maxHeight: '80vh', overflow: 'auto', padding: 12, borderRadius: 18, background: '#f6efdfed', color: '#3b3a52', boxShadow: '0 6px 28px #3333' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <strong>◎ Khám phá lãnh địa</strong>
      <button type="button" className="cv-cozy-hud-btn" data-testid="toggle-exploration-panel" aria-expanded={!collapsed} aria-controls="exploration-panel-content" title={collapsed ? 'Mở bảng khám phá lãnh địa' : 'Thu nhỏ bảng khám phá lãnh địa'} onClick={() => setCollapsed(value => !value)}>
        {collapsed ? 'Mở rộng' : 'Thu nhỏ'}
      </button>
    </div>
    {collapsed && !!state?.jobs.length && <small>{state.jobs.length} tác vụ đang thực hiện</small>}
    <div id="exploration-panel-content" hidden={collapsed}>
    <button type="button" onClick={() => setExpanded(!expanded)} style={{ marginTop: 8 }}>{expanded ? 'Mini-map' : 'World map'}</button>
    {query.isError && <p role="alert">{getApiErrorMessage(query.error, 'Không tải được bản đồ.')} <button onClick={() => void query.refetch()}>Thử lại</button></p>}
    <svg role="img" aria-label="Bản đồ lãnh địa; nhấp để chọn ô và di chuyển camera" viewBox={`${expanded ? -500 : center.x - span / 2} ${expanded ? -500 : center.z - span / 2} ${span} ${span}`} style={{ width: '100%', background: '#88869e', borderRadius: 12, marginTop: 8 }}>
      {points.map(h => {
        const tile = known.get(hexKey(h.q, h.r));
        const inRange = radar && hexDistance(radar, h) <= radar.range;
        return <circle key={hexKey(h.q, h.r)} cx={h.x} cy={h.z} r={4.8} fill={tile?.terrain === 'lake' || tile?.terrain === 'river' ? '#83bcd9' : tile?.terrain === 'forest' ? '#4d966e' : tile?.terrain === 'ruins' ? '#be91bb' : colors[tile?.status ?? 'hidden']} stroke={selection.some(s => s.q === h.q && s.r === h.r) ? '#fff' : scanMode && inRange ? '#9ef7ee' : tile?.status === 'claimed' ? '#d3ffb7' : 'none'} strokeWidth={1.2} onClick={e => {
          useWorldViewStore.getState().issueCameraCommand({ type: 'focus', x: h.x, z: h.z });
          useWorldViewStore.getState().selectHex({ q: h.q, r: h.r, key: hexKey(h.q, h.r), type: tile?.terrain ?? 'dirt', height: 0, slope: 0, buildable: tile?.status === 'claimed', owned: tile?.status === 'claimed', chunkX: 0, chunkZ: 0 }, e.shiftKey);
        }}><title>{labels[tile?.status ?? 'hidden']}{tile?.terrain ? ` · ${HEX_TERRAIN_LABELS[tile.terrain]}` : ''}{tile?.poi ? ` · ${tile.poi}` : ''}{tile?.reason ? ` · ${tile.reason}` : ''}</title></circle>;
      })}
      {buildings.map(b => { const p = axialToWorld(b.anchorQ, b.anchorR); return <rect key={b.id} x={p.x - 3} y={p.z - 3} width={6} height={6} fill={b.typeCode === 'radar' ? '#6b4ab4' : '#fff4b6'}><title>{b.typeCode}</title></rect>; })}
    </svg>
    <small>Xanh: sở hữu · vàng: đã quét · tím: chưa biết · hồng: khóa. Shift + nhấp để chọn nhiều ô.</small>
    <select aria-label="Trạm radar" value={radarId ?? ''} onChange={e => useExplorationStore.setState({ radarId: e.target.value || null })} style={{ width: '100%', marginTop: 8 }}><option value="">Chọn trạm radar</option>{state?.radars.map(r => <option key={r.id} value={r.id}>Radar cấp {r.level} · ({r.q}, {r.r}) · {r.range} hex</option>)}</select>
    {!state?.radars.length && <p>Xây trạm radar trong Build Mode để bắt đầu quét.</p>}
    <button disabled={!radar} onClick={activateScan}>{scanMode ? 'Tắt Scan Mode' : 'Bật Scan Mode'}</button>
    <select aria-label="Chế độ quét" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>{(['directional', 'area', 'drone', 'rare'] as const).map((m, i) => <option key={m} value={m} disabled={!radar || radar.level < [1, 2, 3, 3][i]}>{['Định hướng', 'Diện rộng', 'Drone', 'Tài nguyên hiếm'][i]}</option>)}</select>
    <p>{selection.length} ô được chọn · chỉ đất sở hữu mới được xây.</p>
    {selection.slice(0, 3).map(h => { const t = known.get(hexKey(h.q, h.r)); return <div key={hexKey(h.q, h.r)}><small>({h.q}, {h.r}): {labels[t?.status ?? 'hidden']} {t?.reason ?? t?.poi}</small></div>; })}
    <button disabled={!scanMode || !radar || !selection.length || selection.length > 19} onClick={() => setConfirm('scan')}>Quét ô đã chọn</button>
    <button disabled={!selection.length || selection.length > 19 || selection.some(h => known.get(hexKey(h.q, h.r))?.status !== 'scanned')} onClick={() => setConfirm('claim')}>Khai phá</button>
    <button onClick={() => { useExplorationStore.setState({ scanMode: false }); useWorldViewStore.getState().setMode('build'); }}>Build Mode</button>
    {confirm && <div role="dialog" aria-label="Xác nhận chi phí"><p>{confirm === 'scan' ? 'Quét' : 'Khai phá'}: {cost.coins} xu · {cost.wood} gỗ · {cost.stone} đá · {confirm === 'scan' ? 10 : 20} giây</p><button disabled={mutate.isPending} onClick={() => mutate.mutate(confirm)}>Xác nhận</button><button disabled={mutate.isPending} onClick={() => setConfirm(null)}>Hủy</button></div>}
    {mutate.isError && <p role="alert">{getApiErrorMessage(mutate.error, 'Không thực hiện được yêu cầu.')}</p>}
    {state?.jobs.map(j => <p key={j.id}>◌ {j.kind === 'scan' ? 'Đang quét' : 'Đang khai phá'} {j.hexes.length} ô · còn {Math.max(0, Math.ceil((Date.parse(j.finishesAt) - Date.parse(state.serverTime)) / 1000))}s</p>)}
    </div>
  </aside>;
}
