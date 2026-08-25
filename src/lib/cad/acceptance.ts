import { addChain, addCircle, addRect, deleteBoundary, faceArea, isInternalEdge, offsetPoints } from "@/lib/cad/engine";
import { exclusionLoops, inIrrigable } from "@/lib/cad/irrigation-geom";
import { emptyDrawing } from "@/lib/cad/types";
import { parseCadInput } from "@/lib/cad/parse";
import { dist, type Pt } from "@/lib/geometry";

function assert(name: string, ok: boolean, extra = "") {
  if (!ok) throw new Error(`FAIL ${name} ${extra}`);
  console.log(`ok  ${name}${extra ? " " + extra : ""}`);
}

function main() {
  const d0 = emptyDrawing();
  const rect = addRect(d0, { x: 0, y: 0 }, { x: 10, y: 6 }, "lawn");
  const f1 = Object.keys(rect.faces)[0]!;
  const a1 = faceArea(rect, f1);
  assert("AT5 rect 10x6 = 60", Math.abs(a1 - 60) < 1e-6, `area=${a1}`);

  const attached = addRect(rect, { x: 10, y: 0 }, { x: 13, y: 2 }, "lawn");
  const internal = Object.values(attached.edges).filter((e) => isInternalEdge(attached, e.id));
  assert("AT7 attached has internal edge", internal.length >= 1);
  const healed = internal.length ? deleteBoundary(attached, internal[0]!.id).drawing : attached;
  const area2 = Object.keys(healed.faces).reduce((s, id) => s + faceArea(healed, id), 0);
  assert("AT7 heal ~66 m²", Math.abs(area2 - 66) < 0.2, `area=${area2.toFixed(3)} faces=${Object.keys(healed.faces).length}`);

  const circ = addCircle(emptyDrawing(), { x: 0, y: 0 }, 2, "lawn");
  const fc = Object.keys(circ.faces)[0]!;
  const ac = faceArea(circ, fc);
  assert("circle area ~ πr²", Math.abs(ac - Math.PI * 4) < 0.15, `area=${ac.toFixed(3)}`);

  const p = parseCadInput("5m", true);
  assert("AT1 parse 5m", p.ok && p.kind === "length" && Math.abs(p.meters - 5) < 1e-9);
  const p2 = parseCadInput("10x6", true);
  assert("AT5 parse 10x6", p2.ok && p2.kind === "size" && p2.width === 10 && p2.height === 6);

  const line: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const off = offsetPoints(line, 0.5);
  assert("AT15 offset 0.50", Math.abs(off[0]!.y - 0.5) < 1e-6 || Math.abs(off[0]!.y + 0.5) < 1e-6, `y=${off[0]!.y}`);

  const open = addChain(emptyDrawing(), [{ x: 0, y: 0 }, { x: 5, y: 0 }], false, "lawn");
  assert("AT1 chain 5m", Math.abs(dist(open.vertices[Object.keys(open.vertices)[0]!]!, open.vertices[Object.keys(open.vertices)[1]!]!) - 5) < 1e-6);

  let scene = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 20, y: 10 }, "lawn");
  scene = addRect(scene, { x: 5, y: 2 }, { x: 10, y: 7 }, "building");
  const holes = exclusionLoops(scene);
  assert("building is exclusion", holes.length >= 1);
  assert("house interior not irrigable", !inIrrigable({ x: 7.5, y: 4.5 }, scene));
  assert("lawn is irrigable", inIrrigable({ x: 1, y: 1 }, scene));

  console.log("acceptance ok");
}

main();
