CREATE TABLE `landscape_search_cache` (
	`query` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `landscape_plants` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text,
	`search_text` text NOT NULL,
	`record` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_landscape_plants_category` ON `landscape_plants` (`category`);