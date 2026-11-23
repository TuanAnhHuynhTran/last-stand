# 03 — Thế giới 1000×1000, Hex Grid, Fog of War, Sector và tái chiếm

## Hệ tọa độ và kích thước

- World bounds định nghĩa trên mặt phẳng `x,z ∈ [0,1000]` (đơn vị mét game) và `y` là độ cao. Tọa độ world origin được chọn và cố định, tài liệu/API thống nhất.
- Hex **pointy-top**, axial `(q,r)`, center-to-center distance `d=10m`. Với bán kính ngoại tiếp `s=d/√3≈5.7735`, diện tích một tile là `3√3/2*s²≈86.60m²`.
- World có khoảng `1,000,000 / 86.60≈11,547` hex lý thuyết nếu phủ đầy; do rìa cắt theo hình vuông, số tiles hợp lệ là **giá trị tính từ world bounds**, không hardcode 11,547.
- Đất khởi đầu xấp xỉ `10,000m²` => khoảng 115 hex liền kề, không bắt buộc có đường biên hình vuông hoàn hảo; trung tâm world gần (500,500).
- Tỷ lệ initial 1% claimed, 9% neutral, 90% hostile **tính trên playable area**. Dữ liệu được phân phối theo sector, không ngẫu nhiên từng tile.

## Axial math bắt buộc (pure functions)

```ts
export const HEX_DIRECTIONS = [
  [1,0], [1,-1], [0,-1], [-1,0], [-1,1], [0,1]
] as const;

export function axialDistance(a:{q:number;r:number}, b:{q:number;r:number}) {
  const dq=a.q-b.q, dr=a.r-b.r;
  return (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2;
}
// pointy-top reference; must be consistent with chosen world origin:
// x = sqrt(3)*s*(q + r/2), z = 1.5*s*r
// invert using cube-round, never round q/r independently.
```

Test neighbors, reverse transform, negative coords, borderline cells, rotation in 60° increments, path length and canonical edge mapping. **Hex is logical navigation/build coordinate; visual terrain mesh is continuous.**

## World generation

`seed` deterministic → biome macro noise → elevation/moisture → roads/river/POI → sector partition → faction occupation → initial safe zone. Terrain/chunk regeneration must give the same results for a given seed and generation version. Persist edited chunks, terraforming, discovered info, buildings, wall edges and zone state. `world_generation_version` is stored to allow migration when generator changes.

## Sector model

A sector = connected set of 15–50 hex (design range, exceptions allowed for terrain edge), with:
- `sector_id`, `world_id`, `name`, `biome`, `faction_id`, `threat_tier`.
- `recon_level`, `fort_id`, `supply_route_state`, `liberation_state`, `recovery_level`, `rewards`, `objectives`.
- Ownership is still tracked on tiles. Sector is strategic unit, not a replacement for tile records.

`liberation_state` proposed: `OCCUPIED`, `RECONNED`, `ASSAULT_AVAILABLE`, `LIBERATED`, `CLAIM_IN_PROGRESS`, `CONTROLLED`. Some neutral sectors go `NEUTRAL` → `CLAIM_IN_PROGRESS` → `CONTROLLED` without combat.

## Tile state as independent dimensions

Avoid one ambiguous status field. Store:
- `discovery_status`: `HIDDEN | SCANNED`.
- `control_status`: `NEUTRAL | HOSTILE | LIBERATED | PLAYER`.
- `claim_job_id` nullable.
- `terrain_remediation_status`: `NONE | CONTAMINATED | REMEDIATING | STABLE`.
- Build eligibility computed `PLAYER + stable terrain + valid slope/footprint + constraints`, **not solely by scanned**.

## Scan / recon / liberation / claim sequence

1. **Scan:** Radar reveals selected cells in range. Check energy and scan capacity. Return only approved discovered data, not hidden unit/resource internals.
2. **Recon:** Scout mission on a revealed hostile sector; `intel_level` unveils enemy composition, trap, terrain and supply weak points. Random encounter can create a short dungeon.
3. **Prepare:** squad + supplies + optional weakening side missions; backend validates eligibility and locks assigned units while battle is active.
4. **Assault:** Battle instance (tactical hex) validates win. On success, `sector` switches `LIBERATED`; battle `reward_grant` is idempotent.
5. **Claim:** One or more connected blocks within liberated/neutral area need marker/outpost, workers/materials and reachable supply. They switch to `PLAYER` only when server job finishes.
6. **Restore:** Clean rubble, water, radiation; restored terrain enables agriculture, housing and ecosystem improvements.

**Never require a separate battle per tile.** Liberating one sector opens claim of several tiles, with optional special POIs requiring another encounter.

## Initial world generation constraints

- Safe center territory must be connected, buildable, contain water access and several farmable clusters ≥6 hex, one free site ≥12 hex or equivalent room for expansion.
- Hostile sectors not adjacent in a way that soft-locks beginner; at least 2–3 reachable neutral directions.
- Story key POIs guaranteed within campaign progression range, even across different random seeds.
- Sector graph must have a reachable route toward all story chapters; seed validator rerolls layouts until critical path is valid.

## Hex chunk/terrain rendering

- Chunk partition stable from axial coords (choose chunk width such as 16 or 24 q/r cells in logical storage but preserve hex adjacency); chunk cache and revision in API.
- Generate terrain mesh seamless across boundaries via consistent shared sampling; no cracks, z-fighting or visible floating hex slabs.
- Overlay for build/scan/combat; no permanent thick grid in normal world view.
- Avoid client generating rare POI secrets before scan. Public geometry can be deterministic, metadata server-gated.
- Loading: initial nearby chunks, camera-based streaming, LOD/culling/InstancedMesh vegetation.

## Example API

```http
GET  /api/world/me/chunks?qMin=-10&qMax=10&rMin=-10&rMax=10
POST /api/world/me/scans
POST /api/world/me/recon
POST /api/world/me/claims
GET  /api/world/me/sectors
GET  /api/world/me/sectors/:sectorId
```

`scan` input `{ center: {q,r}, mode:"directional", idempotencyKey:"..." }` and response with job ID / status. Claim input `{tileKeys:["q:r"...], outpostId?, idempotencyKey}`; server checks adjacency, unlock, supplies, and overlapping claims. Avoid client sending `result: success`.

## Gameplay tests and acceptance

- `same seed + version` generates same tiles/sector graph; different seeds differ; starter always valid and connected.
- Scan only reveals permitted cells, does not grant ownership; recon cannot run on hidden sector.
- Win causes sector `LIBERATED` but no build permission until claim confirmed.
- Claims validate connectedness, world bounds, hostile/neutral rules, capacity, supply, duplicates.
- Two players never mutate each other's world. Concurrent claims don't double-spend.
- World remains unchanged on reload; private ownership does not reset on season/PvP loss.
