# PROMPT KHỞI ĐỘNG LAST HAVEN TRONG CLAUDE CODE

Hãy đọc `CLAUDE.md`, `docs/00_START_HERE.md`, `docs/13_ROADMAP.md`, tất cả tài liệu liên quan của stage được triển khai và `prompts/STAGE_01.md`.

Trước tiên, hãy audit repository hiện tại, liệt kê những gì đã có và những gì còn thiếu. Nếu repository chưa có code, hãy bắt đầu giai đoạn 1. Nếu đã triển khai một phần, hãy bảo tồn code và dữ liệu hiện có, xác định những yêu cầu Stage 1 còn thiếu và thực hiện chúng trước.

Bắt buộc dùng TypeScript + React/Three.js chibi + Express/MySQL/Sequelize theo tài liệu. Không tạo nút bấm giả, không dùng dữ liệu mock như dữ liệu đã lưu, không thay thế hex grid bằng square grid. Đặc biệt giữ nhà dân 1 hex nâng 3 cấp, khu sản xuất từ 6 hex, tường ở cạnh hex, lính tuần tra, chuỗi tái chiếm 1/9/90, và PvP tách khỏi private world.

Tạo migration và API thật, tích hợp frontend, ghi rõ asset chibi còn thiếu, viết tests. Sau khi triển khai, chạy các kiểm tra có thể chạy và báo cáo đúng theo `templates/STAGE_COMPLETION_REPORT.md`. Chỉ làm Stage 1, không tự sang Stage 2.
