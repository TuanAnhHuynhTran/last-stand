# CLAUDE CODE — Hex PvE Battles, Dungeons, Bosses & Reclamation Bridge

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/07_DUNGEONS_PVE.md`, `docs/02_STORY_CAMPAIGN.md`, `docs/03_WORLD_HEX_RECLAMATION.md`, `docs/06_MILITARY_PATROLS.md`, `docs/11_DATABASE_AND_API.md`.

## Demo cuối stage
Player picks troop squad, enters a **separate** turn-based 3D chibi hex battle, moves/attacks with AP, fights AI, completes objective, receives idempotent rewards and returns to private world. Winning “Pháo Đài Gạch Vỡ” liberates sector; subsequent outpost claim unlocks land in build mode.

## Battle engine
- Reuse shared hex math, separate battle scene/instance with local tile coords, movement costs, cover, elevation, LOS, hazards.
- Server authoritative `battle_instance` snapshot, actor units, turn version/AP/HP/skills, objective states and event log. Client sends intent (`MOVE`, `ATTACK`, `SKILL`, `DEFEND`, `ITEM`, `INTERACT`, `END_TURN`) only.
- Initial squad 3–5 units, sword melee/guard, spear reach/anti-charge, bow mobile ranged, crossbow armor-pierce reload. Unit equipment and injury persist after match.
- AI: Tro Tàn uses formations/ranged, Dị Hóa rush/poison/boss, Người Gác Cũ armored traps; finite state/utility score first.
- Boss multi-phase telegraphs with readable hex warning zones. Camera focus, animations chibi, hit numbers, turn queue, mission objectives, victory/failure summaries.

## Dungeon types MVP
- Scout rescue “Trạm Canh Sương Mù”: 3–5 units, rescue objective, optional alarm suppression.
- Sector “Pháo Đài Gạch Vỡ”: disable alarm, seize gate, defeat commander, returns domain event `sector.liberated`.
- Boss “Dòng Sông Đen”: contamination hazards, phase changes, filtration unlock.
- Later extension hooks: dungeon secrets, escort convoys, siege PvE, coop; don't claim these fully built until implemented.

## Integration with world
- Starting battle locks units from patrol/reserve assignments, validates rations, squad and mission prerequisites.
- Victory issues reward one-time (ledger) and faction/quest updates, **not immediate PLAYER tile ownership**. Claim/outpost operation remains separate and uses stage10 rules.
- On defeat, units may be injured and supplies spent but no permanent private-world buildings/land destroyed.
- On disconnect, reconstruct state from action log/version, no reward duplication, explicit timeout handling.

## DB/API/tests
Migrate battle_instances, battle_units, battle_actions, battle_turns, battle_rewards, reward_grants, player_missions. Implement `POST /api/battles`, `/api/battles/:id/actions`, `/api/battles/:id/end-turn`, battle state/query, quest progress.

Test moving through blocked, invalid LOS, non-active turn, AP overuse, replay duplicate reward, invalid battle actor, disconnect/rejoin, sector status update and claim gating. Visual tests of all four troop animations and boss indicators.

**No PvP yet.**
