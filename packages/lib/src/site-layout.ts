// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

// The site layout grid, shared by the API placement, the migration test, the
// 2D card view and the 3D view. Positions are pixels on the 2D board; slot
// (c, r) sits at x = 20 + 200 c, y = 20 + 140 r. The 3D view shows slot (c, r)
// as parking spot (c, r) of the paved lot, so both views read and write the
// same positions. The site type decides which spots exist (`layoutRowLengths`):
// the rows of a parking lot, the one row along the building of an office or
// retail site, the two curbs of a street, or the bus bays and truck lanes of a
// depot. Spot sizes are standard real dimensions (`STANDARD_DIMENSIONS`,
// `FREE_SPOT_DIMENSIONS`), not settings.

import type { VehicleBodyType } from './vehicle-appearance.js';
import { DEFAULT_VEHICLE_BODY_TYPE } from './vehicle-appearance.js';

/** Columns of the grid a new station is placed on. */
export const LAYOUT_COLUMNS = 5;
/** Horizontal distance between two slots, in px. */
export const LAYOUT_SPACING_X = 200;
/** Vertical distance between two slots, in px. */
export const LAYOUT_SPACING_Y = 140;
/** Board padding before the first slot, in px. */
export const LAYOUT_PADDING = 20;
/** Snap step of a 2D drag, in px. */
export const LAYOUT_SNAP = 20;
/** Footprint of a station card used for the overlap check, in px. */
export const LAYOUT_CARD_WIDTH = 160;
export const LAYOUT_CARD_HEIGHT = 120;

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutBay {
  col: number;
  row: number;
}

/** The px position of grid slot (col, row). */
export function bayToPosition(bay: LayoutBay): LayoutPoint {
  return {
    x: LAYOUT_PADDING + bay.col * LAYOUT_SPACING_X,
    y: LAYOUT_PADDING + bay.row * LAYOUT_SPACING_Y,
  };
}

/** The grid slot nearest a px position, never negative. */
export function positionToBay(point: LayoutPoint): LayoutBay {
  return {
    col: Math.max(0, Math.round((point.x - LAYOUT_PADDING) / LAYOUT_SPACING_X)),
    row: Math.max(0, Math.round((point.y - LAYOUT_PADDING) / LAYOUT_SPACING_Y)),
  };
}

/** Whether two card footprints at these positions overlap. */
export function cardsOverlap(a: LayoutPoint, b: LayoutPoint): boolean {
  return (
    a.x < b.x + LAYOUT_CARD_WIDTH &&
    b.x < a.x + LAYOUT_CARD_WIDTH &&
    a.y < b.y + LAYOUT_CARD_HEIGHT &&
    b.y < a.y + LAYOUT_CARD_HEIGHT
  );
}

/** The facing directions of the parking spots, in degrees. */
export const LAYOUT_FACINGS = [0, 90, 180, 270] as const;
export type LayoutFacing = (typeof LAYOUT_FACINGS)[number];

/**
 * Standard real dimensions the 3D view draws with (no settings). A
 * perpendicular spot of 2.6 by 5.5 m and a 7 m two-way drive aisle sit
 * between the common US (8.5 to 9 by 18 ft, 24 ft aisle) and European (2.5 by
 * 5 m, 6 to 6.5 m aisle) design values; a parallel spot along a curb is 2.4 by
 * 6 m, a street travel lane 3.5 m.
 */
export const STANDARD_DIMENSIONS = {
  spotWidthM: 2.6,
  spotDepthM: 5.5,
  laneWidthM: 7,
  parallelSpotLengthM: 6,
  parallelSpotWidthM: 2.4,
  travelLaneM: 3.5,
} as const;

/**
 * The paved parking lot of a parking lot site. Positions stay grid slots of
 * the 2D board: slot (c, r) is spot (c, r). Everything outside the lot is
 * grass.
 */
export interface SiteLayoutGrid {
  /** Spots in each row. */
  spotsPerRow: number;
  /** Number of rows. */
  rows: number;
  /** Direction the spots and chargers face, in degrees (0 is the default). */
  facingDeg: LayoutFacing;
}

/**
 * A pad-mounted transformer on the grass next to the lot. `x` and `z` are
 * meters in lot coordinates: spot (0, 0) has its front left corner at (0, 0),
 * columns run along x and rows along z.
 */
export interface LayoutTransformer {
  /** Stable id within the site (letters, digits, `-` and `_`). */
  id: string;
  name: string | null;
  /** Rated power in kVA. */
  ratedKva: number | null;
  x: number;
  z: number;
}

/**
 * What kind of site the layout shows: `parking_lot`, an outdoor hub (a paved
 * lot on grass, chargers at the curb of paired rows, transformers, batteries,
 * solar canopies and switchboards), `office_retail`, one row of spots in
 * front of a building (chargers on the facade or on a post at each spot),
 * `curbside`, a street with chargers on posts at the curb of one or both
 * sides, `depot`, a fenced fleet yard with nose-in bus bays and truck
 * pull-through lanes (`depotLayout`), or `custom`, grass with every station
 * placed and turned freely, each with its own car spots on a paved apron
 * (`FreePlacement`). Only a parking lot, a depot and a custom site show
 * transformers, energy assets and load management panels; the other types
 * keep them stored, hidden.
 */
export const SITE_TYPES = ['parking_lot', 'office_retail', 'curbside', 'depot', 'custom'] as const;
export type SiteType = (typeof SITE_TYPES)[number];
/** The site type of settings that name none (every site before it existed). */
export const DEFAULT_SITE_TYPE: SiteType = 'parking_lot';

/**
 * How the chargers of an office or retail site are mounted: `wall`, a wall
 * box on the facade with its cable across the sidewalk, or `stall`, a post at
 * the head of each spot with its cable straight to the car.
 */
export const CHARGER_MOUNTINGS = ['wall', 'stall'] as const;
export type ChargerMounting = (typeof CHARGER_MOUNTINGS)[number];
export const DEFAULT_CHARGER_MOUNTING: ChargerMounting = 'wall';

/**
 * The layout settings of a site (sites.layout_settings). Every site type's
 * fields are kept, so switching the type back restores its values: the
 * parking lot (`spotsPerRow`, `rows`, `facingDeg`, `transformers`,
 * `energyAssets`), the office or retail row (`chargers`, `mounting`), the
 * street (`chargersLeft`, `chargersRight`) and the depot (`busBays`,
 * `truckLanes`, and the parking lot's `facingDeg`). `siteType` is absent in settings
 * stored before it existed, which read as `parking_lot` (`siteTypeOf`); an
 * absent field of the site type gets its default from the station count
 * (`effectiveLayoutSettings`).
 */
export interface SiteLayoutSettings extends SiteLayoutGrid {
  siteType?: SiteType | undefined;
  /** Office or retail: charger positions, one spot each, in one row along the building. */
  chargers?: number | undefined;
  /** Office or retail: wall boxes on the facade or posts at the spots. */
  mounting?: ChargerMounting | undefined;
  /** Curbside: chargers along the left curb (row 0), seen driving along the street. */
  chargersLeft?: number | undefined;
  /** Curbside: chargers along the right curb (row 1). */
  chargersRight?: number | undefined;
  /** Depot: nose-in bus bays (row 0), one station each. */
  busBays?: number | undefined;
  /** Depot: truck pull-through lanes (row 1), one station each. */
  truckLanes?: number | undefined;
  transformers: LayoutTransformer[];
  /**
   * Batteries and solar canopies, informational only (nothing else models site
   * storage or solar). Absent in settings stored before it existed, which read
   * as none (`energyAssetsOf`).
   */
  energyAssets?: LayoutEnergyAsset[] | undefined;
}

/** The kinds of energy asset a layout shows. */
export const ENERGY_ASSET_TYPES = ['battery', 'solar'] as const;
export type EnergyAssetType = (typeof ENERGY_ASSET_TYPES)[number];

/**
 * A battery storage cabinet on the grass next to the lot, placed like a
 * transformer (`x`, `z` in lot meters, moved onto the grass by
 * `snapTransformerToGrass`). Shown on every site type.
 */
export interface LayoutBattery {
  /** Stable id within the site (letters, digits, `-` and `_`). */
  id: string;
  type: 'battery';
  name: string | null;
  /** Usable capacity in kWh. */
  capacityKwh: number | null;
  x: number;
  z: number;
}

/**
 * A solar carport canopy over one row of the lot (`row`, 0-based) on a
 * parking lot, or standing freely on a custom site (`x`, `z`, `rotationDeg`;
 * its size follows its peak power, `solarCanopySize`). Shown on a parking lot
 * and a custom site (`showsSolar`); the other types keep it hidden.
 */
