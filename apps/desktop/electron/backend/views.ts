import type { DatabaseSync } from "node:sqlite";
import type {
  BossPlan,
  CharacterCapture,
  CurrencyEvent,
  GameWeek,
  RaidCatalog,
  VaultTarget,
} from "@azeroth-weekly/protocol";
import { rows, jsonRows, setting } from "./database";
import { effectiveEvents } from "./ledger";
export interface WeekView {
  week: GameWeek;
  weeks: GameWeek[];
  characters: CharacterCapture[];
  bossPlans: BossPlan[];
  vaultTargets: VaultTarget[];
  currencyEvents: CurrencyEvent[];
  aliases: Record<string, string>;
  catalog: RaidCatalog;
}
export function listWeeks(
  db: DatabaseSync,
  now = Date.now() / 1000,
): GameWeek[] {
  const result = rows(db, "SELECT * FROM weeks ORDER BY start DESC").map(
    (r) => ({ id: r.id, start: r.start, end: r.end, confirmed: !!r.confirmed }),
  );
  const current = result.find(
    (w) => w.confirmed && w.start <= now && now < w.end,
  );
  if (current) return [current, ...result.filter((w) => w.id !== current.id)];
  const last = result.find((w) => w.confirmed) ?? result[0];
  if (!last) return [{ id: "pending", start: 0, end: 1, confirmed: false }];
  if (now >= last.end) {
    const n = Math.floor((now - last.end) / 604800);
    const start = last.end + n * 604800;
    const id = `CN:retail:${start}`;
    const existing = result.find((w) => w.id === id);
    if (existing) return [existing, ...result.filter((w) => w.id !== id)];
    result.unshift({
      id,
      start,
      end: start + 604800,
      confirmed: false,
    });
  }
  return result;
}
export function loadWeek(db: DatabaseSync, weekId?: string): WeekView {
  const weeks = listWeeks(db),
    week = weeks.find((w) => w.id === weekId) ?? weeks[0]!;
  if (week.id !== "pending")
    db.prepare("INSERT OR IGNORE INTO weeks VALUES(?,?,?,?)").run(
      week.id,
      week.start,
      week.end,
      Number(week.confirmed),
    );
  const aliases: Record<string, string> = {},
    characters: CharacterCapture[] = [];
  for (const ch of rows(db, "SELECT * FROM characters ORDER BY guid")) {
    aliases[ch.guid] = ch.alias;
    const current =
      rows(
        db,
        "SELECT data FROM captures WHERE guid=? AND week_id=?",
        ch.guid,
        week.id,
      )[0] ??
      rows(
        db,
        "SELECT data FROM captures WHERE guid=? ORDER BY captured_at DESC LIMIT 1",
        ch.guid,
      )[0];
    if (current) {
      const capture = JSON.parse(current.data);
      capture.identity = JSON.parse(ch.identity);
      capture.balances = jsonRows(
        db,
        "SELECT data FROM balances WHERE guid=? ORDER BY observed_at DESC",
        ch.guid,
      );
      characters.push(capture);
    }
  }
  return {
    week,
    weeks,
    characters,
    aliases,
    bossPlans: jsonRows(
      db,
      "SELECT data FROM plans WHERE week_id=? ORDER BY rowid",
      week.id,
    ),
    vaultTargets: jsonRows(
      db,
      "SELECT data FROM targets WHERE week_id=?",
      week.id,
    ),
    currencyEvents: effectiveEvents(db).filter(
      (e) => e.at >= week.start && e.at < week.end,
    ),
    catalog: setting(db, "catalog", { version: "empty", raids: [] }),
  };
}
