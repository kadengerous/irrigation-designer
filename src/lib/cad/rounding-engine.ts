import type { Pt } from "@/lib/geometry";
import type { CadDrawing, CadFace, CadVertex } from "./types";
import { fitCornerRadii, maximumCornerRadius, roundedBounds, roundedContour, roundingCorners, type ContourPart } from "./corner-rounding";

export function roundingBase(d: CadDrawing, id: string): CadVertex[] | null {
  const f=d.faces[id];
  if(!f || f.segment || f.circle || f.ellipse || f.spline || f.freehand || f.nodeEdit) return null;
  if(f.rounding) return f.rounding.corners;
  if(f.outer.length<3) return null;
  const result:CadVertex[]=[];
  for(let i=0;i<f.outer.length;i++) {
    const h=f.outer[i]!,e=d.edges[h.e],next=f.outer[(i+1)%f.outer.length]!,ne=d.edges[next.e];
    if(!e || !ne || Math.abs(e.bulge)>1e-8 || (h.dir===1?e.b:e.a)!==(next.dir===1?ne.a:ne.b)) return null;
    const p=d.vertices[h.dir===1?e.a:e.b];if(!p) return null;
    result.push({id:`round-${id}-${i}`,x:p.x,y:p.y});
  }
  return roundingCorners(result).some(Boolean)?result:null;
}

export function roundingObstacles(d: CadDrawing, f: CadFace): ContourPart[] {
  return f.holes.flat().flatMap(h=>{
    const e=d.edges[h.e];if(!e) return [];
    const a=d.vertices[e.a],b=d.vertices[e.b];if(!a||!b)return [];
    const bulge=e.bulge;
    if(Math.abs(bulge)<1e-9)return [{a,b,bulge:0}];
    const dx=b.x-a.x,dy=b.y-a.y,k=(1-bulge*bulge)/(4*bulge);
    const center={x:(a.x+b.x)/2-dy*k,y:(a.y+b.y)/2+dx*k};
    return [{a,b,bulge,center,radius:Math.hypot(a.x-center.x,a.y-center.y),start:Math.atan2(a.y-center.y,a.x-center.x),sweep:4*Math.atan(bulge)}];
  });
}

function replaceBoundary(d: CadDrawing, f: CadFace, parts: ContourPart[], base?: CadVertex[]) {
  const old=new Set(f.outer.map(h=>h.e));
  let hadAutoDimensions=false;
  for(const [id,dim] of Object.entries(d.dims??{}))if(dim.autoKey?.startsWith("edge:")&&old.has(dim.autoKey.slice(5))) {delete d.dims![id];hadAutoDimensions=true;}
  const parentHoles=Object.values(d.faces).flatMap(other=>other.id===f.id?[]:other.holes.flatMap((loop,i)=>loop.length===old.size&&loop.every(h=>old.has(h.e))?[{face:other,index:i}]:[]));
  const protectedEdges=new Set(Object.values(d.faces).flatMap(other=>other.id===f.id?other.holes.flat().map(h=>h.e):[...other.outer,...other.holes.filter((_,i)=>!parentHoles.some(p=>p.face.id===other.id&&p.index===i)).flat()].map(h=>h.e)));
  const removedVertices=new Set<string>();
  for(const id of old) {
    const e=d.edges[id];if(!e)continue;
    if(protectedEdges.has(id)){if(e.faceL===f.id)e.faceL=null;if(e.faceR===f.id)e.faceR=null;continue;}
    removedVertices.add(e.a);removedVertices.add(e.b);delete d.edges[id];
  }
  const loop:CadFace['outer']=[];
  parts.forEach((part,i)=>{
    const a=base?.[i]?.id??`rv-${f.id}-${i}`,b=base?.[(i+1)%parts.length]?.id??`rv-${f.id}-${(i+1)%parts.length}`;
    d.vertices[a]={id:a,x:part.a.x,y:part.a.y};d.vertices[b]={id:b,x:part.b.x,y:part.b.y};
    const id=`re-${f.id}-${i}`;d.edges[id]={id,a,b,bulge:part.bulge,faceL:f.id,faceR:null};loop.push({e:id,dir:1});
  });
  f.outer=loop;
  for(const parent of parentHoles)parent.face.holes[parent.index]=loop.slice().reverse().map(h=>({e:h.e,dir:-1}));
  const used=new Set(Object.values(d.edges).flatMap(e=>[e.a,e.b]));
  for(const id of removedVertices)if(!used.has(id))delete d.vertices[id];
  for(const c of Object.values(d.constraints??{}))if(old.has(c.a)||removedVertices.has(c.a)||(c.b&&(old.has(c.b)||removedVertices.has(c.b))))delete d.constraints![c.id];
  if(f.rounding && (hadAutoDimensions||d.automaticDimensionMode==="plan")) {
    const b=roundedBounds(f.rounding.corners,f.rounding.radii),a={x:b.minX,y:b.minY};
    d.dims??={};
    for(const axis of ["x","y"] as const) {
      const id=`auto:face:${f.id}:${axis}`;
      d.dims[id]??={id,autoKey:`face:${f.id}:${axis}`,faceAxis:{id:f.id,axis},a,b:axis==="x"?{x:b.maxX,y:b.minY}:{x:b.minX,y:b.maxY},offset:axis==="x"?-.45:.45};
    }
  }
}

