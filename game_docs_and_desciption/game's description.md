# LAST HAVEN — GAME'S DESCRIPTION (BẢN GỘP ĐẦY ĐỦ)

> **Phiên bản 4.0, ngày 23/11/2026.** Đây là bản gộp để dễ đọc một file. Khi Claude Code làm việc trong repository, các file `docs/*.md` và `prompts/STAGE_XX.md` vẫn là nguồn yêu cầu chi tiết, được ưu tiên hơn bản gộp nếu có khác biệt. Các chỉ số chưa được cân bằng qua playtest.

---



---

<!-- SOURCE: GAME_DESCRIPTION.md -->

# LAST HAVEN — TÁI CHIẾM THẾ GIỚI

**Genre:** 3D chibi survival / settlement builder / hex tactical RPG / exploration / optional PvP / guilds.

## Tóm tắt trong một câu

Từ một khu đất an toàn rất nhỏ giữa thế giới hậu tận thế bị chiếm đóng 90%, người chơi xây thành trì 3D chibi, nuôi sống cư dân, huấn luyện đao–thương–cung–nỏ, trinh sát/đánh phó bản giải phóng sector và từng bước biến đất hoang thành một nền văn minh hồi sinh.

## Bối cảnh

Năm 2097, **Đêm Tắt Sao** cắt đứt nền văn minh hiện đại. Ba thế lực **Thiết Đoàn Tro Tàn**, **Bầy Dị Hóa** và **Người Gác Cũ** kiểm soát những vùng tài nguyên và thành phố đổ nát. Người chơi — **Thủ lĩnh Tái Thiết** — cùng năm người sống sót bắt đầu từ một vùng đất 100×100 trong thế giới cá nhân 1000×1000. Radar phát hiện các sector bị chiếm, quân đội lấy lại quyền kiểm soát qua battle instances, đội xây dựng/tiếp tế xác lập chủ quyền, cư dân cải tạo đất để phát triển.

## Ba trụ cột trải nghiệm

1. **Cozy Building:** Nhà dân 1 hex có sân vườn, cấp 1 gỗ → cấp 2 gạch → cấp 3 gạch hai tầng; xây/chỉnh khu ruộng, ao cá, chăn nuôi, đường, cầu, tường thành, cổng, tháp canh, trang trí; thiết kế blueprints.
2. **Survive & Reclaim:** Nước/lương thực/vật liệu/cư dân; huấn luyện quân, đi tuần, trinh sát, đánh phó bản, diệt boss, hồi sinh rừng/đất/nước, nối tiếp tế để mở rộng.
3. **Community & Competition:** Thăm làng bạn, giao thương có kiểm soát, tổ đội PvE, đấu PvP không phá căn cứ cá nhân, quân đoàn và chiến tuyến chung theo mùa.

## Lưu ý luật cốt lõi

- **1% claimed – 9% neutral – 90% occupied** ban đầu; tỷ lệ là mục tiêu phân bổ theo diện tích kiểm soát được, cấu hình/playtest có thể tinh chỉnh nhưng không đổi khái niệm.
- **Pointy-top hex grid** xuyên suốt build, scan, pathfinding, battle; terrain nhìn liền mạch ở chế độ thường.
- Nhà dân **1 hex**; khu nông nghiệp/chăn nuôi/thủy sản/quân sự **≥6 hex**; ngựa **≥9**, voi **≥12**; tường đặt trên **cạnh hex**.
- Mỗi công trình có **3 cấp**; tăng cấp khác mở rộng footprint; asset phải khác rõ và theo chibi.
- Quân đầu gồm **đao, thương, cung, nỏ**; lính có thể được giao tuyến tuần tra/đứng gác và điều chuyển làm nhiệm vụ.
- Phó bản/PvP ở **bản đồ riêng**; người chơi PvP không thể hủy/chiếm đất cá nhân.
- Không cần tham gia PK/quân đoàn để phá đảo PvE.

## Một vòng chơi ví dụ

Buổi sáng thu hoạch lúa, phân công cư dân sửa tường gạch, nâng nhà gỗ thành nhà gạch, giao 4 thương binh tuần cổng. Radar phát hiện Mỏ Sắt Bỏ Hoang. Gửi trinh sát, chọn đội đao/thương/cung/nỏ và quân nhu. Vào battle instance, vô hiệu hóa trạm báo động, đánh chỉ huy. Ra bản đồ cá nhân: sector **liberated nhưng chưa claimed**. Cử thợ dựng tiền đồn, mở đường, lọc đất nhiễm độc; vùng mới có thể đặt xưởng và tiếp tục xây. Cuối ngày tham gia boss quân đoàn hoặc trang trí làng.

## Bộ tài liệu triển khai

Đọc `docs/00_START_HERE.md` rồi mở các tài liệu hệ thống và `prompts/STAGE_XX.md`. Đây là mô tả tổng quan, **không thay thế** tài liệu chi tiết.


---

<!-- SOURCE: docs/00_START_HERE.md -->

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


---

<!-- SOURCE: docs/01_VISION_AND_CORE_LOOP.md -->

# 01 — Tầm nhìn game, trải nghiệm và vòng lặp

## Experience pillars

1. **Từ hoang tàn đến ấm no:** Không gian đầu tiên chỉ có căn chỉ huy cũ, 5 người sống sót, giếng, vài ô đất màu mỡ. Mỗi nâng cấp nhà, ruộng, tường, ao, đường phải có thay đổi hình ảnh.
2. **90% thế giới là mục tiêu:** Đất bị chiếm được tổ chức theo sector và cứ điểm, nên mở rộng là một chuỗi quyết định về trinh sát/đội hình/quân nhu, không phải lặp thao tác click từng hex.
3. **Một thế giới sống:** NPC có nhà, nghề, công việc, ca nghỉ; lính tuần tra, động vật chăn thả; biểu diễn 3D mượt nhưng server cập nhật theo sự kiện/timestamp.
4. **Thích xây dựng vẫn chơi được:** Cốt truyện PvE không yêu cầu PK, xếp hạng hoặc quân đoàn. Không phá căn cứ người chơi khi offline.
5. **Mở rộng có cái giá:** Vùng xa cần tiền đồn, đường tiếp tế, binh lính và hậu cần tương xứng.

## Ba không gian

- **Private World:** Trực tiếp xây dựng, dân cư, quân đội, tài nguyên, patrol, scan, radar, reclaimed sectors. Server sở hữu trạng thái.
- **Battle/Dungeon Instance:** Scene riêng có lượt, AP, hex terrain, AI, objectives, looting, wounds. Cốt truyện và sự kiện PvE.
- **Shared Frontier:** Bản đồ cạnh tranh theo season, guild boss, guild war, cờ/cứ điểm; không ảnh hưởng ownership private.

## Ba tầng vòng lặp

- **15–60 giây:** Chọn ô, đặt công trình, thu hoạch, mở panel, ra lệnh cho NPC/lính, xem sự kiện.
- **5–20 phút:** Trồng/thu, nâng cấp, khám phá sector, làm một phó bản hoặc công trình quan trọng.
- **Nhiều ngày/tuần:** Hoàn tất chương truyện, mở vùng 1000×1000, quy hoạch thành, hoàn thành công trình kỳ quan, thăng hạng liên minh.

## Onboarding 30 phút (đề xuất)

| Thời điểm | Hành động người chơi | Kiến thức học được |
|---|---|---|
| 0–5 phút | Sửa chỉ huy, xây nhà dân 1 hex | Place, UI công trình, resources |
| 5–10 phút | Vẽ 6 hex ruộng lúa và xây giếng | Shape vùng sản xuất, tưới, NPC |
| 10–15 phút | Xây 8 đoạn rào + cổng và trại gà | Edge-building, logistics |
| 15–20 phút | Dựng radar, quét một sector | Fog of War, scan ≠ claim |
| 20–25 phút | Tạo đội đao/thương, luyện cung | Recruit, squad, barracks |
| 25–30 phút | Phó bản nhỏ cứu trinh sát | Turn/AP, thưởng, giải phóng |

