// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAYOUT_GRID,
  bayToPosition,
  effectiveLayoutSettings,
  positionToBay,
  type SiteLayoutSettings,
} from '@evtivity/lib/site-layout';
import {
  BAY_STATION_Z,
  CAMERA_FOV,
  CURB_M,
  CURB_POST_BACK_M,
  CURB_POST_IN_M,
  FACADE_Z,
  SIDEWALK_M,
  buildingBox,
  buildingFramePoints,
  beaconLevel,
  LABEL_CULL_FROM,
  stationLabelInRange,
  chargingGlowLevel,
  wallBoxOffset,
  wallMounted,
  MAX_DISTANCE_MIN,
  MAX_POLAR_ANGLE,
  FRONT_MAX_POLAR_ANGLE,
  FRONT_TARGET_Y,
  OVERVIEW_CAMERA_OFFSET,
  MIN_DISTANCE,
  STATION_BACK_OFFSET,
  bayToWorld,
  bayTurn,
  chargersAtBack,
  clampTarget,
  depotStationPlacement,
  clampToLot,
  fitFrame,
  fogRange,
  frontCamera,
  groundBox,
  isSpot,
  layoutGroundBox,
  logoFit,
  lotOf,
  maxZoomDistance,
  panBox,
  rotateBox,
  sceneBox,
  spotRect,
  stationBackPoint,
  stationProp,
  worldToBay,
} from '../site-layout-grid';

const lot = lotOf(DEFAULT_LAYOUT_GRID);
const office = lotOf({ ...DEFAULT_LAYOUT_GRID, siteType: 'office_retail', chargers: 6 });
const officeStall = lotOf({
  ...DEFAULT_LAYOUT_GRID,
  siteType: 'office_retail',
  chargers: 6,
  mounting: 'stall',
});
const street = lotOf({
  ...DEFAULT_LAYOUT_GRID,
  siteType: 'curbside',
  chargersLeft: 4,
  chargersRight: 6,
});

