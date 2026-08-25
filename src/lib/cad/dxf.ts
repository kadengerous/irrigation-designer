import type { Pt } from "@/lib/geometry";
import type { RegionType } from "@/lib/cad/types";

export type DxfImport = {
  polylines: { pts: Pt[]; closed: boolean; type: RegionType }[];
  circles: { cx: number; cy: number; r: number; type: RegionType }[];
  lines: { a: Pt; b: Pt }[];
  texts: { x: number; y: number; text: string; size: number }[];
};

const TYPES: RegionType[] = ["lawn", "bed", "path", "hardscape", "building", "pool", "no_irrigation"];

function layerType(layer: string): RegionType {
  const s = layer.toLowerCase();
  return TYPES.find((t) => s.includes(t)) ?? "lawn";
}

export function parseDxf(raw: string): DxfImport {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const pairs: { c: number; v: string }[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = Number(lines[i]!.trim());
    if (!Number.isFinite(c)) continue;
    pairs.push({ c, v: lines[i + 1]!.trim() });
  }

  const out: DxfImport = { polylines: [], circles: [], lines: [], texts: [] };
  let i = 0;
  const flip = (y: number) => -y;

  while (i < pairs.length) {
    const p = pairs[i]!;
    if (p.c !== 0) {
      i += 1;
      continue;
    }
    const kind = p.v.toUpperCase();
    i += 1;
    if (kind === "LWPOLYLINE") {
      let layer = "0";
      let closed = false;
      const pts: Pt[] = [];
      let x: number | null = null;
      while (i < pairs.length && pairs[i]!.c !== 0) {
        const q = pairs[i]!;
        if (q.c === 8) layer = q.v;
        else if (q.c === 70) closed = (Number(q.v) & 1) === 1;
        else if (q.c === 10) x = Number(q.v);
        else if (q.c === 20 && x != null) {
          pts.push({ x, y: flip(Number(q.v)) });
          x = null;
        }
        i += 1;
      }
      if (pts.length >= 2) out.polylines.push({ pts, closed, type: layerType(layer) });
    } else if (kind === "POLYLINE") {
      let layer = "0";
      let closed = false;
      const pts: Pt[] = [];
      while (i < pairs.length && !(pairs[i]!.c === 0 && pairs[i]!.v.toUpperCase() === "SEQEND")) {
        const q = pairs[i]!;
        if (q.c === 8) layer = q.v;
        else if (q.c === 70) closed = (Number(q.v) & 1) === 1;
        else if (q.c === 0 && q.v.toUpperCase() === "VERTEX") {
          i += 1;
          let x = 0;
          let y = 0;
          while (i < pairs.length && pairs[i]!.c !== 0) {
            const v = pairs[i]!;
            if (v.c === 10) x = Number(v.v);
            else if (v.c === 20) y = Number(v.v);
            i += 1;
          }
          pts.push({ x, y: flip(y) });
          continue;
        }
        i += 1;
      }
      if (pairs[i]?.v.toUpperCase() === "SEQEND") i += 1;
      if (pts.length >= 2) out.polylines.push({ pts, closed, type: layerType(layer) });
    } else if (kind === "LINE") {
      let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
      while (i < pairs.length && pairs[i]!.c !== 0) {
        const q = pairs[i]!;
        if (q.c === 10) x1 = Number(q.v);
        else if (q.c === 20) y1 = Number(q.v);
        else if (q.c === 11) x2 = Number(q.v);
        else if (q.c === 21) y2 = Number(q.v);
        i += 1;
      }
      out.lines.push({ a: { x: x1, y: flip(y1) }, b: { x: x2, y: flip(y2) } });
    } else if (kind === "CIRCLE") {
      let cx = 0, cy = 0, r = 1, layer = "0";
      while (i < pairs.length && pairs[i]!.c !== 0) {
        const q = pairs[i]!;
        if (q.c === 8) layer = q.v;
        else if (q.c === 10) cx = Number(q.v);
        else if (q.c === 20) cy = Number(q.v);
        else if (q.c === 40) r = Number(q.v);
        i += 1;
      }
      if (r > 0) out.circles.push({ cx, cy: flip(cy), r, type: layerType(layer) });
    } else if (kind === "TEXT" || kind === "MTEXT") {
      let x = 0, y = 0, text = "", size = 0.35;
      while (i < pairs.length && pairs[i]!.c !== 0) {
        const q = pairs[i]!;
        if (q.c === 10) x = Number(q.v);
        else if (q.c === 20) y = Number(q.v);
        else if (q.c === 40) size = Number(q.v) || 0.35;
        else if (q.c === 1) text = q.v.replace(/\{\\.*?\}/g, "").replace(/\\P/g, " ");
        i += 1;
      }
      if (text) out.texts.push({ x, y: flip(y), text, size });
    } else {
      while (i < pairs.length && pairs[i]!.c !== 0) i += 1;
    }
  }
  return out;
}
