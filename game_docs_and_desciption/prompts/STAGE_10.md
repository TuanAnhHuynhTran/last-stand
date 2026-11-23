# CLAUDE CODE — Fog of War, Sectors, Recon, Liberation & Claims

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/03_WORLD_HEX_RECLAMATION.md`, `docs/02_STORY_CAMPAIGN.md`, `docs/06_MILITARY_PATROLS.md`, `docs/11_DATABASE_AND_API.md`, `docs/15_ACCEPTANCE_MATRIX.md`.

## Demo cuối stage
Radar 3 cấp với chibi VFX; quét tìm đất trung lập/thù địch và sector; trinh sát xem intelligence; claim neutral sector hợp lệ và xây được; hostile sector chỉ có trạng thái cần đánh — **không được tự giải phóng khi chưa có Battle Engine Stage11**. Dùng seeded test fixtures cho liberation pipeline.

## World 1/9/90 generation
- Validate start ~1% player, neutral ~9%, hostile ~90% of playable area; organize hostile control by contiguous sectors of ~15–50 hex, critical story route reachable.
- Factions Tro Tàn, Dị Hóa, Người Gác Cũ; threat tiers, stronghold and POI, supply route and remediation.
- Deterministic generator version; server hides secret intel, client only sees revealed.

## Scan & recon
- Radar building tiers wood scavenged scanner → brick tower → advanced restored scanner; scan energy and range configured.
- `ScanMode`: show visible eligible hexes and target, charge cost, job due time, wave VFX, persisted SCANNED result; scanning **never** changes owner.
- Scout mission: check sector discovered, squad available, supply and risk; resolve reconnaissance based on server rules; unlock troop estimate, traps and faction intel. Short encounters can be queued for stage11.

## Liberation/claim state machine
- Separate `discovery_status`, `control_status`, `sector_liberation_state`, `recovery_level` to avoid conflating scan vs battle vs ownership.
- `neutral` claim: adjacency/supply/worker/material/terrain; server job completion -> PLAYER tiles.
- `hostile` claim: only after server-signed battle `sector.liberated` (implemented stage11), outpost/marker+road/supply/worker before PLAYER.
- Per-sector held tiles group; victory need not attack each hex. Some POIs special optional objectives.
- Development fixture may mark sector liberated with admin-only test harness; production must have no endpoint for free liberation.

## Restoration and visualization
- After claim, rubble cleanup/soil treatment/planting shifts art from gray corrupted biome to lush recovered biome over stages; cosmetic progress plus gameplay build eligibility.
- Border shows claimed land, neutral, scanned-hostile, controlled by faction. Minimap and camera focus on target sector.

## DB/API
`sectors`, `sector_tiles`, `world_scan_jobs`, `world_recon_jobs`, `world_claim_jobs`, `world_discoveries`, `world_points_of_interest`, `outposts`, `supply_links`; APIs `/api/world/me/{chunks|scans|recon|claims|sectors}`.

## Tests
- Determinism, starter connected/buildable, world bounds correct, tile secrets masked.
- Scan only reveals and charges once, not owner; hostile claim forbidden unless liberation proof.
- Concurrent claim uses transaction and idempotency, no double resources; after claim building placement allowed only where restored/eligible.
- No storyline progression soft-lock for any accepted seed (critical path reachability).
