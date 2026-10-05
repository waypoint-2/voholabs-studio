import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';

const MEDIA_LOOKUP_SELECT = {
  id: true,
  name: true,
  originalName: true,
  path: true,
  thumbnail: true,
  type: true,
} as const;

@Injectable()
export class MediaRepository {
  constructor(
    private _media: PrismaRepository<'media'>,
    private _organization: PrismaRepository<'organization'>
  ) {}

  async getStorageUsed(org: string) {
    const total = await this._media.model.media.aggregate({
      where: {
        organizationId: org,
        deletedAt: null,
      },
      _sum: {
        fileSize: true,
      },
    });

    return Number(total._sum.fileSize || 0);
  }

  // Organizations that have topped up their wallet (pay-as-you-go, also when
  // frozen), with their plan and the bytes in their media library, for the
  // wallet housekeeping. Two queries whatever the number of organizations.
  async storageOfWalletOrganizations() {
    const organizations = await this._organization.model.organization.findMany({
      where: { wallet: { firstTopUpAt: { not: null } } },
      select: { id: true, subscription: true },
    });
    if (!organizations.length) {
      return [];
    }
    const totals = await this._media.model.media.groupBy({
      by: ['organizationId'],
      where: {
        organizationId: { in: organizations.map((o) => o.id) },
        deletedAt: null,
      },
      _sum: { fileSize: true },
    });
    const bytes = new Map(
      totals.map((t) => [t.organizationId, Number(t._sum.fileSize || 0)])
    );
    return organizations.map((o) => ({
      organizationId: o.id,
      subscription: o.subscription,
      bytes: bytes.get(o.id) || 0,
    }));
  }

  saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    fileSize?: number,
    type?: string
  ) {
    return this._media.model.media.create({
      data: {
        fileSize: Math.round(fileSize || 0),
        ...(type ? { type } : {}),
        organization: {
          connect: {
            id: org,
          },
        },
        name: fileName,
        path: filePath,
        originalName: originalName || null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
      },
    });
  }

  getMediaById(id: string) {
    return this._media.model.media.findUnique({
      where: {
        id,
      },
    });
  }

  /**
   * Look media up by id or by path, always inside one organization.
   *
   * `getMediaById` above is a bare findUnique with no tenancy filter, so it is
   * not safe to build an organization-facing lookup on. These two take the org
   * explicitly and are what the MCP media tools use.
   *
   * Lookup by path exists because a post's attachments do not carry media-library
   * ids: `image` entries are stored as `{ path }` (or `{ id, path }` where that id
   * is a random per-post id from makeId, not a Media row). The path is the only
   * stable link back to the library row, and so to its name and thumbnail.
   */
  getMediaByIdsForOrg(org: string, ids: string[]) {
    if (!ids.length) {
      return Promise.resolve([]);
    }

    return this._media.model.media.findMany({
      where: {
        id: { in: ids },
        organizationId: org,
        deletedAt: null,
      },
      select: MEDIA_LOOKUP_SELECT,
    });
  }

  getMediaByPathsForOrg(org: string, paths: string[]) {
    if (!paths.length) {
      return Promise.resolve([]);
    }

    return this._media.model.media.findMany({
      where: {
        path: { in: paths },
        organizationId: org,
        deletedAt: null,
      },
      select: MEDIA_LOOKUP_SELECT,
    });
  }

  deleteMedia(org: string, id: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  async getMedia(org: string, page: number, search?: string) {
    const pageNum = (page || 1) - 1;
    const trimmedSearch = search?.trim();
    const searchFilter = trimmedSearch
      ? {
          originalName: {
            contains: trimmedSearch,
            mode: 'insensitive' as const,
          },
        }
      : {};
    const query = {
      where: {
        organization: {
          id: org,
        },
        deletedAt: null,
        // Brief documents count towards storage but are not post media.
        type: { not: 'document' },
        ...searchFilter,
      },
    };
    const pages = Math.ceil((await this._media.model.media.count(query)) / 18);
    const results = await this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        type: { not: 'document' },
        ...searchFilter,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
      },
      skip: pageNum * 18,
      take: 18,
    });

    return {
      pages,
      results,
    };
  }
}
