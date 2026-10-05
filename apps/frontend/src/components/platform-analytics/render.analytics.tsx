import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Integration } from '@prisma/client';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { ChartSocial } from '@gitroom/frontend/components/analytics/chart-social';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  findAction,
  useRefreshWallet,
  useWalletFormat,
  useWalletPrices,
  useWalletUsage,
} from '@gitroom/frontend/components/wallet/wallet.hooks';
import {
  TONE_TEXT,
  toneFor,
  useWalletAccess,
} from '@gitroom/frontend/components/wallet-locks/wallet.access';
import { CoinsIcon } from '@gitroom/frontend/components/wallet-locks/wallet.icons';
import {
  AnalyticsWalletNotice,
  isWalletRefusal,
  readAnalytics,
  useAnalyticsWalletGate,
  WALLET_INLINE,
} from '@gitroom/frontend/components/platform-analytics/analytics.wallet';

// The days the analytics read spend is counted over.
const READ_SPEND_DAYS = 30;

const providerOf = (identifier?: string) =>
  (identifier || '').toLowerCase().split('-')[0];

// When the channel analytics on screen were read from the network (null:
// not cached). GET /analytics/:integration/updated.
const useAnalyticsUpdatedAt = (
  integrationId: string,
  date: number,
  enabled = true
) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch(`/analytics/${integrationId}/updated?date=${date}`);
    if (!res.ok) {
      return null;
    }
    return ((await res.json())?.updatedAt as string | null) || null;
  }, [fetch, integrationId, date]);
  return useSWR(
    enabled ? `/analytics-updated-${integrationId}-${date}` : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  );
};

// "Updated <time>" with a Refresh button. On a pay-as-you-go workspace whose
// wallet pays for this network's reads, it also says what a refresh can
// cost and what analytics reads have cost lately, all from the price row
// and the ledger.
const AnalyticsFreshness: FC<{
  integration: Integration;
  date: number;
  refreshing: boolean;
  onRefresh: () => void;
}> = ({ integration, date, refreshing, onRefresh }) => {
  const t = useT();
  const format = useWalletFormat();
  const access = useWalletAccess();
  const payg = access === 'payg';
  const { data: updatedAt } = useAnalyticsUpdatedAt(integration.id, date);
  const { data: prices } = useWalletPrices(payg);
  const { data: usage } = useWalletUsage(READ_SPEND_DAYS, payg);
  const readKey = `${providerOf(integration.providerIdentifier)}.post_read`;
  const readAction = payg ? findAction(prices, readKey) : undefined;
  const readSpend = (usage?.byAction || [])
    .filter((a) => a.key === readKey)
    .reduce((sum, a) => sum + a.total, 0);
  const tone = readAction ? toneFor(readAction.billing) : 'warm';

  return (
    <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[6px] mb-[12px] text-[13px] text-newTableText">
      <span className="opacity-70">
        {updatedAt
          ? t('analytics_updated_at', 'Updated {{time}}', {
              time: format.dateTime(updatedAt),
            })
          : t('analytics_updated_now', 'Updated just now')}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        {...(readAction
          ? {
              'data-tooltip-id': 'tooltip',
              'data-tooltip-content': t(
                'analytics_refresh_cost',
                'Refreshing reads your posts again from the network. Each post is charged once a day, whichever period or refresh reads it first: {{price}} credits per read ({{action}}). Posts already read today are not charged again.',
                {
                  price: format.credits(readAction.price),
                  action: readAction.name,
                }
              ),
            }
          : {})}
        className={clsx(
          'inline-flex items-center gap-[6px] h-[28px] px-[10px] rounded-[8px] border text-[12px] font-[600] transition-colors disabled:opacity-50',
          readAction
            ? 'border-warmRing ' + TONE_TEXT[tone]
            : 'border-newTableBorder hover:bg-newTableHeader'
        )}
      >
        {readAction && <CoinsIcon size={13} />}
        {refreshing
          ? t('analytics_refreshing', 'Refreshing...')
          : t('analytics_refresh', 'Refresh')}
      </button>
      {readAction && (
        <span
          className={clsx(
            'inline-flex items-center gap-[6px]',
            TONE_TEXT[tone]
          )}
        >
          <CoinsIcon size={13} />
          {t(
            'analytics_read_spend',
            'Analytics reads, last {{days}} days: {{credits}} credits',
            {
              days: READ_SPEND_DAYS,
              credits: format.credits(Math.max(0, readSpend)),
            }
          )}
        </span>
      )}
    </div>
  );
};

