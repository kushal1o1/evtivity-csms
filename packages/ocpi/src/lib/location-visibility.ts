// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { db, ocpiLocationPublish, ocpiLocationPublishPartners } from '@evtivity/database';
import { and, eq, sql } from 'drizzle-orm';

// Returns true when the supplied site is published AND visible to the
// supplied OCPI partner. Mirrors the predicate applied by the location
// list endpoint (publishToAll OR partner in allow-list). Used by
// single-item location/EVSE/connector lookups and by the CPO command
// receivers so partners cannot target sites that were never offered to
// them.
export async function isLocationVisibleToPartner(
  partnerId: string,
  siteId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: ocpiLocationPublish.id })
    .from(ocpiLocationPublish)
    .leftJoin(
      ocpiLocationPublishPartners,
      eq(ocpiLocationPublish.id, ocpiLocationPublishPartners.locationPublishId),
    )
    .where(
      and(
        eq(ocpiLocationPublish.siteId, siteId),
        eq(ocpiLocationPublish.isPublished, true),
        sql`(${ocpiLocationPublish.publishToAll} = true OR ${ocpiLocationPublishPartners.partnerId} = ${partnerId})`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}
