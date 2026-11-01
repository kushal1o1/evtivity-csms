// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

// The site layout demo as plain data (no database import), so the seed, its
// tests and the docs screenshot fixtures read one plan. Four sites, one per
// site type and charger mounting, as on real sites: Harbor Point Charging Hub,
// a parking lot (an outdoor hub of DC fast chargers, 2 rows of 6 spots, two
// transformers and a battery on the grass, a solar carport over the back row,
// one faulted station without a simulator, switchboards with load management
// links); Lakeside Retail Park, an office or retail site with 12 charger
// positions along the building front and AC wall boxes on the facade;
// Riverside Medical Offices, an office or retail site with AC posts at the
// head of 6 spots (stall mounting); Maple Street, a curbside site with AC
// posts at the curb, 4 on each side of the street; and Willow Creek Park and
// Ride, a custom site whose stations stand along a curved access road, each
// turned to face it with its own parking spots (three DC fast chargers with
// two spots each, five AC pedestals, three of them in a row under a solar
// carport), with a transformer and a battery placed freely and an active
// display message on the DC charger at the apex of the curve; and Northgate
// Fleet Depot, a depot with nose-in bus bays under pantograph poles and at
// plug-in dispensers, and truck pull-through lanes with megawatt dispensers.
// Every site is load managed, so the station popups show the allocated limit;
// the parking lot and the custom site draw their panels and links.
//
// Earlier releases of the demo mixed DC and AC chargers on both sites. A rerun
// moves the stations of the earlier plan (`movedFrom`), renames its panels and
// circuits (`renamedFrom`) and replaces the layout settings it seeded
// (`LAYOUT_DEMO_PREVIOUS_SETTINGS`), each only while the row still holds what
// that plan wrote, so an operator's own change stays.

import type { FreePlacement, SiteLayoutSettings } from '@evtivity/lib/site-layout';
import type { VehicleBodyType, VehicleColor } from '@evtivity/lib/vehicle-appearance';

export interface LayoutDemoStation {
  id: string;
  stationId: string;
  kind: 'ac' | 'dc';
  col: number;
  row: number;
  /** The circuit the station hangs on. */
  circuitId: string;
  /** Cellular data plan (the 4G badge). */
  cellular?: boolean;
  /** No simulator: the station stays offline. */
  offline?: boolean;
  /** Covered by the demo maintenance event (the traffic cone). */
  maintenance?: boolean;
  /** No simulator, a faulted connector and an open AI insight on it (the faulted state). */
  faulted?: boolean;
  /** Where the earlier plan seeded the station (a rerun moves it from there). */
  movedFrom?: { siteId: string; circuitId: string };
  /** Custom site: where the station stands and its turn. */
  free?: FreePlacement;
  /** An active display message the station accepted (shown on its screen in 3D). */
  message?: string;
  /** The connector type of every EVSE (default CCS2 for DC, Type2 for AC). */
  connectorType?: string;
  /** The maximum power of every connector, in kW (default 150 DC, 22 AC). */
  maxPowerKw?: number;
  /** The EVSEs of the station (default 2 for DC, 1 for AC). */
  evses?: number;
}

export interface LayoutDemoPanel {
  id: string;
  parentPanelId: string | null;
  name: string;
  breakerRatingAmps: number;
  voltageV: number;
  phases: number;
  maxContinuousKw: number;
  /** The name the earlier plan gave the panel (a rerun renames it). */
  renamedFrom?: string;
  circuits: LayoutDemoCircuit[];
}

export interface LayoutDemoCircuit {
  id: string;
  name: string;
  breakerRatingAmps: number;
  maxContinuousKw: number;
  /** The circuit as the earlier plan seeded it (a rerun renames it and moves it to this panel). */
  renamedFrom?: { name: string; panelId: string };
}

export interface LayoutDemoSite {
  id: string;
  name: string;
  address: string;
  city: string;
  latitude: string;
  longitude: string;
  settings: SiteLayoutSettings;
  panels: LayoutDemoPanel[];
  stations: LayoutDemoStation[];
}

