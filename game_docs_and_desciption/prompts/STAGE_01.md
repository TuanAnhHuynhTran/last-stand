# CLAUDE CODE — Foundation, Authentication & Private Worlds

> **Chỉ thực hiện giai đoạn này.** Trước khi code, đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, và các file tham chiếu ở dưới. Giữ nguyên kiến trúc/tính năng đã hoàn thành. Không tự chuyển stage.

## Quy trình bắt buộc

1. Audit repository hiện có, dependencies, migration, assets và tests; **đừng giả định repo trống**. Ghi gap analysis ngắn.
2. Nêu kế hoạch triển khai: shared types/validation → migration/DB → backend service/API → React/Three.js UI → asset manifest → tests.
3. Thực hiện code chạy được trong môi trường hiện có. Backend authoritative; không mock data thành production; không dùng placeholder thành phẩm.
4. Kiểm thử lint/typecheck/unit/integration/build và E2E khi có thể. Nếu thiếu môi trường/GLB, ghi blocker trung thực.
5. Báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`. **Dừng lại**.


## Tài liệu bắt buộc
`docs/01_VISION_AND_CORE_LOOP.md`, `docs/03_WORLD_HEX_RECLAMATION.md`, `docs/10_TECH_ARCHITECTURE.md`, `docs/11_DATABASE_AND_API.md`, `docs/15_ACCEPTANCE_MATRIX.md`.

## Mục tiêu / demo cuối stage
Khởi chạy web và API, đăng ký tài khoản, đăng nhập, tạo đúng 1 thế giới private world cho mỗi người, xem HUD tài nguyên và thông tin bản đồ. Reload vẫn có world cũ, người khác không truy cập được.

## Kiến trúc và ngôn ngữ
- npm workspaces `apps/client`, `apps/server`, `packages/shared`; frontend React + Vite + TypeScript, server Express + TypeScript + Sequelize/mysql2/MySQL 8, validation Zod.
- React Router, Zustand (UI state), TanStack Query (server state), Tailwind cho UI theo chibi; R3F dependencies chỉ cấu hình scene placeholder **rõ** ở stage 1.
- Strict TS, ESLint, Prettier, `.env.example`, startup validation, CORS security, structured errors, `.gitignore` cho credentials và assets lớn.

## DB & application behavior
- Migrations cho users/sessions/worlds/world_resources/world_hex_tiles; `UNIQUE(worlds.owner_id)` và `UNIQUE(world_id,q,r)`. World stores seed + generator version + 1000×1000 bounds.
- Register transaction: user + unique private world + safe starting tile set (khoảng 115 contiguous hex, seed-defined and buildable) + starter inventory. Retry requests idempotent.
- Auth sessions an toàn, hash password phù hợp, HTTP-only cookies hoặc cơ chế access/refresh có threat model rõ. `GET /api/auth/me`, `GET /api/world/me`, `GET /api/world/me/resources`.
- Enforce logged-in owner on all personal endpoints, do not trust arbitrary world ID from client.
- Initial seed must be deterministic; story/prologue config stored, not only hardcoded in UI.

## UI / art
- Login/register screen style chibi cozy, header resources, root game view, navigation + loading/error/empty state.
- No fake “Xây/Chiến đấu” buttons. Incomplete modes visible only as disabled roadmap or hidden.

## Tests / acceptance
- Register creates exactly one world, duplicate/retry doesn't create two.
- Multiple accounts cannot read/mutate each other's world.
- Reload and logout/login recover exact world seed/resources.
- Migration applied on empty DB and does not drop pre-existing data; invalid input handled.
- Typecheck, lint, Supertest auth integration, build pass (where env available).

**Không triển khai full terrain/nhà ở stage này; dừng khi app shell và persistence thực chạy.**
