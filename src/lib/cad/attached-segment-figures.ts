import { closestOnSegment, dist, polygonArea } from '@/lib/geometry';
import { addPointShape, facePoints, segmentLayers } from './engine';
import { fuseFigures } from './fuse-figures';
import { removeSegmentFigureParts, segmentFigures, type SegmentFigure } from './segment-figures';
import { emptyDrawing, layerForType, type CadDrawing } from './types';

export type AttachedSegmentFigure = SegmentFigure & { sourceId: string; sourceIds: string[] };

/** Drawn chains may close against one figure or bridge two existing figures. */
export function attachedSegmentFigures(d: CadDrawing): AttachedSegmentFigure[] {
  const segments=Object.values(d.faces).filter(f=>f.segment && f.spline?.pts.length===2 &&
    !f.layerId && !f.hidden && !f.locked && d.layers?.[layerForType(f.type)]?.visible!==false &&
    !d.layers?.[layerForType(f.type)]?.locked);
  if(!segments.length) return [];
  const results: AttachedSegmentFigure[]=[];
  const sources: { id: string; boundary: ReturnType<typeof facePoints> }[]=[];
  for(const source of Object.values(d.faces)) {
    if(source.segment || source.layerId || source.hidden || source.locked ||
      d.layers?.[layerForType(source.type)]?.visible===false || d.layers?.[layerForType(source.type)]?.locked ||
      (source.spline && !source.spline.closed) || (source.freehand && !source.freehand.closed) || source.holes.length) continue;
    const boundary=facePoints(d,source.id);
    if(boundary.length<3) continue;
    const contacts=segments.flatMap(f=>f.spline!.pts).filter(p=>boundary.some((a,i)=>
      dist(p,closestOnSegment(p,a,boundary[(i+1)%boundary.length]!))<1e-6));
    if(!contacts.some(p=>dist(p,contacts[0]!)>1e-6)) continue;
    sources.push({id:source.id,boundary});
  }
  const groups=sources.map(source=>[source]);
  for(let i=0;i<sources.length;i++) for(let j=i+1;j<sources.length;j++) groups.push([sources[i]!,sources[j]!]);
  for(const group of groups) {
    const graph=emptyDrawing(), boundaryOwners=new Map<string,string>();
    for(const segment of segments) graph.faces[segment.id]=segment;
    for(const source of group) source.boundary.forEach((a,i)=>{
      let id=`boundary:${source.id}:${i}`;
      while(graph.faces[id]) id+=':';
      boundaryOwners.set(id,source.id);
      graph.faces[id]={id,type:d.faces[source.id]!.type,outer:[],holes:[],hidden:false,locked:false,segment:true,
        spline:{pts:[a,source.boundary[(i+1)%source.boundary.length]!],closed:false}};
    });
    // A chord inside a figure bounds two regions. Offer the smaller bounded
    // region once; an outside addition naturally contributes just one region.
    const byChain=new Map<string,AttachedSegmentFigure>();
    for(const candidate of segmentFigures(graph)) {
      const parts=candidate.parts.filter(part=>!boundaryOwners.has(part.id));
      if(!parts.length || parts.length===candidate.parts.length) continue;
      const usedSources=new Set(candidate.parts.map(part=>boundaryOwners.get(part.id)).filter(Boolean));
      // Pair detection must actually use both boundaries, not rediscover a
      // single-figure addition or include an unrelated touching neighbour.
      if(usedSources.size!==group.length) continue;
      const sourceIds=group.map(source=>source.id);
      const chainKey=parts.map(p=>JSON.stringify([p.id,...[p.a,p.b].map(q=>[q.x,q.y]).sort()])).sort().join('|');
      const next={...candidate,parts,sourceId:sourceIds[0]!,sourceIds,key:JSON.stringify([group,candidate.key])};
      const previous=byChain.get(chainKey);
      if(!previous || polygonArea(next.points)<polygonArea(previous.points)) byChain.set(chainKey,next);
    }
    results.push(...byChain.values());
  }
  return results;
}

export function resolveAttachedSegmentFigure(d0: CadDrawing, key: string, action: 'merge' | 'separate' | 'delete') {
  const candidate=attachedSegmentFigures(d0).find(c=>c.key===key);
  if(!candidate) return null;
  let drawing=removeSegmentFigureParts(d0,candidate);
  if(action==='delete') return {drawing:segmentLayers(drawing),faceId:candidate.sourceId};
  const before=new Set(Object.keys(drawing.faces));
  drawing=addPointShape(drawing,candidate.points,d0.faces[candidate.sourceId]!.type);
  const faceId=Object.keys(drawing.faces).find(id=>!before.has(id));
  if(!faceId) return null;
  if(action==='merge') {
    const merged=fuseFigures(drawing,[...candidate.sourceIds,faceId]);
    if(merged===drawing) return null;
    return {drawing:segmentLayers(merged),faceId:candidate.sourceId};
  }
  return {drawing:segmentLayers(drawing),faceId};
}
