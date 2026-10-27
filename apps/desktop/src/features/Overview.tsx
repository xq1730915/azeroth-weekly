import { useState } from "react";
import {
  selectBonusRollBalance,
  type CharacterCapture,
} from "@azeroth-weekly/protocol";
import type { WeekView } from "../../electron/backend/views";
import { CharacterName, dateTime, Progress } from "../components/common";
import {
  evaluateVaultGoal,
  selectPlannedBosses,
  activityName,
} from "../domain/progress";
import { Modal } from "../components/Modal";
export function Overview({
  view,
  onSelect,
  selected,
  onVault,
  onAlias,
}: {
  view: WeekView;
  onSelect: (g: string) => void;
  selected: string;
  onVault: () => void;
  onAlias: (g: string, alias: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [incomplete, setIncomplete] = useState(false),
    [aliasEditing, setAliasEditing] = useState(false),
    [aliasValue, setAliasValue] = useState("");
  const all = selectPlannedBosses(
    view.bossPlans,
    view.characters,
    view.week.id,
  );
  const summaries = view.characters.map((c) => {
    const bosses = all.filter((r) => r.plan.guid === c.identity.guid);
    return {
      c,
      bosses,
      vault: evaluateVaultGoal(c, view.week.id),
      balance: selectBonusRollBalance(c.balances),
    };
  });
  const visible = summaries.filter(
    (s) =>
      (
        s.c.identity.name +
        s.c.identity.realm +
        (view.aliases[s.c.identity.guid] ?? "")
      )
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!incomplete ||
        s.vault.state !== "done" ||
        s.bosses.some((r) => r.killed !== true)),
  );
  const active = view.characters.find((c) => c.identity.guid === selected);
  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>
              角色周进度 <span className="count">{view.characters.length}</span>
            </h2>
            <p>所有角色集中查看，按自己的目标推进</p>
          </div>
          <div className="filters">
            <input
              aria-label="搜索角色"
              placeholder="搜索角色或服务器…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="check-line">
              <input
                type="checkbox"
                checked={incomplete}
                onChange={(e) => setIncomplete(e.target.checked)}
              />
              仅看未达标
            </label>
          </div>
        </header>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>角色 / 服务器</th>
                <th>宏伟宝库目标</th>
                <th>BOSS 周计划</th>
                <th>ROLL 币余额</th>
                <th>最后采集</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map(({ c, bosses, vault, balance }) => (
                <tr
                  key={c.identity.guid}
                  className={selected === c.identity.guid ? "active-row" : ""}
                >
                  <td>
                    <button
                      className="character-button"
                      onClick={() => onSelect(c.identity.guid)}
                    >
                      <CharacterName
                        c={c}
                        alias={view.aliases[c.identity.guid]}
                      />
                    </button>
                  </td>
                  <td>
                    <Progress
                      done={vault.done}
                      total={vault.goal}
                      pending={vault.state === "pending" ? 1 : 0}
                    />
                  </td>
                  <td>
                    <Progress
                      done={bosses.filter((r) => r.killed === true).length}
                      total={bosses.length}
                      pending={bosses.filter((r) => r.killed === null).length}
                    />
                  </td>
                  <td>
                    <span className="coin-number">
                      ◈ {balance?.quantity ?? "—"}
                    </span>
                    <small>
                      {balance?.quantity !== null &&
                      balance?.quantity !== undefined
                        ? dateTime(balance.observedAt)
                        : "ROLL 币待确认"}
                    </small>
                  </td>
                  <td>
                    <span className="muted">{dateTime(c.capturedAt)}</span>
                    <small>
                      {c.week.id === view.week.id ? "当前游戏周" : "本周待同步"}
                    </small>
                  </td>
                  <td>
                    <button
                      className="subtle"
                      onClick={() => onSelect(c.identity.guid)}
                    >
                      查看 →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className="empty compact">没有匹配的角色</div>
          )}
        </div>
      </section>
      {active && (
        <section className="panel vault-panel">
          <header className="panel-head">
            <div>
              <h2>
                {view.aliases[selected] || active.identity.name}{" "}
                <span className="muted">· 宏伟宝库</span>
              </h2>
              <p>任意活动合计解锁 3 格即达标；领奖状态单独记录</p>
            </div>
            <div className="row-actions">
              <button
                onClick={() => {
                  setAliasValue(view.aliases[selected] ?? "");
                  setAliasEditing(true);
                }}
              >
                角色备注
              </button>
              <button onClick={onVault}>查看宝库目标</button>
            </div>
          </header>
          <VaultView c={active} view={view} />
        </section>
      )}
      {aliasEditing && (
        <Modal title="角色显示备注" onClose={() => setAliasEditing(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAlias(selected, aliasValue);
              setAliasEditing(false);
            }}
          >
            <label className="field-label">
              备注（留空恢复角色名）
              <input
                maxLength={80}
                value={aliasValue}
                onChange={(e) => setAliasValue(e.target.value)}
              />
            </label>
            <footer>
              <button type="button" onClick={() => setAliasEditing(false)}>
                取消
              </button>
              <button className="primary" type="submit">
                保存备注
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
function VaultView({ c, view }: { c: CharacterCapture; view: WeekView }) {
  const types = [...new Set(c.vault.slots.map((s) => s.activityType))];
  return (
    <div className="vault-content">
      {c.vault.previousRewardAvailable === true && (
        <div className="notice">上周奖励尚可领取；下方展示本周活动积累。</div>
      )}
      {!types.length ? (
        <div className="empty compact">
          宝库栏位尚未采集，请登录角色并同步。
        </div>
      ) : (
        types.map((type) => (
          <div className="vault-row" key={type}>
            <div className="vault-category">
              <span>{type === 3 ? "♜" : type === 6 ? "✦" : "◇"}</span>
              <strong>{activityName(type)}</strong>
            </div>
            <div className="vault-slots">
              {c.vault.slots
                .filter((s) => s.activityType === type)
                .map((s) => {
                  const current = c.week.id === view.week.id,
                    done =
                      current &&
                      s.progress !== null &&
                      s.threshold > 0 &&
                      s.progress >= s.threshold;
                  return (
                    <div
                      className={"vault-slot " + (done ? "unlocked" : "")}
                      key={s.key}
                    >
                      <div>
                        <span className="slot-icon">{done ? "✓" : "◇"}</span>
                        <small>奖励栏位 {s.index}</small>
                      </div>
                      <strong>
                        {current ? (s.progress ?? "—") : "—"}{" "}
                        <span>/ {s.threshold}</span>
                      </strong>
                      <small>
                        {!current
                          ? "本周待同步"
                          : done
                            ? s.itemLevel
                              ? `${s.itemLevel} 装等奖励`
                              : "已解锁 · 等级待确认"
                            : "继续完成对应活动"}
                      </small>
                    </div>
                  );
                })}
            </div>
          </div>
        ))
      )}
      <p className="footnote">
        采集于 {dateTime(c.capturedAt)} · 计划之外的有效活动也会计入宝库
      </p>
    </div>
  );
}
export function VaultDialog({
  c,
  view,
  onClose,
}: {
  c: CharacterCapture;
  view: WeekView;
  onClose: () => void;
}) {
  const progress = evaluateVaultGoal(c, view.week.id);
  return (
    <Modal
      title={`${view.aliases[c.identity.guid] || c.identity.name}的宝库目标`}
      onClose={onClose}
    >
      <p>
        每周目标：任意活动合计解锁 <strong>3 个格子</strong>。
      </p>
      <p className="muted">
        团队副本、地下城、世界活动的已解锁格子可以合计，例如团本 2 格 + 地下城 1
        格即可达标。每格的次数要求由游戏同步，不限制奖励装等。
      </p>
      <Progress
        done={progress.done}
        total={progress.goal}
        pending={progress.state === "pending" ? 1 : 0}
      />
      {progress.state === "done" && (
        <p className="notice">本周已达标 · 共解锁 {progress.opened} 格</p>
      )}
      {progress.state === "pending" && (
        <p className="notice">部分进度待同步，请登录角色采集后再读取存档。</p>
      )}
      <footer>
        <button className="primary" onClick={onClose}>
          知道了
        </button>
      </footer>
    </Modal>
  );
}
