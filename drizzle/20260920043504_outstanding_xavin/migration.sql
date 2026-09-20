ALTER TABLE "products" DROP COLUMN "unit";--> statement-breakpoint
ALTER TABLE "consumption" DROP CONSTRAINT "ck_consumption_quantity_positive", ADD CONSTRAINT "ck_consumption_quantity_positive" CHECK ("quantity" > 0);--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT "ck_purchases_quantity_positive", ADD CONSTRAINT "ck_purchases_quantity_positive" CHECK ("quantity" > 0);--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT "ck_purchases_total_nonneg", ADD CONSTRAINT "ck_purchases_total_nonneg" CHECK ("total_cents" >= 0);