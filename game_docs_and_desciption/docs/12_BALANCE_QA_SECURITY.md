# 12 — Balance knobs, QA, performance và security gates

## Configurable starter values (đề xuất để playtest)

| Parameter | Starter default | Ghi chú |
|---|---:|---|
| World size | 1000×1000 m | Fixed product contract |
| Starter area | ~10,000m²/~115 hex | Shape approximate |
| Hex center spacing | 10m | Fixed geometry baseline |
| Occupied/neutral/claimed | 90/9/1 % | Approx area, sector-driven |
| House population cap Lv1/Lv2/Lv3 | 4/6/10 | Proposed |
| Basic wall HP 1/2/3 | 100/260/550 | PvE simulation starter |
| Barracks training slots 1/2/3 | 2/4/6 | Proposed |
| Horse farm capacity 1/2/3 | 4/8/12 | Proposed |
| Elephant camp capacity 1/2/3 | 2/4/6 | Proposed |
| Tactical squad size | 3–5 | MVP target |
| Farm plot minimum | 6 hex | Fixed baseline |
| Farm expansion block minimum | 6 hex | Fixed baseline |
| Max render goal | 60fps typical / 30fps low | Must profile; not guarantee |

Config should be in shared JSON/DB seed by balance version. Never freeze costs/times inside UI components.

## Balance framework

- Resource economy: every generator has sinks, capacity, energy/worker/water/food constraints and overflow behavior.
- Military economy: maintenance/food/training/equipment prevent all citizens being recruited without consequences.
- PvP fairness: matchmaking, normalized map objectives and bounded buffs; cosmetics as primary competitive rewards.
- Land: sector rewards tuned to construction needs; no mandatory raid per hex; claim material/time increase gradually, clear signals before commitment.
- Offline: warnings/debuffs before severe penalties; no loss of claimed world, animals or homes while away due to random PvP.

## Testing pyramid

**Unit:** hex math/canonical edge, footprint rotations, state machines, production formula, battle AP/path/LOS/turn, quest progress, resource deltas, idempotency keys.

**Integration:** build and upgrade transactions; multiple concurrent claims; scan hidden permissions; gate edge uniqueness; training graduation; patrol assignment conflict; harvest twice; reward claim once; trade/guild treasury ACL.

**E2E:** register → world generated → house built/upgraded → six-hex farm → livestock → pond → assign citizens → train four classes → patrol through gate → scan/recon → battle win → claim sector → save/reload → social mode.

**Visual:** comparison screenshots at fixed camera/seed; chibi proportions, assets appear correct, terrain/pond/wall seams, NPC/animal weapons/no clipping, level changes.

**Performance:** sample scenes small/medium/large with defined object counts, FPS, p95 frame time, CPU/GPU memory, draw calls, initial load, API p95, chunk load time, DB queries. Record machine specs and scene seed.

## High-risk bugs to test

- Two requests attempt same hex/build footprint at the same time.
- Two wall requests refer to same edge in opposite directions.
- Upgrading multi-hex farm unexpectedly loses tile ownership.
- Claim on territory not liberated; client reveals unscanned intel.
- Gate closes while NPC/soldier is on route; never teleport through wall.
- Unit used for patrol and battle concurrently.
- Asset GLB failed → fallback shows `ASSET_MISSING`, not invisible scene.
- Offline simulation repeated on reconnect → double resources.
- Battle reward duplicate after refresh/reconnect.
- Guild season reset accidentally mutates private-world tables.

## Security

- Zod request validation, authorization and world ownership derived from session.
- Rate limit scanning/claiming/battle, prevent ID enumeration, sanitized chat/log output.
- SQL via Sequelize parameterization; never interpolate user inputs into raw queries.
- Cookies secure/HttpOnly and CSRF strategy where relevant; no secrets in frontend.
- Reward/resource ledgers + idempotency; server calculates costs and results.
- Per-guild RBAC and treasury permissions; websocket room ACL and sequence validation.
- Player-uploaded images/asset mods not in MVP; if later added, validate content and size.

## Stage acceptance report

Use `templates/STAGE_COMPLETION_REPORT.md`. If a required visual/model is still placeholder, mark `PARTIAL — ASSET_MISSING`, not DONE. If integration DB isn't accessible, mark `BLOCKED — ENVIRONMENT`, still ship code/tests and document exact reproducible commands.