Nếu tính năng cần đến giai đoạn sau, onboarding nên hoàn thiện tuần tự, **không dùng nút giả**.

## Bốn phong cách chơi

- **Kiến trúc sư:** Tối ưu nhà 3 cấp, đường và bản thiết kế, cây xanh, tường/ao/ruộng đẹp, tự động hóa sản xuất.
- **Thống lĩnh:** Lập đội, tập luyện, tuần tra, xây tiền đồn, đánh cứ điểm.
- **Nhà thám hiểm:** Khám phá điểm nghi vấn, giải mã di tích, vượt phó bản, boss.
- **Thành viên quân đoàn:** Hợp tác PvE, chiến tuyến PvP tự nguyện, giao thương.

## Tránh hành vi gây bực bội

- Không bắt người chơi online liên tục để ngăn mất nhà/đất.
- Không khóa tiến trình cá nhân phía sau PvP hay trả tiền.
- Không đặt thời gian xây quá dài trong 30 phút đầu.
- Không bắt đánh 1 trận/1 hex; chiếm theo sector.
- Không để thiếu nước 5 phút khiến dân chết hàng loạt; dùng warning/debuff/tình huống có thể phục hồi.
- Không sinh sản lượng vô hạn khi offline, kho đầy phải dừng/giảm tiến trình.


---

<!-- SOURCE: docs/02_STORY_CAMPAIGN.md -->

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


---

<!-- SOURCE: docs/03_WORLD_HEX_RECLAMATION.md -->

# 03 — Thế giới 1000×1000, Hex Grid, Fog of War, Sector và tái chiếm

## Hệ tọa độ và kích thước

- World bounds định nghĩa trên mặt phẳng `x,z ∈ [0,1000]` (đơn vị mét game) và `y` là độ cao. Tọa độ world origin được chọn và cố định, tài liệu/API thống nhất.
- Hex **pointy-top**, axial `(q,r)`, center-to-center distance `d=10m`. Với bán kính ngoại tiếp `s=d/√3≈5.7735`, diện tích một tile là `3√3/2*s²≈86.60m²`.
- World có khoảng `1,000,000 / 86.60≈11,547` hex lý thuyết nếu phủ đầy; do rìa cắt theo hình vuông, số tiles hợp lệ là **giá trị tính từ world bounds**, không hardcode 11,547.
- Đất khởi đầu xấp xỉ `10,000m²` => khoảng 115 hex liền kề, không bắt buộc có đường biên hình vuông hoàn hảo; trung tâm world gần (500,500).
- Tỷ lệ initial 1% claimed, 9% neutral, 90% hostile **tính trên playable area**. Dữ liệu được phân phối theo sector, không ngẫu nhiên từng tile.

## Axial math bắt buộc (pure functions)

```ts
export const HEX_DIRECTIONS = [
  [1,0], [1,-1], [0,-1], [-1,0], [-1,1], [0,1]
] as const;

export function axialDistance(a:{q:number;r:number}, b:{q:number;r:number}) {
  const dq=a.q-b.q, dr=a.r-b.r;
  return (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2;
}
// pointy-top reference; must be consistent with chosen world origin:
// x = sqrt(3)*s*(q + r/2), z = 1.5*s*r
// invert using cube-round, never round q/r independently.
```

Test neighbors, reverse transform, negative coords, borderline cells, rotation in 60° increments, path length and canonical edge mapping. **Hex is logical navigation/build coordinate; visual terrain mesh is continuous.**

## World generation

`seed` deterministic → biome macro noise → elevation/moisture → roads/river/POI → sector partition → faction occupation → initial safe zone. Terrain/chunk regeneration must give the same results for a given seed and generation version. Persist edited chunks, terraforming, discovered info, buildings, wall edges and zone state. `world_generation_version` is stored to allow migration when generator changes.

## Sector model

A sector = connected set of 15–50 hex (design range, exceptions allowed for terrain edge), with:
- `sector_id`, `world_id`, `name`, `biome`, `faction_id`, `threat_tier`.
- `recon_level`, `fort_id`, `supply_route_state`, `liberation_state`, `recovery_level`, `rewards`, `objectives`.
- Ownership is still tracked on tiles. Sector is strategic unit, not a replacement for tile records.

`liberation_state` proposed: `OCCUPIED`, `RECONNED`, `ASSAULT_AVAILABLE`, `LIBERATED`, `CLAIM_IN_PROGRESS`, `CONTROLLED`. Some neutral sectors go `NEUTRAL` → `CLAIM_IN_PROGRESS` → `CONTROLLED` without combat.

## Tile state as independent dimensions

Avoid one ambiguous status field. Store:
- `discovery_status`: `HIDDEN | SCANNED`.
- `control_status`: `NEUTRAL | HOSTILE | LIBERATED | PLAYER`.
- `claim_job_id` nullable.
- `terrain_remediation_status`: `NONE | CONTAMINATED | REMEDIATING | STABLE`.
- Build eligibility computed `PLAYER + stable terrain + valid slope/footprint + constraints`, **not solely by scanned**.

## Scan / recon / liberation / claim sequence

1. **Scan:** Radar reveals selected cells in range. Check energy and scan capacity. Return only approved discovered data, not hidden unit/resource internals.
2. **Recon:** Scout mission on a revealed hostile sector; `intel_level` unveils enemy composition, trap, terrain and supply weak points. Random encounter can create a short dungeon.
3. **Prepare:** squad + supplies + optional weakening side missions; backend validates eligibility and locks assigned units while battle is active.
4. **Assault:** Battle instance (tactical hex) validates win. On success, `sector` switches `LIBERATED`; battle `reward_grant` is idempotent.
5. **Claim:** One or more connected blocks within liberated/neutral area need marker/outpost, workers/materials and reachable supply. They switch to `PLAYER` only when server job finishes.
6. **Restore:** Clean rubble, water, radiation; restored terrain enables agriculture, housing and ecosystem improvements.

**Never require a separate battle per tile.** Liberating one sector opens claim of several tiles, with optional special POIs requiring another encounter.

## Initial world generation constraints

- Safe center territory must be connected, buildable, contain water access and several farmable clusters ≥6 hex, one free site ≥12 hex or equivalent room for expansion.
- Hostile sectors not adjacent in a way that soft-locks beginner; at least 2–3 reachable neutral directions.
- Story key POIs guaranteed within campaign progression range, even across different random seeds.
- Sector graph must have a reachable route toward all story chapters; seed validator rerolls layouts until critical path is valid.

## Hex chunk/terrain rendering

- Chunk partition stable from axial coords (choose chunk width such as 16 or 24 q/r cells in logical storage but preserve hex adjacency); chunk cache and revision in API.
- Generate terrain mesh seamless across boundaries via consistent shared sampling; no cracks, z-fighting or visible floating hex slabs.
- Overlay for build/scan/combat; no permanent thick grid in normal world view.
- Avoid client generating rare POI secrets before scan. Public geometry can be deterministic, metadata server-gated.
- Loading: initial nearby chunks, camera-based streaming, LOD/culling/InstancedMesh vegetation.

## Example API

```http
GET  /api/world/me/chunks?qMin=-10&qMax=10&rMin=-10&rMax=10
POST /api/world/me/scans
POST /api/world/me/recon
POST /api/world/me/claims
GET  /api/world/me/sectors
GET  /api/world/me/sectors/:sectorId
```

