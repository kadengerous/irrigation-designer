import {operatingGeometryAvailable} from "./flow";
import type { Project, Head } from "./project-types";
import { cleanSurface, headSurface, intersectSurface, irrigationSurfaces, pointInSurface, subtractSurface, unionSurfaces, type Surface } from "./irrigation-geometry";
import { drawingOrMigrate } from './cad/engine';
import { irrigationFigures, figureAtPoint, type IrrigationFigure } from './irrigation-figures';
import { catalogForHead,  itemById, supportsArc } from './equipment-catalog';

export const COVERAGE_HATCHES = [
  { id: "dry", key: "diagMapDry", color: "#ff202b" },
  { id: "outside", key: "diagMapOutside", color: "#ba24ff" },
  { id: "single", key: "diagMapSingle", color: "#39e522" },
] as const;
// Keep multiplicity available to engineering checks, but do not paint normal overlap.
export type CoverageBands = Record<"dry" | "outside" | "single" | "double" | "triple", Surface>;
type CoverageCounts = { wet: Surface; double: Surface; triple: Surface };

function countCoverage(footprints: Surface[], seed: CoverageCounts = {wet:[],double:[],triple:[]}): CoverageCounts {
  let {wet,double,triple} = seed;
  for (const footprint of footprints) {
    triple = unionSurfaces([triple,intersectSurface(double,footprint)]);
    double = unionSurfaces([double, intersectSurface(wet, footprint)]);
    wet = unionSurfaces([wet, footprint]);
  }
  return {wet,double,triple};
}
function classifyCoverage(target: Surface, {wet,double,triple}: CoverageCounts): CoverageBands {
  return {
    dry: cleanSurface(subtractSurface(target, wet)),
    outside: cleanSurface(subtractSurface(wet, target)),
    single: cleanSurface(subtractSurface(intersectSurface(wet, target), double)),
    double: cleanSurface(subtractSurface(intersectSurface(double,target),triple)),
    triple: cleanSurface(intersectSurface(triple,target)),
  };
}

/** Geometric coverage counts, not a precipitation or hydraulic error threshold. */
export function partitionCoverage(target: Surface, footprints: Surface[]): CoverageBands {
  return classifyCoverage(target,countCoverage(footprints));
}

const footprints = new WeakMap<Head, Surface>();
const bands = new WeakMap<Project, CoverageBands | null>();
const figureSurface = (figure: IrrigationFigure): Surface => [[figure.points.map(p => [p.x,p.y]), ...figure.holes.map(hole => hole.map(p => [p.x,p.y] as [number,number]))]];

/** Local point watering must not disable the geometric sprinkler map elsewhere. */
function uncertainSurface(head: Head, project: Project, figures: IrrigationFigure[], target: Surface, excluded:Surface): Surface {
  const item = catalogForHead(head);
  if (item && ((supportsArc(item,head.arc) && operatingGeometryAvailable(item,head)) || head.arc===0 || head.r===0) && item.coverageKind !== 'point' && item.coverageKind !== 'streams' && !item.strip &&
      [head.x,head.y,head.r,head.arc,head.start].every(Number.isFinite) &&
      head.r >= 0 && head.arc >= 0 && head.arc <= 360) return []; // Zero radius/sector really covers nothing.
  // Turning off one area's irrigation cannot suppress classification on other figures.
  if(pointInSurface(head,excluded))return [];
  const figure = figureAtPoint(head, figures) ?? figures.find(f => f.id === (head.figureId ?? project.zones.find(z => z.id === head.zone)?.figureId));
  if(figure)return intersectSurface(figureSurface(figure),target);
  if(item?.coverageKind==='point')return [];
  // Missing distribution data stays uncertain only on the containing target component.
  return target.filter(component=>pointInSurface(head,[component]));
}
function footprint(head:Head):Surface {
  if(!footprints.has(head))footprints.set(head,headSurface(head));
  return footprints.get(head)!;
}
function outsideSurface(head:Head,surface:Surface,figures:IrrigationFigure[],target:Surface):Surface {
  const figure=figureAtPoint(head,figures);
  return subtractSurface(surface,figure ? intersectSurface(figureSurface(figure),target) : target);
}
function prepareCoverage(project:Project, movingId?:string) {
  const {target,excluded}=irrigationSurfaces(project);
  const figures=irrigationFigures(drawingOrMigrate(project));
  const heads=project.heads.filter(head=>head.id!==movingId);
  const surfaces=heads.map(footprint);
  return {target,excluded,figures,counts:countCoverage(surfaces),
    uncertain:unionSurfaces(heads.flatMap((head,i)=>surfaces[i].length?[]:[uncertainSurface(head,project,figures,target,excluded)])),
    outside:unionSurfaces(heads.map((head,i)=>outsideSurface(head,surfaces[i],figures,target)))};
}
// A drag changes only one head. Reuse the stationary heads' exact geometry;
// discard it automatically when the immutable base project changes.
const dragCoverage = new WeakMap<Project,{id:string;prepared:ReturnType<typeof prepareCoverage>}>();
function calculateCoverage(project:Project, base?:Project, movingId?:string):CoverageBands|null {
  const moving=movingId && project.heads.find(head=>head.id===movingId);
  const incremental=!!(base && moving && base.drawing===project.drawing && base.polygons===project.polygons &&
    base.zones===project.zones && base.heads.length===project.heads.length &&
    project.heads.every((head,i)=>head.id===movingId || head===base.heads[i]));
  let prepared:ReturnType<typeof prepareCoverage>;
  if(incremental && base && moving) {
    let cached=dragCoverage.get(base);
    if(cached?.id!==moving.id){cached={id:moving.id,prepared:prepareCoverage(base,moving.id)};dragCoverage.set(base,cached);}
    prepared=cached.prepared;
  } else prepared=prepareCoverage(project);
  const {target,excluded,figures}=prepared;
  if(!target.length)return null;
  let {counts,uncertain,outside}=prepared;
  if(incremental && moving) {
    const surface=footprint(moving);
    counts=countCoverage([surface],counts);
    if(!surface.length)uncertain=unionSurfaces([uncertain,uncertainSurface(moving,project,figures,target,excluded)]);
    outside=unionSurfaces([outside,outsideSurface(moving,surface,figures,target)]);
  }
  const calculated=classifyCoverage(subtractSurface(target,uncertain),counts);
  calculated.outside=cleanSurface(subtractSurface(outside,excluded));
  return calculated;
}
export function diagnosticCoverage(project: Project, base?:Project, movingId?:string): CoverageBands | null {
  if (bands.has(project)) return bands.get(project)!;
  let result: CoverageBands | null = null;
  try {
    result=calculateCoverage(project,base,movingId);
  } catch {
    // Near-coincident boundaries can be sensitive to operation order. Retain
    // the normal calculation as a fallback, and never throw into the renderer.
    if(base)try {result=calculateCoverage(project);}catch { /* Unavailable geometry. */ }
  }
  bands.set(project, result);
  return result;
}
