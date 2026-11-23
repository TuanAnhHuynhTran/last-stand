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

## Giai đoạn 10: khám phá lãnh địa

Chạy `npm run db:migrate` trước khi khởi động server. Trong Build Mode, xây trạm radar,
đợi hoàn thành rồi chọn radar trong bảng khám phá. Bật Scan Mode, chọn ô trên bản đồ
hoặc trong thế giới 3D (Shift để chọn nhiều ô), xem chi phí và xác nhận. Quét xong chỉ
mở dữ liệu; cần khai phá riêng và chờ hoàn thành trước khi xây dựng.

- Radar cấp 1/2/3 có tầm 12/22/34 hex. Cấp 2 mở quét diện rộng, tối đa 19 ô.
- Cấp 3 mở drone (+8 hex, gấp đôi phí quét) và tìm tài nguyên hiếm (gấp ba phí,
  có thể tìm bãi ngựa hoang hoặc rừng voi trên địa hình phù hợp).
- Quét mất 10 giây, khai phá mất 20 giây. Job được lưu trong MySQL và hoàn tất
  trong transaction khi đọc/ghi API tiếp theo; không cần tiến trình timer hoặc Redis.
- Các ô nguy hiểm/PvE vẫn khóa, không tự cấp chiến thắng. Không có API mở khóa PvE giả.
- Địa hình nền được tái tạo từ seed công khai. POI đặc biệt là dữ liệu riêng của server,
  được lưu khi khám phá, không thể suy ra từ seed và không trả về trước khi quét xong.
- Quyền sở hữu được lưu theo city, không đặt trên cache theo seed dùng chung.

API cá nhân có ở `/api/world/me/{map,tiles,discoveries,scans,claims}` và alias `/api/v1/world/me`.
API theo city: `/api/v1/cities/:cityId/exploration/{map,tiles,discoveries,scans,claims}`.
`tiles` nhận `minQ,maxQ,minR,maxR` (mỗi chiều tối đa 32). Ô không có trong kết quả là
Hidden; không có dữ liệu địa hình/POI ẩn trong các response này.
POST scans/claims nhận `{idempotencyKey, hexes: [{q,r}], radarId, mode}`;
`idempotencyKey` là UUID, dùng lại khi thử lại cùng yêu cầu. Quét yêu cầu radar đang hoạt động.
Phản hồi lỗi cùng khóa nhưng khác nội dung là `IDEMPOTENCY_CONFLICT`.

Radar sử dụng ba module hình học nâng cấp trong hệ thống model hiện có, với bộ thu quay
và màu phát sáng nhẹ ở cấp 3. Fog dùng một shader và texture visibility; terrain vẫn
stream theo camera, chỉ nạp chunk có đất đã biết. Mini-map hiển thị các ô đã biết và
vùng biên/tầm radar, không tạo mesh cho từng ô Hidden.
