// The in-app agent serves a paid plan the same tools it had before the wallet.
import { readFileSync } from 'fs';
import { join } from 'path';

// tool.list imports every tool; its names are read from the source instead.
const toolListSource = readFileSync(
  join(__dirname, 'tools', 'tool.list.ts'),
  'utf8'
);
const namesIn = (constant: string) =>
  Array.from(
    (
      toolListSource.match(
        new RegExp(`export const ${constant} = \\[([\\s\\S]*?)\\];`)
      )?.[1] || ''
    ).matchAll(/'(\w+)'/g)
  ).map((match) => match[1]);

jest.mock('@gitroom/nestjs-libraries/chat/tools/tool.list', () => ({
  toolList: [],
  notOnPlanToolNames: namesIn('notOnPlanToolNames'),
}));
jest.mock('@gitroom/nestjs-libraries/chat/mastra.store', () => ({
  pStore: undefined,
}));
jest.mock('@mastra/memory', () => ({ Memory: class {} }));
jest.mock('@ai-sdk/openai', () => ({ openai: () => ({}) }));
// @mastra/core ships ESM jest cannot load; this stand-in resolves the tools
// the way Agent.listTools does: a function is called with the request context.
jest.mock('@mastra/core/agent', () => ({
  Agent: class {
    constructor(private config: any) {}
    async listTools({ requestContext }: any = {}) {
      return typeof this.config.tools === 'function'
        ? this.config.tools({ requestContext })
        : this.config.tools;
    }
  },
}));

class RequestContext {
  private store = new Map<string, unknown>();
  set(key: string, value: unknown) {
    this.store.set(key, value);
  }
  get(key: string) {
    return this.store.get(key);
  }
}
import {
  LoadToolsService,
  toolsForRequest,
} from '@gitroom/nestjs-libraries/chat/load.tools.service';

const PAID = {
  id: 'org-1',
  subscription: { subscriptionTier: 'ULTIMATE', cancelAt: null },
};
const FREE = {
  id: 'org-1',
  subscription: { subscriptionTier: 'FREE', cancelAt: '2020-01-01' },
};

const names = [
  'integrationList',
  'briefListTool',
  'walletBalance',
  'walletTransactions',
  'walletPrices',
  'skillsList',
  'skillGet',
];
const tools = Object.fromEntries(
  names.map((name) => [name, { id: name, description: name, execute: jest.fn() }])
);

const contextFor = (org?: any) => {
  const requestContext = new RequestContext();
  if (org) {
    requestContext.set('organization', JSON.stringify(org));
  }
  return requestContext;
};

describe('toolsForRequest', () => {
  it('leaves the wallet and skills tools out for a paid plan', () => {
    expect(Object.keys(toolsForRequest(tools, contextFor(PAID)))).toEqual([
      'integrationList',
      'briefListTool',
    ]);
  });

  it('keeps every tool without a paid plan', () => {
    expect(Object.keys(toolsForRequest(tools, contextFor(FREE)))).toEqual(
      names
    );
  });

  it('keeps every tool when no organization is in the context', () => {
    expect(Object.keys(toolsForRequest(tools, contextFor()))).toEqual(names);
    expect(Object.keys(toolsForRequest(tools))).toEqual(names);
  });
});

describe('the in-app agent', () => {
  const agent = async () => {
    const service = new LoadToolsService({} as any);
    jest.spyOn(service, 'loadTools').mockResolvedValue(tools);
    return service.agent();
  };

  it('lists no wallet or skills tool for a paid organization', async () => {
    const listed = await (await agent() as any).listTools({
      requestContext: contextFor(PAID),
    });
    expect(Object.keys(listed).sort()).toEqual(
      ['briefListTool', 'integrationList'].sort()
    );
  });

  it('lists every tool for a free organization and at boot', async () => {
    const built = (await agent()) as any;
    expect(
      Object.keys(await built.listTools({ requestContext: contextFor(FREE) }))
    ).toEqual(names);
    expect(Object.keys(await built.listTools())).toEqual(names);
  });
});
