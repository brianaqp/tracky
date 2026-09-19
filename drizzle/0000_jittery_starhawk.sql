CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `consumption` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`user` text NOT NULL,
	`consumed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_consumption_quantity_positive" CHECK("consumption"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `ix_consumption_product_date` ON `consumption` (`product_id`,`consumed_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`category_id` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_name_unique` ON `products` (`name`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`total_cents` integer NOT NULL,
	`store` text,
	`notes` text,
	`user` text NOT NULL,
	`purchased_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_purchases_quantity_positive" CHECK("purchases"."quantity" > 0),
	CONSTRAINT "ck_purchases_total_nonneg" CHECK("purchases"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `ix_purchases_product_date` ON `purchases` (`product_id`,`purchased_at`);