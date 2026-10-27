import { useCallback, useEffect, useState } from "react";
import {
  selectBonusRollBalance,
  type BossPlan,
} from "@azeroth-weekly/protocol";
import type { AppApi } from "./api";
import type { WeekView } from "../electron/backend/views";
import { createBrowserApi } from "./browserApi";
import { Overview, VaultDialog } from "./features/Overview";
import { PlanList, PlanDialog } from "./features/Plans";
import { Ledger } from "./features/Ledger";
import { Settings } from "./features/Settings";
import { evaluateVaultGoal, selectPlannedBosses } from "./domain/progress";
import { dateTime } from "./components/common";

const defaultApi = window.azerothWeekly ?? createBrowserApi();
const tabs = [
  ["overview", "▦", "角色总览"],
  ["plans", "◇", "团本周计划"],
  ["ledger", "◈", "ROLL 币账本"],
  ["history", "◷", "历史进度"],
  ["settings", "⚙", "同步与备份"],
] as const;
type Tab = (typeof tabs)[number][0];
export default function App({ api = defaultApi }: { api?: AppApi }) {
  const [view, setView] = useState<
      (WeekView & { demoMode: boolean; syncErrorCount?: number }) | null
    >(null),
    [tab, setTab] = useState<Tab>("overview"),
    [weekId, setWeekId] = useState<string | undefined>(),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [planDialog, setPlanDialog] = useState(false),
    [editing, setEditing] = useState<BossPlan | undefined>(),
    [vaultDialog, setVaultDialog] = useState(false);
  const reload = useCallback(async () => {
    const v = await api.loadWeek(weekId);
    setView(v);
    setSelected((g) =>
      v.characters.some((c) => c.identity.guid === g)
        ? g
        : (v.characters[0]?.identity.guid ?? ""),
    );
  }, [api, weekId]);
  useEffect(() => {
    reload().catch((e) => setError(String(e)));
    return api.onSync(() => void reload().catch((e) => setError(String(e))));
  }, [reload, api]);
  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    setToast("");
    try {
      await fn();
      await reload();
      setToast(message);
      return true;
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : String(e)).replace(
          /^Error invoking remote method.*?: Error: /,
          "",
        ),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!view)
    return (
      <div className="loading">
        <span className="brand-mark">✦</span>
        <h1>艾泽拉斯周计划</h1>
        <p>{error || "正在读取本地计划…"}</p>
      </div>
    );
  const planned = selectPlannedBosses(
      view.bossPlans,
      view.characters,
      view.week.id,
    ),
    bossDone = planned.filter((r) => r.killed === true).length;
  const targetResults = view.characters.map((c) =>
    evaluateVaultGoal(c, view.week.id),
  );
  const vaultDone = targetResults.filter((r) => r.state === "done").length,
    rollBalances = view.characters.map((c) =>
      selectBonusRollBalance(c.balances),
    ),
    balance = rollBalances.reduce((n, b) => n + (b?.quantity ?? 0), 0),
    knownBalance = rollBalances.filter(
      (b) => b?.quantity !== null && b?.quantity !== undefined,
    ).length;
  const selectedChar = view.characters.find(
      (c) => c.identity.guid === selected,
    ),
    hasRoles = view.characters.length > 0;
  const title = tabs.find((t) => t[0] === tab)![2],
    current = weekId === undefined || view.weeks[0]?.id === view.week.id;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <div>
            <strong>艾泽拉斯</strong>
            <span>周计划 · WEEKLY</span>
          </div>
        </div>
        <div className="sidebar-section">冒险管理</div>
        <nav>
          {tabs.map(([id, icon, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setToast("");
              }}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
              {id === "plans" && view.bossPlans.length > 0 && (
                <b>{view.bossPlans.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-indicator">
            <i />
            数据保存在本机
          </div>
          <p>国服 · 正式服</p>
          <small>艾泽拉斯周计划 v0.1.2</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            我的冒险 <span>/</span> {title}
          </div>
          <div className="topbar-right">
            {view.demoMode ? (
              <span className="demo-badge">
                演示模式 · 数据不会写入实际记录
              </span>
            ) : (
              <span className="local-indicator">
                <i />
                本地数据
              </span>
            )}
            <span className="region-tag">CN</span>
          </div>
        </header>
        <div className="workspace">
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR WEEK, YOUR PACE</span>
              <h1>{tab === "overview" ? "这一周，目标清晰。" : title}</h1>
              <p>
                {tab === "overview"
                  ? "所有角色的宝库、团本与用币计划，一眼看清。"
                  : tab === "plans"
                    ? "只关注你亲自加入计划的 BOSS。"
                    : tab === "ledger"
                      ? "每一枚币，都有迹可循。"
                      : tab === "history"
                        ? "回看每一周，保留每一次进步。"
                        : "连接游戏进度，妥善保存每周记录。"}
              </p>
            </div>
            <div className="heading-actions">
              <select
                aria-label="选择游戏周"
                value={view.week.id}
                onChange={(e) => setWeekId(e.target.value)}
              >
                {view.weeks.map((w, i) => (
                  <option key={w.id} value={w.id}>
                    {w.id === "pending"
                      ? "等待游戏同步"
                      : `${i === 0 ? "当前周期" : "历史周期"} · ${dateTime(w.start).split(" ")[0]} — ${dateTime(w.end).split(" ")[0]}`}
                  </option>
                ))}
              </select>
              <button
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const r = await api.importNow();
                    if (r.some((x) => x.status === "error"))
                      throw Error(
                        r
                          .filter((x) => x.status === "error")
                          .map((x) => x.message)
                          .join("；"),
                      );
                  }, "已读取最新存档；游戏未保存时数据保持原采集时间")
                }
              >
                ↻ 读取进度
              </button>
            </div>
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
              <button onClick={() => setError("")} aria-label="关闭错误提示">
                ×
              </button>
            </div>
          )}
          {toast && (
            <div role="status" className="toast">
              ✓ {toast}
            </div>
          )}
          {!!view.syncErrorCount && (
            <div className="notice">
              有 {view.syncErrorCount} 个来源读取异常。
              <button className="subtle" onClick={() => setTab("settings")}>
                前往同步与备份查看 →
              </button>
            </div>
          )}
          {view.demoMode && (
            <div className="demo-notice">
              <span>◈ 这是独立的演示数据，可以试用目标设置和手动记账。</span>
              {window.azerothWeekly && (
                <button
                  onClick={() =>
                    act(async () => {
                      await api.demo(false);
                      setWeekId(undefined);
                      setTab("overview");
                    }, "已回到实际数据")
                  }
                >
                  退出演示 →
                </button>
              )}
            </div>
          )}
          {!hasRoles && tab !== "settings" ? (
            <section className="welcome panel">
              <div className="welcome-orbit">
                <span>✦</span>
                <i />
                <b />
              </div>
              <span className="eyebrow">WELCOME, ADVENTURER</span>
              <h2>从你的第一个角色开始</h2>
              <p>
                安装采集插件，选择游戏数据来源，
                <br />
                让四个子账号的角色汇入同一份周计划。
              </p>
              <div className="welcome-actions">
                <button className="primary" onClick={() => setTab("settings")}>
                  配置游戏数据来源 →
                </button>
                <button
                  onClick={() =>
                    act(() => api.demo(true), "已进入独立演示模式")
                  }
                >
                  先看看演示
                </button>
              </div>
              <div className="welcome-steps">
                <span>
                  <b>01</b> 安装插件
                </span>
                <span>
                  <b>02</b> 登录角色并采集
                </span>
                <span>
                  <b>03</b> 设置每周目标
                </span>
              </div>
            </section>
          ) : (
            <>
              {tab !== "settings" && (
                <div className="metric-grid">
                  <Metric
                    label="追踪角色"
                    value={view.characters.length}
                    detail="所有角色统一呈现"
                    icon="▦"
                  />
                  <Metric
                    label="宏伟宝库目标"
                    value={`${vaultDone} / ${view.characters.length} 角色达标`}
                    detail={`任意活动合计开 3 格 · ${targetResults.filter((r) => r.state === "pending").length} 个角色待确认`}
                    icon="▣"
                  />
                  <Metric
                    label="BOSS 周计划"
                    value={`${bossDone} / ${planned.length}`}
                    detail={
                      planned.length
                        ? `${planned.filter((r) => r.killed === null).length} 项待确认`
                        : "只统计手动计划"
                    }
                    icon="◇"
                  />
                  <Metric
                    label="最近采集持币"
                    value={knownBalance ? balance : "—"}
                    detail={`${knownBalance} / ${view.characters.length} 个角色有余额记录`}
                    icon="◈"
                    gold
                  />
                </div>
              )}
              {(tab === "overview" || tab === "history") && (
                <>
                  {tab === "history" && (
                    <div className="notice">
                      通过右上角选择游戏周。历史数据不完整时仍显示待同步；持币余额展示最近采集值及其时间。
                    </div>
                  )}
                  <div className="section-actions">
                    <span className="muted">
                      {view.week.confirmed
                        ? "游戏周时间已采集"
                        : view.demoMode
                          ? "示例周期"
                          : "游戏周时间待确认，请登录角色同步"}
                    </span>
                    <div className="row-actions">
                      <button
                        disabled={!current || busy}
                        onClick={() =>
                          act(
                            () => api.copyPrevious(view.week.id),
                            "已复制上周当前赛季计划，重复项和旧赛季团本会跳过",
                          )
                        }
                      >
                        复制上周目标
                      </button>
                      <button
                        className="primary"
                        disabled={view.week.id === "pending"}
                        onClick={() => {
                          setEditing(undefined);
                          setPlanDialog(true);
                        }}
                      >
                        ＋ 添加 BOSS 计划
                      </button>
                    </div>
                  </div>
                  <Overview
                    view={view}
                    selected={selected}
                    onSelect={setSelected}
                    onVault={() => setVaultDialog(true)}
                    onAlias={(g, a) => {
                      void act(() => api.setAlias(g, a), "角色备注已保存");
                    }}
                  />
                </>
              )}
              {tab === "plans" && (
                <section className="panel">
                  <header className="panel-head">
                    <div>
                      <h2>
                        本周挑战清单{" "}
                        <span className="count">{view.bossPlans.length}</span>
                      </h2>
                      <p>移除计划会保留击杀事实和 ROLL 币流水</p>
                    </div>
                    <button
                      className="primary"
                      disabled={view.week.id === "pending"}
                      onClick={() => {
                        setEditing(undefined);
                        setPlanDialog(true);
                      }}
                    >
                      ＋ 添加 BOSS 计划
                    </button>
                  </header>
                  <PlanList
                    view={view}
                    onDelete={(id) =>
                      void act(
                        () => api.deletePlan(id),
                        "计划已移除，历史记录保留",
                      )
                    }
                    onEdit={(p) => {
                      setEditing(p);
                      setPlanDialog(true);
                    }}
                  />
                </section>
              )}
              {tab === "ledger" && <Ledger api={api} view={view} act={act} />}
            </>
          )}
          {tab === "settings" && <Settings api={api} act={act} />}
          <footer className="app-footer">
            <span>✦ 为你的艾泽拉斯冒险留一份计划</span>
            <span>
              {!view.demoMode && hasRoles && (
                <button
                  onClick={() =>
                    act(() => api.demo(true), "已进入独立演示模式")
                  }
                >
                  查看演示
                </button>
              )}
              数据更新取决于游戏存档时间
            </span>
          </footer>
        </div>
      </main>
      {planDialog && (
        <PlanDialog
          view={view}
          editing={editing}
          onClose={() => setPlanDialog(false)}
          onSave={(p, edit) =>
            act(
              () => (edit ? api.updatePlan(p[0]!) : api.savePlans(p)),
              edit ? "计划已更新" : "BOSS 已加入本周计划",
            )
          }
        />
      )}{" "}
      {vaultDialog && selectedChar && (
        <VaultDialog
          c={selectedChar}
          view={view}
          onClose={() => setVaultDialog(false)}
        />
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  icon,
  gold = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: string;
  gold?: boolean;
}) {
  return (
    <div className={"metric " + (gold ? "gold-metric" : "")}>
      <div>
        <span>{label}</span>
        <b>{icon}</b>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
