'use client';

import React, { FC, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useClickAway } from '@uidotdev/usehooks';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  useWallet,
  useWalletFormat,
  useWalletPrices,
  useWalletTransactions,
  WalletFormat,
} from '@gitroom/frontend/components/wallet/wallet.hooks';
import { openTopUp } from '@gitroom/frontend/components/wallet/wallet.events';
import { WalletHost } from '@gitroom/frontend/components/wallet/wallet.host';
import { txName } from '@gitroom/frontend/components/wallet/wallet.text';
import { WalletSummary } from '@gitroom/frontend/components/wallet/wallet.types';
import {
  ArrowIcon,
  BTN_PRIMARY,
  DANGER_SOFT,
  DANGER_TEXT,
  InfoIcon,
  Num,
  PILL_MUTED,
  PILL_TEAL,
  PlusIcon,
  POS_BG,
  POS_TEXT,
  WalletIcon,
} from '@gitroom/frontend/components/wallet/wallet.ui';

// Below this balance (hundredths of a credit) the wallet reads as low when no
// auto top-up threshold is set.
const DEFAULT_THRESHOLD = 25000;

// The threshold a wallet reads as low under: its auto top-up threshold, else
// the default from the billing settings.
export const lowThreshold = (w: WalletSummary) =>
  w.autoTopUp.threshold ?? w.topUp?.defaultThreshold ?? DEFAULT_THRESHOLD;

export const isLow = (w: WalletSummary) =>
  w.payAsYouGo && w.balance < lowThreshold(w);

export const rateLine = (
  t: ReturnType<typeof useT>,
  f: WalletFormat,
  w: WalletSummary
) =>
  w.topUp
    ? t('wallet_rate_line', '{{money}} = {{credits}} credits', {
        money: f.moneyShort(f.factor),
        credits: f.credits(f.creditsFor(f.factor, w.topUp.creditsPerUnit)),
      })
    : '';

// Red notice when scheduled usage in the forecast window needs more credits
// than the wallet has and auto top-up cannot cover it.
export const ForecastNotice: FC<{
  wallet: WalletSummary;
  onTopUp?: () => void;
}> = ({ wallet, onTopUp }) => {
  const t = useT();
  const f = useWalletFormat(wallet.currency);
  if (!wallet.forecast?.short) return null;
  return (
    <div
      role="alert"
      className={clsx(
        'flex gap-[10px] items-start p-[12px] rounded-[8px] text-[13px] leading-[1.45]',
        DANGER_SOFT
      )}
    >
      <span className={clsx(DANGER_TEXT, 'mt-[1px]')}>
        <InfoIcon />
      </span>
      <span>
        {t(
          'wallet_forecast_short',
          "Scheduled usage in the next {{hours}} hours needs {{needed}} credits. You have {{balance}}. Anything not covered won't go out.",
          {
            hours: wallet.forecast.windowHours,
            needed: f.credits(wallet.forecast.needed),
            balance: f.credits(wallet.balance),
          }
        )}{' '}
        <button
          type="button"
          onClick={() => {
            onTopUp?.();
            openTopUp();
          }}
          className="underline underline-offset-2 font-[600]"
        >
          {t('wallet_top_up', 'Top up')}
        </button>
      </span>
    </div>
  );
};

