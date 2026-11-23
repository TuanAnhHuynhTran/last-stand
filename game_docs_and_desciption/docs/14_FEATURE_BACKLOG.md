# 14 — 78 tính năng mở rộng và quản lý phạm vi

> Backlog bao gồm chức năng bắt buộc/later. **Không hiểu danh sách này là yêu cầu triển khai toàn bộ trong 12 stage**. Chọn feature theo dependencies và playtest.

| ID | Hệ thống | Chức năng | Priority | Phụ thuộc |
|---:|---|---|---|---|
| 01 | Construction | Quy hoạch phân khu dân cư/nông/quân | P1 | Building engine |
| 02 | Construction | Đường đất/đá/gạch | P0 | Hex graph |
| 03 | Construction | Cầu gỗ/đá | P1 | Road/water |
| 04 | Construction | Kênh thủy lợi | P0 | Farm |
| 05 | Construction | Lưu/paste blueprint | P1 | Building placement |
| 06 | Construction | Đổi màu mái/tường, decor | P1 | Asset variants |
| 07 | Construction | Đội thợ xây và tiến độ | P0 | Citizens/jobs |
| 08 | Construction | Sửa chữa công trình | P1 | Building condition |
| 09 | Construction | Trang trí công viên/đèn/cây | P1 | Asset packs |
| 10 | Construction | Nâng cấp/xây hàng loạt | P1 | Transaction |
| 11 | Citizen | Hộ gia đình | P2 | Housing |
| 12 | Citizen | Kỹ năng nghề nghiệp | P1 | Jobs |
| 13 | Citizen | Trường học và lớp nghề | P2 | Skills |
| 14 | Citizen | Bệnh viện/chữa thương | P1 | Health |
| 15 | Citizen | Hạnh phúc dân cư | P1 | Food/housing |
| 16 | Citizen | Người tị nạn từ sector | P0 | Story/reclaim |
| 17 | Citizen | Lễ hội/quảng trường | P2 | Civic |
| 18 | Citizen | Phân công tự động | P1 | Job routing |
| 19 | Farming | Nhà máy chế biến lương thực | P1 | Resources |
| 20 | Farming | Mùa vụ | P2 | Weather |
| 21 | Farming | Luân canh | P2 | Soil |
| 22 | Farming | Phân bón | P1 | Livestock |
| 23 | Fish | Chế biến thủy sản | P2 | Aquaculture |
| 24 | Farming | Lai tạo giống | P2 | Tech |
| 25 | Economy | Kho lạnh | P2 | Energy |
| 26 | Economy | Thời tiết ảnh hưởng sản xuất | P2 | Weather |
| 27 | Military | Tuần tra tuyến và ca trực | P0 | Stage 08 |
| 28 | Military | Đội hình chiến thuật | P1 | Battle |
| 29 | Military | Tướng chỉ huy | P2 | Unit XP |
| 30 | Military | Đội phản ứng nhanh | P1 | Patrol/alerts |
| 31 | Military | Trạm báo động | P1 | Towers |
| 32 | Military | Công sự, hào và cổng phụ | P1 | Walls |
| 33 | Military | Chế tạo/nâng vũ khí | P1 | Forge |
| 34 | Military | Bệnh xá quân đội | P1 | Injuries |
| 35 | Military | Tiền đồn biên giới | P0 | Claims |
| 36 | Military | Đoàn tiếp tế | P1 | Roads/outpost |
| 37 | Discovery | Trinh sát trước đánh | P0 | Sector |
| 38 | Discovery | Tình báo & intel level | P1 | Recon |
| 39 | Discovery | Sự kiện ngẫu nhiên | P1 | Quest events |
| 40 | Discovery | Di tích công nghệ cổ | P1 | Story |
| 41 | Reclaim | Đánh chiếm cứ điểm | P0 | Battle |
| 42 | Reclaim | Phá tuyến tiếp tế địch | P1 | Side dungeon |
| 43 | Reclaim | Phục hồi đất hoang | P1 | Claims |
| 44 | Reclaim | Trạm kiểm soát lãnh thổ | P0 | Claim |
| 45 | Dungeon | Phó bản khám phá | P0 | Battle engine |
| 46 | Dungeon | Giải cứu NPC | P1 | Quests |
| 47 | Dungeon | Thủ thành PvE | P1 | Defense layout |
| 48 | Dungeon | Sinh tồn bị cô lập | P2 | Supply |
| 49 | Dungeon | Boss nhiều giai đoạn | P1 | AI |
| 50 | Dungeon | Phó bản bí mật | P2 | Lore |
| 51 | Dungeon | Phó bản tổ đội | P2 | Multiplayer |
| 52 | Dungeon | Phó bản biến đổi | P2 | Seed templates |
| 53 | Trade | Thương nhân lang thang | P1 | Resources |
| 54 | Trade | Chợ giao thương NPC | P1 | Pricing |
| 55 | Trade | Đoàn thương mại | P2 | Logistics |
| 56 | Trade | Hợp đồng cung ứng | P1 | Production |
| 57 | Trade | Chợ đấu giá vật phẩm | P2 | Anti-fraud |
| 58 | Trade | Trạm vận chuyển | P1 | Roads |
| 59 | Trade | Giá/nhu cầu biến động | P2 | Economy control |
| 60 | PvP | Arena 1v1 | P1 | Battle engine |
| 61 | PvP | 2v2 squad | P2 | Realtime |
| 62 | PvP | Capture-hex flag | P2 | Objectives |
| 63 | PvP | Xếp hạng mùa | P1 | Rating |
| 64 | PvP | Friendly duel | P1 | Lobby |
| 65 | Guild | Đại sảnh quân đoàn | P1 | Guilds |
| 66 | Guild | Nghiên cứu quân đoàn | P2 | Guild hall |
| 67 | Guild | Guild boss | P1 | Coop or async |
| 68 | Guild | Chiến tranh cứ điểm | P2 | Shared Frontier |
| 69 | Guild | Tiếp tế quân đoàn | P2 | Treasury |
| 70 | Guild | Nhiệm vụ quân đoàn | P1 | Quest events |
| 71 | Progression | Cây công nghệ | P1 | Tech engine |
| 72 | Environment | Khôi phục môi trường | P1 | Reclamation |
| 73 | Environment | Mùa, thời tiết | P2 | Weather |
| 74 | Lore | Di sản công nghệ cũ | P1 | Exploration |
| 75 | Endgame | Công trình kỳ quan | P2 | High-tier build |
| 76 | Cosmetic | Thú cưng và đồng hành | P2 | Animal rigs |
| 77 | Progression | Thành tựu tái thiết | P1 | Events |
| 78 | Live Ops | Sự kiện theo mùa | P2 | Content ops |

**P0:** lõi gameplay. **P1:** sau khi core hoạt động. **P2:** dài hạn, làm theo dữ liệu người chơi và hiệu năng thực.
