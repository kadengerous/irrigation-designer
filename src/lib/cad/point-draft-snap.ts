import {dist,type Pt} from '../geometry';
import type {CadDrawing,SnapHit} from './types';
import {cadSnap} from './snap';
import {segmentAlignmentAnchors,snapSegmentAlignment} from './segment-alignment';

/** Shared by live pointer, committed clicks and editing numbered vertices. */
export function snapPointDraft(raw:Pt,drawing:CadDrawing,points:readonly Pt[],options:Parameters<typeof cadSnap>[2]):SnapHit{
  const hit=cadSnap(raw,drawing,options);
  if(!options.snapOn||options.lock||hit.kind==='close')return hit;
  const tolerance=options.pointerType==='touch'?22:options.pointerType==='pen'?14:12;
  let vertex:Pt|undefined,nearest=tolerance/Math.max(options.pxPerMeter,1e-6);
  for(const point of points){
    const distance=dist(raw,point);
    if(distance<=nearest){vertex=point;nearest=distance;}
  }
  if(vertex)return {pt:{...vertex},kind:'end'};
  const fixed=options.angleFrom??points.at(-1);
  if(!fixed||!['none','grid','horiz','vert','parallel','perp','extend'].includes(hit.kind))return hit;
  const anchors=segmentAlignmentAnchors(drawing,fixed,undefined,undefined,points);
  const pt=snapSegmentAlignment(raw,hit.pt,anchors,options.pxPerMeter,options.pointerType==='touch'?12:8);
  return {pt,kind:pt.x!==hit.pt.x?'vert':pt.y!==hit.pt.y?'horiz':hit.kind};
}
