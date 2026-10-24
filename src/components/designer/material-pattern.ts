import {isLawnTexture} from "@/lib/cad/lawn-pattern";
import type Konva from "konva";
import { textureFrame, texturePatternAttrs, type TextureSize } from "@/lib/cad/texture-mapping";

/** Editing handles update Konva geometry directly between React commits. */
export function bindMaterialPattern(node: Konva.Shape, fill: string, reference: TextureSize, px = 36, rotation = 0, origin?:{x:number;y:number}) {
  const update = () => {
    const type = node.getClassName();
    const flat: number[] = node.getAttr("points") ?? [];
    const points = [];
    for (let i = 0; i + 1 < flat.length; i += 2) points.push({ x: flat[i]!, y: flat[i + 1]! });
    const frame = textureFrame({ points, type: type === "Circle" ? "circle" : "poly",
      radius: type === "Circle" ? node.getAttr("radius") : undefined,
      ellipse: type === "Ellipse" ? { rx: node.getAttr("radiusX"), ry: node.getAttr("radiusY") } : undefined });
    const attrs = texturePatternAttrs(fill, frame, reference, px, rotation);
    if(origin&&isLawnTexture(fill)){
      const local=node.getTransform().copy().invert().point(origin);
      attrs.fillPatternX=local.x;attrs.fillPatternY=local.y;attrs.fillPatternRotation=rotation-node.rotation();
    }
    node.setAttrs({ ...attrs, fillPatternScaleX: attrs.fillPatternScaleX / Math.abs(node.scaleX() || 1),
      fillPatternScaleY: attrs.fillPatternScaleY / Math.abs(node.scaleY() || 1) });
  };
  const events = "pointsChange.material radiusChange.material radiusXChange.material radiusYChange.material scaleXChange.material scaleYChange.material xChange.material yChange.material rotationChange.material";
  node.on(events, update);
  update();
  return () => { node.off(events, update); };
}
