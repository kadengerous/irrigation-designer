import type { Project } from "./project-types";
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const point = (p: unknown) => record(p) && Number.isFinite(p.x) && Number.isFinite(p.y);
/** Reject broken files before replacing the working project; retain extension fields. */
export function validProject(value: unknown): value is Project {
  if (!record(value) || typeof value.id !== "string" || !value.id || typeof value.name !== "string") return false;
  if (!Array.isArray(value.heads) || !Array.isArray(value.zones) || !Array.isArray(value.polygons)) return false;
  const unique = (items: any[]) => items.every(v => record(v) && (typeof v.id === "string" || typeof v.id === "number")) && new Set(items.map(v => v.id)).size === items.length;
  if (![value.heads,value.zones,value.polygons].every(unique)) return false;
  if (!value.heads.every((h: any) => point(h) && typeof h.catalogId === "string" && [h.r,h.start,h.arc].every(Number.isFinite))) return false;
  if (!value.polygons.every((p: any) => Array.isArray(p.points) && p.points.every(point))) return false;
  if (value.underlay != null && (!record(value.underlay) || typeof value.underlay.src !== "string" || !point(value.underlay) || ![value.underlay.width,value.underlay.height,value.underlay.opacity].every(Number.isFinite))) return false;
  if (value.drawing != null) {
    const d = value.drawing;
    if (!record(d) || ![d.vertices,d.edges,d.faces].every(record)) return false;
    if (!Object.values(d.vertices).every(point)) return false;
    if (!Object.values(d.edges).every((e: any) => record(e) && d.vertices[e.a] && d.vertices[e.b])) return false;
    if (!Object.values(d.faces).every((f: any) => record(f) && Array.isArray(f.outer) && Array.isArray(f.holes) &&
      [f.outer,...f.holes].every(loop => Array.isArray(loop) && loop.every(h => record(h) && d.edges[h.e] && (h.dir === 1 || h.dir === -1))))) return false;
    if (d.dims && (!record(d.dims) || !Object.values(d.dims).every((dim: any) => record(dim) && point(dim.a) && point(dim.b) && Number.isFinite(dim.offset)))) return false;
  }
  const safe = (v: unknown, depth = 0): boolean => depth < 100 && (typeof v === "number" ? Number.isFinite(v) :
    Array.isArray(v) ? v.every(x => safe(x,depth+1)) : record(v) ? Object.entries(v).every(([k,x]) => !["__proto__","constructor","prototype"].includes(k) && safe(x,depth+1)) : true);
  return safe(value);
}
