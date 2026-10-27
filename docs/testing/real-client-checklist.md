# CN 正式服真实采集检查

执行状态：**未执行**。开发环境无法代替人工登录和进行游戏活动。Lua VM 使用模拟 API，不能证明当前客户端会触发相同事件。

2026-10-25 只读安装证据：`D:/World of Warcraft/.build.info` 的活动 CN retail 版本为 `12.1.5.70575`。已安装 `AlterEgo/AlterEgo.toc`、`!BetterFriendlist_MenuBridge/!BetterFriendlist_MenuBridge.toc` 均包含 `120105`，本插件据此使用 Interface `120105`。未读取账户内容，未修改游戏目录。

人工安装时将仓库内 `addon/AzerothWeekly` 整个文件夹复制到客户端的 `Interface/AddOns`。登录后执行 `/azweekly`，记录版本、GUID、采集时间、周起止点、能力状态；执行 `/reload` 或退出游戏后，游戏才把 `AzerothWeeklyDB` 写入该账户的 `WTF/Account/<账户>/SavedVariables/AzerothWeekly.lua`。桌面导入器必须只读该文件。

| 检查 | 操作与应保留的证据 | 当前结果 |
| --- | --- | --- |
| 宝库栏位 | 在宝库界面逐项核对活动类型、索引、进度、门槛、奖励装等与上周奖励状态；未返回的数值仍为未知 | 未执行 |
| 周重置 | 对照客户端周重置时刻；优先核实 `GetWeeklyResetStartTime` 和剩余秒数，记录维护调整；缺少起点时 `confirmed=false` | 未执行 |
| 两角色持久化 | 角色 A 登录并重载，角色 B 登录并退出；核对两个 GUID 同时保留、installationId 不变、sequence 递增 | 未执行 |
| 团本目录 | `/azweekly catalog`；核对地图实例 ID、DungeonEncounter ID 与手册 ID 的显式映射；未采集前显示“请先采集团本目录” | 未执行 |
| 击杀与实例锁定 | 成功击杀并等到 UPDATE_INSTANCE_INFO；分别核对难度、当周非延长锁定和 reset；拾取资格不能由击杀推断 | 未执行 |
| 币余额 | 记录币种 ID、客户端本地名称与余额；候选 3513 仅接受“晦暗虚空核心”或“Nebulous Voidcore”，禁止从 3418 读取余额填到 3513；可用 `/azweekly currency <ID>` 采集实测 ID | 未执行 |
| 一次真实额外拾取 | 记录 STARTED / RESULT / FAILED 等实际事件、完整可读参数及 argCount，人工核对消耗币、数量、首领、难度和奖励；保留诊断 observation ID | 未执行 |
| 失败与未知 | API nil、错误或秘密数据不得转成零；不同币名称不得被候选匹配；缺少重置终点应保留原快照及其原时间 | 未执行 |

能力说明：`vaultAPI`、`currencyAPI` 表示函数是否存在；`*Runtime` 表示本次运行是否取得值或收到事件。`bonusRollEventRegistration=available` 只表示可注册事件。`bonusRollRuntime=available` 也只表示收到过事件；`bonusRollAttribution=unverified` 始终保留，直到独立验证完整关联。插件目前只存额外拾取诊断候选，**不会自动生成已确认消耗，也不会自动增加首领计划**。`BONUS_ROLL_RESULT` 的 quantity 是奖励数量，不能当作消耗数量；普通战利品和余额差不能证明某个首领的额外拾取消耗。

币余额使用客户端返回的实际 `currency:<ID>`，赛季暂记字符串 `unverified`；这表示映射未知，不能当作已确认赛季。首次成功候选匹配保留 `CURRENCY_METADATA` 诊断。未识别的新币可以显式采集，后续经过人工确认的币种/赛季映射应独立实现。

SavedVariables 编码约束：Lua 的 nil 字段不会写入，空数组和空字典均写为 `{}`。导入器应先按协议字段补齐 nullable 字段为 null、将明确的数组字段空表转为数组、保留 characters/events/capabilities/payload 为字典，然后调用 `validateEnvelope`。严禁把任意缺失数字补零、把字典误转成数组或直接执行 SavedVariables Lua。`addon/test/capture.test.js` 已模拟序列化并验证此边界，但不替代后续安全 Lua 解析器的测试。

API 依据是 Blizzard 发布客户端 UI/生成文档的公开镜像，访问日期 2026-10-25；这些证明接口形状，不能证明本机实际活动：

- [DateAndTime 生成文档](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/DateAndTimeDocumentation.lua)
- [WeeklyRewards 生成文档](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/WeeklyRewardsDocumentation.lua)
- [CurrencyInfo 生成文档](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/CurrencyInfoDocumentation.lua)
- [Loot 事件生成文档](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/LootDocumentation.lua)
- [RaidLocks 生成文档](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/RaidLocksDocumentation.lua)
- [Blizzard EncounterJournal 显式映射和调用方式](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_EncounterJournal/Mainline/Blizzard_EncounterJournal.lua)
- [Blizzard 额外拾取事件处理](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_UIPanels_Game/Mainline/GroupLootFrame.lua)

候选币种 3513 的公共线索来自 [weekly-alt-tracker 作者数据](https://github.com/Madchristian/weekly-alt-tracker/blob/main/Data.lua)，只用于安排运行时检查；没有复制其实现，也没有据此标记实测成功。
