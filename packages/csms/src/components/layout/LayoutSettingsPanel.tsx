// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

// The Site Settings of Edit Layout: the site type (read-only here, changed on
// the Details tab) and only the settings of that type. Parking Lot: spots per
// row, rows, facing, the transformers and the batteries and solar canopies.
// Office or Retail: the charger positions and how they are mounted. Curbside:
// the chargers on each side of the street. Depot: the bus bays, the truck
// lanes and the facing, with the transformers, batteries and solar canopies
// beside the yard. Spot sizes are standard. The other
// types' values stay in the settings, so switching the type back restores
// them. Every valid change shows in the layout at once and is saved with the
// layout Save.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Trash2 } from 'lucide-react';
import {
  CHARGER_MOUNTINGS,
  LAYOUT_FACINGS,
  LAYOUT_GRID_LIMITS,
  chargerMountingOf,
  clampFreePoint,
  showsBatteries,
  showsSolar,
  showsTransformers,
  usesFreePositions,
  energyAssetsOf,
  layoutCapacity,
  layoutEquipmentGround,
  placeEnergyAsset,
  siteTypeOf,
  snapTransformerToGrass,
  TRANSFORMER_CLEARANCE_M,
  type ChargerMounting,
  type LayoutFacing,
  type LayoutTransformer,
  type SiteLayoutSettings,
  type SiteType,
} from '@evtivity/lib/site-layout';
import { CreateButton } from '@/components/create-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SITE_TYPE_LABEL } from '@/components/site/site-type';
import { cn } from '@/lib/utils';
import { EnergyAssetsSettings } from './EnergyAssetsSettings';

const L = LAYOUT_GRID_LIMITS;

/** The count fields of every site type (all whole numbers). */
export type CountField =
  | 'spotsPerRow'
  | 'rows'
  | 'chargers'
  | 'chargersLeft'
  | 'chargersRight'
  | 'busBays'
  | 'truckLanes';

/** The count fields each site type shows. */
export const COUNT_FIELDS: Record<SiteType, readonly CountField[]> = {
  parking_lot: ['spotsPerRow', 'rows'],
  office_retail: ['chargers'],
  curbside: ['chargersLeft', 'chargersRight'],
  depot: ['busBays', 'truckLanes'],
  custom: [],
};

function limitOf(field: CountField): { min: number; max: number } {
  if (field === 'chargers') return L.chargers;
  if (field === 'chargersLeft' || field === 'chargersRight') return L.chargersPerSide;
  if (field === 'busBays' || field === 'truckLanes') return L.depotSpots;
  return L[field];
}

/** A typed count, or null when it is empty, not a whole number or out of range. */
export function parseCountField(field: CountField, text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  if (!Number.isInteger(value)) return null;
  const { min, max } = limitOf(field);
  return value < min || value > max ? null : value;
}

/** The two counts a site type needs one of (a street's sides, a depot's areas), or null. */
const PAIRED_COUNTS: Partial<Record<SiteType, readonly [CountField, CountField]>> = {
  curbside: ['chargersLeft', 'chargersRight'],
  depot: ['busBays', 'truckLanes'],
};

/** Whether both paired counts are typed as 0 (a street needs a charger, a depot a bay or lane). */
function pairEmpty(type: SiteType, drafts: Record<CountField, string>): boolean {
  const pair = PAIRED_COUNTS[type];
  return (
    pair != null &&
    parseCountField(pair[0], drafts[pair[0]]) === 0 &&
    parseCountField(pair[1], drafts[pair[1]]) === 0
  );
}

/** Whether the typed counts of a site type are valid together. */
function countsValid(type: SiteType, drafts: Record<CountField, string>): boolean {
  const fields = COUNT_FIELDS[type];
  if (fields.some((f) => parseCountField(f, drafts[f]) == null)) return false;
  return !pairEmpty(type, drafts);
}

/** A typed rated kVA: null for empty, undefined when invalid. */
export function parseRatedKva(text: string): number | null | undefined {
  if (text.trim() === '') return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < L.ratedKva.min || value > L.ratedKva.max)
    return undefined;
  return value;
}

