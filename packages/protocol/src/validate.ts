import type { CaptureEnvelope } from './types';

type Obj = Record<string, unknown>;
const fail = (path: string, message: string): never => { throw new Error(`${path}: ${message}`); };
function object(value: unknown, path: string): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'expected object');
  return value as Obj;
}
function text(value: unknown, path: string, empty = false): void {
  if (typeof value !== 'string' || (!empty && !value.trim())) fail(path, 'expected nonempty string');
}
function number(value: unknown, path: string, minimum?: number, integer = false): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected finite number');
  if (integer && !Number.isSafeInteger(value)) fail(path, 'expected safe integer');
  if (minimum !== undefined && (value as number) < minimum) fail(path, `expected >= ${minimum}`);
}
function boolean(value: unknown, path: string): void {
  if (typeof value !== 'boolean') fail(path, 'expected boolean');
}
function oneOf(value: unknown, path: string, options: readonly unknown[]): void {
  if (!options.includes(value)) fail(path, `expected ${options.join(' | ')}`);
}
function nullable(value: unknown, path: string, validate: (v: unknown, p: string) => void): void {
  if (value !== null) validate(value, path);
}
const id = (v: unknown, p: string) => number(v, p, 1, true);
const nonnegative = (v: unknown, p: string) => number(v, p, 0);
function array(value: unknown, path: string, validate: (v: unknown, p: string) => void): void {
  if (!Array.isArray(value)) fail(path, 'expected array (normalize Lua tables before validation)');
  (value as unknown[]).forEach((entry, i) => validate(entry, `${path}[${i}]`));
}
function fields(o: Obj, p: string, names: string[], validate: (v: unknown, p: string) => void): void {
  for (const name of names) validate(o[name], `${p}.${name}`);
}

function jsonTree(value: unknown, path: string, ancestors = new Set<object>(), depth = 0): void {
  if (depth > 80) fail(path, 'maximum data depth exceeded');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { number(value, path); return; }
  if (typeof value !== 'object') fail(path, 'expected JSON value');
  if (ancestors.has(value as object)) fail(path, 'cyclic value');
  ancestors.add(value as object);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) jsonTree(value[i], `${path}[${i}]`, ancestors, depth + 1);
  } else {
    for (const [key, child] of Object.entries(object(value, path))) jsonTree(child, `${path}.${key}`, ancestors, depth + 1);
  }
  ancestors.delete(value as object);
}

