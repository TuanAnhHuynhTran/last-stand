# LAST HAVEN — GAME'S DESCRIPTION

> **Tài liệu thiết kế game và bộ yêu cầu triển khai 12 giai đoạn**  
> Phiên bản: **2.0 — Chibi 3D / Hex World Builder**  
> Ngôn ngữ tài liệu: Tiếng Việt  
> Trạng thái: Tài liệu thiết kế mục tiêu; các thông số kinh tế và cân bằng chưa được playtest  
> Mục đích: Làm nguồn yêu cầu thống nhất để triển khai lần lượt bằng Claude Code, Cursor hoặc AI Agent trong VS Code.

---

## 1. TỔNG QUAN TRÒ CHƠI

### 1.1. Tên và định hướng

**LAST HAVEN** là trò chơi **xây dựng, sinh tồn và phát triển lãnh địa sau tận thế** chạy trên trình duyệt, sử dụng đồ họa **3D chibi stylized** và **lưới lục giác (hex grid)** cho mọi tương tác không gian. Mỗi người chơi sở hữu một thế giới độc lập, bắt đầu với một khu đất tương đương **100 × 100 đơn vị**, nằm trong không gian cá nhân tối đa **1000 × 1000 đơn vị**.

Người chơi xây nhà dân, phát triển dân số, mở ruộng lúa, trồng trọt, nuôi gia súc, đào ao thả cá, xây doanh trại và huấn luyện bốn binh chủng đầu tiên: **đao, thương, cung, nỏ**. Khi đất bắt đầu chật, người chơi dùng radar hoặc đội trinh sát để **quét bản đồ xung quanh**, khám phá và khai phá thêm từng vùng hex. Chiến đấu PvE/PvP diễn ra trong **chiến trường riêng**; không phá hủy trực tiếp thế giới xây dựng của người khác.

**Nguyên tắc quan trọng:** “Giống thật” ở đây nghĩa là hệ thống vận hành thực — dữ liệu được lưu, công trình thực sự sản xuất, cư dân và động vật có hành vi — **không có nghĩa là đồ họa photorealistic**. Phong cách hình ảnh thống nhất là chibi 3D: ấm áp, dễ thương, sắc nét và giàu chiều sâu.

### 1.2. Bối cảnh

Sau một thảm họa làm đứt gãy nền văn minh công nghiệp, người sống sót tái thiết cộng đồng bằng nông nghiệp, nghề thủ công, động vật và vũ khí truyền thống. Trong thế giới vẫn còn phế tích máy móc, radar và công nghệ cũ để khám phá. Bối cảnh vừa có yếu tố **hậu tận thế**, vừa mang cảm giác **cozy village builder**. Không lấy kinh dị u tối, máu me hoặc photorealism làm tông chính.

### 1.3. Vòng lặp gameplay

1. **Xây nhà** → tăng sức chứa dân số, đón người sống sót.
2. **Trồng trọt, chăn nuôi, thủy sản** → tạo lương thực và nguyên liệu.
3. **Phân công cư dân** → vận hành sản xuất và xây dựng.
4. **Nâng cấp công trình** → thay đổi mô hình chibi 3D và tăng hiệu quả.
5. **Luyện quân** → chuẩn bị thám hiểm các điểm nguy hiểm.
6. **Quét bản đồ** → phát hiện vùng đất, tài nguyên, động vật và phế tích.
7. **Khai phá và mở rộng** → tạo thêm diện tích xây dựng.
8. **Chiến đấu ở battle map riêng** khi nhiệm vụ yêu cầu → nhận thưởng/công nghệ → trở về lãnh địa.
9. Lặp lại ở quy mô lớn hơn; sau này có thể thăm thế giới bạn bè và PvP.

### 1.4. Định nghĩa hoàn thành một tính năng

Một tính năng **chỉ được coi là hoàn thành** khi có đầy đủ: UI tương tác được, logic gameplay hợp lệ, API thật (nếu có thay đổi dữ liệu), lưu/khôi phục MySQL, xử lý lỗi, kiểm thử phù hợp, asset thực tế hoặc ghi rõ còn thiếu asset. Không dùng nút giả, số liệu hardcode ở giao diện hay placeholder để tuyên bố một hệ thống đã hoàn chỉnh.

---

## 2. QUY CHUẨN KỸ THUẬT CHUNG

### 2.1. Stack dự kiến

| Hạng mục | Công nghệ |
|---|---|
| Ngôn ngữ | TypeScript (frontend, backend và shared) |
| Frontend | React, Vite, React Router |
| 3D | Three.js, React Three Fiber, @react-three/drei |
| UI | Tailwind CSS, shadcn/ui |
| Client state | Zustand |
| API state | TanStack Query và Axios |
| Backend | Node.js LTS, Express, Zod |
| Database | MySQL 8, Sequelize 6, `mysql2` |
| Realtime (về sau) | Socket.IO |
| Job/cache (khi cần) | Redis, BullMQ |
| Dựng asset | Blender, GLB/GLTF 2.0, stylized PBR |
| Animation | Blender Actions, glTF animations, Three.js AnimationMixer |
| Va chạm động (khi thật cần) | Rapier, không sử dụng cho mọi vật tĩnh |
| Tests | Vitest, Supertest, Playwright |
| Phiên bản | Kiểm tra tương thích tại thời điểm cài; khóa bằng lockfile, không mặc định API cũ còn hợp lệ |

**Khuyến nghị kiến trúc:** bắt đầu bằng **modular monolith**, không chia microservices ngay. Tách thành các module `world`, `buildings`, `economy`, `citizens`, `farming`, `animals`, `military`, `battle`, `social` nhưng triển khai chung một API server ban đầu.

### 2.2. Cấu trúc repository

```text
last-haven/
├── apps/
│   ├── client/
│   │   └── src/
│   │       ├── app/
│   │       ├── game/
│   │       │   ├── world/
│   │       │   ├── hex/
│   │       │   ├── buildings/
│   │       │   ├── farming/
│   │       │   ├── animals/
│   │       │   ├── citizens/
│   │       │   └── battle/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── stores/
│   │       └── services/
│   └── server/
│       └── src/
│           ├── modules/
│           ├── config/
│           ├── middleware/
│           ├── database/
│           └── jobs/
├── packages/
│   └── shared/
│       ├── hex/
│       ├── types/
│       ├── schemas/
│       └── constants/
├── assets/
│   ├── models/
│   ├── textures/
│   ├── animations/
│   └── audio/
├── scripts/
├── docs/
└── package.json
```

### 2.3. Nguyên tắc dữ liệu

- **Server authoritative:** server kiểm tra quyền sở hữu, điều kiện xây, trừ tài nguyên, cấp công trình, thu hoạch, tuyển quân, xác nhận kết quả chiến đấu.
- **Transaction:** mọi thao tác thay đổi đồng thời tài nguyên, công trình, ô đất phải thực hiện nguyên tử; xử lý tranh chấp tài nguyên/ô đất.
- **Idempotency:** chống gửi lặp API xây dựng, thu hoạch, nhận thưởng, nâng cấp.
- **Migrations:** sử dụng Sequelize migrations, không tự xóa dữ liệu bằng `sync({force:true})`.
- **Validation:** kiểm tra dữ liệu request bằng Zod, kiểm tra `world_id` thuộc quyền người dùng.
- **Offline:** sản xuất/huấn luyện tính theo timestamp trên server, không chạy game loop cho từng thế giới không được mở.
- **Render != simulation:** NPC/chibi animation là hình ảnh biểu đạt logic; không để FPS quyết định lượng lương thực, vật liệu, thời gian đào tạo.
- **Seed:** world seed phải cho kết quả sinh địa hình ổn định, không đổi tùy lần đăng nhập.

---

## 3. QUY CHUẨN THẾ GIỚI HEX

### 3.1. Kích thước và hệ tọa độ

- Thế giới cá nhân: **1000 × 1000 world units**, giới hạn bởi hình vuông trong mặt phẳng XZ; quy ước 1 unit ≈ 1 mét.
- Lãnh thổ khởi đầu: diện tích **xấp xỉ 100 × 100 = 10.000 m²**, tạo từ khoảng **115 ô hex liên thông** có địa hình phù hợp xây dựng; **không bắt buộc** biên giới thành hình vuông chính xác.
- Lưới: **hex pointy-top**; hệ tọa độ **axial `(q,r)`**, tọa độ cube ẩn `(q,-q-r,r)` nếu cần.
- Khoảng cách giữa tâm các ô liền kề: **10 units**.
- Bán kính ngoại tiếp hex: `side = 10 / sqrt(3) ≈ 5.7735`.
- Diện tích một hex: `(sqrt(3)/2) × 10² ≈ 86.60 m²`.
- Tọa độ tâm hex theo mặt phẳng XZ, với s = 10 / sqrt(3):
  - `x = sqrt(3) * s * (q + r/2) = 10 * (q + r/2)`
  - `z = 1.5 * s * r ≈ 8.6603 * r`
- Sáu hàng xóm axial: `(1,0), (1,-1), (0,-1), (-1,0), (-1,1), (0,1)`.
- Khi đặt công trình, **toàn bộ footprint và hình học liên quan phải nằm trong world bounds**; không chỉ kiểm tra tâm ô.

### 3.2. Hiển thị và tương tác

- Hex grid là **hệ dữ liệu và xây dựng**; terrain nhìn liền mạch trong chế độ thường.
- Chỉ bật lớp viền hex trong **Build Mode, Scan Mode, chiến đấu hoặc khi chọn đất**.
- Camera mặc định isometric/3⁄4 từ trên xuống, có pan, zoom, xoay; không để công trình bị khuất hoàn toàn.
- Có highlight khi hover, đường ranh lãnh thổ và vùng chọn nhiều hex.
- Một số khu vực có độ cao, dốc, hồ, sông; công trình có quy tắc địa hình riêng.
- Thế giới có **Fog of War**: `hidden`, `scanned`, `claiming`, `claimed`, `blocked` (phân biệt trạng thái khám phá và sở hữu trong dữ liệu).

### 3.3. Sinh dữ liệu theo chunk

- Không tạo sẵn hàng nghìn/millions hàng cho mọi ô của mọi thế giới.
- Sinh terrain từ `world_seed`, chỉ lưu dữ liệu ô đã khám phá, đã bị chỉnh sửa hoặc có dữ liệu gameplay cần bền vững.
- Tải các chunk quanh camera, dùng InstancedMesh, LOD, culling và texture tối ưu.
- Không tải tài nguyên bí mật của ô `hidden` xuống client.

---

## 4. ART DIRECTION — CHIBI 3D STYLIZED

### 4.1. Mục tiêu thị giác

Phong cách **cozy chibi village builder** trên nền hậu tận thế đã bắt đầu phục hồi. Hình ảnh dễ thương, ấm áp, sạch, nhiều chi tiết có chủ đích; không phải người thật thu nhỏ, không phải low-poly cube thô, cũng không cần photorealistic.

