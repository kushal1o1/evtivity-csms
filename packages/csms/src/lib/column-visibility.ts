// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

export interface ColumnMeta {
  key: string;
  label: string;
  defaultVisible: boolean;
  defaultVisibleMobile: boolean;
  alwaysVisible?: boolean;
}

export type ColumnVisibility = Record<string, boolean>;

export function buildDefaultVisibility(columns: ColumnMeta[], isMobile: boolean): ColumnVisibility {
  const result: ColumnVisibility = {};
  for (const col of columns) {
    if (col.alwaysVisible === true) {
      result[col.key] = true;
    } else {
      result[col.key] = isMobile ? col.defaultVisibleMobile : col.defaultVisible;
    }
  }
  return result;
}

export function applyAlwaysVisible(
  columns: ColumnMeta[],
  visibility: ColumnVisibility,
): ColumnVisibility {
  const result: ColumnVisibility = { ...visibility };
  for (const col of columns) {
    if (col.alwaysVisible === true) {
      result[col.key] = true;
    } else if (result[col.key] == null) {
      result[col.key] = col.defaultVisible;
    }
  }
  return result;
}

export function storageKey(tableKey: string): string {
  return `columns:${tableKey}`;
}