type StationExtra = Pick<
  LayoutDemoStation,
  | 'cellular'
  | 'offline'
  | 'maintenance'
  | 'faulted'
  | 'movedFrom'
  | 'free'
  | 'message'
  | 'connectorType'
  | 'maxPowerKw'
  | 'evses'
>;

const dc = (
  n: number,
  col: number,
  row: number,
  circuitId: string,
  extra: StationExtra = {},
): LayoutDemoStation => ({
  id: `sta_demolayout${String(n).padStart(2, '0')}`,
  stationId: `CS-${String(3000 + n)}`,
  kind: 'dc' as const,
  col,
  row,
  circuitId,
  ...extra,
});
const ac = (
  n: number,
  col: number,
  row: number,
  circuitId: string,
  extra: StationExtra = {},
): LayoutDemoStation => ({
  ...dc(n, col, row, circuitId, extra),
  kind: 'ac' as const,
});

export interface LayoutDemoTerminal {
  providerDeviceId: string;
  label: string;
  vendor: string;
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  stationId: string;
  /** OCPP EVSE number of the paired connector; null for the whole station. */
  evseNumber: number | null;
  online: boolean;
  /** The station the earlier plan paired the reader to (a rerun pairs it again here). */
  pairedBefore?: string;
}

const HARBOR = 'sit_demolayout01';
const LAKESIDE = 'sit_demolayout02';
const RIVERSIDE = 'sit_demolayout03';
const MAPLE = 'sit_demolayout04';
const WILLOW = 'sit_demolayout05';
const DEPOT = 'sit_demolayout06';

/** A driver of the fleet depot demo and the one vehicle it drives (its body type decides what the layout draws). */
export interface LayoutDemoFleetDriver {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** The RFID card the driver charges with (ISO14443). */
  idToken: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: string;
    licensePlate: string;
    bodyType: VehicleBodyType;
    color: VehicleColor;
  };
}

/** The fleet of the depot: its drivers charge only at the depot's stations (fleet_stations). */
export interface LayoutDemoFleet {
  id: string;
  name: string;
  description: string;
  siteId: string;
  drivers: LayoutDemoFleetDriver[];
}

