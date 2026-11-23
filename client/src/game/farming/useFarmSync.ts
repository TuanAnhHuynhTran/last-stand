import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PRODUCE_LABELS,
  getCropDefinition,
  getFarmZoneDefinition,
  getFarmZoneLevel,
  type FarmMutationResultDTO,
} from '@cityverse/shared';
import { farmApi, farmErrorMessage } from '../../api/farm.api';
import { useBuildingStore } from '../buildings/buildingStore';
import { useFarmStore } from './farmStore';

/**
 * Keeps the farm store in sync with the real API and registers the actions the scene and the
 * panels call. Growth is computed client-side from the server timestamps (no polling needed);
 * the query only polls while a zone upgrade is running.
 */
export function useFarmSync(cityId: string, canEdit: boolean): void {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['farms', cityId],
    queryFn: () => farmApi.list(cityId),
    refetchInterval: (q) => (q.state.data?.zones.some((z) => z.status === 'upgrading') ? 1000 : false),
    retry: false,
  });

  useEffect(() => {
    if (!query.data) return;
    useFarmStore.getState().applyServerState(query.data);
    useBuildingStore.getState().applyResources(query.data.resources, query.data.serverTime);
  }, [query.data]);

  useEffect(() => {
    if (query.error) useBuildingStore.getState().setError(farmErrorMessage(query.error));
  }, [query.error]);

  useEffect(() => {
    const run = async (fn: () => Promise<FarmMutationResultDTO>, success: (r: FarmMutationResultDTO) => string): Promise<boolean> => {
      const farm = useFarmStore.getState();
      if (farm.busy || !canEdit) return false;
      farm.setBusy(true);
      useBuildingStore.getState().setError(null);
      try {
        const res = await fn();
        useFarmStore.getState().applyProduce(res.produce, res.serverTime);
        useBuildingStore.getState().applyResources(res.resources, res.serverTime);
        await queryClient.invalidateQueries({ queryKey: ['farms', cityId] });
        useBuildingStore.getState().setNotice(success(res));
        if (res.zone) useFarmStore.getState().selectZone(res.zone.id);
        return true;
      } catch (err) {
        useBuildingStore.getState().setError(farmErrorMessage(err));
        return false;
      } finally {
        useFarmStore.getState().setBusy(false);
      }
    };

    useFarmStore.getState().setHandlers({
      commitDraft: () => {
        const { draft, draftCheck } = useFarmStore.getState();
        if (!draft) return;
        if (!draftCheck?.valid) {
          useBuildingStore.getState().setError('Vùng chưa hợp lệ — cần tối thiểu 6 ô liền nhau trong lãnh địa.');
          return;
        }
        const name = getFarmZoneDefinition(draft.zoneType).name;
        void (draft.mode === 'expand' && draft.zoneId
          ? run(() => farmApi.expand(cityId, draft.zoneId!, { hexes: draft.hexes }), () => `Đã mở rộng ${name} thêm ${draft.hexes.length} ô.`)
          : run(() => farmApi.create(cityId, { zoneType: draft.zoneType, hexes: draft.hexes }), () => `Đã tạo ${name} (${draft.hexes.length} ô)!`)
        ).then((ok) => {
          if (ok) useFarmStore.getState().cancelDraft();
        });
      },
      plant: (zoneId, crop) =>
        void run(
          () => farmApi.plant(cityId, zoneId, { cropCode: crop }),
          (r) => `Đã gieo ${r.zone?.crop ? getCropDefinition(r.zone.crop.cropCode).name : 'cây trồng'}!`
        ),
      harvest: (zoneId) =>
        void run(
          () => farmApi.harvest(cityId, zoneId),
          (r) => {
            const zone = useFarmStore.getState().zones.find((z) => z.id === zoneId);
            const crop = zone?.crop ? getCropDefinition(zone.crop.cropCode) : null;
            return `Thu hoạch được ${r.harvested ?? 0} ${crop ? PRODUCE_LABELS[crop.produce].toLowerCase() : ''}!`;
          }
        ),
      upgrade: (zoneId) => {
        const zone = useFarmStore.getState().zones.find((z) => z.id === zoneId);
        const next = zone ? getFarmZoneLevel(zone.zoneType, zone.level + 1) : null;
        void run(() => farmApi.upgrade(cityId, zoneId), () => (next ? `Bắt đầu nâng cấp: ${next.name}` : 'Đang nâng cấp'));
      },
      remove: (zoneId) =>
        void run(async () => {
          const res = await farmApi.remove(cityId, zoneId);
          useFarmStore.getState().selectZone(null);
          return res;
        }, () => 'Đã xóa khu canh tác và hoàn trả một phần tài nguyên.'),
    });
    return () => useFarmStore.getState().reset();
  }, [cityId, canEdit, queryClient]);
}