/** Validate normalized JSON. Missing Lua nil fields must be normalized to null by the importer. */
export function validateEnvelope(value: unknown): CaptureEnvelope {
  const root = object(value, '$');
  jsonTree(root, '$');
  if (root.schemaVersion !== 1) fail('$.schemaVersion', 'unsupported protocol version');
  fields(root, '$', ['installationId', 'clientBuild', 'addonVersion'], text);
  number(root.sequence, '$.sequence', 0, true);
  for (const [key, status] of Object.entries(object(root.capabilities, '$.capabilities'))) {
    text(key, '$.capabilities key');
    oneOf(status, `$.capabilities.${key}`, ['available', 'unavailable', 'unverified']);
  }
  const characters = object(root.characters, '$.characters');
  for (const [guid, raw] of Object.entries(characters)) {
    const p = `$.characters.${guid}`, c = object(raw, p), identity = object(c.identity, `${p}.identity`);
    fields(identity, `${p}.identity`, ['guid', 'name', 'realm'], text);
    if (identity.guid !== guid) fail(`${p}.identity.guid`, 'must match character key');
    oneOf(identity.region, `${p}.identity.region`, ['CN']);
    oneOf(identity.branch, `${p}.identity.branch`, ['retail']);
    nullable(identity.classId, `${p}.identity.classId`, id);
    number(c.capturedAt, `${p}.capturedAt`, 0);
    const w = object(c.week, `${p}.week`);
    text(w.id, `${p}.week.id`);
    fields(w, `${p}.week`, ['start', 'end'], nonnegative);
    if ((w.start as number) >= (w.end as number)) fail(`${p}.week`, 'start must precede end');
    boolean(w.confirmed, `${p}.week.confirmed`);
    const vault = object(c.vault, `${p}.vault`);
    nullable(vault.previousRewardAvailable, `${p}.vault.previousRewardAvailable`, boolean);
    const slotKeys = new Set<unknown>();
    array(vault.slots, `${p}.vault.slots`, (rawSlot, sp) => {
      const s = object(rawSlot, sp);
      text(s.key, `${sp}.key`);
      if (slotKeys.has(s.key)) fail(`${sp}.key`, 'duplicate slot');
      slotKeys.add(s.key);
      fields(s, sp, ['activityType', 'index'], id);
      number(s.threshold, `${sp}.threshold`, 0);
      nullable(s.progress, `${sp}.progress`, nonnegative);
      nullable(s.itemLevel, `${sp}.itemLevel`, nonnegative);
    });
    array(c.encounters, `${p}.encounters`, (rawFact, fp) => {
      const fact = object(rawFact, fp);
      fields(fact, fp, ['raidId', 'encounterId', 'difficultyId'], id);
      nullable(fact.killed, `${fp}.killed`, boolean);
      nullable(fact.lootEligible, `${fp}.lootEligible`, boolean);
      nonnegative(fact.observedAt, `${fp}.observedAt`);
    });
    array(c.balances, `${p}.balances`, (rawBalance, bp) => {
      const b = object(rawBalance, bp);
      fields(b, bp, ['currencyKey', 'seasonId'], text);
      nullable(b.quantity, `${bp}.quantity`, nonnegative);
      nonnegative(b.observedAt, `${bp}.observedAt`);
    });
  }
  for (const [eventId, raw] of Object.entries(object(root.events, '$.events'))) {
    const p = `$.events.${eventId}`, e = object(raw, p);
    fields(e, p, ['id', 'guid', 'currencyKey', 'seasonId'], text);
    if (e.id !== eventId) fail(`${p}.id`, 'must match event key');
    if (!Object.hasOwn(characters, e.guid as string)) fail(`${p}.guid`, 'unknown character');
    nonnegative(e.at, `${p}.at`);
    oneOf(e.kind, `${p}.kind`, ['gain', 'spend', 'adjustment']);
    oneOf(e.provenance, `${p}.provenance`, ['game', 'manual']);
    oneOf(e.evidence, `${p}.evidence`, ['confirmed', 'pending']);
    oneOf(e.activity, `${p}.activity`, ['raid', 'dungeon', 'delve', 'other']);
    if (e.quantity === null && e.evidence === 'confirmed') fail(`${p}.quantity`, 'confirmed events need quantity');
    nullable(e.quantity, `${p}.quantity`, number);
    if (e.quantity !== null && e.kind !== 'adjustment' && (e.quantity as number) <= 0) fail(`${p}.quantity`, 'gain/spend must be positive');
    for (const name of ['raidId', 'encounterId', 'difficultyId', 'specId']) nullable(e[name], `${p}.${name}`, id);
    nullable(e.rewardLink, `${p}.rewardLink`, text);
    nullable(e.itemLevel, `${p}.itemLevel`, nonnegative);
    text(e.note, `${p}.note`, true);
  }
  if (root.catalog !== undefined) {
    const catalog = object(root.catalog, '$.catalog');
    text(catalog.version, '$.catalog.version');
    if (catalog.currentSeasonRaidIds !== undefined)
      array(catalog.currentSeasonRaidIds, '$.catalog.currentSeasonRaidIds', id);
    array(catalog.raids, '$.catalog.raids', (rawRaid, p) => {
      const raid = object(rawRaid, p);
      id(raid.id, `${p}.id`); text(raid.name, `${p}.name`);
      for (const [collection, key] of [['difficulties', 'id'], ['bosses', 'encounterId']] as const) {
        array(raid[collection], `${p}.${collection}`, (rawEntry, ep) => {
          const entry = object(rawEntry, ep);
          id(entry[key], `${ep}.${key}`); text(entry.name, `${ep}.name`);
        });
      }
    });
  }
  if (root.diagnostics !== undefined) array(root.diagnostics, '$.diagnostics', (raw, p) => {
    const d = object(raw, p);
    fields(d, p, ['id', 'event'], text); nonnegative(d.at, `${p}.at`);
    nullable(d.guid, `${p}.guid`, text);
    for (const [key, entry] of Object.entries(object(d.payload, `${p}.payload`))) {
      if (typeof entry === 'number') number(entry, `${p}.payload.${key}`);
      else if (typeof entry !== 'boolean' && typeof entry !== 'string') fail(`${p}.payload.${key}`, 'expected scalar diagnostic');
    }
  });
  return value as CaptureEnvelope;
}
