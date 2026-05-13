// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/timezone';

interface AuditEntry {
  id: number;
  reservationId: string | null;
  action: string;
  actor: string;
  actorUserId: string | null;
  actorUserName: string | null;
  actorDriverId: string | null;
  actorDriverName: string | null;
  driverIdBefore: string | null;
  driverIdAfter: string | null;
  tokenIdBefore: string | null;
  tokenIdAfter: string | null;
  evseIdBefore: string | null;
  evseIdAfter: string | null;
  statusBefore: string | null;
  statusAfter: string | null;
  expiresAtBefore: string | null;
  expiresAtAfter: string | null;
  notes: string | null;
  createdAt: string;
}

interface AuditResponse {
  data: AuditEntry[];
  total: number;
}

function actionVariant(
  action: string,
): 'default' | 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (action) {
    case 'created':
      return 'success';
    case 'used':
      return 'default';
    case 'cancelled':
    case 'session_failed':
      return 'destructive';
    case 'expired':
      return 'warning';
    case 'updated':
      return 'secondary';
    default:
      return 'secondary';
  }
}

function FieldDiff({
  label,
  before,
  after,
  hrefBefore,
  hrefAfter,
}: {
  label: string;
  before: string | null;
  after: string | null;
  hrefBefore?: string | undefined;
  hrefAfter?: string | undefined;
}): React.JSX.Element | null {
  if (before === after) return null;
  const renderValue = (v: string | null, href?: string): React.ReactNode => {
    if (v == null || v === '') return <span className="text-muted-foreground">n/a</span>;
    if (href != null) {
      return (
        <Link
          to={href}
          className="text-primary hover:underline text-xs"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {v}
        </Link>
      );
    }
    return <span className="text-xs">{v}</span>;
  };
  return (
    <div className="text-xs flex items-baseline gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      {renderValue(before, hrefBefore)}
      <span className="text-muted-foreground">→</span>
      {renderValue(after, hrefAfter)}
    </div>
  );
}

export interface ReservationHistoryTabProps {
  reservationId: string;
  timezone: string;
}

export function ReservationHistoryTab({
  reservationId,
  timezone,
}: ReservationHistoryTabProps): React.JSX.Element {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', reservationId, 'audit', page],
    queryFn: () =>
      api.get<AuditResponse>(
        `/v1/reservations/${reservationId}/audit?page=${String(page)}&limit=${String(limit)}`,
      ),
    enabled: reservationId !== '',
  });

  const entries = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('reservations.historyTab')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.timestamp')}</TableHead>
                <TableHead>{t('reservations.action')}</TableHead>
                <TableHead>{t('reservations.actor')}</TableHead>
                <TableHead>{t('reservations.changes')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    {t('reservations.noHistory')}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDateTime(row.createdAt, timezone)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionVariant(row.action)}>
                        {row.action.replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.actorUserId != null ? (
                        <Link
                          to={`/users/${row.actorUserId}`}
                          className="text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          {row.actorUserName ?? row.actor}
                        </Link>
                      ) : row.actorDriverId != null ? (
                        <Link
                          to={`/drivers/${row.actorDriverId}`}
                          className="text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          {row.actorDriverName ?? row.actor}
                        </Link>
                      ) : (
                        <span>{row.actor}</span>
                      )}
                    </TableCell>
                    <TableCell className="space-y-1">
                      <FieldDiff
                        label={t('reservations.status')}
                        before={row.statusBefore}
                        after={row.statusAfter}
                      />
                      <FieldDiff
                        label={t('reservations.driver')}
                        before={row.driverIdBefore}
                        after={row.driverIdAfter}
                        hrefBefore={
                          row.driverIdBefore != null ? `/drivers/${row.driverIdBefore}` : undefined
                        }
                        hrefAfter={
                          row.driverIdAfter != null ? `/drivers/${row.driverIdAfter}` : undefined
                        }
                      />
                      <FieldDiff
                        label={t('reservations.token')}
                        before={row.tokenIdBefore}
                        after={row.tokenIdAfter}
                        hrefBefore={
                          row.tokenIdBefore != null ? `/tokens/${row.tokenIdBefore}` : undefined
                        }
                        hrefAfter={
                          row.tokenIdAfter != null ? `/tokens/${row.tokenIdAfter}` : undefined
                        }
                      />
                      <FieldDiff
                        label={t('reservations.evse')}
                        before={row.evseIdBefore}
                        after={row.evseIdAfter}
                      />
                      <FieldDiff
                        label={t('reservations.expiresAt')}
                        before={
                          row.expiresAtBefore != null
                            ? formatDateTime(row.expiresAtBefore, timezone)
                            : null
                        }
                        after={
                          row.expiresAtAfter != null
                            ? formatDateTime(row.expiresAtAfter, timezone)
                            : null
                        }
                      />
                      {row.notes != null && row.notes !== '' && (
                        <div className="text-xs text-muted-foreground italic">{row.notes}</div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
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
