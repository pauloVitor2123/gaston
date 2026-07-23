CREATE TABLE `card_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`card_id` integer NOT NULL,
	`cycle_start` integer NOT NULL,
	`cycle_end` integer NOT NULL,
	`due_date` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`paid_amount_cents` integer,
	`paid_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `installment_purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`description` text NOT NULL,
	`total_amount_cents` integer NOT NULL,
	`installments_count` integer NOT NULL,
	`purchase_date` integer NOT NULL,
	`payment_method` text NOT NULL,
	`card_id` integer,
	`category_id` integer,
	`mantra_id` integer,
	`direction` text DEFAULT 'out' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mantra_id`) REFERENCES `mantras`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recurring_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`description` text NOT NULL,
	`kind` text NOT NULL,
	`expected_amount_cents` integer NOT NULL,
	`due_day` integer NOT NULL,
	`charge_day` integer,
	`payment_method` text NOT NULL,
	`card_id` integer,
	`category_id` integer,
	`mantra_id` integer,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mantra_id`) REFERENCES `mantras`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`direction` text NOT NULL,
	`description` text NOT NULL,
	`expected_amount_cents` integer NOT NULL,
	`actual_amount_cents` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`accrual_date` integer NOT NULL,
	`due_date` integer NOT NULL,
	`settled_at` integer,
	`payment_method` text NOT NULL,
	`card_id` integer,
	`card_invoice_id` integer,
	`category_id` integer,
	`mantra_id` integer,
	`source` text DEFAULT 'user' NOT NULL,
	`recurring_bill_id` integer,
	`installment_purchase_id` integer,
	`installment_number` integer,
	`note` text,
	`raw_message` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_invoice_id`) REFERENCES `card_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mantra_id`) REFERENCES `mantras`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_bill_id`) REFERENCES `recurring_bills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment_purchase_id`) REFERENCES `installment_purchases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tx_user_accrual` ON `transactions` (`user_id`,`accrual_date`);--> statement-breakpoint
CREATE INDEX `idx_tx_invoice` ON `transactions` (`card_invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_tx_status_due` ON `transactions` (`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `pending_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`state_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `llm_call_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`success` integer NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_logs_user_created` ON `llm_call_logs` (`user_id`,`created_at`);