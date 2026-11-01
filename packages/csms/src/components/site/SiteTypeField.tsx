// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

// The Site Type select of the site Details edit form and the New Site page.

import { useTranslation } from 'react-i18next';
import { SITE_TYPES, type SiteType } from '@evtivity/lib/site-layout';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SITE_TYPE_LABEL } from './site-type';

interface SiteTypeFieldProps {
  id: string;
  value: SiteType;
  onChange: (value: SiteType) => void;
}

export function SiteTypeField({ id, value, onChange }: SiteTypeFieldProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="leading-6">
        {t('sites.layoutSettings.siteType')}
      </Label>
      <Select
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value as SiteType);
        }}
      >
        {SITE_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(SITE_TYPE_LABEL[type])}
          </option>
        ))}
      </Select>
      <p className="text-xs text-muted-foreground">{t('sites.layoutSettings.siteTypeHint')}</p>
    </div>
  );
}
