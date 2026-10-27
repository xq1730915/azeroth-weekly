# 艾泽拉斯周计划 Implementation Plan

> 执行技术修订见 [执行修订](2026-10-25-execution-decisions.md)：当前实际采用 Electron／TypeScript 本地后端，保留本文的数据契约与业务要求；原 Rust／Tauri 路径按该文件映射。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Windows 上交付能合并四个子账号角色、同步宏伟宝库、匹配手动 BOSS 周计划并记录额外拾取币的软件和游戏插件。

**Architecture:** Lua 插件产出带版本和证据的 SavedVariables 数据。Tauri 的 Rust 后端负责解析、去重、事务写入 SQLite，React 界面统一展示角色；计划和采集事实独立保存。先交付可独立使用的采集与诊断插件，再接入本地软件。

**Tech Stack:** Tauri 2、Rust、SQLite／rusqlite、React、TypeScript、Vite、Vitest、Testing Library、Lua；依赖在执行时选择兼容稳定版本并提交锁文件。

**Spec:** `docs/superpowers/specs/2026-10-25-wow-weekly-tracker-design.md`

## Global Constraints

- 四个子账号只影响导入和数据归属。正常业务页面统一展示角色，不分组、不筛选、不标注子账号。
- 团本周计划由用户手动选择角色、团本、难度和 BOSS。同步不能添加计划，也不能自动展开完整 BOSS 列表。
- 团本页面只显示当前所选周的计划 BOSS。用于添加计划的选择器可以显示对应版本的完整 BOSS 目录。
- 宏伟宝库按游戏实际有效活动统计，包括计划之外的活动。
- ROLL 币指额外拾取币，不是需求／贪婪投骰。记录余额、获取、消耗、关联活动和获得的奖励。
- 同步数据必须显示实际采集时间。未知、过期和零进度是不同状态。
- 正常业务页面使用中文，时间按 Asia/Shanghai 显示；游戏周依据采集到的重置时点。
- 禁止执行导入文件中的 Lua；导入失败不能清空最后成功的数据。
- 采集能力未经过国服真实样本验证的项目，必须标注“未验证”，不能宣称已实现真实同步。
- 不为编译或测试改动现有游戏目录；插件先输出到工作区，由软件安装入口或用户安装。

## 已读取的本机条件

- 工作区：`C:\Users\TCXQ\Desktop\魔兽世界进度`；当前只有已完成的设计文档，无现有应用代码。
- 游戏候选目录：`D:\World of Warcraft\_retail_`。其 `WTF\Account` 下实际发现 5 个目录，不能默认全部导入，也不能推断其中哪四个属于当前使用的子账号。
- Node.js、npm 和 Git 可在 PATH 中找到。Rust 的 cargo／rustc 未在 PATH 中找到；执行前还需检查用户 `.cargo\bin` 和 MSVC。
- 当前工作区不是 Git 仓库，未发现全局 Git 用户身份。可以初始化本地仓库，但不伪造用户提交身份。身份未配置时保留变更并报告未提交，不能因此阻断实现。

## 文件职责

```text
packages/protocol/src/types.ts               数据协议和 IPC 类型
packages/protocol/src/validate.ts            运行时协议校验
packages/protocol/tests/protocol.test.ts     协议兼容与证据校验
packages/protocol/fixtures/sample.ts         具名测试工厂，不含真实账号资料
addon/AzerothWeekly/AzerothWeekly.toc         插件元数据与文件加载顺序
addon/AzerothWeekly/Core.lua                 生命周期、持久 ID、采集调度
addon/AzerothWeekly/Capture.lua              身份、宝库、游戏周快照
addon/AzerothWeekly/Encounters.lua           首领目录、击杀和拾取资格
addon/AzerothWeekly/Currency.lua             币余额、候选事件和已确认流水
addon/AzerothWeekly/Diagnostics.lua          能力报告及 /azweekly 命令
apps/desktop/src-tauri/src/import/lexer.rs   SavedVariables 词法分析
apps/desktop/src-tauri/src/import/parser.rs  数据子集解析，不执行 Lua
apps/desktop/src-tauri/src/import/ingest.rs   批次校验、身份合并和去重
apps/desktop/src-tauri/src/import/sources.rs 授权来源发现与稳定读取
apps/desktop/src-tauri/src/db/schema.sql     数据约束和初始迁移
apps/desktop/src-tauri/src/db/mod.rs         连接、迁移和事务
apps/desktop/src-tauri/src/plans.rs          BOSS／宝库目标增删与复制
apps/desktop/src-tauri/src/ledger.rs         币账本、人工补录和核对
apps/desktop/src-tauri/src/weeks.rs          游戏周归属和周期选择
apps/desktop/src-tauri/src/backup.rs         全量备份恢复与账本 CSV 导出
apps/desktop/src-tauri/src/commands.rs       可枚举的业务 IPC 命令
apps/desktop/src/domain/progress.ts          无副作用的展示进度计算
apps/desktop/src/domain/progress.test.ts     计划过滤、宝库状态和未知状态
apps/desktop/src/features/overview/          角色总览及角色详情
apps/desktop/src/features/plans/             BOSS 选择器与手动周计划
apps/desktop/src/features/vault/             宝库栏位及目标编辑
apps/desktop/src/features/ledger/            余额和流水界面
apps/desktop/src/features/import/            来源选择、导入诊断
apps/desktop/src/features/history/           周切换与归档查看
apps/desktop/src/styles.css                  统一视觉样式和响应式布局
apps/desktop/src/api.ts                     IPC 唯一入口和测试替身接口
tests/fixtures/                              合成 Lua 文件和损坏数据
docs/testing/real-client-checklist.md         国服客户端实测记录
docs/user-guide.md                           安装、导入和日常使用
scripts/package-addon.ps1                    插件压缩包和版本一致性检查
README.md                                   启动、验证、构建说明
```