/** A new transformer: on the grass at the front of the lot, right of the others. */
export function newTransformer(settings: SiteLayoutSettings): LayoutTransformer {
  let n = settings.transformers.length + 1;
  const ids = new Set(settings.transformers.map((t) => t.id));
  while (ids.has(`tx-${String(n)}`)) n++;
  // A custom site: left of the site origin, below the others.
  if (usesFreePositions(settings)) {
    const spot = clampFreePoint(-8, -4 - 4 * settings.transformers.length);
    return { id: `tx-${String(n)}`, name: null, ratedKva: null, ...spot };
  }
  // On the grass behind the lot (a depot: behind its yard), right of the others.
  const ground = layoutEquipmentGround(settings);
  const spot = snapTransformerToGrass(
    Math.min(ground.maxX, ground.minX + 4 + 4 * settings.transformers.length),
    ground.minZ - TRANSFORMER_CLEARANCE_M - 1.5,
    settings,
  );
  return { id: `tx-${String(n)}`, name: null, ratedKva: null, ...spot };
}

const MOUNTING_LABEL = {
  wall: 'sites.layoutSettings.mountingWall',
  stall: 'sites.layoutSettings.mountingStall',
} as const satisfies Record<ChargerMounting, string>;

const MOUNTING_HINT = {
  wall: 'sites.layoutSettings.mountingWallHint',
  stall: 'sites.layoutSettings.mountingStallHint',
} as const satisfies Record<ChargerMounting, string>;

interface LayoutSettingsPanelProps {
  siteId: string;
  settings: SiteLayoutSettings;
  /** Stations at the site: a layout with fewer spots than this cannot be saved. */
  stationCount: number;
  onChange: (settings: SiteLayoutSettings) => void;
  /** True while a typed value is invalid (Save waits for it). */
  onInvalidChange: (invalid: boolean) => void;
}

