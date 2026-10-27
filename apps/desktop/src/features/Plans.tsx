import { useState } from "react";
import {
  currentSeasonRaids,
  BONUS_ROLL_CURRENCY_KEY,
  type BossPlan,
} from "@azeroth-weekly/protocol";
import type { WeekView } from "../../electron/backend/views";
import { Modal } from "../components/Modal";
import { Status, CharacterName } from "../components/common";
import { selectPlannedBosses } from "../domain/progress";
export function PlanList({
  view,
  onDelete,
  onEdit,
}: {
  view: WeekView;
  onDelete: (id: string) => void;
  onEdit: (p: BossPlan) => void;
}) {
  const rows = selectPlannedBosses(
    view.bossPlans,
    view.characters,
    view.week.id,
  );
  if (!rows.length)
    return (
      <div className="empty">
        <span>◇</span>
        <h3>本周还没有 BOSS 计划</h3>
        <p>选择你想挑战的 BOSS，完成情况会在同步后自动更新。</p>
        <small>这里只显示你手动加入计划的 BOSS。</small>
      </div>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>角色</th>
            <th>本周 BOSS 计划</th>
            <th>难度</th>
            <th>击杀进度</th>
            <th>拾取资格</th>
            <th>ROLL 币意向</th>
            <th>实际消耗</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ plan: p, killed, lootEligible }) => {
            const c = view.characters.find((c) => c.identity.guid === p.guid)!;
            const raid = view.catalog.raids.find((r) => r.id === p.raidId);
            const boss = raid?.bosses.find(
              (b) => b.encounterId === p.encounterId,
            );
            const spent = view.currencyEvents.filter(
              (e) =>
                e.guid === p.guid &&
                e.currencyKey === BONUS_ROLL_CURRENCY_KEY &&
                e.raidId === p.raidId &&
                e.encounterId === p.encounterId &&
                e.difficultyId === p.difficultyId &&
                e.kind === "spend" &&
                e.evidence === "confirmed",
            );
            return (
              <tr key={p.id}>
                <td>
                  {c ? (
                    <CharacterName c={c} alias={view.aliases[p.guid]} />
                  ) : (
                    p.guid
                  )}
                </td>
                <td>
                  <strong>{boss?.name ?? `BOSS ${p.encounterId}`}</strong>
                  <small>{raid?.name ?? `团本 ${p.raidId}`}</small>
                  {p.targetItemLink && (
                    <small className="gold">目标：{p.targetItemLink}</small>
                  )}
                </td>
                <td>
                  <span className="difficulty">
                    {raid?.difficulties.find((d) => d.id === p.difficultyId)
                      ?.name ?? p.difficultyId}
                  </span>
                </td>
                <td>
                  <Status value={killed} yes="已击杀" no="未击杀" />
                </td>
                <td>
                  {lootEligible === null ? (
                    <span className="muted">未知</span>
                  ) : (
                    <Status value={lootEligible} yes="可拾取" no="已用" />
                  )}
                </td>
                <td>
                  {p.planBonusRoll ? (
                    <span className="gold">◈ 计划使用</span>
                  ) : (
                    <span className="muted">未计划</span>
                  )}
                </td>
                <td>
                  {spent.length ? (
                    <span>
                      {spent.reduce((n, e) => n + (e.quantity ?? 0), 0)} 枚
                      {spent.map((e) => (
                        <small key={e.id}>{e.rewardLink || "奖励未记录"}</small>
                      ))}
                    </span>
                  ) : (
                    <span className="muted">未记录</span>
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    <button onClick={() => onEdit(p)}>编辑</button>
                    <button
                      className="danger-text"
                      onClick={() => onDelete(p.id)}
                    >
                      移除
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function PlanDialog({
  view,
  onClose,
  onSave,
  editing,
}: {
  view: WeekView;
  onClose: () => void;
  onSave: (p: BossPlan[], edit: boolean) => Promise<boolean>;
  editing?: BossPlan;
}) {
  const selectable = editing
    ? view.catalog.raids.filter((r) => r.id === editing.raidId)
    : currentSeasonRaids(view.catalog);
  const [guids, setGuids] = useState<string[]>(
    editing ? [editing.guid] : view.characters.map((c) => c.identity.guid),
  );
  const [raidId, setRaid] = useState(editing?.raidId ?? selectable[0]?.id ?? 0);
  const raid = selectable.find((r) => r.id === raidId);
  const [difficulty, setDifficulty] = useState(
    editing?.difficultyId ?? raid?.difficulties[0]?.id ?? 15,
  );
  const [bosses, setBosses] = useState<number[]>(
      editing ? [editing.encounterId] : [],
    ),
    [coin, setCoin] = useState(editing?.planBonusRoll ?? false),
    [target, setTarget] = useState(editing?.targetItemLink ?? ""),
    [saving, setSaving] = useState(false);
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return (
    <Modal
      title={editing ? "编辑 BOSS 计划" : "添加 BOSS 计划"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            const plans = guids.flatMap((guid) =>
              bosses.map((encounterId) => ({
                id: editing?.id ?? crypto.randomUUID(),
                guid,
                weekId: view.week.id,
                raidId,
                encounterId,
                difficultyId: difficulty,
                targetItemLink: target.trim() || null,
                planBonusRoll: coin,
              })),
            );
            if (await onSave(plans, !!editing)) onClose();
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="field-label">应用到角色</label>
        <div className="check-grid">
          {view.characters.map((c) => (
            <label key={c.identity.guid} className="check-tile">
              <input
                type="checkbox"
                checked={guids.includes(c.identity.guid)}
                disabled={!!editing}
                onChange={() => setGuids(toggle(guids, c.identity.guid))}
              />
              <span>
                {view.aliases[c.identity.guid] || c.identity.name}
                <small>{c.identity.realm}</small>
              </span>
            </label>
          ))}
        </div>
        {!selectable.length ? (
          <p className="notice">
            当前赛季团本目录尚未采集。请更新 AzerothWeekly 插件，在游戏中输入
            /azweekly catalog，再 /reload 并读取存档。
          </p>
        ) : (
          <>
            <div className="form-grid">
              <label>
                {editing ? "团队副本（已有计划）" : "团队副本（当前赛季）"}
                <select
                  value={raidId}
                  disabled={!!editing}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setRaid(id);
                    setBosses([]);
                    setDifficulty(
                      selectable.find((r) => r.id === id)?.difficulties[0]
                        ?.id ?? 15,
                    );
                  }}
                >
                  {selectable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                难度
                <select
                  value={difficulty}
                  disabled={!!editing}
                  onChange={(e) => setDifficulty(Number(e.target.value))}
                >
                  {raid?.difficulties.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field-label">
              选择本周计划的 BOSS{" "}
              <span className="muted">已选 {bosses.length} 个</span>
            </label>
            <div className="boss-picker">
              {raid?.bosses.map((b, i) => (
                <label
                  className={bosses.includes(b.encounterId) ? "selected" : ""}
                  key={b.encounterId}
                >
                  <input
                    type="checkbox"
                    checked={bosses.includes(b.encounterId)}
                    disabled={!!editing}
                    onChange={() => setBosses(toggle(bosses, b.encounterId))}
                  />
                  <span className="boss-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {b.name}
                </label>
              ))}
            </div>
          </>
        )}
        <label className="field-label">
          目标装备（可选）
          <input
            value={target}
            maxLength={500}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="装备名称或物品链接"
          />
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={coin}
            onChange={(e) => setCoin(e.target.checked)}
          />
          计划在此 BOSS 使用 ROLL 币 <small>仅标记意向，不扣除余额</small>
        </label>
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            disabled={saving || !guids.length || !bosses.length || !raid}
            type="submit"
          >
            {saving
              ? "保存中…"
              : editing
                ? "保存修改"
                : `加入 ${guids.length * bosses.length} 项计划`}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
