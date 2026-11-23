# 05 — Kinh tế sinh tồn, cư dân, nông nghiệp, chăn nuôi, thủy sản

## Resource network

Nhóm tài nguyên:
- **Xây dựng:** wood, stone, brick, iron, steel, cloth.
- **Sinh tồn:** water, rice, maize, vegetables, meat, fish, medicine.
- **Chăn nuôi:** grass, animal_feed, eggs, milk, animal_seed.
- **Quân sự:** sword, spear, bow, crossbow, armor, arrows, bolts, rations.
- **Khám phá:** scan_energy, salvage_parts, old_world_data, contamination_filter.

Tất cả resource có config: `code`, `name_vi`, `unit`, `stack/capacity`, `tradable`, `source`, `sink`. Sản xuất đầu vào→recipe→job/chu kỳ→output. Không tạo vật liệu vô hạn, không tính production theo FPS.

## Cư dân và nhà ở

- Bắt đầu 5 người sống sót (thiết kế nội dung); nhà lvl1/2/3 sức chứa 4/6/10 **không tự tăng dân số**.
- Mỗi `survivor` có home, nghề, skill, health, stamina, morale, current assignment, status. `work` và `military` dùng chung sức lao động; một nhân vật không đồng thời làm nhiều ca toàn thời gian.
- Nguồn tăng dân số: cứu hộ, người tị nạn, di cư, sinh trưởng tự nhiên (later). Cần nhà ở, nước và lương thực; player nhận cảnh báo trước khi điều kiện xuống xấu.
- Lịch NPC biểu diễn: đi từ nhà tới nơi làm, hoạt ảnh work/eat/rest/talk; logic server chỉ lưu assignment/schedule; position chỉ render client và checkpoint khi cần, không ghi mỗi frame.
- Nghề: nông dân, thợ mộc, xây dựng, người chăn nuôi, ngư dân, thợ rèn, vận chuyển, y tế, giáo viên, thương nhân, lính.
- Phân công tự động theo policy player; nếu thiếu công nhân ưu tiên ngành đã đặt.

## Nông nghiệp ≥6 hex

- Loại cây: lúa, ngô, rau, cỏ, cây ăn trái; mỗi zone ít nhất 6 ô liên thông và có thể mở thêm cụm ≥6.
- Giai đoạn 3D: gieo, cây non, trưởng thành, ra bông/quả, thu hoạch; lúa rõ màu xanh→vàng. Scale/chibi art chuẩn nhưng không render mỗi cây thành React component.
- Level 1 ruộng thủ công bờ đất; level 2 kênh/đường/chòi; level 3 tưới cải tiến và điểm tập kết, đổi mô hình theo zone, giữ footprint.
- Năng suất `base_yield × total_area_factor × level_multiplier × water_factor × soil_factor × skill_factor × weather_factor`, giới hạn trên/dưới để tránh exploit. Tất cả factor server-configured.
- Nước: giếng, hồ chứa, trạm bơm, network edges, irrigation reachability; thời tiết có thể affect nhưng thiếu nước không instantly phá tất cả.
- Luân canh/phân bón/giống cây là tính năng mở rộng, không làm phức tạp MVP farming.

## Chăn nuôi

| Loại | Footprint tối thiểu | Sản phẩm | Hoạt ảnh |
|---|---:|---|---|
| Gà | 6 | Trứng/thịt | Idle, walk, peck, eat, rest |
| Lợn | 6 | Thịt/phân | Idle, walk, eat, sleep |
| Bò | 9 | Sữa/thịt/sức kéo | Graze, walk, drink, rest |
| Dê/cừu | 6 | Sữa/lông | Graze, walk, interact |
| Ngựa | 9 | Thú cưỡi/xe hàng | Walk, trot, gallop, ride, eat |
| Voi | 12 | Chở nặng/hỗ trợ chiến thuật | Walk, drink, trunk, carry |

- Level 1 chuồng gỗ + sân; level 2 gạch/kho thức ăn/máng; level 3 khu nuôi nhiều khoang + chăm sóc/thú y.
- Mỗi animal: species, age/growth, hunger/thirst, health, breeding eligibility, assigned farm. Sức chứa và thức ăn giới hạn sinh sản/sản lượng.
- Animal state machine chỉ render gần camera; AI đi trong farm polygon/allowed hex, không xuyên rào, hồ hay nhà.
- Offline: tiến trình batch server bằng `last_calculated_at`; không spawn hàng trăm vật thể 3D trên server.

## Thủy sản ≥6 hex

- Ao đất ≥6, hồ lớn ≥12, khu ươm ≥6, lồng cá trên nước ≥6; nước thực sự là editable terrain, bờ và depth có logic.
- Các loài: cá chép, rô phi, cá trê, cá lóc, tốc độ tăng trưởng/yield riêng.
- Level 1 ao đất/chòi/cầu; level 2 bờ kè/cống; level 3 lọc/sục khí/thu hoạch. Hình dạng ao theo tập hex, không asset GLB cứng có kích thước duy nhất.
- Tăng diện tích: thêm hex liền kề và tái tạo shoreline, loại bỏ internal edges; không tạo khe hở, fish cannot swim beyond body.
- Water quality, food, density, growth, harvest cycle server-authoritative; cá gần camera có stylized 3D animated swimming, xa chỉ dùng tối ưu visual.

## Chuỗi kinh tế và logistics

- Lúa → kho lương → khẩu phần quân đội.
- Ngô/cỏ → thức ăn → gà/lợn/bò/ngựa/voi → sản phẩm/phân bón.
- Gỗ/đá/gạch → xây/nâng cấp nhà, tường/cổng.
- Iron → forge → sword/spear/bow/crossbow/armor; arrows/bolts có chi phí.
- Fish → chế biến/bảo quản (later) → dân cư/đoàn thám hiểm.
- Mỗi kho có capacity, dự toán thu–chi, ngưỡng cảnh báo; kho đầy thì sản lượng dừng/giảm.
- Road network ưu tiên NPC movement; đoàn hàng/xe ngựa, tiền đồn và supply line chi tiết triển khai sau phần nông nghiệp cơ bản.

## Hệ thống nâng cao trong backlog

Giáo dục, y tế nâng cao, gia đình, lễ hội, hạnh phúc dân cư, trading, hợp đồng giao hàng, chợ đấu giá có giới hạn, mùa vụ, cây giống, phân bón, chế biến/cấp đông, thú cưng. Mỗi feature mới phải có nguồn/sink và chống inflation trước khi mở rộng.

## UX và acceptance

- UI tài nguyên: số tồn, capacity, tốc độ +/- theo giờ/ngày game, công trình/người tiêu thụ.
- Nhà dân nâng cấp cập nhật capacity; dân không tự xuất hiện.
- Zone trồng/nuôi/ao kiểm tra min hex và connectedness.
- Gieo/thu hoạch không nhận hai lần; sản lượng chạy offline có giới hạn nguyên liệu và kho.
- NPC biết tìm đường tới nơi làm; nếu cổng đóng không dẫn được tới ruộng, UI cảnh báo.
- Vật nuôi cần thức ăn/nước; không xuyên vật thể; dung lượng scene có budget.
