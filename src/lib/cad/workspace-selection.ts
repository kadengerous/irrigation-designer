import { pointInPoly, type Pt } from "@/lib/geometry";

/** Crossing selection includes touching edges and a box entirely inside a face. */
export function pathTouchesBox(points: Pt[], closed: boolean, a: Pt, b: Pt, holes: Pt[][] = []): boolean {
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
  const inside = (p: Pt) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (points.some(inside)) return true;
  const intersects = (p: Pt, q: Pt) => {
    let lo = 0, hi = 1;
    for (const [start, delta, min, max] of [[p.x,q.x-p.x,left,right],[p.y,q.y-p.y,top,bottom]]) {
      if (Math.abs(delta!) < 1e-12) { if (start! < min! || start! > max!) return false; }
      else {
        const t0 = (min!-start!)/delta!, t1 = (max!-start!)/delta!;
        lo = Math.max(lo, Math.min(t0,t1)); hi = Math.min(hi, Math.max(t0,t1));
        if (lo > hi) return false;
      }
    }
    return true;
  };
  const crosses = (path: Pt[], loop: boolean) => path.some((p,i) => (loop || i+1 < path.length) && intersects(p,path[(i+1)%path.length]!));
  if (crosses(points,closed) || holes.some(h => crosses(h,true))) return true;
  const corner = {x:left,y:top};
  return closed && pointInPoly(corner,points) && !holes.some(h => pointInPoly(corner,h));
}
