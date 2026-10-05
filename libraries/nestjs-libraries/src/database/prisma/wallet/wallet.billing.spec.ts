jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert',
  () => ({ walletAlert: jest.fn(async () => undefined) })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);

import {
  WalletBillingService,
  WalletPaymentMismatchError,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.billing.service';
import { InsufficientCreditsError } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import { walletAlert } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert';

// WalletBillingService with a stub WalletService and a stub Stripe client.
// Nothing leaves the process.

const metadata = {
  service: 'wallet',
  kind: 'topup',
  organizationId: 'org-1',
  amount: '1000',
  credits: '100000',
  currency: 'USD',
};

const session = (over: Record<string, any> = {}) =>
  ({
    id: 'cs_1',
    metadata,
    payment_status: 'paid',
    payment_intent: 'pi_1',
    amount_subtotal: 1000,
    currency: 'usd',
    ...over,
  } as any);

const build = () => {
  const wallet = {
    addTopUp: jest.fn(async () => ({ id: 'e1' })),
    updateWallet: jest.fn(async () => ({})),
    clawBack: jest.fn(async () => ({
      organizationId: 'org-1',
      credits: 50000,
      entry: {},
    })),
    charge: jest.fn(),
    notifyIfShort: jest.fn(async () => false),
  } as any;
  const stripe = {
    paymentIntents: {
      retrieve: jest.fn(async () => ({
        setup_future_usage: null,
        payment_method: null,
      })),
    },
  };
  const service = new WalletBillingService(wallet, {} as any);
  (service as any)._client = stripe;
  return { service, wallet, stripe };
};

const checkoutEvent = (s: any) =>
  ({ type: 'checkout.session.completed', data: { object: s } } as any);

describe('WalletBillingService checkout', () => {
  const env = process.env.WALLET_STRIPE_SECRET_KEY;
  beforeEach(() => {
    process.env.WALLET_STRIPE_SECRET_KEY = 'sk_test_stub';
    (walletAlert as jest.Mock).mockClear();
  });
  afterAll(() => {
    process.env.WALLET_STRIPE_SECRET_KEY = env;
  });

  it('credits exactly what the metadata fixed when the payment matches', async () => {
    const { service, wallet } = build();
    await service.handleEvent(checkoutEvent(session()));
    expect(wallet.addTopUp).toHaveBeenCalledWith({
      organizationId: 'org-1',
      amount: 1000,
      credits: 100000,
      currency: 'USD',
      auto: false,
      paymentIntentId: 'pi_1',
      receiptUrl: null,
    });
    expect(wallet.notifyIfShort).toHaveBeenCalledWith('org-1', undefined);
    expect(walletAlert).not.toHaveBeenCalled();
  });

  it('refuses and alerts when the amount paid differs from the metadata', async () => {
    const { service, wallet } = build();
    await expect(
      service.handleEvent(checkoutEvent(session({ amount_subtotal: 500 })))
    ).rejects.toBeInstanceOf(WalletPaymentMismatchError);
    expect(walletAlert).toHaveBeenCalledTimes(1);
    expect(wallet.addTopUp).not.toHaveBeenCalled();
  });

  it('refuses and alerts when the currency paid differs from the metadata', async () => {
    const { service, wallet } = build();
    await expect(
      service.handleEvent(checkoutEvent(session({ currency: 'eur' })))
    ).rejects.toBeInstanceOf(WalletPaymentMismatchError);
    expect(walletAlert).toHaveBeenCalled();
    expect(wallet.addTopUp).not.toHaveBeenCalled();
  });

  it('refuses metadata with non-integer or missing credits', async () => {
    const { service, wallet } = build();
    await expect(
      service.handleEvent(
        checkoutEvent(session({ metadata: { ...metadata, credits: '1.5' } }))
      )
    ).rejects.toBeInstanceOf(WalletPaymentMismatchError);
    await expect(
      service.handleEvent(
        checkoutEvent(
          session({ metadata: { ...metadata, organizationId: '' } })
        )
      )
    ).rejects.toBeInstanceOf(WalletPaymentMismatchError);
    expect(wallet.addTopUp).not.toHaveBeenCalled();
  });

  it('refuses and alerts a paid session without a payment intent', async () => {
    const { service, wallet } = build();
    await expect(
      service.handleEvent(checkoutEvent(session({ payment_intent: null })))
    ).rejects.toBeInstanceOf(WalletPaymentMismatchError);
    expect(walletAlert).toHaveBeenCalled();
    expect(wallet.addTopUp).not.toHaveBeenCalled();
  });

  it('ignores sessions that are not wallet top-ups or not paid', async () => {
    const { service, wallet } = build();
    await service.handleEvent(
      checkoutEvent(session({ metadata: { ...metadata, service: 'postiz' } }))
    );
    await service.handleEvent(
      checkoutEvent(session({ payment_status: 'unpaid' }))
    );
    expect(wallet.addTopUp).not.toHaveBeenCalled();
  });

  it('saves the card when the customer agreed to keep it', async () => {
    const { service, wallet, stripe } = build();
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({
      setup_future_usage: 'off_session',
      payment_method: {
        id: 'pm_1',
        card: { brand: 'visa', last4: '4242', exp_month: 3, exp_year: 2029 },
      },
      latest_charge: { receipt_url: 'https://pay.stripe.com/receipts/r1' },
    } as any);
    await service.handleEvent(checkoutEvent(session()));
    expect(wallet.addTopUp).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptUrl: 'https://pay.stripe.com/receipts/r1',
      })
    );
    expect(wallet.updateWallet).toHaveBeenCalledWith('org-1', {
      paymentMethodId: 'pm_1',
      cardBrand: 'visa',
      cardLast4: '4242',
      cardExp: '03/2029',
    });
  });
});

