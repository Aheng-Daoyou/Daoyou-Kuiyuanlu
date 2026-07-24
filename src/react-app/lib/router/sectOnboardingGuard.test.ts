import { describe, expect, it } from 'vitest';
import { resolveSectOnboardingRedirect } from './sectOnboardingGuard';

describe('sect onboarding guard', () => {
  it('waits for sect state and ignores accounts without an active cultivator', () => {
    expect(resolveSectOnboardingRedirect('/game', true, 'loading')).toBeNull();
    expect(resolveSectOnboardingRedirect('/game', false, 'none')).toBeNull();
  });

  it('forces sectless cultivators into onboarding from home and deep links', () => {
    expect(resolveSectOnboardingRedirect('/game', true, 'none')).toBe(
      '/game/sect/onboarding',
    );
    expect(resolveSectOnboardingRedirect('/game/inventory', true, 'none')).toBe(
      '/game/sect/onboarding',
    );
    expect(
      resolveSectOnboardingRedirect('/game/map', true, 'none', '?intent=sect'),
    ).toBe('/game/sect/onboarding');
    expect(
      resolveSectOnboardingRedirect('/game/sect/lingxiao/visit', true, 'none'),
    ).toBe('/game/sect/onboarding');
    expect(
      resolveSectOnboardingRedirect('/game/sect/onboarding', true, 'none'),
    ).toBeNull();
    expect(
      resolveSectOnboardingRedirect(
        '/game/sect/onboarding',
        true,
        'none',
        '?sectId=lingxiao',
      ),
    ).toBeNull();
  });

  it('only sends existing members away from unscoped onboarding', () => {
    expect(
      resolveSectOnboardingRedirect('/game/sect/onboarding', true, 'joined'),
    ).toBe('/game/sect');
    expect(
      resolveSectOnboardingRedirect('/game/sect/onboarding/', true, 'joined'),
    ).toBe('/game/sect');
    expect(
      resolveSectOnboardingRedirect(
        '/game/sect/onboarding',
        true,
        'joined',
        '?sectId=youdu',
      ),
    ).toBeNull();
    expect(resolveSectOnboardingRedirect('/game', true, 'joined')).toBeNull();
  });
});
