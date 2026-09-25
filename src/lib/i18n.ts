import { LOCALES, NUMBER_LOCALE, resolveLocale, type Locale } from "./locale-config";
export { LOCALES, NUMBER_LOCALE, type Locale } from "./locale-config";
export const parseLocale = resolveLocale;
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import es from "./locales/es.json";
import pt_BR from "./locales/pt-BR.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";
import de from "./locales/de.json";
import ar from "./locales/ar.json";
import trMessages from "./locales/tr.json";
import pl from "./locales/pl.json";
import zh_CN from "./locales/zh-CN.json";
import nl from "./locales/nl.json";
import cs from "./locales/cs.json";
import el from "./locales/el.json";
import hu from "./locales/hu.json";
import ro from "./locales/ro.json";
import sk from "./locales/sk.json";
import he from "./locales/he.json";
import uk from "./locales/uk.json";
import ja from "./locales/ja.json";

export type NumberFormat = "auto" | "space-comma" | "comma-dot" | "dot-comma";

export function parseNumberFormat(v: unknown): NumberFormat {
  return v === "space-comma" || v === "comma-dot" || v === "dot-comma" || v === "auto" ? v : "auto";
}

export function parseDecimals(v: unknown): number {
  const n = Number(v);
  return n === 0 || n === 1 || n === 2 || n === 3 ? n : 1;
}

let active: Locale = "ru";
let numberFormat: NumberFormat = "auto";
let decimals = 1;

export function setActiveLocale(l: Locale) {
  active = l;
}
export function activeLocale(): Locale { return active; }
export function text(key: string, vars?: Record<string, string | number>): string { return tr(active, key, vars); }
export function formatDate(value: string | number | Date, locale: Locale = active): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(NUMBER_LOCALE[locale]).format(date);
}
/** Normalize numeric glyphs and bidi formatting, never project names or stored values. */
export function normalizeNumericText(value: string): string {
  return value.normalize("NFKC")
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, ".").replace(/٬/g, ",").replace(/−/g, "-");
}
/** Accept native/full-width digits and localized separators; reject partial numbers. */
export function parseLocalizedNumber(value: string): number {
  const normalized = normalizeNumericText(value).replace(/[\s\u00a0\u202f]/g, "");
  const parts = new Intl.NumberFormat(activeNumberLocale()).formatToParts(12345.6);
  const group = normalizeNumericText(parts.find(part => part.type === "group")?.value ?? "");
  if (group === "," && /^[+-]?[1-9]\d{0,2}(,\d{3})+$/.test(normalized)) return Number(normalized.replaceAll(",", ""));
  if (group === "." && /^[+-]?[1-9]\d{0,2}(\.\d{3})+$/.test(normalized)) return Number(normalized.replaceAll(".", ""));
  let decimal = normalized.replace(",", ".");
  if (normalized.includes(",") && normalized.includes(".")) {
    const commaDecimal = normalized.lastIndexOf(",") > normalized.lastIndexOf(".");
    // Validate grouping before removing separators: 1.2.3,4 must not silently become 123.4.
    const valid = commaDecimal ? /^[+-]?\d{1,3}(\.\d{3})+,\d+$/ : /^[+-]?\d{1,3}(,\d{3})+\.\d+$/;
    if (!valid.test(normalized)) return NaN;
    decimal = commaDecimal ? normalized.replaceAll(".", "").replace(",", ".") : normalized.replaceAll(",", "");
  }
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(decimal) ? Number(decimal) : NaN;
}
export function setNumberPrefs(fmt: NumberFormat, d: number) {
  numberFormat = parseNumberFormat(fmt);
  decimals = parseDecimals(d);
}
export function activeNumberLocale() {
  if (numberFormat === "space-comma") return "ru-RU";
  if (numberFormat === "comma-dot") return "en-US";
  if (numberFormat === "dot-comma") return "de-DE";
  return NUMBER_LOCALE[active] ?? "ru-RU";
}
export function activeDecimals() {
  return decimals;
}
export function formatNumber(n: number, fractionDigits?: number): string {
  const d = fractionDigits ?? decimals;
  return n.toLocaleString(activeNumberLocale(), {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}


export const NEUTRAL_MESSAGE_KEYS = [
  // Manufacturer catalog category names intentionally remain English in every locale.
  'cat_mp','cat_mp800','cat_strip','cat_spray','cat_prostrip','cat_he','cat_fixed','cat_short','cat_stream','cat_rotor','cat_golf','cat_st','cat_bubbler',
  "estimatePdf", "estimateExcel", "estimateWord", "drawW", "drawL", "drawH", "drawNumHint", "hint_none",
  "exportDxfCad", "exportSvg", "exportJson", "exportPngFile", "hydroM_mp", "bodyCm",
  "fmtSpaceComma", "fmtCommaDot", "fmtDotComma", "area_m2", "area_ha", "area_ft2",
  "flow_lpm", "flow_lph", "flow_m3h", "flow_gpm", "flow_gph", "press_bar", "press_kpa", "press_psi",
  "pipe_mm", "pipe_in", "unit_mm", "unit_cm", "unit_m", "bar", "lpm", "mmhr", "m3h", "cat_corner", "bomRotator",
] as const;

const MESSAGES: Record<Locale, Record<string,string>> = {
  "en": en,
  "ru": ru,
  "es": es,
  "pt-BR": pt_BR,
  "fr": fr,
  "it": it,
  "de": de,
  "ar": ar,
  "tr": trMessages,
  "pl": pl,
  "zh-CN": zh_CN,
  "nl": nl,
  "cs": cs,
  "el": el,
  "hu": hu,
  "ro": ro,
  "sk": sk,
  "he": he,
  "uk": uk,
  "ja": ja
};

export function tr(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const raw = MESSAGES[resolveLocale(locale)]?.[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    return typeof value === "number" ? new Intl.NumberFormat(NUMBER_LOCALE[resolveLocale(locale)], { maximumFractionDigits: 20 }).format(value) : String(value ?? "");
  });
}

/** Each language owns every message; release validation rejects missing translations. */
export function localeMessages(locale: Locale): Readonly<Record<string, string>> {
  return MESSAGES[resolveLocale(locale)];
}