const depotDriver = (
  n: number,
  firstName: string,
  lastName: string,
  vehicle: Omit<LayoutDemoFleetDriver['vehicle'], 'id' | 'licensePlate'>,
): LayoutDemoFleetDriver => {
  const nn = String(n).padStart(2, '0');
  return {
    id: `drv_demodepot${nn}`,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@northgate-fleet.example`,
    idToken: `RFID-DEPOT-${nn}`,
    vehicle: { id: `veh_demodepot${nn}`, licensePlate: `NGF-${String(100 + n)}`, ...vehicle },
  };
};

/** The fixed id of the demo display message on each station that has one (OCPP message id). */
export const LAYOUT_DEMO_MESSAGE_ID = 9001;

export const LAYOUT_DEMO: {
  sites: LayoutDemoSite[];
  maintenanceEventId: string;
  faultInsightId: string;
  terminals: LayoutDemoTerminal[];
  fleet: LayoutDemoFleet;
} = {
  sites: [
    {
      id: HARBOR,
      name: 'Harbor Point Charging Hub',
      address: '200 Harbor Point Blvd',
      city: 'Albany',
      latitude: '42.646200',
      longitude: '-73.752800',
      settings: {
        siteType: 'parking_lot',
        spotsPerRow: 6,
        rows: 2,
        facingDeg: 0,
        transformers: [
          { id: 'tx-1', name: 'Utility Transformer', ratedKva: 2500, x: -14, z: 2.5 },
          { id: 'tx-2', name: 'Solar Carport Tie-In', ratedKva: 750, x: -14, z: 16 },
        ],
        energyAssets: [
          { id: 'bat-1', type: 'battery', name: 'Battery Storage', capacityKwh: 1000, x: 25, z: 4 },
          { id: 'pv-1', type: 'solar', name: 'Solar Carport', capacityKwp: 180, row: 1 },
        ],
      },
      panels: [
        {
          id: 'pnl_demolayout01',
          parentPanelId: null,
          name: 'Main Switchboard',
          breakerRatingAmps: 800,
          voltageV: 480,
          phases: 3,
          maxContinuousKw: 532,
          circuits: [
            {
              id: 'cir_demolayout01',
              name: 'DC Bank A',
              breakerRatingAmps: 600,
              maxContinuousKw: 400,
              renamedFrom: { name: 'DC Bank', panelId: 'pnl_demolayout01' },
            },
          ],
        },
        {
          id: 'pnl_demolayout02',
          parentPanelId: 'pnl_demolayout01',
          name: 'DC Bank B Switchboard',
          renamedFrom: 'Level 2 Panel',
          breakerRatingAmps: 400,
          voltageV: 480,
          phases: 3,
          maxContinuousKw: 266,
          circuits: [
            {
              id: 'cir_demolayout02',
              name: 'DC Bank B',
              breakerRatingAmps: 300,
              maxContinuousKw: 200,
              renamedFrom: { name: 'Level 2 Circuit', panelId: 'pnl_demolayout02' },
            },
          ],
        },
      ],
      stations: [
        dc(1, 0, 0, 'cir_demolayout01'),
        dc(2, 1, 0, 'cir_demolayout01', { cellular: true }),
        dc(3, 2, 0, 'cir_demolayout01'),
        dc(4, 3, 0, 'cir_demolayout01', { maintenance: true }),
        dc(5, 4, 0, 'cir_demolayout01'),
        dc(6, 5, 0, 'cir_demolayout01'),
        dc(13, 1, 1, 'cir_demolayout02', {
          movedFrom: { siteId: LAKESIDE, circuitId: 'cir_demolayout03' },
        }),
        dc(14, 2, 1, 'cir_demolayout02', {
          movedFrom: { siteId: LAKESIDE, circuitId: 'cir_demolayout03' },
        }),
        dc(15, 3, 1, 'cir_demolayout02', {
          movedFrom: { siteId: LAKESIDE, circuitId: 'cir_demolayout03' },
        }),
        dc(16, 4, 1, 'cir_demolayout02', {
          movedFrom: { siteId: LAKESIDE, circuitId: 'cir_demolayout03' },
        }),
        dc(21, 0, 1, 'cir_demolayout02', { offline: true, faulted: true }),
      ],
    },
    {
      id: LAKESIDE,
      name: 'Lakeside Retail Park',
      address: '15 Lakeside Drive',
      city: 'Saratoga Springs',
      latitude: '43.071700',
      longitude: '-73.784400',
      settings: {
        siteType: 'office_retail',
        spotsPerRow: 12,
        rows: 1,
        facingDeg: 0,
        chargers: 12,
        mounting: 'wall',
        transformers: [],
      },
      panels: [
        {
          id: 'pnl_demolayout03',
          parentPanelId: null,
          name: 'Retail Panel',
          breakerRatingAmps: 400,
          voltageV: 480,
          phases: 3,
          maxContinuousKw: 266,
          circuits: [
            {
              id: 'cir_demolayout03',
              name: 'Level 2 Circuit A',
              breakerRatingAmps: 200,
              maxContinuousKw: 57.6,
              renamedFrom: { name: 'Fast Charge Circuit', panelId: 'pnl_demolayout03' },
            },
          ],
        },
        {
          id: 'pnl_demolayout04',
          parentPanelId: 'pnl_demolayout03',
          name: 'Level 2 Sub-Panel',
          breakerRatingAmps: 225,
          voltageV: 208,
          phases: 3,
          maxContinuousKw: 64.8,
          circuits: [
            {
              id: 'cir_demolayout04',
              name: 'Level 2 Circuit B',
              breakerRatingAmps: 100,
              maxContinuousKw: 28.8,
              renamedFrom: { name: 'Level 2 Circuit', panelId: 'pnl_demolayout03' },
            },
          ],
        },
      ],
      stations: [
        ac(7, 0, 0, 'cir_demolayout03', {
          movedFrom: { siteId: HARBOR, circuitId: 'cir_demolayout02' },
        }),
        ac(8, 1, 0, 'cir_demolayout03', {
          offline: true,
          movedFrom: { siteId: HARBOR, circuitId: 'cir_demolayout02' },
        }),
        ac(9, 2, 0, 'cir_demolayout03', {
          movedFrom: { siteId: HARBOR, circuitId: 'cir_demolayout02' },
        }),
        ac(10, 3, 0, 'cir_demolayout03', {
          cellular: true,
          movedFrom: { siteId: HARBOR, circuitId: 'cir_demolayout02' },
        }),
        ac(11, 4, 0, 'cir_demolayout03', {
          movedFrom: { siteId: HARBOR, circuitId: 'cir_demolayout02' },
        }),
        ac(12, 5, 0, 'cir_demolayout03', {
          movedFrom: { siteId: HARBOR, circuitId: 'cir_demolayout02' },
        }),
        ac(17, 6, 0, 'cir_demolayout04'),
        ac(18, 7, 0, 'cir_demolayout04'),
        ac(19, 8, 0, 'cir_demolayout04'),
        ac(20, 9, 0, 'cir_demolayout04'),
      ],
    },
    {
      id: RIVERSIDE,
      name: 'Riverside Medical Offices',
      address: '40 River Street',
      city: 'Troy',
      latitude: '42.728400',
      longitude: '-73.691800',
      settings: {
        siteType: 'office_retail',
        spotsPerRow: 10,
        rows: 2,
        facingDeg: 0,
        chargers: 6,
        mounting: 'stall',
        transformers: [],
      },
      panels: [
        {
          id: 'pnl_demolayout05',
          parentPanelId: null,
          name: 'Parking Panel',
          breakerRatingAmps: 200,
          voltageV: 208,
          phases: 3,
          maxContinuousKw: 57.6,
          circuits: [
            {
              id: 'cir_demolayout05',
              name: 'Level 2 Posts',
              breakerRatingAmps: 125,
              maxContinuousKw: 36,
            },
          ],
        },
      ],
      stations: [
        ac(22, 0, 0, 'cir_demolayout05'),
        ac(23, 1, 0, 'cir_demolayout05'),
        ac(24, 2, 0, 'cir_demolayout05', { cellular: true }),
        ac(25, 4, 0, 'cir_demolayout05'),
      ],
    },
    {
      id: MAPLE,
      name: 'Maple Street Curbside',
      address: '120 Maple Street',
      city: 'Schenectady',
      latitude: '42.812500',
      longitude: '-73.939600',
      settings: {
        siteType: 'curbside',
        spotsPerRow: 10,
        rows: 2,
        facingDeg: 0,
        chargersLeft: 4,
        chargersRight: 4,
        transformers: [],
      },
      panels: [
        {
          id: 'pnl_demolayout06',
          parentPanelId: null,
          name: 'Street Cabinet',
          breakerRatingAmps: 225,
          voltageV: 208,
          phases: 3,
          maxContinuousKw: 64.8,
          circuits: [
            {
              id: 'cir_demolayout06',
              name: 'Curb Posts',
              breakerRatingAmps: 175,
              maxContinuousKw: 50.4,
            },
          ],
        },
      ],
      stations: [
        ac(26, 0, 0, 'cir_demolayout06'),
        ac(27, 1, 0, 'cir_demolayout06'),
        ac(28, 2, 0, 'cir_demolayout06', { cellular: true }),
        ac(29, 3, 0, 'cir_demolayout06'),
        ac(30, 0, 1, 'cir_demolayout06'),
        ac(31, 1, 1, 'cir_demolayout06'),
        ac(32, 2, 1, 'cir_demolayout06', { cellular: true }),
        ac(33, 3, 1, 'cir_demolayout06', { offline: true }),
      ],
    },
    {
      id: WILLOW,
      name: 'Willow Creek Park and Ride',
      address: '75 Willow Creek Road',
      city: 'Clifton Park',
      latitude: '42.865600',
      longitude: '-73.770900',
      settings: {
        siteType: 'custom',
        spotsPerRow: 10,
        rows: 2,
        facingDeg: 0,
        transformers: [{ id: 'tx-1', name: 'Pad Transformer', ratedKva: 1000, x: -30, z: -26 }],
        energyAssets: [
          {
            id: 'bat-1',
            type: 'battery',
            name: 'Battery Storage',
            capacityKwh: 500,
            x: 30,
            z: -24,
          },
          // Over the three AC pedestals in a row.
          {
            id: 'pv-1',
            type: 'solar',
            name: 'Solar Carport',
            capacityKwp: 10,
            row: 0,
            x: 4.5,
            z: -22,
            rotationDeg: 0,
          },
        ],
      },
      panels: [
        {
          id: 'pnl_demolayout07',
          parentPanelId: null,
          name: 'Park and Ride Switchboard',
          breakerRatingAmps: 600,
          voltageV: 480,
          phases: 3,
          maxContinuousKw: 400,
          circuits: [
            {
              id: 'cir_demolayout07',
              name: 'Fast Charge Circuit',
              breakerRatingAmps: 400,
              maxContinuousKw: 266,
            },
            {
              id: 'cir_demolayout08',
              name: 'Level 2 Circuit',
              breakerRatingAmps: 200,
              maxContinuousKw: 96,
            },
          ],
        },
      ],
      // Along the curve of the access road, each turned to face the road; at
      // its far end three AC pedestals in a straight row under the solar carport.
      stations: [
        dc(34, 0, 0, 'cir_demolayout07', { free: { x: -21.5, z: -11, rotationDeg: 297 } }),
        ac(35, 1, 0, 'cir_demolayout08', { free: { x: -17.5, z: -17.5, rotationDeg: 315 } }),
        ac(36, 2, 0, 'cir_demolayout08', {
          cellular: true,
          free: { x: -11.5, z: -21, rotationDeg: 332 },
        }),
        dc(37, 3, 0, 'cir_demolayout07', {
          free: { x: -4, z: -24, rotationDeg: 0 },
          message: 'Welcome to Willow Creek. Idle fees apply 15 minutes after charging ends.',
        }),
        ac(38, 4, 0, 'cir_demolayout08', { free: { x: 1.5, z: -24, rotationDeg: 0 } }),
        ac(39, 5, 0, 'cir_demolayout08', { free: { x: 4.5, z: -24, rotationDeg: 0 } }),
        ac(40, 6, 0, 'cir_demolayout08', { free: { x: 7.5, z: -24, rotationDeg: 0 } }),
        dc(41, 7, 0, 'cir_demolayout07', { free: { x: 16, z: -19, rotationDeg: 40 } }),
      ],
    },
    {
      id: DEPOT,
      name: 'Northgate Fleet Depot',
      address: '1200 Northgate Industrial Parkway',
      city: 'Latham',
      latitude: '42.747800',
      longitude: '-73.758900',
      // Six bus bays (one free) and three truck lanes. The substation and the
      // battery stand on the grass behind the yard, clear of the gate.
      settings: {
        siteType: 'depot',
        spotsPerRow: 8,
        rows: 1,
        facingDeg: 0,
        busBays: 6,
        truckLanes: 3,
        transformers: [{ id: 'tx-1', name: 'Depot Substation', ratedKva: 5000, x: 8, z: -16 }],
        energyAssets: [
          {
            id: 'bat-1',
            type: 'battery',
            name: 'Depot Battery Storage',
            capacityKwh: 2000,
            x: 20,
            z: -16,
          },
        ],
      },
      panels: [
        {
          id: 'pnl_demolayout08',
          parentPanelId: null,
          name: 'Depot Main Switchboard',
          breakerRatingAmps: 4000,
          voltageV: 480,
          phases: 3,
          maxContinuousKw: 2660,
          circuits: [
            {
              id: 'cir_demolayout09',
              name: 'Bus Pantograph Circuit',
              breakerRatingAmps: 2000,
              maxContinuousKw: 1330,
            },
            {
              id: 'cir_demolayout10',
              name: 'Bus Plug-In Circuit',
              breakerRatingAmps: 800,
              maxContinuousKw: 532,
            },
          ],
        },
        {
          id: 'pnl_demolayout09',
          parentPanelId: 'pnl_demolayout08',
          name: 'Truck Charging Switchboard',
          breakerRatingAmps: 2500,
          voltageV: 480,
          phases: 3,
          maxContinuousKw: 1660,
          circuits: [
            {
              id: 'cir_demolayout11',
              name: 'Megawatt Charging Circuit',
              breakerRatingAmps: 2000,
              maxContinuousKw: 1330,
            },
            {
              id: 'cir_demolayout12',
              name: 'Box Truck Circuit',
              breakerRatingAmps: 600,
              maxContinuousKw: 400,
            },
          ],
        },
      ],
      // The bus bays (row 0): three depot pantograph poles and two plug-in
      // dispensers, one bay each. The truck lanes (row 1): two megawatt
      // dispensers and a box truck dispenser, one lane each.
      stations: [
        dc(42, 0, 0, 'cir_demolayout09', {
          connectorType: 'OppCharge',
          maxPowerKw: 450,
          message: 'Depot charging: buses leave at 05:30. Park nose in under the pantograph.',
        }),
        dc(43, 1, 0, 'cir_demolayout09', {
          connectorType: 'OppCharge',
          maxPowerKw: 450,
        }),
        dc(44, 2, 0, 'cir_demolayout09', {
          connectorType: 'OppCharge',
          maxPowerKw: 450,
        }),
        dc(45, 3, 0, 'cir_demolayout10', {
          connectorType: 'CCS1',
          maxPowerKw: 150,
        }),
        dc(46, 4, 0, 'cir_demolayout10', {
          connectorType: 'CCS1',
          maxPowerKw: 150,
        }),
        dc(47, 0, 1, 'cir_demolayout11', {
          connectorType: 'cMCS',
          maxPowerKw: 1000,
        }),
        dc(48, 1, 1, 'cir_demolayout11', {
          connectorType: 'cMCS',
          maxPowerKw: 1000,
        }),
        dc(49, 2, 1, 'cir_demolayout12', {
          connectorType: 'CCS1',
          maxPowerKw: 240,
        }),
      ],
    },
  ],
  /**
   * The fleet of Northgate Fleet Depot: transit buses, semi trucks and box
   * trucks, one vehicle per driver, in the colors such fleets run. The depot's
   * stations are the fleet's stations, so the simulator charges them with
   * these drivers' cards and the layout draws their vehicles.
   */
  fleet: {
    id: 'flt_demodepot01',
    name: 'Northgate Transit and Freight',
    description: 'Transit buses, semi trucks and box trucks charging at Northgate Fleet Depot',
    siteId: DEPOT,
    drivers: [
      depotDriver(1, 'Daniel', 'Reyes', {
        make: 'New Flyer',
        model: 'Xcelsior CHARGE NG',
        year: '2025',
        bodyType: 'bus',
        color: 'white',
      }),
      depotDriver(2, 'Grace', 'Okafor', {
        make: 'New Flyer',
        model: 'Xcelsior CHARGE NG',
        year: '2025',
        bodyType: 'bus',
        color: 'blue',
      }),
      depotDriver(3, 'Hector', 'Alvarez', {
        make: 'Gillig',
        model: 'Low Floor Battery Electric',
        year: '2024',
        bodyType: 'bus',
        color: 'green',
      }),
      depotDriver(4, 'Priya', 'Nair', {
        make: 'Gillig',
        model: 'Low Floor Battery Electric',
        year: '2024',
        bodyType: 'bus',
        color: 'yellow_orange',
      }),
      depotDriver(5, 'Samuel', 'Brooks', {
        make: 'New Flyer',
        model: 'Xcelsior CHARGE NG',
        year: '2023',
        bodyType: 'bus',
        color: 'red',
      }),
      depotDriver(6, 'Lena', 'Fischer', {
        make: 'Nova Bus',
        model: 'LFSe+',
        year: '2024',
        bodyType: 'bus',
        color: 'silver',
      }),
      depotDriver(7, 'Marcus', 'Hill', {
        make: 'Freightliner',
        model: 'eCascadia',
        year: '2025',
        bodyType: 'semi_truck',
        color: 'white',
      }),
      depotDriver(8, 'Elena', 'Petrova', {
        make: 'Volvo',
        model: 'VNR Electric',
        year: '2025',
        bodyType: 'semi_truck',
        color: 'blue',
      }),
      depotDriver(9, 'Tom', 'Becker', {
        make: 'Freightliner',
        model: 'eCascadia',
        year: '2024',
        bodyType: 'semi_truck',
        color: 'red',
      }),
      depotDriver(10, 'Aisha', 'Bello', {
        make: 'Tesla',
        model: 'Semi',
        year: '2025',
        bodyType: 'semi_truck',
        color: 'black',
      }),
      depotDriver(11, 'Kevin', 'Tran', {
        make: 'Freightliner',
        model: 'eM2',
        year: '2024',
        bodyType: 'box_truck',
        color: 'white',
      }),
      depotDriver(12, 'Rosa', 'Medina', {
        make: 'Freightliner',
        model: 'eM2',
        year: '2025',
        bodyType: 'box_truck',
        color: 'yellow_orange',
      }),
    ],
  },
  /** The demo maintenance event of Harbor Point (one station). */
  maintenanceEventId: 'mev_demolayout01',
  /** The open AI insight on the faulted station (seed-ai-insights.ts `seedStationFaultInsight`). */
  faultInsightId: 'ain_aidemo000020',
  /** Two more simulated card readers on DC chargers at Harbor Point: one online with a screen, one offline without. */
  terminals: [
    {
      providerDeviceId: 'sim_term_6',
      label: 'Hub DC Reader',
      vendor: 'ID TECH',
      model: 'VP6825',
      serialNumber: '6825SIM000006',
      firmwareVersion: '1.01.106',
      stationId: 'sta_demolayout06',
      evseNumber: 2,
      online: true,
    },
    {
      providerDeviceId: 'sim_term_7',
      label: 'Hub Lane Reader',
      vendor: 'ID TECH',
      model: 'VP7200',
      serialNumber: '7200SIM000007',
      firmwareVersion: '1.00.042',
      stationId: 'sta_demolayout14',
      evseNumber: null,
      online: false,
      pairedBefore: 'sta_demolayout11',
    },
  ],
};

/**
 * The layout settings earlier plans seeded, by site, oldest first: a rerun
 * replaces stored settings only while they are still one of these (an
 * operator's edit stays). The spot and lane sizes the earlier plans also
 * stored are no settings any more (standard dimensions) and are left out:
 * comparing ignores them. Harbor Point's second entry is the plan before the
 * battery and the solar canopy; Lakeside's second the plan before charger
 * counts and mountings (one row of 12 spots turned 90 degrees); Northgate's
 * the custom site it was before the Depot site type.
 */
export const LAYOUT_DEMO_PREVIOUS_SETTINGS: Readonly<Record<string, SiteLayoutSettings[]>> = {
  [HARBOR]: [
    {
      spotsPerRow: 10,
      rows: 2,
      facingDeg: 0,
      transformers: [
        { id: 'tx-1', name: 'Utility Transformer', ratedKva: 2500, x: 36, z: 2.8 },
        { id: 'tx-2', name: 'Solar Carport Tie-In', ratedKva: 750, x: 9.6, z: -6 },
      ],
    },
    {
      siteType: 'parking_lot',
      spotsPerRow: 6,
      rows: 2,
      facingDeg: 0,
      transformers: [
        { id: 'tx-1', name: 'Utility Transformer', ratedKva: 2500, x: -14, z: 2.5 },
        { id: 'tx-2', name: 'Solar Carport Tie-In', ratedKva: 750, x: -14, z: 16 },
      ],
    },
  ],
  [LAKESIDE]: [
    {
      spotsPerRow: 6,
      rows: 3,
      facingDeg: 90,
      transformers: [{ id: 'tx-1', name: 'Lakeside Substation', ratedKva: 1500, x: 26.1, z: 4 }],
    },
    {
      siteType: 'office_retail',
      spotsPerRow: 12,
      rows: 1,
      facingDeg: 90,
      transformers: [],
    },
  ],
  [DEPOT]: [
    {
      siteType: 'custom',
      spotsPerRow: 8,
      rows: 1,
      facingDeg: 0,
      transformers: [{ id: 'tx-1', name: 'Depot Substation', ratedKva: 5000, x: -14, z: 8 }],
      energyAssets: [
        {
          id: 'bat-1',
          type: 'battery',
          name: 'Depot Battery Storage',
          capacityKwh: 2000,
          x: -14,
          z: 20,
        },
      ],
    },
  ],
};
