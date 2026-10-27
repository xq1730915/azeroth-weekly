# 艾泽拉斯周计划

面向魔兽世界国服正式服的 Windows 本地进度工具。四个 WoW 子账号的数据在导入时识别，日常界面统一展示角色。

- 宏伟宝库：每个角色任意活动合计解锁 3 格即达标，查看当周进度。
- 团本：仅从游戏冒险指南当前赛季团本中，按角色和难度手动勾选 BOSS，列表只显示计划项目。
- ROLL 币：按晦暗虚空核心的币种 ID 读取已采集余额，手动补录／更正获取、消耗及 BOSS 奖励；保留原始流水证据。
- 自动读取已选择的插件存档，每周目标复制、历史查看、JSON 备份和 CSV 导出。

## 使用

运行 `release/win-unpacked/艾泽拉斯周计划.exe`。需要保留 win-unpacked 整个目录；也可以使用 release 中的安装程序。

采集插件为 `dist/addon/AzerothWeekly.zip`。详细步骤见 [使用说明](docs/user-guide.md)。界面的“先看看演示”使用独立内存数据，退出演示后回到实际记录。

真实游戏内采集尚待登录角色验证。当前插件将额外拾取事件保留为待核对观察，**不会自动确认某个 BOSS 消耗了几枚币**；可以在账本补录并关联 BOSS 和奖励。

## 开发

使用 Node.js 24 或更新的兼容版本。Windows 运行包自带 Electron 和 Node，使用者无需安装开发工具。

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run smoke
npm.cmd run package:addon
npm.cmd run desktop:build
```

`npm.cmd run dev` 提供浏览器预览，使用明确标注的演示数据；`npm.cmd run desktop:dev` 构建后打开真实桌面程序。

代码分为 `addon/` 游戏采集插件、`packages/protocol/` 数据协议、`apps/desktop/electron/backend/` 本地业务服务和 `apps/desktop/src/` 界面。SavedVariables 仅作为数据解析，不执行导入文件中的 Lua。

当前采用 Electron／TypeScript／node:sqlite。技术修订与验证记录见 [实现报告](docs/implementation-report.md)。
