import { emptyDrawing } from "../src/lib/cad/types";
import {
  addRect,
  addChain,
  faceArea,
  isInternalEdge,
  deleteBoundary,
  addCircle,
  setEdgeBulge,
  bulgeForRadius,
  tessellateEdge,
  moveFace,
  setRectFromDiag,
  setRectSize,
  facePoints,
  toPolygons,
  rotateFace,
  rectWorldCorners,
  faceCentroid,
} from "../src/lib/cad/engine";
import { dist, snapDeltaToAngle } from "../src/lib/geometry";
import { parseCadInput } from "../src/lib/cad/parse";

const a = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 10, y: 6 }, "lawn");
const faces = Object.values(a.faces);
if (!faces.length) throw new Error("no faces after rect");
const area = faces.reduce((s, f) => s + faceArea(a, f.id), 0);
if (Math.abs(area - 60) > 0.05) throw new Error("rect area " + area);

const b = addChain(
  a,
  [
    { x: 10, y: 2 },
    { x: 13, y: 2 },
    { x: 13, y: 4 },
    { x: 10, y: 4 },
  ],
  true,
  "lawn",
);
const area2 = Object.values(b.faces).reduce((s, f) => s + faceArea(b, f.id), 0);
const internals = Object.values(b.edges).filter((e) => isInternalEdge(b, e.id));
if (!internals.length) throw new Error("expected internal edge after attached rect, faces=" + Object.keys(b.faces).length + " edges=" + Object.keys(b.edges).length + " area2=" + area2);
const merged = deleteBoundary(b, internals[0]!.id);
const area3 = Object.values(merged.drawing.faces).reduce((s, f) => s + faceArea(merged.drawing, f.id), 0);
if (Math.abs(area3 - 66) > 0.25) throw new Error("merged area " + area3 + " pre " + area2);

const c = addCircle(emptyDrawing(), { x: 0, y: 0 }, 2, "pool");
const ca = Object.values(c.faces).reduce((s, f) => s + faceArea(c, f.id), 0);
if (Math.abs(ca - Math.PI * 4) > 0.35) throw new Error("circle area " + ca);

const p = parseCadInput("5m");
if (!p.ok || p.kind !== "length" || Math.abs(p.meters - 5) > 1e-12) throw new Error("parse 5m");
const p2 = parseCadInput("10x6");
if (!p2.ok || p2.kind !== "size" || p2.width !== 10 || p2.height !== 6) throw new Error("parse 10x6");
const p3 = parseCadInput("500см");
if (!p3.ok || p3.kind !== "length" || Math.abs(p3.meters - 5) > 1e-12) throw new Error("parse 500cm");

const line = addChain(emptyDrawing(), [{ x: 0, y: 0 }, { x: 10, y: 0 }], false, "path");
const eid = Object.keys(line.edges)[0]!;
const bulge = bulgeForRadius({ x: 0, y: 0 }, { x: 10, y: 0 }, 5, 1);
const arced = setEdgeBulge(line, eid, bulge);
const ed = arced.edges[eid]!;
const A = arced.vertices[ed.a]!;
const B = arced.vertices[ed.b]!;
const tes = tessellateEdge(A, B, ed.bulge);
if (tes.length < 5) throw new Error("arc tessellate");
const r = 10 / (2 * Math.sin((4 * Math.atan(ed.bulge)) / 2));
if (Math.abs(Math.abs(r) - 5) > 0.05) throw new Error("arc radius " + r);

const rectD = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 10, y: 6 }, "lawn");
const rid = Object.keys(rectD.faces)[0]!;
const moved = moveFace(rectD, rid, 3, 4);
if (!moved.faces[rid]?.rect) throw new Error("rect meta lost on move");
if (Math.abs(moved.faces[rid]!.rect!.x - 3) > 1e-9 || Math.abs(moved.faces[rid]!.rect!.y - 4) > 1e-9) {
  throw new Error("rect origin after move " + JSON.stringify(moved.faces[rid]!.rect));
}
const sized = setRectSize(rectD, rid, 8, 5);
if (Math.abs(faceArea(sized, rid) - 40) > 0.05) throw new Error("setRectSize area " + faceArea(sized, rid));
const rot = rotateFace(rectD, rid, 90);
const rc = rectWorldCorners(rot.faces[rid]!.rect!);
const cen = faceCentroid(rot, rid);
if (dist(cen, { x: 5, y: 3 }) > 0.05) throw new Error("centroid after rot " + JSON.stringify(cen));
if (rc.length !== 4) throw new Error("corners");
const shrunk = setRectFromDiag(rectD, rid, { x: 0, y: 0 }, { x: 0.4, y: 0.3 });
const spts = facePoints(shrunk, rid);
const sarea = faceArea(shrunk, rid);
if (sarea < 0.05) throw new Error("shrunk bowtie area " + sarea);
const poly = toPolygons(shrunk).find((g) => g.id === rid);
if (!poly || poly.points.length < 4) throw new Error("toPolygons rect");
const cross =
  (poly.points[0]!.x - poly.points[2]!.x) * (poly.points[1]!.y - poly.points[3]!.y) -
  (poly.points[0]!.y - poly.points[2]!.y) * (poly.points[1]!.x - poly.points[3]!.x);
if (Math.abs(sarea - shrunk.faces[rid]!.rect!.w * shrunk.faces[rid]!.rect!.h) > 0.05) {
  throw new Error("shrunk area mismatch");
}
void spts;
void cross;
if (Math.abs(snapDeltaToAngle(0, 8, 45, 10)) > 1e-6) throw new Error("snap 8→0");
if (Math.abs(snapDeltaToAngle(0, 40, 45, 10) - 45) > 1e-6) throw new Error("snap 40→45");
if (Math.abs(snapDeltaToAngle(0, 88, 45, 10) - 90) > 1e-6) throw new Error("snap 88→90");
if (Math.abs(snapDeltaToAngle(0, 22, 45, 10) - 22) > 1e-6) throw new Error("no snap 22");

let many = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 2, y: 2 }, "lawn");
many = addRect(many, { x: 5, y: 0 }, { x: 8, y: 3 }, "lawn");
many = addRect(many, { x: 10, y: 10 }, { x: 14, y: 12 }, "lawn");
many = addCircle(many, { x: 20, y: 20 }, 2, "lawn");
if (Object.keys(many.faces).length !== 4) throw new Error("lost faces " + Object.keys(many.faces).length);
if (Object.values(many.faces).filter((f) => f.rect).length !== 3) throw new Error("rect meta lost");
if (Object.values(many.faces).filter((f) => f.circle).length !== 1) throw new Error("circle meta lost");
const polys = toPolygons(many);
if (polys.filter((g) => g.type === "rect").length !== 3) throw new Error("toPolygons rects");
if (polys.filter((g) => g.type === "circle").length !== 1) throw new Error("toPolygons circle");

console.log("CAD tests ok", { area, area2, area3, ca, faces: Object.keys(b.faces).length, internals: internals.length, arcR: r });
