import type {Pt} from './geometry';
import type {CadDrawing,SnapHit} from './cad/types';
import {cadSnap} from './cad/snap';
import {segmentAlignmentAnchors} from './cad/segment-alignment';
import {landscapeFootprint,landscapeLayerVisible,landscapeRecord,rotationDegrees,type LandscapeObject} from './landscape-objects';

type Anchor={point:Pt;kind:'center'|'edge'|'any';axis?:'x'|'y'};
export type LandscapeAlignmentGuide={axis:'x'|'y';anchor:Pt;point:Pt;aligned:boolean};
type Options=Parameters<typeof cadSnap>[2]&{origin?:Pt};

/** Screen-axis extents, including rotated and non-rectangular objects. */
function anchorsFor(o:LandscapeObject):Anchor[]{
  let minX:number,maxX:number,minY:number,maxY:number;
  if(landscapeRecord(o.catalogId)?.shape==='circle'){
    const a=o.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
    const rx=Math.hypot(o.length*c,o.width*s)/2,ry=Math.hypot(o.length*s,o.width*c)/2;
    minX=o.x-rx;maxX=o.x+rx;minY=o.y-ry;maxY=o.y+ry;
  }else{
    const points=landscapeFootprint(o);
    minX=Math.min(...points.map(p=>p.x));maxX=Math.max(...points.map(p=>p.x));
    minY=Math.min(...points.map(p=>p.y));maxY=Math.max(...points.map(p=>p.y));
  }
  return [{point:{x:o.x,y:o.y},kind:'center'},
    {point:{x:minX,y:o.y},kind:'edge',axis:'x'},{point:{x:maxX,y:o.y},kind:'edge',axis:'x'},
    {point:{x:o.x,y:minY},kind:'edge',axis:'y'},{point:{x:o.x,y:maxY},kind:'edge',axis:'y'}];
}

function matches(point:Pt,object:LandscapeObject,drawing:CadDrawing,px:number,origin?:Pt){
  if(!Number.isFinite(px)||px<=0)return [];
  const targets:Anchor[]=Object.values(drawing.landscapeObjects??{})
    .filter(o=>o.id!==object.id&&landscapeLayerVisible(drawing,o.category,o)).flatMap(anchorsFor);
  targets.push(...segmentAlignmentAnchors(drawing,{x:NaN,y:NaN}).map(p=>({point:p,kind:'any' as const})));
  if(origin)targets.push({point:origin,kind:'center'});
  const moving=anchorsFor({...object,...point}),out:{axis:'x'|'y';anchor:Pt;point:Pt;error:number;delta:number;span:number}[]=[];
  for(const axis of ['x','y'] as const){
    const along=axis==='x'?'y':'x';
    let best:typeof out[number]|undefined;
    for(const feature of moving)for(const target of targets){
      if(feature.axis&&feature.axis!==axis||target.axis&&target.axis!==axis)continue;
      if(target.kind!=='any'&&feature.kind!==target.kind)continue;
      const delta=target.point[axis]-feature.point[axis],error=Math.abs(delta),span=Math.abs(target.point[along]-feature.point[along]);
      // Adjoining objects in the same row/column have zero span. They still
      // need edge snapping; a minimum guide length must never disable capture.
      if(error*px>32)continue;
      if(!best||error<best.error-1e-9||Math.abs(error-best.error)<=1e-9&&span<best.span)
        best={axis,anchor:target.point,point:feature.point,error,delta,span};
    }
    if(best)out.push(best);
  }
  return out;
}

export function landscapeAlignmentGuides(point:Pt,object:LandscapeObject,drawing:CadDrawing,px:number,origin?:Pt):LandscapeAlignmentGuide[]{
  return matches(point,object,drawing,px,origin).map(g=>{
    const along=g.axis==='x'?'y':'x',anchor={...g.anchor},end={...g.point};
    if(g.span*px<24){
      const middle=(anchor[along]+end[along])/2;
      anchor[along]=middle-12/px;end[along]=middle+12/px;
    }
    return {axis:g.axis,anchor,point:end,aligned:g.error<1e-7};
  });
}

/** One calculation shared by canvas dragging, library preview and final placement. */
export function snapLandscapePoint(point:Pt,object:LandscapeObject,drawing:CadDrawing,options:Options):SnapHit{
  if(!options.snapOn)return {pt:point,kind:'none'};
  const fallback=cadSnap(point,drawing,{...options,excludeLandscape:object.id});
  const tolerance=options.pointerType==='touch'?12:options.pointerType==='pen'?9:7;
  const aligned=matches(point,object,drawing,options.pxPerMeter,options.origin).filter(g=>g.error*options.pxPerMeter<=tolerance);
  if(!aligned.length)return fallback;
  // Align the object's extents before attracting its centre to nearby geometry.
  // Grid snapping may still supply the axis for which there is no object match.
  const pt={...(fallback.kind==='grid'?fallback.pt:point)};let kind:SnapHit['kind']='none';
  for(const g of aligned){
    pt[g.axis]=point[g.axis]+g.delta;kind=g.axis==='x'?'vert':'horiz';
  }
  return {pt,kind};
}

/** Magnetic quarter turns never affect a free rotation with Magnet switched off. */
export function snapLandscapeRotation(angle:number,snapOn:boolean){
  const normalized=rotationDegrees(angle),nearest=Math.round(normalized/90)*90;
  return snapOn&&Math.abs(normalized-nearest)<=5?rotationDegrees(nearest):normalized;
}
