import { arcCenter, ellipseWorldPts, facePoints } from "./cad/engine";
import { layerForType, type CadDrawing, type SnapHit } from "./cad/types";
import { dist, projectOnSegment, type Pt } from "./geometry";
import { figureAtPoint, irrigationFigures } from './irrigation-figures';

export function sameFigureHeads(point: Pt, heads: (Pt & {id:string})[], drawing: CadDrawing, nearDistance=0, faceId?:string) {
  const figures=irrigationFigures(drawing);
  const owner=(p:Pt,tolerance:number)=>figureAtPoint(p,figures)?.id ?? (tolerance>0 ? figures.map(f=>({id:f.id,distance:Math.min(...f.points.map((a,i)=>dist(p,projectOnSegment(p,a,f.points[(i+1)%f.points.length]!).pt)))})).filter(f=>f.distance<=tolerance).sort((a,b)=>a.distance-b.distance)[0]?.id : undefined);
  const id=faceId ?? owner(point,nearDistance);
  return heads.filter(h=>owner(h,.03)===id);
}

type Target = { faceId?: string; edgeId?: string };
type Targets = {
  corners: (Target & { pt: Pt })[];
  lines: (Target & { a: Pt; b: Pt; midpoint?:boolean })[];
  arcs: (Target & { c: Pt; r: number; start: number; sweep: number })[];
};
const cache = new WeakMap<CadDrawing, Targets>();

/** Visible contours only: no grid, shape centres, plant symbols or hidden geometry. */
function targetsFor(d: CadDrawing): Targets {
  const saved = cache.get(d);
  if (saved) return saved;
  const targets: Targets = { corners: [], lines: [], arcs: [] };
  const ownedEdges = new Set(Object.values(d.faces).flatMap(f => [...f.outer, ...f.holes.flat()].map(h => h.e)));
  const addPath = (points: Pt[], closed: boolean, target: Target) => {
    for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
      if (points.length > 1) targets.lines.push({ a: points[i]!, b: points[(i + 1) % points.length]!, ...target });
    }
  };
  const addEdge = (id: string, faceId?: string) => {
    const edge = d.edges[id];
    if (!edge) return;
    const a = d.vertices[edge.a], b = d.vertices[edge.b];
    if (!a || !b) return;
    const target = { edgeId: id, faceId };
    targets.corners.push({ pt: a, ...target }, { pt: b, ...target });
    const arc = arcCenter(a, b, edge.bulge);
    if (arc) targets.arcs.push({ ...arc, start: Math.atan2(a.y - arc.c.y, a.x - arc.c.x), ...target });
    else targets.lines.push({ a, b, midpoint:true, ...target });
  };
  for (const face of Object.values(d.faces)) {
    if (face.hidden || d.layers?.[layerForType(face.type)]?.visible === false) continue;
    const target = { faceId: face.id };
    if (face.circle) {
      targets.arcs.push({ c: { x: face.circle.cx, y: face.circle.cy }, r: face.circle.r, start: 0, sweep: Math.PI * 2, ...target });
    } else if (face.ellipse) {
      const e = face.ellipse;
      addPath(ellipseWorldPts(e.cx, e.cy, e.rx, e.ry, e.rot ?? 0, 256), true, target);
    } else if (face.spline || face.freehand) {
      const curve = face.spline ?? face.freehand!;
      addPath(facePoints(d, face.id), curve.closed, target);
      const corners = face.spline ? curve.pts : curve.closed ? [] : [curve.pts[0], curve.pts.at(-1)];
      for (const pt of corners) if (pt) targets.corners.push({ pt, ...target });
    } else {
      for (const half of face.outer) addEdge(half.e, face.id);
    }
    for (const half of face.holes.flat()) addEdge(half.e, face.id);
  }
  // Standalone lines/arcs remain snap targets; edges belonging only to hidden faces do not.
  for (const edge of Object.values(d.edges)) if (!ownedEdges.has(edge.id)) addEdge(edge.id);
  cache.set(d, targets);
  return targets;
}

