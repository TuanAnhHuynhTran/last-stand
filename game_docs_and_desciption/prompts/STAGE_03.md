# CLAUDE CODE — Building Engine, 3-Level Houses, Walls, Gates & Towers

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/04_BUILDINGS_WALLS.md`, `docs/09_ART_UI_ASSETS.md`, `docs/11_DATABASE_AND_API.md`, `docs/15_ACCEPTANCE_MATRIX.md`.

## Demo cuối stage
Xây một nhà gỗ sân vườn đúng **1 hex**, nâng thành gạch mái ngói rồi **gạch hai tầng** vẫn 1 hex; xây kho/trung tâm; vẽ hàng rào dọc cạnh hex, thay gate, dựng tower, nâng hàng rào gỗ→gạch→đá. Reload giữ nguyên mọi thứ.

## Building engine
- Shared definitions `{code,minHex,maxLevel,footprint,levelConfigs,assetKeys,cost,prerequisites}`; fixed buildings and multi-hex placements.
- UI building palette, 3D ghost preview, rotate 60°, green valid/red invalid with reason, cost, cancel/undo.
- Server validates world owner, `PLAYER` tiles, slope, overlaps, roads/gates/terrain, resources; transaction+idempotency for construct, upgrade, move, demolish.
- `building_id` stable through upgrades, pose/footprint preserved; construction job stages and clear status states. Decor inside tiles only if nonblocking, other decor with occupancy.

## House / tiers
- 1: wood one-floor garden/short fence, 4 residential slots.
- 2: brick, tiled roof, stone path/yard, 6 slots.
- 3: two actual floors, balcony, tiled roof and improved garden, 10 slots.
- 3D GLBs distinct, correct footprint and no overhang clipping into neighbors. Other civil: commander 7hex, storage 2hex, market 3hex, clinic 2hex, woodshop 3hex, three levels each.

## Wall edge engine
- Canonical edge key from sorted axial endpoints, unique per world. Render corner/straight/end based on adjacency; handle height changes.
- 3 tiers wood / brick / stone with suggested PvE HP 100/260/550. Batch wall polyline input must be atomic and no duplicate reversed edges.
- Gate replaces an edge segment, OPEN/CLOSED/LOCKED and costs/tier; road+navigation graph updated when gate changes.
- Watchtower small anchored footprint/node, tier 1–3, guard slots and sight range for stage 8.
- Road basic on hex links, repair, batch upgrade, undo selection and construction blueprint format for later.

## DB / API
Migrate building_types, building_levels, world_buildings, building_footprints, construction_jobs, wall_segments, wall_gates, watchtowers, road_edges. Implement `/api/world/me/buildings`, `/{id}/upgrade|position|demolish`, `/api/world/me/walls` with gate convert/upgrades/repair.

## Tests
- Build forbidden outside owned land or on occupied tile; concurrent requests prevented.
- House upgrades lv1→3 preserving ID and one hex, costs charged once; reload correct asset/status.
- Opposite edge directions map same wall segment; gate open/closed changes traversability.
- Visually inspect fixed camera snapshots; placeholder models marked ASSET_MISSING.

**Không làm ruộng/ao tại stage 3; chỉ generic footprint system ready.**
