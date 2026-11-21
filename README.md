# CITYVERSE — Phase 1 (Foundation) & Phase 2 (3D World Engine)

Monorepo cho game **CITYVERSE** (3D City Builder + Life Simulation + Multiplayer).

## Cau truc Monorepo

- `packages/shared` (`@cityverse/shared`): Types, Zod schemas, constants gameplay (`CITY_CONFIG`, `WORLD_CONFIG`, `CHARACTER_PRESETS`, `TERRAIN_PRESETS`), he toa do luc giac pointy-top odd-r `128x128` (`4` world units/o hex, chunk `32x32`) va bo sinh dia hinh xac dinh theo `world_seed` (`plain`, `coastal`, `mountain`, `river`).
- `server` (`@cityverse/server`): Node.js + Express + TypeScript + Sequelize (MySQL 8 + fallback SQLite dev) + JWT Refresh Token Rotation + Swagger/OpenAPI + World/Chunk API (`city_chunks`, metadata terrain, tai chunk theo pham vi, luu delta & revision, seed/tai tao tu `world_seed`, dang nhap nhanh `/auth/dev-admin`).
- `client` (`@cityverse/client`): React + TypeScript + Vite + Ant Design + Zustand + TanStack Query + React Three Fiber (`GameCanvas`, `WorldScene`, `WorldManager`, `ChunkManager`, hex terrain prism + `InstancedMesh`, `CameraRig`, `GridOverlay` luc giac, `TerrainInteraction`, HUD kieu pastel/cozy full-bleed).

## Khoi tao MySQL 8 (khi ban san sang tao DB)

1. Sao chep `.env.example` thanh `.env` va dien thong tin MySQL (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).
2. Chay 1 trong 2 cach:
   - **Tu dong bang Node.js script (khuyen nghi):**
     ```bash
     node server/scripts/setup-db.js          # Tao database + chay Sequelize migrations
     node server/scripts/setup-db.js --seed   # Tao database + migrations + seed tai khoan demo
     node server/scripts/setup-db.js --sql    # Tao database + 6 bang bang init-mysql.sql
     ```
   - **Truc tiep bang SQL script trong MySQL CLI / Workbench:**
     ```bash
     mysql -u root -p < server/scripts/init-mysql.sql
     ```

## Chay du an

```bash
npm install
npm run build
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api/v1`
- Swagger UI: `http://localhost:4000/api/docs`

## Kiem thu & Chat luong ma nguon

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```
