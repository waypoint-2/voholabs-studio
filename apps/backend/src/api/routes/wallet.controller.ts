import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User, WalletEntryType } from '@prisma/client';
import dayjs from 'dayjs';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import {
  WalletService,
  receiptUrlOf,
  walletFrozenMessage,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  WalletBillingService,
  WalletPaymentMismatchError,
  walletPaymentsEnabled,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.billing.service';
import {
  WalletAutoTopUpDto,
  WalletCheckoutDto,
  WalletEstimateDto,
} from '@gitroom/nestjs-libraries/dtos/wallet/wallet.dto';
import { hasAccess } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/trial';

type OrgWithRole = Organization & { users?: { role?: string }[] };

// Only an organization's admins move money.
const assertAdmin = (org: OrgWithRole) => {
  const role = org.users?.[0]?.role;
  if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
    throw new HttpException('Only an admin of this workspace can do this', 403);
  }
};

// A paid plan never spends credits, so it is not offered a top-up or a card.
const assertNoPlan = (org: Organization) => {
  if (hasAccess(org as any)) {
    throw new HttpException('Your plan does not use wallet credits.', 400);
  }
};

const ENTRY_TYPES = Object.values(WalletEntryType) as string[];

// "TOPUP,AUTO_TOPUP" -> the entry types to list; unknown names are ignored.
const entryTypes = (value?: string) =>
  (value || '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter((v) => ENTRY_TYPES.includes(v)) as WalletEntryType[];

@ApiTags('Wallet')
@Controller('/wallet')
export class WalletController {
  constructor(
    private _wallet: WalletService,
    private _billing: WalletBillingService
  ) {}

  @Get('/')
  async summary(@GetOrgFromRequest() org: Organization) {
    const [wallet, balance, rules, spentAuto, currency, forecast] =
      await Promise.all([
        this._wallet.getWallet(org.id),
        this._wallet.balance(org.id),
        this._wallet.topUpRules().catch(() => undefined),
        this._wallet.autoTopUpSpentSince(
          org.id,
          dayjs().startOf('month').toDate()
        ),
        this._wallet.currency().catch(() => null),
        this._wallet.forecast(org.id),
      ]);
    // The daily short-forecast notice, sent at most once per UTC day.
    this._wallet.notifyIfShort(org.id, forecast).catch(() => undefined);
    return {
      balance,
      payAsYouGo: !!wallet?.firstTopUpAt && !wallet.frozenAt,
      frozen: !!wallet?.frozenAt,
      currency: wallet?.currency || currency,
      paymentsEnabled: walletPaymentsEnabled(),
      topUp: rules || null,
      card: wallet?.cardLast4
        ? {
            brand: wallet.cardBrand,
            last4: wallet.cardLast4,
            exp: wallet.cardExp || null,
          }
        : null,
      autoTopUp: {
        enabled: !!wallet?.autoTopUp,
        threshold: wallet?.autoTopUpThreshold ?? null,
        amount: wallet?.autoTopUpAmount ?? null,
        monthlyCap: wallet?.autoTopUpMonthlyCap ?? null,
        usedThisMonth: spentAuto,
      },
      forecast,
    };
  }

  // What one prospective charge costs and leaves, for the composer.
  @Get('/estimate')
  async estimate(
    @GetOrgFromRequest() org: Organization,
    @Query('actionKey') actionKey: string,
    @Query('quantity') quantity = '1'
  ) {
    const estimate = await this._wallet.estimate(
      org.id,
      actionKey,
      Math.min(Math.max(Math.floor(Number(quantity)) || 1, 1), 10000)
    );
    if (!estimate) {
      throw new HttpException('No price for this action', 404);
    }
    return estimate;
  }

  // A post and its replies on one channel, priced with the rule that charges
  // them: what it costs, the balance after, and whether the balance (with
  // auto top-up) covers it on top of what is already scheduled.
  @Post('/estimate')
  estimatePost(
    @GetOrgFromRequest() org: Organization,
    @Body() body: WalletEstimateDto
  ) {
    return this._wallet.estimateContents(org.id, body.provider, body.contents, {
      group: body.group,
      inter: body.inter,
    });
  }

  // `type` filters by entry type, comma separated (e.g. TOPUP,AUTO_TOPUP).
  @Get('/transactions')
  async transactions(
    @GetOrgFromRequest() org: Organization,
    @Query('page') page = '0',
    @Query('size') size = '20',
    @Query('type') type?: string
  ) {
    const [items, total] = await this._wallet.entries(
      org.id,
      Math.max(0, Number(page) || 0),
      Math.max(1, Number(size) || 20),
      entryTypes(type)
    );
    return {
      total,
      items: items.map((e) => ({
        id: e.id,
        type: e.type,
        description: e.description,
        amount: e.amount,
        quantity: e.quantity,
        unitPrice: e.unitPrice,
        actionKey: e.actionKey,
        reference: e.reference,
        receiptUrl: receiptUrlOf(e),
        createdAt: e.createdAt,
      })),
    };
  }

  @Get('/usage')
  usage(@GetOrgFromRequest() org: Organization, @Query('days') days = '30') {
    const span = Math.min(Math.max(Number(days) || 30, 1), 366);
    return this._wallet.usage(
      org.id,
      dayjs().subtract(span, 'day').startOf('day').toDate()
    );
  }

  @Get('/prices')
  prices(@Query('provider') provider?: string) {
    return this._wallet.priceSections(provider);
  }

  @Post('/checkout')
  async checkout(
    @GetOrgFromRequest() org: OrgWithRole,
    @GetUserFromRequest() user: User,
    @Body() body: WalletCheckoutDto
  ) {
    assertAdmin(org);
    assertNoPlan(org);
    if (!walletPaymentsEnabled()) {
      throw new HttpException('Top-ups are not available yet', 503);
    }
    try {
      return await this._billing.createCheckout({
        organizationId: org.id,
        email: user.email,
        name: org.name,
        amount: body.amount,
        saveCard: !!body.saveCard || !!body.autoTopUp,
        autoTopUp: !!body.autoTopUp,
        returnUrl: `${process.env.FRONTEND_URL}/wallet`,
      });
    } catch (err) {
      throw new HttpException((err as Error).message, 400);
    }
  }

  // Saves a new card for automatic top-ups (Stripe Checkout in setup mode,
  // nothing is charged). Stripe returns to /wallet?card=saved&session_id=...
  // or /wallet?card=cancelled; GET /wallet/checkout/:sessionId stores the
  // card at once, the webhook otherwise.
  @Post('/card')
  async card(
    @GetOrgFromRequest() org: OrgWithRole,
    @GetUserFromRequest() user: User
  ) {
    assertAdmin(org);
    assertNoPlan(org);
    if (!walletPaymentsEnabled()) {
      throw new HttpException('Top-ups are not available yet', 503);
    }
    try {
      return await this._billing.createCardSetup({
        organizationId: org.id,
        email: user.email,
        name: org.name,
        returnUrl: `${process.env.FRONTEND_URL}/wallet`,
      });
    } catch (err) {
      throw new HttpException((err as Error).message, 400);
    }
  }

  // Stripe sends the browser back here with the session id: credit it now if
  // it is paid (the webhook may not have arrived yet), then return the summary.
  @Get('/checkout/:sessionId')
  async checkoutReturn(
    @GetOrgFromRequest() org: Organization,
    @Param('sessionId') sessionId: string
  ) {
    if (!walletPaymentsEnabled()) {
      throw new HttpException('Top-ups are not available yet', 503);
    }
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId || '')) {
      throw new HttpException('Unknown checkout session', 404);
    }
    let found: boolean;
    try {
      found = await this._billing.confirmCheckout(org.id, sessionId);
    } catch (err) {
      if (err instanceof WalletPaymentMismatchError) {
        throw new HttpException(
          'This payment could not be matched to a top-up. We have been told and will sort it out.',
          409
        );
      }
      if ((err as { type?: string })?.type === 'StripeInvalidRequestError') {
        throw new HttpException('Unknown checkout session', 404);
      }
      throw err;
    }
    if (!found) {
      throw new HttpException('Unknown checkout session', 404);
    }
    return this.summary(org);
  }

  @Patch('/auto-top-up')
  async autoTopUp(
    @GetOrgFromRequest() org: OrgWithRole,
    @Body() body: WalletAutoTopUpDto
  ) {
    assertAdmin(org);
    // Turning it off stays possible on any plan.
    if (body.enabled) {
      assertNoPlan(org);
    }
    const wallet = await this._wallet.ensureWallet(org.id);
    if (body.enabled) {
      if (wallet.frozenAt) {
        throw new HttpException(walletFrozenMessage(), 400);
      }
      const rules = await this._wallet.topUpRules();
      if (!wallet.paymentMethodId) {
        throw new HttpException('Save a card with a top-up first', 400);
      }
      if (!body.amount || body.amount < rules.minAmount) {
        throw new HttpException(
          `The minimum top-up is ${await this._wallet.formatMoney(
            rules.minAmount
          )}`,
          400
        );
      }
      if (!(await this._wallet.isWholeAmount(body.amount))) {
        throw new HttpException(await this._wallet.wholeAmountMessage(), 400);
      }
      if (!body.monthlyCap || body.monthlyCap < body.amount) {
        throw new HttpException(
          'Set a monthly limit of at least one top-up',
          400
        );
      }
    }
    await this._wallet.updateWallet(org.id, {
      autoTopUp: body.enabled,
      autoTopUpThreshold: body.threshold ?? wallet.autoTopUpThreshold,
      autoTopUpAmount: body.amount ?? wallet.autoTopUpAmount,
      autoTopUpMonthlyCap: body.monthlyCap ?? wallet.autoTopUpMonthlyCap,
    });
    return this.summary(org);
  }
}

// Stripe calls this, so it sits outside the signed-in routes. The signature
// check is the authentication.
@ApiTags('Wallet')
@Controller('/wallet-webhook')
export class WalletWebhookController {
  constructor(private _billing: WalletBillingService) {}

  @Post('/')
  async webhook(@Req() req: RawBodyRequest<Request>) {
    let event;
    try {
      event = this._billing.validateWebhook(
        req.rawBody!,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        req.headers['stripe-signature']
      );
    } catch {
      throw new HttpException('Invalid signature', 400);
    }
    try {
      return await this._billing.handleEvent(event);
    } catch (err) {
      // Non-2xx so Stripe retries and flags the endpoint; already alerted.
      if (err instanceof WalletPaymentMismatchError) {
        throw new HttpException('Payment does not match its metadata', 400);
      }
      throw err;
    }
  }
}
