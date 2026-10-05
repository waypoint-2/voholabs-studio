import { SkillsListTool } from '@gitroom/nestjs-libraries/chat/tools/skills.list.tool';
import {
  SkillsService,
  usesBrief,
} from '@gitroom/nestjs-libraries/database/prisma/skills/skills.service';

const rows = [
  {
    slug: 'voice',
    name: 'Write in your voice',
    summary: 'Writes in the voice from the brief.',
    whenToUse: 'Asked for a post.',
    tags: ['writing'],
    tools: ['briefListTool', 'integrationSchema'],
  },
  {
    slug: 'edit',
    name: 'Editor',
    summary: 'Edits a draft.',
    whenToUse: 'Given a draft.',
    tags: ['editing'],
    tools: [],
  },
];

const repository = {
  tags: async () => [
    { key: 'writing', label: 'Writing' },
    { key: 'editing', label: 'Editing' },
    { key: 'unused', label: 'Unused' },
  ],
  activeTagKeys: async () => new Set(['writing', 'editing']),
  list: async () => rows,
  get: async (slug: string) =>
    slug === 'voice' ? { ...rows[0], body: '# Voice', whatItDoes: null } : null,
};

const service = new SkillsService(repository as any);

const context = (organization: any) => {
  const store = new Map<string, string>();
  return {
    mcp: { extra: { authInfo: organization } },
    requestContext: {
      set: (key: string, value: string) => store.set(key, value),
      get: (key: string) => store.get(key),
    },
  };
};

describe('usesBrief', () => {
  it('is true only when the skill reads the brief', () => {
    expect(usesBrief(['briefListTool'])).toBe(true);
    expect(usesBrief(['briefLearnTool', 'postAnalyticsTool'])).toBe(false);
    expect(usesBrief([])).toBe(false);
  });
});

describe('SkillsService', () => {
  it('lists only used tags and derives usesBrief', async () => {
    const { tags, skills } = await service.list();
    expect(tags.map((one) => one.key)).toEqual(['writing', 'editing']);
    expect(skills.map((one) => one.usesBrief)).toEqual([true, false]);
  });

  it('adds usesBrief to one skill and returns null for an unknown slug', async () => {
    expect((await service.get('voice'))?.usesBrief).toBe(true);
    expect(await service.get('nope')).toBeNull();
    expect(await service.get('   ')).toBeNull();
  });
});

describe('skillsList tool', () => {
  const tool = new SkillsListTool(service).run() as any;

  it('returns a catalog without bodies or tool lists', async () => {
    const result = await tool.execute(
      {},
      context({ walletUnlocks: ['skills'] })
    );
    expect(result.error).toBeUndefined();
    expect(result.skills).toHaveLength(2);
    for (const skill of result.skills) {
      expect(Object.keys(skill).sort()).toEqual(
        ['name', 'slug', 'summary', 'tags', 'usesBrief', 'whenToUse'].sort()
      );
    }
  });
});
