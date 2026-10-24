import { dist, type Pt } from '@/lib/geometry';
import { emptyDrawing, type CadDrawing } from './types';
import { addDrawingLines, addPointShape, cloneDrawing, facePoints, rebuildFaces, segmentLayers } from './engine';

export type SegmentFigure = { key: string; points: Pt[]; parts: { id: string; a: Pt; b: Pt }[] };
const parameter = (p: Pt, a: Pt, b: Pt) => ((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/(dist(a,b)**2 || 1);
const point = (a: Pt,b: Pt,t: number): Pt => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

/** Detect endpoint-connected loops without introducing junctions at crossings. */
export function segmentFigures(d: CadDrawing): SegmentFigure[] {
  const segments=Object.values(d.faces).filter(f=>f.segment && f.spline?.pts.length===2 && !f.layerId && !f.hidden && !f.locked);
  const endpoints=segments.flatMap(f=>f.spline!.pts);
  let graph=emptyDrawing();
  const owners=new Map<string,string>();
  for (const f of segments) {
    const [a,b]=f.spline!.pts as [Pt,Pt];
    if (dist(a,b)<1e-8) continue;
    const cuts=[0,1];
    for (const p of endpoints) {
      const t=parameter(p,a,b);
      if (t>1e-7 && t<1-1e-7 && dist(p,point(a,b,t))<1e-6) cuts.push(t);
    }
    const sorted=[...new Set(cuts)].sort((a,b)=>a-b);
    for(let i=1;i<sorted.length;i++) {
      const before=new Set(Object.keys(graph.edges));
      graph=addDrawingLines(graph,[point(a,b,sorted[i-1]!),point(a,b,sorted[i]!)],'lawn');
      for(const id of Object.keys(graph.edges)) if(!before.has(id)) owners.set(id,f.id);
    }
  }
  rebuildFaces(graph,'lawn');
  return Object.values(graph.faces).filter(f=>f.outer.length>=3 && !f.holes.length).map(f=>{
    const parts=f.outer.map(h=>{
      const edge=graph.edges[h.e]!;
      return {id:owners.get(h.e)!,a:{...graph.vertices[edge.a]!},b:{...graph.vertices[edge.b]!}};
    });
    const points=facePoints(graph,f.id);
    const key=parts.map(p=>[p.id,[p.a.x,p.a.y].join(','),[p.b.x,p.b.y].join(',')].join(':')).sort().join('|');
    return {key,points,parts};
  }).filter(c=>c.parts.every(p=>p.id));
}

/** Consume only contour portions; keep any extensions outside the new figure. */
export function createSegmentFigure(d0: CadDrawing, key: string) {
  const candidate=segmentFigures(d0).find(c=>c.key===key);
  if(!candidate) return null;
  let d=removeSegmentFigureParts(d0,candidate);
  const before=new Set(Object.keys(d.faces));
  d=addPointShape(d,candidate.points,'lawn');
  const faceId=Object.keys(d.faces).find(id=>!before.has(id))!;
  return {drawing:segmentLayers(d),faceId};
}

/** Remove the drawn portions only, never the existing figure's boundary. */
export function removeSegmentFigureParts(d0: CadDrawing, candidate: SegmentFigure) {
  const d=cloneDrawing(d0);
  for(const id of new Set(candidate.parts.map(p=>p.id))) {
    const original=d.faces[id]!;
    const [a,b]=original.spline!.pts as [Pt,Pt];
    const intervals=candidate.parts.filter(p=>p.id===id).map(p=>[parameter(p.a,a,b),parameter(p.b,a,b)].sort((x,y)=>x-y));
    const cuts=[...new Set([0,1,...intervals.flat()])].sort((a,b)=>a-b);
    delete d.faces[id];
    for(let i=1;i<cuts.length;i++) {
      const low=cuts[i-1]!, high=cuts[i]!, mid=(low+high)/2;
      if(high-low<1e-8 || intervals.some(([x,y])=>mid>=x!-1e-8 && mid<=y!+1e-8)) continue;
      const nextId=d.faces[id] ? `${id}-tail-${i}` : id;
      d.faces[nextId]={...original,id:nextId,spline:{pts:[point(a,b,low),point(a,b,high)],closed:false}};
    }
  }
  return d;
}
