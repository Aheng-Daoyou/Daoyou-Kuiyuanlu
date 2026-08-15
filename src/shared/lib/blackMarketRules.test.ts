import {
  blackMarketUnit,
  classifyBlackMarketReveal,
} from './blackMarketRules';

describe('black market rules', () => {
  it('uses a stable unit value while separating labels', () => {
    const first = blackMarketUnit('seed', 'initial');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    expect(first).toBe(blackMarketUnit('seed', 'initial'));
    expect(first).not.toBe(blackMarketUnit('seed', 'floor'));
  });

  it('grades both losses and windfalls from the server true value', () => {
    expect(classifyBlackMarketReveal(18_000, 10_000).rating).toBe('血亏');
    expect(classifyBlackMarketReveal(10_000, 10_000).rating).toBe('公允');
    expect(classifyBlackMarketReveal(5_000, 10_000).rating).toBe('天降横财');
  });
});
