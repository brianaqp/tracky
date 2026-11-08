CREATE TABLE "card_payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "card_payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"credit_card_id" integer NOT NULL UNIQUE,
	"due_date" date NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_payments_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_credit_card_id_credit_cards_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE CASCADE;