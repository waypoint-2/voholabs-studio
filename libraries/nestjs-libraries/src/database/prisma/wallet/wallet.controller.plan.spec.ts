// A paid plan is not offered a top-up, a card or automatic top-ups.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service',
  () => ({
    WalletService: class {},
    receiptUrlOf: () => null,
    walletFrozenMessage: () => 'frozen',
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.billing.service',
  () => ({
    WalletBillingService: class {},
    WalletPaymentMismatchError: class extends Error {},
    walletPaymentsEnabled: () => true,
  })
);

import { WalletController } from '@gitroom/backend/api/routes/wallet.controller';

const PAID = {
  id: 'org-1',
  name: 'Org',
  users: [{ role: 'ADMIN' }],
  subscription: { subscriptionTier: 'ULTIMATE', cancelAt: null },
};
const FREE = {
  ...PAID,
  subscription: { subscriptionTier: 'FREE', cancelAt: '2020-01-01' },
};
const user = { email: 'a@b.c' };

const build = () => {
  const billing = {
    createCheckout: jest.fn(async () => ({ url: 'checkout' })),
    createCardSetup: jest.fn(async () => ({ url: 'card' })),
  };
  const wallet = {
    ensureWallet: jest.fn(async () => ({ paymentMethodId: null })),
    updateWallet: jest.fn(async () => undefined),
  };
  const controller = new WalletController(wallet as any, billing as any);
  jest.spyOn(controller, 'summary').mockResolvedValue({} as any);
  return { controller, billing, wallet };
};

const refusal = expect.objectContaining({
  message: 'Your plan does not use wallet credits.',
  status: 400,
});

describe('WalletController on a paid plan', () => {
  it('refuses a top-up', async () => {
    const { controller, billing } = build();
    await expect(
      controller.checkout(PAID as any, user as any, { amount: 10 } as any)
    ).rejects.toEqual(refusal);
    expect(billing.createCheckout).not.toHaveBeenCalled();
  });

  it('refuses to save a card', async () => {
    const { controller, billing } = build();
    await expect(controller.card(PAID as any, user as any)).rejects.toEqual(
      refusal
    );
    expect(billing.createCardSetup).not.toHaveBeenCalled();
  });

  it('refuses to turn automatic top-ups on, and lets them be turned off', async () => {
    const { controller, wallet } = build();
    await expect(
      controller.autoTopUp(PAID as any, { enabled: true } as any)
    ).rejects.toEqual(refusal);
    expect(wallet.updateWallet).not.toHaveBeenCalled();
    await controller.autoTopUp(PAID as any, { enabled: false } as any);
    expect(wallet.updateWallet).toHaveBeenCalled();
  });
});

describe('WalletController without a paid plan', () => {
  it('opens a top-up and a card setup', async () => {
    const { controller, billing } = build();
    await controller.checkout(FREE as any, user as any, { amount: 10 } as any);
    await controller.card(FREE as any, user as any);
    expect(billing.createCheckout).toHaveBeenCalled();
    expect(billing.createCardSetup).toHaveBeenCalled();
  });
});
