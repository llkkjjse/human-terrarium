import type { DistrictId, SocialClass, WorldState, WorldStateV2 } from '../sim/types';

export interface BuildingModel {
  id: string;
  districtId: DistrictId;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'home' | 'shop' | 'office' | 'clinic' | 'pavilion' | 'tree' | 'utility' | 'warehouse';
}

export type RenderableWorld = WorldState | WorldStateV2;

export interface ResidentMapModel {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  activity: WorldState['residents'][number]['activity'];
  alive: boolean;
  visibleClass: SocialClass | null;
  visibleWealth: number;
  hasVisibleHome: boolean;
  hasVisibleVehicle: boolean;
  lowProfile: number;
  statusCue: string;
}

export function buildMapModel(world: RenderableWorld) {
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
    residents: world.residents.map((resident): ResidentMapModel => {
      if (world.schemaVersion !== 2) {
        return {
          id: resident.id,
          name: resident.name,
          x: resident.x,
          y: resident.y,
          color: resident.color,
          activity: resident.activity,
          alive: resident.alive,
          visibleClass: null,
          visibleWealth: 0,
          hasVisibleHome: false,
          hasVisibleVehicle: false,
          lowProfile: 0,
          statusCue: '',
        };
      }
      const residentV2 = world.residents.find((item) => item.id === resident.id)!;
      const visibleAssets = world.assets.filter((asset) => asset.ownerId === resident.id && asset.visibleValue > 0);
      const hasVisibleHome = visibleAssets.some((asset) => asset.kind === 'home');
      const hasVisibleVehicle = visibleAssets.some((asset) => asset.kind === 'vehicle');
      const status = [
        hasVisibleHome ? 'H' : '',
        hasVisibleVehicle ? 'V' : '',
        residentV2.healthConditions.length ? '+' : '',
        residentV2.legalStatus !== 'clear' ? '!' : '',
      ].filter(Boolean).join('');
      return {
        id: residentV2.id,
        name: residentV2.name,
        x: residentV2.x,
        y: residentV2.y,
        color: residentV2.color,
        activity: residentV2.activity,
        alive: residentV2.alive,
        visibleClass: residentV2.perceivedClass,
        visibleWealth: visibleAssets.reduce((sum, asset) => sum + asset.visibleValue, 0),
        hasVisibleHome,
        hasVisibleVehicle,
        lowProfile: residentV2.appearance.lowProfile,
        statusCue: status,
      };
    }),
  };
}

