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