`scan` input `{ center: {q,r}, mode:"directional", idempotencyKey:"..." }` and response with job ID / status. Claim input `{tileKeys:["q:r"...], outpostId?, idempotencyKey}`; server checks adjacency, unlock, supplies, and overlapping claims. Avoid client sending `result: success`.

## Gameplay tests and acceptance

- `same seed + version` generates same tiles/sector graph; different seeds differ; starter always valid and connected.
- Scan only reveals permitted cells, does not grant ownership; recon cannot run on hidden sector.
- Win causes sector `LIBERATED` but no build permission until claim confirmed.
- Claims validate connectedness, world bounds, hostile/neutral rules, capacity, supply, duplicates.
- Two players never mutate each other's world. Concurrent claims don't double-spend.
- World remains unchanged on reload; private ownership does not reset on season/PvP loss.


---

<!-- SOURCE: docs/04_BUILDINGS_WALLS.md -->

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


---

<!-- SOURCE: docs/05_ECONOMY_CITIZENS.md -->

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


---

<!-- SOURCE: docs/06_MILITARY_PATROLS.md -->

# 06 — Quân sự, trại huấn luyện, lính tuần tra, thú cưỡi và hậu cần

## 4 binh chủng mở đầu

| Unit | Vai trò | Điểm mạnh/điểm yếu | Tầm đánh hex (mẫu) |
|---|---|---|---:|
| `SWORD` đao | Cận chiến, giữ tuyến trước | HP/guard tốt; kém tầm xa | 1 |
| `SPEAR` thương | Chống xung phong và thú cưỡi | Có reach; dễ bị xạ thủ nếu lộ | 1–2 |
| `BOW` cung | Bắn xa cơ động | Nhiều lượt bắn hơn; giáp yếu | 2–5 |
| `CROSSBOW` nỏ | Xuyên giáp xa | Hit mạnh, reload/AP cao | 2–4 |

Giá trị máu/damage/AP/tầm/đi chậm/bonus nằm trong config. Không thêm cavalry là binh chủng gốc; ngựa/voi gắn role/mount/support. Quân từ `survivor` đủ điều kiện, rút khỏi lao động dân sự khi huấn luyện/đóng quân.

## Bãi luyện ≥6 hex, nâng cấp 3 cấp

- Đao 6, thương 6, cung 6, nỏ 6, lò rèn quân sự 6, kho quân nhu 6, trường tổng hợp ≥9.
- Tier 1: trại gỗ + sân đất + 2 slot train (gợi ý); tier 2: nhà gạch/giá vũ khí + 4 slots; tier 3: công trình kiên cố, sân chuyên môn + 6 slots.
- Animation training riêng: đao vung/chặn, thương đâm/formation, cung kéo/bắn, nỏ lên dây/nạp/bắn. Không trùng nhầm animation; vũ khí qua rig sockets.
- Recruitment flow: pick citizens → validate skill/slots/equipment/food → training job server timestamp → graduate unit (stable ID), level/experience → active squad / patrol / defense / reserve.
- Soldiers can be injured in battle; medical recovery and supplies, no forced permanent deletion for normal PvE loss.

## Patrol & guard system (must-have)

**Ngay sau huấn luyện**, có thể assign lính vào `PATROL`, `GUARD`, `TOWER_GUARD`, `RAPID_RESPONSE`, `REST`, `EXPEDITION`, `RESERVE`. Lính không vừa tham gia battle instance vừa tuần tra.

### Patrol UX

1. Chọn 1–6 lính/tổ (config, không cứng), hoặc 1 unit và chọn **Phân công tuần tra**.
2. Map chuyển sang Patrol Mode; player đặt waypoint trên đường/hex thuộc sở hữu (hoặc được phép canh); auto-connect bằng A*.
3. Tùy chọn `LOOP`, `PING_PONG`, `ONE_SHOT`; chọn speed/walk, alert policy, giờ trực, patrol start.
4. Validate path, chướng ngại, gate state, tower/guard posts, các unit đã bận; preview polyline trên terrain.
5. Save `patrol_route` and `patrol_route_waypoints` + unit assignments on server; client animates chibi soldiers along exact route using smoothed spline while respecting navgraph.
6. Chọn unit mở panel current state, next waypoint, stamina, squad, pause/resume, go to barracks, reassignment.

### Patrol states and scheduling

`IDLE`, `MUSTERING`, `PATROLLING`, `WAITING_AT_GATE`, `GUARDING`, `ALERTED`, `RETURNING`, `RESTING`, `INJURED`, `IN_BATTLE`. Schedules e.g. day/night shifts, fatigue recovery. Nếu cổng đóng mà unit không có quyền pass, reroute/WAITING, không teleport xuyên tường. Khi alert, unit tập hợp ở rally point; nếu kích hoạt defense event sẽ tạo battle instance, không phá world.

### Route data example

```json
{
  "name": "Tuyến Bắc Thành",
  "mode": "LOOP",
  "waypoints": [{"q":3,"r":2},{"q":4,"r":2},{"q":4,"r":1}],
  "shift": {"start":"06:00","end":"18:00"},
  "unitIds": [101, 102],
  "alertPolicy": "MUSTER_AT_GATE"
}
```

Validation ở server: all waypoints discovered/owned or allowlisted; connected path, no invalid tile/edge, assigned units owned+available, max route length, shift values; efficient path cache invalidated when gate/road/wall changed.

### Offline patrol model

Lưu assignment/route/schedule và timestamp; **không chạy vị trí NPC từng frame khi không có client xem**. Server cập nhật status/alert qua event hoặc checkpoint; khi player quay lại, client xác định vị trí hợp lý từ schedule/time, không làm lính teleport giữa các bức tường.

## Watchtowers, walls and alarms

- Wall + gate edge collision integrated with graph, tower guard slots/range and patrol return points.
- Normal / Alert / Emergency modes. Alert may move soldiers to gates/towers and notify player; Emergency launches optional PvE defense instance.
- Defense strength = snapshot of wall levels/HP, gate/tower tiers, assigned guards, supplies and buffs; no permanent private asset damage from PvP.

## Trại ngựa/voi

- Horse farm ≥9 hex, 3 tiers (gỗ → gạch → khu chuyên luyện), capacity gợi ý 4/8/12.
- Elephant camp ≥12, 3 tiers (bãi nuôi → trại kiên cố → trung tâm tượng binh), capacity gợi ý 2/4/6.
- Animal health, hunger/water, training, mounts, equipment, recovery, visuals. Mount assignment one rider→one horse; riding rig socket attachments; voi là heavy logistics/support, không “unit fifth” ban đầu.

## Đội hình, tướng, quân nhu và hành quân

- Tactical squad 3–5 unit MVP; formations front shield, spear bracing, archers rear, crossbow focus. Mỗi unit một exclusive `assignment`.
- Tướng chỉ huy (later) có chỉ số morale/leadership; tránh stacking mất cân bằng.
- Quân nhu: rations, arrows/bolts, armor durability, medicine; cần cho expedition. Kho quân nhu và xe hàng/tiền đồn nối supply chain.
- Lộ trình xa có thể giải quyết bằng **server-side travel jobs** thay vì mô phỏng chi tiết từng bước trên 1000×1000 mọi lúc.

## Tests

- Recruit không vượt số dân/slot/trang bị, không double-complete jobs.
- Một soldier không assignment đồng thời to patrol và battle.
- Route walkable qua road/gate; invalid waypoint; gate closes mid-route → recompute safely.
- Patrol persisting after reload, shift change and stamina; camera culling animation không làm mất server progress.
- Barracks levels 1–3 visual distinct, patrol uses correct chibi rig and weapon attachment.
- Alert triggers separate instance, does not damage private world persistently.


---

