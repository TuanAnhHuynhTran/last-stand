import { ExplorationHud } from '../game/world/ExplorationHud';
import { useEffect } from 'react';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Result } from 'antd';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CityDTO } from '@cityverse/shared';
import { cityApi } from '../api/city.api';
import { getApiErrorMessage } from '../api/httpClient';
import { AppLayout } from '../components/AppLayout';
import { FullPageLoader } from '../components/FullPageLoader';
import { WorldCanvas } from '../game/world/WorldCanvas';
import { WorldHud } from '../game/world/WorldHud';
import { BuildingHud } from '../game/buildings/BuildingHud';
import { useBuildingSync } from '../game/buildings/useBuildingSync';
import { FarmHud } from '../game/farming/FarmHud';
import { useFarmSync } from '../game/farming/useFarmSync';
import { LivestockHud } from '../game/livestock/LivestockHud';
import { useLivestockSync } from '../game/livestock/useLivestockSync';
import { AquaHud } from '../game/aquaculture/AquaHud';
import { useAquaSync } from '../game/aquaculture/useAquaSync';
import { PopulationHud } from '../game/population/PopulationHud';
import { usePopulationSync } from '../game/population/usePopulationSync';
import { MilitaryHud } from '../game/military/MilitaryHud';
import { useMilitarySync } from '../game/military/useMilitarySync';
import { MountHud } from '../game/mounts/MountHud';
import { useMountSync } from '../game/mounts/useMountSync';
import { useGameStore } from '../stores/gameStore';

export function GameWorldPage() {
  const { cityId } = useParams<{ cityId: string }>();
  const navigate = useNavigate();
  const setActiveCityId = useGameStore((state) => state.setActiveCityId);

  const cityQuery = useQuery({
    queryKey: ['city-world', cityId],
    queryFn: () => {
      if (!cityId) {
        throw new Error('Ma thanh pho khong hop le');
      }
      return cityApi.getCityById(cityId);
    },
    enabled: Boolean(cityId),
    retry: false,
  });

  useEffect(() => {
    if (cityQuery.data) {
      setActiveCityId(cityQuery.data.id);
    }
  }, [cityQuery.data, setActiveCityId]);

  if (cityQuery.isLoading) {
    return <FullPageLoader tip="Dang khoi tao ban do luc giac 3D..." />;
  }

  if (cityQuery.isError || !cityQuery.data) {
    const statusCode = axios.isAxiosError(cityQuery.error) ? cityQuery.error.response?.status : 404;
    const isForbidden = statusCode === 403;

    return (
      <AppLayout>
        <Result
          status={isForbidden ? '403' : '404'}
          title={isForbidden ? 'Khong du quyen truy cap' : 'Thanh pho khong ton tai'}
          subTitle={getApiErrorMessage(
            cityQuery.error,
            'Khong the vao thanh pho khong ton tai hoac da bi han che quyen truy cap.'
          )}
          extra={
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>
              Quay lai Dashboard
            </Button>
          }
        />
      </AppLayout>
    );
  }

  return <CityWorldView city={cityQuery.data} onExit={() => navigate('/dashboard')} />;
}

function CityWorldView({ city, onExit }: { city: CityDTO; onExit: () => void }) {
  const canEdit = city.role === 'owner' || city.role === 'co_mayor';
  useBuildingSync(city.id, canEdit);
  useFarmSync(city.id, canEdit);
  useLivestockSync(city.id, canEdit);
  useAquaSync(city.id, canEdit);
  usePopulationSync(city.id, canEdit);
  useMilitarySync(city.id, canEdit);
  useMountSync(city.id, canEdit);

  const title = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          background: 'linear-gradient(135deg, #84b02e 0%, #2f8d7b 100%)',
          display: 'grid',
          placeItems: 'center',
          color: '#fffef8',
          fontWeight: 800,
        }}
      >
        ⬡
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#2b2116' }}>{city.name}</span>
        <span style={{ fontSize: 11, color: '#6b5842' }}>Thế giới 1000 × 1000 · seed {city.worldSeed}</span>
      </div>
    </div>
  );

  return (
    <div
      data-testid="city-world-canvas"
      style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}
    >
      <WorldCanvas worldSeed={city.worldSeed} />
      <WorldHud title={title} onExit={onExit} />
      <BuildingHud />
      <FarmHud />
      <LivestockHud />
      <AquaHud />
      <PopulationHud cityId={city.id} />
      <MilitaryHud />
      <MountHud />
      {canEdit && <Link to={`/game/${city.id}/battles`} data-testid="open-missions" style={{ position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 30, borderRadius: 12, padding: '10px 18px', background: '#fff8df', color: '#425d4b', boxShadow: '0 4px 18px #0002', fontWeight: 700 }}>⚔️ Nhiệm vụ PvE</Link>}
      <ExplorationHud cityId={city.id} canEdit={canEdit} />
      {city.role === 'visitor' && (
        <div data-testid="visitor-banner" style={{ position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 40, borderRadius: 12, padding: '8px 16px', background: '#2f4b3acc', color: '#fffef0', fontWeight: 600, boxShadow: '0 4px 18px #0003' }}>
          👀 Bạn đang ghé thăm thế giới của người khác — chỉ xem, không chỉnh sửa được.
        </div>
      )}
      <Link to={city.role === 'visitor' ? '/social?tab=friends' : '/social'} data-testid="open-social" style={{ position: 'absolute', right: 16, bottom: 18, zIndex: 30, borderRadius: 12, padding: '10px 16px', background: '#fff8df', color: '#425d4b', boxShadow: '0 4px 18px #0002', fontWeight: 700 }}>
        👥 Bạn bè · ⚔️ Đấu trường · 🛡 Liên minh
      </Link>
    </div>
  );
}
