CREATE TABLE "banks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "banks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text
);
--> statement-breakpoint
CREATE TABLE "creditCard" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "creditCard_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text,
	"bankId" integer
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "categoryId" integer;--> statement-breakpoint
ALTER TABLE "creditCard" ADD CONSTRAINT "creditCard_bankId_banks_id_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_categories_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL;