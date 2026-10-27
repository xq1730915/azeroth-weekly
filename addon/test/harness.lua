AW = {}
guid = 'Player-TEST-1'
now = 150
timers = {}
SlashCmdList = {}
DEFAULT_CHAT_FRAME = {AddMessage = function() end}
function CreateFrame()
  local f = {}
  function f:RegisterEvent() end
  function f:SetScript(_, callback) self.callback = callback end
  frame = f
  return f
end
function Fire(event, ...) frame.callback(frame, event, ...) end
function Flush() local batch = timers; timers = {}; for _, callback in ipairs(batch) do callback() end end
C_Timer = {After = function(_, callback) table.insert(timers, callback) end}
function GetServerTime() return now end
function UnitGUID() return guid end
function UnitFullName() return 'Test Character', 'Test Realm' end
function GetRealmName() return 'Test Realm' end
function UnitClass() return 'Test Class', 'TEST', 1 end
function GetCurrentRegion() return 5 end
WOW_PROJECT_ID = 1
WOW_PROJECT_MAINLINE = 1
function GetBuildInfo() return 'test', '12345', 'test', 120105 end
C_DateAndTime = {
  GetWeeklyResetStartTime = function() return now < 200 and 90 or 200 end,
  GetSecondsUntilWeeklyReset = function() return (now < 200 and 200 or 300) - now end,
}
C_WeeklyRewards = {GetActivities = function() return {{id = 5, type = 1, index = 1, threshold = 2}} end}
function EJ_GetCurrentTier() return 1 end
function EJ_GetNumTiers() return 1 end
function EJ_SelectTier() end
function EJ_GetInstanceByIndex(i) if i == 1 then return 50, 'Test Raid', nil, nil, nil, nil, nil, nil, nil, nil, 500 end end
function EJ_GetInstanceInfo() return 'Test Raid', nil, nil, nil, nil, nil, nil, nil, nil, 500 end
function EJ_SelectInstance() end
function EJ_GetEncounterInfoByIndex(i) if i == 1 then return 'Test Encounter', nil, 70, nil, nil, 50, 700, 500 end end
function EJ_GetDifficulty() return 16 end
function EJ_SetDifficulty() end
function EJ_GetCurrentInstance() return 50 end
function EJ_IsValidInstanceDifficulty(id) return id == 16 end
function GetDifficultyInfo() return 'Test Difficulty' end
function GetInstanceInfo() return 'Test Raid', 'raid', 16, nil, nil, nil, nil, 500 end
function GetNumSavedInstances() return 0 end
function RequestRaidInfo() end
C_CurrencyInfo = {
  GetCurrencyListSize = function() return 0 end,
  GetCurrencyInfo = function(id) if id == 3513 then return {name = 'Nebulous Voidcore', quantity = 4} end end,
}
