# CLAUDE CODE — Four Chibi Troop Classes, Training & Base Patrol

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/06_MILITARY_PATROLS.md`, `docs/04_BUILDINGS_WALLS.md`, `docs/09_ART_UI_ASSETS.md`, `docs/11_DATABASE_AND_API.md`, `docs/15_ACCEPTANCE_MATRIX.md`.

## Demo cuối stage
Huấn luyện đủ **đao/thương/cung/nỏ**, thấy animation đúng; tạo 2 tổ lính, vẽ tuyến đi tuần quanh khuôn viên qua đường/cổng/tháp, phân công ca ngày/đêm; lính tuần tra/đứng gác, pause/resume và reload vẫn đúng.

## Training and roles
- Barracks: sword≥6, spear≥6, bow≥6, crossbow≥6, forge≥6, general drill≥9, supply store≥6, 3-tier buildings with visible wood→brick→fortified transitions.
- Training depends on available citizens, equipment, food, slots, time. Server creates training job; one person→one soldier ID, not free spawn. Barracks max slots proposed 2/4/6, config not UI hardcode.
- Four unit configs distinct: sword melee+guard, spear reach/anti-charge, bow ranged mobility, crossbow armor pierce with reload. Stats and abilities configurable, battle use later.
- Rigged chibi animations sword swing/parry, spear stab/brace, bow draw/fire, crossbow load/fire; equipment attached correctly.

## Patrol editor (must implement now)
- Patrol mode: select unit/squad, draw waypoints via hex, auto A* valid route, preview loop; choose LOOP/PING_PONG/ONESHOT, start/end shift and alert policy; save via API.
- Unit states `RESERVE`, `TRAINING`, `PATROLLING`, `GUARDING`, `RESTING`, `ALERTED`, `RETURNING`, `IN_BATTLE`, `INJURED`. No conflict among assignments.
- Standing posts at gate/watchtower and rapid response rally point. Tower range modifiers, archers/crossbows slots; closed gate changes navigation, invalid patrol route must show warning.
- After reload restore schedule, route and current logical state; visible chibi movement interpolated, no server tick per soldier frame when offline.

## Defense mode
- Normal/Alert/Emergency; alert sends troops to rally/corridor and notifies player. Actual attack on private base occurs in **PvE defense instance** stage11; at this stage do not fake battle or delete any assets.

## DB/API
`unit_types`, `military_units`, `training_jobs`, `military_squads`, `squad_members`, `equipment_types`, `patrol_routes`, `patrol_route_waypoints`, `patrol_assignments`, `guard_posts`, `patrol_shifts`, `alert_events`; endpoints train, squad, patrol create/update/pause/assign, guard post and mode.

## Tests
- Cannot recruit from unavailable citizens/resources; graduation idempotent.
- Soldier can't patrol and be battle assigned simultaneously, route can't cross wall closed gate.
- Change gate while patrol active triggers replan and safe state; no jump across wall.
- Shifts and fatigue work, state persisted; training buildings each have distinct 3D tier.

**This stage completes living defensive garrison, not PvP or live siege.**
