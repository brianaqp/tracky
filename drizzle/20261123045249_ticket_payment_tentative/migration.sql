CREATE TYPE "ticket_payment" AS ENUM('cash', 'credit_card', 'debit_account');--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN "tentative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "payment_method" "ticket_payment";--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "credit_card_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "debit_account_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_credit_card_id_credit_cards_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_debit_account_id_debit_accounts_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "debit_accounts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_payment_card" CHECK ("credit_card_id" is null or "payment_method" = 'credit_card');--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_payment_debit" CHECK ("debit_account_id" is null or "payment_method" = 'debit_account');