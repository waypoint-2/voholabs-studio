import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthController } from '@gitroom/backend/api/routes/auth.controller';
import { AuthService } from '@gitroom/backend/services/auth/auth.service';
import { UsersController } from '@gitroom/backend/api/routes/users.controller';
import { AuthMiddleware } from '@gitroom/backend/services/auth/auth.middleware';
import { StripeController } from '@gitroom/backend/api/routes/stripe.controller';
import { SkillsController } from '@gitroom/backend/api/routes/skills.controller';
import {
  WalletController,
  WalletWebhookController,
} from '@gitroom/backend/api/routes/wallet.controller';
import { StripeService } from '@gitroom/nestjs-libraries/services/stripe.service';
import { AnalyticsController } from '@gitroom/backend/api/routes/analytics.controller';
import { PoliciesGuard } from '@gitroom/backend/services/auth/permissions/permissions.guard';
import { PermissionsService } from '@gitroom/backend/services/auth/permissions/permissions.service';
import { IntegrationsController } from '@gitroom/backend/api/routes/integrations.controller';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { SettingsController } from '@gitroom/backend/api/routes/settings.controller';
import { PostsController } from '@gitroom/backend/api/routes/posts.controller';
import { MediaController } from '@gitroom/backend/api/routes/media.controller';
import { UploadModule } from '@gitroom/nestjs-libraries/upload/upload.module';
import { BillingController } from '@gitroom/backend/api/routes/billing.controller';
import { NotificationsController } from '@gitroom/backend/api/routes/notifications.controller';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { ExtractContentService } from '@gitroom/nestjs-libraries/openai/extract.content.service';
import { CodesService } from '@gitroom/nestjs-libraries/services/codes.service';
import { CopilotController } from '@gitroom/backend/api/routes/copilot.controller';
import { PublicController } from '@gitroom/backend/api/routes/public.controller';
import { RootController } from '@gitroom/backend/api/routes/root.controller';
import { HealthController } from '@gitroom/backend/api/routes/health.controller';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { WebhookController } from '@gitroom/backend/api/routes/webhooks.controller';
import { SignatureController } from '@gitroom/backend/api/routes/signature.controller';
import { BriefController } from '@gitroom/backend/api/routes/brief.controller';
import { HermesController } from '@gitroom/backend/api/routes/hermes.controller';
import { AutopostController } from '@gitroom/backend/api/routes/autopost.controller';
import { SetsController } from '@gitroom/backend/api/routes/sets.controller';
import { ThirdPartyController } from '@gitroom/backend/api/routes/third-party.controller';
import { MonitorController } from '@gitroom/backend/api/routes/monitor.controller';
import { NoAuthIntegrationsController } from '@gitroom/backend/api/routes/no.auth.integrations.controller';
import { OAuthAppController } from '@gitroom/backend/api/routes/oauth-app.controller';
import { ApprovedAppsController } from '@gitroom/backend/api/routes/approved-apps.controller';
import {
  OAuthController,
  OAuthAuthorizedController,
} from '@gitroom/backend/api/routes/oauth.controller';
import {
  DeviceController,
  DeviceAuthorizedController,
} from '@gitroom/backend/api/routes/device.controller';
import { DeviceAuthService } from '@gitroom/nestjs-libraries/database/prisma/device/device.auth.service';
import { AnnouncementsController } from '@gitroom/backend/api/routes/announcements.controller';
import { AdminController } from '@gitroom/backend/api/routes/admin.controller';
import { ProvisionController } from '@gitroom/backend/api/routes/provision.controller';
import { MediaMeterController } from '@gitroom/backend/api/routes/media-meter.controller';
import { AuthProviderManager } from '@gitroom/backend/services/auth/providers/providers.manager';
import { GithubProvider } from '@gitroom/backend/services/auth/providers/github.provider';
import { GoogleProvider } from '@gitroom/backend/services/auth/providers/google.provider';
import { FarcasterProvider } from '@gitroom/backend/services/auth/providers/farcaster.provider';
import { WalletProvider } from '@gitroom/backend/services/auth/providers/wallet.provider';
import { OauthProvider } from '@gitroom/backend/services/auth/providers/oauth.provider';

const authenticatedController = [
  UsersController,
  AnalyticsController,
  IntegrationsController,
  SettingsController,
  PostsController,
  MediaController,
  BillingController,
  NotificationsController,
  CopilotController,
  WebhookController,
  SignatureController,
  BriefController,
  HermesController,
  AutopostController,
  SetsController,
  ThirdPartyController,
  OAuthAppController,
  ApprovedAppsController,
  OAuthAuthorizedController,
  DeviceAuthorizedController,
  AnnouncementsController,
  AdminController,
  MediaMeterController,
  WalletController,
  SkillsController,
];
@Module({
  imports: [UploadModule],
  controllers: [
    RootController,
    HealthController,
    StripeController,
    // Verified by its Stripe signature, so not behind the login middleware.
    WalletWebhookController,
    AuthController,
    PublicController,
    // Guards itself with PROVISION_SECRET, so it stays out of
    // authenticatedController: the caller is a server, not a signed-in user.
    ProvisionController,
    MonitorController,
    // EnterpriseController is deliberately not registered: its routes accept
    // any token signed with JWT_SECRET, including an ordinary login token.
    NoAuthIntegrationsController,
    OAuthController,
    DeviceController,
    ...authenticatedController,
  ],
  providers: [
    AuthService,
    StripeService,
    OpenaiService,
    ExtractContentService,
    DeviceAuthService,
    AuthMiddleware,
    PoliciesGuard,
    PermissionsService,
    CodesService,
    IntegrationManager,
    TrackService,
    ShortLinkService,
    AuthProviderManager,
    GithubProvider,
    GoogleProvider,
    FarcasterProvider,
    WalletProvider,
    OauthProvider,
  ],
  get exports() {
    return [...this.imports, ...this.providers];
  },
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(...authenticatedController);
  }
}