文件超过约 400 行且包含多个职责时，按目录中的子模块拆分。业务事实和 UI 代码不得挤进单个入口文件。

## 共享数据契约

任务 1 定义以下类型，后续任务使用相同字段，不自行改名。所有时间为 Unix 秒，缺失值使用 null。游戏周为半开区间 `[start, end)`。

```ts
export type Evidence = 'confirmed' | 'pending';
export type Availability = 'available' | 'unavailable' | 'unverified';
export interface CharacterIdentity {
  region: 'CN'; branch: 'retail'; guid: string;
  name: string; realm: string; classId: number | null;
}
export interface GameWeek {
  id: string; start: number; end: number; confirmed: boolean;
}
export interface VaultSlot {
  key: string; activityType: number; index: number;
  progress: number | null; threshold: number;
  itemLevel: number | null;
}
export interface EncounterFact {
  raidId: number; encounterId: number; difficultyId: number;
  killed: boolean | null; lootEligible: boolean | null;
  observedAt: number;
}
export interface CurrencyBalance {
  currencyKey: string; seasonId: string;
  quantity: number | null; observedAt: number;
}
export interface CurrencyEvent {
  id: string; guid: string; at: number; currencyKey: string;
  seasonId: string; kind: 'gain' | 'spend' | 'adjustment';
  quantity: number | null; provenance: 'game' | 'manual';
  evidence: Evidence; activity: 'raid' | 'dungeon' | 'delve' | 'other';
  raidId: number | null; encounterId: number | null;
  difficultyId: number | null; specId: number | null;
  rewardLink: string | null; itemLevel: number | null;
  note: string;
}
export interface CharacterCapture {
  identity: CharacterIdentity; capturedAt: number; week: GameWeek;
  vault: { slots: VaultSlot[]; previousRewardAvailable: boolean | null };
  encounters: EncounterFact[]; balances: CurrencyBalance[];
}
export interface CaptureEnvelope {
  schemaVersion: 1; installationId: string; sequence: number;
  clientBuild: string; addonVersion: string;
  capabilities: Record<string, Availability>;
  characters: Record<string, CharacterCapture>;
  events: Record<string, CurrencyEvent>;
}
export interface BossPlan {
  id: string; guid: string; weekId: string; raidId: number;
  encounterId: number; difficultyId: number;
  targetItemLink: string | null; planBonusRoll: boolean;
}
export interface VaultTarget {
  id: string; guid: string; weekId: string;
  slotKey: string; minimumItemLevel: number | null;
}
export interface ImportReport {
  charactersUpdated: number; eventsAdded: number;
  duplicateEvents: number; pendingEvents: number;
}
```

Catalog 使用独立协议扩展：`RaidCatalog {version: string; raids: {id: number; name: string; difficulties: {id: number; name: string}[]; bosses: {encounterId: number; name: string}[]}[]}`。副本实例 ID、首领战 ID 和地下城手册条目 ID 使用显式映射，不能将不同 ID 空间直接当作相同首领。

运行时校验要求：GUID 非空、characters 键等于 identity.guid、币事件键等于 event.id、事件角色已知、周起点小于终点、所有数值有限、confirmed 事件的 quantity 不得为 null，gain／spend 数量必须大于零，adjustment 允许带符号。不能识别的 schemaVersion 拒绝导入。

