// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

export type Theme = 'light' | 'dark';

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/**
 * Resolve the theme to use on app startup. Uses the persisted localStorage
 * preference when present; on first visit falls back to the OS-level
 * prefers-color-scheme so users with system dark mode aren't forced into
 * light mode the first time they load the app (frontend/ui.md).
 */
export function resolveInitialTheme(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