interface AnalyticsDataItem {
  label: string;
  data: Array<{ total: number; date: string }>;
  average?: boolean;
  percentageChange?: number;
}

const TrendIndicator: FC<{ value: number; average?: boolean }> = ({
  value,
  average,
}) => {
  if (value === 0) return null;

  const isPositive = value > 0;
  const displayValue = Math.abs(value).toFixed(1);

  return (
    <div
      className={`flex items-center gap-[4px] text-[13px] font-medium ${
        isPositive ? 'text-[#32d583]' : 'text-[#f97066]'
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className={isPositive ? '' : 'rotate-180'}
      >
        <path
          d="M6 2.5L10 7.5H2L6 2.5Z"
          fill="currentColor"
        />
      </svg>
      <span>
        {displayValue}
        {average ? 'pp' : '%'}
      </span>
    </div>
  );
};

const AnalyticsCard: FC<{
  item: AnalyticsDataItem;
  total: string | number;
  index: number;
}> = ({ item, total, index }) => {
  const colorVariants = ['purple', 'green', 'blue'] as const;
  const color = colorVariants[index % colorVariants.length];

  const hasDataPoints = item.data.length >= 1;

  return (
    <div className="group relative">
      <div
        className={`
          flex flex-col h-full
          bg-newTableHeader
          border border-newTableBorder
          rounded-[12px]
          overflow-hidden
          transition-all duration-200
          hover:border-[#20808D]/50
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[16px] pt-[14px] pb-[8px]">
          <div className="flex items-center gap-[10px]">
            <div
              className={`
                w-[8px] h-[8px] rounded-full
                ${color === 'purple' ? 'bg-[#20808D]' : ''}
                ${color === 'green' ? 'bg-[#32d583]' : ''}
                ${color === 'blue' ? 'bg-[#1d9bf0]' : ''}
              `}
            />
            <span className="text-[15px] font-medium text-newTableText">
              {item.label}
            </span>
          </div>
          {item.percentageChange !== undefined && (
            <TrendIndicator value={item.percentageChange} average={item.average} />
          )}
        </div>

        {/* Content */}
        {hasDataPoints ? (
          <>
            {/* Chart */}
            <div className="flex-1 px-[12px] py-[8px]">
              <div className="h-[120px] relative">
                <ChartSocial data={item.data} color={color} key={`chart-${index}`} />
              </div>
            </div>

            {/* Value */}
            <div className="px-[16px] pb-[14px]">
              <div className="text-[36px] leading-[42px] font-semibold tracking-tight">
                {total}
              </div>
            </div>
          </>
        ) : (
          /* Single value display */
          <div className="flex-1 flex flex-col items-center justify-center py-[32px] px-[16px]">
            <div className="text-[48px] leading-[56px] font-semibold tracking-tight">
              {total}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyState: FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const t = useT();

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-[48px] px-[24px] bg-newTableHeader border border-newTableBorder rounded-[12px]">
      <div className="w-[48px] h-[48px] mb-[16px] rounded-full bg-[#20808D]/10 flex items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-[#20808D]"
        >
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path d="M12 8v4l2 2" />
        </svg>
      </div>
      <p className="text-[15px] text-newTableText text-center mb-[12px]">
        {t(
          'this_channel_needs_to_be_refreshed',
          'This channel needs to be refreshed to display analytics'
        )}
      </p>
      <button
        onClick={onRefresh}
        className="inline-flex items-center gap-[6px] px-[16px] py-[8px] text-[14px] font-medium text-white bg-[#20808D] hover:bg-[#5023b8] rounded-[8px] transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
        </svg>
        {t('refresh_channel', 'Refresh Channel')}
      </button>
    </div>
  );
};

export const RenderAnalytics: FC<{
  integration: Integration;
  date: number;
}> = (props) => {
  const { integration, date } = props;
  const [loading, setLoading] = useState(true);
  const fetch = useFetch();
  // A paid plan sees analytics as before: no freshness line or refresh.
  const paidPlan = useWalletAccess() === 'plan';
  // A wallet that cannot pay for a live read: not asked at all.
  const gate = useAnalyticsWalletGate(integration.providerIdentifier);

  const load = useCallback(async () => {
    setLoading(true);
    const load = readAnalytics(
      await fetch(`/analytics/${integration.id}?date=${date}`, WALLET_INLINE)
    );
    setLoading(false);
    return load;
  }, [integration, date]);

  // Reading analytics can charge reads, so show the new balance once loaded.
  const refreshWalletAfterLoad = useRefreshWallet();
  const { data, mutate } = useSWR(
    gate.state === 'open' ? `/analytics-${integration?.id}-${date}` : null,
    load,
    {
      onSuccess: () => {
        if (!paidPlan) {
          refreshWalletAfterLoad();
        }
      },
      refreshInterval: 0,
      refreshWhenHidden: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      refreshWhenOffline: false,
      revalidateOnMount: true,
    }
  );

  const refreshChannel = useCallback(
    (
        integrationData: Integration & {
          identifier: string;
        }
      ) =>
      async () => {
        const { url } = await (
          await fetch(
            `/integrations/social/${integrationData.identifier}?refresh=${integrationData.internalId}`,
            {
              method: 'GET',
            }
          )
        ).json();
        window.location.href = url;
      },
    []
  );

  const t = useT();
  const { mutate: mutateUpdated } = useAnalyticsUpdatedAt(
    integration.id,
    date,
    !paidPlan
  );
  const refreshWallet = useRefreshWallet();
  const [refreshing, setRefreshing] = useState(false);
  // Skips the one-hour cache and reads the network again.
  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/analytics/${integration.id}?date=${date}&fresh=1`,
        WALLET_INLINE
      );
      const fresh = await readAnalytics(res);
      await mutate(fresh, { revalidate: false });
    } finally {
      setRefreshing(false);
      mutateUpdated();
      refreshWallet();
    }
  }, [fetch, integration, date, mutate, mutateUpdated, refreshWallet]);

  // The endpoint normally returns an array, but on an error response (e.g. a
  // 500) the body is an object - coerce to an array so a single failing
  // channel never crashes the whole analytics page.
  const items: AnalyticsDataItem[] = useMemo(
    () => (Array.isArray(data) ? data : []),
    [data]
  );

  const totals = useMemo(() => {
    return items.map((p: AnalyticsDataItem) => {
      const value =
        (p?.data?.reduce((acc: number, curr: { total: number }) => acc + curr.total, 0) || 0) /
        (p.average ? p.data?.length || 1 : 1);
      if (p.average) {
        return value.toFixed(2) + '%';
      }
      return new Intl.NumberFormat().format(Math.round(value));
    });
  }, [items]);

  // Refused for credits, then topped up: read again.
  const refused = isWalletRefusal(data);
  useEffect(() => {
    if (refused && gate.funded) {
      mutate();
    }
  }, [refused, gate.funded, mutate]);

  if (gate.state === 'blocked' || refused) {
    return (
      <div className="grid grid-cols-1">
        <AnalyticsWalletNotice scope="channel" />
      </div>
    );
  }

  if (gate.state === 'wait' || loading) {
    return (
      <div className="flex items-center justify-center py-[48px]">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <>
      {!paidPlan && (
        <AnalyticsFreshness
          integration={integration}
          date={date}
          refreshing={refreshing}
          onRefresh={refreshNow}
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[16px]">
        {items.length === 0 && (
          <EmptyState onRefresh={refreshChannel(integration as any)} />
        )}
        {items.map((item: AnalyticsDataItem, index: number) => (
          <AnalyticsCard
            key={`analytics-${index}`}
            item={item}
            total={totals[index]}
            index={index}
          />
        ))}
      </div>
    </>
  );
};