- **Nhân vật:** khoảng 2.5–3.5 đầu, đầu lớn, thân/người ngắn, bàn tay/chân cách điệu, biểu cảm nhận ra từ góc isometric.
- **Nhà:** mái lớn, cửa/cửa sổ dễ nhìn, chất liệu gỗ/gạch/ngói stylized; sân vườn, hàng rào, đèn và phụ kiện có tỷ lệ hợp lý với hex.
- **Động vật:** đầu/tỷ lệ hơi phóng đại, hình dáng đặc trưng, idle/walk/eat/drink/rest; ngựa và voi vẫn có cảm giác khác kích thước so với người.
- **Môi trường:** cỏ mềm, cây tán tròn, đá bo cạnh, nước trong, kênh và bờ ao mượt; địa hình có lớp chi tiết nhưng vẫn rõ ràng khi zoom xa.
- **Hiệu ứng:** ánh sáng ban ngày ấm, shadow mềm, mưa/gió nhẹ, khói lò rèn, sóng nước; tránh post-processing quá nặng.
- **Độ đọc:** nhìn từ xa phải phân biệt được nhà cấp 1/2/3, loại trang trại, bốn binh chủng, ruộng đang xanh hay đã chín.

### 4.2. Tài sản 3D và quy trình

- Dựng bằng Blender hoặc sử dụng asset có quyền sử dụng rõ ràng; xuất `.glb`.
- Mỗi cấp nhà nên có asset/biến thể thực. Mỗi công trình cần **anchor/pivot** nhất quán.
- Với công trình nhiều hex biến hình tự do (ruộng, ao, hàng rào), dùng **module/procedural geometry** kết hợp asset chibi; không tạo một GLB duy nhất cho mọi hình dạng.
- Dùng Texture Atlas / Material reuse / texture compression khi hợp lý.
- Tạo `assets/manifest.json` với `assetKey`, `path`, `category`, `level`, `status`, `license`, `author`, `source`.
- **Không ngộ nhận:** mô hình từ code primitive hay ảnh render 2D không thể thay thế asset 3D chibi hoàn chỉnh; có thể dùng làm placeholder giai đoạn đầu nhưng phải ghi rõ.

---

## 5. HỆ THỐNG CÔNG TRÌNH VÀ BA CẤP NÂNG CẤP

### 5.1. Nguyên tắc

**Nâng cấp** giữ nguyên footprint (trừ công trình có quy tắc đặc biệt), tăng cấp mô hình và hiệu năng; **mở rộng** thêm vùng hex liền kề. Hai thao tác độc lập.

| Nhóm | Footprint tối thiểu | Quy tắc |
|---|---:|---|
| Nhà dân | 1 hex | Luôn 1 hex, tăng chiều cao và sức chứa |
| Trung tâm lãnh địa | 7 hex | Trung tâm điều hành, 3 cấp |
| Kho, chợ, trạm y tế, xưởng nhỏ | 2–3 hex | Công trình dân sinh nhiều cấp |
| Cánh đồng lúa, ngô, rau, vườn, đồng cỏ | 6 hex | Vẽ vùng; mở rộng theo cụm ≥6 hex |
| Trại gà, lợn, dê/cừu | 6 hex | Chuồng + hàng rào + sân |
| Trang trại bò | 9 hex | Chuồng + đồng cỏ |
| Ao cá | 6 hex | Đào và tạo nước thật |
| Hồ nuôi lớn | 12 hex | Hình dạng tùy chọn |
| Khu ươm cá, cá lồng | 6 hex | Cá lồng yêu cầu mặt nước |
| Doanh trại đao, thương, cung, nỏ | 6 hex | Mỗi binh chủng có cơ sở riêng |
| Lò rèn quân sự, kho quân nhu | 6 hex | Sản xuất/hậu cần quân sự |
| Trường huấn luyện tổng hợp | 9 hex | Luyện kỹ năng và đội hình |
| Trại ngựa | 9 hex | Có thể mở thêm đồng cỏ |
| Trại voi | 12 hex | Có thể mở thêm sân/hồ tắm |

**Lưu ý:** các kích thước là quy tắc gameplay, chưa phải mô phỏng kích thước chuồng trại đời thật.

### 5.2. Nhà dân — 1 hex

| Cấp | Mô hình 3D chibi | Sức chứa gợi ý |
|---|---|---:|
| 1 | Nhà gỗ một tầng, mái lớn, hàng rào gỗ, sân vườn nhỏ | 4 |
| 2 | Nhà gạch mái ngói, nền lát đá, cửa lớn hơn, vườn đẹp hơn | 6 |
| 3 | Nhà gạch **hai tầng thật**, ban công, cửa sổ hai tầng, sân vườn hoàn chỉnh | 10 |

Nhà **tăng sức chứa dân số**, không tự sinh thêm dân. Tăng dân nhờ di cư, giải cứu và cơ chế phát triển dân số nếu mở khóa.

### 5.3. Công trình dân sinh

| Công trình | Cấp 1 | Cấp 2 | Cấp 3 |
|---|---|---|---|
| Trung tâm lãnh địa (7 hex) | Nhà chỉ huy gỗ | Dinh gạch mái ngói | Phủ hai tầng, quảng trường nhỏ |
| Kho (2 hex) | Kho gỗ | Kho gạch có kệ | Kho lớn/gác chứa, bốc dỡ tốt hơn |
| Chợ (3 hex) | Quầy gỗ mái vải | Chợ mái ngói | Khu chợ nhiều gian / tầng |
| Trạm y tế (2 hex) | Nhà thuốc gỗ | Phòng khám gạch | Bệnh xá hai tầng |
| Xưởng mộc (3 hex) | Xưởng thủ công | Xưởng mái ngói có máy cưa cơ học | Xưởng lớn có khu gia công và kho |

### 5.4. Nông nghiệp — từ 6 hex

| Loại | Cấp 1 | Cấp 2 | Cấp 3 |
|---|---|---|---|
| Ruộng lúa | Bờ đất, tưới thủ công | Kênh nước, bờ gia cố, chòi canh | Điều tiết nước, trạm bơm nhỏ, đường thu hoạch |
| Ruộng ngô | Luống đất, rào gỗ | Tưới và kho dụng cụ | Quy hoạch và vận chuyển hiệu quả |
| Vườn rau | Luống rau ngoài trời | Mái che, bể nước | Nhà kính, tưới cải tiến |
| Vườn cây | Cây non, đường đất | Cây trưởng thành, tưới | Kho thu hoạch, đường vận chuyển |
| Đồng cỏ | Cỏ tự nhiên, hàng rào | Bãi cải tạo, máng nước | Chia khu, kho cỏ và cấp nước |

Trạng thái sinh trưởng: gieo → non → trưởng thành → chín → thu hoạch. Hình ảnh thay đổi theo chu kỳ, mô phỏng thật bằng timestamp và dữ liệu server.

### 5.5. Chăn nuôi — từ 6/9 hex

| Loại | Cấp 1 | Cấp 2 | Cấp 3 |
|---|---|---|---|
| Trại gà | Chuồng gỗ, sân rào | Chuồng gạch, ổ trứng | Khu nhiều khoang, ấp trứng |
| Trại lợn | Chuồng gỗ nền đất | Chuồng gạch, máng và rãnh | Khu chuồng chia ô, xử lý phân |
| Trại bò | Chuồng gỗ, đồng cỏ nhỏ | Chuồng gạch, kho cỏ | Khu chăm sóc, vắt sữa |
| Trại dê/cừu | Chuồng gỗ, bãi cỏ | Chuồng gạch, chia bãi | Khu thu sữa/lông, hậu cần |

Động vật cần thức ăn, nước, sức khỏe, tuổi, tăng trưởng, sản xuất và giới hạn sức chứa. Sức chứa ở các cấp là **dữ liệu cân bằng có thể cấu hình**.

### 5.6. Thủy sản — từ 6/12 hex

| Loại | Cấp 1 | Cấp 2 | Cấp 3 |
|---|---|---|---|
| Ao cá (6+) | Ao đất, cầu gỗ, chòi | Kè đá, cống nước, cầu | Lọc/sục khí stylized, khu thu hoạch |
| Hồ nuôi lớn (12+) | Hồ đất lớn | Kè và đường ven hồ | Bến thu hoạch, trạm quản lý nước |
| Ươm giống (6+) | Bể ươm đơn giản | Bể gạch, cấp nước | Cụm bể có lọc và mái che |
| Cá lồng (6+ hex nước) | Bè gỗ và lồng lưới | Bè chắc chắn, nhiều lồng | Bè lớn, kho thức ăn, kiểm tra nước |

Ao phải thay đổi **terrain**, có đáy thấp hơn mặt đất và đường bờ được dựng theo **biên của vùng hex**, không chỉ đặt một tấm mặt nước giả. Cá 3D có idle/swim/turn/feed, không bơi xuyên bờ.

### 5.7. Quân sự — từ 6 hex

| Loại | Cấp 1 | Cấp 2 | Cấp 3 |
|---|---|---|---|
| Trại đao | Lều/sân đất, hình nộm | Nhà gạch, sân luyện | Doanh trại kiên cố, sân tập lát đá |
| Trại thương | Sân tập thương, giá vũ khí | Sân luyện đội hình | Nhà lớn và luyện trận hình |
| Trường cung | Bia rơm đơn giản | Nhiều bia ở khoảng cách khác nhau | Tháp quan sát, bia chuyển động |
| Trường nỏ | Bia cố định, giá nỏ | Bia giáp, khu nạp | Khu cơ khí nỏ, bia phức tạp |
| Lò rèn quân sự | Một lò và đe | Hai lò, kho kim loại | Khu rèn lớn, nhiều thợ |
| Trường tổng hợp (9+) | Sân đất, cọc gỗ | Sân tập chướng ngại | Học viện quân sự chibi |
| Kho quân nhu | Kho gỗ | Kho gạch | Kho kiên cố chia khu |

Bốn binh chủng ban đầu: **đao binh, thương binh, cung binh, nỏ binh**. Tuyển lính từ cư dân sẵn có, không tạo lính trực tiếp từ tài nguyên. Ngựa/voi là vật nuôi quân sự hoặc thú cưỡi, chưa cần mở rộng danh sách binh chủng gốc.

### 5.8. Trại ngựa và voi

| Loại | Cấp 1 | Cấp 2 | Cấp 3 |
|---|---|---|---|
| Trại ngựa (9+) | Chuồng gỗ, bãi cỏ, 4 ngựa gợi ý | Chuồng gạch, sân tập, 8 ngựa | Học viện kỵ binh, sân cưỡi, 12 ngựa |
| Trại voi (12+) | Chuồng gỗ cao, hồ tắm nhỏ, 2 voi | Chuồng kiên cố, hồ lớn, 4 voi | Trung tâm huấn luyện tượng binh, 6 voi |

Có hệ thống chăm sóc, sức khỏe, thức ăn, nước, huấn luyện và gán ngựa cho lính; tránh một ngựa bị gán cho hai binh sĩ đồng thời.

---

## 6. GIAO DIỆN NGƯỜI CHƠI

