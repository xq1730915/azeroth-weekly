import { it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createEnvelope } from "@azeroth-weekly/protocol/fixtures";
import { openDatabase, ingest, backup, restore } from "./store";
import { configureRoot, selectSources, importSelected } from "./sources";
function lua(v: any): string {
  if (v === null) return "nil";
  if (typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .filter(([, v]) => v !== null)
        .map(
          ([k, x]) =>
            `[${Array.isArray(v) ? Number(k) + 1 : JSON.stringify(k)}]=${lua(x)}`,
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
it("selects four of five sources, ignores the fifth, and preserves data after a malformed write", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "azweekly-test-")),
    db = openDatabase(":memory:");
  try {
    for (let i = 0; i < 5; i++) {
      const dir = path.join(
        root,
        "WTF",
        "Account",
        `source-${i}`,
        "SavedVariables",
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "AzerothWeekly.lua"),
        "AzerothWeeklyDB=" + lua(createEnvelope()),
      );
    }
    const sources = configureRoot(db, root);
    expect(sources).toHaveLength(5);
    expect(sources.every((s) => !s.selected)).toBe(true);
    selectSources(
      db,
      sources.slice(0, 4).map((s) => s.id),
    );
    expect(await importSelected(db)).toHaveLength(4);
    expect(
      (db.prepare("SELECT COUNT(*) n FROM character_sources").get() as any).n,
    ).toBe(4);
    expect(
      (db.prepare("SELECT COUNT(*) n FROM characters").get() as any).n,
    ).toBe(1);
    fs.writeFileSync(
      path.join(
        root,
        "WTF",
        "Account",
        "source-0",
        "SavedVariables",
        "AzerothWeekly.lua",
      ),
      "AzerothWeeklyDB={broken=",
    );
    const report = await importSelected(db);
    expect(report[0]?.status).toBe("error");
    expect((db.prepare("SELECT COUNT(*) n FROM captures").get() as any).n).toBe(
      1,
    );
  } finally {
    db.close();
    if (path.resolve(root).startsWith(path.join(os.tmpdir(), "azweekly-test-")))
      fs.rmSync(root, { recursive: true, force: true });
  }
});
it("rejects corrupted backed-up domain values before replacing existing records", () => {
  const db = openDatabase(":memory:");
  ingest(db, "s", createEnvelope());
  const saved = backup(db);
  (saved.tables.captures as any[])[0].data = "{}";
  expect(() => restore(db, saved)).toThrow();
  expect((db.prepare("SELECT COUNT(*) n FROM characters").get() as any).n).toBe(
    1,
  );
  db.close();
});
