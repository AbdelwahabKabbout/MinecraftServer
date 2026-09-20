CREATE TABLE `console_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`server_id` text NOT NULL,
	`line` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `console_logs_server_id_idx` ON `console_logs` (`server_id`,`id`);