- **World HUD:** tài nguyên, dân số, giờ game, cấp lãnh địa, thông báo.
- **Build Mode:** danh mục nhà/ruộng/trại/ao/quân sự, preview bán trong suốt, highlight footprint, xoay từng góc 60°, tính chi phí, nút xác nhận/hủy.
- **Area Drawing:** kéo chọn vùng liên thông tối thiểu 6 hex, hoàn tác, mở rộng, kiểm tra ô bị chặn, hiển thị diện tích và chi phí.
- **Building Inspector:** tên, cấp 1/3, người sử dụng, năng suất, trạng thái, nâng cấp, di chuyển/tháo dỡ.
- **Population/Production:** phân công, nhu cầu lương thực/nước, sản lượng, kho, cảnh báo.
- **Map/Scan:** trạng thái khám phá, vùng quét, tài nguyên và điều kiện khai phá.
- **Army/Battle:** tuyển quân, đội hình, kỹ năng, chuẩn bị trận, chiến đấu theo lượt.
- **Social (sau):** bạn bè, thăm thế giới, liên minh và PvP.

UI có tông **gỗ, kem, xanh lá, nâu ấm**, bo tròn, dễ đọc, không che khu vực xây dựng. Không dùng bảng dashboard doanh nghiệp làm giao diện chính.

---

## 7. DATABASE VÀ API DỰ KIẾN

### 7.1. Các bảng chính

| Module | Bảng |
|---|---|
| Auth | `users`, `sessions` |
| World | `worlds`, `world_hex_tiles`, `world_resources`, `world_scan_jobs`, `world_claim_jobs`, `world_discoveries`, `world_points_of_interest` |
| Building | `building_types`, `building_levels`, `world_buildings`, `building_footprints`, `building_construction_jobs` |
| Farming | `crop_types`, `farm_zones`, `farm_zone_tiles`, `crop_cycles`, `irrigation_networks` |
| Livestock | `animal_species`, `livestock_farms`, `farm_animals`, `livestock_production_jobs`, `animal_feed_recipes` |
| Aquaculture | `water_bodies`, `water_body_tiles`, `fish_species`, `fish_stock_batches`, `aquaculture_cycles` |
| Citizens & Economy | `survivors`, `survivor_jobs`, `survivor_housing`, `production_recipes`, `production_jobs`, `resource_transactions` |
| Military | `unit_types`, `military_units`, `military_training_jobs`, `military_squads`, `military_squad_members`, `equipment_types` |
| Mounts | `animal_training_jobs`, `animal_assignments`, `mount_assignments` |
| Battle | `battle_instances`, `battle_participants`, `battle_units`, `battle_turns`, `battle_actions`, `battle_rewards` |
| Social | `friendships`, `friend_requests`, `alliances`, `alliance_members`, `alliance_messages` |

**Không triển khai toàn bộ bảng ngay giai đoạn 1.** Mỗi giai đoạn thêm migrations tương ứng. Những bảng nhiều vùng/động vật có thể dùng chung model nền tảng để không nhân đôi logic footprint hoặc resource ledger.

### 7.2. Các nhóm API chính

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/world/me
GET    /api/world/me/tiles
GET    /api/world/me/resources
GET    /api/buildings/catalog
GET    /api/world/me/buildings
POST   /api/world/me/buildings
POST   /api/world/me/buildings/:id/upgrade
PATCH  /api/world/me/buildings/:id/position
DELETE /api/world/me/buildings/:id
POST   /api/farms
POST   /api/farms/:id/expand
POST   /api/farms/:id/plant
POST   /api/farms/:id/harvest
POST   /api/world/me/scans
POST   /api/world/me/claims
POST   /api/battles
GET    /api/battles/:id
POST   /api/battles/:id/actions
```

Tất cả API yêu cầu xác thực/ủy quyền phù hợp, schema validation, chống request trùng và phản hồi lỗi thống nhất. Tên endpoint là chuẩn đề xuất; thay đổi có kiểm soát nếu có lý do kỹ thuật.

---

## 8. QUY TRÌNH CHẠY PROMPT VỚI AI LẬP TRÌNH

1. Cho AI đọc **toàn bộ file này**, đặc biệt từ mục 1 đến 8.
2. Chỉ định **giai đoạn cần triển khai** trong các mục 9–20 dưới đây.
3. AI đọc repository trước, đối chiếu tính năng đã có, đưa ra kế hoạch file/migration/API rồi triển khai ngay trong phạm vi giai đoạn.
4. AI không tự chuyển giai đoạn; không phá phần đã hoạt động; ghi rõ placeholder hoặc phần chưa làm.
5. Sau mỗi giai đoạn chạy lint, typecheck, test, build; đo/kiểm tra 3D thực tế khi có môi trường; báo cáo cụ thể.

> **Câu lệnh mẫu:** “Hãy đọc file `game's description.md`, thực hiện đầy đủ **Giai đoạn N**, tuân thủ các quy tắc toàn dự án, không tự triển khai giai đoạn N+1. Kiểm tra và sửa lỗi, chạy test/build, báo cáo những phần đã hoàn thành và chưa hoàn thành.”

---

## 9. GIAI ĐOẠN 1 — KHỞI TẠO FULL-STACK VÀ THẾ GIỚI CÁ NHÂN

> **Prompt triển khai 1/12**  
> Kết quả: người chơi đăng ký/đăng nhập, có một thế giới riêng và tài nguyên khởi đầu được lưu trong MySQL.

### Yêu cầu AI triển khai

Hãy khởi tạo LAST HAVEN từ repository hiện có hoặc tạo monorepo mới theo mục 2. Không triển khai hệ thống xây nhà hoặc PvP ở giai đoạn này. Trọng tâm là nền tảng có thể mở rộng và kiểm thử được.

**Công nghệ:** React + Vite + TypeScript; Tailwind + shadcn/ui; Zustand; TanStack Query; Node.js + Express + TypeScript; Sequelize + MySQL 8; Zod; Vitest + Supertest + Playwright. Thiết lập npm workspaces, `strict` TypeScript, ESLint, Prettier, `.env.example`, npm scripts và migrations.

#### 9.1. Tài khoản

- Tạo `users`, `sessions` hoặc cơ chế refresh session tương đương.
- Đăng ký, đăng nhập, đăng xuất, `GET /api/auth/me`.
- Hash mật khẩu bằng thuật toán mạnh (Argon2id hoặc bcrypt với cấu hình hợp lý), sử dụng HttpOnly cookie an toàn khi phù hợp.
- Middleware auth và permission; validation mọi đầu vào; error handler thống nhất; không đưa secrets vào client.
- Hai người chơi không được truy cập dữ liệu riêng của nhau.

#### 9.2. Thế giới người chơi

- Tạo bảng `worlds(id,owner_id,name,world_seed,width,height,created_at,updated_at)` và unique index theo owner nếu mỗi tài khoản có một thế giới.
- Tạo `world_hex_tiles` có unique `(world_id,q,r)` và `world_resources` có unique `(world_id,resource_code)`.
- Khi đăng ký lần đầu, tạo **một** world: 1000 × 1000, seed cố định, vùng khởi đầu **khoảng 115 hex liên thông**, tương đương 100 × 100.
- Đảm bảo vùng khởi đầu chứa nền đất xây được; chỉnh seed/địa hình một cách deterministic cho khu khởi đầu nếu cần.
- Tạo tài nguyên ban đầu bằng cấu hình seed; toàn bộ thao tác tạo user/world/resources trong transaction.
- Không khởi tạo lại world khi refresh hoặc đăng nhập lại.

#### 9.3. Giao diện

- Trang đăng nhập/đăng ký theo phong cách UI chibi/cozy; loading screen.
- `GameShell`: top bar tài nguyên, khung WebGL, thanh công cụ, panel thông tin, cài đặt.
- Có protected routes, loading/error state, kiểm tra session hợp lệ.
- Vùng 3D có thể là scene khởi tạo tối giản; terrain thực được làm ở giai đoạn 2.

