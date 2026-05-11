-- Daily cron to retry capture top-ups for payment_records left in
-- 'captured' state with a shortfall (top-up PaymentIntent failed). Runs at
-- 03:30 to give the daily payment-reconciliation cron at 02:00 a clear
-- window first.

INSERT INTO cronjobs (name, schedule, status, created_at, updated_at)
SELECT 'payment-capture-retry', '30 3 * * *', 'pending', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'payment-capture-retry');