<!-- SOURCE: docs/07_DUNGEONS_PVE.md -->

# 07 — Phó bản, PvE, boss, battle engine và chiến thuật hex

## Three scenes / authoritative states

- **WorldScene:** xây/kinh tế/patrol; không có PvP đột kích căn cứ riêng.
- **ExpeditionScene/BattleScene:** các instance độc lập, hex tactical turn-based.
- **SharedFrontierScene:** sự kiện multiplayer/PK; dùng battle engine chung nhưng bản đồ và rule khác.

## Dungeon types

| Loại | Objective | Kết quả/Reward |
|---|---|---|
| Trinh sát | Lấy thông tin, thoát an toàn, né patrol | Intelligence và điểm trên bản đồ |
| Cứu hộ | Tiếp cận/giải thoát NPC | Người tị nạn và nghề hiếm |
| Đánh chiếm | Vô hiệu báo động, giữ cổng, đánh chỉ huy | `sector_liberated`, claim opportunity |
| Khám phá di tích | Giải khóa/công nghệ, nhiều con đường | Old world data, blueprint |
| Boss | 2–3 phase hành vi (mẫu), terrain hazard | Rare material, tech unlock |
| Thủ thành | Giữ position qua các đợt | Defense resources/cosmetic |
| Hộ tống | Bảo vệ convoy trên path qua hex | Logistics unlock / supplies |
| Sinh tồn | Thoát an toàn với khẩu phần giới hạn | Exploration resources |
| Tổ đội | Nhiều player đóng góp units theo luật | Guild/co-op rewards |

Không nhất thiết mọi phó bản đều là diệt sạch kẻ địch. Có objective status và clear conditions riêng.

## Battle instance contract

- Tạo từ server bởi `missionId`, `squadId`, supply package, optional companion IDs, `idempotencyKey`.
- Freeze/load `battle_map_seed`, tiles (terrain cost/height/cover), unit snapshots (HP/status/equipment), objectives, active turn, AP and action log.
- 3–5 units/squad MVP, can extend later. Units trong battle bị lock assignment trên world.
- Actions: MOVE, ATTACK, SKILL, DEFEND, USE_ITEM, END_TURN, OBJECTIVE_INTERACT. Server **recalculates** range/LOS/path/AP/damage/random seed and validates ownership/turn.
- Client only requests intention, never authoritative damage/loot/sector clear.
- Battle sync: REST API sufficient for solo; Socket.IO for PvP/co-op and notifications.

## Tactical hex rules

- Hex neighbors directions consistent with world but battle can have its own local origin and tile scale; same axial math package.
- Pathfinding A* and reachable hex set by move budget, occupancy and terrain cost; height/cover/hazard.
- Line of sight uses hex-ray/path sampling and obstruction; unit elevation influences cover/range as configured.
- Status: poison, stun, guard, armor-break, suppressed (initial subset); statuses have duration/tick order.
- Bow: range, mobility; Crossbow: high armor penetration but reload/AP delay; Spear: counter charge; Sword: block/guard.
- Boss phase transitions at thresholds and/or objectives, animation and warning tiles, counterplay turns.

## Factions/AI

- Tro Tàn = squad tactics, covers, ranged formation, reinforcements.
- Dị Hóa = charge, poison, swarm, hazards.
- Người Gác Cũ = armor, traps, target marking, mechanical telegraphs.
- AI first version finite-state/utility scoring: target threat, distance, HP, cover, hazard and win objective; deterministic seed for replay/testing.

## Example quest: Trạm Canh Sương Mù

- Scenario: 8×10-ish hex tactical region (shape not rectangular grid), 3 player units vs 4 hostile. Objective rescue scout, optional jam signal tower in 6 turns.
- Preparation: squad 1 sword + 1 spear + 1 bow, basic rations.
- Rewards: scout survivor, intel and metal scrap. Victory updates quest event and visibility of an adjacent sector; **not automatically claim entire sector**.

## Example quest: Pháo Đài Gạch Vỡ

- Scout reveals wall, gate and commander; optional cut supply mission gives debuff to enemy.
- Objectives: disable alarm, seize gate, defeat commander; partial bonus if noncombatants saved.
- On victory: issue `sector.liberated` domain event, then create separate claim job if player orders outpost/builders.

## Rewards / failure / disconnect

- Reward grant has unique `battle_id + reward_type` or one reward-grant ledger; retries idempotent; no client-submitted loot.
- On defeat: wounds, supply consumption, optional cooldown; preserve private buildings and claimed tiles. No permanent PvP loot of personal world.
- On disconnect: recover from saved action log and turn state, explicit surrender/timeout policy for live modes; AI cannot invent outcome.

## Asset / UI

- Cute readable chibi at isometric scale, distinct silhouettes for 4 troop types and enemies. Animation states idle/run/attack/hit/knockout/victory, rig sockets for weapons.
- UI: turn order, AP, reachable hexes, target LOS, hit chance/cover, status, objectives, undo before commit only if not action executed, clear event log, skip animation option.

## Required tests

- Cannot move through blocked terrain/unit or beyond AP.
- LOS blocked by obstacles; enemy range and damage server-valid.
- Actor not active cannot act; lost connection cannot replay reward.
- Victory/defeat updates soldier injuries, mission/sector state, but not private asset ownership by PvP.
- Same seed/action sequence yields reproducible outcomes for test harness.


---

<!-- SOURCE: docs/08_PVP_GUILDS.md -->

# 08 — PvP, quân đoàn và Shared Frontier

## Fundamental protections

- PvP **voluntary**, does not raid, burn, steal or permanently capture any private-world house, wall, farm, animals or player-owned hex.
- Solo PvE can finish the main story. Guild membership and ranked PvP are optional.
- Shared Frontier is a distinct server-owned map with seasonal objectives and reversible control.

## PvP modes

1. **1v1 friendly duel:** no ranking impact, choose squads and battle map.
2. **1v1 ranked:** matchmaking by rating and unit power bands; seasonal rewards favor cosmetic/progression balance.
3. **2v2 squad:** turn coordination, reconnect/timeout policies, validation of each participant's assigned units.
4. **Capture the Flag:** hold/control hex objectives for turn count, not only eliminate all enemies.
5. **Guild siege skirmish:** event instance around shared fort, snapshots of guild units and shared defense assets.

## Guild lifecycle

- Create guild (name/tag/logo, owner), invite/search, join/leave, ranks Leader/Officer/Member, moderation, chat, contribution ledger, treasury with permissioned withdrawals.
- Guild hall/town built on **guild shared space** or abstract levels, not within one member's personal land unless cosmetic visit only.
- Guild technology: bounded group buffs, no mandatory advantages blocking solo story.
- Guild quests: contributions by farming, gathering, PvE and supply, not only combat.
- Guild boss: separate cooperative instance or asynchronous contributions when engine not ready for synchronized multi-party turns.

## Shared Frontier

- **Sector map separate from Private World**, neutral forts and mines; seasonal faction ownership (`guild_id`, control_until) not private player ownership.
- Control via scheduled events with time window, eligibility, sign-up, battle instance, scoring, reward ledger.
- Shared frontiers can reset each season; personal world never resets.
- Supply and resources used in guild war are player consent actions and have spend limits, idempotent ledger entries.

## Social and economic fairness

- Visiting: explicit privacy level `PUBLIC | FRIENDS | PRIVATE` with read-only projection; visitors cannot mutate owner's state.
- Trade must define whitelists, taxes/sinks, rate limits, fraud/replay protection before launch. No real-money trading/gambling.
- Anti-cheat: server authorizes every action and combat calculation, logs suspicious patterns, user reporting/moderation.

## Real-time architecture