### Task 1：建立协议与可独立使用的游戏采集插件

**Files:** 创建 `package.json`、`package-lock.json`、`tsconfig.json`、`packages/protocol/`、`addon/AzerothWeekly/`、`docs/testing/real-client-checklist.md`。

**Interfaces:** `validateEnvelope(value: unknown): CaptureEnvelope`；`createEnvelope(overrides?: Partial<CaptureEnvelope>): CaptureEnvelope` 测试工厂；游戏端保存全局变量 `AzerothWeeklyDB`。协议 workspace 包名固定为 `@azeroth-weekly/protocol`，入口导出 types、validate，并为测试导出 `@azeroth-weekly/protocol/fixtures`，由 Vite／Vitest 解析到 `packages/protocol/fixtures/sample.ts`。插件诊断命令 `/azweekly` 显示版本、角色 GUID、采集时间、重置时点和能力状态。

- [ ] **Step 1：创建最小 npm workspace 和协议测试。** 根脚本 `test:protocol` 执行 Vitest 的协议测试；`test` 使用 `vitest run`。测试工厂默认生成角色 `Player-TEST-1`、周 `cn-test-week`（start=100,end=200）、capturedAt=150、空 encounters／balances／events，以及 schemaVersion=1；不使用真实角色或 BOSS 名称。

```ts
import { expect, it } from 'vitest';
import { validateEnvelope } from '../src/validate';
import { createEnvelope } from '../fixtures/sample';
it('拒绝无法识别的协议版本', () => {
  const value = { ...createEnvelope(), schemaVersion: 2 };
  expect(() => validateEnvelope(value)).toThrow(/version/i);
});
it('保留未采集的状态而不是转换成零', () => {
  const value = createEnvelope();
  value.characters['Player-TEST-1'].vault.slots = [{
    key: 'raid:1', activityType: 1, index: 1,
    progress: null, threshold: 2, itemLevel: null,
  }];
  expect(validateEnvelope(value).characters['Player-TEST-1']
    .vault.slots[0].progress).toBeNull();
});
```

- [ ] **Step 2：运行 `npm.cmd run test:protocol`，确认缺少实现导致失败。** 然后实现共享类型和逐字段校验，错误必须包含字段路径；补充无穷值、无身份和 confirmed 消耗缺数量的拒绝测试。
- [ ] **Step 3：实现插件的初始化、重载和快照采集。** `.toc` 声明 `## SavedVariables: AzerothWeeklyDB`，按 Core、Capture、Encounters、Currency、Diagnostics 顺序加载。Interface 值从实际安装客户端或已有适配该客户端的插件确认，不写推测的未来版本号。

```lua
local function safeCall(fn, ...)
  if type(fn) ~= "function" then return nil, "unavailable" end
  local ok, value = pcall(fn, ...)
  if not ok then return nil, "unavailable" end
  return value, "available"
end
-- 捕获结果为 nil 时保持未知，不能返回 0 代替失败。
local activities, vaultStatus = safeCall(
  C_WeeklyRewards and C_WeeklyRewards.GetActivities)
local seconds, resetStatus = safeCall(
  C_DateAndTime and C_DateAndTime.GetSecondsUntilWeeklyReset)
```

在 ADDON_LOADED 后初始化持久数据；PLAYER_LOGIN、PLAYER_LOGOUT、WEEKLY_REWARDS_UPDATE 和成功的 ENCOUNTER_END 触发相应采集，更新事件合并到 1 秒调度避免频繁重采。周起点优先取客户端重置起点接口，不能单凭 end 减固定 7 天处理维护调整；接口不可用时使用有标注的推算值。

持久 installationId 由首次初始化时的角色 GUID、服务器时间和随机后缀生成后保存；sequence 单调递增，事件 ID=`installationId:sequence`。加载已有变量不得重新生成 ID。按 GUID 保存多个角色。

Encounters 使用成功击杀事件及可靠的当周实例信息；未知拾取资格保留 null。目录从客户端地下城手册接口读取并显式映射 ID；在客户端真实目录未采集前，选择器显示“请先采集团本目录”，不能用示例 BOSS 填充正式目录。

Currency 针对实测到的币种和当前版本读取余额。调查 BONUS_ROLL_* 等事件，但“接口文档存在”不等于当前额外拾取一定触发。缺少可靠关联的数据只保存诊断候选，不生成 confirmed 消耗。普通战利品事件不能单独作为额外拾取依据。

