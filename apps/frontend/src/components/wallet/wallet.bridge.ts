'use client';

import {
  OPEN_TOP_UP,
  openTopUp as openWalletTopUp,
  walletEvents,
} from '@gitroom/frontend/components/wallet/wallet.events';

// Opens the wallet's top-up dialog (wallet.events, listened to by
// <WalletHost />) from screens that send people to the wallet (locks,
// composer, the 402 handler). When the dialog is not mounted on this screen,
// the browser goes to the wallet page, which opens it.
export const openTopUp = (message?: string) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (walletEvents.listenerCount(OPEN_TOP_UP) > 0) {
    openWalletTopUp(message ? { context: message } : {});
    return;
  }
  window.location.href = '/wallet?topup=open';
};

// Fetch options that hand a wallet 402 back to the caller instead of the
// global handler (which opens the top-up and never resolves the request), so
// a screen with its own spinner can stop it.
export const WALLET_INLINE_REQUEST = { walletInline: true } as RequestInit;

// For a response fetched with WALLET_INLINE_REQUEST: when it is a wallet 402,
// opens the top-up with its message and returns that message.
export const openTopUpIfWalletRefused = async (response: Response) => {
  if (response.status !== 402) {
    return undefined;
  }
  const body = await response
    .clone()
    .json()
    .catch(() => undefined);
  if (!body?.wallet) {
    return undefined;
  }
  openTopUp(body.message);
  return (body.message as string) || '';
};
