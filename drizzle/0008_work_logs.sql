CREATE TABLE `work_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`period` text NOT NULL,
	`period_start` integer NOT NULL,
	`km` real,
	`online_minutes` integer,
	`rides` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`batch_id` text,
	`raw_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_work_logs_user_period` ON `work_logs` (`user_id`,`period_start`);--> statement-breakpoint
CREATE INDEX `idx_work_logs_user_batch` ON `work_logs` (`user_id`,`batch_id`);