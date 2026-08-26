import { bundledPhoto } from "@/lib/catalog-photos";

export type FlowKind = "table" | "interpolated" | "matched-precip" | "none";
export type Family =
  | "mp"
  | "mp800"
  | "strip"
  | "spray"
  | "prostrip"
  | "he"
  | "fixed"
  | "short"
  | "stream"
  | "rotor"
  | "golf"
  | "st"
  | "bubbler"
  | "body";

export type PerfRow = {
  pressureBar: number;
  pressureKPa: number;
  radiusM: number;
  flowLMin: number;
  flowM3H: number;
  precipSquareMmH: number;
  precipTriangleMmH: number;
  arcDeg: number;
};

export type CatalogNozzle = {
  id: string;
  name: string;
  color: string;
  colorName: string;
  type: string;
  trajectoryDeg: number | null;
  performance: PerfRow[];
  recommendedBar?: number;
  size?: string;
};

export type CatalogItem = {
  id: string;
  sku: string;
  name: string;
  family: Family | "all";
  series: string;
  type: "nozzle" | "rotor" | "bubbler" | "body";
  colorName: string;
  color: string;
  arcMin: number;
  arcMax: number;
  rMin: number;
  rMax: number;
  rNom: number;
  precipClass: string;
  precipMmHr: number | null;
  thread: string;
  body: string;
  recommendedPressureBar: number;
  recommendedPressureMin: number;
  recommendedPressureMax: number;
  inlet: string;
  popUpMm: number | null;
  use: string;
  sourceDocument: string;
  sourceUrl: string;
  nozzles: CatalogNozzle[];
  strip?: { w: number; l: number; ox: number; oy: number };
  discontinued?: boolean;
};

const FT = 0.3048;
const GPM_L = 3.78541178;
const GPM_M3 = 0.2271247;
const IN_MM = 25.4;
const PSI: Record<number, number> = {
  25: 1.7, 30: 2.1, 35: 2.4, 40: 2.8, 45: 3.1, 50: 3.4, 55: 3.8, 60: 4.1, 65: 4.5, 70: 4.8,
};
const URL_HUNTER = "https://www.hunterirrigation.com";
const SRC_MP = "Hunter Standard MP Rotator Nozzle Performance Data";
const URL_MP = "https://www.hunterirrigation.com/irrigation-product/mp-rotator/standard-mp-rotatorr-nozzle";
const SRC_MP_EM = "Hunter CA-Cutsheet-MP-Rotator-EM / LIT-418 EM";
const SRC_MP800SR = "Hunter MP-800SR Performance Data";
const URL_MP800SR = "https://www.hunterirrigation.com/node/38356";
const SRC_MP815 = "Hunter MP-815 Performance Data";
const URL_MP815 = "https://www.hunterirrigation.com/node/434666";
const SRC_PGP = "Hunter PGP Standard Red Nozzle Performance Data";
const URL_PGP = "https://www.hunterirrigation.com/irrigation-product/rotors/pgp-adj";

function psiBar(psi: number) {
  return PSI[psi] ?? +(psi * 0.0689476).toFixed(4);
}
function P(arc: number, psi: number, ft: number, gpm: number, inHr: number): PerfRow {
  const bar = psiBar(psi);
  return {
    pressureBar: bar,
    pressureKPa: +(bar * 100).toFixed(1),
    radiusM: +(ft * FT).toFixed(4),
    flowLMin: +(gpm * GPM_L).toFixed(4),
    flowM3H: +(gpm * GPM_M3).toFixed(4),
    precipSquareMmH: +(inHr * IN_MM).toFixed(2),
    precipTriangleMmH: +(inHr * IN_MM / 0.866).toFixed(2),
    arcDeg: arc,
  };
}
function si(arc: number, bar: number, r: number, lpm: number, precip: number): PerfRow {
  return {
    pressureBar: bar,
    pressureKPa: bar * 100,
    radiusM: r,
    flowLMin: lpm,
    flowM3H: +(lpm * 0.06).toFixed(4),
    precipSquareMmH: precip,
    precipTriangleMmH: +(precip / 0.866).toFixed(2),
    arcDeg: arc,
  };
}
function nz(id: string, name: string, color: string, colorName: string, performance: PerfRow[]): CatalogNozzle {
  return { id, name, color, colorName, type: "adjustable", trajectoryDeg: null, performance };
}

const MP1000 = {
  90: [P(90, 30, 12, 0.17, 0.45), P(90, 35, 13, 0.19, 0.43), P(90, 40, 14, 0.21, 0.41), P(90, 45, 14, 0.23, 0.45), P(90, 50, 15, 0.25, 0.43), P(90, 55, 15, 0.27, 0.46)],
  180: [P(180, 30, 12, 0.34, 0.45), P(180, 35, 13, 0.38, 0.43), P(180, 40, 14, 0.42, 0.41), P(180, 45, 14, 0.44, 0.43), P(180, 50, 15, 0.5, 0.43), P(180, 55, 15, 0.51, 0.44)],
  210: [P(210, 30, 12, 0.4, 0.46), P(210, 35, 13, 0.45, 0.44), P(210, 40, 14, 0.49, 0.41), P(210, 45, 14, 0.51, 0.43), P(210, 50, 15, 0.57, 0.42), P(210, 55, 15, 0.59, 0.43)],
  270: [P(270, 30, 12, 0.48, 0.43), P(270, 35, 13, 0.53, 0.4), P(270, 40, 14, 0.63, 0.41), P(270, 45, 14, 0.67, 0.44), P(270, 50, 15, 0.72, 0.41), P(270, 55, 15, 0.75, 0.43)],
  360: [P(360, 30, 12, 0.69, 0.46), P(360, 35, 13, 0.77, 0.44), P(360, 40, 14, 0.84, 0.41), P(360, 45, 14, 0.88, 0.43), P(360, 50, 15, 0.98, 0.42), P(360, 55, 15, 1.01, 0.43)],
};
const MP2000 = {
  90: [P(90, 30, 18, 0.38, 0.45), P(90, 35, 19, 0.4, 0.43), P(90, 40, 20, 0.43, 0.41), P(90, 45, 21, 0.46, 0.4), P(90, 50, 21, 0.47, 0.41), P(90, 55, 21, 0.48, 0.42)],
  180: [P(180, 30, 17, 0.64, 0.43), P(180, 35, 18, 0.71, 0.42), P(180, 40, 19, 0.77, 0.41), P(180, 45, 20, 0.85, 0.41), P(180, 50, 21, 0.91, 0.4), P(180, 55, 21, 0.95, 0.41)],
  210: [P(210, 30, 17, 0.75, 0.43), P(210, 35, 18, 0.81, 0.41), P(210, 40, 19, 0.86, 0.39), P(210, 45, 20, 0.91, 0.38), P(210, 50, 21, 0.98, 0.37), P(210, 55, 21, 1.01, 0.38)],
  270: [P(270, 30, 17, 0.95, 0.42), P(270, 35, 18, 1.03, 0.41), P(270, 40, 19, 1.1, 0.39), P(270, 45, 20, 1.17, 0.38), P(270, 50, 21, 1.23, 0.36), P(270, 55, 21, 1.3, 0.38)],
  360: [P(360, 30, 17, 1.28, 0.43), P(360, 35, 18, 1.37, 0.41), P(360, 40, 19, 1.48, 0.39), P(360, 45, 20, 1.57, 0.38), P(360, 50, 21, 1.68, 0.37), P(360, 55, 21, 1.74, 0.38)],
};
const MP3000 = {
  90: [P(90, 30, 27, 0.76, 0.4), P(90, 35, 28, 0.82, 0.4), P(90, 40, 30, 0.86, 0.37), P(90, 45, 30, 0.9, 0.39), P(90, 50, 30, 0.95, 0.41), P(90, 55, 30, 1.01, 0.43)],
  180: [P(180, 30, 27, 1.58, 0.42), P(180, 35, 28, 1.7, 0.42), P(180, 40, 30, 1.82, 0.39), P(180, 45, 30, 1.93, 0.41), P(180, 50, 30, 2.04, 0.44), P(180, 55, 30, 2.13, 0.46)],
  210: [P(210, 30, 27, 1.84, 0.42), P(210, 35, 28, 1.99, 0.42), P(210, 40, 30, 2.12, 0.39), P(210, 45, 30, 2.25, 0.41), P(210, 50, 30, 2.37, 0.43), P(210, 55, 30, 2.49, 0.46)],
  270: [P(270, 30, 27, 2.37, 0.42), P(270, 35, 28, 2.55, 0.42), P(270, 40, 30, 2.73, 0.39), P(270, 45, 30, 2.89, 0.41), P(270, 50, 30, 3.06, 0.44), P(270, 55, 30, 3.22, 0.46)],
  360: [P(360, 30, 27, 3.15, 0.42), P(360, 35, 28, 3.4, 0.42), P(360, 40, 30, 3.64, 0.39), P(360, 45, 30, 3.86, 0.41), P(360, 50, 30, 4.07, 0.44), P(360, 55, 30, 4.27, 0.46)],
};
const MP3500 = {
  90: [P(90, 30, 34, 1.13, 0.38), P(90, 35, 34, 1.21, 0.4), P(90, 40, 35, 1.28, 0.4), P(90, 45, 35, 1.38, 0.43), P(90, 50, 35, 1.43, 0.45), P(90, 55, 35, 1.5, 0.47)],
  180: [P(180, 30, 34, 2.24, 0.37), P(180, 35, 34, 2.65, 0.44), P(180, 40, 35, 2.86, 0.45), P(180, 45, 35, 3.1, 0.49), P(180, 50, 35, 3.21, 0.5), P(180, 55, 35, 3.28, 0.52)],
  210: [P(210, 30, 34, 2.84, 0.41), P(210, 35, 34, 3.08, 0.44), P(210, 40, 35, 3.29, 0.44), P(210, 45, 35, 3.54, 0.48), P(210, 50, 35, 3.76, 0.51)],
};
const MP800SR = {
  90: [P(90, 30, 8, 0.17, 0.9), P(90, 35, 9, 0.21, 0.89), P(90, 40, 10, 0.23, 0.83), P(90, 45, 11, 0.25, 0.8), P(90, 50, 11, 0.27, 0.79), P(90, 55, 12, 0.28, 0.8)],
  180: [P(180, 30, 8, 0.33, 0.88), P(180, 35, 9, 0.38, 0.85), P(180, 40, 10, 0.42, 0.81), P(180, 45, 11, 0.46, 0.77), P(180, 50, 11, 0.48, 0.76), P(180, 55, 12, 0.5, 0.73)],
  210: [P(210, 30, 8, 0.35, 0.8), P(210, 35, 9, 0.38, 0.77), P(210, 40, 10, 0.43, 0.81), P(210, 45, 10, 0.45, 0.82), P(210, 50, 11, 0.49, 0.73), P(210, 55, 12, 0.56, 0.7)],
  360: [P(360, 30, 8, 0.66, 0.89), P(360, 35, 9, 0.71, 0.8), P(360, 40, 10, 0.78, 0.79), P(360, 45, 10, 0.85, 0.78), P(360, 50, 11, 0.88, 0.73), P(360, 55, 12, 0.98, 0.7)],
};
const MP815 = {
  90: [P(90, 35, 15, 0.46, 0.79), P(90, 40, 15, 0.49, 0.84), P(90, 45, 16, 0.52, 0.78), P(90, 50, 16, 0.55, 0.83), P(90, 55, 16, 0.58, 0.87)],
  180: [P(180, 35, 14, 0.86, 0.84), P(180, 40, 15, 0.93, 0.8), P(180, 45, 15, 0.96, 0.82), P(180, 50, 16, 1.06, 0.8), P(180, 55, 16, 1.11, 0.83)],
  210: [P(210, 35, 14, 0.96, 0.81), P(210, 40, 15, 1.1, 0.81), P(210, 45, 15, 1.16, 0.85), P(210, 50, 16, 1.24, 0.8), P(210, 55, 16, 1.3, 0.84)],
  270: [P(270, 35, 14, 1.24, 0.81), P(270, 40, 15, 1.4, 0.8), P(270, 45, 15, 1.47, 0.84), P(270, 50, 16, 1.54, 0.77), P(270, 55, 16, 1.61, 0.81)],
  360: [P(360, 35, 14, 1.7, 0.83), P(360, 40, 15, 1.87, 0.8), P(360, 45, 15, 2, 0.86), P(360, 50, 16, 2.13, 0.8), P(360, 55, 16, 2.26, 0.85)],
};

