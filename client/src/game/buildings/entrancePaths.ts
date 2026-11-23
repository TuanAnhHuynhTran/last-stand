import { axialToWorld, getBuildingDefinition, PATH_WIDTH, type BuildingTypeCode } from '@cityverse/shared';
import { ModelBuilder, box } from './modelKit';

/** Door/front-access positions in the same local frame as the procedural models. */
export function entranceStart(code: BuildingTypeCode, level: number): { x: number; z: number } {
  switch (code) {
    case 'house': return { x: 0, z: level === 1 ? 1.5 : 1.55 };
    case 'territory_center': return { x: 0, z: 2.5 };
    case 'storage': return { x: 5, z: 1.95 };
    case 'clinic': return { x: 3.4, z: 1.9 };
    case 'carpentry': return { x: 3.5, z: 2 };
    case 'market': return { x: 5, z: axialToWorld(0, 1).z + 1.8 };
    case 'well': return { x: 0, z: 1.6 };
    case 'quarry': return { x: 0, z: 2 };
    case 'smithy': return { x: 0, z: 1.9 };
    case 'radar': return { x: 0, z: 2 };
    default: return { x: 0, z: 2.3 }; // military hall / tent entrance
  }
}

export function entranceGeometry(code: BuildingTypeCode, level: number) {
  const start = entranceStart(code, level);
  const centers = getBuildingDefinition(code).footprint.map(h => axialToWorld(h.q, h.r));
  const inside = (x: number, z: number) => centers.some(c =>
    Math.abs(x - c.x) <= 5.001 && Math.abs(x - c.x) / 2 + Math.abs(z - c.z) * Math.sqrt(3) / 2 <= 5.001);
  const b = new ModelBuilder();
  // Narrow, continuous apron to the outer plot boundary. Taper at pointed gates;
  // road end caps cover the tip without paving over the neighbouring plot.
  for (let z = start.z; z < start.z + 50; z += 0.2) {
    if (!inside(start.x, z + 0.2)) break;
    let width = PATH_WIDTH;
    while (width > 0.04 && ![-1, 1].every(s => [z, z + 0.2].every(t => inside(start.x + s * width / 2, t)))) width -= 0.04;
    b.add(box(Math.max(0.02, width), 0.06, 0.2), level === 1 ? '#c9a878' : '#d8d0c2', { x: start.x, y: 0.24, z: z + 0.1 });
  }
  return b.build();
}
