# 08 — PvP, quân đoàn và Shared Frontier

## Fundamental protections

- PvP **voluntary**, does not raid, burn, steal or permanently capture any private-world house, wall, farm, animals or player-owned hex.
- Solo PvE can finish the main story. Guild membership and ranked PvP are optional.
- Shared Frontier is a distinct server-owned map with seasonal objectives and reversible control.

## PvP modes

1. **1v1 friendly duel:** no ranking impact, choose squads and battle map.
2. **1v1 ranked:** matchmaking by rating and unit power bands; seasonal rewards favor cosmetic/progression balance.
3. **2v2 squad:** turn coordination, reconnect/timeout policies, validation of each participant's assigned units.
4. **Capture the Flag:** hold/control hex objectives for turn count, not only eliminate all enemies.
5. **Guild siege skirmish:** event instance around shared fort, snapshots of guild units and shared defense assets.

## Guild lifecycle

- Create guild (name/tag/logo, owner), invite/search, join/leave, ranks Leader/Officer/Member, moderation, chat, contribution ledger, treasury with permissioned withdrawals.
- Guild hall/town built on **guild shared space** or abstract levels, not within one member's personal land unless cosmetic visit only.
- Guild technology: bounded group buffs, no mandatory advantages blocking solo story.
- Guild quests: contributions by farming, gathering, PvE and supply, not only combat.
- Guild boss: separate cooperative instance or asynchronous contributions when engine not ready for synchronized multi-party turns.

## Shared Frontier

- **Sector map separate from Private World**, neutral forts and mines; seasonal faction ownership (`guild_id`, control_until) not private player ownership.
- Control via scheduled events with time window, eligibility, sign-up, battle instance, scoring, reward ledger.
- Shared frontiers can reset each season; personal world never resets.
- Supply and resources used in guild war are player consent actions and have spend limits, idempotent ledger entries.

## Social and economic fairness

- Visiting: explicit privacy level `PUBLIC | FRIENDS | PRIVATE` with read-only projection; visitors cannot mutate owner's state.
- Trade must define whitelists, taxes/sinks, rate limits, fraud/replay protection before launch. No real-money trading/gambling.
- Anti-cheat: server authorizes every action and combat calculation, logs suspicious patterns, user reporting/moderation.

## Real-time architecture

- REST for profiles, guild management, match history, league data. Socket.IO for presence, room/lobby, battle turn broadcast, rejoin, guild chat (with validation/rate limits).
- Auth handshake, per-room ACL, event ack with message id, action version, deduplication; never allow clients to choose a victim's world to mutate.
- Optional Redis adapter when multi-node; not required for one-server MVP.

## Reconnect policies

- Ranked match pause grace period, then AI auto-defense or forfeit (product design config); never grant duplicate rewards.
- On battle resume, send latest server snapshot + events since last sequence, then render.

## Acceptance

- Guests read-only; privacy honored.
- No unauthorized guild treasury transfer or actions by ex-member.
- Ranked match deterministic server validator; no duplicate rewards/disconnect exploits.
- Guild season reset does not alter any private world building/claim.
- Guild participation can be skipped without preventing main story completion.
