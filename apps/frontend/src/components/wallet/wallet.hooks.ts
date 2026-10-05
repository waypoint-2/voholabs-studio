'use client';

import { useCallback, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useTranslation } from 'react-i18next';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { ENABLED_PROVIDERS } from '@gitroom/frontend/components/launches/add.provider.component';
import {
  SupportedChannel,
  WalletEstimate,
  WalletPricedAction,
  WalletPriceSection,
  WalletSummary,
  WalletTransactions,
  WalletUsage,
} from '@gitroom/frontend/components/wallet/wallet.types';

// Every wallet SWR key starts with this, so one call refreshes them all.
const WALLET_KEY = 'wallet-summary';
const WALLET_PREFIX = 'wallet-';

const useJson = () => {
  const fetch = useFetch();
  return useCallback(
    async (path: string) => {
      const res = await fetch(path);
      if (!res.ok) {
        throw new Error(`${res.status}`);
      }
      return res.json();
    },
    [fetch]
  );
};

const quiet = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  refreshWhenHidden: false,
  refreshWhenOffline: false,
};

// The wallet summary (GET /wallet). Pass false to skip the request.
export const useWallet = (enabled = true) => {
  const json = useJson();
  const load = useCallback(() => json('/wallet'), [json]);
  // Charges also happen outside this tab (publishing, refunds, MCP), so the
  // balance refreshes on focus and every minute while the tab is visible.
  return useSWR<WalletSummary>(enabled ? WALLET_KEY : null, load, {
    ...quiet,
    revalidateOnFocus: true,
    refreshInterval: 60_000,
  });
};

// type narrows the list: "TOPUP,AUTO_TOPUP", "SPEND" or "REFUND".
export const useWalletTransactions = (
  page: number,
  size: number,
  enabled = true,
  type = ''
) => {
  const json = useJson();
  const load = useCallback(
    () =>
      json(
        `/wallet/transactions?page=${page}&size=${size}${
          type ? `&type=${encodeURIComponent(type)}` : ''
        }`
      ),
    [json, page, size, type]
  );
  return useSWR<WalletTransactions>(
    enabled ? `${WALLET_PREFIX}transactions-${page}-${size}-${type}` : null,
    load,
    { ...quiet, keepPreviousData: true }
  );
};

export const useWalletUsage = (days: number, enabled = true) => {
  const json = useJson();
  const load = useCallback(
    () => json(`/wallet/usage?days=${days}`),
    [json, days]
  );
  return useSWR<WalletUsage>(
    enabled ? `${WALLET_PREFIX}usage-${days}` : null,
    load,
    { ...quiet, keepPreviousData: true }
  );
};

export const useWalletPrices = (enabled = true) => {
  const json = useJson();
  const load = useCallback(() => json('/wallet/prices'), [json]);
  return useSWR<WalletPriceSection[]>(
    enabled ? `${WALLET_PREFIX}prices` : null,
    load,
    quiet
  );
};

export const findAction = (
  sections: WalletPriceSection[] | undefined,
  key: string
): WalletPricedAction | undefined =>
  (sections || []).flatMap((s) => s.actions).find((a) => a.key === key);

export interface EstimateRequest {
  provider: string;
  contents: string[];
  // The post group being edited: what it already paid counts towards the
  // new price. Group-wide, so send it with one request only.
  group?: string;
  // "Repeat post every n days".
  inter?: number;
}

// Adds up the estimates of several providers. The edited group's credit
// comes back in one of them only, so `due` (and the balance after it) is the
// sum of each provider's `due`.
const mergeEstimates = (results: WalletEstimate[]): WalletEstimate => {
  if (results.length === 1) {
    return results[0];
  }
  const sum = (pick: (r: WalletEstimate) => number) =>
    results.reduce((total, r) => total + (pick(r) || 0), 0);
  const first = results[0];
  const due = sum((r) => r.due);
  // Every result was computed against the same balance.
  const balance = first.balanceAfter + (first.due || 0);
  const balanceAfter = balance - due;
  const autoCovers = results.every((r) => r.autoCovers || !r.short);
  return {
    items: results.flatMap((r) => r.items),
    price: sum((r) => r.price),
    alreadyPaid: sum((r) => r.alreadyPaid),
    due,
    balanceAfter,
    short: balanceAfter < 0 && !autoCovers,
    autoCovers: balanceAfter < 0 && autoCovers,
    autoAmount: results.find((r) => r.autoAmount)?.autoAmount ?? null,
    perOccurrence: results.some((r) => r.perOccurrence),
    repeatEveryDays:
      results.find((r) => r.repeatEveryDays)?.repeatEveryDays ?? null,
  };
};

// What saving the composer's contents would cost (POST /wallet/estimate),
// one request per priced provider, added up. Pass null to skip.
export const useWalletEstimate = (requests: EstimateRequest[] | null) => {
  const fetch = useFetch();
  const prefix = `${WALLET_PREFIX}estimate-`;
  const key = requests?.length ? prefix + JSON.stringify(requests) : null;
  const load = useCallback(
    async (k: string): Promise<WalletEstimate> => {
      const list = JSON.parse(k.slice(prefix.length)) as EstimateRequest[];
      const results: WalletEstimate[] = await Promise.all(
        list.map(async (body) => {
          const res = await fetch('/wallet/estimate', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            throw new Error(`${res.status}`);
          }
          return res.json();
        })
      );
      return mergeEstimates(results);
    },
    [fetch, prefix]
  );
  return useSWR<WalletEstimate>(key, load, {
    ...quiet,
    keepPreviousData: true,
  });
};

