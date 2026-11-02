CREATE TYPE "payment_frequency" AS ENUM('monthly', 'biweekly');--> statement-breakpoint
CREATE TABLE "upcoming_expense_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "upcoming_expense_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"upcoming_expense_id" integer NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	CONSTRAINT "upcoming_expense_items_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "upcoming_expenses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "upcoming_expenses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE,
	"due_date" date NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "loans" RENAME COLUMN "monthly_payment" TO "payment";--> statement-breakpoint
ALTER TABLE "loans" RENAME COLUMN "term_months" TO "term_payments";--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "frequency" "payment_frequency" DEFAULT 'monthly'::"payment_frequency" NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "upcoming_expense_items" ADD CONSTRAINT "upcoming_expense_items_7y5P1WZT9UwX_fkey" FOREIGN KEY ("upcoming_expense_id") REFERENCES "upcoming_expenses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "loans" DROP CONSTRAINT "loans_term_positive", ADD CONSTRAINT "loans_term_positive" CHECK ("term_payments" > 0);