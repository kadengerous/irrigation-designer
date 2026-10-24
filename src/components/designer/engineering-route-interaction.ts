import type {Pt} from '@/lib/geometry';
import {projectToSegment} from '@/lib/engineering-connections';

const EPS=1e-7;
const finite=(point:Pt)=>Number.isFinite(point.x)&&Number.isFinite(point.y);
const distance=(a:Pt,b:Pt)=>Math.hypot(a.x-b.x,a.y-b.y);

/** Split the nearest saved segment at its exact projection, preserving the
 * existing route. Consumer branches are deliberately not editable segments. */
export function routeNodeInsertion(points:readonly Pt[],point:Pt):{index:number;point:Pt}|null {
 if(points.length<2||!finite(point)||points.some(p=>!finite(p)))return null;
 let best:{index:number;point:Pt;distance:number}|undefined;
 for(let i=1;i<points.length;i++){
  if(distance(points[i-1]!,points[i]!)<=EPS)continue;
  const candidate=projectToSegment(point,points[i-1],points[i]);
  if(finite(candidate.point)&&Number.isFinite(candidate.distance)&&(!best||candidate.distance<best.distance))best={index:i,...candidate};
 }
 if(!best||points.some(p=>distance(p,best!.point)<=EPS))return null;
 return {index:best.index,point:{...best.point}};
}

/** Straighten an interior node only when the raw pointer is visibly close to
 * the chord between its saved neighbours. The screen-space tolerance applies
 * at every angle and zoom; endpoints and line extensions never collapse a node.
 * Call before general grid/object snapping, then use that fallback on a miss. */
export function snapRouteNodeToNeighbors(points:readonly Pt[],index:number,point:Pt,pxPerMeter:number,enabled:boolean,tolerancePx=10):{point:Pt;hit:boolean}{
 const miss=()=>({point:{...point},hit:false});
 if(!enabled||!Number.isInteger(index)||index<=0||index>=points.length-1||!finite(point)||!Number.isFinite(pxPerMeter)||pxPerMeter<=0||!Number.isFinite(tolerancePx)||tolerancePx<0)return miss();
 const a=points[index-1]!,b=points[index+1]!;
 if(!finite(a)||!finite(b)||!finite(points[index]!)||distance(a,b)<=EPS)return miss();
 const projection=projectToSegment(point,a,b);
 if(!finite(projection.point)||!Number.isFinite(projection.distance)||projection.t<=0||projection.t>=1||distance(projection.point,a)<=EPS||distance(projection.point,b)<=EPS||projection.distance*pxPerMeter>tolerancePx+1e-9)return miss();
 return {point:{...projection.point},hit:true};
}
