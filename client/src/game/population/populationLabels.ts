import {
  getBuildingDefinition,
  getFarmZoneDefinition,
  getLivestockFarmDefinition,
  getWaterBodyDefinition,
  isBuildingTypeCode,
  type BuildingTypeCode,
  type FarmZoneTypeCode,
  type LivestockFarmTypeCode,
  type WaterBodyTypeCode,
  type WorkplaceDTO,
} from '@cityverse/shared';

/** Display name of a workplace (field, livestock farm, pond or building). */
export function workplaceLabel(w: Pick<WorkplaceDTO, 'kind' | 'typeCode' | 'level'>): string {
  if (w.kind === 'farm_zone') return getFarmZoneDefinition(w.typeCode as FarmZoneTypeCode).name;
  if (w.kind === 'livestock_farm') return getLivestockFarmDefinition(w.typeCode as LivestockFarmTypeCode).name;
  if (w.kind === 'water_body') return getWaterBodyDefinition(w.typeCode as WaterBodyTypeCode).name;
  return isBuildingTypeCode(w.typeCode) ? getBuildingDefinition(w.typeCode as BuildingTypeCode).name : w.typeCode;
}
