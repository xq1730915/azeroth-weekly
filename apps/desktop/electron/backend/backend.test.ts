import { describe, it, expect, vi } from "vitest";
import { createEnvelope } from "@azeroth-weekly/protocol/fixtures";
import {
  openDatabase,
  ingest,
  loadWeek,
  addBossPlans,
  deleteBossPlan,
  copyPrevious,
  recordEvent,
  correctEvent,
  getLedger,
  backup,
  restore,
} from "./store";
import { parseSavedVariables, normalizeEnvelope } from "./parser";

describe("safe Lua import", () => {
  it("reads Chinese, comments and escaped bytes without executing code", () => {
    const v = parseSavedVariables(
      '-- comment\nAzerothWeeklyDB = {["name"]="角色", ["bytes"]="\\228\\184\\173", ["a"]={1,2,true}}',
    ) as any;
    expect(v.name).toBe("角色");
    expect(v.bytes).toBe("中");
    expect(v.a["3"]).toBe(true);
    expect(() =>
      parseSavedVariables('AzerothWeeklyDB={};os.execute("bad")'),
    ).toThrow();
    expect(() =>
      parseSavedVariables("AzerothWeeklyDB={a=function()end}"),
    ).toThrow();
    expect(() =>
      parseSavedVariables(
        "AzerothWeeklyDB=" + "{a=".repeat(40) + "0" + "}".repeat(40),
      ),
    ).toThrow();
  });
  it("normalizes only schema nullable fields and empty arrays", () => {
    const env = createEnvelope();
    const c = env.characters["Player-TEST-1"]!;
    delete (c.identity as any).classId;
    (c.encounters as any) = {};
    env.catalog = {
      version: "empty-season",
      raids: [],
      currentSeasonRaidIds: {} as any,
    };
    const normalized = normalizeEnvelope(env);
    expect(normalized.catalog!.currentSeasonRaidIds).toEqual([]);
    expect(normalized.characters["Player-TEST-1"]!.encounters).toEqual([]);
    expect(normalized.characters["Player-TEST-1"]!.identity.classId).toBeNull();
    (env.characters["Player-TEST-1"]!.encounters as any) = { "2": {} };
    expect(() => normalizeEnvelope(env)).toThrow();
  });
});
describe("identity, transactions, plans and ledger", () => {
  it("reads roll balances and totals by currency ID across legacy multi-currency imports", () => {
    const db = openDatabase(":memory:"),
      e = createEnvelope(),
      guid = "Player-TEST-1";
    const c = e.characters[guid]!;
    c.balances = [
      {
        currencyKey: "currency:2032",
        seasonId: "unverified",
        quantity: 1560,
        observedAt: 180,
      },
      {
        currencyKey: "currency:3513",
        seasonId: "unverified",
        quantity: 2,
        observedAt: 150,
      },
      {
        currencyKey: "currency:3418",
        seasonId: "old",
        quantity: 9,
        observedAt: 190,
      },
    ];
    try {
      ingest(db, "source", e);
      expect(getLedger(db, guid, c.week.id).balance?.quantity).toBe(2);
      const base = {
        guid,
        at: 150,
        seasonId: "unverified",
        kind: "spend" as const,
        quantity: 1,
        provenance: "manual" as const,
        evidence: "confirmed" as const,
        activity: "other" as const,
        raidId: null,
        encounterId: null,
        difficultyId: null,
        specId: null,
        rewardLink: null,
        itemLevel: null,
        note: "",
      };
      recordEvent(db, { ...base, id: "roll", currencyKey: "currency:3513" });
      recordEvent(db, {
        ...base,
        id: "other",
        currencyKey: "currency:2032",
        quantity: 100,
      });
      const ledger = getLedger(db, guid, c.week.id);
      expect(ledger.recordedSpend).toBe(1);
      expect(ledger.events).toHaveLength(2);
      expect(ledger.balances).toHaveLength(3);
      c.balances = [
        {
          currencyKey: "currency:3513",
          seasonId: "unverified",
          quantity: 0,
          observedAt: 200,
        },
      ];
      ingest(db, "source", e);
      expect(getLedger(db, guid, c.week.id).balance?.quantity).toBe(0);
      c.balances[0] = { ...c.balances[0]!, quantity: null, observedAt: 201 };
      ingest(db, "source", e);
      expect(getLedger(db, guid, c.week.id).balance?.quantity).toBeNull();
    } finally {
      db.close();
    }
  });
  it("copies only current-season bosses without deleting archived plans", () => {
    const db = openDatabase(":memory:");
    try {
      const e = createEnvelope({
        catalog: {
          version: "season",
          currentSeasonRaidIds: [2, 3],
          raids: [1, 2, 3].map((id) => ({
            id,
            name: `Raid ${id}`,
            difficulties: [],
            bosses: [],
          })),
        },
      });
      ingest(db, "s", e);
      const original = [1, 2, 3].map((raidId) => ({
        id: `p${raidId}`,
        guid: "Player-TEST-1",
        weekId: "cn-test-week",
        raidId,
        encounterId: 10,
        difficultyId: 15,
        targetItemLink: null,
        planBonusRoll: true,
      }));
      addBossPlans(db, original);
      db.prepare("INSERT INTO weeks VALUES(?,?,?,?)").run("next", 200, 300, 1);
      expect(copyPrevious(db, "next")).toEqual({ added: 2, skipped: 1 });
      const copied = db
        .prepare(
          "SELECT raid_id FROM plans WHERE week_id='next' ORDER BY raid_id",
        )
        .all();
      expect(copied.map((r: any) => r.raid_id)).toEqual([2, 3]);
      expect(
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM plans WHERE week_id='cn-test-week'",
          )
          .get()!.n,
      ).toBe(3);
    } finally {
      db.close();
    }
  });
  it("reconciles projected goals when the server confirms a corrected reset boundary", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(250000),
      db = openDatabase(":memory:");
    try {
      const e = createEnvelope({ sequence: 10 });
      ingest(db, "s", e);
      const projected = loadWeek(db);
      addBossPlans(db, [
        {
          id: "projected",
          guid: "Player-TEST-1",
          weekId: projected.week.id,
          raidId: 1,
          encounterId: 10,
          difficultyId: 15,
          targetItemLink: null,
          planBonusRoll: false,
        },
      ]);
      const next = structuredClone(e);
      next.sequence = 11;
      next.characters["Player-TEST-1"]!.capturedAt = 250;
      next.characters["Player-TEST-1"]!.week = {
        id: "CN:retail:201",
        start: 201,
        end: 300,
        confirmed: true,
      };
      ingest(db, "s", next);
      const current = loadWeek(db);
      expect(current.week.id).toBe("CN:retail:201");
      expect(current.bossPlans).toHaveLength(1);
    } finally {
      clock.mockRestore();
      db.close();
    }
  });
  it("accepts a later capture in the same second and ignores an older sequence", () => {
    const db = openDatabase(":memory:"),
      env = createEnvelope({ sequence: 10 }),
      guid = "Player-TEST-1";
    ingest(db, "s", env);
    const newer = structuredClone(env);
    newer.sequence = 11;
    newer.characters[guid]!.encounters = [
      {
        raidId: 1,
        encounterId: 10,
        difficultyId: 15,
        killed: true,
        lootEligible: null,
        observedAt: 150,
      },
    ];
    ingest(db, "s", newer);
    ingest(db, "s", env);
    expect(
      loadWeek(db, env.characters[guid]!.week.id).characters[0]!.encounters,
    ).toHaveLength(1);
    db.close();
  });
  it("merges sources, deduplicates events and does not regress snapshots", () => {
    const db = openDatabase(":memory:"),
      env = createEnvelope();
    ingest(db, "one", env);
    ingest(db, "two", env);
    const old = structuredClone(env);
    old.characters["Player-TEST-1"]!.capturedAt = 120;
    ingest(db, "one", old);
    expect(
      (db.prepare("SELECT COUNT(*) n FROM characters").get() as any).n,
    ).toBe(1);
    expect(
      loadWeek(db, env.characters["Player-TEST-1"]!.week.id).characters[0]!
        .capturedAt,
    ).toBe(150);
    expect(() =>
      ingest(db, "bad", { ...env, schemaVersion: 2 } as any),
    ).toThrow();
    db.close();
  });
  it("shows only plans and deletion does not remove a spend", () => {
    const db = openDatabase(":memory:"),
      env = createEnvelope(),
      guid = "Player-TEST-1",
      weekId = env.characters[guid]!.week.id;
    ingest(db, "one", env);
    const plan = {
      id: "p1",
      guid,
      weekId,
      raidId: 1,
      encounterId: 10,
      difficultyId: 15,
      targetItemLink: null,
      planBonusRoll: true,
    };
    expect(addBossPlans(db, [plan, plan])).toEqual({ added: 1, skipped: 1 });
    recordEvent(db, {
      id: "m1",
      guid,
      at: 150,
      currencyKey: "currency:3513",
      seasonId: "unverified",
      kind: "spend",
      quantity: 1,
      provenance: "manual",
      evidence: "confirmed",
      activity: "raid",
      raidId: 1,
      encounterId: 10,
      difficultyId: 15,
      specId: null,
      rewardLink: "item:123",
      itemLevel: null,
      note: "",
    });
    deleteBossPlan(db, "p1");
    expect(loadWeek(db, weekId).bossPlans).toHaveLength(0);
    expect(getLedger(db, guid, weekId).events).toHaveLength(1);
    expect(getLedger(db, guid, weekId).balance).toBeNull();
    const original = getLedger(db, guid, weekId).events[0]!;
    correctEvent(db, { ...original, quantity: 2, note: "更正数量" });
    expect(getLedger(db, guid, weekId).recordedSpend).toBe(2);
    expect(
      JSON.parse(
        (db.prepare("SELECT data FROM events WHERE id=?").get("m1") as any)
          .data,
      ).quantity,
    ).toBe(1);
    const other = openDatabase(":memory:");
    restore(other, backup(db));
    expect(getLedger(other, guid, weekId).recordedSpend).toBe(2);
    other.close();
    db.close();
  });
  it("roundtrips backup and rejects invalid backups without losing data", () => {
    const db = openDatabase(":memory:");
    ingest(db, "one", createEnvelope());
    const saved = backup(db);
    const other = openDatabase(":memory:");
    restore(other, saved);
    expect(other.prepare("SELECT COUNT(*) n FROM characters").get()).toEqual({
      n: 1,
    });
    expect(() => restore(other, { backupVersion: 999 })).toThrow();
    expect(other.prepare("SELECT COUNT(*) n FROM characters").get()).toEqual({
      n: 1,
    });
    db.close();
    other.close();
  });
});
