# CLAUDE CODE — Chibi 3D Hex World, Terrain & Camera

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/03_WORLD_HEX_RECLAMATION.md`, `docs/09_ART_UI_ASSETS.md`, `docs/10_TECH_ARCHITECTURE.md`, `docs/15_ACCEPTANCE_MATRIX.md`.

## Demo cuối stage
Đăng nhập thấy vùng xanh an toàn chibi 100×100 gần trung tâm thế giới, nhìn xa thấy rừng/đồi/sông/hồ, camera pan/zoom/rotate, hover/click đúng hex. Terrain tự nhiên liền mạch, grid bật khi ở build mode.

## Logic hex
- Implement shared `HexMath` with pointy-top axial `q,r`, center spacing=10m, axial/world conversion, cube-round, six neighbors, distance/ring/disk, ownership bounds, canonical edge helper.
- Unit test math với negative coord, boundary, six rotations and round-trip world→hex→world.
- World bounds x/z 0..1000, no square grid replacement. Starter ~115 hex contiguous with enough buildable patches; consistent with DB initial seed.

## World generator
- `WorldGenerator`, `BiomeGenerator`, `TerrainMeshBuilder`, `ChunkManager`, `WorldInteractionController`, `HexOverlay`.
- Deterministic seeded macro-noise for terrain, moisture and vegetation. Stable across session and chunks; `generation_version` retained to avoid silently changing existing worlds.
- Macro biomes include grass, farmable flats, forest, rolling hills, lakes/rivers, rubble. Smooth stitched mesh at chunk edges, no floating standalone hex prisms.
- Store only modified/discovered tiles where possible. API area/chunk queries with authorized read and fog-safe metadata.

## Visual style and controls
- Rounded stylized trees (variants), cute rocks, grass clusters, water color/transparency and shore edge; stylized light/shadow consistent with chibi art bible.
- Camera isometric with damped pan/zoom/rotation and focus; raycast picks axial tile accurately even on slopes.
- Mode normal hides heavy hex grid; build/scan shows edges and legal land status. Tooltip q/r/terrain/ownership without exposing hidden secrets.
- `InstancedMesh` for repetitive foliage, culling, lazy chunks, LOD, configurable low/medium/high.

## Tests / acceptance
- Same seed+version yields same biome and POIs; no cracks on chunk borders, no holes near world boundary.
- Picking accuracy after camera rotation; no selecting out-of-world tiles.
- Chunk loading local to camera; reasonable performance with representative many logical hexes; benchmark hardware/data.
- Asset missing recorded in manifest; primitive blockout explicitly flagged, not called visual final.

**Không xây nhà/AI chi tiết; stage này cung cấp 3D engine cho những hệ sau.**
