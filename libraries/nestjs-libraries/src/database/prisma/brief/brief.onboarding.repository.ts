import { Injectable } from '@nestjs/common';
import { BriefOnboardingStatus } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class BriefOnboardingRepository {
  constructor(private _onboarding: PrismaRepository<'briefOnboarding'>) {}

  create(organizationId: string, lang?: string) {
    return this._onboarding.model.briefOnboarding.create({
      data: { organizationId, answers: '{}', ...(lang ? { lang } : {}) },
    });
  }

  getById(id: string) {
    return this._onboarding.model.briefOnboarding.findUnique({
      where: { id },
    });
  }

  running(organizationId: string) {
    return this._onboarding.model.briefOnboarding.findFirst({
      where: { organizationId, status: 'RUNNING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  last(organizationId: string) {
    return this._onboarding.model.briefOnboarding.findFirst({
      where: { organizationId, status: { not: 'RUNNING' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  staleRunning(organizationId: string, before: Date) {
    return this._onboarding.model.briefOnboarding.findMany({
      where: { organizationId, status: 'RUNNING', createdAt: { lt: before } },
    });
  }

  update(
    id: string,
    data: {
      status?: BriefOnboardingStatus;
      chargeKey?: string | null;
      error?: string | null;
      finishedAt?: Date | null;
    }
  ) {
    return this._onboarding.model.briefOnboarding.update({
      where: { id },
      data,
    });
  }
}
