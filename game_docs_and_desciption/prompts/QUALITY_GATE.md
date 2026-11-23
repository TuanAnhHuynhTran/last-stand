# CLAUDE — QUALITY GATE after each stage

Đọc `CLAUDE.md`, `docs/15_ACCEPTANCE_MATRIX.md` và `prompts/STAGE_XX.md` vừa triển khai. Dùng code và môi trường có thực để xác nhận:

1. Từng yêu cầu trạng thái DONE / PARTIAL / BLOCKED / NOT STARTED, kèm đường dẫn source.
2. Luồng UI→API→MySQL→reload đối với mọi tính năng lưu dữ liệu; không có nút giả.
3. Quyền sở hữu, validation, transaction, idempotency, double-click/concurrency, negative cases.
4. Chibi assets thực tế: đã có GLB chưa, rig đúng, mô hình các cấp khác nhau chưa, placeholder status rõ chưa.
5. Hex picking/overlap/walls/gates/pathfinding, NPC/animal collisions, số FPS và draw calls nếu đo được.
6. Test typecheck, lint, unit, integration, build, E2E (nêu lệnh và kết quả thực, không tự giả định PASS).
7. Những tính năng cũ có bị regression không, đặc biệt world seed, house one hex, territory ownership, private-PvP isolation.
8. Sửa lỗi trong phạm vi stage nếu có thể, chạy lại tests; nếu không, lập issue list và blocker.
9. Xuất báo cáo theo `templates/STAGE_COMPLETION_REPORT.md`, không tự chuyển stage.
