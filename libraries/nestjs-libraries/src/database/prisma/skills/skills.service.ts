import { Injectable } from '@nestjs/common';
import { SkillsRepository } from '@gitroom/nestjs-libraries/database/prisma/skills/skills.repository';

// A skill reads the user's brief when it names the brief reader among its
// tools. Derived rather than stored, so it cannot drift from the tool list.
export const BRIEF_READER = 'briefListTool';
export const usesBrief = (tools: string[]) => tools.includes(BRIEF_READER);

const clean = (value?: string, max = 200) => {
  const text = (value || '').trim().slice(0, max);
  return text || undefined;
};

// The skills library: ready-made instructions an agent reads through MCP.
// Everything comes from the Skill and SkillTag rows.
@Injectable()
export class SkillsService {
  constructor(private _skills: SkillsRepository) {}

  async list(filter: { tag?: string; search?: string } = {}) {
    const tag = clean(filter.tag, 64);
    const search = clean(filter.search);

    const [allTags, used] = await Promise.all([
      this._skills.tags(),
      this._skills.activeTagKeys(),
    ]);
    // Only tags that at least one active skill carries.
    const tags = allTags.filter((one) => used.has(one.key));

    // A search also matches the tag labels ("tips" finds "Tips and tricks").
    const searchTags = search
      ? tags
          .filter((one) =>
            one.label.toLowerCase().includes(search.toLowerCase())
          )
          .map((one) => one.key)
      : [];

    const rows = await this._skills.list({ tag, search, searchTags });
    const skills = rows.map((row) => ({
      ...row,
      usesBrief: usesBrief(row.tools),
    }));
    return { tags, skills };
  }

  async get(slug: string) {
    const key = clean(slug, 128);
    if (!key) {
      return null;
    }
    const skill = await this._skills.get(key);
    return skill ? { ...skill, usesBrief: usesBrief(skill.tools) } : null;
  }
}
