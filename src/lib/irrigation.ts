/** Plot geometry (meters) and Hunter MP Rotator layout. Origin: NW corner of lawn, +x east, +y south. */

export const LAWN_W = 15.1;
export const LAWN_H = 16.4;
export const STEP_1 = 1.0;
export const STEP_1_5 = 1.5;
export const STEP_1_43 = 1.43;
export const STEP_2_5 = 2.5;

/** Inner L-corner at the tiles (east face of the house jog). */
export const JOG_X = STEP_1 + STEP_1_43; // 2.43
export const JOG_Y_MID = LAWN_H - STEP_2_5; // 13.9
export const JOG_Y_TOP = JOG_Y_MID - STEP_1_5; // 12.4

export const HOUSE_WING_W = 3.2;
export const HOUSE_WING_H = 6.02;
export const HOUSE_WING_Y = JOG_Y_TOP - HOUSE_WING_H; // 6.38

export const TILE_H = 8.5;
export const TILE_OVERHANG = 0.45;

export const POC = { x: 0, y: 2.15 };

/** Lawn vertices, clockwise from NW. */
export const LAWN_POINTS: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: LAWN_W, y: 0 },
  { x: LAWN_W, y: LAWN_H },
  { x: JOG_X, y: LAWN_H },
  { x: JOG_X, y: JOG_Y_MID },
  { x: STEP_1, y: JOG_Y_MID },
  { x: STEP_1, y: JOG_Y_TOP },
  { x: 0, y: JOG_Y_TOP },
];

export function polygonPath(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
}