- [ ] **Step 4：验证协议与插件产物。** 运行 `npm.cmd run test:protocol`。真实客户端清单必须分别记录宝库栏位、重置时点、两个角色跨登录保存、币余额和一次额外拾取的事件证据；无法登录游戏时将清单记为“未执行”，继续可独立验证的桌面开发。
- [ ] **Step 5：记录提交点。** 有仓库和真实 Git 身份时提交 `feat: add versioned capture addon and protocol`；否则保留文件和验证记录。

### Task 2：实现安全解析、四来源导入和 SQLite 存储

**Files:** 创建 Tauri 应用配置、`db/schema.sql`、`db/mod.rs`、`import/{mod,lexer,parser,ingest,sources}.rs`、`src-tauri/tests/import_pipeline.rs` 和 `tests/fixtures/`。

**Interfaces:** `parse_saved_variables(input: &str) -> Result<serde_json::Value, ImportError>`；`ingest(conn: &mut rusqlite::Connection, source_id: &str, envelope: &serde_json::Value) -> Result<ImportReport, ImportError>`；`discover_sources(retail_root: &std::path::Path) -> Result<Vec<SourceCandidate>, ImportError>`。`SourceCandidate {id: String, label: String, file: PathBuf, selected: bool}`；ImportReport 的 Rust 字段用 serde camelCase 对应共享类型。

本任务在 `src-tauri/src/error.rs` 定义共享错误 `AppError {Io, Parse, Limit, Version, Validation, Database}`，每个变体携带可展示的短错误说明，并实现标准 Error；`ImportError` 是 AppError 的类型别名。创建 `src-tauri/src/contracts.rs`，按共享数据契约定义 Rust 对应结构，统一使用 `#[serde(rename_all = "camelCase")]`，可空数量映射为 `Option<i64>`，所有后续 Rust 模块从此处引用，禁止重复定义不兼容的 DTO。crate 名固定为 `azeroth_weekly_lib`。

- [ ] **Step 1：准备 Rust／MSVC／WebView2 构建环境并创建 Tauri 2 外壳。** 先检查 `$env:USERPROFILE\.cargo\bin` 和 Visual Studio 的 C++ 工具链；按照 Tauri 官方 prerequisites 安装缺失的开发组件，不更改用户其他项目的全局配置。若安装必须人工操作，先完成前端与协议可运行部分，报告具体缺失组件，不能宣称桌面包已构建。
- [ ] **Step 2：编写失败的安全解析及重复导入测试。** 数据文件初始测试样本使用 `AzerothWeeklyDB = { ["schemaVersion"] = 1 }`。解析器只允许顶层指定变量赋值与数据表：字符串、有限数字、布尔、nil、键值表、列表和注释。函数、调用、算术、require、额外顶层赋值全部拒绝。最大 16 MiB、深度 32、字符串 1 MiB；错误中不输出整个文件内容。

```rust
use azeroth_weekly_lib::import::parser::parse_saved_variables;
#[test]
fn rejects_executable_lua() {
    assert!(parse_saved_variables(
        "AzerothWeeklyDB = {}; os.execute('unsafe')"
    ).is_err());
}
#[test]
fn accepts_saved_variables_data() {
    let value = parse_saved_variables(
        "AzerothWeeklyDB = { [\"schemaVersion\"] = 1 }"
    ).unwrap();
    assert_eq!(value["schemaVersion"], 1);
}
```

运行 `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test import_pipeline`，确认缺少解析器时失败。

- [ ] **Step 3：实现解析与迁移。** 使用 rusqlite 事务；开启外键。建表覆盖 spec 第 5 节记录。characters 对 `(region,branch,guid)` 唯一；boss_plans 对 `(guid,week_id,raid_id,encounter_id,difficulty_id)` 唯一；currency_events 对协议事件 ID 唯一。身份缺失进入独立 pending_imports 表，不创建虚假 GUID。快照仅在采集时间更新时替换，旧文件中未见过的明确事件仍可追加。import_sources 与 character_sources 负责来源追踪，不将来源写入角色显示名称。
- [ ] **Step 4：补充四来源合并、旧快照、重复事件和事务回滚测试。** 导入同一角色到两个来源应只有一个角色；相同事件两次导入第二次新增数为 0；先新后旧导入不回退 capturedAt；混入非法事件的一批导入全部回滚。使用内存 SQLite，不写入真实游戏数据。运行上述 cargo test 至通过。
- [ ] **Step 5：记录提交点 `feat: add safe multi-source import and storage`。** 代码不能依赖已安装的游戏来通过这些测试。

### Task 3：实现游戏周、手动计划和准确的进度视图

