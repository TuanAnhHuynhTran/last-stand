# 15 — Ma trận nghiệm thu và Definition of Done

Mỗi stage phải kiểm thử tối thiểu các tình huống dưới đây; case không áp dụng ghi N/A, chưa test ghi NOT TESTED và lý do.

| Stage | Functional pass | Persist/API pass | Visual pass | Negative/concurrency case |
|---|---|---|---|---|
| 01 | Register→login→own world | MySQL users/worlds/tiles | Chibi app shell | 2 users isolation, repeated registration |
| 02 | Hover/pick correct hex | Chunk/seed persistence | Natural chibi terrain | Border/negative coords, no cracks |
| 03 | Build house 1hex lv1→2→3, place gate/wall | DB building/edge jobs | Three distinct models, no clipping | Duplicate tile/edge, batch atomicity |
| 04 | 6hex rice growing→harvest | Server timestamps + ledger | 4+ visible growth stages | Nonconnected zone, harvest twice |
| 05 | Animal farm feeding/production | Animal population persisted | Chibi idle/walk/eat | Escape fence, overcapacity |
| 06 | Dig 6hex pond→fish→harvest | Water and fish cycle persisted | Water/shoreline seams correct | Pond overlap, duplicate harvest |
| 07 | NPC homes/jobs/route/production | Assignments + offline calc | Work/carry/rest animations | Same worker double-job, gate blocked |
| 08 | Train 4 units, save route/shift | Training and patrol persisted | Four rigs/animations, guard at gate | Patrol+combat conflict, closed gate |
| 09 | Horse rider, elephant care | Mount exclusivity and health | Chibi horse/elephant/ride | Double-rider, outside farm bounds |
| 10 | Scan→recon→liberated?→claim | Tile control + sector jobs | Fog transition, POI visibility | Scan≠claim, occupied/no fight denied |
| 11 | Battle roundtrip updates quest | Action log + idempotent reward | Battle animations clear/readable | Move/AP exploit, disconnect/replay |
| 12 | Visitor/PvP/guild activity | Role/ACL/rating/season | Full UI/asset polish | Guild reset doesn't touch private |

### Gates of completion

- **Functional:** controls cause real behavior, state transitions correct.
- **Persistence:** API validated, DB migration/rollback strategy, reload accurate, transaction, ownership enforced.
- **Art:** proper chibi asset or explicit `PARTIAL — ASSET_MISSING` label, no fake final result.
- **Quality:** lint/typecheck/unit/integration/build, E2E where applicable, profiling when heavy 3D.
- **Documentation:** changed files, API contracts, migration list, tests/outcomes, remaining blockers.

### End-to-end smoke scenario

Create account → world 1% land → house lvl1→lvl3 → 6hex rice + irrigation → gà/trại + fish pond → assign 5 NPC → wall/gate/watchtower → train four troop types → draw loop patrol through gate → scan sector → recon → win story dungeon → mark liberated → build outpost/claim → reload persists → visit friend read-only → optional PvP; every mutation server authoritative.
