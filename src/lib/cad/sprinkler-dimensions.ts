import type { CadDim, CadDrawing } from './types';
import { figureAtPoint, irrigationFigures, onFigureBoundary, figureAxisIntersections, type IrrigationFigure } from '../irrigation-figures';
import { dist, projectOnSegment, shoelace, type Pt } from '../geometry';

type HeadPoint = Pt & {id:string};
// Drafting association only, never added to a watering radius.
const BOUNDARY_TOLERANCE=.10;
function straightSides(input:Pt[]) {
  const points=input.filter((p,i)=>i===0||dist(p,input[i-1]!)>1e-7);
  if(points.length>1&&dist(points[0]!,points[points.length-1]!)<1e-7)points.pop();
  return points.filter((p,i)=>{
    const a=points[(i+points.length-1)%points.length]!,b=points[(i+1)%points.length]!;
    return dist(p,projectOnSegment(p,a,b).pt)>1e-7;
  });
}
export function sprinklerDatum(point:Pt,figure:IrrigationFigure,axis:'x'|'y') {
  const crossings=figureAxisIntersections(point,figure,axis).filter(p=>Math.abs(p[axis]-point[axis])>1e-6);
  // Only the first real boundary on either side is a valid dimension datum.
  const candidates=[-1,1].flatMap(sign=>crossings.filter(p=>Math.sign(p[axis]-point[axis])===sign)
    .sort((a,b)=>Math.abs(a[axis]-point[axis])-Math.abs(b[axis]-point[axis])).slice(0,1));
  const perpendicular=(p:Pt)=>!figure.ellipse&&[figure.points,...figure.holes].some(ring=>ring.some((a,i)=>{
    const b=ring[(i+1)%ring.length]!;
    return dist(p,projectOnSegment(p,a,b).pt)<1e-6&&Math.abs(b[axis]-a[axis])<1e-7&&dist(a,b)>1e-6;
  }));
  return candidates.sort((a,b)=>Number(perpendicular(b))-Number(perpendicular(a))||
    Math.abs(a[axis]-point[axis])-Math.abs(b[axis]-point[axis])||a[axis]-b[axis])[0];
}
export function displayedDimensions(d:CadDrawing, mode=d.automaticDimensionMode ?? (d.irrigationDimensions?'irrigation':'plan')) {
  return Object.values(d.dims??{}).filter(dim=>{
    const key=dim.autoKey ?? (dim.id.startsWith('auto:')?dim.id.slice(5):'');
    if(!key)return true; // User dimensions are never hidden by the automatic mode.
    if(mode==='irrigation' && d.irrigationDimensions) return !key.startsWith('edge:')&&!key.startsWith('face:');
    return !key.startsWith('irrigation:')&&!key.startsWith('heads:');
  });
}
/** Derived CAD dimensions, never an all-pairs network. Manual dimensions are left untouched. */
export function resolveSprinklerDimensions(d: CadDrawing, heads: HeadPoint[], generate = false): Record<string,CadDim> {
  const setting=d.irrigationDimensions;
  if (!setting) return d.dims ?? {};
  const old=d.dims ?? {}, dims:Record<string,CadDim>={};
  const headById=new Map(heads.map(h=>[h.id,h]));
  for (const [id,dim] of Object.entries(old)) if (!(dim.autoKey??dim.id.replace(/^auto:/,'')).startsWith('irrigation:') && !(dim.autoKey??dim.id.replace(/^auto:/,'')).startsWith('heads:')) {
    const a=dim.aHeadId?headById.get(dim.aHeadId):dim.a,b=dim.bHeadId?headById.get(dim.bHeadId):dim.b;
    if(a&&b)dims[id]={...dim,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}};
  }
  const pairKey=(a:Pt,b:Pt)=>[`${a.x.toFixed(8)},${a.y.toFixed(8)}`,`${b.x.toFixed(8)},${b.y.toFixed(8)}`].sort().join('|');
  const pairs=new Set(displayedDimensions({...d,dims},'irrigation').map(dim=>pairKey(dim.aId?d.vertices[dim.aId]??dim.a:dim.a,dim.bId?d.vertices[dim.bId]??dim.b:dim.b)));
  const add=(key:string,a:Pt,b:Pt,offset:number)=>{
    if (dist(a,b)<1e-6 || pairs.has(pairKey(a,b))) return;
    const autoKey=`irrigation:${key}`, id=`auto:${autoKey}`;
    if(!generate && !old[id]) return; // Live editing updates existing dimensions only.
    if(setting.suppressed?.includes(autoKey) || d.suppressedAutoDimensions?.includes(autoKey)) return;
    const previous=old[id];
    dims[id]={id,autoKey,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},offset:previous && Math.abs(Math.abs(previous.offset)-Math.abs(setting.offset))>1e-7 ? previous.offset : offset,...(previous?.label!==undefined?{label:previous.label}:{})};
    pairs.add(pairKey(a,b));
  };
  const figures=irrigationFigures(d), grouped=new Map<string,HeadPoint[]>();
  const keys=Object.values(old).map(dim=>dim.autoKey??dim.id.replace(/^auto:/,''));
  // Exclude subsequently placed heads so they cannot split an existing chain.
  // For old files infer the participating IDs from the dimensions already saved.
  const participants=generate?heads:heads.filter(h=>setting.headIds
    ? setting.headIds.includes(h.id)
    : keys.some(key=>key.startsWith('irrigation:')&&(key.endsWith(`:${h.id}`)||key.includes(`:${h.id}:`))));
  for (const h of participants) { const f=figureAtPoint(h,figures)??figures.find(f=>f.points.some((a,i)=>dist(h,projectOnSegment(h,a,f.points[(i+1)%f.points.length]!).pt)<=BOUNDARY_TOLERANCE)); if(f) grouped.set(f.id,[...(grouped.get(f.id)??[]),h]); }
  for (const f of figures) {
    const members=grouped.get(f.id)??[], pts=straightSides(f.points);
    const boundaryMembers=members.filter(h=>pts.some((a,i)=>dist(h,projectOnSegment(h,a,pts[(i+1)%pts.length]!).pt)<=BOUNDARY_TOLERANCE));
    const exterior=(shoelace(pts)>=0?-1:1)*Math.abs(setting.offset);
    pts.forEach((a,i)=>{
      const b=pts[(i+1)%pts.length]!;
      const side=members.map(h=>({h,projection:projectOnSegment(h,a,b)}))
        .filter(({h,projection})=>dist(h,projection.pt)<=BOUNDARY_TOLERANCE)
        .sort((p,q)=>p.projection.t-q.projection.t || p.h.id.localeCompare(q.h.id));
      for(let j=1;j<side.length;j++) {
        const h=side[j-1]!.h,k=side[j]!.h;
        add(`${f.id}:side:${i}:${h.id}:${k.id}`,h,k,exterior);
      }
    });
    // Fill contour gaps through real corners, including convex bends and steps,
    // never a diagonal between sprinklers on different sides.
    const lengths=pts.map((a,i)=>dist(a,pts[(i+1)%pts.length]!));
    const starts=lengths.map((_,i)=>lengths.slice(0,i).reduce((a,b)=>a+b,0)),perimeter=lengths.reduce((a,b)=>a+b,0);
    const ordered=boundaryMembers.map(h=>{
      const hits=pts.map((a,i)=>{const projection=projectOnSegment(h,a,pts[(i+1)%pts.length]!);return {i,projection,distance:dist(h,projection.pt)};}).sort((a,b)=>a.distance-b.distance);
      const corner=pts.map((p,i)=>({i,distance:dist(h,p)})).sort((a,b)=>a.distance-b.distance)[0]!;
      const hit=hits[0]!;return {h,position:corner.distance<=BOUNDARY_TOLERANCE ? starts[corner.i]! : (starts[hit.i]!+hit.projection.t*lengths[hit.i]!)%perimeter};
    }).sort((a,b)=>a.position-b.position);
    const curved=!!(f.ellipse||d.faces[f.id]?.spline||d.faces[f.id]?.freehand);
    for(let n=0;!curved&&n<ordered.length&&ordered.length>1;n++) {
      const from=ordered[n]!,to=ordered[(n+1)%ordered.length]!,end=to.position+(n===ordered.length-1?perimeter:0);
      const corners=pts.flatMap((p,i)=>[starts[i]!,starts[i]!+perimeter].filter(s=>s>from.position+1e-6&&s<end-1e-6).map(s=>({p,i,s}))).sort((a,b)=>a.s-b.s);
      const recessed=corners.some(({p,i})=>{
        const a=pts[(i+pts.length-1)%pts.length]!,b=pts[(i+1)%pts.length]!;
        return ((p.x-a.x)*(b.y-p.y)-(p.y-a.y)*(b.x-p.x))*shoelace(pts)<-1e-8;
      });
      // Do not dimension the long empty remainder when only one side is populated.
      if(!recessed && end-from.position>perimeter/2+1e-6)continue;
      if(!corners.length)continue;
      const chain=[{p:from.h,id:from.h.id},...corners.map(c=>({p:c.p,id:`corner-${c.i}`})),{p:to.h,id:to.h.id}];
      for(let i=1;i<chain.length;i++) {
        const a=chain[i-1]!.p,b=chain[i]!.p;
        // Put a stair riser's dimension outside its adjacent tread, rather than
        // crossing both labels at the inside corner. Keep hand-adjusted offsets.
        let clearance=0;
        if(recessed&&Math.abs(a.x-b.x)<1e-7) {
          const before=chain[i-2]?.p,after=chain[i+1]?.p;
          if(before&&Math.abs(before.y-a.y)<1e-7)clearance=Math.max(clearance,Math.abs(before.x-a.x));
          if(after&&Math.abs(after.y-b.y)<1e-7)clearance=Math.max(clearance,Math.abs(after.x-b.x));
        }
        add(`${f.id}:step:${chain[i-1]!.id}:${chain[i]!.id}`,a,b,Math.sign(exterior)*(Math.abs(exterior)+clearance));
      }
    }
    for(const h of members) {
      if(onFigureBoundary(h,f)||boundaryMembers.includes(h)) continue;
      const top=sprinklerDatum(h,f,'y'),side=sprinklerDatum(h,f,'x');
      if(top) add(`${f.id}:inside:${h.id}:y`,top,h,Math.abs(setting.offset));
      if(side) add(`${f.id}:inside:${h.id}:x`,h,side,side.x<h.x?Math.abs(setting.offset):-Math.abs(setting.offset));
    }
  }
  return dims;
}