#### 9.4. API

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/world/me
GET  /api/world/me/resources
```

#### 9.5. Tiêu chí nghiệm thu

- Có thể chạy client và server bằng scripts rõ ràng.
- Đăng ký thành công tạo chính xác 1 user + 1 world; retry không tạo world thừa.
- Refresh/đăng nhập lại thấy cùng world_id, world_seed và tài nguyên.
- Không cho user A đọc world B.
- Migrations và seed chạy ổn định; không `force sync`.
- Lint, typecheck, tests và build đạt; báo cáo đường dẫn file thay đổi.

---

## 10. GIAI ĐOẠN 2 — BẢN ĐỒ HEX 3D CHIBI, TERRAIN VÀ CAMERA

> **Prompt triển khai 2/12**  
> Kết quả: người chơi quan sát và tương tác với thế giới chibi 3D; địa hình liền mạch nhưng mọi logic đều dựa trên hex.

### Yêu cầu AI triển khai

Hãy xây dựng `WorldScene` 3D chibi dựa trên giai đoạn 1. Bản đồ phải là thế giới động được sinh theo seed, không phải ảnh nền cố định hoặc tập hợp các lục giác nổi như bàn cờ ở chế độ bình thường.

**Công nghệ:** React Three Fiber, Three.js, Drei, TypeScript, seeded OpenSimplex/Simplex noise hoặc equivalent, custom mesh/material, InstancedMesh, LOD.

#### 10.1. Hex math bắt buộc

Tạo `packages/shared/hex` dùng lại được ở server và client:

- `axialToWorld(q,r)` và `worldToAxial(x,z)`.
- `hexRound`, `hexNeighbors`, `hexDistance`.
- `hexRing`, `hexDisk`, `getHexesInRange`, `getConnectedRegion`.
- `isWithinWorldBounds`, `getHexPolygon` và kiểm tra footprint.
- Unit test cho phép nghịch đảo tọa độ, hàng xóm, khoảng cách và biên bản đồ.

#### 10.2. Terrain và biome

- Sinh đồng cỏ, đất xây dựng, ruộng tiềm năng, rừng, đồi, đá, hồ nước, bờ sông và phế tích theo world_seed.
- Đảm bảo biome có mảng liên tục tự nhiên, không noise độc lập cho từng ô tạo địa hình loang lổ.
- Địa hình nhìn **liền mạch**; hex chỉ là sampling/logic. Dựng transition mượt giữa đất, đá, bờ nước.
- Khu khởi đầu phẳng tương đối, đẹp, dễ quy hoạch.
- Có cây chibi tán tròn, cỏ, bụi cây, hoa, đá bo góc, water shader đơn giản.

#### 10.3. Camera và tương tác

- Camera isometric/3⁄4, pan, zoom, rotate bằng chuột, damping, focus và giới hạn biên.
- Hover và click chính xác ô hex kể cả khi terrain cao thấp.
- `Build Mode`: hiển thị outline từng ô, quyền sở hữu, vùng không thể xây.
- `Normal Mode`: ẩn phần lớn grid, giữ đường biên và cảnh quan.
- Khi zoom gần thấy đủ chi tiết cây, nhà (sau này), mặt nước; zoom xa vẫn rõ biome.

#### 10.4. Tối ưu scene

- Chia map thành **chunk** dựa trên tọa độ hex (chunk shape có thể là vùng q,r cố định nhưng không thay thế logic hex).
- Chỉ tải/render chunk trong camera/near-camera.
- InstancedMesh cho cây, đá, cỏ; LOD cho asset lớn; reuse material; culling; quality presets Low/Medium/High.
- Không mỗi cây/cỏ là một React component riêng; không mô phỏng các vật thể ở xa.

#### 10.5. Cấu trúc module

`HexMath`, `WorldGenerator`, `TerrainGenerator`, `WorldChunkManager`, `VegetationRenderer`, `WaterRenderer`, `HexOverlay`, `CameraController`, `WorldInteractionController`.

#### 10.6. Tiêu chí nghiệm thu

- World seed ổn định giữa các lần reload; khác seed tạo thế giới khác.
- Đất khởi đầu ~100 × 100 và ranh giới rõ.
- Camera điều khiển mượt, hover đúng hex khi xoay/zoom.
- Không có khe hở giữa chunk, không nhìn thấy terrain như các cột hex rời.
- Có thể quan sát vùng nhiều nghìn hex theo cơ chế streaming không tải tất cả cùng lúc.
- Đo FPS/draw calls trong scene mẫu và báo cáo kết quả thực tế, không tự nhận hiệu năng đạt nếu chưa đo.

---

## 11. GIAI ĐOẠN 3 — BUILDING ENGINE VÀ NÂNG CẤP NHÀ CHIBI

> **Prompt triển khai 3/12**  
> Kết quả: xây, đặt, xoay, di chuyển, tháo dỡ và nâng cấp nhà thật; nhà dân 1 hex tăng từ gỗ sang gạch rồi hai tầng.

### Yêu cầu AI triển khai

Hãy tạo **Building Engine dùng chung toàn dự án**, không viết mỗi công trình bằng một component logic riêng. Tính năng bắt buộc có API, MySQL, mô hình 3D/chỉ rõ trạng thái placeholder và quy trình xây/nâng cấp thực.

**Công nghệ:** React/TypeScript, React Three Fiber, Zustand, TanStack Query; Express/Sequelize/MySQL; Blender và GLB/GLTF.

#### 11.1. Mô hình dữ liệu

- `building_types`, `building_levels`, `world_buildings`, `building_footprints`, `building_construction_jobs`.
- `world_buildings`: world_id, type_code, level, anchor_q, anchor_r, rotation_step 0..5, state, construction_started_at/finishes_at, timestamps.
- `building_footprints` lưu từng ô chiếm và ràng buộc không cho hai công trình cùng chiếm một ô, ngoại trừ lớp hạ tầng có quy tắc riêng.
- Cấu hình `BuildingDefinition` và `BuildingLevelDefinition`: tên, footprint axial offsets, model asset key, cost, thời gian, sức chứa/công năng, unlock conditions.
- Một công trình có một ID cố định qua mọi lần nâng cấp.

#### 11.2. Xây nhà dân 1 hex — ba cấp bắt buộc

**Cấp 1 — Nhà gỗ sân vườn:** một tầng, mái lớn, tường gỗ, cửa/cửa sổ chibi, sân nhỏ, hàng rào và hoa; sức chứa 4.

**Cấp 2 — Nhà gạch mái ngói:** tường gạch, mái ngói đỏ/cam, sân lát đá, cửa lớn, hàng rào tốt hơn; sức chứa 6.

**Cấp 3 — Nhà gạch 2 tầng:** hai tầng thực sự, ban công, cửa sổ tầng 2, sân vườn hoàn chỉnh; sức chứa 10.

Cả ba cấp **chiếm 1 ô hex**; phải tuân thủ footprint để không va vào nhà bên cạnh. Các mô hình có pivot/scale nhất quán; có thể tùy chọn màu mái/tường và đồ trang trí đã được mở khóa.

#### 11.3. Các công trình dân sinh

- Trung tâm lãnh địa 7 hex: nhà gỗ → dinh gạch → phủ hai tầng.
- Kho 2 hex: kho gỗ → kho gạch → kho có gác/lưu trữ lớn.
- Chợ 3 hex: sạp gỗ → chợ có mái → chợ nhiều gian.
- Trạm y tế 2 hex: nhà thuốc → phòng khám gạch → bệnh xá hai tầng.
- Xưởng mộc 3 hex: xưởng thủ công → xưởng có máy cưa → xưởng lớn.

Mỗi công trình có định nghĩa cấp độ và mô hình khác nhau; nếu asset chưa tồn tại, ghi manifest thay vì giả vờ hoàn thiện.

#### 11.4. Build Mode

- Danh mục công trình theo nhóm; chọn item để tạo **ghost preview** bán trong suốt.
- Snap vào hex; xoay 60° (6 hướng); highlight toàn bộ footprint.
- Xanh = hợp lệ, đỏ = không hợp lệ kèm lý do (chưa sở hữu, chồng, dốc, thiếu công nghệ).
- Xem chi phí và thời gian; xác nhận mới gửi API.
- Server kiểm tra lại tất cả điều kiện; trừ tài nguyên và tạo job trong transaction.
- Tạo hiệu ứng thi công/giàn giáo; không bắt client chạy timer mới hoàn tất.

#### 11.5. Nâng cấp, di chuyển, tháo dỡ

- Nâng cấp: giữ ID, anchor, rotation; đổi level, chỉ số và model khi job hoàn tất. Không làm mất cư dân đang ở.
- Di chuyển: preview footprint mới, xác thực, transaction cập nhật footprint atomically.
- Tháo dỡ: xác nhận, trả vật liệu theo công thức; xử lý dân cư/nhân sự nếu công trình có người đang ở/làm việc.
- Có panel inspect: tên, cấp hiện tại, cấp tiếp theo, chi phí, trạng thái, nâng cấp, di chuyển, tháo dỡ.

#### 11.6. API

```text
GET    /api/buildings/catalog
GET    /api/world/me/buildings
POST   /api/world/me/buildings
POST   /api/world/me/buildings/:id/upgrade
PATCH  /api/world/me/buildings/:id/position
DELETE /api/world/me/buildings/:id
```

#### 11.7. Tiêu chí nghiệm thu

- Một căn nhà 1 hex nâng đủ ba cấp và model thay đổi rõ: **gỗ → gạch → gạch hai tầng**.
- Không xây lên đất chưa sở hữu, đè công trình, hoặc trừ tài nguyên sai.
- Không có hai yêu cầu xây đồng thời cùng chiếm một hex.
- Refresh vẫn giữ cấp nhà, vị trí, rotation và tài nguyên.
- Mô hình không lấn sang footprint bên cạnh, không nổi/chìm dưới mặt đất.
- Các công trình dân sinh dùng chung Building Engine thay vì code trùng lặp.

---

## 12. GIAI ĐOẠN 4 — CÁNH ĐỒNG, CÂY TRỒNG VÀ THỦY LỢI CHIBI

> **Prompt triển khai 4/12**  
> Kết quả: tự vẽ ruộng từ 6 hex, gieo trồng, nhìn cây lớn, thu hoạch và nâng cấp ruộng 3 cấp.

### Yêu cầu AI triển khai

Tạo module **Agriculture** gắn với đất đã sở hữu, Building Engine và Economy. Người chơi được vẽ khu trồng trọt tự do trên các ô hex **liên thông**, không phải chọn một prefab ruộng hình vuông.

**Công nghệ:** React Three Fiber, Three.js/InstancedMesh, TypeScript, Zustand, shaders nhẹ cho gió; Express, Sequelize, MySQL, server timestamps.

#### 12.1. Loại hình trồng trọt

- Cánh đồng lúa, ruộng ngô, vườn rau, vườn cây ăn quả, đồng cỏ.
- Vùng ban đầu **tối thiểu 6 hex**; có thể mở rộng theo cụm **tối thiểu 6 hex** giáp vùng hiện tại.
- Các vùng có thể hình dạng bất kỳ miễn là liền kề và phù hợp terrain; không dùng square grid ẩn.

#### 12.2. Công cụ vẽ vùng

- Chọn loại ruộng → bật overlay, click/kéo qua các hex; hỗ trợ bỏ chọn, undo/cancel, thông báo lỗi.
- Kiểm tra quyền sở hữu, loại đất, công trình đang chiếm, vùng liền thông, tối thiểu 6 hex.
- Preview diện tích, chi phí cải tạo, công thức sản xuất, nguồn nước.
- Confirm → API tạo một `farm_zone`, ghi danh sách `farm_zone_tiles`, trừ vật liệu trong transaction.

#### 12.3. Ba cấp nâng cấp

- **Cấp 1:** bờ đất, ruộng canh tác thủ công, nông dân chibi dùng cuốc/gieo.
- **Cấp 2:** bờ gia cố, kênh nước, cống, chòi nghỉ và đường nội đồng.
- **Cấp 3:** trạm bơm stylized, hệ tưới, đường vận chuyển, kho dụng cụ và năng suất tốt hơn.
- Các loại ngô/rau/vườn/đồng cỏ có biến thể cấp tương tự, không cùng một mô hình cho tất cả.
- Nâng cấp **không tăng footprint**; muốn thêm đất dùng Expand, giữ liên thông và tính lại bờ/cạnh.

#### 12.4. Sinh trưởng cây

Mỗi cây có `crop_type`, `duration`, `growth_stage`, `water_need`, `soil_fertility_factor`, `workers`, `yield`. Ít nhất lúa có các trạng thái: gieo → non → trưởng thành → vàng chín → thu hoạch. Ngô/rau/cây ăn trái cũng phải đổi hình theo quá trình.

- Dùng InstancedMesh/biến thể mesh chibi để dựng nhiều cây mà không tạo quá nhiều draw calls.
- Cây chuyển màu, chiều cao và asset; hiệu ứng gió nhẹ; nông dân có điểm làm việc và hoạt ảnh hợp lý.
- Sản lượng phụ thuộc diện tích, cấp ruộng, nước, độ màu mỡ, nhân công, công nghệ.
- Chu kỳ sinh trưởng được quyết định bằng timestamps server; reload/offline không tạo lại vụ.

#### 12.5. Thủy lợi

- Giếng, hồ, kênh, cối nước, trạm bơm, cống.
- Kết nối qua mạng lưới hex/cạnh hex, không cấp nước giả bằng khoảng cách đơn giản nếu khu vực cần ống/kênh nối.
- Có hiển thị trạng thái thiếu nước và các ô đang được cấp nước.

#### 12.6. Database và API

```text
crop_types
farm_zones
farm_zone_tiles
crop_cycles
irrigation_networks

