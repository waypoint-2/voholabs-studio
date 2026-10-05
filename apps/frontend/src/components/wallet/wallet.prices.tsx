'use client';

import { useTrackView } from '@gitroom/helpers/utils/use.fire.events';
import React, { FC, ReactNode, useMemo } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  useSupportedChannels,
  useWallet,
  useWalletFormat,
  useWalletPrices,
} from '@gitroom/frontend/components/wallet/wallet.hooks';
import { openTopUp } from '@gitroom/frontend/components/wallet/wallet.events';
import { rateLine } from '@gitroom/frontend/components/wallet/wallet.header';
import {
  Loading,
  NoWallet,
  useHasWallet,
  WalletPageShell,
} from '@gitroom/frontend/components/wallet/wallet.billing';
import {
  actionDescription,
  actionName,
  sectionLabel,
  tAllowance,
  tModel,
  tMonthly,
  tPrice,
} from '@gitroom/frontend/components/wallet/wallet.text';
import {
  SupportedChannel,
  WalletPriceSection,
  WalletPricedAction,
} from '@gitroom/frontend/components/wallet/wallet.types';
import {
  BTN_PRIMARY,
  CARD,
  CoinsIcon,
  InfoIcon,
  InfoTip,
  PILL,
  PlusIcon,
  POS_BG,
  POS_SOFT,
  POS_TEXT,
  ProviderLogo,
  SCROLL,
  sectionIcon,
} from '@gitroom/frontend/components/wallet/wallet.ui';

// The section that lists channels also gets a computed row for every
// supported channel without a priced action: those are free.
const CHANNELS_SECTION = 'channels';

interface Row {
  key: string;
  icon: ReactNode;
  name: string;
  description: string;
  model: string;
  free: boolean;
  allowance: string;
  price: string;
  info: string | null;
}

const Pill: FC<{ free: boolean; label: string }> = ({ free, label }) =>
  free ? (
    <span className={clsx(PILL, POS_SOFT, POS_TEXT)}>{label}</span>
  ) : (
    <span className={clsx(PILL, 'gap-[5px] bg-warmSoft text-warm')}>
      <CoinsIcon size={11} /> {label}
    </span>
  );

const IconStack: FC<{ providers: string[] }> = ({ providers }) => (
  <div className="flex items-center shrink-0">
    {providers.slice(0, 3).map((p, n) => (
      <span
        key={p}
        className={clsx(
          'relative w-[22px] h-[22px] rounded-full overflow-hidden ring-2 ring-[var(--new-bgColorInner)] bg-white flex items-center justify-center',
          n > 0 && '-ms-[6px]'
        )}
        style={{ zIndex: 3 - n }}
      >
        <ProviderLogo provider={p} size={22} />
      </span>
    ))}
  </div>
);

const freeChannelsRow = (
  t: ReturnType<typeof useT>,
  section: WalletPriceSection,
  channels: SupportedChannel[]
): Row | null => {
  const priced = new Set(
    section.actions.map((a) => a.provider).filter(Boolean)
  );
  const free = channels.filter((c) => !priced.has(c.identifier));
  if (!free.length) return null;
  const names = [
    ...new Set(free.map((c) => c.name.replace(/\n\([\s\S]*\)/, '').trim())),
  ];
  // One logo per provider family (linkedin and linkedin-page share one).
  const families = [
    ...new Map(
      free.map((c) => [c.identifier.split('-')[0], c.identifier])
    ).values(),
  ];
  return {
    key: 'all-other-channels',
    icon: <IconStack providers={families} />,
    name: t('wallet_all_other_channels', 'All other channels'),
    description: names.join(', '),
    model: t('wallet_model_free', 'Free'),
    free: true,
    allowance: t('wallet_allowance_unlimited', 'Unlimited use'),
    price: t('wallet_price_free', 'Free'),
    info: null,
  };
};