function pgpNoz(num: number, rows: number[][]): CatalogNozzle {
  return {
    id: `pgp-${num}`,
    name: `Сопло ${num}`,
    size: String(num),
    color: "#C62828",
    colorName: "красное",
    type: "standard",
    trajectoryDeg: 25,
    performance: rows.map(([psi, ft, gpm, inHr]) => P(180, psi, ft, gpm, inHr)),
  };
}
const PGP_RED = [
  pgpNoz(1, [[30, 28, 0.5, 0.12], [40, 29, 0.6, 0.14], [50, 29, 0.7, 0.16], [60, 30, 0.8, 0.17]]),
  pgpNoz(2, [[30, 29, 0.7, 0.16], [40, 30, 0.8, 0.17], [50, 30, 0.9, 0.19], [60, 31, 1, 0.2]]),
  pgpNoz(3, [[30, 30, 0.9, 0.19], [40, 31, 1, 0.2], [50, 31, 1.2, 0.24], [60, 32, 1.3, 0.24]]),
  pgpNoz(4, [[30, 32, 1.2, 0.23], [40, 33, 1.4, 0.25], [50, 34, 1.6, 0.27], [60, 34, 1.8, 0.3]]),
  pgpNoz(5, [[30, 32, 1.6, 0.3], [40, 36, 1.8, 0.27], [50, 38, 2, 0.27], [60, 38, 2.2, 0.29]]),
  pgpNoz(6, [[30, 34, 2, 0.33], [40, 36, 2.4, 0.36], [50, 38, 2.7, 0.36], [60, 38, 2.9, 0.39]]),
  pgpNoz(7, [[30, 34, 2.6, 0.43], [40, 38, 3, 0.4], [50, 40, 3.4, 0.41], [60, 40, 3.7, 0.45]]),
  pgpNoz(8, [[30, 37, 3.2, 0.45], [40, 39, 3.7, 0.47], [50, 41, 3.9, 0.45], [60, 42, 4.6, 0.5]]),
  pgpNoz(9, [[30, 38, 3.6, 0.48], [40, 41, 4.3, 0.49], [50, 44, 5.2, 0.52], [60, 45, 5.5, 0.52]]),
  pgpNoz(10, [[40, 44, 6, 0.6], [50, 46, 6.8, 0.62], [60, 47, 7.6, 0.66], [70, 49, 8.2, 0.66]]),
  pgpNoz(11, [[40, 46, 8, 0.73], [50, 48, 8.9, 0.74], [60, 50, 9.8, 0.75], [70, 51, 10.5, 0.78]]),
  pgpNoz(12, [[40, 46, 10.5, 0.96], [50, 48, 11.9, 0.99], [60, 50, 12.7, 0.98], [70, 52, 14.1, 1]]),
];

function rnz(prefix: string, size: string, color: string, colorName: string, rows: number[][], arc = 180): CatalogNozzle {
  return {
    id: `${prefix}-${size}`,
    name: `Сопло ${size}`,
    size,
    color,
    colorName,
    type: "standard",
    trajectoryDeg: 25,
    performance: rows.map(([psi, ft, gpm, inHr]) => P(arc, psi, ft, gpm, inHr ?? 0.45)),
  };
}
function rnzM(prefix: string, size: string, color: string, colorName: string, rows: number[][]): CatalogNozzle {
  return {
    id: `${prefix}-${size}`,
    name: `Сопло ${size}`,
    size,
    color,
    colorName,
    type: "standard",
    trajectoryDeg: 22,
    performance: rows.map(([bar, r, lpm]) => si(180, bar, r, lpm, 0)),
  };
}

const C = {
  red: "#C62828",
  yellow: "#C9A227",
  orange: "#C45C26",
  ltBrown: "#C9B896",
  ltGreen: "#7CB342",
  ltBlue: "#29B6F6",
  grey: "#8a8f96",
  dkBrown: "#6B4F3A",
  dkGreen: "#2E7D32",
  dkBlue: "#1565C0",
  black: "#1a1a1a",
  tan: "#C4A574",
};

const PGJ_NZ = [
  rnz("pgj", "0.50", C.red, "красное", [[30, 14, 0.42, 0.41], [40, 15, 0.5, 0.43], [50, 16, 0.58, 0.44]]),
  rnz("pgj", "0.75", C.red, "красное", [[30, 15, 0.64, 0.55], [40, 16, 0.75, 0.56], [50, 17, 0.85, 0.57]]),
  rnz("pgj", "1.0", C.red, "красное", [[30, 18, 0.85, 0.51], [40, 19, 1.0, 0.53], [50, 19, 1.1, 0.59]]),
  rnz("pgj", "1.5", C.red, "красное", [[30, 21, 1.3, 0.57], [40, 22, 1.5, 0.6], [50, 22, 1.7, 0.68]]),
  rnz("pgj", "2.0", C.red, "красное", [[30, 24, 1.7, 0.57], [40, 25, 2.0, 0.62], [50, 25, 2.3, 0.71]]),
  rnz("pgj", "2.5", C.red, "красное", [[30, 27, 2.2, 0.58], [40, 28, 2.5, 0.61], [50, 28, 2.8, 0.69]]),
  rnz("pgj", "3.0", C.red, "красное", [[30, 30, 2.5, 0.53], [40, 31, 3.0, 0.6], [50, 31, 3.4, 0.68]]),
  rnz("pgj", "4.0", C.red, "красное", [[30, 33, 3.7, 0.65], [40, 34, 4.0, 0.67], [50, 34, 4.3, 0.72]]),
];
const SRM_NZ = PGJ_NZ.map((n) => ({ ...n, id: n.id.replace("pgj-", "srm-"), color: C.dkGreen, colorName: "тёмно-зелёное" }));

