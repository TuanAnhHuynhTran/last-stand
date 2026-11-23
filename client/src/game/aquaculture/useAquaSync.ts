import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getFishFeed,
  getFishSpecies,
  getWaterBodyDefinition,
  getWaterBodyLevel,
  type AquacultureMutationResultDTO,
} from '@cityverse/shared';
import { aquacultureApi, aquacultureErrorMessage } from '../../api/aquaculture.api';
import { useBuildingStore } from '../buildings/buildingStore';
import { useFarmStore } from '../farming/farmStore';
import { useAquaStore } from './aquaStore';

const OPEN_SYNC_MS = 5000;

const harvestText = (h: Record<string, number> | undefined): string =>
  Object.entries(h ?? {})
    .map(([code, n]) => {
      const [kind, species] = code.split('_') as ['fish' | 'fry', 'carp'];
      return kind === 'fry' ? `${n} cá giống ${getFishSpecies(species).name.toLowerCase()}` : `${n} kg ${getFishSpecies(species).name.toLowerCase()}`;
    })
    .join(', ');

/**
 * Keeps the aquaculture store in sync. The server simulates water and fish from timestamps;
 * the list polls faster while something is running and the open pond re-syncs every few seconds.
 */
export function useAquaSync(cityId: string, canEdit: boolean): void {
  const queryClient = useQueryClient();
  const selectedId = useAquaStore((s) => s.selectedId);

  const query = useQuery({
    queryKey: ['aquaculture', cityId],
    queryFn: () => aquacultureApi.list(cityId),
    refetchInterval: (q) =>
      q.state.data?.waterBodies.some((b) => b.status === 'upgrading' || b.status === 'filling' || b.batches.length > 0) ? 6000 : 20000,
    retry: false,
  });

  useEffect(() => {
    if (!query.data) return;
    useAquaStore.getState().applyServerState(query.data);
    useBuildingStore.getState().applyResources(query.data.resources, query.data.serverTime);
    useFarmStore.getState().applyProduce(query.data.produce, query.data.serverTime);
  }, [query.data]);

  useEffect(() => {
    if (query.error) useBuildingStore.getState().setError(aquacultureErrorMessage(query.error));
  }, [query.error]);

  // Opening a pond → its status synced to now, refreshed while open.
  useEffect(() => {
    if (!selectedId) return undefined;
    let alive = true;
    const pull = async (): Promise<void> => {
      try {
        const res = await aquacultureApi.get(cityId, selectedId);
        if (alive && res.waterBody) useAquaStore.getState().applyBody(res.waterBody);
      } catch {
        /* the list query reports errors */
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), OPEN_SYNC_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [cityId, selectedId]);

  useEffect(() => {
    const run = async (fn: () => Promise<AquacultureMutationResultDTO>, ok: (r: AquacultureMutationResultDTO) => string): Promise<AquacultureMutationResultDTO | null> => {
      const s = useAquaStore.getState();
      if (s.busy || !canEdit) return null;
      s.setBusy(true);
      useBuildingStore.getState().setError(null);
      try {
        const res = await fn();
        const store = useAquaStore.getState();
        store.applyFish(res.fish, res.serverTime);
        if (res.waterBody) store.applyBody(res.waterBody);
        useFarmStore.getState().applyProduce(res.produce, res.serverTime);
        useBuildingStore.getState().applyResources(res.resources, res.serverTime);
        await queryClient.invalidateQueries({ queryKey: ['aquaculture', cityId] });
        useBuildingStore.getState().setNotice(ok(res));
        if (res.waterBody) store.select(res.waterBody.id);
        return res;
      } catch (err) {
        useBuildingStore.getState().setError(aquacultureErrorMessage(err));
        return null;
      } finally {
        useAquaStore.getState().setBusy(false);
      }
    };

    useAquaStore.getState().setHandlers({
      commitDraft: () => {
        const { draft, draftCheck } = useAquaStore.getState();
        if (!draft) return;
        const def = getWaterBodyDefinition(draft.type);
        if (!draftCheck?.valid) {
          useBuildingStore.getState().setError(`Vùng chưa hợp lệ — ${def.name} cần tối thiểu ${def.minHexes} ô liền nhau.`);
          return;
        }
        const call = draft.expandId
          ? () => aquacultureApi.expand(cityId, draft.expandId!, draft.hexes)
          : () => aquacultureApi.create(cityId, { type: draft.type, hexes: draft.hexes });
        const msg = draft.expandId ? `Đã mở rộng ${def.name} thêm ${draft.hexes.length} ô — bờ ao được tạo lại!` : `Đã đào ${def.name} (${draft.hexes.length} ô)!`;
        void run(call, () => msg).then((r) => {
          if (r) useAquaStore.getState().cancelDraft();
        });
      },
      fill: (id) => void run(() => aquacultureApi.fill(cityId, id), () => 'Đang bơm nước vào ao…'),
      stock: (id, species, count, source) =>
        void run(
          () => aquacultureApi.stock(cityId, id, { species, count, source }),
          () => `Đã thả ${count} ${getFishSpecies(species).name.toLowerCase()} ${source === 'hatchery' ? 'từ khu ươm' : 'giống'}!`
        ),
      feed: (id, feed, batches) => {
        void run(() => aquacultureApi.feed(cityId, id, { feedCode: feed, batches }), () => `Đã rải ${getFishFeed(feed).kg * batches} kg ${getFishFeed(feed).name.toLowerCase()}!`).then((r) => {
          if (r) useAquaStore.getState().triggerFeedFx(id);
        });
      },
      harvest: (id) => void run(() => aquacultureApi.harvest(cityId, id), (r) => `Thu hoạch: ${harvestText(r.harvested)} — đã nhập kho!`),
      upgrade: (id) => {
        const b = useAquaStore.getState().bodies.find((x) => x.id === id);
        const next = b ? getWaterBodyLevel(b.type, b.level + 1) : null;
        void run(() => aquacultureApi.upgrade(cityId, id), () => (next ? `Bắt đầu nâng cấp: ${next.name}` : 'Đang nâng cấp'));
      },
      remove: (id) =>
        void run(async () => {
          const res = await aquacultureApi.remove(cityId, id);
          useAquaStore.getState().removeBody(id);
          return res;
        }, () => 'Đã lấp ao, địa hình trở lại như cũ.'),
    });
    return () => useAquaStore.getState().reset();
  }, [cityId, canEdit, queryClient]);
}
