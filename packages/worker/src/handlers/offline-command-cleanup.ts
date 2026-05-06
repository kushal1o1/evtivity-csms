// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { client } from '@evtivity/database';
import type { Logger } from 'pino';

export async function offlineCommandCleanupHandler(log: Logger): Promise<void> {
  const expired = await client`
    UPDATE offline_command_queue SET status = 'expired'
    WHERE status = 'pending' AND expires_at <= now()
    RETURNING id
  `;

  if (expired.length > 0) {
    log.info({ count: expired.length }, 'Expired stale offline commands');
  }
}
