import { it, expect } from "vitest";
import { createEnvelope } from "@azeroth-weekly/protocol/fixtures";
import {
  selectPlannedBosses,
  evaluateVault,
  evaluateVaultGoal,
} from "./progress";
it("never adds unplanned bosses and separates difficulties", () => {
  const c = createEnvelope().characters["Player-TEST-1"]!;
  c.encounters = [
    {
      raidId: 1,
      encounterId: 10,
      difficultyId: 15,
      killed: true,
      lootEligible: null,
      observedAt: 150,
    },
    {
      raidId: 1,
      encounterId: 20,
      difficultyId: 15,
      killed: true,
      lootEligible: null,
      observedAt: 150,
    },
  ];
  const p = {
    id: "p",
    guid: c.identity.guid,
    weekId: c.week.id,
    raidId: 1,
    encounterId: 10,
    difficultyId: 16,
    targetItemLink: null,
    planBonusRoll: true,
  };
  expect(selectPlannedBosses([p], [c], c.week.id)).toHaveLength(1);
  expect(selectPlannedBosses([p], [c], c.week.id)[0]!.killed).toBeNull();
  expect(selectPlannedBosses([], [c], c.week.id)).toEqual([]);
});
it("counts any three unlocked slots across activities without an item-level requirement", () => {
  const c = createEnvelope().characters["Player-TEST-1"]!;
  c.vault.slots = [
    {
      key: "3:1",
      activityType: 3,
      index: 1,
      progress: 4,
      threshold: 2,
      itemLevel: null,
    },
    {
      key: "3:2",
      activityType: 3,
      index: 2,
      progress: 4,
      threshold: 4,
      itemLevel: null,
    },
    {
      key: "1:1",
      activityType: 1,
      index: 1,
      progress: 1,
      threshold: 1,
      itemLevel: null,
    },
    {
      key: "6:1",
      activityType: 6,
      index: 1,
      progress: null,
      threshold: 2,
      itemLevel: null,
    },
  ];
  expect(evaluateVaultGoal(c, c.week.id)).toMatchObject({
    opened: 3,
    done: 3,
    goal: 3,
    state: "done",
  });
  c.vault.slots[3]!.progress = 2;
  expect(evaluateVaultGoal(c, c.week.id)).toMatchObject({
    opened: 4,
    done: 3,
    state: "done",
  });
  expect(evaluateVaultGoal(c, "next-week").state).toBe("pending");
});
it("distinguishes incomplete, missing and conflicting vault data and does not double-count a slot", () => {
  const c = createEnvelope().characters["Player-TEST-1"]!;
  expect(evaluateVaultGoal(c, c.week.id).state).toBe("pending");
  const slot = {
    key: "3:1",
    activityType: 3,
    index: 1,
    progress: 2,
    threshold: 2,
    itemLevel: null,
  };
  c.vault.slots = [slot, { ...slot, key: "duplicate" }];
  expect(evaluateVaultGoal(c, c.week.id)).toMatchObject({
    opened: 1,
    state: "incomplete",
  });
  c.vault.slots[1]!.progress = 0;
  expect(evaluateVaultGoal(c, c.week.id)).toMatchObject({
    opened: 0,
    state: "pending",
  });
  c.vault.slots = [{ ...slot, progress: null }];
  expect(evaluateVaultGoal(c, c.week.id).state).toBe("pending");
  c.vault.slots = [{ ...slot, threshold: 0 }];
  expect(evaluateVaultGoal(c, c.week.id).state).toBe("pending");
});
it("does not turn an old claimable reward or unknown item level into a completed target", () => {
  const c = createEnvelope().characters["Player-TEST-1"]!;
  c.vault.previousRewardAvailable = true;
  c.vault.slots = [
    {
      key: "1:1",
      activityType: 1,
      index: 1,
      progress: 2,
      threshold: 2,
      itemLevel: null,
    },
  ];
  const t = {
    id: "t",
    guid: c.identity.guid,
    weekId: c.week.id,
    slotKey: "1:1",
    minimumItemLevel: 300,
  };
  expect(evaluateVault(t, c, c.week.id)).toBe("pending");
  expect(evaluateVault({ ...t, minimumItemLevel: null }, c, c.week.id)).toBe(
    "done",
  );
  expect(evaluateVault(t, c, "newweek")).toBe("pending");
});
