import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { SkillsService } from '@gitroom/nestjs-libraries/database/prisma/skills/skills.service';

// The skills library. Opens with the first wallet top-up; paid plans always
// pass.
@ApiTags('Skills')
@Controller('/skills')
@CheckPolicies([AuthorizationActions.Create, Sections.SKILLS])
export class SkillsController {
  constructor(private _skills: SkillsService) {}

  @Get('/')
  list(@Query('tag') tag?: string, @Query('search') search?: string) {
    return this._skills.list({
      tag: typeof tag === 'string' ? tag : undefined,
      search: typeof search === 'string' ? search : undefined,
    });
  }

  @Get('/:slug')
  async get(@Param('slug') slug: string) {
    const skill = await this._skills.get(slug);
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }
    return skill;
  }
}
