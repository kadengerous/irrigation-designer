import { normalizeNumericText, parseLocalizedNumber } from "../i18n";
import { currentUnits, toMetersLen, toM2 } from "../units";
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
  const s = normalizeNumericText(raw).trim().toLowerCase().replace(/\s+/g, "")
    .replace(/(?:מילימטר(?:ים)?|مليمتر(?:ات)?|міліметр(?:и|ів)?|миллиметр(?:ов|а)?|ミリメートル|毫米|milímetros?|millimeters?|millimetres?|millimètres?|millimetri|milimetri|milimetre|milimetr(?:ů|ov|ów|y)?|χιλιοστ(?:ά|ό))(?!\p{L})/gu, "mm")
    .replace(/(?:סנטימטר(?:ים)?|سنتيمتر(?:ات)?|сантиметр(?:и|ів|ов|а)?|センチメートル|厘米|centímetros?|centimeters?|centimetres?|centimètres?|centimetri|centimetr(?:ů|ov)?|centymetr(?:ów|y)?|zentimeter|santimetre|εκατοστ(?:ά|ό))(?!\p{L})/gu, "cm")
    .replace(/(?:מטר(?:ים)?|أمتار|متر|метр(?:и|ів|ов|а)?|メートル|米|metros?|meters?|metres?|mètres?|metri|metr(?:ů|ov|ów|y)?|méter|μέτρ(?:α|ο))(?!\p{L})/gu, "m")
    .replace(/(?:אינץ[׳']?|بوص(?:ة|ات)|дюйм(?:и|ів|ов|а)?|インチ|英寸|inches|pulgadas?|zoll|pouces?|polegadas?|pollici|cal(?:e|i)?|inç|palc(?:e|ů|ov)|hüvelyk|ίντσ(?:α|ες)|inci|duim)(?!\p{L})/gu, "in")
    .replace(/(?:רגל(?:יים)?|قدم|أقدام|фут(?:и|ів|ов|а)?|フィート|英尺|feet|piedi|pieds?|pies|pie|fuß|fuss|pés|pé|stop(?:a|y)?|stóp|fit|voet(?:en)?|láb|πόδ(?:ι|ια)|picior|picioare)(?!\p{L})/gu, "ft");
  if (!s) return { ok: false };

  const sizeSep = s.match(/[x×;]/i);
  if (sizeSep) {
    const i = s.search(/[x×;]/i);
    const a = parseLengthToken(s.slice(0, i), localeUsesComma);
    const b = parseLengthToken(s.slice(i + 1), localeUsesComma);
    if (a != null && b != null && a > 0 && b > 0) return { ok: true, kind: "size", width: a, height: b };
  }

  const diam = s.match(/^(ø|⌀|d|диам(?:етр)?|直径)[=:]?(.+)$/i);
  if (diam) {
    const n = parseLengthToken(diam[2]!, localeUsesComma);
    if (n != null && n > 0) return { ok: true, kind: "diameter", meters: n };
  }

  const rad = s.match(/^(r|рад(?:иус)?|半径)[=:]?(.+)$/i);
  if (rad) {
    const n = parseLengthToken(rad[2]!, localeUsesComma);
    if (n != null && n > 0) return { ok: true, kind: "length", meters: n };
  }

  if (/°$/.test(s) || /deg$/i.test(s)) {
    const n = parseNumberToken(s.replace(/°|deg/gi, ""), localeUsesComma);
    if (n != null) return { ok: true, kind: "angle", deg: n };
  }

  const area = s.match(/^(?:s|a|пл(?:ощадь)?|面積|面积)[=:]?([+-]?(?:\d[\d.,]*|[.,]\d+))(m²|м²|m2|м2|sqm|ft²|ft2|sqft)?$/i);
  if (area && (/^(s|a|пл|面積|面积)/i.test(s) || /m²|м²|m2|м2|sqm|ft²|ft2|sqft/i.test(area[2] ?? ""))) {
    const n = parseNumberToken(area[1]!, localeUsesComma);
    if (n != null && n > 0) return { ok: true, kind: "area", meters2: toM2(n, area[2] ? /ft|sqft/.test(area[2]) ? "ft2" : "m2" : currentUnits().area) };
  }

  const area2 = s.match(/^([+-]?(?:\d[\d.,]*|[.,]\d+))(m²|м²|m2|м2|sqm|ft²|ft2|sqft)$/i);
  if (area2) {
    const n = parseNumberToken(area2[1]!, localeUsesComma);
    if (n != null && n > 0) return { ok: true, kind: "area", meters2: toM2(n, /ft|sqft/.test(area2[2]!) ? "ft2" : "m2") };
  }

  const meters = parseLengthToken(s, localeUsesComma);
  if (meters != null && meters > 0) return { ok: true, kind: "length", meters };
  return { ok: false };
}

export function parseLengthToken(token: string, localeUsesComma = true): number | null {
  const t = normalizeNumericText(token).trim();
  if (!t) return null;
  const m = t.match(/^([+-]?(?:\d[\d.,]*|[.,]\d+))(mm|мм|cm|см|m|м|in|inch|"|ft|foot|'|′|″)?$/i);
  if (!m) return null;
  const n = parseNumberToken(m[1]!, localeUsesComma);
  if (n == null) return null;
  if (!m[2]) return toMetersLen(n, currentUnits().length);
  const u = m[2].toLowerCase();
  if (u === "mm" || u === "мм") return n / 1000;
  if (u === "cm" || u === "см") return n / 100;
  if (u === "in" || u === "inch" || u === '"' || u === "″") return n * IN_M;
  if (u === "ft" || u === "foot" || u === "'" || u === "′") return n * FT_M;
  return n;
}

function parseNumberToken(s: string, localeUsesComma: boolean): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseLocalizedNumber(t);
  return Number.isFinite(n) ? n : null;
}
