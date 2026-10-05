import { Injectable } from '@nestjs/common';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { WalletService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  AccessOrganization,
  hasAccess,
  providerNeedsPaidPlan,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/trial';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

const ALLOWED_AVATAR_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** An avatar is small; anything larger is not one and is not worth proxying. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/**
 * How long a fetched avatar is served from Redis before we ask the network
 * again. A day is the trade: a picture changed on the network shows up within
 * one, and a channel costs at most one provider call and one download per day
 * however often the calendar is opened.
 */
const CACHE_SECONDS = 24 * 60 * 60;

/** Cache a failure briefly too, so a dead avatar cannot hammer the provider. */
const NEGATIVE_CACHE_SECONDS = 10 * 60;

export type ResolvedPicture = { buffer: Buffer; contentType: string };

/**
 * Serves channel avatars by proxying the network's own image.
 *
 * Avatars used to be copied into R2 at connect time and never touched again.
 * That had two failures: the copy went stale the moment someone changed their
 * picture on the network, and - because the bucket expires objects - the copy
 * eventually disappeared and the channel showed a broken image. Neither could
 * heal, because nothing ever asked the network again.
 *
 * So nothing is copied. `Integration.picture` holds a URL pointing back at this
 * proxy, which is stable for the life of the channel, and the actual image is
 * fetched from the network on demand and cached for a day. A provider that can
 * report its current avatar is asked for it, so a changed picture follows
 * through; one that cannot falls back to the last source URL we stored.
 */
@Injectable()
export class IntegrationPictureService {
  constructor(
    private _integration: PrismaRepository<'integration'>,
    private _integrationManager: IntegrationManager,
    private _walletService: WalletService
  ) {}

  private cacheKey(id: string) {
    return `integration:picture:${id}`;
  }

  /**
   * The value stored in `Integration.picture`. It is our own URL, so it never
   * expires and never has to be rewritten when the network's URL changes.
   */
  static proxyUrl(id: string) {
    const base = (
      process.env.NEXT_PUBLIC_BACKEND_URL || ''
    ).replace(/\/+$/, '');

    return `${base}/integrations/${id}/picture`;
  }

  /**
   * Drop the cached image for one channel. Called after the user pushes a new
   * avatar to the network, so the change is visible immediately rather than
   * whenever the day-long cache happens to lapse.
   */
  async invalidate(id: string) {
    await ioRedis.del(this.cacheKey(id));
  }

  async getPicture(id: string): Promise<ResolvedPicture | null> {
    const cached = await ioRedis.get(this.cacheKey(id));
    if (cached) {
      // A cached miss is stored as an empty payload, so a channel whose avatar
      // is genuinely gone does not retry the network on every page load.
      const parsed = JSON.parse(cached);
      if (!parsed?.body) {
        return null;
      }

      return {
        buffer: Buffer.from(parsed.body, 'base64'),
        contentType: parsed.contentType,
      };
    }

    const integration = await this._integration.model.integration.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        token: true,
        internalId: true,
        picture: true,
        pictureSource: true,
        providerIdentifier: true,
        organizationId: true,
        organization: { select: { subscription: true } },
      },
    });

    if (!integration) {
      return null;
    }

    const source = await this.resolveSource(integration);
    const fetched = source ? await this.download(source) : null;

    await ioRedis.set(
      this.cacheKey(id),
      JSON.stringify(
        fetched
          ? {
              body: fetched.buffer.toString('base64'),
              contentType: fetched.contentType,
            }
          : { body: null }
      ),
      'EX',
      fetched ? CACHE_SECONDS : NEGATIVE_CACHE_SECONDS
    );

    return fetched;
  }

  /**
   * Ask the network where the avatar is now, and remember the answer. Falls
   * back to the last URL we stored when a provider cannot answer, or when
   * asking fails - a stale URL is still worth trying before giving up.
   */
  private async resolveSource(integration: {
    id: string;
    token: string;
    internalId: string;
    pictureSource: string | null;
    providerIdentifier: string;
    organizationId: string;
    organization: AccessOrganization | null;
  }): Promise<string | null> {
    let provider: any;

    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch (err) {
      return integration.pictureSource || null;
    }

    if (typeof provider?.currentProfilePicture !== 'function') {
      return integration.pictureSource || null;
    }

    // A workspace paying for X from its wallet would pay for this lookup
    // without having asked for it, so its avatar keeps the URL stored when
    // the channel was connected.
    if (
      providerNeedsPaidPlan(integration.providerIdentifier) &&
      !hasAccess(integration.organization) &&
      (await this._walletService.unlocksProvider(
        integration.organizationId,
        integration.providerIdentifier
      ))
    ) {
      return integration.pictureSource || null;
    }

    try {
      const current = await provider.currentProfilePicture(
        integration.token,
        integration.internalId
      );

      if (current && current !== integration.pictureSource) {
        await this._integration.model.integration.update({
          where: { id: integration.id },
          data: { pictureSource: current },
        });
      }

      return current || integration.pictureSource || null;
    } catch (err) {
      // An expired or revoked token must not blank the avatar - the refresh
      // flow deals with that, and the last known URL may still serve.
      return integration.pictureSource || null;
    }
  }

  private async download(url: string): Promise<ResolvedPicture | null> {
    if (!/^https?:\/\//i.test(url)) {
      return null;
    }

    try {
      const response = await fetch(url, {
        // @ts-ignore — undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      });

      if (!response.ok) {
        return null;
      }

      const declared = Number(response.headers.get('content-length'));
      if (declared && declared > MAX_AVATAR_BYTES) {
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_AVATAR_BYTES) {
        return null;
      }

      // Sniffed rather than trusted from the header, so the proxy cannot be
      // talked into serving something that is not an image.
      const detected = await fromBuffer(buffer);
      if (!detected || !ALLOWED_AVATAR_MIME.has(detected.mime)) {
        return null;
      }

      return { buffer, contentType: detected.mime };
    } catch (err) {
      return null;
    }
  }
}
