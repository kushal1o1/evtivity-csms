// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import type { DomainEvent, Logger } from '@evtivity/lib';

interface BufferedEvent {
  event: DomainEvent;
  bufferedAt: number;
}

interface TransactionBufferOptions {
  maxSize?: number;
  ttlMs?: number;
  cleanupIntervalMs?: number;
  logger?: Logger;
}

export class TransactionBuffer {
  private readonly buffer = new Map<string, BufferedEvent[]>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly logger: Logger | undefined;
  private totalCount = 0;

  constructor(opts: TransactionBufferOptions = {}) {
    this.maxSize = opts.maxSize ?? 1000;
    this.ttlMs = opts.ttlMs ?? 30_000;
    this.logger = opts.logger;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, opts.cleanupIntervalMs ?? 10_000);
  }

  get size(): number {
    return this.totalCount;
  }

  add(transactionId: string, event: DomainEvent): boolean {
    if (this.totalCount >= this.maxSize) return false;

    const existing = this.buffer.get(transactionId) ?? [];
    existing.push({ event, bufferedAt: Date.now() });
    this.buffer.set(transactionId, existing);
    this.totalCount++;
    return true;
  }

  drain(transactionId: string): DomainEvent[] {
    const entries = this.buffer.get(transactionId);
    if (entries == null) return [];

    this.buffer.delete(transactionId);
    const now = Date.now();
    const valid = entries.filter((e) => now - e.bufferedAt < this.ttlMs);
    const expired = entries.length - valid.length;
    if (expired > 0) {
      this.logger?.warn(
        { transactionId, expired, ttlMs: this.ttlMs },
        'Buffered transaction events expired before Started arrived (dropped at drain)',
      );
    }
    this.totalCount -= entries.length;
    return valid.map((e) => e.event);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [txId, entries] of this.buffer) {
      const remaining = entries.filter((e) => now - e.bufferedAt < this.ttlMs);
      const removed = entries.length - remaining.length;
      this.totalCount -= removed;
      if (removed > 0) {
        // Silent expiry hides cases where a station sends Updated/Ended for a
        // transaction whose Started never arrived: revenue loss with no signal
        // to the operator. Log with a sample event type so an alert can be
        // tuned.
        const firstEventType = entries[0]?.event.eventType;
        this.logger?.warn(
          { transactionId: txId, expired: removed, firstEventType, ttlMs: this.ttlMs },
          'Buffered transaction events expired in cleanup sweep (Started never arrived)',
        );
      }
      if (remaining.length === 0) {
        this.buffer.delete(txId);
      } else {
        this.buffer.set(txId, remaining);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.buffer.clear();
    this.totalCount = 0;
  }
}
