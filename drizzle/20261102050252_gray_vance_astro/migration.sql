CREATE TABLE "incomes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "incomes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE,
	"amount" numeric(12,2) NOT NULL,
	"currency" "currency" DEFAULT 'MXN'::"currency" NOT NULL,
	"payday" smallint,
	CONSTRAINT "incomes_amount_positive" CHECK ("amount" > 0),
	CONSTRAINT "incomes_payday_range" CHECK ("payday" between 1 and 31)
);
