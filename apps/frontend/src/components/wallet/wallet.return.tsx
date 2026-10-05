'use client';

import { useFireEvents } from '@gitroom/helpers/utils/use.fire.events';
import { FC, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  fractionDigits,
  useRefreshWallet,
  useWalletFormat,
} from '@gitroom/frontend/components/wallet/wallet.hooks';
import { useTopUpSuccessModal } from '@gitroom/frontend/components/wallet/wallet.host';
import {
  CHECKOUT_MEMO,
  CheckoutMemo,
} from '@gitroom/frontend/components/wallet/top.up.modal';
import { WalletSummary } from '@gitroom/frontend/components/wallet/wallet.types';
import { openTopUp } from '@gitroom/frontend/components/wallet/wallet.events';

const readMemo = (): CheckoutMemo | null => {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_MEMO);
    sessionStorage.removeItem(CHECKOUT_MEMO);
    const memo = raw ? (JSON.parse(raw) as CheckoutMemo) : null;
    // A memo older than a day belongs to an abandoned checkout.
    return memo && Date.now() - memo.at < 86400000 ? memo : null;
  } catch {
    return null;
  }
};

// Handles the return from Stripe Checkout on /wallet:
// ?topup=success&session_id=... credits the session (idempotent with the
// webhook), refreshes the wallet and the user, then shows the first-top-up
// welcome or a toast. ?topup=cancelled just says nothing was charged.
// ?card=saved|cancelled is the return from changing the saved card.
export const WalletCheckoutReturn: FC = () => {
  const params = useSearchParams();
  const router = useRouter();
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const user = useUser() as
    | (ReturnType<typeof useUser> & { payAsYouGo?: boolean })
    | undefined;
  const refresh = useRefreshWallet();
  const showSuccess = useTopUpSuccessModal();
  const handled = useRef(false);
  const topup = params.get('topup');
  const card = params.get('card');
  const sessionId = params.get('session_id');
  const wasPayAsYouGo = !!user?.payAsYouGo;
  const f = useWalletFormat();
  const fireEvents = useFireEvents();

  useEffect(() => {
    if (handled.current || (!topup && !card)) return;
    handled.current = true;
    const clean = () => router.replace('/wallet');

    if (!topup && card) {
      clean();
      if (card === 'saved') {
        refresh();
        toaster.show(t('wallet_card_saved', 'Your card was updated.'));
      } else {
        toaster.show(
          t('wallet_card_cancelled', 'Card change cancelled.'),
          'warning'
        );
      }
      return;
    }

    // Sent here to top up from a screen where the dialog was not mounted.
    if (topup === 'open') {
      clean();
      openTopUp();
      return;
    }

    if (topup !== 'success' || !sessionId) {
      readMemo();
      clean();
      fireEvents('topup_cancelled');
      toaster.show(
        t('wallet_topup_cancelled', 'Top-up cancelled. Nothing was charged.'),
        'warning'
      );
      return;
    }

    (async () => {
      const memo = readMemo();
      let summary: WalletSummary | undefined;
      try {
        const res = await fetch(
          `/wallet/checkout/${encodeURIComponent(sessionId)}`
        );
        if (res.ok) {
          summary = await res.json();
        }
      } catch {
        // Falls through to the pending message below.
      }
      await refresh(summary);
      clean();

      if (!summary) {
        toaster.show(
          t(
            'wallet_topup_pending',
            'We could not confirm the payment yet. Your credits will show as soon as it clears.'
          ),
          'warning'
        );
        return;
      }

      const credits =
        memo && summary.topUp
          ? Math.round(
              (memo.amount * summary.topUp.creditsPerUnit * 100) /
                Math.pow(10, fractionDigits(summary.currency))
            )
          : null;
      const first = memo
        ? !memo.wasPayAsYouGo && summary.payAsYouGo
        : !wasPayAsYouGo && summary.payAsYouGo;
      fireEvents('topup_completed', { first: !!first, amount_minor: memo?.amount, currency: summary.currency });

      if (first) {
        showSuccess(credits);
        return;
      }
      toaster.show(
        credits !== null
          ? t(
              'wallet_topup_added',
              'Added {{credits}} credits to your wallet',
              {
                credits: f.credits(credits),
              }
            )
          : t('wallet_topup_done', 'Your top-up is complete')
      );
    })();
  }, [
    topup,
    card,
    sessionId,
    router,
    fetch,
    toaster,
    t,
    refresh,
    showSuccess,
    wasPayAsYouGo,
    f,
    fireEvents,
  ]);

  return null;
};
