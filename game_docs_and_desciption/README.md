# LAST HAVEN — Claude Development Kit

**Version:** 4.0 (consolidated specification) · **Language:** Vietnamese · **Status:** Design specification / implementation guide, not completed source code.

LAST HAVEN là game web 3D chibi hậu tận thế: mỗi người một thế giới riêng 1000 × 1000, bắt đầu với khoảng 100 × 100 đất an toàn (1%), khoảng 9% trung lập và 90% đất bị các phe địch chiếm. Người chơi xây làng, nuôi sống cư dân, luyện binh, đi tuần, trinh sát sector, đánh phó bản trên bản đồ hex riêng, giải phóng và hồi sinh đất; đồng thời có PvP/quân đoàn trên chiến tuyến chung. PvP không phá đất cá nhân.

## Bắt đầu trong Claude Code

1. Giải nén toàn bộ thư mục này vào **thư mục gốc repository** của game (cạnh `package.json`), giữ nguyên các đường dẫn.
2. Mở Claude Code tại root repository. Claude sẽ đọc `CLAUDE.md` nếu được cấu hình như hướng dẫn; luôn nhắc rõ `@CLAUDE.md` và `@docs/00_START_HERE.md` khi cần.
3. **Đọc:** `CLAUDE.md` → `docs/00_START_HERE.md` → tài liệu liên quan của giai đoạn → `prompts/STAGE_XX.md`.
4. Bắt đầu từ **STAGE_01**, hoặc nếu đã có code thì yêu cầu audit trạng thái hiện tại và xác định giai đoạn tiếp theo, không khởi tạo project mới.
5. Sau mỗi giai đoạn, yêu cầu kiểm thử và báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`, chỉ chuyển giai đoạn khi chấp thuận.

### Lệnh mở đầu gợi ý

> Hãy đọc `CLAUDE.md`, `docs/00_START_HERE.md` và các tài liệu được tham chiếu. Phân tích source code hiện tại, đối chiếu các tiêu chí chấp nhận. Sau đó chỉ triển khai `prompts/STAGE_01.md` (hoặc giai đoạn còn thiếu sớm nhất). Không phá tính năng cũ; không dùng placeholder như hoàn thiện; chạy các phép kiểm thử có thể chạy và báo cáo theo template. Không tự chuyển giai đoạn.

## Sơ đồ thư mục

```text
CLAUDE.md                       Quy định cho AI coding agent
README.md                       Hướng dẫn sử dụng
GAME_DESCRIPTION.md             Mô tả tổng hợp ngắn gọn, dùng để chia sẻ
/docs/
  00_START_HERE.md              Quy ước và thứ tự nguồn yêu cầu
  01_VISION_AND_CORE_LOOP.md     Tầm nhìn, scope, vòng lặp chơi
  02_STORY_CAMPAIGN.md          Bối cảnh, phe phái, chương truyện, nhiệm vụ
  03_WORLD_HEX_RECLAMATION.md  Bản đồ, sector, 1/9/90, radar, chiếm đất
  04_BUILDINGS_WALLS.md        Nhà 3 cấp, công trình, tường, cổng, tháp
  05_ECONOMY_CITIZENS.md       Cư dân, ruộng, chăn nuôi, ao cá, sản xuất
  06_MILITARY_PATROLS.md       4 lính, trại ngựa/voi, tuyến tuần tra, hậu cần
  07_DUNGEONS_PVE.md           Phó bản, battle hex, AI, loot
  08_PVP_GUILDS.md             PvP, quân đoàn, Shared Frontier
  09_ART_UI_ASSETS.md          Chibi art bible, Blender, GLB, hoạt ảnh
  10_TECH_ARCHITECTURE.md      Cấu trúc code, state, hiệu năng, bảo mật
  11_DATABASE_AND_API.md       Schema, indexes, hợp đồng API và ví dụ
  12_BALANCE_QA_SECURITY.md    Cấu hình, kiểm thử, hiệu năng, chống exploit
  13_ROADMAP.md                Mốc MVP và 12 giai đoạn
  14_FEATURE_BACKLOG.md        Các tính năng mở rộng và mức ưu tiên
  15_ACCEPTANCE_MATRIX.md      Definition of Done theo hệ thống
/prompts/STAGE_01.md ... STAGE_12.md  Prompt triển khai độc lập từng giai đoạn
/templates/STAGE_COMPLETION_REPORT.md  Báo cáo hoàn thành giai đoạn
```

**Thứ tự ưu tiên khi tài liệu có khác biệt:** `CLAUDE.md` và `docs/00_START_HERE.md` > tài liệu hệ thống chuyên biệt > prompt stage tương ứng > `GAME_DESCRIPTION.md` > ghi chú cũ. Không được tự sửa luật cốt lõi để tiện code; ghi lại xung đột và chọn phương án tương thích với quy chuẩn.

**Chú ý:** Con số HP, năng suất, sản lượng, thời gian, sức chứa và tỷ lệ thưởng là **giá trị khởi tạo để playtest**; không phải thông số đã cân bằng. Dự án cần asset 3D có quyền sử dụng hợp lệ. Tài liệu này không bao gồm sẵn mã nguồn/GLB hoàn chỉnh.
