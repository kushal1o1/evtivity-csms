// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Form values loaded from the settings. A settings refetch (another card's
 * save, a toggle, window focus) replaces them only while the form is clean,
 * so edits in progress survive it; after this form's own save they equal
 * the new values. `onReplace` runs when a reload replaces the values, so the
 * form can reset its submitted state.
 *
 * The third item, `takeNextLoad(saved)`, is for the form's own save: call it
 * with the values the save sent, and the next reload replaces the form when
 * it still holds those values, also when the server stored them in another
 * form (a trimmed URL, a normalized number). Edits made after the save stay.
 */
export function useLoadedValues<T extends object>(
  loaded: T,
  onReplace?: () => void,
): [T, Dispatch<SetStateAction<T>>, (saved: T) => void] {
  const [values, setValues] = useState<T>(loaded);
  const loadedKey = JSON.stringify(loaded);
  const [previousKey, setPreviousKey] = useState(loadedKey);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  if (previousKey !== loadedKey) {
    setPreviousKey(loadedKey);
    setSavedKey(null);
    const valuesKey = JSON.stringify(values);
    if (valuesKey === previousKey || valuesKey === savedKey) {
      setValues(loaded);
      onReplace?.();
    }
  }
  const takeNextLoad = useCallback((saved: T) => {
    setSavedKey(JSON.stringify(saved));
  }, []);
  return [values, setValues, takeNextLoad];
}

/**
 * The values to compare edits with for the Unsaved changes note: the last
 * saved values until the next load replaces them.
 */
export function useSavedBaseline<T>(loaded: T): [T, (saved: T) => void] {
  const [saved, setSaved] = useState<{ loadedKey: string; value: T } | null>(null);
  const loadedKey = JSON.stringify(loaded);
  const baseline = saved != null && saved.loadedKey === loadedKey ? saved.value : loaded;
  return [
    baseline,
    (value: T) => {
      setSaved({ loadedKey, value });
    },
  ];
}