const I25_NZ = [
  rnz("i25", "4", C.yellow, "жёлтое", [[40, 40, 3.8, 0.46], [50, 41, 4.3, 0.49], [60, 42, 4.7, 0.51], [70, 43, 5.1, 0.53]]),
  rnz("i25", "7", C.orange, "оранжевое", [[40, 45, 6.6, 0.63], [50, 47, 7.0, 0.61], [60, 48, 7.5, 0.63], [70, 49, 7.9, 0.63]]),
  rnz("i25", "8", C.ltBrown, "бежевое", [[40, 47, 7.7, 0.67], [50, 49, 8.3, 0.67], [60, 50, 9.2, 0.71], [70, 51, 9.9, 0.73]]),
  rnz("i25", "10", C.ltGreen, "зелёное", [[50, 51, 10.1, 0.75], [60, 52, 11.1, 0.79], [70, 53, 12.1, 0.83], [80, 54, 12.9, 0.85]]),
  rnz("i25", "13", C.ltBlue, "голубое", [[50, 53, 11.2, 0.77], [60, 54, 12.3, 0.81], [70, 55, 13.3, 0.85], [80, 55, 14.3, 0.91]]),
  rnz("i25", "15", C.grey, "серое", [[50, 56, 13.4, 0.82], [60, 57, 14.3, 0.85], [70, 57, 15.2, 0.9], [80, 58, 16.4, 0.94]]),
  rnz("i25", "18", C.red, "красное", [[50, 58, 14.5, 0.83], [60, 59, 15.7, 0.87], [70, 62, 16.9, 0.85], [80, 63, 18.2, 0.88]]),
  rnz("i25", "20", C.dkBrown, "коричневое", [[60, 62, 17.8, 0.89], [70, 63, 19.2, 0.93], [80, 64, 20.5, 0.96], [90, 65, 21.8, 0.99]]),
  rnz("i25", "23", C.dkGreen, "тёмно-зелёное", [[60, 64, 21.9, 1.03], [70, 65, 23.6, 1.08], [80, 66, 25.6, 1.13], [90, 67, 27.0, 1.16]]),
  rnz("i25", "25", C.dkBlue, "тёмно-синее", [[60, 66, 23.5, 1.04], [70, 68, 25.5, 1.06], [80, 69, 28.0, 1.13], [90, 70, 29.5, 1.16]]),
  rnz("i25", "28", C.black, "чёрное", [[70, 68, 26.9, 1.12], [80, 70, 28.7, 1.13], [90, 71, 30.6, 1.17], [100, 71, 31.5, 1.2]]),
];
const I40_NZ = [
  rnz("i40", "8", C.ltBrown, "бежевое", [[40, 44, 7.6, 0.76], [50, 45, 8.4, 0.8], [60, 46, 9.2, 0.84], [70, 46, 10.0, 0.87]]),
  rnz("i40", "10", C.ltGreen, "зелёное", [[50, 49, 10.3, 0.83], [60, 50, 11.3, 0.87], [70, 51, 12.2, 0.9], [80, 51, 13.0, 0.96]]),
  rnz("i40", "13", C.ltBlue, "голубое", [[50, 50, 11.1, 0.85], [60, 51, 12.3, 0.91], [70, 52, 13.3, 0.95], [80, 53, 14.2, 0.97]]),
  rnz("i40", "15", C.grey, "серое", [[50, 54, 13.8, 0.91], [60, 55, 15.7, 1.0], [70, 57, 16.6, 0.98], [80, 59, 18.3, 1.01]]),
  rnz("i40", "23", C.dkGreen, "тёмно-зелёное", [[60, 62, 21.3, 1.07], [70, 63, 23.0, 1.08], [80, 64, 24.5, 1.12], [90, 65, 25.9, 1.14]]),
  rnz("i40", "25", C.dkBlue, "тёмно-синее", [[60, 66, 23.9, 1.06], [70, 67, 25.8, 1.11], [80, 68, 27.7, 1.15], [90, 69, 29.5, 1.19]]),
];
const I40_ON_NZ = [
  rnz("i40on", "15", C.grey, "серое", [[50, 52, 13.0, 0.46], [60, 54, 13.2, 0.44], [70, 56, 14.4, 0.44], [80, 57, 15.5, 0.46]], 360),
  rnz("i40on", "18", C.red, "красное", [[50, 58, 13.7, 0.39], [60, 59, 15.2, 0.42], [70, 60, 16.6, 0.44], [80, 62, 17.8, 0.45]], 360),
  rnz("i40on", "20", C.dkBrown, "коричневое", [[60, 63, 19.1, 0.46], [70, 64, 20.9, 0.49], [80, 66, 22.3, 0.49], [90, 66, 23.9, 0.53]], 360),
  rnz("i40on", "23", C.dkGreen, "тёмно-зелёное", [[60, 65, 20.4, 0.47], [70, 66, 22.3, 0.49], [80, 67, 24.0, 0.52], [90, 68, 25.6, 0.53]], 360),
  rnz("i40on", "25", C.dkBlue, "тёмно-синее", [[60, 66, 22.0, 0.49], [70, 68, 24.0, 0.5], [80, 69, 25.9, 0.52], [90, 70, 27.2, 0.54]], 360),
  rnz("i40on", "28", C.black, "чёрное", [[70, 70, 28.9, 0.57], [80, 72, 30.9, 0.58], [90, 74, 32.9, 0.58], [100, 76, 33.7, 0.56]], 360),
];
const I80_NZ = [
  rnz("i80", "23", C.dkGreen, "тёмно-зелёное", [[50, 65, 20.2, 0.46], [60, 66, 22.1, 0.49], [65, 67, 23.9, 0.51], [70, 67, 24.2, 0.52], [80, 69, 25.9, 0.52]]),
  rnz("i80", "25", C.dkBlue, "тёмно-синее", [[65, 71, 28.3, 0.54], [70, 72, 29.3, 0.54], [80, 73, 31.5, 0.57], [90, 74, 33.4, 0.59], [100, 75, 35.4, 0.61]]),
  rnz("i80", "33", C.grey, "серое", [[65, 72, 30.6, 0.57], [70, 73, 31.6, 0.57], [80, 75, 33.9, 0.58], [90, 77, 35.8, 0.58], [100, 79, 37.9, 0.58]]),
  rnz("i80", "38", C.red, "красное", [[65, 76, 34.9, 0.58], [70, 78, 36.2, 0.57], [80, 80, 39.1, 0.59], [90, 82, 41.2, 0.59], [100, 84, 43.5, 0.59]]),
  rnz("i80", "43", C.dkBrown, "коричневое", [[70, 81, 41.2, 0.6], [80, 83, 43.5, 0.61], [90, 86, 46.2, 0.6], [100, 89, 48.7, 0.59]]),
  rnz("i80", "48", C.dkGreen, "тёмно-зелёное", [[70, 83, 46.3, 0.65], [80, 85, 48.4, 0.64], [90, 89, 51.7, 0.63], [100, 91, 54.5, 0.63]]),
  rnz("i80", "53", C.dkBlue, "тёмно-синее", [[70, 87, 50.7, 0.64], [80, 89, 53.1, 0.65], [90, 92, 56.4, 0.64], [100, 94, 59.6, 0.65]]),
];
const I90_NZ = [
  rnz("i90", "25", C.ltBlue, "голубое", [[80, 66, 29.5, 1.3], [90, 67, 31.5, 1.35], [100, 68, 33.2, 1.38], [110, 69, 35.6, 1.44]]),
  rnz("i90", "33", C.grey, "серое", [[80, 68, 36.2, 1.51], [90, 69, 38.2, 1.54], [100, 70, 40.4, 1.59], [110, 71, 42.6, 1.63]]),
  rnz("i90", "38", C.red, "красное", [[80, 72, 40.6, 1.51], [90, 73, 43.0, 1.55], [100, 75, 45.4, 1.55], [110, 76, 47.6, 1.59]]),
  rnz("i90", "43", C.dkBrown, "коричневое", [[80, 74, 46.1, 1.62], [90, 74, 48.5, 1.7], [100, 75, 50.7, 1.74], [110, 77, 53.4, 1.73]]),
  rnz("i90", "48", C.dkGreen, "тёмно-зелёное", [[80, 77, 50.2, 1.63], [90, 79, 52.6, 1.62], [100, 81, 55.1, 1.62], [110, 82, 57.5, 1.65]]),
  rnz("i90", "53", C.dkBlue, "тёмно-синее", [[80, 81, 54.9, 1.61], [90, 84, 57.2, 1.56], [100, 86, 59.5, 1.55], [110, 87, 62.1, 1.58], [120, 88, 64.4, 1.6]]),
  rnz("i90", "63", C.black, "чёрное", [[80, 86, 62.3, 1.62], [90, 88, 65.5, 1.63], [100, 90, 69.0, 1.64], [110, 91, 71.9, 1.67], [120, 92, 74.7, 1.7]]),
  rnz("i90", "73", C.orange, "оранжевое", [[80, 89, 72.7, 1.77], [90, 91, 75.4, 1.75], [100, 93, 78.1, 1.74], [110, 95, 80.9, 1.73], [120, 97, 83.8, 1.71]]),
];
const I90_36V_NZ = [
  rnz("i9036", "25", C.ltBlue, "голубое", [[80, 73, 30.5, 0.55], [90, 75, 32.4, 0.55], [100, 76, 34.3, 0.57], [110, 78, 36.5, 0.58]], 360),
  rnz("i9036", "33", C.grey, "серое", [[80, 77, 36.3, 0.59], [90, 78, 38.4, 0.61], [100, 80, 40.6, 0.61], [110, 81, 42.7, 0.63]], 360),
  rnz("i9036", "38", C.red, "красное", [[80, 80, 40.6, 0.61], [90, 82, 42.9, 0.61], [100, 83, 45.3, 0.63], [110, 85, 47.7, 0.64]], 360),
  rnz("i9036", "43", C.dkBrown, "коричневое", [[80, 83, 46.2, 0.65], [90, 84, 48.6, 0.66], [100, 85, 50.9, 0.68], [110, 86, 53.4, 0.69]], 360),
  rnz("i9036", "48", C.dkGreen, "тёмно-зелёное", [[80, 86, 49.6, 0.65], [90, 89, 52.5, 0.64], [100, 90, 54.8, 0.65], [110, 91, 57.3, 0.67]], 360),
  rnz("i9036", "53", C.dkBlue, "тёмно-синее", [[80, 89, 54.2, 0.66], [90, 90, 56.7, 0.67], [100, 92, 59.2, 0.67], [110, 93, 61.7, 0.69], [120, 94, 64.2, 0.7]], 360),
  rnz("i9036", "63", C.black, "чёрное", [[80, 92, 63.2, 0.72], [90, 94, 65.9, 0.72], [100, 96, 69.4, 0.72], [110, 97, 72.0, 0.74], [120, 98, 74.7, 0.75]], 360),
];
const G70_NZ = [
  rnz("g70", "15", C.grey, "серое", [[50, 53, 13.0, 0.45], [60, 54, 14.1, 0.47], [65, 55, 14.8, 0.47], [70, 56, 15.5, 0.48], [80, 58, 16.3, 0.47]], 360),
  rnz("g70", "18", C.red, "красное", [[50, 58, 14.2, 0.41], [60, 59, 15.9, 0.44], [65, 60, 16.3, 0.44], [70, 60, 16.9, 0.45], [80, 61, 17.8, 0.46]], 360),
  rnz("g70", "20", C.dkBrown, "коричневое", [[60, 61, 18.8, 0.49], [65, 62, 19.6, 0.49], [70, 63, 20.5, 0.5], [80, 64, 22.0, 0.52], [90, 64, 23.4, 0.55]], 360),
  rnz("g70", "23", C.dkGreen, "тёмно-зелёное", [[60, 63, 20.1, 0.49], [65, 65, 21.0, 0.48], [70, 65, 21.9, 0.5], [80, 66, 23.4, 0.52], [90, 67, 24.9, 0.53]], 360),
  rnz("g70", "25", C.dkBlue, "тёмно-синее", [[60, 65, 21.8, 0.5], [65, 67, 22.5, 0.48], [70, 67, 23.6, 0.51], [80, 69, 25.3, 0.51], [90, 71, 26.9, 0.51]], 360),
  rnz("g70", "28", C.black, "чёрное", [[70, 71, 28.1, 0.54], [80, 71, 29.9, 0.57], [90, 73, 31.8, 0.57], [100, 75, 33.7, 0.58]], 360),
];
const G80_NZ = [
  rnz("g80", "15", C.grey, "серое", [[50, 49, 14.2, 0.57], [60, 51, 15.7, 0.58], [70, 53, 17.0, 0.58], [80, 55, 18.2, 0.58]], 360),
  rnz("g80", "18", C.orange, "оранжевое", [[50, 56, 17.2, 0.53], [60, 58, 18.8, 0.54], [70, 60, 20.0, 0.53], [80, 61, 21.2, 0.55]], 360),
  rnz("g80", "23", C.dkGreen, "зелёное", [[50, 63, 21.6, 0.52], [60, 65, 23.0, 0.52], [70, 67, 24.9, 0.53], [80, 68, 26.6, 0.55]], 360),
  rnz("g80", "25", C.dkBlue, "синее", [[65, 71, 28.6, 0.55], [70, 73, 29.7, 0.54], [80, 74, 31.7, 0.56], [90, 75, 33.7, 0.58], [100, 75, 35.8, 0.58]], 360),
  rnz("g80", "33", C.grey, "серое", [[65, 74, 30.9, 0.54], [70, 75, 32.0, 0.55], [80, 77, 34.2, 0.56], [90, 79, 36.2, 0.56], [100, 81, 38.2, 0.56]], 360),
  rnz("g80", "38", C.red, "красное", [[65, 77, 35.1, 0.57], [70, 79, 36.6, 0.56], [80, 82, 38.9, 0.56], [90, 84, 41.3, 0.56], [100, 87, 43.6, 0.55]], 360),
  rnz("g80", "43", C.dkBrown, "коричневое", [[70, 83, 41.3, 0.58], [80, 85, 43.6, 0.58], [90, 87, 46.3, 0.59], [100, 89, 48.8, 0.59]], 360),
  rnz("g80", "48", C.dkGreen, "тёмно-зелёное", [[70, 90, 46.9, 0.56], [80, 92, 48.9, 0.56], [90, 94, 50.5, 0.55], [100, 96, 53.5, 0.56]], 360),
  rnz("g80", "53", C.dkBlue, "тёмно-синее", [[70, 91, 49.8, 0.58], [80, 93, 52.2, 0.58], [90, 95, 55.5, 0.59], [100, 97, 58.5, 0.6]], 360),
];
const ST90_NZ = [
  rnz("st90", "73", C.orange, "оранжевое", [[100, 103, 74.5, 1.35], [110, 109, 77.0, 1.25], [120, 115, 79.6, 1.16]]),
  rnz("st90", "83", C.tan, "бежевое", [[100, 112, 84.2, 1.29], [110, 116, 88.1, 1.26], [120, 120, 92.0, 1.23]]),
];
const ST1600_NZ = [
  rnzM("st16", "16", C.grey, "серое", [[4, 32.5, 364], [5, 35, 406], [6, 37, 446], [7, 39, 482], [8, 41, 520]]),
  rnzM("st16", "18", C.ltBrown, "бежевое", [[4, 34, 405], [5, 37, 452], [6, 39, 496], [7, 40.5, 535], [8, 43, 580]]),
  rnzM("st16", "20", C.orange, "оранжевое", [[4, 35, 545], [5, 39, 609], [6, 43, 668], [7, 44, 721], [8, 45, 773]]),
  rnzM("st16", "22", C.red, "красное", [[4, 36, 649], [5, 39.5, 726], [6, 44, 795], [7, 47, 859], [8, 48, 920]]),
  rnzM("st16", "24", C.dkGreen, "зелёное", [[4, 37, 765], [5, 40.5, 855], [6, 45, 937], [7, 47.5, 1012], [8, 48.7, 1084]]),
  rnzM("st16", "26", C.dkBlue, "синее", [[4, 38.4, 883], [5, 41.4, 986], [6, 46, 1077], [7, 48.7, 1162], [8, 50.3, 1237]]),
];