- REST for profiles, guild management, match history, league data. Socket.IO for presence, room/lobby, battle turn broadcast, rejoin, guild chat (with validation/rate limits).
- Auth handshake, per-room ACL, event ack with message id, action version, deduplication; never allow clients to choose a victim's world to mutate.
- Optional Redis adapter when multi-node; not required for one-server MVP.

## Reconnect policies

- Ranked match pause grace period, then AI auto-defense or forfeit (product design config); never grant duplicate rewards.
- On battle resume, send latest server snapshot + events since last sequence, then render.

## Acceptance

- Guests read-only; privacy honored.
- No unauthorized guild treasury transfer or actions by ex-member.
- Ranked match deterministic server validator; no duplicate rewards/disconnect exploits.
- Guild season reset does not alter any private world building/claim.
- Guild participation can be skipped without preventing main story completion.


---

<!-- SOURCE: docs/09_ART_UI_ASSETS.md -->

# 09 — Chibi Art Bible, Blender workflow, GLB, animation, VFX, UI

## Mood & shape language

**Theme:** Cozy hopeful post-apocalypse: cute reconstructed civilization amid ruins. Not hyper-realistic, not flat voxel/primitive cubes, not horror/gore. Houses have oversized expressive roofs and openings; characters 2.5–3.5 heads tall; trees have rounded canopies; animals have recognizable silhouettes and charming proportions.

### Palette references (recommendations, not rigid)

- Vegetation: moss/sage/grass greens, differentiated by biome.
- Wood: honey brown, warm timber, rough grain simplified.
- Brick/roof: terracotta, orange/red, off-white walls.
- Stone defense: warm gray, blue/gray shadow.
- UI: parchment cream, deep brown, olive, copper accents; status red/orange/blue only for semantics.
- Corrupted areas: muted gray-green/purple haze, but still readable stylized art, not near-black everywhere.

## Asset scale and constraints

- Blender scene uses meters; export GLB normalized, local origin ground-center and documented forward axis.
- Fit meshes to hex footpint **without colliding adjacent buildings**. One 10m-center hex footprint houses building+garden; level3 house height grows but horizontal footprint stays 1 hex.
- Readable silhouettes from isometric high camera; emphasize doors/windows, roof differentiation, smoke/lantern/flag, vegetable/crop visual stages.
- LODs for large/mid/small view; share materials and atlas/texture where possible; skinning only when animated.
- Distinguish stage assets `READY`, `MISSING`, `PLACEHOLDER` in manifest and QA; no deception about completion.

## Asset naming/structure

```text
assets/
  buildings/residential/house/{lv1,lv2,lv3}.glb
  buildings/farming/rice_field/modules/{ridge,ditch,shack,pump}.glb
  buildings/defense/wall/{wood,brick,stone}/{straight,corner,end}.glb
  buildings/defense/gates/{lv1,lv2,lv3}.glb
  buildings/defense/watchtower/{lv1,lv2,lv3}.glb
  characters/civilians/{base,farmer,blacksmith}.glb
  characters/military/{sword,spear,bow,crossbow}.glb
  animals/{chicken,pig,cow,horse,elephant,fish}/*.glb
  props/{vegetation,stone,tools,lamps}/
  audio/{ambient,ui,characters,combat}/
```

## Rig and animation clips

- Civilians: Idle, Walk, Carry, Work, Eat, Rest, Talk; shared skeleton when practicable.
- Animals: Idle, Walk, Eat, Drink, Rest, React; horse Trot/Gallop/Ride; elephant Trunk/Carry.
- Military: Idle, Walk, Run, Training_Sword, Training_Spear, Bow_Draw/Release, Crossbow_Load/Fire, Guard, Attack, Hit, Knockout, Victory, PatrolAlert.
- Facial animation can use blendshapes/texture variants; keep GPU and draw calls in budget.
- Sockets: right_hand_weapon, left_hand_shield, horse_saddle, elephant_harness; no floating weapon or penetration at animation contact.

## Modular terrain for irregular shapes

- Fields: farm tiles use instanced crops; edges/irrigation generated based on neighbor mask, 6 directions.
- Ponds: height-adjusted terrain depression, generated shoreline from external edges, water mesh continuous; level decorations added per zone without changing shape.
- Walls: edge-prefab straight/corners/end/cross and gate replacements with normalized edge key; adapt to hex 60° geometry.
- Zones: cost of 6+ hex cannot assume all rectangles; model footprints from tile sets with procedural boundary meshes.

## Lighting/rendering

- Stylized PBR: simplified albedo+roughness+normal where effective. Main directional light, ambient/environment fill, soft controlled shadows, color management consistent.
- Day/night and weather as later polish; do not blow performance with multiple shadow-casting lights/SSR heavy effects.
- Quality presets low/medium/high, reduce foliage/shadow/animation complexity.

## User interface principles

- Construction catalog groups: residential, roads/decor, farming, livestock, aquaculture, military, defense, utilities, special.
- Three core modes: `WORLD`, `BUILD`, `SCAN`, plus `PATROL`/`BATTLE` separate. A control belongs to exactly one active selection mode to avoid click conflicts.
- Placement preview: green valid/red invalid, price, reason, orientation, footprint. Upgrade: model preview tier, cost/time, impact, no hidden ownership changes.
- Minimap with fog, terrain, claimed borders, hostile sector markers; not reveal secret POIs.
- Panels usable at 1366×768 desktop, scalable down to smaller viewports; game client prioritized desktop initially.
- Icon and color semantics consistent: blue for information, orange for warning, red for invalid/danger, green for valid/claimed.

## Art QA gates

- Every level visibly different at default camera scale.
- No floating/ground-clipped assets, cracked shorelines, walls crossing gate, cropping house into other hex.
- Day and night legible, UI not block key building interactions.
- Chibi animations blend without snaps and do not break pathfinding/collision.
- GLB is licensed or self-made; attribution/credits recorded if needed.


---

<!-- SOURCE: docs/10_TECH_ARCHITECTURE.md -->

# 10 — Kiến trúc phần mềm, code standards, hiệu năng và state ownership

## Tech stack baseline

- Frontend: React + TypeScript + Vite, R3F + Three.js + Drei, Zustand for UI/render state, TanStack Query for server state, Tailwind/shadcn UI.
- Backend: Node.js LTS, Express + TypeScript, Sequelize + mysql2/MySQL 8, Zod; Socket.IO when realtime needed; Redis/BullMQ for queue and cached/offline tasks as scale grows.
- 3D: Blender-authored GLB/glTF, optimized/compressed textures, InstancedMesh, LOD, chunk streaming.
- Tests: Vitest, Supertest, Playwright; performance profiling and migration tests.
- Verify exact compatible versions and lock them in `package-lock.json`; don't silently adopt breaking major upgrades.

## Monorepo suggestion

```text
apps/client/src/
  app/              routes, providers, top-level screens
  game/scenes/      WorldScene, BattleScene, SharedFrontierScene
  game/hex/         tile picking, overlay and renderer adapters
  game/terrain/     chunk loaders, biome render, water
  game/buildings/   catalog, placement/upgrade previews and models
  game/characters/  NPC and animal animation systems
  game/patrol/      route editor, path visualization, animation
  features/         menus/panels UI separated from 3D engine
  stores/           local UI state only
  api/              typed client and hooks
apps/server/src/
  modules/auth/ world/ buildings/ resources/ production/
  citizens/ farming/ livestock/ aquaculture/
  military/ patrol/ missions/ sectors/ battles/
  guilds/ pvp/ trading/ tech/
  infrastructure/db/ jobs/ events/ security/
packages/shared/src/
  hex/ config/ types/ schemas/ errors/ events/
assets/ docs/ prompts/
```

**Modular monolith first**, module boundaries by domain and shared validation. Separate services only after evidence of scaling problems.