// Channels the app can connect today: the provider list, narrowed to the
// ones the Add Channel dialog enables.
export const useSupportedChannels = (enabled = true) => {
  const json = useJson();
  const load = useCallback(async () => {
    const data = await json('/integrations');
    return ((data?.social || []) as SupportedChannel[])
      .filter((p) => ENABLED_PROVIDERS.includes(p.identifier))
      .map((p) => ({ identifier: p.identifier, name: p.name }));
  }, [json]);
  return useSWR<SupportedChannel[]>(
    enabled ? `${WALLET_PREFIX}supported-channels` : null,
    load,
    quiet
  );
};

// Refreshes every wallet query and the signed-in user (payAsYouGo). Does
// nothing on a paid plan, which has no wallet to refresh.
export const useRefreshWallet = () => {
  const { mutate } = useSWRConfig();
  const user = useUser();
  const paidPlan = !!user?.tier?.current && user.tier.current !== 'FREE';
  return useCallback(
    async (summary?: WalletSummary) => {
      if (paidPlan) {
        return;
      }
      await Promise.all([
        summary
          ? mutate(WALLET_KEY, summary, { revalidate: false })
          : mutate(WALLET_KEY),
        mutate(
          (key) =>
            typeof key === 'string' &&
            key.startsWith(WALLET_PREFIX) &&
            key !== WALLET_KEY &&
            !key.endsWith('prices') &&
            !key.endsWith('supported-channels')
        ),
        mutate('/user/self'),
      ]);
    },
    [mutate, paidPlan]
  );
};

export const fractionDigits = (currency: string) => {
  try {
    return (
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
};

// Number, money and date formatting for the wallet, in the current language
// and the wallet's currency (never a literal currency symbol).
// The i18n language as a tag Intl accepts ("ka_ge" -> "ka-ge"), or 'en'.
const intlLocale = (language?: string) => {
  const tag = (language || 'en').replace(/_/g, '-');
  try {
    new Intl.NumberFormat(tag);
    return tag;
  } catch {
    return 'en';
  }
};

export const useWalletFormat = (currency?: string) => {
  const { i18n } = useTranslation();
  const locale = intlLocale(i18n?.language);
  return useMemo(() => {
    const safe = (fn: () => Intl.NumberFormat) => {
      try {
        return fn();
      } catch {
        return null;
      }
    };
    const twoDp = safe(
      () =>
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
    );
    const whole = safe(() => new Intl.NumberFormat(locale));
    const oneDp = safe(
      () =>
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })
    );
    // Two decimals without grouping, for a value the user edits.
    const plain = safe(
      () =>
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          useGrouping: false,
        })
    );
    const decimal =
      plain?.formatToParts(1.5).find((p) => p.type === 'decimal')?.value || '.';
    const money = currency
      ? safe(
          () => new Intl.NumberFormat(locale, { style: 'currency', currency })
        )
      : null;
    const moneyShort = currency
      ? safe(
          () =>
            new Intl.NumberFormat(locale, {
              style: 'currency',
              currency,
              minimumFractionDigits: 0,
            })
        )
      : null;
    const digits = currency ? fractionDigits(currency) : 2;
    const factor = Math.pow(10, digits);
    const dateTime = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const dayMonth = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    const dayMonthYear = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const monthName = new Intl.DateTimeFormat(locale, { month: 'short' });

    return {
      locale,
      // Hundredths of a credit -> "1,234.50"
      credits: (hundredths: number) =>
        twoDp ? twoDp.format(hundredths / 100) : (hundredths / 100).toFixed(2),
      number: (n: number) => (whole ? whole.format(n) : String(n)),
      // 5 -> "5.0" (or "5,0")
      oneDecimal: (n: number) => (oneDp ? oneDp.format(n) : n.toFixed(1)),
      // Hundredths of a credit -> "1234.50" (or "1234,50"), for an input.
      plainCredits: (hundredths: number) =>
        plain ? plain.format(hundredths / 100) : (hundredths / 100).toFixed(2),
      // What the user typed (either decimal mark) -> hundredths of a credit.
      parseCredits: (text: string) => {
        const n = parseFloat(
          text
            .replace(/\s/g, '')
            .replace(decimal === ',' ? /\./g : /,/g, '')
            .replace(',', '.')
        );
        return Number.isFinite(n) ? Math.round(n * 100) : 0;
      },
      // Keeps digits and the locale's decimal mark while typing.
      creditsInput: (text: string) =>
        text.replace(decimal === ',' ? /[^0-9,]/g : /[^0-9.]/g, ''),
      // Smallest currency unit -> "$12.50"
      money: (minor: number) => (money ? money.format(minor / factor) : ''),
      // Smallest currency unit -> "$10" when whole, "$12.50" otherwise
      moneyShort: (minor: number) =>
        moneyShort ? moneyShort.format(minor / factor) : '',
      currencySymbol: () =>
        money?.formatToParts(0).find((p) => p.type === 'currency')?.value || '',
      // Minor units per major unit of the currency (100 for USD).
      factor,
      digits,
      // Hundredths of a credit bought with an amount in minor currency units.
      creditsFor: (minor: number, creditsPerUnit: number) =>
        Math.round((minor * creditsPerUnit * 100) / factor),
      // Minor currency units worth an amount in hundredths of a credit.
      moneyFor: (hundredths: number, creditsPerUnit: number) =>
        Math.round((hundredths * factor) / (creditsPerUnit * 100)),
      dateTime: (iso: string) => dateTime.format(new Date(iso)),
      dayMonth: (d: Date) => dayMonth.format(d),
      dayMonthYear: (d: Date) => dayMonthYear.format(d),
      monthName: (d: Date) => monthName.format(d),
    };
  }, [locale, currency]);
};

export type WalletFormat = ReturnType<typeof useWalletFormat>;
