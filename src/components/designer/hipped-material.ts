import type Konva from "konva";
import type { Context } from "konva/lib/Context";
import { faceTexture } from "@/lib/cad/types";
import { roofPatternTransform, textureFrame } from "@/lib/cad/texture-mapping";
import { gableRoof, polygonHipRoof, type RoofLayout } from "@/lib/cad/hip-roof";
import type { Pt } from "@/lib/geometry";

/** Read live Konva coordinates so editing, rotation and resizing keep the roof attached. */
export function materialGeometry(node: Konva.Shape) {
  const type = node.getClassName();
  const flat: number[] = node.getAttr("points") ?? [];
  const points = [];
  for (let i = 0; i + 1 < flat.length; i += 2) points.push({ x: flat[i]!, y: flat[i + 1]! });
  return { points, type: type === "Circle" ? "circle" : "poly",
    radius: type === "Circle" ? node.getAttr("radius") as number : undefined,
    ellipse: type === "Ellipse" ? { rx: node.getAttr("radiusX") as number, ry: node.getAttr("radiusY") as number } : undefined };
}

function boundaryPath(node: Konva.Shape, geometry: ReturnType<typeof materialGeometry>) {
  const path = new Path2D();
  if (geometry.radius) path.arc(0, 0, geometry.radius, 0, Math.PI * 2);
  else if (geometry.ellipse) path.ellipse(0, 0, geometry.ellipse.rx, geometry.ellipse.ry, 0, 0, Math.PI * 2);
  else {
    const holes: { x: number; y: number }[][] = node.getAttr("materialHoles") ?? [];
    for (const ring of [geometry.points, ...holes]) {
      ring.forEach((point, i) => i ? path.lineTo(point.x, point.y) : path.moveTo(point.x, point.y));
      path.closePath();
    }
  }
  return path;
}

/** Decorate the existing shape, retaining its hit region and the coverage clipping. */
export function bindHippedMaterial(node: Konva.Shape, fill: string) {
  const texture = faceTexture(fill);
  if (!texture?.roof || (node.getClassName() === "Line" && !node.getAttr("closed"))) return;
  const previous = node.getAttr("sceneFunc");
  const original = node.getSceneFunc();
  let lastKey = "", lastRoof: RoofLayout | null = null;
  const render = function(context: Context, shape: Konva.Shape) {
    original.call(shape, context, shape);
    if ("hitCanvas" in context.getCanvas() || !shape.fillEnabled()) return;
    const geometry = materialGeometry(shape), frame = textureFrame(geometry);
    const holes: Pt[][] = shape.getAttr("materialHoles") ?? [];
    const key = JSON.stringify([geometry, holes]);
    if (key !== lastKey) {
      lastKey = key;
      if (texture.roof === "gable") lastRoof = gableRoof(frame.width, frame.height);
      else {
        const radians = frame.rotation * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
        const local = (p: Pt) => ({ x: (p.x - frame.x) * c + (p.y - frame.y) * s, y: -(p.x - frame.x) * s + (p.y - frame.y) * c });
        const points = geometry.radius || geometry.ellipse
          ? Array.from({ length: 48 }, (_, i) => ({ x: frame.width / 2 * (1 + Math.cos(i * Math.PI / 24)), y: frame.height / 2 * (1 + Math.sin(i * Math.PI / 24)) }))
          : geometry.points.map(local);
        lastRoof = polygonHipRoof(points, holes.map(ring => ring.map(local)));
      }
    }
    const roof = lastRoof;
    const image = shape.fillPatternImage();
    if (!roof || !image) return;
    const ctx = context._context, boundary = boundaryPath(shape, geometry);
    const pattern = ctx.createPattern(image, "repeat");
    if (!pattern) return;
    ctx.save();
    ctx.clip(boundary, "evenodd");
    ctx.translate(frame.x, frame.y);
    ctx.rotate(frame.rotation * Math.PI / 180);
    roof.planes.forEach((points, i) => {
      ctx.beginPath();
      points.forEach((point, j) => j ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath();
      const edgeAngle = roof.angles[i]! * Math.PI / 180;
      const sx = shape.fillPatternScaleX(), sy = shape.fillPatternScaleY();
      pattern.setTransform(roofPatternTransform(fill, roof.angles[i]!, roof.eaves[i]![0], sx, sy));
      ctx.fillStyle = pattern; ctx.fill();
      const shade = .16 * Math.cos(edgeAngle) - .12 * Math.sin(edgeAngle);
      ctx.fillStyle = shade >= 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`; ctx.fill();
    });
    ctx.beginPath();
    roof.ribs.forEach(([a, b]) => { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); });
    ctx.strokeStyle = "rgba(20,28,32,.65)";
    ctx.lineWidth = 1.25 / Math.max(.01, Math.sqrt(Math.abs(shape.scaleX() * shape.scaleY())));
    ctx.lineJoin = "round"; ctx.stroke();
    ctx.restore();
    // Redraw the outline above the slopes, including selection and courtyard edges.
    if (shape.strokeEnabled() && shape.stroke()) {
      ctx.save(); ctx.strokeStyle = shape.stroke(); ctx.lineWidth = shape.strokeWidth();
      ctx.lineJoin = shape.lineJoin(); ctx.stroke(boundary); ctx.restore();
    }
  };
  node.sceneFunc(render);
  return () => { if (node.getAttr("sceneFunc") === render) node.setAttr("sceneFunc", previous); };
}
