import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  currentSeasonRaids,
  type BossPlan,
  type VaultTarget,
  type RaidCatalog,
} from "@azeroth-weekly/protocol";
import { transaction, rows, jsonRows, setting } from "./database";
const finiteId = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
function scope(db: DatabaseSync, guid: string, weekId: string) {
  if (
    !db.prepare("SELECT 1 FROM characters WHERE guid=?").get(guid) ||
    !db.prepare("SELECT 1 FROM weeks WHERE id=?").get(weekId)
  )
    throw Error("请先采集角色及游戏周");
}
export function addBossPlans(db: DatabaseSync, plans: BossPlan[]) {
  if (!Array.isArray(plans) || plans.length > 2000)
    throw Error("计划数量不正确");
  return transaction(db, () => {
    let added = 0,
      skipped = 0;
    for (const p of plans) {
      scope(db, p.guid, p.weekId);
      if (
        typeof p.id !== "string" ||
        !p.id ||
        ![p.raidId, p.encounterId, p.difficultyId].every(finiteId) ||
        typeof p.planBonusRoll !== "boolean" ||
        (p.targetItemLink !== null && typeof p.targetItemLink !== "string")
      )
        throw Error("BOSS 计划格式错误");
      const result = db
        .prepare("INSERT OR IGNORE INTO plans VALUES(?,?,?,?,?,?,?)")
        .run(
          p.id,
          p.guid,
          p.weekId,
          p.raidId,
          p.encounterId,
          p.difficultyId,
          JSON.stringify(p),
        );
      if (result.changes) added++;
      else skipped++;
    }
    return { added, skipped };
  });
}
export function deleteBossPlan(db: DatabaseSync, id: string) {
  db.prepare("DELETE FROM plans WHERE id=?").run(id);
}
export function updateBossPlan(db: DatabaseSync, p: BossPlan) {
  scope(db, p.guid, p.weekId);
  transaction(db, () => {
    deleteBossPlan(db, p.id);
    addSingle(db, p);
  });
}
function addSingle(db: DatabaseSync, p: BossPlan) {
  if (
    ![p.raidId, p.encounterId, p.difficultyId].every(finiteId) ||
    typeof p.planBonusRoll !== "boolean"
  )
    throw Error("计划格式错误");
  db.prepare("INSERT INTO plans VALUES(?,?,?,?,?,?,?)").run(
    p.id,
    p.guid,
    p.weekId,
    p.raidId,
    p.encounterId,
    p.difficultyId,
    JSON.stringify(p),
  );
}
export function copyPrevious(db: DatabaseSync, weekId: string) {
  const target = rows(db, "SELECT * FROM weeks WHERE id=?", weekId)[0];
  if (!target) throw Error("没有当前游戏周");
  const from = rows(
    db,
    "SELECT * FROM weeks WHERE start<? ORDER BY start DESC LIMIT 1",
    target.start,
  )[0];
  if (!from) throw Error("还没有上周计划");
  const currentIds = new Set(
    currentSeasonRaids(
      setting<RaidCatalog>(db, "catalog", { version: "unknown", raids: [] }),
    ).map((r) => r.id),
  );
  const previousPlans = jsonRows<BossPlan>(
    db,
    "SELECT data FROM plans WHERE week_id=?",
    from.id,
  );
  const plans = previousPlans
    .filter((p) => currentIds.has(p.raidId))
    .map((p) => ({ ...p, id: randomUUID(), weekId }));
  const result = addBossPlans(db, plans);
  return {
    added: result.added,
    skipped: result.skipped + previousPlans.length - plans.length,
  };
}
export function saveVaultTargets(
  db: DatabaseSync,
  guid: string,
  weekId: string,
  targets: VaultTarget[],
) {
  scope(db, guid, weekId);
  transaction(db, () => {
    db.prepare("DELETE FROM targets WHERE guid=? AND week_id=?").run(
      guid,
      weekId,
    );
    for (const t of targets) {
      if (
        t.guid !== guid ||
        t.weekId !== weekId ||
        typeof t.slotKey !== "string" ||
        !t.slotKey ||
        !t.id ||
        !(t.minimumItemLevel === null || finiteId(t.minimumItemLevel))
      )
        throw Error("宝库目标格式错误");
      db.prepare("INSERT INTO targets VALUES(?,?,?,?,?)").run(
        t.id,
        guid,
        weekId,
        t.slotKey,
        JSON.stringify(t),
      );
    }
  });
}
export function setAlias(db: DatabaseSync, guid: string, alias: string) {
  if (typeof alias !== "string" || alias.length > 80)
    throw Error("备注最多 80 个字");
  db.prepare("UPDATE characters SET alias=? WHERE guid=?").run(alias, guid);
}
