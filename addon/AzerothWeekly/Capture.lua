local _, AW = ...

function AW.GetWeek(now, previous)
    local seconds = AW.SafeCall(C_DateAndTime and C_DateAndTime.GetSecondsUntilWeeklyReset)
    local start = AW.SafeCall(C_DateAndTime and C_DateAndTime.GetWeeklyResetStartTime)
    if not AW.IsNumber(seconds) or seconds <= 0 then
        AW.Capability("weekRuntime", "unavailable")
        return nil
    end
    local finish = now + seconds
    local confirmed = AW.IsNumber(start) and start <= now and start < finish
    local id
    if confirmed then
        id = "CN:retail:" .. string.format("%.0f", start)
    elseif previous and previous.week and previous.week.start <= now and now < previous.week["end"] then
        -- Timing samples can cross seconds. Preserve the known interval's identity
        -- while its start is unavailable; do not turn an estimate into proof.
        start = previous.week.start
        id = previous.week.id
    else
        start = finish - 604800
        id = "CN:retail:estimated:" .. string.format("%.0f", start)
    end
    if start >= finish or start > now then return nil end
    AW.Capability("weekRuntime", "available")
    AW.Capability("weekStart", confirmed and "available" or "unverified")
    return {id = id, start = start, ["end"] = finish, confirmed = confirmed}
end

function AW.CaptureVault()
    local fn = C_WeeklyRewards and C_WeeklyRewards.GetActivities
    AW.Capability("vaultAPI", type(fn) == "function" and "available" or "unavailable")
    local activities = AW.SafeCall(fn)
    local slots = {}
    if type(activities) == "table" then
        AW.Capability("vaultRuntime", "available")
        for _, activity in ipairs(activities) do
            if AW.IsNumber(activity.type) and activity.type > 0 and AW.IsNumber(activity.index)
                and activity.index > 0 and AW.IsNumber(activity.threshold) and activity.threshold >= 0 then
                local itemLevel
                local link = AW.SafeCall(C_WeeklyRewards.GetExampleRewardItemHyperlinks, activity.id)
                if AW.IsString(link) then
                    local value = AW.SafeCall(C_Item and C_Item.GetDetailedItemLevelInfo, link)
                    if AW.IsNumber(value) and value > 0 then itemLevel = value end
                end
                table.insert(slots, {key = activity.type .. ":" .. activity.index, activityType = activity.type,
                    index = activity.index, threshold = activity.threshold,
                    progress = AW.IsNumber(activity.progress) and activity.progress >= 0 and activity.progress or nil,
                    itemLevel = itemLevel})
            else AW.Capability("vaultRuntime", "unverified") end
        end
    else AW.Capability("vaultRuntime", "unavailable") end
    local available = AW.SafeCall(C_WeeklyRewards and C_WeeklyRewards.HasAvailableRewards)
    if type(available) ~= "boolean" then available = nil end
    return {slots = slots, previousRewardAvailable = available}
end

function AW.Capture()
    if not AW.db then return end
    local now = AW.SafeCall(GetServerTime)
    local guid = AW.SafeCall(UnitGUID, "player")
    local names = AW.Call(UnitFullName, "player")
    if not AW.IsNumber(now) or not AW.IsString(guid) or not names or not AW.IsString(names[2]) then return end
    local realm = names[3]
    if not AW.IsString(realm) then realm = AW.SafeCall(GetRealmName) end
    if not AW.IsString(realm) then return end
    local previous = AW.db.characters[guid]
    local week = AW.GetWeek(now, previous)
    -- Keep the prior snapshot's original timestamp when timing cannot be collected.
    if not week then AW.Observe("CAPTURE_DEFERRED", {reason = "weekly reset unavailable"}); return end
    local encounters = {}
    if previous and previous.week then
        if previous.week.id == week.id then encounters = previous.encounters or {}
        elseif week.confirmed then
            -- Reconcile an estimated ID when native start evidence becomes available.
            for _, fact in ipairs(previous.encounters or {}) do
                if fact.observedAt >= week.start and fact.observedAt < week["end"] then
                    table.insert(encounters, fact)
                end
            end
        end
    end
    local class = AW.Call(UnitClass, "player")
    local classId = class and class[4]
    local capture = {
        identity = {region = "CN", branch = "retail", guid = guid, name = names[2], realm = realm,
            classId = AW.IsNumber(classId) and classId > 0 and classId or nil},
        capturedAt = now, week = week, vault = AW.CaptureVault(), encounters = encounters,
        balances = AW.CaptureCurrencies and AW.CaptureCurrencies(now) or {},
    }
    if AW.SavedEncounters then AW.SavedEncounters(capture, now) end
    AW.db.characters[guid] = capture
    AW.NextId()
    return capture
end
