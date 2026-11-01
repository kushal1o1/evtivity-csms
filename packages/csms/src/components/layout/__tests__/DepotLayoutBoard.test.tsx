// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { effectiveLayoutSettings, type SiteLayoutSettings } from '@evtivity/lib/site-layout';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts != null && 'id' in opts ? `${key}:${String(opts['id'])}` : key,
    i18n: { language: 'en' },
  }),
}));

import {
  DepotLayoutBoard,
  depotBoardGeometry,
  depotBoardPoint,
  depotChipPoint,
} from '../DepotLayoutBoard';
import type { LayoutStation } from '../StationCard';

const DEPOT: SiteLayoutSettings = {
  ...effectiveLayoutSettings(null),
  siteType: 'depot',
  busBays: 3,
  truckLanes: 2,
};

function station(id: string, x: number, y: number): LayoutStation {
  return {
    id,
    stationId: `CS-${id}`,
    model: null,
    status: 'available',
    isOnline: true,
    securityProfile: 1,
    positionX: x,
    positionY: y,
    placed: true,
    chargingKind: 'dc',
    cellular: false,
    inMaintenance: false,
    displayMessage: null,
    evses: [],
  };
}

function renderBoard(editable = true) {
  const onMove = vi.fn();
  const onOpenDetails = vi.fn();
  render(
    <DepotLayoutBoard
      // Bus bay 0 (slot 0, 0) and truck lane 0 (slot 0, 1).
      stations={[station('bus', 20, 20), station('truck', 20, 160)]}
      settings={DEPOT}
      editable={editable}
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

describe('DepotLayoutBoard', () => {
  it('draws the yard, every bus bay and truck lane with its arrows, and the gate', () => {
    renderBoard();
    expect(screen.getByTestId('site-layout-2d-depot').querySelector('polygon')).not.toBeNull();
    expect(screen.getAllByTestId(/^site-layout-2d-bus-bay-/)).toHaveLength(3);
    const lanes = screen.getAllByTestId(/^site-layout-2d-truck-lane-/);
    expect(lanes).toHaveLength(2);
    // An entry and an exit arrow on each lane, the way trucks drive.
    expect(lanes[0]?.querySelectorAll('polyline')).toHaveLength(2);
    expect(screen.getByTestId('site-layout-2d-depot-gate')).not.toBeNull();
  });

  it('puts each chip at the charger of its bay or lane', () => {
    renderBoard();
    const g = depotBoardGeometry(DEPOT);
    const bus = depotChipPoint(DEPOT, { col: 0, row: 0 });
    // Bus bay 0: the middle of the bay, 3 m in (every other bay 5 m further in).
    expect(bus).toEqual(depotBoardPoint(g, { x: 2.15, z: 3 }));
    expect(depotChipPoint(DEPOT, { col: 1, row: 0 }).y).toBe(depotBoardPoint(g, { x: 0, z: 8 }).y);
    const chip = screen.getByTestId('site-layout-2d-station-bus').parentElement;
    expect(chip?.style.left).toBe(`${String(bus.x)}px`);
    expect(chip?.style.top).toBe(`${String(bus.y)}px`);
  });

  it('moves a focused station to the next free bay or lane with the keys', () => {
    const { onMove, onOpenDetails } = renderBoard();
    const chip = screen.getByTestId('site-layout-2d-station-bus');
    fireEvent.keyDown(chip, { key: 'ArrowRight' });
    expect(onMove).toHaveBeenLastCalledWith('bus', 220, 20);
    // Down is the truck lanes: lane 0 is taken, lane 1 is the nearest free one.
    fireEvent.keyDown(chip, { key: 'ArrowDown' });
    expect(onMove).toHaveBeenLastCalledWith('bus', 220, 160);
    // Up from the bus bays stays in the bus bays: nothing to move to.
    onMove.mockClear();
    fireEvent.keyDown(chip, { key: 'ArrowUp' });
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(chip, { detail: 0 });
    expect(onOpenDetails).toHaveBeenCalledWith('bus');
  });

  it('opens a station but moves nothing on a board that does not drag', () => {
    const { onMove, onOpenDetails } = renderBoard(false);
    const chip = screen.getByTestId('site-layout-2d-station-truck');
    fireEvent.keyDown(chip, { key: 'ArrowRight' });
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(chip, { detail: 1 });
    expect(onOpenDetails).toHaveBeenCalledWith('truck');
  });
});