POST /api/farms
POST /api/farms/:id/expand
POST /api/farms/:id/upgrade
POST /api/farms/:id/plant
POST /api/farms/:id/harvest
GET  /api/farms/:id
GET  /api/world/me/farms
```

#### 12.7. Tiêu chí nghiệm thu

- Không tạo ruộng dưới 6 hex, không nhận vùng rời rạc, không chồng lên nhà.
- Trồng lúa có ít nhất bốn pha hình ảnh dễ phân biệt; thu hoạch cộng đúng kho.
- Thu hoạch không thể nhận thưởng hai lần; reload không mất tiến độ.
- Nâng cấp 1→3 làm rõ mô hình và công năng; mở rộng thay đổi đúng đường bờ.
- Nhiều cánh đồng không làm tụt hiệu năng nghiêm trọng; có phép đo nếu môi trường hỗ trợ.

---

## 13. GIAI ĐOẠN 5 — TRANG TRẠI VÀ ĐỘNG VẬT CHIBI

> **Prompt triển khai 5/12**  
> Kết quả: trại gà/lợn/bò/dê-cừu có chuồng, sân, hàng rào và động vật hoạt động; có sản lượng và ba cấp.

### Yêu cầu AI triển khai

Phát triển Livestock module, tái sử dụng Building Engine, footprint, World Resources và Citizen Jobs. Trọng tâm là **động vật 3D chibi có hành vi**, chứ không chỉ là một biểu tượng sản xuất.

**Công nghệ:** React Three Fiber, Three.js, GLB rigged, AnimationMixer, AI finite state machine, pathfinding hex; Express/Sequelize/MySQL.

#### 13.1. Danh mục trại

- Trại gà (6 hex): trứng, thịt.
- Trại lợn (6 hex): thịt, phân bón.
- Trại bò (9 hex): sữa, thịt, sức kéo nếu mở khóa.
- Trại dê/cừu (6 hex): sữa, lông/thịt.
- Cấu trúc: chuồng chính, hàng rào theo cạnh hex, máng ăn/uống, sân hoặc đồng cỏ; mở rộng theo cụm đất liên thông.

#### 13.2. Cấp công trình

- **Cấp 1:** chuồng gỗ, sân đất, hàng rào cơ bản, đàn nhỏ.
- **Cấp 2:** chuồng gạch mái ngói, kho thức ăn, máng nước, chia khu nuôi.
- **Cấp 3:** chuồng kiên cố, khu con non/chăm sóc, cấp nước, xử lý chất thải, hiệu quả cao.
- Nâng cấp thay đổi toàn bộ chi tiết 3D có liên quan mà không xóa dữ liệu đàn.

#### 13.3. Mô hình động vật chibi

- Gà: thân bầu, đầu tròn, mắt rõ, bước chân nhanh.
- Lợn: thân tròn, mõm lớn, chân ngắn.
- Bò: thân mềm, đầu hơi lớn, sừng và tai đặc trưng.
- Dê/cừu: lông cách điệu, sừng/tai hợp loài.
- Animation tối thiểu `idle`, `walk`, `eat`, `drink`, `rest`; có thể thêm `run`, `react`, `sleep`.
- Điều khiển chuyển trạng thái bằng blending, không pop animation đột ngột.

#### 13.4. Hành vi đàn và năng suất

- State machine: `IDLE`, `WANDER`, `SEEK_FOOD`, `EAT`, `SEEK_WATER`, `DRINK`, `REST`.
- AI di chuyển chỉ trong vùng nuôi hợp lệ, không xuyên hàng rào/chuồng, dùng điểm đến trên hex graph và nội suy vị trí mượt.
- Dữ liệu mỗi con: ID, loài, tuổi/giai đoạn, health, hunger, thirst, growth, location farm, status.
- Tăng trưởng/sinh sản theo giới hạn sức chứa, thức ăn, nước và thời gian game; con non có mô hình nhỏ hơn.
- Sản lượng có nguyên liệu và điều kiện; không tạo sản lượng vô hạn khi thiếu thức ăn.
- Đồng cỏ/ruộng ngô liên kết nguồn thức ăn; phân chuồng có thể làm phân bón.

#### 13.5. Database/API

```text
animal_species
livestock_farms
farm_animals
livestock_production_jobs
animal_feed_recipes
```

API cho tạo/mở rộng/nâng cấp trại, bổ sung giống, cho ăn, điều chuyển, thu sản phẩm và tra cứu tình trạng đàn. Tái dùng một hệ thống footprint trung tâm, **không tạo cơ chế chiếm đất song song**.

#### 13.6. Tối ưu

- LOD + animation culling; không chạy AI chi tiết cho động vật ngoài camera.
- State sản xuất/nuôi ở server bằng timestamps, vị trí chân động vật không cập nhật liên tục vào MySQL.
- Asset scale phải chibi nhất quán với nhà và người; không để gà có kích thước bằng nhà.

#### 13.7. Tiêu chí nghiệm thu

- Tạo/nâng cấp trại đúng số hex; động vật di chuyển, ăn, uống, ngủ hợp lý.
- Không vượt chuồng/hàng rào, không vượt sức chứa, không sinh tài nguyên khi thiếu nguyên liệu.
- Reload giữ số lượng vật nuôi và tiến độ; không claim sản phẩm trùng.
- Ba cấp trại khác rõ về hình ảnh và chỉ số; hiệu năng ổn khi có nhiều trại.

---

## 14. GIAI ĐOẠN 6 — ĐÀO AO, CHỈNH SỬA ĐỊA HÌNH VÀ NUÔI CÁ CHIBI

> **Prompt triển khai 6/12**  
> Kết quả: người chơi đào được ao bất kỳ từ ≥6 hex, mặt nước/đường bờ phù hợp, thả cá 3D, thu hoạch và nâng cấp.

### Yêu cầu AI triển khai

Phát triển Aquaculture + Terrain Editing. **Không dùng Water Plane phẳng màu xanh đặt đè trên đất làm kết quả hoàn chỉnh**. Ao thực sự là vùng terrain được hạ cốt và có đường bờ dựng theo polygon của vùng hex người chơi chọn.

**Công nghệ:** React Three Fiber, Three.js/custom geometry, shader nước stylized, GLB cá, Zustand, Express, Sequelize, MySQL.

#### 14.1. Công cụ đào và quản lý ao

- Công cụ: đào ao, mở rộng ao, lấp ao (theo điều kiện), kè bờ, nối kênh, cầu gỗ.
- Chọn ít nhất **6 hex liền kề**, đã sở hữu, không có công trình khác; preview hố đào và chi phí.
- Khi xác nhận: server lưu region và terrain modifications, trừ tài nguyên; client cập nhật mesh địa hình, đáy ao, bờ và nước.
- Mở rộng phải **gộp** các vùng nước và tạo lại chỉ các cạnh ngoài; không để tường/bờ ở giữa hai ô nước nối nhau.
- Tối ưu cập nhật mesh theo chunk khi chỉnh sửa.

#### 14.2. Loại hình

- Ao nước ngọt (6+ hex); hồ nuôi lớn (12+ hex).
- Khu ươm cá giống (6+ hex).
- Lồng cá trên vùng mặt nước đã đủ sâu (6+ hex nước).
- Cá đầu tiên: cá chép, rô phi, trê, lóc; cấu hình growth, food, density, time.

#### 14.3. Ba cấp ao

- **Cấp 1:** ao đất, cầu gỗ, chòi chibi, cho ăn thủ công.
- **Cấp 2:** kè đá/gạch, cống cấp nước, cầu dài, điểm cho ăn.
- **Cấp 3:** kè hoàn thiện, sục khí, lọc nước stylized, khu thu hoạch, năng suất cao hơn.
- Nâng cấp giữ hình dạng do người chơi vẽ; chỉ thay đổi bờ và các module phụ trợ.

#### 14.4. Cá 3D và chất lượng nước

- Cá có mô hình chibi, vây/đuôi và `swim`, `turn`, `feed`, `idle`; kích thước theo giai đoạn phát triển.
- Swim AI/steering nhẹ cho cá gần camera, culling cho cá ở xa; tuyệt đối không bơi ra khỏi nước hoặc xuyên bờ.
- Nước trong, gợn nhẹ, phản sáng vừa phải, hiệu ứng cho ăn, bong bóng có kiểm soát.
- Lưu mực nước, chất lượng nước, mật độ, lượng thức ăn, health đàn cá.
- Tiến trình: xây → cấp nước → thả giống → cho ăn → phát triển → thu hoạch → vụ mới.

#### 14.5. Database/API

```text
water_bodies
water_body_tiles
fish_species
fish_stock_batches
aquaculture_cycles
water_quality_records
```

API tạo/mở rộng/nâng cấp ao, cấp nước, thả giống, cho ăn, thu hoạch, lấy trạng thái nước/cá. Chống gửi trùng và kiểm tra chặt quyền sở hữu.

#### 14.6. Tiêu chí nghiệm thu

- Tạo được ao 6 hex hình không đều, địa hình có độ sâu và bờ hợp lý.
- Mở rộng không có khe hở terrain/đường bờ bên trong; không đào qua nhà.
- Có cá bơi, nguồn nước, thức ăn, tiến độ sinh trưởng, thu hoạch thật.
- Nâng cấp 1→3 không đổi hình ao, không mất cá; reload giữ trạng thái.
- Khi zoom xa không bắt GPU vẽ và cập nhật từng con cá chi tiết.

---

## 15. GIAI ĐOẠN 7 — CƯ DÂN CHIBI, NHỊP SỐNG VÀ KINH TẾ

> **Prompt triển khai 7/12**  
> Kết quả: làng có người sống, làm việc, đi lại; chuỗi sản xuất thực và số liệu kinh tế lưu bền vững.

### Yêu cầu AI triển khai

Xây **Citizen Simulation + Economy** dựa trên nhà ở, công trình và sản xuất có sẵn. Người dân là thực thể có nghề, nhà, công việc và trạng thái; không đơn thuần là số dân tăng trên HUD.

**Công nghệ:** React/Three.js/R3F, GLB rigged, AnimationMixer, A* trên hex, finite state machine/utility AI, Zustand; Express, Sequelize, MySQL.

#### 15.1. Nhân vật dân cư 3D

- Phong cách chibi 2.5–3.5 đầu; biến thể tóc, mặt, da, quần áo, phụ kiện; tỷ lệ thống nhất với nhà/cây/động vật.
- Animation chung: `idle`, `walk`, `carry`, `work`, `eat`, `rest`, `talk`, `sit`; animation chuyên nghề khi có asset.
- Nghề: nông dân, chăn nuôi, ngư dân, thợ mộc, thợ xây, thợ rèn, vận chuyển, nhân viên kho.
- Khung giờ đơn giản: sáng đi làm, ngày làm việc, chiều vận chuyển, tối về nhà, đêm nghỉ; có game clock cấu hình.
- Animation không phải nguồn dữ liệu sản xuất; có thể chuyển sang simplified behavior khi ngoài camera.

#### 15.2. Dân số và nhà ở

- Bắt đầu với **5 người sống sót**; dân mới từ di cư, nhiệm vụ cứu hộ, sau này tăng trưởng tự nhiên nếu có.
- `survivor`: ID, name, profession, health, stamina, mood, skills, house ID, workplace ID, state.
- Nhà 1/2/3 chứa **4/6/10 người**; tổng số nhà quyết định năng lực chứa; xây nhà không tự tăng cư dân.
- Cư dân cần nhà, lương thực, nước, công việc; thiếu nhu cầu làm giảm hiệu quả nhưng không xóa thế giới khi người chơi vắng mặt.
- Một người chỉ được phân công một vị trí làm việc chính tại một thời điểm.

#### 15.3. Tìm đường và chuyển động

- Sử dụng A* trên graph các ô hex đi được (và các cạnh đường/điểm liên kết); nội suy đường di chuyển mềm trong 3D.
- Ưu tiên đường do người chơi xây; tránh tường, nước không có cầu, công trình và ô đang thi công.
- Dựng điểm tương tác của công trình: cửa nhà, bãi làm việc, điểm lấy/cất hàng.
- Nếu đường bị chặn, NPC thử tìm lại hoặc báo không tới được, không đi xuyên vật cản.
- Giới hạn số agent được cập nhật chi tiết theo camera và khoảng cách.

#### 15.4. Kinh tế và sản xuất

- Tài nguyên: gỗ, đá, gạch, sắt, lúa, ngô, rau, thịt, sữa, trứng, cá, nước, cỏ, vũ khí, quân nhu.
- Công thức sản xuất định nghĩa trong DB/config: input, output, thời gian, worker count, building level modifiers, capacity.
- Chuỗi ví dụ: ruộng lúa → kho → tiêu thụ; ngô → thức ăn → gà/lợn; gỗ → xưởng mộc → xây nhà; sắt → lò rèn → vũ khí.
- Sản xuất có thể dừng khi thiếu vật liệu, nhân công hoặc kho đầy; không cộng vật phẩm vô hạn.
- Tính tiến trình offline theo timestamp với khóa idempotent; không chạy mô phỏng 3D khi offline.
- Giao diện: quản lý cư dân, nhà ở, nghề, công việc, báo cáo thu/chi, dự báo thiếu hụt, cảnh báo nơi làm việc không thể đến.

#### 15.5. Database/API

```text
survivors
professions
survivor_jobs
survivor_housing
production_recipes
production_jobs
resource_transactions
world_time_states
```

API danh sách dân, chuyển nhà, phân công, lấy tình trạng sản xuất, nhận sản phẩm, dashboard thu chi. Không hardcode sản lượng vào component.

#### 15.6. Tiêu chí nghiệm thu

- Tạo/nhận cư dân, xếp nhà, phân công đúng; sức chứa nhà được kiểm tra.
- NPC chibi đi từ nhà đến nơi làm việc theo đường hợp lệ và diễn hoạt nghề nghiệp.
- Không thể phân công trùng hoặc vừa làm việc dân sự toàn thời gian vừa là lính toàn thời gian.
- Thiếu nguyên liệu khiến production job không thể hoàn thành vô hạn.
- Offline/reload không làm mất dân hay nhân đôi sản phẩm.
- Nhiều NPC hoạt động không gây nghẽn render; báo cáo đo đạc/giới hạn thực tế.

---

## 16. GIAI ĐOẠN 8 — DOANH TRẠI CHIBI VÀ 4 BINH CHỦNG

> **Prompt triển khai 8/12**  
> Kết quả: xây doanh trại 6+ hex, rèn vũ khí, chuyển cư dân thành lính, luyện đao/thương/cung/nỏ.

### Yêu cầu AI triển khai

Xây hệ thống Military Recruitment & Training gắn trực tiếp với dân số, lương thực, lò rèn và Building Engine. **Bốn loại lính đầu tiên** phải khác nhau về ngoại hình, vai trò, vũ khí và hoạt ảnh.

**Công nghệ:** React/Three.js/R3F, rigged GLB, AnimationMixer, TypeScript; Express, Sequelize, MySQL, server timestamps.

#### 16.1. Các binh chủng

| Loại | Ngoại hình chibi | Vai trò gameplay |
|---|---|---|
| Đao binh | Đao, khiên lớn, giáp nhẹ/trung | Cận chiến, đỡ đòn |
| Thương binh | Thương dài, giữ đội hình | Chống lao vào/kỵ binh, tầm gần 1–2 hex tùy luật |
| Cung binh | Cung cong, ống tên, giáp nhẹ | Tầm xa, cơ động |
| Nỏ binh | Nỏ cơ khí, giáp dày hơn | Xuyên giáp, nạp chậm |

Chỉ số HP/damage/armor/range/AP là **cấu hình có thể cân bằng**, không rải hardcode ở renderer.

#### 16.2. Công trình và cấp độ

- Doanh trại đao 6 hex, thương 6 hex, trường cung 6 hex, trường nỏ 6 hex.
- Lò rèn quân sự 6 hex, kho quân nhu 6 hex, trường huấn luyện tổng hợp 9 hex.
- Cấp 1: lều/sân đất, giá vũ khí/hình nộm, 2 học viên/đợt gợi ý.
- Cấp 2: nhà gạch/sân lát hoặc phân vùng, 4 học viên/đợt.
- Cấp 3: nhà kiên cố hoặc có tầng, sân huấn luyện chuyên nghiệp, 6 học viên/đợt.
- Các khu có 3 model rõ khác nhau và hoạt động phù hợp từng binh chủng; không lấy cùng một sân cho cả bốn.

#### 16.3. Tuyển mộ và huấn luyện

- Chọn doanh trại → binh chủng và số lượng → server kiểm tra dân có thể tuyển, vũ khí, giáp, lương thực, chỗ đào tạo → tạo `training_job`.
- Cư dân được chuyển trạng thái `recruit` rồi `soldier` khi job hoàn thành, giảm lực lượng lao động dân sự tương ứng.
- Quân đội cần lương thực/quân nhu định kỳ; có điểm kinh nghiệm, level tân binh → binh sĩ → tinh binh → cận vệ → tinh nhuệ.
- Chọn đội hình, đặt tên đội, phân lính; một lính không thể đồng thời thuộc hai đội đang làm nhiệm vụ.

#### 16.4. Animation chibi đúng nghề

- Đao: vung đao, chắn khiên, đánh hình nộm, đối kháng.
- Thương: đâm, kéo thương, giữ hàng, phòng thủ.
- Cung: rút tên, kéo dây, ngắm, bắn, cất cung.
- Nỏ: lên dây, đặt tên, ngắm, bắn, nạp lại.
- Bia tập phản ứng với tác động; vũ khí socket vào tay đúng; không xuyên người hoặc phát đạn lệch thời điểm.
- Render lính đang tập theo số lượng hợp lý, không bắt tạo đầy đủ hàng trăm character high-poly cùng lúc.

#### 16.5. Database/API

```text
unit_types
military_units
military_training_jobs
equipment_types
unit_equipment
military_squads
military_squad_members
```

API tuyển lính, xem/cập nhật training, phân đội, xem trang bị, giải ngũ nếu luật cho phép. Sử dụng transaction và validation để tránh tạo lính từ số dân không tồn tại.

#### 16.6. Tiêu chí nghiệm thu

- Bốn binh chủng phân biệt rõ 3D, chiến thuật và animation.
- Xây được trại 6+ hex, nâng cấp 1→3 có hình/chỉ số khác.
- Không tuyển quá số cư dân, không tuyển khi thiếu vũ khí, không hoàn tất training job hai lần.
- Reload vẫn giữ quân số, trang bị, thời gian huấn luyện và đội hình.
- Chưa cần PvE ở giai đoạn này; chuẩn bị interface cho Battle Engine.

---

## 17. GIAI ĐOẠN 9 — TRẠI NGỰA, TRẠI VOI VÀ THÚ CƯỠI

> **Prompt triển khai 9/12**  
> Kết quả: ngựa/voi 3D chibi được chăm sóc, luyện tập và phân công hậu cần/thú cưỡi.

### Yêu cầu AI triển khai

Mở rộng Animal Engine cho ngựa/voi; không xây lại hoàn toàn một hệ thống chăn nuôi. Tạo hai khu quân sự lớn có ba cấp và hành vi di chuyển tự nhiên.

**Công nghệ:** React Three Fiber, Three.js, GLB rigged, AnimationMixer, state machine, Hex pathfinding; Express/Sequelize/MySQL.

#### 17.1. Trại ngựa — tối thiểu 9 hex

- **Cấp 1:** chuồng gỗ, bãi cỏ, rào, máng ăn/uống; sức chứa 4 ngựa gợi ý.
- **Cấp 2:** chuồng gạch, mái ngói, kho cỏ, sân luyện; 8 ngựa.
- **Cấp 3:** khu chuồng kiên cố, sân cưỡi, khu chăm sóc/thú y và quản lý; 12 ngựa.
- Mở rộng đồng cỏ là thao tác riêng với nâng cấp cấp trại.
- Ngựa chibi: đầu hơi lớn, thân cân đối, màu lông đa dạng, bờm/đuôi stylized; `idle`, `walk`, `trot`, `gallop`, `eat`, `drink`, `rest`, `rear`, `riding`.

#### 17.2. Trại voi — tối thiểu 12 hex

- **Cấp 1:** chuồng gỗ cao, sân, hồ tắm nhỏ; sức chứa 2 voi.
- **Cấp 2:** chuồng kiên cố, kho thức ăn, hồ tắm lớn, sân luyện; 4 voi.
- **Cấp 3:** trung tâm huấn luyện tượng binh, khu thú y, sân lớn, tháp quan sát; 6 voi.
- Voi chibi phải vẫn lớn hơn đáng kể so với người/ngựa, có `idle`, `walk`, `eat`, `drink`, `trunk_swing`, `rest`, `training`, `carry`.

#### 17.3. Chăm sóc và phân công

- Mỗi cá thể: ID, age/stage, health, stamina, hunger, thirst, taming, speed, training_level, assigned_unit.
- Ngựa/voi cần cỏ, thức ăn, nước, nhân viên; thiếu nhu cầu sẽ làm giảm sức khỏe/hiệu quả.
- Hệ thống luyện thú có job và thời gian server, không thực hiện tức thì nếu thiếu điều kiện.
- Ngựa là **mount** của một số binh sĩ có điều kiện; tạo rider socket trên GLB, đồng bộ animation người cưỡi và ngựa.
- Không gán một ngựa cho hai người đồng thời; có thể xuống ngựa và trả về trại.
- Voi trước hết hỗ trợ vận chuyển/hậu cần; chiến đấu tượng binh có thể bổ sung khi Battle Engine hỗ trợ footprint lớn.

#### 17.4. Database/API

```text
animal_training_jobs
animal_assignments
animal_equipment
mount_assignments
animal_care_records
```

API xem/nuôi/chăm sóc/luyện/phân công thú cưỡi; tận dụng dữ liệu `farm_animals` và `livestock_farms` khi phù hợp.

#### 17.5. Tương thích với tiến trình mở đất

Ở giai đoạn 9, cơ chế Scan & Claim chưa hoàn thiện; **cho phép tạo world kiểm thử được cấp đất qua seed hoặc developer tools chỉ trong môi trường development**. Không đưa API cấp đất miễn phí vào production. Ở giai đoạn 10, mở rộng thường phải bằng quét và khai phá.

#### 17.6. Tiêu chí nghiệm thu

- Trại ngựa 9+ hex và trại voi 12+ hex, mỗi trại đủ 3 cấp.
- Động vật di chuyển không xuyên rào, được ăn/uống/luyện tập; reload giữ số lượng và trạng thái.
- Lính cưỡi ngựa đúng seat socket, không xuyên mô hình; chỉ một người/ngựa tại một thời điểm.
- Công thức tiêu thụ thức ăn/nước hoạt động thật, không sản xuất vô hạn.

---

## 18. GIAI ĐOẠN 10 — RADAR, FOG OF WAR, QUÉT VÀ CHIẾM ĐẤT

> **Prompt triển khai 10/12**  
> Kết quả: người chơi mở rộng ngoài 100 × 100, dần chinh phục phần có thể xây trong thế giới 1000 × 1000.

### Yêu cầu AI triển khai

Xây hệ thống Exploration & Claim tích hợp với world seed, chunk renderer và Building Engine. Quét bản đồ chỉ **phát hiện**, không tự chuyển đất thành sở hữu.

**Công nghệ:** Three.js/R3F shaders/overlay, TypeScript, Zustand, TanStack Query; Express, Sequelize, MySQL, BullMQ nếu cần queue jobs.

#### 18.1. Trạng thái và Fog of War

- `hidden`: chưa được phép biết thông tin chi tiết.
- `scanned`: đã có thông tin địa hình/tài nguyên, chưa được xây.
- `claiming`: công việc khai phá đang diễn ra.
- `claimed`: đã sở hữu và được xây nếu hợp terrain.
- `blocked`: có nhiệm vụ, ô nhiễm hoặc điều kiện chưa đạt.
- Có thể tách hẳn `exploration_status` khỏi `ownership_status` để không lẫn trạng thái.
- Fog mềm theo phong cách chibi; sóng quét đẹp, không quá nhiều hạt/glow; không gửi dữ liệu bí mật của ô chưa quét xuống client.

#### 18.2. Radar 3 cấp

- **Cấp 1:** radar/phương tiện dò thô sơ, phạm vi gần, quét từng hướng.
- **Cấp 2:** tháp gạch, bộ phận quay, quét rộng hơn và nhiều ô.
- **Cấp 3:** tháp kiên cố với công nghệ cũ phục hồi, quét vùng rộng và phát hiện địa điểm đặc biệt.
- Có phạm vi, tiêu hao năng lượng/vật liệu, thời gian, unlock conditions riêng.
- Các kiểu quét: định hướng, diện rộng, drone/thăm dò nếu công nghệ đã mở.

#### 18.3. Luồng quét

1. Chọn radar → bật Scan Mode.
2. Highlight những ô trong phạm vi hợp lệ; hiện phí và thời gian.
3. Chọn ô/vùng → gửi request.
4. Server xác nhận năng lượng, range, quyền, giới hạn số job; trừ phí và tạo scan job.
5. Khi hoàn thành, giải mở dữ liệu deterministic từ world seed; client hiển thị hiệu ứng tan sương và phát hiện.
6. Có thể gặp rừng, hồ, đất màu mỡ, mỏ, phế tích, vùng nhiễm độc, ngựa hoang, voi, kẻ địch.

#### 18.4. Luồng khai phá

- Chỉ nhận ô đã quét, hợp giới hạn world và có kết nối với đất claimed (trừ công nghệ tiền đồn nếu được thiết kế).
- Kiểm tra chi phí, loại địa hình, nguy hiểm, điều kiện nhiệm vụ, ô bị tranh chấp với job khác.
- Server tạo claim job; khi hoàn tất chuyển `claimed`, update ranh giới, unlock Build Mode trên đất mới.
- Vùng nguy hiểm yêu cầu PvE (giai đoạn 11) giữ blocked cho đến khi nhiệm vụ được xác nhận; không giả lập hoàn thành.
- Không cho chiếm ngoài map 1000 × 1000 hoặc đặt footprint ngoài ranh giới.

#### 18.5. Mini-map và hiệu ứng

- Map tổng thể, màu hóa claimed/scanned/hidden, nguồn nước/rừng/phế tích, icon nhiệm vụ.
- Click minimap để focus camera; hiển thị ranh giới và điều kiện mở rộng.
- Chỉ tải chunk gần camera; dữ liệu quét lấy theo chunk/region; không gửi toàn bộ tile set cùng lúc.

#### 18.6. Database/API

```text
world_scan_jobs
world_claim_jobs
world_discoveries
world_points_of_interest

