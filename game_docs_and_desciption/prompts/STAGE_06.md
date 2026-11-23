# CLAUDE CODE — Editable Hex Pond, Water Body & Aquaculture

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/05_ECONOMY_CITIZENS.md`, `docs/03_WORLD_HEX_RECLAMATION.md`, `docs/09_ART_UI_ASSETS.md`, `docs/11_DATABASE_AND_API.md`.

## Demo cuối stage
Chọn 6 hex, đào thấp terrain, tạo ao liền nước có bờ tự nhiên, thả cá chibi bơi, cho ăn, thu hoạch, nâng cấp 3 tiers và mở rộng; không khe hở/kè sai.

## Terrain and geometry
- `Dig Pond` mode selects connected owned tiles >=6, validates existing buildings, elevation, proximity/availability of water, construction cost.
- Server persists terraforming edits to tiles and water body; client rebuilds terrain and shore external edges only, removes shared internal shore when expanding.
- Continuous water mesh at chosen elevation, no flat painted tile masquerading as pond. Polygon/boundary triangulation can derive from connected hex collection, with mesh smoothing near neighbors.
- Water chibi: subtle ripples, transparency, reeds/rocks, cute wooden bridge/dock, capacity/quality UI.

## Pond tiers and cycles
- Level1 earth bank + small wooden pier; level2 stone reinforced shore + sluice/feed point; level3 filter/aerator + harvest station; footprint shape unchanged on upgrade.
- Pond ≥6, large lake ≥12, fish hatchery ≥6, cage fish area ≥6 water tiles.
- Species carp/tilapia/catfish/snakehead with growth/health/feed/water quality/density; production server timestamp, stocks ledger.
- Fish near camera animate swim/turn/group, constrained inside water shape and depth. Distant ponds optimized via aggregate VFX and lower quality simulation.

## DB/API
`water_bodies`, `water_body_tiles`, `fish_species`, `fish_stock_batches`, `aquaculture_cycles`, `water_quality_records`; endpoints dig/expand/upgrade/stock/feed/harvest/query.

## QA
- Reject invalid/disconnected/less-than-6/occupied/world-outside selection.
- Expand any irregular pond; seamless shore, no z-fighting water, no edge holes in adjacent chunk.
- Fish cannot swim onto land, capacity and feed enforced, harvest once only, restored after reload.
- Performance benchmark with 10+ visible ponds and fish counts; detail scales with camera.

**Do not simulate physical hydrodynamics or fluid solver; deterministic gameplay quality model is sufficient.**
