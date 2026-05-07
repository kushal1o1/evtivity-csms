// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import type { StationMessageState } from './station-message.js';

export const STATION_MESSAGE_DEFAULTS: Record<StationMessageState, string> = {
  available: '{{companyName}}\n{{stationOcppId}}\n{{pricingDisplay}}\nPlug in to start',
  occupied: '{{stationOcppId}}\nTap card or open app\nto start charging',
  reserved:
    'Reserved\n{{#if driverFirstName}}for {{driverFirstName}}{{/if}}\nuntil {{reservationExpiresAt}}',
  charging: 'Charging\n{{energyKwh}} kWh / {{powerKw}} kW\n{{costFormatted}}\n{{elapsedFormatted}}',
  suspended: 'Charging paused\n{{#if idleFeeRate}}Idle fee {{idleFeeRate}} after grace{{/if}}',
  discharging: 'Discharging to grid\n{{energyKwh}} kWh sent\n{{costFormatted}}',
  faulted: 'Station fault\nContact support\n{{supportPhone}}',
  unavailable: 'Temporarily unavailable\n{{companyName}}',
};
