import { equipmentDescription } from "./equipment-descriptions";
import { isPlantVisual } from "./plant-visuals";
import { activeLocale, text, tr, formatNumber, type Locale } from "./i18n";
import { CATALOG_MESSAGE_KEYS, LEGACY_FACT_KEYS, PLANT_NAMES } from "./data-i18n";
import { currentUnits, fromMeters, lenLabel, formatFlowU, formatLenU, formatPressureU, precipitationUnit } from "./units";
import type { CatalogItem } from "./equipment-catalog";
import type { PlantRecord, PlantWaterRange } from "./landscape-types";

export function localizedFact(value: string | null | undefined, locale: Locale = activeLocale()): string | null {
  if (!value) return null;
  const key = LEGACY_FACT_KEYS[value.toLocaleLowerCase("ru")];
  if (key) return tr(locale, key);
  if (CATALOG_MESSAGE_KEYS.has(value)) return tr(locale, value);
  return value.split(/;\s*/).map(part => {
    const id = CATALOG_MESSAGE_KEYS.has(part) ? part : LEGACY_FACT_KEYS[part.toLocaleLowerCase("ru")];
    return id ? tr(locale, id) : part;
  }).join(locale === "ja" ? "・" : locale === "zh-CN" ? "；" : "; ");
}
export function catalogColor(value: string, locale: Locale = activeLocale()): string {
  if(!value.trim())return tr(locale,'color_none');
  const variants: Record<string,string> = { "бежевое": "color_beige", "бежевый": "color_beige", "голубое": "color_lightBlue", "зелёное": "color_green", "коричневое": "color_brown", "красное": "color_red", "серое": "color_gray", "тёмно-зелёное": "color_darkGreen", "тёмно-синее": "color_darkBlue", "чёрное": "color_black", "тёмно-коричневый": "color_darkBrown" };
  const official:Record<string,string>={white:'color_white',black:'color_black',red:'color_red',blue:'color_blue',green:'color_green',yellow:'color_yellow',gray:'color_gray',grey:'color_gray','light gray':'color_lightGray','dark gray':'color_darkGray','dark grey':'color_darkGray','light grey':'color_lightGray','medium grey':'color_gray','medium gray':'color_gray','medium green':'color_mediumGreen','medium blue':'color_mediumBlue','burnt orange':'color_burntOrange',olive:'color_olive',brown:'color_brown',tan:'color_tan',beige:'color_beige','light green':'color_lightGreen','light blue':'color_lightBlue','dark green':'color_darkGreen','dark blue':'color_darkBlue','dark brown':'color_darkBrown',orange:'color_orange',maroon:'color_maroon',burgundy:'color_maroon',purple:'color_purple',lavender:'color:#dcccec','not specified':'color_none',unknown:'color_none'};
  return value.split(/\s*\/\s*/).map(part => {
    const key=variants[part]??official[part.toLowerCase()];
    return key?tr(locale,key):localizedFact(part,locale)??part;
  }).join(" / ");
}
export function plantName(record: PlantRecord, locale: Locale = activeLocale()): string {
  if (record.decorative && isPlantVisual(record.visualId)) return tr(locale, `plantVisual_${record.visualId}`);
  if (locale === "ru") return record.russianName ?? record.names?.ru ?? record.latinName;
  const names = PLANT_NAMES[record.latinName];
  const savedNames = record.names as Record<string,string> | undefined;
  return savedNames?.[locale] ?? savedNames?.[locale === "zh-CN" ? "zh" : locale === "pt-BR" ? "pt" : locale] ?? (locale === "en" ? names?.[0] : locale === "ja" ? names?.[1] : locale === "zh-CN" ? names?.[2] : undefined) ?? record.latinName;
}
export function plantWaterQuantity(quantity: PlantWaterRange): string {
  const units = currentUnits(), perPlant = quantity.unit.startsWith("L/");
  const usVolume = units.flow === "gpm" || units.flow === "gph";
  const depthUnit = precipitationUnit(units);
  const factor = perPlant ? (usVolume ? 1 / 3.785411784 : 1) : depthUnit === "in" ? 1 / 25.4 : 1;
  const value = `${formatNumber(quantity.min * factor, 2)}–${formatNumber(quantity.max * factor, 2)}`;
  const unit = perPlant ? text(usVolume ? "volumeGal" : "volumeL") : lenLabel(depthUnit);
  const key = `water${perPlant ? "Plant" : "Depth"}${quantity.unit.endsWith("week") ? "Week" : "Day"}`;
  return `${text(key, { value, unit })} · ${localizedFact(quantity.conditions) ?? ""}`;
}
export function popUpHeight(mm: number | null, locale: Locale = activeLocale()) {
  if (mm == null) return tr(locale, "noData");
  if (mm === 0) return tr(locale, "bodyNoPopUp");
  const unit = precipitationUnit() === "in" ? "in" : "cm", value = fromMeters(mm / 1000, unit);
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 2)} ${lenLabel(unit)}`;
}
export function catalogName(item: CatalogItem): string {
  if (item.type === "body") return item.sku ?? item.name;
  if (/ регулируемое$/.test(item.name)) return tr('en',"catalogAdjusted", { id: item.id });
  const key = { "MP-LCS-515": "catalogLeftStrip", "MP-RCS-515": "catalogRightStrip", "MP-SS-530": "catalogSideStrip" }[item.id];
  return key ? tr('en',key, { id: item.id }) : item.name;
}
export function catalogUse(item: CatalogItem) {
  const description=equipmentDescription(item.id);
  if(description) return text(description.key);
  // Localized prose uses structured specifications rather than embedding SI values in sentences.
  return text(item.discontinued ? "noteArchive" : item.type === "body" ? "useBody" : item.type === "rotor" ? "useRotor" :
    item.type === "bubbler" ? "useBubbler" : item.strip ? "useStrip" : item.family === "mp800" ? "useMp800" :
    item.id.startsWith("MP3500") ? "useMp3500" : item.family === "mp" ? "useMp" : "useSpray");
}
export function catalogNote(item: CatalogItem) {
  if (!item.dataNote) return null;
  if(item.manufacturerId&&item.manufacturerId!=='hunter')return item.verificationStatus==='Needs Review'?text('equipment.needsReview'):null;
  if (item.id === "AFB") return text("noteAdjustableBubbler", { flow: formatFlowU(7.570823568, currentUnits().flow) });
  if (item.dataNote.includes("360° / 40 PSI")) return text("noteTableConflict", { pressure: formatPressureU(2.8, currentUnits().pressure) });
  return localizedFact(item.dataNote);
}

export function nozzleName(nozzle: { name: string; id: string }) {
  if (nozzle.name.startsWith("Сопло ")) return tr('en',"nozzleNamed", { name: nozzle.name.slice(6) });
  if (/ регулируемое$/.test(nozzle.name)) return tr('en',"catalogAdjusted", { id: nozzle.name.split(" ")[0]! });
  const item = { name: nozzle.name, id: nozzle.id } as CatalogItem;
  return catalogName(item);
}
