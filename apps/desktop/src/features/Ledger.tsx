import { useState, useEffect } from "react";
import {
  BONUS_ROLL_CURRENCY_KEY,
  BONUS_ROLL_CURRENCY_NAME,
  type CurrencyEvent,
} from "@azeroth-weekly/protocol";
import type { WeekView } from "../../electron/backend/views";
import type { AppApi, LedgerView } from "../api";
import { dateTime } from "../components/common";
import { Modal } from "../components/Modal";
export function Ledger({
  api,
  view,
  act,
}: {
  api: AppApi;
  view: WeekView;
  act: (fn: () => Promise<unknown>, message: string) => Promise<boolean>;
}) {
  const [guid, setGuid] = useState(view.characters[0]?.identity.guid ?? ""),
    [data, setData] = useState<LedgerView | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<CurrencyEvent | undefined>();
  const load = () => {
    if (guid)
      api
        .getLedger(guid, view.week.id)
        .then(setData)
        .catch((e) => setError(String(e)));
  };
  useEffect(() => {
    setData(null);
    load();
  }, [guid, view]);
  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>ROLL 币账本</h2>
            <p>余额仅统计晦暗虚空核心，流水保留每次获取与使用</p>
          </div>
          <div className="row-actions">
            <select
              aria-label="选择账本角色"
              value={guid}
              onChange={(e) => setGuid(e.target.value)}
            >
              {view.characters.map((c) => (
                <option key={c.identity.guid} value={c.identity.guid}>
                  {view.aliases[c.identity.guid] || c.identity.name} ·{" "}
                  {c.identity.realm}
                </option>
              ))}
            </select>
            <button
              disabled={!guid}
              className="primary"
              onClick={() => {
                setEditing(undefined);
                setOpen(true);
              }}
            >
              ＋ 记录一笔
            </button>
          </div>
        </header>
        {error && <p className="error">{error}</p>}
        {data && (
          <>
            <div className="ledger-metrics">
              <div>
                <small>最近采集余额 · {BONUS_ROLL_CURRENCY_NAME}</small>
                <strong className="gold">
                  ◈ {data.balance?.quantity ?? "—"}
                </strong>
                <small>
                  {data.balance?.quantity !== null &&
                  data.balance?.quantity !== undefined
                    ? dateTime(data.balance.observedAt)
                    : "ROLL 币待确认"}
                </small>
              </div>
              <div>
                <small>本周已记录获取</small>
                <strong className="teal">＋{data.recordedGain}</strong>
              </div>
              <div>
                <small>本周已记录消耗</small>
                <strong>{data.recordedSpend}</strong>
              </div>
              <div>
                <small>待核对记录 / 观察</small>
                <strong>{data.pendingCount + data.observations.length}</strong>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>方向</th>
                    <th>数量</th>
                    <th>来源 / BOSS</th>
                    <th>奖励</th>
                    <th>记录状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => {
                    const raid = view.catalog.raids.find(
                        (r) => r.id === e.raidId,
                      ),
                      boss = raid?.bosses.find(
                        (b) => b.encounterId === e.encounterId,
                      );
                    return (
                      <tr key={e.id}>
                        <td>{dateTime(e.at)}</td>
                        <td>
                          {e.kind === "gain"
                            ? "获取"
                            : e.kind === "spend"
                              ? "消耗"
                              : "调整"}
                        </td>
                        <td className={e.kind === "gain" ? "teal" : "gold"}>
                          {e.quantity ?? "待确认"}
                          {e.currencyKey !== BONUS_ROLL_CURRENCY_KEY && (
                            <small>其他币种 · {e.currencyKey}</small>
                          )}
                        </td>
                        <td>
                          {boss?.name ?? e.note ?? "其他来源"}
                          <small>
                            {raid?.name}
                            {e.difficultyId
                              ? ` · ${raid?.difficulties.find((d) => d.id === e.difficultyId)?.name ?? e.difficultyId}`
                              : ""}
                          </small>
                        </td>
                        <td>
                          {e.rewardLink || "未记录"}
                          {e.itemLevel && <small>{e.itemLevel} 装等</small>}
                        </td>
                        <td>
                          <span className="tag">
                            {e.provenance === "manual"
                              ? "手动记录"
                              : "游戏记录"}
                          </span>
                          {e.evidence === "pending" && <small>待核对</small>}
                        </td>
                        <td>
                          <button
                            className="subtle"
                            onClick={() => {
                              setEditing(e);
                              setOpen(true);
                            }}
                          >
                            更正
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!data.events.length && (
                <div className="empty">
                  <span>◈</span>
                  <h3>本周还没有已记录流水</h3>
                  <p>初次采集的余额不会自动还原成历史获取或消耗。</p>
                </div>
              )}
            </div>
            {data.observations.length > 0 && (
              <div className="observations">
                <h3>额外拾取观察 · 待核对</h3>
                <p className="muted">
                  游戏事件尚不足以确认币数量和 BOSS。请核对后手动记录。
                </p>
                {data.observations.slice(0, 20).map((o) => (
                  <div key={o.id}>
                    <span>
                      {dateTime(o.at)} · {o.event}
                    </span>
                    <small>
                      {Object.values(o.payload)
                        .filter(
                          (v) => typeof v === "string" && v.includes("item:"),
                        )
                        .join(" ") || "奖励信息未确认"}
                    </small>
                  </div>
                ))}
              </div>
            )}
            <div className="footnote">
              {data.coverageStart
                ? `流水记录起点：${dateTime(data.coverageStart)}`
                : "尚无流水覆盖记录"}{" "}
              · 补录流水不会覆盖游戏采集的持币余额
            </div>
          </>
        )}
      </section>
      {open && (
        <EventDialog
          view={view}
          guid={guid}
          currencyKey={data?.balance?.currencyKey ?? BONUS_ROLL_CURRENCY_KEY}
          seasonId={data?.balance?.seasonId ?? "unverified"}
          initial={editing}
          onClose={() => setOpen(false)}
          onSave={async (e) => {
            const ok = await act(
              () => (editing ? api.correctEvent(e) : api.recordEvent(e)),
              "流水已保存",
            );
            if (ok) {
              load();
              setOpen(false);
            }
            return ok;
          }}
        />
      )}
    </>
  );
}
function EventDialog({
  view,
  guid,
  currencyKey,
  seasonId,
  onClose,
  onSave,
  initial,
}: {
  view: WeekView;
  guid: string;
  currencyKey: string;
  seasonId: string;
  onClose: () => void;
  onSave: (e: CurrencyEvent) => Promise<boolean>;
  initial?: CurrencyEvent;
}) {
  const [kind, setKind] = useState<"gain" | "spend" | "adjustment">(
      initial?.kind ?? "spend",
    ),
    [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? "1"),
    [raidId, setRaid] = useState(initial?.raidId ?? 0),
    [boss, setBoss] = useState(initial?.encounterId ?? 0),
    [difficulty, setDifficulty] = useState(initial?.difficultyId ?? 15),
    [reward, setReward] = useState(initial?.rewardLink ?? ""),
    [note, setNote] = useState(initial?.note ?? ""),
    [pending, setPending] = useState(initial?.evidence === "pending"),
    [itemLevel, setItemLevel] = useState(initial?.itemLevel?.toString() ?? "");
  const local = new Date(
      (initial?.at ? initial.at * 1000 : Date.now()) + 8 * 3600000,
    )
      .toISOString()
      .slice(0, 16),
    [at, setAt] = useState(local);
  const raid = view.catalog.raids.find((r) => r.id === raidId);
  return (
    <Modal
      title={initial ? "更正 ROLL 币流水" : "记录 ROLL 币流水"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSave({
            id: initial?.id ?? crypto.randomUUID(),
            guid,
            at: Date.parse(at + "+08:00") / 1000,
            currencyKey: initial?.currencyKey ?? currencyKey,
            seasonId: initial?.seasonId ?? seasonId,
            kind,
            quantity: Number(quantity),
            provenance: "manual",
            evidence: pending ? "pending" : "confirmed",
            activity: raidId ? "raid" : "other",
            raidId: raidId || null,
            encounterId: boss || null,
            difficultyId: raidId ? difficulty : null,
            specId: initial?.specId ?? null,
            rewardLink: reward || null,
            itemLevel: itemLevel ? Number(itemLevel) : null,
            note,
          });
        }}
      >
        <div className="form-grid">
          <label>
            方向
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="spend">消耗</option>
              <option value="gain">获取</option>
              <option value="adjustment">调整记录</option>
            </select>
          </label>
          <label>
            数量
            <input
              type="number"
              required
              min={kind === "adjustment" ? undefined : 1}
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
        </div>
        <label className="field-label">
          发生时间（北京时间）
          <input
            type="datetime-local"
            required
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
        <label className="field-label">
          关联团队副本（可选）
          <select
            value={raidId}
            onChange={(e) => {
              const id = Number(e.target.value);
              setRaid(id);
              setBoss(0);
              setDifficulty(
                view.catalog.raids.find((r) => r.id === id)?.difficulties[0]
                  ?.id ?? 15,
              );
            }}
          >
            <option value="0">其他来源 / 不关联团本</option>
            {view.catalog.raids.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {raid && (
          <div className="form-grid">
            <label>
              BOSS
              <select
                value={boss}
                required
                onChange={(e) => setBoss(Number(e.target.value))}
              >
                <option value="0">请选择 BOSS</option>
                {raid.bosses.map((b) => (
                  <option key={b.encounterId} value={b.encounterId}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              难度
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
              >
                {raid.difficulties.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <label className="field-label">
          奖励装备（可选）
          <input
            maxLength={500}
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            placeholder="装备名称或物品链接"
          />
        </label>
        <label className="field-label">
          奖励装等（可选）
          <input
            type="number"
            min="1"
            max="9999"
            value={itemLevel}
            onChange={(e) => setItemLevel(e.target.value)}
          />
        </label>
        <label className="field-label">
          获取来源 / 备注
          <input
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：任务兑换、宝库奖励"
          />
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={pending}
            onChange={(e) => setPending(e.target.checked)}
          />
          这笔记录仍需核对
        </label>
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" type="submit" disabled={!!raid && !boss}>
            保存流水
          </button>
        </footer>
      </form>
    </Modal>
  );
}
