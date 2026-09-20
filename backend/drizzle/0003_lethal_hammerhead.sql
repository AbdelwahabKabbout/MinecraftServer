CREATE TABLE `modpacks` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`minecraft_version` text NOT NULL,
	`loader` text DEFAULT 'fabric' NOT NULL,
	`loader_version` text,
	`manifest` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modpacks_slug_unique` ON `modpacks` (`slug`);