**Files:** 创建 Rust `plans.rs`、`weeks.rs`；前端 `domain/progress.ts`、`domain/progress.test.ts`；Rust `tests/plans.rs`。

**Interfaces:** `add_boss_plans(conn, plans: Vec<BossPlan>) -> Result<BatchPlanResult, AppError>`；`copy_boss_plans(conn, from_week: &str, to_week: &str, guids: &[String]) -> Result<BatchPlanResult, AppError>`；`BatchPlanResult {added: usize, skipped: usize}`。TS：`selectPlannedBosses(plans: BossPlan[], captures: CharacterCapture[], weekId: string): PlannedBossRow[]`；`evaluateVault(target: VaultTarget, capture: CharacterCapture | null, weekId: string): 'done' | 'incomplete' | 'pending'`。`PlannedBossRow` 包含 `plan`、`killed: boolean|null`、`lootEligible: boolean|null`。

- [ ] **Step 1：编写并运行计划过滤的失败测试。** 为 fixture 中角色加入 BOSS 10 与 20 的击杀事实，但只设置 BOSS 10 计划。

```ts
import { expect, it } from 'vitest';
import { createEnvelope } from '@azeroth-weekly/protocol/fixtures';
import { selectPlannedBosses } from './progress';
it('采集到的额外 BOSS 不加入计划列表', () => {
  const c = createEnvelope().characters['Player-TEST-1'];
  c.encounters = [10, 20].map(encounterId => ({
    raidId: 1, encounterId, difficultyId: 15,
    killed: true, lootEligible: null, observedAt: 150,
  }));
  const plans = [{id:'p1',guid:c.identity.guid,weekId:c.week.id,
    raidId:1,encounterId:10,difficultyId:15,
    targetItemLink:null,planBonusRoll:false}];
  const rows = selectPlannedBosses(plans, [c], c.week.id);
  expect(rows.map(row => row.plan.encounterId)).toEqual([10]);
});
```

- [ ] **Step 2：实现计划驱动的匹配。** 以 plans 为遍历入口，按 guid、weekId、raidId、encounterId、difficultyId 匹配事实。没有当周 capture 时返回 null，而非 false。添加计划后即时匹配已存在的当周事实；删除只删除计划表记录。

```ts
export function evaluateVault(target: VaultTarget,
  capture: CharacterCapture | null, weekId: string):
  'done' | 'incomplete' | 'pending' {
  if (!capture || capture.week.id !== weekId) return 'pending' as const;
  const slot = capture.vault.slots.find(s => s.key === target.slotKey);
  if (!slot || slot.progress === null) return 'pending' as const;
  if (slot.progress < slot.threshold) return 'incomplete' as const;
  if (target.minimumItemLevel === null) return 'done' as const;
  if (slot.itemLevel === null) return 'pending' as const;
  return slot.itemLevel >= target.minimumItemLevel ? 'done' : 'incomplete';
}
```

- [ ] **Step 3：实现批量新增、编辑、删除与复制。** 事务插入、唯一冲突记 skipped；复制重新生成计划 ID 并更换 weekId，仅保留目标装备与用币意向。币流水表不引用计划表做级联删除。周切换使用最新确认重置时点，离线推算返回 confirmed=false；按历史周加载该周快照，不拿最新周事实填充旧周。
- [ ] **Step 4：验证不同难度、旧周待同步、删除保留流水和复制不带状态。** `npm.cmd test -- apps/desktop/src/domain/progress.test.ts` 与 `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test plans` 均通过。宝库测试额外覆盖上一周待领奖=true但本周未达标的情况。
- [ ] **Step 5：记录提交点 `feat: add manual weekly plans and progress matching`。**

### Task 4：完成统一角色界面、宝库和 BOSS 编辑交互

**Files:** 创建 `src/{App.tsx,api.ts,styles.css}`、`features/{overview,plans,vault}/` 组件和各自的 `.test.tsx`；添加根 `index.html`、Vite／React 配置、Tauri capability 最小权限配置。

**Interfaces:** `AppApi {loadWeek(weekId: string): Promise<WeekView>; saveBossPlans(plans: BossPlan[]): Promise<BatchPlanResult>; deleteBossPlan(id: string): Promise<void>; saveVaultTargets(targets: VaultTarget[]): Promise<void>; loadCatalog(): Promise<RaidCatalog>}`。`WeekView {week: GameWeek; characters: CharacterCapture[]; bossPlans: BossPlan[]; vaultTargets: VaultTarget[]; currencyEvents: CurrencyEvent[]; aliases: Record<string,string>}`。Rust commands 对应相同名字的 snake_case 命令。

