jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BriefService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief.service';

// BriefService with stub repositories. A plain delete wipes the document's
// revisions, as before; keepHistory keeps them and records the removal.

const ORG = 'org-1';

const build = (stored: any = { content: JSON.stringify({ blocks: [] }) }) => {
  const repository = {
    getDocument: jest.fn(async () => stored),
    saveDocument: jest.fn(async () => ({ updatedAt: new Date() })),
    deleteDocument: jest.fn(async () => ({ count: 1 })),
  };
  const revisions = {
    capture: jest.fn(async () => undefined),
    deleteDocument: jest.fn(async () => ({ count: 3 })),
  };
  const service = new BriefService(
    repository as any,
    {} as any,
    revisions as any
  );
  return { service, repository, revisions };
};

describe('BriefService.deleteDocument', () => {
  it('wipes the history of a deleted source by default', async () => {
    const { service, repository, revisions } = build();
    await expect(
      service.deleteDocument(ORG, 'sources', 'old-site')
    ).resolves.toEqual({ deleted: true });
    expect(repository.getDocument).not.toHaveBeenCalled();
    expect(repository.deleteDocument).toHaveBeenCalledWith(
      ORG,
      'sources',
      'old-site'
    );
    expect(revisions.deleteDocument).toHaveBeenCalledWith(
      ORG,
      'sources',
      'old-site'
    );
    expect(revisions.capture).not.toHaveBeenCalled();
  });

  it('reports a delete of a missing document as deleted by default', async () => {
    const { service, revisions } = build(null);
    await expect(
      service.deleteDocument(ORG, 'sources', 'missing')
    ).resolves.toEqual({ deleted: true });
    expect(revisions.capture).not.toHaveBeenCalled();
  });

  it('says nothing was deleted when asked to report a missing document', async () => {
    const { service, repository, revisions } = build(null);
    await expect(
      service.deleteDocument(ORG, 'sources', 'missing', false, false, true)
    ).resolves.toEqual({ deleted: false });
    expect(repository.deleteDocument).not.toHaveBeenCalled();
    expect(revisions.capture).not.toHaveBeenCalled();
    expect(revisions.deleteDocument).not.toHaveBeenCalled();
  });

  it('keeps only the name of a deleted source in its record', async () => {
    const { service, revisions } = build({
      content: JSON.stringify({ blocks: [{ heading: 'a' }], title: 'Forum' }),
    });
    await service.deleteDocument(ORG, 'sources', 'forum', false, true);
    expect(revisions.capture).toHaveBeenCalledWith(
      ORG,
      'sources',
      'forum',
      { v: 1, blocks: [], title: 'Forum' },
      { deleted: true }
    );
  });

  it('keeps the history and records the removal with keepHistory', async () => {
    const { service, repository, revisions } = build();
    await expect(
      service.deleteDocument(ORG, 'sources', 'old-site', false, true)
    ).resolves.toEqual({ deleted: true });
    expect(repository.deleteDocument).toHaveBeenCalledWith(
      ORG,
      'sources',
      'old-site'
    );
    expect(revisions.deleteDocument).not.toHaveBeenCalled();
    expect(revisions.capture).toHaveBeenCalledWith(
      ORG,
      'sources',
      'old-site',
      { v: 1, blocks: [] },
      { deleted: true }
    );
  });

  it('still refuses a Foundation document, history or not', async () => {
    const { service, repository } = build();
    await expect(
      service.deleteDocument(ORG, 'foundation', 'voice', false, true)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.deleteDocument).not.toHaveBeenCalled();
  });
});

describe('BriefService.saveDocument', () => {
  it('names the allowed keys for an unknown Foundation key', async () => {
    const { service, repository } = build();
    const error = await service
      .saveDocument(ORG, 'foundation', 'brand-voice', { blocks: [] } as any)
      .catch((err) => err);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.message).toContain('"brand-voice" is not a Foundation document');
    expect(error.message).toContain('voice');
    expect(error.message).toContain('additional-info');
    expect(repository.saveDocument).not.toHaveBeenCalled();
  });

  it('lists the categories for an unknown one', async () => {
    const { service } = build();
    await expect(
      service.saveDocument(ORG, 'nope', 'x', { blocks: [] } as any)
    ).rejects.toThrow(/Unknown category "nope". Use one of: foundation/);
  });

  it('keeps the files on a document when only the rules are saved', async () => {
    const assets = [{ id: 'a1', name: 'Logo', url: '/logo.png' }];
    const { service, repository } = build({
      content: JSON.stringify({ blocks: [], assets }),
    });
    const saved = await service.saveDocument(
      ORG,
      'foundation',
      'branding-assets',
      { blocks: [{ id: 'b', heading: 'Use', body: 'Always' }] } as any
    );
    expect(saved.content.assets).toEqual(assets);
    expect(repository.saveDocument).toHaveBeenCalled();
  });
});

describe('BriefService.removeAssets', () => {
  it('removes listed files, keeps the rest and reports unknown ids', async () => {
    const { service, repository, revisions } = build({
      content: JSON.stringify({
        blocks: [{ id: 'b', heading: 'h', body: 'x' }],
        assets: [
          { id: 'a1', name: 'Logo', url: '/logo.png' },
          { id: 'a2', name: 'Shot', url: '/shot.png' },
        ],
      }),
    });
    await expect(
      service.removeAssets(ORG, ['a1', 'zz'])
    ).resolves.toEqual({ removed: ['a1'], notFound: ['zz'], assets: 1 });
    const written = JSON.parse(
      (repository.saveDocument.mock.calls[0] as any[])[3]
    );
    expect(written.assets.map((one: any) => one.id)).toEqual(['a2']);
    expect(written.blocks).toHaveLength(1);
    expect(revisions.capture).toHaveBeenCalled();
  });

  it('writes nothing when no id matches', async () => {
    const { service, repository } = build({
      content: JSON.stringify({ blocks: [], assets: [] }),
    });
    await expect(service.removeAssets(ORG, ['zz'])).resolves.toEqual({
      removed: [],
      notFound: ['zz'],
      assets: 0,
    });
    expect(repository.saveDocument).not.toHaveBeenCalled();
  });
});
