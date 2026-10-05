import { providerNeedsPaidPlan } from './trial';

describe('providerNeedsPaidPlan', () => {
  it('locks X on the free plan', () => {
    expect(providerNeedsPaidPlan('x')).toBe(true);
    expect(providerNeedsPaidPlan('X')).toBe(true);
  });

  it('leaves TikTok and the other channels open', () => {
    expect(providerNeedsPaidPlan('tiktok')).toBe(false);
    expect(providerNeedsPaidPlan('linkedin')).toBe(false);
    expect(providerNeedsPaidPlan('instagram-standalone')).toBe(false);
    expect(providerNeedsPaidPlan(undefined)).toBe(false);
  });
});