- [ ] **Step 1：建立组件测试，验证空计划不会出现采集到的 BOSS。** 测试以 `AppApi` 注入合成 WeekView，包含两个角色，来源映射不传入 WeekView。使用 Testing Library `queryByText` 验证未计划的 BOSS 不存在，点击“添加 BOSS 计划”后目录可以出现。

```tsx
const api = createTestApi({ bossPlans: [] });
render(<App api={api} />);
expect(await screen.findByText('本周还没有 BOSS 计划')).toBeVisible();
expect(screen.queryByRole('columnheader', {name:'子账号'})).toBeNull();
await userEvent.click(screen.getByRole('button', {name:'添加 BOSS 计划'}));
expect(await screen.findByRole('dialog', {name:'添加 BOSS 计划'})).toBeVisible();
```

`createTestApi(overrides: Partial<WeekView>): AppApi` 定义于 `src/test/createTestApi.ts`，保存操作更新内存 WeekView；该替身只在测试中加载。

- [ ] **Step 2：实现总览、角色详情和目标编辑。** 左侧导航为总览、团本计划、币账本、历史、同步设置；角色行不带子账号标签。提供角色搜索、只看未达标和按角色排序。宝库按采集类别渲染，编辑目标支持栏位和可选最低装等。表格横向滚动与 sticky 角色列适配窄窗口。
- [ ] **Step 3：实现 BOSS 选择器及批量编辑。** 使用目录选择团本和难度；勾选 BOSS 与角色后保存；列表只读取 `selectPlannedBosses` 输出。弹窗支持键盘导航、Esc 关闭、焦点回到触发按钮；所有表单控件有可访问名称。非游戏名称展示备注优先，始终保留服务器信息。
- [ ] **Step 4：运行 `npm.cmd test -- apps/desktop/src/features` 和 `npm.cmd run build`。** 检查无角色、无目标、目录未采集、加载失败、部分待同步四种业务状态；用本地预览查看密集表格与弹窗。合成数据仅在明确标注“演示数据”的预览或测试入口出现，不伪装成游戏同步结果。
- [ ] **Step 5：记录提交点 `feat: add unified character planning interface`。**

### Task 5：实现 ROLL 币账本和人工核对

**Files:** 创建 `ledger.rs`、`tests/ledger.rs`、`features/ledger/{LedgerPage,LedgerForm,LedgerPage.test}.tsx`。

**Interfaces:** `list_ledger(conn: &rusqlite::Connection, guid: &str, week_id: &str) -> Result<LedgerView, AppError>`；`record_manual_event(conn: &mut rusqlite::Connection, event: CurrencyEvent) -> Result<(), AppError>`；`LedgerView {balance: Option<CurrencyBalance>, events: Vec<CurrencyEvent>, recorded_gain: i64, recorded_spend: i64, pending_count: usize, coverage_start: Option<i64>}`。前端增加同名 TS LedgerView，字段使用 camelCase，Option 对应 null。`recordManualEvent(event: CurrencyEvent): Promise<void>` 和 `loadLedger(guid: string, weekId: string): Promise<LedgerView>` 添加到 AppApi。

- [ ] **Step 1：编写余额不是流水的失败测试。** `seed_balance` 和 `load` 是测试辅助函数，在 `tests/ledger.rs` 内分别调用迁移和 ledger 接口，不作为生产 API。

```rust
#[test]
fn initial_balance_does_not_invent_history() {
    let mut conn = test_db();
    seed_balance(&mut conn, "Player-TEST-1", 3);
    let view = list_ledger(&conn, "Player-TEST-1", "cn-test-week").unwrap();
    assert_eq!(view.balance.unwrap().quantity, Some(3));
    assert!(view.events.is_empty());
    assert_eq!(view.recorded_gain, 0);
    assert_eq!(view.recorded_spend, 0);
}
```

- [ ] **Step 2：实现已确认、待核对、手动三种显示。** 获取和消耗统计仅合计证据确认且数量已知的事件；pending 单独计数。手动记录 provenance=manual，不能覆盖同步余额；无同步余额时允许单独维护手动基准并明确标识。余额差异作为待核对项，不自动生成已确认流水。
- [ ] **Step 3：实现明细与纠正。** 必填角色、时间、币种、数量和获取／消耗方向；BOSS 消耗通过目录选择团本／难度／BOSS，不要求其已加入计划。奖励链接可空，显示“未记录”。手动事件用独立 UUID，自动事件的修正存独立覆盖记录，保留原始证据，不删除游戏记录。
- [ ] **Step 4：验证账本跨周余额、历史覆盖和计划外消费。** `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test ledger` 以及账本组件测试通过。确认删除 BOSS 计划后流水可查询；无法关联的消费不会自动显示到最近击杀的 BOSS。
- [ ] **Step 5：记录提交点 `feat: add bonus currency ledger and reconciliation`。**