## State layers

1. **MySQL authoritative**: world ownership, tiles, sectors, building tiers, inventories, survivors, training, battles, guilds, rewards.
2. **Backend calculation**: jobs, elapsed-time production, battle rules, claim/quest validation, quotas, supply graph. Redis as cache/queue, not truth source.
3. **Client data cache**: TanStack Query per world user, invalidated by mutations/websocket events; never trusted for rewards.
4. **Zustand local**: selection, camera, build/patrol/scan mode, preview and UI toggles. Avoid putting entire terrain instance arrays in React component state.
5. **Three.js render state**: skeleton animation, interpolated NPC positions, particles, LOD; never authoritative economics.

## World/sector/3D performance

- 1000×1000 / approx 86.6 m² per hex ≈ 11.5k logical tiles; do not instantiate them all as independent React components.
- Backend stores only edited/discovered tiles and sector metadata if generation deterministic. Asset and data streaming by chunk/camera area.
- Bound terrain changes by world bounds, use generation version to avoid changed seeds between deployments.
- InstancedMesh foliage/crops/stone; batch textures/materials; animation culling; worker for heavy mesh calculation only if profiling justifies.
- Frame budget aspiration: 60FPS typical midrange desktop at representative scene, ≥30 FPS lower preset; must benchmark not assume.
- Server should never simulate tens of thousands of visible NPC movement frames when offline; elapsed-time jobs instead.

## Security / integrity

- Authentication using secure session or JWT+HttpOnly refresh flow with CSRF considerations.
- Every endpoint verifies derived `world_id` from auth and exact ownership; role/permissions for guilds.
- Server determines build placement, upgrade level, costs, unit training, battle outcomes, loot and sector liberation.
- Transactions and idempotency keys for spend, claim, build, training, harvest, guild treasury, battle reward.
- Rate-limit, Zod validation, structured errors, audit ledger, logs, migrations with backups; secrets in env only.

## Event-driven progression

Use domain events `building.completed`, `wall.constructed`, `crop.harvested`, `citizen.recruited`, `soldier.trained`, `patrol.created`, `sector.scanned`, `sector.liberated`, `claim.completed`, `battle.completed`, `guild.quest.contributed` to update quest progression and notifications. Events have IDs and processed-once logic.

## Source, schema and asset checks

- Conventional migrations/seeds, unique constraints, explicit foreign keys and indexes, no force sync.
- Asset manifest maps `building_type + level -> GLB/variants`; loader has placeholder fallback clearly flagged.
- Feature flags can hide incomplete modes without fake buttons.
- After stage run lint/typecheck/tests/build and E2E workflow applicable to stage; document blockers honestly.


---

<!-- SOURCE: docs/11_DATABASE_AND_API.md -->

# 11 — Database schema và hợp đồng API v1

> Hướng dẫn triển khai, không phải migration SQL chạy trực tiếp. Khi viết migration cần điều chỉnh kiểu dữ liệu, khóa/index, naming conventions theo project đang có. Các bảng được đưa vào stage tương ứng, không tạo tất cả trong ngày đầu.

## Bảng theo domain

| Domain | Tables chính | Constraint trọng tâm |
|---|---|---|
| Auth / World | `users`, `user_sessions`, `worlds`, `world_resources`, `world_hex_tiles`, `world_chunks` | `worlds.owner_id UNIQUE` v1, `(world_id,q,r) UNIQUE` |
| Sector & discovery | `sectors`, `sector_tiles`, `sector_discoveries`, `world_scan_jobs`, `world_recon_jobs`, `world_claim_jobs`, `world_points_of_interest` | `(world_id,sector_key) UNIQUE`, `sector_tiles(tile_id) UNIQUE` nếu tile chỉ có 1 sector |
| Buildings | `building_types`, `building_levels`, `world_buildings`, `building_footprints`, `construction_jobs`, `upgrade_jobs` | Một ô `world_id,q,r` được footprint exclusive claim atomically; ngoại lệ decor nonblocking |
| Defense | `wall_segments`, `wall_gates`, `watchtowers`, `wall_repair_jobs`, `road_edges` | `(world_id,edge_key) UNIQUE`; gate replaces wall |
| Farming | `crop_types`, `farm_zones`, `farm_zone_tiles`, `crop_cycles`, `irrigation_networks` | tile unique per active farm zone |
| Animals / fish | `animal_species`, `livestock_farms`, `farm_animals`, `water_bodies`, `water_body_tiles`, `fish_species`, `fish_stock_batches`, `aquaculture_cycles` | capacity, owner, production event ledger |
| Civilians/economy | `survivors`, `professions`, `survivor_jobs`, `survivor_housing`, `production_recipes`, `production_jobs`, `resource_transactions`, `inventory_stacks` | ledger transaction keys unique, one full-time job/person |
| Military | `unit_types`, `military_units`, `equipment_types`, `unit_equipment`, `training_jobs`, `military_squads`, `squad_members`, `mount_assignments` | exclusive unit assignment, 1 rider/horse |
| Patrol | `patrol_routes`, `patrol_route_waypoints`, `patrol_assignments`, `guard_posts`, `alert_events`, `patrol_shifts` | owned units, valid paths, no concurrent battle |
| Battles/quests | `mission_definitions`, `player_missions`, `battle_instances`, `battle_units`, `battle_actions`, `battle_rewards`, `reward_grants`, `quest_events` | unique grant, action sequence/turn validity |
| Guild / PvP | `friendships`, `guilds`, `guild_members`, `guild_roles`, `guild_treasury_ledger`, `pvp_matches`, `rating_history`, `frontier_seasons`, `frontier_sectors`, `frontier_control_events` | role ACL, season isolated from private |

## Common fields and conventions

- Primary keys BIGINT/UUID consistently, created_at/updated_at (UTC), status enums validated by schema, `deleted_at` only where soft-delete needed.
- Financial/resource ledger: `idempotency_key`, `world_id`, `source_type`, `source_id`, `resource_code`, `delta`, `balance_after`, `created_at`. Never rely only on a mutable amount field without audit for important rewards.
- For world tiles, modified properties stored, generated terrain derived from `world_seed` + `generation_version`.
- Persist `building_type_id,level,anchor_q,anchor_r,orientation,job_state` and per-tile footprint rows. A multi-hex structure should not encode all occupancy solely as JSON.
- Wall `edge_key` built from sorted axial endpoints; gate is variant/type on the same edge row or a joined one-to-one row, not two competing segments.
- Server obtains world from authentication. Clients generally use `/api/world/me/...`, not arbitrary `world_id` access for personal mutations.

## Security response conventions

- All errors are JSON `{"error":{"code":"...","message":"...","details":{}}}` with appropriate HTTP status.
- 400/422 invalid payload, 401 unauthenticated, 403 forbidden, 404 inaccessible or missing, 409 concurrency/occupied, 429 rate limit.
- Mutations accept `Idempotency-Key` header for non-repeatable actions. Return resource versions/current balances on success.
- Use transaction and row locks/advisory patterns where backend supports them; avoid non-atomic check-then-insert. DB unique constraints must be final defense.

## Contract examples

### Build house

```http
POST /api/world/me/buildings
Idempotency-Key: bld-uuid-001
Content-Type: application/json

{"buildingType":"residential_house","anchor":{"q":1,"r":-2},"orientation":2}
```

```json
{"building":{"id":"b-101","type":"residential_house","level":1,"anchor":{"q":1,"r":-2},"orientation":2,"status":"CONSTRUCTING"},"jobId":"job-b101","resourceBalanceVersion":42}
```

Server recomputes footprint, cost, hex ownership, slope/obstacles; client cannot send `cost` or `level=3` to bypass progression.

### Upgrade building

