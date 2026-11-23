# 11 — Database schema và hợp đồng API v1

> Hướng dẫn triển khai, không phải migration SQL chạy trực tiếp. Khi viết migration cần điều chỉnh kiểu dữ liệu, khóa/index, naming conventions theo project đang có. Các bảng được đưa vào stage tương ứng, không tạo tất cả trong ngày đầu.

## Bảng theo domain

| Domain | Tables chính | Constraint trọng tâm |
|---|---|---|
| Auth / World | `users`, `user_sessions`, `worlds`, `world_resources`, `world_hex_tiles`, `world_chunks` | `worlds.owner_id UNIQUE` v1, `(world_id,q,r) UNIQUE` |
| Sector & discovery | `sectors`, `sector_tiles`, `sector_discoveries`, `world_scan_jobs`, `world_recon_jobs`, `world_claim_jobs`, `world_points_of_interest` | `(world_id,sector_key) UNIQUE`, `sector_tiles(tile_id) UNIQUE` nếu tile chỉ có 1 sector |
| Buildings | `building_types`, `building_levels`, `world_buildings`, `building_footprints`, `construction_jobs`, `upgrade_jobs` | Một ô `world_id,q,r` được footprint exclusive claim atomically; ngoại lệ decor nonblocking |
| Defense | `wall_segments`, `wall_gates`, `watchtowers`, `wall_repair_jobs`, `road_edges` | `(world_id,edge_key) UNIQUE`; gate replaces wall |
| Farming | `crop_types`, `farm_zones`, `farm_zone_tiles`, `crop_cycles`, `irrigation_networks` | tile unique per active farm zone |
| Animals / fish | `animal_species`, `livestock_farms`, `farm_animals`, `water_bodies`, `water_body_tiles`, `fish_species`, `fish_stock_batches`, `aquaculture_cycles` | capacity, owner, production event ledger |
| Civilians/economy | `survivors`, `professions`, `survivor_jobs`, `survivor_housing`, `production_recipes`, `production_jobs`, `resource_transactions`, `inventory_stacks` | ledger transaction keys unique, one full-time job/person |
| Military | `unit_types`, `military_units`, `equipment_types`, `unit_equipment`, `training_jobs`, `military_squads`, `squad_members`, `mount_assignments` | exclusive unit assignment, 1 rider/horse |
| Patrol | `patrol_routes`, `patrol_route_waypoints`, `patrol_assignments`, `guard_posts`, `alert_events`, `patrol_shifts` | owned units, valid paths, no concurrent battle |
| Battles/quests | `mission_definitions`, `player_missions`, `battle_instances`, `battle_units`, `battle_actions`, `battle_rewards`, `reward_grants`, `quest_events` | unique grant, action sequence/turn validity |
| Guild / PvP | `friendships`, `guilds`, `guild_members`, `guild_roles`, `guild_treasury_ledger`, `pvp_matches`, `rating_history`, `frontier_seasons`, `frontier_sectors`, `frontier_control_events` | role ACL, season isolated from private |

## Common fields and conventions

- Primary keys BIGINT/UUID consistently, created_at/updated_at (UTC), status enums validated by schema, `deleted_at` only where soft-delete needed.
- Financial/resource ledger: `idempotency_key`, `world_id`, `source_type`, `source_id`, `resource_code`, `delta`, `balance_after`, `created_at`. Never rely only on a mutable amount field without audit for important rewards.
- For world tiles, modified properties stored, generated terrain derived from `world_seed` + `generation_version`.
- Persist `building_type_id,level,anchor_q,anchor_r,orientation,job_state` and per-tile footprint rows. A multi-hex structure should not encode all occupancy solely as JSON.
- Wall `edge_key` built from sorted axial endpoints; gate is variant/type on the same edge row or a joined one-to-one row, not two competing segments.
- Server obtains world from authentication. Clients generally use `/api/world/me/...`, not arbitrary `world_id` access for personal mutations.

## Security response conventions

- All errors are JSON `{"error":{"code":"...","message":"...","details":{}}}` with appropriate HTTP status.
- 400/422 invalid payload, 401 unauthenticated, 403 forbidden, 404 inaccessible or missing, 409 concurrency/occupied, 429 rate limit.
- Mutations accept `Idempotency-Key` header for non-repeatable actions. Return resource versions/current balances on success.
- Use transaction and row locks/advisory patterns where backend supports them; avoid non-atomic check-then-insert. DB unique constraints must be final defense.

## Contract examples

### Build house

