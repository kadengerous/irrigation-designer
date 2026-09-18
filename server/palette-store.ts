type Statement = {
  bind: (...values: string[]) => Statement;
  first: () => Promise<{ saved: string; recent: string } | null>;
  run: () => Promise<unknown>;
};
export type PaletteDB = { prepare: (sql: string) => Statement };
export type PaletteData = { saved: string[]; recent: string[] };
export function paletteDatabase(env: Record<string, unknown> | undefined): PaletteDB {
  const db = env?.DB as PaletteDB | undefined;
  if (!db?.prepare) throw new Error("Palette database binding is unavailable");
  return db;
}
export async function readPalette(db: PaletteDB, owner: string): Promise<PaletteData> {
  const row = await db
    .prepare("SELECT saved, recent FROM user_palettes WHERE owner = ?")
    .bind(owner)
    .first();
  return row
    ? { saved: JSON.parse(row.saved), recent: JSON.parse(row.recent) }
    : { saved: [], recent: [] };
}
export async function writePalette(db: PaletteDB, owner: string, data: PaletteData) {
  await db
    .prepare(
      "INSERT INTO user_palettes(owner,saved,recent) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET saved=excluded.saved,recent=excluded.recent",
    )
    .bind(owner, JSON.stringify(data.saved), JSON.stringify(data.recent))
    .run();
}
