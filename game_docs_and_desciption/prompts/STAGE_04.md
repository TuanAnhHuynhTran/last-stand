# CLAUDE CODE — Agriculture, Farm Zones, Crop Growth & Irrigation

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/05_ECONOMY_CITIZENS.md`, `docs/04_BUILDINGS_WALLS.md`, `docs/09_ART_UI_ASSETS.md`, `docs/11_DATABASE_AND_API.md`.

## Demo cuối stage
Người chơi chọn >=6 hex liền kề, vẽ ruộng lúa hình không đều, gieo hạt, quan sát chibi lúa xanh→chín vàng, thu hoạch và nhận rice vào MySQL; nâng ruộng cấp 1→3 không đổi diện tích; mở rộng bằng cụm ≥6 hex.

## Functionality
- FarmZone tool: click/drag area, add/remove cells, validation connectedness, owned/buildable, min area 6, no overlap, cancel/undo. Additional ≥6 hex expansion can merge into zone with contiguous test.
- Crops `rice`, `maize`, `vegetable`, `orchard`, `grass`. Growth stages, soil fertility, water need, working skill, yield and duration are versioned configs.
- Water: wells, ponds/reservoirs (pond production in later stage), canals / irrigation edges, reachability and flow simplified, no expensive fluid simulation.
- Level 1 earthen ridges/manual labor; lv2 ditch/shack/road; lv3 cute pump/treatment and transport. Procedural perimeter modules must work for irregular zone footprint.
- Crop rendering uses GPU instanced meshes, seeded variation, 4+ visually distinct stage assets/variants, gentle wind, seasonal color where appropriate.
- `FarmService` computes progress based on server clock and conditions, not `requestAnimationFrame` or local time; max storage and worker/water constraints.
- If full NPC not available until stage 7, use limited animated farming workers explicitly tagged representational and hook up actual job assignments later; no false claim AI finished.

## DB / API
`crop_types`, `farm_zones`, `farm_zone_tiles`, `crop_cycles`, `irrigation_networks`, resource transaction ledger. Endpoints create/extend/upgrade/plant/harvest/inspect. Prevent double-harvest or double resource issue.

## QA
- Reject 5 tiles, disjoint, foreign or occupied tiles, duplicated tile identifiers; pass irregular 6/12+ areas.
- Plant→offline elapsed→harvest persists, zero water impacts yield, not arbitrary broken/negative.
- Upgrade keeps crops/tiles state and id, reload crops at correct growth stage.
- Irrigation graph connected only if valid water source, no canal cutting through invalid wall/gate.

**Stop after one functional complete rice slice and consistent behavior for other crops, no livestock yet.**
