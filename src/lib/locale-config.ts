/** Canonical BCP 47 identifiers shared by settings, catalogs, formatting and exports. */
export const LOCALES = [
  { id: "en", native: "English", dir: "ltr" },
  { id: "ru", native: "Русский", dir: "ltr" },
  { id: "es", native: "Español", dir: "ltr" },
  { id: "pt-BR", native: "Português (Brasil)", dir: "ltr" },
  { id: "fr", native: "Français", dir: "ltr" },
  { id: "it", native: "Italiano", dir: "ltr" },
  { id: "de", native: "Deutsch", dir: "ltr" },
  { id: "ar", native: "العربية", dir: "rtl" },
  { id: "tr", native: "Türkçe", dir: "ltr" },
  { id: "pl", native: "Polski", dir: "ltr" },
  { id: "zh-CN", native: "简体中文", dir: "ltr" },
  { id: "nl", native: "Nederlands", dir: "ltr" },
  { id: "cs", native: "Čeština", dir: "ltr" },
  { id: "el", native: "Ελληνικά", dir: "ltr" },
  { id: "hu", native: "Magyar", dir: "ltr" },
  { id: "ro", native: "Română", dir: "ltr" },
  { id: "sk", native: "Slovenčina", dir: "ltr" },
  { id: "he", native: "עברית", dir: "rtl" },
  { id: "uk", native: "Українська", dir: "ltr" },
  { id: "ja", native: "日本語", dir: "ltr" },
] as const;
export type Locale = (typeof LOCALES)[number]["id"];
export const NUMBER_LOCALE: Record<Locale, string> = {
  en: "en-US", ru: "ru-RU", es: "es-ES", "pt-BR": "pt-BR", fr: "fr-FR", it: "it-IT", de: "de-DE",
  ar: "ar-EG", tr: "tr-TR", pl: "pl-PL", "zh-CN": "zh-CN", nl: "nl-NL", cs: "cs-CZ", el: "el-GR",
  hu: "hu-HU", ro: "ro-RO", sk: "sk-SK", he: "he-IL", uk: "uk-UA", ja: "ja-JP",
};
export const isLocale = (value: string): value is Locale => LOCALES.some(locale => locale.id === value);
/** Older pt/zh preferences remain valid, without changing any project data. */
export function matchLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().replaceAll("_", "-").toLowerCase();
  const language = tag.split("-")[0];
  if (language === "pt") return "pt-BR";
  if (language === "zh") return "zh-CN";
  if (language === "iw") return "he";
  return LOCALES.find(locale => locale.id.toLowerCase() === tag || locale.id === language)?.id ?? null;
}
export const resolveLocale = (value: unknown): Locale => matchLocale(value) ?? "ru";
export const localeDirection = (locale: Locale): "rtl" | "ltr" => locale === "ar" || locale === "he" ? "rtl" : "ltr";
