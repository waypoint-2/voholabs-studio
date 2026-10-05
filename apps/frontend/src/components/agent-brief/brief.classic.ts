'use client';

import { useWalletAccess } from '@gitroom/frontend/components/wallet-locks/wallet.access';

// A paid plan sees the brief as it always did: the "Agent Brief" header with
// its hint, and the warm accent. Every other plan gets the teal accent and
// the page title's (i) instead.
export const useBriefClassic = () => useWalletAccess() === 'plan';
