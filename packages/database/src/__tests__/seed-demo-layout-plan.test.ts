// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  bayInLayout,
  chargerMountingOf,
  depotLayout,
  depotStationKind,
  freeSpotCount,
  overlappingFreeStations,
  snapFreePlacement,
  usesFreePositions,
  effectiveLayoutSettings,
  energyAssetsOf,
  layoutCapacity,
  layoutRowLengths,
  sameLayoutSettings,
  siteTypeOf,
} from '@evtivity/lib/site-layout';
import type { SiteLayoutSettings } from '@evtivity/lib/site-layout';
import { freePlacementSchema, siteLayoutSettingsSchema } from '@evtivity/lib/site-layout-schema';
import { LAYOUT_DEMO, LAYOUT_DEMO_PREVIOUS_SETTINGS } from '../seed-demo-layout-plan.js';
import { DEMO_MODEL_BODY_TYPES } from '../seed-demo-vehicles.js';

const [harbor, lakeside, riverside, maple, willow, depot] = LAYOUT_DEMO.sites;
const allStations = LAYOUT_DEMO.sites.flatMap((s) => s.stations);

describe('site layout demo plan', () => {
  it('makes Harbor Point a parking lot of DC fast chargers with its transformers', () => {
    expect(siteTypeOf(harbor!.settings)).toBe('parking_lot');
    expect(new Set(harbor!.stations.map((s) => s.kind))).toEqual(new Set(['dc']));
    expect(harbor!.settings.transformers.length).toBeGreaterThan(0);
    // One battery on the grass and one solar canopy over a row of the lot.
    const assets = energyAssetsOf(harbor!.settings);
    expect(assets.map((a) => a.type).sort()).toEqual(['battery', 'solar']);
    const effective = effectiveLayoutSettings(harbor!.settings);
    expect(effective.energyAssets).toEqual(assets);
  });

  it('makes Lakeside Retail Park an office or retail site of AC chargers along the building, no transformers', () => {
    expect(siteTypeOf(lakeside!.settings)).toBe('office_retail');
    expect(new Set(lakeside!.stations.map((s) => s.kind))).toEqual(new Set(['ac']));
    expect(lakeside!.settings.transformers).toEqual([]);
    // Every charger stands in the row along the building (wall boxes), 12 positions.
    expect(new Set(lakeside!.stations.map((s) => s.row))).toEqual(new Set([0]));
    expect(lakeside!.settings.chargers).toBe(12);
    expect(chargerMountingOf(lakeside!.settings)).toBe('wall');
  });

  it('makes Riverside Medical Offices an office or retail site with posts at the spots', () => {
    expect(siteTypeOf(riverside!.settings)).toBe('office_retail');
    expect(chargerMountingOf(riverside!.settings)).toBe('stall');
    expect(new Set(riverside!.stations.map((s) => s.kind))).toEqual(new Set(['ac']));
  });

  it('makes Maple Street a curbside site with AC posts on both curbs', () => {
    expect(siteTypeOf(maple!.settings)).toBe('curbside');
    expect(layoutRowLengths(maple!.settings)).toEqual([4, 4]);
    expect(new Set(maple!.stations.map((s) => s.kind))).toEqual(new Set(['ac']));
    expect(new Set(maple!.stations.map((s) => s.row))).toEqual(new Set([0, 1]));
  });

  it('makes Willow Creek a custom site of stations placed freely along a curve, no spot shared', () => {
    expect(siteTypeOf(willow!.settings)).toBe('custom');
    expect(usesFreePositions(willow!.settings)).toBe(true);
    // DC chargers with two EVSEs (two spots each) and AC pedestals with one.
    expect(new Set(willow!.stations.map((s) => s.kind))).toEqual(new Set(['ac', 'dc']));
    const free = willow!.stations.map((s) => {
      expect(s.free).toBeDefined();
      expect(freePlacementSchema.safeParse(s.free).success).toBe(true);
      // Stored as an operator would place it: positions on the 0.5 m grid.
      expect(snapFreePlacement(s.free!, { freeRotation: true })).toEqual(s.free);
      return { key: s.id, placement: s.free!, spots: freeSpotCount(s.kind === 'dc' ? 2 : 1) };
    });
    expect(overlappingFreeStations(free)).toEqual([]);
    // Irregular: the curve turns every station its own way; the row under the canopy is straight.
    expect(new Set(free.map((f) => f.placement.rotationDeg)).size).toBe(free.length - 3);
    // A transformer, a battery and a free-standing solar canopy, and one display message.
    expect(willow!.settings.transformers).toHaveLength(1);
    const assets = energyAssetsOf(willow!.settings);
    expect(assets.find((a) => a.type === 'solar')).toMatchObject({ x: 4.5, z: -22 });
    expect(willow!.stations.filter((s) => s.message != null)).toHaveLength(1);
    expect(willow!.stations.find((s) => s.message != null)?.kind).toBe('dc');
    // The canopy stands over the row of three AC pedestals.
    expect(free.filter((f) => f.placement.z === -24 && f.placement.rotationDeg === 0)).toHaveLength(
      4,
    );
  });

  it('makes Northgate Fleet Depot a depot of bus bays and truck pull-through lanes, one station each', () => {
    expect(depot!.name).toBe('Northgate Fleet Depot');
    expect(siteTypeOf(depot!.settings)).toBe('depot');
    expect(siteLayoutSettingsSchema.safeParse(depot!.settings).success).toBe(true);
    // Six bus bays (one free) and three truck lanes.
    expect(layoutRowLengths(depot!.settings)).toEqual([6, 3]);
    const inRow = (row: number) => depot!.stations.filter((s) => s.row === row);
    // Depot pantograph poles (OppCharge) and plug-in dispensers in the bus bays,
    // megawatt (cMCS) and box truck dispensers in the truck lanes.
    expect(inRow(0).filter((s) => s.connectorType === 'OppCharge')).toHaveLength(3);
    expect(inRow(0).filter((s) => s.connectorType === 'CCS1')).toHaveLength(2);
    expect(inRow(1).filter((s) => s.connectorType === 'cMCS')).toHaveLength(2);
    expect(inRow(1)).toHaveLength(3);
    // Each station has its own bay or lane, and its connectors give it the area it is in.
    for (const s of depot!.stations) {
      expect(bayInLayout({ col: s.col, row: s.row }, depot!.settings)).toBe(true);
      expect(depotStationKind([s.connectorType ?? null]) === 'truck').toBe(
        s.connectorType === 'cMCS',
      );
      expect(s.free).toBeUndefined();
    }
    const slots = new Set(depot!.stations.map((s) => `${String(s.col)}:${String(s.row)}`));
    expect(slots.size).toBe(depot!.stations.length);
    expect(new Set(depot!.stations.map((s) => s.kind))).toEqual(new Set(['dc']));
    // A transformer and a battery on the grass outside the yard, two switchboards
    // (one under the other) and a message on a pole.
    const yard = depotLayout(depot!.settings).yard;
    const outside = (p: { x: number; z: number }) =>
      p.x < yard.minX || p.x > yard.maxX || p.z < yard.minZ || p.z > yard.maxZ;
    expect(depot!.settings.transformers).toHaveLength(1);
    expect(depot!.settings.transformers.every(outside)).toBe(true);
    const assets = energyAssetsOf(depot!.settings);
    expect(assets.map((a) => a.type)).toEqual(['battery']);
    expect(assets.every((a) => a.type === 'battery' && outside(a))).toBe(true);
    // Stored on the grass already: the effective settings do not move them.
    const effective = effectiveLayoutSettings(depot!.settings);
    expect(effective.transformers).toEqual(depot!.settings.transformers);
    expect(effective.energyAssets).toEqual(assets);
    expect(depot!.panels).toHaveLength(2);
    expect(depot!.stations.filter((s) => s.message != null)).toHaveLength(1);
    // A rerun converts the custom site an earlier plan seeded.
    expect(LAYOUT_DEMO_PREVIOUS_SETTINGS[depot!.id]?.map((p) => siteTypeOf(p))).toEqual(['custom']);
  });

  it('gives the depot fleet one bus, semi truck or box truck per driver, charging at the depot', () => {
    const fleet = LAYOUT_DEMO.fleet;
    expect(fleet.siteId).toBe(depot!.id);
    const bodyTypes = fleet.drivers.map((d) => d.vehicle.bodyType);
    expect(bodyTypes.filter((b) => b === 'bus')).toHaveLength(6);
    expect(bodyTypes.filter((b) => b === 'semi_truck')).toHaveLength(4);
    expect(bodyTypes.filter((b) => b === 'box_truck')).toHaveLength(2);
    for (const d of fleet.drivers) {
      // Demo addresses (reserved example domain), the body type of the model.
      expect(d.email).toMatch(/@northgate-fleet\.example$/);
      expect(DEMO_MODEL_BODY_TYPES[d.vehicle.model]).toBe(d.vehicle.bodyType);
      expect(d.id).toMatch(/^drv_demo/);
    }
    // Fixed ids, each unique.
    for (const key of ['id', 'email', 'idToken'] as const) {
      expect(new Set(fleet.drivers.map((d) => d[key])).size).toBe(fleet.drivers.length);
    }
    expect(new Set(fleet.drivers.map((d) => d.vehicle.color)).size).toBeGreaterThanOrEqual(6);
  });

  it('has valid settings, every station on its own spot inside the lot, on a circuit of its site', () => {
    for (const site of LAYOUT_DEMO.sites) {
      expect(siteLayoutSettingsSchema.safeParse(site.settings).success).toBe(true);
      expect(site.stations.length).toBeLessThanOrEqual(layoutCapacity(site.settings));
      const spots = new Set(site.stations.map((s) => `${String(s.col)}:${String(s.row)}`));
      expect(spots.size).toBe(site.stations.length);
      for (const s of site.stations) {
        expect(bayInLayout({ col: s.col, row: s.row }, site.settings)).toBe(true);
      }
      const circuits = new Set(site.panels.flatMap((p) => p.circuits.map((c) => c.id)));
      for (const s of site.stations) expect(circuits.has(s.circuitId)).toBe(true);
      // A sub-panel hangs under a panel of the same site.
      const panels = new Set(site.panels.map((p) => p.id));
      for (const p of site.panels) {
        if (p.parentPanelId != null) expect(panels.has(p.parentPanelId)).toBe(true);
      }
    }
    expect(new Set(allStations.map((s) => s.id)).size).toBe(allStations.length);
  });

  it('keeps the state variety: maintenance, offline and cellular stations', () => {
    expect(harbor!.stations.some((s) => s.maintenance === true)).toBe(true);
    expect(allStations.some((s) => s.offline === true)).toBe(true);
    expect(harbor!.stations.some((s) => s.cellular === true)).toBe(true);
    expect(lakeside!.stations.some((s) => s.cellular === true)).toBe(true);
    // The faulted station runs no simulator, so its fault and insight stay.
    const faulted = allStations.filter((s) => s.faulted === true);
    expect(faulted).toHaveLength(1);
    expect(faulted[0]?.offline).toBe(true);
    expect(LAYOUT_DEMO.faultInsightId).toMatch(/^ain_[a-z0-9]{12}$/);
  });

  it('puts the card readers on DC chargers', () => {
    for (const t of LAYOUT_DEMO.terminals) {
      expect(allStations.find((s) => s.id === t.stationId)?.kind).toBe('dc');
    }
  });

  it('moves every station of the earlier plan away from the other site, and replaces only its own earlier settings', () => {
    for (const site of LAYOUT_DEMO.sites) {
      for (const s of site.stations) {
        if (s.movedFrom != null) expect(s.movedFrom.siteId).not.toBe(site.id);
      }
      const previous = LAYOUT_DEMO_PREVIOUS_SETTINGS[site.id] ?? [];
      for (const p of previous) expect(sameLayoutSettings(p, site.settings)).toBe(false);
    }
    // The two sites of the earlier plans have their earlier settings listed.
    expect(LAYOUT_DEMO_PREVIOUS_SETTINGS[harbor!.id]?.length).toBeGreaterThan(0);
    expect(LAYOUT_DEMO_PREVIOUS_SETTINGS[lakeside!.id]?.length).toBe(2);
    // Lakeside's plan before charger counts (stored with the sizes) is replaced too.
    const storedBefore = {
      siteType: 'office_retail',
      spotsPerRow: 12,
      rows: 1,
      spotWidthM: 2.8,
      spotDepthM: 5.5,
      laneWidthM: 6,
      facingDeg: 90,
      transformers: [],
      energyAssets: [],
    } as unknown as SiteLayoutSettings;
    expect(
      (LAYOUT_DEMO_PREVIOUS_SETTINGS[lakeside!.id] ?? []).some((p) =>
        sameLayoutSettings(p, storedBefore),
      ),
    ).toBe(true);
    // Harbor Point's plan before the battery and the solar canopy is replaced too.
    const beforeAssets = { ...harbor!.settings };
    delete beforeAssets.energyAssets;
    expect(
      (LAYOUT_DEMO_PREVIOUS_SETTINGS[harbor!.id] ?? []).some((p) =>
        sameLayoutSettings(p, beforeAssets),
      ),
    ).toBe(true);
  });
});
