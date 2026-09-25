import { formatNumber, parseLocale, text, type Locale, type NumberFormat } from "@/lib/i18n";
import type { MeasureUnit } from "@/lib/geometry";

/** Official Hunter US → SI factors. 40 PSI is labelled 2.8 bar / 280 kPa on Hunter cutsheets. */

export const PSI_TO_BAR = 0.0689476;
export const PSI_TO_KPA = 6.89476;
export const FT_TO_M = 0.3048;
export const GPM_TO_LMIN = 3.78541178;
export const GPM_TO_M3H = 0.2271247;
export const INHR_TO_MMHR = 25.4;

const HUNTER_PSI_BAR: Record<number, number> = {
  25: 1.7,
  30: 2.1,
  35: 2.4,
  40: 2.8,
  45: 3.1,
  50: 3.4,
  55: 3.8,
  60: 4.1,
  65: 4.5,
  70: 4.8,
};

export function hunterBar(psi: number): number {
  return HUNTER_PSI_BAR[psi] ?? +(psi * PSI_TO_BAR).toFixed(4);
}

export function usPerf(psi: number, radiusFt: number, gpm: number, precipInHr: number) {
  const bar = hunterBar(psi);
  return {
    pressureBar: bar,
    pressureKPa: +(bar * 100).toFixed(1),
    radiusM: +(radiusFt * FT_TO_M).toFixed(4),
    flowLMin: +(gpm * GPM_TO_LMIN).toFixed(4),
    flowM3H: +(gpm * GPM_TO_M3H).toFixed(4),
    precipSquareMmH: +(precipInHr * INHR_TO_MMHR).toFixed(2),
    precipTriangleMmH: +((precipInHr * INHR_TO_MMHR) / 0.866).toFixed(2),
  };
}

export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft";
export type AreaUnit = "m2" | "are" | "ha" | "ft2" | "acre";
export type FlowUnit = "lpm" | "lph" | "m3h" | "gpm" | "gph";
export type PressureUnit = "bar" | "kpa" | "psi";
export type PipeUnit = "mm" | "in";
export type UnitPreset = "metric" | "us" | "custom";

export type UnitPrefs = {
  length: LengthUnit;
  area: AreaUnit;
  flow: FlowUnit;
  pressure: PressureUnit;
  pipe: PipeUnit;
};

export const METRIC_UNITS: UnitPrefs = { length: "m", area: "m2", flow: "lpm", pressure: "bar", pipe: "mm" };
export const US_UNITS: UnitPrefs = { length: "ft", area: "ft2", flow: "gpm", pressure: "psi", pipe: "in" };
let activeUnits: UnitPrefs = { ...METRIC_UNITS };
export function setActiveUnits(units: UnitPrefs) { activeUnits = { ...units }; }
export function currentUnits(): UnitPrefs { return activeUnits; }

export const LENGTH_OPTS: LengthUnit[] = ["mm", "cm", "m", "in", "ft"];
export const AREA_OPTS: AreaUnit[] = ["m2", "are", "ha", "ft2", "acre"];
export const FLOW_OPTS: FlowUnit[] = ["lpm", "lph", "m3h", "gpm", "gph"];
export const PRESSURE_OPTS: PressureUnit[] = ["bar", "kpa", "psi"];
export const PIPE_OPTS: PipeUnit[] = ["mm", "in"];

export function parseLengthUnit(v: unknown): LengthUnit {
  return LENGTH_OPTS.includes(v as LengthUnit) ? (v as LengthUnit) : "m";
}
export function parseAreaUnit(v: unknown): AreaUnit {
  return AREA_OPTS.includes(v as AreaUnit) ? (v as AreaUnit) : "m2";
}
export function parseFlowUnit(v: unknown): FlowUnit {
  return FLOW_OPTS.includes(v as FlowUnit) ? (v as FlowUnit) : "lpm";
}
export function parsePressureUnit(v: unknown): PressureUnit {
  return PRESSURE_OPTS.includes(v as PressureUnit) ? (v as PressureUnit) : "bar";
}
export function parsePipeUnit(v: unknown): PipeUnit {
  return PIPE_OPTS.includes(v as PipeUnit) ? (v as PipeUnit) : "mm";
}

export function parseUnitPrefs(v: unknown, lengthFallback: MeasureUnit = "m"): UnitPrefs {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const length = parseLengthUnit(o.length ?? (lengthFallback === "yd" ? "ft" : lengthFallback));
  return {
    length,
    area: parseAreaUnit(o.area),
    flow: parseFlowUnit(o.flow),
    pressure: parsePressureUnit(o.pressure),
    pipe: parsePipeUnit(o.pipe),
  };
}

export function detectPreset(u: UnitPrefs): UnitPreset {
  const same = (a: UnitPrefs, b: UnitPrefs) =>
    a.length === b.length && a.area === b.area && a.flow === b.flow && a.pressure === b.pressure && a.pipe === b.pipe;
  if (same(u, METRIC_UNITS)) return "metric";
  if (same(u, US_UNITS)) return "us";
  return "custom";
}

const IN_M = 0.0254;
const FT_M = 0.3048;
const FT2 = 0.09290304;
const ACRE = 4046.8564224;
const GAL = 3.785411784;

export function fromMeters(m: number, u: LengthUnit): number {
  if (u === "mm") return m * 1000;
  if (u === "cm") return m * 100;
  if (u === "in") return m / IN_M;
  if (u === "ft") return m / FT_M;
  return m;
}

