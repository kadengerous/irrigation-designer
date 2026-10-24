import type Konva from "konva";
import { SceneCanvas } from "konva/lib/Canvas.js";
import { SceneContext } from "konva/lib/Context.js";
import type { Pt } from "@/lib/geometry";
import { MAGNIFIER_ZOOM, magnifierStrokeWidth } from "./canvas-magnifier-model";

/** Only the lens's context changes stroke widths; scene nodes and hit targets stay untouched. */
class LensContext extends SceneContext {
  strokeScale = MAGNIFIER_ZOOM;
  override setAttr(attribute: string, value: any) {
    const adjusted = attribute === "lineWidth" ? magnifierStrokeWidth(value, this.strokeScale)
      : attribute === "lineDashOffset" ? value / this.strokeScale : value;
    super.setAttr(attribute, adjusted);
  }
  override setLineDash(segments: number[]) {
    super.setLineDash(segments.map(value => value / this.strokeScale));
  }
}

/** Redraw the live vectors into a small private surface, so zoom does not fatten their strokes. */
export class MagnifierRenderer {
  private canvas = new SceneCanvas({ width: 1, height: 1, pixelRatio: 1 });
  private context = new LensContext(this.canvas);
  constructor() { this.canvas.context = this.context; }

  render(stage: Konva.Stage, focus: Pt, width: number, height: number, size: number, dpr: number, background: string, zoom = MAGNIFIER_ZOOM, excludeObjectId?:string, placement=false) {
    const canvas = this.canvas, context = this.context;
    if (canvas.getPixelRatio() !== dpr) canvas.setPixelRatio(dpr);
    if (canvas.width !== Math.round(size * dpr) || canvas.height !== Math.round(size * dpr)) canvas.setSize(size, size);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size, size);
    context.fillStyle = background;
    context.fillRect(0, 0, size, size);
    const scaleX = width / stage.width(), scaleY = height / stage.height();
    const origin = { x: focus.x / scaleX, y: focus.y / scaleY };
    const halfX = size / (2 * zoom * scaleX), halfY = size / (2 * zoom * scaleY);
    context.save();
    context.translate(size / 2 - focus.x * zoom, size / 2 - focus.y * zoom);
    context.scale(zoom * scaleX, zoom * scaleY);
    const paint = (node: Konva.Node, symbol: Konva.Node | null = null) => {
      if (!node.isVisible()) return;
      if(excludeObjectId&&node.getAttr('placementId')===excludeObjectId)return;
      if(placement&&node.hasName('magnifier-placement-overlay'))return;
      // Dimensions, zero readouts and point numbers obscure the join at 5x.
      // Skip their text only in this private view; user-authored notes remain part of the drawing.
      if ((node.getClassName() === "Text" || node.getClassName() === "TextPath") && !node.hasName("drawing-annotation")) return;
      if (node.hasName("edit-point-glyph") || node.hasName("magnifier-symbol")) symbol = node;
      if (node.getType() !== "Shape") {
        for (const child of (node as Konva.Container).getChildren()) paint(child, symbol);
        return;
      }
      const shape = node as Konva.Shape;
      const scene = shape.getSceneFunc();
      if (!scene) return;
      // Grid scene functions do not have a bounding box. Other distant objects can be skipped.
      if (shape.getClassName() !== "Shape") {
        const bounds = shape.getClientRect({ skipShadow: true });
        if (bounds.x + bounds.width < origin.x - halfX || bounds.x > origin.x + halfX ||
          bounds.y + bounds.height < origin.y - halfY || bounds.y > origin.y + halfY) return;
      }
      let transform = shape.getAbsoluteTransform().copy();
      if (symbol) {
        const root = symbol.getAbsoluteTransform();
        const local = root.copy().invert().multiply(transform);
        const compact = symbol.hasName("construction-point") ? 0.6 : 1;
        transform = root.copy().scale(compact / zoom, compact / zoom).multiply(local);
      }
      const matrix = transform.getMatrix();
      context.save();
      try {
        context.transform(matrix[0]!, matrix[1]!, matrix[2]!, matrix[3]!, matrix[4]!, matrix[5]!);
        const display = context._context.getTransform();
        context.strokeScale = shape.strokeScaleEnabled()
          ? Math.max(Math.hypot(display.a, display.b), Math.hypot(display.c, display.d)) / dpr : 1;
        context._applyOpacity(shape);
        context._applyGlobalCompositeOperation(shape);
        context._applyLineJoin(shape);
        context._applyMiterLimit(shape);
        scene.call(shape, context, shape);
      } finally { context.restore(); }
    };
    try {
      for (const layer of stage.getLayers()) paint(layer);
    } finally { context.restore(); }
    return canvas._canvas;
  }

  dispose() { this.canvas.setSize(0, 0); }
}
