import type {
  BossPlan,
  CharacterCapture,
  VaultTarget,
} from "@azeroth-weekly/protocol";
export function selectPlannedBosses(
  plans: BossPlan[],
  captures: CharacterCapture[],
  weekId: string,
) {
  return plans
    .filter((p) => p.weekId === weekId)
    .map((plan) => {
      const c = captures.find(
        (c) => c.identity.guid === plan.guid && c.week.id === weekId,
      );
      const fact = c?.encounters.find(
        (f) =>
          f.raidId === plan.raidId &&
          f.encounterId === plan.encounterId &&
          f.difficultyId === plan.difficultyId,
      );
      return {
        plan,
        killed: fact?.killed ?? null,
        lootEligible: fact?.lootEligible ?? null,
      };
    });
}
export function evaluateVault(
  t: VaultTarget,
  c: CharacterCapture | null | undefined,
  weekId: string,
): "done" | "incomplete" | "pending" {
  if (!c || c.week.id !== weekId) return "pending";
  const s = c.vault.slots.find((s) => s.key === t.slotKey);
  if (!s || s.progress === null) return "pending";
  if (s.progress < s.threshold) return "incomplete";
  if (t.minimumItemLevel === null) return "done";
  if (s.itemLevel === null) return "pending";
  return s.itemLevel >= t.minimumItemLevel ? "done" : "incomplete";
}
export const activityName = (type: number) =>
  ({ 1: "地下城", 3: "团队副本", 6: "世界活动" })[type] ?? `活动 ${type}`;

/** Every role has the same goal: unlock any three distinct reward slots. */
export function evaluateVaultGoal(
  c: CharacterCapture | null | undefined,
  weekId: string,
) {
  const goal = 3;
  if (!c || c.week.id !== weekId || !c.vault.slots.length)
    return { goal, opened: 0, done: 0, state: "pending" as const };
  // Identify a slot by row and position, never by a possibly repeated export key.
  const slots = new Map<string, typeof c.vault.slots>();
  for (const s of c.vault.slots) {
    const key = `${s.activityType}:${s.index}`;
    slots.set(key, [...(slots.get(key) ?? []), s]);
  }
  let opened = 0,
    unknown = false;
  for (const copies of slots.values()) {
    const s = copies[0]!;
    const conflict = copies.some(
      (v) => v.progress !== s.progress || v.threshold !== s.threshold,
    );
    if (conflict || s.progress === null || s.threshold <= 0) unknown = true;
    else if (s.progress >= s.threshold) opened++;
  }
  return {
    goal,
    opened,
    done: Math.min(opened, goal),
    state:
      opened >= goal
        ? ("done" as const)
        : unknown
          ? ("pending" as const)
          : ("incomplete" as const),
  };
}