```http
POST /api/world/me/buildings/b-101/upgrade
Idempotency-Key: up-uuid-001

{}
```

Return job and `nextLevel`; keep `building.id` same when complete.

### Place wall/gate

```http
POST /api/world/me/walls
Idempotency-Key: wall-uuid-001

{"edges":[{"q":0,"r":1,"direction":0},{"q":1,"r":1,"direction":1}],"type":"WOOD_WALL"}
```

Backend normalizes to canonical keys, validates each edge, resource totals and transaction atomicity. To replace wall with gate:

```http
POST /api/world/me/walls/{segmentId}/convert-to-gate
```

### Create patrol

```http
POST /api/world/me/patrol-routes
Idempotency-Key: patrol-uuid-001

{"name":"Bắc Thành","mode":"LOOP","waypoints":[{"q":3,"r":2},{"q":4,"r":2},{"q":4,"r":1}],"shift":{"start":"06:00","end":"18:00"},"unitIds":[101,102]}
```

Server checks unit ownership and availability and path graph against gate/wall edges.

### Scan, recon and claim

```http
POST /api/world/me/scans
Idempotency-Key: scan-uuid

{"center":{"q":5,"r":-2},"mode":"DIRECTIONAL"}
```

```http
POST /api/world/me/recon
{"sectorId":"sector-08","squadId":"scout-2"}
```

```http
POST /api/world/me/claims
Idempotency-Key: claim-uuid

{"sectorId":"sector-08","tileKeys":["4:-1","5:-1","5:-2"],"outpostId":"out-3"}
```

### Battle

```http
POST /api/battles
Idempotency-Key: battle-create-uuid

{"missionCode":"FORT_BROKEN_BRICK","squadId":"squad-12","supplyProfile":"STANDARD"}
```

```http
POST /api/battles/{battleId}/actions
Idempotency-Key: action-uuid

{"actorUnitId":"unit-5","turnVersion":7,"action":"MOVE","targetHex":{"q":2,"r":-1}}
```

Client never sends HP, damage, battle victory or reward amounts as authoritative values.

## API groups by stage

| Stage | API group |
|---|---|
| 01 | `/api/auth/*`, `/api/world/me`, `/api/world/me/resources` |
| 02 | `/api/world/me/chunks`, `/api/world/me/tiles` |
| 03 | `/api/buildings/catalog`, `/api/world/me/buildings/*`, `/api/world/me/walls/*` |
| 04 | `/api/world/me/farms/*`, `/api/world/me/irrigation/*` |
| 05 | `/api/world/me/livestock/*`, `/api/world/me/animals/*` |
| 06 | `/api/world/me/water-bodies/*`, `/api/world/me/fish/*` |
| 07 | `/api/world/me/survivors/*`, `/api/world/me/jobs/*`, `/api/world/me/production/*` |
| 08 | `/api/world/me/units/*`, `/api/world/me/training/*`, `/api/world/me/patrol-routes/*` |
| 09 | `/api/world/me/mounts/*`, `/api/world/me/animal-training/*` |
| 10 | `/api/world/me/scans`, `/api/world/me/recon`, `/api/world/me/claims`, `/api/world/me/sectors/*` |
| 11 | `/api/missions/*`, `/api/battles/*`, `/api/world/me/quest-progress` |
| 12 | `/api/friends/*`, `/api/guilds/*`, `/api/pvp/*`, `/api/frontier/*` |

## Migration / transaction requirements

1. All tables via forward-only numbered migrations with rollback strategy and pre-deploy backups.
2. For repeat-click build/harvest/claim, idempotency ledger plus transaction.
3. Index keys used by world-scoped queries and scheduling: `world_id`, `status`, `due_at`, `(world_id,q,r)`, `(world_id,edge_key)`, `(battle_id,seq)`.
4. No `sequelize.sync({force:true})` in normal operation. Test DB and seeded fixtures separate from production.
5. Define timezones in UTC and display local time only at client; job finish computed by server clock.


---

<!-- SOURCE: docs/12_BALANCE_QA_SECURITY.md -->

# 12 — Balance knobs, QA, performance và security gates

## Configurable starter values (đề xuất để playtest)

| Parameter | Starter default | Ghi chú |
|---|---:|---|
| World size | 1000×1000 m | Fixed product contract |
| Starter area | ~10,000m²/~115 hex | Shape approximate |
| Hex center spacing | 10m | Fixed geometry baseline |
| Occupied/neutral/claimed | 90/9/1 % | Approx area, sector-driven |
| House population cap Lv1/Lv2/Lv3 | 4/6/10 | Proposed |
| Basic wall HP 1/2/3 | 100/260/550 | PvE simulation starter |
| Barracks training slots 1/2/3 | 2/4/6 | Proposed |
| Horse farm capacity 1/2/3 | 4/8/12 | Proposed |
| Elephant camp capacity 1/2/3 | 2/4/6 | Proposed |
| Tactical squad size | 3–5 | MVP target |
| Farm plot minimum | 6 hex | Fixed baseline |
| Farm expansion block minimum | 6 hex | Fixed baseline |
| Max render goal | 60fps typical / 30fps low | Must profile; not guarantee |

Config should be in shared JSON/DB seed by balance version. Never freeze costs/times inside UI components.

## Balance framework

- Resource economy: every generator has sinks, capacity, energy/worker/water/food constraints and overflow behavior.
- Military economy: maintenance/food/training/equipment prevent all citizens being recruited without consequences.
- PvP fairness: matchmaking, normalized map objectives and bounded buffs; cosmetics as primary competitive rewards.
- Land: sector rewards tuned to construction needs; no mandatory raid per hex; claim material/time increase gradually, clear signals before commitment.
- Offline: warnings/debuffs before severe penalties; no loss of claimed world, animals or homes while away due to random PvP.

## Testing pyramid

**Unit:** hex math/canonical edge, footprint rotations, state machines, production formula, battle AP/path/LOS/turn, quest progress, resource deltas, idempotency keys.

**Integration:** build and upgrade transactions; multiple concurrent claims; scan hidden permissions; gate edge uniqueness; training graduation; patrol assignment conflict; harvest twice; reward claim once; trade/guild treasury ACL.

**E2E:** register → world generated → house built/upgraded → six-hex farm → livestock → pond → assign citizens → train four classes → patrol through gate → scan/recon → battle win → claim sector → save/reload → social mode.

**Visual:** comparison screenshots at fixed camera/seed; chibi proportions, assets appear correct, terrain/pond/wall seams, NPC/animal weapons/no clipping, level changes.

**Performance:** sample scenes small/medium/large with defined object counts, FPS, p95 frame time, CPU/GPU memory, draw calls, initial load, API p95, chunk load time, DB queries. Record machine specs and scene seed.

## High-risk bugs to test

- Two requests attempt same hex/build footprint at the same time.
- Two wall requests refer to same edge in opposite directions.
- Upgrading multi-hex farm unexpectedly loses tile ownership.
- Claim on territory not liberated; client reveals unscanned intel.
- Gate closes while NPC/soldier is on route; never teleport through wall.
- Unit used for patrol and battle concurrently.
- Asset GLB failed → fallback shows `ASSET_MISSING`, not invisible scene.
- Offline simulation repeated on reconnect → double resources.
- Battle reward duplicate after refresh/reconnect.
- Guild season reset accidentally mutates private-world tables.

## Security

- Zod request validation, authorization and world ownership derived from session.
- Rate limit scanning/claiming/battle, prevent ID enumeration, sanitized chat/log output.
- SQL via Sequelize parameterization; never interpolate user inputs into raw queries.
- Cookies secure/HttpOnly and CSRF strategy where relevant; no secrets in frontend.
- Reward/resource ledgers + idempotency; server calculates costs and results.
- Per-guild RBAC and treasury permissions; websocket room ACL and sequence validation.
- Player-uploaded images/asset mods not in MVP; if later added, validate content and size.

