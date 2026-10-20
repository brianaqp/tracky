ALTER TABLE "creditCard" ADD COLUMN "closingDate" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "creditCard" ADD COLUMN "dueDay" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "creditCard" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "creditCard" ADD CONSTRAINT "closing_date_range" CHECK ("closingDate" between 1 and 31);--> statement-breakpoint
ALTER TABLE "creditCard" ADD CONSTRAINT "due_date_range" CHECK ("dueDay" between 1 and 31);