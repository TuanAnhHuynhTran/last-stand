# 04 — Building Engine, nâng cấp, đường, tường, cổng và tháp canh

## Nguyên tắc nền tảng

- **Công trình = Building Instance** (ID, loại, cấp, pose, owner world, footprint, trạng thái thi công) + level-specific config/GLB.
- Công trình chiếm vùng **hex liên thông** (định hướng theo 6 góc 60°); nâng cấp không thay ID.
- **Nâng cấp** tăng cấp và đổi model/công năng; **mở rộng** thêm footprint/zone tiles, không gộp hai thao tác.
- Nhà dân vẫn chiếm **đúng 1 hex** ở mọi cấp. Sân/vườn nhỏ thuộc footprint đó; decor ngoài phạm vi cần footprint riêng nếu cho phép.
- Ruộng, trang trại, ao/hồ nuôi cá, doanh trại và các khu chức năng tương ứng: **ít nhất 6 hex**; mở rộng theo cụm liên thông tối thiểu 6 hex (có thể ngoại lệ cho sửa đường bờ thuộc rule của hệ thống).
- Trại ngựa ≥9 hex, bò ≥9, trại voi/hồ lớn ≥12.
- Wall/gate nằm trên **hex edge**, không chiếm cả ô; watchtower là node/footprint riêng và anchor vào edge hoặc corner.

## Bảng công trình 3 cấp (design defaults)

| Công trình | Footprint | Cấp 1 | Cấp 2 | Cấp 3 |
|---|---:|---|---|---|
| **Nhà dân** | 1 | Gỗ sân vườn, 4 người | Gạch mái ngói, 6 | Gạch 2 tầng, 10 |
| **Trung tâm lãnh địa** | 7 | Nhà chỉ huy gỗ | Dinh gạch, sân lát đá | Phủ 2 tầng, tháp/cờ |
| **Kho vật tư** | 2 | Kho gỗ, 1000 sức chứa | Kho gạch, 2500 | Kho lớn, 5000 |
| **Chợ** | 3 | Quầy gỗ | Chợ mái ngói | Khu thương mại nhiều gian |
| **Y tế** | 2 | Trạm thuốc gỗ | Nhà gạch có giường | Bệnh xá 2 tầng |
| **Xưởng mộc** | 3 | Sân cưa gỗ | Xưởng mái ngói | Xưởng quy mô lớn |
| **Ruộng lúa/ngô/rau/cỏ** | ≥6 | Bờ đất, thủ công | Kênh tưới, chòi | Thủy lợi/trạm bơm, đường vận chuyển |
| **Trại gà/lợn/dê** | ≥6 | Chuồng gỗ | Chuồng gạch, máng nước | Khu nhiều khoang, chăm sóc |
| **Trại bò/ngựa** | ≥9 | Chuồng gỗ + đồng cỏ | Kho cỏ, sân luyện | Khu chăm sóc/huấn luyện đầy đủ |
| **Trại voi** | ≥12 | Bãi nuôi + hồ tắm | Chuồng kiên cố, kho | Trại tượng binh, y tế, tháp |
| **Ao cá** | ≥6 | Ao đất, cầu gỗ | Kè đá, cống | Lọc/sục khí, thu hoạch |
| **Hồ lớn** | ≥12 | Hồ đất | Hồ gia cố | Khu quản lý lớn |
| **Trại đao/thương/cung/nỏ** | ≥6 mỗi loại | Lều + sân đất | Gạch/sân tập | Doanh trại kiên cố, sân chuyên môn |
| **Lò rèn quân sự** | ≥6 | Lò đơn | Nhiều lò | Xưởng cơ khí có khu nâng hàng |
| **Trường tổng hợp** | ≥9 | Sân tập cơ bản | Công sự huấn luyện | Học viện/luyện đội hình |

Các công trình mới theo backlog (trường học, xưởng chế biến, kho lạnh, tiền đồn, chợ thương mại, bệnh viện, kỳ quan, v.v.) cũng dùng definition 3-level nếu có nâng cấp; art level phải khác, không chỉ đổi số.

## Mode xây dựng (UI và logic)

1. Player chọn danh mục + level 1 từ `building catalog`.
2. Ghost preview GLB (hoặc status `ASSET_MISSING`) di chuyển theo raycast và snap axial tile; multi-hex zone preview render từng cell.
3. Hệ thống xác định terrain slope, water/ground, occupancy, ownership, path/supply, prerequisites và ngân sách.
4. Màu hợp lệ: xanh; vô hiệu: đỏ, tooltip lý do; cho xoay theo 60°.
5. Bấm xác nhận -> request idempotent -> DB transaction (check budget, lock cells/resources, create building/footprint/job).
6. Build animation: giàn giáo, vật liệu, tiến trình; server kết thúc job, client refresh model level 1.
7. Upgrade retains ID, pose and exact footprint; move action phải check đồng thời vị trí mới/cũ tránh mất công trình nếu thất bại.

