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
