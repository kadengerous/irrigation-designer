import { paletteDatabase, readPalette, writePalette, type PaletteData } from "../palette-store";
type PaletteRequest = Request & { runtime?: { cloudflare?: { env?: Record<string, unknown> } } };
type Event = { url: URL; req: PaletteRequest };
const validList = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= 48 &&
  v.every((c) => typeof c === "string" && /^#[\da-f]{6}$/i.test(c));
/** A private capability cookie isolates palettes without changing the app's sign-in workflow. */
export default async function paletteMiddleware(event: Event, next: () => Promise<unknown>) {
  if (event.url.pathname !== "/api/workspace-palette") return next();
  const request = event.req;
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "private, no-store",
    vary: "Cookie",
  });
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (!["GET", "PUT"].includes(request.method)) return reply({ error: "Method not allowed" }, 405);
  if (request.method === "PUT" && request.headers.get("origin") !== event.url.origin)
    return reply({ error: "Origin mismatch" }, 403);
  const old = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)__Host-irrigation-palette=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (request.method === "PUT" && !old)
    return reply({ error: "Reload the palette to establish its session" }, 401);
  const owner =
    old ??
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
  try {
    const db = paletteDatabase(request.runtime?.cloudflare?.env);
    if (request.method === "PUT") {
      if (Number(request.headers.get("content-length") ?? 0) > 4096)
        return reply({ error: "Too large" }, 413);
      const raw = await request.text();
      if (raw.length > 4096) return reply({ error: "Too large" }, 413);
      let data: PaletteData;
      try {
        data = JSON.parse(raw);
      } catch {
        return reply({ error: "Invalid JSON" }, 400);
      }
      if (!data || !validList(data.saved) || !validList(data.recent))
        return reply({ error: "Invalid colors" }, 400);
      await writePalette(db, owner, {
        saved: [...new Set(data.saved)],
        recent: [...new Set(data.recent)].slice(0, 24),
      });
    }
    const data = await readPalette(db, owner);
    if (!old)
      headers.set(
        "set-cookie",
        `__Host-irrigation-palette=${owner}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=31536000`,
      );
    return reply(data);
  } catch (error) {
    console.error("[workspace-palette] Storage failed", error);
    return reply({ error: "Palette storage is temporarily unavailable" }, 503);
  }
}
