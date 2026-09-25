import { drawingOrMigrate, outsideDimensionOffset, resolveDim } from "./engine";
import type { CadDim } from "./types";
import type { Project } from "../project-types";
import { resolveSprinklerDimensions } from './sprinkler-dimensions';

/** Editable plan edges/axes or live sprinkler contour chains and boundary references. */
export function automaticDimensions(project: Project, mode: "plan" | "irrigation", offset = .45) {
  const previous = drawingOrMigrate(project);
  // An explicit command rebuilds deleted auto dimensions. Passive live updates
  // still respect suppression, so a deletion stays deleted until this command.
  const d = {...previous,suppressedAutoDimensions:(previous.suppressedAutoDimensions??[]).filter(key=>
    mode==='irrigation' ? !key.startsWith('irrigation:')&&!key.startsWith('heads:') : !key.startsWith('edge:')&&!key.startsWith('face:'))};
  const dims = { ...d.dims };
  if(mode==='irrigation') {
    const drawing={...d,automaticDimensionMode:'irrigation' as const,irrigationDimensions:{...d.irrigationDimensions,headIds:project.heads.map(h=>h.id),suppressed:[],offset:d.irrigationDimensions?.offset??offset}};
    return {...drawing,dims:resolveSprinklerDimensions(drawing,project.heads,true),layers:d.layers?{...d.layers,dims:{visible:true,locked:false}}:d.layers};
  }
  const keys = new Set(Object.values(dims).map(dim => dim.autoKey));
  const pairs = new Set(Object.values(dims).map(dim => {
    const { a, b } = resolveDim(d, dim);
    return [JSON.stringify(a), JSON.stringify(b)].sort().join("|");
  }));
  const add = (key: string, dim: Omit<CadDim, "id" | "offset">) => {
    if (keys.has(key) || d.suppressedAutoDimensions?.includes(key)) return;
    const { a, b } = resolveDim(d, { ...dim, id: key, offset });
    if (![a.x,a.y,b.x,b.y].every(Number.isFinite) || Math.hypot(a.x-b.x,a.y-b.y) < 1e-8) return;
    const pair = [JSON.stringify(a), JSON.stringify(b)].sort().join("|");
    if (pairs.has(pair)) return;
    let id = `auto:${key}`; while (dims[id]) id += ":new";
    dims[id] = { ...dim, a, b, id, autoKey: key, offset: mode === "plan" ? outsideDimensionOffset(d,a,b,offset) : offset };
    keys.add(key); pairs.add(pair);
  };
  {
    for (const f of Object.values(d.faces)) {
      if (f.hidden) continue;
      if (f.circle || f.ellipse || f.spline || f.freehand) {
        for (const axis of (f.circle ? ["x"] : ["x","y"]) as ("x"|"y")[]) {
          add(`face:${f.id}:${axis}`, { a:{x:0,y:0},b:{x:0,y:0},faceAxis:{id:f.id,axis} });
        }
        continue;
      }
      for (const half of [f.outer,...f.holes].flat()) {
        const edge = d.edges[half.e]; if (!edge) continue;
        const a = d.vertices[edge.a], b = d.vertices[edge.b]; if (!a || !b) continue;
        add(`edge:${edge.id}`, { a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},aId:a.id,bId:b.id });
      }
    }
  }
  return { ...d, dims, automaticDimensionMode:'plan' as const, layers: d.layers ? { ...d.layers, dims: { visible:true,locked:false } } : d.layers };
}
