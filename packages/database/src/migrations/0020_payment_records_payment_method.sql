-- Track which Stripe payment method was used for each payment record. The
-- in-use check on payment method deletion needs to match on the specific
-- card used, not on stripe_customer_id (which is shared across all of a
-- driver's saved cards: Stripe creates one customer per driver).

ALTER TABLE "payment_records"
  ADD COLUMN IF NOT EXISTS "stripe_payment_method_id" varchar(255);
