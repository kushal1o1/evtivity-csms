// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/lib/auth', () => ({
  useHasPermission: () => true,
  useHasAllSiteAccess: () => true,
  useHasCompanyWidePermission: () => true,
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: apiMock };
});
vi.mock('@/components/GoogleMapPicker', () => ({ GoogleMapPicker: () => null }));

import { IntegrationsSettings } from '../IntegrationsSettings';

let pncData: Record<string, unknown> = {};

function setup(sub: string, settings: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (s: Record<string, unknown>) => (
    <MemoryRouter initialEntries={[`/settings?sub=${sub}`]}>
      <QueryClientProvider client={client}>
        <IntegrationsSettings settings={s} />
      </QueryClientProvider>
    </MemoryRouter>
  );
  const view = render(tree(settings));
  return {
    client,
    reload: (s: Record<string, unknown>) => {
      view.rerender(tree(s));
    },
  };
}

function input(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) {
    throw new Error(`no input #${id}`);
  }
  return el as HTMLInputElement;
}

function type(id: string, value: string): void {
  fireEvent.change(input(id), { target: { value } });
}

beforeEach(() => {
  pncData = {};
  apiMock.get.mockImplementation((url: string) =>
    Promise.resolve(
      url === '/v1/pnc/settings'
        ? pncData
        : url === '/v1/users/me/mfa'
          ? { factorProofKinds: [], mfaMethod: null }
          : {},
    ),
  );
  apiMock.put.mockResolvedValue({ success: true });
  apiMock.post.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

interface CardCase {
  name: string;
  sub: string;
  /** The field edited. */
  id: string;
  key: string;
  stored: string | number;
  edited: string;
  /** Another value of the same field, as a reload brings it. */
  reloaded: string | number;
  /** Another stored value of the card, so a reload of a dirty card changes something. */
  other: Record<string, unknown>;
  /** Index of the card's Save button in the sub tab. */
  saveIndex?: number;
  base?: Record<string, unknown>;
}

const S3_BASE = {
  's3.bucket': 'bucket',
  's3.region': 'us-east-1',
  's3.accessKeyIdEnc': 'AKIA',
  's3.secretAccessKeyEnc': 'secret',
};

const CASES: CardCase[] = [
  {
    name: 'OCPP defaults',
    sub: 'ocppDefaults',
    id: 'ocpp-connection-timeout',
    key: 'ocpp.connectionTimeout',
    stored: 120,
    edited: '0150',
    reloaded: 90,
    other: { 'ocpp.resetRetries': 5 },
    saveIndex: -1,
  },
  {
    name: 'guest limits',
    sub: 'guest',
    id: 'guest-starts-per-ip',
    key: 'guest.startsPerIpPerHour',
    stored: 30,
    edited: '040',
    reloaded: 10,
    other: { 'guest.declinesPerIpPerHour': 9 },
  },
  {
    name: 'idle grace period',
    sub: 'idling',
    id: 'idling-grace-period',
    key: 'idling.gracePeriodMinutes',
    stored: 30,
    edited: '045',
    reloaded: 15,
    other: { 'support.enabled': false },
  },
  {
    name: 'stale session timeout',
    sub: 'session',
    id: 'stale-session-timeout',
    key: 'session.staleTimeoutHours',
    stored: 24,
    edited: '048',
    reloaded: 12,
    other: { 'session.evConnectionTimeoutSeconds': 99 },
    saveIndex: 0,
  },
  {
    name: 'EV connection timeout',
    sub: 'session',
    id: 'ev-connection-timeout',
    key: 'session.evConnectionTimeoutSeconds',
    stored: 180,
    edited: '0200',
    reloaded: 60,
    other: { 'session.staleTimeoutHours': 7 },
    saveIndex: 1,
  },
  {
    name: 'Google Maps',
    sub: 'googleMaps',
    id: 'google-maps-zoom',
    key: 'googleMaps.defaultZoom',
    stored: '4',
    edited: '07',
    reloaded: '9',
    other: { 'googleMaps.defaultLat': '10' },
  },
  {
    name: 'S3',
    sub: 's3',
    id: 's3-bucket',
    key: 's3.bucket',
    stored: 'bucket',
    edited: 'new-bucket ',
    reloaded: 'reloaded-bucket',
    other: { 's3.region': 'eu-west-1' },
    saveIndex: 0,
    base: S3_BASE,
  },
  {
    name: 'FTP',
    sub: 'ftp',
    id: 'ftp-host',
    key: 'ftp.host',
    stored: 'ftp.example.com',
    edited: 'ftp.new.example.com ',
    reloaded: 'ftp.other.example.com',
    other: { 'ftp.port': 2121 },
  },
  {
    name: 'Sentry',
    sub: 'sentry',
    id: 'sentry-environment',
    key: 'sentry.environment',
    stored: 'production',
    edited: ' staging ',
    reloaded: 'qa',
    other: { 'sentry.dsn': 'https://key@sentry.example/1' },
  },
];

function saveButton(c: CardCase): HTMLElement {
  const buttons = screen.getAllByRole('button', { name: /save/i });
  const index = c.saveIndex ?? 0;
  const button = index < 0 ? buttons[buttons.length - 1] : buttons[index];
  if (button == null) throw new Error('no Save button');
  return button;
}

describe.each(CASES)('IntegrationsSettings $name card on a settings reload', (c) => {
  const stored = { ...c.base, [c.key]: c.stored };

  it('keeps unsaved edits', () => {
    const { reload } = setup(c.sub, stored);
    type(c.id, c.edited);
    reload({ ...stored, ...c.other });
    expect(input(c.id).value).toBe(c.edited);
  });

  it('takes the stored values while clean', () => {
    const { reload } = setup(c.sub, stored);
    reload({ ...stored, [c.key]: c.reloaded });
    expect(input(c.id).value).toBe(String(c.reloaded));
  });

  it('takes the stored form of its own save on the next reload', async () => {
    const { reload } = setup(c.sub, stored);
    type(c.id, c.edited);
    fireEvent.click(saveButton(c));
    await waitFor(() => {
      expect(apiMock.put).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // The server stores the saved value in its own form.
    reload({ ...stored, [c.key]: c.reloaded });
    expect(input(c.id).value).toBe(String(c.reloaded));
  });
});

describe('IntegrationsSettings S3 provider on a settings reload', () => {
  it('keeps a provider switched to S3-compatible when another setting reloads', () => {
    const { reload } = setup('s3', S3_BASE);
    type('s3-provider', 's3-compatible');
    reload({ ...S3_BASE, 'ocpp.connectionTimeout': 60 });
    expect(input('s3-provider').value).toBe('s3-compatible');
    expect(input('s3-endpoint')).toBeTruthy();
  });
});

describe('IntegrationsSettings Plug and Charge card on a settings reload', () => {
  async function renderPnc() {
    pncData = { 'pnc.enabled': true, 'pnc.expirationWarningDays': 30 };
    const view = setup('pnc', {});
    await waitFor(() => {
      expect(input('pnc-warning-days').value).toBe('30');
    });
    return view;
  }

  async function refetch(client: QueryClient, data: Record<string, unknown>) {
    pncData = data;
    await act(async () => {
      await client.refetchQueries({ queryKey: ['pnc-settings'] });
      // React Query notifies its observers on the next tick.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('keeps unsaved edits', async () => {
    const { client } = await renderPnc();
    type('pnc-warning-days', '45');
    await refetch(client, { ...pncData, 'pnc.expirationCriticalDays': 3 });
    expect(input('pnc-warning-days').value).toBe('45');
  });

  it('takes the stored values while clean', async () => {
    const { client } = await renderPnc();
    await refetch(client, { ...pncData, 'pnc.expirationWarningDays': 60 });
    expect(input('pnc-warning-days').value).toBe('60');
  });

  it('takes the stored form of its own save on the next reload', async () => {
    const { client } = await renderPnc();
    type('pnc-warning-days', '045');
    fireEvent.click(screen.getAllByRole('button', { name: /save/i })[0] as HTMLElement);
    await waitFor(() => {
      expect(apiMock.put).toHaveBeenCalledWith(
        '/v1/pnc/settings',
        expect.objectContaining({ expirationWarningDays: 45 }),
      );
    });
    await refetch(client, { ...pncData, 'pnc.expirationWarningDays': 45 });
    expect(input('pnc-warning-days').value).toBe('45');
  });
});
