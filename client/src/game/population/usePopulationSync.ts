import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ECONOMY_LABELS, type EconomyCode, type PopulationMutationResultDTO } from '@cityverse/shared';
import { populationApi, populationErrorMessage } from '../../api/population.api';
import { useBuildingStore } from '../buildings/buildingStore';
import { usePopulationStore } from './populationStore';

/**
 * Keeps villagers & economy in sync. The server simulates the economy per game hour; the
 * client re-reads it every few seconds (cheap) and animates villagers from the schedule.
 */
export function usePopulationSync(cityId: string, canEdit: boolean): void {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['population', cityId],
    queryFn: () => populationApi.state(cityId),
    refetchInterval: 8000,
    retry: false,
  });

  useEffect(() => {
    if (!query.data) return;
    usePopulationStore.getState().apply(query.data);
    useBuildingStore.getState().applyResources(query.data.resources, query.data.serverTime);
  }, [query.data]);

  useEffect(() => {
    if (query.error) useBuildingStore.getState().setError(populationErrorMessage(query.error));
  }, [query.error]);

  useEffect(() => {
    const run = async (fn: () => Promise<PopulationMutationResultDTO>, ok: (r: PopulationMutationResultDTO) => string): Promise<void> => {
      const s = usePopulationStore.getState();
      if (s.busy || !canEdit) return;
      s.setBusy(true);
      useBuildingStore.getState().setError(null);
      try {
        const res = await fn();
        usePopulationStore.getState().apply(res.state);
        useBuildingStore.getState().applyResources(res.state.resources, res.state.serverTime);
        useBuildingStore.getState().setNotice(ok(res));
        // Other panels (fields, farms, ponds) may have changed through automation.
        await Promise.all(['livestock', 'aquaculture', 'farms', 'buildings'].map((k) => queryClient.invalidateQueries({ queryKey: [k, cityId] })));
      } catch (err) {
        useBuildingStore.getState().setError(populationErrorMessage(err));
      } finally {
        usePopulationStore.getState().setBusy(false);
      }
    };
    const name = (id: string) => usePopulationStore.getState().state?.survivors.find((x) => x.id === id)?.name ?? 'Cư dân';
    usePopulationStore.getState().setHandlers({
      assign: (survivorId, kind, workplaceId) => void run(() => populationApi.assign(cityId, { survivorId, kind, workplaceId }), () => `${name(survivorId)} đã nhận việc mới.`),
      unassign: (survivorId) => void run(() => populationApi.unassign(cityId, survivorId), () => `${name(survivorId)} đã nghỉ việc.`),
      autoAssign: () => void run(() => populationApi.autoAssign(cityId), () => 'Đã phân công tự động theo kỹ năng.'),
      moveHome: (survivorId, buildingId) => void run(() => populationApi.moveHome(cityId, survivorId, buildingId), () => `${name(survivorId)} đã chuyển nhà.`),
      setRecipe: (buildingId, recipe) => void run(() => populationApi.setRecipe(cityId, buildingId, recipe), () => 'Đã đổi công thức sản xuất.'),
      collect: (buildingId) =>
        void run(
          () => populationApi.collect(cityId, buildingId),
          (r) => `Nhập kho: ${Object.entries(r.collected ?? {}).map(([c, n]) => `${Math.floor(n)} ${ECONOMY_LABELS[c as EconomyCode] ?? c}`).join(', ')}.`
        ),
      settings: (patch) => void run(() => populationApi.settings(cityId, patch), () => 'Đã lưu cài đặt dân cư.'),
      rescue: () => void run(() => populationApi.rescue(cityId), () => 'Đội cứu hộ đã lên đường!'),
    });
    return () => usePopulationStore.getState().reset();
  }, [cityId, canEdit, queryClient]);
}
