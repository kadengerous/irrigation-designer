CREATE TABLE `user_palettes` (
	`owner` text PRIMARY KEY NOT NULL,
	`saved` text DEFAULT '[]' NOT NULL,
	`recent` text DEFAULT '[]' NOT NULL
);