export function LayoutSettingsPanel({
  siteId,
  settings,
  stationCount,
  onChange,
  onInvalidChange,
}: LayoutSettingsPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const siteType = siteTypeOf(settings);
  const [drafts, setDrafts] = useState<Record<CountField, string>>(() => ({
    spotsPerRow: String(settings.spotsPerRow),
    rows: String(settings.rows),
    chargers: String(settings.chargers ?? 1),
    chargersLeft: String(settings.chargersLeft ?? 0),
    chargersRight: String(settings.chargersRight ?? 0),
    busBays: String(settings.busBays ?? 1),
    truckLanes: String(settings.truckLanes ?? 0),
  }));
  const [kvaDrafts, setKvaDrafts] = useState<Record<string, string>>({});
  const [assetsInvalid, setAssetsInvalid] = useState(false);

  const kvaText = (tr: LayoutTransformer): string =>
    kvaDrafts[tr.id] ?? (tr.ratedKva != null ? String(tr.ratedKva) : '');
  const invalidKva = (text: string): boolean => parseRatedKva(text) === undefined;
  const sidesEmpty = pairEmpty(siteType, drafts);

  function report(
    nextDrafts: Record<CountField, string>,
    nextKva: Record<string, string>,
    nextAssetsInvalid: boolean = assetsInvalid,
  ): void {
    const bad =
      !countsValid(siteType, nextDrafts) ||
      Object.values(nextKva).some(invalidKva) ||
      nextAssetsInvalid;
    onInvalidChange(bad);
  }

  function setCountField(field: CountField, text: string): void {
    const next = { ...drafts, [field]: text };
    setDrafts(next);
    report(next, kvaDrafts);
    const value = parseCountField(field, text);
    if (value == null || !countsValid(siteType, next)) return;
    const changed = { ...settings, [field]: value };
    if (siteType !== 'parking_lot' && siteType !== 'depot') {
      onChange(changed);
      return;
    }
    // Transformers and batteries stay on the grass when the lot (a depot's
    // yard) grows under them; a solar canopy stays over a row of the lot.
    onChange({
      ...changed,
      transformers: changed.transformers.map((tr) => ({
        ...tr,
        ...snapTransformerToGrass(tr.x, tr.z, changed),
      })),
      energyAssets: energyAssetsOf(changed).map((a) => placeEnergyAsset(a, changed)),
    });
  }

  function updateTransformer(id: string, patch: Partial<LayoutTransformer>): void {
    onChange({
      ...settings,
      transformers: settings.transformers.map((tr) => (tr.id === id ? { ...tr, ...patch } : tr)),
    });
  }

  const capacity = layoutCapacity(settings);
  const mounting = chargerMountingOf(settings);
  const id = (name: string): string => `layout-settings-${name}`;

  return (
    <section
      className="mb-3 space-y-4 rounded-lg border bg-card p-4"
      aria-labelledby={id('title')}
      data-testid="layout-settings-panel"
    >
      <div>
        <h3 id={id('title')} className="text-sm font-semibold">
          {t('sites.layoutSettings.title')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('sites.layoutSettings.hint')}</p>
      </div>
      <div className="space-y-1 text-sm" data-testid="layout-settings-site-type">
        <p className="text-muted-foreground">{t('sites.layoutSettings.siteType')}</p>
        <p className="font-medium">{t(SITE_TYPE_LABEL[siteType])}</p>
        <Link
          to={`/sites/${siteId}`}
          className="text-xs text-link underline-offset-4 hover:underline"
        >
          {t('sites.layoutSettings.siteTypeOnDetails')}
        </Link>
      </div>
      {siteType === 'custom' && (
        <p className="text-xs text-muted-foreground" data-testid="layout-settings-custom-hint">
          {t('sites.layoutSettings.customHint')}
        </p>
      )}
      <div
        className={cn(
          'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6',
          siteType === 'custom' && 'hidden',
        )}
      >
        {COUNT_FIELDS[siteType].map((field) => {
          const invalid = parseCountField(field, drafts[field]) == null || sidesEmpty;
          const limit = limitOf(field);
          return (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={id(field)}>{t(`sites.layoutSettings.${field}`)}</Label>
              <Input
                id={id(field)}
                type="number"
                inputMode="numeric"
                min={limit.min}
                max={limit.max}
                step={1}
                value={drafts[field]}
                aria-invalid={invalid}
                onChange={(e) => {
                  setCountField(field, e.target.value);
                }}
              />
              <p className={invalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                {t('sites.layoutSettings.range', { min: limit.min, max: limit.max, unit: '' })}
              </p>
            </div>
          );
        })}
        {(siteType === 'parking_lot' || siteType === 'depot') && (
          <div className="space-y-1.5">
            <Label htmlFor={id('facing')}>{t('sites.layoutSettings.facingDeg')}</Label>
            <Select
              id={id('facing')}
              value={String(settings.facingDeg)}
              onChange={(e) => {
                onChange({ ...settings, facingDeg: Number(e.target.value) as LayoutFacing });
              }}
            >
              {LAYOUT_FACINGS.map((deg) => (
                <option key={deg} value={deg}>
                  {t('sites.layoutSettings.facingOption', { deg })}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{t('sites.layoutSettings.facingHint')}</p>
          </div>
        )}
        {siteType === 'office_retail' && (
          <div className="col-span-2 space-y-1.5 sm:col-span-2">
            <Label htmlFor={id('mounting')}>{t('sites.layoutSettings.mounting')}</Label>
            <Select
              id={id('mounting')}
              value={mounting}
              onChange={(e) => {
                onChange({ ...settings, mounting: e.target.value as ChargerMounting });
              }}
            >
              {CHARGER_MOUNTINGS.map((m) => (
                <option key={m} value={m}>
                  {t(MOUNTING_LABEL[m])}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{t(MOUNTING_HINT[mounting])}</p>
          </div>
        )}
      </div>
      {siteType === 'office_retail' && (
        <p className="text-xs text-muted-foreground">{t('sites.layoutSettings.chargersHint')}</p>
      )}
      {siteType === 'curbside' && (
        <p className={sidesEmpty ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}>
          {t('sites.layoutSettings.sidesHint')}
        </p>
      )}
      {siteType === 'depot' && (
        <p
          className={sidesEmpty ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}
          data-testid="layout-settings-depot-hint"
        >
          {t('sites.layoutSettings.depotHint')}
        </p>
      )}
      {capacity < stationCount && (
        <p className="text-sm text-destructive" role="alert">
          {siteType === 'parking_lot'
            ? t('sites.layoutSettings.tooSmall', { spots: capacity, stations: stationCount })
            : siteType === 'depot'
              ? t('sites.layoutSettings.tooFewDepotSpots', {
                  spots: capacity,
                  stations: stationCount,
                })
              : t('sites.layoutSettings.tooFewChargers', {
                  spots: capacity,
                  stations: stationCount,
                })}
        </p>
      )}
      {showsTransformers(settings) && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">{t('sites.layoutSettings.transformers')}</h4>
              <p className="text-xs text-muted-foreground">
                {siteType === 'custom'
                  ? t('sites.layoutSettings.transformersHintCustom')
                  : t('sites.layoutSettings.transformersHint')}
              </p>
            </div>
            <CreateButton
              variant="outline"
              label={t('sites.layoutSettings.addTransformer')}
              disabled={settings.transformers.length >= L.transformers.max}
              onClick={() => {
                onChange({
                  ...settings,
                  transformers: [...settings.transformers, newTransformer(settings)],
                });
              }}
            />
          </div>
          {settings.transformers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('sites.layoutSettings.noTransformers')}
            </p>
          ) : (
            <ul className="grid gap-2">
              {settings.transformers.map((tr, i) => {
                const kva = kvaText(tr);
                const kvaInvalid = invalidKva(kva);
                return (
                  <li
                    key={tr.id}
                    className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_10rem_auto]"
                    data-testid={`layout-transformer-${tr.id}`}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor={id(`name-${tr.id}`)}>
                        {t('sites.layoutSettings.transformerName', { n: i + 1 })}
                      </Label>
                      <Input
                        id={id(`name-${tr.id}`)}
                        maxLength={L.transformerNameLength}
                        value={tr.name ?? ''}
                        placeholder={t('sites.layoutView.transformer')}
                        onChange={(e) => {
                          const text = e.target.value;
                          updateTransformer(tr.id, { name: text.trim() === '' ? null : text });
                        }}
                      />
                    </div>
                    <div className="col-span-2 row-start-2 space-y-1.5 sm:col-span-1 sm:row-start-auto">
                      <Label htmlFor={id(`kva-${tr.id}`)}>
                        {t('sites.layoutSettings.ratedKva')}
                      </Label>
                      <Input
                        id={id(`kva-${tr.id}`)}
                        type="number"
                        inputMode="numeric"
                        min={L.ratedKva.min}
                        max={L.ratedKva.max}
                        step={1}
                        value={kva}
                        aria-invalid={kvaInvalid}
                        onChange={(e) => {
                          const text = e.target.value;
                          const nextKva = { ...kvaDrafts, [tr.id]: text };
                          setKvaDrafts(nextKva);
                          report(drafts, nextKva);
                          const value = parseRatedKva(text);
                          if (value !== undefined) updateTransformer(tr.id, { ratedKva: value });
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t('sites.layoutSettings.removeTransformer', { n: i + 1 })}
                      onClick={() => {
                        const nextKva = Object.fromEntries(
                          Object.entries(kvaDrafts).filter(([id]) => id !== tr.id),
                        );
                        setKvaDrafts(nextKva);
                        report(drafts, nextKva);
                        onChange({
                          ...settings,
                          transformers: settings.transformers.filter((o) => o.id !== tr.id),
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {(showsBatteries(settings) || showsSolar(settings)) && (
        <EnergyAssetsSettings
          settings={settings}
          onChange={onChange}
          onInvalidChange={(invalid) => {
            setAssetsInvalid(invalid);
            report(drafts, kvaDrafts, invalid);
          }}
        />
      )}
    </section>
  );
}
