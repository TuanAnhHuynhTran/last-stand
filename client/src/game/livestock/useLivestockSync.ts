import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LIVESTOCK_PRODUCT_LABELS,
  getAnimalBreed,
  getAnimalDefinition,
  getFeedRecipe,
  getLivestockFarmDefinition,
  getLivestockLevel,
  type LivestockMutationResultDTO,
  type LivestockProductCode,
  type ProductAmounts,
} from '@cityverse/shared';
import { livestockApi, livestockErrorMessage } from '../../api/livestock.api';
import { useBuildingStore } from '../buildings/buildingStore';
import { useFarmStore } from '../farming/farmStore';
import { useLivestockStore } from './livestockStore';

/** While a farm is open its herd status is re-synced this often (server simulates to "now"). */
const OPEN_FARM_SYNC_MS = 5000;

const productList = (p: ProductAmounts | undefined): string =>
  Object.entries(p ?? {})
    .map(([c, n]) => `${n} ${LIVESTOCK_PRODUCT_LABELS[c as LivestockProductCode].toLowerCase()}`)
    .join(', ');

/**
 * Keeps the livestock store in sync with the API. The backend simulates farms from server
 * timestamps; the client only animates. The list polls while an upgrade / batch / breeding
 * job is running, and the selected farm is re-synced when opened and every few seconds.
 */