function mp(
  id: string, sku: string, name: string, series: string, colorName: string, color: string,
  arcMin: number, arcMax: number, rMin: number, rMax: number, rNom: number, use: string, performance: PerfRow[],
  family: Family = "mp", precipClass = "mp10", precipMmHr = 10, sourceDocument = SRC_MP, sourceUrl = URL_MP,
): CatalogItem {
  return {
    id, sku, name, family, series, type: "nozzle", colorName, color, arcMin, arcMax, rMin, rMax, rNom,
    precipClass, precipMmHr, thread: "½″ female", body: "Pro-Spray PRS40",
    recommendedPressureBar: 2.8, recommendedPressureMin: 2.1, recommendedPressureMax: 3.8,
    inlet: "½″ female", popUpMm: null, use, sourceDocument, sourceUrl,
    nozzles: [nz(id, name, color, colorName, performance)],
  };
}
function rotor(
  id: string, sku: string, name: string, series: string, arcMin: number, rMin: number, rMax: number, rNom: number,
  thread: string, use: string, nozzles: CatalogNozzle[] = [], sourceDocument = "Hunter Residential & Commercial Irrigation Product Catalogue (metric ranges)", sourceUrl = URL_HUNTER,
): CatalogItem {
  return {
    id, sku, name, family: "rotor", series, type: "rotor", colorName: "ротор", color: "#2f6f9a",
    arcMin, arcMax: 360, rMin, rMax, rNom, precipClass: "rotor", precipMmHr: null, thread, body: series,
    recommendedPressureBar: 3.5, recommendedPressureMin: 1.7, recommendedPressureMax: 4.5,
    inlet: thread, popUpMm: 100, use, sourceDocument, sourceUrl, nozzles,
  };
}
function spray(
  id: string, sku: string, name: string, family: Family, series: string, color: string, colorName: string,
  arcMin: number, arcMax: number, rNom: number, use: string, fixed: boolean,
): CatalogItem {
  return {
    id, sku, name, family, series, type: "nozzle", colorName, color, arcMin, arcMax,
    rMin: rNom * 0.85, rMax: rNom, rNom, precipClass: "spray", precipMmHr: null,
    thread: "½″ female", body: "Pro-Spray PRS30",
    recommendedPressureBar: 2.1, recommendedPressureMin: 1.7, recommendedPressureMax: 2.1,
    inlet: "½″ female", popUpMm: null, use,
    sourceDocument: "Hunter Pro-Spray nozzle naming: radius in feet (official catalogue)", sourceUrl: URL_HUNTER,
    nozzles: [{ id, name, color, colorName, type: fixed ? "fixed" : "adjustable", trajectoryDeg: null, performance: [] }],
  };
}
function bubbler(
  id: string, sku: string, name: string, series: string, color: string, colorName: string,
  arc: number, rNom: number, gpm: number, use: string,
): CatalogItem {
  const lpm = +(gpm * GPM_L).toFixed(2);
  return {
    id, sku, name, family: "bubbler", series, type: "bubbler", colorName, color,
    arcMin: arc, arcMax: arc, rMin: rNom * 0.6, rMax: rNom * 1.2, rNom,
    precipClass: "bubbler", precipMmHr: null, thread: "½″ female", body: "Pro-Spray",
    recommendedPressureBar: 2.1, recommendedPressureMin: 1.4, recommendedPressureMax: 2.1,
    inlet: "½″ female", popUpMm: null, use, sourceDocument: "Hunter bubbler product family", sourceUrl: URL_HUNTER,
    nozzles: [{ id, name, color, colorName, type: "fixed", trajectoryDeg: null, performance: [si(arc, 2.1, rNom, lpm, 0)] }],
  };
}
function body(id: string, sku: string, name: string, series: string, bar: number, use: string): CatalogItem {
  return {
    id, sku, name, family: "body", series, type: "body", colorName: "корпус", color: "#8a8f96",
    arcMin: 0, arcMax: 0, rMin: 0, rMax: 0, rNom: 0, precipClass: "unknown", precipMmHr: null,
    thread: "½″ female", body: series, recommendedPressureBar: bar, recommendedPressureMin: bar, recommendedPressureMax: bar === 2.8 || bar === 2.1 ? bar : 4.8,
    inlet: "½″ female", popUpMm: 100, use, sourceDocument: `Hunter ${series}`, sourceUrl: URL_HUNTER, nozzles: [],
  };
}

