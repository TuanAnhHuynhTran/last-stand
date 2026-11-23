import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTrainingProgram, type MountMutationResultDTO, type MountStateDTO } from '@cityverse/shared';
import { mountErrorMessage, mountsApi } from '../../api/mounts.api';
import { useBuildingStore } from '../buildings/buildingStore';
import { useMountStore } from './mountStore';

/**
 * Horses / elephants (Phase 9). Training runs on server time; the 3D animals take their
 * activity (training lap, rider, cargo) from the livestock state, which is refreshed after
 * every change here so the scene follows right away.
 */
export function useMountSync(cityId: string, canEdit: boolean): void {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['mounts', cityId],
    queryFn: () => mountsApi.state(cityId),
    refetchInterval: (q) => ((q.state.data as MountStateDTO | undefined)?.jobs.length ? 4000 : 12000),
    retry: false,
  });

  useEffect(() => {
    if (query.data) useMountStore.getState().apply(query.data);
  }, [query.data]);

  // A training job just finished → the animals' behaviour changes too.
  const jobs = query.data?.jobs.length ?? 0;
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['livestock', cityId] });
  }, [jobs, cityId, queryClient]);

  useEffect(() => {
    const run = async (fn: () => Promise<MountMutationResultDTO>, ok: string): Promise<void> => {
      const s = useMountStore.getState();
      if (s.busy || !canEdit) return;
      s.setBusy(true);
      useBuildingStore.getState().setError(null);
      try {
        const res = await fn();
        useMountStore.getState().apply(res.state);
        useBuildingStore.getState().applyResources(res.state.resources, res.state.serverTime);
        useBuildingStore.getState().setNotice(ok);
        queryClient.setQueryData(['mounts', cityId], res.state);
        await Promise.all(['livestock', 'military'].map((k) => queryClient.invalidateQueries({ queryKey: [k, cityId] })));
      } catch (err) {
        useBuildingStore.getState().setError(mountErrorMessage(err));
      } finally {
        useMountStore.getState().setBusy(false);
      }
    };
    const name = (id: string) => useMountStore.getState().state?.animals.find((a) => a.id === id)?.name ?? 'Con vật';
    useMountStore.getState().setHandlers({
      train: (id, program) => void run(() => mountsApi.train(cityId, id, program), `${name(id)} bắt đầu ${getTrainingProgram(program).name.toLowerCase()}.`),
      care: (id, action) => void run(() => mountsApi.care(cityId, id, action), action === 'vet' ? `${name(id)} đã được khám thú y.` : `${name(id)} được chải lông sạch bóng.`),
      equip: (id, input) => void run(() => mountsApi.equip(cityId, id, input), `${name(id)} đã đổi trang bị.`),
      mount: (id, unitId) => void run(() => mountsApi.mount(cityId, id, unitId), `${name(id)} đã có kỵ binh.`),
      dismount: (id) => void run(() => mountsApi.dismount(cityId, id), `${name(id)} đã về chuồng.`),
      task: (id, kind) => void run(() => mountsApi.task(cityId, id, kind), kind === 'transport' ? `${name(id)} bắt đầu chở vật liệu.` : `${name(id)} vào dự bị quân sự.`),
      endTask: (id) => void run(() => mountsApi.endTask(cityId, id), `${name(id)} đã kết thúc nhiệm vụ.`),
    });
    return () => useMountStore.getState().reset();
  }, [cityId, canEdit, queryClient]);
}