GET  /api/world/me/map
GET  /api/world/me/tiles
POST /api/world/me/scans
POST /api/world/me/claims
GET  /api/world/me/discoveries
```

#### 18.7. Tiêu chí nghiệm thu

- Có thể quét một hướng, thấy địa hình, rồi riêng biệt khai phá và xây trên đất mới.
- Scan không tự sở hữu, Claim không nhận đất chưa scanned, không claim ngoài world bounds.
- Không chiếm cùng một ô nhiều lần, không trừ phí hai lần, không lộ thông tin hidden.
- Hai thế giới độc lập; reload vẫn giữ đất, đường biên, discovery và trạng thái job.
- Có thể chọn mở rộng thiên về rừng, đồng cỏ hoặc hồ; không bắt người chơi đi theo vòng tròn đều.

---

## 19. GIAI ĐOẠN 11 — BATTLE INSTANCE, PVE VÀ ĐÁNH THEO LƯỢT

> **Prompt triển khai 11/12**  
> Kết quả: lính chibi đao/thương/cung/nỏ chiến đấu chiến thuật trên battle map hex riêng, nhận thưởng rồi về làng.

### Yêu cầu AI triển khai

Xây một **Battle Engine theo lượt** với battle scene tách hoàn toàn world scene. Không chuyển nhà/làng sang chiến trường và không cho PvE tự động phá công trình đã xây.

**Công nghệ:** React/Three.js/R3F, TypeScript, GLB AnimationMixer, Hex A*, line-of-sight/range logic; Node/Express/Sequelize/MySQL. Socket.IO chỉ khi cần realtime hoặc multiplayer.

#### 19.1. Battle Instance và map

- Người chơi chọn nhiệm vụ/đội hình → server kiểm tra lính sẵn sàng, lưu `battle_instance`, snapshot dữ liệu đơn vị nếu phù hợp → mở `BattleScene`.
- Bản đồ hex riêng: đất thường, rừng, đá, công sự, nhà đổ nát, đồi, nước, vùng nhiễm độc, khu triển khai quân.
- Hex có `terrain_type`, elevation, walkable, move_cost, cover, occupant, hazard; renderer chibi nhưng luật rõ ràng.
- Camera isometric có zoom, xoay, focus nhân vật/đối thủ.

#### 19.2. Luật chiến đấu

- Đội hình khởi đầu 3–5 lính; mỗi đơn vị có HP, armor, attack, range, movement, AP, abilities, effects.
- Hành động: di chuyển, đánh, kỹ năng, phòng thủ, dùng vật phẩm nếu có, kết thúc lượt.
- Server kiểm tra lượt, AP, đường đi, line of sight, mục tiêu và tài nguyên kỹ năng; không tin client gửi damage hoặc kết quả.
- Đao binh: cận chiến phòng thủ; thương binh: tầm với/chống thú cưỡi; cung: bắn xa/cơ động; nỏ: xuyên giáp nhưng nạp chậm.
- Terrain ảnh hưởng cover, cao độ, hazard, khả năng di chuyển.

#### 19.3. Enemy AI

- Kẻ địch đầu: thú hoang, sinh vật đột biến chibi, kẻ cướp, robot cũ, boss.
- State machine/utility AI: chọn mục tiêu, tìm đường, sử dụng kỹ năng, đánh giá che chắn và nguy hiểm.
- Đừng cho AI đi vào vòng lặp vô hạn; có timeout/fallback và logs.

#### 19.4. Visual và animation

- `idle`, `walk`, `run`, `attack`, `hit`, `defend`, `knockout/death`, `victory`.
- Đao vung/đỡ; thương đâm; cung giương/bắn mũi tên bay; nỏ lên dây/bắn/nạp.
- Chỉ dẫn ô có thể đi, tầm đánh, đường đi, AP, HP, sát thương và trạng thái rõ từ xa.
- Hiệu ứng vui mắt nhưng không máu me/không quá dày che đội hình.

#### 19.5. Nhiệm vụ PvE

- **Giải cứu người sống sót** → có khả năng đón thêm cư dân.
- **Chiếm lại phế tích** → mở khóa quyền khai phá ô đặc biệt.
- **Đánh boss đột biến** → vật liệu/công nghệ hiếm.
- Khi thắng: server lưu kết quả, thưởng, XP, thương tích, nhiệm vụ; trở lại WorldScene.
- Khi thua: áp dụng tổn thất theo quy tắc, không phá công trình cá nhân.
- Reconnect sau mất mạng khôi phục trạng thái; chống nhận thưởng hai lần.

#### 19.6. Database/API

```text
battle_instances
battle_participants
battle_units
battle_turns
battle_actions
battle_rewards

