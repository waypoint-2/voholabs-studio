import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { BriefService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief.service';
import { SaveBriefDocumentDto } from '@gitroom/nestjs-libraries/dtos/brief/brief.dto';
import { BRIEF_REGISTRY } from '@gitroom/nestjs-libraries/agent-brief/brief.registry';

// The agent brief over the public API, so the CLI and any external agent can
// read and edit it with an API key. Open on a paid plan, or after the first
// wallet top-up.
@ApiTags('Public API')
@Controller('/public/v1')
@CheckPolicies([AuthorizationActions.Create, Sections.BRIEF])
export class PublicBriefController {
  constructor(private _briefService: BriefService) {}

  // The shape of the brief: which categories and documents exist, so a caller
  // knows what keys it may write to without guessing.
  @Get('/brief/schema')
  schema() {
    return {
      categories: BRIEF_REGISTRY.map((category) => ({
        id: category.id,
        label: category.label,
        source: category.source,
        canCreate: !!category.canCreate,
        canDelete: !!category.canDelete,
        // Experience is the one the agent fills in on its own initiative.
        // Everything here is writable; this only says who usually writes it.
        agentManaged: !!category.agentManaged,
        documents: (category.documents || []).map((document) => ({
          key: document.key,
          label: document.label,
          description: document.description,
        })),
        ...(category.documentTemplate
          ? {
              documentTemplate: {
                label: category.documentTemplate.label,
                description: category.documentTemplate.description,
                features: category.documentTemplate.features || [],
              },
            }
          : {}),
      })),
    };
  }

  @Get('/brief')
  getDocuments(@GetOrgFromRequest() org: Organization) {
    return this._briefService.getDocuments(org.id);
  }

  @Get('/brief/:category/:key')
  async getDocument(
    @GetOrgFromRequest() org: Organization,
    @Param('category') category: string,
    @Param('key') key: string
  ) {
    const { documents } = await this._briefService.getDocuments(org.id);
    const document = documents.find(
      (one) => one.category === category && one.key === key
    );

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  @Patch('/brief/:category/:key')
  saveDocument(
    @GetOrgFromRequest() org: Organization,
    @Param('category') category: string,
    @Param('key') key: string,
    @Body() body: SaveBriefDocumentDto
  ) {
    return this._briefService.saveDocument(org.id, category, key, body);
  }

  @Delete('/brief/:category/:key')
  deleteDocument(
    @GetOrgFromRequest() org: Organization,
    @Param('category') category: string,
    @Param('key') key: string,
    // ?keepHistory=true keeps the document's revisions and records the
    // removal in them instead of wiping them.
    @Query('keepHistory') keepHistory?: string
  ) {
    return this._briefService.deleteDocument(
      org.id,
      category,
      key,
      false,
      keepHistory === 'true'
    );
  }
}
