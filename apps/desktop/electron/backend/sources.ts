import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { rows, setting, setSetting } from "./database";
import { ingest } from "./ingest";
import { normalizeEnvelope, parseSavedVariables } from "./parser";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
export function configureRoot(db: DatabaseSync, chosen: string) {
  const candidate = fs.existsSync(path.join(chosen, "_retail_"))
    ? path.join(chosen, "_retail_")
    : chosen;
  const root = fs.realpathSync(candidate);
  if (!fs.existsSync(path.join(root, "WTF", "Account")))
    throw Error("此目录未找到正式服 WTF\\Account，请选择魔兽世界安装目录");
  setSetting(db, "gameRoot", root);
  db.prepare("UPDATE sources SET selected=0").run();
  return discoverSources(db);
}
export function discoverSources(db: DatabaseSync) {
  const last = setting<any[]>(db, "lastImportResults", []);
  const root = setting(db, "gameRoot", "");
  if (!root) return [];
  const accountRoot = path.join(root, "WTF", "Account");
  if (!fs.existsSync(accountRoot)) return [];
  for (const d of fs.readdirSync(accountRoot, { withFileTypes: true }))
    if (d.isDirectory() && !d.isSymbolicLink()) {
      const file = path.join(
          accountRoot,
          d.name,
          "SavedVariables",
          "AzerothWeekly.lua",
        ),
        id = createHash("sha256").update(file.toLowerCase()).digest("hex");
      db.prepare(
        "INSERT INTO sources(id,label,file) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label",
      ).run(id, d.name, file);
    }
  return rows(db, "SELECT * FROM sources")
    .filter(
      (s) => path.dirname(path.dirname(path.dirname(s.file))) === accountRoot,
    )
    .map((s) => ({
      id: s.id,
      label: s.label,
      selected: !!s.selected,
      fileExists: fs.existsSync(s.file),
      lastStatus: last.find((r) => r.sourceId === s.id)?.status,
      message: last.find((r) => r.sourceId === s.id)?.message,
    }));
}
export function selectSources(db: DatabaseSync, ids: string[]) {
  if (!Array.isArray(ids)) throw Error("来源选择不正确");
  const allowed = new Set(discoverSources(db).map((s) => s.id));
  if (ids.some((id) => !allowed.has(id)))
    throw Error("来源不在已选择的游戏目录内");
  db.exec("BEGIN");
  try {
    db.exec("UPDATE sources SET selected=0");
    for (const id of ids)
      db.prepare("UPDATE sources SET selected=1 WHERE id=?").run(id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export async function readImportFile(
  db: DatabaseSync,
  file: string,
  sourceId: string,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = fs.statSync(file);
    if (before.size > 16 * 1024 * 1024) throw Error("存档超过 16 MiB");
    await delay(250);
    const after = fs.statSync(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      continue;
    const input = fs.readFileSync(file, "utf8"),
      digest = createHash("sha256").update(input).digest("hex");
    if (setting(db, "digest:" + sourceId, "") === digest)
      return {
        status: "unchanged",
        message: "存档没有变化；切换角色或 /reload 后再读取",
        report: null,
      };
    const report = ingest(
      db,
      sourceId,
      normalizeEnvelope(parseSavedVariables(input)),
    );
    setSetting(db, "digest:" + sourceId, digest);
    return {
      status: "ok",
      message: `更新 ${report.charactersUpdated} 个角色，新增 ${report.eventsAdded} 条流水`,
      report,
    };
  }
  throw Error("游戏正在写入存档，请稍后重试");
}
export async function importSelected(db: DatabaseSync) {
  const root = setting(db, "gameRoot", "");
  const out = [];
  for (const s of rows(db, "SELECT * FROM sources WHERE selected=1"))
    try {
      const actual = fs.realpathSync(s.file),
        rel = path.relative(root, actual);
      if (
        !root ||
        rel.startsWith("..") ||
        path.isAbsolute(rel) ||
        path.basename(actual) !== "AzerothWeekly.lua"
      )
        throw Error("来源路径已变化，请重新选择");
      out.push({
        sourceId: s.id,
        label: s.label,
        ...(await readImportFile(db, actual, s.id)),
      });
    } catch (e) {
      out.push({
        sourceId: s.id,
        label: s.label,
        status: "error",
        message: e instanceof Error ? e.message : "读取失败",
        report: null,
      });
    }
  return out;
}
