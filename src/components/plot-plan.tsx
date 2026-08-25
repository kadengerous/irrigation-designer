import {
  HEADS,
  HOUSE_WING_H,
  HOUSE_WING_W,
  HOUSE_WING_Y,
  JOG_X,
  JOG_Y_MID,
  JOG_Y_TOP,
  LAWN_H,
  LAWN_POINTS,
  LAWN_W,
  NOZZLES,
  PIPES,
  POC,
  STEP_1,
  STEP_1_43,
  STEP_1_5,
  STEP_2_5,
  TILE_H,
  TILE_OVERHANG,
  fmtM,
  polygonPath,
  wedgePath,
  type Head,
} from "@/lib/irrigation";
import { cn } from "@/lib/utils";

const VB = {
  x: -HOUSE_WING_W - 2.6,
  y: -2.4,
  w: LAWN_W + HOUSE_WING_W + 5.4,
  h: LAWN_H + TILE_H + 4.2,
};

type Props = {
  selectedId: string | null;
  hoveredId: string | null;
  showCoverage: boolean;
  showPipes: boolean;
  zoneFilter: 0 | 1 | 2 | 3;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
};

export function PlotPlan({
  selectedId,
  hoveredId,
  showCoverage,
  showPipes,
  zoneFilter,
  onSelect,
  onHover,
}: Props) {
  const lawnD = polygonPath(LAWN_POINTS);
  const houseD = [
    { x: -HOUSE_WING_W, y: HOUSE_WING_Y },
    { x: 0, y: HOUSE_WING_Y },
    { x: 0, y: JOG_Y_TOP },
    { x: STEP_1, y: JOG_Y_TOP },
    { x: STEP_1, y: JOG_Y_MID },
    { x: JOG_X, y: JOG_Y_MID },
    { x: JOG_X, y: LAWN_H },
    { x: -HOUSE_WING_W, y: LAWN_H },
  ];

  const tileX = -HOUSE_WING_W;
  const tileW = LAWN_W + HOUSE_WING_W + TILE_OVERHANG;

  return (
    <div
      className="relative w-full min-h-72 overflow-hidden bg-surface-2"
      style={{ aspectRatio: `${VB.w} / ${VB.h}` }}
    >
    <svg
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full select-none"
      role="img"
      aria-label="Чертёж газона с расстановкой спринклеров Hunter"
    >
      <defs>
        <pattern id="hatch-tile" patternUnits="userSpaceOnUse" width="0.55" height="0.55" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="0.55" stroke="var(--color-tile-line)" strokeWidth="0.06" />
        </pattern>
        <pattern id="hatch-house" patternUnits="userSpaceOnUse" width="0.5" height="0.5" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="0.5" stroke="var(--color-house-ink)" strokeWidth="0.05" opacity="0.45" />
        </pattern>
        <clipPath id="clip-lawn">
          <path d={lawnD} />
        </clipPath>
      </defs>

      <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill="var(--color-surface-2)" />

      <rect
        x={tileX}
        y={LAWN_H}
        width={tileW}
        height={TILE_H}
        fill="var(--color-tile)"
        stroke="var(--color-paper-ink)"
        strokeWidth="0.045"
      />
      <rect x={tileX} y={LAWN_H} width={tileW} height={TILE_H} fill="url(#hatch-tile)" />
      <text
        x={tileX + tileW / 2}
        y={LAWN_H + TILE_H / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-house-ink)"
        fontSize="0.85"
        fontFamily="var(--font-sans)"
        fontWeight="600"
        letterSpacing="0.18"
      >
        ПЛИТКА
      </text>

      <path
        d={polygonPath(houseD)}
        fill="var(--color-house)"
        stroke="var(--color-paper-ink)"
        strokeWidth="0.045"
      />
      <path d={polygonPath(houseD)} fill="url(#hatch-house)" />
      <text
        x={-HOUSE_WING_W / 2}
        y={HOUSE_WING_Y + HOUSE_WING_H / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-house-ink)"
        fontSize="0.52"
        fontFamily="var(--font-sans)"
        fontWeight="600"
        letterSpacing="0.12"
      >
        ДОМ
      </text>

      <path d={lawnD} fill="var(--color-lawn-wash)" stroke="var(--color-paper-ink)" strokeWidth="0.07" />

      {showCoverage &&
        HEADS.map((h) => {
          const active = zoneFilter === 0 || h.zone === zoneFilter;
          const focus = selectedId === h.id || hoveredId === h.id;
          const dim = selectedId && selectedId !== h.id;
          if (!active) return null;
          const d = wedgePath(h.x, h.y, h.r, h.start, h.arc);
          return (
            <g key={`cov-${h.id}`}>
              {focus && (
                <path
                  d={d}
                  fill="none"
                  stroke={`var(--color-zone-${h.zone})`}
                  strokeWidth="0.06"
                  opacity="0.45"
                  strokeDasharray="0.18 0.12"
                />
              )}
              <path
                d={d}
                clipPath="url(#clip-lawn)"
                fill={`var(--color-zone-${h.zone})`}
                opacity={dim ? 0.12 : focus ? 0.42 : 0.26}
              />
            </g>
          );
        })}

      <text
        x={LAWN_W * 0.62}
        y={LAWN_H * 0.33}
        textAnchor="middle"
        fill="var(--color-lawn-deep)"
        fontSize="1.15"
        fontFamily="var(--font-display)"
        fontWeight="500"
        letterSpacing="0.28"
        opacity="0.7"
      >
        ГАЗОН
      </text>

      {showPipes && (
        <g fill="none" stroke="var(--color-pipe)" opacity="0.85">
          {PIPES.map((p, i) => (
            <line
              key={i}
              x1={p.x1}
              y1={p.y1}
              x2={p.x2}
              y2={p.y2}
              strokeWidth={p.kind === "main" ? 0.12 : 0.07}
              strokeLinecap="round"
            />
          ))}
        </g>
      )}

      <DimH x1={0} x2={LAWN_W} y={-0.85} label={`${fmtM(LAWN_W)} м`} />
      <DimV x={LAWN_W + 0.95} y1={0} y2={LAWN_H} label={`${fmtM(LAWN_H)} м`} />
      <DimH x1={JOG_X} x2={JOG_X + 3.3} y={LAWN_H + 0.55} label={`${fmtM(3.3)} м`} />
      <DimV x={JOG_X + 0.55} y1={JOG_Y_MID} y2={LAWN_H} label={`${fmtM(STEP_2_5)}`} />
      <DimH x1={STEP_1} x2={JOG_X} y={JOG_Y_MID - 0.45} label={`${fmtM(STEP_1_43)}`} inside />
      <DimV x={STEP_1 + 0.42} y1={JOG_Y_TOP} y2={JOG_Y_MID} label={`${fmtM(STEP_1_5)}`} />
      <DimH x1={0} x2={STEP_1} y={JOG_Y_TOP - 0.4} label={`${fmtM(STEP_1)}`} inside />
      <DimV x={-HOUSE_WING_W - 0.7} y1={HOUSE_WING_Y} y2={JOG_Y_TOP} label={`${fmtM(HOUSE_WING_H)} м`} />

      <PocMarker />

      {HEADS.map((h) => (
        <HeadMark
          key={h.id}
          head={h}
          selected={selectedId === h.id}
          hovered={hoveredId === h.id}
          dimmed={Boolean(selectedId && selectedId !== h.id)}
          hidden={zoneFilter !== 0 && h.zone !== zoneFilter}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}

      <NorthArrow x={LAWN_W + 2.15} y={2.1} />
      <ScaleBar x={-HOUSE_WING_W} y={LAWN_H + TILE_H + 1.35} />
    </svg>
    </div>
  );
}

function HeadMark({
  head,
  selected,
  hovered,
  dimmed,
  hidden,
  onSelect,
  onHover,
}: {
  head: Head;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  hidden: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  if (hidden) return null;
  const spec = NOZZLES[head.sku];
  const r = selected || hovered ? 0.32 : 0.26;
  return (
    <g
      className={cn("cursor-pointer", dimmed && "opacity-40")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(selected ? null : head.id);
      }}
      onMouseEnter={() => onHover(head.id)}
      onMouseLeave={() => onHover(null)}
    >
      <circle cx={head.x} cy={head.y} r={0.7} fill="transparent" />
      <circle
        cx={head.x}
        cy={head.y}
        r={r + 0.1}
        fill="var(--color-surface-2)"
        stroke={selected ? "var(--color-hunter)" : "var(--color-paper-ink)"}
        strokeWidth={selected ? 0.08 : 0.05}
      />
      <circle cx={head.x} cy={head.y} r={r * 0.55} fill={`var(--color-${spec.colorToken})`} />
      <text
        x={head.x}
        y={head.y - 0.52}
        textAnchor="middle"
        fill="var(--color-ink)"
        fontSize="0.42"
        fontFamily="var(--font-sans)"
        fontWeight="700"
      >
        {head.n}
      </text>
    </g>
  );
}

function PocMarker() {
  return (
    <g>
      <circle
        cx={POC.x}
        cy={POC.y}
        r={0.38}
        fill="var(--color-surface-2)"
        stroke="var(--color-pipe)"
        strokeWidth="0.07"
      />
      <circle cx={POC.x} cy={POC.y} r={0.14} fill="var(--color-pipe)" />
      <text
        x={POC.x - 0.55}
        y={POC.y - 0.55}
        textAnchor="end"
        fill="var(--color-pipe)"
        fontSize="0.42"
        fontFamily="var(--font-sans)"
        fontWeight="600"
      >
        Прокол
      </text>
    </g>
  );
}

function DimH({
  x1,
  x2,
  y,
  label,
  inside,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
  inside?: boolean;
}) {
  const mid = (x1 + x2) / 2;
  const tick = inside ? 0.18 : 0.18;
  return (
    <g fill="none" stroke="var(--color-paper-ink)" strokeWidth="0.03" opacity="0.75">
      <line x1={x1} y1={y - tick} x2={x1} y2={y + tick} />
      <line x1={x2} y1={y - tick} x2={x2} y2={y + tick} />
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <text
        x={mid}
        y={inside ? y - 0.18 : y - 0.16}
        textAnchor="middle"
        fill="var(--color-paper-ink)"
        stroke="none"
        fontSize="0.4"
        fontFamily="var(--font-sans)"
        fontWeight="600"
        opacity="1"
      >
        {label}
      </text>
    </g>
  );
}

function DimV({ x, y1, y2, label }: { x: number; y1: number; y2: number; label: string }) {
  const mid = (y1 + y2) / 2;
  return (
    <g fill="none" stroke="var(--color-paper-ink)" strokeWidth="0.03" opacity="0.75">
      <line x1={x - 0.18} y1={y1} x2={x + 0.18} y2={y1} />
      <line x1={x - 0.18} y1={y2} x2={x + 0.18} y2={y2} />
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <text
        x={x + 0.22}
        y={mid}
        fill="var(--color-paper-ink)"
        stroke="none"
        fontSize="0.4"
        fontFamily="var(--font-sans)"
        fontWeight="600"
        opacity="1"
        transform={`rotate(90 ${x + 0.22} ${mid})`}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}

function NorthArrow({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon points="0,-0.55 0.22,0.4 -0.22,0.4" fill="var(--color-ink)" />
      <text
        x="0"
        y="0.85"
        textAnchor="middle"
        fill="var(--color-ink)"
        fontSize="0.38"
        fontFamily="var(--font-sans)"
        fontWeight="700"
      >
        С
      </text>
    </g>
  );
}

function ScaleBar({ x, y }: { x: number; y: number }) {
  const segs = [0, 1, 2, 5];
  return (
    <g transform={`translate(${x} ${y})`}>
      {segs.slice(0, -1).map((s, i) => {
        const next = segs[i + 1]!;
        return (
          <rect
            key={s}
            x={s}
            y={0}
            width={next - s}
            height={0.22}
            fill={i % 2 === 0 ? "var(--color-ink)" : "var(--color-surface-2)"}
            stroke="var(--color-ink)"
            strokeWidth="0.03"
          />
        );
      })}
      {segs.map((s) => (
        <text
          key={s}
          x={s}
          y={-0.18}
          textAnchor="middle"
          fill="var(--color-muted)"
          fontSize="0.32"
          fontFamily="var(--font-sans)"
        >
          {s}
        </text>
      ))}
      <text x={5.35} y={0.2} fill="var(--color-muted)" fontSize="0.32" fontFamily="var(--font-sans)">
        м
      </text>
    </g>
  );
}
