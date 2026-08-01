CREATE TABLE `payment_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid_at` integer NOT NULL,
	`voided_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_payment_user_paid` ON `payment_events` (`user_id`,`paid_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_target` ON `payment_events` (`target_type`,`target_id`);