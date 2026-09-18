import type { PlantRecord, PlantPhoto, PlantRange } from "../src/lib/landscape-types";

type Taxon = { id: number; name: string; rank_level: number; iconic_taxon_id: number;
  names?: { name: string; locale?: string; is_valid?: boolean }[];
  preferred_common_name?: string;
  default_photo?: { id: number; medium_url?: string; url?: string; attribution?: string; attribution_name?: string; license_code?: string } };
export const emptyWater = (): PlantRecord["water"] => ({ need: null, sourceUrl: null, context: null, quantity: null, method: null, wettingZone: null, recommendations: null });
export function taxonRecord(taxon: Taxon): PlantRecord | null {
  if (!Number.isSafeInteger(taxon.id) || taxon.id < 1 || taxon.iconic_taxon_id !== 47126 || taxon.rank_level > 10 || !taxon.name) return null;
  const names = (taxon.names ?? []).filter(n => n.is_valid !== false);
  const russianName = names.find(n => n.locale === "ru")?.name ?? (/^[А-Яа-яЁё]/.test(taxon.preferred_common_name ?? "") ? taxon.preferred_common_name! : null);
  const p = taxon.default_photo;
  const license = p?.license_code;
  const photos: PlantPhoto[] = [];
  if (p && license && ["cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa"].includes(license)) {
    const url = p.medium_url ?? p.url;
    if (url?.startsWith("https://")) photos.push({ url, pageUrl: `https://www.inaturalist.org/photos/${p.id}`,
      author: p.attribution_name ?? p.attribution ?? "iNaturalist", license: license.toUpperCase(),
      licenseUrl: license === "cc0" ? "https://creativecommons.org/publicdomain/zero/1.0/" : `https://creativecommons.org/licenses/${license.slice(3)}/4.0/` });
  }
  return { id: `inat-${taxon.id}`, externalId: taxon.id, russianName, latinName: taxon.name, cultivar: null,
    aliases: names.filter(n => n.locale === "ru" || n.locale === "sci").map(n => n.name).slice(0, 30),
    category: null, photos, matureHeightM: null, matureWidthM: null, light: null, soil: null, moisture: null,
    hardiness: null, description: null, water: emptyWater(), symbol: null,
    sources: [{ title: "iNaturalist · названия и фотографии", url: `https://www.inaturalist.org/taxa/${taxon.id}`, accessedAt: new Date().toISOString().slice(0, 10) }] };
}
export async function searchTaxa(query: string, page: number) {
  const url = new URL("https://api.inaturalist.org/v1/taxa");
  url.search = new URLSearchParams({ q: query, taxon_id: "47126", locale: "ru", all_names: "true", per_page: "24", page: String(page), is_active: "true" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Plant taxonomy provider: ${response.status}`);
  const data = await response.json() as { results?: Taxon[]; total_results?: number };
  if (!Array.isArray(data.results)) throw new Error("Invalid taxonomy response");
  return { plants: data.results.map(taxonRecord).filter((p): p is PlantRecord => Boolean(p)),
    hasMore: page * 24 < (data.total_results ?? 0) };
}

const textOf = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const section = (text: string, from: string, to: string) => {
  const a = text.indexOf(from), b = text.indexOf(to, a + from.length);
  return a >= 0 && b > a ? text.slice(a + from.length, b).trim() : "";
};
const translated = (text: string, values: [string, string][]) => values.filter(([key]) => text.includes(key)).map(([, value]) => value).join("; ") || null;
export function parseToolboxFacts(html: string, record: PlantRecord, sourceUrl: string): PlantRecord {
  const title = textOf(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  // Never apply a related species or cultivar's facts to the requested taxon.
  if (title.toLowerCase() !== record.latinName.toLowerCase()) return record;
  const text = textOf(html);
  const dimensions = section(text, "Dimensions:", "Whole Plant Traits:");
  const range = (label: string): PlantRange | null => {
    const match = dimensions.match(new RegExp(`${label}:\\s*(\\d+(?:\\.\\d+)?) ft\\.\\s*(\\d+) in\\.\\s*-\\s*(\\d+(?:\\.\\d+)?) ft\\.\\s*(\\d+) in\\.`));
    if (!match) return null;
    return { min: +(Number(match[1]) * 0.3048 + Number(match[2]) * 0.0254).toFixed(2), max: +(Number(match[3]) * 0.3048 + Number(match[4]) * 0.0254).toFixed(2), sourceUrl };
  };
  const traits = section(text, "Whole Plant Traits:", "Cultural Conditions:");
  const category = /Plant Type:.*?Tree/.test(traits) && !/Plant Type:.*?Shrub/.test(traits) ? "tree"
    : /Plant Type:.*?Shrub/.test(traits) ? "shrub" : /Plant Type:.*?(Herbaceous Perennial|Annual|Bulb)/.test(traits) ? "flower" : null;
  const light = translated(section(text, "Cultural Conditions: Light:", "Soil Texture:"), [["Full sun", "Солнце"], ["Partial Shade", "Полутень"], ["Dappled Sunlight", "Рассеянный свет"], ["Deep shade", "Тень"]]);
  const soil = translated(section(text, "Soil Texture:", "Soil pH:") || section(text, "Soil Texture:", "Soil Drainage:"), [["Clay", "Глинистая"], ["Loam", "Суглинок"], ["Sand", "Песчаная"], ["High Organic Matter", "Богатая органикой"], ["Shallow Rocky", "Каменистая"]]);
  const drainage = section(text, "Soil Drainage:", "USDA Plant Hardiness Zone:");
  const moisture = translated(drainage, [["Good Drainage", "Хороший дренаж"], ["Moist", "Влажная почва"], ["Occasionally Dry", "Допустимо временное подсыхание"], ["Occasionally Wet", "Допустимо временное переувлажнение"]]);
  const zones = text.match(/USDA Plant Hardiness Zone:\s*((?:\d{1,2}[ab](?:,?\s*)?)+)/)?.[1]?.trim().replace(/,$/, "");
  return { ...record, category: record.category ?? category, matureHeightM: range("Height"), matureWidthM: range("Width"), light, soil, moisture,
    hardiness: zones ? `USDA ${zones}` : null,
    symbol: record.symbol ?? (/Needled Evergreen/.test(traits) ? "conifer" : category === "tree" ? "deciduous" : category),
    sources: [...record.sources.filter(s => s.url !== sourceUrl), { title: "NC State Extension · характеристики", url: sourceUrl, accessedAt: new Date().toISOString().slice(0, 10) }] };
}
export async function enrichPlant(record: PlantRecord): Promise<PlantRecord> {
  if (!/^[A-Za-z]+ [a-z-]+$/.test(record.latinName) || record.cultivar) return record;
  const sourceUrl = `https://plants.ces.ncsu.edu/plants/${record.latinName.toLowerCase().replace(/ /g, "-")}/`;
  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(5500) });
    if (!response.ok) return record;
    return parseToolboxFacts(await response.text(), record, sourceUrl);
  } catch { return record; }
}
