CREATE TABLE "income_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "income_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"income_id" integer,
	"debit_account_id" integer,
	"date" date NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"currency" "currency" DEFAULT 'MXN'::"currency" NOT NULL,
	"notes" text,
	CONSTRAINT "income_items_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "income_items_date" ON "income_items" ("date");--> statement-breakpoint
ALTER TABLE "income_items" ADD CONSTRAINT "income_items_income_id_incomes_id_fkey" FOREIGN KEY ("income_id") REFERENCES "incomes"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "income_items" ADD CONSTRAINT "income_items_debit_account_id_debit_accounts_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "debit_accounts"("id") ON DELETE SET NULL;