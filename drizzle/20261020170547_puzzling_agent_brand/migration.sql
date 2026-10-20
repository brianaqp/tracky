CREATE TYPE "currency" AS ENUM('USD', 'MXN');--> statement-breakpoint
CREATE TABLE "banks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "banks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text
);
--> statement-breakpoint
CREATE TABLE "creditCards" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "creditCards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"closingDay" smallint NOT NULL,
	"dueDay" smallint NOT NULL,
	"bankId" integer,
	CONSTRAINT "closing_day_range" CHECK ("closingDay" between 1 and 31),
	CONSTRAINT "due_day_range" CHECK ("dueDay" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "expenseCategories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expenseCategories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expenses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text,
	"expenseCategoryId" integer
);
--> statement-breakpoint
CREATE TABLE "houseCategories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "houseCategories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text
);
--> statement-breakpoint
CREATE TABLE "houseProducts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "houseProducts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text,
	"notes" text,
	"houseCategoryId" integer
);
--> statement-breakpoint
CREATE TABLE "incomes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "incomes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text,
	"amount" numeric(12,2) NOT NULL,
	"currency" "currency" DEFAULT 'MXN'::"currency" NOT NULL,
	CONSTRAINT "amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "creditCards" ADD CONSTRAINT "creditCards_bankId_banks_id_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expenseCategoryId_expenseCategories_id_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "expenseCategories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "houseProducts" ADD CONSTRAINT "houseProducts_houseCategoryId_houseCategories_id_fkey" FOREIGN KEY ("houseCategoryId") REFERENCES "houseCategories"("id") ON DELETE SET NULL;