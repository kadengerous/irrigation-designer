import { useLayoutEffect, useRef } from "react";
import { Image as KImage, Transformer } from "react-konva";
import type Konva from "konva";
import { useProject } from "@/lib/project-store";
import type { Underlay } from "@/lib/project-types";

export function ReferenceCanvas({ underlay: u, image, px, panX, panY, readOnly }: {
  underlay: Underlay; image: HTMLImageElement; px: number; panX: number; panY: number; readOnly: boolean;
}) {
  const open = useProject(s => s.referenceOpen), tool = useProject(s => s.tool);
  const node = useRef<Konva.Image>(null), transformer = useRef<Konva.Transformer>(null);
  const editable = !readOnly && open && !u.locked && tool !== "scale";
  useLayoutEffect(() => {
    if (editable && node.current && transformer.current) transformer.current.nodes([node.current]);
  }, [editable, u.width, u.height, u.rotation]);
  const commit = () => {
    const n = node.current; if (!n) return;
    const width = u.width * n.scaleX(), height = u.height * n.scaleY();
    n.scaleX(1); n.scaleY(1);
    useProject.getState().patchUnderlay({ x: (n.x() - panX) / px, y: (n.y() - panY) / px,
      width, height, rotation: n.rotation() });
  };
  return <>
    <KImage ref={node} name="reference-image" image={image} x={panX + u.x * px} y={panY + u.y * px}
      width={u.width * px} height={u.height * px} opacity={u.opacity} rotation={u.rotation}
      listening={editable} draggable={editable}
      onMouseDown={e => { e.cancelBubble = true; }}
      onTouchStart={e => { if (e.evt.touches.length === 1) e.cancelBubble = true; else node.current?.stopDrag(); }}
      onClick={e => { e.cancelBubble = true; }} onTap={e => { e.cancelBubble = true; }}
      onDragEnd={e => { e.cancelBubble = true; commit(); }} onTransformEnd={commit} />
    {editable && <Transformer ref={transformer} keepRatio flipEnabled={false} rotateEnabled
      enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
      borderStroke="#e78b38" borderStrokeWidth={1} anchorStroke="#e78b38" anchorFill="#fff" anchorSize={10} anchorCornerRadius={5}
      onMouseDown={e => { e.cancelBubble = true; }} onTouchStart={e => { e.cancelBubble = true; }}
      boundBoxFunc={(oldBox, newBox) => newBox.width < 12 || newBox.height < 12 ? oldBox : newBox} />}
  </>;
}
