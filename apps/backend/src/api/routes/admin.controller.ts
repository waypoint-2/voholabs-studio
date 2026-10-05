import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ErrorsService } from '@gitroom/nestjs-libraries/database/prisma/errors/errors.service';
import { AdminStatsService } from '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { WhitelistDto } from '@gitroom/nestjs-libraries/dtos/admin/whitelist.dto';
import dayjs from 'dayjs';
import { WalletService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  WalletAdjustDto,
  WalletGrantDto,
  WalletUnfreezeDto,
} from '@gitroom/nestjs-libraries/dtos/wallet/wallet.admin.dto';
import {
  WalletBillingService,
  walletPaymentsEnabled,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.billing.service';
import { walletAlert } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert';

// The signed-in superadmin behind a request. While impersonating, the request
// carries the impersonated user, so this reads the id from the auth token.
const actorIdOf = (req: Request, user: User) => {
  try {
    const auth = req.headers.auth || req.cookies?.auth;
    const payload = auth
      ? (AuthService.verifyJWT(String(auth)) as { id?: string } | null)
      : null;
    return payload?.id || user.id;
  } catch {
    return user.id;
  }
};

@ApiTags('Admin')
@Controller('/admin')
export class AdminController {
  constructor(
    private _errorsService: ErrorsService,
    private _adminStatsService: AdminStatsService,
    private _subscriptionService: SubscriptionService,
    private _organizationService: OrganizationService,
    private _userService: UsersService,
    private _postsService: PostsService,
    private _walletService: WalletService,
    private _walletBilling: WalletBillingService
  ) {}

  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }
  }

  // Whitelist an organization = give it the Subscription row a paying customer
  // has. `days` empty means forever, a number gives access for that many days,
  // `remove` expires it. `allExisting` is the one off backfill that keeps every
  // organization created before the free trial shipped unlimited.
  @Post('/whitelist')
  async whitelist(
    @GetUserFromRequest() user: User,
    @Body() body: WhitelistDto
  ) {
    this.assertSuperAdmin(user);

    if (body.allExisting) {
      const organizations =
        await this._subscriptionService.getAllOrganizationIds();

      for (const organization of organizations) {
        await this._subscriptionService.whitelistOrganization(
          organization.id,
          null
        );
      }

      return { whitelisted: organizations.length };
    }

    const orgId = await this.resolveOrganization(body.org, body.email);
    if (!orgId) {
      throw new HttpException('Organization not found', 400);
    }

    if (body.remove) {
      await this._subscriptionService.removeWhitelistFromOrganization(orgId);
      return { orgId, access: false };
    }

    await this._subscriptionService.whitelistOrganization(
      orgId,
      body.days || null
    );

    return { orgId, access: true, days: body.days || null };
  }

  private async resolveOrganization(org?: string, email?: string) {
    if (org) {
      return (await this._organizationService.getOrgById(org))?.id;
    }

    if (!email) {
      return undefined;
    }

    const user = await this._userService.getUserByEmail(email);
    if (!user) {
      return undefined;
    }

    return (await this._organizationService.getOrgsByUserId(user.id))?.[0]?.id;
  }

  @Get('/errors')
  async listErrors(
    @GetUserFromRequest() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: string,
    @Query('email') email?: string,
    @Query('unknownFirst') unknownFirst?: string
  ) {
    this.assertSuperAdmin(user);
    return this._errorsService.listErrors({
      page: page ? parseInt(page, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 20,
      platform: platform || undefined,
      email: email || undefined,
      unknownFirst: unknownFirst === 'true' || unknownFirst === '1',
    });
  }

  @Get('/errors/platforms')
  async listPlatforms(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._errorsService.listPlatforms();
  }

  // One off repair: Sanity posts published before the article's own URL was
  // stored point at the Studio document, and any `(post:<id>)` echo to one of
  // them links there too. Reports what it would change unless `apply` is set.
  @Post('/repair-sanity-urls')
  async repairSanityUrls(
    @GetUserFromRequest() user: User,
    @Body() body: { apply?: boolean }
  ) {
    this.assertSuperAdmin(user);
    return this._postsService.repairSanityReleaseUrls(!body?.apply);
  }

  @Get('/stats')
  async getStats(
    @GetUserFromRequest() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unknownOnly') unknownOnly?: string
  ) {
    this.assertSuperAdmin(user);

    const fromDate = from ? dayjs(from) : dayjs().subtract(30, 'day');
    const toDate = to ? dayjs(to) : dayjs();

    return this._adminStatsService.getStats({
      from: fromDate.startOf('day').toDate(),
      to: toDate.endOf('day').toDate(),
      unknownOnly: unknownOnly === 'true' || unknownOnly === '1',
    });
  }

  private async assertOrganization(organizationId: string) {
    if (!(await this._organizationService.getOrgById(organizationId))) {
      throw new HttpException('Organization not found', 404);
    }
  }

  // Wallet support. Credits are in hundredths (225 = 2.25 credits).
  // Gives credits (a GRANT entry); `unlock` also starts pay-as-you-go.
  // `idempotencyKey` makes a retry return the first entry.
  @Post('/wallet/grant')
  async walletGrant(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Body() body: WalletGrantDto
  ) {
    this.assertSuperAdmin(user);
    await this.assertOrganization(body.organizationId);
    const entry = await this._walletService.grant({
      organizationId: body.organizationId,
      credits: body.credits,
      reason: body.reason,
      actorId: actorIdOf(req, user),
      unlock: !!body.unlock,
      idempotencyKey: body.idempotencyKey,
    });
    return {
      entry,
      balance: await this._walletService.balance(body.organizationId),
    };
  }

  // Corrects the balance either way (an ADJUST entry); may go below zero.
  @Post('/wallet/adjust')
  async walletAdjust(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Body() body: WalletAdjustDto
  ) {
    this.assertSuperAdmin(user);
    await this.assertOrganization(body.organizationId);
    const entry = await this._walletService.adjust({
      organizationId: body.organizationId,
      credits: body.credits,
      reason: body.reason,
      actorId: actorIdOf(req, user),
      idempotencyKey: body.idempotencyKey,
    });
    return {
      entry,
      balance: await this._walletService.balance(body.organizationId),
    };
  }

  // Lifts the hold a refund or dispute put on a wallet. Auto top-up stays
  // off until the workspace turns it back on. Logged as a wallet alert.
  @Post('/wallet/unfreeze')
  async walletUnfreeze(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Body() body: WalletUnfreezeDto
  ) {
    this.assertSuperAdmin(user);
    await this.assertOrganization(body.organizationId);
    const result = await this._walletService.unfreeze(body.organizationId);
    if (!result) {
      throw new HttpException('This organization has no wallet', 404);
    }
    if (result.wasFrozen) {
      await walletAlert(
        `Wallet of org ${body.organizationId} unfrozen by ${actorIdOf(
          req,
          user
        )}: ${body.reason}`
      );
    }
    return {
      organizationId: body.organizationId,
      frozen: false,
      wasFrozen: result.wasFrozen,
      balance: await this._walletService.balance(body.organizationId),
    };
  }

  // Wallet payments in Stripe against top-ups in the ledger over the last
  // `days` days (1 to 90, default 7).
  @Get('/wallet/reconcile')
  async walletReconcile(
    @GetUserFromRequest() user: User,
    @Query('days') days?: string
  ) {
    this.assertSuperAdmin(user);
    if (!walletPaymentsEnabled()) {
      throw new HttpException('Wallet payments are not configured', 503);
    }
    return this._walletBilling.reconcile(Number(days) || 7);
  }

  // Balance, wallet row, Stripe customer and the last 50 entries.
  @Get('/wallet/:organizationId')
  async walletInspect(
    @GetUserFromRequest() user: User,
    @Param('organizationId') organizationId: string
  ) {
    this.assertSuperAdmin(user);
    return this._walletService.inspect(organizationId);
  }
}
