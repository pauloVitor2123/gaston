ALTER TABLE `users` ADD `balance_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `balance_set_at` integer DEFAULT (unixepoch()) NOT NULL;