export interface LayoutSolarCanopy {
  /** Stable id within the site (letters, digits, `-` and `_`). */
  id: string;
  type: 'solar';
  name: string | null;
  /** Peak power in kWp. */
  capacityKwp: number | null;
  row: number;
  /** Custom site: the middle of the canopy in meters (absent: over its row of the parking lot grid). */
  x?: number | undefined;
  z?: number | undefined;
  /** Custom site: the turn of the canopy in degrees, clockwise from above (0 to under 360). */
  rotationDeg?: number | undefined;
}

export type LayoutEnergyAsset = LayoutBattery | LayoutSolarCanopy;

/**
 * What decides the spots of a layout: the site type and its counts. A plain
 * parking lot grid is one (its type reads as parking_lot).
 */
export type LayoutShape = SiteLayoutGrid &
  Pick<
    SiteLayoutSettings,
    'siteType' | 'chargers' | 'chargersLeft' | 'chargersRight' | 'busBays' | 'truckLanes'
  >;

/** The energy assets of settings: as stored, else none. */
export function energyAssetsOf(settings: SiteLayoutSettings): LayoutEnergyAsset[] {
  return settings.energyAssets ?? [];
}

/** Whether the site has open ground for its equipment: a parking lot, a depot or a custom site. */
function hasOpenGround(settings: { siteType?: SiteType | undefined }): boolean {
  const type = siteTypeOf(settings);
  return type === 'parking_lot' || type === 'depot' || type === 'custom';
}

/** Whether the layout shows the solar canopies: on a parking lot, a depot and a custom site (they stay stored on the other types). */
export function showsSolar(settings: { siteType?: SiteType | undefined }): boolean {
  return hasOpenGround(settings);
}

/** Whether the layout shows the batteries: on a parking lot, a depot and a custom site (they stay stored on the other types). */
export function showsBatteries(settings: { siteType?: SiteType | undefined }): boolean {
  return hasOpenGround(settings);
}

/**
 * Whether the layout draws the load management panels and their links: on a
 * parking lot, a depot and a custom site. An office or retail site and a street keep
 * their panels behind walls or in cabinets out of view; the station popup
 * still shows the allocated limit.
 */
export function showsLoadPanels(settings: { siteType?: SiteType | undefined }): boolean {
  return hasOpenGround(settings);
}

/**
 * Whether the stations stand at free positions (`FreePlacement`, meters and a
 * turn) instead of grid spots: only on a custom site. The grid slots stay
 * stored, so switching to another type returns each station to its slot.
 */
export function usesFreePositions(settings: { siteType?: SiteType | undefined }): boolean {
  return siteTypeOf(settings) === 'custom';
}

/** The facing the 3D view turns the site by: a parking lot's or a depot's own, 0 on the other types. */
export function layoutFacingOf(
  settings: SiteLayoutGrid & { siteType?: SiteType | undefined },
): LayoutFacing {
  const type = siteTypeOf(settings);
  return type === 'parking_lot' || type === 'depot' ? settings.facingDeg : 0;
}

/**
 * Whether a site's stations stand in spots with their charger chosen by the
 * spot (a depot): bus bays and truck lanes, drawn with the large chargers.
 */
export function usesDepotSpots(settings: { siteType?: SiteType | undefined }): boolean {
  return siteTypeOf(settings) === 'depot';
}

/** The charger mounting of an office or retail site: as stored, else wall boxes. */
export function chargerMountingOf(settings: {
  mounting?: ChargerMounting | undefined;
}): ChargerMounting {
  return settings.mounting ?? DEFAULT_CHARGER_MOUNTING;
}

/**
 * The spots of each row of the layout, by site type: every row of a parking
 * lot has `spotsPerRow`; an office or retail site has one row of `chargers`;
 * a street has the left curb (row 0) and the right curb (row 1), either of
 * which may have none; a depot has its bus bays (row 0) and its truck lanes
 * (row 1), either of which may have none. Slot (c, r) is a spot when c < lengths[r]. A custom
 * site keeps the parking lot rows for the stored slots (its stations stand at
 * free positions), so switching back finds them.
 */
export function layoutRowLengths(settings: LayoutShape): number[] {
  switch (siteTypeOf(settings)) {
    case 'office_retail':
      return [settings.chargers ?? 1];
    case 'curbside':
      return [settings.chargersLeft ?? 1, settings.chargersRight ?? 0];
    case 'depot':
      return [settings.busBays ?? 1, settings.truckLanes ?? 0];
    default:
      return Array.from({ length: settings.rows }, () => settings.spotsPerRow);
  }
}

/** The site type of settings: as stored, else the default (`parking_lot`). */
export function siteTypeOf(settings: { siteType?: SiteType | undefined }): SiteType {
  return settings.siteType ?? DEFAULT_SITE_TYPE;
}

/**
 * Whether the layout shows the transformers: on a parking lot, a depot and a
 * custom site. An office or retail site and a street keep them in their settings,
 * hidden, so switching back shows them again.
 */
export function showsTransformers(settings: { siteType?: SiteType | undefined }): boolean {
  return hasOpenGround(settings);
}

/** The lot of a site that never set one: 20 spots, 10 in each of 2 rows. */
export const DEFAULT_LAYOUT_GRID: SiteLayoutGrid = {
  spotsPerRow: 10,
  rows: 2,
  facingDeg: 0,
};

/** Allowed ranges of the settings (inclusive). */
export const LAYOUT_GRID_LIMITS = {
  spotsPerRow: { min: 1, max: 100 },
  rows: { min: 1, max: 100 },
  /** Office or retail charger positions. */
  chargers: { min: 1, max: 100 },
  /** Curbside chargers on one side (0 allowed; both sides together at least 1). */
  chargersPerSide: { min: 0, max: 100 },
  /** Depot bus bays and truck lanes (0 allowed; both together at least 1). */
  depotSpots: { min: 0, max: 100 },
  transformers: { max: 10 },
  transformerNameLength: 60,
  ratedKva: { min: 1, max: 100000 },
  energyAssets: { max: 10 },
  energyAssetNameLength: 60,
  /** Battery kWh and solar kWp (integers). */
  capacity: { min: 1, max: 100000 },
  /** How far from the lot a transformer may stand, in meters. */
  transformerReachM: 200,
} as const;

/** Distance from the lot edge to a transformer's center, at least, in meters (pad and curb). */
export const TRANSFORMER_CLEARANCE_M = 2.5;

/**
 * The parking lot size in meters (standard spots): rows times the spot depth
 * plus a drive aisle between each two rows.
 */
export function lotExtentM(grid: SiteLayoutGrid): { width: number; depth: number } {
  const d = STANDARD_DIMENSIONS;
  return {
    width: grid.spotsPerRow * d.spotWidthM,
    depth: grid.rows * d.spotDepthM + (grid.rows - 1) * d.laneWidthM,
  };
}

/** Whether a slot is a spot of the layout (`layoutRowLengths`). */
export function bayInLayout(bay: LayoutBay, settings: LayoutShape): boolean {
  const lengths = layoutRowLengths(settings);
  return bay.row >= 0 && bay.col >= 0 && bay.col < (lengths[bay.row] ?? 0);
}

/** Spots of the layout; a custom site has no limit (every station brings its own spots). */
export function layoutCapacity(settings: LayoutShape): number {
  if (usesFreePositions(settings)) return Number.POSITIVE_INFINITY;
  return layoutRowLengths(settings).reduce((sum, n) => sum + n, 0);
}

/** Whether two lots are the same settings. */
export function sameLayoutGrid(a: SiteLayoutGrid, b: SiteLayoutGrid): boolean {
  return a.spotsPerRow === b.spotsPerRow && a.rows === b.rows && a.facingDeg === b.facingDeg;
}

function sameEnergyAsset(a: LayoutEnergyAsset, b: LayoutEnergyAsset | undefined): boolean {
  if (b == null || a.id !== b.id || a.name !== b.name) return false;
  if (a.type === 'battery') {
    return b.type === 'battery' && a.capacityKwh === b.capacityKwh && a.x === b.x && a.z === b.z;
  }
  return (
    b.type === 'solar' &&
    a.capacityKwp === b.capacityKwp &&
    a.row === b.row &&
    a.x === b.x &&
    a.z === b.z &&
    a.rotationDeg === b.rotationDeg
  );
}

/**
 * Whether two layout settings are the same (site type, lot, transformers and
 * energy assets, in order; absent energy assets equal none).
 */