### Task 6：接通来源选择、文件监听和增量刷新

**Files:** 完成 `import/sources.rs`，创建 `watcher.rs`、`tests/sources.rs`、`features/import/`，在 `commands.rs` 注册 IPC。

**Interfaces:** `choose_game_root` 返回 UI 显式选择的路径授权 ID；`list_sources(root_id: &str) -> Vec<SourceCandidate>`；`select_sources(ids: Vec<String>) -> Result<(), AppError>`；`import_now() -> Result<Vec<SourceImportResult>, AppError>`。`SourceImportResult {sourceId: string; status:'ok'|'unchanged'|'error'; report:ImportReport|null; message:string}`；`sync_updated` 事件只发送业务刷新通知和导入摘要。

- [ ] **Step 1：用临时目录编写来源测试。** 创建 5 个目录，其中 4 个选择导入、1 个不选择；只读取已选来源下的 `SavedVariables/AzerothWeekly.lua`。测试符号链接逃逸被拒绝，文件缺失不会清空角色。

```rust
#[test]
fn unselected_source_cannot_be_read() {
    let sandbox = source_sandbox(5);
    let selected = sandbox.sources[..4].iter().map(|s| s.id.clone()).collect();
    sandbox.select(selected);
    let results = sandbox.import_now().unwrap();
    assert_eq!(results.len(), 4);
    assert!(!results.iter().any(|r| r.source_id == sandbox.sources[4].id));
}
```

`source_sandbox(count)` 在测试文件内构建临时目录和数据库，并封装调用生产来源接口；测试不读取 D 盘真实账号目录。

- [ ] **Step 2：实现目录授权与选择。** 本机发现的 5 个目录默认不全选；界面说明只选择实际使用来源。路径 canonicalize 后必须位于授权根内；下次启动使用已保存的选择。导入诊断允许显示来源目录，其他页面不能获取这些字段。
- [ ] **Step 3：实现稳定读取和监听。** 文件变化去抖 500ms，分两次检查长度与修改时间，间隔 250ms；最多重试 3 次。复制到内存再解析，解析成功才提交事务。每个来源串行导入，来源之间按队列处理，避免同一 SQLite 连接并发事务。原文件内容摘要不变时跳过；手动读取同样不伪造 capturedAt。
- [ ] **Step 4：验证损坏文件保留旧数据、重复通知和来源隔离。** 使用 Rust 临时目录测试，随后在用户选择真实来源后只读验证；没有真实插件文件时界面给出安装说明和待采集状态。运行 `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test sources`。
- [ ] **Step 5：记录提交点 `feat: connect selected game sources and file watching`。**

### Task 7：实现周历史、备份恢复和 CSV 导出

**Files:** 创建 `backup.rs`、`tests/backup.rs`、`features/history/` 和备份设置组件；扩展 `weeks.rs` 与 AppApi。

**Interfaces:** `export_backup(conn: &rusqlite::Connection, path: &Path) -> Result<(), AppError>`；`restore_backup(conn: &mut rusqlite::Connection, path: &Path, safety_copy: &Path) -> Result<(), AppError>`；`export_ledger_csv(conn: &rusqlite::Connection, guid: Option<&str>, path: &Path) -> Result<(), AppError>`。文件路径均来自显式保存／打开对话框，不接受 UI 任意拼接路径。

- [ ] **Step 1：编写往返备份测试。** 创建有备注、两周计划、来源映射、余额和待核对事件的数据库，导出 JSON 后恢复到新数据库，比对业务记录数量与字段。恢复前副本必须存在，非法版本恢复不能破坏当前数据库。

```rust
#[test]
fn invalid_backup_keeps_current_database() {
    let mut target = populated_test_db();
    let files = backup_files("{\"backupVersion\":999}");
    let before = business_digest(&target);
    assert!(restore_backup(&mut target, &files.input, &files.safety).is_err());
    assert_eq!(business_digest(&target), before);
}
```

三个测试辅助函数在 `tests/backup.rs` 内定义，使用临时目录、迁移及生产增删接口，不直接修改应用用户库。

