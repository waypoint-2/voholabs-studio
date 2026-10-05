import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  AnalyticsData,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { Integration, Organization } from '@prisma/client';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import dayjs from 'dayjs';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { difference, uniq } from 'lodash';
import utc from 'dayjs/plugin/utc';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { TemporalService } from 'nestjs-temporal-core';
import {
  listRecentMedia as readRecentMedia,
  RecentMediaOptions,
} from '@gitroom/nestjs-libraries/integrations/social/recent.media';

dayjs.extend(utc);

import {
  hasAccess,
  paidOnlyChannelMessage,
  providerNeedsPaidPlan,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/trial';
import {
  InsufficientCreditsError,
  WalletService,
  walletPaymentRequired,
  walletRequiredMessage,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import { WalletBillingService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.billing.service';
import { walletAlert } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert';

// Paid reads and lookups on a provider's API, priced by the `<provider>.<action>`
// wallet rows.
export type PaidApiAction = 'post_read' | 'user_lookup';

// Channel analytics reads each post twice: once in the timeline, then again
// for its stats. Both reads are billed by X.
export const READS_PER_ANALYTICS_POST = 2;

// A post's channel-analytics reads are charged at most once per UTC day per
// workspace, whichever window (7, 30, 90 days) or refresh reads it first.
export const analyticsReadPrefix = (
  identifier: string,
  orgId: string,
  day = dayjs.utc().format('YYYY-MM-DD')
) => `${providerKey(identifier)}read:${orgId}:${day}:`;

// Upstream's one-hour cache of a channel's analytics for one window.
const analyticsCacheKey = (orgId: string, integration: string, date: string) =>
  `integration:${orgId}:${integration}:${date}`;

const providerKey = (identifier: string) =>
  (identifier || '').toLowerCase().split('-')[0];

// Shown (and logged) when a wallet workspace has too few credits for a paid
// read or lookup, which is then not made.
export const apiNeedsCreditsMessage = (identifier: string) => {
  const p = providerKey(identifier);
  const label =
    p.length <= 2 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1);
  return `Not enough credits in your wallet to load this from ${label}. Top up to see it.`;
};

// Shown when a wallet workspace's balance is used up and auto top-up cannot
// refill it, so live analytics are not read from the network.
export const analyticsNeedsCreditsMessage = (scope: 'channel' | 'post') =>
  `Not enough credits in your wallet to load this ${scope}'s analytics. Top up to see them.`;

const notEnoughCreditsToConnectMessage = () =>
  'Not enough credits in your wallet to connect this channel. Top up, then connect it again.';

@Injectable()
export class IntegrationService {
  private storage = UploadFactory.createStorage();
  constructor(
    private _integrationRepository: IntegrationRepository,
    private _autopostsRepository: AutopostRepository,
    private _integrationManager: IntegrationManager,
    private _notificationService: NotificationService,
    @Inject(forwardRef(() => RefreshIntegrationService))
    private _refreshIntegrationService: RefreshIntegrationService,
    private _temporalService: TemporalService,
    private _walletService: WalletService,
    private _walletBilling: WalletBillingService
  ) {}

  async changeActiveCron(orgId: string) {
    const data = await this._autopostsRepository.getAutoposts(orgId);

    for (const item of data.filter((f) => f.active)) {
      try {
        await this._temporalService.terminateWorkflow(`autopost-${item.id}`);
      } catch (err) {}
    }

    return true;
  }

  getMentions(platform: string, q: string) {
    return this._integrationRepository.getMentions(platform, q);
  }

  insertMentions(
    platform: string,
    mentions: { name: string; username: string; image: string }[]
  ) {
    return this._integrationRepository.insertMentions(platform, mentions);
  }

  async setTimes(
    orgId: string,
    integrationId: string,
    times: IntegrationTimeDto
  ) {
    return this._integrationRepository.setTimes(orgId, integrationId, times);
  }

  updateProviderSettings(org: string, id: string, additionalSettings: string) {
    return this._integrationRepository.updateProviderSettings(
      org,
      id,
      additionalSettings
    );
  }

  checkPreviousConnections(org: string, id: string) {
    return this._integrationRepository.checkPreviousConnections(org, id);
  }

  async createOrUpdateIntegration(
    additionalSettings:
      | {
          title: string;
          description: string;
          type: 'checkbox' | 'text' | 'textarea';
          value: any;
          regex?: string;
        }[]
      | undefined,
    oneTimeToken: boolean,
    org: string,
    name: string,
    picture: string | undefined,
    type: 'article' | 'social',
    internalId: string,
    provider: string,
    token: string,
    refreshToken = '',
    expiresIn?: number,
    username?: string,
    isBetweenSteps = false,
    refresh?: string,
    timezone?: number,
    customInstanceDetails?: string
  ) {
    // The avatar is NOT copied into our storage any more. A copy went stale the
    // moment someone changed their picture on the network, and because the
    // bucket expires objects the copy eventually vanished and the channel showed
    // a broken image - with nothing to heal it, since the network was never
    // asked again. What is stored instead is the network's own URL, which the
    // /picture proxy re-resolves and caches. See IntegrationPictureService.
    const pictureSource = picture || undefined;

    return this._integrationRepository.createOrUpdateIntegration(
      additionalSettings,
      oneTimeToken,
      org,
      name,
      pictureSource,
      type,
      internalId,
      provider,
      token,
      refreshToken,
      expiresIn,
      username,
      isBetweenSteps,
      refresh,
      timezone,
      customInstanceDetails
    );
  }

  updateIntegrationGroup(org: string, id: string, group: string) {
    return this._integrationRepository.updateIntegrationGroup(org, id, group);
  }

  updateOnCustomerName(org: string, id: string, name: string) {
    return this._integrationRepository.updateOnCustomerName(org, id, name);
  }

  getIntegrationsList(org: string) {
    return this._integrationRepository.getIntegrationsList(org);
  }

  getIntegrationForOrder(id: string, order: string, user: string, org: string) {
    return this._integrationRepository.getIntegrationForOrder(
      id,
      order,
      user,
      org
    );
  }

  updateNameAndUrl(id: string, name: string, url: string) {
    return this._integrationRepository.updateNameAndUrl(id, name, url);
  }

  getIntegrationById(org: string, id: string) {
    return this._integrationRepository.getIntegrationById(org, id);
  }

  async refreshToken(provider: SocialProvider, refresh: string) {
    try {
      const { refreshToken, accessToken, expiresIn } =
        await provider.refreshToken(refresh);

      if (!refreshToken || !accessToken || !expiresIn) {
        return false;
      }

      return { refreshToken, accessToken, expiresIn };
    } catch (e) {
      return false;
    }
  }

  async disconnectChannel(orgId: string, integration: Integration) {
    await this._integrationRepository.disconnectChannel(orgId, integration.id);
    await this.informAboutRefreshError(orgId, integration);
  }

  async informAboutRefreshError(
    orgId: string,
    integration: Integration,
    err = ''
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}`,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}. Please go back to the system and connect it again ${process.env.FRONTEND_URL}/launches`,
      true,
      false,
      'info'
    );
  }

  async refreshNeeded(org: string, id: string) {
    return this._integrationRepository.refreshNeeded(org, id);
  }

  async setBetweenRefreshSteps(id: string) {
    return this._integrationRepository.setBetweenRefreshSteps(id);
  }

  async refreshTokens() {
    const integrations = await this._integrationRepository.needsToBeRefreshed();
    for (const integration of integrations) {
      const provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );

      const data = await this.refreshToken(provider, integration.refreshToken!);

      if (!data) {
        await this.informAboutRefreshError(
          integration.organizationId,
          integration
        );
        await this._integrationRepository.refreshNeeded(
          integration.organizationId,
          integration.id
        );
        return;
      }

      const { refreshToken, accessToken, expiresIn } = data;

      await this.createOrUpdateIntegration(
        undefined,
        !!provider.oneTimeToken,
        integration.organizationId,
        integration.name,
        undefined,
        'social',
        integration.internalId,
        integration.providerIdentifier,
        accessToken,
        refreshToken,
        expiresIn
      );
    }
  }

  async disableChannel(org: string, id: string) {
    return this._integrationRepository.disableChannel(org, id);
  }

  async enableChannel(org: string, totalChannels: number, id: string) {
    const integrations = (
      await this._integrationRepository.getIntegrationsList(org)
    ).filter((f) => !f.disabled);
    if (
      !!process.env.STRIPE_PUBLISHABLE_KEY &&
      integrations.length >= totalChannels
    ) {
      throw new Error('You have reached the maximum number of channels');
    }

    return this._integrationRepository.enableChannel(org, id);
  }

  async getPostsForChannel(org: string, id: string) {
    return this._integrationRepository.getPostsForChannel(org, id);
  }

  async deleteChannel(org: string, id: string) {
    // Best-effort: revoke the grant on the platform before dropping our copy of
    // the tokens, so the user's authorization is cleared on their side too.
    // Never let a failed revoke block the deletion the user asked for.
    try {
      const getIntegration =
        await this._integrationRepository.getIntegrationById(org, id);

      if (getIntegration?.token) {
        const provider = this._integrationManager.getSocialIntegration(
          getIntegration.providerIdentifier
        );

        await provider?.revoke?.(getIntegration.token);
      }
    } catch (err) {
      console.error('Could not revoke access before deleting channel', err);
    }

    return this._integrationRepository.deleteChannel(org, id);
  }

  async disableIntegrations(org: string, totalChannels: number) {
    return this._integrationRepository.disableIntegrations(org, totalChannels);
  }

  async checkForDeletedOnceAndUpdate(org: string, page: string) {
    return this._integrationRepository.checkForDeletedOnceAndUpdate(org, page);
  }

  async saveProviderPage(org: string, id: string, data: any) {
    const getIntegration = await this._integrationRepository.getIntegrationById(
      org,
      id
    );
    if (!getIntegration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    if (!getIntegration.inBetweenSteps) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }

    const provider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (!provider.fetchPageInformation) {
      throw new HttpException(
        'Provider does not support page selection',
        HttpStatus.BAD_REQUEST
      );
    }

    let getIntegrationInformation: Awaited<
      ReturnType<NonNullable<typeof provider.fetchPageInformation>>
    >;

    try {
      getIntegrationInformation = await provider.fetchPageInformation(
        getIntegration.token,
        data
      );
    } catch (err) {
      // Providers throw plain errors carrying a user-facing explanation, for
      // example a missing role on the Facebook Page behind an Instagram
      // account. Without this the message is lost and the connect dialog only
      // sees an opaque 500, so the user is told nothing about how to fix it.
      throw new HttpException(
        err instanceof Error && err.message
          ? err.message
          : 'Could not connect this channel, please try again.',
        HttpStatus.BAD_REQUEST
      );
    }

    await this.checkForDeletedOnceAndUpdate(
      org,
      String(getIntegrationInformation.id)
    );
    await this._integrationRepository.updateIntegration(id, {
      picture: getIntegrationInformation.picture,
      internalId: String(getIntegrationInformation.id),
      organizationId: org,
      name: getIntegrationInformation.name,
      inBetweenSteps: false,
      token: getIntegrationInformation.access_token,
      profile: getIntegrationInformation.username,
    });

    return { success: true };
  }

  // When the cached channel analytics for this window were read from the
  // network (ISO time), or null when nothing is cached (the next read is
  // live). The cache itself is upstream's (one hour); this only dates it.
  async analyticsUpdatedAt(orgId: string, integration: string, date: string) {
    const key = analyticsCacheKey(orgId, integration, date);
    return (await ioRedis.get(`${key}:at`)) || null;
  }

  // `fresh` skips the cache and reads the network again (a wallet workspace
  // pays for those reads, see below). A paid plan always gets the cache, as
  // before: `fresh` is ignored for it.
  async checkAnalytics(
    org: Organization,
    integration: string,
    date: string,
    forceRefresh = false,
    fresh = false
  ): Promise<AnalyticsData[]> {
    const getIntegration = await this.getIntegrationById(org.id, integration);

    if (!getIntegration) {
      throw new Error('Invalid integration');
    }

    if (getIntegration.type !== 'social') {
      return [];
    }

    if (fresh && (await this.organizationHasPaidPlan(org.id))) {
      fresh = false;
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    try {
      if (
        dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
        forceRefresh
      ) {
        const data = await this._refreshIntegrationService.refresh(
          getIntegration
        );
        if (!data) {
          return [];
        }

        const { accessToken } = data;

        if (accessToken) {
          getIntegration.token = accessToken;

          if (integrationProvider.refreshWait) {
            await timer(10000);
          }
        } else {
          await this.disconnectChannel(org.id, getIntegration);
          return [];
        }
      }

      const getIntegrationData = fresh
        ? null
        : await ioRedis.get(analyticsCacheKey(org.id, integration, date));
      if (getIntegrationData) {
        return JSON.parse(getIntegrationData);
      }

      if (integrationProvider.analytics) {
        // A wallet workspace pays for each post read (only on a cache miss,
        // above). Before X is asked its balance must be above zero (auto
        // top-up may refill it); otherwise this throws the wallet 402. The
        // reads are then charged by how many posts came back, two reads per
        // post.
        const walletPays = await this.paysFromWallet(
          org.id,
          getIntegration.providerIdentifier
        );
        if (
          walletPays &&
          !(await this.assertCanReadAnalytics(
            org.id,
            getIntegration.providerIdentifier,
            'channel'
          ))
        ) {
          return [];
        }

        // A provider the wallet pays for takes a 4th argument that is told
        // which posts were read (XProvider.analytics). Other providers use the
        // 4th argument for something else, so it is only passed here.
        const postsRead: string[] = [];
        const loadAnalytics = walletPays
          ? await (
              integrationProvider.analytics as (
                id: string,
                accessToken: string,
                date: number,
                onPostsRead: (count: number, ids: string[]) => void
              ) => Promise<AnalyticsData[]>
            ).call(
              integrationProvider,
              getIntegration.internalId,
              getIntegration.token,
              +date,
              (_count: number, ids: string[]) => {
                postsRead.push(...ids);
              }
            )
          : await integrationProvider.analytics(
              getIntegration.internalId,
              getIntegration.token,
              +date
            );
        if (walletPays && postsRead.length > 0) {
          // The reads already happened, so they are charged even into a
          // negative balance: two reads per post, and only for posts not
          // already charged today (another window or a refresh).
          await this.chargeApiReads({
            orgId: org.id,
            identifier: getIntegration.providerIdentifier,
            postIds: postsRead,
            reference: getIntegration.id,
          });
        }
        const ttl =
          !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
            ? 1
            : 3600;
        await ioRedis.set(
          analyticsCacheKey(org.id, integration, date),
          JSON.stringify(loadAnalytics),
          'EX',
          ttl
        );
        await ioRedis.set(
          analyticsCacheKey(org.id, integration, date) + ':at',
          new Date().toISOString(),
          'EX',
          ttl
        );
        return loadAnalytics;
      }

      return [];
    } catch (e) {
      // The wallet refusal (402) reaches the caller, who shows the top-up.
      if (
        e instanceof HttpException &&
        e.getStatus() === HttpStatus.PAYMENT_REQUIRED
      ) {
        throw e;
      }
      // A RefreshToken error means the access token expired mid-request; retry
      // once with a forced refresh. Guard against infinite recursion.
      if (e instanceof RefreshToken && !forceRefresh) {
        return this.checkAnalytics(org, integration, date, true, fresh);
      }

      // Any other failure (token refresh error, provider outage, bad response)
      // must not 500 the whole analytics page - degrade to empty analytics for
      // this single channel and surface the real cause in the logs.
      console.error(
        `Analytics failed for integration ${integration} (${getIntegration.providerIdentifier}):`,
        e
      );
      return [];
    }
  }

  // Read-only: no refresh, no disable, no disconnect. See recent.media.ts.
  listRecentMedia(
    orgId: string,
    integrationId: string,
    opts: RecentMediaOptions
  ) {
    return readRecentMedia(
      {
        getIntegration: (org, id) => this.getIntegrationById(org, id),
        getProvider: (identifier) =>
          this._integrationManager.getSocialIntegration(identifier),
      },
      orgId,
      integrationId,
      opts
    );
  }

  customers(orgId: string) {
    return this._integrationRepository.customers(orgId);
  }

  getPlugsByIntegrationId(org: string, integrationId: string) {
    return this._integrationRepository.getPlugsByIntegrationId(
      org,
      integrationId
    );
  }

  async organizationHasPaidPlan(orgId: string) {
    return hasAccess(
      await this._integrationRepository.organizationSubscription(orgId)
    );
  }

  // X is locked on the free plan. A paid plan opens it, and so
  // does a wallet top-up for a provider the wallet charges for.
  async canUseProvider(orgId: string, identifier: string) {
    return (
      !providerNeedsPaidPlan(identifier) ||
      (await this.organizationHasPaidPlan(orgId)) ||
      (await this._walletService.unlocksProvider(orgId, identifier))
    );
  }

  // Whether this workspace pays for this provider's API from its wallet: it
  // is not on a paid plan, and its top-up opened the provider. Paid plans and
  // the free plan are never charged.
  // A paid API the wallet charges for, used by a workspace without a paid
  // plan. Such a workspace's calls are charged when its wallet has unlocked
  // the provider, and refused (never made unbilled) when it has not, e.g. a
  // frozen wallet that still has the channel connected.
  async paysFromWallet(orgId: string, identifier: string) {
    return (
      providerNeedsPaidPlan(identifier) &&
      !(await this.organizationHasPaidPlan(orgId)) &&
      (await this._walletService.billsProvider(identifier))
    );
  }

  // Called before a live analytics read on a paid API by a workspace that
  // pays from its wallet (a cached answer never gets here). A balance above
  // zero may read; at zero or below, auto top-up is tried (within its
  // monthly limit) and the read goes ahead if that lifts the balance above
  // zero. Otherwise throws the wallet 402 and the network must not be asked.
  // The reads are charged after they happen, into a negative balance if
  // need be, so a read can take the balance below zero by one batch at most.
  // Returns false (read nothing, quietly) when the read has no price row.
  async assertCanReadAnalytics(
    orgId: string,
    identifier: string,
    scope: 'channel' | 'post'
  ) {
    if (!(await this._walletService.unlocksProvider(orgId, identifier))) {
      throw walletPaymentRequired(
        await this._walletService.lockedProviderMessageFor(orgId, identifier)
      );
    }
    const readKey = `${providerKey(identifier)}.post_read`;
    if (!(await this._walletService.price(readKey))) {
      console.warn(
        `[wallet] No price for ${readKey}, analytics not read (organization ${orgId})`
      );
      return false;
    }
    if ((await this._walletService.balance(orgId)) > 0) {
      return true;
    }
    if (await this._walletBilling.autoTopUpFor(orgId, 1)) {
      return true;
    }
    console.warn(
      `[wallet] ${analyticsNeedsCreditsMessage(scope)} (organization ${orgId})`
    );
    throw walletPaymentRequired(analyticsNeedsCreditsMessage(scope));
  }

  // Charges a wallet workspace for a paid read or lookup, once per chargeKey.
  // Returns the charge (to refund if nothing came back), or false when the
  // wallet cannot pay or the action has no price: the call must then not be
  // made.
  async chargeApiUse(params: {
    orgId: string;
    identifier: string;
    action: PaidApiAction;
    chargeKey: string;
    reference?: string;
    quantity?: number;
    allowNegative?: boolean;
  }): Promise<string | false> {
    if (
      !(await this._walletService.unlocksProvider(
        params.orgId,
        params.identifier
      ))
    ) {
      return false;
    }
    try {
      const entry = await this._walletBilling.charge({
        organizationId: params.orgId,
        actionKey: `${providerKey(params.identifier)}.${params.action}`,
        chargeKey: params.chargeKey,
        quantity: params.quantity,
        reference: params.reference,
        allowNegative: params.allowNegative,
      });
      return entry.idempotencyKey!;
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        console.warn(
          `[wallet] ${apiNeedsCreditsMessage(params.identifier)} (organization ${
            params.orgId
          }, ${params.chargeKey})`
        );
      } else {
        console.error(
          `[wallet] Could not charge ${params.chargeKey} for organization ${params.orgId}:`,
          err
        );
      }
      return false;
    }
  }

  // Charges the channel-analytics reads of these posts, skipping posts this
  // workspace already paid to read today (UTC). Returns the ledger entry, or
  // null when nothing new was charged.
  async chargeApiReads(params: {
    orgId: string;
    identifier: string;
    postIds: string[];
    reference?: string;
  }) {
    if (
      !params.postIds.length ||
      !(await this._walletService.unlocksProvider(
        params.orgId,
        params.identifier
      ))
    ) {
      return null;
    }
    const chargePrefix = analyticsReadPrefix(params.identifier, params.orgId);
    try {
      return await this._walletBilling.chargeItems({
        organizationId: params.orgId,
        actionKey: `${providerKey(params.identifier)}.post_read`,
        chargePrefix,
        items: params.postIds,
        unitsPerItem: READS_PER_ANALYTICS_POST,
        reference: params.reference,
        allowNegative: true,
      });
    } catch (err) {
      console.error(
        `[wallet] Could not charge ${chargePrefix} for organization ${params.orgId}:`,
        err
      );
      return null;
    }
  }

  async refundApiUse(charge: string, reason: string) {
    try {
      await this._walletService.refund(charge, reason);
    } catch (err) {
      console.error(`[wallet] REFUND FAILED for charge ${charge}:`, err);
      await walletAlert(
        `Refund failed for charge ${charge}: ${
          err instanceof Error ? err.message : err
        }`
      ).catch(() => undefined);
    }
  }

  // Runs a provider function asked for by the app (`/integrations/function`).
  // For a wallet workspace on a paid API only the account lookup behind
  // @mentions may run, charged per username and UTC day; a handle already
  // known is answered from the stored list without asking the network.
  async runProviderFunction<T>(
    orgId: string,
    integration: Integration,
    name: string,
    data: any,
    call: () => Promise<T>
  ): Promise<T | [] | false> {
    if (!(await this.paysFromWallet(orgId, integration.providerIdentifier))) {
      return call();
    }
    if (name !== 'mention') {
      return false;
    }

    const query = String(data?.query || '').trim();
    if (!query) {
      return [];
    }
    const known = await this.getMentions(
      integration.providerIdentifier,
      query
    );
    if (
      known.some(
        (m) => (m.username || '').toLowerCase() === query.toLowerCase()
      )
    ) {
      return [];
    }

    const charge = await this.chargeApiUse({
      orgId,
      identifier: integration.providerIdentifier,
      action: 'user_lookup',
      chargeKey: `${providerKey(integration.providerIdentifier)}lookup:${
        integration.id
      }:${query.toLowerCase()}:${dayjs.utc().format('YYYY-MM-DD')}`,
      reference: integration.id,
    });
    if (!charge) {
      return [];
    }

    const result = await call();
    if (!Array.isArray(result) || !result.length) {
      await this.refundApiUse(charge, 'Refund: no account was found');
    }
    return result;
  }

  // The account lookup made when a wallet workspace connects a channel on a
  // paid API, charged once per connection attempt. Throws a 402 the app turns
  // into the top-up flow when the wallet cannot pay. Returns the charge to
  // refund if the connection fails, or undefined when nothing was charged.
  async chargeConnectLookup(
    orgId: string,
    identifier: string,
    state: string
  ): Promise<string | undefined> {
    if (!(await this.paysFromWallet(orgId, identifier))) {
      return undefined;
    }
    const charge = await this.chargeApiUse({
      orgId,
      identifier,
      action: 'user_lookup',
      chargeKey: `${providerKey(identifier)}lookup:connect:${orgId}:${state}`,
    });
    if (!charge) {
      throw new HttpException(
        {
          message: notEnoughCreditsToConnectMessage(),
          wallet: true,
          url: '/wallet',
        },
        HttpStatus.PAYMENT_REQUIRED
      );
    }
    return charge;
  }

  // Why a provider the free plan locks is refused. With the workspace given,
  // a wallet on hold (after a refunded or disputed top-up) says so instead of
  // asking for a top-up.
  async lockedProviderMessage(identifier: string, orgId?: string) {
    if (orgId) {
      return this._walletService.lockedProviderMessageFor(orgId, identifier);
    }
    if (!(await this._walletService.billsProvider(identifier))) {
      return paidOnlyChannelMessage();
    }
    return walletRequiredMessage(identifier);
  }

  async processInternalPlug(
    data: {
      post: string;
      originalIntegration: string;
      integration: string;
      plugName: string;
      orgId: string;
      delay: number;
      information: any;
    },
    forceRefresh = false
  ): Promise<any> {
    const originalIntegration =
      await this._integrationRepository.getIntegrationById(
        data.orgId,
        data.originalIntegration
      );

    const getIntegration = await this._integrationRepository.getIntegrationById(
      data.orgId,
      data.integration
    );

    if (!getIntegration || !originalIntegration) {
      return;
    }

    const getAllInternalPlugs = this._integrationManager
      .getInternalPlugs(getIntegration.providerIdentifier)
      .internalPlugs.find((p: any) => p.identifier === data.plugName);

    if (!getAllInternalPlugs) {
      return;
    }

    // X automations don't run for free organizations.
    if (
      providerNeedsPaidPlan(getIntegration.providerIdentifier) &&
      !(await this.organizationHasPaidPlan(data.orgId))
    ) {
      return;
    }

    const getSocialIntegration = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    // @ts-ignore
    await getSocialIntegration?.[getAllInternalPlugs.methodName]?.(
      getIntegration,
      originalIntegration,
      data.post,
      data.information
    );

    return;
  }

  async processPlugs(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    const getPlugById = await this._integrationRepository.getPlug(data.plugId);
    if (!getPlugById) {
      return true;
    }

    // X automations don't run for free organizations.
    if (
      providerNeedsPaidPlan(getPlugById.integration.providerIdentifier) &&
      !(await this.organizationHasPaidPlan(
        getPlugById.integration.organizationId
      ))
    ) {
      return true;
    }

    const integration = this._integrationManager.getSocialIntegration(
      getPlugById.integration.providerIdentifier
    );

    // @ts-ignore
    const process = await integration[getPlugById.plugFunction](
      getPlugById.integration,
      data.postId,
      JSON.parse(getPlugById.data).reduce((all: any, current: any) => {
        all[current.name] = current.value;
        return all;
      }, {})
    );

    if (process) {
      return true;
    }

    if (data.totalRuns === data.currentRun) {
      return true;
    }

    return false;
  }

  async createOrUpdatePlug(
    orgId: string,
    integrationId: string,
    body: PlugDto
  ) {
    const { activated } = await this._integrationRepository.createOrUpdatePlug(
      orgId,
      integrationId,
      body
    );

    return {
      activated,
    };
  }

  async changePlugActivation(orgId: string, plugId: string, status: boolean) {
    const { id, integrationId, plugFunction } =
      await this._integrationRepository.changePlugActivation(
        orgId,
        plugId,
        status
      );

    return { id };
  }

  async getPlugs(orgId: string, integrationId: string) {
    return this._integrationRepository.getPlugs(orgId, integrationId);
  }

  async loadExisingData(
    methodName: string,
    integrationId: string,
    id: string[]
  ) {
    const exisingData = await this._integrationRepository.loadExisingData(
      methodName,
      integrationId,
      id
    );
    const loadOnlyIds = exisingData.map((p) => p.value);
    return difference(id, loadOnlyIds);
  }

  async findFreeDateTime(
    orgId: string,
    integrationsId?: string
  ): Promise<number[]> {
    const findTimes = await this._integrationRepository.getPostingTimes(
      orgId,
      integrationsId
    );
    return uniq(
      findTimes.reduce((all: any, current: any) => {
        return [
          ...all,
          ...JSON.parse(current.postingTimes).map(
            (p: { time: number }) => p.time
          ),
        ];
      }, [] as number[])
    );
  }
}
