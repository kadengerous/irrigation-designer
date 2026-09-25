import { PLANT_NAMES } from "../src/lib/data-i18n";
import seed from "../data/landscape-plants.json";
import { normalizePlantSearch, plantSearchText, type PlantCategory, type PlantRecord } from "../src/lib/landscape-types";
import { enrichPlant, searchTaxa } from "./landscape-sources";
type Row = { record?: string; payload?: string; updated_at?: number };
type Statement = { bind: (...values: (string | number | null)[]) => Statement; first: () => Promise<Row | null>; all: () => Promise<{ results: Row[] }>; run: () => Promise<unknown> };
export type LandscapeDB = { prepare: (sql: string) => Statement; batch: (statements: Statement[]) => Promise<unknown> };
const insert = (db: LandscapeDB, p: PlantRecord, replace = false) => db.prepare(`INSERT INTO landscape_plants(id,category,search_text,record,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) ${replace ? "DO UPDATE SET category=excluded.category,search_text=excluded.search_text,record=excluded.record,updated_at=excluded.updated_at" : "DO NOTHING"}`)
  .bind(p.id, p.category, plantSearchText(p), JSON.stringify(p), Date.now());
export async function initializeLandscape(db: LandscapeDB) {
  let hash = 2166136261;
  for (const char of JSON.stringify(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const marker = `catalog-seed-i18n-latin-search-v2-${hash >>> 0}`;
  if (await db.prepare("SELECT payload FROM landscape_search_cache WHERE query=?").bind(marker).first()) return;
  // Reindex cached records once when normalization changes; source facts and names stay intact.
  const existing = await db.prepare("SELECT record FROM landscape_plants").all();
  if (existing.results.length) await db.batch(existing.results.filter(row => row.record).map(row => insert(db, JSON.parse(row.record!) as PlantRecord, true)));
  await db.batch((seed as PlantRecord[]).map(p => insert(db, { ...p, names: PLANT_NAMES[p.latinName] ? { en: PLANT_NAMES[p.latinName]![0], ja: PLANT_NAMES[p.latinName]![1], "zh-CN": PLANT_NAMES[p.latinName]![2] } : p.names }, true)));
  await db.prepare("INSERT INTO landscape_search_cache(query,payload,updated_at) VALUES(?,?,?) ON CONFLICT(query) DO NOTHING").bind(marker, "{}", Date.now()).run();
}
export async function getPlant(db: LandscapeDB, id: string) {
  const row = await db.prepare("SELECT record,updated_at FROM landscape_plants WHERE id=?").bind(id).first();
  if (!row?.record) return null;
  const record = JSON.parse(row.record) as PlantRecord;
  if (!record.externalId || record.sources.some(s => s.url.includes("plants.ces.ncsu.edu"))) return record;
  const enriched = await enrichPlant(record);
  if (enriched !== record) await insert(db, enriched, true).run();
  return enriched;
}
export async function searchPlants(db: LandscapeDB, query: string, category: PlantCategory, page: number, locale = "ru") {
  const q = normalizePlantSearch(query);
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
  const where = terms.length ? terms.map(() => "search_text LIKE ? ESCAPE '\\'").join(" AND ") : "category=?";
  const args = terms.length ? terms.map(t => `%${t.replace(/[\\%_]/g, c => `\\${c}`)}%`) : [category];
  const result = await db.prepare(`SELECT record FROM landscape_plants WHERE ${where} ORDER BY CASE WHEN id LIKE 'plant-%' THEN 0 ELSE 1 END,id LIMIT 25 OFFSET ?`).bind(...args, (page - 1) * 24).all();
  const localNames = new Set<string>();
  let plants = result.results.slice(0, 24).map(row => JSON.parse(row.record!) as PlantRecord).filter(p => {
    const key = normalizePlantSearch(`${p.latinName} ${p.cultivar ?? ""}`);
    if (localNames.has(key)) return false; localNames.add(key); return true;
  });
  let hasMore = result.results.length > 24;
  let warning: string | null = null;
  if (q.length >= 2) {
    const cacheKey = `taxa:${locale}:${q}:${page}`;
    const cache = await db.prepare("SELECT payload,updated_at FROM landscape_search_cache WHERE query=?").bind(cacheKey).first();
    try {
      const external = cache?.payload && Date.now() - (cache.updated_at ?? 0) < 86400000 * 7
        ? JSON.parse(cache.payload) as Awaited<ReturnType<typeof searchTaxa>> : await searchTaxa(query, page, locale);
      if (!cache?.payload || Date.now() - (cache.updated_at ?? 0) >= 86400000 * 7) {
        if (external.plants.length) await db.batch(external.plants.map(p => insert(db, p)));
        await db.prepare("INSERT INTO landscape_search_cache(query,payload,updated_at) VALUES(?,?,?) ON CONFLICT(query) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
          .bind(cacheKey, JSON.stringify(external), Date.now()).run();
      }
      // Prefer verified horticultural records over a duplicate taxonomy-only result.
      const seen = new Set(plants.map(p => normalizePlantSearch(`${p.latinName} ${p.cultivar ?? ""}`)));
      plants = [...plants, ...external.plants.filter(p => { const key = normalizePlantSearch(`${p.latinName} ${p.cultivar ?? ""}`); if (seen.has(key)) return false; seen.add(key); return true; })];
      hasMore ||= external.hasMore;
    } catch (error) {
      console.error("[landscape] External search unavailable", String(error));
      warning = "plantsExternalUnavailable";
    }
  }
  return { plants, hasMore, warning, page };
}
