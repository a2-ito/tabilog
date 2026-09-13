ALTER TABLE `entries` ADD `amount_currency` text;--> statement-breakpoint
-- 既存の記録はすべて旅行の通貨で入力されていたので、その通貨を埋める
UPDATE `entries`
SET `amount_currency` = (SELECT `currency` FROM `trips` WHERE `trips`.`id` = `entries`.`trip_id`)
WHERE `amount_minor` IS NOT NULL;
