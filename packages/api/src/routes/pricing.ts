// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, or, ne, count, desc, sql } from 'drizzle-orm';
import { db } from '@evtivity/database';
import {
  pricingGroups,
  tariffs,
  pricingHolidays,
  pricingAuditLog,
  chargingSessions,
  sessionTariffSegments,
  writePricingAudit,
} from '@evtivity/database';
import {
  tariffRestrictionsSchema,
  derivePriority,
  validateNoOverlap,
  resolveActiveTariff,
} from '@evtivity/lib';
import type { TariffRestrictions, TariffWithRestrictions } from '@evtivity/lib';
import { zodSchema } from '../lib/zod-schema.js';
import { ID_PARAMS } from '../lib/id-validation.js';
import {
  itemResponse,
  arrayResponse,
  errorWith,
  paginatedResponse,
} from '../lib/response-schemas.js';
import { paginationQuery } from '../lib/pagination.js';
import { ERROR_CODES } from '../lib/error-codes.generated.js';
import { resolveTariffGroup } from '../services/tariff.service.js';
import { getPubSub } from '../lib/pubsub.js';
import { authorize } from '../middleware/rbac.js';

// Best-effort SSE so any operator viewing pricing-related UI sees the change
// without manual refresh. Also used by the station-message refresh listener
// to invalidate the cached display template for stations resolving to this
// pricing group.
async function publishPricingChanged(args: {
  pricingGroupId: string | null;
  tariffId?: string | null;
  action:
    | 'group.updated'
    | 'group.deleted'
    | 'tariff.updated'
    | 'tariff.deleted'
    | 'tariff.created'
    | 'group.created'
    | 'holiday.changed';
}): Promise<void> {
  try {
    const pubsub = getPubSub();
    await pubsub.publish(
      'csms_events',
      JSON.stringify({
        eventType: 'pricing.changed',
        pricingGroupId: args.pricingGroupId,
        tariffId: args.tariffId ?? null,
        action: args.action,
      }),
    );
  } catch {
    // Non-critical
  }
}

const pricingGroupItem = z
  .object({
    id: z.string().describe('Pricing group identifier'),
    name: z.string().describe('Pricing group display name'),
    description: z.string().nullable().describe('Pricing group description'),
    isDefault: z.boolean().describe('Whether this is the system fallback pricing group'),
    createdAt: z.coerce.date().describe('Timestamp when the pricing group was created'),
    updatedAt: z.coerce.date().describe('Timestamp when the pricing group was last updated'),
  })
  .passthrough();

const tariffItem = z
  .object({
    id: z.string().describe('Tariff identifier'),
    pricingGroupId: z.string().describe('Owning pricing group identifier'),
    name: z.string().describe('Tariff display name'),
    currency: z.string().describe('ISO 4217 currency code (USD, EUR, etc.)'),
    pricePerKwh: z.string().nullable().describe('Cost per kWh in the tariff currency, e.g. "0.25"'),
    pricePerMinute: z.string().nullable().describe('Cost per active charging minute'),
    pricePerSession: z.string().nullable().describe('Flat fee charged at session start'),
    isActive: z.boolean().describe('Whether this tariff currently participates in resolution'),
    idleFeePricePerMinute: z
      .string()
      .nullable()
      .describe('Cost per minute after the configured idle grace period'),
    taxRate: z.string().nullable().describe('Decimal tax rate (e.g. "0.0825" for 8.25%)'),
    restrictions: z
      .unknown()
      .nullable()
      .describe(
        'JSONB restrictions: timeRange, daysOfWeek, dateRange, holidays, energyThresholdKwh',
      ),
    reservationFeePerMinute: z
      .string()
      .nullable()
      .describe(
        'Reservation holding fee per minute, charged from reservation start to session start',
      ),
    priority: z
      .number()
      .int()
      .min(0)
      .describe(
        'Resolution priority (higher wins). Derived from restriction type (10 time, 20 day+time, 30 seasonal, 40 holiday, 50 energy threshold).',
      ),
    isDefault: z.boolean().describe('Whether this is the fallback tariff for the group'),
    createdAt: z.coerce.date().describe('Timestamp when the tariff was created'),
    updatedAt: z.coerce.date().describe('Timestamp when the tariff was last updated'),
  })
  .passthrough();

