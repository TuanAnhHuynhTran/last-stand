import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBuildingDefinition, getBuildingLevel, type BuildingMutationResultDTO } from '@cityverse/shared';
import { buildingApi, buildingErrorMessage } from '../../api/building.api';
import { useBuildingStore } from './buildingStore';

/**
 * Keeps the building store in sync with the real API and registers the action handlers the
 * 3D scene and panels call (place / move / upgrade / demolish).
 */
export function useBuildingSync(cityId: string, canEdit: boolean): void {
  const queryClient = useQueryClient();
  const queryKey = ['buildings', cityId];

  const query = useQuery({
    queryKey,
    queryFn: () => buildingApi.list(cityId),
    // Poll only while something is under construction (the server completes due jobs on read).
    refetchInterval: (q) => (q.state.data?.buildings.some((b) => b.activeJob) ? 1000 : false),
    retry: false,
  });

  useEffect(() => {
    if (query.data) useBuildingStore.getState().applyServerState(query.data);
  }, [query.data]);

  useEffect(() => {
    if (query.error) useBuildingStore.getState().setError(buildingErrorMessage(query.error));
  }, [query.error]);

  useEffect(() => {
    const store = useBuildingStore.getState();
    store.setCanEdit(canEdit);

    const run = async (fn: () => Promise<BuildingMutationResultDTO>, success: string): Promise<boolean> => {
      const s = useBuildingStore.getState();
      if (s.busy) return false;
      s.setBusy(true);
      s.setError(null);
      try {
        const res = await fn();
        useBuildingStore.getState().applyResources(res.resources, res.serverTime);
        await queryClient.invalidateQueries({ queryKey: ['buildings', cityId] });
        useBuildingStore.getState().setNotice(success);
        if (res.building) useBuildingStore.getState().select(res.building.id);
        return true;
      } catch (err) {
        useBuildingStore.getState().setError(buildingErrorMessage(err));
        return false;
      } finally {
        useBuildingStore.getState().setBusy(false);
      }
    };

    store.setHandlers({
      commitPlacement: (placing, anchor) => {
        const preview = useBuildingStore.getState().preview;
        if (preview && !preview.valid) {
          useBuildingStore.getState().setError('Vị trí không hợp lệ — chọn ô màu xanh.');
          return;
        }
        const name = getBuildingDefinition(placing.typeCode).name;
        void (placing.movingId
          ? run(
              () => buildingApi.move(cityId, placing.movingId!, { ...anchor, rotation: placing.rotation }),
              `Đã di chuyển ${name}.`
            )
          : run(
              () => buildingApi.place(cityId, { typeCode: placing.typeCode, ...anchor, rotation: placing.rotation }),
              `Bắt đầu xây ${name}!`
            )
        ).then((ok) => {
          if (ok && (placing.typeCode !== 'road' || placing.movingId)) useBuildingStore.getState().cancelPlacing();
        });
      },
      upgrade: (id) => {
        const b = useBuildingStore.getState().buildings.find((x) => x.id === id);
        const next = b ? getBuildingLevel(b.typeCode, b.level + 1) : null;
        void run(() => buildingApi.upgrade(cityId, id), next ? `Bắt đầu nâng cấp: ${next.name}` : 'Đang nâng cấp');
      },
      demolish: (id) => {
        void run(async () => {
          const res = await buildingApi.demolish(cityId, id);
          useBuildingStore.getState().select(null);
          return res;
        }, 'Đã tháo dỡ công trình và hoàn trả một phần tài nguyên.');
      },
    });
    return () => useBuildingStore.getState().reset();
  }, [cityId, canEdit, queryClient]);
}
