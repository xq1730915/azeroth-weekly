import type { CaptureEnvelope, CurrencyEvent } from '../src/types';

export function createEnvelope(overrides: Partial<CaptureEnvelope> = {}): CaptureEnvelope {
  return {
    schemaVersion: 1, installationId: 'test-installation', sequence: 0,
    clientBuild: 'test-build', addonVersion: '0.1.0', capabilities: {},
    characters: {
      'Player-TEST-1': {
        identity: { region: 'CN', branch: 'retail', guid: 'Player-TEST-1', name: 'Test Character', realm: 'Test Realm', classId: null },
        capturedAt: 150, week: { id: 'cn-test-week', start: 100, end: 200, confirmed: true },
        vault: { slots: [], previousRewardAvailable: null }, encounters: [], balances: [],
      },
    },
    events: {}, ...overrides,
  };
}

export function createCurrencyEvent(overrides: Partial<CurrencyEvent> = {}): CurrencyEvent {
  return {
    id: 'test-installation:1', guid: 'Player-TEST-1', at: 150,
    currencyKey: 'test-currency', seasonId: 'test-season', kind: 'spend', quantity: 1,
    provenance: 'game', evidence: 'confirmed', activity: 'other',
    raidId: null, encounterId: null, difficultyId: null, specId: null,
    rewardLink: null, itemLevel: null, note: '', ...overrides,
  };
}
