-- Add audit fields to payment_records so refund and capture-retry endpoints
-- can record WHO performed the action and WHY. Stores only the most recent
-- actor/reason rather than a full history; sufficient for the typical "who
-- refunded this charge?" audit question.

ALTER TABLE "payment_records" ADD COLUMN IF NOT EXISTS "last_actor_user_id" text;
ALTER TABLE "payment_records" ADD COLUMN IF NOT EXISTS "last_action_reason" varchar(500);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payment_records_last_actor_user_id_users_id_fk'
      AND table_name = 'payment_records'
  ) THEN
    ALTER TABLE "payment_records"
      ADD CONSTRAINT "payment_records_last_actor_user_id_users_id_fk"
      FOREIGN KEY ("last_actor_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
