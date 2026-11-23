# CLAUDE CODE — Horse, Elephant, Mounts & Logistics Support

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/06_MILITARY_PATROLS.md`, `docs/05_ECONOMY_CITIZENS.md`, `docs/09_ART_UI_ASSETS.md`, `docs/11_DATABASE_AND_API.md`.

## Demo cuối stage
Ngựa 3D chibi hoạt động trong trại ≥9 hex và voi trong trại ≥12 hex, đều nâng cấp 3 cấp, ăn/uống/huấn luyện; binh sĩ đã đào tạo có thể cưỡi ngựa với nhân vật và thú cưỡi đồng bộ, voi vận chuyển đồ.

## Buildings and gameplay
- Horse tiers lv1 wooden stable+pasture (4 horses), lv2 brick+hay storage/arena (8), lv3 cavalry academy/care (12). Large pasture may be expanded separately; stable footprint remains ≥9.
- Elephant tiers lv1 fenced wide yard+small bathing pond (2), lv2 high shed/food storage (4), lv3 elephant training camp/vet/arena (6), starting footprint ≥12.
- Animals require feed/water/health/growth/taming/training; server authoritative resource and training jobs, no infinite mounts.
- Horse animations idle/walk/trot/gallop/eat/drink/rear/ride; elephant idle/walk/trunk/drink/bathe/carry.

## Rider and logistics integration
- `MountAssignment` unique horse ↔ one soldier; mount available only when trained, healthy, not on another task.
- Animation synchronization with `horse_saddle` rig socket, correct rider pose and weapon sockets, smooth mount/unmount; no overlapping geometry or teleporting.
- Horse/elephant as **support/mount system**, not additional base 5th unit. Mounted bow/spear variants can use equipment/mobility modifiers and later battle behavior.
- Basic convoy data `supply_route`, `cargo`, `destination`, `arrival_due_at` for transport support; no MMO-scale 3D simulation across entire map when offscreen.

## DB/API
Re-use `farm_animals`/species; add `animal_training_jobs`, `animal_assignments`, `animal_equipment`, `mount_assignments`, `convoy_jobs` if basic supply implemented. APIs farm management, mount assign/unassign, train, transport.

## Tests
- One horse cannot have 2 simultaneous riders; invalid/ill/untrained animal assignment rejected.
- Animals confined to pasture, capacity/food enforced, job/reward idempotent, persisted on reload.
- Anim rider sits correctly across idle/run/turn; elephant scale correct vs house/chibi NPC.
- Missing horse/elephant GLB recorded as asset gap, not incorrectly called complete.
