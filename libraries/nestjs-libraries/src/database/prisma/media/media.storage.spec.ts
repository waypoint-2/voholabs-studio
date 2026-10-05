jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/videos/video.manager', () => ({
  VideoManager: class {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.storage.service',
  () => ({ WalletStorageService: class {} })
);

import { HttpException } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { storeBufferAsMedia } from '@gitroom/nestjs-libraries/chat/tools/media.upload.helper';
import { walletPaymentRequired } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

// MediaService.assertStorage with stub services: which organizations pay for
// storage from the wallet, and that a refused upload is never stored.

const MB = 1024 * 1024;
const FREE_PLAN = { cancelAt: new Date(Date.now() - 86_400_000) };
const PAID_PLAN = {
  subscriptionTier: 'PRO',
  cancelAt: null,
  isLifetime: false,
};

const build = (opts: {
  subscription: any;
  liftsCap?: boolean;
  used?: number;
  refuse?: boolean;
}) => {
  const repository = {
    getStorageUsed: jest.fn(async () => opts.used ?? 0),
    saveFile: jest.fn(async () => ({ id: 'm1', path: '/m1.png' })),
  } as any;
  const subscriptions = {
    getSubscriptionByOrganizationId: jest.fn(async () => opts.subscription),
  } as any;
  const walletStorage = {
    liftsCap: jest.fn(async () => !!opts.liftsCap),
    payForUpload: jest.fn(async () => {
      if (opts.refuse) {
        throw walletPaymentRequired('Not enough credits to store this file.');
      }
      return 1;
    }),
  } as any;
  const service = new MediaService(
    repository,
    {} as any,
    subscriptions,
    {} as any,
    walletStorage
  );
  return { service, repository, walletStorage };
};

describe('MediaService.assertStorage', () => {
  it('holds a free organization without a wallet to the plan cap (413)', async () => {
    const cap = pricing.FREE.storage_mb * MB;
    const { service, walletStorage } = build({
      subscription: FREE_PLAN,
      used: cap - MB,
    });
    await expect(service.assertStorage('org-1', MB / 2)).resolves.toBe(
      undefined
    );
    const refused = await service
      .assertStorage('org-1', 2 * MB)
      .catch((err) => err);
    expect(refused).toBeInstanceOf(HttpException);
    expect(refused.getStatus()).toBe(413);
    expect(walletStorage.payForUpload).not.toHaveBeenCalled();
  });

  it('never charges a paid plan', async () => {
    const { service, walletStorage } = build({
      subscription: PAID_PLAN,
      liftsCap: true,
    });
    await service.assertStorage('org-1', 10 * MB);
    expect(walletStorage.payForUpload).not.toHaveBeenCalled();
  });

  it('has a wallet organization pay for the upload instead of the cap', async () => {
    const { service, walletStorage } = build({
      subscription: FREE_PLAN,
      liftsCap: true,
      used: 100 * 1024 * MB,
    });
    await service.assertStorage('org-1', 10 * MB);
    expect(walletStorage.payForUpload).toHaveBeenCalledWith(
      'org-1',
      10 * MB,
      {}
    );
    await service.assertStorage('org-1', 10 * MB, { charge: false });
    expect(walletStorage.payForUpload).toHaveBeenLastCalledWith(
      'org-1',
      10 * MB,
      { charge: false }
    );
  });

  it('saving a file charges nothing', async () => {
    const { service, walletStorage } = build({
      subscription: FREE_PLAN,
      liftsCap: true,
    });
    await service.saveFile('org-1', 'a.png', '/a.png', 'a.png', 5 * MB);
    expect(walletStorage.payForUpload).not.toHaveBeenCalled();
  });
});

describe('storeBufferAsMedia when the wallet cannot pay', () => {
  // A 1x1 PNG.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );

  it('does not store the file and says to top up', async () => {
    const { service, repository } = build({
      subscription: FREE_PLAN,
      liftsCap: true,
      refuse: true,
    });
    const storage = { uploadFile: jest.fn() } as any;
    const result = await storeBufferAsMedia({
      storage,
      mediaService: service,
      organizationId: 'org-1',
      buffer: PNG,
    });
    expect(result.error).toContain('Not enough credits to store this file.');
    expect(result.error).toContain('/wallet');
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(repository.saveFile).not.toHaveBeenCalled();
  });
});
