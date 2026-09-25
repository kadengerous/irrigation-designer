import { plantName } from "@/lib/catalog-localization";
import { text as uiText } from "@/lib/i18n";
import { Circle, Group, Line, Text } from "react-konva";
import type Konva from "konva";
import type { CadPlant } from "@/lib/cad/types";
import { plantOutline, plantSymbol, plantInk } from "@/lib/plant-symbol";

export function PlantGlyph({ plant, x, y, px, selected, interactive, onBegin, onResize, showLabel }: {
  plant: CadPlant; x: number; y: number; px: number; selected: boolean; interactive: boolean; showLabel: boolean;
  onBegin: (e: Konva.KonvaEventObject<PointerEvent | TouchEvent>) => void;
  onResize: (e: Konva.KonvaEventObject<PointerEvent | TouchEvent>) => void;
}) {
  const r = plant.r * px, symbol = plantSymbol(plant), ink = plantInk(plant.kind);
  return <Group x={x} y={y} listening={interactive}>
    <Group onPointerDown={onBegin} onTouchStart={onBegin} onClick={e => { e.cancelBubble = true; }} onTap={e => { e.cancelBubble = true; }}>
      <Circle radius={Math.max(r, 12)} fill="rgba(0,0,0,0.001)" />
      <Line points={plantOutline(symbol, r)} closed fill={`${ink}28`} stroke={ink} strokeWidth={selected ? 1.8 : 1.2} listening={false} />
      {(symbol === "conifer" ? 12 : 6) > 0 && Array.from({ length: symbol === "conifer" ? 12 : 6 }, (_, i) => {
        const a = i / (symbol === "conifer" ? 12 : 6) * Math.PI * 2;
        return <Line key={i} points={[Math.cos(a) * r * 0.17, Math.sin(a) * r * 0.17, Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7]} stroke={ink} opacity={0.55} strokeWidth={0.8} listening={false} />;
      })}
      <Circle radius={Math.min(4, Math.max(2, r * 0.08))} fill={ink} listening={false} />
      {selected && <Circle radius={r + 4} stroke="#54b4ef" strokeWidth={1.5} dash={[5, 4]} listening={false} />}
      {showLabel && r >= 16 && <Text y={r + 10} x={-110} width={220} align="center" text={plant.catalog ? plantName(plant.catalog) : uiText("plant")} fontSize={12} fill={ink} stroke="white" strokeWidth={2} fillAfterStrokeEnabled listening={false} />}
    </Group>
    {selected && !plant.locked && <Circle x={r} radius={6} hitStrokeWidth={18} fill="white" stroke="#54b4ef" strokeWidth={2} onPointerDown={onResize} onTouchStart={onResize} />}
  </Group>;
}
