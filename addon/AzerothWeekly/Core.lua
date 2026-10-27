local addonName, AW = ...
AW.version = "0.1.2"
AW.frame = CreateFrame("Frame")
AW.pending = false
AW.currencyIds = {}
AW.encounterMap = {}

function AW.IsNumber(value)
    if type(issecretvalue) == "function" and issecretvalue(value) then return false end
    return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

function AW.IsString(value)
    if type(issecretvalue) == "function" and issecretvalue(value) then return false end
    return type(value) == "string" and value ~= ""
end

-- All API calls may be unavailable, throw, return nil, or return secret data.
function AW.Call(fn, ...)
    if type(fn) ~= "function" then return nil end
    local result = {pcall(fn, ...)}
    if not result[1] then return nil end
    return result
end

function AW.SafeCall(fn, ...)
    local result = AW.Call(fn, ...)
    if not result then return nil, "unavailable" end
    if type(issecretvalue) == "function" and issecretvalue(result[2]) then return nil, "unavailable" end
    if result[2] == nil then return nil, "unavailable" end
    return result[2], "available"
end

function AW.Capability(key, value)
    if AW.db then AW.db.capabilities[key] = value end
end

function AW.NextId()
    AW.db.sequence = AW.db.sequence + 1
    return AW.db.installationId .. ":" .. string.format("%.0f", AW.db.sequence)
end

function AW.Observe(event, payload)
    if not AW.db then return end
    local at = AW.SafeCall(GetServerTime)
    if not AW.IsNumber(at) then return end
    local guid = AW.SafeCall(UnitGUID, "player")
    table.insert(AW.db.diagnostics, {id = AW.NextId(), at = at,
        guid = AW.IsString(guid) and guid or nil, event = event, payload = payload or {}})
end

function AW.Initialize()
    AW.db = nil
    local region = AW.SafeCall(GetCurrentRegion)
    if region ~= 5 or WOW_PROJECT_ID ~= WOW_PROJECT_MAINLINE then
        AW.error = "仅支持 CN 正式服；没有生成推测身份。"
        return
    end
    if AzerothWeeklyDB ~= nil and (type(AzerothWeeklyDB) ~= "table" or AzerothWeeklyDB.schemaVersion ~= 1) then
        AW.error = "SavedVariables 版本无法识别；保留原数据。"
        return
    end
    if not AzerothWeeklyDB then
        local guid = AW.SafeCall(UnitGUID, "player")
        local at = AW.SafeCall(GetServerTime)
        if not AW.IsString(guid) or not AW.IsNumber(at) then return end
        AzerothWeeklyDB = {schemaVersion = 1,
            installationId = guid .. ":" .. at .. ":" .. math.random(100000, 999999),
            sequence = 0, clientBuild = "unverified", addonVersion = AW.version,
            capabilities = {}, characters = {}, events = {}, diagnostics = {}}
    end
    local db = AzerothWeeklyDB
    if not AW.IsString(db.installationId) or not AW.IsNumber(db.sequence)
        or db.sequence < 0 or db.sequence % 1 ~= 0 or db.sequence >= 9007199254740990
        or type(db.characters) ~= "table" or type(db.events) ~= "table"
        or type(db.capabilities) ~= "table" then
        AW.error = "SavedVariables 结构异常；保留原数据。"
        return
    end
    if db.diagnostics ~= nil and type(db.diagnostics) ~= "table" then
        AW.error = "SavedVariables 诊断结构异常；保留原数据。"; return
    end
    db.diagnostics = db.diagnostics or {}
    AW.db = db
    AW.error = nil
    db.addonVersion = AW.version
    for _, character in pairs(db.characters) do
        if type(character) == "table" and type(character.balances) == "table" then
            for _, balance in ipairs(character.balances) do
                if type(balance) == "table" and AW.IsString(balance.currencyKey) then
                    local id = tonumber(string.match(balance.currencyKey, "^currency:(%d+)$"))
                    if id and id > 0 then AW.currencyIds[id] = true end
                end
            end
        end
    end
    local build = AW.Call(GetBuildInfo)
    if build and AW.IsString(build[2]) and AW.IsString(build[3]) then
        db.clientBuild = build[2] .. "." .. build[3]
    end
    for _, key in ipairs({"vaultRuntime", "weekRuntime", "catalogRuntime", "currencyRuntime", "bonusRollRuntime", "bonusRollAttribution", "currencySeason"}) do
        AW.Capability(key, "unverified")
    end
end

function AW.Schedule()
    if AW.pending then return end
    AW.pending = true
    if C_Timer and type(C_Timer.After) == "function" then
        C_Timer.After(1, function()
            AW.pending = false
            if AW.Capture then AW.Capture() end
        end)
    else
        AW.pending = false
        if AW.Capture then AW.Capture() end
    end
end

local events = {"ADDON_LOADED", "PLAYER_LOGIN", "PLAYER_LOGOUT", "WEEKLY_REWARDS_UPDATE",
    "ENCOUNTER_END", "UPDATE_INSTANCE_INFO", "CURRENCY_DISPLAY_UPDATE",
    "BONUS_ROLL_ACTIVATE", "BONUS_ROLL_DEACTIVATE", "BONUS_ROLL_STARTED", "BONUS_ROLL_RESULT", "BONUS_ROLL_FAILED"}
AW.registration = {}
for _, event in ipairs(events) do
    local ok = pcall(AW.frame.RegisterEvent, AW.frame, event)
    AW.registration[event] = ok and "available" or "unavailable"
end
AW.frame:SetScript("OnEvent", function(_, event, ...)
    if event == "ADDON_LOADED" then
        if ... == addonName then AW.Initialize() end
        return
    end
    if event == "PLAYER_LOGIN" then
        if not AW.db then AW.Initialize() end
        if not AW.db then return end
        AW.Capability("bonusRollEventRegistration", AW.registration.BONUS_ROLL_RESULT)
        if AW.CaptureCatalog then AW.CaptureCatalog() end
        AW.SafeCall(RequestRaidInfo)
        AW.Schedule()
    elseif event == "PLAYER_LOGOUT" then
        -- A timer cannot be trusted to run during logout: snapshot synchronously.
        if AW.Capture then AW.Capture() end
    elseif AW.db then
        if event == "UPDATE_INSTANCE_INFO" then AW.instanceInfoReady = true end
        if event == "ENCOUNTER_END" and AW.EncounterEnd then AW.EncounterEnd(...) end
        if event == "CURRENCY_DISPLAY_UPDATE" and AW.CurrencyUpdate then AW.CurrencyUpdate(...) end
        if string.find(event, "^BONUS_ROLL_") and AW.BonusRoll then AW.BonusRoll(event, ...) end
        AW.Schedule()
    end
end)
