import type { DatabaseSync } from "node:sqlite";
import { rows, transaction } from "./database";
import { validateEnvelope } from "@azeroth-weekly/protocol";
import { normalizeEnvelope } from "./parser";
import { effectiveEvents } from "./ledger";
const tables = [
  "characters",
  "sources",
  "character_sources",
  "weeks",
  "captures",
  "balances",
  "events",
  "event_corrections",
  "diagnostics",
  "plans",
  "targets",
  "settings",
] as const;
export function backup(db: DatabaseSync) {
  return {
    backupVersion: 1,
    exportedAt: Date.now() / 1000,
    tables: Object.fromEntries(
      tables.map((t) => [t, rows(db, `SELECT * FROM ${t}`)]),
    ),
  };
}
export function restore(db: DatabaseSync, input: unknown) {
  const b = input as any;
  if (!b || b.backupVersion !== 1 || !b.tables)
    throw Error("备份版本或格式不支持");
  for (const t of tables) {
    if (!Array.isArray(b.tables[t])) throw Error("备份缺少数据表");
    const columns = rows(db, `PRAGMA table_info(${t})`).map((r) => r.name);
    for (const r of b.tables[t]) {
      if (
        !r ||
        typeof r !== "object" ||
        Object.keys(r).length !== columns.length ||
        columns.some((k) => !Object.hasOwn(r, k))
      )
        throw Error("备份字段不匹配");
      for (const k of columns) {
        const v = r[k];
        if (
          v !== null &&
          typeof v !== "string" &&
          !(typeof v === "number" && Number.isFinite(v))
        )
          throw Error("备份值格式错误");
        if (["data", "identity", "value"].includes(k)) JSON.parse(v);
      }
    }
  }
  const envelope: any = {
    schemaVersion: 1,
    installationId: "backup",
    sequence: 0,
    clientBuild: "backup",
    addonVersion: "0.1.0",
    capabilities: {},
    characters: {},
    events: {},
    diagnostics: [],
  };
  for (const r of b.tables.captures) {
    const c = JSON.parse(r.data);
    if (
      c.identity?.guid !== r.guid ||
      c.week?.id !== r.week_id ||
      c.capturedAt !== r.captured_at
    )
      throw Error("备份角色快照不一致");
    normalizeEnvelope({ ...envelope, characters: { [r.guid]: c } });
    envelope.characters[r.guid] = c;
  }
  for (const r of b.tables.characters) {
    const identity = JSON.parse(r.identity),
      c = envelope.characters[r.guid];
    if (!c || identity.guid !== r.guid || typeof r.alias !== "string")
      throw Error("备份角色身份不一致");
    validateEnvelope({
      ...envelope,
      characters: { [r.guid]: { ...c, identity } },
    });
  }
  const guids = new Set(b.tables.characters.map((r: any) => r.guid)),
    weekIds = new Set(b.tables.weeks.map((r: any) => r.id));
  for (const r of b.tables.weeks)
    if (
      typeof r.id !== "string" ||
      !r.id ||
      !Number.isFinite(r.start) ||
      !Number.isFinite(r.end) ||
      r.start >= r.end ||
      ![0, 1].includes(r.confirmed)
    )
      throw Error("备份游戏周格式错误");
  for (const r of b.tables.events) {
    const e = JSON.parse(r.data);
    if (e.id !== r.id || e.guid !== r.guid || e.at !== r.at)
      throw Error("备份流水不一致");
    envelope.events[e.id] = e;
  }
  for (const r of b.tables.diagnostics) {
    const d = JSON.parse(r.data);
    if (d.id !== r.id || d.guid !== r.guid || d.at !== r.at)
      throw Error("备份观察记录不一致");
    envelope.diagnostics.push(d);
  }
  validateEnvelope(envelope);
  for (const r of b.tables.event_corrections) {
    const e = JSON.parse(r.data),
      original = envelope.events[r.event_id];
    if (!original || e.id !== r.event_id || e.guid !== original.guid)
      throw Error("备份流水更正归属错误");
    validateEnvelope({ ...envelope, events: { [e.id]: e } });
  }
  for (const r of b.tables.balances) {
    const c = envelope.characters[r.guid],
      v = JSON.parse(r.data);
    if (
      !c ||
      v.currencyKey !== r.currency_key ||
      v.seasonId !== r.season_id ||
      v.observedAt !== r.observed_at
    )
      throw Error("备份余额不一致");
    validateEnvelope({
      ...envelope,
      events: {},
      characters: { [r.guid]: { ...c, balances: [v] } },
    });
  }
  for (const t of ["plans", "targets"])
    for (const r of b.tables[t]) {
      const p = JSON.parse(r.data);
      if (
        !guids.has(r.guid) ||
        !weekIds.has(r.week_id) ||
        p.id !== r.id ||
        p.guid !== r.guid ||
        p.weekId !== r.week_id
      )
        throw Error("备份计划归属错误");
      if (
        t === "plans" &&
        (![p.raidId, p.encounterId, p.difficultyId].every(
          (v) => Number.isSafeInteger(v) && v > 0,
        ) ||
          p.raidId !== r.raid_id ||
          p.encounterId !== r.encounter_id ||
          p.difficultyId !== r.difficulty_id ||
          typeof p.planBonusRoll !== "boolean")
      )
        throw Error("备份 BOSS 计划错误");
      if (
        t === "targets" &&
        (p.slotKey !== r.slot_key ||
          typeof p.slotKey !== "string" ||
          !(
            p.minimumItemLevel === null ||
            (Number.isSafeInteger(p.minimumItemLevel) && p.minimumItemLevel > 0)
          ))
      )
        throw Error("备份宝库目标错误");
    }
  transaction(db, () => {
    for (const t of [...tables].reverse()) db.exec(`DELETE FROM ${t}`);
    for (const t of tables) {
      const columns = rows(db, `PRAGMA table_info(${t})`).map((r) => r.name);
      const sql = `INSERT INTO ${t}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`;
      const statement = db.prepare(sql);
      for (const r of b.tables[t]) statement.run(...columns.map((k) => r[k]));
    }
    // A restored backup never grants access to new filesystem paths.
    db.exec(
      "UPDATE sources SET selected=0; DELETE FROM settings WHERE key='gameRoot'",
    );
  });
}
export function ledgerCsv(db: DatabaseSync) {
  const data = effectiveEvents(db).map((e) => ({
    data: JSON.stringify(e),
    identity: rows(
      db,
      "SELECT identity FROM characters WHERE guid=?",
      e.guid,
    )[0]?.identity,
  }));
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const lines = [
    [
      "角色",
      "服务器",
      "时间",
      "方向",
      "数量",
      "币种",
      "BOSS ID",
      "难度 ID",
      "奖励",
      "来源",
      "状态",
    ],
  ];
  for (const r of data) {
    const e = JSON.parse(r.data),
      c = r.identity ? JSON.parse(r.identity) : {};
    lines.push([
      c.name,
      c.realm,
      new Date(e.at * 1000).toISOString(),
      e.kind,
      String(e.quantity ?? ""),
      e.currencyKey,
      String(e.encounterId ?? ""),
      String(e.difficultyId ?? ""),
      e.rewardLink ?? "",
      e.provenance,
      e.evidence,
    ]);
  }
  return "\uFEFF" + lines.map((r) => r.map(cell).join(",")).join("\r\n");
}