- [ ] **Step 2：实现备份。** 备份根字段 `backupVersion=1, exportedAt, tables`，tables 覆盖 schema 的全部业务数据及修正记录。解析校验完成后先保存现库备份，再用单个事务恢复；恢复后来源路径若已失效标记为离线，不自动扫描新位置。第一版恢复替换数据库内容，不合并两个备份。
- [ ] **Step 3：实现历史与 CSV。** 周选择加载对应快照，旧周目标可查看但不在第一版直接编辑已归档游戏事实；允许补录历史流水并标注来源。CSV 用 UTF-8 BOM，按 CSV 规则转义换行和双引号；文本以 `=,+,-,@` 开头时加文本保护，避免在表格软件中执行公式。
- [ ] **Step 4：运行 `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test backup` 与历史组件测试。** 确认周切换不改币余额、只影响当周统计，恢复后角色仍不按子账号分组。
- [ ] **Step 5：记录提交点 `feat: add weekly history and local backups`。**

### Task 8：集成验证、打包与使用说明

**Files:** 创建 `scripts/package-addon.ps1`、`docs/user-guide.md`、`README.md`，完成根 npm 脚本与 `docs/testing/real-client-checklist.md` 的执行记录。

**Interfaces:** 根脚本固定为 `dev`（前端预览）、`desktop:dev`（Tauri）、`build`（TypeScript 与前端生产构建）、`test`（Vitest）、`test:rust`（cargo test）、`desktop:build`（Tauri Windows 构建）、`package:addon`（插件打包）。生成 `dist/addon/AzerothWeekly.zip` 和 Tauri Windows 安装包，输出位置在 README 写明。

- [ ] **Step 1：增加包内容验证。** PowerShell 使用 `Compress-Archive` 打包 staging 目录；压缩包顶层为 `AzerothWeekly/`，且包含 toc 中列出的全部 Lua 文件。目录无真实账号样本、.git、node_modules 和本地数据库。界面、插件和协议版本的对应关系写入构建清单。
- [ ] **Step 2：执行完整自动验证。** 按顺序执行 `npm.cmd test`、`npm.cmd run test:rust`、`npm.cmd run build`、`npm.cmd run package:addon`、`npm.cmd run desktop:build`；记录具体成功输出或阻塞原因。只有环境缺失导致的失败不能写成代码验证通过。
- [ ] **Step 3：进行用户路径集成检查。** 首次启动 → 选择 D 盘安装目录 → 选择实际四个来源 → 安装／读取插件 → 角色统一出现 → 添加指定英雄 BOSS 计划 → 采集一次活动 → 重载后刷新 → 查阅余额及已记录流水 → 复制周计划 → 备份恢复。真实游戏活动无法由开发环境自动完成时，清单保留未执行，并只宣称已通过合成样本验证。
- [ ] **Step 4：编写安装及日常使用说明。** 写清插件放置目录、加载后切换四个子账号采集角色、存档写入时机、如何选择四个来源、计划外 BOSS 不显示、宝库统计仍包含计划外活动、历史流水覆盖起点及不确定事件如何核对。说明本机开发环境要求和用户运行安装包要求的区别。
- [ ] **Step 5：记录提交点 `chore: package desktop app and capture addon`。** 最终交付安装包、插件压缩包、用户说明与真实同步能力清单。没有生成的产物不提供虚构下载链接。

## 自审映射与完成标准

| 规格要求 | 负责步骤 |
| --- | --- |
| 四来源导入、角色统一展示 | Task 2、4、6 |
| 只显示手动计划 BOSS、不同难度分开 | Task 3、4 |
| 宝库栏位与等级目标、上下周分开 | Task 1、3、4 |
| 币余额、获取、消耗、BOSS 和奖励 | Task 1、5 |
| 身份去重、事件去重、事务回滚 | Task 1、2、6 |
| 每周复制、未知状态和历史记录 | Task 3、7 |
| 来源路径隔离、安全数据解析 | Task 2、6 |
| 备份、恢复、CSV 导出 | Task 7 |
| 新赛季目录和规则版本 | Task 1、2、4 |
| 能力验证、失败保留数据、安装包 | Task 1、6、8 |

计划文档不是可运行软件。执行完成的标准是可启动的桌面应用、可安装的采集插件、关键业务测试通过、产物可获取，并准确报告真实客户端验证覆盖情况。

## 技术参考

- Tauri Windows 开发依赖：https://v2.tauri.app/start/prerequisites/
- SQLite：https://www.sqlite.org/about.html
- 客户端 WeeklyRewards API：https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/WeeklyRewardsDocumentation.lua
- 客户端 DateAndTime API：https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/DateAndTimeDocumentation.lua
- 客户端 Loot 事件定义：https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/LootDocumentation.lua
- 客户端 CurrencyInfo API：https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/CurrencyInfoDocumentation.lua