POST /api/battles
GET  /api/battles/:id
POST /api/battles/:id/actions
POST /api/battles/:id/end-turn
GET  /api/battles/:id/result
```

#### 19.7. Tiêu chí nghiệm thu

- A* và line of sight đúng hex; không đi quá range, dùng vượt AP, đánh xuyên vật cản không hợp lệ.
- Bốn binh chủng khác nhau thực sự về cơ chế và animation.
- NPC AI hoàn thành lượt trong thời gian hợp lý; không kẹt.
- Server xác nhận kết quả; reload/reconnect không mất trận; thưởng không thể nhận lặp.
- Chiến thắng phế tích mở đúng quyền khai phá; thế giới xây dựng nguyên vẹn.

---

## 20. GIAI ĐOẠN 12 — MULTIPLAYER, PVP, LIÊN MINH VÀ HOÀN THIỆN

> **Prompt triển khai 12/12**  
> Kết quả: thăm làng bạn bè, PvP battle map riêng, liên minh cơ bản, UI/3D thống nhất và có báo cáo chất lượng.

### Yêu cầu AI triển khai

Mở rộng game từ thế giới cá nhân sang social và PvP, tái dùng Battle Engine. Đồng thời rà soát chất lượng hình ảnh chibi, sound, hiệu năng và bảo mật để có cơ sở triển khai production.

**Công nghệ:** React/R3F/Three.js, TypeScript, Express/Sequelize/MySQL, Socket.IO, Redis adapter/queues khi cần scale, Vitest/Supertest/Playwright.

#### 20.1. Bạn bè và thăm thế giới

- Tìm người chơi, gửi/nhận lời mời, từ chối, unfriend, online status, chat cơ bản.
- Cài đặt quyền xem thế giới: public / friends / private.
- Khi thăm: chỉ load dữ liệu được phép xem; scene render như một làng 3D chibi, nhưng visitor **không được sửa, nâng cấp, thu hoạch hoặc phá** công trình.
- Có xử lý permissions ở API, không chỉ ẩn nút bằng giao diện.

#### 20.2. PvP

- Tạo phòng, mời đối thủ, tìm trận, chọn đội hình, khóa đội hình, match start.
- **Tái dùng Battle Engine giai đoạn 11**, không xây một bộ chiến đấu thứ hai.
- Socket.IO truyền trạng thái phòng/lượt/hành động hợp lệ, xử lý reconnect, timeout, bỏ trận và kết quả.
- Server tính lượt, AP, sát thương, thắng/thua. Matchmaking theo điểm/xếp hạng và sức mạnh đội phù hợp.
- Xếp hạng theo mùa, lịch sử trận, phần thưởng vừa phải; PvP không cướp hoặc phá đất cá nhân.

#### 20.3. Liên minh cơ bản

- Tạo liên minh, mời/rời, phân vai trò, chat, danh sách thành viên.
- Tạo nhiệm vụ hợp tác và cơ chế boss liên minh chỉ khi PvE nhiều người đã được thiết kế rõ.
- Phân quyền chặt các hành động quản trị.

#### 20.4. Art polish

Rà toàn bộ asset/scene: nhà các cấp, ruộng, ao, cá, trang trại, NPC, quân đội, trại ngựa, voi, địa hình, chiến trường. Kiểm tra:

- Chibi style thống nhất, không có asset người thật/nhà photorealistic xen vào.
- Tỷ lệ mô hình phù hợp; không xuyên mặt đất, hàng rào, mái, động vật.
- Animation blending tự nhiên, vũ khí đúng socket, các động tác thể hiện công việc.
- Ánh sáng ngày/đêm, gió cây, nước, khói, âm thanh môi trường có chất lượng vừa đủ và có tùy chọn giảm hiệu ứng.
- UI tông cozy nhất quán, tương tác đầy đủ, thông báo lỗi/dữ liệu trống hữu ích.
- Placeholder phải được liệt kê, không coi là asset final.

#### 20.5. Tối ưu và bảo mật

- Đo FPS, draw calls, triangles, GPU memory, asset load time, thời gian tải chunk, số NPC/animal đang update.
- Instancing, LOD, culling, material reuse, GLB optimize, KTX2 khi phù hợp, shadow budgets, quality settings Low/Medium/High.
- Mục tiêu đo thử: khoảng 60 FPS trên máy tầm trung phù hợp scene chuẩn; 30 FPS trên cấu hình thấp hỗ trợ. Chỉ công bố khi có benchmark thực.
- Backend: index, pagination, truy vấn theo world/chunk, cache có kiểm soát, rate limit, socket auth, logs, monitoring, backup, concurrency tests, idempotency.
- Không trả toàn bộ dữ liệu map 1000 × 1000 hoặc bí mật fog-of-war cho client.

#### 20.6. Database/API

```text
friend_requests
friendships
alliances
alliance_members
alliance_roles
alliance_messages
pvp_ratings
pvp_match_history
```

Bổ sung API/social/socket events theo module, có schema validation và phân quyền; đặc tả OpenAPI nếu dự án hỗ trợ.

#### 20.7. E2E nghiệm thu cuối

Tối thiểu kiểm tra hành trình:

1. Đăng ký → tạo thế giới.
2. Xây nhà dân → nâng đủ ba cấp.
3. Tạo ruộng 6 hex → trồng và thu hoạch.
4. Tạo trại gà/lợn/bò → nhận sản phẩm.
5. Đào ao 6 hex → thả cá → thu hoạch.
6. Phân công dân cư → kiểm tra thu chi.
7. Huấn luyện đao/thương/cung/nỏ.
8. Xây trại ngựa/voi, chăm sóc và phân công ngựa.
9. Quét → khai phá → xây trên đất mới.
10. Vào PvE → nhận thưởng và trở về.
11. Thăm làng bạn bè không có quyền sửa.
12. PvP → đồng bộ lượt và xác nhận kết quả.
13. Đăng xuất/đăng nhập lại và xác thực toàn bộ trạng thái.

#### 20.8. Bàn giao

- Source code, migrations/seed, env example, hướng dẫn local và production.
- Tài liệu API, gameplay, công thức cân bằng, danh mục asset và quyền sử dụng, tài liệu build asset từ Blender.
- Báo cáo test, báo cáo hiệu năng với cấu hình máy/scene/method rõ ràng, các lỗi còn lại và phạm vi chưa hoàn tất.
- Không gọi production-ready nếu có nút giả, dữ liệu mock chưa thay, chức năng thiết yếu chưa hoạt động hoặc chưa kiểm chứng bảo mật/hiệu năng.

---

## 21. QUY TẮC NGHIỆM THU CHUNG SAU MỖI GIAI ĐOẠN

**Prompt QA dùng lặp lại sau mỗi giai đoạn:**

> Hãy đọc `game's description.md` và đối chiếu toàn bộ yêu cầu của giai đoạn vừa làm với mã nguồn thực tế. Kiểm tra frontend, backend, migration, database, asset 3D, animation, logic hex và hiệu năng nếu có môi trường chạy. Chạy lint, typecheck, unit/integration tests và build; chạy E2E nếu có môi trường phù hợp. Phân loại: (A) đã hoàn thành và xác minh, (B) đã triển khai nhưng chưa xác minh, (C) chưa thực hiện, (D) lỗi cần sửa. Nếu có thể, sửa lỗi trong đúng phạm vi giai đoạn rồi chạy kiểm thử lại. Báo cáo danh sách file thay đổi, API, migration, asset thiếu, kết quả test và điều kiện chưa đạt. Không tự chuyển giai đoạn tiếp theo, không gọi placeholder là sản phẩm hoàn chỉnh.

