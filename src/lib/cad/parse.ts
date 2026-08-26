/** Parse a typed CAD measurement into metres. World unit = 1 m. */

const IN_M = 0.0254;
const FT_M = 0.3048;

export type ParsedMeasure =
  | { ok: true; kind: "length"; meters: number }
  | { ok: true; kind: "diameter"; meters: number }
  | { ok: true; kind: "size"; width: number; height: number }
  | { ok: true; kind: "area"; meters2: number }
  | { ok: true; kind: "angle"; deg: number }
  | { ok: false };

export function parseCadInput(raw: string, localeUsesComma = true): ParsedMeasure {
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return { ok: false };

  const sizeSep = s.match(/[x×;]/i);
  if (sizeSep) {
    const i = s.search(/[x×;]/i);
    const a = parseLengthToken(s.slice(0, i), localeUsesComma);
    const b = parseLengthToken(s.slice(i + 1), localeUsesComma);
    if (a != null && b != null && a > 0 && b > 0) return { ok: true, kind: "size", width: a, height: b };
  }

  const diam = s.match(/^(ø|⌀|d|диам(?:етр)?)[=:]?(.+)$/i);
  if (diam) {
    const n = parseLengthToken(diam[2]!, localeUsesComma);
    if (n != null && n > 0) return { ok: true, kind: "diameter", meters: n };
  }

  const rad = s.match(/^(r|рад(?:иус)?)[=:]?(.+)$/i);
  if (rad) {
    const n = parseLengthToken(rad[2]!, localeUsesComma);
    if (n != null && n > 0) return { ok: true, kind: "length", meters: n };
  }

  if (/°$/.test(s) || /deg$/i.test(s)) {
    const n = parseNumberToken(s.replace(/°|deg/gi, ""), localeUsesComma);
    if (n != null) return { ok: true, kind: "angle", deg: n };
  }

  const area = s.match(/^(?:s|a|пл(?:ощадь)?)[=:]?([+-]?\d+(?:[.,]\d+)?)(m²|м²|m2|м2|sqm|ft²|sqft)?$/i);
  if (area && (/^(s|a|пл)/i.test(s) || /m²|м²|m2|м2|sqm|ft²|sqft/i.test(area[2] ?? ""))) {
    const n = parseNumberToken(area[1]!, localeUsesComma);
    if (n != null && n > 0) return { ok: true, kind: "area", meters2: n };
  }

  const area2 = s.match(/^([+-]?\d+(?:[.,]\d+)?)(m²|м²|m2|м2|sqm)$/i);
  if (area2) {
    const n = parseNumberToken(area2[1]!, localeUsesComma);
    if (n != null && n > 0) return { ok: true, kind: "area", meters2: n };
  }

  const meters = parseLengthToken(s, localeUsesComma);
  if (meters != null && meters > 0) return { ok: true, kind: "length", meters };
  return { ok: false };
}

export function parseLengthToken(token: string, localeUsesComma = true): number | null {
  const t = token.trim();
  if (!t) return null;
  const m = t.match(/^([+-]?\d+(?:[.,]\d+)?)(mm|мм|cm|см|m|м|in|inch|"|ft|foot|'|′|″)?$/i);
  if (!m) return null;
  const n = parseNumberToken(m[1]!, localeUsesComma);
  if (n == null) return null;
  const u = (m[2] ?? "m").toLowerCase();
  if (u === "mm" || u === "мм") return n / 1000;
  if (u === "cm" || u === "см") return n / 100;
  if (u === "in" || u === "inch" || u === '"' || u === "″") return n * IN_M;
  if (u === "ft" || u === "foot" || u === "'" || u === "′") return n * FT_M;
  return n;
}

function parseNumberToken(s: string, localeUsesComma: boolean): number | null {
  const t = s.trim();
  if (!t) return null;
  const normalized = localeUsesComma ? t.replace(",", ".") : t.replace(",", "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
