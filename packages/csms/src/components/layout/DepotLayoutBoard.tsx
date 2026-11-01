// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

// The 2D view of a depot from above, in meters as the 3D view draws it
// (@evtivity/lib/site-layout `depotLayout`): the fenced yard with its gate,
// the bus bays along the head strip, the truck pull-through lanes with their
// dispenser islands and arrows the way trucks drive, the one-way entry and
// exit roads and the two-way drive lane. Each station shows as a chip at its
// charger in its slot's bay or lane; the chip opens the station popup, and
// drags (or, focused, moves with the arrow keys) to another free bay or lane.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  assignBays,
  bayToPosition,
  depotLayout,
  layoutRowLengths,
  nearestFreeBay,
  positionToBay,
  type LayoutBay,
  type LayoutPoint,
  type LayoutRect,
  type SiteLayoutSettings,
} from '@evtivity/lib/site-layout';
import {
  stationDisplayState,
  stationStateColor,
  stationStateLabelKey,
} from '@/lib/station-display-state';
import { cn } from '@/lib/utils';
import { CellularBadge, StationStateIcon } from './StationStateIcon';
import type { LayoutStation } from './StationCard';
import { depotStationPlacement, lotOf, spotRect, worldToBay, type Lot } from './site-layout-grid';

/** Pixels per meter of the 2D depot board (a depot of 6 bus bays and 3 truck lanes fits a laptop). */
export const DEPOT_BOARD_PX_PER_M = 11;
/** Grass around the yard, in meters. */
const BOARD_MARGIN_M = 4;

export interface DepotBoardGeometry {
  /** The site point at the board's top left corner, in meters. */
  originX: number;
  originZ: number;
  width: number;
  height: number;
}

/** The board around the depot yard, with a margin, at DEPOT_BOARD_PX_PER_M. */
export function depotBoardGeometry(settings: SiteLayoutSettings): DepotBoardGeometry {
  const yard = depotLayout(settings).yard;
  const s = DEPOT_BOARD_PX_PER_M;
  return {
    originX: yard.minX - BOARD_MARGIN_M,
    originZ: yard.minZ - BOARD_MARGIN_M,
    width: Math.ceil((yard.maxX - yard.minX + 2 * BOARD_MARGIN_M) * s),
    height: Math.ceil((yard.maxZ - yard.minZ + 2 * BOARD_MARGIN_M) * s),
  };
}

/** A site point on the board, in px. */
export function depotBoardPoint(
  g: DepotBoardGeometry,
  p: { x: number; z: number },
): { x: number; y: number } {
  const s = DEPOT_BOARD_PX_PER_M;
  return { x: (p.x - g.originX) * s, y: (p.z - g.originZ) * s };
}

/** The bay or lane each station shows in: its own slot, else the nearest one no earlier station holds. */
export function depotStationBays(
  stations: ReadonlyArray<Pick<LayoutStation, 'id' | 'positionX' | 'positionY'>>,
  settings: SiteLayoutSettings,
): Map<string, LayoutBay> {
  const cols = Math.max(
    ...layoutRowLengths(settings),
    ...stations.map((s) => positionToBay({ x: s.positionX, y: s.positionY }).col + 1),
  );
  const assigned = assignBays(
    stations.map((s) => ({ x: s.positionX, y: s.positionY })),
    cols,
  );
  const bays = new Map<string, LayoutBay>();
  stations.forEach((s, i) => {
    const bay = assigned[i];
    if (bay != null) bays.set(s.id, bay);
  });
  return bays;
}

/**
 * Where the chip of a station stands, in site meters: at the dispenser of a
 * truck lane; in a bus bay, inside the bay, every other bay a little further
 * in, so the chips of neighboring bays (4.3 m apart) never cover each other.
 */
function chipSitePoint(bay: LayoutBay, lot: Lot): { x: number; z: number } {
  const p = depotStationPlacement(bay, lot);
  if (p.spotType !== 'bus_bay') return { x: p.x, z: p.z };
  return { x: p.x, z: 3 + (bay.col % 2) * 5 };
}

/** Where the chip of a station stands on the board, in px. */
export function depotChipPoint(
  settings: SiteLayoutSettings,
  bay: LayoutBay,
): { x: number; y: number } {
  return depotBoardPoint(depotBoardGeometry(settings), chipSitePoint(bay, lotOf(settings)));
}

interface DepotLayoutBoardProps {
  stations: readonly LayoutStation[];
  settings: SiteLayoutSettings;
  /** The board element (the popup places itself inside it). */
  boardRef: React.RefObject<HTMLDivElement | null>;
  /** Stations drag to other bays and lanes (sites:write, not while replaying). */
  editable: boolean;
  /** A station moved to another slot: its new grid position. */
  onMove: (stationId: string, x: number, y: number) => void;
  onOpenDetails: (stationId: string) => void;
  children?: React.ReactNode;
}

