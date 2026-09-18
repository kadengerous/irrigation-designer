import type { CadDrawing, CadFace } from "./types";

const views = new WeakMap<CadDrawing, Map<string, CadDrawing>>();

export function leafName(face: CadFace): string | undefined {
  let parent = face.layerParent;
  while (parent?.parent) parent = parent.parent;
  return parent ? parent.name : face.name;
}

/** A working view only. The saved drawing always retains group membership. */
export function memberDrawing(d: CadDrawing, id: string | null): CadDrawing {
  if (!id || !d.faces[id]?.layerId) return d;
  let cached = views.get(d);
  if (!cached) { cached = new Map(); views.set(d, cached); }
  const existing = cached.get(id);
  if (existing) return existing;
  const face = d.faces[id]!;
  const result = { ...d, faces: { ...d.faces, [id]: { ...face, name: leafName(face),
    layerId: undefined, layerParent: undefined, layerPivot: undefined, layerAngle: undefined } } };
  cached.set(id, result);
  return result;
}

/** Reattach an edited leaf before normalization, history, saving or rendering lists. */
export function restoreMember(d: CadDrawing, original: CadDrawing, id: string | null): CadDrawing {
  if (!id) return d;
  const before = original.faces[id], after = d.faces[id];
  if (!before?.layerId || !after || after.layerId === before.layerId) return d;
  const parent = before.layerParent ? structuredClone(before.layerParent) : undefined;
  let leaf = parent;
  while (leaf?.parent) leaf = leaf.parent;
  if (leaf) leaf.name = after.name;
  return { ...d, faces: { ...d.faces, [id]: { ...after, layerId: before.layerId,
    layerParent: parent, layerPivot: before.layerPivot, layerAngle: before.layerAngle, name: before.name } } };
}