describe('WalletBillingService top-up dialog choices', () => {
  const env = process.env.WALLET_STRIPE_SECRET_KEY;
  beforeEach(() => {
    process.env.WALLET_STRIPE_SECRET_KEY = 'sk_test_stub';
  });
  afterAll(() => {
    process.env.WALLET_STRIPE_SECRET_KEY = env;
  });

  const rules = {
    minAmount: 1000,
    options: [1000, 2500],
    creditsPerUnit: 100,
    autoOptions: [2500, 5000],
    capOptions: [10000, 20000],
    defaultThreshold: 25000,
  };

  const savedCardIntent = {
    setup_future_usage: 'off_session',
    payment_method: { id: 'pm_1', card: { brand: 'visa', last4: '4242' } },
    latest_charge: null,
  };

  const withWallet = (walletRow: any) => {
    const built = build();
    built.wallet.getWallet = jest.fn(async () => walletRow);
    built.wallet.topUpRules = jest.fn(async () => rules);
    built.stripe.paymentIntents.retrieve.mockResolvedValueOnce(
      savedCardIntent as any
    );
    return built;
  };

  it('turns auto top-up on with the defaults after a paid checkout that asked for it', async () => {
    const { service, wallet } = withWallet({
      autoTopUp: false,
      frozenAt: null,
      paymentMethodId: 'pm_1',
      autoTopUpAmount: null,
      autoTopUpMonthlyCap: null,
      autoTopUpThreshold: null,
    });
    await service.handleEvent(
      checkoutEvent(session({ metadata: { ...metadata, autoTopUp: '1' } }))
    );
    expect(wallet.updateWallet).toHaveBeenLastCalledWith('org-1', {
      autoTopUp: true,
      autoTopUpAmount: 2500,
      autoTopUpMonthlyCap: 10000,
      autoTopUpThreshold: 25000,
    });
  });

  it("keeps the wallet's own auto top-up settings when it has them", async () => {
    const { service, wallet } = withWallet({
      autoTopUp: false,
      frozenAt: null,
      paymentMethodId: 'pm_1',
      autoTopUpAmount: 5000,
      autoTopUpMonthlyCap: 2000,
      autoTopUpThreshold: 1000,
    });
    await service.handleEvent(
      checkoutEvent(session({ metadata: { ...metadata, autoTopUp: '1' } }))
    );
    expect(wallet.updateWallet).toHaveBeenLastCalledWith('org-1', {
      autoTopUp: true,
      autoTopUpAmount: 5000,
      // Never below one top-up.
      autoTopUpMonthlyCap: 5000,
      autoTopUpThreshold: 1000,
    });
  });

  it('leaves auto top-up off when the checkout did not ask for it', async () => {
    const { service, wallet } = withWallet({
      autoTopUp: false,
      paymentMethodId: 'pm_1',
    });
    await service.handleEvent(checkoutEvent(session()));
    expect(wallet.updateWallet).not.toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ autoTopUp: true })
    );
  });

  it('leaves auto top-up off when no card was saved', async () => {
    const { service, wallet, stripe } = build();
    wallet.getWallet = jest.fn(async () => ({ autoTopUp: false }));
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({
      setup_future_usage: null,
      payment_method: null,
    } as any);
    await service.handleEvent(
      checkoutEvent(session({ metadata: { ...metadata, autoTopUp: '1' } }))
    );
    expect(wallet.updateWallet).not.toHaveBeenCalled();
  });

  it('refuses a top-up that is not a whole amount of the currency', async () => {
    const { service, wallet } = build();
    wallet.isFrozen = jest.fn(async () => false);
    wallet.topUpRules = jest.fn(async () => rules);
    wallet.isWholeAmount = jest.fn(async (a: number) => a % 100 === 0);
    wallet.wholeAmountMessage = jest.fn(async () => 'whole amounts only');
    await expect(
      service.createCheckout({
        organizationId: 'org-1',
        amount: 1050,
        saveCard: false,
        returnUrl: 'https://app/wallet',
      })
    ).rejects.toThrow('whole amounts only');
  });
});

