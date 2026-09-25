import type { Head, Project } from './project-types';
import { itemById } from './hunter-catalog';
import { coverageRuleFor } from './coverage-rules';
import { drawingOrMigrate } from './cad/engine';
import { figureAtPoint, irrigationFigures } from './irrigation-figures';
import { dist, projectOnSegment } from './geometry';
import { CURVE_TOLERANCE_M, GEOMETRY_EPS, intersectSurface, lineInSurface, sectorFaces, surfaceArea, type Surface } from './irrigation-geometry';

/** 2 mm numerical allowance, independent of radius and of display zoom. */
export const HEAD_TO_HEAD_TOLERANCE_M = CURVE_TOLERANCE_M;
export type DirectedReach = { distance:number; radius:number; deficit:number; reached:boolean; inSector:boolean };
export function directedReach(a:Head,b:Head,tolerance=HEAD_TO_HEAD_TOLERANCE_M):DirectedReach {
  const distance=dist(a,b),inSector=sectorFaces(a,b,tolerance);
  return {distance,radius:a.r,deficit:Math.max(0,distance-a.r),inSector,reached:inSector&&distance<=a.r+tolerance};
}

/** Contour neighbours plus a relative-neighbour graph, never a complete pair graph.
 * Visibility and zones do not change physical layout. Separate figures and holes do.
 */
export function significantHeadPairs(project:Project,target:Surface):[Head,Head][] {
  const figures=irrigationFigures(drawingOrMigrate(project));
  const heads=project.heads.filter(h=>{
    const item=itemById(h.catalogId);
    return item&&coverageRuleFor(item,h.nozzleId)==='HEAD_TO_HEAD'&&[h.x,h.y,h.r,h.arc,h.start].every(Number.isFinite)&&h.r>0&&h.arc>0&&h.arc<=360;
  });
  const owners=new Map(heads.map(h=>[h.id,figureAtPoint(h,figures)?.id]));
  const contourPairs=new Set<string>();
  const key=(a:Head,b:Head)=>[a.id,b.id].sort().join('\0');
  for(const f of figures) for(const ring of [f.points,...f.holes]) ring.forEach((p,i)=>{
    const q=ring[(i+1)%ring.length]!;
    const onSide=heads.filter(h=>owners.get(h.id)===f.id).map(h=>({h,p:projectOnSegment(h,p,q)})).filter(v=>dist(v.h,v.p.pt)<1e-5).sort((a,b)=>a.p.t-b.p.t);
    for(let j=1;j<onSide.length;j++)contourPairs.add(key(onSide[j-1]!.h,onSide[j]!.h));
  });
  const pairs:[Head,Head][]=[];
  for(let i=0;i<heads.length;i++)for(let j=i+1;j<heads.length;j++){
    const a=heads[i]!,b=heads[j]!,owner=owners.get(a.id),distance=dist(a,b);
    if(!owner||owner!==owners.get(b.id)||distance<=GEOMETRY_EPS||!lineInSurface(a,b,target))continue;
    if(!contourPairs.has(key(a,b))&&heads.some(c=>c!==a&&c!==b&&owners.get(c.id)===owner&&Math.max(dist(a,c),dist(b,c))<distance-GEOMETRY_EPS&&lineInSurface(a,c,target)&&lineInSurface(b,c,target)))continue;
    pairs.push([a,b]);
  }
  return pairs;
}

/** Conservative evidence: real dry geometry intersecting the directed centre link.
 * The numerical-width corridor is not an irrigation radius or an agronomic threshold.
 * Dry areas elsewhere are independent issues, never proof that this pair caused them.
 */
export function dryOnHeadLink(a:Head,b:Head,dry:Surface):Surface {
  const length=dist(a,b);if(length<=GEOMETRY_EPS)return [];
  const width=HEAD_TO_HEAD_TOLERANCE_M*2,nx=-(b.y-a.y)/length*width,ny=(b.x-a.x)/length*width;
  const link:Surface=[[[[a.x+nx,a.y+ny],[b.x+nx,b.y+ny],[b.x-nx,b.y-ny],[a.x-nx,a.y-ny]]]];
  const result=intersectSurface(dry,link);
  return surfaceArea(result)>HEAD_TO_HEAD_TOLERANCE_M**2?result:[];
}
