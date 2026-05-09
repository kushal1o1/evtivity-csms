// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CopyableId } from '@/components/copyable-id';
import { Pagination } from '@/components/ui/pagination';
import { formatDate } from '@/lib/timezone';
import type { ColumnMeta, ColumnVisibility } from '@/lib/column-visibility';

export const TOKENS_COLUMNS: ColumnMeta[] = [
  {
    key: 'token',
    label: 'tokens.token',
    defaultVisible: true,
    defaultVisibleMobile: true,
    alwaysVisible: true,
  },
  { key: 'driver', label: 'tokens.driver', defaultVisible: true, defaultVisibleMobile: true },
  { key: 'tokenId', label: 'tokens.tokenId', defaultVisible: true, defaultVisibleMobile: false },
  { key: 'type', label: 'tokens.type', defaultVisible: true, defaultVisibleMobile: false },
  {
    key: 'status',
    label: 'common.status',
    defaultVisible: true,
    defaultVisibleMobile: true,
    alwaysVisible: true,
  },
  { key: 'created', label: 'common.created', defaultVisible: true, defaultVisibleMobile: false },
];

export interface Token {
  id: string;
  driverId?: string | null;
  idToken: string;
  tokenType: string;
  isActive: boolean;
  createdAt: string;
  driverFirstName?: string | null;
  driverLastName?: string | null;
}

interface TokensTableProps {
  tokens: Token[] | undefined;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  timezone: string;
  isLoading?: boolean;
  showDriver?: boolean;
  emptyMessage?: string;
  visibility?: ColumnVisibility;
}

export function TokensTable({
  tokens,
  page,
  totalPages,
  onPageChange,
  timezone,
  isLoading,
  showDriver = true,
  emptyMessage,
  visibility,
}: TokensTableProps): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isVisible = (key: string): boolean => visibility == null || visibility[key] !== false;
  const colSpan = TOKENS_COLUMNS.filter(
    (c) => (c.key !== 'driver' || showDriver) && isVisible(c.key),
  ).length;

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {isVisible('token') && <TableHead>{t('tokens.token')}</TableHead>}
              {showDriver && isVisible('driver') && <TableHead>{t('tokens.driver')}</TableHead>}
              {isVisible('tokenId') && <TableHead>{t('tokens.tokenId')}</TableHead>}
              {isVisible('type') && <TableHead>{t('tokens.type')}</TableHead>}
              {isVisible('status') && <TableHead>{t('common.status')}</TableHead>}
              {isVisible('created') && <TableHead>{t('common.created')}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading === true && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            )}
            {tokens?.map((token) => (
              <TableRow
                key={token.id}
                className="cursor-pointer"
                data-testid={`token-row-${token.id}`}
                onClick={() => {
                  void navigate(`/tokens/${token.id}`);
                }}
              >
                {isVisible('token') && (
                  <TableCell>
                    <CopyableId id={token.idToken} variant="table" className="text-primary" />
                  </TableCell>
                )}
                {showDriver && isVisible('driver') && (
                  <TableCell>
                    {token.driverId != null && token.driverFirstName != null ? (
                      <Link
                        to={`/drivers/${token.driverId}`}
                        className="text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        {token.driverFirstName} {token.driverLastName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{t('tokens.unassigned')}</span>
                    )}
                  </TableCell>
                )}
                {isVisible('tokenId') && (
                  <TableCell>
                    <CopyableId id={token.id} variant="table" />
                  </TableCell>
                )}
                {isVisible('type') && <TableCell>{token.tokenType}</TableCell>}
                {isVisible('status') && (
                  <TableCell data-testid="row-click-target">
                    <Badge variant={token.isActive ? 'default' : 'secondary'}>
                      {token.isActive ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </TableCell>
                )}
                {isVisible('created') && (
                  <TableCell>{formatDate(token.createdAt, timezone)}</TableCell>
                )}
              </TableRow>
            ))}
            {tokens?.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  {emptyMessage ?? t('tokens.noTokensFound')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </>
  );
}
