// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

// The 2D view of a custom site: every station's parking spots from above at
// its free position and turn (the same positions as the 3D view), with a chip
// at the charger that opens the station popup. A station drags freely
// (snapped to 0.5 m, refused over another station's spots); with its chip
// focused, the arrow keys move it and R turns it (Shift+R by 1 degree).

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  freeFootprint,
  freeFootprintsOverlap,
  freeSpotRects,
  freeStationsBox,
  freeToSite,
  snapFreePlacement,
  type FreePlacement,
} from '@evtivity/lib/site-layout';
import {
  stationDisplayState,
  stationStateColor,
  stationStateLabelKey,
} from '@/lib/station-display-state';
import { cn } from '@/lib/utils';
import { CellularBadge, StationStateIcon } from './StationStateIcon';
import type { LayoutStation } from './StationCard';
import type { FreeStationPlace } from './site-layout-free';

/** Pixels per meter of the 2D custom board. */
export const CUSTOM_BOARD_PX_PER_M = 30;
/** Grass around the stations, in meters. */
const BOARD_MARGIN_M = 4;

export interface CustomBoardGeometry {
  /** The site point at the board's top left corner, in meters. */
  originX: number;
  originZ: number;
  width: number;
  height: number;
}

/** The board around every station's spots, with a margin, at CUSTOM_BOARD_PX_PER_M. */
export function customBoardGeometry(places: readonly FreeStationPlace[]): CustomBoardGeometry {
  const box = freeStationsBox(places) ?? { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
  const s = CUSTOM_BOARD_PX_PER_M;
  return {
    originX: box.minX - BOARD_MARGIN_M,
    originZ: box.minZ - BOARD_MARGIN_M,
    width: Math.ceil((box.maxX - box.minX + 2 * BOARD_MARGIN_M) * s),
    height: Math.ceil((box.maxZ - box.minZ + 2 * BOARD_MARGIN_M) * s),
  };
}

/** A site point on the board, in px. */
export function boardPoint(
  g: CustomBoardGeometry,
  p: { x: number; z: number },
): {
  x: number;
  y: number;
} {
  const s = CUSTOM_BOARD_PX_PER_M;
  return { x: (p.x - g.originX) * s, y: (p.z - g.originZ) * s };
}

interface CustomLayoutBoardProps {
  stations: readonly LayoutStation[];
  places: ReadonlyMap<string, FreeStationPlace>;
  onMove: (stationId: string, placement: FreePlacement) => void;
  onOpenDetails: (stationId: string) => void;
  /** The board element (the popup places itself inside it). */
  boardRef: React.RefObject<HTMLDivElement | null>;
  children?: React.ReactNode;
}

export function CustomLayoutBoard({
  stations,
  places,
  onMove,
  onOpenDetails,
  boardRef,
  children,
}: CustomLayoutBoardProps): React.JSX.Element {
  const { t } = useTranslation();
  // The board stays put while a station is dragged (it grows after the drop).
  const geometry = customBoardGeometry([...places.values()]);
  const [drag, setDrag] = useState<{ id: string; placement: FreePlacement } | null>(null);
  const dragStart = useRef<{ x: number; y: number; placement: FreePlacement } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const s = CUSTOM_BOARD_PX_PER_M;
  // The board opens on the middle of the stations (a wide site is larger than a phone).
  const centered = useRef(false);
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (board == null || centered.current || places.size === 0) return;
    centered.current = true;
    board.scrollLeft = Math.max(0, (geometry.width - board.clientWidth) / 2);
    board.scrollTop = Math.max(0, (geometry.height - board.clientHeight) / 2);
  });

  function blocked(id: string, moved: FreePlacement): boolean {
    const own = places.get(id);
    return [...places].some(
      ([other, o]) =>
        other !== id && freeFootprintsOverlap({ placement: moved, spots: own?.spots ?? 1 }, o),
    );
  }

  function commit(id: string, placement: FreePlacement): void {
    const name = stations.find((st) => st.id === id)?.stationId ?? id;
    if (blocked(id, placement)) {
      setNotice(t('sites.layoutView.spotsOverlap', { id: name }));
      return;
    }
    setNotice(null);
    onMove(id, placement);
  }

  function onKeyDown(e: React.KeyboardEvent, id: string): void {
    const own = places.get(id);
    if (own == null) return;
    const step = 0.5;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = move[e.key];
    const turn = e.key === 'r' || e.key === 'R' ? (e.shiftKey ? 1 : 15) : 0;
    if (delta == null && turn === 0) return;
    e.preventDefault();
    const p = own.placement;
    const next = {
      x: p.x + (delta?.[0] ?? 0),
      z: p.z + (delta?.[1] ?? 0),
      rotationDeg: p.rotationDeg + turn,
    };
    commit(id, snapFreePlacement(next, { freeRotation: turn !== 15 }));
  }

  return (
    <div
      ref={boardRef}
      data-testid="site-layout-2d"
      className="relative h-[700px] w-full overflow-auto rounded-lg border-2 border-dashed"
    >
      <div className="relative" style={{ width: geometry.width, height: geometry.height }}>
        <svg
          aria-hidden="true"
          className="absolute inset-0"
          width={geometry.width}
          height={geometry.height}
          data-testid="site-layout-2d-custom"
        >
          {stations.map((station) => {
            const place = places.get(station.id);
            if (place == null) return null;
            const placement = drag?.id === station.id ? drag.placement : place.placement;
            const corners = freeFootprint(placement, place.spots).map((c) =>
              boardPoint(geometry, c),
            );
            // A line between two car spots.
            const rects = freeSpotRects(place.spots);
            const at = (x: number, z: number) => boardPoint(geometry, freeToSite(placement, x, z));
            const lines: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
            rects.forEach((r, i) => {
              if (i > 0) lines.push([at(r.minX, r.minZ), at(r.minX, r.maxZ)]);
            });
            const isBlocked = drag?.id === station.id && blocked(station.id, placement);
            return (
              <g key={station.id} data-testid={`site-layout-2d-spots-${station.id}`}>
                <polygon
                  points={corners.map((c) => `${String(c.x)},${String(c.y)}`).join(' ')}
                  className={cn(
                    'fill-muted/70 stroke-primary/60',
                    isBlocked && 'fill-destructive/20 stroke-destructive',
                  )}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                {lines.map(([a, b], i) => (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className="stroke-primary/60"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                ))}
              </g>
            );
          })}
        </svg>
        {stations.map((station) => {
          const place = places.get(station.id);
          if (place == null) return null;
          const placement = drag?.id === station.id ? drag.placement : place.placement;
          const at = boardPoint(geometry, placement);
          const state = stationDisplayState(station);
          const stateLabel = t(stationStateLabelKey(state));
          return (
            <div
              key={station.id}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
              style={{ left: at.x, top: at.y }}
            >
              <button
                type="button"
                data-testid={`site-layout-2d-station-${station.id}`}
                className="flex touch-none cursor-grab items-center gap-1 whitespace-nowrap rounded-md border bg-card px-1.5 py-0.5 text-xs font-semibold shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ borderColor: stationStateColor(state) }}
                aria-label={t('sites.layoutView.stateDetailsLabel', {
                  id: station.stationId,
                  state: stateLabel,
                })}
                onKeyDown={(e) => {
                  onKeyDown(e, station.id);
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragStart.current = { x: e.clientX, y: e.clientY, placement: place.placement };
                }}
                onPointerMove={(e) => {
                  const start = dragStart.current;
                  if (start == null) return;
                  const dx = e.clientX - start.x;
                  const dy = e.clientY - start.y;
                  if (drag == null && Math.hypot(dx, dy) <= 4) return;
                  setDrag({
                    id: station.id,
                    placement: snapFreePlacement(
                      {
                        ...start.placement,
                        x: start.placement.x + dx / s,
                        z: start.placement.z + dy / s,
                      },
                      { freeRotation: true },
                    ),
                  });
                }}
                onPointerUp={() => {
                  const moved = drag;
                  dragStart.current = null;
                  setDrag(null);
                  if (moved != null && moved.id === station.id) commit(station.id, moved.placement);
                  else onOpenDetails(station.id);
                }}
                onClick={(e) => {
                  // Enter or Space (a pointer click opens the details on pointer up).
                  if (e.detail === 0) onOpenDetails(station.id);
                }}
                onPointerCancel={() => {
                  dragStart.current = null;
                  setDrag(null);
                }}
              >
                <StationStateIcon state={state} />
                {station.stationId}
              </button>
              {station.cellular && <CellularBadge />}
            </div>
          );
        })}
        {children}
      </div>
      {notice != null && (
        <p
          role="alert"
          data-testid="site-layout-2d-notice"
          className="sticky bottom-3 left-3 m-3 inline-block rounded-md border border-destructive/50 bg-card px-2.5 py-1.5 text-xs text-destructive shadow-sm"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
