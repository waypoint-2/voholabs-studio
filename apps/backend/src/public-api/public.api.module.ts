import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthService } from '@gitroom/backend/services/auth/auth.service';
import { StripeService } from '@gitroom/nestjs-libraries/services/stripe.service';
import { PoliciesGuard } from '@gitroom/backend/services/auth/permissions/permissions.guard';
import { PermissionsService } from '@gitroom/backend/services/auth/permissions/permissions.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { UploadModule } from '@gitroom/nestjs-libraries/upload/upload.module';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { ExtractContentService } from '@gitroom/nestjs-libraries/openai/extract.content.service';
import { CodesService } from '@gitroom/nestjs-libraries/services/codes.service';
import { PublicIntegrationsController } from '@gitroom/backend/public-api/routes/v1/public.integrations.controller';
import { PublicAuthMiddleware } from '@gitroom/backend/services/auth/public.auth.middleware';
import { PublicUploadTicketController } from '@gitroom/backend/public-api/routes/v1/public.upload.ticket.controller';
import { PublicBriefController } from '@gitroom/backend/public-api/routes/v1/public.brief.controller';
import { PublicUploadMintController } from '@gitroom/backend/public-api/routes/v1/public.upload.mint.controller';
import { PublicBriefUploadController } from '@gitroom/backend/public-api/routes/v1/public.brief.upload.controller';

const authenticatedController = [
  PublicIntegrationsController,
  PublicBriefController,
  // Minting a ticket needs the API key. The route that receives the file is in
  // ticketController below and must stay unauthenticated.
  PublicUploadMintController,
];
// Authenticated by the single-use ticket in its own URL, so it must stay out of
// the list above — PublicAuthMiddleware would reject it for having no API key.
const ticketController = [
  PublicUploadTicketController,
  PublicBriefUploadController,
];
@Module({
  imports: [UploadModule],
  controllers: [...authenticatedController, ...ticketController],
  providers: [
    AuthService,
    StripeService,
    OpenaiService,
    ExtractContentService,
    PoliciesGuard,
    PermissionsService,
    CodesService,
    IntegrationManager,
  ],
  get exports() {
    return [...this.imports, ...this.providers];
  },
})
export class PublicApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PublicAuthMiddleware).forRoutes(...authenticatedController);
  }
}

