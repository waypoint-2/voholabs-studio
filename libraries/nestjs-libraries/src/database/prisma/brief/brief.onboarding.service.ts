import { HttpException, Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { BriefOnboardingRepository } from '@gitroom/nestjs-libraries/database/prisma/brief/brief.onboarding.repository';
import {
  InsufficientCreditsError,
  WalletService,
  walletPaymentRequired,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import { WalletBillingService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.billing.service';
import { fallbackLng, languages } from '@gitroom/react/translation/i18n.config';

export const BRIEF_ONBOARDING_ACTION = 'brief.onboarding';
// A run still open after this long was abandoned.
export const BRIEF_ONBOARDING_STALE_MS = 3 * 60 * 60 * 1000;
// The link that opens the onboarding is short-lived; the site keeps its own
// session once it has checked it.
export const BRIEF_ONBOARDING_TOKEN_TTL_MS = 15 * 60 * 1000;

// The app language the onboarding should use, or the default.
export const briefOnboardingLanguage = (lang?: string) =>
  lang && languages.includes(lang) ? lang : fallbackLng;

export const briefOnboardingChargeKey = (id: string) =>
  `brief-onboarding:${id}`;

const base64url = (value: Buffer | string) =>
  Buffer.from(value).toString('base64url');

// Signs the claims the onboarding site needs to open a run for this
// workspace: `${payload}.${signature}`, HMAC-SHA256 over the payload.
export const signBriefOnboardingToken = (
  secret: string,
  claims: Record<string, unknown>
) => {
  const payload = base64url(JSON.stringify(claims));
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
};

// Runs the guided brief onboarding. The onboarding itself happens on the
// site named by BRIEF_ONBOARDING_URL; Studio opens a run (and charges it),
// hands the user over with a signed link, and closes the run when the site
// reports back (refunding it if it failed). It never creates an agent.
@Injectable()
export class BriefOnboardingService {
  private _logger = new Logger(BriefOnboardingService.name);

  constructor(
    private _repository: BriefOnboardingRepository,
    private _wallet: WalletService,
    private _billing: WalletBillingService
  ) {}

  // Whether this install has an onboarding site configured.
  available() {
    const secret = process.env.BRIEF_ONBOARDING_SECRET;
    return (
      !!process.env.BRIEF_ONBOARDING_URL && !!secret && secret.length >= 32
    );
  }

  private config() {
    const url = process.env.BRIEF_ONBOARDING_URL;
    const secret = process.env.BRIEF_ONBOARDING_SECRET;
    if (!url || !secret || secret.length < 32) {
      throw new HttpException('Brief onboarding is not available', 404);
    }
    return { url, secret };
  }

  private async closeStale(organizationId: string) {
    const stale = await this._repository.staleRunning(
      organizationId,
      new Date(Date.now() - BRIEF_ONBOARDING_STALE_MS)
    );
    for (const run of stale) {
      if (run.chargeKey) {
        await this._wallet.refund(
          run.chargeKey,
          'Brief onboarding not finished'
        );
      }
      await this._repository.update(run.id, {
        status: 'FAILED',
        error: 'Not finished in time',
        finishedAt: new Date(),
      });
    }
  }

  // Charges a new run when it is opened (the user confirmed it in Studio),
  // once per run (chargeKey). The free units of the brief.onboarding row
  // make the first run free. Auto top-up runs first when it covers the
  // price; otherwise the run is closed and the wallet's 402 is thrown. The
  // charge is refunded if the run fails or is abandoned.
  private async chargeRun(organizationId: string, id: string) {
    if (!(await this._wallet.paysFromWallet(organizationId))) {
      return null;
    }
    if (!(await this._wallet.price(BRIEF_ONBOARDING_ACTION))) {
      return null;
    }
    try {
      const entry = await this._billing.charge({
        organizationId,
        actionKey: BRIEF_ONBOARDING_ACTION,
        chargeKey: briefOnboardingChargeKey(id),
        reference: id,
      });
      return entry?.idempotencyKey || briefOnboardingChargeKey(id);
    } catch (err) {
      await this._repository.update(id, {
        status: 'FAILED',
        error: 'Not paid',
        finishedAt: new Date(),
      });
      if (err instanceof InsufficientCreditsError) {
        throw walletPaymentRequired(
          'Your wallet balance does not cover the brief onboarding. Top up to run it.'
        );
      }
      throw err;
    }
  }

  async start(
    organizationId: string,
    user: { email: string; name?: string | null },
    lang?: string
  ) {
    const { url, secret } = this.config();
    await this.closeStale(organizationId);

    let run = await this._repository.running(organizationId);
    if (!run) {
      run = await this._repository.create(
        organizationId,
        briefOnboardingLanguage(lang)
      );
      const chargeKey = await this.chargeRun(organizationId, run.id);
      if (chargeKey) {
        run = await this._repository.update(run.id, { chargeKey });
      }
    }

    // A reopened run continues in the language it was opened in, whatever
    // Studio is set to now: the interview so far is in that language.
    const language = briefOnboardingLanguage(run.lang || lang);
    const token = signBriefOnboardingToken(secret, {
      v: 1,
      r: run.id,
      o: organizationId,
      e: user.email,
      n: user.name || '',
      l: language,
      exp: Date.now() + BRIEF_ONBOARDING_TOKEN_TTL_MS,
    });

    const separator = url.includes('?') ? '&' : '?';
    return {
      id: run.id,
      url: `${url}${separator}st=${token}&lang=${language}`,
    };
  }

  // Whether opening a new run takes credits: no run is open (an open one is
  // reopened for free), the workspace pays from the wallet and has no free
  // run left. The price itself is the price row's.
  private async nextRunCharged(organizationId: string, open: boolean) {
    if (open || !(await this._wallet.paysFromWallet(organizationId))) {
      return false;
    }
    const free = await this._wallet.freeUnitsRemaining(
      organizationId,
      BRIEF_ONBOARDING_ACTION
    );
    return !free;
  }

  async status(organizationId: string) {
    await this.closeStale(organizationId);
    const [running, last] = await Promise.all([
      this._repository.running(organizationId),
      this._repository.last(organizationId),
    ]);
    const nextRunCharged = await this.nextRunCharged(
      organizationId,
      !!running
    );
    return {
      available: this.available(),
      nextRunCharged,
      running: running
        ? { id: running.id, createdAt: running.createdAt }
        : null,
      last: last
        ? {
            id: last.id,
            status: last.status,
            finishedAt: last.finishedAt,
            error: last.error,
          }
        : null,
    };
  }

  async finish(
    id: string,
    organizationId: string,
    status: 'DONE' | 'FAILED',
    error?: string
  ) {
    const run = await this._repository.getById(id);
    if (!run || run.organizationId !== organizationId) {
      throw new HttpException('Onboarding run not found', 404);
    }

    if (
      run.status === 'DONE' ||
      (run.status === 'FAILED' && status === 'FAILED')
    ) {
      return { id, status: run.status, charged: !!run.chargeKey };
    }

    if (status === 'FAILED') {
      if (run.chargeKey) {
        await this._wallet.refund(run.chargeKey, 'Brief onboarding failed');
      }
      await this._repository.update(id, {
        status: 'FAILED',
        error: (error || 'Failed').slice(0, 500),
        finishedAt: new Date(),
      });
      return { id, status: 'FAILED' as const, charged: false };
    }

    // Charged when it was opened: finishing never charges it again.
    if (run.chargeKey) {
      await this._repository.update(id, {
        status: 'DONE',
        error: null,
        finishedAt: new Date(),
      });
      return { id, status: 'DONE' as const, charged: true };
    }

    // Runs opened before charging moved to the start, and workspaces that
    // started paying from the wallet mid-run, are charged here as before.
    let chargeKey: string | null = null;
    try {
      if (await this._wallet.paysFromWallet(organizationId)) {
        const entry = await this._billing.charge({
          organizationId,
          actionKey: BRIEF_ONBOARDING_ACTION,
          chargeKey: briefOnboardingChargeKey(id),
          allowNegative: true,
          reference: id,
        });
        chargeKey = entry?.idempotencyKey || briefOnboardingChargeKey(id);
      }
    } catch (err) {
      this._logger.error(`Brief onboarding charge failed for ${id}: ${err}`);
    }

    await this._repository.update(id, {
      status: 'DONE',
      chargeKey,
      error: null,
      finishedAt: new Date(),
    });
    return { id, status: 'DONE' as const, charged: !!chargeKey };
  }
}
