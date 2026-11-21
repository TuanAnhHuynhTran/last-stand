import { useEffect, useState } from 'react';
import {
  AimOutlined,
  AlertOutlined,
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  BorderOutlined,
  BuildOutlined,
  ClearOutlined,
  CloseOutlined,
  ColumnHeightOutlined,
  DollarCircleOutlined,
  DragOutlined,
  QuestionCircleOutlined,
  SelectOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Result, Tooltip } from 'antd';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import {
  WORLD_CONFIG,
  normalizeTerrainArchetype,
  type BiomeType,
} from '@cityverse/shared';
import { cityApi } from '../api/city.api';
import { getApiErrorMessage } from '../api/httpClient';
import { AppLayout } from '../components/AppLayout';
import { FullPageLoader } from '../components/FullPageLoader';
import { GameCanvas } from '../engine/GameCanvas';
import { useGameStore } from '../stores/gameStore';
import { useWorldStore, type WorldInteractionTool } from '../stores/worldStore';

const BIOME_DISPLAY: Record<BiomeType, { label: string; bg: string; color: string }> = {
  deep_water: { label: 'Nuoc sau', bg: 'rgba(24, 140, 176, 0.22)', color: '#0d5b75' },
  shallow_water: { label: 'Song / Ho', bg: 'rgba(45, 213, 240, 0.25)', color: '#0c687d' },
  sand: { label: 'Bai cat', bg: 'rgba(217, 194, 130, 0.35)', color: '#6b5316' },
  grass: { label: 'Dong co', bg: 'rgba(134, 173, 44, 0.24)', color: '#3b590f' },
  meadow: { label: 'Thao nguyen', bg: 'rgba(151, 188, 56, 0.26)', color: '#3d5c10' },
  forest: { label: 'Rung cay', bg: 'rgba(74, 128, 36, 0.24)', color: '#274d12' },
  hill: { label: 'Doi cao', bg: 'rgba(124, 163, 46, 0.24)', color: '#3a5411' },
  mountain: { label: 'Nui da', bg: 'rgba(140, 146, 152, 0.26)', color: '#3f464d' },
  snow: { label: 'Dinh tuyet', bg: 'rgba(194, 212, 232, 0.45)', color: '#2d445c' },
};

const ARCHETYPE_LABELS = {
  plain: 'Dong Bang',
  coastal: 'Duyen Hai',
  mountain: 'Nui Cao',
  river: 'Thung Lung Song',
} as const;

