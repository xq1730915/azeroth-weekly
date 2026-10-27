local _, AW = ...

function AW.CaptureCatalog()
    if not AW.db then return end
    if type(EJ_GetInstanceByIndex) ~= "function" or type(EJ_GetEncounterInfoByIndex) ~= "function" then
        AW.Capability("catalogRuntime", "unavailable"); return
    end
    local oldTier = AW.SafeCall(EJ_GetCurrentTier)
    local oldInstance = AW.SafeCall(EJ_GetCurrentInstance)
    local oldDifficulty = AW.SafeCall(EJ_GetDifficulty)
    local tiers = AW.SafeCall(EJ_GetNumTiers)
    if not AW.IsNumber(tiers) or tiers < 1 then AW.Capability("catalogRuntime", "unavailable"); return end
    local raids, seen, currentSeasonRaidIds = {}, {}, {}
    -- Blizzard's journal appends Current Season after the expansion tiers.
    -- Confirm the extra tier exists rather than treating the latest expansion as a season.
    local seasonTier = AW.IsNumber(LE_EXPANSION_LEVEL_CURRENT)
        and tiers > LE_EXPANSION_LEVEL_CURRENT + 1 and tiers or nil
    AW.encounterMap = {}
    for tier = 1, math.min(tiers, 100) do
        AW.Call(EJ_SelectTier, tier)
        for index = 1, 200 do
            local info = AW.Call(EJ_GetInstanceByIndex, index, true)
            if not info or not AW.IsNumber(info[2]) then break end
            local journalInstanceId, name, mapId = info[2], info[3], info[12]
            if tier == seasonTier and AW.SafeCall(EJ_GetCurrentTier) == tier
                and AW.IsNumber(mapId) and mapId > 0 then
                table.insert(currentSeasonRaidIds, mapId)
            end
            if AW.IsNumber(mapId) and mapId > 0 and AW.IsString(name) and not seen[mapId] then
                seen[mapId] = true
                AW.Call(EJ_SelectInstance, journalInstanceId)
                local raid = {id = mapId, name = name, difficulties = {}, bosses = {}}
                for difficulty = 1, 250 do
                    local valid = AW.SafeCall(EJ_IsValidInstanceDifficulty, difficulty)
                    local difficultyName = AW.SafeCall(GetDifficultyInfo, difficulty)
                    if valid == true and AW.IsString(difficultyName) then
                        table.insert(raid.difficulties, {id = difficulty, name = difficultyName})
                    end
                end
                for bossIndex = 1, 100 do
                    local boss = AW.Call(EJ_GetEncounterInfoByIndex, bossIndex, journalInstanceId)
                    if not boss or not AW.IsString(boss[2]) then break end
                    -- pcall adds one position: journal ID at 4, dungeon encounter ID at 8, map at 9.
                    local dungeonEncounterId, bossMapId = boss[8], boss[9]
                    if AW.IsNumber(dungeonEncounterId) and dungeonEncounterId > 0 and bossMapId == mapId then
                        table.insert(raid.bosses, {encounterId = dungeonEncounterId, name = boss[2]})
                        AW.encounterMap[mapId .. ":" .. dungeonEncounterId] = {
                            raidId = mapId, encounterId = dungeonEncounterId, journalEncounterId = boss[4],
                            journalInstanceId = journalInstanceId}
                    end
                end
                if #raid.bosses > 0 then table.insert(raids, raid) end
            end
        end
    end
    if oldTier then AW.Call(EJ_SelectTier, oldTier) end
    if oldInstance then AW.Call(EJ_SelectInstance, oldInstance) end
    if oldDifficulty then AW.Call(EJ_SetDifficulty, oldDifficulty) end
    if #raids > 0 then
        AW.db.catalog = {version = AW.db.clientBuild .. ":runtime", raids = raids,
            currentSeasonRaidIds = seasonTier and currentSeasonRaidIds or nil}
        AW.Capability("catalogRuntime", "available")
        AW.Capability("currentSeasonCatalog", seasonTier and #currentSeasonRaidIds > 0 and "available" or "unverified")
    else AW.Capability("catalogRuntime", "unverified") end
end

local function merge(capture, fact)
    for index, existing in ipairs(capture.encounters) do
        if existing.raidId == fact.raidId and existing.encounterId == fact.encounterId
            and existing.difficultyId == fact.difficultyId then
            -- A successful observed kill must never be erased by delayed lockout data.
            if existing.killed == true then fact.killed = true end
            capture.encounters[index] = fact; return
        end
    end
    table.insert(capture.encounters, fact)
end

function AW.EncounterEnd(encounterId, name, difficultyId, _, success)
    if success ~= 1 then return end
    local now = AW.SafeCall(GetServerTime)
    local capture = AW.Capture()
    local instance = AW.Call(GetInstanceInfo)
    local mapId = instance and instance[9]
    local mapping = mapId and AW.encounterMap[mapId .. ":" .. tostring(encounterId)]
    if capture and AW.IsNumber(now) and now >= capture.week.start and now < capture.week["end"]
        and mapping and AW.IsNumber(difficultyId) and difficultyId > 0 then
        merge(capture, {raidId = mapping.raidId, encounterId = encounterId, difficultyId = difficultyId,
            killed = true, lootEligible = nil, observedAt = now})
    else
        AW.Observe("UNMAPPED_ENCOUNTER_END", {encounterId = encounterId, name = name,
            reason = "missing verified raid mapping or current snapshot"})
    end
end

function AW.SavedEncounters(capture, now)
    if not AW.instanceInfoReady then return end
    local count = AW.SafeCall(GetNumSavedInstances)
    if not AW.IsNumber(count) then return end
    for index = 1, math.min(count, 1000) do
        local instance = AW.Call(GetSavedInstanceInfo, index)
        -- Require locked, nonextended, raid data resetting at this week's end.
        if instance and instance[6] == true and instance[7] == false and instance[9] == true
            and AW.IsNumber(instance[4]) and math.abs(now + instance[4] - capture.week["end"]) <= 60 then
            local difficultyId, mapId = instance[5], instance[15]
            if AW.IsNumber(mapId) and AW.IsNumber(difficultyId) and difficultyId > 0 then
                -- Saved-instance boss indices and texture IDs are not encounter IDs.
                -- Query mapped DungeonEncounter IDs directly through the client raid-lock API.
                for _, mapping in pairs(AW.encounterMap) do
                    if mapping.raidId == mapId then
                        local killed = AW.SafeCall(C_RaidLocks and C_RaidLocks.IsEncounterComplete,
                            mapId, mapping.encounterId, difficultyId)
                        if type(killed) == "boolean" then
                            merge(capture, {raidId = mapId, encounterId = mapping.encounterId, difficultyId = difficultyId,
                                killed = killed, lootEligible = nil, observedAt = now})
                        end
                    end
                end
            end
        end
    end
end