const PriceTable: FC<{ rows: Row[] }> = ({ rows }) => {
  const t = useT();
  return (
    <div className={clsx('overflow-x-auto', SCROLL)}>
      <table className="w-full min-w-[680px] text-[14px] table-fixed">
        <thead>
          <tr className="bg-newTableHeader text-[12px] text-textItemBlur h-[36px]">
            <th className="text-start font-[500] px-[20px] w-[36%]">
              {t('wallet_col_item', 'Item')}
            </th>
            <th className="text-start font-[500] px-[20px]">
              {t('wallet_col_pricing', 'Pricing')}
            </th>
            <th className="text-start font-[500] px-[20px]">
              {t('wallet_col_included', 'Included free')}
            </th>
            <th className="text-end font-[500] px-[20px] w-[200px]">
              {t('wallet_col_price', 'Price')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className="border-t border-newTableBorder h-[60px] hover:bg-boxHover"
            >
              <td className="px-[20px] py-[10px]">
                <div className="flex items-center gap-[10px]">
                  {r.icon}
                  <div className="min-w-0">
                    <div className="font-[600] flex items-center gap-[6px]">
                      <span>{r.name}</span>
                      {!!r.info && (
                        <InfoTip text={r.info} className="font-[500]" />
                      )}
                    </div>
                    {!!r.description && (
                      <div className="text-[12px] text-textItemBlur">
                        {r.description}
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-[20px]">
                <Pill free={r.free} label={r.model} />
              </td>
              <td
                className={clsx(
                  'px-[20px]',
                  r.allowance ? POS_TEXT : 'text-textItemBlur'
                )}
              >
                {r.allowance || t('wallet_allowance_none', 'None')}
              </td>
              <td className="px-[20px] text-end">
                <span
                  className={clsx(
                    'font-[600] whitespace-nowrap',
                    r.free ? POS_TEXT : 'tabular-nums'
                  )}
                >
                  {r.price}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// The Prices page, generated only from GET /wallet/prices: no per-row copy.
export const WalletPricesPage: FC = () => {
  const hasWallet = useHasWallet();
  return hasWallet ? <WalletPrices /> : <NoWallet />;
};

const WalletPrices: FC = () => {
  const t = useT();
  useTrackView('prices_viewed');
  const { data: wallet } = useWallet(true);
  const { data: sections, error } = useWalletPrices(true);
  const { data: channels } = useSupportedChannels(true);
  const f = useWalletFormat(wallet?.currency);

  const rendered = useMemo(
    () =>
      (sections || []).map((section) => {
        const rows: Row[] = section.actions.map((a: WalletPricedAction) => ({
          key: a.key,
          icon: a.provider ? <ProviderLogo provider={a.provider} /> : null,
          name: actionName(t, a),
          description: actionDescription(t, a),
          model: tModel(t, a),
          free: a.billing === 'UNLOCK',
          allowance: tAllowance(t, a),
          price: tPrice(t, f, a),
          info: a.billing === 'MONTHLY' ? tMonthly(t, f, a) : null,
        }));
        if (section.key === CHANNELS_SECTION && channels) {
          const free = freeChannelsRow(t, section, channels);
          if (free) rows.push(free);
        }
        return { key: section.key, label: sectionLabel(t, section.key), rows };
      }),
    [sections, channels, t, f]
  );

  if (!sections) {
    return error ? (
      <div className="flex-1 bg-newBgColorInner flex items-center justify-center text-textItemBlur text-[14px] p-[20px]">
        {t('wallet_prices_unavailable', 'Prices are not available right now.')}
      </div>
    ) : (
      <Loading />
    );
  }

  return (
    <WalletPageShell max={1400}>
      <div className="flex items-start gap-[16px] flex-wrap">
        <div className="flex-1 min-w-[280px] flex gap-[10px] items-start p-[14px] rounded-[8px] bg-newTableHeader text-[13px] leading-[1.5]">
          <span className="text-textItemBlur mt-[1px]">
            <InfoIcon />
          </span>
          <span>
            <span className="font-[600]">
              {t(
                'wallet_prices_follow',
                "Prices follow the provider's price and update automatically."
              )}
            </span>{' '}
            {!!wallet && (
              <span className="text-textItemBlur">
                {rateLine(t, f, wallet)}.
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => openTopUp()}
          className={clsx(BTN_PRIMARY, 'shrink-0')}
        >
          <PlusIcon /> {t('wallet_top_up', 'Top up')}
        </button>
      </div>
      <div
        className="flex items-center gap-[8px] flex-wrap"
        role="navigation"
        aria-label={t('wallet_price_categories', 'Price categories')}
      >
        {rendered.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() =>
              document
                .getElementById(`wallet-prices-${s.key}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="h-[32px] px-[12px] rounded-[8px] border border-newTableBorder text-[13px] text-textItemBlur hover:text-newTextColor hover:border-newSep"
          >
            {s.label}
          </button>
        ))}
        <span className="flex-1" />
        <span className="flex items-center gap-[14px] text-[12px] text-textItemBlur">
          <span className="flex items-center gap-[6px]">
            <span className={clsx('w-[8px] h-[8px] rounded-full', POS_BG)} />
            {t('wallet_legend_free', 'Free')}
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="text-warm">
              <CoinsIcon size={12} />
            </span>
            {t('wallet_legend_pay_per_use', 'Pay-per-use')}
          </span>
        </span>
      </div>
      {rendered.map((s) => (
        <section
          key={s.key}
          id={`wallet-prices-${s.key}`}
          className={clsx(CARD, 'overflow-hidden scroll-mt-[20px] min-w-0')}
        >
          <div className="flex items-center gap-[12px] px-[20px] py-[16px]">
            <div className="w-[36px] h-[36px] rounded-[8px] bg-newBgLineColor flex items-center justify-center text-textItemBlur">
              {sectionIcon(s.key)}
            </div>
            <div className="flex-1 text-[16px] font-[600]">{s.label}</div>
          </div>
          <PriceTable rows={s.rows} />
        </section>
      ))}
    </WalletPageShell>
  );
};
