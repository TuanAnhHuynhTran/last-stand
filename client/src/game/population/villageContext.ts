/**
 * Builds the VillageContext (navigation + places) from what the engine already knows: buildings,
 * fields, livestock farms, ponds and the population state (homes / workplaces).
 */
import type { AxialCoord, FarmZoneDTO, LivestockFarmDTO, PopulationStateDTO, WaterBodyDTO, WorldBuildingDTO, WorldGenerator } from '@cityverse/shared';
import type { VillageContext } from './VillagerBrain';
import { VillageNav } from './villageNav';

export interface VillageSources {
  world: WorldGenerator;
  buildings: readonly WorldBuildingDTO[];
  farms: readonly FarmZoneDTO[];
  ranches: readonly LivestockFarmDTO[];
  ponds: readonly WaterBodyDTO[];
  population: PopulationStateDTO | null;
}

export function buildVillageContext(src: VillageSources): VillageContext {
  const nav = new VillageNav({
    world: src.world,
    buildings: src.buildings,
    fields: src.farms.map((f) => f.hexes),
    ranches: src.ranches.map((r) => r.hexes),
    ponds: src.ponds.map((p) => p.hexes),
  });
  const homes = new Map<string, readonly AxialCoord[]>();
  const workplaces: VillageContext['workplaces'] = new Map();
  for (const h of src.population?.houses ?? []) homes.set(h.buildingId, h.hexes);
  for (const w of src.population?.workplaces ?? []) workplaces.set(`${w.kind}:${w.id}`, { kind: w.kind, typeCode: w.typeCode, hexes: w.hexes });
  const done = src.buildings.filter((b) => b.status !== 'constructing');
  const of = (codes: string[]) => done.filter((b) => codes.includes(b.typeCode)).map((b) => b.footprint);
  const center = done.find((b) => b.typeCode === 'territory_center');
  return {
    nav,
    homes,
    workplaces,
    haulFrom: of(['carpentry', 'quarry', 'smithy', 'well']),
    haulTo: of(['storage', 'market']),
    gathering: of(['territory_center', 'market', 'well']),
    fallback: center?.footprint[0] ?? { q: src.world.spawn.q, r: src.world.spawn.r },
  };
}
