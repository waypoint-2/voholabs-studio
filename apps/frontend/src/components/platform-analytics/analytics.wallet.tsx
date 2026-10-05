'use client';

import { FC } from 'react';
import Link from 'next/link';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  findAction,
  useWallet,
  useWalletPrices,
} from '@gitroom/frontend/components/wallet/wallet.hooks';
import { useWalletAccess } from '@gitroom/frontend/components/wallet-locks/wallet.access';
import {
  CoinsIcon,
  LockIcon,
} from '@gitroom/frontend/components/wallet-locks/wallet.icons';
import { openTopUp } from '@gitroom/frontend/components/wallet/wallet.bridge';

// Fetch options for an analytics read: a wallet refusal (402, wallet: true)
// comes back to the screen, which shows it inline, instead of opening the
// top-up dialog (layout.context).
export const WALLET_INLINE = { walletInline: true } as RequestInit;

export interface AnalyticsWalletRefusal {
  walletRefused: true;
}

export const isWalletRefusal = (
  data: unknown
): data is AnalyticsWalletRefusal =>
  !!data && (data as AnalyticsWalletRefusal).walletRefused === true;

// The body of an analytics response, or the wallet refusal.
export const readAnalytics = async (res: Response) => {
  if (res.status === 402) {
    const body = await res.json().catch(() => null);
    return body?.wallet
      ? ({ walletRefused: true } as AnalyticsWalletRefusal)
      : [];
  }
  return res.json();
};

const providerOf = (identifier?: string) =>
  (identifier || '').toLowerCase().split('-')[0];

// Whether a channel's live analytics can be read, decided before asking:
// "blocked" when the wallet pays per read for this network, its balance is
// used up and auto top-up cannot refill it (the server would refuse);
// "wait" while that is being worked out. Paid plans are always "open".
// `funded` turns true once the balance is above zero again.
export const useAnalyticsWalletGate = (identifier?: string) => {
  const access = useWalletAccess();
  const walletOrg = access === 'free' || access === 'payg';
  const { data: prices, error: pricesError } = useWalletPrices(walletOrg);
  const { data: wallet, error: walletError } = useWallet(walletOrg);
  const funded = wallet ? wallet.balance > 0 : undefined;

  if (!walletOrg || pricesError || walletError) {
    return { state: 'open' as const, funded };
  }
  if (!prices || !wallet) {
    return { state: 'wait' as const, funded };
  }
  const read = findAction(prices, `${providerOf(identifier)}.post_read`);
  if (!read || read.billing !== 'PER_USE' || wallet.balance > 0) {
    return { state: 'open' as const, funded };
  }
  const auto = wallet.autoTopUp;
  const autoCanRefill =
    auto.enabled &&
    !!wallet.card &&
    !!auto.amount &&
    (!auto.monthlyCap || auto.usedThisMonth + auto.amount <= auto.monthlyCap);
  return {
    state: autoCanRefill ? ('open' as const) : ('blocked' as const),
    funded,
  };
};

// Shown in place of the charts when the wallet cannot pay for a live read.
export const AnalyticsWalletNotice: FC<{ scope: 'channel' | 'post' }> = ({
  scope,
}) => {
  const t = useT();
  return (
    <div className="col-span-full flex flex-col items-center justify-center text-center gap-[14px] py-[40px] px-[24px] bg-newTableHeader border border-warmRing rounded-[12px]">
      <div className="relative w-[48px] h-[48px] rounded-full bg-warmSoft text-warm flex items-center justify-center">
        <CoinsIcon size={22} />
        <span className="absolute -bottom-[2px] -end-[2px] w-[20px] h-[20px] rounded-full bg-newBgColorInner border border-newTableBorder text-warm flex items-center justify-center">
          <LockIcon size={10} />
        </span>
      </div>
      <p className="text-[15px] font-[500] text-newTableText">
        {scope === 'channel'
          ? t(
              'analytics_wallet_channel',
              'Not enough credits to load analytics for this channel.'
            )
          : t(
              'analytics_wallet_post',
              'Not enough credits to load analytics for this post.'
            )}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-[8px]">
        <button
          type="button"
          onClick={() => openTopUp()}
          className="inline-flex items-center gap-[6px] h-[36px] px-[16px] rounded-[8px] bg-warm text-newBgColor text-[14px] font-[600] hover:brightness-110 transition"
        >
          <CoinsIcon size={14} />
          {t('wallet_top_up', 'Top up')}
        </button>
        <Link
          href="/wallet/prices"
          className="inline-flex items-center h-[36px] px-[16px] rounded-[8px] border border-newTableBorder text-[14px] font-[600] text-newTableText hover:bg-newBgLineColor transition-colors"
        >
          {t('wallet_see_prices', 'See prices')}
        </Link>
      </div>
    </div>
  );
};
