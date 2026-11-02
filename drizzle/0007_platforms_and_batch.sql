CREATE TABLE `platforms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`synonyms` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platforms_user_id_name_unique` ON `platforms` (`user_id`,`name`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `platform_id` integer REFERENCES platforms(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `batch_id` text;--> statement-breakpoint
CREATE INDEX `idx_tx_user_batch` ON `transactions` (`user_id`,`batch_id`);