# 执行修订（2026-10-25）

本文件是 `2026-10-25-wow-weekly-tracker.md` 的实现技术修订。产品规格仍以已确认的 design 文档为准。

1. 桌面外壳使用 Electron，界面仍为 React／TypeScript。本地后端改为 TypeScript，运行在 Electron 主进程，使用 Node 内置 node:sqlite。Rust／Tauri 文件和构建命令由相同职责的 TS 模块和 Electron 命令取代，不安装 Rust、MSVC，不额外引入本地编译依赖。
2. 代码路径统一为 `apps/desktop/electron/`（main.ts、preload.ts、backend/）和 `apps/desktop/src/`（界面），协议为 `packages/protocol/`，插件为 `addon/AzerothWeekly/`。TS 导出接口采用 camelCase。数据协议字段、游戏身份、周周期和计划过滤规则维持不变。
3. 对原计划中 Task 2/3/5/6/7 的 Rust 测试，使用 Vitest 测试对应 TS 本地服务，测试行为和隔离要求不变。Electron renderer 禁用 Node、启用 contextIsolation 和 sandbox；只暴露具体业务 IPC，不提供任意文件或 SQL 入口。
4. IPC、数据模型、业务服务通过共享类型连接。每个任务的 brief 会携带当前已实际实现的邻接接口。测试仅验证有业务意义的风险，不增加镜像实现的测试。
5. 游戏目录只读，应用本身不在开发期间安装到游戏目录。真实游戏需要人工登录并执行活动，不能声称自动测试覆盖了真实采集。产物必须包括插件包与能启动的桌面程序。
6. 当前工作区是独立的新项目目录，无原有应用或主分支代码需要隔离；直接创建 `feature/wow-weekly` 初始分支，不另外创建 worktree。自动提交使用仅本仓库的 `Codex <codex@localhost>` 作者身份，不模拟用户身份，不修改全局 Git 设置。
7. 主控按任务顺序派发实现子代理，完成后派发只读审查。主控只修改文档和流程记录，功能修复交回实现者。

技术代价：Electron 包含浏览器运行时，安装包比原建议的 Tauri 方案大；其余变化主要为实现语言和构建工具，不改变用户数据格式与流程。

执行结果补充：Task 1 之后子代理服务返回硬额度限制，后续任务由当前会话完成并保留回归证据；后续独立复审未完成。自动刷新采用约 8 秒轮询选定来源，而非依赖文件系统监听。最终交付、取舍代价和真实游戏验证范围见 `docs/implementation-report.md`。
