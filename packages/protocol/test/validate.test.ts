import { describe, expect, it } from 'vitest';
import { validateEnvelope } from '../src/validate';
import { createEnvelope, createCurrencyEvent } from '../fixtures/sample';

describe('capture import boundary', () => {
  it('rejects unrecognized schema versions', () => {
    expect(() => validateEnvelope({ ...createEnvelope(), schemaVersion: 2 })).toThrow(/version/i);
  });
  it('preserves unknown values instead of inventing zero or false', () => {
    const value = createEnvelope();
    value.characters['Player-TEST-1']!.vault.slots = [{
      key: 'raid:1', activityType: 1, index: 1, progress: null, threshold: 2, itemLevel: null,
    }];
    const result = validateEnvelope(value).characters['Player-TEST-1']!;
    expect(result.vault.slots[0]!.progress).toBeNull();
    expect(result.vault.previousRewardAvailable).toBeNull();
  });
  it.each([NaN, Infinity, -Infinity])('rejects non-finite numeric values: %s', number => {
    const value = createEnvelope();
    value.characters['Player-TEST-1']!.capturedAt = number;
    expect(() => validateEnvelope(value)).toThrow(/characters.*capturedAt/);
  });
  it('requires identity and consistent record keys', () => {
    const value = createEnvelope();
    value.characters['Player-TEST-1']!.identity.guid = '';
    expect(() => validateEnvelope(value)).toThrow(/identity.guid/);
    value.characters['Player-TEST-1']!.identity.guid = 'Player-OTHER';
    expect(() => validateEnvelope(value)).toThrow(/identity.guid/);
  });
  it('rejects invalid and backwards weeks', () => {
    const value = createEnvelope();
    value.characters['Player-TEST-1']!.week.start = 200;
    expect(() => validateEnvelope(value)).toThrow(/week/);
  });
  it('requires a quantity for confirmed events, preserves pending unknowns', () => {
    const event = createCurrencyEvent({ quantity: null, evidence: 'pending' });
    const value = createEnvelope({ events: { [event.id]: event } });
    expect(validateEnvelope(value).events[event.id]!.quantity).toBeNull();
    event.evidence = 'confirmed';
    expect(() => validateEnvelope(value)).toThrow(/events.*quantity/);
  });
  it.each([0, -1])('rejects nonpositive gain/spend quantity %s', quantity => {
    const event = createCurrencyEvent({ quantity });
    expect(() => validateEnvelope(createEnvelope({ events: { [event.id]: event } }))).toThrow(/quantity/);
  });
  it('accepts signed adjustments', () => {
    const event = createCurrencyEvent({ kind: 'adjustment', quantity: -2 });
    expect(validateEnvelope(createEnvelope({ events: { [event.id]: event } })).events[event.id]).toEqual(event);
  });
  it('rejects event key mismatches and unknown characters', () => {
    const event = createCurrencyEvent();
    expect(() => validateEnvelope(createEnvelope({ events: { wrong: event } }))).toThrow(/events.*id/);
    event.guid = 'Player-OTHER';
    expect(() => validateEnvelope(createEnvelope({ events: { [event.id]: event } }))).toThrow(/events.*guid/);
  });
  it('does not silently normalize missing fields, Lua tables or wrong primitive types', () => {
    const value = createEnvelope();
    const character = value.characters['Player-TEST-1']!;
    expect(() => validateEnvelope({ ...value, sequence: 1.5 })).toThrow(/sequence/);
    expect(() => validateEnvelope({ ...value, events: [] })).toThrow(/events/);
    expect(() => validateEnvelope({ ...value, capabilities: { vault: true } })).toThrow(/capabilities/);
    (character.vault as unknown as Record<string, unknown>).slots = {};
    expect(() => validateEnvelope(value)).toThrow(/vault.slots/);
  });
  it('creates fresh fixtures and exposes the workspace exports', async () => {
    const a = createEnvelope();
    a.characters['Player-TEST-1']!.encounters.push({ raidId: 1, encounterId: 2, difficultyId: 3, killed: null, lootEligible: null, observedAt: 150 });
    expect(createEnvelope().characters['Player-TEST-1']!.encounters).toEqual([]);
    const fixtureExports = await import('@azeroth-weekly/protocol/fixtures');
    const publicExports = await import('@azeroth-weekly/protocol');
    expect(publicExports.validateEnvelope(fixtureExports.createEnvelope()).schemaVersion).toBe(1);
  });
  it('rejects non-JSON extension values and nonfinite values even outside known fields', () => {
    expect(() => validateEnvelope({ ...createEnvelope(), extra: { hidden: Infinity } })).toThrow(/extra.hidden/);
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => validateEnvelope({ ...createEnvelope(), extra: cycle })).toThrow(/cyclic/);
  });
});
