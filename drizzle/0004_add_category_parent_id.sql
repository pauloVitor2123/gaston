DROP INDEX IF EXISTS `categories_user_id_name_unique`;--> statement-breakpoint
ALTER TABLE `categories` ADD `parent_id` integer REFERENCES categories(id);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_id_parent_id_name_unique` ON `categories` (`user_id`,`parent_id`,`name`);