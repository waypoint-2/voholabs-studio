import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { BriefService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief.service';
import {
  SaveBriefDocumentDto,
  StartBriefOnboardingDto,
} from '@gitroom/nestjs-libraries/dtos/brief/brief.dto';
import { BriefOnboardingService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief.onboarding.service';

@ApiTags('Brief')
@Controller('/brief')
@CheckPolicies([AuthorizationActions.Create, Sections.BRIEF])
export class BriefController {
  constructor(
    private _briefService: BriefService,
    private _briefOnboardingService: BriefOnboardingService
  ) {}

  @Get('/')
  getDocuments(@GetOrgFromRequest() org: Organization) {
    return this._briefService.getDocuments(org.id);
  }

  // The guided onboarding: opens (or reopens) a run and returns the signed
  // link to it.
  @Post('/onboarding')
  startOnboarding(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: StartBriefOnboardingDto
  ) {
    return this._briefOnboardingService.start(org.id, user, body?.lang);
  }

  @Get('/onboarding')
  onboardingStatus(@GetOrgFromRequest() org: Organization) {
    return this._briefOnboardingService.status(org.id);
  }

  @Patch('/:category/:key')
  saveDocument(
    @GetOrgFromRequest() org: Organization,
    @Param('category') category: string,
    @Param('key') key: string,
    @Body() body: SaveBriefDocumentDto
  ) {
    return this._briefService.saveDocument(org.id, category, key, body);
  }

  @Delete('/:category/:key')
  deleteDocument(
    @GetOrgFromRequest() org: Organization,
    @Param('category') category: string,
    @Param('key') key: string
  ) {
    return this._briefService.deleteDocument(org.id, category, key);
  }
}