const RecentTransactions: FC<{ f: WalletFormat }> = ({ f }) => {
  const t = useT();
  const { data } = useWalletTransactions(0, 3);
  const { data: prices } = useWalletPrices();
  const find = (key: string) =>
    prices?.flatMap((s) => s.actions).find((a) => a.key === key);
  return (
    <div className="border-t border-newTableBorder pb-[6px]">
      <div className="px-[20px] pt-[14px] pb-[4px] text-[11px] font-[600] uppercase tracking-[0.08em] text-textItemBlur">
        {t('wallet_recent', 'Recent')}
      </div>
      {!data &&
        [0, 1, 2].map((n) => (
          <div
            key={n}
            className="flex items-center gap-[12px] px-[20px] py-[9px]"
          >
            <div className="flex-1 flex flex-col gap-[6px]">
              <div className="h-[12px] w-[60%] rounded-[4px] bg-newBgLineColor animate-pulse" />
              <div className="h-[10px] w-[40%] rounded-[4px] bg-newBgLineColor animate-pulse" />
            </div>
            <div className="h-[12px] w-[48px] rounded-[4px] bg-newBgLineColor animate-pulse" />
          </div>
        ))}
      {!!data && !data.items.length && (
        <div className="px-[20px] py-[9px] text-[13px] text-textItemBlur">
          {t('wallet_no_transactions', 'No transactions yet')}
        </div>
      )}
      {(data?.items || []).slice(0, 3).map((tx) => {
        const pos = tx.amount > 0;
        return (
          <div
            key={tx.id}
            className="flex items-center gap-[12px] px-[20px] py-[9px]"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-newTextColor truncate">
                {txName(t, tx, find)}
              </div>
              <div className="text-[11px] text-textItemBlur truncate">
                {f.dateTime(tx.createdAt)}
              </div>
            </div>
            <div
              className={clsx(
                'text-[13px] font-[600]',
                pos ? POS_TEXT : 'text-newTextColor'
              )}
            >
              <Num>
                {pos ? '+' : '−'}
                {f.credits(Math.abs(tx.amount))}
              </Num>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const PopoverLink: FC<{ href: string; label: string; onClick: () => void }> = ({
  href,
  label,
  onClick,
}) => (
  <Link
    href={href}
    onClick={onClick}
    className="flex items-center justify-between gap-[8px] px-[20px] h-[48px] text-[14px] hover:bg-boxHover transition-colors"
  >
    {label} <ArrowIcon />
  </Link>
);

// The popover's Top up. Until top-ups are switched on it stays visible but
// disabled, with a short note instead of the rate.
const TopUpButton: FC<{
  wallet: WalletSummary;
  onClick: () => void;
  rate?: boolean;
}> = ({ wallet, onClick, rate = true }) => {
  const t = useT();
  const f = useWalletFormat(wallet.currency);
  const off = !wallet.paymentsEnabled;
  const note = off
    ? t('wallet_topup_not_available', 'Top-ups are not available yet.')
    : rate
    ? rateLine(t, f, wallet)
    : '';
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={off}
        className={clsx(BTN_PRIMARY, 'w-full')}
      >
        <PlusIcon /> {t('wallet_top_up', 'Top up')}
      </button>
      {!!note && (
        <div className="text-[12px] text-textItemBlur text-center -mt-[6px]">
          {note}
        </div>
      )}
    </>
  );
};

const WalletPopover: FC<{ wallet: WalletSummary; close: () => void }> = ({
  wallet,
  close,
}) => {
  const t = useT();
  const f = useWalletFormat(wallet.currency);
  const low = isLow(wallet);
  const auto = wallet.autoTopUp;
  const topUp = () => {
    close();
    openTopUp();
  };
  const wrap =
    'opacity-0 animate-normalFadeDown absolute top-[calc(100%+14px)] end-[-8px] w-[min(360px,calc(100vw-32px))] max-h-[calc(100vh-110px)] overflow-y-auto bg-newBgColorInner text-newTextColor rounded-[16px] flex flex-col border border-newTableBorder shadow-menu z-[600] cursor-default';

  if (!wallet.payAsYouGo) {
    return (
      <div className={wrap} role="dialog" aria-label={t('wallet', 'Wallet')}>
        <div className="p-[20px] flex flex-col gap-[16px]">
          <div className="flex items-center justify-between gap-[8px]">
            <div className="text-[13px] text-textItemBlur">
              {t('wallet', 'Wallet')}
            </div>
            <span className={PILL_MUTED}>
              {wallet.frozen
                ? t('wallet_on_hold', 'On hold')
                : t('wallet_free_plan', 'Free plan')}
            </span>
          </div>
          <div className="flex items-baseline gap-[8px]">
            <span className="text-[40px] font-[600] leading-none tabular-nums text-textItemBlur">
              <Num>{f.credits(wallet.frozen ? wallet.balance : 0)}</Num>
            </span>
            <span className="text-[14px] text-textItemBlur">
              {t('wallet_credits', 'credits')}
            </span>
          </div>
          <div className="text-[14px] leading-[1.5] text-newTextColor/80">
            {t(
              'wallet_free_explainer',
              'Credits pay for pay-per-use features. Everything free stays free.'
            )}
          </div>
          <TopUpButton wallet={wallet} onClick={topUp} />
        </div>
        <div className="border-t border-newTableBorder">
          <PopoverLink
            href="/wallet/prices"
            label={t('wallet_see_prices', 'See prices')}
            onClick={close}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={wrap} role="dialog" aria-label={t('wallet', 'Wallet')}>
      <div className="p-[20px] flex flex-col gap-[16px]">
        <div className="flex items-center justify-between gap-[8px]">
          <div className="text-[13px] text-textItemBlur">
            {t('wallet_balance', 'Wallet balance')}
          </div>
          <span className={PILL_TEAL}>{t('wallet_payg', 'Pay-as-you-go')}</span>
        </div>
        <div>
          <div className="flex items-baseline gap-[8px]">
            <span
              className={clsx(
                'text-[40px] font-[600] leading-none tabular-nums',
                low && 'text-warm'
              )}
            >
              <Num>{f.credits(wallet.balance)}</Num>
            </span>
            <span className="text-[14px] text-textItemBlur">
              {t('wallet_credits', 'credits')}
            </span>
          </div>
          {!!wallet.topUp && (
            <div className="text-[13px] text-textItemBlur mt-[8px] tabular-nums">
              ≈{' '}
              {f.money(f.moneyFor(wallet.balance, wallet.topUp.creditsPerUnit))}
            </div>
          )}
        </div>
        <ForecastNotice wallet={wallet} onTopUp={close} />
        <TopUpButton wallet={wallet} onClick={topUp} rate={false} />
        <div className="flex items-center gap-[8px] text-[13px]">
          <span
            className={clsx(
              'w-[8px] h-[8px] rounded-full shrink-0',
              auto.enabled ? POS_BG : 'bg-newSep'
            )}
          />
          <span
            className={clsx(
              'flex-1',
              auto.enabled ? 'text-newTextColor/90' : 'text-textItemBlur'
            )}
          >
            {auto.enabled
              ? t(
                  'wallet_auto_on_line',
                  'Auto top-up on. Adds {{amount}} below {{threshold}}',
                  {
                    amount: f.moneyShort(auto.amount || 0),
                    threshold: f.credits(lowThreshold(wallet)),
                  }
                )
              : t('wallet_auto_off', 'Auto top-up off')}
          </span>
          <Link
            href="/wallet"
            onClick={close}
            className="text-textItemBlur hover:text-newTextColor underline underline-offset-2"
          >
            {auto.enabled
              ? t('wallet_edit', 'Edit')
              : t('wallet_turn_on', 'Turn on')}
          </Link>
        </div>
      </div>
      <RecentTransactions f={f} />
      <div className="border-t border-newTableBorder grid grid-cols-2 divide-x divide-newTableBorder rtl:divide-x-reverse">
        <PopoverLink
          href="/wallet/prices"
          label={t('wallet_view_prices', 'View prices')}
          onClick={close}
        />
        <PopoverLink
          href="/wallet"
          label={t('wallet_view_billing', 'View billing')}
          onClick={close}
        />
      </div>
    </div>
  );
};

// The wallet in the top bar, next to the notifications bell. Rendered only for
// organizations on the free tier (pay-as-you-go included); paid plans never
// see it.
export const WalletHeader: FC = () => {
  const t = useT();
  const { data: wallet } = useWallet();
  const f = useWalletFormat(wallet?.currency);
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false));

  // Rendered for the free tier only (the layout decides), so it shows as soon
  // as the wallet loads, even before top-ups are switched on.
  if (!wallet) {
    return <WalletHost />;
  }

  const low = isLow(wallet) || wallet.balance < 0;
  const label = wallet.payAsYouGo
    ? t('wallet_aria_balance', 'Wallet, balance {{credits}} credits', {
        credits: f.credits(wallet.balance),
      })
    : t('wallet_aria_free', 'Wallet, free plan. Top up to unlock more.');

  return (
    <>
      <WalletHost />
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={clsx(
            'relative flex items-center gap-[8px] h-[36px] ps-[8px] pe-[10px] -mx-[8px] rounded-[8px] transition-colors hover:text-newTextColor hover:bg-boxHover',
            open && 'bg-boxHover text-newTextColor'
          )}
        >
          <span className="relative">
            <WalletIcon size={22} />
            {low && (
              <span className="absolute -top-[2px] -end-[3px] w-[8px] h-[8px] rounded-full bg-warm border-[2px] border-newBgColorInner" />
            )}
          </span>
          {wallet.payAsYouGo ? (
            <span
              className={clsx(
                'text-[14px] font-[600] tabular-nums',
                low ? 'text-warm' : 'text-newTextColor'
              )}
            >
              <Num>{f.credits(wallet.balance)}</Num>
            </span>
          ) : (
            <span className="text-[13px] font-[600] whitespace-nowrap">
              {t('wallet_top_up', 'Top up')}
            </span>
          )}
        </button>
        {open && <WalletPopover wallet={wallet} close={() => setOpen(false)} />}
      </div>
    </>
  );
};