## Building presets và Blueprints

- Player có thể lưu **một cụm** gồm nhiều buildings, decorations, roads, fences, orientation + relative axial offsets, không lưu ID công trình cũ.
- Khi paste, toàn bộ footprint/edge preview, tổng chi phí, overlapping, ownership. Hỗ trợ xây một phần nhưng phải cho user chọn rõ thứ tự, không silent partial.
- Decor nhỏ có anchors trong 1 tile; không chiếm grid độc lập nếu là vật trang trí không cản đường. Decor lớn cần occupancy.
- Đường dựa trên liên kết tile centers hoặc cạnh được cho phép (vẫn hex), hỗ trợ đất/đá/gạch, cầu qua nước. NPC pathfinding lấy đường làm cost ưu tiên.
- Quy hoạch khu dân cư/nông nghiệp/quân sự là layer metadata và một số bonus adjacency; không thay thế ownership.

## Tường rào: sử dụng **hex edge**

| Cấp | Vật liệu/mô hình | HP đề xuất/đoạn | Mở khóa |
|---|---|---:|---|
| 1 | Hàng rào gỗ, cọc + chốt, hàng rào trang trại | 100 | Chapter 1 |
| 2 | Tường gạch/đá chân, trụ mái ngói | 260 | Chapter 3 |
| 3 | Tường thành đá cao, lỗ châu mai/cờ/đèn | 550 | Chapter 5+ |

HP chỉ cho PvE simulated defense, hao mòn/sửa chữa; không áp dụng permanent griefing bởi PvP. `segment_id` bền giữa upgrade. Wall polyline có các góc nối nội/ngoại tương thích 60°; tự chọn prefab nối, thẳng, góc, kết thúc, dốc. Nếu renderer dùng modular pieces, bảo đảm không hở/đè nhau.

### Unique canonical wall edge

Một edge giữa hex `A(q,r)` và `B = A + direction[i]` có hai cách gọi. Tạo key bằng việc sắp xếp **hai axial endpoints theo thứ tự từ điển**, ví dụ `"(-2,3)|(-1,3)"`. `UNIQUE(world_id,edge_key)`; không dựa vào q/r + i chưa chuẩn hóa. Với edge ở rìa world, cần kiểm tra bên nào trong bounds và quyền xây trước khi chấp nhận.

### Gate, watchtower, patrol integration

- Gate thay thế một wall segment cùng edge, `gate_state = OPEN | CLOSED | LOCKED`; cấp 1 gỗ, cấp 2 gia cố, cấp 3 cổng đá. Một edge không thể có wall + gate trùng.
- Watchtower anchor vào tile/vertex được định nghĩa trong footprint, tier 1 gỗ, tier 2 gạch, tier 3 đá. Có slot canh gác cho cung/nỏ và range vision.
- Movement graph phải xét `edge barriers`: wall chặn người/xe; gate OPEN thông, CLOSED chặn, guard permission có thể khác civilian permission; trường hợp khẩn cấp cần lộ trình thay thế.
- Vẽ tuyến tường tự động theo những cạnh từ con trỏ/các điểm đã chọn. Có hoàn tác, xóa đoạn, chọn cả vòng, upgrade batch, repair batch và dự toán chi phí.
- Không tự đóng cổng làm kẹt mọi NPC; UX cảnh báo khi gate action cắt tuyến duy nhất đến kho, trại, ao hoặc tiền đồn.

## Phó bản thủ thành

Bố cục tường/cổng/tower và đội tuần tra tạo **snapshot defensive layout** đưa vào battle instance; không render chiến đấu PvE trực tiếp làm hỏng world. Thất bại có cooldown/hao quân nhu/thương tích, không xóa permanent structures/claims. Chương 1 có quest dựng 8–12 edge, gate và tháp, phân công lính gác.

## Acceptance và edge cases

- Nhà 1 hex lên 3 cấp mà không chiếm thêm tile; cấp 3 phải có mô hình 2 tầng đúng nghĩa.
- Zone từ 6 hex liên thông; multi-hex rotate, overlap check, slope check, reject insufficient resources.
- Xây wall qua các góc/đường cong không trùng cạnh; gate thay wall một cách atomic.
- Pathfinding đổi khi gate đóng/mở; không xuyên tường.
- Sửa/nâng cấp hàng loạt không trừ đôi khi retry; refresh giữ level/HP/footprint/edge orientation.
- Hành động trên world người khác bị 403; transaction rollback trọn vẹn nếu một cạnh/ô thất bại.