const scheduleItem = z
  .object({
    id: z.string().describe('Tariff identifier'),
    name: z.string().describe('Tariff display name'),
    currency: z.string().describe('ISO 4217 currency code (USD, EUR, etc.)'),
    pricePerKwh: z.string().nullable().describe('Cost per kWh in the tariff currency, e.g. "0.25"'),
    pricePerMinute: z.string().nullable().describe('Cost per active charging minute'),
    pricePerSession: z.string().nullable().describe('Flat fee charged at session start'),
    idleFeePricePerMinute: z
      .string()
      .nullable()
      .describe('Cost per minute after the configured idle grace period'),
    taxRate: z.string().nullable().describe('Decimal tax rate (e.g. "0.0825" for 8.25%)'),
    restrictions: z
      .unknown()
      .nullable()
      .describe(
        'JSONB restrictions: timeRange, daysOfWeek, dateRange, holidays, energyThresholdKwh',
      ),
    priority: z
      .number()
      .int()
      .min(0)
      .describe('Resolution priority (higher wins). Derived from restriction type.'),
    isDefault: z.boolean().describe('Whether this is the fallback tariff for the group'),
    isCurrent: z
      .boolean()
      .describe(
        'Whether this tariff is the one resolved as active right now. The schedule is per-pricing-group, not per-station, so resolution uses the SERVER timezone -- the same group may be assigned to stations in multiple timezones, and we cannot single one out. Use GET /v1/stations/:id/active-tariff for station-timezone-aware resolution.',
      ),
  })
  .passthrough();

const activeTariffItem = z
  .object({
    id: z.string().describe('Tariff identifier'),
    name: z.string().describe('Tariff display name'),
    currency: z.string().describe('ISO 4217 currency code (USD, EUR, etc.)'),
    pricePerKwh: z.string().nullable().describe('Cost per kWh in the tariff currency, e.g. "0.25"'),
    pricePerMinute: z.string().nullable().describe('Cost per active charging minute'),
    pricePerSession: z.string().nullable().describe('Flat fee charged at session start'),
    idleFeePricePerMinute: z
      .string()
      .nullable()
      .describe('Cost per minute after the configured idle grace period'),
    taxRate: z.string().nullable().describe('Decimal tax rate (e.g. "0.0825" for 8.25%)'),
    restrictions: z
      .unknown()
      .nullable()
      .describe(
        'JSONB restrictions: timeRange, daysOfWeek, dateRange, holidays, energyThresholdKwh',
      ),
    priority: z
      .number()
      .int()
      .min(0)
      .describe('Resolution priority (higher wins). Derived from restriction type.'),
    isDefault: z.boolean().describe('Whether this is the fallback tariff for the group'),
    pricingGroupId: z.string().describe('Pricing group identifier this tariff belongs to'),
    pricingGroupName: z.string().describe('Pricing group display name'),
  })
  .passthrough();

const groupParams = z.object({
  id: ID_PARAMS.pricingGroupId.describe('Pricing group ID'),
});

const tariffParams = z.object({
  id: ID_PARAMS.pricingGroupId.describe('Pricing group ID'),
  tariffId: ID_PARAMS.tariffId.describe('Tariff ID'),
});

const stationParams = z.object({
  id: ID_PARAMS.stationId.describe('Station ID'),
});

const nonNegativePrice = z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
  message: 'Price must be a non-negative number',
});

// Tax rate is a decimal fraction (0.0825 = 8.25%), NOT a percent. A value > 1
// almost always means the operator typed "8.25" thinking percent; the cost
// calculator multiplies subtotal by this number verbatim, so 8.25 would bill
// 825% tax. Cap at 1.0 (100%) which is already higher than any real tax
// jurisdiction and well below the "obvious data-entry error" threshold.
const taxRate = z
  .string()
  .refine((val) => !isNaN(Number(val)) && Number(val) >= 0 && Number(val) <= 1, {
    message: 'Tax rate must be a decimal between 0 and 1 (e.g. 0.0825 for 8.25%)',
  });

const createGroupBody = z.object({
  name: z.string().max(255),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional().describe('Whether this is the default pricing group'),
});

const createTariffBody = z.object({
  name: z.string().max(255),
  currency: z.string().length(3).default('USD').describe('ISO 4217 currency code'),
  pricePerKwh: nonNegativePrice.optional().describe('Price per kWh as a decimal string'),
  pricePerMinute: nonNegativePrice.optional().describe('Price per minute as a decimal string'),
  pricePerSession: nonNegativePrice.optional().describe('Flat fee per session as a decimal string'),
  isActive: z.boolean().default(true).describe('Whether the tariff is active'),
  idleFeePricePerMinute: nonNegativePrice
    .optional()
    .describe('Idle fee per minute as a decimal string'),
  reservationFeePerMinute: nonNegativePrice
    .optional()
    .describe(
      'Reservation holding fee per minute as a decimal string. Charged for the time between reservation start and session start.',
    ),
  taxRate: taxRate.optional().describe('Tax rate as a decimal (e.g. 0.08 for 8%)'),
  restrictions: z
    .record(z.unknown())
    .nullable()
    .optional()
    .describe('Tariff restrictions (time-of-day, etc.)'),
  isDefault: z.boolean().optional().describe('Whether this is the default tariff for the group'),
});

const updateGroupBody = z.object({
  name: z.string().max(255).optional(),
  description: z.string().max(500).nullable().optional(),
});

const nullableNonNegativePrice = nonNegativePrice.nullable();

