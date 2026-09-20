ALTER TABLE "purchases" DROP CONSTRAINT "ck_purchases_total_nonneg";--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "price" numeric(12,2) NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" DROP COLUMN "total_cents";--> statement-breakpoint
ALTER TABLE "purchases" DROP COLUMN "store";--> statement-breakpoint
ALTER TABLE "purchases" DROP COLUMN "user";--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "quantity" SET DATA TYPE integer USING "quantity"::integer;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "ck_purchases_price_nonneg" CHECK ("price" >= 0);