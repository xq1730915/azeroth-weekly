import type { DatabaseSync } from "node:sqlite";
import {
  validateEnvelope,
  type CaptureEnvelope,
  type ImportReport,
  type CharacterCapture,
} from "@azeroth-weekly/protocol";
import { transaction, setSetting, setting, rows, jsonRows } from "./database";
function reconcilePlans(db: DatabaseSync, c: CharacterCapture) {
  if (!c.week.confirmed) return;
  const estimates = rows(
    db,
    "SELECT * FROM weeks WHERE confirmed=0 AND id<>? AND start<=? AND end>?",
    c.week.id,
    c.capturedAt,
    c.capturedAt,
  ).filter((w) => Math.abs(w.start - c.week.start) < 86400);
  for (const old of estimates) {
    for (const r of jsonRows<any>(
      db,
      "SELECT data FROM plans WHERE week_id=?",
      old.id,
    )) {
      const p = { ...r, weekId: c.week.id };
      db.prepare("DELETE FROM plans WHERE id=?").run(p.id);
      db.prepare("INSERT OR IGNORE INTO plans VALUES(?,?,?,?,?,?,?)").run(
        p.id,
        p.guid,
        p.weekId,
        p.raidId,
        p.encounterId,
        p.difficultyId,
        JSON.stringify(p),
      );
    }
    for (const r of jsonRows<any>(
      db,
      "SELECT data FROM targets WHERE week_id=?",
      old.id,
    )) {
      const t = { ...r, weekId: c.week.id };
      db.prepare("DELETE FROM targets WHERE id=?").run(t.id);
      db.prepare("INSERT OR IGNORE INTO targets VALUES(?,?,?,?,?)").run(
        t.id,
        t.guid,
        t.weekId,
        t.slotKey,
        JSON.stringify(t),
      );
    }
  }
}
export function ingest(
  db: DatabaseSync,
  sourceId: string,
  input: CaptureEnvelope,
): ImportReport {
  const e = validateEnvelope(input);
  const report = {
    charactersUpdated: 0,
    eventsAdded: 0,
    duplicateEvents: 0,
    pendingEvents: 0,
  };
  return transaction(db, () => {
    for (const c of Object.values(e.characters)) {
      const { guid } = c.identity;
      db.prepare(
        "INSERT INTO characters(guid,identity) VALUES(?,?) ON CONFLICT(guid) DO UPDATE SET identity=CASE WHEN COALESCE((SELECT MAX(captured_at) FROM captures WHERE guid=excluded.guid),0)<=? THEN excluded.identity ELSE characters.identity END",
      ).run(guid, JSON.stringify(c.identity), c.capturedAt);
      db.prepare("INSERT OR IGNORE INTO character_sources VALUES(?,?)").run(
        guid,
        sourceId,
      );
      db.prepare(
        "INSERT INTO weeks VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET start=excluded.start,end=excluded.end,confirmed=excluded.confirmed WHERE excluded.confirmed>=weeks.confirmed",
      ).run(c.week.id, c.week.start, c.week.end, Number(c.week.confirmed));
      reconcilePlans(db, c);
      const old = db
        .prepare("SELECT captured_at FROM captures WHERE guid=? AND week_id=?")
        .get(guid, c.week.id) as any;
      const versionKey = `captureVersion:${guid}:${c.week.id}`;
      const version = setting(db, versionKey, {
        installationId: "",
        sequence: -1,
      });
      const newerSequence =
        version.installationId === e.installationId &&
        e.sequence > version.sequence;
      const replace =
        !old ||
        old.captured_at < c.capturedAt ||
        (old.captured_at === c.capturedAt && newerSequence);
      if (replace) {
        db.prepare("INSERT OR REPLACE INTO captures VALUES(?,?,?,?)").run(
          guid,
          c.week.id,
          c.capturedAt,
          JSON.stringify(c),
        );
        report.charactersUpdated++;
        setSetting(db, versionKey, {
          installationId: e.installationId,
          sequence: e.sequence,
        });
      }
      for (const b of c.balances)
        db.prepare(
          "INSERT INTO balances VALUES(?,?,?,?,?) ON CONFLICT(guid,currency_key,season_id) DO UPDATE SET observed_at=excluded.observed_at,data=excluded.data WHERE excluded.observed_at>balances.observed_at OR (excluded.observed_at=balances.observed_at AND ?)",
        ).run(
          guid,
          b.currencyKey,
          b.seasonId,
          b.observedAt,
          JSON.stringify(b),
          Number(replace),
        );
    }
    for (const event of Object.values(e.events)) {
      const r = db
        .prepare("INSERT OR IGNORE INTO events VALUES(?,?,?,?)")
        .run(event.id, event.guid, event.at, JSON.stringify(event));
      if (r.changes) {
        report.eventsAdded++;
        if (event.evidence === "pending") report.pendingEvents++;
      } else report.duplicateEvents++;
    }
    for (const d of e.diagnostics ?? [])
      db.prepare("INSERT OR IGNORE INTO diagnostics VALUES(?,?,?,?)").run(
        d.id,
        d.guid,
        d.at,
        JSON.stringify(d),
      );
    if (e.catalog) {
      const newest = Math.max(
        0,
        ...Object.values(e.characters).map((c) => c.capturedAt),
      );
      const old = setting(db, "catalogAt", 0);
      if (newest >= old) {
        setSetting(db, "catalog", e.catalog);
        setSetting(db, "catalogAt", newest);
      }
    }
    setSetting(db, "capabilities", e.capabilities);
    return report;
  });
}
