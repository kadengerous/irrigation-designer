import artworkBounds from "./plant-art-bounds.json";
import extraPlants from '@/data/decorative-plants-extra.json';
import type { CadDrawing, CadPlant, CadLayerId } from './cad/types';
import type { PlantCategory, PlantRecord } from './landscape-types';

const LEGACY_PLANT_VISUALS = {
  tree: ['tree-rounded','tree-spreading','tree-airy','tree-oval','tree-natural','tree-conifer','tree-burgundy','tree-silver'],
  shrub: ['shrub-green','shrub-lime','shrub-dark','shrub-variegated','shrub-burgundy','shrub-white','shrub-pink','shrub-red','shrub-lilac','shrub-golden'],
  flower: ['flower-white','flower-yellow','flower-red','flower-pink','flower-lilac','flower-purple','flower-blue','flower-mixed'],
  grass: ['grass-green','grass-lime','grass-blue','grass-golden','grass-variegated','grass-plume'],
} as const;
const extras=extraPlants as {id:string;category:PlantCategory;defaultDiameterM:number}[];
export const PLANT_VISUALS=Object.fromEntries(Object.entries(LEGACY_PLANT_VISUALS).map(([kind,ids])=>[kind,[...ids,...extras.filter(p=>p.category===kind).map(p=>p.id)]])) as Record<PlantCategory,string[]>;
const allVisuals = new Set<string>(Object.values(PLANT_VISUALS).flat());
export const isPlantVisual = (id: string | undefined): id is string => !!id && allVisuals.has(id);
export const DECORATIVE_PLANTS: PlantRecord[] = Object.entries(PLANT_VISUALS).flatMap(([kind, ids]) => ids.map(visualId => ({
  id: `decorative-${visualId}`, visualId, decorative: true, category: kind as PlantCategory,
  defaultDiameterM: extras.find(p=>p.id===visualId)?.defaultDiameterM??{tree: 4, shrub: 1.5, flower: .6, grass: 1}[kind],
  russianName: null, latinName: '', cultivar: null, aliases: [], photos: [],
  matureHeightM: null, matureWidthM: null, light: null, soil: null, moisture: null, hardiness: null, description: null,
  water: {need: null, sourceUrl: null, context: null, quantity: null, method: null, wettingZone: null, recommendations: null},
  symbol: kind === 'tree' ? (visualId.includes('conifer') || visualId.includes('silver') ? 'conifer' : 'deciduous') : kind as 'shrub'|'flower'|'grass',
  sources: [],
})));

/** Existing botanical records retain their identity; their illustration is representative. */
export function plantVisualId(plant: Pick<CadPlant, 'kind'|'catalog'>): string {
  if (isPlantVisual(plant.catalog?.visualId)) return plant.catalog.visualId;
  if (plant.catalog?.symbol === 'conifer') return 'tree-conifer';
  // Appending decorative choices must not change older botanical illustrations.
  const ids = LEGACY_PLANT_VISUALS[plant.kind] ?? LEGACY_PLANT_VISUALS.tree;
  const hash = Array.from(plant.catalog?.id ?? '').reduce((n,c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  return ids[hash % ids.length]!;
}
export const plantImageSrc = (plant: Pick<CadPlant, 'kind'|'catalog'>) => `/plants/${plantVisualId(plant)}.webp`;
export const plantLayerId = (kind: PlantCategory): CadLayerId => ({tree:'trees',shrub:'shrubs',flower:'flowers',grass:'grasses'} as const)[kind];
export const plantLayerVisible = (d: CadDrawing, kind: PlantCategory, instance?:{hidden?:boolean}) => !instance?.hidden && d.layers?.plants?.visible !== false && d.layers?.[plantLayerId(kind)]?.visible !== false;
export const plantLayerLocked = (d: CadDrawing, kind: PlantCategory) => !!(d.layers?.plants?.locked || d.layers?.[plantLayerId(kind)]?.locked);

/** Drag operations use a single scalar, preserving aspect ratio and centre. */
export const resizedPlantRadius = (radius: number, dx: number, dy: number, px: number) => Math.max(.025, Math.min(50, Math.hypot(radius + dx / px, dy / px)));
export const normalizedPlantRotation = (degrees: number) => (degrees % 360 + 360) % 360;

/** Fit the alpha silhouette proportionally; image margins are not crown diameter. */
export function plantArtworkBox(plant: Pick<CadPlant,'kind'|'catalog'>, diameter: number) {
  const crop=(artworkBounds as Record<string,{x:number;y:number;width:number;height:number;imageWidth:number;imageHeight:number}>)[plantVisualId(plant)] ?? {x:0,y:0,width:1254,height:1254,imageWidth:1254,imageHeight:1254};
  const scale=diameter/Math.max(crop.width,crop.height);
  return {width:crop.width*scale,height:crop.height*scale,crop};
}