```http
POST /api/world/me/buildings
Idempotency-Key: bld-uuid-001
Content-Type: application/json

{"buildingType":"residential_house","anchor":{"q":1,"r":-2},"orientation":2}
```

```json
{"building":{"id":"b-101","type":"residential_house","level":1,"anchor":{"q":1,"r":-2},"orientation":2,"status":"CONSTRUCTING"},"jobId":"job-b101","resourceBalanceVersion":42}
```

Server recomputes footprint, cost, hex ownership, slope/obstacles; client cannot send `cost` or `level=3` to bypass progression.

### Upgrade building

```http
POST /api/world/me/buildings/b-101/upgrade
Idempotency-Key: up-uuid-001

{}
```

Return job and `nextLevel`; keep `building.id` same when complete.

### Place wall/gate

```http
POST /api/world/me/walls
Idempotency-Key: wall-uuid-001

{"edges":[{"q":0,"r":1,"direction":0},{"q":1,"r":1,"direction":1}],"type":"WOOD_WALL"}
```

Backend normalizes to canonical keys, validates each edge, resource totals and transaction atomicity. To replace wall with gate:

```http
POST /api/world/me/walls/{segmentId}/convert-to-gate
```

### Create patrol

```http
POST /api/world/me/patrol-routes
Idempotency-Key: patrol-uuid-001

{"name":"Bắc Thành","mode":"LOOP","waypoints":[{"q":3,"r":2},{"q":4,"r":2},{"q":4,"r":1}],"shift":{"start":"06:00","end":"18:00"},"unitIds":[101,102]}
```

Server checks unit ownership and availability and path graph against gate/wall edges.

### Scan, recon and claim

```http
POST /api/world/me/scans
Idempotency-Key: scan-uuid

{"center":{"q":5,"r":-2},"mode":"DIRECTIONAL"}
```

```http
POST /api/world/me/recon
{"sectorId":"sector-08","squadId":"scout-2"}
```

```http
POST /api/world/me/claims
Idempotency-Key: claim-uuid

{"sectorId":"sector-08","tileKeys":["4:-1","5:-1","5:-2"],"outpostId":"out-3"}
```

### Battle

```http
POST /api/battles
Idempotency-Key: battle-create-uuid

{"missionCode":"FORT_BROKEN_BRICK","squadId":"squad-12","supplyProfile":"STANDARD"}
```

```http
POST /api/battles/{battleId}/actions
Idempotency-Key: action-uuid

{"actorUnitId":"unit-5","turnVersion":7,"action":"MOVE","targetHex":{"q":2,"r":-1}}
```

Client never sends HP, damage, battle victory or reward amounts as authoritative values.

## API groups by stage

| Stage | API group |
|---|---|
| 01 | `/api/auth/*`, `/api/world/me`, `/api/world/me/resources` |
| 02 | `/api/world/me/chunks`, `/api/world/me/tiles` |
| 03 | `/api/buildings/catalog`, `/api/world/me/buildings/*`, `/api/world/me/walls/*` |
| 04 | `/api/world/me/farms/*`, `/api/world/me/irrigation/*` |
| 05 | `/api/world/me/livestock/*`, `/api/world/me/animals/*` |
| 06 | `/api/world/me/water-bodies/*`, `/api/world/me/fish/*` |
| 07 | `/api/world/me/survivors/*`, `/api/world/me/jobs/*`, `/api/world/me/production/*` |
| 08 | `/api/world/me/units/*`, `/api/world/me/training/*`, `/api/world/me/patrol-routes/*` |
| 09 | `/api/world/me/mounts/*`, `/api/world/me/animal-training/*` |
| 10 | `/api/world/me/scans`, `/api/world/me/recon`, `/api/world/me/claims`, `/api/world/me/sectors/*` |
| 11 | `/api/missions/*`, `/api/battles/*`, `/api/world/me/quest-progress` |
| 12 | `/api/friends/*`, `/api/guilds/*`, `/api/pvp/*`, `/api/frontier/*` |

## Migration / transaction requirements

1. All tables via forward-only numbered migrations with rollback strategy and pre-deploy backups.
2. For repeat-click build/harvest/claim, idempotency ledger plus transaction.
3. Index keys used by world-scoped queries and scheduling: `world_id`, `status`, `due_at`, `(world_id,q,r)`, `(world_id,edge_key)`, `(battle_id,seq)`.
4. No `sequelize.sync({force:true})` in normal operation. Test DB and seeded fixtures separate from production.
5. Define timezones in UTC and display local time only at client; job finish computed by server clock.
