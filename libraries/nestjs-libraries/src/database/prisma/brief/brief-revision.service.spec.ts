import { BriefRevisionService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief-revision.service';

// The learning queue over stub revisions (newest first, as the repository
// returns them).

const ORG = 'org-1';

const revision = (
  key: string,
  content: any,
  at: number,
  extra: Record<string, any> = {}
) => ({
  id: `${key}-${at}`,
  organizationId: ORG,
  category: extra.category || 'sources',
  key,
  content: JSON.stringify(content),
  contentHash: `${key}-${at}`,
  createdAt: new Date(at),
  learnedAt: extra.learnedAt || null,
  learnedOutcome: null,
});

const build = (revisions: any[]) => {
  const repository = {
    getLatestPerDocument: jest.fn(async () =>
      [...revisions].sort((a, b) => b.createdAt - a.createdAt)
    ),
    getRevisions: jest.fn(async () => []),
    create: jest.fn(async () => undefined),
    deleteByIds: jest.fn(async () => undefined),
  };
  return {
    service: new BriefRevisionService(repository as any),
    repository,
  };
};

const rule = (heading: string, body = 'x') => ({ id: heading, heading, body });

describe('BriefRevisionService.getLearningQueue', () => {
  it('leaves out a document written for the first time', async () => {
    const { service } = build([
      revision(
        'additional-info',
        { v: 1, blocks: [rule('Hours')] },
        1,
        { category: 'foundation' }
      ),
      revision('forum', { v: 1, blocks: [rule('Use')], title: 'Forum' }, 2),
    ]);
    await expect(service.getLearningQueue(ORG)).resolves.toEqual([]);
  });

  it('reports a document written a second time as edited', async () => {
    const { service } = build([
      revision('forum', { v: 1, blocks: [], title: 'Forum' }, 1),
      revision('forum', { v: 1, blocks: [rule('Use')], title: 'Forum' }, 2),
    ]);
    const [entry] = await service.getLearningQueue(ORG);
    expect(entry.change).toBe('edited');
    expect(entry.diff.blocksAdded).toEqual(['Use']);
  });

  it('includes a deleted source with no earlier revision', async () => {
    const { service } = build([
      revision('forum', { v: 1, blocks: [], title: 'Forum', deleted: true }, 2),
    ]);
    const [entry] = await service.getLearningQueue(ORG);
    expect(entry).toMatchObject({ id: 'sources/forum', change: 'deleted' });
    expect(entry.diff).toEqual({
      blocksAdded: [],
      blocksRemoved: [],
      blocksEdited: [],
      changed: [],
    });
  });

  it('shows what a delete with kept history removed', async () => {
    const { service } = build([
      revision('forum', { v: 1, blocks: [rule('Use')] }, 1),
      revision('forum', { v: 1, blocks: [], deleted: true }, 2),
    ]);
    const [entry] = await service.getLearningQueue(ORG);
    expect(entry.change).toBe('deleted');
    expect(entry.diff.blocksRemoved).toEqual(['Use']);
  });

  it('treats a document written again after a delete as created', async () => {
    const { service } = build([
      revision('forum', { v: 1, blocks: [], deleted: true }, 1),
      revision('forum', { v: 1, blocks: [rule('Use')] }, 2),
    ]);
    const [entry] = await service.getLearningQueue(ORG);
    expect(entry.change).toBe('created');
  });

  it('reports an ordinary edit as edited and skips learned documents', async () => {
    const { service } = build([
      revision('voice', { v: 1, blocks: [rule('Tone', 'calm')] }, 1, {
        category: 'foundation',
      }),
      revision('voice', { v: 1, blocks: [rule('Tone', 'loud')] }, 2, {
        category: 'foundation',
      }),
      revision('done', { v: 1, blocks: [] }, 3, {
        learnedAt: new Date(4),
      }),
    ]);
    const queue = await service.getLearningQueue(ORG);
    expect(queue.map((entry) => [entry.id, entry.change])).toEqual([
      ['foundation/voice', 'edited'],
    ]);
  });
});

describe('BriefRevisionService.capture', () => {
  it('stores the deleted mark with the revision', async () => {
    const { service, repository } = build([]);
    await service.capture(ORG, 'sources', 'forum', { v: 1, blocks: [] }, {
      deleted: true,
    });
    const [data] = repository.create.mock.calls[0] as any[];
    expect(JSON.parse(data.content)).toEqual({
      v: 1,
      blocks: [],
      deleted: true,
    });
  });
});
