// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

const PROFILE_KEYS_21: Record<
  number,
  'stations.sp0' | 'stations.sp1' | 'stations.sp2' | 'stations.sp3'
> = {
  0: 'stations.sp0',
  1: 'stations.sp1',
  2: 'stations.sp2',
  3: 'stations.sp3',
};

const PROFILE_KEYS_16: Record<number, 'stations.sp16_0' | 'stations.sp16_1' | 'stations.sp16_2'> = {
  0: 'stations.sp16_0',
  1: 'stations.sp16_1',
  2: 'stations.sp16_2',
};

// Severity ramp by security level: no auth is the dangerous state, mutual TLS
// the strongest. Same mapping serves OCPP 1.6 (profiles 0-2) and 2.1 (0-3).
const PROFILE_VARIANTS: Record<number, 'destructive' | 'warning' | 'info' | 'success'> = {
  0: 'destructive',
  1: 'warning',
  2: 'info',
  3: 'success',
};

interface SecurityProfileBadgeProps {
  profile: number;
  ocppProtocol?: string | null | undefined;
}

export function SecurityProfileBadge({
  profile,
  ocppProtocol,
}: SecurityProfileBadgeProps): React.JSX.Element {
  const { t } = useTranslation();
  const keys = ocppProtocol === 'ocpp1.6' ? PROFILE_KEYS_16 : PROFILE_KEYS_21;
  const key = keys[profile] ?? keys[1] ?? 'stations.sp1';
  const variant = PROFILE_VARIANTS[profile] ?? 'warning';

  return <Badge variant={variant}>{t(key)}</Badge>;
}
