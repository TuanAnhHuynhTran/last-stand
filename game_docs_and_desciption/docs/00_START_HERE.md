# 00 — Bắt đầu, phạm vi và thứ tự nguồn yêu cầu

## Mục đích

Đây là bộ **specification để AI lập trình**, không phải mã nguồn đã hoàn thành. Mọi mô tả dùng tiếng Việt; tên bảng/API/code dùng tiếng Anh. Chỉ số liên quan tốc độ, HP, sản lượng, độ khó, chi phí được coi là đề xuất cho playtest.

## Đọc tài liệu theo nhu cầu

| Phần đang làm | Bắt buộc đọc |
|---|---|
| Định hướng dự án | `GAME_DESCRIPTION.md`, `docs/01_VISION_AND_CORE_LOOP.md` |
| Cốt truyện/nhiệm vụ | `docs/02_STORY_CAMPAIGN.md` |
| Sinh world, hex, claim, sector | `docs/03_WORLD_HEX_RECLAMATION.md` |
| Nhà, footprint, nâng cấp, tường/gate/tower | `docs/04_BUILDINGS_WALLS.md` |
| Cư dân, nông nghiệp, vật nuôi, ao cá | `docs/05_ECONOMY_CITIZENS.md` |
| Lính, patrol, logistics, mount | `docs/06_MILITARY_PATROLS.md` |
| Combat, phó bản, boss | `docs/07_DUNGEONS_PVE.md` |
| PK, quân đoàn, season | `docs/08_PVP_GUILDS.md` |
| Art, animation, UI, Blender | `docs/09_ART_UI_ASSETS.md` |
| Kiến trúc, cấu trúc dự án | `docs/10_TECH_ARCHITECTURE.md` |
| Database/API | `docs/11_DATABASE_AND_API.md` |
| Testing, anti-exploit, balance | `docs/12_BALANCE_QA_SECURITY.md` |
| Mốc triển khai | `docs/13_ROADMAP.md`, `docs/15_ACCEPTANCE_MATRIX.md` |
| Tính năng mới hơn mốc 12 | `docs/14_FEATURE_BACKLOG.md` |

## Quy tắc thuật ngữ

- `world`: thế giới cá nhân của một player, có kích thước hữu hạn.
- `hex tile`: ô logic axial `(q,r)`, có thể hiển thị terrain liền mạch, không nhất thiết là một trụ hex rời.
- `sector`: tập nhiều hex liên thông (thường 15–50, tùy biên) với faction, objectives và tiến trình giải phóng.
- `scanned`: đã biết thông tin; `liberated`: dọn được thế lực chiếm đóng; `claimed`: hợp thức quyền xây dựng và nối lãnh thổ.
- `footprint`: tập hex bị công trình chiếm; `wall edge`: một cạnh chung có key chuẩn hóa.
- `private world`, `battle instance`, `shared frontier`: **ba không gian tách biệt**.
- `simulation state`: logic server; `render state`: trạng thái hình ảnh client.

## Mức độ cam kết scope

- **Core mandatory:** 1/9/90, hex, nhà 3 cấp, vùng sản xuất >=6 hex, walls edges, dân cư+4 lính, patrol, PvE giải phóng.
- **MVP phase:** Có thể triển khai theo chiều dọc và dùng asset tạm khi chưa có GLB; phải ghi rõ tình trạng.
- **Later expansions:** season, 2v2, guild war, full transport simulation, rare animals, cosmetic variety; không tự thêm vào core sprint.
- **Balance knobs:** Chỉ số đề xuất nằm trong `docs/12_BALANCE_QA_SECURITY.md` và DB seed config; không coi là yêu cầu cân bằng cuối.

## Khả năng xử lý xung đột

Nếu prompt stage nhắc “mở rộng đất” trước giai đoạn 10: dùng **dev seed/admin tooling hoặc các hex đã sở hữu ở môi trường phát triển** để thử module; không cho người chơi production bypass trinh sát/claim. Nếu thiếu asset: tạo manifest, fallback và nhãn `ASSET_MISSING`; không thay thế asset thật bằng BoxGeometry mà báo đã hoàn thành nghệ thuật.

## Acceptance

Chỉ khi game hoạt động end-to-end (UI → API → MySQL → reload), có validation/permissions/tests và biểu đạt 3D hợp lý, mới đánh dấu “done”. Không đòi stage sau tồn tại để chứng minh stage trước, nhưng cần unit tests và fixtures phù hợp.