export function rebuildRoundedFace(d: CadDrawing, id: string): boolean {
  const f=d.faces[id],r=f?.rounding;if(!f||!r)return false;
  const radii=fitCornerRadii(r.corners,r.radii,roundingObstacles(d,f));if(!radii)return false;
  f.rounding={corners:r.corners,radii};
  replaceBoundary(d,f,roundedContour(r.corners,radii));
  return true;
}

export function setFaceCornerRadii(d0: CadDrawing,id: string,selected: number[],radius: number) {
  const f=d0.faces[id],corners=roundingBase(d0,id);
  if(!f||f.locked||!corners||!Number.isFinite(radius)||radius<0)return {drawing:d0,maximum:0,radius:0,limited:true};
  const definitions=roundingCorners(corners),indices=[...new Set(selected)].filter(i=>definitions[i]);
  if(!indices.length)return {drawing:d0,maximum:0,radius:0,limited:false};
  const radii=f.rounding?.radii??corners.map(()=>0),maximum=maximumCornerRadius(corners,radii,indices,roundingObstacles(d0,f));
  const actual=Math.max(0,Math.min(radius,maximum));
  if(indices.every(i=>Math.abs((radii[i]??0)-actual)<1e-10))return {drawing:d0,maximum,radius:actual,limited:radius>maximum+1e-6};
  const d=structuredClone(d0),face=d.faces[id]!;
  face.rounding={corners:corners.map(p=>({...p})),radii:corners.map((_,i)=>indices.includes(i)?actual:radii[i]??0)};
  if(!rebuildRoundedFace(d,id))return {drawing:d0,maximum,radius:0,limited:true};
  return {drawing:d,maximum,radius:actual,limited:radius>maximum+1e-6};
}

/** Edit the original polygon, then restore circular fillets with their metre radii. */
export function editRoundedFace(d0: CadDrawing,id: string,edit: (d: CadDrawing)=>CadDrawing): CadDrawing {
  const r=d0.faces[id]?.rounding;if(!r)return edit(d0);
  const d=structuredClone(d0),f=d.faces[id]!;
  replaceBoundary(d,f,roundedContour(r.corners,r.corners.map(()=>0)),r.corners);
  delete f.rounding;
  const next=edit(d),face=next.faces[id];if(!face)return next;
  const corners=r.corners.map(p=>next.vertices[p.id]).filter((p):p is CadVertex=>Boolean(p));
  if(corners.length!==r.corners.length)return d0;
  face.rounding={corners:corners.map(p=>({...p})),radii:[...r.radii]};
  return rebuildRoundedFace(next,id)?next:d0;
}

export function transformRounding(d: CadDrawing,id: string,point: (p:Pt)=>Pt) {
  const f=d.faces[id];if(!f?.rounding)return;
  f.rounding={...f.rounding,corners:f.rounding.corners.map(p=>({...p,...point(p)}))};
  rebuildRoundedFace(d,id);
}
