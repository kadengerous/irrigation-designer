import { dist, headingDeg } from "@/lib/geometry";
import type { Head } from "@/lib/project-types";
import { headCovers } from "@/lib/coverage";

export type H2HStatus = "ok" | "short" | "far" | "outside";

export type H2HPair = {
  a: string;
  b: string;
  status: H2HStatus;
  gap: number;
};

function inSector(h: Head, p: { x: number; y: number }): boolean {
  if (h.arc >= 359) return true;
  const ang = headingDeg(h, p);
  let d = ang - h.start;
  while (d < 0) d += 360;
  return d % 360 <= h.arc + 4;
}

export function headToHeadPairs(heads: Head[]): H2HPair[] {
  const pairs: H2HPair[] = [];
  for (let i = 0; i < heads.length; i++) {
    const a = heads[i]!;
    for (let j = i + 1; j < heads.length; j++) {
      const b = heads[j]!;
      const d = dist(a, b);
      const span = (a.r + b.r) / 2;
      if (d > span * 1.85) continue;
      const aSees = inSector(a, b);
      const bSees = inSector(b, a);
      if (!aSees || !bSees) {
        if (d < Math.max(a.r, b.r) * 1.15) {
          pairs.push({ a: a.id, b: b.id, status: "outside", gap: d });
        }
        continue;
      }
      const aToB = headCovers(a, b, 1.05);
      const bToA = headCovers(b, a, 1.05);
      if (aToB && bToA) {
        if (d < span * 0.55) pairs.push({ a: a.id, b: b.id, status: "short", gap: d });
        else pairs.push({ a: a.id, b: b.id, status: "ok", gap: d });
      } else {
        pairs.push({ a: a.id, b: b.id, status: "far", gap: d });
      }
    }
  }
  return pairs;
}
