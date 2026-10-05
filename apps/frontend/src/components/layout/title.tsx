'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
import {
  hasTitleExtras,
  TitleExtras,
} from '@gitroom/frontend/components/wallet-locks/title.extras';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useWalletAccess } from '@gitroom/frontend/components/wallet-locks/wallet.access';
export const Title = () => {
  const path = usePathname();
  const { all: menuItems } = useMenuItem();
  const t = useT();
  const paidPlan = useWalletAccess() === 'plan';
  const current = useMemo(() => {
    return menuItems.find((item) => path.indexOf(item.path) > -1);
  }, [path]);
  // Wallet pages are reached from the wallet in the top bar, not the menu.
  const walletTitle = path.startsWith('/wallet/prices')
    ? t('wallet_prices_title', 'Prices')
    : path.startsWith('/wallet')
    ? t('wallet_billing_title', 'Billing')
    : undefined;

  // A paid plan sees the title as it always did.
  if (paidPlan) {
    return <h1>{current?.name}</h1>;
  }

  if (!current || (!current.titleInfo && !hasTitleExtras(current.path))) {
    return <h1>{current?.name || walletTitle}</h1>;
  }

  return (
    <h1 className="flex items-center gap-[10px]">
      {current.name}
      <TitleExtras path={current.path} info={current.titleInfo} />
    </h1>
  );
};
