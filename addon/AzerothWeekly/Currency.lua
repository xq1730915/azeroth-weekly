local _, AW = ...
-- Public 12.1.5 candidate only. Runtime name validation prevents old/new ID mixing.
local candidateId = 3513
local expectedNames = {["晦暗虚空核心"] = true, ["Nebulous Voidcore"] = true}

function AW.CurrencyUpdate(currencyId, ...)
    if AW.IsNumber(currencyId) and currencyId > 0 then AW.currencyIds[currencyId] = true end
    -- Quantity deltas have no authoritative activity or spend provenance.
end

function AW.CaptureCurrencies(now)
    local fn = C_CurrencyInfo and C_CurrencyInfo.GetCurrencyInfo
    AW.Capability("currencyAPI", type(fn) == "function" and "available" or "unavailable")
    local candidate = AW.SafeCall(fn, candidateId)
    if type(candidate) == "table" and AW.IsString(candidate.name) and expectedNames[candidate.name] then
        AW.currencyIds[candidateId] = true
        AW.Capability("bonusCurrencyMetadata", "available")
        if not AW.currencyCandidateObserved and AW.IsNumber(candidate.quantity) then
            AW.Observe("CURRENCY_METADATA", {currencyId = candidateId, name = candidate.name,
                quantity = candidate.quantity, seasonId = "unverified"})
            AW.currencyCandidateObserved = true
        end
    else AW.Capability("bonusCurrencyMetadata", "unverified") end
    -- The tracker reports bonus-roll coins only. Other currencies may appear in
    -- currency updates or old SavedVariables but must never become the roll balance.
    local quantity
    if type(candidate) == "table" and AW.IsString(candidate.name) and expectedNames[candidate.name]
        and AW.IsNumber(candidate.quantity) and candidate.quantity >= 0 then
        quantity = candidate.quantity
    end
    -- Export unknown explicitly so a failed/mismatched read replaces an older value.
    local result = {{currencyKey = "currency:" .. candidateId, seasonId = "unverified",
        quantity = quantity, observedAt = now}}
    AW.Capability("currencyRuntime", quantity ~= nil and "available" or "unverified")
    AW.Capability("currencySeason", "unverified")
    return result
end

function AW.BonusRoll(event, ...)
    AW.Capability("bonusRollRuntime", "available")
    local payload = {evidence = "pending", reason = "full spend/encounter association unverified", argCount = select("#", ...)}
    for index = 1, select("#", ...) do
        local value = select(index, ...)
        if AW.IsString(value) or AW.IsNumber(value) or type(value) == "boolean" then
            if not (type(issecretvalue) == "function" and issecretvalue(value)) then payload["arg" .. index] = value end
        end
    end
    -- BONUS_ROLL_RESULT.quantity describes reward quantity, not currency cost.
    -- Even observing STARTED + RESULT does not prove a particular boss spend.
    AW.Observe(event, payload)
    AW.Capability("bonusRollAttribution", "unverified")
end