export const CATALOG: CatalogItem[] = [
  mp("MP1000-90", "MP100090", "MP1000 90–210°", "MP1000", "бордовый", "#6B2D5B", 90, 210, 2.5, 4.5, 4.3, "Узкие полосы, карманы у дома.", [...MP1000[90], ...MP1000[180], ...MP1000[210]]),
  mp("MP1000-210", "MP1000210", "MP1000 210–270°", "MP1000", "голубой", "#7BA3C9", 210, 270, 2.5, 4.5, 4.3, "Внешние углы 210–270°.", [...MP1000[210], ...MP1000[270]]),
  mp("MP1000-360", "MP1000360", "MP1000 360°", "MP1000", "оливковый", "#6B7B3A", 360, 360, 2.5, 4.5, 4.3, "Центр малой площадки.", MP1000[360]),
  mp("MP2000-90", "MP200090", "MP2000 90–210°", "MP2000", "чёрный", "#1a1a1a", 90, 210, 4.0, 6.4, 5.8, "Средний газон 4–6,4 м.", [...MP2000[90], ...MP2000[180], ...MP2000[210]]),
  mp("MP2000-210", "MP2000210", "MP2000 210–270°", "MP2000", "зелёный", "#2E7D32", 210, 270, 4.0, 6.4, 5.8, "270° на внешних углах.", [...MP2000[210], ...MP2000[270]]),
  mp("MP2000-360", "MP2000360", "MP2000 360°", "MP2000", "красный", "#C62828", 360, 360, 4.0, 6.4, 5.8, "Центр площадки. 2,8 бар: 5,8 м, 0,34 м³/ч.", MP2000[360]),
  mp("MP3000-90", "MP300090", "MP3000 90–210°", "MP3000", "синий", "#1565C0", 90, 210, 6.7, 9.1, 9.1, "Основной жилой газон 6,7–9,1 м.", [...MP3000[90], ...MP3000[180], ...MP3000[210]]),
  mp("MP3000-210", "MP3000210", "MP3000 210–270°", "MP3000", "жёлтый", "#C9A227", 210, 270, 6.7, 9.1, 9.1, "270° на широких внешних углах.", [...MP3000[210], ...MP3000[270]]),
  mp("MP3000-360", "MP3000360", "MP3000 360°", "MP3000", "серый", "#5C5C5C", 360, 360, 6.7, 9.1, 9.1, "Центр большого газона.", MP3000[360]),
  mp("MP3500-90", "MP350090", "MP3500 90–210°", "MP3500", "светло-коричневый", "#A67C52", 90, 210, 9.4, 10.7, 10.7, "Широкие открытые газоны. Полного круга у MP3500 нет.", [...MP3500[90], ...MP3500[180], ...MP3500[210]]),
  mp("MP-CORNER", "MPCORNER", "MP Corner 45–105°", "MP Corner", "бирюзовый", "#2A9B8F", 45, 105, 2.5, 4.5, 4.1, "Острые и тупые углы 45–105°. Линейка MP Standard, ≈10 мм/ч.", [si(90, 2.8, 4.1, 0.7, 10)], "mp", "mp10", 10, SRC_MP_EM, URL_HUNTER),
  { ...mp("MP-LCS-515", "MPLCS515", "MP-LCS-515 левая полоса", "MP Strip", "слоновая кость", "#C9B896", 180, 180, 1.5, 4.6, 4.6, "Полоса 1,5 × 4,6 м, левый угол.", [si(180, 2.8, 4.6, 0.72, 10)], "strip", "mp10", 10, SRC_MP_EM, URL_HUNTER), strip: { w: 1.5, l: 4.6, ox: 0, oy: -1.5 } },
  { ...mp("MP-RCS-515", "MPRCS515", "MP-RCS-515 правая полоса", "MP Strip", "медный", "#B87333", 180, 180, 1.5, 4.6, 4.6, "Полоса 1,5 × 4,6 м, правый угол.", [si(180, 2.8, 4.6, 0.72, 10)], "strip", "mp10", 10, SRC_MP_EM, URL_HUNTER), strip: { w: 1.5, l: 4.6, ox: 0, oy: 0 } },
  { ...mp("MP-SS-530", "MPSS530", "MP-SS-530 боковая полоса", "MP Strip", "коричневый", "#6B4F3A", 180, 180, 1.5, 9.1, 9.1, "Полоса 1,5 × 9,1 м вдоль края.", [si(180, 2.8, 9.1, 1.25, 10)], "strip", "mp10", 10, SRC_MP_EM, URL_HUNTER), strip: { w: 1.5, l: 9.1, ox: -4.55, oy: 0 } },
  mp("MP800SR-90", "MP800SR90", "MP800SR 90–210°", "MP800SR", "оранжевый / серый", "#C45C26", 90, 210, 1.8, 3.5, 3.0, "Короткий радиус, ≈20 мм/ч. Не смешивать со стандартными MP.", [...MP800SR[90], ...MP800SR[180], ...MP800SR[210]], "mp800", "mp20", 20, SRC_MP800SR, URL_MP800SR),
  mp("MP800SR-360", "MP800SR360", "MP800SR 360°", "MP800SR", "лаймовый / серый", "#6B7B3A", 360, 360, 1.8, 3.5, 3.0, "Короткий радиус 360°, ≈20 мм/ч.", MP800SR[360], "mp800", "mp20", 20, SRC_MP800SR, URL_MP800SR),
  mp("MP815-90", "MP81590", "MP815 90–210°", "MP815", "бордовый / серый", "#6B2D5B", 90, 210, 2.5, 4.9, 4.6, "MP800 ≈20 мм/ч. Отдельная гидрозона от MP Standard.", [...MP815[90], ...MP815[180], ...MP815[210]], "mp800", "mp20", 20, SRC_MP815, URL_MP815),
  mp("MP815-210", "MP815210", "MP815 210–270°", "MP815", "голубой / серый", "#7BA3C9", 210, 270, 2.5, 4.9, 4.6, "MP800, внешний угол.", [...MP815[210], ...MP815[270]], "mp800", "mp20", 20, SRC_MP815, URL_MP815),
  mp("MP815-360", "MP815360", "MP815 360°", "MP815", "оливковый / серый", "#6B7B3A", 360, 360, 2.5, 4.9, 4.6, "MP800, центр малой зоны.", MP815[360], "mp800", "mp20", 20, SRC_MP815, URL_MP815),

  spray("4A", "4A", "4A регулируемое", "spray", "Pro Adjustable", "#43A047", "светло-зелёный", 0, 360, 1.2, "Сопло 4 ft / 1,2 м. Light green.", false),
  spray("6A", "6A", "6A регулируемое", "spray", "Pro Adjustable", "#4FC3F7", "голубой", 0, 360, 1.8, "Сопло 6 ft / 1,8 м. Light blue.", false),
  { ...spray("8A", "8A", "8A регулируемое", "spray", "Pro Adjustable", "#7CB342", "зелёный", 0, 360, 2.4, "Снято в 2026. Замена: 8A-HE.", false), discontinued: true },
  { ...spray("10A", "10A", "10A регулируемое", "spray", "Pro Adjustable", "#1565C0", "синий", 0, 360, 3.0, "Снято в 2026. Замена: 10A-HE.", false), discontinued: true },
  { ...spray("12A", "12A", "12A регулируемое", "spray", "Pro Adjustable", "#8D4B2B", "коричневый", 0, 360, 3.7, "Снято в 2026. Замена: 12A-HE.", false), discontinued: true },
  { ...spray("15A", "15A", "15A регулируемое", "spray", "Pro Adjustable", "#1a1a1a", "чёрный", 0, 360, 4.6, "Снято в 2026. Замена: 15A-HE.", false), discontinued: true },
  { ...spray("17A", "17A", "17A регулируемое", "spray", "Pro Adjustable", "#90A4AE", "серый", 0, 360, 5.2, "Снято в 2026. Замена: 17A-HE.", false), discontinued: true },
  spray("8A-HE", "8A-HE", "8A-HE", "he", "Pro High-Efficiency", "#5B6B32", "оливковый", 0, 360, 2.4, "Pro High-Efficiency 8 ft / 2,4 м. Замена 8A. Корпус PRS30.", false),
  spray("10A-HE", "10A-HE", "10A-HE", "he", "Pro High-Efficiency", "#1E4B7A", "тёмно-синий", 0, 360, 3.0, "Pro High-Efficiency 10 ft / 3,0 м. Замена 10A.", false),
  spray("12A-HE", "12A-HE", "12A-HE", "he", "Pro High-Efficiency", "#6B3E2A", "коричневый", 0, 360, 3.7, "Pro High-Efficiency 12 ft / 3,7 м. Замена 12A.", false),
  spray("15A-HE", "15A-HE", "15A-HE", "he", "Pro High-Efficiency", "#1a1a1a", "чёрный", 0, 360, 4.6, "Pro High-Efficiency 15 ft / 4,6 м. Замена 15A.", false),
  spray("17A-HE", "17A-HE", "17A-HE", "he", "Pro High-Efficiency", "#6B6F73", "серый", 0, 360, 5.2, "Pro High-Efficiency 17 ft / 5,2 м. Замена 17A.", false),
  spray("5Q", "5Q", "5Q 90°", "fixed", "Pro Fixed", "#1565C0", "синий", 90, 90, 1.5, "Pro Fixed 5 ft / 1,5 м, 90°. Траектория 0°.", true),
  spray("5H", "5H", "5H 180°", "fixed", "Pro Fixed", "#1565C0", "синий", 180, 180, 1.5, "Pro Fixed 5 ft / 1,5 м, 180°.", true),
  spray("5F", "5F", "5F 360°", "fixed", "Pro Fixed", "#1565C0", "синий", 360, 360, 1.5, "Pro Fixed 5 ft / 1,5 м, 360°.", true),
  spray("8Q", "8Q", "8Q 90°", "fixed", "Pro Fixed", "#8D4B2B", "коричневый", 90, 90, 2.4, "Pro Fixed 8 ft / 2,4 м, 90°. Траектория 15°.", true),
  spray("8T", "8T", "8T 120°", "fixed", "Pro Fixed", "#8D4B2B", "коричневый", 120, 120, 2.4, "Pro Fixed 8 ft / 2,4 м, 120°.", true),
  spray("8H", "8H", "8H 180°", "fixed", "Pro Fixed", "#8D4B2B", "коричневый", 180, 180, 2.4, "Pro Fixed 8 ft / 2,4 м, 180°.", true),
  spray("8F", "8F", "8F 360°", "fixed", "Pro Fixed", "#8D4B2B", "коричневый", 360, 360, 2.4, "Pro Fixed 8 ft / 2,4 м, 360°.", true),
  spray("10Q", "10Q", "10Q 90°", "fixed", "Pro Fixed", "#C62828", "красный", 90, 90, 3.0, "Pro Fixed 10 ft / 3,0 м, 90°.", true),
  spray("10T", "10T", "10T 120°", "fixed", "Pro Fixed", "#C62828", "красный", 120, 120, 3.0, "Pro Fixed 10 ft / 3,0 м, 120°.", true),
  spray("10H", "10H", "10H 180°", "fixed", "Pro Fixed", "#C62828", "красный", 180, 180, 3.0, "Pro Fixed 10 ft / 3,0 м, 180°.", true),
  spray("10F", "10F", "10F 360°", "fixed", "Pro Fixed", "#C62828", "красный", 360, 360, 3.0, "Pro Fixed 10 ft / 3,0 м, 360°.", true),
  spray("12Q", "12Q", "12Q 90°", "fixed", "Pro Fixed", "#2E7D32", "зелёный", 90, 90, 3.7, "Pro Fixed 12 ft / 3,7 м, 90°. Траектория 28°.", true),
  spray("12T", "12T", "12T 120°", "fixed", "Pro Fixed", "#2E7D32", "зелёный", 120, 120, 3.7, "Pro Fixed 12 ft / 3,7 м, 120°.", true),
  spray("12H", "12H", "12H 180°", "fixed", "Pro Fixed", "#2E7D32", "зелёный", 180, 180, 3.7, "Pro Fixed 12 ft / 3,7 м, 180°.", true),
  spray("12F", "12F", "12F 360°", "fixed", "Pro Fixed", "#2E7D32", "зелёный", 360, 360, 3.7, "Pro Fixed 12 ft / 3,7 м, 360°.", true),
  spray("15Q", "15Q", "15Q 90°", "fixed", "Pro Fixed", "#1a1a1a", "чёрный", 90, 90, 4.6, "Pro Fixed 15 ft / 4,6 м, 90°. Траектория 28°.", true),
  spray("15T", "15T", "15T 120°", "fixed", "Pro Fixed", "#1a1a1a", "чёрный", 120, 120, 4.6, "Pro Fixed 15 ft / 4,6 м, 120°.", true),
  spray("15H", "15H", "15H 180°", "fixed", "Pro Fixed", "#1a1a1a", "чёрный", 180, 180, 4.6, "Pro Fixed 15 ft / 4,6 м, 180°.", true),
  spray("15F", "15F", "15F 360°", "fixed", "Pro Fixed", "#1a1a1a", "чёрный", 360, 360, 4.6, "Pro Fixed 15 ft / 4,6 м, 360°.", true),
  spray("17Q", "17Q", "17Q 90°", "fixed", "Pro Fixed", "#90A4AE", "серый", 90, 90, 5.2, "Pro Fixed 17 ft / 5,2 м, 90°.", true),
  spray("17H", "17H", "17H 180°", "fixed", "Pro Fixed", "#90A4AE", "серый", 180, 180, 5.2, "Pro Fixed 17 ft / 5,2 м, 180°.", true),
  spray("2Q", "2Q", "2Q Short Radius", "short", "Short Radius", "#D4B483", "бежевый", 90, 90, 0.6, "Микроспрей 2 ft, 90°. PRS30.", true),
  spray("2H", "2H", "2H Short Radius", "short", "Short Radius", "#D4B483", "бежевый", 180, 180, 0.6, "Микроспрей 2 ft, 180°.", true),
  spray("4Q", "4Q", "4Q Short Radius", "short", "Short Radius", "#2BB3B1", "бирюзовый", 90, 90, 1.2, "Микроспрей 4 ft, 90°.", true),
  spray("4H", "4H", "4H Short Radius", "short", "Short Radius", "#2BB3B1", "бирюзовый", 180, 180, 1.2, "Микроспрей 4 ft, 180°.", true),
  spray("6Q", "6Q", "6Q Short Radius", "short", "Short Radius", "#7EC8F2", "голубой", 90, 90, 1.8, "Микроспрей 6 ft, 90°.", true),
  spray("6H", "6H", "6H Short Radius", "short", "Short Radius", "#7EC8F2", "голубой", 180, 180, 1.8, "Микроспрей 6 ft, 180°.", true),
  { ...spray("S-8A", "S-8A", "S-8A Stream", "stream", "Stream", "#2f6f9a", "синий", 0, 360, 2.4, "Снято в 2022. Замена: MP Rotator.", false), discontinued: true },
  { ...spray("S-16A", "S-16A", "S-16A Stream", "stream", "Stream", "#2f6f9a", "синий", 0, 360, 4.9, "Снято в 2022. Замена: MP Rotator.", false), discontinued: true },
  spray("CS-530", "CS-530", "CS-530 center strip", "prostrip", "Specialty Strip", "#C62828", "красный", 180, 180, 1.5, "Center strip 5×30 ft.", true),
  spray("ES-515", "ES-515", "ES-515 end strip", "prostrip", "Specialty Strip", "#8a8f96", "белый", 180, 180, 1.5, "End strip 5×15 ft.", true),
  spray("LCS-515", "LCS-515", "LCS-515 left strip", "prostrip", "Specialty Strip", "#1565C0", "синий", 180, 180, 1.5, "Left corner strip 5×15 ft.", true),
  spray("RCS-515", "RCS-515", "RCS-515 right strip", "prostrip", "Specialty Strip", "#2E7D32", "зелёный", 180, 180, 1.5, "Right corner strip 5×15 ft.", true),
  spray("SS-530", "SS-530", "SS-530 side strip", "prostrip", "Specialty Strip", "#A67C52", "коричневый", 180, 180, 1.5, "Side strip 5×30 ft.", true),
  spray("SS-918", "SS-918", "SS-918 side strip", "prostrip", "Specialty Strip", "#A67C52", "коричневый", 180, 180, 2.7, "Side strip 9×18 ft.", true),

  rotor("PGJ", "PGJ-ADJ", "PGJ-ADJ", "PGJ", 40, 4.3, 11.3, 8.5, "½″ female", "Малый ротор. 8 красных сопел 0.50–4.0.", PGJ_NZ),
  rotor("SRM", "SRM", "SRM", "SRM", 40, 4.0, 9.4, 7.0, "½″ female", "Короткий ротор. Сопла 0.50–4.0, тёмно-зелёные.", SRM_NZ),
  rotor("PGP-ADJ", "PGP-ADJ", "PGP-ADJ", "PGP", 40, 6.4, 15.8, 11.0, "¾″ female", "Классический PGP. Красные сопла 1–12 — официальная таблица Hunter.", PGP_RED, SRC_PGP, URL_PGP),
  rotor("PGP-ULTRA", "PGP-ADJ-U", "PGP Ultra", "PGP Ultra", 50, 6.4, 15.8, 11.0, "¾″ female", "PGP Ultra. Те же красные стандартные сопла Hunter.", PGP_RED, SRC_PGP, URL_PGP),
  rotor("I-20", "I-20-04", "I-20", "I-20", 50, 7.6, 14.0, 11.0, "¾″ female", "Коммерческий ротор I-20. Те же красные сопла 1–12, что у PGP Ultra.", PGP_RED, SRC_PGP, URL_PGP),
  rotor("I-25", "I-25-04", "I-25", "I-25", 50, 11.9, 21.6, 15.0, "1″ female", "Большие площади. Цветные сопла 4–28 по таблице Hunter.", I25_NZ),
  rotor("I-40", "I-40-04", "I-40", "I-40", 40, 13.1, 21.3, 17.0, "1″ female", "Крупный коммерческий ротор. Сопла 8–25.", I40_NZ),
  rotor("I-40-ON", "I-40-ON", "I-40-ON", "I-40", 360, 13.1, 21.3, 17.0, "1″ female", "Полный круг I-40, opposing-сопла 15–28.", I40_ON_NZ),
  { ...rotor("I-50", "I-50-04", "I-50", "I-50", 50, 13.7, 24.7, 19.0, "1½″ female", "Снято в 2022. Замена: I-40.", I40_NZ), discontinued: true },
  { ...rotor("I-50-ON", "I-50-ON", "I-50-ON", "I-50", 360, 13.7, 24.7, 19.0, "1½″ female", "Снято в 2022. Замена: I-40-ON.", I40_ON_NZ), discontinued: true },
  rotor("I-80", "I-80", "I-80", "I-80", 40, 19.2, 29.6, 24.0, "1½″ female", "Очень большие площади. Сопла 23–53. Сектор 70–360°.", I80_NZ),
  rotor("I-80-ON", "I-80-ON", "I-80-ON", "I-80", 360, 19.2, 29.6, 24.0, "1½″ female", "Полный круг I-80. Opposing-сопла 23–53.", I80_NZ),
  rotor("I-90", "I-90", "I-90", "I-90", 40, 22.3, 32.6, 27.0, "1½″ female", "Максимальный радиус Hunter. Сопла 25–73.", I90_NZ),
  rotor("I-90-36V", "I-90-36V", "I-90-36V", "I-90", 360, 22.3, 31.4, 27.0, "1½″ female", "Полный круг I-90. Opposing-сопла 25–63.", I90_36V_NZ),

  rotor("I-20-SS", "I-20-04-SS", "I-20-SS", "I-20", 50, 7.6, 14.0, 11.0, "¾″ female", "I-20 с нержавеющим штоком. Те же красные сопла 1–12.", PGP_RED, SRC_PGP, URL_PGP),
  rotor("I-25-SS", "I-25-04-SS", "I-25-SS", "I-25", 50, 11.9, 21.6, 15.0, "1″ female", "I-25 с нержавеющим штоком. Сопла 4–28.", I25_NZ),
  rotor("I-40-SS", "I-40-04-SS", "I-40-SS", "I-40", 50, 13.1, 21.3, 17.0, "1″ female", "I-40 с нержавеющим штоком. Сопла 8–25.", I40_NZ),
  rotor("I-80-SS", "I-80-04-SS", "I-80-SS", "I-80", 70, 19.2, 29.6, 24.0, "1½″ female", "I-80 со стальным штоком. Сопла 23–53.", I80_NZ),

  { ...rotor("G-70-B", "G-70-B", "G-70-B", "Golf B", 360, 16.2, 22.9, 19.6, "1¼″ ACME", "Гольф-ротор, полный круг. Сопла 15–28.", G70_NZ), family: "golf", precipClass: "golf", recommendedPressureBar: 4.1, recommendedPressureMin: 3.4, recommendedPressureMax: 6.9, popUpMm: 95, colorName: "гольф", sourceUrl: "https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-70-b" },
  { ...rotor("G-75-B", "G-75-B", "G-75-B", "Golf B", 50, 14.3, 21.6, 18.0, "1¼″ ACME", "Гольф-ротор, сектор 50–360°. Сопла 15–28.", G70_NZ), family: "golf", precipClass: "golf", recommendedPressureBar: 4.1, recommendedPressureMin: 2.8, recommendedPressureMax: 6.9, popUpMm: 95, colorName: "гольф", sourceUrl: "https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-75-b" },
  { ...rotor("G-80-B", "G-80-B", "G-80-B", "Golf B", 360, 14.9, 29.6, 22.3, "1¼″ ACME", "Гольф-ротор, полный круг, opposing. Сопла 15–53.", G80_NZ), family: "golf", precipClass: "golf", recommendedPressureBar: 4.1, recommendedPressureMin: 3.4, recommendedPressureMax: 6.9, popUpMm: 95, colorName: "гольф", sourceUrl: "https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-80-b" },
  { ...rotor("G-85-B", "G-85-B", "G-85-B", "Golf B", 60, 11.3, 28.7, 20.0, "1¼″ ACME", "Гольф-ротор, сектор 60–360°. Сопла 15–53.", G80_NZ), family: "golf", precipClass: "golf", recommendedPressureBar: 4.1, recommendedPressureMin: 3.4, recommendedPressureMax: 6.9, popUpMm: 95, colorName: "гольф", sourceUrl: "https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-85-b" },

  { ...rotor("ST-90", "ST-90", "ST-90", "ST System", 40, 31.4, 36.6, 34.0, "1½″ NPT", "Стадион / искусственный газон. Сопла 73 и 83.", ST90_NZ), family: "st", precipClass: "st", recommendedPressureBar: 7.0, recommendedPressureMin: 6.9, recommendedPressureMax: 8.3, popUpMm: 76, colorName: "стадион", sourceUrl: "https://www.hunterirrigation.com/irrigation-product/st-system/st-90" },
  { ...rotor("STG-900", "STG-900", "STG-900", "ST System", 40, 31.4, 36.6, 34.0, "1½″ ACME", "ST-система, top-service. Сопла 73 и 83, как у ST-90.", ST90_NZ), family: "st", precipClass: "st", recommendedPressureBar: 7.0, recommendedPressureMin: 6.9, recommendedPressureMax: 8.3, popUpMm: 76, colorName: "стадион", sourceUrl: "https://www.hunterirrigation.com/irrigation-product/st-system/stg-900" },
  { ...rotor("ST-1600", "ST-1600", "ST-1600", "ST System", 40, 32.5, 50.3, 41.0, "2″ BSP", "Дальний стадионный ротор. Сопла 16–26, до 50 м.", ST1600_NZ), family: "st", precipClass: "st", recommendedPressureBar: 6.2, recommendedPressureMin: 4.1, recommendedPressureMax: 7.2, popUpMm: 127, colorName: "стадион", sourceUrl: "https://www.hunterirrigation.com/irrigation-product/st-1600" },

  bubbler("MSBN-25Q", "MSBN-25Q", "MSBN-25Q", "MSBN", "#6B4F3A", "коричневый", 90, 1.0, 0.25, "Многоструйная форсунка-баблер, 0,9 л/мин, 90°"),
  bubbler("MSBN-50Q", "MSBN-50Q", "MSBN-50Q", "MSBN", "#6B4F3A", "коричневый", 90, 1.5, 0.50, "Многоструйная форсунка-баблер, 1,9 л/мин, 90°"),
  bubbler("MSBN-50H", "MSBN-50H", "MSBN-50H", "MSBN", "#6B4F3A", "коричневый", 180, 1.0, 0.50, "Многоструйная форсунка-баблер, 1,9 л/мин, 180°"),
  bubbler("MSBN-10H", "MSBN-10H", "MSBN-10H", "MSBN", "#6B4F3A", "коричневый", 180, 1.5, 1.0, "Многоструйная форсунка-баблер, 3,8 л/мин, 180°"),
  bubbler("MSBN-10F", "MSBN-10F", "MSBN-10F", "MSBN", "#6B4F3A", "коричневый", 360, 1.0, 1.0, "Многоструйная форсунка-баблер, 3,8 л/мин, 360°"),
  bubbler("MSBN-20F", "MSBN-20F", "MSBN-20F", "MSBN", "#6B4F3A", "коричневый", 360, 1.5, 2.0, "Многоструйная форсунка-баблер, 7,6 л/мин, 360°"),
  bubbler("MSBN-25V", "MSBN-25V", "MSBN-25V", "MSBN-V", "#3d6b5c", "зелёный", 50, 1.5, 0.25, "Двойные струи 50°, 0,9 л/мин"),
  bubbler("MSBN-50V", "MSBN-50V", "MSBN-50V", "MSBN-V", "#3d6b5c", "зелёный", 50, 2.5, 0.50, "Двойные струи 50°, 1,9 л/мин"),
  bubbler("PCN-25", "PCN-25", "PCN-25", "PCN", "#5C5C5C", "серый", 360, 0.8, 0.25, "Форсунка-баблер flood, 0,9 л/мин"),
  bubbler("PCN-50", "PCN-50", "PCN-50", "PCN", "#5C5C5C", "серый", 360, 1.0, 0.50, "Форсунка-баблер flood, 1,9 л/мин"),
  bubbler("PCN-10", "PCN-10", "PCN-10", "PCN", "#5C5C5C", "серый", 360, 1.2, 1.0, "Форсунка-баблер umbrella, 3,8 л/мин"),
  bubbler("PCN-20", "PCN-20", "PCN-20", "PCN", "#5C5C5C", "серый", 360, 1.5, 2.0, "Форсунка-баблер umbrella, 7,6 л/мин"),
  bubbler("PCB-25", "PCB-25", "PCB-25", "PCB", "#2f6f9a", "синий", 360, 0.8, 0.25, "Баблер flood 0,9 л/мин, ½″"),
  bubbler("PCB-50", "PCB-50", "PCB-50", "PCB", "#2E7D32", "зелёный", 360, 1.0, 0.50, "Баблер flood 1,9 л/мин, ½″"),
  bubbler("PCB-10", "PCB-10", "PCB-10", "PCB", "#6B2D5B", "фиолетовый", 360, 1.2, 1.0, "Баблер flood 3,8 л/мин, ½″"),
  bubbler("PCB-20", "PCB-20", "PCB-20", "PCB", "#C9A227", "жёлтый", 360, 1.5, 2.0, "Баблер flood 7,6 л/мин, ½″"),
  bubbler("PCB-25-R", "PCB-25-R", "PCB-25-R", "PCB-R", "#7a3e6e", "фиолетовый", 360, 0.8, 0.25, "Reclaimed, 0,9 л/мин"),
  bubbler("PCB-50-R", "PCB-50-R", "PCB-50-R", "PCB-R", "#7a3e6e", "фиолетовый", 360, 1.0, 0.50, "Reclaimed, 1,9 л/мин"),
  bubbler("PCB-10-R", "PCB-10-R", "PCB-10-R", "PCB-R", "#7a3e6e", "фиолетовый", 360, 1.2, 1.0, "Reclaimed, 3,8 л/мин"),
  bubbler("PCB-20-R", "PCB-20-R", "PCB-20-R", "PCB-R", "#7a3e6e", "фиолетовый", 360, 1.5, 2.0, "Reclaimed, 7,6 л/мин"),
  bubbler("AFB", "AFB", "AFB", "AFB", "#1a1a1a", "чёрный", 360, 0.8, 2.0, "Adjustable flood bubbler"),
  bubbler("5-CST-B", "5-CST-B", "5-CST-B", "CST", "#2f6f9a", "синий", 360, 1.5, 0.25, "Center strip bubbler 5-CST-B"),

  body("PS-ULTRA", "PSU-04", "PS Ultra 10 см", "PS Ultra", 2.1, "Корпус. Не ставится на план как дождеватель."),
  body("PRO-SPRAY", "PROS-04", "Pro-Spray 10 см", "Pro-Spray", 2.1, "Корпус без регулятора."),
  body("PRS30", "PROS-04-PRS30", "Pro-Spray PRS30", "Pro-Spray PRS30", 2.1, "2,1 бар. Спреи, HE, short radius, stream."),
  body("PRS40", "PROS-04-PRS40", "Pro-Spray PRS40", "Pro-Spray PRS40", 2.8, "2,8 бар. Рекомендуется для MP Rotator."),
];

