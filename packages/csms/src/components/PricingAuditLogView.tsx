// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { usePaginatedQuery } from '@/hooks/use-paginated-query';
import { useUserTimezone, formatDateTime } from '@/lib/timezone';

interface AuditEntry {
  id: number;
  entityType: 'pricing_group' | 'tariff' | 'holiday';
  entityId: string;
  action: 'created' | 'updated' | 'deleted';
  actorUserId: string | null;
  before: unknown;
  after: unknown;
  notes: string | null;
  createdAt: string;
}

function actionVariant(action: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (action) {
    case 'created':
      return 'success';
    case 'updated':
      return 'secondary';
    case 'deleted':
      return 'destructive';
    default:
      return 'secondary';
  }
}

interface DiffRow {
  field: string;
  before: string;
  after: string;
}

function summarizeDiff(before: unknown, after: unknown): DiffRow[] {
  if (before == null || typeof before !== 'object' || after == null || typeof after !== 'object') {
    return [];
  }
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const rows: DiffRow[] = [];
  for (const key of keys) {
    if (key === 'updatedAt' || key === 'createdAt') continue;
    const bv = b[key];
    const av = a[key];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    const stringify = (v: unknown): string => {
      if (v == null) return 'n/a';
      if (typeof v === 'object') return JSON.stringify(v);
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
        return String(v);
      return JSON.stringify(v);
    };
    rows.push({ field: key, before: stringify(bv), after: stringify(av) });
  }
  return rows;
}

export interface PricingAuditLogViewProps {
  fixedFilters?: {
    entityType?: 'pricing_group' | 'tariff' | 'holiday';
    entityId?: string;
    pricingGroupId?: string;
  };
  queryKey?: string;
}

export function PricingAuditLogView({
  fixedFilters,
  queryKey,
}: PricingAuditLogViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const timezone = useUserTimezone();

  const filters: Record<string, string> = {};
  if (fixedFilters?.entityType != null) filters['entityType'] = fixedFilters.entityType;
  if (fixedFilters?.entityId != null) filters['entityId'] = fixedFilters.entityId;
  if (fixedFilters?.pricingGroupId != null) {
    filters['pricingGroupId'] = fixedFilters.pricingGroupId;
  }

  const { data, isLoading, page, totalPages, setPage } = usePaginatedQuery<AuditEntry>(
    queryKey ?? 'pricing-audit',
    '/v1/pricing-audit',
    filters,
  );

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.timestamp')}</TableHead>
                <TableHead>{t('pricing.auditEntity')}</TableHead>
                <TableHead>{t('common.action')}</TableHead>
                <TableHead>{t('common.actor')}</TableHead>
                <TableHead>{t('pricing.auditChanges')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : data == null || data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => {
                  const diffs =
                    row.action === 'updated' ? summarizeDiff(row.before, row.after) : [];
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateTime(row.createdAt, timezone)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="capitalize">{row.entityType.replace('_', ' ')}</span>
                        <span className="ml-1 text-muted-foreground">{row.entityId}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(row.action)}>{row.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.actorUserId != null ? (
                          <Link
                            to={`/users/${row.actorUserId}`}
                            className="text-primary hover:underline"
                          >
                            {row.actorUserId}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">system</span>
                        )}
                      </TableCell>
                      <TableCell className="space-y-1 text-xs">
                        {row.action === 'created' && (
                          <span className="text-muted-foreground">
                            {t('pricing.auditCreatedSummary')}
                          </span>
                        )}
                        {row.action === 'deleted' && (
                          <span className="text-muted-foreground">
                            {t('pricing.auditDeletedSummary')}
                          </span>
                        )}
                        {diffs.length === 0 && row.action === 'updated' && (
                          <span className="text-muted-foreground">
                            {t('pricing.auditNoFieldChange')}
                          </span>
                        )}
                        {diffs.map((d) => (
                          <div key={d.field} className="flex items-baseline gap-2">
                            <span className="text-muted-foreground shrink-0">{d.field}:</span>
                            <span className="text-xs">{d.before}</span>
                            <span className="text-muted-foreground">&rarr;</span>
                            <span className="text-xs">{d.after}</span>
                          </div>
                        ))}
                        {row.notes != null && row.notes !== '' && (
                          <div className="italic text-muted-foreground">{row.notes}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </CardContent>
    </Card>
  );
}