export function sameLayoutSettings(a: SiteLayoutSettings, b: SiteLayoutSettings): boolean {
  const assetsA = energyAssetsOf(a);
  const assetsB = energyAssetsOf(b);
  return (
    siteTypeOf(a) === siteTypeOf(b) &&
    a.chargers === b.chargers &&
    a.mounting === b.mounting &&
    a.chargersLeft === b.chargersLeft &&
    a.chargersRight === b.chargersRight &&
    a.busBays === b.busBays &&
    a.truckLanes === b.truckLanes &&
    assetsA.length === assetsB.length &&
    assetsA.every((asset, i) => sameEnergyAsset(asset, assetsB[i])) &&
    sameLayoutGrid(a, b) &&
    a.transformers.length === b.transformers.length &&
    a.transformers.every((t, i) => {
      const o = b.transformers[i];
      return (
        o != null &&
        o.id === t.id &&
        o.name === t.name &&
        o.ratedKva === t.ratedKva &&
        o.x === t.x &&
        o.z === t.z
      );
    })
  );
}

/**
 * The paved ground equipment keeps clear of, in meters: the parking lot from
 * its front left corner, or the fenced yard of a depot (`depotLayout`).
 */
export function layoutEquipmentGround(settings: LayoutShape): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  if (usesDepotSpots(settings)) return depotLayout(settings).yard;
  const { width, depth } = lotExtentM(settings);
  return { minX: 0, maxX: width, minZ: 0, maxZ: depth };
}

/**
 * Where a transformer may stand: on the grass, at least TRANSFORMER_CLEARANCE_M
 * from the lot (a depot: its fenced yard), and within transformerReachM of
 * it. A point on the lot moves to the nearest lot side; positions round to
 * 10 cm.
 */
export function snapTransformerToGrass(
  x: number,
  z: number,
  grid: LayoutShape,
): { x: number; z: number } {
  const g = layoutEquipmentGround(grid);
  const c = TRANSFORMER_CLEARANCE_M;
  const reach = LAYOUT_GRID_LIMITS.transformerReachM;
  let px = Math.min(g.maxX + reach, Math.max(g.minX - reach, x));
  let pz = Math.min(g.maxZ + reach, Math.max(g.minZ - reach, z));
  if (px > g.minX - c && px < g.maxX + c && pz > g.minZ - c && pz < g.maxZ + c) {
    const toLeft = px - g.minX + c;
    const toRight = g.maxX + c - px;
    const toFront = pz - g.minZ + c;
    const toBack = g.maxZ + c - pz;
    const nearest = Math.min(toLeft, toRight, toFront, toBack);
    if (nearest === toRight) px = g.maxX + c;
    else if (nearest === toLeft) px = g.minX - c;
    else if (nearest === toBack) pz = g.maxZ + c;
    else pz = g.minZ - c;
  }
  const round = (v: number): number => Math.round(v * 10) / 10;
  return { x: round(px), z: round(pz) };
}

/** The transformer a site gets by default: one, on the grass right of the first row. */
export function defaultTransformer(grid: SiteLayoutGrid): LayoutTransformer {
  const spot = snapTransformerToGrass(
    lotExtentM(grid).width + TRANSFORMER_CLEARANCE_M + 1.5,
    Math.min(STANDARD_DIMENSIONS.spotDepthM / 2, lotExtentM(grid).depth / 2),
    grid,
  );
  return { id: 'tx-1', name: null, ratedKva: null, ...spot };
}

/**
 * An energy asset where the lot lets it stand: a battery on the grass (the
 * transformer rule), a solar canopy over a row of the lot (clamped into it).
 */
export function placeEnergyAsset(asset: LayoutEnergyAsset, grid: LayoutShape): LayoutEnergyAsset {
  // A custom site has no lot: a battery stands where it was put (within reach).
  if (asset.type === 'battery') {
    const spot = usesFreePositions(grid)
      ? clampFreePoint(asset.x, asset.z)
      : snapTransformerToGrass(asset.x, asset.z, grid);
    return { ...asset, ...spot };
  }
  return { ...asset, row: Math.min(grid.rows - 1, Math.max(0, Math.round(asset.row))) };
}

/**
 * The stations at a site, for the defaults of the site type's counts: all of
 * them, and for a depot how many charge buses and how many trucks
 * (`depotStationKind`). A plain number counts every station as a bus station.
 */
export interface LayoutStationCounts {
  total: number;
  bus: number;
  truck: number;
}

/** Station counts from a plain number (every station a bus station) or as given. */
export function layoutStationCounts(counts: number | LayoutStationCounts): LayoutStationCounts {
  return typeof counts === 'number' ? { total: counts, bus: counts, truck: 0 } : counts;
}

/**
 * Which depot spot a station takes by default, from its connector types: a
 * truck pull-through lane for a Megawatt Charging System connector (`MCS`,
 * `cMCS`, any case), else a bus bay (pantograph `OppCharge` and `Pan`, and
 * plain AC or DC plug-in chargers, which most bus and van depots use; a
 * truck charging over CCS takes a truck lane by moving it there).
 */
export function depotStationKind(connectorTypes: ReadonlyArray<string | null>): 'bus' | 'truck' {
  return connectorTypes.some((t) => t != null && /mcs/i.test(t)) ? 'truck' : 'bus';
}

/**
 * The fields of a site type filled in where absent, from the stations at the
 * site: an office or retail site gets one charger position per station (at
 * least 1) and wall boxes; a street splits the stations over both curbs (the
 * left one takes the odd one), at least 1 in all; a depot gets one bus bay per
 * bus station and one truck lane per truck station (one bus bay when it has
 * neither). Stored values stay as they are.
 */
function withTypeDefaults(
  settings: SiteLayoutSettings,
  stations: number | LayoutStationCounts,
): SiteLayoutSettings {
  const counts = layoutStationCounts(stations);
  const n = Math.max(1, Math.min(LAYOUT_GRID_LIMITS.chargers.max, Math.round(counts.total)));
  switch (siteTypeOf(settings)) {
    case 'depot': {
      const max = LAYOUT_GRID_LIMITS.depotSpots.max;
      const clamp = (v: number): number => Math.max(0, Math.min(max, Math.round(v)));
      let bus = settings.busBays;
      let truck = settings.truckLanes;
      if (bus == null && truck == null) {
        bus = clamp(counts.bus);
        truck = clamp(counts.truck);
        if (bus === 0 && truck === 0) bus = 1;
      } else if (bus == null) {
        bus = truck === 0 ? Math.max(1, clamp(counts.bus)) : clamp(counts.bus);
      } else if (truck == null) {
        truck = bus === 0 ? Math.max(1, clamp(counts.truck)) : clamp(counts.truck);
      }
      return { ...settings, busBays: bus, truckLanes: truck };
    }
    case 'office_retail':
      return {
        ...settings,
        chargers: settings.chargers ?? n,
        mounting: chargerMountingOf(settings),
      };
    case 'curbside': {
      const side = LAYOUT_GRID_LIMITS.chargersPerSide.max;
      let left = settings.chargersLeft;
      let right = settings.chargersRight;
      if (left == null && right == null) {
        left = Math.min(side, Math.ceil(n / 2));
        right = Math.min(side, n - left);
      } else if (left == null) {
        left = Math.min(side, Math.max(right === 0 ? 1 : 0, n - (right ?? 0)));
      } else if (right == null) {
        right = Math.min(side, Math.max(left === 0 ? 1 : 0, n - left));
      }
      return { ...settings, chargersLeft: left, chargersRight: right };
    }
    default:
      return settings;
  }
}

/** Copies the known fields only, so keys of earlier builds (the spot and lane sizes) drop out. */
function knownFields(stored: SiteLayoutSettings): SiteLayoutSettings {
  return {
    ...(stored.siteType != null ? { siteType: stored.siteType } : {}),
    spotsPerRow: stored.spotsPerRow,
    rows: stored.rows,
    facingDeg: stored.facingDeg,
    ...(stored.chargers != null ? { chargers: stored.chargers } : {}),
    ...(stored.mounting != null ? { mounting: stored.mounting } : {}),
    ...(stored.chargersLeft != null ? { chargersLeft: stored.chargersLeft } : {}),
    ...(stored.chargersRight != null ? { chargersRight: stored.chargersRight } : {}),
    ...(stored.busBays != null ? { busBays: stored.busBays } : {}),
    ...(stored.truckLanes != null ? { truckLanes: stored.truckLanes } : {}),
    transformers: stored.transformers,
    ...(stored.energyAssets != null ? { energyAssets: stored.energyAssets } : {}),
  };
}

/**
 * The layout settings the views and the placement use. Stored settings as
 * stored (the site type filled in, the fields of that type filled in from
 * `stationCount` where absent, transformers and batteries moved onto the
 * grass, solar canopies clamped into the lot's rows, energy assets filled in
 * as none when absent, unknown keys dropped); a site that never saved any gets
 * a parking lot: the default 10 by 2 lot, grown to hold the stations it
 * already has (`bays`), one transformer next to it and no energy assets.
 * `stationCount` is the stations at the site (`bays` counted when not given;
 * a depot reads the bus and truck stations of `LayoutStationCounts`).
 */