export const CATEGORIES: { id: Family | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mp", label: "MP Standard" },
  { id: "mp800", label: "MP800" },
  { id: "strip", label: "MP Strip" },
  { id: "he", label: "Pro High-Efficiency" },
  { id: "spray", label: "Pro Adjustable" },
  { id: "fixed", label: "Pro Fixed" },
  { id: "prostrip", label: "Strip Pattern" },
  { id: "short", label: "Short-Radius" },
  { id: "bubbler", label: "Bubblers" },
  { id: "rotor", label: "Rotors" },
  { id: "golf", label: "Golf Rotors" },
  { id: "st", label: "ST System" },
];
export const FAMILIES = CATEGORIES;

export function itemById(id: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.id === id);
}
export function placeableCatalog(): CatalogItem[] {
  return CATALOG.filter((c) => c.family !== "body" && !c.discontinued);
}
export function pickSkuForArc(seriesItems: CatalogItem[], arc: number): CatalogItem {
  const exact = seriesItems.find((c) => arc >= c.arcMin && arc <= c.arcMax);
  if (exact) return exact;
  return seriesItems.reduce((a, b) => (Math.abs(a.arcMin - arc) < Math.abs(b.arcMin - arc) ? a : b));
}
export function clampRadius(item: CatalogItem, r: number) {
  return Math.min(item.rMax, Math.max(item.rMin, r));
}
export function clampArc(item: CatalogItem, a: number) {
  return Math.min(item.arcMax, Math.max(item.arcMin, Math.round(a)));
}
export function defaultBodyFor(item: CatalogItem) {
  if (item.family === "mp" || item.family === "mp800" || item.family === "strip") return "PRS40";
  if (item.type === "rotor") return item.id;
  return "PRS30";
}

