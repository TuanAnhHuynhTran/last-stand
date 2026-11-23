# CLAUDE CODE — Guilds, Optional PvP, Shared Frontier & Production Polish

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/08_PVP_GUILDS.md`, `docs/09_ART_UI_ASSETS.md`, `docs/10_TECH_ARCHITECTURE.md`, `docs/12_BALANCE_QA_SECURITY.md`, `docs/15_ACCEPTANCE_MATRIX.md`.

## Demo cuối stage
Two users authenticate and visit one another read-only; can invite friendly duel, play server-authoritative battle, rejoin on disconnect, receive exactly one reward. Guild can form, invite and contribute to common objectives. Shared Frontier demo fort has seasonal control unrelated to private ownership.

## Social/guild APIs
- Friendship invitations with accept/decline/block as needed; social profile privacy and world visits `PUBLIC/FRIENDS/PRIVATE`.
- Guild create/invite/join/leave, Leader/Officer/Member RBAC, guild chat with moderation/rate limits, guild quest contribution and treasury ledger with safe withdrawal permissions.
- Visit scene read-only; cannot use visitor client to invoke another world’s building/harvest/recruit mutations.

## PvP modes and fairness
- Reuse Stage11 BattleEngine, never rewrite alternate logic.
- Start with 1v1 friendly duel and ranked; room/lobby, squad selection, server turn validation, reconnect, grace-time/forfeit policy, match history and rating changes.
- Stretch features 2v2, guild boss cooperative instance, guild wars and Capture Flag are separate acceptance items; if not implemented, feature flag them off.
- Matchmaking guards against severe unit power difference, rank and rewards bounded for fair progression.

## Shared Frontier
- Distinct map/entity model from `worlds`, `frontier_seasons`/`frontier_control` and guild objective ownership. Event season reset modifies only frontier tables, **never** claimed tiles/private buildings.
- Control schedules and locked snapshot of squad; end-of-event one-time reward grant, no private world destruction.

## Realtime/infra
- Socket.IO authenticated per user, room ACL, ack/action sequence IDs and deduplication, missing-event replay; Redis adapter only when multi-node.
- Server controls combat state and guild actions. Rate limit chat/actions, verify membership permissions, ownership and audit logs.

## Visual/technical polish
- Validate all chibi building tiers, ponds, farms, walls, patrol, NPC, animals, troop rigs; asset manifest READY/PLACEHOLDER/ASSET_MISSING.
- Lighting/day-night/weather as budgets permit; options for shadow, vegetation, LOD and audio volumes.
- Profile draw calls, FPS, frame time, GPU memory, chunk streaming, DB p95 and initial load on named hardware/scenes; target 60FPS typical, ≥30 low presets, do not claim unmeasured success.
- Backup and migrations, deployment config, security review, error monitoring, E2E smoke all systems and regressions.

## Tests / release gates
- Private world security: visitor no edit, PvP win/loss never deletes homes/land/animals.
- Guild RBAC, treasury anti-double-spend, season reset isolated.
- Socket reconnect and battle rewards exactly once, invalid client damage rejected.
- All stage end-to-end flows pass (or blockers explicitly documented), asset status truthful, build/test report and release runbook.

**If only partial guild features are ready, report as Beta/Partial, not production complete.**