export function GameWorldPage() {
  const { cityId } = useParams<{ cityId: string }>();
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);

  const character = useGameStore((state) => state.character);
  const gameMode = useGameStore((state) => state.gameMode);
  const setGameMode = useGameStore((state) => state.setGameMode);
  const setActiveCityId = useGameStore((state) => state.setActiveCityId);

  const showGrid = useWorldStore((s) => s.showGrid);
  const toggleGrid = useWorldStore((s) => s.toggleGrid);
  const interactionTool = useWorldStore((s) => s.interactionTool);
  const setInteractionTool = useWorldStore((s) => s.setInteractionTool);
  const hoveredTile = useWorldStore((s) => s.hoveredTile);
  const selection = useWorldStore((s) => s.selection);
  const setSelection = useWorldStore((s) => s.setSelection);
  const cameraTelemetry = useWorldStore((s) => s.cameraTelemetry);
  const loadedChunkKeys = useWorldStore((s) => s.loadedChunkKeys);
  const loadingChunkCount = useWorldStore((s) => s.loadingChunkCount);
  const metadata = useWorldStore((s) => s.metadata);
  const isSavingDelta = useWorldStore((s) => s.isSavingDelta);
  const lastError = useWorldStore((s) => s.lastError);
  const setLastError = useWorldStore((s) => s.setLastError);
  const requestCameraReset = useWorldStore((s) => s.requestCameraReset);
  const triggerTerrainAction = useWorldStore((s) => s.triggerTerrainAction);

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
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/dashboard')}
            >
              Quay lai Dashboard
            </Button>
          }
        />
      </AppLayout>
    );
  }

  const city = cityQuery.data;
  const archetype = normalizeTerrainArchetype(city.terrainType);
  const canEditTerrain = city.role === 'owner' || city.role === 'co_mayor';
  const totalWorldChunks =
    metadata?.totalChunks ??
    Math.ceil(city.mapWidth / WORLD_CONFIG.CHUNK_SIZE) *
      Math.ceil(city.mapHeight / WORLD_CONFIG.CHUNK_SIZE);

  const selectionCols = selection ? selection.maxX - selection.minX + 1 : 0;
  const selectionRows = selection ? selection.maxZ - selection.minZ + 1 : 0;
  const selectionCount = selectionCols * selectionRows;

  const tools: {
    id: WorldInteractionTool;
    label: string;
    icon: React.ReactNode;
    tooltip: string;
  }[] = [
    {
      id: 'pan',
      label: 'Di chuyen',
      icon: <DragOutlined />,
      tooltip: 'Keo chuot trai hoac WASD de di chuyen (Phim 1)',
    },
    {
      id: 'select',
      label: 'Chon hex',
      icon: <SelectOutlined />,
      tooltip: 'Keo chuot trai de chon nhieu o luc giac (Phim 2 / Shift+Keo)',
    },
  ];

  if (canEditTerrain) {
    tools.push(
      {
        id: 'raise',
        label: 'Nang',
        icon: <ArrowUpOutlined />,
        tooltip: 'Keo chon de nang o luc giac va luu delta',
      },
      {
        id: 'lower',
        label: 'Ha',
        icon: <ArrowDownOutlined />,
        tooltip: 'Keo chon de ha o luc giac va luu delta',
      },
      {
        id: 'flatten',
        label: 'San phang',
        icon: <ColumnHeightOutlined />,
        tooltip: 'Keo chon de san phang dia hinh luc giac',
      }
    );
  }

  const hoveredBiome = hoveredTile ? BIOME_DISPLAY[hoveredTile.biome] : null;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Full-bleed 100vh Hexagonal 3D World Canvas */}
      <GameCanvas city={city} character={character} />

      {/* Top-left Cozy Frosted City Pill */}
      <div
        className="cv-cozy-hud-pill"
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          zIndex: 20,
          padding: '9px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: 'linear-gradient(135deg, #84b02e 0%, #2f8d7b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fffef8',
            fontWeight: 800,
            fontSize: 15,
            boxShadow: '0 3px 8px rgba(47, 141, 123, 0.35)',
          }}
        >
          ⬡
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#2b2116' }}>{city.name}</span>
            <span className="cv-cozy-badge cv-cozy-badge--grass">Lv.{city.level}</span>
          </div>
          <span style={{ fontSize: 11, color: '#6b5842' }}>
            {ARCHETYPE_LABELS[archetype]} · {city.mapWidth}×{city.mapHeight} Hex
          </span>
        </div>

        <div
          style={{
            width: 1,
            height: 24,
            background: 'rgba(124, 92, 56, 0.2)',
            marginInline: 2,
          }}
        />

        <span className="cv-cozy-badge cv-cozy-badge--gold">
          <DollarCircleOutlined />
          {city.economy.cityCoins.toLocaleString('en-US')}
        </span>
        <span className="cv-cozy-badge cv-cozy-badge--water">
          <TeamOutlined />
          {city.economy.population}
        </span>
      </div>

      {/* Top-right Compact Action Bar */}
      <div
        className="cv-cozy-hud-pill"
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          zIndex: 20,
          padding: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <Tooltip title="Bat / tat luoi luc giac (Phim G)">
          <button
            type="button"
            className={`cv-cozy-hud-btn ${showGrid ? 'cv-cozy-hud-btn--gold' : ''}`}
            onClick={toggleGrid}
            data-testid="toggle-grid-button"
          >
            <BorderOutlined />
            <span>Luoi [G]: {showGrid ? 'BAT' : 'TAT'}</span>
          </button>
        </Tooltip>

        <Tooltip title="Dua camera ve lang trung tam">
          <button type="button" className="cv-cozy-hud-btn" onClick={requestCameraReset}>
            <AimOutlined />
          </button>
        </Tooltip>

        <button
          type="button"
          className={`cv-cozy-hud-btn ${gameMode === 'build' ? 'cv-cozy-hud-btn--active' : ''}`}
          onClick={() => setGameMode(gameMode === 'build' ? 'character' : 'build')}
        >
          {gameMode === 'build' ? <BuildOutlined /> : <UserOutlined />}
          <span>{gameMode === 'build' ? 'Build' : 'Character'}</span>
        </button>

        <button
          type="button"
          className="cv-cozy-hud-btn"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeftOutlined />
          <span>Dashboard</span>
        </button>
      </div>

      {/* Transient Error Alert */}
      {lastError && (
        <div
          style={{
            position: 'absolute',
            top: 68,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            maxWidth: 460,
          }}
        >
          <Alert
            type="warning"
            showIcon
            icon={<AlertOutlined />}
            closable
            onClose={() => setLastError(null)}
            message={lastError}
          />
        </div>
      )}

      {/* Bottom-left Compact Hex Coordinate & Chunk Streaming Pill */}
      <div
        className="cv-cozy-hud-pill"
        data-testid="terrain-inspector-hud"
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          zIndex: 20,
          padding: '8px 13px',
          minWidth: 230,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {hoveredTile && hoveredBiome ? (
            <>
              <span
                className="cv-cozy-badge cv-cozy-badge--gold"
                data-testid="hovered-grid-coord"
              >
                ⬡ Grid X: {hoveredTile.gx} | Z: {hoveredTile.gz}
              </span>
              <span
                className="cv-cozy-badge"
                style={{ background: hoveredBiome.bg, color: hoveredBiome.color }}
              >
                {hoveredBiome.label}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: '#6b5842', fontWeight: 500 }}>
              ⬡ Re chuot len o luc giac
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            fontSize: 11,
            color: '#63503c',
          }}
        >
          <span>
            {hoveredTile
              ? `Y: ${hoveredTile.height.toFixed(1)}m · Chunk (${hoveredTile.cx},${hoveredTile.cz}) r${hoveredTile.revision}`
              : `Cam (${cameraTelemetry.chunkX},${cameraTelemetry.chunkZ}) · ${cameraTelemetry.distance}m`}
          </span>
          <span
            className="cv-cozy-badge cv-cozy-badge--water"
            style={{ fontSize: 11, padding: '1px 7px' }}
          >
            {loadingChunkCount > 0 ? 'Tai...' : `Chunks: ${loadedChunkKeys.length} / ${totalWorldChunks}`}
          </span>
        </div>
      </div>

      {/* Bottom-center Cozy Floating Hex Tool Dock & Selection Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {selection && (
          <div
            className="cv-cozy-hud-pill"
            data-testid="selection-action-bar"
            style={{
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <span className="cv-cozy-badge cv-cozy-badge--gold">
              ⬡ [{selection.minX}..{selection.maxX}, {selection.minZ}..{selection.maxZ}] (
              {selectionCols}x{selectionRows} = {selectionCount} o)
            </span>
            {canEditTerrain && (
              <>
                <button
                  type="button"
                  className="cv-cozy-hud-btn cv-cozy-hud-btn--active"
                  disabled={isSavingDelta}
                  onClick={() => triggerTerrainAction('raise', selection, 1.5)}
                >
                  <ArrowUpOutlined />
                  <span>+1.5m</span>
                </button>
                <button
                  type="button"
                  className="cv-cozy-hud-btn"
                  disabled={isSavingDelta}
                  onClick={() => triggerTerrainAction('lower', selection, 1.5)}
                >
                  <ArrowDownOutlined />
                  <span>-1.5m</span>
                </button>
                <button
                  type="button"
                  className="cv-cozy-hud-btn"
                  disabled={isSavingDelta}
                  onClick={() => triggerTerrainAction('flatten', selection)}
                >
                  <ColumnHeightOutlined />
                  <span>San phang</span>
                </button>
                <button
                  type="button"
                  className="cv-cozy-hud-btn"
                  disabled={isSavingDelta}
                  onClick={() => triggerTerrainAction('clear_props', selection)}
                >
                  <ClearOutlined />
                  <span>Don cay</span>
                </button>
              </>
            )}
            <button
              type="button"
              className="cv-cozy-hud-btn"
              onClick={() => setSelection(null)}
            >
              <CloseOutlined />
            </button>
          </div>
        )}

        <div
          className="cv-cozy-hud-pill"
          style={{
            padding: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {tools.map((tool) => {
            const active = interactionTool === tool.id;
            return (
              <Tooltip key={tool.id} title={tool.tooltip}>
                <button
                  type="button"
                  className={`cv-cozy-hud-btn ${active ? 'cv-cozy-hud-btn--active' : ''}`}
                  onClick={() => setInteractionTool(tool.id)}
                >
                  {tool.icon}
                  <span>{tool.label}</span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Bottom-right Collapsible Controls Help Button (keeps the landscape clean!) */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        {showHelp && (
          <div
            className="cv-cozy-hud-pill"
            style={{
              padding: '10px 14px',
              width: 245,
              fontSize: 12,
              lineHeight: 1.6,
              color: '#463726',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#2b2116' }}>
              Dieu Khien Ban Do Luc Giac
            </div>
            <div>• <strong>WASD / Keo trai</strong>: Di chuyen</div>
            <div>• <strong>Chuot phai</strong>: Xoay goc nhin</div>
            <div>• <strong>Cuon chuot</strong>: Zoom in / out</div>
            <div>• <strong>Shift + Keo / Chon hex</strong>: Quet vung</div>
            <div>• <strong>Phim G</strong>: Bat / tat luoi luc giac</div>
          </div>
        )}

        <button
          type="button"
          className={`cv-cozy-hud-btn ${showHelp ? 'cv-cozy-hud-btn--gold' : ''}`}
          style={{ borderRadius: 999, height: 38, paddingInline: 14 }}
          onClick={() => setShowHelp((prev) => !prev)}
        >
          <QuestionCircleOutlined />
          <span>Huong dan</span>
        </button>
      </div>
    </div>
  );
}