/** Official takeoff name: nozzle / rotator / rotor / body. */
export function bomLineName(item: CatalogItem): string {
  if (item.type === "body") return `Корпус Hunter ${item.name}`;
  if (item.type === "rotor" || item.family === "golf" || item.family === "st") return `Ротор Hunter ${item.id}`;
  if (item.family === "mp" || item.family === "mp800" || item.family === "strip") {
    return `Ротор Hunter MP Rotator ${item.id}`;
  }
  if (item.type === "bubbler") return `Баблер Hunter ${item.id}`;
  return `Сопло Hunter ${item.id}`;
}
export function bodiesFor(item: CatalogItem): CatalogItem[] {
  if (item.type === "rotor") return [];
  const bodies = CATALOG.filter((c) => c.type === "body");
  if (item.family === "mp" || item.family === "mp800" || item.family === "strip") {
    return bodies.filter((b) => b.id === "PRS40" || b.id === "PRO-SPRAY" || b.id === "PS-ULTRA");
  }
  return bodies.filter((b) => b.id === "PRS30" || b.id === "PRO-SPRAY" || b.id === "PS-ULTRA");
}

export const POP_UP_MM = [100, 150, 200, 300, 400] as const;

export function popUpHeights(item: CatalogItem): number[] {
  if (item.family === "st" || item.family === "golf") {
    const mm = item.popUpMm ?? 100;
    return POP_UP_MM.includes(mm as (typeof POP_UP_MM)[number]) ? [...POP_UP_MM] : [mm, ...POP_UP_MM];
  }
  return [...POP_UP_MM];
}
export function workingPressureBar(item: CatalogItem, bodyId?: string | null, _nozzleId?: string | null) {
  if (bodyId === "PRS40") return 2.8;
  if (bodyId === "PRS30") return 2.1;
  return item.recommendedPressureBar;
}
export function nozzleRange(n: CatalogNozzle) {
  const rows = n.performance;
  if (!rows.length) return { rMin: 0, rMax: 0, recR: 0, recBar: 2.8, recLpm: 0 };
  const rs = rows.map((r) => r.radiusM);
  const mid = rows[Math.floor(rows.length / 2)]!;
  return { rMin: Math.min(...rs), rMax: Math.max(...rs), recR: mid.radiusM, recBar: mid.pressureBar, recLpm: mid.flowLMin };
}
export function defaultNozzle(item: CatalogItem) {
  if (!item.nozzles.length) return null;
  if (item.nozzles.length === 1) return item.nozzles[0]!;
  return pickNozzleForRadius(item, item.rNom);
}
export function pickNozzleForRadius(item: CatalogItem, r: number) {
  if (item.nozzles.length < 2) return item.nozzles[0] ?? null;
  let best = item.nozzles[0]!;
  let score = Infinity;
  for (const n of item.nozzles) {
    const st = nozzleRange(n);
    const rec = st.recR || (st.rMin + st.rMax) / 2;
    const s = Math.abs(rec - r);
    if (s < score) {
      score = s;
      best = n;
    }
  }
  return best;
}
export function pickSeriesForRadius(r: number, family: Family = "mp"): CatalogItem[] {
  const list = CATALOG.filter((c) => c.family === family && !c.strip && !c.discontinued && c.series !== "MP Corner");
  const groups = new Map<string, CatalogItem[]>();
  for (const c of list) {
    const arr = groups.get(c.series) ?? [];
    arr.push(c);
    groups.set(c.series, arr);
  }
  let best: CatalogItem[] = list.filter((c) => c.series === "MP2000");
  let bestScore = Infinity;
  for (const [, items] of groups) {
    const first = items[0]!;
    const score = r > first.rMax ? r - first.rMax + 20 : r < first.rMin ? first.rMin - r + 20 : Math.abs(first.rNom - r);
    if (score < bestScore) {
      bestScore = score;
      best = items;
    }
  }
  return best.length ? best : list;
}

export function categoryPhoto(id: Family | "all"): string | null {
  if (id === "all") return null;
  const map: Record<string, string> = {
    mp: "group-mp",
    mp800: "group-mp800",
    strip: "group-strip",
    rotor: "rotors",
    golf: "group-golf",
    st: "group-st",
    bubbler: "group-bubbler",
    he: "group-he",
    fixed: "group-fixed",
    short: "group-short",
    stream: "8A",
    spray: "group-spray",
    prostrip: "group-prostrip",
  };
  return bundledPhoto(map[id]) ?? `/catalog/${map[id] ?? "MP2000"}.png?v=7`;
}

export function catalogPhoto(item: CatalogItem): string {
  return (
    bundledPhoto(item.id, item.sku, item.series.replace(/\s+/g, ""), item.series.replace(/\s+/g, "-")) ??
    `/catalog/${item.id}.png?v=8`
  );
}
