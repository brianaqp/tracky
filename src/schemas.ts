import { z } from "zod";

export const Name = z.string().trim().min(1).max(100);
export const Positive = z.number().positive();
export const ProductRef = z.union([Name, z.number().int()]);
const Money = z.number().min(0).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "max 2 decimals");
const IsoDate = z.iso.datetime({ local: true, offset: true }).or(z.iso.date());

export const PurchaseIn = z.object({
  product: ProductRef,
  quantity: Positive,
  total_price: Money,
  store: z.string().optional(),
  notes: z.string().optional(),
  purchased_at: IsoDate.optional(),
});
export type PurchaseIn = z.infer<typeof PurchaseIn>;

export const ConsumptionIn = z.object({
  product: ProductRef,
  quantity: Positive,
  consumed_at: IsoDate.optional(),
});
export type ConsumptionIn = z.infer<typeof ConsumptionIn>;

export { IsoDate };
