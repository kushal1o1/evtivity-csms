-- At most one default tariff per pricing group. The application enforces
-- this via "set isDefault=true -> unset others" but a concurrent POST/PATCH
-- could insert two defaults; the partial unique index makes the invariant
-- bulletproof. The cost-resolver picks the first default match in priority
-- order, so duplicate defaults silently ignore later rows -- preventing them
-- at the schema level avoids a class of "why did my new default tariff not
-- apply" support tickets.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tariffs_one_default_per_group"
  ON "tariffs" ("pricing_group_id")
  WHERE "is_default" = true;--> statement-breakpoint

-- At most one default pricing group system-wide. Same invariant at the group
-- level: only one group should have isDefault=true, used as the fallback when
-- no station/site/fleet/driver assignment matches.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pricing_groups_one_default"
  ON "pricing_groups" ((true))
  WHERE "is_default" = true;
