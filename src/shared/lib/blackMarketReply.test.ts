import {
  BLACK_MARKET_APPROVED_PRICE_TOKEN,
  finalizeBlackMarketReply,
} from './blackMarketReply';

describe('finalizeBlackMarketReply', () => {
  it('replaces exactly one approved price token with the server price', () => {
    expect(
      finalizeBlackMarketReply({
        draft: `你说得有几分道理，最多让到${BLACK_MARKET_APPROVED_PRICE_TOKEN}。`,
        approvedPrice: 3330,
      }),
    ).toBe('你说得有几分道理，最多让到3,330灵石。');
  });

  it('rejects a repeated approved price token', () => {
    expect(
      finalizeBlackMarketReply({
        draft: `${BLACK_MARKET_APPROVED_PRICE_TOKEN}，或者${BLACK_MARKET_APPROVED_PRICE_TOKEN}。`,
        approvedPrice: 3330,
      }),
    ).toBeUndefined();
  });

  it('does not mistake ordinary Chinese number words for a price', () => {
    expect(finalizeBlackMarketReply({ draft: '不像一次磕碰出来的。' })).toBe(
      '不像一次磕碰出来的。',
    );
  });

  it('requires the approved token whenever the adjudicated turn has a price', () => {
    expect(
      finalizeBlackMarketReply({ draft: '这便成交。', approvedPrice: 3330 }),
    ).toBeUndefined();
  });

  it('rejects the approved token on a turn without an adjudicated price', () => {
    expect(
      finalizeBlackMarketReply({
        draft: `先看看再说，暂按${BLACK_MARKET_APPROVED_PRICE_TOKEN}。`,
      }),
    ).toBeUndefined();
    expect(finalizeBlackMarketReply({ draft: '你再仔细看看。' })).toBe(
      '你再仔细看看。',
    );
  });
});
