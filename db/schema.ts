import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const palettes = sqliteTable("user_palettes", {
  owner: text("owner").primaryKey(),
  saved: text("saved").notNull().default("[]"),
  recent: text("recent").notNull().default("[]"),
});
export const plants = sqliteTable("landscape_plants", {
  id: text("id").primaryKey(),
  category: text("category"),
  searchText: text("search_text").notNull(),
  record: text("record").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("idx_landscape_plants_category").on(t.category)]);
export const plantSearchCache = sqliteTable("landscape_search_cache", {
  query: text("query").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
