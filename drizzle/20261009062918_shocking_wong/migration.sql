CREATE TABLE "expenses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expenses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"category_id" integer,
	"spent_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS') NOT NULL,
	CONSTRAINT "ck_expenses_amount_nonneg" CHECK ("amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX "ix_expenses_date" ON "expenses" ("spent_at");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;