export function shoelace(pts: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export const LAWN_AREA = shoelace(LAWN_POINTS);

export type NozzleSku = "MP3000-90" | "MP3000-360" | "MP2000-90" | "MP2000-210";

export type NozzleSpec = {
  sku: NozzleSku;
  series: "MP2000" | "MP3000";
  hunterSku: string;
  colorName: string;
  /** Hex used only on the plan glyph (token-mapped in CSS via data-attr). */
  colorToken: "nozzle-blue" | "nozzle-grey" | "nozzle-black" | "nozzle-green";
  arcRange: string;
  rMin: number;
  rMax: number;
};

export const NOZZLES: Record<NozzleSku, NozzleSpec> = {
  "MP3000-90": {
    sku: "MP3000-90",
    series: "MP3000",
    hunterSku: "MP300090",
    colorName: "синий",
    colorToken: "nozzle-blue",
    arcRange: "90–210°",
    rMin: 6.7,
    rMax: 9.1,
  },
  "MP3000-360": {
    sku: "MP3000-360",
    series: "MP3000",
    hunterSku: "MP3000360",
    colorName: "серый",
    colorToken: "nozzle-grey",
    arcRange: "360°",
    rMin: 6.7,
    rMax: 9.1,
  },
  "MP2000-90": {
    sku: "MP2000-90",
    series: "MP2000",
    hunterSku: "MP200090",
    colorName: "чёрный",
    colorToken: "nozzle-black",
    arcRange: "90–210°",
    rMin: 4.0,
    rMax: 6.4,
  },
  "MP2000-210": {
    sku: "MP2000-210",
    series: "MP2000",
    hunterSku: "MP2000210",
    colorName: "зелёный",
    colorToken: "nozzle-green",
    arcRange: "210–270°",
    rMin: 4.0,
    rMax: 6.4,
  },
};

/** Flow at 2.8 bar, l/min. Matched precip ~10 mm/h. */
export function flowLpm(sku: NozzleSku, arc: number): number {
  const full: Record<NozzleSku, number> = {
    "MP3000-90": 13.7,
    "MP3000-360": 13.7,
    "MP2000-90": 6.1,
    "MP2000-210": 6.1,
  };
  return round1((full[sku] * arc) / 360);
}

export type Head = {
  id: string;
  n: number;
  x: number;
  y: number;
  sku: NozzleSku;
  arc: number;
  /** Start angle, 0 = east, clockwise (y-down). */
  start: number;
  r: number;
  zone: 1 | 2 | 3;
  title: string;
  note: string;
};

const MX = LAWN_W / 2; // 7.55
const MY = LAWN_H / 2; // 8.2
const SX = (JOG_X + LAWN_W) / 2; // 8.765 south-edge midpoint of remaining lawn

export const HEADS: Head[] = [
  {
    id: "s1",
    n: 1,
    x: 0,
    y: 0,
    sku: "MP3000-90",
    arc: 90,
    start: 0,
    r: 8.0,
    zone: 1,
    title: "СЗ угол",
    note: "У стены дома, рядом с проколом. 90° в газон.",
  },
  {
    id: "s2",
    n: 2,
    x: MX,
    y: 0,
    sku: "MP3000-90",
    arc: 180,
    start: 0,
    r: 8.0,
    zone: 1,
    title: "Север",
    note: "Середина северной границы. Полукруг на юг.",
  },
  {
    id: "s3",
    n: 3,
    x: LAWN_W,
    y: 0,
    sku: "MP3000-90",
    arc: 90,
    start: 90,
    r: 8.0,
    zone: 1,
    title: "СВ угол",
    note: "Северо-восточный угол участка.",
  },
  {
    id: "s4",
    n: 4,
    x: 0,
    y: MY,
    sku: "MP3000-90",
    arc: 180,
    start: 270,
    r: 8.0,
    zone: 1,
    title: "Запад",
    note: "Вдоль фасада дома. Полукруг в газон, на дом не бьёт.",
  },
  {
    id: "s5",
    n: 5,
    x: MX,
    y: MY,
    sku: "MP3000-360",
    arc: 360,
    start: 0,
    r: 8.2,
    zone: 2,
    title: "Центр",
    note: "Полнокруговая MP3000-360. Самый расходный дождь.",
  },
  {
    id: "s6",
    n: 6,
    x: LAWN_W,
    y: MY,
    sku: "MP3000-90",
    arc: 180,
    start: 90,
    r: 8.2,
    zone: 2,
    title: "Восток",
    note: "Восточная граница. Полукруг на запад.",
  },
  {
    id: "s7",
    n: 7,
    x: LAWN_W,
    y: LAWN_H,
    sku: "MP3000-90",
    arc: 90,
    start: 180,
    r: 8.2,
    zone: 2,
    title: "ЮВ угол",
    note: "Стык газона и плитки. 90° внутрь газона.",
  },
  {
    id: "s8",
    n: 8,
    x: SX,
    y: LAWN_H,
    sku: "MP3000-90",
    arc: 180,
    start: 180,
    r: 8.2,
    zone: 3,
    title: "Юг",
    note: "По границе с плиткой. Полукруг на север, плитку не поливает.",
  },
  {
    id: "s9",
    n: 9,
    x: JOG_X,
    y: LAWN_H,
    sku: "MP2000-90",
    arc: 90,
    start: 270,
    r: 6.4,
    zone: 3,
    title: "ЮЗ у плитки",
    note: "Внутренний угол L. MP2000 — короче шаг до дома.",
  },
  {
    id: "s10",
    n: 10,
    x: STEP_1,
    y: JOG_Y_TOP,
    sku: "MP2000-210",
    arc: 270,
    start: 180,
    r: 4.5,
    zone: 3,
    title: "Уступ дома",
    note: "270° вокруг внешнего угла дома. Закрывает ступень 1,0 / 1,5 / 1,43.",
  },
];

export const ZONES: {
  id: 1 | 2 | 3;
  title: string;
  subtitle: string;
}[] = [
  { id: 1, title: "Зона 1", subtitle: "Север и запад" },
  { id: 2, title: "Зона 2", subtitle: "Центр и восток" },
  { id: 3, title: "Зона 3", subtitle: "Юг и дом" },
];

export function zoneHeads(z: 1 | 2 | 3): Head[] {
  return HEADS.filter((h) => h.zone === z);
}

export function zoneFlow(z: 1 | 2 | 3): number {
  return round1(zoneHeads(z).reduce((s, h) => s + flowLpm(h.sku, h.arc), 0));
}

export const TOTAL_FLOW = round1(HEADS.reduce((s, h) => s + flowLpm(h.sku, h.arc), 0));

export type BomRow = {
  sku: string;
  name: string;
  qty: number;
  unit: string;
  note?: string;
};

export function billOfMaterials(): BomRow[] {
  const nozzles = new Map<NozzleSku, number>();
  for (const h of HEADS) nozzles.set(h.sku, (nozzles.get(h.sku) ?? 0) + 1);

  const rows: BomRow[] = [
    {
      sku: "PROS-04-PRS40",
      name: "Hunter Pro-Spray PRS40, 10 см",
      qty: HEADS.length,
      unit: "шт",
      note: "Корпус с регулятором 2,8 бар",
    },
  ];
  for (const [sku, qty] of nozzles) {
    const spec = NOZZLES[sku];
    rows.push({
      sku: spec.hunterSku,
      name: `Форсунка ${sku} (${spec.colorName})`,
      qty,
      unit: "шт",
      note: spec.arcRange,
    });
  }
  rows.push(
    {
      sku: "PGV-101-G-B",
      name: "Клапан Hunter PGV-101 1″",
      qty: 3,
      unit: "шт",
      note: "По одному на зону",
    },
    {
      sku: "X2-400",
      name: "Контроллер Hunter X2, 4 станции",
      qty: 1,
      unit: "шт",
      note: "Четвёртая станция — запас",
    },
    {
      sku: "SJ-506",
      name: "Swing Joint ½″ × 15 см",
      qty: HEADS.length,
      unit: "шт",
    },
    {
      sku: "PE-32",
      name: "Труба ПНД 32 мм",
      qty: 55,
      unit: "м",
      note: "Магистраль от прокола",
    },
    {
      sku: "PE-25",
      name: "Труба ПНД 25 мм",
      qty: 40,
      unit: "м",
      note: "Отводы к дождям",
    },
  );
  return rows;
}

/** Schematic PE main: west wall, then laterals along lawn edges. */
export const PIPES: { x1: number; y1: number; x2: number; y2: number; kind: "main" | "lat" }[] = [
  { x1: POC.x, y1: POC.y, x2: 0, y2: 0, kind: "main" },
  { x1: POC.x, y1: POC.y, x2: 0, y2: JOG_Y_TOP, kind: "main" },
  { x1: 0, y1: 0, x2: LAWN_W, y2: 0, kind: "lat" },
  { x1: 0, y1: MY, x2: LAWN_W, y2: MY, kind: "lat" },
  { x1: LAWN_W, y1: 0, x2: LAWN_W, y2: LAWN_H, kind: "lat" },
  { x1: JOG_X, y1: LAWN_H, x2: LAWN_W, y2: LAWN_H, kind: "lat" },
  { x1: 0, y1: JOG_Y_TOP, x2: STEP_1, y2: JOG_Y_TOP, kind: "lat" },
];

export function wedgePath(
  x: number,
  y: number,
  r: number,
  startDeg: number,
  arcDeg: number,
): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  if (arcDeg >= 359) {
    const n = 48;
    let d = "";
    for (let i = 0; i <= n; i++) {
      const a = rad((360 * i) / n);
      d += `${i === 0 ? "M" : "L"} ${(x + r * Math.cos(a)).toFixed(3)} ${(y + r * Math.sin(a)).toFixed(3)} `;
    }
    return d + "Z";
  }
  const n = Math.max(12, Math.ceil(arcDeg / 6));
  let d = `M ${x} ${y}`;
  for (let i = 0; i <= n; i++) {
    const a = rad(startDeg + (arcDeg * i) / n);
    d += ` L ${(x + r * Math.cos(a)).toFixed(3)} ${(y + r * Math.sin(a)).toFixed(3)}`;
  }
  return d + " Z";
}

export function fmtM(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: n % 1 === 0 ? 0 : 1, maximumFractionDigits: 2 });
}

export function fmt1(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