export function useLivestockSync(cityId: string, canEdit: boolean): void {
  const queryClient = useQueryClient();
  const selectedFarmId = useLivestockStore((s) => s.selectedFarmId);

  const query = useQuery({
    queryKey: ['livestock', cityId],
    queryFn: () => livestockApi.list(cityId),
    refetchInterval: (q) =>
      q.state.data?.farms.some((f) => f.status === 'upgrading' || f.jobs.some((j) => j.status === 'in_progress')) ? 4000 : 20000,
    retry: false,
  });

  useEffect(() => {
    if (!query.data) return;
    useLivestockStore.getState().applyServerState(query.data);
    useBuildingStore.getState().applyResources(query.data.resources, query.data.serverTime);
    useFarmStore.getState().applyProduce(query.data.produce, query.data.serverTime);
  }, [query.data]);

  useEffect(() => {
    if (query.error) useBuildingStore.getState().setError(livestockErrorMessage(query.error));
  }, [query.error]);

  // Opening a farm → herd status synced to now (and refreshed while it stays open).
  useEffect(() => {
    if (!selectedFarmId) return undefined;
    let alive = true;
    const pull = async (): Promise<void> => {
      try {
        const dto = await livestockApi.herd(cityId, selectedFarmId);
        if (alive) useLivestockStore.getState().applyHerd(dto);
      } catch {
        /* the list query reports errors */
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), OPEN_FARM_SYNC_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [cityId, selectedFarmId]);

  useEffect(() => {
    const run = async (fn: () => Promise<LivestockMutationResultDTO>, success: (r: LivestockMutationResultDTO) => string): Promise<boolean> => {
      const s = useLivestockStore.getState();
      if (s.busy || !canEdit) return false;
      s.setBusy(true);
      useBuildingStore.getState().setError(null);
      try {
        const res = await fn();
        const store = useLivestockStore.getState();
        store.applyProducts(res.products, res.serverTime);
        if (res.farm) store.applyFarm(res.farm);
        if (res.otherFarm) store.applyFarm(res.otherFarm);
        useFarmStore.getState().applyProduce(res.produce, res.serverTime);
        useBuildingStore.getState().applyResources(res.resources, res.serverTime);
        await queryClient.invalidateQueries({ queryKey: ['livestock', cityId] });
        useBuildingStore.getState().setNotice(success(res));
        if (res.farm) store.selectFarm(res.farm.id);
        return true;
      } catch (err) {
        useBuildingStore.getState().setError(livestockErrorMessage(err));
        return false;
      } finally {
        useLivestockStore.getState().setBusy(false);
      }
    };
    const farmName = (id: string) => {
      const f = useLivestockStore.getState().farms.find((x) => x.id === id);
      return f ? getLivestockFarmDefinition(f.farmType).name : 'trại';
    };

    useLivestockStore.getState().setHandlers({
      commitDraft: () => {
        const { draft, draftCheck } = useLivestockStore.getState();
        if (!draft) return;
        const def = getLivestockFarmDefinition(draft.farmType);
        if (!draftCheck?.valid) {
          useBuildingStore.getState().setError(
            draft.expandFarmId
              ? 'Vùng mở rộng chưa hợp lệ — các ô mới phải liền với trại và nằm trong lãnh địa.'
              : `Vùng chưa hợp lệ — ${def.name} cần tối thiểu ${def.minHexes} ô liền nhau trong lãnh địa.`
          );
          return;
        }
        const call = draft.expandFarmId
          ? () => livestockApi.expand(cityId, draft.expandFarmId!, { hexes: draft.hexes })
          : () => livestockApi.create(cityId, { farmType: draft.farmType, hexes: draft.hexes });
        const msg = draft.expandFarmId ? `Đã mở rộng ${def.name} thêm ${draft.hexes.length} ô!` : `Đã xây ${def.name} (${draft.hexes.length} ô)!`;
        void run(call, () => msg).then((ok) => {
          if (ok) useLivestockStore.getState().cancelDraft();
        });
      },
      buy: (farmId, animal, count, breed) =>
        void run(
          () => livestockApi.buy(cityId, farmId, { animalCode: animal, count, breed }),
          () => `Đã thả ${count} ${getAnimalBreed(animal, breed).name.toLowerCase()} con vào trại!`
        ),
      sell: (farmId, animalId) => void run(() => livestockApi.sell(cityId, farmId, animalId), () => 'Đã bán vật nuôi.'),
      harvest: (farmId, animalId) => void run(() => livestockApi.harvest(cityId, farmId, animalId), (r) => `Xuất chuồng: thu ${productList(r.collected)}.`),
      transfer: (farmId, animalId, target) =>
        void run(() => livestockApi.transfer(cityId, farmId, animalId, target), () => `Đã điều chuyển sang ${farmName(target)}.`),
      feed: (farmId, recipe, batches) =>
        void run(() => livestockApi.feed(cityId, farmId, { recipeCode: recipe, batches }), () => `Đã đổ ${batches} mẻ ${getFeedRecipe(recipe).name.toLowerCase()} vào máng!`),
      water: (farmId) => void run(() => livestockApi.water(cityId, farmId), () => 'Người chăm sóc đã đổ đầy máng nước.'),
      setCaretakers: (farmId, count) => void run(() => livestockApi.caretakers(cityId, farmId, count), () => `Trại có ${count} người chăm sóc.`),
      collect: (farmId) => void run(() => livestockApi.collect(cityId, farmId), (r) => `Thu được ${productList(r.collected)}!`),
      breed: (farmId, animal) =>
        void run(() => livestockApi.breed(cityId, farmId, { animalCode: animal }), () => `Khu sinh sản: sắp có ${getAnimalDefinition(animal).name.toLowerCase()} con!`),
      upgrade: (farmId) => {
        const f = useLivestockStore.getState().farms.find((x) => x.id === farmId);
        const next = f ? getLivestockLevel(f.farmType, f.level + 1) : null;
        void run(() => livestockApi.upgrade(cityId, farmId), () => (next ? `Bắt đầu nâng cấp: ${next.name}` : 'Đang nâng cấp'));
      },
      remove: (farmId) =>
        void run(async () => {
          const res = await livestockApi.remove(cityId, farmId);
          useLivestockStore.getState().selectFarm(null);
          return res;
        }, () => 'Đã dỡ trang trại và hoàn trả một phần tài nguyên.'),
    });
    return () => useLivestockStore.getState().reset();
  }, [cityId, canEdit, queryClient]);
}