const updateTariffBody = z.object({
  name: z.string().max(255).optional(),
  pricePerKwh: nullableNonNegativePrice.optional().describe('Price per kWh; null to clear'),
  pricePerMinute: nullableNonNegativePrice.optional().describe('Price per minute; null to clear'),
  pricePerSession: nullableNonNegativePrice
    .optional()
    .describe('Flat fee per session; null to clear'),
  isActive: z.boolean().optional().describe('Whether the tariff is active'),
  idleFeePricePerMinute: nullableNonNegativePrice
    .optional()
    .describe('Idle fee per minute; null to clear'),
  reservationFeePerMinute: nullableNonNegativePrice
    .optional()
    .describe('Reservation holding fee per minute; null to clear'),
  taxRate: taxRate.nullable().optional().describe('Tax rate; null to clear'),
  restrictions: z
    .record(z.unknown())
    .nullable()
    .optional()
    .describe('Tariff restrictions; null to clear'),
  isDefault: z.boolean().optional().describe('Whether this is the default tariff for the group'),
});

async function loadHolidays(): Promise<Date[]> {
  const rows = await db.select({ date: pricingHolidays.date }).from(pricingHolidays);
  return rows.map((r) => new Date(r.date));
}

export function pricingRoutes(app: FastifyInstance): void {
  // Pricing Groups CRUD
  app.get(
    '/pricing-groups',
    {
      onRequest: [authorize('pricing:read')],
      schema: {
        tags: ['Pricing'],
        summary: 'List all pricing groups',
        operationId: 'listPricingGroups',
        security: [{ bearerAuth: [] }],
        response: { 200: arrayResponse(pricingGroupItem) },
      },
    },
    async () => {
      return db.select().from(pricingGroups);
    },
  );

  app.get(
    '/pricing-groups/:id',
    {
      onRequest: [authorize('pricing:read')],
      schema: {
        tags: ['Pricing'],
        summary: 'Get a pricing group by ID',
        operationId: 'getPricingGroup',
        security: [{ bearerAuth: [] }],
        params: zodSchema(groupParams),
        response: {
          200: itemResponse(pricingGroupItem),
          404: errorWith('Resource not found', [ERROR_CODES.NOT_FOUND]),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof groupParams>;
      const [group] = await db.select().from(pricingGroups).where(eq(pricingGroups.id, id));
      if (group == null) {
        await reply
          .status(404)
          .send({ error: 'Pricing group not found', code: 'PRICING_GROUP_NOT_FOUND' });
        return;
      }
      return group;
    },
  );

  app.post(
    '/pricing-groups',
    {
      onRequest: [authorize('pricing:write')],
      schema: {
        tags: ['Pricing'],
        summary: 'Create a pricing group',
        operationId: 'createPricingGroup',
        security: [{ bearerAuth: [] }],
        body: zodSchema(createGroupBody),
        response: { 201: itemResponse(pricingGroupItem) },
      },
    },
    async (request, reply) => {
      const body = request.body as z.infer<typeof createGroupBody>;
      const { userId } = request.user as { userId: string };
      const [group] = await db.insert(pricingGroups).values(body).returning();
      if (group != null) {
        await writePricingAudit(
          {
            entityType: 'pricing_group',
            entityId: group.id,
            action: 'created',
            actorUserId: userId,
            after: group,
          },
          undefined,
          request.log,
        );
        await publishPricingChanged({ pricingGroupId: group.id, action: 'group.created' });
      }
      await reply.status(201).send(group);
    },
  );

  app.patch(
    '/pricing-groups/:id',
    {
      onRequest: [authorize('pricing:write')],
      schema: {
        tags: ['Pricing'],
        summary: 'Update a pricing group',
        operationId: 'updatePricingGroup',
        security: [{ bearerAuth: [] }],
        params: zodSchema(groupParams),
        body: zodSchema(updateGroupBody),
        response: {
          200: itemResponse(pricingGroupItem),
          404: errorWith('Resource not found', [ERROR_CODES.NOT_FOUND]),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof groupParams>;
      const body = request.body as z.infer<typeof updateGroupBody>;
      const { userId } = request.user as { userId: string };

      const [existing] = await db.select().from(pricingGroups).where(eq(pricingGroups.id, id));
      if (existing == null) {
        await reply
          .status(404)
          .send({ error: 'Pricing group not found', code: 'PRICING_GROUP_NOT_FOUND' });
        return;
      }

      const [updated] = await db
        .update(pricingGroups)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(pricingGroups.id, id))
        .returning();
      await writePricingAudit(
        {
          entityType: 'pricing_group',
          entityId: id,
          action: 'updated',
          actorUserId: userId,
          before: existing,
          after: updated,
        },
        undefined,
        request.log,
      );
      await publishPricingChanged({ pricingGroupId: id, action: 'group.updated' });
      return updated;
    },
  );

  app.delete(
    '/pricing-groups/:id',
    {
      onRequest: [authorize('pricing:write')],
      schema: {
        tags: ['Pricing'],
        summary: 'Delete a pricing group and its tariffs',
        operationId: 'deletePricingGroup',
        security: [{ bearerAuth: [] }],
        params: zodSchema(groupParams),
        response: {
          204: { type: 'null' as const },
          404: errorWith('Resource not found', [ERROR_CODES.NOT_FOUND]),
          409: errorWith('Pricing group tariffs in use', [
            ERROR_CODES.PRICING_GROUP_TARIFFS_IN_USE,
          ]),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof groupParams>;

      const [group] = await db.select().from(pricingGroups).where(eq(pricingGroups.id, id));
      if (group == null) {
        await reply
          .status(404)
          .send({ error: 'Pricing group not found', code: 'PRICING_GROUP_NOT_FOUND' });
        return;
      }

      const [usage] = await db
        .select({ count: count() })
        .from(chargingSessions)
        .innerJoin(tariffs, eq(chargingSessions.tariffId, tariffs.id))
        .where(eq(tariffs.pricingGroupId, id));
      if (usage != null && usage.count > 0) {
        await reply.status(409).send({
          error: 'Pricing group has tariffs referenced by charging sessions',
          code: 'PRICING_GROUP_TARIFFS_IN_USE',
        });
        return;
      }

      const groupTariffs = await db.select().from(tariffs).where(eq(tariffs.pricingGroupId, id));
      await db.delete(tariffs).where(eq(tariffs.pricingGroupId, id));
      await db.delete(pricingGroups).where(eq(pricingGroups.id, id));
      const { userId } = request.user as { userId: string };
      // Audit the cascading deletes too so the pricing audit log shows every
      // tariff that disappeared with the group, not just the group itself.
      for (const t of groupTariffs) {
        await writePricingAudit(
          {
            entityType: 'tariff',
            entityId: t.id,
            action: 'deleted',
            actorUserId: userId,
            before: t,
            notes: `cascade from pricing_group ${id}`,
          },
          undefined,
          request.log,
        );
      }
      await writePricingAudit(
        {
          entityType: 'pricing_group',
          entityId: id,
          action: 'deleted',
          actorUserId: userId,
          before: group,
        },
        undefined,
        request.log,
      );
      await publishPricingChanged({ pricingGroupId: id, action: 'group.deleted' });

      await reply.status(204).send();
    },
  );

  // Tariff CRUD
  app.get(
    '/pricing-groups/:id/tariffs',
    {
      onRequest: [authorize('pricing:read')],
      schema: {
        tags: ['Pricing'],
        summary: 'List tariffs in a pricing group',
        operationId: 'listGroupTariffs',
        security: [{ bearerAuth: [] }],
        params: zodSchema(groupParams),
        response: { 200: arrayResponse(tariffItem) },
      },
    },
    async (request) => {
      const { id } = request.params as z.infer<typeof groupParams>;
      return db.select().from(tariffs).where(eq(tariffs.pricingGroupId, id));
    },
  );

  app.get(
    '/pricing-groups/:id/tariffs/:tariffId',
    {
      onRequest: [authorize('pricing:read')],
      schema: {
        tags: ['Pricing'],
        summary: 'Get a single tariff',
        operationId: 'getGroupTariff',
        security: [{ bearerAuth: [] }],
        params: zodSchema(tariffParams),
        response: {
          200: itemResponse(tariffItem),
          404: errorWith('Tariff not found', [ERROR_CODES.TARIFF_NOT_FOUND]),
        },
      },
    },
    async (request, reply) => {
      const { tariffId } = request.params as z.infer<typeof tariffParams>;
      const [tariff] = await db.select().from(tariffs).where(eq(tariffs.id, tariffId));
      if (tariff == null) {
        await reply.status(404).send({ error: 'Tariff not found', code: 'TARIFF_NOT_FOUND' });
        return;
      }
      return tariff;
    },
  );

  app.post(
    '/pricing-groups/:id/tariffs',
    {
      onRequest: [authorize('pricing:write')],
      schema: {
        tags: ['Pricing'],
        summary: 'Create a tariff in a pricing group',
        operationId: 'createGroupTariff',
        security: [{ bearerAuth: [] }],
        params: zodSchema(groupParams),
        body: zodSchema(createTariffBody),
        response: {
          201: itemResponse(tariffItem),
          400: errorWith('Invalid restrictions', [ERROR_CODES.INVALID_RESTRICTIONS]),
          409: errorWith('Tariff overlap', [ERROR_CODES.TARIFF_OVERLAP]),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof groupParams>;
      const body = request.body as z.infer<typeof createTariffBody>;

      // Validate restrictions
      const restrictions = body.restrictions as TariffRestrictions | null | undefined;
      if (restrictions != null) {
        const parsed = tariffRestrictionsSchema.safeParse(restrictions);
        if (!parsed.success) {
          await reply.status(400).send({
            error: parsed.error.issues.map((i) => i.message).join('; '),
            code: 'INVALID_RESTRICTIONS',
          });
          return;
        }
      }

      const priority = derivePriority(restrictions ?? null);
      const isDefault = body.isDefault ?? priority === 0;

      // Check for existing tariffs in this group. Overlap detection only
      // considers active tariffs (an inactive tariff cannot collide because
      // resolution skips it), but the currency check below MUST consider
      // inactive tariffs too -- otherwise an inactive EUR tariff sitting in a
      // USD group is invisible to the check, the operator adds a USD tariff
      // alongside it, and the moment anyone toggles the EUR row back to
      // active the group ends up mixed-currency (which the cost calculator
      // and split-billing path both reject).
      const allTariffsInGroup = await db
        .select({
          id: tariffs.id,
          restrictions: tariffs.restrictions,
          priority: tariffs.priority,
          isDefault: tariffs.isDefault,
          currency: tariffs.currency,
          isActive: tariffs.isActive,
        })
        .from(tariffs)
        .where(eq(tariffs.pricingGroupId, id));

      const existingTariffs = allTariffsInGroup.filter((t) => t.isActive);

      // Currency consistency: every tariff in a pricing group must share a
      // currency, regardless of active state. Split-billing and the cost
      // calculator both assume a single resolved currency per session;
      // mixing currencies inside a group leaks the wrong currency code into
      // charging_sessions.
      const otherCurrency = allTariffsInGroup.find((t) => t.currency !== body.currency)?.currency;
      if (otherCurrency != null) {
        await reply.status(409).send({
          error: `Pricing group already contains tariffs in ${otherCurrency}; new tariff must use the same currency.`,
          code: 'TARIFF_CURRENCY_MISMATCH',
        });
        return;
      }

      const overlapCheck = validateNoOverlap(
        existingTariffs.map((t) => ({
          id: t.id,
          restrictions: t.restrictions as TariffRestrictions | null,
          priority: t.priority,
        })),
        restrictions ?? null,
        priority,
      );

      if (!overlapCheck.valid) {
        await reply.status(409).send({
          error: overlapCheck.message ?? 'Tariff overlap detected',
          code: 'TARIFF_OVERLAP',
          conflictingTariffId: overlapCheck.conflictingTariffId,
        });
        return;
      }

      // If setting as default, unset any other default in the group
      if (isDefault) {
        await db
          .update(tariffs)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(tariffs.pricingGroupId, id), eq(tariffs.isDefault, true)));
      }

      // Auto-set isDefault if this is the first tariff in the group
      const hasDefault = existingTariffs.some((t) => t.isDefault);
      const finalIsDefault = isDefault || !hasDefault;

      const [tariff] = await db
        .insert(tariffs)
        .values({
          pricingGroupId: id,
          name: body.name,
          currency: body.currency,
          pricePerKwh: body.pricePerKwh,
          pricePerMinute: body.pricePerMinute,
          pricePerSession: body.pricePerSession,
          isActive: body.isActive,
          idleFeePricePerMinute: body.idleFeePricePerMinute,
          reservationFeePerMinute: body.reservationFeePerMinute,
          taxRate: body.taxRate,
          restrictions: restrictions ?? null,
          priority,
          isDefault: finalIsDefault,
        })
        .returning();
      if (tariff != null) {
        const { userId } = request.user as { userId: string };
        await writePricingAudit(
          {
            entityType: 'tariff',
            entityId: tariff.id,
            action: 'created',
            actorUserId: userId,
            after: tariff,
          },
          undefined,
          request.log,
        );
        await publishPricingChanged({
          pricingGroupId: id,
          tariffId: tariff.id,
          action: 'tariff.created',
        });
      }
      await reply.status(201).send(tariff);
    },
  );

  app.patch(
    '/pricing-groups/:id/tariffs/:tariffId',
    {
      onRequest: [authorize('pricing:write')],
      schema: {
        tags: ['Pricing'],
        summary: 'Update a tariff',
        operationId: 'updateGroupTariff',
        security: [{ bearerAuth: [] }],
        params: zodSchema(tariffParams),
        body: zodSchema(updateTariffBody),
        response: {
          200: itemResponse(tariffItem),
          400: errorWith('Invalid restrictions', [ERROR_CODES.INVALID_RESTRICTIONS]),
          404: errorWith('Tariff not found', [ERROR_CODES.TARIFF_NOT_FOUND]),
          409: errorWith('Tariff overlap', [ERROR_CODES.TARIFF_OVERLAP]),
        },
      },
    },
    async (request, reply) => {
      const { id, tariffId } = request.params as z.infer<typeof tariffParams>;
      const body = request.body as z.infer<typeof updateTariffBody>;

      const [existing] = await db.select().from(tariffs).where(eq(tariffs.id, tariffId));
      if (existing == null) {
        await reply.status(404).send({ error: 'Tariff not found', code: 'TARIFF_NOT_FOUND' });
        return;
      }

      // Validate restrictions if being updated
      const restrictions =
        body.restrictions !== undefined
          ? (body.restrictions as TariffRestrictions | null)
          : (existing.restrictions as TariffRestrictions | null);

      if (restrictions != null) {
        const parsed = tariffRestrictionsSchema.safeParse(restrictions);
        if (!parsed.success) {
          await reply.status(400).send({
            error: parsed.error.issues.map((i) => i.message).join('; '),
            code: 'INVALID_RESTRICTIONS',
          });
          return;
        }
      }

      const priority = derivePriority(restrictions);

      // Overlap validation
      const existingTariffs = await db
        .select({
          id: tariffs.id,
          restrictions: tariffs.restrictions,
          priority: tariffs.priority,
        })
        .from(tariffs)
        .where(and(eq(tariffs.pricingGroupId, id), eq(tariffs.isActive, true)));

      const overlapCheck = validateNoOverlap(
        existingTariffs.map((t) => ({
          id: t.id,
          restrictions: t.restrictions as TariffRestrictions | null,
          priority: t.priority,
        })),
        restrictions,
        priority,
        tariffId,
      );

      if (!overlapCheck.valid) {
        await reply.status(409).send({
          error: overlapCheck.message ?? 'Tariff overlap detected',
          code: 'TARIFF_OVERLAP',
          conflictingTariffId: overlapCheck.conflictingTariffId,
        });
        return;
      }

      // Handle isDefault flag
      const isDefault = body.isDefault ?? existing.isDefault;
      if (isDefault && !existing.isDefault) {
        await db
          .update(tariffs)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(tariffs.pricingGroupId, existing.pricingGroupId),
              eq(tariffs.isDefault, true),
              ne(tariffs.id, tariffId),
            ),
          );
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name !== undefined) updateData['name'] = body.name;
      if (body.pricePerKwh !== undefined) updateData['pricePerKwh'] = body.pricePerKwh;
      if (body.pricePerMinute !== undefined) updateData['pricePerMinute'] = body.pricePerMinute;
      if (body.pricePerSession !== undefined) updateData['pricePerSession'] = body.pricePerSession;
      if (body.isActive !== undefined) updateData['isActive'] = body.isActive;
      if (body.idleFeePricePerMinute !== undefined)
        updateData['idleFeePricePerMinute'] = body.idleFeePricePerMinute;
      if (body.reservationFeePerMinute !== undefined)
        updateData['reservationFeePerMinute'] = body.reservationFeePerMinute;
      if (body.taxRate !== undefined) updateData['taxRate'] = body.taxRate;
      if (body.restrictions !== undefined) {
        updateData['restrictions'] = body.restrictions;
        updateData['priority'] = priority;
      }
      // Only persist isDefault when the operator explicitly toggled it.
      // Setting it on every PATCH would clobber the value on unrelated edits
      // and write spurious "isDefault: true -> true" rows to the audit log.
      if (body.isDefault !== undefined) {
        updateData['isDefault'] = body.isDefault;
      }

      const [updated] = await db
        .update(tariffs)
        .set(updateData)
        .where(eq(tariffs.id, tariffId))
        .returning();
      const { userId } = request.user as { userId: string };
      await writePricingAudit(
        {
          entityType: 'tariff',
          entityId: tariffId,
          action: 'updated',
          actorUserId: userId,
          before: existing,
          after: updated,
        },
        undefined,
        request.log,
      );
      await publishPricingChanged({
        pricingGroupId: id,
        tariffId,
        action: 'tariff.updated',
      });
      return updated;
    },
  );

  app.delete(
    '/pricing-groups/:id/tariffs/:tariffId',
    {
      onRequest: [authorize('pricing:write')],
      schema: {
        tags: ['Pricing'],
        summary: 'Delete a tariff from a pricing group',
        operationId: 'deleteGroupTariff',
        security: [{ bearerAuth: [] }],
        params: zodSchema(tariffParams),
        response: {
          204: { type: 'null' as const },
          404: errorWith('Tariff not found', [ERROR_CODES.TARIFF_NOT_FOUND]),
          409: errorWith('Tariff in use', [ERROR_CODES.TARIFF_IN_USE]),
        },
      },
    },
    async (request, reply) => {
      const { tariffId } = request.params as z.infer<typeof tariffParams>;

      const [tariff] = await db.select().from(tariffs).where(eq(tariffs.id, tariffId));
      if (tariff == null) {
        await reply.status(404).send({ error: 'Tariff not found', code: 'TARIFF_NOT_FOUND' });
        return;
      }

      // Two FKs reference tariffs.id: charging_sessions.tariff_id (the
      // session's primary tariff snapshot) and session_tariff_segments.tariff_id
      // (per-segment snapshots when split-billing crossed tariff boundaries).
      // A tariff used only as a non-primary segment would slip past a
      // sessions-only check and then fail with a raw 500 on the DELETE
      // (the FK is ON DELETE NO ACTION). Check both so the operator gets
      // a clean 409.
      const [sessionUsage, segmentUsage] = await Promise.all([
        db
          .select({ count: count() })
          .from(chargingSessions)
          .where(eq(chargingSessions.tariffId, tariffId)),
        db
          .select({ count: count() })
          .from(sessionTariffSegments)
          .where(eq(sessionTariffSegments.tariffId, tariffId)),
      ]);
      const inUse = (sessionUsage[0]?.count ?? 0) > 0 || (segmentUsage[0]?.count ?? 0) > 0;
      if (inUse) {
        await reply.status(409).send({
          error: 'Tariff is referenced by charging sessions and cannot be deleted',
          code: 'TARIFF_IN_USE',
        });
        return;
      }

      await db.delete(tariffs).where(eq(tariffs.id, tariffId));
      const { userId } = request.user as { userId: string };
      await writePricingAudit(
        {
          entityType: 'tariff',
          entityId: tariffId,
          action: 'deleted',
          actorUserId: userId,
          before: tariff,
        },
        undefined,
        request.log,
      );
      await publishPricingChanged({
        pricingGroupId: tariff.pricingGroupId,
        tariffId,
        action: 'tariff.deleted',
      });
      await reply.status(204).send();
    },
  );

  // Schedule endpoint
  app.get(
    '/pricing-groups/:id/schedule',
    {
      onRequest: [authorize('pricing:read')],
      schema: {
        tags: ['Pricing'],
        summary: 'Get tariff schedule for a pricing group',
        operationId: 'getPricingGroupSchedule',
        security: [{ bearerAuth: [] }],
        params: zodSchema(groupParams),
        response: {
          200: arrayResponse(scheduleItem),
          404: errorWith('Resource not found', [ERROR_CODES.NOT_FOUND]),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof groupParams>;

      const [group] = await db.select().from(pricingGroups).where(eq(pricingGroups.id, id));
      if (group == null) {
        await reply
          .status(404)
          .send({ error: 'Pricing group not found', code: 'PRICING_GROUP_NOT_FOUND' });
        return;
      }

      const activeTariffs = await db
        .select()
        .from(tariffs)
        .where(and(eq(tariffs.pricingGroupId, id), eq(tariffs.isActive, true)));

      const holidays = await loadHolidays();
      const now = new Date();

      const tariffInputs: TariffWithRestrictions[] = activeTariffs.map((t) => ({
        id: t.id,
        currency: t.currency,
        pricePerKwh: t.pricePerKwh,
        pricePerMinute: t.pricePerMinute,
        pricePerSession: t.pricePerSession,
        idleFeePricePerMinute: t.idleFeePricePerMinute,
        reservationFeePerMinute: t.reservationFeePerMinute,
        taxRate: t.taxRate,
        restrictions: t.restrictions as TariffRestrictions | null,
        priority: t.priority,
        isDefault: t.isDefault,
      }));

      const currentTariff = resolveActiveTariff(tariffInputs, now, holidays, 0);

      const schedule = activeTariffs
        .map((t) => ({
          id: t.id,
          name: t.name,
          currency: t.currency,
          pricePerKwh: t.pricePerKwh,
          pricePerMinute: t.pricePerMinute,
          pricePerSession: t.pricePerSession,
          idleFeePricePerMinute: t.idleFeePricePerMinute,
          taxRate: t.taxRate,
          restrictions: t.restrictions,
          priority: t.priority,
          isDefault: t.isDefault,
          isCurrent: currentTariff?.id === t.id,
        }))
        .sort((a, b) => b.priority - a.priority);

      return schedule;
    },
  );

  // Station active tariff endpoint
  app.get(
    '/stations/:id/active-tariff',
    {
      onRequest: [authorize('pricing:read')],
      schema: {
        tags: ['Pricing'],
        summary: 'Get the currently active tariff for a station',
        operationId: 'getStationActiveTariff',
        security: [{ bearerAuth: [] }],
        params: zodSchema(stationParams),
        response: {
          200: itemResponse(activeTariffItem),
          404: errorWith('No tariffs', [ERROR_CODES.NO_TARIFFS]),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof stationParams>;

      const result = await resolveTariffGroup(id);
      if (result == null) {
        await reply
          .status(404)
          .send({ error: 'No pricing group found for station', code: 'NO_PRICING_GROUP' });
        return;
      }

      const activeTariffs = await db
        .select()
        .from(tariffs)
        .where(and(eq(tariffs.pricingGroupId, result.groupId), eq(tariffs.isActive, true)));

      if (activeTariffs.length === 0) {
        await reply.status(404).send({ error: 'No active tariffs found', code: 'NO_TARIFFS' });
        return;
      }

      const holidays = await loadHolidays();
      const now = new Date();

      // Use the station's site timezone so off-peak / holiday boundaries fire
      // at the operator's local clock.
      const tzRows = await db.execute<{ timezone: string | null }>(sql`
        SELECT s.timezone
        FROM charging_stations cs
        LEFT JOIN sites s ON s.id = cs.site_id
        WHERE cs.id = ${id}
        LIMIT 1
      `);
      const timezone = tzRows[0]?.timezone ?? undefined;

      const tariffInputs: TariffWithRestrictions[] = activeTariffs.map((t) => ({
        id: t.id,
        currency: t.currency,
        pricePerKwh: t.pricePerKwh,
        pricePerMinute: t.pricePerMinute,
        pricePerSession: t.pricePerSession,
        idleFeePricePerMinute: t.idleFeePricePerMinute,
        reservationFeePerMinute: t.reservationFeePerMinute,
        taxRate: t.taxRate,
        restrictions: t.restrictions as TariffRestrictions | null,
        priority: t.priority,
        isDefault: t.isDefault,
      }));

      const current = resolveActiveTariff(tariffInputs, now, holidays, 0, timezone);
      if (current == null) {
        await reply
          .status(404)
          .send({ error: 'No matching tariff for current time', code: 'NO_MATCHING_TARIFF' });
        return;
      }

      const match = activeTariffs.find((t) => t.id === current.id);

      return {
        ...current,
        name: match?.name ?? '',
        pricingGroupId: result.groupId,
        pricingGroupName: result.groupName,
      };
    },
  );

  // Pricing audit log: who changed what, when, with before/after snapshots.
  // Filter by entityType + entityId to scope to one pricing group, tariff, or
  // holiday. When called without filters, returns recent activity across the
  // whole pricing system (limited to the configured page size).
  const auditQuery = paginationQuery.extend({
    entityType: z
      .enum(['pricing_group', 'tariff', 'holiday', 'pricing_assignment'])
      .optional()
      .describe('Filter by entity type'),
    entityId: z.string().optional().describe('Filter by entity id (group, tariff, or holiday)'),
    pricingGroupId: z
      .string()
      .optional()
      .describe(
        'Convenience filter: returns audit rows for this pricing group AND every tariff that ever lived inside it. Equivalent to OR-joining (entity_type=pricing_group AND entity_id=:id) with (entity_type=tariff AND entity_id IN (tariffs of this group)).',
      ),
  });

  const auditItem = z
    .object({
      id: z.number().describe('Audit row id'),
      entityType: z.string().describe('pricing_group | tariff | holiday'),
      entityId: z.string().describe('id of the audited entity'),
      action: z.string().describe('created | updated | deleted'),
      actorUserId: z.string().nullable().describe('Operator user id'),
      before: z.unknown().nullable().describe('JSONB snapshot of the entity before the mutation'),
      after: z.unknown().nullable().describe('JSONB snapshot of the entity after the mutation'),
      notes: z.string().nullable().describe('Optional free-text note'),
      createdAt: z.coerce.date().describe('Audit timestamp'),
    })
    .passthrough();

  app.get(
    '/pricing-audit',
    {
      onRequest: [authorize('pricing:read')],
      schema: {
        tags: ['Pricing'],
        summary: 'List pricing audit log entries',
        operationId: 'listPricingAudit',
        security: [{ bearerAuth: [] }],
        querystring: zodSchema(auditQuery),
        response: { 200: paginatedResponse(auditItem) },
      },
    },
    async (request) => {
      const { page, limit, entityType, entityId, pricingGroupId } = request.query as z.infer<
        typeof auditQuery
      >;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (entityType != null) conditions.push(eq(pricingAuditLog.entityType, entityType));
      if (entityId != null) conditions.push(eq(pricingAuditLog.entityId, entityId));
      if (pricingGroupId != null) {
        // Match the group itself OR any tariff that ever belonged to it
        // (tariff rows may already be deleted, so we also union audit rows
        // whose `before` JSONB carries pricing_group_id = pricingGroupId).
        const tariffIdsInGroup = sql<string[]>`
          ARRAY(
            SELECT id FROM tariffs WHERE pricing_group_id = ${pricingGroupId}
            UNION
            SELECT entity_id FROM pricing_audit_log
            WHERE entity_type = 'tariff'
              AND (
                (before->>'pricingGroupId' = ${pricingGroupId})
                OR (after->>'pricingGroupId' = ${pricingGroupId})
              )
          )
        `;
        const groupOrTariffMatch = or(
          and(
            eq(pricingAuditLog.entityType, 'pricing_group'),
            eq(pricingAuditLog.entityId, pricingGroupId),
          ),
          and(
            eq(pricingAuditLog.entityType, 'tariff'),
            sql`${pricingAuditLog.entityId} = ANY(${tariffIdsInGroup})`,
          ),
        );
        if (groupOrTariffMatch != null) conditions.push(groupOrTariffMatch);
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [data, countRows] = await Promise.all([
        db
          .select()
          .from(pricingAuditLog)
          .where(where)
          .orderBy(desc(pricingAuditLog.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: count() }).from(pricingAuditLog).where(where),
      ]);

      return { data, total: countRows[0]?.count ?? 0 };
    },
  );
}