export function effectiveLayoutSettings(
  stored: SiteLayoutSettings | null | undefined,
  bays: Iterable<LayoutBay> = [],
  stationCount?: number | LayoutStationCounts,
): SiteLayoutSettings {
  const bayList = [...bays];
  const count = stationCount ?? bayList.length;
  if (stored != null) {
    // The type's counts first: a depot's yard, which equipment keeps clear of, follows them.
    const known = withTypeDefaults({ ...knownFields(stored), siteType: siteTypeOf(stored) }, count);
    const free = usesFreePositions(known);
    return {
      ...known,
      transformers: known.transformers.map((t) => ({
        ...t,
        ...(free ? clampFreePoint(t.x, t.z) : snapTransformerToGrass(t.x, t.z, known)),
      })),
      energyAssets: energyAssetsOf(known).map((a) => placeEnergyAsset(a, known)),
    };
  }
  let spotsPerRow = DEFAULT_LAYOUT_GRID.spotsPerRow;
  let rows = DEFAULT_LAYOUT_GRID.rows;
  for (const b of bayList) {
    spotsPerRow = Math.min(LAYOUT_GRID_LIMITS.spotsPerRow.max, Math.max(spotsPerRow, b.col + 1));
    rows = Math.min(LAYOUT_GRID_LIMITS.rows.max, Math.max(rows, b.row + 1));
  }
  const grid = { ...DEFAULT_LAYOUT_GRID, spotsPerRow, rows };
  return {
    siteType: DEFAULT_SITE_TYPE,
    ...grid,
    transformers: [defaultTransformer(grid)],
    energyAssets: [],
  };
}

/**
 * The settings with another site type: the type set and its fields filled in
 * from `stationCount` where absent; every other field kept, so switching back
 * restores it.
 */
export function withSiteType(
  settings: SiteLayoutSettings,
  siteType: SiteType,
  stationCount: number | LayoutStationCounts,
): SiteLayoutSettings {
  return withTypeDefaults({ ...settings, siteType }, stationCount);
}

/** The lot fields of the settings. */
export function layoutGridOf(settings: SiteLayoutGrid): SiteLayoutGrid {
  return {
    spotsPerRow: settings.spotsPerRow,
    rows: settings.rows,
    facingDeg: settings.facingDeg,
  };
}

/**
 * The first slot whose card overlaps none of `placed`: row by row through the
 * spots of the layout, then the rows below it (a station placed there stands
 * off the layout until it moves or the layout grows).
 */
export function firstFreeSlot(
  placed: readonly LayoutPoint[],
  settings: LayoutShape = DEFAULT_LAYOUT_GRID,
): LayoutPoint {
  const lengths = layoutRowLengths(settings);
  const beyond = Math.max(1, ...lengths);
  for (let row = 0; ; row++) {
    const cols = lengths[row] ?? beyond;
    for (let col = 0; col < cols; col++) {
      const slot = bayToPosition({ col, row });
      if (!placed.some((p) => cardsOverlap(p, slot))) return slot;
    }
  }
}

/**
 * Free slots for stations without a stored position, in the order given: each
 * takes the first slot free of `placed` and of the slots handed out before it.
 */
export function freeSlotsFor(
  count: number,
  placed: readonly LayoutPoint[],
  settings?: LayoutShape,
): LayoutPoint[] {
  const taken = [...placed];
  const out: LayoutPoint[] = [];
  for (let i = 0; i < count; i++) {
    const slot = firstFreeSlot(taken, settings);
    taken.push(slot);
    out.push(slot);
  }
  return out;
}

export interface GridFit<K> {
  /** Stations that move into the lot, with their new position. */
  moved: Map<K, LayoutPoint>;
  /** Stations outside the lot with no free spot left inside it. */
  unfit: K[];
}

/**
 * Fits stations into the layout: a station whose slot is a spot keeps its
 * position; any other moves to the nearest free spot (in the order given), or
 * is listed in `unfit` when no spot is free. Positions are the px positions
 * of the 2D board.
 */
export function fitPositionsToGrid<K>(
  stations: ReadonlyArray<{ key: K; position: LayoutPoint }>,
  settings: LayoutShape,
): GridFit<K> {
  const moved = new Map<K, LayoutPoint>();
  const unfit: K[] = [];
  // A custom site places its stations freely: the stored slots stay as they are.
  if (usesFreePositions(settings)) return { moved, unfit };
  const lengths = layoutRowLengths(settings);
  const bays = stations.map((s) => ({ key: s.key, bay: positionToBay(s.position) }));
  const occupied = bays.filter((b) => bayInLayout(b.bay, settings)).map((b) => b.bay);
  for (const { key, bay } of bays) {
    if (bayInLayout(bay, settings)) continue;
    const target = nearestFreeBay(bay, occupied, lengths);
    if (target == null) {
      unfit.push(key);
      continue;
    }
    occupied.push(target);
    moved.set(key, bayToPosition(target));
  }
  return { moved, unfit };
}

/** The 2D board area of the layout: the card of the last spot of the longest and of the last row ends inside it. */
export function gridBoardExtent(settings: LayoutShape): { width: number; height: number } {
  const lengths = layoutRowLengths(settings);
  const cols = Math.max(1, ...lengths);
  return {
    width: LAYOUT_PADDING + (cols - 1) * LAYOUT_SPACING_X + LAYOUT_CARD_WIDTH,
    height: LAYOUT_PADDING + (lengths.length - 1) * LAYOUT_SPACING_Y + LAYOUT_CARD_HEIGHT,
  };
}

export interface LayoutBounds {
  /** Board width in px (the card must end inside it). */
  width: number;
  /** Board height in px. */
  height: number;
}

function snap(value: number): number {
  return Math.round(value / LAYOUT_SNAP) * LAYOUT_SNAP;
}

/**
 * Where a 2D card dropped at `target` lands: snapped to the 20 px grid, inside
 * the board, and on no other card. When the snapped spot overlaps another card,
 * the nearest free grid point (by distance from the drop) wins; when the board
 * has no free point, the card stays at `fallback`.
 */
export function resolveCardDrop(
  target: LayoutPoint,
  others: readonly LayoutPoint[],
  bounds: LayoutBounds,
  fallback: LayoutPoint,
): LayoutPoint {
  const maxX = Math.max(
    0,
    Math.floor((bounds.width - LAYOUT_CARD_WIDTH) / LAYOUT_SNAP) * LAYOUT_SNAP,
  );
  const maxY = Math.max(
    0,
    Math.floor((bounds.height - LAYOUT_CARD_HEIGHT) / LAYOUT_SNAP) * LAYOUT_SNAP,
  );
  const clamp = (p: LayoutPoint): LayoutPoint => ({
    x: Math.min(maxX, Math.max(0, snap(p.x))),
    y: Math.min(maxY, Math.max(0, snap(p.y))),
  });
  const start = clamp(target);
  const free = (p: LayoutPoint): boolean => !others.some((o) => cardsOverlap(o, p));
  if (free(start)) return start;
  let best: LayoutPoint | null = null;
  let bestDistance = Infinity;
  for (let y = 0; y <= maxY; y += LAYOUT_SNAP) {
    for (let x = 0; x <= maxX; x += LAYOUT_SNAP) {
      const p = { x, y };
      const d = (x - start.x) ** 2 + (y - start.y) ** 2;
      if (d < bestDistance && free(p)) {
        best = p;
        bestDistance = d;
      }
    }
  }
  return best ?? fallback;
}

/**
 * The bay each station shows in, in the order given: its own bay when no
 * earlier station holds it, else the nearest free bay within `columns`.
 */
export function assignBays(positions: readonly LayoutPoint[], columns: number): LayoutBay[] {
  const taken = new Set<string>();
  const key = (b: LayoutBay): string => `${String(b.col)}:${String(b.row)}`;
  return positions.map((p) => {
    const own = positionToBay(p);
    const wanted = { col: Math.min(own.col, columns - 1), row: own.row };
    if (!taken.has(key(wanted))) {
      taken.add(key(wanted));
      return wanted;
    }
    for (let radius = 1; ; radius++) {
      let best: LayoutBay | null = null;
      let bestDistance = Infinity;
      for (let row = Math.max(0, wanted.row - radius); row <= wanted.row + radius; row++) {
        for (
          let col = Math.max(0, wanted.col - radius);
          col <= Math.min(columns - 1, wanted.col + radius);
          col++
        ) {
          const bay = { col, row };
          if (taken.has(key(bay))) continue;
          const d = (col - wanted.col) ** 2 + (row - wanted.row) ** 2;
          if (d < bestDistance) {
            best = bay;
            bestDistance = d;
          }
        }
      }
      if (best != null) {
        taken.add(key(best));
        return best;
      }
    }
  });
}