const arrowPoints = (
  at: (x: number, z: number) => { x: number; y: number },
  x: number,
  z: number,
  dx: number,
  dz: number,
): string => {
  // A 3 m arrow along (dx, dz) at (x, z), as the 3D lane arrows.
  const nx = -dz;
  const nz = dx;
  const p = (u: number, v: number) => at(x + dx * u + nx * v, z + dz * u + nz * v);
  return [p(-1.5, 0), p(0.5, 0), p(0.5, -0.6), p(1.5, 0), p(0.5, 0.6), p(0.5, 0)]
    .map((c) => `${String(c.x)},${String(c.y)}`)
    .join(' ');
};

export function DepotLayoutBoard({
  stations,
  settings,
  boardRef,
  editable,
  onMove,
  onOpenDetails,
  children,
}: DepotLayoutBoardProps): React.JSX.Element {
  const { t } = useTranslation();
  const lot: Lot = useMemo(() => lotOf(settings), [settings]);
  const depot = useMemo(() => depotLayout(settings), [settings]);
  const geometry = useMemo(() => depotBoardGeometry(settings), [settings]);
  const bays = useMemo(() => depotStationBays(stations, settings), [stations, settings]);
  const [drag, setDrag] = useState<{ id: string; at: { x: number; y: number } } | null>(null);
  const dragStart = useRef<{ x: number; y: number; at: { x: number; y: number } } | null>(null);
  const s = DEPOT_BOARD_PX_PER_M;
  const at = (x: number, z: number) => depotBoardPoint(geometry, { x, z });
  const rect = (r: LayoutRect) => {
    const a = at(r.minX, r.minZ);
    return { x: a.x, y: a.y, width: (r.maxX - r.minX) * s, height: (r.maxZ - r.minZ) * s };
  };
  // A depot wider than the board (a phone) opens at its left end, the gate and
  // the bus bays, its depth centered.
  const centered = useRef(false);
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (board == null || centered.current) return;
    centered.current = true;
    board.scrollLeft = 0;
    board.scrollTop = Math.max(0, (geometry.height - board.clientHeight) / 2);
  });

  // The free bay or lane a station lands in (null: none, or its own); `rowOnly`
  // keeps it in the target's row (the bus bays or the truck lanes).
  function dropTarget(id: string, target: LayoutBay | null, rowOnly = false): LayoutBay | null {
    if (target == null) return null;
    const others = [...bays].filter(([other]) => other !== id).map(([, b]) => b);
    const lengths = layoutRowLengths(settings).map((n, row) =>
      rowOnly && row !== target.row ? 0 : n,
    );
    const free = nearestFreeBay(target, others, lengths);
    const own = bays.get(id);
    if (free == null || (own != null && own.col === free.col && own.row === free.row)) return null;
    return free;
  }

  function commit(id: string, target: LayoutBay | null, rowOnly = false): void {
    const free = dropTarget(id, target, rowOnly);
    if (free == null) return;
    const p: LayoutPoint = bayToPosition(free);
    onMove(id, p.x, p.y);
  }

  function boardToBay(p: { x: number; y: number }): LayoutBay | null {
    return worldToBay(p.x / s + geometry.originX, p.y / s + geometry.originZ, lot);
  }

  function onKeyDown(e: React.KeyboardEvent, id: string): void {
    if (!editable) return;
    const own = bays.get(id);
    if (own == null) return;
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = step[e.key];
    if (delta == null) return;
    e.preventDefault();
    // Left and right: the next free spot of the row; up and down: the bus bays or the truck lanes.
    commit(
      id,
      {
        col: Math.max(0, own.col + delta[0]),
        row: Math.min(1, Math.max(0, own.row + delta[1])),
      },
      true,
    );
  }

  const hovered = drag != null ? dropTarget(drag.id, boardToBay(drag.at)) : null;
  const hoveredRect = hovered != null ? rect(spotRect(hovered, lot)) : null;
  const yardPoints = depot.outline
    .map((p) => at(p.x, p.z))
    .map((c) => `${String(c.x)},${String(c.y)}`)
    .join(' ');
  const gateTop = at(depot.gate.x, depot.gate.minZ);
  const gateBottom = at(depot.gate.x, depot.gate.maxZ);

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
          data-testid="site-layout-2d-depot"
        >
          <polygon
            points={yardPoints}
            className="fill-muted/60 stroke-muted-foreground/60"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
          {/* The gate: an opening in the fence at the left end of the drive lane. */}
          <line
            x1={gateTop.x}
            y1={gateTop.y}
            x2={gateBottom.x}
            y2={gateBottom.y}
            className="stroke-card"
            strokeWidth={4}
            data-testid="site-layout-2d-depot-gate"
          />
          {depot.busHead != null && (
            <rect {...rect(depot.busHead)} className="fill-muted-foreground/20" />
          )}
          {depot.median != null && <rect {...rect(depot.median)} className="fill-success/25" />}
          {depot.bays.map((b, i) => (
            <rect
              key={`bay-${String(i)}`}
              {...rect(b)}
              className="fill-transparent stroke-primary/60"
              strokeWidth={1.5}
              data-testid={`site-layout-2d-bus-bay-${String(i)}`}
            />
          ))}
          {depot.lanes.map((l, i) => (
            <g key={`lane-${String(i)}`} data-testid={`site-layout-2d-truck-lane-${String(i)}`}>
              <rect {...rect(l)} className="fill-transparent stroke-primary/60" strokeWidth={1.5} />
              {[l.minX + 3.5, l.maxX - 2.2].map((x) => (
                <polyline
                  key={x}
                  points={arrowPoints(at, x, (l.minZ + l.maxZ) / 2, 1, 0)}
                  className="fill-none stroke-primary/70"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          ))}
          {depot.islands.map((r, i) => (
            <rect
              key={`island-${String(i)}`}
              {...rect({ ...r, minX: r.minX + 1, maxX: r.maxX - 1 })}
              className="fill-muted-foreground/30"
            />
          ))}
          {depot.entryRoad != null && (
            <polyline
              points={arrowPoints(
                at,
                (depot.entryRoad.minX + depot.entryRoad.maxX) / 2,
                (depot.entryRoad.minZ + depot.entryRoad.maxZ) / 2,
                0,
                -1,
              )}
              className="fill-none stroke-primary/70"
              strokeWidth={1.5}
            />
          )}
          {depot.exitRoad != null && (
            <polyline
              points={arrowPoints(
                at,
                (depot.exitRoad.minX + depot.exitRoad.maxX) / 2,
                (depot.exitRoad.minZ + depot.exitRoad.maxZ) / 2,
                0,
                1,
              )}
              className="fill-none stroke-primary/70"
              strokeWidth={1.5}
            />
          )}
          {(() => {
            const lane = depot.driveLane;
            const z = (lane.minZ + lane.maxZ) / 2;
            const a = at(lane.minX + 3, z);
            const b = at(lane.maxX - 3, z);
            return (
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="stroke-muted-foreground/60"
                strokeWidth={1.5}
                strokeDasharray="12 12"
              />
            );
          })()}
          {hoveredRect != null && (
            <rect
              {...hoveredRect}
              className="fill-primary/20 stroke-primary"
              strokeWidth={2}
              data-testid="site-layout-2d-depot-target"
            />
          )}
        </svg>
        {stations.map((station) => {
          const bay = bays.get(station.id);
          if (bay == null) return null;
          const point =
            drag?.id === station.id ? drag.at : depotBoardPoint(geometry, chipSitePoint(bay, lot));
          const state = stationDisplayState(station);
          const stateLabel = t(stationStateLabelKey(state));
          return (
            <div
              key={station.id}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
              style={{ left: point.x, top: point.y }}
            >
              <button
                type="button"
                data-testid={`site-layout-2d-station-${station.id}`}
                className={cn(
                  'flex touch-none items-center gap-1 whitespace-nowrap rounded-md border bg-card px-1.5 py-0.5 text-xs font-semibold shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  editable ? 'cursor-grab' : 'cursor-pointer',
                )}
                style={{ borderColor: stationStateColor(state) }}
                aria-label={t('sites.layoutView.stateDetailsLabel', {
                  id: station.stationId,
                  state: stateLabel,
                })}
                onKeyDown={(e) => {
                  onKeyDown(e, station.id);
                }}
                onPointerDown={(e) => {
                  if (!editable) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragStart.current = { x: e.clientX, y: e.clientY, at: point };
                }}
                onPointerMove={(e) => {
                  const start = dragStart.current;
                  if (start == null) return;
                  const dx = e.clientX - start.x;
                  const dy = e.clientY - start.y;
                  if (drag == null && Math.hypot(dx, dy) <= 4) return;
                  setDrag({ id: station.id, at: { x: start.at.x + dx, y: start.at.y + dy } });
                }}
                onPointerUp={() => {
                  const moved = drag;
                  const started = dragStart.current != null;
                  dragStart.current = null;
                  setDrag(null);
                  if (moved != null && moved.id === station.id) {
                    commit(station.id, boardToBay(moved.at));
                  } else if (started) {
                    onOpenDetails(station.id);
                  }
                }}
                onClick={(e) => {
                  // Enter or Space; a pointer click opens the details on pointer up
                  // (or here, on a board that does not drag).
                  if (e.detail === 0 || !editable) onOpenDetails(station.id);
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
    </div>
  );
}
