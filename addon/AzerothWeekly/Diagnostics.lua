local _, AW = ...
local function output(message)
    if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage("|cff66ccffAzerothWeekly|r " .. message) end
end

SLASH_AZEROTHWEEKLY1 = "/azweekly"
SlashCmdList.AZEROTHWEEKLY = function(message)
    local command, argument = string.match(message or "", "^(%S*)%s*(.-)$")
    if command == "capture" then
        AW.Capture()
    elseif command == "catalog" then
        AW.CaptureCatalog()
    elseif command == "currency" then
        local id = tonumber(argument)
        if id and id > 0 and id % 1 == 0 then
            local info = AW.SafeCall(C_CurrencyInfo and C_CurrencyInfo.GetCurrencyInfo, id)
            output("币种 " .. id .. ": " .. (type(info) == "table" and AW.IsString(info.name) and info.name or "名称未知")
                .. "; 余额 " .. (type(info) == "table" and AW.IsNumber(info.quantity) and tostring(info.quantity) or "待确认"))
            AW.Capture()
        end
    end
    output("版本 " .. AW.version .. "; GUID " .. tostring(AW.SafeCall(UnitGUID, "player")))
    if AW.error then output(AW.error) end
    if not AW.db then output("尚未初始化；请登录 CN 正式服角色。"); return end
    output("客户端 " .. AW.db.clientBuild .. "; sequence " .. AW.db.sequence)
    local guid = AW.SafeCall(UnitGUID, "player")
    local capture = AW.db.characters[guid]
    if capture then
        output("采集时间 " .. capture.capturedAt .. "; 周起点 " .. capture.week.start .. "; 重置 " .. capture.week["end"]
            .. "; " .. (capture.week.confirmed and "客户端确认" or "起点为推算值"))
    else output("尚无可用快照；重置时点或角色身份未知。") end
    if not AW.db.catalog or #AW.db.catalog.raids == 0 then output("请先采集团本目录：/azweekly catalog") end
    for key, value in pairs(AW.db.capabilities) do output(key .. " = " .. value) end
    output("额外拾取记录仅为待确认候选；请人工核对币种、消耗、首领、难度与奖励。")
    output("命令：capture / catalog / currency <币种ID>。请 /reload 或退出游戏后导入 SavedVariables。")
end
