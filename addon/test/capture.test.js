import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fengari from 'fengari';
import { validateEnvelope } from '@azeroth-weekly/protocol';

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const harness = readFileSync(new URL('./harness.lua', import.meta.url), 'utf8');
const filenames = ['Core', 'Capture', 'Encounters', 'Currency', 'Diagnostics'];
function run(assertions) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const modules = filenames.map(name => `(function(...)\n${readFileSync(new URL(`../AzerothWeekly/${name}.lua`, import.meta.url), 'utf8')}\nend)('AzerothWeekly', AW)`);
  const source = [harness, ...modules, "Fire('ADDON_LOADED', 'AzerothWeekly')", assertions].join(';\n');
  try {
    const result = lauxlib.luaL_dostring(state, to_luastring(source));
    if (result !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(state, -1)));
    lua.lua_getglobal(state, to_luastring('testResult'));
    return readLua(state, -1);
  } finally { lua.lua_close(state); }
}

// Test-only VM bridge. It intentionally preserves Lua's empty-table ambiguity.
function readLua(state, index) {
  const type = lua.lua_type(state, index);
  if (type === lua.LUA_TNIL) return null;
  if (type === lua.LUA_TSTRING) return to_jsstring(lua.lua_tostring(state, index));
  if (type === lua.LUA_TNUMBER) return lua.lua_tonumber(state, index);
  if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(state, index);
  if (type !== lua.LUA_TTABLE) throw new Error('Unexpected VM value');
  const absolute = lua.lua_absindex(state, index), entries = [];
  lua.lua_pushnil(state);
  while (lua.lua_next(state, absolute)) {
    const key = readLua(state, -2), value = readLua(state, -1);
    entries.push([key, value]); lua.lua_pop(state, 1);
  }
  if (entries.length && entries.every(([key]) => typeof key === 'number')) {
    return entries.sort((a, b) => a[0] - b[0]).map(([, value]) => value);
  }
  return Object.fromEntries(entries);
}

// A production SavedVariables parser/normalizer belongs to the desktop importer.
function normalizeTestCapture(raw) {
  const array = value => Array.isArray(value) ? value : [];
  for (const c of Object.values(raw.characters)) {
    c.identity.classId ??= null;
    c.vault.previousRewardAvailable ??= null;
    c.vault.slots = array(c.vault.slots);
    for (const s of c.vault.slots) { s.progress ??= null; s.itemLevel ??= null; }
    c.encounters = array(c.encounters);
    for (const e of c.encounters) { e.killed ??= null; e.lootEligible ??= null; }
    c.balances = array(c.balances);
    for (const b of c.balances) b.quantity ??= null;
  }
  raw.diagnostics = array(raw.diagnostics);
  for (const d of raw.diagnostics) d.guid ??= null;
  if (raw.catalog) {
    if (raw.catalog.currentSeasonRaidIds !== undefined) raw.catalog.currentSeasonRaidIds = array(raw.catalog.currentSeasonRaidIds);
    raw.catalog.raids = array(raw.catalog.raids);
    for (const r of raw.catalog.raids) { r.difficulties = array(r.difficulties); r.bosses = array(r.bosses); }
  }
  return raw;
}