describe('WalletBillingService refunds and disputes', () => {
  beforeEach(() => (walletAlert as jest.Mock).mockClear());

  it('claws back the refunded share of a payment and alerts', async () => {
    const { service, wallet } = build();
    await service.handleEvent({
      type: 'charge.refunded',
      data: {
        object: {
          payment_intent: 'pi_1',
          amount: 1000,
          amount_refunded: 250,
          currency: 'usd',
          metadata: {},
        },
      },
    } as any);
    expect(wallet.clawBack).toHaveBeenCalledWith({
      paymentIntentId: 'pi_1',
      share: 0.25,
      eventKey: 'refund:250',
      description: 'Payment refunded',
    });
    expect(walletAlert).toHaveBeenCalledTimes(1);
  });

  it('claws back the whole payment on a dispute', async () => {
    const { service, wallet } = build();
    await service.handleEvent({
      type: 'charge.dispute.created',
      data: {
        object: { id: 'dp_1', payment_intent: 'pi_1', reason: 'fraudulent' },
      },
    } as any);
    expect(wallet.clawBack).toHaveBeenCalledWith(
      expect.objectContaining({ share: 1, eventKey: 'dispute:dp_1' })
    );
  });

  it('alerts a refund on a wallet payment that never credited a wallet', async () => {
    const { service, wallet } = build();
    wallet.clawBack.mockResolvedValue(undefined);
    await service.handleEvent({
      type: 'charge.refunded',
      data: {
        object: {
          payment_intent: 'pi_x',
          amount: 1000,
          amount_refunded: 1000,
          currency: 'usd',
          metadata: { service: 'wallet' },
        },
      },
    } as any);
    expect(walletAlert).toHaveBeenCalledWith(
      expect.stringContaining('never credited a wallet')
    );
  });
});

describe('WalletBillingService dispute before the top-up is credited', () => {
  const env = process.env.WALLET_STRIPE_SECRET_KEY;
  beforeEach(() => {
    process.env.WALLET_STRIPE_SECRET_KEY = 'sk_test_stub';
    (walletAlert as jest.Mock).mockClear();
  });
  afterAll(() => {
    process.env.WALLET_STRIPE_SECRET_KEY = env;
  });

  it('credits the payment first, then claws it back', async () => {
    const { service, wallet, stripe } = build();
    wallet.clawBack
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ organizationId: 'org-1', credits: 100000 });
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      amount: 1000,
      amount_received: 1000,
      currency: 'usd',
      metadata: { ...metadata, kind: 'auto_topup' },
      latest_charge: null,
    } as any);
    await service.handleEvent({
      type: 'charge.dispute.created',
      data: {
        object: { id: 'dp_1', payment_intent: 'pi_1', reason: 'fraudulent' },
      },
    } as any);
    expect(wallet.addTopUp).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        credits: 100000,
        auto: true,
        paymentIntentId: 'pi_1',
      })
    );
    expect(wallet.clawBack).toHaveBeenCalledTimes(2);
    expect(walletAlert).toHaveBeenCalledWith(
      expect.stringContaining('disputed')
    );
  });

  it('credits nothing for a payment that is not a paid wallet top-up', async () => {
    const { service, wallet, stripe } = build();
    wallet.clawBack.mockResolvedValue(undefined);
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_2',
      status: 'succeeded',
      metadata: {},
    } as any);
    await service.handleEvent({
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_2', payment_intent: 'pi_2' } },
    } as any);
    expect(wallet.addTopUp).not.toHaveBeenCalled();
  });
});

