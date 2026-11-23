import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UNIT_TYPE_DEFINITIONS, type MilitaryMutationResultDTO, type MilitaryStateDTO } from '@cityverse/shared';
import { militaryApi, militaryErrorMessage } from '../../api/military.api';
import { useBuildingStore } from '../buildings/buildingStore';
import { useMilitaryStore } from './militaryStore';

/**
 * Keeps the army in sync. Training runs on server timestamps: the client only animates and
 * polls a little faster while a job is running so soldiers graduate on time after a refresh.
 */
export function useMilitarySync(cityId: string, canEdit: boolean): void {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['military', cityId],
    queryFn: () => militaryApi.state(cityId),
    refetchInterval: (q) => ((q.state.data as MilitaryStateDTO | undefined)?.jobs.length ? 4000 : 10000),
    retry: false,
  });

  useEffect(() => {
    if (!query.data) return;
    useMilitaryStore.getState().apply(query.data);
  }, [query.data]);

  useEffect(() => {
    if (query.error) useBuildingStore.getState().setError(militaryErrorMessage(query.error));
  }, [query.error]);

  // Barracks placed / moved / upgraded / demolished → refresh stations and slots right away.
  useEffect(
    () =>
      useBuildingStore.subscribe((s, prev) => {
        if (s.buildings !== prev.buildings) void queryClient.invalidateQueries({ queryKey: ['military', cityId] });
      }),
    [cityId, queryClient]
  );

  useEffect(() => {
    const run = async (fn: () => Promise<MilitaryMutationResultDTO>, ok: string): Promise<void> => {
      const s = useMilitaryStore.getState();
      if (s.busy || !canEdit) return;
      s.setBusy(true);
      useBuildingStore.getState().setError(null);
      try {
        const res = await fn();
        useMilitaryStore.getState().apply(res.state);
        useBuildingStore.getState().applyResources(res.state.resources, res.state.serverTime);
        useBuildingStore.getState().setNotice(ok);
        queryClient.setQueryData(['military', cityId], res.state);
        // Recruiting takes citizens out of work and spends stock.
        await queryClient.invalidateQueries({ queryKey: ['population', cityId] });
      } catch (err) {
        useBuildingStore.getState().setError(militaryErrorMessage(err));
      } finally {
        useMilitaryStore.getState().setBusy(false);
      }
    };
    const unitName = (id: string) => useMilitaryStore.getState().state?.units.find((u) => u.id === id)?.name ?? 'Binh sĩ';
    const className = (code: string) => UNIT_TYPE_DEFINITIONS.find((u) => u.code === code)?.name ?? code;
    useMilitaryStore.getState().setHandlers({
      recruit: (buildingId, unitType, count) =>
        void run(() => militaryApi.recruit(cityId, { buildingId, unitType, count, startTraining: true }), `Đã tuyển ${count} ${className(unitType)} — bắt đầu huấn luyện.`),
      train: (buildingId, kind) => void run(() => militaryApi.train(cityId, { buildingId, kind }), kind === 'drill' ? 'Bắt đầu thao luyện.' : 'Bắt đầu huấn luyện tân binh.'),
      equip: (unitId, slot, equipmentCode) => void run(() => militaryApi.equip(cityId, unitId, { slot, equipmentCode }), `${unitName(unitId)} đã đổi trang bị.`),
      discharge: (unitId) => {
        const name = unitName(unitId);
        void run(() => militaryApi.discharge(cityId, unitId), `${name} đã giải ngũ, trang bị trả về kho.`);
      },
      createSquad: (name, formation) => void run(() => militaryApi.createSquad(cityId, { name, formation }), `Đã lập ${name}.`),
      updateSquad: (squadId, patch) => void run(() => militaryApi.updateSquad(cityId, squadId, patch), 'Đã cập nhật đội hình.'),
      deleteSquad: (squadId) => void run(() => militaryApi.deleteSquad(cityId, squadId), 'Đã giải tán đội.'),
      addMembers: (squadId, unitIds) => void run(() => militaryApi.addMembers(cityId, squadId, unitIds), 'Đã gán binh sĩ vào đội.'),
      removeMember: (squadId, unitId) => void run(() => militaryApi.removeMember(cityId, squadId, unitId), `${unitName(unitId)} đã rời đội.`),
    });
    return () => useMilitaryStore.getState().reset();
  }, [cityId, canEdit, queryClient]);
}