/**
 * The bay a 3D drop lands in: the bay under the pointer when it is a free
 * spot, else the nearest free spot of the layout (`rowLengths`, the spots of
 * each row). `occupied` holds the bays of the other stations. Returns null
 * when the layout has no free spot.
 */
export function nearestFreeBay(
  target: LayoutBay,
  occupied: readonly LayoutBay[],
  rowLengths: readonly number[],
): LayoutBay | null {
  const isTaken = (b: LayoutBay): boolean =>
    occupied.some((o) => o.col === b.col && o.row === b.row);
  const isSpot = (b: LayoutBay): boolean =>
    b.row >= 0 && b.col >= 0 && b.col < (rowLengths[b.row] ?? 0);
  if (isSpot(target) && !isTaken(target)) return target;
  let best: LayoutBay | null = null;
  let bestDistance = Infinity;
  for (let row = 0; row < rowLengths.length; row++) {
    for (let col = 0; col < (rowLengths[row] ?? 0); col++) {
      const bay = { col, row };
      if (isTaken(bay)) continue;
      const d = (col - target.col) ** 2 + (row - target.row) ** 2;
      if (d < bestDistance) {
        best = bay;
        bestDistance = d;
      }
    }
  }
  return best;
}

// Free positions (custom sites). A station stands at `x`, `z` meters in site
// coordinates (the lot coordinates of the other types: x along the rows, z
// across them), turned by `rotationDeg` clockwise from above. In its own
// frame the charger stands at the origin facing +z, and its spots lie in
// front of it: each 2.6 by 5.5 m, the charger `stationIntoSpotM` into the
// head of the spot; a station with two or more EVSEs has two spots side by
// side with the charger on the line between them. Stations never overlap
// (`freeFootprintsOverlap`); positions snap to `snapM`, turns to
// `rotationSnapDeg` (a free turn keeps one decimal).

/** A station's free position on a custom site. */
export interface FreePlacement {
  /** Meters along the site's x axis. */
  x: number;
  /** Meters along the site's z axis. */
  z: number;
  /** Turn in degrees, clockwise from above, 0 to under 360 (0: the spots lie toward +z). */
  rotationDeg: number;
  /**
   * The kind of spots the station stands at (absent: car spots). Never
   * stored: a custom site has car spots only, and a depot gives each slot its
   * kind (`depotSlotPlacement`).
   */
  spotType?: FreeSpotType | undefined;
}

/**
 * The kinds of spots a station stands at: standard car spots (every site type
 * but a depot), a bus bay (a depot's bus area: a bus drives in nose first) or
 * a truck pull-through lane (a depot's truck area: a tractor-trailer drives
 * through and never reverses).
 */
export const FREE_SPOT_TYPES = ['car', 'bus_bay', 'truck_pull_through'] as const;
export type FreeSpotType = (typeof FREE_SPOT_TYPES)[number];
export const DEFAULT_FREE_SPOT_TYPE: FreeSpotType = 'car';

export function isFreeSpotType(value: unknown): value is FreeSpotType {
  return typeof value === 'string' && (FREE_SPOT_TYPES as readonly string[]).includes(value);
}

/** The spot type of a free position (car when absent or unknown). */
export function freeSpotTypeOf(
  p: { spotType?: string | null | undefined } | null | undefined,
): FreeSpotType {
  return isFreeSpotType(p?.spotType) ? p.spotType : DEFAULT_FREE_SPOT_TYPE;
}

/**
 * Standard real dimensions of each spot type, in meters (no settings): the
 * width across the spot and its length along the vehicle. Car: the standard
 * spot. Bus bay: a straight depot bay for a 12 m city bus (2.55 m wide), 4.3 m
 * wide as transit garage guidelines lay out parked buses, 14 m long. Truck
 * pull-through: a drive-through lane 5 m wide (CharIN charging site
 * recommendations: 4.7 to 5.05 m, at least 19 m long, charger on the left of
 * the bay) and 25 m long for a tractor with a 53 ft trailer (about 22 to 23 m).
 */
export const FREE_SPOT_DIMENSIONS: Record<FreeSpotType, { widthM: number; lengthM: number }> = {
  car: { widthM: STANDARD_DIMENSIONS.spotWidthM, lengthM: STANDARD_DIMENSIONS.spotDepthM },
  bus_bay: { widthM: 4.3, lengthM: 14 },
  truck_pull_through: { widthM: 5, lengthM: 25 },
};

/**
 * The vehicle drawn on a spot whose session names no vehicle: a sedan on car
 * spots, a bus in a bus bay, a semi truck in a truck pull-through lane.
 */
export const FREE_SPOT_DEFAULT_BODY_TYPE: Record<FreeSpotType, VehicleBodyType> = {
  car: DEFAULT_VEHICLE_BODY_TYPE,
  bus_bay: 'bus',
  truck_pull_through: 'semi_truck',
};

/**
 * The vehicles a large spot holds: a 14 m bus bay a bus or a box truck (a
 * tractor-trailer is far longer), a 25 m truck lane a semi truck, a box truck
 * or a bus. A car never stands in either.
 */
const LARGE_SPOT_VEHICLES: Record<Exclude<FreeSpotType, 'car'>, readonly VehicleBodyType[]> = {
  bus_bay: ['bus', 'box_truck'],
  truck_pull_through: ['semi_truck', 'box_truck', 'bus'],
};

/**
 * The vehicle drawn in a spot: the session's own when it fits the spot, else
 * the spot's default (a bus in a bus bay, a semi truck in a truck lane, a
 * sedan in a car spot without a vehicle). Car spots draw any vehicle.
 */
export function spotVehicleBodyType(
  spotType: FreeSpotType,
  bodyType: VehicleBodyType | null | undefined,
): VehicleBodyType {
  if (bodyType == null) return FREE_SPOT_DEFAULT_BODY_TYPE[spotType];
  if (spotType === 'car') return bodyType;
  return LARGE_SPOT_VEHICLES[spotType].includes(bodyType)
    ? bodyType
    : FREE_SPOT_DEFAULT_BODY_TYPE[spotType];
}

export const FREE_LAYOUT = {
  /** Positions snap to this step, in meters. */
  snapM: 0.5,
  /** Turns snap to this step, in degrees (a free turn keeps one decimal). */
  rotationSnapDeg: 15,
  /** How far into the head of its spot the charger stands, in meters. */
  stationIntoSpotM: 0.9,
  /** The paved apron around a station and its spots, in meters. */
  apronM: 0.4,
  /** Spots a station has at most (one per EVSE). */
  maxSpots: 2,
  /** A free position stays within this distance of the site origin on each axis, in meters. */
  reachM: 400,
  /** The curbed island a truck dispenser stands on beside its pull-through lane, in meters. */
  truckIslandM: 2,
  /**
   * How far a truck pull-through lane runs ahead of its dispenser, in meters:
   * the truck's charge inlet sits behind its cab (2 to 4.8 m from the front,
   * CharIN MCS), so the cab stops just past the dispenser and the trailer
   * fills the lane behind it.
   */
  truckLaneAheadM: 5,
} as const;

/** The spots a station gets on a custom site: one per EVSE, 1 to 2. */
export function freeSpotCount(evseCount: number): number {
  return Math.max(1, Math.min(FREE_LAYOUT.maxSpots, Math.round(evseCount)));
}

/** An angle as degrees from 0 to under 360, one decimal. */
export function normalizeRotationDeg(deg: number): number {
  const d = Math.round((((deg % 360) + 360) % 360) * 10) / 10;
  return d >= 360 ? 0 : d + 0;
}

/** A point clamped within the free layout reach and rounded to 10 cm. */
export function clampFreePoint(x: number, z: number): { x: number; z: number } {
  const r = FREE_LAYOUT.reachM;
  const round = (v: number): number => Math.round(Math.min(r, Math.max(-r, v)) * 10) / 10 + 0;
  return { x: round(x), z: round(z) };
}

/**
 * A free position as stored: x and z snapped to `snapM` (within reach), the
 * turn snapped to `rotationSnapDeg` unless `freeRotation` (then one decimal).
 */