describe('addon in an isolated Lua VM with simulated client APIs', () => {
  it('captures only the verified roll currency even when other currencies are listed or updated', () => run(`
    local oldInfo = C_CurrencyInfo.GetCurrencyInfo
    C_CurrencyInfo.GetCurrencyInfo = function(id)
      if id == 2000 then return {name = 'Other Currency', quantity = 1560} end
      if id == 3418 then return {name = 'Old Season Currency', quantity = 9} end
      return oldInfo(id)
    end
    C_CurrencyInfo.GetCurrencyListSize = function() return 2 end
    C_CurrencyInfo.GetCurrencyListLink = function(i) return 'currency:' .. (i == 1 and 2000 or 3418) end
    Fire('PLAYER_LOGIN'); Flush()
    Fire('CURRENCY_DISPLAY_UPDATE', 2000); Flush()
    local balances = AW.db.characters[guid].balances
    assert(#balances == 1 and balances[1].currencyKey == 'currency:3513' and balances[1].quantity == 4)
    C_CurrencyInfo.GetCurrencyInfo = function(id)
      if id == 3513 then return {name = 'Nebulous Voidcore', quantity = 0} end
    end
    AW.Capture()
    assert(AW.db.characters[guid].balances[1].quantity == 0)
  `));
  it('marks only Current Season raids while preserving expansion archives and journal selection', () => run(`
    LE_EXPANSION_LEVEL_CURRENT = 1
    local selectedTier, selectedInstance, selectedDifficulty = 1, 50, 16
    EJ_GetNumTiers = function() return 3 end
    EJ_GetCurrentTier = function() return selectedTier end
    EJ_SelectTier = function(t) selectedTier = t end
    EJ_SelectInstance = function(i) selectedInstance = i end
    EJ_SetDifficulty = function(d) selectedDifficulty = d end
    EJ_GetInstanceByIndex = function(i)
      local entries = {{400}, {500, 600}, {600, 700}}
      local mapId = entries[selectedTier][i]
      if not mapId then return end
      return mapId, 'Raid ' .. mapId, nil, nil, nil, nil, nil, nil, nil, nil, mapId
    end
    EJ_GetEncounterInfoByIndex = function(i, instance)
      if i == 1 then return 'Boss', nil, 70, nil, nil, instance, 700, instance end
    end
    AW.CaptureCatalog()
    assert(#AW.db.catalog.raids == 4)
    assert(#AW.db.catalog.currentSeasonRaidIds == 2)
    assert(AW.db.catalog.currentSeasonRaidIds[1] == 600 and AW.db.catalog.currentSeasonRaidIds[2] == 700)
    assert(selectedTier == 1 and selectedInstance == 50 and selectedDifficulty == 16)
    LE_EXPANSION_LEVEL_CURRENT = nil
    AW.CaptureCatalog()
    assert(AW.db.catalog.currentSeasonRaidIds == nil)
    assert(AW.db.capabilities.currentSeasonCatalog == 'unverified')
    LE_EXPANSION_LEVEL_CURRENT = 1
    EJ_SelectTier = function() end
    AW.CaptureCatalog()
    assert(#AW.db.catalog.currentSeasonRaidIds == 0)
  `));
  it('retains kills across countdown sampling jitter and maintenance corrections', () => run(`
    Fire('PLAYER_LOGIN'); Flush()
    Fire('ENCOUNTER_END', 700, 'Test Encounter', 16, 20, 1)
    local id = AzerothWeeklyDB.characters[guid].week.id
    C_DateAndTime.GetSecondsUntilWeeklyReset = function() return 49 end
    AW.Capture()
    assert(AzerothWeeklyDB.characters[guid].week.id == id)
    assert(#AzerothWeeklyDB.characters[guid].encounters == 1)
    C_DateAndTime.GetSecondsUntilWeeklyReset = function() return 100 end
    AW.Capture()
    assert(AzerothWeeklyDB.characters[guid].week.id == id)
    assert(#AzerothWeeklyDB.characters[guid].encounters == 1)
  `));
  it('records a kill when capture crosses a server-second boundary', () => run(`
    Fire('PLAYER_LOGIN'); Flush()
    local calls = 0
    GetServerTime = function() calls = calls + 1; return calls == 1 and 150 or 151 end
    Fire('ENCOUNTER_END', 700, 'Test Encounter', 16, 20, 1)
    assert(#AzerothWeeklyDB.characters[guid].encounters == 1)
  `));
  it('keeps an inferred week stable while its previous interval still contains now', () => run(`
    C_DateAndTime.GetWeeklyResetStartTime = nil
    Fire('PLAYER_LOGIN'); Flush()
    local id = AzerothWeeklyDB.characters[guid].week.id
    Fire('ENCOUNTER_END', 700, 'Test Encounter', 16, 20, 1)
    now = 151
    C_DateAndTime.GetSecondsUntilWeeklyReset = function() return 50 end
    AW.Capture()
    assert(AzerothWeeklyDB.characters[guid].week.id == id)
    assert(not AzerothWeeklyDB.characters[guid].week.confirmed)
    assert(#AzerothWeeklyDB.characters[guid].encounters == 1)
  `));
  it('keeps unknown vault values, uses real reset start and coalesces updates', () => run(`
    Fire('PLAYER_LOGIN'); Fire('WEEKLY_REWARDS_UPDATE'); Fire('WEEKLY_REWARDS_UPDATE')
    assert(#timers == 1); Flush()
    local c = AzerothWeeklyDB.characters[guid]
    assert(c.week.start == 90 and c.week['end'] == 200 and c.week.confirmed == true)
    assert(c.vault.slots[1].progress == nil and c.vault.slots[1].itemLevel == nil)
    assert(c.vault.previousRewardAvailable == nil)
    assert(AzerothWeeklyDB.capabilities.vaultAPI == 'available')
    assert(AzerothWeeklyDB.capabilities.bonusRollAttribution == 'unverified')
  `));
  it('preserves multiple GUIDs, installation identity and monotonic evidence IDs across reload', () => run(`
    Fire('PLAYER_LOGIN'); Flush()
    local install = AzerothWeeklyDB.installationId
    Fire('BONUS_ROLL_STARTED'); local first = AzerothWeeklyDB.sequence
    guid = 'Player-TEST-2'; Fire('PLAYER_LOGIN'); Flush()
    AW.Initialize(); Fire('BONUS_ROLL_FAILED')
    assert(AzerothWeeklyDB.installationId == install and AzerothWeeklyDB.sequence > first)
    assert(AzerothWeeklyDB.characters['Player-TEST-1'] and AzerothWeeklyDB.characters['Player-TEST-2'])
    local last = AzerothWeeklyDB.diagnostics[#AzerothWeeklyDB.diagnostics]
    assert(last.id == install .. ':' .. AzerothWeeklyDB.sequence)
  `));
  it('marks inferred start unconfirmed, defers capture if reset end is unknown', () => run(`
    C_DateAndTime.GetWeeklyResetStartTime = nil
    Fire('PLAYER_LOGIN'); Flush()
    local c = AzerothWeeklyDB.characters[guid]
    assert(c.week.start == 200 - 604800 and not c.week.confirmed)
    C_DateAndTime.GetSecondsUntilWeeklyReset = function() return nil end
    now = 160; Fire('WEEKLY_REWARDS_UPDATE'); Flush()
    assert(AzerothWeeklyDB.characters[guid].capturedAt == 150)
    assert(AzerothWeeklyDB.capabilities.weekRuntime == 'unavailable')
  `));
  it('records mapped successful encounter facts without inventing loot eligibility or boss plans', () => run(`
    Fire('PLAYER_LOGIN'); Flush()
    assert(AzerothWeeklyDB.catalog.raids[1].id == 500)
    assert(AzerothWeeklyDB.catalog.raids[1].bosses[1].encounterId == 700)
    Fire('ENCOUNTER_END', 700, 'Test Encounter', 16, 20, 0); Flush()
    assert(#AzerothWeeklyDB.characters[guid].encounters == 0)
    Fire('ENCOUNTER_END', 700, 'Test Encounter', 16, 20, 1); Flush()
    local f = AzerothWeeklyDB.characters[guid].encounters[1]
    assert(f.killed == true and f.lootEligible == nil and f.raidId == 500)
    assert(AzerothWeeklyDB.plans == nil)
    now = 201; Fire('PLAYER_LOGIN'); Flush()
    assert(#AzerothWeeklyDB.characters[guid].encounters == 0)
  `));
  it('keeps bonus results as raw pending evidence, never infers boss spends from balances', () => run(`
    Fire('PLAYER_LOGIN'); Flush()
    Fire('CURRENCY_DISPLAY_UPDATE', 3513, 4, -1); Flush()
    Fire('BONUS_ROLL_STARTED')
    Fire('BONUS_ROLL_RESULT', 'item', 'item:test', 1, 62, 0, true, nil, false)
    assert(next(AzerothWeeklyDB.events) == nil)
    local d = AzerothWeeklyDB.diagnostics[#AzerothWeeklyDB.diagnostics]
    assert(d.event == 'BONUS_ROLL_RESULT' and d.payload.arg2 == 'item:test')
    assert(d.payload.evidence == 'pending' and d.payload.reason)
    assert(AzerothWeeklyDB.capabilities.bonusRollRuntime == 'available')
    assert(AzerothWeeklyDB.capabilities.bonusRollAttribution == 'unverified')
    local b = AzerothWeeklyDB.characters[guid].balances[1]
    assert(b.currencyKey == 'currency:3513' and b.seasonId == 'unverified' and b.quantity == 4)
    C_CurrencyInfo.GetCurrencyInfo = function() return nil end
    Fire('CURRENCY_DISPLAY_UPDATE', 3513); Flush()
    assert(AzerothWeeklyDB.characters[guid].balances[1].quantity == nil)
  `));
  it('uses only current nonextended mapped raid lock data after the async update', () => run(`
    Fire('PLAYER_LOGIN'); Flush()
    function GetNumSavedInstances() return 1 end
    local extended = false
    function GetSavedInstanceInfo() return 'Test Raid', 999, 50, 16, true, extended, 0, true, 20, 'Test', 1, 1, false, 500 end
    C_RaidLocks = {IsEncounterComplete = function(map, encounter, difficulty)
      assert(map == 500 and encounter == 700 and difficulty == 16); return true end}
    AW.Capture(); assert(#AzerothWeeklyDB.characters[guid].encounters == 0)
    Fire('UPDATE_INSTANCE_INFO'); Flush()
    assert(AzerothWeeklyDB.characters[guid].encounters[1].killed == true)
    assert(AzerothWeeklyDB.characters[guid].encounters[1].lootEligible == nil)
    now = 201; extended = true; Fire('PLAYER_LOGIN'); Flush()
    assert(#AzerothWeeklyDB.characters[guid].encounters == 0)
  `));
  it('does not accept an old currency balance under the new candidate ID', () => run(`
    C_CurrencyInfo.GetCurrencyInfo = function(id) return {name = 'Different Currency', quantity = 99} end
    Fire('PLAYER_LOGIN'); Flush()
    assert(#AzerothWeeklyDB.characters[guid].balances == 1 and AzerothWeeklyDB.characters[guid].balances[1].quantity == nil)
    Fire('CURRENCY_DISPLAY_UPDATE', 3513); Flush()
    assert(AzerothWeeklyDB.characters[guid].balances[1].quantity == nil)
    assert(AzerothWeeklyDB.capabilities.bonusCurrencyMetadata == 'unverified')
  `));
  it('does not invent identities for unsupported clients or overwrite future schemas', () => run(`
    local db = AzerothWeeklyDB
    AzerothWeeklyDB = {schemaVersion = 2, marker = 'preserve'}; AW.Initialize()
    Fire('PLAYER_LOGIN'); Flush()
    assert(AzerothWeeklyDB.marker == 'preserve' and AzerothWeeklyDB.schemaVersion == 2)
    AzerothWeeklyDB = nil; GetCurrentRegion = function() return 1 end
    AW.Initialize(); Fire('PLAYER_LOGIN'); Flush()
    assert(AzerothWeeklyDB == nil)
  `));
  it('roundtrips serialized SavedVariables through Lua then validates normalized actual output', () => {
    const raw = run(`
      Fire('PLAYER_LOGIN'); Flush()
      Fire('ENCOUNTER_END', 700, 'Test Encounter', 16, 20, 1)
      Fire('BONUS_ROLL_RESULT', 'item', 'item:test', 1, 62)
      local function serialize(value)
        if type(value) == 'table' then
          local entries = {}
          for k, v in pairs(value) do table.insert(entries, '[' .. serialize(k) .. ']=' .. serialize(v)) end
          return '{' .. table.concat(entries, ',') .. '}'
        elseif type(value) == 'string' then return string.format('%q', value)
        else return tostring(value) end
      end
      local savedVariables = 'return ' .. serialize(AzerothWeeklyDB)
      testResult = assert(load(savedVariables))()
    `);
    expect(() => validateEnvelope(raw)).toThrow(/previousRewardAvailable|progress|itemLevel|lootEligible/);
    const validated = validateEnvelope(normalizeTestCapture(raw));
    expect(validated.characters['Player-TEST-1'].vault.slots[0].progress).toBeNull();
    expect(validated.characters['Player-TEST-1'].encounters[0].lootEligible).toBeNull();
    expect(validated.events).toEqual({});
    expect(validated.catalog.raids[0].bosses[0].encounterId).toBe(700);
    expect(validated.diagnostics.at(-1).payload.evidence).toBe('pending');
  });
});