### 21.1. Các lệnh kiểm tra tham khảo

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Thiết lập scripts cho monorepo để các lệnh trên chạy thực sự, bao gồm cả frontend, backend và shared packages. Khi môi trường chưa có Blender, MySQL hoặc browser E2E, ghi rõ bài kiểm thử nào chưa thể chạy và cách khắc phục.

### 21.2. Danh sách lỗi cần đặc biệt tránh

- Dùng square grid ẩn để đặt nhà, ruộng, ao hoặc quân đội.
- Hex spacing 10 nhưng nhầm thành hex side length 10, gây lệch tọa độ/diện tích.
- Thế giới 1000 × 1000 được tạo toàn bộ mỗi lần mở trang dẫn đến load chậm.
- Render hex thành các cột lục giác nổi trong chế độ thường dù định hướng terrain liền mạch.
- Nhà dân lên cấp 3 bị tăng footprint từ 1 lên nhiều hex.
- Ruộng/ao cấp cao mất hình dạng người chơi đã vẽ.
- Nâng cấp tạo building ID mới và làm mất quan hệ cư dân/công việc.
- Tăng dân số tức thời chỉ vì vừa đặt nhà.
- Cá và động vật chỉ là vật thể đứng yên hoặc xuyên hàng rào/bờ ao.
- Lính được tạo từ tài nguyên nhưng không trừ dân số lao động.
- Cho phép PvP phá/cướp trực tiếp nhà riêng, trái với định hướng thiết kế.
- UI mock dữ liệu, client tự tính cộng tài nguyên, hoặc server tin kết quả trận do client gửi.
- Asset Blender/model GLB thiếu giấy phép hoặc chỉ dùng primitive mà báo là chibi high-quality.

---

## 22. LỘ TRÌNH MỐC PHÁT HÀNH

| Mốc | Giai đoạn | Người chơi có thể làm |
|---|---|---|
| Foundation | 1–2 | Đăng nhập, xem và tương tác với thế giới 3D hex |
| Building Prototype | 3 | Xây và nâng cấp nhà chibi 1→3 |
| Farming Alpha | 4–6 | Trồng lúa, chăn nuôi, đào ao và nuôi cá |
| Living Village Alpha | 7 | Quản lý dân cư, công việc và kinh tế |
| Military Alpha | 8–9 | Luyện 4 loại lính, nuôi ngựa/voi |
| Exploration Beta | 10 | Quét, khám phá, khai phá và mở rộng thế giới |
| PvE Beta | 11 | Đánh theo lượt trên map riêng và nhận thưởng |
| Multiplayer Beta | 12 | Thăm làng, PvP, liên minh, tối ưu |

**Gợi ý thứ tự ưu tiên:** tập trung chất lượng cao cho **giai đoạn 2–6** (terrain, nhà, nông nghiệp, chăn nuôi, ao cá), vì đó là bản sắc và phần người chơi nhìn thấy nhiều nhất. Chỉ mở rộng các hệ thống xã hội/PvP khi vòng lặp xây dựng–sản xuất–mở đất đã vui và ổn định.

---

## 23. PHẠM VI CHƯA CHỐT / THÔNG SỐ CẦN PLAYTEST

Các thông số dưới đây cần được thử nghiệm thay vì coi là cân bằng cuối:

- Mức tài nguyên khởi đầu và chi phí nâng cấp từng cấp.
- Thời gian xây nhà, trồng một vụ lúa, nuôi một lứa cá và luyện một nhóm lính.
- Chỉ số chiến đấu chính xác của đao, thương, cung, nỏ.
- Sức chứa vật nuôi ở mỗi cấp và quy mô mở rộng thêm.
- Tốc độ tăng dân, mức tiêu thụ lương thực/nước và tỷ lệ sản lượng offline.
- Phạm vi radar, giá quét đất và điều kiện claim theo độ khó.
- Số NPC/động vật/công trình hiển thị đồng thời trên từng mức đồ họa.
- Quy trình tạo asset thực, license và chất lượng khi zoom gần.

**Mọi giá trị cân bằng phải nằm trong cấu hình có thể thay đổi**, không phân tán cứng trong UI hoặc shader.

---

## 24. TIÊU CHÍ THÀNH CÔNG CUỐI CÙNG

Người chơi mới có thể đăng nhập vào một vùng đất khoảng 100 × 100 trong thế giới 1000 × 1000; quan sát cảnh 3D chibi; đặt nhà dân đúng 1 hex; nâng căn nhà từ gỗ lên gạch rồi nhà gạch hai tầng; tự vẽ ruộng lúa ≥6 hex, gieo và thu hoạch; xây trại nuôi động vật; đào ao bất kỳ ≥6 hex và thả cá; phân công cư dân; huấn luyện bốn loại lính; nuôi ngựa và voi; quét/khai phá đất để tiếp tục xây; tham gia chiến trường PvE/PvP riêng. Mọi thành quả được lưu trong MySQL và khôi phục đúng sau khi đăng nhập lại.

**Tầm nhìn sản phẩm:** một thế giới chibi có sự sống và có thể phát triển lâu dài, trong đó công việc **xây dựng và nâng cấp lãnh địa** là trải nghiệm trung tâm; khám phá, kinh tế, quân đội và multiplayer là những hệ thống hỗ trợ để thế giới ngày càng rộng và phong phú.

---

*Tài liệu này là nguồn yêu cầu gốc cho quá trình phát triển. Các thay đổi gameplay/kiến trúc lớn cần cập nhật tại đây trước khi triển khai lan sang nhiều module.*