export function snapFreePlacement(
  p: FreePlacement,
  options: { freeRotation?: boolean } = {},
): FreePlacement {
  const r = FREE_LAYOUT.reachM;
  const step = FREE_LAYOUT.snapM;
  // `+ 0` turns -0 into 0.
  const snap = (v: number): number => Math.min(r, Math.max(-r, Math.round(v / step) * step)) + 0;
  const turn =
    options.freeRotation === true
      ? p.rotationDeg
      : Math.round(p.rotationDeg / FREE_LAYOUT.rotationSnapDeg) * FREE_LAYOUT.rotationSnapDeg;
  const out: FreePlacement = {
    x: snap(p.x),
    z: snap(p.z),
    rotationDeg: normalizeRotationDeg(turn),
  };
  if (p.spotType != null) out.spotType = p.spotType;
  return out;
}

/**
 * A point in a station's own frame (x across its spots, z into them) in site
 * coordinates. The same turn as the 3D view (three.js about y by
 * -rotationDeg): x' = x cos + z sin, z' = -x sin + z cos.
 */
export function freeToSite(p: FreePlacement, lx: number, lz: number): { x: number; z: number } {
  const a = (-p.rotationDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

/**
 * The spots of a station in its own frame: from `minX` to `maxX` across, and
 * the front (charger side) and back along z. Car spots and bus bays lie side
 * by side in front of the charger, which stands `stationIntoSpotM` into their
 * head (on the line between two). Truck pull-through lanes run along x past
 * the dispenser island, every lane the same way (+x): the first one in front
 * of the station's dispenser, a second one beyond the next island with its
 * own dispenser (a satellite of the same station), so each truck has its
 * dispenser on its left (`truckLaneAheadM` of each lane lies ahead of it).
 */
export function freeSpotsExtent(
  spots: number,
  spotType: FreeSpotType = DEFAULT_FREE_SPOT_TYPE,
): {
  minX: number;
  maxX: number;
  front: number;
  back: number;
} {
  const rects = freeSpotRects(spots, spotType);
  const island = spotType === 'truck_pull_through' ? FREE_LAYOUT.truckIslandM / 2 : 0;
  return {
    minX: Math.min(...rects.map((r) => r.minX)),
    maxX: Math.max(...rects.map((r) => r.maxX)),
    front: Math.min(-island, ...rects.map((r) => r.minZ)),
    back: Math.max(...rects.map((r) => r.maxZ)),
  };
}

/** One spot of a station in its own frame, with the way its vehicle faces. */
export interface FreeSpotRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /**
   * The direction the parked vehicle's nose points, in the station frame:
   * `-z` (nose to the charger: car spots and bus bays) or `+x` (a truck
   * driving through, its left side to its dispenser).
   */
  heading: '-z' | '+x';
  /** Where the dispenser of this spot stands, in the station frame (truck lanes: one per lane). */
  chargerX: number;
  chargerZ: number;
}

/** The spots of a station in its own frame, in EVSE order. */
export function freeSpotRects(
  spots: number,
  spotType: FreeSpotType = DEFAULT_FREE_SPOT_TYPE,
): FreeSpotRect[] {
  const n = freeSpotCount(spots);
  const dim = FREE_SPOT_DIMENSIONS[spotType];
  if (spotType === 'truck_pull_through') {
    const island = FREE_LAYOUT.truckIslandM;
    const ahead = FREE_LAYOUT.truckLaneAheadM;
    return Array.from({ length: n }, (_, i) => {
      const chargerZ = i * (dim.widthM + island);
      return {
        minX: ahead - dim.lengthM,
        maxX: ahead,
        minZ: chargerZ + island / 2,
        maxZ: chargerZ + island / 2 + dim.widthM,
        heading: '+x' as const,
        chargerX: 0,
        chargerZ,
      };
    });
  }
  const half = (n * dim.widthM) / 2;
  return Array.from({ length: n }, (_, i) => ({
    minX: -half + i * dim.widthM,
    maxX: -half + (i + 1) * dim.widthM,
    minZ: -FREE_LAYOUT.stationIntoSpotM,
    maxZ: dim.lengthM - FREE_LAYOUT.stationIntoSpotM,
    heading: '-z' as const,
    chargerX: 0,
    chargerZ: 0,
  }));
}

/**
 * The corners of a station's spots in site coordinates (front left, front
 * right, back right, back left), shrunk by `inset` meters on every side.
 */
export function freeFootprint(
  p: FreePlacement,
  spots: number,
  inset = 0,
): Array<{ x: number; z: number }> {
  const e = freeSpotsExtent(spots, freeSpotTypeOf(p));
  const l = e.minX + inset;
  const r = e.maxX - inset;
  const f = e.front + inset;
  const b = e.back - inset;
  return [freeToSite(p, l, f), freeToSite(p, r, f), freeToSite(p, r, b), freeToSite(p, l, b)];
}

/** Whether two convex polygons overlap (separating axis test; touching edges do not). */
function polygonsOverlap(
  a: ReadonlyArray<{ x: number; z: number }>,
  b: ReadonlyArray<{ x: number; z: number }>,
): boolean {
  const range = (
    poly: ReadonlyArray<{ x: number; z: number }>,
    nx: number,
    nz: number,
  ): [number, number] => {
    let min = Infinity;
    let max = -Infinity;
    for (const q of poly) {
      const v = q.x * nx + q.z * nz;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    return [min, max];
  };
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      if (p1 == null || p2 == null) continue;
      const nx = p2.z - p1.z;
      const nz = p1.x - p2.x;
      const [minA, maxA] = range(a, nx, nz);
      const [minB, maxB] = range(b, nx, nz);
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}

/** Whether the spots of two stations overlap (spots that only touch, side by side, do not). */
export function freeFootprintsOverlap(
  a: { placement: FreePlacement; spots: number },
  b: { placement: FreePlacement; spots: number },
): boolean {
  return polygonsOverlap(
    freeFootprint(a.placement, a.spots, 0.01),
    freeFootprint(b.placement, b.spots, 0.01),
  );
}

export interface FreeStation<K> {
  key: K;
  placement: FreePlacement;
  spots: number;
}

/** The keys of stations whose spots overlap another station's, in the order given. */
export function overlappingFreeStations<K>(stations: ReadonlyArray<FreeStation<K>>): K[] {
  const out: K[] = [];
  stations.forEach((s, i) => {
    if (stations.some((o, j) => j !== i && freeFootprintsOverlap(s, o))) out.push(s.key);
  });
  return out;
}

/**
 * The positions after moving every station whose spots overlap an earlier
 * station's: it slides along its own row (local x) in `snapM` steps,
 * alternately right and left, else back and forth along its spots (local z),
 * until it overlaps nothing. Stations that overlap nothing keep their
 * positions. Returns the moved stations only.
 */
export function resolveFreeOverlaps<K>(
  stations: ReadonlyArray<FreeStation<K>>,
): Map<K, FreePlacement> {
  const moved = new Map<K, FreePlacement>();
  const placed: Array<{ placement: FreePlacement; spots: number }> = [];
  const isFree = (p: FreePlacement, spots: number): boolean =>
    !placed.some((o) => freeFootprintsOverlap({ placement: p, spots }, o));
  for (const s of stations) {
    let target = s.placement;
    if (!isFree(target, s.spots)) {
      let found: FreePlacement | null = null;
      for (const axis of ['x', 'z'] as const) {
        for (let k = 1; k <= 400 && found == null; k++) {
          const d = Math.ceil(k / 2) * FREE_LAYOUT.snapM * (k % 2 === 1 ? 1 : -1);
          const shifted =
            axis === 'x' ? freeToSite(s.placement, d, 0) : freeToSite(s.placement, 0, d);
          // The shift is whole snap steps; the position keeps its own centimeters.
          const candidate = {
            ...s.placement,
            x: Math.round(shifted.x * 100) / 100 + 0,
            z: Math.round(shifted.z * 100) / 100 + 0,
          };
          if (isFree(candidate, s.spots)) found = candidate;
        }
        if (found != null) break;
      }
      if (found != null) {
        target = found;
        moved.set(s.key, found);
      }
    }
    placed.push({ placement: target, spots: s.spots });
  }
  return moved;
}

/** The box around the spots of the stations, in site coordinates (null without stations). */
export function freeStationsBox(
  stations: ReadonlyArray<{ placement: FreePlacement; spots: number }>,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (stations.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of stations) {
    for (const c of freeFootprint(s.placement, s.spots)) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minZ = Math.min(minZ, c.z);
      maxZ = Math.max(maxZ, c.z);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Where a new station of a custom site stands: at the origin on an empty
 * site, else unturned right of every placed station, its spots level with the
 * frontmost ones, moved right until it overlaps nothing. A new station counts
 * with two spots until its EVSEs are known.
 */
export function firstFreePlacement(
  placed: ReadonlyArray<{ placement: FreePlacement; spots: number }>,
  spots: number = FREE_LAYOUT.maxSpots,
): FreePlacement {
  const box = freeStationsBox(placed);
  if (box == null) return { x: 0, z: 0, rotationDeg: 0 };
  const e = freeSpotsExtent(spots);
  let candidate = snapFreePlacement({
    x: box.maxX - e.minX + 1,
    z: box.minZ - e.front,
    rotationDeg: 0,
  });
  for (let i = 0; i < 400; i++) {
    const c = candidate;
    if (!placed.some((o) => freeFootprintsOverlap({ placement: c, spots }, o))) break;
    candidate = { ...candidate, x: candidate.x + FREE_LAYOUT.snapM };
  }
  return candidate;
}

/**
 * Whether the chargers of a grid row stand at its back edge (the row is
 * turned): the rule of the 3D view for a parking lot (every odd row and an
 * odd last row) and a street (the right curb).
 */
function rowTurned(row: number, settings: LayoutShape): boolean {
  const type = siteTypeOf(settings);
  if (type === 'curbside') return row === 1;
  if (type === 'depot') return false;
  if (type !== 'parking_lot') return false;
  if (row <= 0 || row >= settings.rows) return false;
  return row % 2 === 1 || row === settings.rows - 1;
}

/**
 * Where a station on grid slot `bay` of a layout of another type stands as a
 * free position, so switching to Custom keeps it in place: a parking lot or
 * office or retail spot keeps its charger point and turn (a turned row faces
 * the other way); a curb post becomes a charger at the middle of its parallel
 * spot facing the street, the right curb turned; a depot bay or lane keeps
 * its charger point and turn, with car spots. Not snapped
 * (`resolveFreeOverlaps` then moves stations whose spots overlap).
 */
export function freePlacementFromSlot(bay: LayoutBay, settings: LayoutShape): FreePlacement {
  const d = STANDARD_DIMENSIONS;
  const into = FREE_LAYOUT.stationIntoSpotM;
  const cm = (v: number): number => Math.round(v * 100) / 100;
  if (usesDepotSpots(settings)) {
    const at = depotSlotPlacement(bay, settings);
    return { x: cm(at.x), z: cm(at.z), rotationDeg: at.rotationDeg };
  }
  if (siteTypeOf(settings) === 'curbside') {
    const x = d.parallelSpotLengthM * (bay.col + 0.5);
    const depth = 2 * d.spotDepthM + 2 * d.travelLaneM;
    if (bay.row === 0) return { x, z: into, rotationDeg: 0 };
    if (bay.row === 1) return { x, z: cm(depth - into), rotationDeg: 180 };
    return { x, z: cm(depth + 3 + (bay.row - 2) * (d.spotDepthM + 1)), rotationDeg: 0 };
  }
  const pitch = d.spotDepthM + d.laneWidthM;
  const turned = rowTurned(bay.row, settings);
  return {
    x: cm(d.spotWidthM * (bay.col + 0.5)),
    z: cm(pitch * bay.row + (turned ? d.spotDepthM - into : into)),
    rotationDeg: turned ? 180 : 0,
  };
}

/** A free-standing solar carport canopy: one spot deep plus overhang, its length from its peak power. */
export const SOLAR_CANOPY = {
  /** Peak power per square meter of canopy, in kWp (about 200 W per square meter of modules). */
  kwpPerM2: 0.2,
  depthM: 6,
  /** Length of a canopy without a peak power: four spots. */
  defaultLengthM: 4 * STANDARD_DIMENSIONS.spotWidthM,
  minLengthM: 2 * STANDARD_DIMENSIONS.spotWidthM,
  maxLengthM: 60,
} as const;

/** The length and depth of a free-standing solar canopy, in meters: its modules' area from its peak power, in whole spots. */
export function solarCanopySize(capacityKwp: number | null): { lengthM: number; depthM: number } {
  const c = SOLAR_CANOPY;
  if (capacityKwp == null) return { lengthM: c.defaultLengthM, depthM: c.depthM };
  const spot = STANDARD_DIMENSIONS.spotWidthM;
  const raw = capacityKwp / c.kwpPerM2 / c.depthM;
  const length = Math.min(c.maxLengthM, Math.max(c.minLengthM, Math.round(raw / spot) * spot));
  return { lengthM: Math.round(length * 10) / 10, depthM: c.depthM };
}

/**
 * Where a solar canopy stands on a custom site or a depot: its stored
 * position, else (custom) over the middle of its row of the parking lot grid,
 * or (depot) over staff parking on the grass behind the yard, unturned.
 */
export function freeSolarPlacement(asset: LayoutSolarCanopy, grid: LayoutShape): FreePlacement {
  if (asset.x != null && asset.z != null) {
    return { x: asset.x, z: asset.z, rotationDeg: normalizeRotationDeg(asset.rotationDeg ?? 0) };
  }
  if (usesDepotSpots(grid)) {
    const yard = depotLayout(grid).yard;
    return {
      x: Math.round((yard.minX + yard.maxX) / 2),
      z: Math.round(yard.minZ - SOLAR_CANOPY.depthM / 2 - 3),
      rotationDeg: 0,
    };
  }
  const d = STANDARD_DIMENSIONS;
  const row = Math.min(grid.rows - 1, Math.max(0, asset.row));
  return {
    x: lotExtentM(grid).width / 2,
    z: row * (d.spotDepthM + d.laneWidthM) + d.spotDepthM / 2,
    rotationDeg: 0,
  };
}

// Depot (siteType depot): a fenced fleet yard, in lot coordinates (meters, x
// to the right, z toward the front; the yard turns by the facing). The bus
// area is a row of `busBays` straight nose-in bays, 4.3 by 14 m, their heads
// at z = 0 along a strip where the pantograph poles and dispensers stand, the
// buses' tails at z = 14 on the yard's two-way drive lane (z 14 to 29). The
// truck area stands right of it past a curbed median: a one-way entry road
// from the drive lane, `truckLanes` pull-through lanes of 5 by 25 m stacked
// back from the drive lane, each with its dispenser island on the truck's
// left (the `freeSpotRects` of a truck station unturned), and a one-way exit
// road back to the drive lane, so a tractor-trailer never reverses. Grid slot
// (c, 0) is bus bay c, slot (c, 1) truck lane c, one station each.

/** A rectangle in meters. */
export interface LayoutRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Standard real dimensions of a depot yard, in meters (no settings). */
export const DEPOT_LAYOUT = {
  /** The strip behind the bus bay heads where the pantograph poles and dispensers stand. */
  busHeadM: 3,
  /**
   * The drive lane along the front of the bays and lanes: a 12 m bus turns
   * into a perpendicular bay from an aisle of about 15 m, and the lane
   * carries the yard's two-way traffic to the gate.
   */
  driveLaneM: 15,
  /** The one-way roads into and out of the truck lanes: room for a tractor-trailer's 90 degree turn. */
  truckRoadM: 15,
  /** The curbed median between the bus area and the truck entry road. */
  medianM: 2,
  /** Paved yard between the markings and the perimeter fence. */
  marginM: 2,
  /** The gate in the fence at the left end of the drive lane. */
  gateM: 12,
} as const;

/** The grid rows of a depot: bus bays (row 0) and truck lanes (row 1). */
export const DEPOT_ROWS = { bus: 0, truck: 1 } as const;

/** The geometry of a depot yard, in lot coordinates (before the facing). */
export interface DepotLayout {
  busBays: number;
  truckLanes: number;
  /** Each bus bay, in slot order (col 0 at the left). */
  bays: LayoutRect[];
  /** Each truck lane, in slot order (col 0 next to the drive lane). */
  lanes: LayoutRect[];
  /** The dispenser island of each truck lane, on the truck's left (toward -z). */
  islands: LayoutRect[];
  /** The strip behind the bus bay heads (poles and dispensers), null without bus bays. */
  busHead: LayoutRect | null;
  /** The drive lane along the front, from fence to fence. */
  driveLane: LayoutRect;
  /** The truck entry and exit roads, null without truck lanes. */
  entryRoad: LayoutRect | null;
  exitRoad: LayoutRect | null;
  /** The curbed median between the two areas, null unless the depot has both. */
  median: LayoutRect | null;
  /**
   * The fence line around the paved yard, corners in order: the front edge
   * straight, the back stepping down with each area's depth.
   */
  outline: Array<{ x: number; z: number }>;
  /** The gate: the opening of the fence at the left end of the drive lane (z from, to). */
  gate: { x: number; minZ: number; maxZ: number };
  /** The box around the yard. */
  yard: LayoutRect;
}

/** The bus bays and truck lanes of a depot (its settings, 1 bus bay and no truck lane where absent). */
function depotCounts(settings: LayoutShape): { bus: number; truck: number } {
  return { bus: settings.busBays ?? 1, truck: settings.truckLanes ?? 0 };
}

/** The yard of a depot: bays, lanes, islands, roads and the fence line (`DEPOT_LAYOUT`, `FREE_SPOT_DIMENSIONS`). */
export function depotLayout(settings: LayoutShape): DepotLayout {
  const d = DEPOT_LAYOUT;
  const bus = FREE_SPOT_DIMENSIONS.bus_bay;
  const truck = FREE_SPOT_DIMENSIONS.truck_pull_through;
  const island = FREE_LAYOUT.truckIslandM;
  const { bus: busBays, truck: truckLanes } = depotCounts(settings);
  // Centimeters, so sums of the dimensions stay exact.
  const cm = (v: number): number => Math.round(v * 100) / 100 + 0;
  const front = bus.lengthM;
  const busRight = cm(busBays * bus.widthM);
  const bays = Array.from({ length: busBays }, (_, i) => ({
    minX: cm(i * bus.widthM),
    maxX: cm((i + 1) * bus.widthM),
    minZ: 0,
    maxZ: front,
  }));
  const busHead = busBays > 0 ? { minX: 0, maxX: busRight, minZ: -d.busHeadM, maxZ: 0 } : null;
  const truckLeft = busBays > 0 ? cm(busRight + d.medianM) : 0;
  const pitch = truck.widthM + island;
  const lanesLeft = cm(truckLeft + d.truckRoadM);
  const lanesRight = cm(lanesLeft + truck.lengthM);
  const lanes = Array.from({ length: truckLanes }, (_, k) => ({
    minX: lanesLeft,
    maxX: lanesRight,
    minZ: front - truck.widthM - k * pitch,
    maxZ: front - k * pitch,
  }));
  const islands = lanes.map((l) => ({
    minX: lanesLeft,
    maxX: lanesRight,
    minZ: l.minZ - island,
    maxZ: l.minZ,
  }));
  const truckBack = front - truckLanes * pitch;
  const truckRight = cm(lanesRight + d.truckRoadM);
  const entryRoad =
    truckLanes > 0 ? { minX: truckLeft, maxX: lanesLeft, minZ: truckBack, maxZ: front } : null;
  const exitRoad =
    truckLanes > 0 ? { minX: lanesRight, maxX: truckRight, minZ: truckBack, maxZ: front } : null;
  const median =
    busBays > 0 && truckLanes > 0
      ? { minX: busRight, maxX: truckLeft, minZ: Math.max(-d.busHeadM, truckBack), maxZ: front }
      : null;
  const m = d.marginM;
  const minX = -m;
  const maxX = cm((truckLanes > 0 ? truckRight : busRight) + m);
  const frontZ = front + d.driveLaneM + m;
  const driveLane = { minX, maxX, minZ: front, maxZ: front + d.driveLaneM };
  const busBackZ = -d.busHeadM - m;
  const truckBackZ = truckBack - m;
  let outline: Array<{ x: number; z: number }>;
  if (busBays > 0 && truckLanes > 0 && busBackZ !== truckBackZ) {
    // The step sits in the median, between the areas.
    const step = cm((busRight + truckLeft) / 2);
    outline = [
      { x: minX, z: frontZ },
      { x: minX, z: busBackZ },
      { x: step, z: busBackZ },
      { x: step, z: truckBackZ },
      { x: maxX, z: truckBackZ },
      { x: maxX, z: frontZ },
    ];
  } else if (busBays > 0 && truckLanes > 0) {
    outline = [
      { x: minX, z: frontZ },
      { x: minX, z: busBackZ },
      { x: maxX, z: busBackZ },
      { x: maxX, z: frontZ },
    ];
  } else {
    const back = truckLanes > 0 ? truckBackZ : busBackZ;
    outline = [
      { x: minX, z: frontZ },
      { x: minX, z: back },
      { x: maxX, z: back },
      { x: maxX, z: frontZ },
    ];
  }
  const minZ = Math.min(...outline.map((p) => p.z));
  const gateMid = (driveLane.minZ + driveLane.maxZ) / 2;
  return {
    busBays,
    truckLanes,
    bays,
    lanes,
    islands,
    busHead,
    driveLane,
    entryRoad,
    exitRoad,
    median,
    outline,
    gate: { x: minX, minZ: gateMid - d.gateM / 2, maxZ: gateMid + d.gateM / 2 },
    yard: { minX, maxX, minZ, maxZ: frontZ },
  };
}

/**
 * Where the station of a depot slot stands: in a bus bay, the charger point
 * at the middle of the bay's head facing into it (the bus noses in toward
 * it); in a truck lane, the dispenser on the lane's island, the lane on its
 * +z side (`freeSpotRects`: the truck drives through in +x with the
 * dispenser on its left). A slot outside the layout stands on the grass
 * behind the yard, with car spots.
 */
export function depotSlotPlacement(bay: LayoutBay, settings: LayoutShape): FreePlacement {
  const layout = depotLayout(settings);
  if (bay.row === DEPOT_ROWS.bus) {
    const r = layout.bays[bay.col];
    if (r != null) {
      return {
        x: Math.round(((r.minX + r.maxX) / 2) * 100) / 100,
        z: r.minZ + FREE_LAYOUT.stationIntoSpotM,
        rotationDeg: 0,
        spotType: 'bus_bay',
      };
    }
  }
  if (bay.row === DEPOT_ROWS.truck) {
    const lane = layout.lanes[bay.col];
    if (lane != null) {
      return {
        x: lane.maxX - FREE_LAYOUT.truckLaneAheadM,
        z: lane.minZ - FREE_LAYOUT.truckIslandM / 2,
        rotationDeg: 0,
        spotType: 'truck_pull_through',
      };
    }
  }
  const d = STANDARD_DIMENSIONS;
  return {
    x: layout.yard.minX + d.spotWidthM * (Math.max(0, bay.col) + 0.5),
    z: layout.yard.minZ - 4 - d.spotDepthM - Math.max(0, bay.row) * (d.spotDepthM + 1),
    rotationDeg: 0,
  };
}

/**
 * The first free spot of a depot for a new station of this kind: a free bay
 * or lane of its own area (`depotStationKind`), else of the other area, else
 * the first free slot below the layout (`firstFreeSlot`).
 */
export function firstFreeDepotSlot(
  placed: readonly LayoutPoint[],
  settings: LayoutShape,
  kind: 'bus' | 'truck',
): LayoutPoint {
  const lengths = layoutRowLengths(settings);
  for (const row of [DEPOT_ROWS[kind], 1 - DEPOT_ROWS[kind]]) {
    for (let col = 0; col < (lengths[row] ?? 0); col++) {
      const slot = bayToPosition({ col, row });
      if (!placed.some((p) => cardsOverlap(p, slot))) return slot;
    }
  }
  return firstFreeSlot(placed, settings);
}

/**
 * Sorts the stations of a site that turns into a depot into its areas: a
 * station already in a spot of its own kind (`depotStationKind`) keeps it;
 * any other takes the free spot of its own area nearest its slot, else of the
 * other area, else is listed in `unfit` and keeps its position (off the
 * layout). Bus stations land in bus bays and truck stations in truck lanes.
 */
export function fitDepotPositions<K>(
  stations: ReadonlyArray<{ key: K; position: LayoutPoint; kind: 'bus' | 'truck' }>,
  settings: LayoutShape,
): GridFit<K> {
  const lengths = layoutRowLengths(settings);
  const moved = new Map<K, LayoutPoint>();
  const unfit: K[] = [];
  const occupied: LayoutBay[] = [];
  const rest: Array<{ key: K; bay: LayoutBay; kind: 'bus' | 'truck' }> = [];
  for (const s of stations) {
    const bay = positionToBay(s.position);
    const own = DEPOT_ROWS[s.kind];
    const taken = occupied.some((o) => o.col === bay.col && o.row === bay.row);
    if (bay.row === own && bay.col < (lengths[own] ?? 0) && !taken) occupied.push(bay);
    else rest.push({ key: s.key, bay, kind: s.kind });
  }
  for (const s of rest) {
    const own = DEPOT_ROWS[s.kind];
    const ownOnly = lengths.map((n, r) => (r === own ? n : 0));
    const target =
      nearestFreeBay({ col: s.bay.col, row: own }, occupied, ownOnly) ??
      nearestFreeBay({ col: s.bay.col, row: 1 - own }, occupied, lengths);
    if (target == null) {
      unfit.push(s.key);
      continue;
    }
    occupied.push(target);
    if (target.col !== s.bay.col || target.row !== s.bay.row) {
      moved.set(s.key, bayToPosition(target));
    }
  }
  return { moved, unfit };
}
