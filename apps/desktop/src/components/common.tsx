import type { CharacterCapture } from "@azeroth-weekly/protocol";
export const className = (id: number | null) =>
  ({
    1: "战士",
    2: "圣骑士",
    3: "猎人",
    4: "潜行者",
    5: "牧师",
    6: "死亡骑士",
    7: "萨满祭司",
    8: "法师",
    9: "术士",
    10: "武僧",
    11: "德鲁伊",
    12: "恶魔猎手",
    13: "唤魔师",
  })[id ?? 0] ?? "角色";
export const classColor = (id: number | null) =>
  ({
    1: "#c79c6e",
    2: "#f58cba",
    3: "#abd473",
    4: "#fff569",
    5: "#eeeeee",
    6: "#e16478",
    7: "#59a7ff",
    8: "#78ccef",
    9: "#b1a0dd",
    10: "#50d3b6",
    11: "#ffa15e",
    12: "#b98af1",
    13: "#75bfaf",
  })[id ?? 0] ?? "#99b4c6";
export function CharacterName({
  c,
  alias,
}: {
  c: CharacterCapture;
  alias?: string;
}) {
  return (
    <div className="character">
      <span
        className="avatar"
        style={{
          color: classColor(c.identity.classId),
          borderColor: classColor(c.identity.classId) + "55",
          background: classColor(c.identity.classId) + "13",
        }}
      >
        {className(c.identity.classId).slice(0, 1)}
      </span>
      <span>
        <strong style={{ color: classColor(c.identity.classId) }}>
          {alias || c.identity.name}
        </strong>
        <small>
          {c.identity.realm} · {className(c.identity.classId)}
        </small>
      </span>
    </div>
  );
}
export function Status({
  value,
  yes = "已完成",
  no = "未完成",
}: {
  value: boolean | null;
  yes?: string;
  no?: string;
}) {
  return (
    <span
      className={
        "status " +
        (value === true ? "done" : value === false ? "todo" : "pending")
      }
    >
      <i />
      {value === null ? "待同步" : value ? yes : no}
    </span>
  );
}
export function dateTime(at: number | null) {
  return at
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(at * 1000))
    : "—";
}
export function Progress({
  done,
  total,
  pending = 0,
}: {
  done: number;
  total: number;
  pending?: number;
}) {
  return (
    <div className="progress-cell">
      <div>
        <strong>{total ? `${done} / ${total}` : "未设置"}</strong>
        {pending > 0 && <small>{pending} 项待确认</small>}
      </div>
      <div className="progress-track">
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}