export function toMetersLen(v: number, u: LengthUnit): number {
  if (u === "mm") return v / 1000;
  if (u === "cm") return v / 100;
  if (u === "in") return v * IN_M;
  if (u === "ft") return v * FT_M;
  return v;
}

export function fromM2(m2: number, u: AreaUnit): number {
  if (u === "are") return m2 / 100;
  if (u === "ha") return m2 / 10000;
  if (u === "ft2") return m2 / FT2;
  if (u === "acre") return m2 / ACRE;
  return m2;
}

export function toM2(v: number, u: AreaUnit): number {
  if (u === "are") return v * 100;
  if (u === "ha") return v * 10000;
  if (u === "ft2") return v * FT2;
  if (u === "acre") return v * ACRE;
  return v;
}

export function fromLpm(lpm: number, u: FlowUnit): number {
  if (u === "lph") return lpm * 60;
  if (u === "m3h") return lpm * 0.06;
  if (u === "gpm") return lpm / GAL;
  if (u === "gph") return (lpm / GAL) * 60;
  return lpm;
}

export function fromBar(bar: number, u: PressureUnit): number {
  if (u === "kpa") return bar * 100;
  if (u === "psi") return bar * 14.5037738;
  return bar;
}
export function toLpm(value: number, u: FlowUnit): number { return value / fromLpm(1, u); }
export function toBar(value: number, u: PressureUnit): number { return value / fromBar(1, u); }
export function precipitationUnit(units: UnitPrefs = activeUnits): "mm" | "in" { return units.length === "ft" || units.length === "in" ? "in" : "mm"; }
export function formatDepth(mm: number, units: UnitPrefs = activeUnits): string {
  const u = precipitationUnit(units); return `${formatNumber(u === "in" ? mm / 25.4 : mm, 2)} ${lenLabel(u)}`;
}
export function formatPrecipitation(mmPerHour: number, units: UnitPrefs = activeUnits): string {
  return `${formatDepth(mmPerHour, units)}/${text("unitHourShort")}`;
}

export function fromMmPipe(mm: number, u: PipeUnit): number {
  return u === "in" ? mm / 25.4 : mm;
}

export function formatLenU(meters: number, u: LengthUnit): string {
  const d = u === "mm" ? 0 : u === "cm" ? 1 : 2;
  return `${formatNumber(fromMeters(meters, u), d)} ${lenLabel(u)}`;
}

export function formatGridStep(meters: number, u: LengthUnit): string {
  if ((u === "m" || u === "cm" || u === "mm") && meters < 0.1) return formatLenU(meters, "cm");
  if ((u === "ft" || u === "in") && meters < 0.3048) return formatLenU(meters, "in");
  return formatLenU(meters, u);
}

export function formatAreaU(m2: number, u: AreaUnit): string {
  return `${formatNumber(fromM2(m2, u), u === "acre" || u === "ha" ? 3 : 1)} ${areaLabel(u)}`;
}

export function formatFlowU(lpm: number, u: FlowUnit): string {
  return `${formatNumber(fromLpm(lpm, u), 2)} ${flowLabel(u)}`;
}

export function formatPressureU(bar: number, u: PressureUnit): string {
  return `${formatNumber(fromBar(bar, u), u === "kpa" ? 0 : 2)} ${pressureLabel(u)}`;
}

export function lenLabel(u: LengthUnit): string {
  return text(`unit_${u}`);
}
export function areaLabel(u: AreaUnit): string {
  return text(`area_${u}`);
}
export function flowLabel(u: FlowUnit): string {
  return text(`flow_${u}`);
}
export function pressureLabel(u: PressureUnit): string {
  return text(`press_${u}`);
}

const EN_METRIC_REGIONS = new Set(["GB", "AU", "NZ", "CA", "IE", "IN", "ZA", "SG"]);

export function regionFromBcp47(tag: string): string | null {
  const p = tag.trim().split(/[-_]/);
  return p[1] ? p[1]!.toUpperCase() : null;
}

export function localeFromBcp47(tag: string): Locale {
  return parseLocale(tag);
}

export function deviceBcp47(): string {
  if (typeof navigator === "undefined") return "ru-RU";
  return navigator.languages?.[0] || navigator.language || "ru-RU";
}

/** Recommended unit system for a UI language. English uses device region when available. */
export function recommendedUnitSystem(locale: Locale, region?: string | null): "metric" | "us" {
  if (locale !== "en") return "metric";
  const r = (region ?? "").toUpperCase();
  if (!r) return "us";
  if (r === "US") return "us";
  if (EN_METRIC_REGIONS.has(r)) return "metric";
  return "us";
}

export function numberFormatForUnits(preset: UnitPreset): NumberFormat {
  return preset === "us" ? "comma-dot" : "space-comma";
}

export function unitsFromPreset(preset: "metric" | "us"): UnitPrefs {
  return preset === "us" ? { ...US_UNITS } : { ...METRIC_UNITS };
}

export function bootstrapLocaleAndUnits(tag = deviceBcp47()): {
  locale: Locale;
  unitPreset: "metric" | "us";
  units: UnitPrefs;
  measureUnit: LengthUnit;
  numberFormat: NumberFormat;
} {
  const locale = localeFromBcp47(tag);
  const unitPreset = recommendedUnitSystem(locale, regionFromBcp47(tag));
  const units = unitsFromPreset(unitPreset);
  return {
    locale,
    unitPreset,
    units,
    measureUnit: units.length,
    numberFormat: "auto",
  };
}
export function pipeLabel(u: PipeUnit): string {
  return lenLabel(u);
}
