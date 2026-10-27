import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  CurrencyBalance,
  CurrencyEvent,
  DiagnosticObservation,
} from "@azeroth-weekly/protocol";
import {
  validateEnvelope,
  selectBonusRollBalance,
  BONUS_ROLL_CURRENCY_KEY,
} from "@azeroth-weekly/protocol";
import { jsonRows, rows } from "./database";
export function effectiveEvents(
  db: DatabaseSync,
  guid?: string,
): CurrencyEvent[] {
  return rows(
    db,
    "SELECT e.data original,c.data correction FROM events e LEFT JOIN event_corrections c ON e.id=c.event_id" +
      (guid ? " WHERE e.guid=?" : ""),
    ...(guid ? [guid] : []),
  )
    .map((r) => JSON.parse(r.correction ?? r.original))
    .sort((a, b) => b.at - a.at);
}
export function getLedger(db: DatabaseSync, guid: string, weekId: string) {
  const week = rows(db, "SELECT * FROM weeks WHERE id=?", weekId)[0];
  const all = effectiveEvents(db, guid);
  const events = week
    ? all.filter((e) => e.at >= week.start && e.at < week.end)
    : [];
  const balances = jsonRows<CurrencyBalance>(
    db,
    "SELECT data FROM balances WHERE guid=? ORDER BY observed_at DESC",
    guid,
  );
  const observations = jsonRows<DiagnosticObservation>(
    db,
    "SELECT data FROM diagnostics WHERE guid=? ORDER BY at DESC",
    guid,
  ).filter(
    (d) =>
      d.event.startsWith("BONUS_ROLL") &&
      (!week || (d.at >= week.start && d.at < week.end)),
  );
  const sum = (kind: string) =>
    events
      .filter(
        (e) =>
          e.currencyKey === BONUS_ROLL_CURRENCY_KEY &&
          e.kind === kind &&
          e.evidence === "confirmed",
      )
      .reduce((n, e) => n + (e.quantity ?? 0), 0);
  return {
    balance: selectBonusRollBalance(balances),
    balances,
    events,
    recordedGain: sum("gain"),
    recordedSpend: sum("spend"),
    pendingCount: events.filter((e) => e.evidence === "pending").length,
    observations,
    coverageStart: all.length ? Math.min(...all.map((e) => e.at)) : null,
  };
}
export function recordEvent(db: DatabaseSync, event: CurrencyEvent) {
  const captures = rows(
    db,
    "SELECT data FROM captures WHERE guid=? ORDER BY captured_at DESC LIMIT 1",
    event.guid,
  );
  if (!captures.length) throw Error("角色不存在");
  const capture = JSON.parse(captures[0]!.data);
  const e = {
    ...event,
    id: event.id || randomUUID(),
    provenance: "manual" as const,
  };
  validateEnvelope({
    schemaVersion: 1,
    installationId: "manual",
    sequence: 1,
    clientBuild: "manual",
    addonVersion: "0.1.0",
    capabilities: {},
    characters: { [e.guid]: capture },
    events: { [e.id]: e },
  });
  if (db.prepare("SELECT 1 FROM events WHERE id=?").get(e.id))
    throw Error("记录已存在，请勿重复保存");
  db.prepare("INSERT INTO events VALUES(?,?,?,?)").run(
    e.id,
    e.guid,
    e.at,
    JSON.stringify(e),
  );
}
export function correctEvent(db: DatabaseSync, event: CurrencyEvent) {
  const row = rows(db, "SELECT data FROM events WHERE id=?", event.id)[0];
  if (!row) throw Error("原始流水不存在");
  const original = JSON.parse(row.data);
  if (event.guid !== original.guid) throw Error("不能更改流水所属角色");
  const c = JSON.parse(
    rows(
      db,
      "SELECT data FROM captures WHERE guid=? ORDER BY captured_at DESC LIMIT 1",
      event.guid,
    )[0]!.data,
  );
  const corrected = { ...event, provenance: "manual" as const };
  validateEnvelope({
    schemaVersion: 1,
    installationId: "correction",
    sequence: 1,
    clientBuild: "manual",
    addonVersion: "0.1.0",
    capabilities: {},
    characters: { [event.guid]: c },
    events: { [event.id]: corrected },
  });
  db.prepare("INSERT OR REPLACE INTO event_corrections VALUES(?,?,?)").run(
    event.id,
    Date.now() / 1000,
    JSON.stringify(corrected),
  );
}
