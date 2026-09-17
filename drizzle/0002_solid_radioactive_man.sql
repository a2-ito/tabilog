CREATE TABLE `trip_currencies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`code` text NOT NULL,
	`rate_to_jpy` real NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_currencies_trip_code_idx` ON `trip_currencies` (`trip_id`,`code`);--> statement-breakpoint
-- 既存の旅行が持っていた現地通貨を移す。円は主通貨として常に使えるので保存しない
INSERT INTO `trip_currencies` (`trip_id`, `code`, `rate_to_jpy`, `sort_order`)
SELECT `id`, upper(`currency`), `rate_to_jpy`, 0 FROM `trips` WHERE upper(`currency`) <> 'JPY';--> statement-breakpoint
ALTER TABLE `trips` DROP COLUMN `currency`;--> statement-breakpoint
ALTER TABLE `trips` DROP COLUMN `rate_to_jpy`;