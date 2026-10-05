import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

const listFields = {
  slug: true,
  name: true,
  summary: true,
  tags: true,
  tools: true,
  whenToUse: true,
} satisfies Prisma.SkillSelect;

// Reads the skills library. Skills and tags are database rows; only active
// skills are ever returned.
@Injectable()
export class SkillsRepository {
  constructor(
    private _skill: PrismaRepository<'skill'>,
    private _tag: PrismaRepository<'skillTag'>
  ) {}

  tags() {
    return this._tag.model.skillTag.findMany({
      select: { key: true, label: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  // Tag keys used by at least one active skill.
  async activeTagKeys() {
    const rows = await this._skill.model.skill.findMany({
      where: { active: true },
      select: { tags: true },
    });
    return new Set(rows.flatMap((row) => row.tags));
  }

  list(filter: { tag?: string; search?: string; searchTags?: string[] }) {
    const and: Prisma.SkillWhereInput[] = [{ active: true }];
    if (filter.tag) {
      and.push({ tags: { has: filter.tag } });
    }
    if (filter.search) {
      const contains = {
        contains: filter.search,
        mode: 'insensitive' as const,
      };
      and.push({
        OR: [
          { name: contains },
          { summary: contains },
          { whenToUse: contains },
          ...(filter.searchTags?.length
            ? [{ tags: { hasSome: filter.searchTags } }]
            : []),
        ],
      });
    }
    return this._skill.model.skill.findMany({
      where: { AND: and },
      select: listFields,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  get(slug: string) {
    return this._skill.model.skill.findFirst({
      where: { slug, active: true },
      select: {
        ...listFields,
        whatItDoes: true,
        body: true,
        version: true,
        updatedAt: true,
      },
    });
  }
}
