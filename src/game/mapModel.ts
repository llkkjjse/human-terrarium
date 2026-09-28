import type { DistrictId, WorldState } from '../sim/types';

export interface BuildingModel {
  id: string;
  districtId: DistrictId;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'home' | 'shop' | 'office' | 'clinic' | 'pavilion' | 'tree' | 'utility' | 'warehouse';
}

export function buildMapModel(world: WorldState) {
  const kinds: Record<DistrictId, BuildingModel['kind'][]> = {
    residential: ['home', 'home', 'home', 'home', 'home', 'shop'],
    commerce: ['office', 'shop', 'office', 'clinic', 'shop', 'office'],
    commons: ['tree', 'pavilion', 'tree', 'tree', 'pavilion', 'tree'],
    municipal: ['utility', 'warehouse', 'utility', 'warehouse', 'utility', 'warehouse'],
  };
  const buildings = world.districts.flatMap((district) => kinds[district.id].map((kind, index) => ({
    id: `${district.id}-${index}`,
    districtId: district.id,
    x: district.x + 105 + (index % 3) * 210,
    y: district.y + 105 + Math.floor(index / 3) * 220,
    width: kind === 'tree' ? 54 : kind === 'pavilion' ? 120 : 128,
    height: kind === 'tree' ? 66 : kind === 'pavilion' ? 72 : 92,
    kind,
  })));
  return {
    districts: world.districts.map((district) => ({ ...district })),
    buildings,
    residents: world.residents.map(({ id, name, x, y, color, activity, alive }) => ({ id, name, x, y, color, activity, alive })),
  };
}

