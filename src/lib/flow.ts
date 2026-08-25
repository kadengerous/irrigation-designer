import type { CatalogItem, FlowKind, PerfRow } from "@/lib/hunter-catalog";
import { itemById, workingPressureBar } from "@/lib/hunter-catalog";
import type { Head } from "@/lib/project-types";

export type FlowResult = {
  lpm: number | null;
  m3h: number | null;
  radiusM: number | null;
  precipMmHr: number | null;
  kind: FlowKind;
  note: string | null;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpRow(a: PerfRow, b: PerfRow, t: number, arcDeg: number): PerfRow {
  return {
    pressureBar: lerp(a.pressureBar, b.pressureBar, t),
    pressureKPa: lerp(a.pressureKPa, b.pressureKPa, t),
    radiusM: lerp(a.radiusM, b.radiusM, t),
    flowLMin: lerp(a.flowLMin, b.flowLMin, t),
    flowM3H: lerp(a.flowM3H, b.flowM3H, t),
    precipSquareMmH: lerp(a.precipSquareMmH, b.precipSquareMmH, t),
    precipTriangleMmH: lerp(a.precipTriangleMmH, b.precipTriangleMmH, t),
    arcDeg,
  };
}

function rowsForNozzle(item: CatalogItem, nozzleId: string | null): PerfRow[] {
  const nz =
    item.nozzles.find((n) => n.id === nozzleId) ??
    item.nozzles.find((n) => n.id === item.id) ??
    item.nozzles[0];
  return nz?.performance ?? [];
}

function atPressure(rows: PerfRow[], bar: number): { row: PerfRow; kind: FlowKind } | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.pressureBar - b.pressureBar);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (bar < first.pressureBar - 0.06 || bar > last.pressureBar + 0.06) return null;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (Math.abs(r.pressureBar - bar) < 0.06) return { row: r, kind: "table" };
    const n = sorted[i + 1];
    if (n && bar > r.pressureBar && bar < n.pressureBar) {
      const t = (bar - r.pressureBar) / (n.pressureBar - r.pressureBar);
      return { row: lerpRow(r, n, t, r.arcDeg), kind: "interpolated" };
    }
  }
  return { row: last, kind: "table" };
}

/**
 * Look up official flow. MP/MP800 matched-precip may scale table arc.
 * Rotors: same nozzle + pressure → same flow regardless of sector (TEST 3).
 */
export function computeFlow(
  item: CatalogItem,
  opts: {
    arc: number;
    radius: number;
    pressureBar: number;
    nozzleId?: string | null;
  },
): FlowResult {
  const empty: FlowResult = {
    lpm: null,
    m3h: null,
    radiusM: null,
    precipMmHr: item.precipMmHr,
    kind: "none",
    note: "Нет данных производителя",
  };
  const all = rowsForNozzle(item, opts.nozzleId ?? null);
  if (!all.length) {
    if ((item.family === "mp" || item.family === "mp800" || item.family === "strip") && item.precipMmHr) {
      const pr = item.precipMmHr;
      const r = opts.radius || item.rNom;
      const q360 = (pr * r * r) / 60;
      const lpm = q360 * (opts.arc / 360);
      return {
        lpm,
        m3h: lpm * 0.06,
        radiusM: r,
        precipMmHr: pr,
        kind: "matched-precip",
        note: "расчёт по matched precipitation",
      };
    }
    return empty;
  }

  const arcs = [...new Set(all.map((r) => r.arcDeg))].sort((a, b) => a - b);
  let arcUse = arcs[0]!;
  let best = Infinity;
  for (const a of arcs) {
    const d = Math.abs(a - opts.arc);
    if (d < best) {
      best = d;
      arcUse = a;
    }
  }

  const atArc = all.filter((r) => r.arcDeg === arcUse);
  const found = atPressure(atArc, opts.pressureBar);
  if (!found) {
    return { ...empty, note: "Давление вне official performance table" };
  }

  let lpm = found.row.flowLMin;
  let kind: FlowKind = found.kind;
  let note: string | null = found.kind === "interpolated" ? "расчётное значение между табличными точками" : null;

  const matched = item.family === "mp" || item.family === "mp800" || item.family === "strip";
  if (matched && arcUse !== opts.arc && opts.arc > 0) {
    lpm = lpm * (opts.arc / arcUse);
    kind = "matched-precip";
    note = "расчёт по matched precipitation";
  }

  if (matched && opts.radius && found.row.radiusM && Math.abs(opts.radius - found.row.radiusM) > 0.08) {
    const ratio = (opts.radius / found.row.radiusM) ** 2;
    lpm *= ratio;
    kind = "matched-precip";
    note = "расчёт по matched precipitation";
  }

  return {
    lpm,
    m3h: lpm * 0.06,
    radiusM: found.row.radiusM,
    precipMmHr: found.row.precipSquareMmH,
    kind,
    note,
  };
}

export function flowLpm(
  item: CatalogItem,
  arc: number,
  pressureBar = 2.8,
  radius?: number,
  nozzleId?: string | null,
): number | null {
  return computeFlow(item, { arc, radius: radius ?? item.rNom, pressureBar, nozzleId }).lpm;
}

export function headFlow(h: Head): FlowResult {
  const item = itemById(h.catalogId);
  if (!item) {
    return { lpm: null, m3h: null, radiusM: null, precipMmHr: null, kind: "none", note: "Требуется проверка модели" };
  }
  return computeFlow(item, {
    arc: h.arc,
    radius: h.r,
    pressureBar: workingPressureBar(item, h.bodyId, h.nozzleId),
    nozzleId: h.nozzleId,
  });
}

export function squarePrecipMmHr(qM3h: number, spacingM: number, rowM = spacingM): number {
  if (spacingM <= 0 || rowM <= 0) return 0;
  return (1000 * qM3h) / (spacingM * rowM);
}

export function trianglePrecipMmHr(qM3h: number, spacingM: number): number {
  if (spacingM <= 0) return 0;
  return (1000 * qM3h) / (0.866 * spacingM * spacingM);
}

export function totalAreaPrecip(sumLpm: number, areaM2: number): number {
  if (areaM2 <= 0) return 0;
  return (60 * sumLpm) / areaM2;
}

export function runTimeMin(targetMm: number, precipMmHr: number): number | null {
  if (precipMmHr <= 0) return null;
  return (targetMm / precipMmHr) * 60;
}
