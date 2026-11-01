// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts != null && 'id' in opts ? `${key}:${String(opts['id'])}` : key,
    i18n: { language: 'en' },
  }),
}));

import { CustomLayoutBoard } from '../CustomLayoutBoard';
import type { LayoutStation } from '../StationCard';
import type { FreeStationPlace } from '../site-layout-free';

function station(id: string): LayoutStation {
  return {
    id,
    stationId: `CS-${id}`,
    model: null,
    status: 'available',
    isOnline: true,
    securityProfile: 1,
    positionX: 20,
    positionY: 20,
    placed: true,
    chargingKind: 'ac',
    cellular: id === 'b',
    inMaintenance: false,
    displayMessage: null,
    evses: [],
  };
}

function renderBoard(
  places = new Map<string, FreeStationPlace>([
    ['a', { placement: { x: 0, z: 0, rotationDeg: 0 }, spots: 2 }],
    ['b', { placement: { x: 4, z: 0, rotationDeg: 0 }, spots: 1 }],
  ]),
) {
  const onMove = vi.fn();
  const onOpenDetails = vi.fn();
  render(
    <CustomLayoutBoard
      stations={[station('a'), station('b')]}
      places={places}
      onMove={onMove}
      onOpenDetails={onOpenDetails}
      boardRef={createRef<HTMLDivElement>()}
    />,
  );
  return { onMove, onOpenDetails };
}

afterEach(() => {
  cleanup();
});

describe('CustomLayoutBoard', () => {
  it('draws each station with its spots, a line between two spots, and the 4G badge', () => {
    renderBoard();
    const two = screen.getByTestId('site-layout-2d-spots-a');
    expect(two.querySelector('polygon')).not.toBeNull();
    expect(two.querySelectorAll('line')).toHaveLength(1);
    expect(screen.getByTestId('site-layout-2d-spots-b').querySelectorAll('line')).toHaveLength(0);
    expect(screen.getAllByTestId('cellular-badge')).toHaveLength(1);
  });

  it('moves and turns a focused station with the keys and opens it with Enter', () => {
    const { onMove, onOpenDetails } = renderBoard();
    const chip = screen.getByTestId('site-layout-2d-station-b');
    fireEvent.keyDown(chip, { key: 'ArrowDown' });
    expect(onMove).toHaveBeenLastCalledWith('b', { x: 4, z: 0.5, rotationDeg: 0 });
    fireEvent.keyDown(chip, { key: 'r', shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith('b', { x: 4, z: 0, rotationDeg: 1 });
    // A keyboard click (detail 0) opens the details.
    fireEvent.click(chip, { detail: 0 });
    expect(onOpenDetails).toHaveBeenCalledWith('b');
  });

  it('refuses a move onto the spots of another station', () => {
    const { onMove } = renderBoard();
    const chip = screen.getByTestId('site-layout-2d-station-b');
    fireEvent.keyDown(chip, { key: 'ArrowLeft' });
    // At 3.5 m its spot (2.2 to 4.8 m) would overlap the two spots of a (to 2.6 m).
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByTestId('site-layout-2d-notice').textContent).toBe(
      'sites.layoutView.spotsOverlap:CS-b',
    );
  });
});
