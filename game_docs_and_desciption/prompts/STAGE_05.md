# CLAUDE CODE — Chibi Livestock Farms & Animal Behaviors

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/05_ECONOMY_CITIZENS.md`, `docs/09_ART_UI_ASSETS.md`, `docs/11_DATABASE_AND_API.md`.

## Demo cuối stage
Xây trại gà 6hex, nâng đến 3 cấp, nhận gà chibi đi lại/ăn/uống/nghỉ trong fenced yard, thu trứng vào kho; trại lợn 6hex, bò 9hex, dê/cừu 6hex dùng chung engine.

## Core systems
- FarmZone from building/footprint: main barn, fenced grazing cells, food/water points, max capacity; `AnimalDefinition` species, age/growth, hunger, thirst, health, breeding and output.
- Livestock 3 tiers: wood coop → brick barn/feed storage → improved multi-pen care, distinct assets and effect. Upgrade doesn't delete animals or occupy extra tiles automatically.
- UI: build/upgrade, purchase/rescue breeding stock, assign caretaker, fill feed/water, collect product, display health/capacity warnings.
- Resource chain: maize/grass/feed from stage4 to animals, eggs/meat/milk/manure to storage/fertilizer later.
- Animal behavior state machine idle/wander/eat/drink/rest/react; visually smooth movement in allowed farm tiles, gate/fence collision; no teleport through house/water.
- Use rigged GLB idle/walk/eat/drink. LOD/animation culling; server calculates production/growth offline, never persist animal position each frame.

## DB/API
`animal_species`, `livestock_farms`, `farm_animals`, `livestock_production_jobs`, `animal_feed_recipes`; CRUD for management not deletion of owned livestock without confirmation; APIs create farm, upgrade, expand, stock, feed, harvest and status.

## Tests
- Min area + occupancy validated; species placed in correct farm and within capacity.
- No infinite yield without water/feed. Aging/breeding limited and repeat job idempotent.
- Animals stay fenced in visual test, close-up animations play, no performance drop at many farms.
- Reload preserves animals, food, tier, production jobs; owner isolation verified.

**Do not implement horse/elephant here; reuse this engine later in stage09.**
