CREATE TYPE "currency" AS ENUM('MXN', 'USD');--> statement-breakpoint
CREATE TYPE "transaction_kind" AS ENUM('purchase', 'installment', 'payment', 'refund', 'cash_withdrawal', 'fee', 'interest');--> statement-breakpoint
CREATE TABLE "banks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "banks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "budget_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "budget_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE,
	"category_id" integer,
	"amount" numeric(12,2) NOT NULL,
	"currency" "currency" DEFAULT 'MXN'::"currency" NOT NULL,
	"payday" smallint,
	"credit_card_id" integer,
	"debit_account_id" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "budget_items_amount_positive" CHECK ("amount" > 0),
	CONSTRAINT "budget_items_payday_range" CHECK ("payday" between 1 and 31),
	CONSTRAINT "budget_items_one_source" CHECK (num_nonnulls("credit_card_id", "debit_account_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "credit_cards" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "credit_cards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bank_id" integer NOT NULL,
	"name" text NOT NULL,
	"last4" text,
	"closing_day" smallint,
	"due_day" smallint,
	"credit_limit" numeric(12,2),
	"currency" "currency" DEFAULT 'MXN'::"currency" NOT NULL,
	CONSTRAINT "credit_cards_bank_name" UNIQUE("bank_id","name"),
	CONSTRAINT "credit_cards_closing_day_range" CHECK ("closing_day" between 1 and 31),
	CONSTRAINT "credit_cards_due_day_range" CHECK ("due_day" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "debit_accounts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "debit_accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bank_id" integer NOT NULL,
	"name" text NOT NULL,
	"last4" text,
	"currency" "currency" DEFAULT 'MXN'::"currency" NOT NULL,
	CONSTRAINT "debit_accounts_bank_name" UNIQUE("bank_id","name")
);
--> statement-breakpoint
CREATE TABLE "installment_plans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "installment_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"credit_card_id" integer NOT NULL,
	"purchase_transaction_id" integer,
	"description" text NOT NULL,
	"total_amount" numeric(12,2) NOT NULL,
	"months" smallint NOT NULL,
	"monthly_amount" numeric(12,2) NOT NULL,
	"interest_rate" numeric(6,3) DEFAULT '0' NOT NULL,
	"purchase_date" date NOT NULL,
	"first_payment_date" date NOT NULL,
	CONSTRAINT "installment_plans_card_purchase" UNIQUE("credit_card_id","description","purchase_date"),
	CONSTRAINT "installment_plans_months_positive" CHECK ("months" > 0)
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "loans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bank_id" integer NOT NULL,
	"name" text NOT NULL,
	"principal" numeric(12,2) NOT NULL,
	"monthly_payment" numeric(12,2) NOT NULL,
	"term_months" smallint NOT NULL,
	"start_date" date NOT NULL,
	"annual_rate" numeric(6,3),
	"currency" "currency" DEFAULT 'MXN'::"currency" NOT NULL,
	CONSTRAINT "loans_bank_name" UNIQUE("bank_id","name"),
	CONSTRAINT "loans_term_positive" CHECK ("term_months" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE,
	"notes" text,
	"product_category_id" integer
);
--> statement-breakpoint
CREATE TABLE "ticket_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticket_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" numeric(10,3) NOT NULL,
	"total" numeric(12,2) NOT NULL,
	CONSTRAINT "ticket_items_quantity_positive" CHECK ("quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tickets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store" text NOT NULL,
	"purchase_date" date NOT NULL,
	"total" numeric(12,2) NOT NULL,
	"transaction_id" integer UNIQUE,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"credit_card_id" integer,
	"debit_account_id" integer,
	"loan_id" integer,
	"uploaded_statement_id" integer,
	"installment_plan_id" integer,
	"installment_number" smallint,
	"operation_date" date NOT NULL,
	"charge_date" date,
	"description" text NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"currency" "currency" DEFAULT 'MXN'::"currency" NOT NULL,
	"kind" "transaction_kind" DEFAULT 'purchase'::"transaction_kind" NOT NULL,
	"category_id" integer,
	"notes" text,
	"dedupe_key" text NOT NULL UNIQUE,
	CONSTRAINT "transactions_one_source" CHECK (num_nonnulls("credit_card_id", "debit_account_id", "loan_id") = 1),
	CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "uploaded_statements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uploaded_statements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"credit_card_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"closing_date" date NOT NULL,
	"due_date" date NOT NULL,
	"previous_balance" numeric(12,2),
	"payment_no_interest" numeric(12,2),
	"minimum_payment" numeric(12,2),
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploaded_statements_card_closing" UNIQUE("credit_card_id","closing_date")
);
--> statement-breakpoint
CREATE INDEX "transactions_operation_date" ON "transactions" ("operation_date");--> statement-breakpoint
CREATE INDEX "transactions_category" ON "transactions" ("category_id");--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_credit_card_id_credit_cards_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_debit_account_id_debit_accounts_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "debit_accounts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_bank_id_banks_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "debit_accounts" ADD CONSTRAINT "debit_accounts_bank_id_banks_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_credit_card_id_credit_cards_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_purchase_transaction_id_transactions_id_fkey" FOREIGN KEY ("purchase_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_bank_id_banks_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_product_category_id_product_categories_id_fkey" FOREIGN KEY ("product_category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_ticket_id_tickets_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_transaction_id_transactions_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_card_id_credit_cards_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debit_account_id_debit_accounts_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "debit_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_loan_id_loans_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_uploaded_statement_id_uploaded_statements_id_fkey" FOREIGN KEY ("uploaded_statement_id") REFERENCES "uploaded_statements"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_installment_plan_id_installment_plans_id_fkey" FOREIGN KEY ("installment_plan_id") REFERENCES "installment_plans"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "uploaded_statements" ADD CONSTRAINT "uploaded_statements_credit_card_id_credit_cards_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE CASCADE;