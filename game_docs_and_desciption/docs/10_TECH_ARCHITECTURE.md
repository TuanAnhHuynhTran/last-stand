# 10 — Kiến trúc phần mềm, code standards, hiệu năng và state ownership

## Tech stack baseline

- Frontend: React + TypeScript + Vite, R3F + Three.js + Drei, Zustand for UI/render state, TanStack Query for server state, Tailwind/shadcn UI.
- Backend: Node.js LTS, Express + TypeScript, Sequelize + mysql2/MySQL 8, Zod; Socket.IO when realtime needed; Redis/BullMQ for queue and cached/offline tasks as scale grows.
- 3D: Blender-authored GLB/glTF, optimized/compressed textures, InstancedMesh, LOD, chunk streaming.
- Tests: Vitest, Supertest, Playwright; performance profiling and migration tests.
- Verify exact compatible versions and lock them in `package-lock.json`; don't silently adopt breaking major upgrades.

## Monorepo suggestion

```text
apps/client/src/
  app/              routes, providers, top-level screens
  game/scenes/      WorldScene, BattleScene, SharedFrontierScene
  game/hex/         tile picking, overlay and renderer adapters
  game/terrain/     chunk loaders, biome render, water
  game/buildings/   catalog, placement/upgrade previews and models
  game/characters/  NPC and animal animation systems
  game/patrol/      route editor, path visualization, animation
  features/         menus/panels UI separated from 3D engine
  stores/           local UI state only
  api/              typed client and hooks
apps/server/src/
  modules/auth/ world/ buildings/ resources/ production/
  citizens/ farming/ livestock/ aquaculture/
  military/ patrol/ missions/ sectors/ battles/
  guilds/ pvp/ trading/ tech/
  infrastructure/db/ jobs/ events/ security/
packages/shared/src/
  hex/ config/ types/ schemas/ errors/ events/
assets/ docs/ prompts/
```

**Modular monolith first**, module boundaries by domain and shared validation. Separate services only after evidence of scaling problems.

## State layers

1. **MySQL authoritative**: world ownership, tiles, sectors, building tiers, inventories, survivors, training, battles, guilds, rewards.
2. **Backend calculation**: jobs, elapsed-time production, battle rules, claim/quest validation, quotas, supply graph. Redis as cache/queue, not truth source.
3. **Client data cache**: TanStack Query per world user, invalidated by mutations/websocket events; never trusted for rewards.
4. **Zustand local**: selection, camera, build/patrol/scan mode, preview and UI toggles. Avoid putting entire terrain instance arrays in React component state.
5. **Three.js render state**: skeleton animation, interpolated NPC positions, particles, LOD; never authoritative economics.

## World/sector/3D performance

- 1000×1000 / approx 86.6 m² per hex ≈ 11.5k logical tiles; do not instantiate them all as independent React components.
- Backend stores only edited/discovered tiles and sector metadata if generation deterministic. Asset and data streaming by chunk/camera area.
- Bound terrain changes by world bounds, use generation version to avoid changed seeds between deployments.
- InstancedMesh foliage/crops/stone; batch textures/materials; animation culling; worker for heavy mesh calculation only if profiling justifies.
- Frame budget aspiration: 60FPS typical midrange desktop at representative scene, ≥30 FPS lower preset; must benchmark not assume.
- Server should never simulate tens of thousands of visible NPC movement frames when offline; elapsed-time jobs instead.

## Security / integrity

- Authentication using secure session or JWT+HttpOnly refresh flow with CSRF considerations.
- Every endpoint verifies derived `world_id` from auth and exact ownership; role/permissions for guilds.
- Server determines build placement, upgrade level, costs, unit training, battle outcomes, loot and sector liberation.
- Transactions and idempotency keys for spend, claim, build, training, harvest, guild treasury, battle reward.
- Rate-limit, Zod validation, structured errors, audit ledger, logs, migrations with backups; secrets in env only.

## Event-driven progression

Use domain events `building.completed`, `wall.constructed`, `crop.harvested`, `citizen.recruited`, `soldier.trained`, `patrol.created`, `sector.scanned`, `sector.liberated`, `claim.completed`, `battle.completed`, `guild.quest.contributed` to update quest progression and notifications. Events have IDs and processed-once logic.

## Source, schema and asset checks

- Conventional migrations/seeds, unique constraints, explicit foreign keys and indexes, no force sync.
- Asset manifest maps `building_type + level -> GLB/variants`; loader has placeholder fallback clearly flagged.
- Feature flags can hide incomplete modes without fake buttons.
- After stage run lint/typecheck/tests/build and E2E workflow applicable to stage; document blockers honestly.
