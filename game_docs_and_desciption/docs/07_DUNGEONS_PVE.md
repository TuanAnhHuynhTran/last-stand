# 07 — Phó bản, PvE, boss, battle engine và chiến thuật hex

## Three scenes / authoritative states

- **WorldScene:** xây/kinh tế/patrol; không có PvP đột kích căn cứ riêng.
- **ExpeditionScene/BattleScene:** các instance độc lập, hex tactical turn-based.
- **SharedFrontierScene:** sự kiện multiplayer/PK; dùng battle engine chung nhưng bản đồ và rule khác.

## Dungeon types

| Loại | Objective | Kết quả/Reward |
|---|---|---|
| Trinh sát | Lấy thông tin, thoát an toàn, né patrol | Intelligence và điểm trên bản đồ |
| Cứu hộ | Tiếp cận/giải thoát NPC | Người tị nạn và nghề hiếm |
| Đánh chiếm | Vô hiệu báo động, giữ cổng, đánh chỉ huy | `sector_liberated`, claim opportunity |
| Khám phá di tích | Giải khóa/công nghệ, nhiều con đường | Old world data, blueprint |
| Boss | 2–3 phase hành vi (mẫu), terrain hazard | Rare material, tech unlock |
| Thủ thành | Giữ position qua các đợt | Defense resources/cosmetic |
| Hộ tống | Bảo vệ convoy trên path qua hex | Logistics unlock / supplies |
| Sinh tồn | Thoát an toàn với khẩu phần giới hạn | Exploration resources |
| Tổ đội | Nhiều player đóng góp units theo luật | Guild/co-op rewards |

Không nhất thiết mọi phó bản đều là diệt sạch kẻ địch. Có objective status và clear conditions riêng.

## Battle instance contract

- Tạo từ server bởi `missionId`, `squadId`, supply package, optional companion IDs, `idempotencyKey`.
- Freeze/load `battle_map_seed`, tiles (terrain cost/height/cover), unit snapshots (HP/status/equipment), objectives, active turn, AP and action log.
- 3–5 units/squad MVP, can extend later. Units trong battle bị lock assignment trên world.
- Actions: MOVE, ATTACK, SKILL, DEFEND, USE_ITEM, END_TURN, OBJECTIVE_INTERACT. Server **recalculates** range/LOS/path/AP/damage/random seed and validates ownership/turn.
- Client only requests intention, never authoritative damage/loot/sector clear.
- Battle sync: REST API sufficient for solo; Socket.IO for PvP/co-op and notifications.

## Tactical hex rules

- Hex neighbors directions consistent with world but battle can have its own local origin and tile scale; same axial math package.
- Pathfinding A* and reachable hex set by move budget, occupancy and terrain cost; height/cover/hazard.
- Line of sight uses hex-ray/path sampling and obstruction; unit elevation influences cover/range as configured.
- Status: poison, stun, guard, armor-break, suppressed (initial subset); statuses have duration/tick order.
- Bow: range, mobility; Crossbow: high armor penetration but reload/AP delay; Spear: counter charge; Sword: block/guard.
- Boss phase transitions at thresholds and/or objectives, animation and warning tiles, counterplay turns.

## Factions/AI

- Tro Tàn = squad tactics, covers, ranged formation, reinforcements.
- Dị Hóa = charge, poison, swarm, hazards.
- Người Gác Cũ = armor, traps, target marking, mechanical telegraphs.
- AI first version finite-state/utility scoring: target threat, distance, HP, cover, hazard and win objective; deterministic seed for replay/testing.

## Example quest: Trạm Canh Sương Mù

- Scenario: 8×10-ish hex tactical region (shape not rectangular grid), 3 player units vs 4 hostile. Objective rescue scout, optional jam signal tower in 6 turns.
- Preparation: squad 1 sword + 1 spear + 1 bow, basic rations.
- Rewards: scout survivor, intel and metal scrap. Victory updates quest event and visibility of an adjacent sector; **not automatically claim entire sector**.

## Example quest: Pháo Đài Gạch Vỡ

- Scout reveals wall, gate and commander; optional cut supply mission gives debuff to enemy.
- Objectives: disable alarm, seize gate, defeat commander; partial bonus if noncombatants saved.
- On victory: issue `sector.liberated` domain event, then create separate claim job if player orders outpost/builders.

## Rewards / failure / disconnect

- Reward grant has unique `battle_id + reward_type` or one reward-grant ledger; retries idempotent; no client-submitted loot.
- On defeat: wounds, supply consumption, optional cooldown; preserve private buildings and claimed tiles. No permanent PvP loot of personal world.
- On disconnect: recover from saved action log and turn state, explicit surrender/timeout policy for live modes; AI cannot invent outcome.

## Asset / UI

- Cute readable chibi at isometric scale, distinct silhouettes for 4 troop types and enemies. Animation states idle/run/attack/hit/knockout/victory, rig sockets for weapons.
- UI: turn order, AP, reachable hexes, target LOS, hit chance/cover, status, objectives, undo before commit only if not action executed, clear event log, skip animation option.

## Required tests

- Cannot move through blocked terrain/unit or beyond AP.
- LOS blocked by obstacles; enemy range and damage server-valid.
- Actor not active cannot act; lost connection cannot replay reward.
- Victory/defeat updates soldier injuries, mission/sector state, but not private asset ownership by PvP.
- Same seed/action sequence yields reproducible outcomes for test harness.
