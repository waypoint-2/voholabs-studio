'use client';

import { useFireEvents, useTrackView } from '@gitroom/helpers/utils/use.fire.events';
import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  useWallet,
  useWalletFormat,
} from '@gitroom/frontend/components/wallet/wallet.hooks';
import {
  BTN_PRIMARY,
  CardIcon,
  CheckIcon,
  Spinner,
  TEAL_SOFT,
  WalletIcon,
} from '@gitroom/frontend/components/wallet/wallet.ui';

// What the browser remembers across the Stripe redirect, to tell a first
// top-up from a later one when the user comes back.
export const CHECKOUT_MEMO = 'wallet-checkout';
export interface CheckoutMemo {
  amount: number;
  wasPayAsYouGo: boolean;
  at: number;
}

export const useIsWalletAdmin = () => {
  const user = useUser();
  return user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
};

export const cardLabel = (card: { brand: string | null; last4: string }) =>
  `${
    card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : ''
  } •••• ${card.last4}`.trim();

export const TopUpModal: FC<{ context?: string }> = ({ context }) => {
  const t = useT();
  const fireEvents = useFireEvents();
  useTrackView('topup_dialog_opened', { context });
  const fetch = useFetch();
  const isAdmin = useIsWalletAdmin();
  const { data: wallet } = useWallet();
  const f = useWalletFormat(wallet?.currency);
  const rules = wallet?.topUp;
  const minAmount = rules?.minAmount || 0;
  const [value, setValue] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [save, setSave] = useState(true);
  const [step, setStep] = useState<'form' | 'redirect'>('form');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const ready = value !== null;

  // Start at the minimum, as a whole number in the currency's major unit.
  useEffect(() => {
    if (value === null && rules) {
      setValue(String(Math.ceil(rules.minAmount / f.factor)));
    }
  }, [rules, value, f.factor]);

  // Focus the amount once, when it first appears.
  useEffect(() => {
    if (ready) {
      input.current?.focus();
      input.current?.select();
    }
  }, [ready]);

  // Top-ups are whole units of the currency (no cents).
  const whole = /^\d+$/.test(value || '');
  const amount = useMemo(() => {
    const n = parseInt(value || '', 10);
    return whole && Number.isFinite(n) ? n * f.factor : 0;
  }, [value, whole, f.factor]);

  const valid = !!rules && whole && amount >= minAmount;
  const notWhole = touched && !!value && !whole;
  const tooLow = touched && !!value && !valid;
  const credits =
    valid && rules ? f.creditsFor(amount, rules.creditsPerUnit) : 0;
  // With auto top-up already running on a saved card, the card stays saved.
  const keepsCard =
    !!wallet?.payAsYouGo && !!wallet?.autoTopUp.enabled && !!wallet?.card;
  const blocked = !wallet?.paymentsEnabled || !isAdmin || !!wallet?.frozen;

  const checkout = useCallback(async () => {
    if (!valid || blocked) return;
    setError('');
    setStep('redirect');
    fireEvents('topup_started', { amount_minor: amount, currency: wallet?.currency, save_card: keepsCard || save, context }, { send_instantly: true });
    try {
      const res = await fetch('/wallet/checkout', {
        method: 'POST',
        // autoTopUp: the box says "Save card and enable auto top-up", so a
        // saved card asks the server to switch auto top-up on once paid.
        body: JSON.stringify({
          amount,
          saveCard: keepsCard || save,
          autoTopUp: keepsCard || save,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) {
        throw new Error();
      }
      try {
        sessionStorage.setItem(
          CHECKOUT_MEMO,
          JSON.stringify({
            amount,
            wasPayAsYouGo: !!wallet?.payAsYouGo,
            at: Date.now(),
          } satisfies CheckoutMemo)
        );
      } catch {
        // Storage can be blocked; the return page copes without it.
      }
      window.location.href = body.url;
    } catch {
      setStep('form');
      setError(
        t(
          'wallet_checkout_failed',
          'Checkout could not start. Please try again.'
        )
      );
    }
  }, [fetch, t, valid, blocked, amount, keepsCard, save, wallet?.payAsYouGo, wallet?.currency, context, fireEvents]);

  if (step === 'redirect') {
    return (
      <div className="flex flex-col items-center gap-[16px] py-[40px]">
        <Spinner />
        <div className="text-[16px] font-[600]">
          {t('wallet_taking_to_checkout', 'Taking you to checkout')}
        </div>
      </div>
    );
  }

  if (!wallet || !rules) {
    return (
      <div className="flex justify-center py-[40px]">
        <Spinner />
      </div>
    );
  }

  // Top-ups are not switched on for this instance yet.
  if (!wallet.paymentsEnabled) {
    return (
      <div className="flex flex-col items-center text-center gap-[8px] py-[24px] whitespace-normal">
        <div className="w-[44px] h-[44px] rounded-full bg-newBgLineColor text-textItemBlur flex items-center justify-center mb-[6px]">
          <WalletIcon size={20} />
        </div>
        <div className="text-[15px] font-[600]">
          {t('wallet_topup_not_available', 'Top-ups are not available yet.')}
        </div>
        <div className="text-[13px] text-textItemBlur max-w-[360px]">
          {t(
            'wallet_topup_not_available_body',
            'Everything free stays free. You will be able to top up here soon.'
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-[20px] whitespace-normal"
      onSubmit={(e) => {
        e.preventDefault();
        checkout();
      }}
    >
      {!!context && (
        <div className="text-[14px] text-textItemBlur -mt-[20px]">
          {context}
        </div>
      )}
      <div className="flex flex-col gap-[8px]">
        <label htmlFor="wallet-topup-amount" className="text-[14px]">
          {t('wallet_amount', 'Amount')}
        </label>
        <div
          className={clsx(
            'bg-newBgColorInner h-[56px] border rounded-[8px] flex items-center min-w-0',
            tooLow
              ? 'border-danger'
              : 'border-newTableBorder focus-within:border-btnPrimary'
          )}
        >
          <span className="ps-[16px] text-[22px] text-textItemBlur">
            {f.currencySymbol()}
          </span>
          <input
            ref={input}
            id="wallet-topup-amount"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            aria-describedby="wallet-topup-error"
            aria-invalid={tooLow}
            value={value || ''}
            placeholder="0"
            onChange={(e) => {
              setValue(e.target.value.replace(/[^0-9.]/g, ''));
              setTouched(true);
            }}
            className="h-full bg-transparent flex-1 min-w-0 text-[22px] font-[600] ps-[6px] pe-[16px] tabular-nums outline-none"
          />
          <span className="pe-[16px] text-[13px] text-textItemBlur tabular-nums whitespace-nowrap">
            {t('wallet_equals_credits', '= {{credits}} credits', {
              credits: f.credits(credits),
            })}
          </span>
        </div>
        <div
          id="wallet-topup-error"
          className={clsx('text-[12px] text-danger', !tooLow && 'hidden')}
        >
          {notWhole
            ? t('wallet_whole_amount', 'Enter a whole amount, without cents.')
            : t('wallet_min_topup', 'The minimum top-up is {{amount}}', {
                amount: f.money(minAmount),
              })}
        </div>
        {rules.options.length > 0 && (
          <div className="flex flex-wrap gap-[8px] mt-[4px]">
            {rules.options.map((option) => {
              const selected = amount === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setValue(String(option / f.factor));
                    setTouched(true);
                  }}
                  className={clsx(
                    'h-[32px] px-[14px] rounded-full border text-[13px] font-[600] tabular-nums transition-colors',
                    selected
                      ? clsx('border-btnPrimary text-newTextColor', TEAL_SOFT)
                      : 'border-newTableBorder text-textItemBlur hover:text-newTextColor hover:border-newSep'
                  )}
                >
                  {f.moneyShort(option)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-[16px] rounded-[8px] bg-newTableHeader flex items-center gap-[12px]">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-textItemBlur">
            {t('wallet_you_get', 'You get')}
          </div>
          <div className="text-[24px] font-[600] tabular-nums">
            {t('wallet_equals_credits', '= {{credits}} credits', {
              credits: f.credits(credits),
            })}
          </div>
        </div>
        <div className="text-[16px] font-[600] tabular-nums">
          {f.money(valid ? amount : 0)}
        </div>
      </div>

      {keepsCard && wallet.card ? (
        <div className="flex items-center flex-wrap gap-[12px] text-[14px]">
          <CardIcon />
          <span>
            {t('wallet_paying_with', 'Paying with')}{' '}
            <span className="font-[600]">{cardLabel(wallet.card)}</span>
          </span>
          <span className="text-textItemBlur text-[13px] ms-auto">
            {t('wallet_auto_stays_on', 'Auto top-up stays on')}
          </span>
        </div>
      ) : (
        <label className="flex gap-[12px] items-center cursor-pointer select-none">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={save}
            onChange={() => setSave((s) => !s)}
          />
          <span
            aria-hidden="true"
            className={clsx(
              'rounded-[4px] w-[24px] h-[24px] shrink-0 justify-center items-center flex text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ai',
              save ? 'bg-forth' : 'border-2 border-newSep'
            )}
          >
            {save && <CheckIcon size={16} />}
          </span>
          <span className="text-[14px]">
            {t('wallet_save_card', 'Save card and enable auto top-up')}
          </span>
        </label>
      )}

      <div className="flex flex-col gap-[8px]">
        {!!error && <div className="text-[13px] text-danger">{error}</div>}
        <button
          type="submit"
          disabled={!valid || blocked}
          className={clsx(BTN_PRIMARY, 'w-full')}
        >
          {t('wallet_continue_checkout', 'Continue to checkout')}
        </button>
        <div className="text-[12px] text-textItemBlur text-center">
          {!isAdmin
            ? t(
                'wallet_admin_only',
                'Only an admin of this workspace can top up.'
              )
            : wallet.frozen
            ? t(
                'wallet_frozen',
                'This wallet is on hold. Contact support to restore it.'
              )
            : !wallet.paymentsEnabled
            ? t('wallet_payments_unavailable', 'Top-ups are not available yet.')
            : t(
                'wallet_secure_payment',
                'Secure payment by Stripe. Credits arrive as soon as payment clears.'
              )}
        </div>
      </div>
    </form>
  );
};