## Stage acceptance report

Use `templates/STAGE_COMPLETION_REPORT.md`. If a required visual/model is still placeholder, mark `PARTIAL — ASSET_MISSING`, not DONE. If integration DB isn't accessible, mark `BLOCKED — ENVIRONMENT`, still ship code/tests and document exact reproducible commands.


---

<!-- SOURCE: docs/13_ROADMAP.md -->

# 13 — Kế hoạch phát triển 12 giai đoạn, phụ thuộc và mốc sản phẩm

> Mỗi stage có prompt độc lập trong `prompts/STAGE_XX.md`. Trình tự ưu tiên **xây dựng/chibi village trước**, sau đó chiến tranh, PvP. Một số hệ thống hậu cần/sector có stubs được triển khai dần; không dùng nút giả.

| Stage | Tên | Gameplay slice kết thúc | Dependencies |
|---|---|---|---|
| **01** | Foundation & Private World | Auth, world riêng, seed, starter tiles, MySQL | — |
| **02** | 3D Chibi Hex Terrain | Camera, chunk, picking, biome, water, visible world | 01 |
| **03** | Building & Walls | Nhà dân 3 cấp, footprints, wall edge/gate/tower, road basic | 01–02 |
| **04** | Farming & Irrigation | Vẽ 6 hex, gieo, sinh trưởng, thu hoạch, kênh nước | 01–03 |
| **05** | Livestock & Animal AI | Gà/lợn/bò, feeding, animation, farm tiers | 03–04 |
| **06** | Pond & Aquaculture | Terrain đào ao, 6 hex, cá, bờ kè, tiers, harvest | 02–05 |
| **07** | Citizens & Economy | Nhà, nghề, việc, production, kho, chibi NPC routines | 03–06 |
| **08** | Military & Patrol | 4 binh chủng, tập luyện, ca tuần tra, gác gate/tower | 03 + 07 |
| **09** | Horse & Elephant | Ngựa 9, voi 12, chăm sóc, mount/supply integration | 05 + 08 |
| **10** | Scan, Sectors & Reclamation | Fog, 1/9/90, scan/recon, claim, sector ownership, outpost | 02 + 07–09 |
| **11** | Dungeon/PvE Battle | Hex turn-based, objectives, boss, battle → sector liberated | 08 + 10 |
| **12** | PvP, Guilds & Polish | Social, shared frontier, 1v1 optional, performance/security | 11 |

### Ghi chú quan trọng về thứ tự

- Stage 10 diễn ra **sau** khi trại ngựa/voi được triển khai theo kế hoạch thiết kế vì ưu tiên xây dựng. Trước đó, các công trình lớn được test bằng **development seed có đất hợp lệ**. Trên production không mở khóa đất miễn phí.
- Stage 08 có lính tuần tra dù hệ thống nhiệm vụ chiến đấu (stage 11) chưa có; lính sẽ đi tuần, đứng gác và báo động, chiến đấu thật để sau.
- Stage 03 có tường, cổng, watchtower; cấp 2/3 có thể khóa theo truyện nhưng phải có cấu hình/art/data từ đầu.
- Stage 10 định nghĩa liberation→claim lifecycle và cung cấp dev/test fixtures; Stage 11 lắp battle engine thực để giải phóng hostile sectors. Không cho players nhận hostile land từ giả thắng trận trong production.
- Stage 12 phải hoàn thiện coop/guild war theo mức engine hỗ trợ thực tế, không hứa MMO RTS scale nếu chỉ có turn-based engine.

## Mốc sản phẩm

**P0 Builder Prototype (01–03):** xây nhà, lên 3 cấp, đặt tường/cổng, avatar và world persistent.

**Building Alpha (04–06):** ruộng 6 hex, vật nuôi, ao cá sinh trưởng, xuất sản lượng thật.

**Living Village Alpha (07–09):** cư dân, kinh tế, 4 lính, tuần tra, ngựa/voi.

**Survival/Reclamation Beta (10–11):** radar, sector hostile, trinh sát, battle instance, giải phóng/claim; game có vòng lặp đầy đủ.

**Social/Multiplayer Beta (12):** PvP tự nguyện, guild, shared frontier, profiling/polish.

## Stretch backlog không chen vào stage 01–11

Hệ gia đình, giáo dục sâu, lễ hội, dynamic economy, đấu giá, advanced raids/2v2, wonders, climate, pets, biome genetic variants, guild guild-war full scale; xem `docs/14_FEATURE_BACKLOG.md`.


---

<!-- SOURCE: docs/14_FEATURE_BACKLOG.md -->

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


---

<!-- SOURCE: docs/15_ACCEPTANCE_MATRIX.md -->

# 15 — Ma trận nghiệm thu và Definition of Done

Mỗi stage phải kiểm thử tối thiểu các tình huống dưới đây; case không áp dụng ghi N/A, chưa test ghi NOT TESTED và lý do.

| Stage | Functional pass | Persist/API pass | Visual pass | Negative/concurrency case |
|---|---|---|---|---|
| 01 | Register→login→own world | MySQL users/worlds/tiles | Chibi app shell | 2 users isolation, repeated registration |
| 02 | Hover/pick correct hex | Chunk/seed persistence | Natural chibi terrain | Border/negative coords, no cracks |
| 03 | Build house 1hex lv1→2→3, place gate/wall | DB building/edge jobs | Three distinct models, no clipping | Duplicate tile/edge, batch atomicity |
| 04 | 6hex rice growing→harvest | Server timestamps + ledger | 4+ visible growth stages | Nonconnected zone, harvest twice |
| 05 | Animal farm feeding/production | Animal population persisted | Chibi idle/walk/eat | Escape fence, overcapacity |
| 06 | Dig 6hex pond→fish→harvest | Water and fish cycle persisted | Water/shoreline seams correct | Pond overlap, duplicate harvest |
| 07 | NPC homes/jobs/route/production | Assignments + offline calc | Work/carry/rest animations | Same worker double-job, gate blocked |
| 08 | Train 4 units, save route/shift | Training and patrol persisted | Four rigs/animations, guard at gate | Patrol+combat conflict, closed gate |
| 09 | Horse rider, elephant care | Mount exclusivity and health | Chibi horse/elephant/ride | Double-rider, outside farm bounds |
| 10 | Scan→recon→liberated?→claim | Tile control + sector jobs | Fog transition, POI visibility | Scan≠claim, occupied/no fight denied |
| 11 | Battle roundtrip updates quest | Action log + idempotent reward | Battle animations clear/readable | Move/AP exploit, disconnect/replay |
| 12 | Visitor/PvP/guild activity | Role/ACL/rating/season | Full UI/asset polish | Guild reset doesn't touch private |

### Gates of completion

- **Functional:** controls cause real behavior, state transitions correct.
- **Persistence:** API validated, DB migration/rollback strategy, reload accurate, transaction, ownership enforced.
- **Art:** proper chibi asset or explicit `PARTIAL — ASSET_MISSING` label, no fake final result.
- **Quality:** lint/typecheck/unit/integration/build, E2E where applicable, profiling when heavy 3D.
- **Documentation:** changed files, API contracts, migration list, tests/outcomes, remaining blockers.

### End-to-end smoke scenario

Create account → world 1% land → house lvl1→lvl3 → 6hex rice + irrigation → gà/trại + fish pond → assign 5 NPC → wall/gate/watchtower → train four troop types → draw loop patrol through gate → scan sector → recon → win story dungeon → mark liberated → build outpost/claim → reload persists → visit friend read-only → optional PvP; every mutation server authoritative.
