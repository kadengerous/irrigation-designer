import type { Project, Head } from "./project-types";
import { cleanSurface, headSurface, intersectSurface, irrigationSurfaces, subtractSurface, unionSurfaces, type Surface } from "./irrigation-geometry";
import { drawingOrMigrate } from './cad/engine';
import { irrigationFigures, figureAtPoint, type IrrigationFigure } from './irrigation-figures';
import { itemById } from './hunter-catalog';

export const COVERAGE_HATCHES = [
  { id: "dry", key: "diagMapDry", color: "#ff202b" },
  { id: "outside", key: "diagMapOutside", color: "#ba24ff" },
  { id: "single", key: "diagMapSingle", color: "#39e522" },
] as const;
// Keep multiplicity available to engineering checks, but do not paint normal overlap.
export type CoverageBands = Record<"dry" | "outside" | "single" | "double" | "triple", Surface>;

/** Geometric coverage counts, not a precipitation or hydraulic error threshold. */
export function partitionCoverage(target: Surface, footprints: Surface[]): CoverageBands {
  let wet: Surface = [], double: Surface = [], triple:Surface = [];
  for (const footprint of footprints) {
    triple = unionSurfaces([triple,intersectSurface(double,footprint)]);
    double = unionSurfaces([double, intersectSurface(wet, footprint)]);
    wet = unionSurfaces([wet, footprint]);
  }
  return {
    dry: cleanSurface(subtractSurface(target, wet)),
    outside: cleanSurface(subtractSurface(wet, target)),
    single: cleanSurface(subtractSurface(intersectSurface(wet, target), double)),
    double: cleanSurface(subtractSurface(intersectSurface(double,target),triple)),
    triple: cleanSurface(intersectSurface(triple,target)),
  };
}

const footprints = new WeakMap<Head, Surface>();
const bands = new WeakMap<Project, CoverageBands | null>();
const figureSurface = (figure: IrrigationFigure): Surface => [[figure.points.map(p => [p.x,p.y]), ...figure.holes.map(hole => hole.map(p => [p.x,p.y] as [number,number]))]];

/** Local point watering must not disable the geometric sprinkler map elsewhere. */
function uncertainSurface(head: Head, project: Project, figures: IrrigationFigure[], target: Surface): Surface {
  const item = itemById(head.catalogId);
  if (item && item.coverageKind !== 'point' && !item.strip &&
      [head.x,head.y,head.r,head.arc,head.start].every(Number.isFinite) &&
      head.r >= 0 && head.arc >= 0 && head.arc <= 360) return []; // Zero radius/sector really covers nothing.
  if (item?.coverageKind === 'point') {
    const figure = figureAtPoint(head, figures) ?? figures.find(f => f.id === (head.figureId ?? project.zones.find(z => z.id === head.zone)?.figureId));
    return figure ? intersectSurface(figureSurface(figure), target) : [];
  }
  // An unknown distribution cannot certify dry/single areas; known overspray remains useful.
  return target;
}
export function diagnosticCoverage(project: Project): CoverageBands | null {
  if (bands.has(project)) return bands.get(project)!;
  let result: CoverageBands | null = null;
  try {
    const target = irrigationSurfaces(project).target;
    const surfaces = project.heads.map(head => {
      if (!footprints.has(head)) footprints.set(head, headSurface(head));
      return footprints.get(head)!;
    });
    // CAD geometry and sprinkler radii already share project coordinates.
    // Calibration of an optional background image must not hide their map.
    if (target.length) {
      const figures=irrigationFigures(drawingOrMigrate(project));
      const uncertain = unionSurfaces(project.heads.flatMap((head,i) => surfaces[i]!.length ? [] : [uncertainSurface(head,project,figures,target)]));
      const classifiedTarget = subtractSurface(target, uncertain);
      const calculated = partitionCoverage(classifiedTarget, surfaces);
      calculated.outside=cleanSurface(unionSurfaces(project.heads.map((head,i)=>{
        const figure=figureAtPoint(head,figures);
        if(!figure)return subtractSurface(surfaces[i]!,target);
        const boundary=figureSurface(figure);
        return subtractSurface(surfaces[i]!,intersectSurface(boundary,target));
      })));
      result = calculated;
    }
  } catch { /* The existing diagnostic report explains unavailable geometry. */ }
  bands.set(project, result);
  return result;
}
