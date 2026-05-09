// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useState } from 'react';
import {
  applyAlwaysVisible,
  buildDefaultVisibility,
  storageKey,
  type ColumnMeta,
  type ColumnVisibility,
} from '@/lib/column-visibility';

interface UseColumnVisibilityResult {
  visibility: ColumnVisibility;
  setVisibility: (next: ColumnVisibility) => void;
}

function readInitial(tableKey: string, columns: ColumnMeta[]): ColumnVisibility {
  if (typeof window === 'undefined') {
    return buildDefaultVisibility(columns, false);
  }

  const isMobile = !window.matchMedia('(min-width: 768px)').matches;

  try {
    const raw = window.localStorage.getItem(storageKey(tableKey));
    if (raw == null) {
      return buildDefaultVisibility(columns, isMobile);
    }
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return buildDefaultVisibility(columns, isMobile);
    }
    const stored: ColumnVisibility = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') {
        stored[k] = v;
      }
    }
    return applyAlwaysVisible(columns, stored);
  } catch {
    return buildDefaultVisibility(columns, isMobile);
  }
}

export function useColumnVisibility(
  tableKey: string,
  columns: ColumnMeta[],
): UseColumnVisibilityResult {
  const [visibility, setVisibilityState] = useState<ColumnVisibility>(() =>
    readInitial(tableKey, columns),
  );

  const setVisibility = useCallback(
    (next: ColumnVisibility) => {
      const normalized = applyAlwaysVisible(columns, next);
      setVisibilityState(normalized);
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey(tableKey), JSON.stringify(normalized));
        }
      } catch {
        // localStorage may be unavailable (private mode, quota exceeded). Ignore.
      }
    },
    [columns, tableKey],
  );

  // If columns definition changes (new column added in a release), make sure it
  // appears in the visibility map without wiping user choices.
  useEffect(() => {
    setVisibilityState((prev) => {
      let changed = false;
      const merged: ColumnVisibility = { ...prev };
      for (const col of columns) {
        if (merged[col.key] == null) {
          merged[col.key] = col.alwaysVisible === true ? true : col.defaultVisible;
          changed = true;
        } else if (col.alwaysVisible === true && merged[col.key] !== true) {
          merged[col.key] = true;
          changed = true;
        }
      }
      return changed ? merged : prev;
    });
  }, [columns]);

  return { visibility, setVisibility };
}
