CREATE TABLE `trip_areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_areas_trip_name_idx` ON `trip_areas` (`trip_id`,`name`);--> statement-breakpoint
-- エリアを消しても記録は残したいので ON DELETE SET NULL を付ける
-- （drizzle-kit の ALTER TABLE はこの指定を落とすため手で足している）
ALTER TABLE `entries` ADD `area_id` integer REFERENCES trip_areas(id) ON DELETE SET NULL;