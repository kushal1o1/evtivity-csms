// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';

const dbConfigSchema = z.object({
  DATABASE_URL: z.string().url().default('postgres://evtivity:evtivity@localhost:5433/evtivity'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_POOL_IDLE_TIMEOUT: z.coerce.number().int().nonnegative().default(30),
  DB_POOL_MAX_LIFETIME: z.coerce.number().int().positive().default(300),
});

const dbConfig = dbConfigSchema.parse(process.env);

const connectionString = dbConfig.DATABASE_URL;

/**
 * Connection pool configuration.
 *
 * max: Maximum connections in the pool. Default 20 balances typical API/OCPP
 *      workloads without exhausting PostgreSQL's default max_connections (100).
 *      Tune per deployment: (max_connections - superuser_reserved) / num_pods.
 * idle_timeout: Seconds before idle connections are closed. Prevents holding
 *               connections during low-traffic periods.
 * max_lifetime: Seconds before a connection is retired regardless of activity.
 *               Prevents issues with stale connections behind load balancers
 *               or PgBouncer.
 */
const client = postgres(connectionString, {
  onnotice: () => {},
  max: dbConfig.DB_POOL_MAX,
  idle_timeout: dbConfig.DB_POOL_IDLE_TIMEOUT,
  max_lifetime: dbConfig.DB_POOL_MAX_LIFETIME,
});

export const db = drizzle(client);

// drizzle-orm/postgres-js installs a transparent pass-through serializer for
// every timestamp/date OID (1184/1082/1083/1114/1182/1185/1115/1231) so it can
// pre-format values itself. That breaks raw `client`-tag callers in this
// codebase (worker cron handlers, mfa.ts, station-message.service.ts, etc.)
// that pass Date directly: the bind path ends up calling Buffer.byteLength on
// a Date and throws ERR_INVALID_ARG_TYPE. Restore the original
// `Date -> ISO string` serializer for raw tag use. Drizzle pre-formats Dates
// as strings before binding, so re-serializing a string through
// `new Date(str).toISOString()` is a no-op for its code path.
const dateToIso = (x: unknown): string =>
  (x instanceof Date ? x : new Date(x as string)).toISOString();
for (const oid of ['1184', '1082', '1083', '1114', '1182', '1185', '1115', '1231'] as const) {
  (client.options.serializers as Record<string, (x: unknown) => string>)[oid] = dateToIso;
}

export { client };
