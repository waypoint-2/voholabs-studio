import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BriefRepository } from '@gitroom/nestjs-libraries/database/prisma/brief/brief.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { SaveBriefDocumentDto } from '@gitroom/nestjs-libraries/dtos/brief/brief.dto';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  BRIEF_REGISTRY,
  BRIEF_REGISTRY_VERSION,
  isAgentManaged,
  BRIEF_ASSETS_MAX,
  BRIEF_USER_DOCUMENTS_MAX,
  channelDocumentKey,
  documentHasFeature,
  emptyContent,
  findCategory,
  resolveDocumentDef,
} from '@gitroom/nestjs-libraries/agent-brief/brief.registry';
import {
  BriefDocument,
  BriefDocumentContent,
} from '@gitroom/nestjs-libraries/agent-brief/brief.types';
import { BriefRevisionService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief-revision.service';

@Injectable()
export class BriefService {
  constructor(
    private _briefRepository: BriefRepository,
    private _integrationService: IntegrationService,
    private _briefRevisionService: BriefRevisionService
  ) {}

  // Every write goes through here so a document's history is recoverable and
  // the agent can see what changed. Never allowed to fail the save itself.
  private async capture(
    orgId: string,
    category: string,
    storageKey: string,
    content: BriefDocumentContent,
    options?: { deleted?: boolean }
  ) {
    try {
      await this._briefRevisionService.capture(
        orgId,
        category,
        storageKey,
        content,
        options
      );
    } catch (err) {}
  }

  // Why a category/key pair is not a document, in words that say what would
  // have been accepted instead.
  private unknownDocument(category: string, key: string) {
    const definition = findCategory(category);
    if (!definition) {
      return new NotFoundException(
        `Unknown category "${category}". Use one of: ${BRIEF_REGISTRY.map(
          (one) => one.id
        ).join(', ')}.`
      );
    }

    return new NotFoundException(
      `"${key}" is not a ${definition.label} document, and new ones cannot be added there. Allowed keys: ${(
        definition.documents || []
      )
        .map((document) => document.key)
        .join(', ')}.`
    );
  }

  async getDocuments(orgId: string) {
    const [rows, channelKeys] = await Promise.all([
      this._briefRepository.getDocuments(orgId),
      this.channelKeysToIds(orgId),
    ]);

    const documents = rows.reduce((all, row) => {
      const category = findCategory(row.category);
      if (!category) {
        return all;
      }

      // Channel documents are stored against the account, so they are mapped
      // back to the integration the frontend knows about. A document whose
      // channel is no longer connected is simply not listed.
      let key = row.key;
      if (category.source === 'integration') {
        const integrationId = channelKeys.get(row.key);
        if (!integrationId) {
          return all;
        }

        key = integrationId;
      }

      all.push({
        category: category.id,
        key,
        content: this.parseContent(row.content),
        updatedAt: row.updatedAt?.toISOString(),
      });

      return all;
    }, [] as BriefDocument[]);

    return { registryVersion: BRIEF_REGISTRY_VERSION, documents };
  }

  async saveDocument(
    orgId: string,
    category: string,
    key: string,
    body: SaveBriefDocumentDto
  ) {
    const definition = findCategory(category);
    const document = resolveDocumentDef(category, key);
    if (!definition || !document) {
      throw this.unknownDocument(category, key);
    }

    const storageKey = await this.toStorageKey(orgId, category, key);
    const existing = await this._briefRepository.getDocument(
      orgId,
      category,
      storageKey
    );

    if (!existing && definition.source === 'user') {
      await this.assertRoomForAnother(orgId, category);
    }

    const content = this.parseContent(existing?.content);

    // Ordered lists are replaced whole; anything the request leaves out keeps
    // whatever was already stored.
    if (body.blocks) {
      content.blocks = body.blocks;
    }

    if (body.links && documentHasFeature(document, 'links')) {
      content.links = body.links;
    }

    if (body.assets && documentHasFeature(document, 'assets')) {
      content.assets = body.assets;
    }

    if (body.title !== undefined && definition.source === 'user') {
      content.title = body.title;
    }

    const saved = await this._briefRepository.saveDocument(
      orgId,
      category,
      storageKey,
      JSON.stringify(content)
    );

    await this.capture(orgId, category, storageKey, content);

    return {
      category,
      key,
      content,
      updatedAt: saved.updatedAt?.toISOString(),
    };
  }

  async deleteDocument(
    orgId: string,
    category: string,
    key: string,
    viaAgent = false,
    // Keep the document's history and record the removal in it, rather than
    // wiping it. Used when a redone onboarding replaces the brief, so what it
    // removed can still be seen afterwards.
    keepHistory = false,
    // Answer { deleted: false } when nothing is stored under that key, rather
    // than reporting a delete.
    reportMissing = false
  ) {
    const definition = findCategory(category);
    if (!definition || !resolveDocumentDef(category, key)) {
      throw this.unknownDocument(category, key);
    }

    // Registry documents are emptied rather than removed, so only a category
    // that says canDelete can lose one. On top of that, the agent may always
    // retire a note of its own, whatever the category allows people to do.
    const allowed =
      !!definition.canDelete || (!!definition.agentManaged && viaAgent);

    if (!allowed) {
      throw new BadRequestException('This document cannot be deleted');
    }

    const storageKey = await this.toStorageKey(orgId, category, key);
    const existing =
      keepHistory || reportMissing
        ? await this._briefRepository.getDocument(orgId, category, storageKey)
        : null;

    if (reportMissing && !existing) {
      return { deleted: false };
    }

    await this._briefRepository.deleteDocument(orgId, category, storageKey);

    if (!keepHistory) {
      // A document that is gone leaves no history behind, same as a deleted
      // post.
      try {
        await this._briefRevisionService.deleteDocument(
          orgId,
          category,
          storageKey
        );
      } catch (err) {}
    } else if (existing) {
      // The history is kept and the removal recorded in it. Only the
      // document's name is kept in that record.
      const { title } = this.parseContent(existing.content);
      await this.capture(
        orgId,
        category,
        storageKey,
        { ...emptyContent(), ...(title ? { title } : {}) },
        { deleted: true }
      );
    }

    return { deleted: true };
  }

  // Adds or refines a single rule without touching the rest of the document.
  // This is what lets the agent keep its own notes up to date incrementally
  // rather than rewriting a whole document each time it learns something.
  async recordExperience(
    orgId: string,
    key: string,
    rule: { heading: string; body: string },
    title?: string
  ) {
    const category = 'experience';
    if (!isAgentManaged(category)) {
      throw new BadRequestException('This category is not agent managed');
    }

    const existing = await this._briefRepository.getDocument(
      orgId,
      category,
      key
    );

    if (!existing) {
      await this.assertRoomForAnother(orgId, category);
    }

    const content = this.parseContent(existing?.content);

    // Same heading means the agent is revising what it already knew, not
    // adding a duplicate.
    const at = content.blocks.findIndex(
      (block) =>
        block.heading.trim().toLowerCase() === rule.heading.trim().toLowerCase()
    );

    if (at === -1) {
      content.blocks.push({
        id: makeId(10),
        heading: rule.heading,
        body: rule.body,
      });
    } else {
      content.blocks[at] = { ...content.blocks[at], body: rule.body };
    }

    if (title !== undefined) {
      content.title = title;
    }

    const saved = await this._briefRepository.saveDocument(
      orgId,
      category,
      key,
      JSON.stringify(content)
    );

    await this.capture(orgId, category, key, content);

    return {
      category,
      key,
      rules: content.blocks.length,
      revised: at !== -1,
      updatedAt: saved.updatedAt?.toISOString(),
    };
  }

  // Appends one file to Branding & assets without disturbing the rules or the
  // files already there.
  async registerAsset(
    orgId: string,
    asset: { name: string; url: string; mime?: string; note?: string }
  ) {
    const category = 'foundation';
    const key = 'branding-assets';
    const document = resolveDocumentDef(category, key);

    if (!document || !documentHasFeature(document, 'assets')) {
      throw new BadRequestException('This document does not hold files');
    }

    const existing = await this._briefRepository.getDocument(
      orgId,
      category,
      key
    );

    const content = this.parseContent(existing?.content);
    const assets = content.assets || [];

    if (assets.length >= BRIEF_ASSETS_MAX) {
      throw new BadRequestException('Too many files in this document');
    }

    content.assets = [
      ...assets,
      {
        id: makeId(10),
        name: asset.name,
        url: asset.url,
        ...(asset.mime ? { mime: asset.mime } : {}),
        ...(asset.note ? { note: asset.note } : {}),
      },
    ];

    await this._briefRepository.saveDocument(
      orgId,
      category,
      key,
      JSON.stringify(content)
    );

    await this.capture(orgId, category, key, content);

    return { assets: content.assets.length };
  }

  // Takes files off Branding & assets by id, leaving the rules and every
  // other file as they are. Ids that are not there are reported back.
  async removeAssets(orgId: string, assetIds: string[]) {
    const category = 'foundation';
    const key = 'branding-assets';

    const existing = await this._briefRepository.getDocument(
      orgId,
      category,
      key
    );

    const content = this.parseContent(existing?.content);
    const assets = content.assets || [];
    const wanted = new Set(assetIds);
    const kept = assets.filter((asset) => !wanted.has(asset.id));
    const removed = assets
      .filter((asset) => wanted.has(asset.id))
      .map((asset) => asset.id);
    const notFound = assetIds.filter((id) => !removed.includes(id));

    if (existing && removed.length) {
      content.assets = kept;
      await this._briefRepository.saveDocument(
        orgId,
        category,
        key,
        JSON.stringify(content)
      );
      await this.capture(orgId, category, key, content);
    }

    return { removed, notFound, assets: kept.length };
  }

  // Everything the agent knows about the business, as one structure. Nothing
  // consumes this yet.
  async getBrief(orgId: string) {
    const { documents } = await this.getDocuments(orgId);
    return documents;
  }

  private parseContent(raw?: string): BriefDocumentContent {
    try {
      const parsed = JSON.parse(raw || '{}');
      return {
        v: 1,
        blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
        ...(parsed?.links ? { links: parsed.links } : {}),
        ...(parsed?.assets ? { assets: parsed.assets } : {}),
        ...(parsed?.title ? { title: parsed.title } : {}),
      };
    } catch (err) {
      return emptyContent();
    }
  }

  private async assertRoomForAnother(orgId: string, category: string) {
    const existing = await this._briefRepository.countDocuments(
      orgId,
      category
    );

    if (existing >= BRIEF_USER_DOCUMENTS_MAX) {
      throw new BadRequestException('Too many documents in this section');
    }
  }

  // For integration categories the key that arrives from the frontend is an
  // integration id, and what gets stored identifies the account itself.
  private async toStorageKey(orgId: string, category: string, key: string) {
    const definition = findCategory(category);
    if (definition?.source !== 'integration') {
      return key;
    }

    const integration = (
      await this._integrationService.getIntegrationsList(orgId)
    ).find((current) => current.id === key);

    if (!integration) {
      throw new NotFoundException('Channel not found');
    }

    return channelDocumentKey(
      integration.providerIdentifier,
      integration.internalId
    );
  }

  private async channelKeysToIds(orgId: string) {
    const integrations = await this._integrationService.getIntegrationsList(
      orgId
    );

    return new Map(
      integrations.map((integration) => [
        channelDocumentKey(
          integration.providerIdentifier,
          integration.internalId
        ),
        integration.id,
      ])
    );
  }
}
