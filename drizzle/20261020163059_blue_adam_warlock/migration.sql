ALTER TABLE "creditCard" RENAME TO "creditCards";--> statement-breakpoint
ALTER TABLE "creditCards" RENAME COLUMN "closingDate" TO "closingDay";--> statement-breakpoint
ALTER TABLE "creditCards" RENAME CONSTRAINT "closing_date_range" TO "closing_day_range";--> statement-breakpoint
ALTER TABLE "creditCards" RENAME CONSTRAINT "due_date_range" TO "due_day_range";--> statement-breakpoint
ALTER TABLE "creditCards" DROP CONSTRAINT "closing_day_range", ADD CONSTRAINT "closing_day_range" CHECK ("closingDay" between 1 and 31);