export function snapSprinklerPoint(point: Pt, drawing: CadDrawing, options: {
  snapOn: boolean; pxPerMeter: number; pointerType?: string;
  snapGridOn?: boolean; gridStep?: number; heads?: (Pt & { id: string })[]; excludeHead?: string;
}): SnapHit {
  const grid = () => options.snapGridOn && options.gridStep && options.gridStep > 0
    ? { pt: { x: Math.round(point.x/options.gridStep)*options.gridStep, y: Math.round(point.y/options.gridStep)*options.gridStep }, kind: 'grid' as const }
    : { pt: point, kind: 'none' as const };
  if (!options.snapOn) return grid();
  const tolerance = (options.pointerType === "touch" ? 22 : options.pointerType === "pen" ? 14 : 12) / Math.max(options.pxPerMeter, 1e-6);
  const targets = targetsFor(drawing);
  let best: SnapHit = { pt: point, kind: "none" }, distance = tolerance;
  const consider = (pt: Pt, kind: "end" | "mid" | "edge", target: Target) => {
    const d = dist(point, pt);
    if (d <= distance) { best = { pt: { x: pt.x, y: pt.y }, kind, faceId: target.faceId, edgeId: target.edgeId }; distance = d; }
  };
  for (const corner of targets.corners) consider(corner.pt, "end", corner);
  if (best.kind === "end") return best;
  for (const line of targets.lines) if(line.midpoint) consider({ x:(line.a.x+line.b.x)/2,y:(line.a.y+line.b.y)/2 },'mid',line);
  if (best.kind === 'mid') return best;
  const heads = sameFigureHeads(point,(options.heads ?? []).filter(h => h.id !== options.excludeHead),drawing,tolerance);
  const alignTolerance = (options.pointerType === 'touch' ? 12 : 7) / Math.max(options.pxPerMeter,1e-6);
  // If the pointer is near an edge, intersect alignment with that exact edge.
  let intersection: SnapHit | null = null, intersectionDistance = tolerance;
  for (const line of targets.lines) {
    if (dist(point,projectOnSegment(point,line.a,line.b).pt) > tolerance) continue;
    for (const axis of ['x','y'] as const) {
      const delta = line.b[axis]-line.a[axis]; if (Math.abs(delta)<1e-10) continue;
      const other = axis === 'x' ? 'y' : 'x';
      for (const head of heads) {
        if (!sameFigureHeads(point,[head],drawing,tolerance,line.faceId).length) continue;
        if (Math.abs(point[axis]-head[axis])>alignTolerance) continue;
        const t = (head[axis]-line.a[axis])/delta; if (t<0 || t>1) continue;
        const pt = { [axis]:head[axis],[other]:line.a[other]+t*(line.b[other]-line.a[other]) } as Pt;
        const distance = dist(point,pt);
        if (distance <= intersectionDistance) { intersection = { pt,kind:'edge',...('faceId' in line ? {faceId:line.faceId,edgeId:line.edgeId} : {}) }; intersectionDistance=distance; }
      }
    }
  }
  for (const line of targets.lines) consider(projectOnSegment(point, line.a, line.b).pt, "edge", line);
  const turn = Math.PI * 2, normalize = (a: number) => (a % turn + turn) % turn;
  for (const arc of targets.arcs) {
    if (dist(point, arc.c) < 1e-9) continue;
    const angle = Math.atan2(point.y - arc.c.y, point.x - arc.c.x);
    const along = normalize((angle - arc.start) * Math.sign(arc.sweep));
    if (along > Math.abs(arc.sweep) + 1e-9) continue;
    consider({ x: arc.c.x + arc.r * Math.cos(angle), y: arc.c.y + arc.r * Math.sin(angle) }, "edge", arc);
    for(const axis of ['x','y'] as const){
      const other=axis==='x'?'y':'x';
      for(const head of heads){
        if(!sameFigureHeads(point,[head],drawing,tolerance,arc.faceId).length)continue;
        if(Math.abs(point[axis]-head[axis])>alignTolerance)continue;
        const delta=head[axis]-arc.c[axis],square=arc.r**2-delta**2;if(square<0)continue;
        for(const sign of [-1,1]){
          const pt={[axis]:head[axis],[other]:arc.c[other]+sign*Math.sqrt(square)} as Pt;
          const a=Math.atan2(pt.y-arc.c.y,pt.x-arc.c.x),along=normalize((a-arc.start)*Math.sign(arc.sweep));
          const distance=dist(point,pt);
          if(along<=Math.abs(arc.sweep)+1e-9&&distance<=intersectionDistance){intersection={pt,kind:'edge',faceId:arc.faceId,edgeId:arc.edgeId};intersectionDistance=distance;}
        }
      }
    }
  }
  if (intersection) return intersection;
  if (best.kind === 'edge') return best;
  const aligned = { ...point }; let kind: SnapHit['kind'] = 'none';
  for (const axis of ['x','y'] as const) {
    const head = heads.filter(h => Math.abs(point[axis]-h[axis])<=alignTolerance)
      .sort((a,b) => Math.abs(point[axis]-a[axis])-Math.abs(point[axis]-b[axis]) || dist(point,a)-dist(point,b))[0];
    if (head) { aligned[axis]=head[axis]; kind=axis==='x'?'vert':'horiz'; }
  }
  return kind !== 'none' ? {pt:aligned,kind} : grid();
}

/** One nearest horizontal and vertical centre guide, with a screen-space hint band. */
export function sprinklerAlignmentGuides(point: Pt, heads: (Pt & {id:string})[], px: number, excludeHead?: string, drawing?:CadDrawing) {
  if(drawing) heads=sameFigureHeads(point,heads,drawing,12/Math.max(px,1e-6));
  return (['x','y'] as const).flatMap(axis => {
    const target = heads.filter(h => h.id !== excludeHead && Math.abs(h[axis]-point[axis])*px <= 26)
      .sort((a,b) => Math.abs(a[axis]-point[axis])-Math.abs(b[axis]-point[axis]) || dist(a,point)-dist(b,point))[0];
    if (!target) return [];
    const exact = Math.abs(target[axis]-point[axis]) <= 1e-8;
    return [{ axis, target, exact, point: axis==='x' ? {x:target.x,y:point.y} : {x:point.x,y:target.y} }];
  });
}
