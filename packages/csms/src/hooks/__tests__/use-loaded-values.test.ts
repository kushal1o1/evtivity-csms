// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoadedValues } from '../use-loaded-values';

interface Values {
  minLength: number;
}

function setup(initial: Values, onReplace?: () => void) {
  return renderHook(({ loaded }: { loaded: Values }) => useLoadedValues(loaded, onReplace), {
    initialProps: { loaded: initial },
  });
}

describe('useLoadedValues', () => {
  it('replaces the values on a reload while the form is clean', () => {
    const onReplace = vi.fn();
    const { result, rerender } = setup({ minLength: 12 }, onReplace);
    rerender({ loaded: { minLength: 20 } });
    expect(result.current[0]).toEqual({ minLength: 20 });
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it('keeps a dirty edit when the settings reload', () => {
    const onReplace = vi.fn();
    const { result, rerender } = setup({ minLength: 12 }, onReplace);
    act(() => {
      result.current[1]({ minLength: 16 });
    });
    rerender({ loaded: { minLength: 20 } });
    expect(result.current[0]).toEqual({ minLength: 16 });
    expect(onReplace).not.toHaveBeenCalled();
  });

  it('does nothing when the reload brings back its own saved values', () => {
    const onReplace = vi.fn();
    const { result, rerender } = setup({ minLength: 12 }, onReplace);
    act(() => {
      result.current[1]({ minLength: 16 });
    });
    const before = result.current[0];
    rerender({ loaded: { minLength: 16 } });
    expect(result.current[0]).toBe(before);
    expect(onReplace).not.toHaveBeenCalled();
  });

  it('ignores a rerender with equal loaded values', () => {
    const onReplace = vi.fn();
    const { result, rerender } = setup({ minLength: 12 }, onReplace);
    const before = result.current[0];
    rerender({ loaded: { minLength: 12 } });
    expect(result.current[0]).toBe(before);
    expect(onReplace).not.toHaveBeenCalled();
  });

  it('takes the stored form of its own save on the next reload', () => {
    const { result, rerender } = setup({ minLength: 12 });
    act(() => {
      result.current[1]({ minLength: 16 });
    });
    act(() => {
      result.current[2]({ minLength: 16 });
    });
    // The server stored another form of the saved value.
    rerender({ loaded: { minLength: 17 } });
    expect(result.current[0]).toEqual({ minLength: 17 });
    // Clean again: the next reload replaces it.
    rerender({ loaded: { minLength: 18 } });
    expect(result.current[0]).toEqual({ minLength: 18 });
  });

  it('keeps an edit made after its own save', () => {
    const { result, rerender } = setup({ minLength: 12 });
    act(() => {
      result.current[1]({ minLength: 16 });
      result.current[2]({ minLength: 16 });
    });
    act(() => {
      result.current[1]({ minLength: 30 });
    });
    rerender({ loaded: { minLength: 17 } });
    expect(result.current[0]).toEqual({ minLength: 30 });
  });
});