describe('WalletBillingService.charge', () => {
  it('tops up from the saved card and retries once when the balance is short', async () => {
    const { service, wallet } = build();
    wallet.charge
      .mockRejectedValueOnce(new InsufficientCreditsError(225, 100))
      .mockResolvedValueOnce({ id: 'spend-1' });
    const auto = jest.spyOn(service, 'autoTopUp').mockResolvedValue(true);
    const params = {
      organizationId: 'org-1',
      actionKey: 'x.post',
      chargeKey: 'post:p1',
    };
    expect(await service.charge(params)).toEqual({ id: 'spend-1' });
    expect(auto).toHaveBeenCalledWith('org-1', 225);
    expect(wallet.charge).toHaveBeenCalledTimes(2);
  });

  it('rethrows InsufficientCreditsError when auto top-up cannot cover it', async () => {
    const { service, wallet } = build();
    wallet.charge.mockRejectedValue(new InsufficientCreditsError(225, 100));
    jest.spyOn(service, 'autoTopUp').mockResolvedValue(false);
    await expect(
      service.charge({
        organizationId: 'org-1',
        actionKey: 'x.post',
        chargeKey: 'k',
      })
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(wallet.charge).toHaveBeenCalledTimes(1);
  });

  it('does not try auto top-up for errors other than a short balance', async () => {
    const { service, wallet } = build();
    wallet.charge.mockRejectedValue(new Error('No price for nope'));
    const auto = jest.spyOn(service, 'autoTopUp').mockResolvedValue(true);
    await expect(
      service.charge({
        organizationId: 'org-1',
        actionKey: 'nope',
        chargeKey: 'k',
      })
    ).rejects.toThrow('No price for nope');
    // Only the background "keep above threshold" call, never a retry.
    expect(auto).toHaveBeenCalledTimes(1);
    expect(auto).toHaveBeenCalledWith('org-1');
  });
});

describe('WalletBillingService auto top-up idempotency', () => {
  const env = process.env.WALLET_STRIPE_SECRET_KEY;
  beforeEach(() => {
    process.env.WALLET_STRIPE_SECRET_KEY = 'sk_test_stub';
  });
  afterAll(() => {
    process.env.WALLET_STRIPE_SECRET_KEY = env;
  });

  const autoBuild = (spent: { value: number }, card: { id: string }) => {
    const { service, wallet, stripe } = build();
    wallet.getWallet = jest.fn(async () => ({
      autoTopUp: true,
      frozenAt: null,
      paymentMethodId: card.id,
      stripeCustomerId: 'cus_1',
      autoTopUpAmount: 1000,
      autoTopUpThreshold: 25000,
      autoTopUpMonthlyCap: 10000,
      currency: 'USD',
    }));
    wallet.balance = jest.fn(async () => 100);
    wallet.autoTopUpSpentSince = jest.fn(async () => spent.value);
    wallet.unitsForAmount = jest.fn(async (a: number) => a * 100);
    wallet.currency = jest.fn(async () => 'USD');
    (stripe.paymentIntents as any).create = jest.fn(async (params: any) => ({
      id: 'pi_auto',
      status: 'succeeded',
      amount: params.amount,
      amount_received: params.amount,
      currency: params.currency,
      metadata: params.metadata,
      latest_charge: null,
    }));
    return { service, stripe };
  };
  const keyOf = (stripe: any, call: number) =>
    stripe.paymentIntents.create.mock.calls[call][1].idempotencyKey;

  it('uses a new key once a top-up has been credited', async () => {
    const spent = { value: 0 };
    const { service, stripe } = autoBuild(spent, { id: 'pm_1' });
    await service.autoTopUp('org-1', 225);
    spent.value = 1000;
    await service.autoTopUp('org-1', 225);
    expect(keyOf(stripe, 0)).not.toBe(keyOf(stripe, 1));
  });

  it('keeps one key for requests before the top-up is credited', async () => {
    const { service, stripe } = autoBuild({ value: 0 }, { id: 'pm_1' });
    await service.autoTopUp('org-1', 225);
    await service.autoTopUp('org-1', 225);
    expect(keyOf(stripe, 0)).toBe(keyOf(stripe, 1));
  });

  it('uses a new key when the card changes', async () => {
    const card = { id: 'pm_1' };
    const { service, stripe } = autoBuild({ value: 0 }, card);
    await service.autoTopUp('org-1', 225);
    card.id = 'pm_2';
    await service.autoTopUp('org-1', 225);
    expect(keyOf(stripe, 0)).not.toBe(keyOf(stripe, 1));
  });
});