describe('site layout 3D lot', () => {
  it('takes the default lot of 2 rows of 10 standard spots with a two-way aisle between the rows', () => {
    expect(lot).toMatchObject({ cols: 10, rows: 2, spotW: 2.6, spotD: 5.5, lane: 7, pitch: 12.5 });
    expect(lot.rowLengths).toEqual([10, 10]);
    expect(lot.width).toBeCloseTo(26);
    expect(lot.depth).toBeCloseTo(18);
    expect(lot.facing).toBe(-0);
  });

  it('maps every spot to the lot and back, and to the same stored 2D position', () => {
    for (const bay of [
      { col: 0, row: 0 },
      { col: 4, row: 1 },
      { col: 9, row: 1 },
    ]) {
      const p = bayToWorld(bay, lot);
      expect(worldToBay(p.x, p.z, lot)).toEqual(bay);
      // Anywhere in the spot, from its front edge to its back edge.
      const z0 = lot.pitch * bay.row;
      expect(worldToBay(p.x + lot.spotW * 0.45, z0 + 0.05, lot)).toEqual(bay);
      expect(worldToBay(p.x - lot.spotW * 0.45, z0 + lot.spotD - 0.05, lot)).toEqual(bay);
      expect(positionToBay(bayToPosition(bay))).toEqual(bay);
      expect(spotRect(bay, lot)).toEqual({
        minX: lot.spotW * bay.col,
        maxX: lot.spotW * bay.col + lot.spotW,
        minZ: z0,
        maxZ: z0 + lot.spotD,
      });
    }
  });

  it('spaces the rows by the standard spot depth plus the aisle', () => {
    expect(bayToWorld({ col: 2, row: 0 }, lot)).toEqual({ x: 6.5, z: BAY_STATION_Z });
    // Row 1 is turned: its chargers stand at its back edge, 12.5 + 5.5 m.
    expect(bayToWorld({ col: 2, row: 1 }, lot).z).toBeCloseTo(18 - BAY_STATION_Z);
  });

  it('puts the chargers of both rows of the default lot at the outer edges, bays opening onto the lane', () => {
    const row0 = bayToWorld({ col: 3, row: 0 }, lot);
    const row1 = bayToWorld({ col: 3, row: 1 }, lot);
    expect(row0.z).toBeCloseTo(BAY_STATION_Z);
    expect(row1.z).toBeCloseTo(lot.depth - BAY_STATION_Z);
    expect(bayTurn({ col: 3, row: 0 }, lot)).toBe(0);
    expect(bayTurn({ col: 3, row: 1 }, lot)).toBeCloseTo(Math.PI);
    const laneMid = lot.spotD + lot.lane / 2;
    expect(Math.sign(laneMid - row0.z)).toBe(Math.cos(bayTurn({ col: 3, row: 0 }, lot)));
    expect(Math.sign(laneMid - row1.z)).toBeCloseTo(Math.cos(bayTurn({ col: 3, row: 1 }, lot)));
  });

  it('pairs rows around the lanes in a lot of more than two rows', () => {
    const rows = (n: number) => lotOf({ ...DEFAULT_LAYOUT_GRID, rows: n });
    const turned = (n: number) => Array.from({ length: n }, (_, r) => chargersAtBack(r, rows(n)));
    expect(turned(1)).toEqual([false]);
    expect(turned(2)).toEqual([false, true]);
    // An odd last row opens onto the lane before it: chargers at the back edge of the lot.
    expect(turned(3)).toEqual([false, true, true]);
    expect(turned(4)).toEqual([false, true, false, true]);
    expect(turned(5)).toEqual([false, true, false, true, true]);
    // A station on the grass below the lot keeps the unturned model.
    expect(chargersAtBack(3, rows(3))).toBe(false);
    const three = rows(3);
    expect(bayToWorld({ col: 0, row: 0 }, three).z).toBeCloseTo(BAY_STATION_Z);
    expect(bayToWorld({ col: 0, row: 2 }, three).z).toBeCloseTo(three.depth - BAY_STATION_Z);
    for (const row of [0, 1, 2]) {
      const p = bayToWorld({ col: 5, row }, three);
      expect(worldToBay(p.x, p.z, three)).toEqual({ col: 5, row });
    }
  });

  it('keeps the row arrangement under every facing (the facing turns the whole lot)', () => {
    for (const facingDeg of [0, 90, 180, 270] as const) {
      const turned = lotOf({ ...DEFAULT_LAYOUT_GRID, facingDeg });
      expect(bayToWorld({ col: 1, row: 1 }, turned)).toEqual(bayToWorld({ col: 1, row: 1 }, lot));
      expect(bayTurn({ col: 1, row: 1 }, turned)).toBeCloseTo(Math.PI);
    }
  });

  it('turns only a parking lot by its facing', () => {
    expect(lotOf({ ...DEFAULT_LAYOUT_GRID, facingDeg: 90 }).facing).toBeCloseTo(-Math.PI / 2);
    expect(
      lotOf({ ...DEFAULT_LAYOUT_GRID, facingDeg: 90, siteType: 'office_retail' }).facing,
    ).toBeCloseTo(0);
    expect(
      lotOf({ ...DEFAULT_LAYOUT_GRID, facingDeg: 90, siteType: 'curbside' }).facing,
    ).toBeCloseTo(0);
  });

  it('ends a load management link behind the charger, on the curb side of its row', () => {
    const front = stationBackPoint({ col: 2, row: 0 }, lot);
    const back = stationBackPoint({ col: 2, row: 1 }, lot);
    expect(front.z).toBeCloseTo(BAY_STATION_Z - STATION_BACK_OFFSET);
    expect(back.z).toBeCloseTo(lot.depth - BAY_STATION_Z + STATION_BACK_OFFSET);
    expect(back.x).toBeCloseTo(bayToWorld({ col: 2, row: 1 }, lot).x);
  });

  it('takes the site type into the lot, a parking lot by default', () => {
    expect(lot.siteType).toBe('parking_lot');
    expect(office.siteType).toBe('office_retail');
    expect(street.siteType).toBe('curbside');
  });

  it('gives an office or retail site one row of its chargers with the aisle in front of it', () => {
    expect(office).toMatchObject({ rows: 1, cols: 6, spotW: 2.6, spotD: 5.5, lane: 7 });
    expect(office.rowLengths).toEqual([6]);
    expect(office.depth).toBeCloseTo(12.5);
    expect(office.mounting).toBe('wall');
    expect(officeStall.mounting).toBe('stall');
    expect(chargersAtBack(0, office)).toBe(false);
    expect(isSpot({ col: 5, row: 0 }, office)).toBe(true);
    expect(isSpot({ col: 6, row: 0 }, office)).toBe(false);
    expect(isSpot({ col: 0, row: 1 }, office)).toBe(false);
  });

  it('hangs the AC chargers of a wall-mounted office or retail row on the facade, nothing else', () => {
    expect(wallMounted({ col: 3, row: 0 }, office, 'ac')).toBe(true);
    // A DC charger, a station off the row, stall posts and every other site type stand at the curb.
    expect(wallMounted({ col: 3, row: 0 }, office, 'dc')).toBe(false);
    expect(wallMounted({ col: 3, row: 1 }, office, 'ac')).toBe(false);
    expect(wallMounted({ col: 12, row: 0 }, office, 'ac')).toBe(false);
    expect(wallMounted({ col: 3, row: 0 }, officeStall, 'ac')).toBe(false);
    expect(wallMounted({ col: 3, row: 0 }, lot, 'ac')).toBe(false);
    expect(wallMounted({ col: 3, row: 0 }, street, 'ac')).toBe(false);
    // The wall box is on the facade behind its spot.
    expect(BAY_STATION_Z + wallBoxOffset()).toBeCloseTo(FACADE_Z);
  });

  it('puts the building along the front of the office or retail row past the sidewalk', () => {
    const b = buildingBox(office);
    expect(b.maxZ).toBeCloseTo(FACADE_Z);
    expect(FACADE_Z).toBeCloseTo(-(CURB_M + SIDEWALK_M));
    expect(b.minX).toBeLessThan(0);
    expect(b.maxX).toBeGreaterThan(office.width);
    // The framing takes in the facade, not the whole building behind it.
    for (const p of buildingFramePoints(office)) expect(p.z).toBeGreaterThan(b.minZ + 10);
    expect(layoutGroundBox(office).minZ).toBeCloseTo(FACADE_Z);
  });

  it('lays out a street: a parallel parking lane along each curb around two travel lanes', () => {
    expect(street).toMatchObject({ rows: 2, cols: 6, spotW: 6, spotD: 2.4, lane: 7 });
    expect(street.rowLengths).toEqual([4, 6]);
    expect(street.depth).toBeCloseTo(11.8);
    expect(street.width).toBeCloseTo(36);
    // The left curb faces the street (+z); the right curb is turned.
    expect(bayTurn({ col: 0, row: 0 }, street)).toBe(0);
    expect(bayTurn({ col: 0, row: 1 }, street)).toBeCloseTo(Math.PI);
    // Posts stand on the sidewalks behind the curbs, near the front end of their spot.
    const left = bayToWorld({ col: 2, row: 0 }, street);
    expect(left.z).toBeCloseTo(-(CURB_M + CURB_POST_BACK_M));
    expect(left.x).toBeCloseTo(12 + CURB_POST_IN_M);
    const right = bayToWorld({ col: 2, row: 1 }, street);
    expect(right.z).toBeCloseTo(street.depth + CURB_M + CURB_POST_BACK_M);
    expect(right.x).toBeCloseTo(18 - CURB_POST_IN_M);
    // The parallel spots are the parking lanes.
    expect(spotRect({ col: 2, row: 0 }, street)).toEqual({
      minX: 12,
      maxX: 18,
      minZ: 0,
      maxZ: 2.4,
    });
    expect(spotRect({ col: 2, row: 1 }, street).minZ).toBeCloseTo(9.4);
    // Both sidewalks belong to the site.
    const ground = layoutGroundBox(street);
    expect(ground.minZ).toBeCloseTo(-(CURB_M + SIDEWALK_M));
    expect(ground.maxZ).toBeCloseTo(street.depth + CURB_M + SIDEWALK_M);
    // Every post maps back to its own spot.
    for (const bay of [
      { col: 0, row: 0 },
      { col: 3, row: 0 },
      { col: 5, row: 1 },
    ]) {
      const p = bayToWorld(bay, street);
      expect(worldToBay(p.x, p.z, street)).toEqual(bay);
    }
  });

  it('never picks a curb without chargers', () => {
    const oneSide = lotOf({
      ...DEFAULT_LAYOUT_GRID,
      siteType: 'curbside',
      chargersLeft: 0,
      chargersRight: 3,
    });
    expect(oneSide.rowLengths).toEqual([0, 3]);
    expect(worldToBay(1, -1, oneSide)).toEqual({ col: 0, row: 1 });
    expect(isSpot({ col: 0, row: 0 }, oneSide)).toBe(false);
    expect(clampToLot(-50, -50, oneSide)).toEqual(bayToWorld({ col: 0, row: 1 }, oneSide));
  });

  it('pulses the charging glow gently, steady with reduced motion', () => {
    const steady = chargingGlowLevel(null);
    expect(chargingGlowLevel(null)).toEqual(steady);
    const levels = Array.from({ length: 60 }, (_, i) => chargingGlowLevel(i / 10));
    const intensities = levels.map((l) => l.intensity);
    expect(Math.max(...intensities) - Math.min(...intensities)).toBeGreaterThan(0.5);
    for (const l of levels) {
      expect(l.intensity).toBeGreaterThan(0.5);
      expect(l.halo).toBeGreaterThan(0);
      expect(l.halo).toBeLessThan(0.5);
    }
  });

  it('keeps a pick or a drag inside the lot', () => {
    expect(worldToBay(-50, -50, lot)).toEqual({ col: 0, row: 0 });
    expect(worldToBay(1e6, 1e6, lot)).toEqual({ col: 9, row: 1 });
    expect(clampToLot(-50, -50, lot)).toEqual(bayToWorld({ col: 0, row: 0 }, lot));
    expect(clampToLot(1e6, 1e6, lot)).toEqual(bayToWorld({ col: 9, row: 1 }, lot));
  });

  it('turns the lot by the facing (clockwise from above)', () => {
    const box = { minX: 0, maxX: 10, minZ: 0, maxZ: 4 };
    const turned = rotateBox(box, Math.PI / 2);
    expect(turned.minX).toBeCloseTo(0);
    expect(turned.maxX).toBeCloseTo(4);
    expect(turned.minZ).toBeCloseTo(-10);
    expect(turned.maxZ).toBeCloseTo(0);
  });

  it('frames the lot and everything outside it', () => {
    expect(sceneBox(lot, [])).toEqual({ minX: 0, maxX: lot.width, minZ: 0, maxZ: lot.depth });
    const withTransformer = sceneBox(lot, [{ x: 40, z: 3 }]);
    expect(withTransformer.maxX).toBe(42);
    const fit = fitFrame(withTransformer, 2);
    expect(fit.target.x).toBe(21);
    expect(fit.distance).toBeLessThan(80);
    expect(maxZoomDistance(withTransformer)).toBeGreaterThanOrEqual(MAX_DISTANCE_MIN);
  });

  it('paints the grass under the whole view at every zoom, wherever the camera looks', () => {
    const frame = sceneBox(lot, []);
    const pan = panBox(frame);
    const g = groundBox(frame, pan);
    for (const distance of [MIN_DISTANCE, 60, maxZoomDistance(frame)]) {
      const reach = distance + fogRange(distance).far;
      for (const target of [clampTarget(-1e6, -1e6, pan), clampTarget(1e6, 1e6, pan)]) {
        expect(target.x - reach).toBeGreaterThan(g.minX);
        expect(target.x + reach).toBeLessThan(g.maxX);
        expect(target.z - reach).toBeGreaterThan(g.minZ);
        expect(target.z + reach).toBeLessThan(g.maxZ);
      }
    }
  });

  it('fades the ground with the camera distance, clear around the target', () => {
    const near = fogRange(20);
    expect(near.near).toBeGreaterThan(20);
    expect(fogRange(200).far).toBe(near.far * 10);
  });

  it('keeps the top edge of the view below the horizon at the lowest orbit, so no sky shows', () => {
    const topRay = MAX_POLAR_ANGLE + (CAMERA_FOV / 2) * (Math.PI / 180);
    expect(topRay).toBeLessThan(Math.PI / 2);
  });

  it('puts a car in a charging spot, a Reserved sign in a reserved one and a cone in maintenance', () => {
    expect(stationProp('charging')).toBe('car');
    expect(stationProp('reserved')).toBe('reservedSign');
    expect(stationProp('maintenance')).toBe('cone');
    for (const state of ['faulted', 'unavailable', 'offline', 'available', 'online'] as const) {
      expect(stationProp(state)).toBeNull();
    }
  });

  it('fits a logo inside the back panel with padding, never stretched', () => {
    const panel = { width: 0.62, height: 0.62 };
    const wide = logoFit(panel, { width: 400, height: 100 }, 0.04);
    expect(wide.width).toBeCloseTo(0.54);
    expect(wide.height).toBeCloseTo(0.135);
    const tall = logoFit(panel, { width: 100, height: 300 }, 0.04);
    expect(tall.height).toBeCloseTo(0.54);
    expect(tall.width / tall.height).toBeCloseTo(1 / 3);
    expect(logoFit(panel, { width: 0, height: 0 }, 0.04)).toEqual({ width: 0, height: 0 });
  });

  it('puts the front camera in front of the chargers at eye height, turned with the facing', () => {
    const box = { minX: 0, maxX: 30, minZ: 0, maxZ: 20 };
    for (const facing of [0, Math.PI / 2, Math.PI, -Math.PI / 4]) {
      const { target, position } = frontCamera(box, facing, 16 / 9);
      // The camera stands along the lot's own +z (the chargers' front), turned by the facing.
      const dx = position.x - target.x;
      const dz = position.z - target.z;
      const along = dx * Math.sin(facing) + dz * Math.cos(facing);
      const across = dx * Math.cos(facing) - dz * Math.sin(facing);
      expect(along).toBeGreaterThan(0);
      expect(Math.abs(across)).toBeLessThan(along * 0.01);
      const polar = Math.atan2(Math.hypot(dx, dz), position.y - target.y);
      // Low across the lot: steeper than the overview orbit allows, within the front orbit.
      expect(polar).toBeGreaterThan(MAX_POLAR_ANGLE);
      expect(polar).toBeLessThan(FRONT_MAX_POLAR_ANGLE);
      // It looks at charger height.
      expect(target.y).toBe(FRONT_TARGET_Y);
    }
    // Unturned, it frames the site like Fit to View (centered on the same point).
    const unturned = frontCamera(box, 0, 1).target;
    expect(unturned.x).toBe(fitFrame(box, 1).target.x);
    expect(unturned.z).toBe(fitFrame(box, 1).target.z);
    // The overview offset keeps the Fit to View target.
    expect(frontCamera(box, 0, 1, OVERVIEW_CAMERA_OFFSET).target).toEqual(fitFrame(box, 1).target);
  });

  it('pulses the faulted beacon on and off, and keeps it steady and bright without motion', () => {
    const steady = beaconLevel(null);
    expect(steady.intensity).toBeGreaterThan(0.5);
    const samples = Array.from({ length: 40 }, (_, i) => beaconLevel(i * 0.05).intensity);
    expect(Math.min(...samples)).toBeLessThan(0.3);
    expect(Math.max(...samples)).toBeGreaterThan(1.5);
  });

  it('keeps every label on a small site and hides far labels on a large one', () => {
    expect(stationLabelInRange(500, 30, LABEL_CULL_FROM - 1)).toBe(true);
    expect(stationLabelInRange(39, 10, 150)).toBe(true);
    expect(stationLabelInRange(41, 10, 150)).toBe(false);
    expect(stationLabelInRange(130, 100, 150)).toBe(true);
    expect(stationLabelInRange(150, 100, 150)).toBe(false);
  });

  it('maps depot slots to their bus bays and truck lanes and back', () => {
    const settings: SiteLayoutSettings = {
      ...effectiveLayoutSettings(null),
      siteType: 'depot',
      busBays: 3,
      truckLanes: 2,
    };
    const lot = lotOf(settings);
    expect(lot.depot?.bays).toHaveLength(3);
    expect(bayToWorld({ col: 1, row: 0 }, lot)).toEqual({ x: 6.45, z: 0.9 });
    expect(bayTurn({ col: 1, row: 1 }, lot)).toBe(0);
    const lane = spotRect({ col: 1, row: 1 }, lot);
    expect(lane.maxX - lane.minX).toBe(25);
    // A point in a lane finds that lane; one on the drive lane the nearest spot.
    expect(worldToBay((lane.minX + lane.maxX) / 2, (lane.minZ + lane.maxZ) / 2, lot)).toEqual({
      col: 1,
      row: 1,
    });
    expect(worldToBay(2, 6, lot)).toEqual({ col: 0, row: 0 });
    expect(layoutGroundBox(lot)).toEqual(lot.depot?.yard);
    expect(depotStationPlacement({ col: 0, row: 1 }, lot).spotType).toBe('truck_pull_through');
  });
});
