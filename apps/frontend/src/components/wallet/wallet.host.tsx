'use client';

import React, { FC, useCallback, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useAddProvider } from '@gitroom/frontend/components/launches/add.provider.component';
import {
  useSupportedChannels,
  useWallet,
  useWalletFormat,
  useWalletPrices,
} from '@gitroom/frontend/components/wallet/wallet.hooks';
import {
  OPEN_TOP_UP,
  OpenTopUpOptions,
  walletEvents,
} from '@gitroom/frontend/components/wallet/wallet.events';
import { TopUpModal } from '@gitroom/frontend/components/wallet/top.up.modal';
import {
  actionDescription,
  sectionLabel,
} from '@gitroom/frontend/components/wallet/wallet.text';
import {
  BTN_PRIMARY,
  BTN_SIMPLE,
  CheckIcon,
  POS_SOFT,
  POS_TEXT,
  ProviderLogo,
  sectionIcon,
} from '@gitroom/frontend/components/wallet/wallet.ui';

const modalSize = (px: number) => `min(${px}px, calc(100vw - 32px))`;

const TOP_UP_MODAL_ID = 'wallet-top-up';

// Opens the top-up dialog. Used by openTopUp() through <WalletHost />.
const useTopUpModal = () => {
  const modals = useModals();
  const t = useT();
  return useCallback(
    (options: OpenTopUpOptions = {}) => {
      modals.openModal({
        id: TOP_UP_MODAL_ID,
        title: t('wallet_top_up', 'Top up'),
        size: modalSize(540),
        children: <TopUpModal context={options.context} />,
      });
    },
    [modals, t]
  );
};

// English defaults for the line under a feature a first top-up opens; other
// features fall back to their price row's description.
const UNLOCK_COPY: Record<string, string> = {
  brief: 'Tell your agent about your brand.',
  skills: 'Ready-made skills your agent can use.',
};

// What a first top-up opened, read from the price rows that need one: one
// line per provider (a channel shows its own name and logo).
const useUnlocks = () => {
  const t = useT();
  const { data: sections } = useWalletPrices();
  const { data: channels } = useSupportedChannels();
  return useMemo(() => {
    const seen = new Map<
      string,
      {
        key: string;
        name: string;
        description: string;
        channel: boolean;
        category: string | null;
      }
    >();
    for (const section of sections || []) {
      for (const a of section.actions) {
        const id = a.provider || a.category || a.key;
        if (!a.requiresTopUp || seen.has(id)) continue;
        const channel = channels?.find((c) => c.identifier === a.provider);
        seen.set(id, {
          key: id,
          channel: !!channel,
          category: a.category,
          name: channel
            ? channel.name.replace(/\n\(.*\)/, '').trim()
            : sectionLabel(t, a.category || id),
          description: channel
            ? t(
                'wallet_unlock_channel',
                'Connect your account. Each post charges credits.'
              )
            : t(
                `wallet_unlock_${id}`,
                UNLOCK_COPY[id] || actionDescription(t, a) || ''
              ),
        });
      }
    }
    return [...seen.values()];
  }, [sections, channels, t]);
};

const TopUpSuccess: FC<{
  credits: number | null;
  close: () => void;
}> = ({ credits, close }) => {
  const t = useT();
  const { data: wallet } = useWallet();
  const f = useWalletFormat(wallet?.currency);
  const unlocks = useUnlocks();
  const addProvider = useAddProvider();
  const channel = unlocks.find((u) => u.channel);

  return (
    <div className="flex flex-col gap-[24px] whitespace-normal">
      <div className="flex flex-col items-center text-center gap-[14px] pt-[8px]">
        <div
          className={clsx(
            'w-[56px] h-[56px] rounded-full flex items-center justify-center',
            POS_SOFT,
            POS_TEXT
          )}
        >
          <CheckIcon size={26} />
        </div>
        <div className="text-[24px] font-[600] tabular-nums">
          {credits !== null
            ? t(
                'wallet_credits_added_title',
                '{{credits}} credits added to your wallet',
                {
                  credits: f.credits(credits),
                }
              )
            : t(
                'wallet_credits_added_plain_title',
                'Credits added to your wallet'
              )}
        </div>
        {!!wallet?.autoTopUp.enabled && (
          <div className="text-[13px] text-textItemBlur">
            {t('wallet_auto_is_on', 'Auto top-up is on.')}
          </div>
        )}
      </div>
      {!!unlocks.length && (
        <div className="flex flex-col gap-[8px]">
          {unlocks.map((u) => (
            <div
              key={u.key}
              className="flex items-center gap-[12px] p-[12px] rounded-[8px] bg-newTableHeader"
            >
              <div className="w-[32px] h-[32px] rounded-full bg-newBgColorInner flex items-center justify-center text-textItemBlur shrink-0">
                {u.channel ? (
                  <ProviderLogo provider={u.key} />
                ) : (
                  sectionIcon(u.category)
                )}
              </div>
              <div className="flex-1 min-w-0 text-start">
                <div className="text-[14px] font-[600]">{u.name}</div>
                {!!u.description && (
                  <div className="text-[12px] text-textItemBlur">
                    {u.description}
                  </div>
                )}
              </div>
              <span className={POS_TEXT}>
                <CheckIcon size={14} />
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-[8px]">
        <button
          type="button"
          onClick={close}
          className={clsx(BTN_SIMPLE, 'flex-1')}
        >
          {t('wallet_done', 'Done')}
        </button>
        {!!channel && (
          <button
            type="button"
            onClick={() => {
              close();
              addProvider();
            }}
            className={clsx(BTN_PRIMARY, 'flex-1')}
          >
            {t('wallet_connect_provider', 'Connect {{name}}', {
              name: channel.name,
              interpolation: { escapeValue: false },
            })}
          </button>
        )}
      </div>
    </div>
  );
};

export const useTopUpSuccessModal = () => {
  const modals = useModals();
  return useCallback(
    (credits: number | null) => {
      modals.openModal({
        id: 'wallet-top-up-success',
        title: '',
        size: modalSize(480),
        children: (close) => <TopUpSuccess credits={credits} close={close} />,
      });
    },
    [modals]
  );
};

// Mounted once in the app layout: opens the top-up dialog whenever
// openTopUp() is called.
export const WalletHost: FC = () => {
  const open = useTopUpModal();
  useEffect(() => {
    const handler = (options: OpenTopUpOptions) => open(options);
    walletEvents.on(OPEN_TOP_UP, handler);
    return () => {
      walletEvents.off(OPEN_TOP_UP, handler);
    };
  }, [open]);
  return null;
};
