CREATE TABLE `servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`minecraft_version` text,
	`loader` text DEFAULT 'fabric' NOT NULL,
	`loader_version` text,
	`java_path` text NOT NULL,
	`server_directory` text NOT NULL,
	`memory_min_mb` integer NOT NULL,
	`memory_max_mb` integer NOT NULL,
	`port` integer DEFAULT 25565 NOT NULL,
	`status` text DEFAULT 'OFFLINE' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `servers_slug_unique` ON `servers` (`slug`);