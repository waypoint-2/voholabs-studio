import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { AuthorizationActions, Sections, SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import {
  paidFeatureMessage,
  trialExpiredMessage,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/trial';

@Catch(SubscriptionException)
export class SubscriptionExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const error: { section: Sections; action: AuthorizationActions } =
      exception.getResponse() as any;

    const message = getErrorMessage(error);

    // The trial is over: there is nothing to upgrade inside the app, so the
    // frontend moves the browser to the "trial ended" page instead of showing
    // the regular "move to billing" dialog.
    const isTrial = error.section === Sections.TRIAL;

    // Onboarding was never finished. The app root is where the form shows, so
    // that is where the browser goes.
    // Same for the Terms: the agreement screen shows at the app root too.
    const isOnboarding =
      error.section === Sections.ONBOARDING ||
      error.section === Sections.TERMS;

    // Opens with a wallet top-up, so the app offers the top-up instead of
    // Postiz billing.
    const isWallet =
      error.section === Sections.BRIEF || error.section === Sections.SKILLS;

    // A wallet refusal has the same body as every other one in the app:
    // { message, wallet: true, url: '/wallet' }.
    if (isWallet) {
      response.status(status).json({
        statusCode: status,
        message,
        wallet: true,
        url: '/wallet',
      });
      return;
    }

    response.status(status).json({
      statusCode: status,
      message,
      url:
        process.env.FRONTEND_URL +
        (isOnboarding ? '/launches' : isTrial ? '/trial-ended' : '/billing'),
      ...(isTrial || isOnboarding ? { redirect: true } : {}),
    });
  }
}

const getErrorMessage = (error: {
  section: Sections;
  action: AuthorizationActions;
}) => {
  switch (error.section) {
    case Sections.TRIAL:
      return trialExpiredMessage();
    case Sections.ONBOARDING:
      return 'Please finish setting up your account first.';
    case Sections.TERMS:
      return 'Please agree to the current Terms of Service to carry on.';
    case Sections.AI:
      return paidFeatureMessage('AI');
    case Sections.BRIEF:
      return 'The agent brief opens after your first wallet top-up.';
    case Sections.SKILLS:
      return 'The skills library opens after your first wallet top-up.';
    case Sections.POSTS_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of posts for your subscription. Please upgrade your subscription to add more posts.';
      }
    case Sections.CHANNEL:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of channels for your subscription. Please upgrade your subscription to add more channels.';
      }
    case Sections.WEBHOOKS:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of webhooks for your subscription. Please upgrade your subscription to add more webhooks.';
      }
    case Sections.VIDEOS_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of generated videos for your subscription. Please upgrade your subscription to generate more videos.';
      }
  }
};
