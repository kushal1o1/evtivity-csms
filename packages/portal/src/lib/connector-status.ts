// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

// OCPP 1.6: available, preparing, finishing. OCPP 2.1: available, occupied, ev_connected.
export const STARTABLE_STATUSES = [
  'available',
  'occupied',
  'preparing',
  'ev_connected',
  'finishing',
];

export function connectorStatusVariant(): 'secondary' {
  return 'secondary';
}

export function connectorStatusClassName(status: string): string {
  switch (status) {
    case 'available':
      return 'bg-green-500 text-green-50 hover:bg-green-500/80';
    case 'finishing':
      return 'bg-violet-500 text-violet-50 hover:bg-violet-500/80';
    case 'occupied':
    case 'charging':
    case 'discharging':
      return 'bg-blue-500 text-blue-50 hover:bg-blue-500/80';
    case 'preparing':
    case 'ev_connected':
      return 'bg-cyan-500 text-cyan-50 hover:bg-cyan-500/80';
    case 'reserved':
      return 'bg-orange-500 text-orange-50 hover:bg-orange-500/80';
    case 'suspended_ev':
    case 'suspended_evse':
    case 'idle':
      return 'bg-yellow-500 text-yellow-50 hover:bg-yellow-500/80';
    case 'faulted':
    case 'unavailable':
    default:
      return 'bg-red-500 text-red-50 hover:bg-red-500/80';
  }
}
