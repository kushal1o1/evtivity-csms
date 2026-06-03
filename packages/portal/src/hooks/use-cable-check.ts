// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isCableDetected } from '@/lib/charger-utils';

interface CableCheckResult {
  connectorStatus: string | null;
  error?: string;
}

export interface CableCheckState {
  isCheckingStatus: boolean;
  showEvWarning: boolean;
  setShowEvWarning: (open: boolean) => void;
  runWithCableCheck: (
    check: () => Promise<CableCheckResult>,
    onProceed: () => Promise<void> | void,
    setError: (msg: string) => void,
  ) => Promise<void>;
}

/**
 * Shared cable-detection gate used before any start/checkout action. Calls the
 * caller-supplied status check, surfaces its error, opens the EV-not-detected
 * dialog when no cable is detected, and only then runs onProceed.
 */
export function useCableCheck(): CableCheckState {
  const { t } = useTranslation();
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [showEvWarning, setShowEvWarning] = useState(false);

  async function runWithCableCheck(
    check: () => Promise<CableCheckResult>,
    onProceed: () => Promise<void> | void,
    setError: (msg: string) => void,
  ): Promise<void> {
    setError('');
    setIsCheckingStatus(true);
    try {
      const result = await check();
      setIsCheckingStatus(false);
      if (result.error != null) {
        setError(result.error);
        return;
      }
      if (!isCableDetected(result.connectorStatus)) {
        setShowEvWarning(true);
        return;
      }
      await onProceed();
    } catch {
      setIsCheckingStatus(false);
      setError(t('charger.statusCheckFailed'));
    }
  }

  return { isCheckingStatus, showEvWarning, setShowEvWarning, runWithCableCheck };
}
