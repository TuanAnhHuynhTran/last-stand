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
