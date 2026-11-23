# CLAUDE CODE — Chibi Citizens, Jobs, Storage & Living Economy

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/05_ECONOMY_CITIZENS.md`, `docs/04_BUILDINGS_WALLS.md`, `docs/10_TECH_ARCHITECTURE.md`, `docs/11_DATABASE_AND_API.md`.

## Demo cuối stage
Làng có NPC chibi ra khỏi nhà, đi theo đường hex tới ruộng/kho/trại/ao, làm việc và về nhà. Player phân công nghề, sản xuất dựa trên người và nguyên liệu; kho đầy dừng/giảm sản lượng; save/reload chính xác.

## Data model and logic
- `survivor` has id/name, home building, job, work building, skills, health/stamina/morale, busy status. Seed 5 survivors initial (or preserve existing seeded setup).
- Housing caps 4/6/10 from house tiers but **number of occupants** separate; new people from refugees/rescue/migration event; no automatic population jump when house completes.
- Jobs farmer, farmer caretaker, fisherman, lumber worker, builder, smith, transporter, healer; one full-time assignment per citizen; military cannot simultaneously consume full civilian work slots.
- Resource recipes and production/service: crops/animals/fish from previous stages, crafting, water/food consumption, storage capacity and spoilage later.
- Offline production based on due times/last-calculated UTC and locked inputs, bounded by capacity, repeated login idempotent. No server-side frame simulation.

## NPC visual behaviors
- Standardized chibi rigs 2.5–3.5 head ratio: idle/walk/carry/work/eat/rest/talk; clothes/tools variants per job.
- Hex A* route graph with preferential road cost and wall/gate blockage; smoothed world-space movement, occupancy handling and fallback if no path. When gate closes, reroute or clear warning; don't teleport through.
- State schedule day/work/evening/sleep configurable. For offscreen/world-offline calculate aggregate, not every NPC visual state.

## UI and notifications
- Citizen list, homes/housing vacancy, job assignments, skill, health, workplace, location/status; resource net flow over time and inventory capacity; warning on shortages and insufficient path.
- Player can auto-assign jobs by priority; keep deterministic/stable strategy and ability to override.

## DB/API
`survivors`, `professions`, `survivor_housing`, `survivor_jobs`, `production_recipes`, `production_jobs`, `inventory_stacks`, `resource_transactions` and optional `world_time_states`; APIs `/api/world/me/survivors`, job assignment, housing, production summary.

## Tests
- No double full-time job, house cannot overfill without explicit temporary shelter rules.
- Path blocks through CLOSED gates/walls, road preference works, no collision penetrations.
- Production exact once per completed cycle, offline bounded, no negative inventory, server ownership checks.
- NPC animation and positions reasonable at different camera zoom; store authoritative data not per-frame animation.

**Do not implement guild/social in stage 07.**
