import { matchLocale } from "../../src/lib/locale-config";
import { getPlant, initializeLandscape, searchPlants, type LandscapeDB } from "../landscape-store";
type Event = { url: URL; req: Request & { runtime?: { cloudflare?: { env?: Record<string, unknown> } } } };
export default async function landscapeMiddleware(event: Event, next: () => Promise<unknown>) {
  if (event.url.pathname !== "/api/landscape") return next();
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": status === 200 ? "public, max-age=300" : "no-store" } });
  if (event.req.method !== "GET") return reply({ errorKey: "libraryUnavailable" }, 405);
  const requestedLocale = event.url.searchParams.get("locale") ?? "ru";
  const locale = matchLocale(requestedLocale) ?? "en";
  const query = event.url.searchParams.get("q") ?? "";
  const category = event.url.searchParams.get("category") ?? "tree";
  const id = event.url.searchParams.get("id");
  const page = Number(event.url.searchParams.get("page") ?? 1);
  if (query.length > 120 || !["tree", "shrub", "flower"].includes(category) || !Number.isInteger(page) || page < 1 || page > 100 || (id && !/^[a-z0-9-]{1,120}$/.test(id)))
    return reply({ errorKey: "libraryUnavailable" }, 400);
  try {
    const db = event.req.runtime?.cloudflare?.env?.DB as LandscapeDB;
    if (!db?.prepare || !db?.batch) throw new Error("Landscape database binding unavailable");
    await initializeLandscape(db);
    if (id) { const plant = await getPlant(db, id); return plant ? reply({ plant }) : reply({ errorKey: "plantsNotFound" }, 404); }
    return reply(await searchPlants(db, query, category as "tree" | "shrub" | "flower", page, locale));
  } catch (error) {
    console.error("[landscape] Catalog unavailable", String(error));
    return reply({ errorKey: "plantsLoadError" }, 503);
  }
}
