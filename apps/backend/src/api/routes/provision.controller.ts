import {
  Body,
  Controller,
  Headers,
  HttpException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { User } from '@prisma/client';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { AuthService as AuthChecker } from '@gitroom/helpers/auth/auth.service';
import { BriefOnboardingService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief.onboarding.service';
import {
  ProvisionAccessDto,
  ProvisionLookupDto,
  ProvisionOnboardingFinishDto,
  ProvisionSessionDto,
} from '@gitroom/nestjs-libraries/dtos/provision/provision.dto';

/**
 * Subscription plumbing for a trusted first-party front end.
 *
 * The caller sells a subscription elsewhere and needs three things from
 * Studio: whether an account exists, the ability to grant and revoke access as
 * that subscription changes, and the organization's API key so it can write the
 * brief. Nothing here is reachable without the shared secret, and none of it is
 * part of the public API.
 *
 * It deliberately cannot create an account. Customers sign up through Studio
 * itself, which is what ties a workspace to a person who proved they hold that
 * email. An endpoint that could mint accounts on a shared secret was a large
 * capability to leave sitting behind one string, and nothing needs it.
 *
 * Deliberately kept dumb about billing: the caller says when access should
 * lapse and this writes it down. Studio never asks who was paid or how much,
 * which keeps the payment provider entirely on the caller's side.
 *
 * The grant is always time limited. `subscriptionService.whitelistOrganization`
 * can grant forever by passing a null date, and that is exactly what must not
 * happen here: access has to follow the subscription, so a customer who stops
 * paying stops having access.
 */
@ApiTags('Provision')
@Controller('/public/provision')
export class ProvisionController {
  constructor(
    private _organizationService: OrganizationService,
    private _subscriptionService: SubscriptionService,
    private _userService: UsersService,
    private _briefOnboardingService: BriefOnboardingService
  ) {}

  // The secret is the only thing standing in front of account creation, so a
  // missing or short one disables the endpoints rather than weakening them.
  private assertSecret(given?: string) {
    const expected = process.env.PROVISION_SECRET;
    if (!expected || expected.length < 32) {
      throw new HttpException('Provisioning is not configured', 404);
    }

    const a = Buffer.from(given || '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new HttpException('Unauthorized', 401);
    }
  }

  // This mints a full owner session for the organization, and the only thing
  // standing in front of it is a shared secret held by another server. So it
  // must not mint anything durable: signJWT's default is a token with no `exp`
  // at all, which AuthMiddleware would keep accepting forever, and which could
  // only be withdrawn by rotating JWT_SECRET and logging out every user in the
  // product.
  //
  // Ten minutes, because the caller is server-to-server and spends this within
  // the request it asked for it in - it reads the API key, writes the brief and
  // is done. Nightly reconcile passes ask for one per customer per run, so
  // these exist in quantity; a leaked one should be a window, not a key. If
  // something ever genuinely needs to hold one for longer, that is a reason to
  // give it its own narrower credential, not to widen this.
  private sign(user: User) {
    const copy = { ...user } as Partial<User>;
    delete copy.password;
    return AuthChecker.signJWT(copy, { expiresIn: '10m' });
  }

  /**
   * Whether an account already exists for this email, and nothing else.
   *
   * The caller uses it to warn someone that re-onboarding will overwrite their
   * brief. It deliberately returns no profile, no name and no billing state:
   * this endpoint is a yes/no, not a lookup service.
   */
  @Post('/lookup')
  async lookup(
    @Headers('x-provision-secret') secret: string,
    @Body() body: ProvisionLookupDto
  ) {
    this.assertSecret(secret);

    // Any provider, not just password accounts. This answers "does this person
    // already have a workspace", and a customer who signed up with Google has
    // one exactly as much as anyone else - reporting `false` sends them off to
    // create a second workspace beside the one they are already using.
    const user = await this._userService.getUserByEmailAnyProvider(
      body.email.toLowerCase()
    );
    if (!user) {
      return { exists: false };
    }

    const orgs = await this._organizationService.getOrgsByUserId(user.id);
    return { exists: true, orgId: orgs?.[0]?.id ?? null };
  }

  /**
   * Moves the expiry, or expires it now. Driven by whatever the caller's
   * payment provider says has happened.
   */
  @Post('/access')
  async access(
    @Headers('x-provision-secret') secret: string,
    @Body() body: ProvisionAccessDto
  ) {
    this.assertSecret(secret);

    const organization = await this._organizationService.getOrgById(body.orgId);
    if (!organization) {
      throw new HttpException('Organization not found', 404);
    }

    if (body.revoke) {
      // Expires rather than deletes. A deleted subscription row reads as "no
      // subscription", which means unlimited on installs without billing.
      await this._subscriptionService.removeWhitelistFromOrganization(
        body.orgId
      );
      return { orgId: body.orgId, access: false };
    }

    if (!body.activeUntil) {
      throw new HttpException('activeUntil or revoke is required', 400);
    }

    const until = new Date(body.activeUntil);
    if (Number.isNaN(until.getTime())) {
      throw new HttpException('activeUntil must be a valid date', 400);
    }

    await this._subscriptionService.whitelistOrganizationUntil(
      body.orgId,
      until,
      'apex-stripe'
    );

    return { orgId: body.orgId, access: true, activeUntil: until.toISOString() };
  }

  /**
   * A fresh session and the organization's API key, for a caller that already
   * proved itself with the shared secret.
   *
   * Returning the API key here means the caller never has to store one: it can
   * ask again whenever it needs to write to this account. Both values are
   * credentials for the whole organization, so this is server-to-server only
   * and neither may be forwarded to a browser. Their lifetimes are not the
   * same, though: the session expires in minutes and is meant to be spent and
   * dropped, while the API key is durable and revoked by rotating it.
   */
  @Post('/session')
  async session(
    @Headers('x-provision-secret') secret: string,
    @Body() body: ProvisionSessionDto
  ) {
    this.assertSecret(secret);

    const organization = await this._organizationService.getOrgById(body.orgId);
    if (!organization) {
      throw new HttpException('Organization not found', 404);
    }

    const team = await this._organizationService.getTeam(body.orgId);
    const owner =
      team?.users?.find((member) => member.role === 'SUPERADMIN') ??
      team?.users?.[0];

    if (!owner) {
      throw new HttpException('Organization has no users', 404);
    }

    // getTeam returns a trimmed user, and the session has to be signed over the
    // whole row.
    //
    // By id, never by email. `getUserByEmail` filters to `providerName: LOCAL`,
    // which is right for a password login and wrong for everything else: an
    // owner who signed in with Google is simply not found, and this endpoint
    // answered "Organization owner not found" for a real organization with a
    // real owner. Both paying customers were in that state, and most of this
    // instance's users are - twelve of twenty are GOOGLE - so the email lookup
    // failed for the majority while looking like missing data.
    const user = await this._userService.getUserById(owner.user.id);
    if (!user) {
      throw new HttpException('Organization owner not found', 404);
    }

    return {
      orgId: body.orgId,
      // The caller names the customer's agent after their workspace, and the id
      // alone is not something a person can read at a glance in a fleet list.
      name: organization.name ?? null,
      apiKey: organization.apiKey ?? null,
      jwt: this.sign(user),
    };
  }

  /**
   * Closes a brief onboarding run once the onboarding site has written the
   * brief (DONE) or given up (FAILED). DONE charges the run to the wallet when
   * the workspace pays from it; FAILED gives back anything already charged.
   * Safe to call more than once.
   */
  @Post('/onboarding/:id/finish')
  async finishOnboarding(
    @Headers('x-provision-secret') secret: string,
    @Param('id') id: string,
    @Body() body: ProvisionOnboardingFinishDto
  ) {
    this.assertSecret(secret);
    return this._briefOnboardingService.finish(
      id,
      body.orgId,
      body.status,
      body.error
    );
  }
}
