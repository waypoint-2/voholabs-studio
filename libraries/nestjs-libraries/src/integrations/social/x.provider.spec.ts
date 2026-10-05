// How X's answer to a new post is read: as it always was, except for a
// publish the wallet pays for, which must know for sure whether X took it.
import { XProvider } from '@gitroom/nestjs-libraries/integrations/social/x.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  isWalletPublish,
  withWalletPublish,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.x';

const integration = { id: 'i1', organizationId: 'org' } as any;
const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

describe('XProvider reading a new post', () => {
  const provider = new XProvider();
  const tweetCreated = (response: Response, target: any) =>
    (provider as any).tweetCreated(response, { text: 'hi' }, target);

  it('marks only a wallet publish', () => {
    expect(isWalletPublish(withWalletPublish(integration, false))).toBe(false);
    expect(withWalletPublish(integration, false)).toBe(integration);
    expect(isWalletPublish(withWalletPublish(integration, true))).toBe(true);
  });

  it('reads the id as before on a paid plan', async () => {
    await expect(
      tweetCreated(answer(201, { data: { id: '42' } }), integration)
    ).resolves.toEqual({ id: '42' });
    // An answer without an id is read as before: no data, no mapped error.
    await expect(
      tweetCreated(answer(200, { errors: [{ message: 'nope' }] }), integration)
    ).resolves.toBeUndefined();
  });

  it('fails a wallet publish with a clear reason when X sends no id', async () => {
    const wallet = withWalletPublish(integration, true);
    await expect(
      tweetCreated(answer(201, { data: { id: '42' } }), wallet)
    ).resolves.toEqual({ id: '42' });
    await expect(
      tweetCreated(answer(200, { errors: [{ message: 'nope' }] }), wallet)
    ).rejects.toBeInstanceOf(BadBody);
  });

  it('names X credits running out only for a wallet publish', () => {
    const err = new BadBody(
      'x',
      '{"type":"https://api.x.com/2/problems/credits","title":"CreditsDepleted"}',
      '{}',
      'Unknown Error'
    );
    const rethrown = (target: any) => {
      try {
        (provider as any).walletPublishError(err, target);
      } catch (e) {
        return e as BadBody;
      }
      throw new Error('expected a throw');
    };
    expect(rethrown(integration)).toBe(err);
    expect(rethrown(withWalletPublish(integration, true)).message).toMatch(
      /X is not accepting posts right now/
    );
  });

  it('keeps the error mapping it had before', () => {
    expect(provider.handleErrors('{"title":"CreditsDepleted"}')).toBeUndefined();
  });
});
