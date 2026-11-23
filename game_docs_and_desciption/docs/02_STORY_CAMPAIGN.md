# 02 — Cốt truyện, phe phái, nhiệm vụ và các chương

## Bối cảnh chính

**Năm 2097: Đêm Tắt Sao** khiến mạng lưới điện toàn cầu sụp đổ. Những vũ khí công nghệ và trạm canh tự động cổ thất kiểm soát; sinh vật dị hóa xuất hiện; các nhóm quân phiệt tranh tài nguyên. Người sống sót trở lại canh tác, luyện vũ khí lạnh. Nhà cửa và dân làng vẫn có art style chibi, nhưng câu chuyện nghiêm túc về sinh tồn và phục hồi.

## Phe địch và phong cách chiến đấu

| Faction | Lore | Chiến thuật/địa bàn | Thưởng đặc trưng |
|---|---|---|---|
| **Thiết Đoàn Tro Tàn** | Quân cướp có tổ chức kiểm soát lương thực và sắt | Đao/thương/cung/nỏ, tháp gác, tập kích, đồng bằng và pháo đài | Vũ khí, kho sắt, nguyên liệu |
| **Bầy Dị Hóa** | Sinh vật biến đổi do ô nhiễm | Xung phong, độc, boss, rừng và hồ nhiễm độc | Vật liệu hiếm, nghiên cứu sinh thái |
| **Người Gác Cũ** | Hệ thống robot phòng thủ cũ | Giáp cao, tia năng lượng nhẹ stylized, địa hình bẫy | Công nghệ cổ, radar, tự động hóa |

Một số sinh vật có thể được cứu/thuần hóa qua nhiệm vụ; không biến mọi động vật thành kẻ địch.

## Các nhân vật mở đầu

- **Thủ lĩnh** (player): Người chỉ huy, tự chọn tên/ngoại hình chibi.
- **An** (trinh sát): hướng dẫn scan và trinh sát sector.
- **Hạ** (nông dân): hướng dẫn gieo 6 hex ruộng và dự trữ thực phẩm.
- **Đăng** (thợ mộc): hướng dẫn xây nhà, kho, hàng rào.
- **Minh** (hộ vệ): giới thiệu huấn luyện quân và tuần tra.
- **Lan** (người chăm sóc): hướng dẫn nước, y tế, dân cư và chăn nuôi.

Các tên là mẫu dữ liệu seed có thể localization.

## Cấu trúc chương và nhiệm vụ

| Chapter | Narrative event | Mission beats | Unlock |
|---|---|---|---|
| **Prologue — Ngọn Đèn Cuối Cùng** | 5 người đến vùng đất an toàn | Nhà 1 hex; giếng; 6 hex lúa; kho | Xây/kinh tế cơ bản |
| **1 — Bức Tường Đầu Tiên** | Đoàn tị nạn đến và biên giới có cảnh báo | 8–12 wall edges; 1 gate; 1 watchtower; trại gà/ao; đêm gác đầu | Tường gỗ, cổng, patrol |
| **2 — Sau Làn Sương** | Radar phát hiện quân địch | Scan; trinh sát; trận đầu “Trạm Canh Sương Mù” | Claim trung lập, basic dungeon |
| **3 — Lá Cờ Trên Phế Tích** | Pháo đài chiếm mỏ sắt | Rèn trang bị; đội 4 lính; đánh pháo đài; xây tiền đồn | Sector liberation; tường gạch |
| **4 — Dòng Sông Đen** | Nguồn nước nhiễm độc, lộ phòng thí nghiệm | Thám hiểm, lọc nước, đánh boss dị hóa | Công nghệ lọc và nhà sản xuất cấp 3 |
| **5 — Tiếng Vó Trên Đồng Tro** | Tái chiếm thảo nguyên | Hộ tống đoàn hàng, bắt/thuần ngựa; cứu voi | Trại ngựa 9 hex, voi 12 hex |
| **6 — Lời Hiệu Triệu Tái Thiết** | Các thủ lĩnh hình thành quân đoàn | Boss hợp tác hoặc nhiệm vụ solo thay thế; tham quan quân đoàn | Guild, PvP optional, Shared Frontier |
| **7 — Trái Tim Đêm Tắt Sao** | Vào hệ điều khiển trung tâm | Tháp Không Người → Kho Ký Ức → Lõi Canh Giữ | Kết chiến dịch, hậu game/khôi phục |

**Cốt truyện hoàn toàn PvE khả thi**: Các mục bắt buộc trong Chương 6 phải có giải pháp solo hoặc NPC allies; guild/PvP chỉ là optional paths.

## Nhiệm vụ mẫu đầy đủ: Pháo Đài Gạch Vỡ

- **Gợi mở:** Radar xác định một sector bị Thiết Đoàn chiếm, chứa kho sắt, đất ruộng và suối cũ.
- **Trinh sát:** Tìm điểm yếu cổng, ước lượng quân địch, ghi nhận tháp báo động. Nếu intelligence thấp, thiếu thông tin về một nhóm phục kích.
- **Chuẩn bị:** Chọn tối đa 5 units (đao, thương, cung, nỏ), quân nhu và tướng; chơi trận theo lượt trên bản đồ hex riêng.
- **Objective A:** Vô hiệu hóa trạm báo động trong số lượt giới hạn (optional bonus).
- **Objective B:** Chiếm cổng/tháp gác.
- **Objective C:** Đánh bại chỉ huy và giữ điểm kiểm soát.
- **Sau trận:** Sector chuyển `liberated` nhưng chưa `claimed`. Tạo claim job/tiền đồn; nối road/supply; xử lý 1–2 hex ô nhiễm. Khi confirmed, những hex được sở hữu xuất hiện trong build mode.
- **Thưởng:** Steel/resource bag, bản vẽ doanh trại, tùy chọn cứu 2 cư dân.
- **Nhánh thất bại:** Quân bị thương và cần hồi phục; không mất vĩnh viễn nhà/đất; có thể thử lại với chiến thuật mới.

## Phó bản story và nhịp mở khóa

- “Trạm Canh Sương Mù”: giới thiệu 3–5 unit hex turn-based, giải cứu trinh sát.
- “Kho Vật Tư Bỏ Quên”: thám hiểm có bẫy/khóa và chiến đấu ngắn.
- “Pháo Đài Gạch Vỡ”: đánh cứ điểm, giải phóng sector.
- “Đường Hầm Dòng Sông Đen”: chất độc, khả năng hỗ trợ lọc.
- “Đoàn Xe Mất Tích”: phòng thủ/hộ tống, giới thiệu hậu cần.
- “Cổng Thành Tro”: thủ thành theo đợt; tổ đội là lựa chọn.
- “Tháp Không Người”: boss robot, kết chương chiến dịch.

## Kịch bản mở màn ngắn

> Gió cuốn tro qua những căn nhà đổ. An phát hiện một giếng vẫn còn nước. Hạ đặt một hạt lúa xuống đất và nói: “Chỉ cần còn có thể gieo trồng, chúng ta còn có thể bắt đầu.” Phía xa, một cờ đen bay trên vọng gác. Thủ lĩnh dựng cờ của nhóm bên giếng: “Từ đây, chúng ta xây dựng lại tất cả.”

## Hệ thống quest về kỹ thuật

Quest cần `quest_definitions` có trigger, prerequisites, objectives, rewards, script text; `player_quests` tiến độ; `quest_events` lưu event id chống double-reward. Nhiệm vụ phải dựa trên domain events như `building.completed`, `sector.scanned`, `battle.won`, `patrol.assigned`, không đặt điều kiện “đã click panel” thay gameplay thực.
