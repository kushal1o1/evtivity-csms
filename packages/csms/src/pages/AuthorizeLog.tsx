// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useTranslation } from 'react-i18next';
import { AuthorizeLogView } from '@/components/AuthorizeLogView';

export function AuthorizeLog(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">{t('tokens.authorizeLog')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('tokens.authorizeLogDescription')}</p>
      </div>

      <AuthorizeLogView />
    </div>
  );
}
